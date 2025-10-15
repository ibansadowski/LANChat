#!/usr/bin/env bun

import { io, type Socket } from "socket.io-client";
import { Honcho } from "@honcho-ai/sdk";
import type {
  Message,
  ResponseDecision,
  PsychologyAnalysis,
  AgentDecision,
  Dialectic,
  Search,
} from "./types.js";

// Parse command line arguments
const args = process.argv.slice(2);
const AGENT_NAME = args.find((arg) => !arg.startsWith("--")) || "Assistant";
const serverArg = args.find((arg) => arg.startsWith("--server="));
const SERVER_URL = serverArg
  ? serverArg.split("=")[1]
  : Bun.env.CHAT_SERVER || "http://localhost:3000";

const MODEL: string = Bun.env.MODEL || "google/gemini-flash-1.5";
const OPENROUTER_API_KEY = Bun.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("ERROR: OPENROUTER_API_KEY environment variable is required");
  process.exit(1);
}

class ChatAgent {
  protected socket: Socket | null = null;
  protected agentName: string;
  protected systemPrompt: string;
  protected temperature: number = 0.7;
  protected responseLength: number = 100;
  protected sessionId: string | null = null;

  protected honcho: Honcho;
  protected maxRetries: number = 3;
  protected retryDelay: number = 1000;

  constructor(agentName: string, systemPrompt?: string) {
    this.agentName = agentName;

    this.honcho = new Honcho({
      baseURL: process.env.HONCHO_BASE_URL || "http://localhost:8000",
      apiKey: process.env.HONCHO_API_KEY,
      workspaceId: process.env.HONCHO_WORKSPACE_ID || "default",
    });

    this.systemPrompt =
      systemPrompt ||
      `You are ${agentName}, a participant in a group chat.
You have access to a psychology analysis tool that can help you understand participants better.
Use it when you think it would help you provide a more insights on how to appropriately respond to something.
Respond naturally and conversationally. Keep responses concise.

Feel empowered to be chatty and ask follow-up questions.
`;
  }

