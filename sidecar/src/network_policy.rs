//! Ring-zero style source IP policy (Rust only). Enforced in-process on the EIP-712 sidecar.
use anyhow::{Context, Result};
use axum::http::{HeaderMap, StatusCode};
use ipnet::IpNet;
use std::env;
use std::net::IpAddr;
use std::str::FromStr;

/// When `enforce` is true, only peers whose effective IP falls in `nets` may reach protected routes.
pub struct NetworkPolicy {
    pub enforce: bool,
    nets: Vec<IpNet>,
    trust_proxy_from: Vec<IpNet>,
}

impl NetworkPolicy {
    pub fn load() -> Result<Self> {
        let enforce = env::var("SIDECAR_ENFORCE_SOURCE_NETWORK")
            .ok()
            .as_deref()
            != Some("false");

        if !enforce {
            return Ok(Self {
                enforce: false,
                nets: vec![],
                trust_proxy_from: vec![],
            });
        }

        let local_dev = env::var("ALLOW_INSECURE_LOCAL_DEV").ok().as_deref() == Some("true");
        let mut raw = env::var("SIDECAR_ALLOWED_SOURCE_CIDRS").unwrap_or_default();
        if local_dev && raw.trim().is_empty() {
            raw = "127.0.0.1/32,::1/128".to_string();
        }
        if raw.trim().is_empty() {
            anyhow::bail!(
                "SIDECAR_ENFORCE_SOURCE_NETWORK is true (default). Set SIDECAR_ALLOWED_SOURCE_CIDRS to cluster/private CIDRs, \
                 or ALLOW_INSECURE_LOCAL_DEV=true for loopback-only dev, \
                 or SIDECAR_ENFORCE_SOURCE_NETWORK=false to disable (not recommended for production)."
            );
        }

        let nets: Vec<IpNet> = raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| IpNet::from_str(s).with_context(|| format!("invalid CIDR: {s}")))
            .collect::<Result<_>>()?;

        let trust_raw = env::var("SIDECAR_TRUST_PROXY_FROM_CIDRS").unwrap_or_default();
        let trust_proxy_from: Vec<IpNet> = trust_raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| IpNet::from_str(s).with_context(|| format!("invalid CIDR in SIDECAR_TRUST_PROXY_FROM_CIDRS: {s}")))
            .collect::<Result<_>>()?;

        Ok(Self {
            enforce: true,
            nets,
            trust_proxy_from,
        })
    }

    /// Direct TCP peer, or first `X-Forwarded-For` hop when the peer is in `trust_proxy_from`.
    pub fn effective_ip(&self, peer: IpAddr, headers: &HeaderMap) -> IpAddr {
        if !self
            .trust_proxy_from
            .iter()
            .any(|n| n.contains(&peer))
        {
            return peer;
        }
        let Some(xff) = headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()) else {
            return peer;
        };
        xff.split(',')
            .next()
            .and_then(|s| s.trim().parse::<IpAddr>().ok())
            .unwrap_or(peer)
    }

    pub fn check(&self, peer: IpAddr, headers: &HeaderMap) -> Result<(), StatusCode> {
        if !self.enforce {
            return Ok(());
        }
        let ip = self.effective_ip(peer, headers);
        if self.nets.iter().any(|n| n.contains(&ip)) {
            Ok(())
        } else {
            Err(StatusCode::FORBIDDEN)
        }
    }
}
