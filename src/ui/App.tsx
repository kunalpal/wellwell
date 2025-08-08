import React from 'react';
import { Text, Box } from 'ink';

export type AppProps = {
  name: string;
};

export default function App({ name }: AppProps) {
  return (
    <Box>
      <Text>✨ Hello, {name}!</Text>
    </Box>
  );
}
