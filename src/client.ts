#!/usr/bin/env bun

import { io, Socket } from "socket.io-client";
import readline from "node:readline";
import chalk from "chalk";

// Configuration
const SERVER_URL = Bun.env.CHAT_SERVER || "http://localhost:3000";
const USERNAME = process.argv[2] || `User${Math.floor(Math.random() * 1000)}`;

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

interface HistoryResponse {
	history: Message[];
	total: number;
	error?: string;
}

class TerminalChatClient {
	private serverUrl: string;
	private username: string;
	private socket: Socket | null = null;
	private rl: readline.Interface | null = null;
	private connected: boolean = false;

	constructor(serverUrl: string, username: string) {
		this.serverUrl = serverUrl;
		this.username = username;
	}

	async connect(): Promise<void> {
		console.log(
			chalk.cyan(`Connecting to ${this.serverUrl} as ${this.username}...`),
		);

		this.socket = io(this.serverUrl);

		this.socket.on("connect", () => {
			this.connected = true;
			console.log(chalk.green("Connected to chat server!"));

			// Register with server
			this.socket!.emit("register", {
				username: this.username,
				type: "human",
			});

			this.setupReadline();
		});

		this.socket.on("disconnect", () => {
			this.connected = false;
			console.log(chalk.red("Disconnected from server"));
			if (this.rl) {
				this.rl.close();
			}
			process.exit(0);
		});

		this.socket.on("message", (message: Message) => {
			this.displayMessage(message);
		});

		this.socket.on("history", (history: Message[]) => {
			console.log(chalk.yellow("\n--- Chat History ---"));
			history.forEach((msg) => this.displayMessage(msg, false));
			console.log(chalk.yellow("--- End History ---\n"));
		});

		this.socket.on("connect_error", (error: Error) => {
			console.log(chalk.red("Connection failed:", error.message));
			process.exit(1);
		});
	}

	private setupReadline(): void {
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: chalk.blue(`${this.username}> `),
		});

		this.rl.prompt();

		this.rl.on("line", (input: string) => {
			const trimmed = input.trim();

			if (trimmed === "") {
				this.rl!.prompt();
				return;
			}

			// Handle commands
			if (trimmed.startsWith("/")) {
				this.handleCommand(trimmed);
			} else {
				// Send chat message
				this.socket!.emit("chat", {
					content: trimmed,
					metadata: {
						clientType: "terminal",
					},
				});
			}

			this.rl!.prompt();
		});

		this.rl.on("close", () => {
			console.log(chalk.yellow("\nGoodbye!"));
			this.socket!.disconnect();
			process.exit(0);
		});

		// Handle Ctrl+C
		process.on("SIGINT", () => {
			this.rl!.close();
		});
	}

	private handleCommand(command: string): void {
		const parts = command.split(" ");
		const cmd = parts[0].toLowerCase();

		switch (cmd) {
			case "/help":
				this.showHelp();
				break;
			case "/quit":
			case "/exit":
				this.rl!.close();
				break;
			case "/users":
				this.socket!.emit("get_users", (response: UsersResponse) => {
					if (response.error) {
						console.log(chalk.red("Error:", response.error));
					} else {
						console.log(chalk.cyan("\n--- Connected Users ---"));
						response.users.forEach((user) => {
							console.log(chalk.white(`  ${user.username} (${user.type})`));
						});
						console.log(chalk.cyan("--- Connected Agents ---"));
						response.agents.forEach((agent) => {
							const caps =
								agent.capabilities.length > 0
									? ` [${agent.capabilities.join(", ")}]`
									: "";
							console.log(
								chalk.magenta(`  ${agent.username} (${agent.type})${caps}`),
							);
						});
						console.log("");
					}
				});
				break;
			case "/history":
				const limit = parseInt(parts[1]) || 20;
				this.socket!.emit(
					"get_history",
					{ limit },
					(response: HistoryResponse) => {
						if (response.error) {
							console.log(chalk.red("Error:", response.error));
						} else {
							console.log(
								chalk.yellow(
									`\n--- Last ${response.history.length} Messages ---`,
								),
							);
							response.history.forEach((msg) =>
								this.displayMessage(msg, false),
							);
							console.log(chalk.yellow("--- End History ---\n"));
						}
					},
				);
				break;
			default:
				console.log(
					chalk.red(
						`Unknown command: ${cmd}. Type /help for available commands.`,
					),
				);
		}
	}

	private showHelp(): void {
		console.log(chalk.cyan("\n--- Available Commands ---"));
		console.log(chalk.white("/help     - Show this help message"));
		console.log(chalk.white("/users    - List connected users and agents"));
		console.log(
			chalk.white("/history [n] - Show last n messages (default: 20)"),
		);
		console.log(chalk.white("/quit     - Exit the chat"));
		console.log(chalk.white("Type any message to send it to the chat."));
		console.log("");
	}

	private displayMessage(message: Message, showPrompt: boolean = true): void {
		if (showPrompt) {
			// Clear current line and move cursor up
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0);
		}

		const timestamp = new Date(message.metadata.timestamp).toLocaleTimeString();

		switch (message.type) {
			case "chat":
				if (message.username === this.username) {
					console.log(chalk.green(`[${timestamp}] You: ${message.content}`));
				} else {
					console.log(
						chalk.white(
							`[${timestamp}] ${message.username}: ${message.content}`,
						),
					);
				}
				break;
			case "agent_response":
				const confidence = message.metadata.confidence
					? ` (${Math.round(message.metadata.confidence * 100)}%)`
					: "";
				console.log(
					chalk.magenta(
						`[${timestamp}] 🤖 ${message.username}${confidence}: ${message.content}`,
					),
				);
				break;
			case "system":
			case "join":
			case "leave":
				console.log(chalk.gray(`[${timestamp}] * ${message.content}`));
				break;
			case "agent_data":
				if (message.metadata.broadcast !== false) {
					console.log(
						chalk.cyan(
							`[${timestamp}] 📊 ${message.username}: ${message.content || "Data processed"}`,
						),
					);
				}
				break;
		}

		if (showPrompt && this.rl) {
			this.rl.prompt();
		}
	}
}

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log("Usage: bun run client.ts [username] [--server=url]");
	console.log(
		"Example: bun run client.ts Alice --server=http://192.168.1.100:3000",
	);
	process.exit(0);
}

const serverArg = process.argv.find((arg) => arg.startsWith("--server="));
const serverUrl = serverArg ? serverArg.split("=")[1] : SERVER_URL;

const client = new TerminalChatClient(serverUrl, USERNAME);
client.connect().catch(console.error);
