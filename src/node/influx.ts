import type { DailySnapshot, LedgerStats, NodeEvent, TokenLink, TokenState } from "./types.ts";

export class InfluxSink {
  constructor(
    private readonly url: string,
    private readonly org: string,
    private readonly bucket: string,
    private readonly token: string,
  ) {}

  async writeStats(stats: LedgerStats): Promise<void> {
    const fields = [
      `chain_id=${stats.chainId}i`,
      `events_processed=${stats.eventsProcessed}i`,
      `scanned_blocks=${stats.scannedBlocks}i`,
      `total_reissued=${stats.totalReissued}i`,
      `total_redeemed=${stats.totalRedeemed}i`,
      `total_redeemed_minor=${stats.totalRedeemedMinor}i`,
      `total_transfers=${stats.totalTransfers}i`,
      `total_returns_applied=${stats.totalReturnsApplied}i`,
      stats.activeTokenCount !== undefined ? `active_token_count=${stats.activeTokenCount}i` : "",
      stats.totalTokenSlots !== undefined ? `total_token_slots=${stats.totalTokenSlots}i` : "",
      stats.operationalFundMinor !== undefined ? `operational_fund_minor=${stats.operationalFundMinor}i` : "",
      stats.premiumReserveMinor !== undefined ? `premium_reserve_minor=${stats.premiumReserveMinor}i` : "",
    ].filter(Boolean).join(",");
    await this.writeLine(
      `token_node_stats,ledger=${stats.ledgerAddress.toLowerCase()},chain=${stats.chainId} ${fields} ${BigInt(stats.updatedAtUnix) * 1_000_000_000n}`,
    );
  }

  async writeToken(token: TokenState): Promise<void> {
    const fields = [
      token.active !== undefined ? `active=${token.active ? "true" : "false"}` : "",
      token.activationTime !== undefined ? `activation_time=${token.activationTime}i` : "",
      token.indexAtActivationWad !== undefined ? `index_at_activation_wad=${token.indexAtActivationWad}i` : "",
      token.expectedExpiry !== undefined ? `expected_expiry=${token.expectedExpiry}i` : "",
      token.anchorFrozen !== undefined ? `anchor_frozen=${token.anchorFrozen ? "true" : "false"}` : "",
      token.lastRedemptionPayoutMinor !== undefined ? `last_redemption_payout_minor=${token.lastRedemptionPayoutMinor}i` : "",
    ].filter(Boolean).join(",");
    if (!fields) return;
    await this.writeLine(
      `token_state,token_id=${token.tokenId.toString()} ${fields}`,
    );
  }

  async writeLink(link: TokenLink): Promise<void> {
    await this.writeLine(
      `token_link,nft_collection=${link.nftCollection.toLowerCase()},nft_token_id=${link.nftTokenId.toString()} ledger_slot=${link.ledgerSlot}i,updated_block=${link.updatedAtBlock}i`,
    );
  }

  async writeSnapshot(s: DailySnapshot): Promise<void> {
    const fields = [
      s.operationalFundMinor !== undefined ? `operational_fund_minor=${s.operationalFundMinor}i` : "",
      s.premiumReserveMinor !== undefined ? `premium_reserve_minor=${s.premiumReserveMinor}i` : "",
      s.activeTokenCount !== undefined ? `active_token_count=${s.activeTokenCount}i` : "",
      s.totalTokenSlots !== undefined ? `total_token_slots=${s.totalTokenSlots}i` : "",
      `total_redeemed_minor=${s.totalRedeemedMinor}i`,
      `total_reissued=${s.totalReissued}i`,
    ].filter(Boolean).join(",");
    await this.writeLine(
      `daily_snapshot,day=${s.dayKey.toString()} ${fields} ${BigInt(s.capturedAtUnix) * 1_000_000_000n}`,
    );
  }

  async writeEvent(event: NodeEvent): Promise<void> {
    const json = JSON.stringify(event, (_k, v) => typeof v === "bigint" ? v.toString() : v)
      .replaceAll("\\", "\\\\")
      .replaceAll("\"", "\\\"");
    await this.writeLine(`node_event event="${json}"`);
  }

  private async writeLine(line: string): Promise<void> {
    const endpoint =
      `${this.url.replace(/\/$/, "")}/api/v2/write?org=${encodeURIComponent(this.org)}&bucket=${encodeURIComponent(this.bucket)}&precision=ns`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Token ${this.token}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: line,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Influx write failed (${res.status}): ${txt}`);
    }
  }
}

