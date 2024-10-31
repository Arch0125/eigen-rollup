import { mint, transfer } from "./operations";

export function executeMethod(taskName: string, metadata: any, parsedData: any) {
    if (taskName === "mint") {
        const res = mint(metadata.address, metadata.amount, parsedData);
        parsedData = res;
        return parsedData;
    }
    else if (taskName === "transfer") {
        const res = transfer(metadata.from, metadata.to, metadata.amount, parsedData);      
        parsedData = res;
        return parsedData;

    } else {
        console.log("Invalid task name")
        return;
    }
}