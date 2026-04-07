//! HTTP sidecar: accepts the same JSON body the Deno issuance authority sends to `signTypedData`,
//! signs with a local key (`ISSUANCE_SIGNER_PRIVATE_KEY`), returns `{ "signature": "0x..." }`.
//!
//! Production: replace the `LocalWallet` path with PKCS#11 / HSM signing using the same HTTP contract.
//!
//! **Source IP policy (Rust):** `SIDECAR_ALLOWED_SOURCE_CIDRS` + `SIDECAR_ENFORCE_SOURCE_NETWORK` (see `network_policy.rs`).
//!
//! CORS: set `CORS_ALLOW_ORIGINS` (comma-separated) or leave unset for no cross-origin headers.
//! `ALLOW_INSECURE_CORS_ALL=true` enables `*` (dev only).

mod network_policy;

use anyhow::{Context, Result};
use axum::extract::ConnectInfo;
use axum::extract::State;
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::routing::{get, post};
use axum::Json;
use axum::Router;
use ethers::signers::{LocalWallet, Signer};
use ethers::types::transaction::eip712::TypedData;
use network_policy::NetworkPolicy;
use serde::Serialize;
use serde_json::json;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tracing::{info, warn};

#[derive(Clone)]
struct AppState {
    wallet: LocalWallet,
    api_key: Option<String>,
    network: Arc<NetworkPolicy>,
}

#[derive(Serialize)]
struct SignResponse {
    signature: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let pk = env::var("ISSUANCE_SIGNER_PRIVATE_KEY")
        .context("ISSUANCE_SIGNER_PRIVATE_KEY is required for this sidecar (secp256k1 hex)")?;
    let wallet: LocalWallet = pk
        .parse()
        .context("invalid ISSUANCE_SIGNER_PRIVATE_KEY")?;

    let chain_id: u64 = env::var("CHAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1);
    let wallet = wallet.with_chain_id(chain_id);

    let api_key = env::var("SIDECAR_API_KEY").ok();
    let network = Arc::new(NetworkPolicy::load().context("load network policy")?);

    let state = AppState { wallet, api_key, network };
    let log_addr = state.wallet.address();
    let has_api_key = state.api_key.is_some();
    let shared = Arc::new(state);
    let net_enforce = shared.network.enforce;

    let mut app = Router::new()
        .route("/health", get(health))
        .route("/v1/eip712/sign", post(sign))
        .with_state(shared);

    if let Some(cors) = optional_cors_layer() {
        app = app.layer(cors);
    }

    let port: u16 = env::var("SIDECAR_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8788);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("issuance-eip712-sidecar listening on {addr} signer={log_addr:?}");
    if net_enforce {
        info!("SIDECAR source network enforcement active (see SIDECAR_ALLOWED_SOURCE_CIDRS)");
    } else {
        warn!("SIDECAR_ENFORCE_SOURCE_NETWORK=false — rely on Kubernetes NetworkPolicy / firewall for ring-zero isolation");
    }
    if has_api_key {
        info!("SIDECAR_API_KEY enforced (Authorization: Bearer …)");
    } else {
        warn!("SIDECAR_API_KEY not set — protect this listener with network policy or mTLS");
    }

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}

fn optional_cors_layer() -> Option<CorsLayer> {
    if env::var("ALLOW_INSECURE_CORS_ALL").ok().as_deref() == Some("true") {
        return Some(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
                .allow_headers(Any),
        );
    }
    let raw = env::var("CORS_ALLOW_ORIGINS").unwrap_or_default();
    let origins: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .filter_map(|s| HeaderValue::from_str(s).ok())
        .collect();
    if origins.is_empty() {
        return None;
    }
    Some(
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers(Any),
    )
}

fn verbose_errors() -> bool {
    env::var("VERBOSE_ERRORS").ok().as_deref() == Some("true")
}

fn health_requires_auth() -> bool {
    env::var("HEALTH_REQUIRE_AUTH").ok().as_deref() == Some("true")
}

fn health_minimal() -> bool {
    env::var("HEALTH_MINIMAL").ok().as_deref() == Some("true")
}

async fn health(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<axum::Json<serde_json::Value>, StatusCode> {
    state.network.check(addr.ip(), &headers)?;

    if health_requires_auth() {
        match &state.api_key {
            Some(expected) => {
                let ok = headers
                    .get(header::AUTHORIZATION)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.strip_prefix("Bearer ").unwrap_or(s) == expected.as_str())
                    .unwrap_or(false);
                if !ok {
                    return Err(StatusCode::UNAUTHORIZED);
                }
            }
            None => return Err(StatusCode::SERVICE_UNAVAILABLE),
        }
    }

    if health_minimal() {
        return Ok(axum::Json(json!({ "ok": true })));
    }

    Ok(axum::Json(json!({
        "ok": true,
        "address": format!("{:?}", state.wallet.address()),
        "service": "issuance-eip712-sidecar",
    })))
}

async fn sign(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Result<axum::Json<SignResponse>, (StatusCode, axum::Json<ErrorBody>)> {
    if let Err(code) = state.network.check(addr.ip(), &headers) {
        return Err((
            code,
            axum::Json(ErrorBody {
                error: "forbidden_source_network".into(),
                detail: None,
            }),
        ));
    }

    if let Some(ref expected) = state.api_key {
        let ok = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.strip_prefix("Bearer ").unwrap_or(s) == expected.as_str())
            .unwrap_or(false);
        if !ok {
            return Err((
                StatusCode::UNAUTHORIZED,
                axum::Json(ErrorBody {
                    error: "unauthorized".into(),
                    detail: None,
                }),
            ));
        }
    }

    let body = normalize_viem_payload(body).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            axum::Json(ErrorBody {
                error: "invalid_payload".into(),
                detail: verbose_errors().then(|| e.to_string()),
            }),
        )
    })?;

    let typed: TypedData = serde_json::from_value(body).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            axum::Json(ErrorBody {
                error: "typed_data_parse".into(),
                detail: verbose_errors().then(|| e.to_string()),
            }),
        )
    })?;

    let sig = state
        .wallet
        .sign_typed_data(&typed)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "sign_typed_data failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(ErrorBody {
                    error: "sign_failed".into(),
                    detail: verbose_errors().then(|| e.to_string()),
                }),
            )
        })?;

    Ok(axum::Json(SignResponse {
        signature: format!("{sig}"),
    }))
}

fn normalize_viem_payload(v: serde_json::Value) -> Result<serde_json::Value> {
    use serde_json::Value;
    let mut obj = match v {
        Value::Object(o) => o,
        _ => anyhow::bail!("body must be a JSON object"),
    };
    if !obj.contains_key("primary_type") {
        if let Some(pt) = obj.remove("primaryType") {
            obj.insert("primary_type".to_string(), pt);
        }
    }
    Ok(Value::Object(obj))
}
