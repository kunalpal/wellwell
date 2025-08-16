import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Creates a Pino logger instance with optional pretty printing and verbosity.
 * @param options Logger options, including pretty and verbose flags.
 * @returns A configured Pino Logger instance.
 */
export function createLogger(
  options?: LoggerOptions & { pretty?: boolean; verbose?: boolean },
): Logger {
  const { pretty = true, verbose = false, ...pinoOptions } = options ?? {};
  const level = verbose ? "debug" : "info";
  const transport = pretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          singleLine: true,
        },
      }
    : undefined;
  return pino({ level, transport, ...pinoOptions });
}
