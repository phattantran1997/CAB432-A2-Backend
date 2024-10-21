const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand, // Import ScanCommand for scanning if needed
} = require("@aws-sdk/lib-dynamodb");
const { fromIni } = require("@aws-sdk/credential-providers");
const ddbClient = new DynamoDBClient({
  region: "ap-southeast-2",
  credentials: fromIni({ profile: "901444280953_CAB432-STUDENT" }),
});
const s3Service = require('./s3-service');
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = "n11486546-videos-metadata";
const qutUsername ="n11486546@qut.edu.au";

// Create Video Metadata
const createVideoMetadata = async (video) => {
  const videoId = `${Date.now()}`; // Generate a unique videoId based on timestamp
  const params = {
    TableName: tableName,
    Item: {
      "qut-username": qutUsername, // Partition Key
      videoId: videoId, // Unique sort key based on timestamp
      filename: video.filename, // Filename
      extension: video.extension, // File extension
      userId: video.userId, // User ID
      title: video.title || video.filename, // Video Title, fallback to filename if title is not provided
      s3Url: video.s3Url, // Presigned S3 URL for video access
      dateCreated: video.dateCreated, // Date Created
    },
  };

  await ddbDocClient.send(new PutCommand(params));
  console.log("Video metadata created successfully:", params.Item);

  return { ...video, videoId }; // Return the video object along with its generated videoId
};

// Query Video Metadata by videoId
const getVideoMetadataById = async (videoId) => {
   const params = {
    TableName: tableName,
    KeyConditionExpression: "#partitionKey = :username AND #sortKey = :videoId", // Query by partition key and sort key
    ExpressionAttributeNames: {
      "#partitionKey": "qut-username", // Partition key
      "#sortKey": "videoId", // Sort key
    },
    ExpressionAttributeValues: {
      ":username": qutUsername,
      ":videoId": videoId,
    },
  };
  try {
    const result = await ddbDocClient.send(new QueryCommand(params));
    const video = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    if(await s3Service.checkPresignedUrlValidity(video.s3Url)){

    }
    return video;
  } catch (error) {
    console.error("Error fetching video metadata:", error);
    throw new Error("Failed to fetch video metadata");
  }
};

// Alternatively, use ScanCommand to scan by videoId
const scanVideoMetadataById = async (videoId) => {
  const params = {
    TableName: tableName,
    FilterExpression: "videoId = :videoId",
    ExpressionAttributeValues: {
      ":videoId": videoId,
    },
  };

  try {
    const data = await ddbDocClient.send(new ScanCommand(params));
    if (data.Items.length > 0) {
      console.log("Video metadata fetched successfully:", data.Items[0]);
      return data.Items[0];
    } else {
      console.log("No video found with the provided videoId.");
      return null;
    }
  } catch (error) {
    console.error("Error scanning video metadata:", error);
    throw new Error("Failed to scan video metadata");
  }
};

module.exports = {
  createVideoMetadata,
  getVideoMetadataById,
  scanVideoMetadataById, // Export the new scan function
};
