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
  messageId: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, currentUsername }) => {
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Get terminal dimensions with safe defaults
  const terminalWidth = Math.max(20, (stdout?.columns || 80) - 4); // Account for borders
  const terminalHeight = Math.max(5, (stdout?.rows || 24) - 6); // Account for input area and borders

  /**
   * Format a message into display text and color
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
        return null;
      default:
        return {
          text: `[${timestamp}] ${message.username}: ${message.content}`,
          color: "white"
        };
    }
  };

  /**
   * Wrap text to fit terminal width with proper word wrapping
   */
  const wrapText = (text: string, width: number): string[] => {
    if (!text || width <= 0) return [''];
    
    const lines: string[] = [];
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      // If adding this word would exceed width
      if (currentLine.length + word.length + (currentLine ? 1 : 0) > width) {
        // If current line has content, push it and start new line
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is longer than width, break it
          if (word.length > width) {
            let remaining = word;
            while (remaining.length > width) {
              lines.push(remaining.slice(0, width));
              remaining = remaining.slice(width);
            }
            currentLine = remaining;
          } else {
            currentLine = word;
          }
        }
      } else {
        // Add word to current line
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }

    // Don't forget the last line
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  };

  /**
   * Convert all messages to display lines
   */
  const displayLines = useMemo((): DisplayLine[] => {
    const lines: DisplayLine[] = [];
    
    for (const message of messages) {
      const formatted = formatMessage(message);
      if (formatted) {
        const wrappedLines = wrapText(formatted.text, terminalWidth);
        for (const line of wrappedLines) {
          lines.push({
            text: line,
            color: formatted.color,
            messageId: message.id
          });
        }
      }
    }
    
    return lines;
  }, [messages, terminalWidth, currentUsername]);

  /**
   * Get visible lines based on current scroll position
   */
  const visibleLines = useMemo((): DisplayLine[] => {
    const totalLines = displayLines.length;
    const maxScrollOffset = Math.max(0, totalLines - terminalHeight);
    const actualScrollOffset = Math.min(scrollOffset, maxScrollOffset);
    
    const startIndex = Math.max(0, totalLines - terminalHeight - actualScrollOffset);
    const endIndex = totalLines - actualScrollOffset;
    
    return displayLines.slice(startIndex, endIndex);
  }, [displayLines, scrollOffset, terminalHeight]);

  // Auto-scroll to bottom when new messages arrive (unless user is scrolling)
  useEffect(() => {
    if (!isUserScrolling) {
      setScrollOffset(0);
    }
  }, [displayLines.length, isUserScrolling]);

  // Handle arrow key input for scrolling
  useInput((input, key) => {
    const maxScrollOffset = Math.max(0, displayLines.length - terminalHeight);
    
    if (key.upArrow) {
      setIsUserScrolling(true);
      setScrollOffset(prev => Math.min(maxScrollOffset, prev + 1));
    } else if (key.downArrow) {
      const newOffset = Math.max(0, scrollOffset - 1);
      setScrollOffset(newOffset);
      
      // If scrolled to bottom, resume auto-scroll
      if (newOffset === 0) {
        setIsUserScrolling(false);
      }
    }
  });

  return (
    <Box 
      borderStyle="round" 
      borderColor="blue" 
      paddingX={1} 
      paddingY={0}
      flexGrow={1}
      height={terminalHeight + 2} // Account for borders
    >
      <Box flexDirection="column" width="100%">
        {visibleLines.length === 0 ? (
          <Text color="gray">No messages yet. Type something to start chatting!</Text>
        ) : (
          visibleLines.map((line, index) => (
            <Text key={`${line.messageId}-${index}`} color={line.color}>
              {line.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
};