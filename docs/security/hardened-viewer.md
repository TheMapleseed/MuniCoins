# Hardened viewer (canvas / WASM) — scope, limits, roadmap

This is **not** “perfect security.” It raises **cost and friction** for casual capture (screenshots, DOM scraping, naive recorders). A **determined** attacker with time, physical access, or kernel-level tooling can still exfiltrate data.

## What does *not* go away

- **Photographs** of the screen with a phone (LSB/watermarking only helps if you implement it, disclose it legally, and accept false positives).
- **Kernel / GPU capture** paths below the browser.
- **Insiders** with legitimate access.
- **Accessibility**: canvas-only “black box” UIs conflict with WCAG unless you provide vetted alternatives (which can reopen small scraping surfaces).

## Recommended implementation stack (when you build it)

| Piece | Role |
|--------|------|
| **Rust + WASM** | Core logic, glyph/scene state, optional integrity probes. |
| **Canvas or wgpu** | Pixel pipeline; optional WGSL for temporal dither / compositing. |
| **egui** (`viewer-egui/`) | Existing canvas path; good for prototypes before raw wgpu. |
| **Leptos** (`ui/`) | DOM/semantic shell; **not** a substitute for canvas-only sensitive rendering—use for chrome, settings, or non-sensitive pages only if you need HTML. |
| **Deno** | Static file host (`scripts/serve_ui_dist.ts`) or future WASI module host—not a replacement for browser-side rendering of secrets. |

## Roadmap (from product/security planning)

- [ ] Confirm scope + threat model  
  - [ ] Sensitive vs non-sensitive content (accessibility / UX)  
  - [ ] Optional “hardened mode” vs always-on  
  - [ ] Performance budget (low-end devices)  
- [ ] Canvas / GPU text pipeline  
  - [ ] Glyph atlas (e.g. `ab_glyph` or GPU path)  
  - [ ] Preserve keyboard / screen-reader strategy (aria-live, parallel text channel—tradeoffs explicit)  
- [ ] Selective revelation (“flashlight”)  
  - [ ] Pointer/touch + reveal region (`viewer-egui/src/flashlight.rs` starts the distance math)  
  - [ ] Touch + `prefers-reduced-motion`  
- [ ] Temporal dithering (feature-flagged; comfort testing)  
- [ ] Watermarking prototype (consent, disclosure, opt-out; legal review)  
- [ ] Runtime integrity (bundle hash / memory checks; safe fallback)  
- [ ] Benchmarks + QA routes in hardened mode  
- [ ] Security + compliance sign-off  

## Legal / ethics

Covert tracking and silent watermarks can violate **privacy law** and user trust. Prefer **documented**, **consented** controls and **disable** paths.
