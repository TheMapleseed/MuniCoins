use ethers::{
    contract::abigen,
    core::types::{Address, TransactionReceipt, U256},
    providers::{Middleware, Provider},
    signers::Signer,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// Full ERC-721 interface including metadata and enumerable extensions
abigen!(
    ERC721Contract,
    r#"[
        function balanceOf(address owner) external view returns (uint256)
        function ownerOf(uint256 tokenId) external view returns (address)
        function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external
        function safeTransferFrom(address from, address to, uint256 tokenId) external
        function transferFrom(address from, address to, uint256 tokenId) external
        function approve(address to, uint256 tokenId) external
        function setApprovalForAll(address operator, bool approved) external
        function getApproved(uint256 tokenId) external view returns (address)
        function isApprovedForAll(address owner, address operator) external view returns (bool)
        function name() external view returns (string)
        function symbol() external view returns (string)
        function tokenURI(uint256 tokenId) external view returns (string)
        function totalSupply() external view returns (uint256)
        function tokenByIndex(uint256 index) external view returns (uint256)
        function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)

        event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
        event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)
        event ApprovalForAll(address indexed owner, address indexed operator, bool approved)
    ]"#
);

pub struct EthereumNFTHandler<M: Middleware> {
    contract: Arc<ERC721Contract<M>>,
    provider: Arc<M>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenMetadata {
    name: String,
    description: String,
    image: String,
    attributes: Vec<TokenAttribute>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenAttribute {
    trait_type: String,
    value: String,
}

impl<M: Middleware> EthereumNFTHandler<M> {
    pub fn new(contract_address: Address, provider: Arc<M>) -> Self {
        let contract = Arc::new(ERC721Contract::new(contract_address, provider.clone()));
        Self { contract, provider }
    }

    /// List token on marketplace with ETH price
    pub async fn list_for_sale(
        &self,
        token_id: U256,
        price_in_eth: U256,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error>> {
        // Approve marketplace contract
        let marketplace_address = self.get_marketplace_address();
        let approve_tx = self.contract
            .approve(marketplace_address, token_id)
            .send()
            .await?
            .await?;

        // List on marketplace
        let marketplace = self.get_marketplace_contract();
        let list_tx = marketplace
            .list_token(token_id, price_in_eth)
            .send()
            .await?
            .await?;

        Ok(list_tx)
    }

    /// Buy token with ETH
    pub async fn buy_with_eth(
        &self,
        token_id: U256,
        value: U256,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error>> {
        let marketplace = self.get_marketplace_contract();
        let buy_tx = marketplace
            .buy_token(token_id)
            .value(value)
            .send()
            .await?
            .await?;

        Ok(buy_tx)
    }

    /// Get token metadata in standard format
    pub async fn get_token_metadata(
        &self,
        token_id: U256,
    ) -> Result<TokenMetadata, Box<dyn std::error::Error>> {
        let uri = self.contract.token_uri(token_id).call().await?;
        let metadata: TokenMetadata = self.fetch_metadata(&uri).await?;
        Ok(metadata)
    }

    /// Check if wallet owns token
    pub async fn verify_ownership(
        &self,
        wallet_address: Address,
        token_id: U256,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        let owner = self.contract.owner_of(token_id).call().await?;
        Ok(owner == wallet_address)
    }

    /// Get all tokens owned by wallet
    pub async fn get_wallet_tokens(
        &self,
        wallet_address: Address,
    ) -> Result<Vec<U256>, Box<dyn std::error::Error>> {
        let balance = self.contract.balance_of(wallet_address).call().await?;
        let mut tokens = Vec::new();

        for i in 0..balance.as_u64() {
            let token_id = self.contract
                .token_of_owner_by_index(wallet_address, U256::from(i))
                .call()
                .await?;
            tokens.push(token_id);
        }

        Ok(tokens)
    }

    /// Transfer to another wallet
    pub async fn safe_transfer(
        &self,
        from: Address,
        to: Address,
        token_id: U256,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error>> {
        let tx = self.contract
            .safe_transfer_from(from, to, token_id)
            .send()
            .await?
            .await?;

        Ok(tx)
    }

    /// Set approval for marketplace
    pub async fn set_marketplace_approval(
        &self,
        marketplace_address: Address,
        approved: bool,
    ) -> Result<TransactionReceipt, Box<dyn std::error::Error>> {
        let tx = self.contract
            .set_approval_for_all(marketplace_address, approved)
            .send()
            .await?
            .await?;

        Ok(tx)
    }

    /// Check if token exists
    pub async fn token_exists(&self, token_id: U256) -> Result<bool, Box<dyn std::error::Error>> {
        match self.contract.owner_of(token_id).call().await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}

// Helper functions for marketplace integration
impl<M: Middleware> EthereumNFTHandler<M> {
    fn get_marketplace_address(&self) -> Address {
        // Return configured marketplace address
        unimplemented!("Configure marketplace address")
    }

    fn get_marketplace_contract(&self) -> MarketplaceContract<M> {
        unimplemented!("Initialize marketplace contract")
    }

    async fn fetch_metadata(&self, uri: &str) -> Result<TokenMetadata, Box<dyn std::error::Error>> {
        // Fetch and parse metadata from URI
        unimplemented!("Implement metadata fetching")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethers::providers::Provider;
    use std::str::FromStr;

    #[tokio::test]
    async fn test_ethereum_compatibility() -> Result<(), Box<dyn std::error::Error>> {
        let provider = Provider::try_from("http://localhost:8545")?;
        let contract_address = Address::from_str("0x...")?;
        
        let handler = EthereumNFTHandler::new(
            contract_address,
            Arc::new(provider),
        );

        // Test wallet ownership
        let wallet = Address::from_str("0x...")?;
        let token_id = U256::from(1);
        let owns_token = handler.verify_ownership(wallet, token_id).await?;
        
        // Test token metadata
        let metadata = handler.get_token_metadata(token_id).await?;
        assert!(!metadata.name.is_empty());

        Ok(())
    }
} 