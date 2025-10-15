import { writable, derived } from 'svelte/store';

export interface Message {
	id: string;
	type: 'chat' | 'agent_response' | 'system' | 'join' | 'leave' | 'agent_data';
	username: string;
	content: string;
	metadata: {
		timestamp: string;
		[key: string]: any;
	};
}

export interface User {
	id: string;
	username: string;
	type: string;
	observe_me?: boolean;
}

export interface Agent {
	id: string;
	username: string;
	type: string;
	capabilities: string[];
}

export interface AgentDecision {
	username: string;
	timestamp: string;
	decision: string;
	reason: string;
	confidence: number;
	toolUsed?: 'psychology' | 'search' | 'respond';
	result?: any;
}

export const messages = writable<Message[]>([]);
export const users = writable<User[]>([]);
export const agents = writable<Agent[]>([]);
export const agentDecisions = writable<AgentDecision[]>([]);
export const sessionId = writable<string>('');
export const connectionStatus = writable<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');

export const totalParticipants = derived(
	[users, agents],
	([$users, $agents]) => $users.length + $agents.length
);

export const chatMessages = derived(
	messages,
	($messages) => $messages.filter(m =>
		m.type === 'chat' || m.type === 'agent_response'
	)
);

export const systemMessages = derived(
	messages,
	($messages) => $messages.filter(m =>
		m.type === 'system' || m.type === 'join' || m.type === 'leave'
	)
);

export function addMessage(message: Message) {
	messages.update(msgs => [...msgs, message]);
}

export function setHistory(history: Message[]) {
	messages.set(history);
}

export function updateUsers(userData: User[]) {
	users.set(userData);
}

export function updateAgents(agentData: Agent[]) {
	agents.set(agentData);
}

export function addAgentDecision(decision: AgentDecision) {
	agentDecisions.update(decisions => [...decisions, decision].slice(-50)); // Keep last 50
}

export function clearMessages() {
	messages.set([]);
}
