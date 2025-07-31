import React from 'react';
import { Box, Text } from 'ink';
import type { Message } from '../../types.js';
import { MessageFormatter } from './MessageFormatter.js';

interface ChatHistoryProps {
  messages: Message[];
  currentUsername: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, currentUsername }) => {
  const visibleMessages = messages.slice(-10); // Show last 10 messages

  return (
    <Box borderStyle="round" borderColor="blue" paddingX={1} paddingY={1} flexGrow={1} height="100%">
      <Box flexDirection="column" gap={0} overflow="hidden">
        {visibleMessages.length === 0 ? (
          <Text color="gray">No messages yet. Type something to start chatting!</Text>
        ) : (
          visibleMessages.map(message => 
            <MessageFormatter 
              key={message.id} 
              message={message} 
              currentUsername={currentUsername} 
            />
          ).filter(Boolean)
        )}
      </Box>
    </Box>
  );
};