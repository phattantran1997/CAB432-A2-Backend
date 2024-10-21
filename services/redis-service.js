// redis-service.js
const redis = require("redis");
const logger = require("../utils/logger");
const ssmService = require("./ssm-service");

let redisClient;

// Get Redis URL from AWS Parameter Store
const initializeRedis = async () => {
  try {
    const redisURL = `redis://${await ssmService.getParameter('RedisURL')}`;

    // Configure Redis client for cluster mode enabled
    redisClient = redis.createClient({
      url: redisURL,
      socket: {
        tls: false, // Enable TLS for secure connection if required by AWS ElastiCache
      },
    });
    redisClient.on('error', (err) => console.log('Redis Client Error', err));

    // Connect to the Redis server
    await redisClient.connect();
    console.log("Redis connected successfully");
  } catch (err) {
    logger.error("Failed to retrieve Redis URL from Parameter Store:", err);
  }
};

// Function to get a value from Redis
const getCache = async (key) => {
  try {
    const cachedData = await redisClient.get(key);
    return cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    logger.error(`Error getting data from Redis for key ${key}:`, error);
    throw error;
  }
};

// Function to set a value in Redis with expiration time
const setCache = async (key, value, expiration = 60) => {
  try {
    await redisClient.set(key, JSON.stringify(value), {
      EX: expiration,
    });
    console.log(`Data cached for key ${key}`);
  } catch (error) {
    logger.error(`Error setting data in Redis for key ${key}:`, error);
    throw error;
  }
};

// Function to delete a cache from Redis
const delCache = async (key) => {
  try {
    await redisClient.del(key);
    console.log(`Cache invalidated for key ${key}`);
  } catch (error) {
    logger.error(`Error deleting cache from Redis for key ${key}:`, error);
    throw error;
  }
};

module.exports = {
  getCache,
  setCache,
  delCache,
  initializeRedis,
};

initializeRedis();