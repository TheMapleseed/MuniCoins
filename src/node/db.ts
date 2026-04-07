import { Client } from "pg";
import type { DailySnapshot, LedgerStats, TokenLink, TokenState } from "./types.ts";

export class PostgresLedgerSink {
  private client: Client;

  constructor(private readonly connectionString: string) {
    this.client = new Client({ connectionString });
  }

  async connect() {
    await this.client.connect();
    await this.client.query(`
      create table if not exists ledger_stats (
        id int primary key default 1,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table if not exists token_state (
        token_id text primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
      create table if not exists token_links (
        nft_collection text not null,
        nft_token_id text not null,
        payload jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (nft_collection, nft_token_id)
      );
      create table if not exists daily_snapshots (
        day_key text primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      );
    `);
  }

  async close() {
    await this.client.end();
  }

  async upsertStats(stats: LedgerStats) {
    await this.client.query(
      `insert into ledger_stats(id, payload, updated_at) values (1, $1::jsonb, now())
       on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [JSON.stringify(stats, bigintReplacer)],
    );
  }

  async upsertToken(token: TokenState) {
    await this.client.query(
      `insert into token_state(token_id, payload, updated_at) values ($1, $2::jsonb, now())
       on conflict (token_id) do update set payload = excluded.payload, updated_at = now()`,
      [token.tokenId.toString(), JSON.stringify(token, bigintReplacer)],
    );
  }

  async upsertLink(link: TokenLink) {
    await this.client.query(
      `insert into token_links(nft_collection, nft_token_id, payload, updated_at) values ($1, $2, $3::jsonb, now())
       on conflict (nft_collection, nft_token_id) do update set payload = excluded.payload, updated_at = now()`,
      [link.nftCollection.toLowerCase(), link.nftTokenId.toString(), JSON.stringify(link, bigintReplacer)],
    );
  }

  async upsertDailySnapshot(snapshot: DailySnapshot) {
    await this.client.query(
      `insert into daily_snapshots(day_key, payload, updated_at) values ($1, $2::jsonb, now())
       on conflict (day_key) do update set payload = excluded.payload, updated_at = now()`,
      [snapshot.dayKey.toString(), JSON.stringify(snapshot, bigintReplacer)],
    );
  }
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

