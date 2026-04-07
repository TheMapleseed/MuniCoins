//! Binary schedule format (stable layout for hashing):
//! `MAGIC (4) || repeated rows: maturity_unix u64 LE, notion_minor u128 LE`
//! Verify with Blake3; commit the hash on-chain or pin by CID.

pub const MAGIC: &[u8; 4] = b"MUN1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaturityRow {
    pub maturity_unix: u64,
    pub notion_minor: u128,
}

#[derive(Debug, Clone, Copy)]
pub enum ScheduleDecodeError {
    BadMagic,
    TrailingBytes,
    UnexpectedEof,
}

/// Encode rows to canonical bytes (deterministic).
pub fn encode_schedule(rows: &[MaturityRow]) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + rows.len() * 24);
    out.extend_from_slice(MAGIC);
    for r in rows {
        out.extend_from_slice(&r.maturity_unix.to_le_bytes());
        out.extend_from_slice(&r.notion_minor.to_le_bytes());
    }
    out
}

pub fn decode_schedule(bytes: &[u8]) -> Result<Vec<MaturityRow>, ScheduleDecodeError> {
    if bytes.len() < 4 {
        return Err(ScheduleDecodeError::UnexpectedEof);
    }
    if &bytes[0..4] != MAGIC {
        return Err(ScheduleDecodeError::BadMagic);
    }
    let rest = &bytes[4..];
    if rest.len() % 24 != 0 {
        return Err(ScheduleDecodeError::TrailingBytes);
    }
    let mut rows = Vec::with_capacity(rest.len() / 24);
    let mut i = 0;
    while i < rest.len() {
        let u = u64::from_le_bytes(rest[i..i + 8].try_into().unwrap());
        i += 8;
        let n = u128::from_le_bytes(rest[i..i + 16].try_into().unwrap());
        i += 16;
        rows.push(MaturityRow {
            maturity_unix: u,
            notion_minor: n,
        });
    }
    Ok(rows)
}

pub fn blake3_hex(data: &[u8]) -> String {
    hex::encode(blake3::hash(data).as_bytes())
}

/// Compare computed Blake3 to an expected 64-char hex digest (no 0x).
pub fn blake3_matches_hex(data: &[u8], expected_hex: &str) -> bool {
    let Ok(exp) = hex::decode(expected_hex.trim_start_matches("0x")) else {
        return false;
    };
    if exp.len() != 32 {
        return false;
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&exp);
    blake3::hash(data).as_bytes() == &arr
}
