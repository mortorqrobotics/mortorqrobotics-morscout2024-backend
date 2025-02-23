const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
const router = require("../routes")
const app = express();
const isDevelopment = process.env.NODE_ENV !== "production";

// Apply middleware first
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Then apply routes based on environment
if (isDevelopment) {
  app.use("/api", router);
} else {
  app.use("/.netlify/functions/api", router);
}

const PORT = process.env.PORT || 8000;

if (isDevelopment) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports.handler = serverless(app);
