# LANChat Technical Assessment - Development Notes

**Date Started:** October 14, 2025
**Developer:** Using Claude Code (Sonnet 4.5)
**Assessment For:** Plastic Labs DevRel Technical Screening

## Objective

1. Build web interface showcasing LANChat features
2. Improve Honcho integration in agents
3. Host live deployment
4. Document all work

## Current Architecture Analysis

### Stack
- **Runtime:** Bun
- **Server:** Node HTTP + Hono (API routes) + Socket.io (real-time)
- **Language:** TypeScript
- **AI:** OpenRouter (google/gemini-2.0-flash-lite-001)
- **Memory/Context:** Honcho SDK (@honcho-ai/sdk v1.5.0)

### Server Architecture (src/server/)

**index.ts** - Main entry point
- Creates Honcho client with workspace
- Creates or loads session (group chat context)
- Maintains in-memory state: connectedUsers, agents, chatHistory
- Serves API routes via Hono
- Sets up Socket.io for real-time communication

**socket.ts** - Socket.io event handlers
- `register` - Users/agents join chat
- `chat` - Send messages (broadcasts + saves to Honcho)
- `agent_data` - Agents send structured data
- `agent_response` - Agents send responses
- `get_history` - Query chat history
- `get_users` - List connected users/agents
- `dialectic` - Query peer models
- `toggle_observe` - Toggle observation status

**api.ts** - HTTP REST endpoints
- GET /api/stats - Server stats (users, agents, messages, uptime)
- GET /api/history - Recent messages with limit
- GET /api/network - Network interfaces and ports

### Agent Architecture (src/agent.ts)

**ChatAgent Class**
- Connects to server via Socket.io as "user" type
- Receives session_id from server
- Message processing flow:
  1. Receive message
  2. Get session and peer from Honcho
  3. Build context (getContext with summary, tokens, peerTarget)
  4. Add message to Honcho
  5. Decide if should respond (LLM decision)
  6. If yes, decide action: psychology | search | respond
  7. Execute tools and respond

**Decision Making:**
- `shouldRespond()` - JSON-structured LLM decision (should_respond, reason, confidence)
- `decideAction()` - Choose tool: psychology, search, or respond directly
- `analyzePsychology()` - Uses peer.chat() with target and question
- `search()` - Uses session.search() with semantic query
- `generateResponse()` - Creates response with context + tool results

### Current Honcho Integration Patterns

#### What's Being Used:
1. **Session Management**
   - Single session per group chat
   - Session ID shared with all participants
   - Loading existing messages from session on startup

