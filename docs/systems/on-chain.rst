================================================================================
On-chain contracts
================================================================================

Solidity contracts implement the **reference ledger** and **valuation link** registration. Foundry is used to build and test (``foundry.toml`` at repo root).

Primary files
-------------

* ``contracts/TokenValuationLedger.sol`` — token valuation ledger (global index semantics in the reference design; product series may split into additional contracts later).
* ``contracts/ValuationLinkRegistry.sol`` — registry for valuation links used with the ledger / mirror story.

Tests and tooling
-----------------

* ``test/TokenValuationLedger.t.sol`` — Foundry tests against the ledger.
* ``foundry.toml`` — Foundry project config.

Related documentation
---------------------

* ``docs/security/threat-model.md`` — threat framing for public ledger vs issuance control.
* ``README.md`` (repository root) — stack overview and ``forge`` commands.
