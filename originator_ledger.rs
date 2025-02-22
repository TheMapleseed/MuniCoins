use ethers::{
    core::types::{Address, H256, U256},
    providers::Middleware,
    signers::Signer,
};
use libp2p::{
    gossipsub::{Gossipsub, GossipsubEvent, MessageAuthenticity, ValidationMode},
    identity::Keypair,
    swarm::{NetworkBehaviour, Swarm},
    PeerId,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::RwLock;
use tracing::{error, info};

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "OriginatorEvent")]
struct OriginatorBehaviour {
    gossipsub: Gossipsub,
}

#[derive(Debug, Serialize, Deserialize)]
struct OriginationRecord {
    token_id: U256,
    originator: Address,
    timestamp: u64,
    block_number: u64,
    transaction_hash: H256,
    metadata: HashMap<String, String>,
}

pub struct OriginatorLedger {
    records: Arc<RwLock<HashMap<U256, OriginationRecord>>>,
    swarm: Swarm<OriginatorBehaviour>,
    peer_id: PeerId,
    topic: libp2p::gossipsub::Topic,
}

impl OriginatorLedger {
    pub async fn new(
        keypair: Keypair,
        bootstrap_nodes: Vec<String>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let peer_id = PeerId::from(keypair.public());
        let topic = libp2p::gossipsub::Topic::new("originator-records");

        // Configure gossipsub
        let gossipsub_config = libp2p::gossipsub::GossipsubConfigBuilder::default()
            .validation_mode(ValidationMode::Strict)
            .message_id_fn(|message| {
                let mut s = DefaultHasher::new();
                message.data.hash(&mut s);
                MessageId::from(s.finish().to_string())
            })
            .build()
            .expect("Valid config");

        let mut behaviour = OriginatorBehaviour {
            gossipsub: Gossipsub::new(
                MessageAuthenticity::Signed(keypair.clone()),
                gossipsub_config,
            )?,
        };

        // Subscribe to the topic
        behaviour.gossipsub.subscribe(&topic)?;

        // Create and configure the swarm
        let mut swarm = libp2p::SwarmBuilder::with_tokio_executor(
            libp2p::Transport::new(libp2p::tcp::TokioTcpConfig::new()),
            behaviour,
            peer_id,
        )
        .build();

        // Connect to bootstrap nodes
        for addr in bootstrap_nodes {
            swarm.dial(addr.parse()?)?;
        }

        Ok(Self {
            records: Arc::new(RwLock::new(HashMap::new())),
            swarm,
            peer_id,
            topic,
        })
    }

    /// Record a new token origination
    pub async fn record_origination(
        &self,
        token_id: U256,
        originator: Address,
        block_number: u64,
        tx_hash: H256,
        metadata: HashMap<String, String>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs();

        let record = OriginationRecord {
            token_id,
            originator,
            timestamp,
            block_number,
            transaction_hash: tx_hash,
            metadata,
        };

        // Store locally
        {
            let mut records = self.records.write().await;
            records.insert(token_id, record.clone());
        }

        // Broadcast to network
        let message = serde_json::to_vec(&record)?;
        self.swarm
            .behaviour_mut()
            .gossipsub
            .publish(self.topic.clone(), message)?;

        info!(
            "Recorded origination for token {} by {}",
            token_id, originator
        );

        Ok(())
    }

    /// Verify token origination
    pub async fn verify_origination(
        &self,
        token_id: U256,
    ) -> Result<Option<OriginationRecord>, Box<dyn std::error::Error>> {
        let records = self.records.read().await;
        Ok(records.get(&token_id).cloned())
    }

    /// Start the network event loop
    pub async fn run_network(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        loop {
            match self.swarm.next().await {
                Some(event) => match event {
                    SwarmEvent::Behaviour(OriginatorEvent::Gossipsub(
                        GossipsubEvent::Message { message, .. },
                    )) => {
                        if let Ok(record) = serde_json::from_slice::<OriginationRecord>(&message.data) {
                            let mut records = self.records.write().await;
                            records.insert(record.token_id, record);
                        }
                    }
                    _ => {}
                },
                None => break,
            }
        }
        Ok(())
    }

    /// Sync with other nodes
    pub async fn sync_records(&self) -> Result<(), Box<dyn std::error::Error>> {
        let records = self.records.read().await;
        for record in records.values() {
            let message = serde_json::to_vec(&record)?;
            self.swarm
                .behaviour_mut()
                .gossipsub
                .publish(self.topic.clone(), message)?;
        }
        Ok(())
    }

    /// Get all records within a block range
    pub async fn get_records_in_range(
        &self,
        start_block: u64,
        end_block: u64,
    ) -> Result<Vec<OriginationRecord>, Box<dyn std::error::Error>> {
        let records = self.records.read().await;
        Ok(records
            .values()
            .filter(|r| r.block_number >= start_block && r.block_number <= end_block)
            .cloned()
            .collect())
    }

    /// Validate and reconcile records with the blockchain
    pub async fn validate_records<M: Middleware>(
        &self,
        provider: Arc<M>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let records = self.records.read().await;
        for record in records.values() {
            // Verify transaction exists and matches
            if let Some(tx) = provider.get_transaction(record.transaction_hash).await? {
                if tx.block_number.unwrap_or_default().as_u64() != record.block_number {
                    error!(
                        "Block number mismatch for token {}: {:?} vs {}",
                        record.token_id, tx.block_number, record.block_number
                    );
                }
            } else {
                error!(
                    "Transaction not found for token {}: {}",
                    record.token_id, record.transaction_hash
                );
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::providers::{Provider, Http};
    use std::str::FromStr;

    #[tokio::test]
    async fn test_originator_ledger() -> Result<(), Box<dyn std::error::Error>> {
        let keypair = Keypair::generate_ed25519();
        let bootstrap_nodes = vec![
            "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ".to_string(),
        ];

        let mut ledger = OriginatorLedger::new(keypair, bootstrap_nodes).await?;

        // Test record creation
        let token_id = U256::from(1);
        let originator = Address::from_str("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")?;
        let block_number = 12345u64;
        let tx_hash = H256::zero();
        let mut metadata = HashMap::new();
        metadata.insert("name".to_string(), "Test Token".to_string());

        ledger
            .record_origination(token_id, originator, block_number, tx_hash, metadata)
            .await?;

        // Verify record
        let record = ledger.verify_origination(token_id).await?.unwrap();
        assert_eq!(record.originator, originator);
        assert_eq!(record.block_number, block_number);

        Ok(())
    }
} 