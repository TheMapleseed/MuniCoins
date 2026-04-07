import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { ledgerEvents, registryEvents } from "./abi.ts";
import { NodeStore } from "./store.ts";
import type { LedgerStats } from "./types.ts";
import type { NodeEvent } from "./types.ts";
import type { PostgresLedgerSink } from "./db.ts";
import type { NodeEventBus } from "./bus.ts";
import type { InfluxSink } from "./influx.ts";

const ledgerViewAbi = [
  { type: "function", name: "activeTokenCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalTokenSlots", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "operationalFund", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "premiumReserve", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "initialActiveSlots", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type NodeConfig = {
  rpcUrl: string;
  chain?: Chain;
  ledgerAddress: Address;
  registryAddress?: Address;
  startBlock?: bigint;
  batchSize?: bigint;
  pollMs?: number;
  reconcileEveryLoops?: number;
};

type UnifiedEvent = {
  blockNumber: bigint;
  logIndex: number;
  handler: () => Promise<void>;
};

export class TokenNodeIndexer {
  private readonly client: PublicClient;
  private readonly chain: Chain;
  private readonly batchSize: bigint;
  private readonly pollMs: number;
  private readonly reconcileEveryLoops: number;
  private loops = 0;

  constructor(
    private readonly cfg: NodeConfig,
    private readonly store: NodeStore,
    private readonly deps?: {
      sink?: PostgresLedgerSink;
      influx?: InfluxSink;
      bus?: NodeEventBus;
    },
  ) {
    this.chain = cfg.chain ?? mainnet;
    this.client = createPublicClient({ chain: this.chain, transport: http(cfg.rpcUrl) });
    this.batchSize = cfg.batchSize ?? 2_000n;
    this.pollMs = cfg.pollMs ?? 3_000;
    this.reconcileEveryLoops = cfg.reconcileEveryLoops ?? 20;
  }

  async init(): Promise<void> {
    const start = this.cfg.startBlock ?? await this.client.getBlockNumber();
    const stats: LedgerStats = {
      chainId: this.chain.id,
      ledgerAddress: this.cfg.ledgerAddress,
      registryAddress: this.cfg.registryAddress,
      lastProcessedBlock: start - 1n,
      scannedBlocks: 0n,
      eventsProcessed: 0n,
      activeTokenCount: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "activeTokenCount",
      }),
      totalTokenSlots: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "totalTokenSlots",
      }),
      operationalFundMinor: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "operationalFund",
      }),
      premiumReserveMinor: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "premiumReserve",
      }),
      totalReissued: 0n,
      totalRedeemed: 0n,
      totalRedeemedMinor: 0n,
      totalTransfers: 0n,
      totalReturnsApplied: 0n,
      updatedAtUnix: Math.floor(Date.now() / 1000),
    };
    await this.store.initStats(stats);
    await this.deps?.sink?.upsertStats(stats);
    await this.deps?.influx?.writeStats(stats);
    const last = await this.store.getLastBlock();
    if (last === undefined) await this.store.setLastBlock(start - 1n);
  }

  async start(): Promise<never> {
    await this.init();
    for (;;) {
      await this.indexOnce();
      this.loops += 1;
      if (this.loops % this.reconcileEveryLoops === 0) {
        await this.reconcile();
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  async indexOnce(): Promise<void> {
    const current = await this.client.getBlockNumber();
    const last = (await this.store.getLastBlock()) ?? (current - 1n);
    if (current <= last) return;

    let from = last + 1n;
    while (from <= current) {
      const to = from + this.batchSize - 1n > current ? current : from + this.batchSize - 1n;
      await this.processRange(from, to);
      await this.store.setLastBlock(to);
      const patched = await this.store.patchStats({
        lastProcessedBlock: to,
        scannedBlocks: ((await this.store.getStats())?.scannedBlocks ?? 0n) + (to - from + 1n),
      });
      await this.deps?.sink?.upsertStats(patched);
      await this.deps?.influx?.writeStats(patched);
      from = to + 1n;
    }
  }

  private async processRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    const events: UnifiedEvent[] = [];

    const [
      liq, ranges, returns, redeemed, reissued, moved, anchors, frozen, funded,
    ] = await Promise.all([
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.liquidityBootstrapped, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.tokenRangeBootstrapped, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.returnPeriodApplied, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.tokenRedeemed, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.tokenReissued, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.tokenTransferred, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.slotAnchorSet, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.anchorFrozen, fromBlock, toBlock }),
      this.client.getLogs({ address: this.cfg.ledgerAddress, event: ledgerEvents.reissueFunded, fromBlock, toBlock }),
    ]);

    for (const l of liq) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          await this.store.patchStats({
            operationalFundMinor: a.operationalFundAmount,
            premiumReserveMinor: a.premiumReserveAmount,
          });
        },
      });
    }
    for (const l of ranges) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          for (let id = a.fromId; id <= a.toId; id++) {
            const token = await this.store.upsertToken(id, { owner: a.initialHolder as Address });
            await this.deps?.sink?.upsertToken(token);
            await this.deps?.influx?.writeToken(token);
          }
        },
      });
    }
    for (const l of returns) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const cur = await this.store.getStats();
          await this.store.patchStats({
            operationalFundMinor: a.operationalFundAfter,
            totalReturnsApplied: (cur?.totalReturnsApplied ?? 0n) + 1n,
            eventsProcessed: (cur?.eventsProcessed ?? 0n) + 1n,
            lastReturnPeriodId: String(a.periodId),
            lastReturnPeriodEnd: BigInt(a.periodEnd),
          });
        },
      });
    }
    for (const l of redeemed) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const cur = await this.store.getStats();
          const token = await this.store.upsertToken(a.tokenId, {
            owner: a.owner as Address,
            active: false,
            lastRedemptionPayoutMinor: a.payout,
          });
          await this.deps?.sink?.upsertToken(token);
          await this.deps?.influx?.writeToken(token);
          await this.store.patchStats({
            operationalFundMinor: a.operationalFundAfter,
            totalRedeemed: (cur?.totalRedeemed ?? 0n) + 1n,
            totalRedeemedMinor: (cur?.totalRedeemedMinor ?? 0n) + a.payout,
            eventsProcessed: (cur?.eventsProcessed ?? 0n) + 1n,
          });
        },
      });
    }
    for (const l of reissued) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const cur = await this.store.getStats();
          const token = await this.store.upsertToken(a.tokenId, {
            owner: a.owner as Address,
            active: true,
            activationTime: BigInt(a.activationTime),
            indexAtActivationWad: a.indexAtActivationWad,
          });
          await this.deps?.sink?.upsertToken(token);
          await this.deps?.influx?.writeToken(token);
          await this.store.patchStats({
            totalReissued: (cur?.totalReissued ?? 0n) + 1n,
            eventsProcessed: (cur?.eventsProcessed ?? 0n) + 1n,
          });
        },
      });
    }
    for (const l of moved) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const cur = await this.store.getStats();
          const token = await this.store.upsertToken(a.tokenId, { owner: a.to as Address, active: a.active });
          await this.deps?.sink?.upsertToken(token);
          await this.deps?.influx?.writeToken(token);
          await this.store.patchStats({
            totalTransfers: (cur?.totalTransfers ?? 0n) + 1n,
            eventsProcessed: (cur?.eventsProcessed ?? 0n) + 1n,
          });
        },
      });
    }
    for (const l of anchors) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const token = await this.store.upsertToken(a.tokenId, {
            nftCollection: a.nftCollection as Address,
            nftTokenId: a.nftTokenId,
            expectedExpiry: BigInt(a.expectedExpiry),
          });
          await this.deps?.sink?.upsertToken(token);
          await this.deps?.influx?.writeToken(token);
        },
      });
    }
    for (const l of frozen) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          const token = await this.store.upsertToken(a.tokenId, { anchorFrozen: true });
          await this.deps?.sink?.upsertToken(token);
          await this.deps?.influx?.writeToken(token);
        },
      });
    }
    for (const l of funded) {
      events.push({
        blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
          const a = l.args as any;
          await this.store.patchStats({
            operationalFundMinor: a.operationalFundAfter,
            premiumReserveMinor: a.premiumReserveAfter,
          });
        },
      });
    }

    if (this.cfg.registryAddress) {
      const links = await this.client.getLogs({
        address: this.cfg.registryAddress,
        event: registryEvents.linkUpdated,
        fromBlock,
        toBlock,
      });
      for (const l of links) {
        events.push({
          blockNumber: l.blockNumber!, logIndex: Number(l.logIndex ?? 0), handler: async () => {
            const a = l.args as any;
            const link = {
              nftCollection: a.nftCollection as Address,
              nftTokenId: a.nftTokenId,
              ledgerSlot: a.ledgerSlot,
              updatedAtBlock: l.blockNumber!,
            };
            await this.store.setLink(link);
            await this.deps?.sink?.upsertLink(link);
            await this.deps?.influx?.writeLink(link);
          },
        });
      }
    }

    events.sort((a, b) =>
      a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : (a.blockNumber < b.blockNumber ? -1 : 1));
    for (const e of events) await e.handler();

    // refresh canonical counters from chain views
    const finalStats = await this.store.patchStats({
      activeTokenCount: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "activeTokenCount",
      }),
      totalTokenSlots: await this.client.readContract({
        address: this.cfg.ledgerAddress,
        abi: ledgerViewAbi,
        functionName: "totalTokenSlots",
      }),
    });
    await this.deps?.sink?.upsertStats(finalStats);
    await this.deps?.influx?.writeStats(finalStats);
    await this.captureDailySnapshot();
    const ev = {
      type: "indexed_range",
      fromBlock,
      toBlock,
      events: events.length,
    } as NodeEvent;
    this.deps?.bus?.publish(ev);
    await this.deps?.influx?.writeEvent(ev);
  }

  private async captureDailySnapshot() {
    const stats = await this.store.getStats();
    if (!stats) return;
    const dayKey = BigInt(Math.floor(Date.now() / 1000 / 86400));
    const snap = {
      dayKey,
      capturedAtUnix: Math.floor(Date.now() / 1000),
      operationalFundMinor: stats.operationalFundMinor,
      premiumReserveMinor: stats.premiumReserveMinor,
      activeTokenCount: stats.activeTokenCount,
      totalTokenSlots: stats.totalTokenSlots,
      totalRedeemedMinor: stats.totalRedeemedMinor,
      totalReissued: stats.totalReissued,
    };
    await this.store.upsertDailySnapshot(snap);
    await this.deps?.sink?.upsertDailySnapshot(snap);
    await this.deps?.influx?.writeSnapshot(snap);
    const ev = { type: "snapshot", dayKey } as NodeEvent;
    this.deps?.bus?.publish(ev);
    await this.deps?.influx?.writeEvent(ev);
  }

  private async reconcile() {
    const chainActive = await this.client.readContract({
      address: this.cfg.ledgerAddress,
      abi: ledgerViewAbi,
      functionName: "activeTokenCount",
    });
    const chainTotal = await this.client.readContract({
      address: this.cfg.ledgerAddress,
      abi: ledgerViewAbi,
      functionName: "totalTokenSlots",
    });
    const chainOp = await this.client.readContract({
      address: this.cfg.ledgerAddress,
      abi: ledgerViewAbi,
      functionName: "operationalFund",
    });
    const chainPrem = await this.client.readContract({
      address: this.cfg.ledgerAddress,
      abi: ledgerViewAbi,
      functionName: "premiumReserve",
    });
    const local = await this.store.getStats();
    if (!local) return;
    let mismatchCount = 0;
    if (local.activeTokenCount !== chainActive) mismatchCount++;
    if (local.totalTokenSlots !== chainTotal) mismatchCount++;
    if (local.operationalFundMinor !== chainOp) mismatchCount++;
    if (local.premiumReserveMinor !== chainPrem) mismatchCount++;
    const patched = await this.store.patchStats({
      activeTokenCount: chainActive,
      totalTokenSlots: chainTotal,
      operationalFundMinor: chainOp,
      premiumReserveMinor: chainPrem,
    });
    await this.deps?.sink?.upsertStats(patched);
    const ev = {
      type: "reconciled",
      block: patched.lastProcessedBlock,
      mismatchCount,
    } as NodeEvent;
    this.deps?.bus?.publish(ev);
    await this.deps?.influx?.writeEvent(ev);
  }
}

