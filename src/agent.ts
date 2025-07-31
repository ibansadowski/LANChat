#!/usr/bin/env bun

import { io, type Socket } from "socket.io-client";
import { Ollama } from "ollama";
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

const honcho = new Honcho({
	environment: "production",
	apiKey: process.env.HONCHO_API_KEY!,
	workspaceId: process.env.HONCHO_WORKSPACE_ID!,
});

class ChatAgent {
	protected socket: Socket | null = null;
	protected agentName: string;
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
			`You are ${agentName}, a participant in a group chat. 
You have access to a psychology analysis tool that can help you understand participants better.
Use it when you think it would help you provide a more insights on how to appropriately respond to something.
Respond naturally and conversationally. Keep responses concise.

Feel empowered to be chatty and ask follow-up questions.
`;
	}

	async connect(): Promise<void> {
		console.log(`🤖 ${this.agentName} connecting to ${SERVER_URL}...`);

		this.socket = io(SERVER_URL, {
			transports: ["websocket"],
			reconnection: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
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
		// Build context
		const context = await honcho
			.session(this.sessionId || "")
			.getContext({ tokens: 5000 });
		const recentContext: string =
			context.summary +
			"\n\n" +
			context.toOpenAI(this.agentName).slice(-5).join("\n");
		// State 1: Decide if we should respond
		const decision = await this.shouldRespond(message, recentContext);
		console.log(
			`🤔 Decision: ${decision.should_respond ? "Yes" : "No"} - ${decision.reason}`,
		);

		if (!decision.should_respond) {
			return;
		}

		const action = await this.decideAction(message, recentContext, {});

		// State 2: Generate response with tools
	}

	private async decideAction(
		message: Message,
		recentContext: string,
		tracker: Record<string, any>,
	): Promise<void> {
		// analyze psychology
		// search for additional context
		// response directly
		try {
			const response = await this.ollama.generate({
				model: "llama3.1:8b",
				prompt: `You are ${this.agentName} in a group chat. Based on the recent conversation and the latest message, decide if you should respond.

Recent conversation:
${recentContext}

Latest message from ${message.username}: "${message.content}"

You have 3 different tools you can use to gather more context before responding. They are

1. Analyze the psychology - This let's you ask a question to a model of an agent to better understand them and learn how to respond appropriately

2. Search for additional context - This let's you search the conversation history with a query 

3. Respond directly - This let's you respond directly to the user

Respond with a JSON object with this exact format:
{
  "decision": psychology or search or respond,
  "reason": "brief explanation",
  "confidence": 0.0 to 1.0
}

JSON response:`,
				format: "json",
				options: {
					temperature: 0.3,
					num_predict: 100,
				},
			});

			// Parse the response
			const decision = JSON.parse(response.response) as AgentDecision;

			if (
				decision.decision === "psychology" &&
				tracker["psychology"] === undefined
			) {
				const psychologyResponse = await this.analyzePsychology(
					message,
					recentContext,
				);
				tracker["psychology"] = psychologyResponse;
				this.decideAction(message, recentContext, tracker);
			} else if (
				decision.decision === "search" &&
				tracker["search"] === undefined
			) {
				const searchResponse = await this.search(message, recentContext);
				const pageData = await searchResponse.data();
				const messages = [];
				for (const msg of pageData) {
					messages.push(msg);
				}
				tracker["search"] = messages;
				this.decideAction(message, recentContext, tracker);
			} else {
				await this.generateResponse(message, recentContext, tracker);
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

lean on the side of responding and keeping the conversation going

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

	private async search(message: Message, recentContext: string): Promise<any> {
		try {
			const response = await this.ollama.generate({
				model: "llama3.1:8b",
				prompt: `You are ${this.agentName} in a group chat. You want to search the conversation history to get more context on something.

Recent conversation:
${recentContext}

Latest message from ${message.username}: "${message.content}"

Decide on a semantic query to search for in the conversation history

Respond with a JSON object with this exact format:
{
  "query": Word or Phrase you want to search to get more context,
}

JSON response:`,
				format: "json",
				options: {
					temperature: 0.3,
					num_predict: 100,
				},
			});

			const search = JSON.parse(response.response) as Search;

			const semanticResponse = await honcho
				.session(this.sessionId || "")
				.search(search.query);

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
			const response = await this.ollama.generate({
				model: "llama3.1:8b",
				prompt: `You are ${this.agentName} in a group chat. You want to analyze the psychology of a participant more deeply to understand how to best respond.

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
				format: "json",
				options: {
					temperature: 0.3,
					num_predict: 100,
				},
			});

			const dialectic = JSON.parse(response.response) as Dialectic;

			const dialecticResponse = await honcho
				.peer(this.agentName)
				.chat(dialectic.question, {
					sessionId: this.sessionId || undefined,
					target: dialectic.target,
				});
			return dialecticResponse;
		} catch (error) {
			console.error("Error generating response:", error);
		}
	}

	private async generateResponse(
		message: Message,
		recentContext: string,
		tracker: Record<string, any>,
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
					role: "system",
					content: `
Here is context on the conversation so far:

Recent Conversation Context:
${recentContext}

You received a message from ${message.username}: "${message.content}"

${tracker["psychology"] ? `Psychology analysis of ${message.username}: ${tracker["psychology"]}` : ""}

${tracker["search"] ? `Semantic search of conversation history: ${tracker["search"]}` : ""}

`,
				},
			];

			const response = await this.ollama.chat({
				model: "llama3.1:8b",
				messages: messages,
				options: {
					temperature: this.temperature,
					num_predict: this.responseLength + 50, // Extra tokens for tool calls
				},
			});

			// Handle tool calls if any
			// No tools used, send the direct response
			this.socket!.emit("chat", {
				content: response.message.content.trim(),
			});
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
