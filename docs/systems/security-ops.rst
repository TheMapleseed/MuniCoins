================================================================================
Security and operations docs
================================================================================

These are **Markdown** references (not part of the Sphinx ``toctree`` as rendered pages unless you add MyST). Paths are from the repository root.

Security
--------

* ``docs/security/threat-model.md``
* ``docs/security/hardened-viewer.md``
* ``docs/security/mtls-authority-sidecar.md``
* ``docs/security/mtls-and-proxy.md``
* ``docs/security/signing-architecture-rpc-hsm.md``
* ``docs/security/operational-controls.md``

Deployment and migration
------------------------

* ``docs/deployment/environment-checklist.md``
* ``docs/migration/ts-to-rust.md`` — phased move from Deno TypeScript to Rust for node / issuance / intersect.

Automation
----------

* ``.github/workflows/`` — CI workflows (e.g. build, security).
* ``deploy/`` — Dockerfiles, SofthSM notes, templates (see subtree READMEs).
