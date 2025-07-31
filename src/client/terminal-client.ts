#!/usr/bin/env bun
import * as readline from 'readline';
import chalk from 'chalk';
import type { Message, User } from '../types.ts';
import { ChatSocketClient } from './socket-client.ts';
import { CommandHandler } from './commands.ts';

interface TerminalClientOptions {
  serverUrl: string;
  username: string;
}

export class TerminalClient {
  private client: ChatSocketClient;
  private commandHandler: CommandHandler;
  private rl: readline.Interface;
  private connected = false;
  private username: string;

  constructor({ serverUrl, username }: TerminalClientOptions) {
    this.username = username;
    // Initialize Socket.IO client
    this.client = new ChatSocketClient(serverUrl, username, {
      onConnect: () => {
        this.connected = true;
        this.printMessage('system', 'System', `Connected to ${serverUrl} as ${username}`);

        // Fetch message history when connected
        this.client.getHistory(50, (response) => {
          if (!response.error && response.history) {
            console.log(chalk.dim('\n--- Chat History ---'));
            response.history.forEach(msg => this.printMessage(msg.type, msg.username, msg.content, true));
            console.log(chalk.dim('--- End History ---\n'));
          }
        });

        setTimeout(() => {
          this.updatePrompt();
        }, 50);
      },
      onDisconnect: () => {
        this.connected = false;
        this.printMessage('system', 'System', 'Disconnected from server');
        this.updatePrompt();
      },
      onMessage: (message: Message) => {
        this.printMessage(message.type, message.username, message.content);
      },
      onConnectionError: (error: Error) => {
        this.printMessage('system', 'System', `Connection failed: ${error.message}`);
      },
      onUsersUpdate: (users: User[]) => {
        // Could show user count in prompt or handle elsewhere
      }
    });

    // Initialize command handler
    this.commandHandler = new CommandHandler({
      client: this.client,
      onMessage: (message: Message) => {
        this.printMessage(message.type, message.username, message.content);
      },
      onExit: () => {
        console.log(chalk.yellow('\nGoodbye!'));
        this.cleanup();
        process.exit(0);
      }
    });

    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      completer: (line: string) => {
        const completions = this.commandHandler.getAutocompleteOptions(line);
        return [completions, line];
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.rl.on('line', (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      if (trimmed.startsWith('/')) {
        this.commandHandler.handleCommand(trimmed);
      } else {
        this.client.sendMessage(trimmed);
      }

      this.rl.prompt();
    });

    this.rl.on('SIGINT', () => {
      setTimeout(() => process.exit(0), 50);
    });

    // Handle window resize
    process.stdout.on('resize', () => {
      this.rl.setPrompt(this.getPrompt());
    });
  }

  private printMessage(type: string, username: string, content: string, history: boolean = false) {
    // Clear the current line and move cursor to beginning
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Format and print the message
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let formattedMessage = '';

    switch (type) {
      case 'system':
        formattedMessage = chalk.dim(`[${timestamp}] `) + chalk.yellow(content);
        break;
      case 'join':
        formattedMessage = chalk.dim(`[${timestamp}] `) + chalk.green(content);
        break;
      case 'leave':
        formattedMessage = chalk.dim(`[${timestamp}] `) + chalk.red(content);
        break;
      case 'agent_response':
        formattedMessage = chalk.dim(`[${timestamp}] `) + chalk.magenta(`${username}: `) + content;
        break;
      default:
        formattedMessage = chalk.dim(`[${timestamp}] `) + chalk.cyan(`${username}: `) + content;
    }

    console.log(formattedMessage);

    if (!history) {
      // Redraw the prompt and current input
      this.rl.prompt(true);
    }
  }

  private getPrompt(): string {
    const status = this.connected ? chalk.green('●') : chalk.red('●');
    return `${status} ${this.username} > `;
  }

  private updatePrompt() {
    this.rl.setPrompt(this.getPrompt());
    this.rl.prompt();
  }

  public start() {
    console.log(chalk.bold.blue('🚀 GroupChat Terminal Client'));
    console.log(chalk.dim('Type /help for commands, Ctrl+C or /quit to exit\n'));

    this.client.connect();
  }

  private cleanup() {
    this.rl.close();
    this.client.disconnect();
  }
}

// Main execution
if (import.meta.main) {
  const SERVER_URL = "http://localhost:3000";
  const USERNAME = process.argv[2] || `User${Math.floor(Math.random() * 1000)}`;

  // Handle command line arguments
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: bun run terminal-client [username] [--server=url]");
    console.log("Example: bun run terminal-client Alice --server=http://192.168.1.100:3000");
    process.exit(0);
  }

  const serverArg = process.argv.find((arg) => arg.startsWith("--server="));
  const serverUrl = serverArg ? serverArg.split("=")[1] ?? SERVER_URL : SERVER_URL;

  const client = new TerminalClient({ serverUrl, username: USERNAME });
  client.start();

  // Graceful shutdown
  process.on('SIGTERM', () => client['cleanup']());
  process.on('SIGINT', () => {
    setTimeout(() => process.exit(1), 50);
  });
}