2. **Peer Management**
   - Peer created for each user/agent
   - Agent peers: `observe_me: false` (don't observe agents by default)
   - User peers: `observe_me: true` (observe users)
   - Peers added/removed from session on join/leave

3. **Context Retrieval**
   ```typescript
   session.getContext({
     summary: true,
     tokens: 5000,
     lastUserMessage: message.content,
     peerTarget: message.username
   })
   ```
   - Returns OpenAI-formatted messages
   - Used before every agent response decision

4. **Message Storage**
   - Messages added to session via `session.addMessages([peer.message(content)])`
   - Added for both user messages and agent responses
   - Broadcast handler automatically saves chat messages

5. **Semantic Search**
   - `session.search(query)` for finding relevant past messages
   - Agent generates semantic query based on need

6. **Dialectic (Peer Models)**
   - `peer.chat(question, {sessionId, target})` to query peer models
   - Asks questions about specific participants

7. **Peer Configuration**
   - `observe_me` toggle allows users to opt in/out of observation
   - Stored in Honcho peer config

## Opportunities for Improvement

### Honcho Integration

#### 1. Error Handling & Resilience
**Current State:** Minimal error handling, some try-catch but inconsistent
**Issues:**
- API calls can fail silently
- No retry logic
- No fallback strategies
- Chat breaks if Honcho unavailable

**Improvements:**
- Add consistent error handling wrapper
- Implement retry logic with exponential backoff
- Fallback to non-Honcho mode if service unavailable
- Better error messages and logging

#### 2. Message Batching
**Current State:** Messages added one at a time
**Issue:** Multiple API calls for rapid messages
**Improvement:** Batch message additions for better performance

#### 3. Metamessages & Rich Metadata
**Current State:** Not using Honcho's metamessage capabilities
**Opportunity:** Add structured metadata for:
- Message sentiment
- Topics/tags
- Agent reasoning traces
- Tool usage logs
- Decision confidence scores

#### 4. Context Optimization
**Current State:** Fixed 5000 token context window
**Improvements:**
- Dynamic context sizing based on conversation complexity
- Better peerTarget usage for multi-participant context
- Experiment with summary strategies
- Cache context between rapid interactions

#### 5. Facts API
**Current State:** Not using Honcho facts
**Opportunity:** Track persistent knowledge:
- User preferences
- Important decisions/agreements
- Recurring topics
- Agent learnings

#### 6. Session Summaries
**Current State:** Using summary: true but not leveraging generated summaries
**Opportunity:**
- Display summaries in UI
- Use summaries for long conversation compression
- Agent can reference session summary

#### 7. Multiple Sessions
**Current State:** Single session per server instance
**Opportunity:**
- Multiple chat rooms/channels
- Private conversations
- Agent-specific sessions for memory

### Agent Improvements

#### 1. Decision Tracing
**Issue:** Agent reasoning is opaque
**Improvement:** Emit decision events to show:
- Why agent responded
- What tools it considered
- Psychology/search results
- Confidence levels

#### 2. Multi-Agent Coordination
**Current State:** Agents work independently
**Opportunity:**
- Agents could collaborate on complex questions
- Share insights via agent_data events
- Coordinate to avoid duplicate responses

#### 3. Agent Memory Beyond Session
**Current State:** Agent state resets on restart
**Opportunity:**
- Persist agent personality/learnings
- Remember past conversations across sessions
- Use Honcho facts for agent memory

#### 4. Structured Tool System
**Current State:** Hard-coded tool selection
**Improvement:**
- More modular tool architecture
- Tool chaining/composition
- New tools (web search, code execution, etc.)

## Tech Debt Identified

1. **Frontend Directory:** Contains unrelated app (engagic) - used for inspiration only
2. **Type Safety:** Some `any` types in socket handlers
3. **In-Memory State:** All state lost on server restart (except Honcho)
4. **No Authentication:** Anyone can join, no rate limiting
5. **Message History:** Limited to 1000 messages in memory
6. **Socket.io Transport:** Defaults to websocket but has polling fallback
7. **Environment Variables:** Hardcoded defaults, could use better config management
8. **Logging:** Console.log based, needs structured logging
9. **Testing:** No tests visible

## Design Decisions for Web Interface

### Approach: Extend Existing Server
**Rationale:**
- Keep architecture simple
- Single deployment
- Can reuse existing Socket.io infrastructure
- Serve static files from Hono

### Technology Choices:
- **Framework:** Vanilla JS + modern CSS (no build step for simplicity)
  - Alternative: React/Svelte (adds build complexity)
- **Real-time:** Socket.io client (already in use)
- **Styling:** CSS custom properties + flexbox/grid
- **Data viz:** Could add Chart.js for analytics if time permits

### Features to Build:

**Phase 1: Core Chat Interface**
- Real-time message feed
- Message input and send
- User list (humans + agents)
- Connection status

**Phase 2: Agent Visibility**
- Agent decision logs
- "Thinking" indicators
- Confidence displays
- Tool usage visualization

**Phase 3: Honcho Insights**
- Session context view
- Peer list and configs
- Dialectic interface (ask questions about users)
- Search interface

**Phase 4: Polish**
- Responsive design
- Dark/light mode
- Connection resilience
- Error handling

## Tools & Workflow

- **Primary:** Claude Code CLI
- **Editor:** VS Code integration
- **Testing:** Manual testing + bun test (if time)
- **Deployment:** TBD (Railway, Fly.io, or Vercel)
- **Version Control:** Git with dev branches

## Next Steps

1. Create dev branch
2. Design web UI architecture
3. Build static HTML/CSS/JS interface
4. Add to Hono server
5. Implement real-time features
6. Add agent visualization
7. Improve Honcho integration
8. Test thoroughly
9. Deploy live
10. Final documentation
