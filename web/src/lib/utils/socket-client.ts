import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';

export class SocketClient {
	private socket: Socket | null = null;
	private backendUrl: string;
	private username: string = '';
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;

	constructor(backendUrl: string) {
		this.backendUrl = backendUrl;
	}

	connect(username: string): Socket | null {
		if (!browser) return null;

		this.username = username;

		this.socket = io(this.backendUrl, {
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionAttempts: this.maxReconnectAttempts,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			timeout: 20000
		});

		this.socket.on('connect', () => {
			console.log('Connected to LANChat server');
			this.reconnectAttempts = 0;
			this.socket?.emit('register', {
				username: this.username,
				type: 'user'
			});
		});

		this.socket.on('connect_error', (error) => {
			console.error('Connection error:', error.message);
			this.reconnectAttempts++;
		});

		this.socket.on('disconnect', (reason) => {
			console.log('Disconnected:', reason);
		});

		return this.socket;
	}

	disconnect(): void {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
	}

	getSocket(): Socket | null {
		return this.socket;
	}

	isConnected(): boolean {
		return this.socket?.connected || false;
	}

	sendMessage(content: string): void {
		if (this.socket?.connected) {
			this.socket.emit('chat', { content });
		}
	}

	getHistory(limit: number = 50, callback: (data: any) => void): void {
		if (this.socket?.connected) {
			this.socket.emit('get_history', { limit }, callback);
		}
	}

	getUsers(callback: (data: any) => void): void {
		if (this.socket?.connected) {
			this.socket.emit('get_users', callback);
		}
	}

	toggleObserve(callback: (data: any) => void): void {
		if (this.socket?.connected) {
			this.socket.emit('toggle_observe', callback);
		}
	}
}

export function createSocketClient(backendUrl?: string): SocketClient {
	const url = backendUrl || import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
	return new SocketClient(url);
}
