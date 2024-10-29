import { tokenStorage } from "./token/operations";
import axios from "axios";

async function main(){
    const stringifiedStorage = JSON.stringify(tokenStorage);

    const response = await axios.post("http://localhost:8080/submit-blob", {
        data: stringifiedStorage
    });

    console.log(response.data);
}

main();