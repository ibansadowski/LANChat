#!/usr/bin/env bun
import { render } from 'ink';
import { ChatClient } from './components/ChatClient.js';

// Configuration
const SERVER_URL = Bun.env.CHAT_SERVER || "http://localhost:3000";
const USERNAME = process.argv[2] || `User${Math.floor(Math.random() * 1000)}`;

// Handle command line arguments
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: bun run client [username] [--server=url]");
  console.log("Example: bun run client Alice --server=http://192.168.1.100:3000");
  process.exit(0);
}

const serverArg = process.argv.find((arg) => arg.startsWith("--server="));
const serverUrl = serverArg ? serverArg.split("=")[1] ?? SERVER_URL : SERVER_URL;

// Update SERVER_URL if provided via command line
if (serverUrl !== SERVER_URL) {
  process.env.CHAT_SERVER = serverUrl;
}

render(<ChatClient serverUrl={serverUrl} username={USERNAME} />, {
  exitOnCtrlC: true
});