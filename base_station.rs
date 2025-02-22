use blake3::{Hash, Hasher};
use chrono::{DateTime, Duration, Utc};
use libp2p::{
    kad::{Kademlia, KademliaEvent, QueryResult},
    swarm::SwarmEvent,
    PeerId,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenValueRecord {
    token_id: U256,
    timestamp: DateTime<Utc>,
    value: Decimal,
    confidence_score: f64,
    market_factors: HashMap<String, f64>,
    blake3_hash: String,
    previous_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ValueCalculationMetrics {
    market_volatility: f64,
    liquidity_index: f64,
    network_usage: f64,
    stake_distribution: f64,
}

pub struct BaseStation {
    dht: Kademlia<MemoryStore>,
    value_records: Arc<RwLock<HashMap<U256, Vec<TokenValueRecord>>>>,
    calculation_metrics: Arc<RwLock<ValueCalculationMetrics>>,
    peer_id: PeerId,
    originator_ledger: Arc<OriginatorLedger>,
    time_window: Duration,
}

impl BaseStation {
    pub async fn new(
        bootstrap_nodes: Vec<String>,
        originator_ledger: Arc<OriginatorLedger>,
        time_window: Duration,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let local_key = identity::Keypair::generate_ed25519();
        let peer_id = PeerId::from(local_key.public());
        
        // Initialize Kademlia DHT
        let store = MemoryStore::new(peer_id);
        let mut dht = Kademlia::new(peer_id, store);
        
        // Add bootstrap nodes
        for addr in bootstrap_nodes {
            dht.add_address(&addr.parse()?, addr.parse()?);
        }

        Ok(Self {
            dht,
            value_records: Arc::new(RwLock::new(HashMap::new())),
            calculation_metrics: Arc::new(RwLock::new(ValueCalculationMetrics {
                market_volatility: 0.0,
                liquidity_index: 0.0,
                network_usage: 0.0,
                stake_distribution: 0.0,
            })),
            peer_id,
            originator_ledger,
            time_window,
        })
    }

    /// Calculate token value using time-variant Blake3 hashing
    async fn calculate_token_value(
        &self,
        token_id: U256,
        timestamp: DateTime<Utc>,
    ) -> Result<TokenValueRecord, Box<dyn std::error::Error>> {
        let metrics = self.calculation_metrics.read().await;
        
        // Create time-variant hasher
        let mut hasher = Hasher::new();
        hasher.update(token_id.as_bytes());
        hasher.update(&timestamp.timestamp().to_be_bytes());
        
        // Add market metrics to hash
        hasher.update(&metrics.market_volatility.to_be_bytes());
        hasher.update(&metrics.liquidity_index.to_be_bytes());
        hasher.update(&metrics.network_usage.to_be_bytes());
        hasher.update(&metrics.stake_distribution.to_be_bytes());

        let hash = hasher.finalize();
        
        // Get previous record if exists
        let mut market_factors = HashMap::new();
        let previous_hash = {
            let records = self.value_records.read().await;
            records.get(&token_id)
                .and_then(|records| records.last())
                .map(|record| record.blake3_hash.clone())
        };

        // Calculate value based on hash and metrics
        let value = self.derive_value_from_hash(&hash, &metrics).await?;
        
        // Update market factors
        market_factors.insert("volatility".to_string(), metrics.market_volatility);
        market_factors.insert("liquidity".to_string(), metrics.liquidity_index);

        Ok(TokenValueRecord {
            token_id,
            timestamp,
            value,
            confidence_score: self.calculate_confidence_score(&metrics).await,
            market_factors,
            blake3_hash: hex::encode(hash.as_bytes()),
            previous_hash,
        })
    }

    /// Derive actual token value from Blake3 hash and metrics
    async fn derive_value_from_hash(
        &self,
        hash: &Hash,
        metrics: &ValueCalculationMetrics,
    ) -> Result<Decimal, Box<dyn std::error::Error>> {
        let hash_bytes = hash.as_bytes();
        let base_value = Decimal::from_bytes(hash_bytes)?;
        
        // Apply market metrics
        let value = base_value
            .saturating_mul(Decimal::from_f64(metrics.liquidity_index).unwrap_or(Decimal::ONE))
            .saturating_mul(Decimal::from_f64(1.0 - metrics.market_volatility).unwrap_or(Decimal::ONE));

        Ok(value)
    }

    /// Update token value and propagate to DHT
    pub async fn update_token_value(
        &self,
        token_id: U256,
    ) -> Result<TokenValueRecord, Box<dyn std::error::Error>> {
        let timestamp = Utc::now();
        let record = self.calculate_token_value(token_id, timestamp).await?;

        // Store locally
        {
            let mut records = self.value_records.write().await;
            records.entry(token_id)
                .or_insert_with(Vec::new)
                .push(record.clone());
        }

        // Propagate to DHT
        self.propagate_value_record(&record).await?;

        // Update originator ledger
        self.originator_ledger.update_token_value(token_id, &record).await?;

        Ok(record)
    }

    /// Propagate value record to DHT
    async fn propagate_value_record(
        &self,
        record: &TokenValueRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let key = self.generate_dht_key(record);
        let value = serde_json::to_vec(&record)?;
        
        self.dht.put_record(
            Record::new(key, value),
            Quorum::Majority,
        )?;

        Ok(())
    }

    /// Generate DHT key from record using time-variant Blake3
    fn generate_dht_key(&self, record: &TokenValueRecord) -> Key {
        let mut hasher = Hasher::new();
        hasher.update(record.token_id.as_bytes());
        hasher.update(record.timestamp.timestamp().to_be_bytes());
        hasher.update(record.blake3_hash.as_bytes());
        
        Key::new(&hasher.finalize().as_bytes())
    }

    /// Run the base station network loop
    pub async fn run(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

        loop {
            tokio::select! {
                event = self.dht.next() => {
                    match event {
                        SwarmEvent::Behaviour(KademliaEvent::QueryResult { result, .. }) => {
                            match result {
                                QueryResult::GetRecord(Ok(ok)) => {
                                    if let Some(record) = ok.records.first() {
                                        if let Ok(value_record) = serde_json::from_slice::<TokenValueRecord>(&record.value) {
                                            self.handle_received_record(value_record).await?;
                                        }
                                    }
                                }
                                QueryResult::PutRecord(Ok(_)) => {
                                    info!("Successfully stored record in DHT");
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                }
                _ = interval.tick() => {
                    self.update_metrics().await?;
                }
            }
        }
    }

    /// Handle received value record from DHT
    async fn handle_received_record(
        &self,
        record: TokenValueRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut records = self.value_records.write().await;
        
        // Verify hash chain
        if let Some(previous_records) = records.get(&record.token_id) {
            if let Some(last_record) = previous_records.last() {
                if record.previous_hash.as_ref() != Some(&last_record.blake3_hash) {
                    warn!("Hash chain verification failed for token {}", record.token_id);
                    return Ok(());
                }
            }
        }

        records.entry(record.token_id)
            .or_insert_with(Vec::new)
            .push(record);

        Ok(())
    }

    /// Update calculation metrics based on market conditions
    async fn update_metrics(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut metrics = self.calculation_metrics.write().await;
        
        // Update metrics based on market conditions
        // This would typically involve external data sources
        metrics.market_volatility = calculate_market_volatility().await?;
        metrics.liquidity_index = calculate_liquidity_index().await?;
        metrics.network_usage = calculate_network_usage().await?;
        metrics.stake_distribution = calculate_stake_distribution().await?;

        Ok(())
    }

    /// Calculate confidence score for value calculation
    async fn calculate_confidence_score(
        &self,
        metrics: &ValueCalculationMetrics,
    ) -> f64 {
        let volatility_weight = 0.3;
        let liquidity_weight = 0.3;
        let network_weight = 0.2;
        let stake_weight = 0.2;

        (metrics.market_volatility * volatility_weight +
         metrics.liquidity_index * liquidity_weight +
         metrics.network_usage * network_weight +
         metrics.stake_distribution * stake_weight)
            .min(1.0)
            .max(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_value_calculation() -> Result<(), Box<dyn std::error::Error>> {
        let originator_ledger = Arc::new(OriginatorLedger::new(
            identity::Keypair::generate_ed25519(),
            vec!["bootstrap1".to_string()],
        ).await?);

        let base_station = BaseStation::new(
            vec!["bootstrap1".to_string()],
            originator_ledger,
            Duration::hours(1),
        ).await?;

        let token_id = U256::from(1);
        let record = base_station.update_token_value(token_id).await?;

        assert!(record.value > Decimal::ZERO);
        assert!(record.confidence_score >= 0.0 && record.confidence_score <= 1.0);
        assert!(!record.blake3_hash.is_empty());

        Ok(())
    }
} 