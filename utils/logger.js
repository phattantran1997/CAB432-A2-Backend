const winston = require('winston');
const path = require('path');
const { getParameter } = require('../services/ssm-service');
const fs = require('fs');

let logger;

// Function to fetch the logging path from AWS Parameter Store
const getLoggingPath = async () => {
  try {
    const loggingPath = await getParameter('logging_url');
    return loggingPath; // The logging path URL directly
  } catch (error) {
    console.error('Error fetching logging URL from Parameter Store:', error);
    throw new Error('Could not retrieve logging URL');
  }
};

// Helper function to get the current date in 'YYYY-MM-DD' format
const getCurrentDateFolder = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`; // Returns folder name in YYYY-MM-DD format
};

// Function to ensure the daily log folder exists
const ensureLogFolderExists = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

// Function to initialize the logger
const initLogger = async () => {
  try {
    const loggingBasePath = await getLoggingPath();
    const dailyLogFolder = getCurrentDateFolder();
    const logDirPath = path.join(loggingBasePath, dailyLogFolder); // Create a path like /logging_base/2024-09-26
    ensureLogFolderExists(logDirPath); // Ensure the directory exists

    const logFilePath = path.join(logDirPath, 'app.log');

    logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
      transports: [
        new winston.transports.File({ filename: logFilePath }), // Log to daily file
        new winston.transports.Console() // Also log to console
      ]
    });

    logger.info('Logger initialized. Logs will be stored at ' + logFilePath);
  } catch (error) {
    console.error('Error initializing logger:', error);
  }
};

// Synchronously initialize logger on module load
(async () => {
  await initLogger();
})();

// Function for logging info level logs
const info = (...params) => {
  if (logger) {
    logger.info(params.join(' '));
  } else {
    console.log(...params); // Fallback if logger is not initialized
  }
};

// Function for logging error level logs
const error = (...params) => {
  if (logger) {
    logger.error(params.join(' '));
  } else {
    console.error(...params); // Fallback if logger is not initialized
  }
};

// Export logger functions (initLogger is no longer needed to export separately)
module.exports = {
  info,
  error
};
