<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createSocketClient } from '$lib/utils/socket-client';
	import {
		messages,
		users,
		agents,
		sessionId,
		connectionStatus,
		addMessage,
		setHistory,
		updateUsers,
		updateAgents,
		addAgentDecision
	} from '$lib/stores/chat';
	import type { Socket } from 'socket.io-client';
	import type { Message, User, Agent } from '$lib/stores/chat';

	let username = $state('');
	let isJoined = $state(false);
	let socket: Socket | null = null;
	let socketClient = createSocketClient();
	let messageInput = $state('');
	let messagesContainer: HTMLDivElement | undefined;

	// Reactive state using $state
	let currentMessages = $state<Message[]>([]);
	let currentUsers = $state<User[]>([]);
	let currentAgents = $state<Agent[]>([]);
	let connected = $state<'connected' | 'disconnected' | 'connecting' | 'error'>('disconnected');
	let currentSessionId = $state('');

	// Subscribe to stores
	$effect(() => {
		const unsubMessages = messages.subscribe(m => { currentMessages = m; });
		const unsubUsers = users.subscribe(u => { currentUsers = u; });
		const unsubAgents = agents.subscribe(a => { currentAgents = a; });
		const unsubStatus = connectionStatus.subscribe(s => { connected = s; });
		const unsubSession = sessionId.subscribe(s => { currentSessionId = s; });

		return () => {
			unsubMessages();
			unsubUsers();
			unsubAgents();
			unsubStatus();
			unsubSession();
		};
	});

	// Auto-scroll messages
	$effect(() => {
		if (messagesContainer && currentMessages.length > 0) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	function joinChat() {
		if (!username.trim()) return;

		connectionStatus.set('connecting');
		socket = socketClient.connect(username.trim());

		if (!socket) {
			connectionStatus.set('error');
			return;
		}

		socket.on('connect', () => {
			connectionStatus.set('connected');
			isJoined = true;

			// Load history
			socketClient.getHistory(100, (data: any) => {
				if (data.history) {
					setHistory(data.history);
				}
			});

			// Load users
			loadUsers();
		});

		socket.on('message', (message: Message) => {
			addMessage(message);

			// Track agent decisions
			if (message.metadata?.agentDecision) {
				addAgentDecision(message.metadata.agentDecision);
			}
		});

		socket.on('history', (history: Message[]) => {
			setHistory(history);
		});

		socket.on('session_id', (id: string) => {
			sessionId.set(id);
		});

		socket.on('disconnect', () => {
			connectionStatus.set('disconnected');
		});

		socket.on('connect_error', () => {
			connectionStatus.set('error');
		});
	}

	function loadUsers() {
		socketClient.getUsers((data: any) => {
			if (data.users) updateUsers(data.users);
			if (data.agents) updateAgents(data.agents);
		});
	}

	function sendMessage() {
		if (!messageInput.trim() || !socket) return;

		socketClient.sendMessage(messageInput.trim());
		messageInput = '';
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
	}

	function getMessageClass(message: Message): string {
		if (message.type === 'agent_response') return 'agent';
		if (message.type === 'system' || message.type === 'join' || message.type === 'leave') return 'system';
		return 'user';
	}

	onDestroy(() => {
		if (socket) {
			socketClient.disconnect();
		}
	});
</script>

<svelte:head>
	<title>LANChat - AI Group Chat</title>
</svelte:head>

{#if !isJoined}
	<div class="join-screen">
		<div class="join-box">
			<h1>LANChat</h1>
			<p>Group chat with AI agents powered by Honcho</p>
			<input
				type="text"
				bind:value={username}
				placeholder="Enter your username"
				onkeydown={(e) => e.key === 'Enter' && joinChat()}
			/>
			<button onclick={joinChat} disabled={!username.trim()}>
				Join Chat
			</button>
			<div class="status">
				{#if connected === 'connecting'}
					<span class="connecting">Connecting...</span>
				{:else if connected === 'error'}
					<span class="error">Connection error</span>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="container">
		<!-- Left Sidebar: Users & Agents -->
		<div class="sidebar">
			<div class="panel-header">
				<h2>Participants ({currentUsers.length + currentAgents.length})</h2>
			</div>
			<div class="panel-content">
				<div class="participant-section">
					<h3>Humans ({currentUsers.length})</h3>
					<ul class="participant-list">
						{#each currentUsers as user (user.id)}
							<li class="participant user">
								<span class="indicator"></span>
								{user.username}
								{#if user.observe_me === false}
									<span class="badge">unobserved</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>

				<div class="participant-section">
					<h3>Agents ({currentAgents.length})</h3>
					<ul class="participant-list">
						{#each currentAgents as agent (agent.id)}
							<li class="participant agent">
								<span class="indicator"></span>
								{agent.username}
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>

		<!-- Main Chat Area -->
		<div class="main-chat">
			<div class="chat-header">
				<h1>LANChat</h1>
				<div class="header-info">
					<span class="status-indicator" class:connected={connected === 'connected'}></span>
					<span class="session-id">Session: {currentSessionId.substring(0, 8)}...</span>
				</div>
			</div>

			<div class="messages" bind:this={messagesContainer}>
				{#each currentMessages as message (message.id)}
					<div class="message {getMessageClass(message)}">
						<div class="message-header">
							<span class="username">{message.username}</span>
							<span class="timestamp">{formatTime(message.metadata.timestamp)}</span>
						</div>
						<div class="message-content">{message.content}</div>
					</div>
				{/each}
			</div>

			<div class="chat-input">
				<input
					type="text"
					bind:value={messageInput}
					onkeydown={handleKeyPress}
					placeholder="Type a message..."
					disabled={connected !== 'connected'}
				/>
				<button onclick={sendMessage} disabled={!messageInput.trim() || connected !== 'connected'}>
					Send
				</button>
			</div>
		</div>

		<!-- Right Sidebar: Insights -->
		<div class="insights-panel">
			<div class="panel-header">
				<h2>Honcho Insights</h2>
			</div>
			<div class="panel-content">
				<div class="insight-section">
					<h3>Session</h3>
					<p class="session-full-id">{currentSessionId}</p>
				</div>

				<div class="insight-section">
					<h3>Agent Activity</h3>
					<p class="placeholder">Agent decisions will appear here...</p>
				</div>

				<div class="insight-section">
					<h3>Context</h3>
					<p class="placeholder">Context visualization coming soon...</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.join-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--bg-primary);
	}

	.join-box {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 2rem;
		width: 100%;
		max-width: 400px;
		text-align: center;
	}

	.join-box h1 {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		color: var(--accent-primary);
	}

	.join-box p {
		color: var(--text-secondary);
		margin-bottom: 2rem;
		font-size: 0.875rem;
	}

	.join-box input {
		margin-bottom: 1rem;
	}

	.join-box button {
		width: 100%;
	}

	.status {
		margin-top: 1rem;
		min-height: 1.5rem;
	}

	.status .connecting {
		color: var(--accent-secondary);
	}

	.status .error {
		color: #ff6b6b;
	}

	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
		background: var(--bg-secondary);
	}

	.chat-header h1 {
		font-size: 1.25rem;
		color: var(--accent-primary);
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--text-dim);
	}

	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ff6b6b;
	}

	.status-indicator.connected {
		background: var(--accent-primary);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.message {
		margin-bottom: 1rem;
		padding: 0.75rem;
		border-radius: 4px;
		background: var(--bg-secondary);
		border-left: 3px solid var(--user-color);
	}

	.message.agent {
		border-left-color: var(--agent-color);
		background: rgba(255, 107, 107, 0.05);
	}

	.message.system {
		border-left-color: var(--system-color);
		background: rgba(255, 217, 61, 0.05);
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.message-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
	}

	.username {
		font-weight: 600;
		color: var(--text-primary);
	}

	.timestamp {
		color: var(--text-dim);
	}

	.message-content {
		color: var(--text-primary);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.chat-input {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-top: 1px solid var(--border-color);
		background: var(--bg-secondary);
	}

	.chat-input input {
		flex: 1;
	}

	.participant-section {
		margin-bottom: 1.5rem;
	}

	.participant-section h3 {
		font-size: 0.75rem;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.participant-list {
		list-style: none;
	}

	.participant {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
		transition: background 0.2s;
	}

	.participant:hover {
		background: var(--bg-tertiary);
	}

	.participant .indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-primary);
	}

	.participant.agent .indicator {
		background: var(--agent-color);
	}

	.badge {
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: var(--bg-tertiary);
		border-radius: 3px;
		color: var(--text-dim);
		margin-left: auto;
	}

	.insight-section {
		margin-bottom: 1.5rem;
	}

	.insight-section h3 {
		font-size: 0.75rem;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.session-full-id {
		font-size: 0.75rem;
		color: var(--text-secondary);
		word-break: break-all;
		font-family: inherit;
	}

	.placeholder {
		font-size: 0.875rem;
		color: var(--text-dim);
		font-style: italic;
	}
</style>
