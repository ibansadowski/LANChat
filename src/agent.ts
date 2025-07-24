#!/usr/bin/env bun

import { io, Socket } from "socket.io-client";
import { Ollama } from "ollama";

// Configuration
const SERVER_URL = Bun.env.CHAT_SERVER || "http://localhost:3000";
const AGENT_NAME = process.argv[2] || "Assistant";

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

class ChatAgent {
	private socket: Socket | null = null;
	private agentName: string;
	private messageHistory: Message[] = [];
	private ollama: Ollama;

	constructor(agentName: string) {
		this.agentName = agentName;
		this.ollama = new Ollama({ host: "http://localhost:11434" });
	}

	async connect(): Promise<void> {
		console.log(`🤖 ${this.agentName} connecting to ${SERVER_URL}...`);

		this.socket = io(SERVER_URL);

		this.socket.on("connect", () => {
			console.log("✅ Connected to chat server");

			// Register as a regular user (not as agent type)
			this.socket!.emit("register", {
				username: this.agentName,
				type: "user",
			});
		});

		this.socket.on("disconnect", () => {
			console.log("❌ Disconnected from server");
		});

		// Listen to all messages
		this.socket.on("message", async (message: Message) => {
			// Add to history
			this.messageHistory.push(message);

			// Keep only last 20 messages
			if (this.messageHistory.length > 20) {
				this.messageHistory.shift();
			}

			// Only respond to chat messages from others
			if (message.type === "chat" && message.username !== this.agentName) {
				await this.respondToMessage(message);
			}
		});

		// Receive initial history
		this.socket.on("history", (history: Message[]) => {
			this.messageHistory = history.slice(-20); // Keep last 20 messages
			console.log(
				`📜 Loaded ${this.messageHistory.length} historical messages`,
			);
		});
	}

	private async respondToMessage(message: Message): Promise<void> {
		try {
			// Build conversation history for the LLM
			const conversationHistory = this.messageHistory
				.filter((m) => m.type === "chat")
				.map((m) => ({
					role: m.username === this.agentName ? "assistant" : "user",
					content: `${m.username}: ${m.content}`,
				}));

			console.log(`💭 Thinking about response to: "${message.content}"`);

			// Generate response using Ollama
			const response = await this.ollama.chat({
				model: "llama3.1:8b",
				messages: [
					{
						role: "system",
						content: `You are ${this.agentName}, a helpful participant in a group chat. Respond naturally and conversationally. Keep responses concise.`,
					},
					...conversationHistory,
				],
				options: {
					temperature: 0.7,
					num_predict: 100,
				},
			});

			console.log(response);

			// Send response as a regular chat message
			this.socket!.emit("chat", {
				content: response.message.content.trim(),
			});
		} catch (error) {
			console.error("Error generating response:", error);
		}
	}
}

// Start the agent
const agent = new ChatAgent(AGENT_NAME);
agent.connect().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("\n👋 Shutting down...");
	if (agent.socket) {
		agent.socket.disconnect();
	}
	process.exit(0);
});

