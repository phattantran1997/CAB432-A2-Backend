const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { fromIni } = require('@aws-sdk/credential-providers');
const fs = require('fs');
const axios = require('axios');
const logger = require("../utils/logger");
const path = require('path');
const videoService = require('./videos-service');
const { getParameter } = require('../services/ssm-service');

class S3Service {
  constructor(bucketName) {
    this.bucketName = bucketName;
    this.s3 = new S3Client({
      region: 'ap-southeast-2',
      credentials: fromIni({ profile: '901444280953_CAB432-STUDENT' }),
    });
     (async () => {
      this.loggingUrl = await getParameter('logging_url');
      if (!this.loggingUrl) {
        logger.error('Failed to retrieve logging URL from Parameter Store. Using default directory.');
      }
    })();
    
  }

  async generateUploadPresignedUrl(user, key, expiresIn = 3600) {
    try {
      // Prepend the user's folder to the key
      const userSpecificKey = `${user}/${key}`;
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: userSpecificKey,
      });
      const presignedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      console.log(presignedUrl);
      return presignedUrl;
    } catch (error) {
      logger.error(error);
      throw new Error(error);
    }
  }

  // Generate a pre-signed URL for downloading a video from S3, using user-specific folder
  async generateDownloadPresignedUrl(user, key, expiresIn = 3600) {
    try {
      // Prepend the user's folder to the key
      const userSpecificKey = `${user}/${key}`;
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: userSpecificKey,
      });
      return getSignedUrl(this.s3, command, { expiresIn });
    } catch (error) {
      logger.error('Error generating download URL:', error);
      throw new Error(error);
    }
  }

  // Upload a file to S3 using the pre-signed URL
  async uploadToS3UsingPresignedUrl(filePath, presignedUrl) {
    const fileStream = fs.createReadStream(filePath);

    try {
      const response = await axios.put(presignedUrl, fileStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': fs.statSync(filePath).size  // Set the correct file size
        },
      });
      if (response.status === 200) {
        console.log('File uploaded successfully');
      } else {
        logger.error('File upload failed', response.status);
      }
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  async uploadVideoToS3(user, filename) {
    try {
      const videoFolderPath = path.join(this.loggingUrl, 'videos-handling');
      const videoFilePath = path.join(videoFolderPath, filename);
      if (!fs.existsSync(videoFilePath)) {
        logger.error('File not found in temporary folder');
        return;
      }
      if (fs.lstatSync(videoFilePath).isFile()) {
        let uploadSuccess = false;
        let retryAttempts = 3;

        while (!uploadSuccess && retryAttempts > 0) {
          try {
            const presignedUrl = await this.generateUploadPresignedUrl(user, filename);
            await this.uploadToS3UsingPresignedUrl(videoFilePath, presignedUrl);

            console.log(`${filename} uploaded successfully!`);
            uploadSuccess = true; // Mark upload as successful if no errors occurred
          } catch (uploadError) {
            retryAttempts--;
            logger.error(`Failed to upload ${filename}. Retrying... (${retryAttempts} attempts left)`, uploadError);
            if (retryAttempts === 0) {
              throw new Error(`Failed to upload ${filename} after multiple attempts.`);
            }
          }
        }

        if (uploadSuccess) {
          const s3PresignedUrl = await this.generateDownloadPresignedUrl(user, filename); // Generate download URL

          const videoMetadata = {
            filename: filename,
            extension: path.extname(filename),
            s3Url: s3PresignedUrl,
            dateCreated: new Date().toISOString(),
            userId: user,
          };

          const savedMetadata = await videoService.createVideoMetadata(videoMetadata);
          logger.info(`Metadata for ${filename} saved to DynamoDB.`);

          // Delete the video after successful upload
          fs.unlinkSync(videoFilePath);
          console.log(`${filename} deleted from local storage.`);

          return savedMetadata;

        }
      }
    } catch (error) {
      logger.error('Error uploading video:', error);
      throw new Error('Failed to upload video');
    }
  }

  
  async refreshPresignedUrl(user, key, expiresIn = 3600) {
    try {
      // Prepend the user's folder to the key
      const userSpecificKey = `${user}/${key}`;
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: userSpecificKey,
      });
      const newPresignedUrl = await getSignedUrl(this.s3, command, { expiresIn });

      console.log('New presigned URL generated:', newPresignedUrl);
      return newPresignedUrl;
    } catch (error) {
      logger.error('Error refreshing presigned URL:', error);
      throw new Error('Could not refresh presigned URL');
    }
  }
}

module.exports = S3Service;
