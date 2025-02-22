use std::sync::Arc;
use ethers::providers::Provider;
use crate::{
    nft_security::NFTSecurityManager,
    ethereum_compatibility::EthereumNFTHandler,
    base_station::BaseStation,
    originator_ledger::OriginatorLedger,
};

pub struct SecureNFTSystem<M: Middleware> {
    security: NFTSecurityManager<M>,
    eth_handler: EthereumNFTHandler<M>,
    base_station: BaseStation,
    ledger: Arc<OriginatorLedger>,
}

impl<M: Middleware> SecureNFTSystem<M> {
    pub async fn initialize(
        contract_address: Address,
        provider: Arc<M>,
        rpc_url: &str,
        private_key: &str,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize components
        let security = NFTSecurityManager::new(provider.clone(), contract_address).await?;
        let eth_handler = EthereumNFTHandler::new(contract_address, provider.clone());
        let base_station = BaseStation::new(
            vec!["bootstrap1.example.com".to_string()],
            Arc::new(OriginatorLedger::new(
                identity::Keypair::generate_ed25519(),
                vec!["bootstrap1.example.com".to_string()],
            ).await?),
            Duration::hours(1),
        ).await?;
        let ledger = Arc::new(OriginatorLedger::new(
            identity::Keypair::generate_ed25519(),
            vec!["bootstrap1.example.com".to_string()],
        ).await?);

        Ok(Self {
            security,
            eth_handler,
            base_station,
            ledger,
        })
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Start base station
        tokio::spawn(async move {
            self.base_station.run().await?;
            Ok::<_, Box<dyn std::error::Error>>(())
        });

        // Start ledger
        tokio::spawn(async move {
            self.ledger.run_network().await?;
            Ok::<_, Box<dyn std::error::Error>>(())
        });

        Ok(())
    }
} 