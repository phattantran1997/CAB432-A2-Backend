const youtubeRouter = require("express").Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const ytdl = require("@distube/ytdl-core"); 
const axios = require('axios');
const S3Service = require('../services/s3-service');
const logger = require('../utils/logger');
const { getParameter, getYouTubeApiKeyFromSM } = require('../services/ssm-service');

// Initialize S3 Service
const bucketName = 'n11486546-cab432-assignment';
const s3Service = new S3Service(bucketName);

// Fetch the logging URL from AWS SSM
let loggingUrl;
(async () => {
  loggingUrl = await getParameter('logging_url');
  if (!loggingUrl) {
    logger.error('Failed to retrieve logging URL from Parameter Store. Using default directory.');
  }
})();

// Route to fetch video details from YouTube using YouTube Data API
youtubeRouter.get('/video-details/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  const apiKey = await getYouTubeApiKeyFromSM();

  try {
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching video details from YouTube:', error);
    res.status(500).json({ error: 'Failed to fetch video details from YouTube' });
  }
});

// Route to download a YouTube video, trim it into chapters, generate thumbnails, and upload to S3
youtubeRouter.post('/trim-video', async (req, res) => {
  const { user, videoId, chapters } = req.body;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Use loggingUrl to define the folders
  const outputFolder = path.join(loggingUrl, 'videos-handling');
  const uploadFolder = path.join(loggingUrl, 'uploads');

  // Ensure the directories exist
  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);
  if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder);

  const videoIdList = []; // To keep track of uploaded video IDs

  try {
    const videoFile = path.join(uploadFolder, `${videoId}.mp4`);

    // Download video from YouTube using ytdl-core
    const downloadStream = ytdl(videoUrl, { filter: 'audioandvideo', format: 'mp4' });
    const writeStream = fs.createWriteStream(videoFile);

    // Pipe the download stream to the file
    downloadStream.pipe(writeStream);

    // Wait for the download to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log('Video downloaded successfully as MP4.');
        resolve();
      });

      downloadStream.on('error', (err) => {
        console.error('Error downloading video:', err);
        reject(err);
      });

      writeStream.on('error', (err) => {
        console.error('Error writing video to file:', err);
        reject(err);
      });
    });

    const getVideoDuration = () => {
      return new Promise((resolve, reject) => {
        // Wrap the video file path in double quotes to handle spaces in the path
        exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoFile}"`, (err, stdout) => {
          if (err) {
            return reject(err);
          }
          resolve(parseFloat(stdout.trim()));
        });
      });
    };
    
    const videoDuration = await getVideoDuration();
    console.log(`Video duration: ${videoDuration} seconds`);

    // Process each chapter
    const trimmingPromises = chapters.map((chapter, index) => {
      return new Promise(async (resolve, reject) => {
        const sanitizedTitle = chapter.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
        const fileName = `${videoId}_${sanitizedTitle}.mp4`;
        const outputFileName = path.join(outputFolder, fileName);
        const startTime = chapter.timestamp;
        const endTime = chapters[index + 1] ? chapters[index + 1].timestamp : videoDuration;

        // Trim video into chapters
        const command = `ffmpeg -i "${videoFile}" -ss ${startTime} -to ${endTime} -c copy "${outputFileName}"`;
        exec(command, async (err) => {
          if (err) {
            console.error(`Error trimming ${chapter.title}:`, err);
            return reject(err);
          }

          console.log(`Chapter ${index + 1} saved as ${outputFileName}`);

          // After trimming, upload the trimmed video to S3
          try {
            const videoMetadata = await s3Service.uploadVideoToS3(user, fileName);
            videoIdList.push(videoMetadata); // Store the videoId after upload
            console.log(`Uploaded ${fileName} to S3 successfully.`);
            resolve(); // Resolve only after the file has been uploaded
          } catch (uploadError) {
            logger.error(`Failed to upload trimmed video ${fileName} to S3:`, uploadError);
            reject(uploadError);
          }
        });
      });
    });

    // Wait for all trimming and uploading to finish
    await Promise.all(trimmingPromises);
    res.status(200).json({ message: 'Video trimming and upload to S3 completed.', videoIdList });

  } catch (err) {
    console.error('Error processing video:', err);
    res.status(500).send('Error processing video');
  }
});

module.exports = youtubeRouter;
