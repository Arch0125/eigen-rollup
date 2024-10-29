import { ethers } from "ethers";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import { mint, transfer } from "./token/operations";

dotenv.config();

if (!Object.keys(process.env).length) {
    throw new Error("process.env object is empty");
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
let chainId = 31337;

const avsDeploymentData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/hello-world/${chainId}.json`), "utf8")
);
const coreDeploymentData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`), "utf8")
);

const helloWorldServiceManagerAddress = avsDeploymentData.addresses.helloWorldServiceManager;
const helloWorldServiceManagerABI = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../abis/HelloWorldServiceManager.json"), "utf8")
);

const helloWorldServiceManager = new ethers.Contract(
    helloWorldServiceManagerAddress,
    helloWorldServiceManagerABI,
    wallet
);

let requestID =
    "5f352cc9d5a54715e1e919a6cc0bb5eca00c6beb5595ec83a6d7512b869cb58b-313733303232323236303839323335373731302f302f33332f312f33332fe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// Task Queue to manage tasks in FIFO order
class TaskQueue {
    private queue: Array<{ taskIndex: number; task: any }>;
    private processing: boolean;

    constructor() {
        this.queue = [];
        this.processing = false;
    }

    enqueue(taskIndex: number, task: any) {
        this.queue.push({ taskIndex, task });
        this.processNext(); // Start processing the next task if not already processing
    }

    private async processNext() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        const { taskIndex, task } = this.queue.shift()!; // Get the next task

        try {
            console.log(`Processing task: ${task.name}`);
            await signAndRespondToTask(taskIndex, task.taskCreatedBlock, task.name, task.taskMetadata);
        } catch (error) {
            console.error(`Error processing task ${task.name}:`, error);
        } finally {
            this.processing = false;
            this.processNext(); // Process the next task in the queue
        }
    }
}

// Create a TaskQueue instance
const taskQueue = new TaskQueue();

const signAndRespondToTask = async (
    taskIndex: number,
    taskCreatedBlock: number,
    taskName: string,
    taskMetadata: string
) => {
    const message = `Hello, ${taskName}`;
    const messageHash = ethers.solidityPackedKeccak256(["string"], [message]);
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await wallet.signMessage(messageBytes);

    console.log(`Signing and responding to task ${taskIndex}`);

    const response = await axios.get(`http://localhost:8080/get-blob?request_id=${requestID}`);
    let cleanedData = response.data.data.replace(/\x00/g, "");
    let parsedData = JSON.parse(cleanedData);
    const metadata = JSON.parse(taskMetadata);

    console.log("Request ID: ", requestID);

    if (taskName === "mint") {
        const res = mint(metadata.address, metadata.amount, parsedData);
        console.log(res);
        parsedData = res;
    } else if (taskName === "transfer") {
        const res = transfer(metadata.from, metadata.to, metadata.amount, parsedData);
        console.log(res);
        parsedData = res;
    } else {
        console.log("Invalid task name");
        return;
    }

    console.log("Posting updated state to EigenLayer...");
    const postBlobResponse = await axios.post("http://localhost:8080/submit-blob", {
        data: JSON.stringify(parsedData),
    });

    console.log(postBlobResponse.data);
    requestID = postBlobResponse.data.request_id;

    const operators = [await wallet.getAddress()];
    const signatures = [signature];
    const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "bytes[]", "uint32"],
        [operators, signatures, ethers.toBigInt(await provider.getBlockNumber() - 1)]
    );

    const tx = await helloWorldServiceManager.respondToTask(
        { name: taskName, taskCreatedBlock, taskMetadata },
        taskIndex,
        signedTask
    );
    await tx.wait();
    console.log(`Responded to task.`);
};

const monitorNewTasks = async () => {
    helloWorldServiceManager.on("NewTaskCreated", (taskIndex: number, task: any) => {
        console.log(`New task detected: ${task.name}`);
        taskQueue.enqueue(taskIndex, task); // Add the new task to the queue
    });

    console.log("Monitoring for new tasks...");
};

const main = async () => {
    try {
        monitorNewTasks();
    } catch (error) {
        console.error("Error monitoring tasks:", error);
    }
};

main().catch((error) => {
    console.error("Error in main function:", error);
});
