import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const testS3Upload = async () => {
  const s3Client = new S3Client({
    region: "eu-central-1", // Replace with your AWS region
    credentials: {
      accessKeyId: "AKIAXYKJVRSOEPUJYUGH", // Replace with your AWS Access Key ID
      secretAccessKey: "KASAVV5q7n/WEty05M+t38gf1EqEoyIQC2L0Hcbn", // Replace with your AWS Secret Access Key
    },
  });

  const file = new Blob(["Hello, world!"], { type: "text/plain" }); // Test file
  const arrayBuffer = await file.arrayBuffer(); // Convert Blob to ArrayBuffer
  const buffer = Buffer.from(arrayBuffer); // Convert ArrayBuffer to Buffer

  const putObjectParams = {
    Bucket: "game-builds-remangu", // Replace with your S3 bucket name
    Key: "test-file.txt", // Replace with the desired file key
    Body: buffer, // Use the Buffer instead of the Blob
    ContentType: "text/plain",
  };

  try {
    const command = new PutObjectCommand(putObjectParams);
    const response = await s3Client.send(command);
    console.log("S3 Upload Response:", response);
  } catch (error) {
    console.error("Error uploading to S3:", error);
  }
};

// Run the test function
testS3Upload();