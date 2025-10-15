import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { Honcho } from "@honcho-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Message, User, Agent } from "../types.js";
import { MessageType } from "../types.js";
import { createAPIRoutes } from "./api.js";
import { setupSocketIO } from "./socket.js";
import { displayStartupInfo, print } from "./utils.js";

// Parse command line arguments
const args = process.argv.slice(2);
const sessionFlag = args.findIndex((arg) => arg === "--session");
const providedSessionId =
  sessionFlag !== -1 && sessionFlag + 1 < args.length
    ? args[sessionFlag + 1]
    : null;

async function startServer() {
  // Initialize Honcho
  const honcho = new Honcho({
    baseURL: process.env.HONCHO_BASE_URL || "http://localhost:8000",
    workspaceId: process.env.HONCHO_WORKSPACE_ID || "default",
  });

  // Create or use existing session
  const sessionId = providedSessionId || `groupchat-${Date.now()}`;
  const session = await honcho.session(sessionId);
  print(`honcho session: ${session.id}`, "cyan");

  // Application state
  const connectedUsers = new Map<string, User>();
  const chatHistory: Message[] = [];
  const agents = new Map<string, Agent>();

  // Load existing messages if using provided session
  if (providedSessionId) {
    print("loading existing messages from session...", "yellow");
    try {
      const existingMessagesPage = await session.getMessages();
      const existingMessages = existingMessagesPage.items;

      for (const msg of existingMessages) {
        const message: Message = {
          id: msg.id,
          type: MessageType.CHAT,
          username: msg.peer_id || "unknown",
          content: msg.content,
          metadata: {
            timestamp: msg.created_at || new Date().toISOString(),
            loadedFromSession: true,
          },
        };
        chatHistory.push(message);
      }

      print(`loaded ${existingMessages.length} messages from session`, "green");
    } catch (error) {
      print(`error loading messages from session: ${error}`, "red");
    }
  }

  // Configuration
  const PORT = parseInt(Bun.env.PORT || "3000");

  // Create API routes
  const app = createAPIRoutes(connectedUsers, agents, chatHistory, PORT, honcho);

  // Create HTTP server
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/api/")) {
      // Read request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);

      const response = await app.fetch(
        new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers as any,
          body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
        }),
      );

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const body = await response.text();
      res.end(body);
    } else {
      // Serve static files from public directory
      const publicDir = join(process.cwd(), "public");
      let filePath = join(publicDir, req.url === "/" ? "index.html" : req.url || "");

      // Security: prevent directory traversal
      if (!filePath.startsWith(publicDir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      if (existsSync(filePath)) {
        const ext = filePath.split(".").pop();
        const contentTypes: Record<string, string> = {
          html: "text/html",
          css: "text/css",
          js: "application/javascript",
          json: "application/json",
          png: "image/png",
          jpg: "image/jpeg",
          svg: "image/svg+xml",
        };

        res.setHeader("Content-Type", contentTypes[ext || "html"] || "text/plain");
        res.end(readFileSync(filePath));
      } else {
        res.statusCode = 404;
        res.end("Not Found");
      }
    }
  });

  // Setup Socket.IO with longer timeouts for agents making Honcho API calls
  const allowedOrigins = [
    "https://lanchat.ibansadowski.com",
    "http://localhost:5173", // Local development
    "http://localhost:4173", // Local preview
  ];

  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 30000,
    pingTimeout: 120000,
    transports: ["websocket", "polling"],
    connectTimeout: 60000,
    upgradeTimeout: 30000,
  });

  setupSocketIO(io, connectedUsers, agents, chatHistory, honcho, session);

  // Start server with error handling
  print("starting LAN chat server...", "blue");

  return new Promise<void>((resolve, reject) => {
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        print(`Port ${PORT} is already in use. Please stop any conflicting processes or use a different port.`, "red");
        print(`To find what's using the port, run: lsof -i :${PORT}`, "yellow");
        process.exit(1);
      } else if (error.code === 'EACCES') {
        print(`Permission denied to bind to port ${PORT}. Try using a port above 1024 or run with elevated privileges.`, "red");
        process.exit(1);
      } else {
        print(`Server error: ${error.message}`, "red");
        reject(error);
      }
    });

    server.listen(PORT, () => {
      print(`server listening on port ${PORT}`, "green");
      displayStartupInfo(PORT);
      resolve();
    });
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

