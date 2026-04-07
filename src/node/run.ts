import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { NodeStore } from "./store.ts";
import { TokenNodeIndexer } from "./indexer.ts";
import { startNodeApi } from "./server.ts";
import { NodeEventBus } from "./bus.ts";
import { PostgresLedgerSink } from "./db.ts";
import { InfluxSink } from "./influx.ts";

function envAddr(key: string): Address {
  const v = Deno.env.get(key);
  if (!v?.startsWith("0x")) throw new Error(`Missing/invalid ${key}`);
  return v as Address;
}

export async function runNode(): Promise<void> {
  const rpcUrl = Deno.env.get("RPC_URL");
  if (!rpcUrl) throw new Error("Missing RPC_URL");

  const ledgerAddress = envAddr("LEDGER_ADDRESS");
  const registryAddress = Deno.env.get("REGISTRY_ADDRESS")?.startsWith("0x")
    ? Deno.env.get("REGISTRY_ADDRESS") as Address
    : undefined;

  const startBlock = Deno.env.get("START_BLOCK") ? BigInt(Deno.env.get("START_BLOCK")!) : undefined;
  const batchSize = Deno.env.get("NODE_BATCH_SIZE") ? BigInt(Deno.env.get("NODE_BATCH_SIZE")!) : 2_000n;
  const pollMs = Number(Deno.env.get("NODE_POLL_MS") ?? "3000");
  const port = Number(Deno.env.get("NODE_PORT") ?? "8788");
  const kvPath = Deno.env.get("NODE_KV_PATH") ?? "./data/token-node.kv";
  const pgUrl = Deno.env.get("LEDGER_DATABASE_URL");
  const influxUrl = Deno.env.get("INFLUX_URL");
  const influxOrg = Deno.env.get("INFLUX_ORG");
  const influxBucket = Deno.env.get("INFLUX_BUCKET");
  const influxToken = Deno.env.get("INFLUX_TOKEN");

  const store = await NodeStore.open(kvPath);
  const bus = new NodeEventBus();
  const sink = pgUrl ? new PostgresLedgerSink(pgUrl) : undefined;
  if (sink) await sink.connect();
  const influx = (influxUrl && influxOrg && influxBucket && influxToken)
    ? new InfluxSink(influxUrl, influxOrg, influxBucket, influxToken)
    : undefined;
  const indexer = new TokenNodeIndexer(
    {
      rpcUrl,
      chain: mainnet,
      ledgerAddress,
      registryAddress,
      startBlock,
      batchSize,
      pollMs,
      reconcileEveryLoops: Number(Deno.env.get("NODE_RECONCILE_LOOPS") ?? "20"),
    },
    store,
    { sink, bus, influx },
  );

  await startNodeApi(store, port, bus);
  await indexer.start();
}

