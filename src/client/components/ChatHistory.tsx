import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Message } from '../../types.js';

interface ChatHistoryProps {
  messages: Message[];
  currentUsername: string;
}

interface DisplayLine {
  text: string;
  color: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, currentUsername }) => {
  const { stdout } = useStdout();
  const [scrollLineOffset, setScrollLineOffset] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  /**
   * Convert a message to formatted text with color
   */
  const formatMessage = (message: Message): { text: string; color: string } | null => {
    let timestamp = new Date(message.metadata.timestamp).toLocaleTimeString();
    if (timestamp === "Invalid Date") {
      timestamp = message.metadata.timestamp;
    }
    
    switch (message.type) {
      case "chat":
        const chatColor = message.username === currentUsername ? "yellow" : "green";
        return {
          text: `[${timestamp}] ${message.username}: ${message.content}`,
          color: chatColor
        };
      case "agent_response":
        const confidence = message.metadata.confidence
          ? ` (${Math.round(message.metadata.confidence * 100)}%)`
          : "";
        return {
          text: `[${timestamp}] 🤖 ${message.username}${confidence}: ${message.content}`,
          color: "magenta"
        };
      case "system":
      case "join":
      case "leave":
        return {
          text: `[${timestamp}] * ${message.content}`,
          color: "gray"
        };
      case "agent_data":
        if (message.metadata.broadcast !== false) {
          return {
            text: `[${timestamp}] 📊 ${message.username}: ${message.content || "Data processed"}`,
            color: "cyan"
          };
        }
        return null; // Hidden message
      default:
        return {
          text: `[${timestamp}] ${message.username}: ${message.content}`,
          color: "white"
        };
    }
  };

  /**
   * Break text into lines that fit within terminal width, padding each line to full width
   */
  const breakIntoLines = (text: string, color: string): DisplayLine[] => {
    const terminalWidth = (stdout.columns || 80) - 4; // Account for border and padding
    const lines: DisplayLine[] = [];
    
    for (let i = 0; i < text.length; i += terminalWidth) {
      const lineText = text.slice(i, i + terminalWidth);
      // Pad the line to full width to clear any leftover characters
      const paddedText = lineText.padEnd(terminalWidth, ' ');
      lines.push({
        text: paddedText,
        color
      });
    }
    
    return lines.length > 0 ? lines : [{ text: ''.padEnd(terminalWidth, ' '), color }];
  };

  /**
   * Convert all messages to display lines
   */
  const displayLines = useMemo((): DisplayLine[] => {
    const lines: DisplayLine[] = [];
    
    for (const message of messages) {
      const formatted = formatMessage(message);
      if (formatted) {
        const messageLines = breakIntoLines(formatted.text, formatted.color);
        lines.push(...messageLines);
      }
    }
    
    return lines;
  }, [messages, stdout.columns, currentUsername]);

  const availableLines = Math.max(3, stdout.rows - 6); // Account for border and input area

  /**
   * Get visible lines based on scroll position, ensuring we never exceed available space
   */
  const visibleLines = useMemo((): DisplayLine[] => {
    const startIndex = Math.max(0, scrollLineOffset);
    const endIndex = Math.min(displayLines.length, startIndex + availableLines);
    return displayLines.slice(startIndex, endIndex);
  }, [displayLines, scrollLineOffset, availableLines]);

  // Auto-scroll to show latest lines when new ones arrive
  useEffect(() => {
    if (!isUserScrolling && displayLines.length > availableLines) {
      setScrollLineOffset(Math.max(0, displayLines.length - availableLines));
    }
  }, [displayLines.length, availableLines, isUserScrolling]);

  // Handle arrow keys for scrolling by lines
  useInput((input, key) => {
    if (key.upArrow && scrollLineOffset > 0) {
      setIsUserScrolling(true);
      setScrollLineOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      const maxOffset = Math.max(0, displayLines.length - availableLines);
      const newOffset = Math.min(maxOffset, scrollLineOffset + 1);
      setScrollLineOffset(newOffset);
      // If we scrolled to the very bottom, resume auto-scroll
      if (newOffset === maxOffset) {
        setIsUserScrolling(false);
      }
    }
  });

  return (
    <Box borderStyle="round" borderColor="blue" paddingX={1} paddingY={1} flexGrow={1}>
      <Box flexDirection="column">
        {visibleLines.length === 0 ? (
          <Text color="gray">No messages yet. Type something to start chatting!</Text>
        ) : (
          visibleLines.map((line, index) => 
            <Text key={`line-${scrollLineOffset + index}`} color={line.color}>
              {line.text}
            </Text>
          )
        )}
      </Box>
    </Box>
  );
};