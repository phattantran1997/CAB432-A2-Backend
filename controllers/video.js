const videoRouter = require("express").Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const S3Service = require('../services/s3-service');
const videoService = require('../services/videos-service');
const logger = require("../utils/logger");
const { setCache, delCache } = require("../services/redis-service");
const { sendMessageToQueue, receiveMessagesFromQueue, deleteMessageFromQueue } = require('../services/sqs-service'); // Import sendMessage function from SQS service
const { getParameter } = require('../services/ssm-service');

const bucketName = 'n11486546-cab432-assignment';

const s3Service = new S3Service(bucketName);
const runningProcesses = {};

// Fetch the logging URL from AWS SSM
let videosHandlingPath;
let loggingUrl;
(async () => {
  loggingUrl = await getParameter('logging_url');
  if (!loggingUrl) {
    logger.error('Failed to retrieve logging URL from Parameter Store. Using default directory.');
    loggingUrl = '/mnt/logging'; // You can set your fallback directory here
  }

  videosHandlingPath = path.join(loggingUrl, 'videos-handling');
  if (!fs.existsSync(videosHandlingPath)) {
    fs.mkdirSync(videosHandlingPath, { recursive: true });
    logger.info(`Created videos-handling directory at: ${videosHandlingPath}`);
  }
})();

// Set up multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(loggingUrl, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.originalname}`);
  }
});

const upload = multer({ storage });

const PROGRESS_CACHE_EXPIRATION = 600; // Cache expiration time in seconds (10 minutes)

const runTranscoding = (inputFilePath, outputFilePath, transcodingOption, transcodingJobId, userId) => {
  const [resolution, codec] = transcodingOption.split('-');
  const process = ffmpeg(inputFilePath)
    .output(outputFilePath)
    .videoCodec(codec)
    .size(resolution)
    .videoBitrate('10000k')
    .audioCodec('aac')
    .outputOptions(
      '-preset', 'slow',
      '-movflags', 'faststart',
      '-threads', '2',
      '-crf', '18',
      '-filter:v', `scale=${resolution}`
    )
    .on('start', (commandLine) => {
      logger.info('Spawned FFmpeg with command: ' + commandLine);
    })
    .on('progress', async (progress) => {
      logger.info(`Transcoding: ${progress.percent}% done`);
      progress.transcodingJobId = transcodingJobId;
      progress.transcodingOption = transcodingOption;
      progress.inputFilePath = inputFilePath;
      progress.outputFilePath = outputFilePath;
      progress.userId = userId;
      progress.status = 'in-progress';

      // Call the progress callback if defined
      if (global.ffmpegProgressCallback) {
        global.ffmpegProgressCallback(progress);
      }

      // Store progress in cache
      await setCache(`progress:${transcodingJobId}`, progress, PROGRESS_CACHE_EXPIRATION);
    })
    .on('end', async () => {
      logger.info('Transcoding succeeded!');
      if (global.ffmpegProgressCallback) {
        global.ffmpegProgressCallback({ percent: 100, done: true });
      }

      await s3Service.uploadVideoToS3(userId, transcodingJobId + '.mp4');

      // Update cache to indicate that the job is completed
      await setCache(`progress:${transcodingJobId}`, { userId: userId, transcodingOption: transcodingOption, status: 'completed', percent: 100 });

      // Remove reference to the completed process
      delete runningProcesses[transcodingJobId];
    })
    .on('error', async (err) => {
      logger.error('Error during transcoding:', err);
      if (global.ffmpegProgressCallback) {
        global.ffmpegProgressCallback({ error: err.message });
      }

      // Update cache to indicate an error occurred
      await setCache(`progress:${transcodingJobId}`, { status: 'failed', error: err.message });

      // Remove reference to the failed process
      delete runningProcesses[transcodingJobId];
    });

  // Store reference to the running process
  runningProcesses[transcodingJobId] = process;

  return process;
};

