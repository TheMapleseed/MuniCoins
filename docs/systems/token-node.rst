================================================================================
Token node (indexer + API)
================================================================================

The **token node** indexes chain events, maintains state needed for snapshots, and exposes **HTTP** (and optional sinks). Implementation is under ``src/node/``.

Primary files
-------------

* ``node.ts`` — top-level entry used by ``deno task node:start`` (see ``deno.json``).
* ``src/node/server.ts`` — HTTP server (e.g. snapshot routes).
* ``src/node/snapshot.ts`` — snapshot construction.
* ``src/node/indexer.ts`` — indexing pipeline.
* ``src/node/run.ts`` — run loop / lifecycle.
* ``src/node/types.ts``, ``src/node/abi.ts`` — types and ABI helpers.
* ``src/node/store.ts``, ``src/node/db.ts`` — persistence.
* ``src/node/influx.ts`` — optional Influx sink.
* ``src/node/bus.ts`` — internal event bus if used.
* ``src/node/sync/`` — sync / ratchet logic (``ratchet.ts``, ``README.md``).

Shared HTTP
-----------

* ``src/http/cors.ts`` — CORS helper shared with other services.

Documentation
-------------

* ``src/node/README.md`` — operator-focused notes for the node.
