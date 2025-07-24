import { Hono } from "hono";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import os from "node:os";
import { Honcho } from "@honcho-ai/sdk";

const honcho = new Honcho({
  environment: "production",
  apiKey: process.env.HONCHO_API_KEY!,
  workspaceId: process.env.HONCHO_WORKSPACE_ID!,
});

const session = honcho.session(`groupchat-${Date.now()}`);
console.log("🎯 Honcho session created:", session.id);

// Types
interface User {
  id: string;
  username: string;
  type: "human";
  socket?: any;
}

interface Agent {
  id: string;
  username: string;
  type: "agent";
  capabilities: string[];
  socket: any;
}

interface Message {
  id: string;
  type: MessageType;
  username: string;
  content: string;
  metadata: {
    timestamp: string;
    [key: string]: any;
  };
}

interface NetworkInterface {
  interface: string;
  address: string;
  primary: boolean;
}

// Message types
enum MessageType {
  CHAT = "chat",
  AGENT_DATA = "agent_data",
  SYSTEM = "system",
  JOIN = "join",
  LEAVE = "leave",
  AGENT_RESPONSE = "agent_response",
}

// Store active connections and chat history
const connectedUsers = new Map<string, User>();
const chatHistory: Message[] = [];
const agents = new Map<string, Agent>();

// Create Hono app for API routes
const app = new Hono();

// API Routes
app.get("/api/stats", (c) => {
  return c.json({
    connectedUsers: connectedUsers.size,
    connectedAgents: agents.size,
    totalMessages: chatHistory.length,
    uptime: process.uptime(),
  });
});

app.get("/api/history", (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  return c.json({
    messages: chatHistory.slice(-limit),
  });
});

app.get("/api/network", (c) => {
  return c.json({
    interfaces: getLocalIPs(),
    ports: {
      socketio: PORT,
    },
  });
});

// Create HTTP server that handles both Hono routes and Socket.io
const server = createServer(async (req, res) => {
  // Handle API routes with Hono
  if (req.url?.startsWith("/api/")) {
    const response = await app.fetch(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as any,
      }),
    );

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = await response.text();
    res.end(body);
  } else {
    // Handle other routes (could serve static files here)
    res.statusCode = 404;
    res.end("Not Found");
  }
});

