import hre from "hardhat";
import fs from "fs";
import path from "path";

// Chainlink ETH/USD price feed on Sepolia
const CHAINLINK_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying Vault to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} ETH\n`);

  // 1. Deploy MockUSDT
  console.log("1/2  Deploying MockUSDT...");
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log(`     MockUSDT deployed at: ${usdtAddress}`);

  // 2. Deploy Vault
  console.log("2/2  Deploying Vault...");
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(usdtAddress, CHAINLINK_SEPOLIA);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`     Vault deployed at:    ${vaultAddress}`);

  // 3. Save deployment info
  const deploymentDir  = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDir, `${network}-vault.json`);

  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true });

  const deployment = {
    Vault:     vaultAddress,
    MockUSDT:  usdtAddress,
    priceFeed: CHAINLINK_SEPOLIA,
    chainId:   (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:  deployer.address,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved to deployments/${network}-vault.json`);

  // 4. Patch .env
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    let env = fs.readFileSync(envFile, "utf-8");

    // Replace or append VITE_VAULT_ADDRESS
    if (env.includes("VITE_VAULT_ADDRESS=")) {
      env = env.replace(/VITE_VAULT_ADDRESS=.*/g, `VITE_VAULT_ADDRESS=${vaultAddress}`);
    } else {
      env += `\nVITE_VAULT_ADDRESS=${vaultAddress}`;
    }

    // Replace or append VITE_USDT_ADDRESS
    if (env.includes("VITE_USDT_ADDRESS=")) {
      env = env.replace(/VITE_USDT_ADDRESS=.*/g, `VITE_USDT_ADDRESS=${usdtAddress}`);
    } else {
      env += `\nVITE_USDT_ADDRESS=${usdtAddress}`;
    }

    fs.writeFileSync(envFile, env);
    console.log("Updated .env with VITE_VAULT_ADDRESS and VITE_USDT_ADDRESS");
  }

  console.log("\n✅  Done!");
  console.log(`   VITE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`   VITE_USDT_ADDRESS=${usdtAddress}`);
  console.log("\nSet these in Vercel Environment Variables to enable real-money mode.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
