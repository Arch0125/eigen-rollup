import { ethers } from "ethers";
import * as dotenv from "dotenv";
const fs = require('fs');
const path = require('path');
dotenv.config();

// Setup env variables
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
/// TODO: Hack
let chainId = 31337;

const avsDeploymentData = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/hello-world/${chainId}.json`), 'utf8'));
const helloWorldServiceManagerAddress = '0xf3cf5bf9ab547d629315723f16830b5ed574f79a';
const helloWorldServiceManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/HelloWorldServiceManager.json'), 'utf8'));
// Initialize contract objects from ABIs
const helloWorldServiceManager = new ethers.Contract(helloWorldServiceManagerAddress, helloWorldServiceManagerABI, wallet);

// Function to create a new task with a random name every 15 seconds
async function startCreatingTasks() {
  const tx = await helloWorldServiceManager.createNewTask("transfer", JSON.stringify({ from : '0x1547FFb043F7C5BDe7BaF3A03D1342CCD8211a28',to: "0x52d80D09E49Ac53C507D87E2474eEDdCb34b6919", amount: 10 }), "0x");
  console.log("Tx hash: ", tx.hash);
}

// Start the process
startCreatingTasks();