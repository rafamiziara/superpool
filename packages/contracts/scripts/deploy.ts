import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Starting deployment...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deployment parameters
  const maxLoanAmount = ethers.parseEther("10"); // 10 ETH max loan
  const interestRate = 500; // 5% (in basis points)
  const loanDuration = 30 * 24 * 60 * 60; // 30 days in seconds
  
  console.log("\nDeployment parameters:");
  console.log("- Max Loan Amount:", ethers.formatEther(maxLoanAmount), "ETH");
  console.log("- Interest Rate:", interestRate / 100, "%");
  console.log("- Loan Duration:", loanDuration / (24 * 60 * 60), "days");

  try {
    // Deploy the upgradeable contract
    console.log("\nDeploying SampleLendingPool...");
    const SampleLendingPool = await ethers.getContractFactory("SampleLendingPool");
    
    const proxy = await upgrades.deployProxy(SampleLendingPool, [
      deployer.address, // owner
      maxLoanAmount,
      interestRate,
      loanDuration
    ], {
      initializer: "initialize",
      kind: "uups"
    });
    
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    
    console.log("✅ SampleLendingPool deployed to:", proxyAddress);
    
    // Get implementation address for verification
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("📋 Implementation address:", implementationAddress);
    
    // Verify the deployment
    console.log("\nVerifying deployment...");
    const poolConfig = await proxy.poolConfig();
    console.log("- Pool active:", poolConfig.isActive);
    console.log("- Max loan amount:", ethers.formatEther(poolConfig.maxLoanAmount), "ETH");
    console.log("- Interest rate:", poolConfig.interestRate, "basis points");
    console.log("- Loan duration:", poolConfig.loanDuration, "seconds");
    
    const version = await proxy.version();
    console.log("- Contract version:", version);
    
    console.log("\n🎉 Deployment completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Verify the contract on Polygonscan:");
    console.log(`   pnpm verify ${implementationAddress}`);
    console.log("2. Fund the pool by calling depositFunds() with ETH");
    console.log("3. Test loan creation with createLoan()");
    
    // Save deployment info
    const deploymentInfo = {
      network: await ethers.provider.getNetwork(),
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      proxy: proxyAddress,
      implementation: implementationAddress,
      parameters: {
        maxLoanAmount: maxLoanAmount.toString(),
        interestRate,
        loanDuration
      }
    };
    
    console.log("\n📄 Deployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
  } catch (error) {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });