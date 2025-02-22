use dotenv::dotenv;
use std::env;
use ethers::providers::Provider;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    
    // Load configuration
    let rpc_url = env::var("ETHEREUM_RPC_URL")?;
    let private_key = env::var("PRIVATE_KEY")?;
    let contract_address = env::var("CONTRACT_ADDRESS")?
        .parse::<Address>()?;

    // Setup provider
    let provider = Provider::try_from(rpc_url.as_str())?;
    let provider = Arc::new(provider);

    // Initialize system
    let system = SecureNFTSystem::initialize(
        contract_address,
        provider,
        &rpc_url,
        &private_key,
    ).await?;

    // Start system
    system.start().await?;

    // Keep main thread alive
    tokio::signal::ctrl_c().await?;
    println!("Shutting down...");

    Ok(())
} 