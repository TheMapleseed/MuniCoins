use ethers::{
    prelude::*,
    core::types::TransactionRequest,
    middleware::SignerMiddleware,
    providers::{Provider, Http},
    signers::{LocalWallet, Signer},
};
use std::sync::Arc;
use std::error::Error;

pub async fn deploy_contract(
    rpc_url: &str,
    private_key: &str,
) -> Result<Address, Box<dyn Error>> {
    // Connect to network
    let provider = Provider::<Http>::try_from(rpc_url)?;
    let chain_id = provider.get_chainid().await?;
    
    // Setup wallet
    let wallet = private_key.parse::<LocalWallet>()?;
    let wallet = wallet.with_chain_id(chain_id.as_u64());
    let client = SignerMiddleware::new(provider, wallet);
    let client = Arc::new(client);

    // Deploy contract
    let contract = SecureNFT::deploy(client, (
        "SecureNFT".to_string(),
        "SNFT".to_string(),
        "https://api.example.com/metadata/".to_string(),
    ))?
    .send()
    .await?;

    Ok(contract.address())
} 