import { sandboxedExec } from '../sandbox';
import { getSession, setSession } from '../sessions';
import type { SymbioteConfig } from '../config';

function buildCLICommand(
  provider: string,
  message: string,
  sessionId?: string
): string {
  const escaped = message.replace(/'/g, `'\\''`);

  switch (provider) {
    case 'claude': {
      const resume = sessionId ? ` --resume '${sessionId}'` : '';
      return `claude --dangerously-skip-permissions --output-format json${resume} -p '${escaped}'`;
    }
    case 'codex': {
      if (sessionId) {
        return `codex exec resume ${sessionId} --dangerously-bypass-approvals-and-sandbox --json '${escaped}'`;
      }
      return `codex exec --dangerously-bypass-approvals-and-sandbox --json '${escaped}'`;
    }
    case 'gemini': {
      const resume = sessionId ? ` --resume '${sessionId}'` : '';
      return `CI=true gemini --yolo${resume} -p '${escaped}'`;
    }
    default:
      throw new Error(`No CLI command defined for provider: ${provider}`);
  }
}

function extractSessionId(
  provider: string,
  stdout: string
): string | undefined {
  try {
    switch (provider) {
      case 'claude': {
        const parsed = JSON.parse(stdout);
        return parsed.session_id ?? undefined;
      }
      case 'codex': {
        const parsed = JSON.parse(stdout);
        return parsed.session_id ?? parsed.id ?? undefined;
      }
      case 'gemini': {
        const match = stdout.match(/session[_-]?id["']?\s*[:=]\s*["']?([a-f0-9-]+)/i);
        return match?.[1] ?? undefined;
      }
    }
  } catch {
    // JSON parse failed — no session ID available
  }
  return undefined;
}

function extractResponseText(provider: string, stdout: string): string {
  try {
    switch (provider) {
      case 'claude': {
        const parsed = JSON.parse(stdout);
        return parsed.result ?? parsed.text ?? stdout;
      }
      case 'codex': {
        const parsed = JSON.parse(stdout);
        return parsed.message ?? parsed.output ?? parsed.text ?? stdout;
      }
    }
  } catch {
    // JSON parse failed — return raw output
  }
  return stdout;
}

export async function runCLIAgent(
  userMessage: string,
  config: SymbioteConfig,
  chatId: number
): Promise<string> {
  const sessionId = getSession(chatId);
  const command = buildCLICommand(config.provider, userMessage, sessionId);
  const result = await sandboxedExec(command, 300_000, 'inherit');

  const newSessionId = extractSessionId(config.provider, result.stdout);
  if (newSessionId) {
    setSession(chatId, newSessionId);
  }

  const text = extractResponseText(config.provider, result.stdout).trim();
  const parts: string[] = [];
  if (text) parts.push(text);
  if (result.exitCode !== 0 && result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`);

  return parts.join('\n\n') || '✅ Done (no output).';
}
