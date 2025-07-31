#!/usr/bin/env bun

import { io, type Socket } from "socket.io-client";
import { Ollama } from "ollama";
import { Honcho } from "@honcho-ai/sdk";
import type { Message, ResponseDecision, PsychologyAnalysis } from "./types.js";

// Configuration
const SERVER_URL = Bun.env.CHAT_SERVER || "http://localhost:3000";
const AGENT_NAME = process.argv[2] || "Assistant";

const honcho = new Honcho({
	environment: "production",
	apiKey: process.env.HONCHO_API_KEY!,
	workspaceId: process.env.HONCHO_WORKSPACE_ID!,
});

class ChatAgent {
	protected socket: Socket | null = null;
	protected agentName: string;
	protected messageHistory: Message[] = [];
	protected ollama: Ollama;
	protected systemPrompt: string;
	protected temperature: number = 0.7;
	protected responseLength: number = 100;
	protected sessionId: string | null = null;

	constructor(agentName: string, systemPrompt?: string) {
		this.agentName = agentName;
		this.ollama = new Ollama({ host: "http://localhost:11434" });
		this.systemPrompt =
			systemPrompt ||
			`You are ${agentName}, a helpful participant in a group chat. 
You have access to a psychology analysis tool that can help you understand participants better.
Use it when you think it would help you provide a more empathetic or appropriate response.
Respond naturally and conversationally. Keep responses concise.`;
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

			// Only process chat messages from others
			if (message.type === "chat" && message.username !== this.agentName) {
				await this.processMessage(message);
			}
		});

		// Receive session id from server
		this.socket.on("session_id", (sessionId: string) => {
			this.sessionId = sessionId;
		});

		// Receive initial history
		this.socket.on("history", (history: Message[]) => {
			this.messageHistory = history.slice(-20); // Keep last 20 messages
			console.log(
				`📜 Loaded ${this.messageHistory.length} historical messages`,
			);
		});
	}

	private async processMessage(message: Message): Promise<void> {
		// State 1: Decide if we should respond
		const decision = await this.shouldRespond(message);
		console.log(
			`🤔 Decision: ${decision.should_respond ? "Yes" : "No"} - ${decision.reason}`,
		);

		if (!decision.should_respond) {
			return;
		}

		// State 2: Generate response with tools
		await this.generateResponseWithTools(message);
	}

	private async shouldRespond(message: Message): Promise<ResponseDecision> {
		try {
			// Build context for decision
			const recentContext = this.messageHistory
				.slice(-5)
				.filter((m) => m.type === "chat")
				.map((m) => `${m.username}: ${m.content}`)
				.join("\n");

			const response = await this.ollama.generate({
				model: "llama3.1:8b",
				prompt: `You are ${this.agentName} in a group chat. Based on the recent conversation and the latest message, decide if you should respond.

Recent conversation:
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

JSON response:`,
				format: "json",
				options: {
					temperature: 0.3,
					num_predict: 100,
				},
			});

			// Parse the response
			const decision = JSON.parse(response.response) as ResponseDecision;
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

	private async generateResponseWithTools(message: Message): Promise<void> {
		try {
			// Build conversation history
			const conversationHistory = this.messageHistory
				.filter((m) => m.type === "chat")
				.map((m) => ({
					role: m.username === this.agentName ? "assistant" : "user",
					content: `${m.username}: ${m.content}`,
				}));

			// Define the psychology analysis tool
			const analyzeParticipantTool = {
				type: "function",
				function: {
					name: "analyzeParticipant",
					description:
						"Analyze the psychology and communication style of a chat participant to better understand how to interact with them",
					parameters: {
						type: "object",
						required: ["participantName", "query"],
						properties: {
							participantName: {
								type: "string",
								description: "The username of the participant to analyze",
							},
							query: {
								type: "string",
								description:
									"A specific question about this participant you want answered based on their chat history",
							},
						},
					},
				},
			};

			// Available functions mapping
			const availableFunctions = {
				analyzeParticipant: this.analyzeParticipant.bind(this),
			};

			console.log(`💭 Generating response...`);

			// Initial chat with tools
			const messages = [
				{
					role: "system",
					content: this.systemPrompt,
				},
				...conversationHistory,
			];

			const response = await this.ollama.chat({
				model: "llama3.1:8b",
				messages: messages,
				tools: [analyzeParticipantTool],
				options: {
					temperature: this.temperature,
					num_predict: this.responseLength + 50, // Extra tokens for tool calls
				},
			});

			// Handle tool calls if any
			if (response.message.tool_calls) {
				console.log(`🛠️ Using tools...`);

				// Process tool calls
				for (const tool of response.message.tool_calls) {
					const functionToCall = availableFunctions[tool.function.name as keyof typeof availableFunctions];
					if (functionToCall) {
						console.log(`Calling tool: ${tool.function.name}`);
						const result = await functionToCall(tool.function.arguments as { participantName: string; query: string; });

						// Add the tool response to messages
						messages.push(response.message);
						messages.push({
							role: "tool",
							content: JSON.stringify(result),
						});
					}
				}

				// Get final response with tool results
				const finalResponse = await this.ollama.chat({
					model: "llama3.1:8b",
					messages: messages,
					options: {
						temperature: this.temperature,
						num_predict: this.responseLength,
					},
				});

				// Send the final response
				this.socket!.emit("chat", {
					content: finalResponse.message.content.trim(),
				});
			} else {
				// No tools used, send the direct response
				this.socket!.emit("chat", {
					content: response.message.content.trim(),
				});
			}
		} catch (error) {
			console.error("Error generating response:", error);
		}
	}

	private async analyzeParticipant(args: {
		participantName: string;
		query: string;
	}): Promise<PsychologyAnalysis> {
		const my_peer = honcho.peer(this.agentName);
		const response = await my_peer.chat(args.query, {
			sessionId: this.sessionId || undefined,
			target: args.participantName,
		});

		console.log("============== ANALYSIS ==============");
		console.log("Query: ", args.query);
		console.log(response);
		console.log("============== ANALYSIS COMPLETE ==============");

		if (response === null) {
			return {
				participant: args.participantName,
				response: `No information found for query: ${args.query}`,
			};
		}
		return {
			participant: args.participantName,
			response: response,
		};
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
