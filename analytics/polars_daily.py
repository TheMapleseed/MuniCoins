#!/usr/bin/env python3
"""
Simple Polars analytics against daily_snapshots mirrored by token-node.

Usage:
  LEDGER_DATABASE_URL=postgresql://... python analytics/polars_daily.py
"""

import os
import polars as pl
import psycopg


def main() -> None:
    dsn = os.getenv("LEDGER_DATABASE_URL")
    if not dsn:
        raise SystemExit("Missing LEDGER_DATABASE_URL")

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("select payload from daily_snapshots order by day_key asc")
            rows = [r[0] for r in cur.fetchall()]

    if not rows:
        print("No daily snapshots found.")
        return

    df = pl.DataFrame(rows)
    for col in ("operationalFundMinor", "premiumReserveMinor", "totalRedeemedMinor", "totalReissued"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Int128, strict=False))

    df = df.with_columns(
        (pl.col("operationalFundMinor") + pl.col("premiumReserveMinor")).alias("tvlMinor"),
    )
    df = df.with_columns(
        (pl.col("tvlMinor") - pl.col("tvlMinor").shift(1)).alias("deltaTvlMinor"),
    )

    print(df.select([
        "dayKey",
        "tvlMinor",
        "deltaTvlMinor",
        "activeTokenCount",
        "totalRedeemedMinor",
        "totalReissued",
    ]))


if __name__ == "__main__":
    main()

