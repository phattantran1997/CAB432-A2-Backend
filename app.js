const config = require("./utils/config");
const express = require("express");
const app = express();
const cors = require("cors");
require("express-async-errors");
const blogRouter = require("./controllers/blogs");
const usersRouter = require("./controllers/users");
const loginRouter = require("./controllers/login");
const youtubeRouter = require("./controllers/youtube");
const videoRouter = require("./controllers/video");
const ssmRouter = require("./controllers/ssm");
const path = require("path");
const middleware = require("./utils/middleware");
const logger = require("./utils/logger");

// Update CORS to allow requests only from your frontend domain
const corsOptions = {
  origin: [  "https://frontend.n11486546.cab432.com",   "http://localhost:5173"], 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Specify the allowed HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Specify the allowed headers
  credentials: true, // Include credentials if necessary
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Allow preflight requests for all routes
app.use(express.static('public'));
app.use(express.json());
app.use(middleware.requestLogger);

// app.use(middleware.tokenExtractor); // Add token extraction middleware globally

app.use("/api/login", loginRouter);
app.use("/api/ssm", ssmRouter);
app.use("/api/blogs", middleware.tokenExtractor, blogRouter);
app.use("/api/users", usersRouter);
app.use("/api/youtube", youtubeRouter);
app.use("/api/video", videoRouter);

app.get("/*", function (req, res) {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.use(middleware.unknownEndpoint);
app.use(middleware.errorHandler);

module.exports = app;
