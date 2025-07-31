import React, { useState, useEffect, useCallback } from 'react';
import { Box, useStdout } from 'ink';
import type { Message, User, Agent } from '../../types.js';
import { ChatSocketClient } from '../socket-client.js';
import { CommandHandler } from '../commands.js';
import { Header } from './Header.js';
import { ChatHistory } from './ChatHistory.js';
import { Sidebar } from './Sidebar.js';
import { ChatInput } from './ChatInput.js';

interface ChatClientProps {
  serverUrl: string;
  username: string;
}

export const ChatClient: React.FC<ChatClientProps> = ({ serverUrl, username }) => {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [client, setClient] = useState<ChatSocketClient | null>(null);
  const [commandHandler, setCommandHandler] = useState<CommandHandler | null>(null);
  const { stdout } = useStdout();

  // Initialize client and command handler
  useEffect(() => {
    const chatClient = new ChatSocketClient(serverUrl, username, {
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onMessage: (message: Message) => {
        setMessages(prev => [...prev, message].slice(-100)); // Keep last 100 messages
      },
      onConnectionError: (error: Error) => {
        const errorMessage: Message = {
          id: Date.now().toString(),
          type: 'system',
          username: 'System',
          content: `Connection failed: ${error.message}`,
          metadata: { timestamp: new Date().toISOString() }
        };
        setMessages(prev => [...prev, errorMessage]);
      },
      onUsersUpdate: (newUsers: User[], newAgents: Agent[]) => {
        setUsers(newUsers);
        setAgents(newAgents);
      }
    });

    const cmdHandler = new CommandHandler({
      client: chatClient,
      onMessage: (message: Message) => {
        setMessages(prev => [...prev, message]);
      },
      onExit: () => {
        process.exit(0);
      }
    });

    setClient(chatClient);
    setCommandHandler(cmdHandler);
    chatClient.connect();

    return () => {
      chatClient.disconnect();
    };
  }, [serverUrl, username]);

  const handleInput = useCallback((value: string) => {
    if (!client || !commandHandler || !value.trim()) return;

    if (value.startsWith('/')) {
      commandHandler.handleCommand(value);
    } else {
      client.sendMessage(value);
    }
  }, [client, commandHandler]);

  const getAutocompleteOptions = useCallback((input: string) => {
    return commandHandler?.getAutocompleteOptions(input) || [];
  }, [commandHandler]);

  return (
    <Box flexDirection="column" width="100%" height={(stdout.rows || 24) - 1}>
      <Header connected={connected} username={username} serverUrl={serverUrl} />

      {/* Main content area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Chat messages */}
        <Box flexGrow={1} flexDirection="column" paddingRight={1}>
          <ChatHistory messages={messages} currentUsername={username} />
        </Box>

        {/* Sidebar */}
        <Sidebar users={users} agents={agents} />
      </Box>

      {/* Input area */}
      <ChatInput onSubmit={handleInput} getAutocompleteOptions={getAutocompleteOptions} />
    </Box>
  );
};