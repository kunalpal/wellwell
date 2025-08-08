import React from 'react';
import { Box, Text } from 'ink';

export type TableColumn<T> = {
  header: string;
  width?: number; // approximate chars
  render: (row: T) => React.ReactNode;
};

export function Table<T>({ columns, rows }: { columns: TableColumn<T>[]; rows: T[] }) {
  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col, idx) => (
          <Box key={idx} width={col.width ?? 20} marginRight={2}>
            <Text bold>{col.header}</Text>
          </Box>
        ))}
      </Box>
      {rows.map((row, rIdx) => (
        <Box key={rIdx}>
          {columns.map((col, cIdx) => (
            <Box key={cIdx} width={col.width ?? 20} marginRight={2}>
              <Text>{col.render(row)}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
