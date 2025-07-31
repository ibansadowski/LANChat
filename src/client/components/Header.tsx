import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';

interface HeaderProps {
  connected: boolean;
  username: string;
  serverUrl: string;
}

export const Header: React.FC<HeaderProps> = ({ connected, username, serverUrl }) => {
  return (
    <Box marginY={1} flexShrink={0}>
      <Text color={connected ? "green" : "red"}>
        {connected ? `✓ Connected as ${username}` : "⚠ Disconnected"}
      </Text>
      <Text color="gray"> | Server: {serverUrl}</Text>
    </Box>
  );
};