const handleProgressUpdates = (res, transcodingJobId) => {
  global.ffmpegProgressCallback = async (progress) => {
    await setCache(`progress:${transcodingJobId}`, progress);
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  // Handle client disconnection
  res.on('close', () => {
    res.end();
  });
};

videoRouter.post('/transcoding', upload.single('video'), async (req, res) => {
  try {
    const inputFilePath = req.file.path;
    const transcodingOption = req.body.transcodingOption;
    const userId = req.body.userId;
    const [resolution, codec] = transcodingOption.split('-');

    // Unique job ID for progress tracking
    const transcodingJobId = `${Date.now()}`;
    const outputFilePath = path.join(videosHandlingPath, `${transcodingJobId}.${codec === 'libvpx' ? 'webm' : 'mp4'}`);

    // Check if there's already an active transcoding process for this job
    if (!transcodingJobId) {
      return res.status(400).json({ message: 'Transcoding job ID is required' });
    }
    res.status(200).json({ message: 'Transcoding started', transcodingJobId });

    // Start transcoding and send progress
    const transcodingProcess = runTranscoding(inputFilePath, outputFilePath, transcodingOption, transcodingJobId, userId);
    transcodingProcess.run();
  } catch (err) {
    logger.error('Error handling video upload:', err);
    res.status(500).json({ message: 'Error processing request', error: err.message });
  }
});

videoRouter.delete('/cancel-transcoding', async (req, res) => {
  try {
    const { transcodingJobId } = req.body;

    if (!transcodingJobId) {
      return res.status(400).json({ message: 'Transcoding job ID is required' });
    }

    // Check if there is an active transcoding process
    if (runningProcesses[transcodingJobId]) {
      runningProcesses[transcodingJobId].kill('SIGKILL'); // Kill the FFmpeg process
      delete runningProcesses[transcodingJobId]; // Remove reference to the process
    }
    // Delete cache for the transcoding job
    await delCache(`progress:${transcodingJobId}`);

    const videoFilePath = path.join(videosHandlingPath, transcodingJobId + '.mp4');
    if (fs.existsSync(videoFilePath)) {
      fs.unlinkSync(videoFilePath);
    }
    logger.info(`Transcoding job ${transcodingJobId} has been canceled and cache cleared`);

    res.status(200).json({ message: `Transcoding job ${transcodingJobId} canceled successfully` });
  } catch (err) {
    logger.error('Error canceling transcoding job:', err);
    res.status(500).json({ message: 'Error canceling transcoding job', error: err.message });
  }
});

videoRouter.get('/progress', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const transcodingJobId = req.query.jobId;

  // Handle progress updates
  global.ffmpegProgressCallback = async (progress) => {
    await setCache(`progress:${transcodingJobId}`, progress);
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  // Handle client disconnection
  res.on('close', () => {
    res.end();
  });
});

videoRouter.get('/health-check', (req, res) => {
  res.status(200).send('Server is alive');
});

videoRouter.delete('/:fileName', async (req, res) => {
  const { fileName } = req.params;
  const videoFilePath = path.join(videosHandlingPath, fileName);

  try {
    // Check if file exists before attempting to delete
    if (fs.existsSync(videoFilePath)) {
      fs.unlinkSync(videoFilePath);
      await delCache(`progress:${fileName.split('.')[0]}`);
      res.status(200).send('Delete done!');
    } else {
      res.status(404).json({ message: 'File not found' });
    }
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ message: 'Failed to delete file', error: error.message });
  }
});

videoRouter.get('/refresh-url/:user/:filename', async (req, res) => {
  const { user, filename } = req.params;
  try {
    const refreshedUrl = await s3Service.refreshPresignedUrl(user, filename);
    res.status(200).json({ refreshedUrl });
  } catch (error) {
    logger.error('Error refreshing presigned URL:', error);
    res.status(500).json({ error: 'Could not refresh presigned URL' });
  }
});

videoRouter.post('/upload/temp', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // Temporary store the uploaded file in `videos-handling` folder
    const tempFilePath = path.join(videosHandlingPath, file.originalname);
    logger.info(`Saving file to: ${tempFilePath}`);

    // Move the uploaded file to the handling folder
    fs.renameSync(file.path, tempFilePath);

    // Send success response
    res.status(200).json({ message: 'File uploaded temporarily', fileName: file.originalname });
  } catch (error) {
    logger.error('Error storing file temporarily:', error);
    res.status(500).json({ message: 'Failed to store file temporarily', error: error.message });
  }
});

videoRouter.post('/upload/s3', async (req, res) => {
  const userId = req.body.userId;
  const fileName = req.body.fileName;

  if (!fileName) {
    return res.status(400).json({ message: 'No file specified for upload to S3' });
  }

  try {
    const videoMetadata = await s3Service.uploadVideoToS3(userId, fileName);
    res.status(200).json({ message: 'File uploaded successfully to S3', videoId: videoMetadata.videoId, presignedUrl: videoMetadata.s3Url });
  } catch (error) {
    logger.error('Error uploading file to S3:', error);
    res.status(500).json({ message: 'Failed to upload file to S3', error: error.message });
  }
});

videoRouter.get('/presigned-url/:userId/:filename', async (req, res) => {
  const { userId, filename } = req.params;

  try {
    const presignedUrl = await s3Service.generateDownloadPresignedUrl(userId, filename);
    res.status(200).json({ presignedUrl });
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Error generating presigned URL' });
  }
});

module.exports = videoRouter;
