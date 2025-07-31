import React from 'react';
import { Box, Text } from 'ink';
import type { User, Agent } from '../../types.js';

interface SidebarProps {
  users: User[];
}

export const Sidebar: React.FC<SidebarProps> = ({ users }) => {
  return (
    <Box width={25} flexDirection="column" height="100%">
      <Box borderStyle="round" borderColor="yellow" paddingX={1} paddingY={1} flexGrow={1}>
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
    </Box>
  );
};