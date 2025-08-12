import chalk from 'chalk';
import type { ConfigurationStatus } from '../core/types.js';

/**
 * Format a configuration status with background colors for better visual distinction
 * Similar to Jest's test result format with consistent width and capitalization
 */
export function formatStatus(status: ConfigurationStatus, isUnsupported?: boolean): string {
  if (isUnsupported) {
    // Use ANSI escape codes for strikethrough since chalk may not work properly
    return `\u001b[9m\u001b[2m${status.toUpperCase()}\u001b[0m`.padEnd(16);
  }
  
  // Calculate the visual width of the status badge (without ANSI codes)
  const getStatusText = (text: string) => ` ${text} `;
  const statusText = getStatusText(status.toUpperCase());
  const visualWidth = statusText.length;
  
  // Calculate padding needed to reach 16 characters visual width
  const paddingNeeded = 9 - visualWidth;
  
  switch (status) {
    case 'stale':
      return chalk.bgBlue.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
    case 'pending':
      return chalk.bgYellow.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
    case 'applied':
      return chalk.bgGreen.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
    case 'failed':
      return chalk.bgRed.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
    case 'skipped':
      return chalk.bgCyan.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
    default:
      return chalk.bgGray.black(statusText + ' '.repeat(paddingNeeded)).padEnd(10);
  }
}
