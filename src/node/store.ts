import type { Address } from "viem";
import type { DailySnapshot, LedgerStats, TokenLink, TokenState } from "./types.ts";

const KEY_LAST_BLOCK = ["meta", "last_block"] as const;
const KEY_STATS = ["meta", "stats"] as const;

export class NodeStore {
  constructor(private readonly kv: Deno.Kv) {}

  static async open(path?: string): Promise<NodeStore> {
    const kv = await Deno.openKv(path);
    return new NodeStore(kv);
  }

  async close() {
    this.kv.close();
  }

  async getLastBlock(): Promise<bigint | undefined> {
    const res = await this.kv.get<bigint>(KEY_LAST_BLOCK);
    return res.value ?? undefined;
  }

  async setLastBlock(block: bigint): Promise<void> {
    await this.kv.set(KEY_LAST_BLOCK, block);
  }

  async getStats(): Promise<LedgerStats | undefined> {
    const res = await this.kv.get<LedgerStats>(KEY_STATS);
    return res.value ?? undefined;
  }

  async initStats(seed: LedgerStats): Promise<void> {
    const has = await this.getStats();
    if (!has) await this.kv.set(KEY_STATS, seed);
  }

  async patchStats(partial: Partial<LedgerStats>): Promise<LedgerStats> {
    const cur = await this.getStats();
    if (!cur) throw new Error("stats not initialized");
    const next = { ...cur, ...partial, updatedAtUnix: Math.floor(Date.now() / 1000) };
    await this.kv.set(KEY_STATS, next);
    return next;
  }

  tokenKey(tokenId: bigint) {
    return ["token", tokenId.toString()] as const;
  }

  linkKey(nftCollection: Address, nftTokenId: bigint) {
    return ["link", nftCollection.toLowerCase(), nftTokenId.toString()] as const;
  }

  async getToken(tokenId: bigint): Promise<TokenState | undefined> {
    const res = await this.kv.get<TokenState>(this.tokenKey(tokenId));
    return res.value ?? undefined;
  }

  async upsertToken(tokenId: bigint, patch: Partial<TokenState>): Promise<TokenState> {
    const cur = await this.getToken(tokenId);
    const next: TokenState = {
      tokenId,
      ...(cur ?? {}),
      ...patch,
    };
    await this.kv.set(this.tokenKey(tokenId), next);
    return next;
  }

  async setLink(link: TokenLink): Promise<void> {
    await this.kv.set(this.linkKey(link.nftCollection, link.nftTokenId), link);
  }

  async getLink(nftCollection: Address, nftTokenId: bigint): Promise<TokenLink | undefined> {
    const res = await this.kv.get<TokenLink>(this.linkKey(nftCollection, nftTokenId));
    return res.value ?? undefined;
  }

  snapshotKey(dayKey: bigint) {
    return ["snapshot", dayKey.toString()] as const;
  }

  async upsertDailySnapshot(snapshot: DailySnapshot): Promise<void> {
    await this.kv.set(this.snapshotKey(snapshot.dayKey), snapshot);
  }

  async getDailySnapshot(dayKey: bigint): Promise<DailySnapshot | undefined> {
    const res = await this.kv.get<DailySnapshot>(this.snapshotKey(dayKey));
    return res.value ?? undefined;
  }

  async listDailySnapshots(limit = 30): Promise<DailySnapshot[]> {
    const out: DailySnapshot[] = [];
    const iter = this.kv.list<DailySnapshot>({ prefix: ["snapshot"] }, { reverse: true });
    for await (const e of iter) {
      out.push(e.value);
      if (out.length >= limit) break;
    }
    return out;
  }
}

