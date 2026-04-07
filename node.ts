/**
 * Token-specific node + ledger indexer.
 *
 * Env:
 * - RPC_URL
 * - LEDGER_ADDRESS
 * - REGISTRY_ADDRESS (optional)
 * - START_BLOCK (optional)
 * - NODE_BATCH_SIZE (optional, default 2000)
 * - NODE_POLL_MS (optional, default 3000)
 * - NODE_PORT (optional, default 8788)
 * - NODE_KV_PATH (optional, default ./data/token-node.kv)
 */
import { runNode } from "./src/node/run.ts";

runNode().catch((e) => {
  console.error(e);
  Deno.exit(1);
});

