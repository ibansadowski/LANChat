<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createSocketClient } from '$lib/utils/socket-client';
	import {
		messages,
		users,
		agents,
		agentDecisions,
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
	let messagesContainer = $state<HTMLDivElement>();
	let usernameError = $state('');
	let usernameSuggestion = $state('');
	let validatingUsername = $state(false);
	let contextInfo = $state<{ totalPeers: number; peers: any[] } | null>(null);

	// Auto-scroll messages
	$effect(() => {
		if (messagesContainer && $messages.length > 0) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	async function validateUsername(name: string): Promise<{ valid: boolean; error?: string; sanitized?: string; message?: string }> {
		const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

		try {
			const response = await fetch(`${backendUrl}/api/validate-username`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: name })
			});

			return await response.json();
		} catch (error) {
			console.error('Validation error:', error);
			return { valid: false, error: 'Could not validate username. Server may be offline.' };
		}
	}

	async function joinChat() {
		if (!username.trim()) return;

		usernameError = '';
		usernameSuggestion = '';
		validatingUsername = true;

		// Validate username
		const validation = await validateUsername(username.trim());
		validatingUsername = false;

		if (!validation.valid) {
			usernameError = validation.error || 'Invalid username';
			if (validation.suggestion) {
				usernameSuggestion = validation.suggestion;
			}
			return;
		}

		// User's username is valid, connect
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
			if (message.metadata?.agentDecisions) {
				message.metadata.agentDecisions.forEach((decision: any) => {
					addAgentDecision({ ...decision, agentName: message.username });
				});
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

	async function loadContext() {
		const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
		try {
			const response = await fetch(`${backendUrl}/api/context`);
			if (response.ok) {
				contextInfo = await response.json();
			}
		} catch (error) {
			console.error('Failed to load context:', error);
		}
	}

	// Poll for context updates every 10 seconds
	$effect(() => {
		if (isJoined) {
			loadContext();
			const interval = setInterval(loadContext, 10000);
			return () => clearInterval(interval);
		}
	});

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
		if (message.metadata?.userType === 'agent') return 'agent';
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
				placeholder="Enter your username (letters, numbers, _, -)"
				onkeydown={(e) => e.key === 'Enter' && !validatingUsername && joinChat()}
				class:error={!!usernameError}
			/>
			<button onclick={joinChat} disabled={!username.trim() || validatingUsername}>
				{validatingUsername ? 'Checking...' : 'Join Chat'}
			</button>
			<div class="status">
				{#if usernameError}
					<span class="error">{usernameError}</span>
					{#if usernameSuggestion}
						<span class="suggestion">Try: {usernameSuggestion}</span>
					{/if}
				{:else if $connectionStatus === 'connecting'}
					<span class="connecting">Connecting...</span>
				{:else if $connectionStatus === 'error'}
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
				<h2>Participants ({$users.length + $agents.length})</h2>
			</div>
			<div class="panel-content">
				<div class="participant-section">
					<h3>Humans ({$users.length})</h3>
					<ul class="participant-list">
						{#each $users as user (user.id)}
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
					<h3>Agents ({$agents.length})</h3>
					<ul class="participant-list">
						{#each $agents as agent (agent.id)}
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
					<span class="status-indicator" class:connected={$connectionStatus === 'connected'}></span>
					<span class="session-id">Session: {$sessionId.substring(0, 8)}...</span>
				</div>
			</div>

			<div class="messages" bind:this={messagesContainer}>
				{#each $messages as message (message.id)}
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
					disabled={$connectionStatus !== 'connected'}
				/>
				<button onclick={sendMessage} disabled={!messageInput.trim() || $connectionStatus !== 'connected'}>
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
					<p class="session-full-id">{$sessionId}</p>
				</div>

				<div class="insight-section">
					<h3>Agent Activity</h3>
					{#if $agentDecisions.length === 0}
						<p class="placeholder">Agent decisions will appear here...</p>
					{:else}
						<div class="decisions-list">
							{#each $agentDecisions.slice(-10) as decision (decision.timestamp)}
								<div class="decision-item">
									<div class="decision-header">
										<span class="decision-agent">{decision.agentName}</span>
										<span class="decision-time">{formatTime(decision.timestamp)}</span>
									</div>
									<div class="decision-type">{decision.type.replace(/_/g, ' ')}</div>
									{#if decision.reason}
										<div class="decision-reason">{decision.reason}</div>
									{/if}
									{#if decision.confidence !== undefined}
										<div class="decision-confidence">
											Confidence: {Math.round(decision.confidence * 100)}%
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<div class="insight-section">
					<h3>Honcho Peers</h3>
					{#if !contextInfo}
						<p class="placeholder">Loading context...</p>
					{:else if contextInfo.totalPeers === 0}
						<p class="placeholder">No peers registered yet</p>
					{:else}
						<div class="context-summary">
							<div class="context-stat">
								<span class="stat-label">Total Peers:</span>
								<span class="stat-value">{contextInfo.totalPeers}</span>
							</div>
						</div>
						<div class="peers-list">
							{#each contextInfo.peers.slice(0, 10) as peer (peer.id)}
								<div class="peer-item">
									<div class="peer-id">{peer.id}</div>
									<div class="peer-date">Joined: {new Date(peer.createdAt).toLocaleDateString()}</div>
								</div>
							{/each}
						</div>
					{/if}
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

	.join-box input.error {
		border-color: #ff6b6b;
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

	.status .suggestion {
		display: block;
		color: var(--accent-primary);
		font-size: 0.75rem;
		margin-top: 0.25rem;
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

	.decisions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 400px;
		overflow-y: auto;
	}

	.decision-item {
		padding: 0.75rem;
		background: var(--bg-tertiary);
		border-radius: 4px;
		border-left: 3px solid var(--agent-color);
		font-size: 0.75rem;
	}

	.decision-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.decision-agent {
		font-weight: 600;
		color: var(--agent-color);
	}

	.decision-time {
		color: var(--text-dim);
		font-size: 0.625rem;
	}

	.decision-type {
		color: var(--accent-primary);
		text-transform: capitalize;
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.decision-reason {
		color: var(--text-secondary);
		font-size: 0.688rem;
		line-height: 1.4;
		margin-bottom: 0.25rem;
	}

	.decision-confidence {
		color: var(--text-dim);
		font-size: 0.625rem;
	}

	.context-summary {
		margin-bottom: 1rem;
	}

	.context-stat {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem;
		background: var(--bg-tertiary);
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.stat-label {
		color: var(--text-secondary);
	}

	.stat-value {
		color: var(--accent-primary);
		font-weight: 600;
	}

	.peers-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 300px;
		overflow-y: auto;
	}

	.peer-item {
		padding: 0.5rem;
		background: var(--bg-tertiary);
		border-radius: 4px;
		border-left: 2px solid var(--accent-secondary);
		font-size: 0.75rem;
	}

	.peer-id {
		color: var(--text-primary);
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.peer-date {
		color: var(--text-dim);
		font-size: 0.625rem;
	}
</style>