  // Helper method to call OpenRouter API
  protected async callOpenRouter(messages: Array<{role: string, content: string}>, options: {temperature?: number, max_tokens?: number, format?: string} = {}): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.max_tokens ?? this.responseLength + 50,
        response_format: options.format === "json" ? { type: "json_object" } : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async connect(): Promise<void> {
    console.log(`🤖 ${this.agentName} connecting to ${SERVER_URL}...`);

    this.socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
      // Force new connection
      forceNew: false,
      // Longer timeouts for Honcho API calls
      pingInterval: 30000,
      pingTimeout: 120000,
    });

    this.socket.on("connect", () => {
      console.log("✅ Connected to chat server");

      // Register as a regular user (not as agent type)
      this.socket!.emit("register", {
        username: this.agentName,
        type: "user",
      });
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error.message);
      if (error.message.includes("https")) {
        console.log(
          "💡 Note: Server might be using HTTP, not HTTPS. Try: --server=http://192.168.1.177:3000",
        );
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`❌ Disconnected from server: ${reason}`);
    });

    // Listen to all messages
    this.socket.on("message", async (message: Message) => {
      // Only process chat messages from others
      if (message.type === "chat" && message.username !== this.agentName) {
        await this.processMessage(message);
      }
    });

    // Receive session id from server
    this.socket.on("session_id", (sessionId: string) => {
      this.sessionId = sessionId;
    });
  }

  private async processMessage(message: Message): Promise<void> {
    const decisionLog: any[] = [];

    console.log(`\n📡 API: Getting session ${this.sessionId}`);
    const session = await this.honcho.session(this.sessionId || "");

    console.log(`📡 API: Getting peer ${message.username}`);
    const senderPeer = await this.honcho.peer(message.username);

    // Build context
    console.log(`📡 API: Getting context (tokens: 5000, peer: ${message.username})`);
    const context = await session.getContext({
      summary: true,
      tokens: 5000,
      lastUserMessage: message.content,
      peerTarget: message.username,
    });
    const contextMessages = context.toOpenAI(this.agentName);
    const recentContext: string = contextMessages.map((msg: any) => `${msg.role}: ${msg.content}`).join("\n");
    console.log(`📦 Context (${contextMessages.length} messages):\n${recentContext.substring(0, 300)}...`);

    // add message to honcho with metadata
    console.log(`📡 API: Adding message from ${message.username} to Honcho`);
    await session.addMessages([
      senderPeer.message(message.content, {
        metadata: {
          message_type: "user_message",
          processed_by: this.agentName
        }
      })
    ]);

    // State 1: Decide if we should respond
    const decision = await this.shouldRespond(message, recentContext);
    decisionLog.push({ type: 'should_respond', ...decision, timestamp: new Date().toISOString() });
    console.log(
      `🤔 Decision: ${decision.should_respond ? "Yes" : "No"} - ${decision.reason} (confidence: ${decision.confidence})`,
    );

    if (!decision.should_respond) {
      return;
    }

    await this.decideAction(message, recentContext, { contextMessages }, decisionLog);
  }

  private async decideAction(
    message: Message,
    recentContext: string,
    tracker: Record<string, any>,
    decisionLog: any[],
  ): Promise<void> {
    // analyze psychology
    // search for additional context
    // response directly
    try {
      const responseText = await this.callOpenRouter([
        {
          role: "user",
          content: `You are ${this.agentName} in a group chat. Based on the recent conversation and the latest message, decide if you should respond.

Recent conversation, summary, and/or peer information:
${recentContext}

Latest message from ${message.username}: "${message.content}"

You have 3 different tools you can use to gather more context before responding. They are

1. Analyze the psychology - This lets you ask a question to a model of an agent to better understand them and learn how to respond appropriately

2. Search for additional context - This lets you search the conversation history with a query

3. Respond directly - This lets you respond directly to the user

Respond with a JSON object with this exact format:
{
  "decision": psychology or search or respond,
  "reason": "brief explanation",
  "confidence": 0.0 to 1.0
}

JSON response:`,
        },
      ], { temperature: 0.3, max_tokens: 100, format: "json" });

      // Parse the response
      const decision = JSON.parse(responseText) as AgentDecision;
      decisionLog.push({ type: 'action_decision', ...decision, timestamp: new Date().toISOString() });

      if (
        decision.decision === "psychology" &&
        tracker["psychology"] === undefined
      ) {
        const psychologyResponse = await this.analyzePsychology(
          message,
          recentContext,
        );
        console.log("Psychology response:", psychologyResponse);
        tracker["psychology"] = psychologyResponse;
        decisionLog.push({ type: 'psychology_result', response: psychologyResponse, timestamp: new Date().toISOString() });
        this.decideAction(message, recentContext, tracker, decisionLog);
      } else if (
        decision.decision === "search" &&
        tracker["search"] === undefined
      ) {
        const searchResponse = await this.search(message, recentContext);
        // Fix: searchResponse is already the data, no need to call .data()
        const messages = [];
        if (searchResponse && Array.isArray(searchResponse)) {
          for (const msg of searchResponse) {
            messages.push(msg);
          }
        } else if (searchResponse) {
          // Handle if it's a single message or different format
          messages.push(searchResponse);
        }
        tracker["search"] = messages;
        decisionLog.push({ type: 'search_result', results: messages.length, timestamp: new Date().toISOString() });
        this.decideAction(message, recentContext, tracker, decisionLog);
      } else {
        await this.generateResponse(message, recentContext, tracker, decisionLog);
      }
    } catch (error) {
      console.error("Error in decision making:", error);
      // Default to not responding on error
      return;
    }
  }

  private async shouldRespond(
    message: Message,
    recentContext: string,
  ): Promise<ResponseDecision> {
    try {
      // Quick check: if message explicitly addresses another agent, don't respond
      const otherAgentPattern = /(@?\w+bot)\b/gi;
      const matches = message.content.match(otherAgentPattern);
      if (matches) {
        const mentionedAgents = matches.map(m => m.replace('@', '').toLowerCase());
        const myNameLower = this.agentName.toLowerCase();

        // If other agents are mentioned but not me, don't respond
        if (mentionedAgents.length > 0 && !mentionedAgents.includes(myNameLower)) {
          return {
            should_respond: false,
            reason: `Message addressed to other agent(s): ${matches.join(', ')}`,
            confidence: 1.0
          };
        }
      }

      const responseText = await this.callOpenRouter([
        {
          role: "user",
          content: `You are ${this.agentName} in a group chat. Based on the recent conversation and the latest message, decide if you should respond.

Recent conversation, summary, and/or peer information:
${recentContext}

Latest message from ${message.username}: "${message.content}"

Respond with a JSON object with this exact format:
{
  "should_respond": true or false,
  "reason": "brief explanation",
  "confidence": 0.0 to 1.0
}

Consider:
- Is the message directed at you or mentioning you?
- Is it a question that needs answering?
- Would your response add value to the conversation?
- Have you responded too much recently?
- If the message mentions another specific agent's name, you should probably stay quiet

lean on the side of responding and keeping the conversation going, but not if someone else is being addressed

JSON response:`,
        },
      ], { temperature: 0.3, max_tokens: 100, format: "json" });

      // Parse the response
      const decision = JSON.parse(responseText) as ResponseDecision;
      return decision;
    } catch (error) {
      console.error("Error in decision making:", error);
      // Default to not responding on error
      return {
        should_respond: false,
        reason: "Error in decision process",
        confidence: 0.0,
      };
    }
  }

  private async search(message: Message, recentContext: string): Promise<any> {
    try {
      const responseText = await this.callOpenRouter([
        {
          role: "user",
          content: `You are ${this.agentName} in a group chat. You want to search the conversation history to get more context on something.

Recent conversation:
${recentContext}

Latest message from ${message.username}: "${message.content}"

Decide on a semantic query to search for in the conversation history

Respond with a JSON object with this exact format:
{
  "query": Word or Phrase you want to search to get more context,
}

JSON response:`,
        },
      ], { temperature: 0.3, max_tokens: 100, format: "json" });

      const search = JSON.parse(responseText) as Search;

      console.log(`📡 API: Semantic search query: "${search.query}"`);
      const session = await this.honcho.session(this.sessionId || "");
      const semanticResponse = await session.search(search.query);
      console.log(`📦 Search results: ${JSON.stringify(semanticResponse).substring(0, 200)}...`);

      return semanticResponse;
    } catch (error) {
      console.error("Error generating response:", error);
    }
  }

  private async analyzePsychology(
    message: Message,
    recentContext: string,
  ): Promise<any> {
    try {
      const responseText = await this.callOpenRouter([
        {
          role: "user",
          content: `You are ${this.agentName} in a group chat. You want to analyze the psychology of a participant more deeply to understand how to best respond.

Recent conversation:
${recentContext}

Latest message from ${message.username}: "${message.content}"

Decide who you want to ask a question about and what question you want to ask

Respond with a JSON object with this exact format:
{
  "target": string,
  "question": "What do you want to know about the target that would help you respond?",
}

JSON response:`,
        },
      ], { temperature: 0.3, max_tokens: 100, format: "json" });

      const dialectic = JSON.parse(responseText) as Dialectic;

      console.log(`📡 API: Dialectic query - asking about ${dialectic.target}: "${dialectic.question}"`);
      const peer = await this.honcho.peer(this.agentName);
      const dialecticResponse = await peer.chat(dialectic.question, {
        sessionId: this.sessionId || undefined,
        target: dialectic.target,
      });
      console.log(`📦 Dialectic response: ${dialecticResponse}`);
      return dialecticResponse;
    } catch (error) {
      console.error("Error generating response:", error);
    }
  }

  private async generateResponse(
    message: Message,
    recentContext: string,
    tracker: Record<string, any>,
    decisionLog: any[],
  ): Promise<void> {
    try {
      console.log(`💭 Generating response...`);

      // Initial chat with tools
      const messages = [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "user",
          content: `Recent conversation, summary, and/or peer information:
${recentContext}

${message.username} said: "${message.content}"

${tracker["psychology"] ? `Psychology analysis of ${message.username}: ${tracker["psychology"]}` : ""}

${tracker["search"] ? `Semantic search of conversation history: ${tracker["search"]}` : ""}

Please respond naturally as ${this.agentName}.`,
        },
      ];

      const responseContent = await this.callOpenRouter(messages, {
        temperature: this.temperature,
        max_tokens: this.responseLength + 50,
      });

      if (!responseContent || !responseContent.trim()) {
        console.error("Empty response from OpenRouter");
        console.error("Model used:", MODEL);
        return;
      }

      decisionLog.push({ type: 'response_generated', preview: responseContent.trim().substring(0, 100), timestamp: new Date().toISOString() });

      console.log(
        `📤 Sending response: ${responseContent.trim().substring(0, 50)}...`,
      );
      this.socket!.emit("chat", {
        content: responseContent.trim(),
        metadata: {
          agentDecisions: decisionLog
        }
      });
      // save our own message to honcho with rich metadata
      const session = await this.honcho.session(this.sessionId || "");
      const peer = await this.honcho.peer(this.agentName);
      await session.addMessages([
        peer.message(responseContent.trim(), {
          metadata: {
            message_type: "agent_response",
            decision_tree: decisionLog,
            tools_used: Object.keys(tracker).filter(k => k !== 'contextMessages'),
            context_tokens: tracker.contextMessages?.length || 0,
            response_to_message_id: message.id,
            response_to_user: message.username
          }
        })
      ]);
    } catch (error) {
      console.error("Error generating response:", error);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Export the class for extension
export {
  ChatAgent,
  type Message,
  type ResponseDecision,
  type PsychologyAnalysis,
};

// Only run if this file is executed directly
if (import.meta.main) {
  const agent = new ChatAgent(AGENT_NAME);
  agent.connect().catch(console.error);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down...");
    agent.disconnect();
    process.exit(0);
  });
}
