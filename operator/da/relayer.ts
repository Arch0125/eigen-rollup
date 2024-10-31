import axios from "axios";

export async function postData(state: any) {
    const postBlobResponse = await axios.post("http://localhost:8080/submit-blob", {
        data: JSON.stringify(state),
    });
    console.log(postBlobResponse.data);
    let requestID = postBlobResponse.data.request_id;
    return requestID;
}

export async function getData(reqID: string) {
    const response = await axios.get("http://localhost:8080/get-blob?request_id="+reqID);
    const dataString = response.data.data;
    const cleanedData = dataString.replace(/\x00/g, '');
    let parsedData = JSON.parse(cleanedData);

    return parsedData;
}