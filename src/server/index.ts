import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { Honcho } from "@honcho-ai/sdk";
import type { Message, User, Agent } from "../types.js";
import { createAPIRoutes } from "./api.js";
import { setupSocketIO } from "./socket.js";
import { displayStartupInfo, print } from "./utils.js";

// Initialize Honcho
const honcho = new Honcho({
  environment: "production",
  apiKey: process.env.HONCHO_API_KEY!,
  workspaceId: process.env.HONCHO_WORKSPACE_ID!,
});

const session = honcho.session(`groupchat-${Date.now()}`);
print(`honcho session: ${session.id}`, "cyan");

// Application state
const connectedUsers = new Map<string, User>();
const chatHistory: Message[] = [];
const agents = new Map<string, Agent>();

// Configuration
const PORT = parseInt(Bun.env.PORT || "3000");

// Create API routes
const app = createAPIRoutes(connectedUsers, agents, chatHistory, PORT);

// Create HTTP server
const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    const response = await app.fetch(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as any,
      })
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.end(body);
  } else {
    res.statusCode = 404;
    res.end("Not Found");
  }
});

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupSocketIO(io, connectedUsers, agents, chatHistory, honcho, session);

// Start server
print("starting LAN chat server...", "blue");
server.listen(PORT, () => {
  print(`server listening on port ${PORT}`, "green");
  displayStartupInfo(PORT);
});