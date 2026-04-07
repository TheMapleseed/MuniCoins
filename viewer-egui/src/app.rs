use crate::schedule;
use eframe::egui;
use serde::Deserialize;
use std::sync::{Arc, Mutex};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotJson {
    pub operational_fund_minor: Option<String>,
    pub premium_reserve_minor: Option<String>,
    pub protocol_tvl_minor: Option<String>,
    pub active_token_count: Option<String>,
    pub total_token_slots: Option<String>,
    pub cumulative_factor_wad: Option<String>,
    pub decimals: Option<u8>,
    #[serde(default)]
    pub error: Option<String>,
}

impl SnapshotJson {
    fn from_str(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}

fn snapshot_url_default() -> String {
    #[cfg(target_arch = "wasm32")]
    {
        return "http://127.0.0.1:8788/api/snapshot".to_string();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::env::var("SNAPSHOT_URL").unwrap_or_else(|_| {
            "http://127.0.0.1:8788/api/snapshot".to_string()
        })
    }
}

pub struct ViewerApp {
    snapshot_url: String,
    expected_schedule_hash_hex: String,
    schedule_bytes_hex: String,
    last_snapshot: Arc<Mutex<Option<String>>>,
    last_schedule_ok: Option<bool>,
    last_error: Option<String>,
    decoded_row_count: Option<usize>,
}

impl ViewerApp {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let url = snapshot_url_default();
        Self {
            snapshot_url: url,
            expected_schedule_hash_hex: String::new(),
            schedule_bytes_hex: String::new(),
            last_snapshot: Arc::new(Mutex::new(None)),
            last_schedule_ok: None,
            last_error: None,
            decoded_row_count: None,
        }
    }

    fn fetch_snapshot(&mut self, ctx: egui::Context) {
        let url = self.snapshot_url.clone();
        let store = self.last_snapshot.clone();
        ehttp::fetch(ehttp::Request::get(url), move |result| {
            let text = match result {
                Ok(r) => String::from_utf8_lossy(&r.bytes).to_string(),
                Err(e) => serde_json::json!({ "error": e }).to_string(),
            };
            if let Ok(mut g) = store.lock() {
                *g = Some(text);
            }
            ctx.request_repaint();
        });
    }
}

impl eframe::App for ViewerApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(std::time::Duration::from_secs(2));

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("MuniCoins ledger (egui + optional WASM)");
            ui.label(
                egui::RichText::new(
                    "RPC keys stay on the server. WASM verifies schedule bytes (Blake3) client-side — stronger than trusting raw JSON.",
                )
                .small(),
            );

            ui.separator();
            ui.horizontal(|ui| {
                ui.label("Snapshot URL:");
                ui.text_edit_singleline(&mut self.snapshot_url);
                if ui.button("Fetch now").clicked() {
                    self.fetch_snapshot(ctx.clone());
                }
            });

            if ui.button("Start polling (every 2s)").clicked() {
                self.fetch_snapshot(ctx.clone());
            }

            if let Ok(guard) = self.last_snapshot.lock() {
                if let Some(ref raw) = *guard {
                    match SnapshotJson::from_str(raw) {
                        Ok(j) => {
                            if let Some(ref e) = j.error {
                                ui.colored_label(egui::Color32::RED, e);
                            } else {
                                ui.monospace(format!(
                                    "TVL: {} | Op: {} | Premium: {} | Active: {} / {} | CF WAD: {}",
                                    j.protocol_tvl_minor.as_deref().unwrap_or("-"),
                                    j.operational_fund_minor.as_deref().unwrap_or("-"),
                                    j.premium_reserve_minor.as_deref().unwrap_or("-"),
                                    j.active_token_count.as_deref().unwrap_or("-"),
                                    j.total_token_slots.as_deref().unwrap_or("-"),
                                    j.cumulative_factor_wad.as_deref().unwrap_or("-"),
                                ));
                            }
                        }
                        Err(e) => {
                            ui.colored_label(egui::Color32::YELLOW, format!("JSON parse: {e}"));
                            ui.monospace(raw.chars().take(800).collect::<String>());
                        }
                    }
                }
            }

            ui.separator();
            ui.heading("Maturity schedule (binary + Blake3)");
            ui.label("Paste hex-encoded canonical schedule bytes (see `schedule::encode_schedule`).");
            ui.text_edit_multiline(&mut self.schedule_bytes_hex);
            ui.horizontal(|ui| {
                ui.label("Expected Blake3 (64 hex chars):");
                ui.text_edit_singleline(&mut self.expected_schedule_hash_hex);
            });
            if ui.button("Verify Blake3").clicked() {
                self.last_error = None;
                self.decoded_row_count = None;
                let bytes = match hex::decode(self.schedule_bytes_hex.replace([' ', '\n'], "")) {
                    Ok(b) => b,
                    Err(e) => {
                        self.last_schedule_ok = Some(false);
                        self.last_error = Some(format!("hex: {e}"));
                        return;
                    }
                };
                let ok = if self.expected_schedule_hash_hex.trim().is_empty() {
                    self.last_error = Some("Set expected hash".into());
                    false
                } else {
                    schedule::blake3_matches_hex(&bytes, &self.expected_schedule_hash_hex)
                };
                self.last_schedule_ok = Some(ok);
                if ok {
                    match schedule::decode_schedule(&bytes) {
                        Ok(rows) => self.decoded_row_count = Some(rows.len()),
                        Err(e) => self.last_error = Some(format!("decode: {e:?}")),
                    }
                }
            }
            if let Some(n) = self.decoded_row_count {
                ui.label(format!("Decoded rows: {n}"));
            }
            if let Some(ok) = self.last_schedule_ok {
                let color = if ok {
                    egui::Color32::GREEN
                } else {
                    egui::Color32::RED
                };
                ui.colored_label(color, format!("Hash OK: {ok}"));
            }
            if let Some(ref e) = self.last_error {
                ui.colored_label(egui::Color32::RED, e);
            }
        });
    }
}
