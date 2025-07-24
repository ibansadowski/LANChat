#!/usr/bin/env bun

import { io, Socket } from "socket.io-client";

// Configuration
const SERVER_URL = Bun.env.CHAT_SERVER || "http://localhost:3000";
const AGENT_NAME = process.argv[2] || "ChatBot";

interface Message {
  id: string;
  type: "chat" | "agent_response" | "system" | "join" | "leave" | "agent_data";
  username: string;
  content: string;
  metadata: {
    timestamp: string;
    [key: string]: any;
  };
}

interface AgentEvent {
  eventType: string;
  message: Message;
  context: {
    totalUsers: number;
    totalAgents: number;
    recentHistory: Message[];
  };
}

interface HistoryResponse {
  history: Message[];
  total: number;
  error?: string;
}

interface UsersResponse {
  users: Array<{ id: string; username: string; type: string }>;
  agents: Array<{
    id: string;
    username: string;
    type: string;
    capabilities: string[];
  }>;
  error?: string;
}

interface AIResponse {
  response: string;
  confidence: number;
}

class ChatAgent {
  private serverUrl: string;
  private agentName: string;
  private socket: Socket | null = null;
  private messageHistory: Message[] = [];
  private users: Set<string> = new Set();
  private capabilities: string[] = ["conversation", "analysis", "assistance"];

  constructor(serverUrl: string, agentName: string) {
    this.serverUrl = serverUrl;
    this.agentName = agentName;
  }

  async connect(): Promise<void> {
    console.log(`Agent ${this.agentName} connecting to ${this.serverUrl}...`);

    this.socket = io(this.serverUrl);

    this.socket.on("connect", () => {
      console.log("Agent connected to chat server");

      // Register as agent
      this.socket!.emit("register", {
        username: this.agentName,
        type: "agent",
        capabilities: this.capabilities,
      });
    });

    this.socket.on("disconnect", () => {
      console.log("Agent disconnected from server");
    });

    // Listen to all messages
    this.socket.on("message", (message: Message) => {
      this.processMessage(message);
    });

    // Listen to agent-specific events
    this.socket.on("agent_event", (event: AgentEvent) => {
      this.handleAgentEvent(event);
    });

    // Receive chat history
    this.socket.on("history", (history: Message[]) => {
      this.messageHistory = history;
      console.log(`Received ${history.length} historical messages`);
      this.analyzeHistory();
    });
  }

