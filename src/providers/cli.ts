import { sandboxedExec } from '../sandbox';
import type { SymbioteConfig } from '../config';

function buildCLICommand(provider: string, message: string, memoryContext?: string): string {
  const fullMessage = memoryContext ? `${memoryContext}\n\n${message}` : message;
  const escaped = fullMessage.replace(/'/g, `'\\''`);

  switch (provider) {
    case 'claude':
      return `claude --output-format text -p '${escaped}'`;
    case 'codex':
      return `codex exec --dangerously-bypass-approvals-and-sandbox '${escaped}'`;
    case 'gemini':
      return `CI=true gemini -p '${escaped}'`;
    default:
      throw new Error(`No CLI command defined for provider: ${provider}`);
  }
}

export async function runCLIAgent(
  userMessage: string,
  config: SymbioteConfig,
  memoryContext?: string
): Promise<string> {
  const command = buildCLICommand(config.provider, userMessage, memoryContext);
  const result = await sandboxedExec(command, 300_000, 'inherit');

  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.exitCode !== 0 && result.stderr.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`);

  return parts.join('\n\n') || '✅ Done (no output).';
}
