import { io, Socket } from "socket.io-client";
import type { Message, UsersResponse, HistoryResponse, User, Agent } from "../types.js";

export interface ChatClientEvents {
  onConnect: () => void;
  onDisconnect: () => void;
  onMessage: (message: Message) => void;
  onConnectionError: (error: Error) => void;
  onUsersUpdate: (users: User[], agents: Agent[]) => void;
}

export class ChatSocketClient {
  private socket: Socket | null = null;
  private events: ChatClientEvents;
  private serverUrl: string;
  private username: string;
  private usersUpdateInterval: NodeJS.Timeout | null = null;
  
  constructor(serverUrl: string, username: string, events: ChatClientEvents) {
    this.serverUrl = serverUrl;
    this.username = username;
    this.events = events;
  }

  connect(): void {
    this.socket = io(this.serverUrl);
    
    this.socket.on("connect", () => {
      this.events.onConnect();
      this.socket!.emit("register", {
        username: this.username,
        type: "human",
      });
      this.startUsersUpdates();
    });

    this.socket.on("disconnect", () => {
      this.events.onDisconnect();
      this.stopUsersUpdates();
    });

    this.socket.on("message", (message: Message) => {
      this.events.onMessage(message);
    });

    this.socket.on("connect_error", (error: Error) => {
      this.events.onConnectionError(error);
    });
  }

  disconnect(): void {
    this.stopUsersUpdates();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(content: string): void {
    if (!this.socket) return;
    
    this.socket.emit("chat", {
      content,
      metadata: {
        clientType: "terminal",
      },
    });
  }

  getUsers(callback: (response: UsersResponse) => void): void {
    if (!this.socket) return;
    this.socket.emit("get_users", callback);
  }

  getHistory(limit: number, callback: (response: HistoryResponse) => void): void {
    if (!this.socket) return;
    this.socket.emit("get_history", { limit }, callback);
  }

  getDialectic(user: string, query: string, callback: (response: string) => void): void {
    if (!this.socket) return;
    this.socket.emit("dialectic", { user, query }, callback);
  }

  private startUsersUpdates(): void {
    if (this.usersUpdateInterval) return;
    
    const updateUsers = () => {
      this.getUsers((response: UsersResponse) => {
        if (!response.error) {
          this.events.onUsersUpdate(response.users as User[], response.agents as Agent[]);
        }
      });
    };

    updateUsers(); // Initial update
    this.usersUpdateInterval = setInterval(updateUsers, 5000);
  }

  private stopUsersUpdates(): void {
    if (this.usersUpdateInterval) {
      clearInterval(this.usersUpdateInterval);
      this.usersUpdateInterval = null;
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}