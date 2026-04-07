import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { corsHeadersForRequest, corsPreflightResponse } from "../http/cors.ts";
import { buildLedgerSnapshot, formatMinorToUsd } from "./snapshot.ts";
import { NodeStore } from "./store.ts";
import type { NodeEventBus } from "./bus.ts";

function verboseErrors(): boolean {
  return Deno.env.get("VERBOSE_ERRORS") === "true";
}

/** Paths that skip NODE_API_KEY (read-only chain mirror; safe to expose to WASM viewer). */
function isPublicReadPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/api/snapshot" || pathname === "/snapshot";
}

export async function startNodeApi(store: NodeStore, port = 8788, bus?: NodeEventBus): Promise<void> {
  Deno.serve({ port }, async (req) => {
    const pre = corsPreflightResponse(req);
    if (pre) return pre;

    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json(req, { ok: true, ts: Date.now() });
    }

    const apiKey = Deno.env.get("NODE_API_KEY");
    if (apiKey && !isPublicReadPath(url.pathname)) {
      const got = req.headers.get("x-api-key") ?? "";
      if (!timingSafeEqual(got, apiKey)) {
        return json(req, { error: "unauthorized" }, 401);
      }
    }

    if (url.pathname === "/api/snapshot" || url.pathname === "/snapshot") {
      const rpcUrl = Deno.env.get("RPC_URL");
      const ledger = Deno.env.get("LEDGER_ADDRESS") as Address | undefined;
      const sumEnv = url.searchParams.get("sum") ?? Deno.env.get("SUM_TOKEN_IDS");
      const sumTokenIds = sumEnv
        ? sumEnv.split(",").map((s) => BigInt(s.trim())).filter((n) => n > 0n)
        : undefined;

      if (!rpcUrl || !ledger?.startsWith("0x")) {
        return json(req, {
          error: "Set RPC_URL and LEDGER_ADDRESS for the token node.",
        }, 503);
      }

      try {
        const snap = await buildLedgerSnapshot(
          { rpcUrl, ledgerAddress: ledger, chain: mainnet },
          sumTokenIds?.length ? { sumTokenIds } : undefined,
        );

        const d = snap.assetDecimals;
        const formatted = {
          protocolTvlMinor: formatMinorToUsd(snap.protocolTvlMinor, d),
          operationalFundMinor: formatMinorToUsd(snap.operationalFundMinor, d),
          premiumReserveMinor: formatMinorToUsd(snap.premiumReserveMinor, d),
          sumActiveClaimsMinor: snap.sumActiveClaimsMinor !== undefined
            ? formatMinorToUsd(snap.sumActiveClaimsMinor, d)
            : undefined,
        };

        return json(req, {
          ...snap,
          decimals: d,
          formatted,
          note:
            "USD labels assume USD-pegged settlement asset. Served from token node for egui/WASM viewer.",
        });
      } catch (e) {
        console.error("[node] snapshot error", e);
        if (verboseErrors()) {
          return json(req, { error: String(e) }, 502);
        }
        return json(req, { error: "snapshot_unavailable" }, 502);
      }
    }

    if (url.pathname === "/stats") {
      const stats = await store.getStats();
      return json(req, stats ?? { error: "not_initialized" });
    }
    if (url.pathname === "/snapshots") {
      const limit = Number(url.searchParams.get("limit") ?? "30");
      const snapshots = await store.listDailySnapshots(Number.isFinite(limit) ? limit : 30);
      return json(req, snapshots);
    }
    if (url.pathname === "/events") {
      if (!bus) return json(req, { error: "event_bus_disabled" }, 503);
      const stream = new ReadableStream({
        start(controller) {
          const unsub = bus.subscribe((event) => {
            controller.enqueue(`event: node\ndata: ${JSON.stringify(event, (_k, v) => typeof v === "bigint" ? v.toString() : v)}\n\n`);
          });
          controller.enqueue("event: ready\ndata: {}\n\n");
          req.signal.addEventListener("abort", () => {
            unsub();
            controller.close();
          }, { once: true });
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
          ...corsHeadersForRequest(req),
        },
      });
    }
    if (url.pathname.startsWith("/token/")) {
      const idRaw = url.pathname.split("/").at(-1) ?? "";
      try {
        const tokenId = BigInt(idRaw);
        return json(req, (await store.getToken(tokenId)) ?? null);
      } catch {
        return json(req, { error: "invalid_token_id" }, 400);
      }
    }
    if (url.pathname.startsWith("/link/")) {
      const parts = url.pathname.split("/");
      if (parts.length < 4) return json(req, { error: "bad_path" }, 400);
      const collection = parts[2] as Address;
      try {
        const nftTokenId = BigInt(parts[3]);
        return json(req, (await store.getLink(collection, nftTokenId)) ?? null);
      } catch {
        return json(req, { error: "invalid_nft_token_id" }, 400);
      }
    }
    return new Response("Not found", { status: 404, headers: corsHeadersForRequest(req) });
  });
}

function json(req: Request, payload: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(payload, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2),
    { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeadersForRequest(req) } },
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
