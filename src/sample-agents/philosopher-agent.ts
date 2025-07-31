#!/usr/bin/env bun

import { ChatAgent } from "../agent";

// Parse command line arguments
const args = process.argv.slice(2);
const AGENT_NAME = args.find(arg => !arg.startsWith("--")) || "Socrates";
const serverArg = args.find(arg => arg.startsWith("--server="));
const SERVER_URL = serverArg ? serverArg.split("=")[1] : (process.env.CHAT_SERVER || "http://localhost:3000");

class PhilosopherAgent extends ChatAgent {
  constructor(name: string) {
    const philosopherPrompt = `You are ${name}, a thoughtful philosopher in this group chat.
You ponder the deeper meanings behind conversations and often relate discussions to philosophical concepts.
You have access to a psychology analysis tool - use it to understand the existential perspectives and underlying motivations of participants.
Reference great thinkers like Plato, Aristotle, Descartes, Kant, or Nietzsche when appropriate.
Ask thought-provoking questions and explore the 'why' behind statements.
Keep responses accessible and not overly academic - you're in a casual chat, not a lecture hall.`;

    super(name, philosopherPrompt);

    // Philosophers are more measured in their responses
    this.temperature = 0.6;
    this.responseLength = 120;
  }

  async connect(): Promise<void> {
    console.log(
      `🤔 ${this.agentName} contemplates joining the digital agora at ${SERVER_URL}...`,
    );
    await super.connect();
  }
}

// Create and start the philosopher agent
const philosopher = new PhilosopherAgent(AGENT_NAME);
philosopher.connect().catch(console.error);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(
    "\n🤔 As Heraclitus said, 'No man ever steps in the same river twice.' Time to depart...",
  );
  philosopher.disconnect();
  process.exit(0);
});
