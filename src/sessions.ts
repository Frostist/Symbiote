const sessions = new Map<number, string>();

export function getSession(chatId: number): string | undefined {
  return sessions.get(chatId);
}

export function setSession(chatId: number, sessionId: string): void {
  sessions.set(chatId, sessionId);
}

export function clearSession(chatId: number): void {
  sessions.delete(chatId);
}
