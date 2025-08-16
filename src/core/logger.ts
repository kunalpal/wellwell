import pino, { type Logger, type LoggerOptions } from "pino";

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
