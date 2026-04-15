import pino from "pino";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
type LogMode = "pretty" | "json";

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

const defaultMode: LogMode =
  process.env.NODE_ENV === "production" ? "json" : "pretty";
const LOG_MODE: LogMode = (process.env.LOG_MODE as LogMode) || defaultMode;

const validLevels: LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];
const validModes: LogMode[] = ["pretty", "json"];

const level = validLevels.includes(LOG_LEVEL) ? LOG_LEVEL : "info";
const mode = validModes.includes(LOG_MODE) ? LOG_MODE : defaultMode;

const root = pino({
  level,
  ...(mode === "pretty"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
            messageFormat: "[{module}] {msg}",
          },
        },
      }
    : {
        formatters: {
          level(label) {
            return { level: label };
          },
        },
      }),
});

export function createLogger(module: string) {
  return root.child({ module });
}
