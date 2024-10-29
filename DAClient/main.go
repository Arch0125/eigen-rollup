package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/Layr-Labs/eigenda/api/clients"
	disperser_rpc "github.com/Layr-Labs/eigenda/api/grpc/disperser"
	"github.com/Layr-Labs/eigenda/core/auth"
	"github.com/Layr-Labs/eigenda/disperser"
	"github.com/Layr-Labs/eigenda/encoding/utils/codec"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var client clients.DisperserClient

func main() {
	// Initialize the disperser client
	config := clients.NewConfig(
		"disperser-holesky.eigenda.xyz",
		"443",
		time.Second*10,
		true,
	)
	signer := auth.NewLocalBlobRequestSigner("bc6be7d1a74b23117855c023c9012eda33542c17a948d43e3828d7f42a231b5b")
	client = clients.NewDisperserClient(config, signer)

	// Set up HTTP routes
	http.HandleFunc("/submit-blob", submitBlobHandler)
	http.HandleFunc("/get-blob", getBlobHandler)

	// Start the HTTP server
	fmt.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// submitBlobHandler handles POST requests to submit a blob and wait for its confirmation.
func submitBlobHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST requests are allowed", http.StatusMethodNotAllowed)
		return
	}

	var reqData struct {
		Data string `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	fmt.Print("Data: ", reqData.Data)

	data := codec.ConvertByPaddingEmptyByte([]byte(reqData.Data))
	quorums := []uint8{}

	// Disperse the blob
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute*10)
	defer cancel()

	blobStatus, requestID, err := client.DisperseBlob(ctx, data, quorums)
	if err != nil || *blobStatus == disperser.Failed {
		http.Error(w, "Error dispersing blob", http.StatusInternalServerError)
		return
	}

	fmt.Fprintf(w, "Request ID: %s\nWaiting for confirmation...\n", string(requestID))

	// Poll the status until confirmed or failed
	for {
		statusCtx, statusCancel := context.WithTimeout(ctx, time.Second*5)
		defer statusCancel()

		statusReply, err := client.GetBlobStatus(statusCtx, requestID)
		if err != nil {
			http.Error(w, "Error getting blob status", http.StatusInternalServerError)
			return
		}

		if statusReply.Status == disperser_rpc.BlobStatus_CONFIRMED {
			w.WriteHeader(http.StatusOK)
			fmt.Fprintf(w, "Blob finalized: %s\n", pprint(statusReply))
			return
		} else if statusReply.Status == disperser_rpc.BlobStatus_FAILED {
			http.Error(w, "Blob failed", http.StatusInternalServerError)
			return
		}
		time.Sleep(5 * time.Second)
	}
}

// getBlobHandler handles GET requests to retrieve blob data by request ID.
func getBlobHandler(w http.ResponseWriter, r *http.Request) {
	requestID := r.URL.Query().Get("request_id")
	if requestID == "" {
		http.Error(w, "Missing request_id query parameter", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute*5)
	defer cancel()

	statusReply, err := client.GetBlobStatus(ctx, []byte(requestID))
	if err != nil || statusReply.Status != disperser_rpc.BlobStatus_CONFIRMED {
		http.Error(w, "Error retrieving blob or blob not confirmed", http.StatusInternalServerError)
		return
	}

	blobData, err := client.RetrieveBlob(ctx,
		statusReply.Info.BlobVerificationProof.BatchMetadata.BatchHeaderHash,
		statusReply.Info.BlobVerificationProof.BlobIndex,
	)
	if err != nil {
		http.Error(w, "Error retrieving blob data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"data": string(blobData),
	})
}

// pprint marshals a proto message to pretty JSON.
func pprint(m proto.Message) string {
	marshaler := protojson.MarshalOptions{
		Multiline: true,
		Indent:    "  ",
	}
	jsonBytes, err := marshaler.Marshal(m)
	if err != nil {
		panic("Failed to marshal proto to JSON")
	}
	return string(jsonBytes)
}

//f9c979e84c19929dcdfc0c4f7ba65dc3ab47276e6d910480ed2d84ccbd4b8a3d-313733303230393434343330383936373438332f302f33332f312f33332fe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855