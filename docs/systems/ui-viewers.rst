================================================================================
Web UI and legacy viewer
================================================================================

**Primary UI (Rust → WASM):** Leptos CSR application under ``ui/``, built with **Trunk**. Static output is served by a small Deno script (no Node bundler for this path).

* ``ui/`` — Leptos app, ``Trunk.toml``, ``index.html``.
* ``scripts/serve_ui_dist.ts`` — static file server for ``ui/dist`` (``deno task ui:serve`` after build).
* ``deno.json`` — ``ui:trunk``, ``ui:dev``, ``ui:serve`` tasks.

**Legacy viewer:** egui / wgpu canvas under ``viewer-egui/`` (standalone crate, Trunk build). Snapshot JSON is still expected from the **token node** (``GET`` snapshot / API routes in ``src/node/server.ts``).

* ``viewer-egui/src/`` — application code (including optional math helpers such as ``flashlight.rs`` if present).

**Deploy**

* ``deploy/Dockerfile.ui-static`` — static image for the Leptos ``dist`` output.
* ``deploy/Dockerfile.viewer-static`` — static image for the egui viewer ``dist``.

**Docs**

* ``docs/frontend-architecture.md`` — frontend stack notes.
