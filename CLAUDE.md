# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies (using Bun)
bun install

# Run the chat server
bun start                    # Production mode
bun dev                      # Development mode with auto-restart

# Run the terminal client (NOTE: client.ts currently has incorrect code - duplicates agent.ts)
bun run client               # Default username
bun run client Alice         # Custom username
bun run client Bob --server=http://192.168.1.100:3000  # Remote server

# Run an AI agent
bun run agent                # Default agent name
bun run agent SmartBot       # Custom agent name

# Type checking
bun run type-check           # Run TypeScript compiler without emit

# Build for production
bun run build                # Creates optimized build in ./dist
```

## Architecture Overview

This is a **real-time LAN chat application** with AI agent support, built with:
- **Bun** runtime (modern JavaScript/TypeScript runtime)
- **TypeScript** for type safety
- **Hono** web framework for HTTP/API
- **Socket.IO** for WebSocket communication
- **Multi-protocol support**: Clients can connect via Socket.IO, netcat, or telnet

### Component Structure

```
Server (server.ts)
├── HTTP API (Hono) - Port 3000
│   ├── GET /api/stats - Server statistics
│   └── GET /api/history - Chat history
├── Socket.IO Server - Port 3000
│   └── Handles WebSocket connections for clients/agents
└── TCP Server - Port 3001
    └── Raw socket connections for netcat/telnet

Client Types:
├── Human Clients
│   ├── Socket.IO client (client.ts) - Full featured
│   └── Raw TCP (netcat/telnet) - Basic chat
└── AI Agents (agent.ts)
    └── Socket.IO only - Can process events and send structured data
```

### Key Message Protocol

All messages follow this structure:
```typescript
interface Message {
  id: string;
  type: 'chat' | 'agent_data' | 'system' | 'join' | 'leave' | 'agent_response';
  username: string;
  content: string;
  metadata: {
    timestamp: string;
    [key: string]: any;  // Extensible for agent data
  };
}
```

### Important Implementation Notes

1. **Multi-Protocol Broadcasting**: The server broadcasts messages to both Socket.IO and raw TCP clients. See `broadcastMessage()` in server.ts:146

2. **Agent Registration**: Agents must register with type "agent" and capabilities. See agent.ts:59

3. **Raw TCP Commands**: Netcat/telnet users can use `/help`, `/users`, `/history`, `/quit`. Handled in server.ts:195

4. **Network Detection**: Server automatically detects LAN IPs and displays connection instructions. See server.ts:316

5. **Agent Events**: Server notifies agents of events requiring processing via `agent_event`. See server.ts:173

### Known Issues

- **client.ts is broken**: Currently contains duplicate agent code instead of human client implementation
- **No persistence**: Messages are stored in-memory only
- **No authentication**: Anyone on LAN can connect

### Adding AI Integration

To integrate real AI (e.g., Claude API), modify the `getAIResponse()` method in agent.ts:
1. Add API key to environment variables
2. Replace the mock implementation with actual API calls
3. Use the chat history context for better responses

### Testing

Currently no test framework is configured. Bun has built-in testing support:
```bash
# To add tests:
# 1. Create *.test.ts files
# 2. Run with: bun test
```