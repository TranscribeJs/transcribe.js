const http = require("http");
const fs = require("fs");
const path = require("path");

const hostname = "localhost";
const port = 9876;

const server = http.createServer((req, res) => {
  // set header
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // return requested file, or 404 if not found
  const filePath = path.join(__dirname, req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("File not found");
    } else {
      res.statusCode = 200;

      const extname = path.extname(filePath);
      let contentType = "text/plain";

      switch (extname) {
        case ".html":
          contentType = "text/html";
          break;
        case ".css":
          contentType = "text/css";
          break;
        case ".js":
          contentType = "text/javascript";
          break;
        case ".mjs":
          contentType = "text/javascript";
          break;
        case ".json":
          contentType = "application/json";
          break;
        case ".wav":
          contentType = "audio/wav";
          break;
        case ".ogg":
          contentType = "audio/ogg";
          break;
        default:
          contentType = "application/octet-stream";
      }

      res.setHeader("Content-Type", contentType);
      res.end(data);
    }
  });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
