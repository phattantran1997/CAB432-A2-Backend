const blogRouter = require("express").Router();
const S3Service = require('../services/s3-service');
const { createBlog, getBlogById, getAllBlogs, deleteBlog, updateBlog, createBlogTable } = require("../services/blog-service");
const bucketName = 'n11486546-cab432-assignment';
const s3Service = new S3Service(bucketName);

blogRouter.get("/", async (req, res) => {
  try {
    const blogs = await getAllBlogs();
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve blogs" });
  }
});

// GET blog by ID
blogRouter.get("/:id", async (req, res) => {
  try {
    const blog = await getBlogById(req.params.id);
    if (blog) {
      res.json(blog);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve blog" });
  }
});

// POST create a new blog
blogRouter.post("/", async (req, res) => {
  const body = req.body;
  const blog = {
    id: Date.now().toString(), // unique ID for blog
    title: body.title,
    content: body.content,
    dateCreated: new Date().toISOString(),
    likes: body.likes || 0,
    comments: body.comments || [],
    videos: body.videos,
    userId: body.userId.sub
  };

  try {
    const createdBlog = await createBlog(blog);
    res.status(201).json(createdBlog);
  } catch (error) {
    res.status(500).json({ error: "Failed to create blog" });
  }
});

// DELETE blog by ID
blogRouter.delete("/:id", async (req, res) => {
  try {
    await deleteBlog(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete blog" });
  }
});

// PUT update blog by ID
blogRouter.put("/:id", async (req, res) => {
  const body = req.body;
  const blogUpdates = {
    title: body.title,
    content: body.content,
  };

  try {
    const updatedBlog = await updateBlog(req.params.id, blogUpdates);
    res.json(updatedBlog);
  } catch (error) {
    res.status(500).json({ error: "Failed to update blog" });
  }
});

blogRouter.get('/refresh-url/:user/:filename', async (req, res) => {
  const { user, filename } = req.params;
  try {
    const refreshedUrl = await s3Service.refreshPresignedUrl(user, filename);
    res.status(200).json({ refreshedUrl });
  } catch (error) {
    logger.error('Error refreshing presigned URL:', error);
    res.status(500).json({ error: 'Could not refresh presigned URL' });
  }
});

module.exports = blogRouter;
