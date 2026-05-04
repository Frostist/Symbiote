import * as sandbox from './sandbox';
import type { SymbioteConfig } from './config';
import { runClaudeAgent } from './providers/claude';
import { runCodexAgent } from './providers/codex';
import { runGeminiAgent } from './providers/gemini';
import { runCLIAgent } from './providers/cli';
import { logToolCall } from './logger';

export interface ToolParam {
  type: string;
  description: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParam>;
    required: string[];
  };
}

export const TOOLS: Tool[] = [
  {
    name: 'list_dir',
    description: 'List files and directories at the given path within the sandbox. Defaults to the sandbox root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within the sandbox to list. Defaults to ".".' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read the full contents of a file within the sandbox.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file within the sandbox.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file within the sandbox with the given content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file within the sandbox.' },
        content: { type: 'string', description: 'Full content to write to the file.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory within the sandbox.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file or directory within the sandbox.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'exec',
    description: 'Execute a shell command. The working directory is always the sandbox root and cannot be changed.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute.' },
      },
      required: ['command'],
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  let result: string;
  try {
    switch (name) {
      case 'list_dir': {
        const dirPath = (args.path as string | undefined) ?? '.';
        const entries = sandbox.listDir(dirPath);
        result = JSON.stringify({ entries });
        break;
      }
      case 'read_file': {
        const content = sandbox.readFile(args.path as string);
        result = JSON.stringify({ content });
        break;
      }
      case 'write_file': {
        sandbox.writeFile(args.path as string, args.content as string);
        result = JSON.stringify({ success: true });
        break;
      }
      case 'delete_file': {
        sandbox.deleteFile(args.path as string);
        result = JSON.stringify({ success: true });
        break;
      }
      case 'exec': {
        const execResult = await sandbox.sandboxedExec(args.command as string);
        result = JSON.stringify(execResult);
        break;
      }
      default:
        result = JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    result = JSON.stringify({ error: (err as Error).message });
  }
  logToolCall(name, args, result!);
  return result!;
}

export async function runAgent(
  userMessage: string,
  config: SymbioteConfig,
  chatId: number
): Promise<string> {
  const toolExecutor = (name: string, args: Record<string, unknown>) =>
    executeTool(name, args);

  if (config.useCLI) {
    return runCLIAgent(userMessage, config, chatId);
  }

  switch (config.provider) {
    case 'claude':
      return runClaudeAgent(userMessage, config, toolExecutor);
    case 'codex':
      return runCodexAgent(userMessage, config, toolExecutor);
    case 'gemini':
      return runGeminiAgent(userMessage, config, toolExecutor);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
