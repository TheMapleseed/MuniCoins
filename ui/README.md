# Leptos UI (`muni-ui-leptos`)

- **Build:** `trunk build --release` → `dist/`
- **Dev:** `trunk serve`
- **Host:** from repo root, `deno task ui:trunk` then `deno task ui:serve` (static files from `ui/dist`)

Rust → WASM (CSR). The only browser script is **wasm-bindgen** glue; no SPA framework in JS/TS.
