import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '~', '.symbiote');
const LOG_PATH = path.join(LOG_DIR, 'symbiote.log');

function timestamp(): string {
  return new Date().toISOString();
}

function append(line: string): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, line + '\n', 'utf-8');
}

export function logUserMessage(chatId: number, username: string | undefined, text: string): void {
  const who = username ? `@${username}` : `chat:${chatId}`;
  append(`[${timestamp()}] [USER] ${who}: ${text}`);
}

export function logAgentResponse(chatId: number, text: string): void {
  append(`[${timestamp()}] [AGENT] chat:${chatId}: ${text}`);
}

export function logToolCall(name: string, args: Record<string, unknown>, result: string): void {
  const argsStr = JSON.stringify(args);
  append(`[${timestamp()}] [TOOL] ${name} args=${argsStr} result=${result}`);
}
