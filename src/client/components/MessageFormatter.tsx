import React from 'react';
import { Text } from 'ink';
import type { Message } from '../../types.js';

interface MessageFormatterProps {
  message: Message;
  currentUsername: string;
}

export const MessageFormatter: React.FC<MessageFormatterProps> = ({ message, currentUsername }) => {
  let timestamp = new Date(message.metadata.timestamp).toLocaleTimeString();
  if (timestamp === "Invalid Date") {
    timestamp = message.metadata.timestamp;
  }
  
  switch (message.type) {
    case "chat":
      if (message.username === currentUsername) {
        return (
          <Text key={message.id} color="yellow">
            [{timestamp}] {message.username}: {message.content}
          </Text>
        );
      } else {
        return (
          <Text key={message.id} color="green">
            [{timestamp}] {message.username}: {message.content}
          </Text>
        );
      }
    case "agent_response":
      const confidence = message.metadata.confidence
        ? ` (${Math.round(message.metadata.confidence * 100)}%)`
        : "";
      return (
        <Text key={message.id} color="magenta">
          [{timestamp}] 🤖 {message.username}{confidence}: {message.content}
        </Text>
      );
    case "system":
    case "join":
    case "leave":
      return (
        <Text key={message.id} color="gray">
          [{timestamp}] * {message.content}
        </Text>
      );
    case "agent_data":
      if (message.metadata.broadcast !== false) {
        return (
          <Text key={message.id} color="cyan">
            [{timestamp}] 📊 {message.username}: {message.content || "Data processed"}
          </Text>
        );
      }
      return null;
    default:
      return (
        <Text key={message.id}>
          [{timestamp}] {message.username}: {message.content}
        </Text>
      );
  }
};