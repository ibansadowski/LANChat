# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies (using Bun)
bun install

# Run the chat server
bun start                    # Production mode
bun dev                      # Development mode with auto-restart

# Run the terminal client
bun run client               # Default username
bun run client Alice         # Custom username
bun run client Bob --server=http://192.168.1.100:3000  # Remote server

# Run an AI agent
bun run agent                # Default agent name
bun run agent SmartBot       # Custom agent name

# Run sample agents
bun run src/sample-agents/philosopher-agent.ts Socrates
bun run src/sample-agents/pirate-agent.ts BlackBeard
bun run src/sample-agents/teenager-agent.ts ZoeBot

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
- **Honcho AI SDK** for conversation memory and psychology analysis

### Component Structure

```
Server (server.ts)
├── HTTP API (Hono) - Port 3000
│   ├── GET /api/stats - Server statistics
│   ├── GET /api/history - Chat history
│   └── GET /api/network - Network information
├── Socket.IO Server - Port 3000
│   └── Handles WebSocket connections for clients/agents
└── Honcho Integration
    └── Session management and participant psychology

Client Types:
├── Human Clients (client.ts)
│   ├── Socket.IO client with rich terminal UI
│   └── Commands: /help, /users, /history, /dialectic, /quit
└── AI Agents (agent.ts + sample-agents/)
    ├── Ollama integration for LLM responses
    ├── Psychology analysis via Honcho
    └── Smart response decision-making
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

### AI Agent System

The agent system includes:

1. **Base ChatAgent Class** (agent.ts): Core agent functionality with Ollama and Honcho integration
2. **Smart Response Logic**: AI decides when to respond based on conversation context
3. **Psychology Analysis**: Agents can analyze participant psychology using Honcho's dialectic system
4. **Tool Support**: Agents can use tools like psychology analysis in their responses
5. **Sample Agents**: Pre-built personality agents (philosopher, pirate, teenager)

### Important Implementation Notes

1. **Socket.IO Only**: Server uses Socket.IO for all client/agent communication (raw TCP removed)

2. **Agent Registration**: Agents register with type "agent" and capabilities. See agent.ts:59

3. **Network Detection**: Server automatically detects LAN IPs and displays connection instructions. See server.ts:316

4. **Agent Events**: Server notifies agents of events requiring processing via `agent_event`. See server.ts:173

5. **Honcho Sessions**: Each chat creates a Honcho session for memory and psychology analysis. See server.ts:81

6. **Dialectic Command**: Users can query participant psychology with `/dialectic user query`

### Environment Variables

Required in `.env`:
```bash
HONCHO_API_KEY=your_honcho_api_key
HONCHO_APP_ID=your_app_id
```

### Known Issues

- **No persistence**: Messages are stored in-memory only
- **No authentication**: Anyone on LAN can connect (designed for trusted networks)

### Testing

Currently no test framework is configured. Bun has built-in testing support:
```bash
# To add tests:
# 1. Create *.test.ts files
# 2. Run with: bun test
```