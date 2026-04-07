================================================================================
Intersect (dual-leg valuation)
================================================================================

**Intersect** is the off-chain module that combines **on-chain ledger** fair value with an **NFT-attested mirror** (weighted / geometric / harmonic per the whitepaper). Entry point and exports live under ``src/intersect/``.

Primary files
-------------

* ``src/intersect/mod.ts`` — module exports and wiring.
* ``src/intersect/engine.ts`` — valuation engine orchestration.
* ``src/intersect/math.ts`` — core math for combining legs.
* ``src/intersect/onchain.ts`` — reads / adapters toward on-chain state.
* ``src/intersect/types.ts`` — shared types.

Invocation
----------

* ``main.ts`` (repo root) runs the intersect CLI path; ``deno.json`` maps the package export to ``src/intersect/mod.ts``.