  private processMessage(message: Message): void {
    this.messageHistory.push(message);

    // Keep only last 100 messages in memory
    if (this.messageHistory.length > 100) {
      this.messageHistory.shift();
    }

    // Track users
    if (message.metadata?.userId) {
      this.users.add(message.username);
    }

    // Respond to direct mentions
    if (
      message.type === "chat" &&
      message.content.toLowerCase().includes(`@${this.agentName.toLowerCase()}`)
    ) {
      this.handleDirectMention(message);
    }

    // Respond to questions
    if (message.type === "chat" && this.isQuestion(message.content)) {
      this.handleQuestion(message);
    }

    // Analyze sentiment and provide insights
    if (message.type === "chat") {
      this.analyzeSentiment(message);
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    console.log(`Received agent event: ${event.eventType}`);

    switch (event.eventType) {
      case "chat_message":
        // Process new chat message with context
        this.processWithContext(event.message, event.context);
        break;
      case "agent_data":
        // Another agent shared data
        console.log(
          `Agent data from ${event.message.username}:`,
          event.message.metadata,
        );
        break;
    }
  }

  private processWithContext(message: Message, context: any): void {
    // Example: Track conversation trends
    const recentMessages = context.recentHistory || [];
    const topics = this.extractTopics(recentMessages);

    // Send structured data about conversation trends
    if (topics.length > 0) {
      this.socket!.emit("agent_data", {
        content: `Identified trending topics: ${topics.join(", ")}`,
        dataType: "trend_analysis",
        processedData: {
          topics,
          messageCount: recentMessages.length,
          timeWindow: "10_messages",
        },
        broadcast: false, // Don't broadcast this analysis
        metadata: {
          analysisType: "topic_extraction",
          confidence: 0.7,
        },
      });
    }
  }

  private async handleDirectMention(message: Message): Promise<void> {
    const content = message.content
      .replace(`@${this.agentName.toLowerCase()}`, "")
      .trim();

    // Simple responses - you can integrate with Claude API here
    const response = await this.generateResponse(content, message);

    this.socket!.emit("agent_response", {
      response: response.response,
      responseType: "direct_mention",
      confidence: response.confidence,
      referencedMessage: message.id,
    });
  }

  private async handleQuestion(message: Message): Promise<void> {
    // Only respond to some questions to avoid spam
    if (Math.random() < 0.3) {
      // 30% chance to respond
      const response = await this.generateResponse(message.content, message);

      this.socket!.emit("agent_response", {
        response: response.response,
        responseType: "question_response",
        confidence: response.confidence,
        referencedMessage: message.id,
      });
    }
  }

  private async generateResponse(
    content: string,
    originalMessage: Message,
  ): Promise<AIResponse> {
    // Simple response generation - replace with actual AI integration
    const responses = [
      "That's an interesting question! Let me think about that...",
      "Based on the conversation context, I'd say...",
      "I notice this relates to what we discussed earlier about...",
      "From my analysis of recent messages, it seems like...",
      "That reminds me of a pattern I've observed in our chat...",
    ];

    // Add context from recent messages
    const recentTopics = this.extractTopics(this.messageHistory.slice(-5));
    if (recentTopics.length > 0) {
      return {
        response: `${responses[Math.floor(Math.random() * responses.length)]} I've noticed we've been discussing ${recentTopics[0]} recently.`,
        confidence: 0.7,
      };
    }

    return {
      response: responses[Math.floor(Math.random() * responses.length)],
      confidence: 0.6,
    };
  }

  private analyzeSentiment(message: Message): void {
    // Simple sentiment analysis - replace with actual implementation
    const positiveWords = [
      "good",
      "great",
      "awesome",
      "love",
      "like",
      "happy",
      "excited",
    ];
    const negativeWords = [
      "bad",
      "terrible",
      "hate",
      "dislike",
      "sad",
      "angry",
      "frustrated",
    ];

    const words = message.content.toLowerCase().split(" ");
    const positive = words.some((word) => positiveWords.includes(word));
    const negative = words.some((word) => negativeWords.includes(word));

    if (positive || negative) {
      this.socket!.emit("agent_data", {
        dataType: "sentiment_analysis",
        processedData: {
          messageId: message.id,
          sentiment: positive ? "positive" : "negative",
          confidence: 0.6,
          user: message.username,
        },
        broadcast: false, // Keep internal for now
      });
    }
  }

  private analyzeHistory(): void {
    if (this.messageHistory.length === 0) return;

    const topics = this.extractTopics(this.messageHistory);
    const userCount = new Set(this.messageHistory.map((m) => m.username)).size;

    console.log(
      `Analysis complete: ${topics.length} topics, ${userCount} users, ${this.messageHistory.length} messages`,
    );

    // Send initial analysis
    this.socket!.emit("agent_data", {
      content: `Initial analysis complete: Found ${topics.length} main topics`,
      dataType: "historical_analysis",
      processedData: {
        topics,
        userCount,
        messageCount: this.messageHistory.length,
        timespan: this.getTimespan(),
      },
      broadcast: true,
    });
  }

  private extractTopics(messages: Message[]): string[] {
    // Simple topic extraction - replace with proper NLP
    const commonWords = [
      "the",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
    ];

    const allWords = messages
      .filter((m) => m.type === "chat")
      .map((m) => m.content.toLowerCase())
      .join(" ")
      .replace(/[^\w\s]/g, "")
      .split(" ")
      .filter((word) => word.length > 3 && !commonWords.includes(word));

    const wordCounts: { [key: string]: number } = {};
    allWords.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    return Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  private isQuestion(content: string): boolean {
    return (
      content.includes("?") ||
      content.toLowerCase().startsWith("what") ||
      content.toLowerCase().startsWith("how") ||
      content.toLowerCase().startsWith("why") ||
      content.toLowerCase().startsWith("when") ||
      content.toLowerCase().startsWith("where") ||
      content.toLowerCase().startsWith("who")
    );
  }

  private getTimespan(): string {
    if (this.messageHistory.length < 2) return "unknown";

    const first = new Date(this.messageHistory[0].metadata.timestamp);
    const last = new Date(
      this.messageHistory[this.messageHistory.length - 1].metadata.timestamp,
    );
    const diffMinutes = Math.floor(
      (last.getTime() - first.getTime()) / (1000 * 60),
    );

    if (diffMinutes < 60) return `${diffMinutes} minutes`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours`;
    return `${Math.floor(diffMinutes / 1440)} days`;
  }

  // API integration example (replace with actual Claude API)
  async getAIResponse(prompt: string, context: any = {}): Promise<AIResponse> {
    // This is where you'd integrate with Claude API or other AI services
    // For now, return a placeholder
    return {
      response:
        "This would be an AI-generated response based on the conversation context.",
      confidence: 0.8,
    };
  }
}

// Start the agent
const agent = new ChatAgent(SERVER_URL, AGENT_NAME);
agent.connect().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down agent...");
  if (agent.socket) {
    agent.socket.disconnect();
  }
  process.exit(0);
});
