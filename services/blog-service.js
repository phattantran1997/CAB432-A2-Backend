const { getCache, setCache, delCache } = require("./redis-service");
const logger = require("../utils/logger");

const {
  DynamoDBClient,
} = require("@aws-sdk/client-dynamodb");
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
const qutUsername ="n11486546@qut.edu.au";
const tableName = "n11486546-blogs";

// Create Blog
const createBlog = async (blog) => {
  const params = {
    TableName: tableName,
    Item: {
      "qut-username":qutUsername,
      id: blog.id, // Sort Key
      title: blog.title,
      content: blog.content,
      dateCreated: blog.dateCreated,
      likes: blog.likes,
      comments: blog.comments,
      videos: blog.videos,
      userId: blog.userId,
    },
  };

  await ddbDocClient.send(new PutCommand(params));

  // Invalidate the cache for the user
  await delCache(`blogs:${blog["qut-username"]}`);
  console.log("Cache invalidated after blog creation.");

  return blog;
};

// Get a blog by ID with caching
const getBlogById = async ( id) => {
  const cacheKey = `blog:${qutUsername}:${id}`;

  try {
    // First, check if the blog is in the cache
    const cachedBlog = await getCache(cacheKey);
    if (cachedBlog) {
      console.log("Returning cached blog by ID");
      return cachedBlog;
    }

    // If not in cache, query DynamoDB
    const params = {
      TableName: tableName,
      KeyConditionExpression: "#partitionKey = :username AND #sortKey = :id", // Query by partition key and sort key
      ExpressionAttributeNames: {
        "#partitionKey": "qut-username", // Partition key
        "#sortKey": "id", // Sort key
      },
      ExpressionAttributeValues: {
        ":username": qutUsername,
        ":id": id,
      },
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    const blog = result.Items && result.Items.length > 0 ? result.Items[0] : null;

    // Cache the blog
    await setCache(cacheKey, blog);
    return blog;
  } catch (error) {
    logger.error("Error fetching blog by ID:", error);
    throw new Error("Could not fetch blog by ID");
  }
};

// Get all blogs with caching
const getAllBlogs = async () => {
  const cacheKey = `blogs:${qutUsername}`;

  try {
    // First, check if the blogs are in the cache
    const cachedBlogs = await getCache(cacheKey);
    if (cachedBlogs) {
      console.log("Returning cached blogs");
      return cachedBlogs;
    }

    // If not in cache, query DynamoDB
    const params = {
      TableName: tableName,
      KeyConditionExpression: "#partitionKey = :username",
      ExpressionAttributeNames: {
        "#partitionKey": "qut-username",
      },
      ExpressionAttributeValues: {
        ":username": qutUsername,
      },
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    const blogs = result.Items;

    // Cache the blogs
    await setCache(cacheKey, blogs);

    console.log("Returning fresh blogs");
    return blogs;
  } catch (err) {
    logger.error("Error fetching blogs:", err);
    throw err;
  }
};

// Update a blog
const updateBlog = async (id, updateFields) => {
  const params = {
    TableName: tableName,
    Key: {
      "qut-username": qutUsername, // Partition key
      id: id, // Sort key
    },
    UpdateExpression: "set #title = :title, #content = :content",
    ExpressionAttributeNames: {
      "#title": "title",
      "#content": "content",
    },
    ExpressionAttributeValues: {
      ":title": updateFields.title,
      ":content": updateFields.content,
    },
    ReturnValues: "UPDATED_NEW",
  };

  try {
    const result = await ddbDocClient.send(new UpdateCommand(params));

    // Invalidate cache after updating the blog
    await delCache(`blog:${qutUsername}:${id}`);
    await delCache(`blogs:${qutUsername}`);
    console.log("Cache invalidated after blog update.");

    return result.Attributes;
  } catch (error) {
    logger.error("Error updating blog:", error);
    throw new Error("Could not update blog");
  }
};

// Delete a blog
const deleteBlog = async (id) => {
  const params = {
    TableName: tableName,
    Key: {
      "qut-username": qutUsername, // Partition key
      id: id, // Sort key
    },
  };

  try {
    await ddbDocClient.send(new DeleteCommand(params));

    // Invalidate cache after deletion
    await delCache(`blog:${qutUsername}:${id}`);
    await delCache(`blogs:${qutUsername}`);
    console.log(`Cache invalidated after blog deletion. Blog with ID ${id} deleted successfully.`);
  } catch (error) {
    logger.error(`Error deleting blog with ID ${id}:`, error);
    throw new Error("Could not delete blog");
  }
};


module.exports = {
  createBlog,
  getBlogById,
  getAllBlogs,
  deleteBlog,
  updateBlog,
};
