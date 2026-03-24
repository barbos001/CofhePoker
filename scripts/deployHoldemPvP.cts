import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying CofheHoldemPvP to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH\n`);

  const Factory = await hre.ethers.getContractFactory("CofheHoldemPvP");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅  CofheHoldemPvP deployed at: ${address}`);

  const deploymentDir  = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDir, `${network}-holdem-pvp.json`);
  const configFile     = path.join(__dirname, "..", "src", "config", "contractHoldemPvP.ts");

  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true });

  fs.writeFileSync(deploymentFile, JSON.stringify({
    CofheHoldemPvP: address,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log(`\nSaved deployment to deployments/${network}-holdem-pvp.json`);

  if (fs.existsSync(configFile)) {
    let content = fs.readFileSync(configFile, "utf-8");
    content = content.replace(
      /HOLDEM_PVP_CONTRACT_ADDRESS\s*=\s*'0x[0-9a-fA-F]*'/,
      `HOLDEM_PVP_CONTRACT_ADDRESS = '${address}'`
    );
    fs.writeFileSync(configFile, content);
    console.log(`Updated src/config/contractHoldemPvP.ts with deployed address`);
  }

  console.log(`\nSet VITE_HOLDEM_PVP_CONTRACT_ADDRESS=${address} in .env`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