// Attach Socket.io to the same server
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("New Socket.io connection:", socket.id);

  socket.on(
    "register",
    async (data: { username: string; type?: string; capabilities?: string[] }) => {
      const { username, type = "human" } = data;

      if (type === "agent") {
        const agent: Agent = {
          id: socket.id,
          username,
          type: "agent",
          capabilities: data.capabilities || [],
          socket,
        };
        agents.set(socket.id, agent);
        // add agent to honcho session
        const agent_peer = honcho.peer(username, { config: { observe_me: true, observe_others: true } });
        await session.addPeers([agent_peer]);
        console.log(`Agent registered: ${username}`);
      } else {
        const user: User = {
          id: socket.id,
          username,
          type: "human",
          socket,
        };
        connectedUsers.set(socket.id, user);
        // add user to honcho session
        const user_peer = honcho.peer(username, { config: { observe_me: true, observe_others: true } });
        await session.addPeers([user_peer]);
        console.log(`User registered: ${username}`);
      }

      // Send recent chat history
      socket.emit("history", chatHistory.slice(-50));

      // Notify others
      const joinMessage = createMessage({
        type: MessageType.JOIN,
        username: "System",
        content: `${username} (${type}) joined the chat`,
        metadata: {
          joinedUser: username,
          userType: type,
        },
      });

      socket.broadcast.emit("message", joinMessage);
      addToHistory(joinMessage);
    },
  );

  socket.on("chat", async (data: { content: string; metadata?: any }) => {
    const user = connectedUsers.get(socket.id) || agents.get(socket.id);
    if (!user) return;

    const message = createMessage({
      type: MessageType.CHAT,
      username: user.username,
      content: data.content,
      metadata: {
        userId: socket.id,
        userType: user.type,
        timestamp: new Date().toISOString(),
        ...data.metadata,
      },
    });

    await broadcastMessage(message);
    addToHistory(message);
    notifyAgents(message, "chat_message");
  });

  socket.on("agent_data", async (data: any) => {
    const agent = agents.get(socket.id);
    if (!agent) return;

    const message = createMessage({
      type: MessageType.AGENT_DATA,
      username: agent.username,
      content: data.content || "",
      metadata: {
        agentId: socket.id,
        dataType: data.dataType,
        processedData: data.processedData,
        timestamp: new Date().toISOString(),
        ...data.metadata,
      },
    });

    if (data.broadcast) {
      await broadcastMessage(message);
      addToHistory(message);
    } else if (data.targets) {
      data.targets.forEach((targetId: string) => {
        const targetSocket =
          connectedUsers.get(targetId) || agents.get(targetId);
        if (targetSocket?.socket) {
          targetSocket.socket.emit("message", message);
        }
      });
    }

    notifyAgents(message, "agent_data", [socket.id]);
  });

  socket.on("agent_response", async (data: any) => {
    const agent = agents.get(socket.id);
    if (!agent) return;

    const message = createMessage({
      type: MessageType.AGENT_RESPONSE,
      username: agent.username,
      content: data.response,
      metadata: {
        agentId: socket.id,
        responseType: data.responseType || "general",
        confidence: data.confidence,
        referencedMessage: data.referencedMessage,
        timestamp: new Date().toISOString(),
      },
    });

    await broadcastMessage(message);
    addToHistory(message);
  });

  socket.on("disconnect", async () => {
    const user = connectedUsers.get(socket.id) || agents.get(socket.id);
    if (user) {
      const leaveMessage = createMessage({
        type: MessageType.LEAVE,
        username: "System",
        content: `${user.username} (${user.type}) left the chat`,
        metadata: {
          leftUser: user.username,
          userType: user.type,
        },
      });

      socket.broadcast.emit("message", leaveMessage);
      addToHistory(leaveMessage);

      connectedUsers.delete(socket.id);
      agents.delete(socket.id);
      // remove user/agent from honcho session
      const peer = honcho.peer(user.username);
      await session.removePeers([peer]);
      console.log(`${user.type} disconnected:`, user.username);
    }
  });

  // API endpoints for agents
  socket.on("get_history", (data: any, callback: Function) => {
    const agent = agents.get(socket.id);
    if (!agent) return callback({ error: "Unauthorized" });

    const limit = data.limit || 100;
    const messageType = data.messageType;
    const since = data.since ? new Date(data.since) : null;

    let filteredHistory = chatHistory;

    if (messageType) {
      filteredHistory = filteredHistory.filter(
        (msg) => msg.type === messageType,
      );
    }

    if (since) {
      filteredHistory = filteredHistory.filter(
        (msg) => new Date(msg.metadata.timestamp) > since,
      );
    }

    callback({
      history: filteredHistory.slice(-limit),
      total: filteredHistory.length,
    });
  });

  socket.on("get_users", (callback: Function) => {
    const users = Array.from(connectedUsers.values()).map((user) => ({
      id: user.id,
      username: user.username,
      type: user.type,
    }));

    const agentList = Array.from(agents.values()).map((agent) => ({
      id: agent.id,
      username: agent.username,
      type: agent.type,
      capabilities: agent.capabilities,
    }));

    callback({ users, agents: agentList });
  });
});

// Helper functions
async function broadcastMessage(message: Message): Promise<void> {
  // Broadcast to Socket.io clients
  io.emit("message", message);
  // add message to honcho session
  const peer = honcho.peer(message.username);
  await session.addMessages([peer.message(message.content)]);
}

