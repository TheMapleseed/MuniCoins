//! egui viewer: native (`cargo run`) and WASM (`trunk serve`).
//! Cryptographic schedule verification lives in [`schedule`] — prefer **Blake3 over canonical bytes**
//! instead of trusting unverified JSON; WASM runs the same Rust code client-side.

pub mod app;
pub mod flashlight;
pub mod schedule;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(target_arch = "wasm32")]
pub use wasm::WebHandle;
