import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Command } from '../commands.js';

interface ChatInputProps {
  onSubmit: (value: string) => void;
  getAutocompleteOptions: (input: string) => Command[];
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, getAutocompleteOptions }) => {
  const [currentInput, setCurrentInput] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<Command[]>([]);

  const handleChange = (value: string) => {
    setCurrentInput(value);
    const shouldShow = value.startsWith('/') && value.length > 1;
    setShowAutocomplete(shouldShow);
    if (shouldShow) {
      setAutocompleteOptions(getAutocompleteOptions(value));
    } else {
      setAutocompleteOptions([]);
    }
  };

  const handleSubmit = (value: string) => {
    if (value.trim()) {
      onSubmit(value);
    }
    setCurrentInput('');
    setShowAutocomplete(false);
    setAutocompleteOptions([]);
  };

  return (
    <Box borderStyle="round" borderColor="green" paddingX={1} marginTop={1} flexShrink={0}>
      <Box flexDirection="column" width="100%">
        <TextInput
          value={currentInput}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder=""
        />
        
        {/* Autocomplete suggestions */}
        {showAutocomplete && autocompleteOptions.length > 0 && (
          <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
            <Box flexDirection="column">
              <Text color="cyan" bold>Commands:</Text>
              {autocompleteOptions.map(option => (
                <Box key={option.value} flexDirection="row">
                  <Text color="cyan">{option.label}</Text>
                  <Text color="gray"> - {option.description}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};