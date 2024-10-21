const { getCache, setCache, delCache } = require("./redis-service");
const logger = require("../utils/logger");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { fromIni } = require("@aws-sdk/credential-providers");

const ddbClient = new DynamoDBClient({
  region: "ap-southeast-2",
  credentials: fromIni({ profile: "901444280953_CAB432-STUDENT" }),
});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

const tableName = "n11486546-users";

// Create User Metadata
const createUserMetadata = async (user) => {
  const params = {
    TableName: tableName,
    Item: {
      userId: user.userId, // Partition Key
      username: user.username,
      email: user.email,
      dateCreated: user.dateCreated,
      lastLogin: user.lastLogin,
      profilePicture: user.profilePicture,
    },
  };

  await ddbDocClient.send(new PutCommand(params));

  // Invalidate the cache for the user
  await delCache(`user:${user.userId}`);
  console.log("Cache invalidated after user metadata creation.");

  return user;
};

// Get User Metadata by ID with caching
const getUserById = async (userId) => {
  const cacheKey = `user:${userId}`;

  try {
    // First, check if the user metadata is in the cache
    const cachedUser = await getCache(cacheKey);
    if (cachedUser) {
      console.log("Returning cached user by ID");
      return cachedUser;
    }

    // If not in cache, query DynamoDB
    const params = {
      TableName: tableName,
      KeyConditionExpression: "#partitionKey = :userId",
      ExpressionAttributeNames: {
        "#partitionKey": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    const user = result.Items && result.Items.length > 0 ? result.Items[0] : null;

    // Cache the user metadata
    await setCache(cacheKey, user);

    console.log("Returning fresh user by ID");
    return user;
  } catch (error) {
    logger.error("Error fetching user by ID:", error);
    throw new Error("Could not fetch user by ID");
  }
};

// Get All Users with caching (not recommended for large tables)
const getAllUsers = async () => {
  const cacheKey = `users:all`;

  try {
    // First, check if the users are in the cache
    const cachedUsers = await getCache(cacheKey);
    if (cachedUsers) {
      console.log("Returning cached users");
      return cachedUsers;
    }

    // If not in cache, query DynamoDB for all users
    const params = {
      TableName: tableName,
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    const users = result.Items;

    // Cache the users
    await setCache(cacheKey, users);

    console.log("Returning fresh users");
    return users;
  } catch (err) {
    logger.error("Error fetching users:", err);
    throw err;
  }
};

// Update User Metadata
const updateUser = async (userId, updateFields) => {
  const params = {
    TableName: tableName,
    Key: {
      userId: userId, // Partition key
    },
    UpdateExpression: "set #username = :username, #email = :email, #lastLogin = :lastLogin, #profilePicture = :profilePicture",
    ExpressionAttributeNames: {
      "#username": "username",
      "#email": "email",
      "#lastLogin": "lastLogin",
      "#profilePicture": "profilePicture",
    },
    ExpressionAttributeValues: {
      ":username": updateFields.username,
      ":email": updateFields.email,
      ":lastLogin": updateFields.lastLogin,
      ":profilePicture": updateFields.profilePicture,
    },
    ReturnValues: "UPDATED_NEW",
  };

  try {
    const result = await ddbDocClient.send(new UpdateCommand(params));

    // Invalidate cache after updating the user metadata
    await delCache(`user:${userId}`);
    console.log("Cache invalidated after user update.");

    return result.Attributes;
  } catch (error) {
    logger.error("Error updating user:", error);
    throw new Error("Could not update user");
  }
};

// Delete User Metadata
const deleteUser = async (userId) => {
  const params = {
    TableName: tableName,
    Key: {
      userId: userId, // Partition key
    },
  };

  try {
    await ddbDocClient.send(new DeleteCommand(params));

    // Invalidate cache after deletion
    await delCache(`user:${userId}`);
    console.log(`Cache invalidated after user deletion. User with ID ${userId} deleted successfully.`);
  } catch (error) {
    logger.error(`Error deleting user with ID ${userId}:`, error);
    throw new Error("Could not delete user");
  }
};

module.exports = {
  createUserMetadata,
  getUserById,
  getAllUsers,
  deleteUser,
  updateUser,
};
