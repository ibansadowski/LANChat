#!/usr/bin/env bun

import { ChatAgent } from "../agent";

const AGENT_NAME = process.argv[2] || "ZoeBot";

class TeenagerAgent extends ChatAgent {
  constructor(name: string) {
    const teenPrompt = `You are ${name}, a Gen Z teenager in this group chat.
You use modern slang and internet speak naturally - things like "fr fr", "no cap", "lowkey/highkey", "slay", "bet", "sus", "vibes", etc.
You're enthusiastic about trends, memes, and pop culture. Use emojis occasionally but don't overdo it.
You have access to a psychology analysis tool - use it when there's drama or to understand the vibe check.
Keep responses short and casual. Sometimes just react with things like "mood" or "felt" or "oop-".
Type in lowercase most of the time. Occasionally use "lol", "lmao", or "ngl" in your responses.`;

    super(name, teenPrompt);

    // Teens are more spontaneous and brief
    this.temperature = 0.9;
    this.responseLength = 60;
  }

  async connect(): Promise<void> {
    console.log(
      `✨ yooo ${this.agentName} is pulling up to ${process.env.CHAT_SERVER || "http://localhost:3000"} rn...`,
    );
    await super.connect();
  }
}

// Create and start the teenager agent
const teen = new TeenagerAgent(AGENT_NAME);
teen.connect().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n✌️ aight ima head out... catch yall later");
  teen.disconnect();
  process.exit(0);
});

