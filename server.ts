import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // Proxy route for fetching video URLs
  app.get("/api/proxy-video", async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
      const response = await fetch(videoUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.bilibili.com",
          "Origin": "https://www.bilibili.com"
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch video: ${response.statusText}` });
      }

      // Forward headers
      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      
      const contentLength = response.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      // Stream the response back to the client
      if (response.body) {
        // @ts-ignore
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to proxy video" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
