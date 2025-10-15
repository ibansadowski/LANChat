import { Hono } from "hono";
import type { Honcho } from "@honcho-ai/sdk";
import type { Message, User, Agent } from "../types.js";
import { getLocalIPs } from "./utils.js";

// Sanitize username to be Honcho-compatible
function sanitizeUsername(username: string): string {
  return username
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 50);
}

// Validate username format
function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(username) && username.length > 0 && username.length <= 50;
}

export function createAPIRoutes(
  connectedUsers: Map<string, User>,
  agents: Map<string, Agent>,
  chatHistory: Message[],
  PORT: number,
  honcho?: Honcho
) {
  const app = new Hono();

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

  app.post("/api/validate-username", async (c) => {
    let username: string;

    try {
      const body = await c.req.json();
      username = body.username;
    } catch (error) {
      console.error('Failed to parse JSON body:', error);
      return c.json({ valid: false, error: 'Invalid request format' }, 400);
    }

    if (!username || typeof username !== 'string') {
      return c.json({ valid: false, error: 'Username is required' }, 400);
    }

    // Check format - validate ORIGINAL username
    if (!isValidUsername(username)) {
      const sanitized = sanitizeUsername(username);

      // Check if sanitized version is available
      const sanitizedTaken = Array.from(connectedUsers.values()).find(u => u.username === sanitized) ||
                            Array.from(agents.values()).find(a => a.username === sanitized);

      if (sanitizedTaken) {
        return c.json({
          valid: false,
          error: 'Username contains invalid characters and suggested alternative is taken'
        });
      }

      return c.json({
        valid: false,
        error: 'Username can only contain letters, numbers, underscores, and hyphens',
        suggestion: sanitized
      });
    }

    // Check if already connected
    const existingUser = Array.from(connectedUsers.values()).find(u => u.username === username);
    const existingAgent = Array.from(agents.values()).find(a => a.username === username);

    if (existingUser || existingAgent) {
      return c.json({
        valid: false,
        error: 'Username is already taken'
      });
    }

    // Check Honcho peers if available with ORIGINAL username
    if (honcho) {
      try {
        const peersPage = await honcho.getPeers();
        const peers = peersPage.items;
        const peerExists = peers.some(p => p.id === username);

        return c.json({
          valid: true,
          peerExists,
          message: peerExists ? 'Welcome back!' : 'New user'
        });
      } catch (error) {
        console.error('Error checking Honcho peers:', error);
        // Allow connection even if Honcho check fails
        return c.json({ valid: true });
      }
    }

    return c.json({ valid: true });
  });

  app.get("/api/context", async (c) => {
    if (!honcho) {
      return c.json({ error: "Honcho not available" }, 500);
    }

    try {
      const peersPage = await honcho.getPeers();
      const peers = peersPage.items;

      return c.json({
        totalPeers: peers.length,
        peers: peers.map(p => ({
          id: p.id,
          createdAt: p.created_at,
          metadata: p.metadata
        }))
      });
    } catch (error) {
      console.error('Error fetching context:', error);
      return c.json({ error: 'Failed to fetch context' }, 500);
    }
  });

  return app;
}