function createMessage({
  type,
  username,
  content,
  metadata = {},
}: {
  type: MessageType;
  username: string;
  content: string;
  metadata?: any;
}): Message {
  return {
    id: generateId(),
    type,
    username,
    content,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

function addToHistory(message: Message): void {
  chatHistory.push(message);
  // Keep only last 1000 messages
  if (chatHistory.length > 1000) {
    chatHistory.shift();
  }
}

function notifyAgents(
  message: Message,
  eventType: string,
  excludeIds: string[] = [],
): void {
  agents.forEach((agent, agentId) => {
    if (!excludeIds.includes(agentId)) {
      agent.socket.emit("agent_event", {
        eventType,
        message,
        context: {
          totalUsers: connectedUsers.size,
          totalAgents: agents.size,
          recentHistory: chatHistory.slice(-10),
        },
      });
    }
  });
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Network utilities
function getLocalIPs(): NetworkInterface[] {
  const nets = os.networkInterfaces();
  const ips: NetworkInterface[] = [];

  for (const name of Object.keys(nets)) {
    const netArray = nets[name];
    if (!netArray) continue;

    for (const net of netArray) {
      // Skip internal and IPv6 addresses
      if (net.family === "IPv4" && !net.internal) {
        ips.push({
          interface: name,
          address: net.address,
          primary:
            name.includes("en0") ||
            name.includes("eth0") ||
            name.includes("wlan"),
        });
      }
    }
  }

  return ips;
}

function displayStartupInfo(): void {
  const ips = getLocalIPs();
  const platform = os.platform();

  console.log("\n🚀 LAN Chat Server Started Successfully!\n");

  // Display available IPs
  console.log("📡 Available Connection Points:");
  console.log(`   Socket.io: Port ${PORT}\n`);

  if (ips.length === 0) {
    console.log(
      "⚠️  No network interfaces found. Server only accessible via localhost.",
    );
    console.log("   Local connections:");
    console.log(`   • Socket.io client on http://localhost:${PORT}\n`);
    return;
  }

  console.log("🌐 LAN Connection Points:");
  ips.forEach((ip) => {
    const primary = ip.primary ? " (primary)" : "";
    console.log(`   Interface: ${ip.interface}${primary}`);
    console.log(`   • Socket.io: http://${ip.address}:${PORT}`);
    console.log("");
  });

  // Firewall guidance
  console.log("🔥 Firewall Configuration:");
  switch (platform) {
    case "darwin": // macOS
      console.log(
        "   macOS: System Preferences > Security & Privacy > Firewall",
      );
      console.log("   Or run: sudo pfctl -f /etc/pf.conf");
      console.log(
        `   Allow incoming connections on port ${PORT}`,
      );
      break;
    case "linux":
      console.log("   Ubuntu/Debian:");
      console.log(`   sudo ufw allow ${PORT}/tcp`);
      console.log("   ");
      console.log("   CentOS/RHEL:");
      console.log(
        `   sudo firewall-cmd --add-port=${PORT}/tcp --permanent`,
      );
      console.log("   sudo firewall-cmd --reload");
      break;
    case "win32":
      console.log("   Windows: Windows Defender Firewall > Advanced Settings");
      console.log("   Create Inbound Rule > Port > TCP > Specific Ports");
      console.log(`   Enter: ${PORT}`);
      break;
    default:
      console.log(
        `   Configure firewall to allow port ${PORT}`,
      );
  }

  console.log("\n🧪 Test Your Setup:");
  console.log("   1. Try locally first:");
  console.log(`      Open http://localhost:${PORT} in browser or connect with Socket.io client`);
  console.log("   2. Test from another machine:");
  if (ips.length > 0) {
    const primaryIP = ips.find((ip) => ip.primary) || ips[0];
    console.log(`      http://${primaryIP?.address}:${PORT}`);
  }
  console.log("   3. Check if port is open:");
  console.log(`      netstat -ln | grep ${PORT}`);

  console.log("\n📊 Server Status:");
  console.log(`   Stats API: http://localhost:${PORT}/api/stats`);
  console.log(`   Network API: http://localhost:${PORT}/api/network`);
  if (ips.length > 0) {
    const primaryIP = ips.find((ip) => ip.primary) || ips[0];
    console.log(`              http://${primaryIP?.address}:${PORT}/api/stats`);
  }

  console.log("\n💡 Troubleshooting:");
  console.log("   • Can't connect? Check firewall settings above");
  console.log("   • Wrong IP? Try all listed IPs");
  console.log("   • Still issues? Test with localhost first");
  console.log("   • Port in use? Set PORT environment variable to different port");

  console.log("\n🎉 Ready for Socket.io connections!\n");
}

// Configuration
const PORT = parseInt(Bun.env.PORT || "3000");

// Start server
server.listen(PORT, () => {
  console.log(`HTTP/Socket.io server listening on port ${PORT}`);
  displayStartupInfo();
});

console.log("Starting LAN Chat Server...");
