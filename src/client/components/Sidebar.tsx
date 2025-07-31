import React from 'react';
import { Box, Text } from 'ink';
import type { User, Agent } from '../../types.js';

interface SidebarProps {
  users: User[];
  agents: Agent[];
}

export const Sidebar: React.FC<SidebarProps> = ({ users, agents }) => {
  return (
    <Box width={25} flexDirection="column" height="100%">
      <Box borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1} marginBottom={1} flexGrow={1}>
        <Box flexDirection="column">
          <Text color="yellow" bold>👥 Users ({users.length})</Text>
          {users.map(user => (
            <Text key={user.id} color="gray">
              • {user.username}
            </Text>
          ))}
          {users.length === 0 && (
            <Text color="gray">No users</Text>
          )}
        </Box>
      </Box>

      <Box borderStyle="round" borderColor="magenta" paddingX={1} paddingY={1} flexShrink={0}>
        <Box flexDirection="column">
          <Text color="magenta" bold>🤖 Agents ({agents.length})</Text>
          {agents.map(agent => (
            <Box key={agent.id} flexDirection="column">
              <Text color="gray">• {agent.username}</Text>
              {agent.capabilities.length > 0 && (
                <Text color="gray" dimColor>
                  [{agent.capabilities.join(', ')}]
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};