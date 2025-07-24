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
			console.log(chalk.green("Connected to chat server!"));

			// Register with server
			this.socket!.emit("register", {
				username: this.username,
				type: "human",
			});

			this.setupReadline();
		});

		this.socket.on("disconnect", () => {
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
			this.pausePrompt();
			if (history.length === 0) {
				console.log(chalk.yellow("--- No chat history yet ---"));
			} else {
				console.log(chalk.yellow("--- Chat History ---"));
				history.forEach((msg) => this.displayMessage(msg, false));
				console.log(chalk.yellow("--- End History ---"));
			}
			this.resumePrompt();
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
			terminal: true,
		});

		this.rl.prompt();

		this.rl.on("line", (input: string) => {
			const trimmed = input.trim();

			// Move cursor up one line and clear it (removes the input line)
			process.stdout.write('\u001b[1A'); // Move cursor up one line
			readline.clearLine(process.stdout, 0); // Clear the line
			readline.cursorTo(process.stdout, 0); // Move cursor to start

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
		const cmd = parts[0]?.toLowerCase();

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
						this.printWithoutPrompt(chalk.red("Error: " + response.error));
					} else {
						this.pausePrompt();
						console.log(chalk.cyan("\n--- Connected Users ---"));
						response.users.forEach((user) => {
							console.log(chalk.gray(`  ${user.username} (${user.type})`));
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
						this.resumePrompt();
					}
				});
				break;
			case "/history":
				const limit = parseInt(parts[1] ?? "20");
				this.socket!.emit(
					"get_history",
					{ limit },
					(response: HistoryResponse) => {
						if (response.error) {
							this.printWithoutPrompt(chalk.red("Error: " + response.error));
						} else {
							this.pausePrompt();
							console.log(
								chalk.yellow(
									`\n--- Last ${response.history.length} Messages ---`,
								),
							);
							response.history.forEach((msg) =>
								this.displayMessage(msg, false),
							);
							console.log(chalk.yellow("--- End History ---\n"));
							this.resumePrompt();
						}
					},
				);
				break;
			case "/dialectic":
				const query = parts.slice(2).join(" ");
				this.socket!.emit("dialectic", { user: parts[1], query }, (response: string) => {
					this.pausePrompt();
					console.log(
						chalk.yellow(
							`\n--- Dialectic Chat Output ---`,
						),
					);
					console.log(chalk.yellow(response));
					console.log(chalk.yellow("--- End Dialectic Output ---\n"));
					this.resumePrompt();
				});
				break;
			default:
				this.printWithoutPrompt(
					chalk.red(
						`Unknown command: ${cmd}. Type /help for available commands.`,
					),
				);
		}
	}

	private showHelp(): void {
		this.pausePrompt();
		console.log(chalk.cyan("\n--- Available Commands ---"));
		console.log(chalk.gray("/help     - Show this help message"));
		console.log(chalk.gray("/users    - List connected users and agents"));
		console.log(
			chalk.gray("/history [n] - Show last n messages (default: 20)"),
		);
		console.log(chalk.gray("/quit     - Exit the chat"));
		console.log(chalk.gray("Type any message to send it to the chat."));
		console.log("");
		this.resumePrompt();
	}

	private displayMessage(message: Message, showPrompt: boolean = true): void {
		const timestamp = new Date(message.metadata.timestamp).toLocaleTimeString();
		let messageText = "";

		switch (message.type) {
			case "chat":
				if (message.username === this.username) {
					messageText = chalk.yellow(`[${timestamp}] ${message.username}: ${message.content}`);
				} else {
					messageText = chalk.green(
						`[${timestamp}] ${message.username}: ${message.content}`,
					);
				}
				break;
			case "agent_response":
				const confidence = message.metadata.confidence
					? ` (${Math.round(message.metadata.confidence * 100)}%)`
					: "";
				messageText = chalk.magenta(
					`[${timestamp}] 🤖 ${message.username}${confidence}: ${message.content}`,
				);
				break;
			case "system":
			case "join":
			case "leave":
				messageText = chalk.gray(`[${timestamp}] * ${message.content}`);
				break;
			case "agent_data":
				if (message.metadata.broadcast !== false) {
					messageText = chalk.cyan(
						`[${timestamp}] 📊 ${message.username}: ${message.content || "Data processed"}`,
					);
				}
				break;
		}

		if (messageText) {
			if (showPrompt) {
				this.printWithoutPrompt(messageText);
			} else {
				console.log(messageText);
			}
		}
	}

	/**
	 * Pauses the readline interface and clears the current prompt line
	 */
	private pausePrompt(): void {
		if (this.rl) {
			readline.clearLine(process.stdout, 0);
			readline.cursorTo(process.stdout, 0);
		}
	}

	/**
	 * Resumes the readline interface and shows the prompt
	 */
	private resumePrompt(): void {
		if (this.rl) {
			this.rl.prompt();
		}
	}

	/**
	 * Prints content without interfering with the readline prompt
	 */
	private printWithoutPrompt(content: string): void {
		this.pausePrompt();
		console.log(content);
		this.resumePrompt();
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
const serverUrl = serverArg ? serverArg.split("=")[1] ?? SERVER_URL : SERVER_URL;

const client = new TerminalChatClient(serverUrl, USERNAME);
client.connect().catch(console.error);
