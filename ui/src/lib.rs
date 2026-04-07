//! Leptos CSR: Rust → WASM. Browser runs only wasm-bindgen glue + generated WASM (no React/Vue app).
use leptos::prelude::*;
use wasm_bindgen::prelude::*;

#[component]
fn App() -> impl IntoView {
    view! {
        <main style:padding="1rem" style:font-family="system-ui, sans-serif">
            <h1>"MuniCoins"</h1>
            <p>
                "UI shell: Leptos (Rust) compiled to WASM. "
                "Serve "
                <code>"ui/dist"</code>
                " with Deno (see "
                <code>"deno task ui:serve"</code>
                ")."
            </p>
            <p>
                "Snapshot API remains on the token node; fetch from here once wired (same-origin or CORS)."
            </p>
        </main>
    }
}

/// Trunk / wasm-bindgen entry: minimal JS is only the loader emitted by wasm-bindgen.
#[wasm_bindgen(start)]
pub fn wasm_start() {
    console_error_panic_hook::set_once();
    mount_to_body(|| view! { <App/> });
}
