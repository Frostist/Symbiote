import Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '../agent';
import type { SymbioteConfig } from '../config';

const SYSTEM_PROMPT = `You are Symbiote, an AI coding agent operating inside a sandboxed folder. \
You have tools to read, write, delete files and execute shell commands, but ONLY within the sandbox. \
Be concise, accurate, and always use tools to make changes rather than just describing them.`;

export async function runClaudeAgent(
  userMessage: string,
  config: SymbioteConfig,
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const tools: Anthropic.Tool[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  for (;;) {
    const response = await client.messages.create({
      model: config.model ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(
        (b: Anthropic.ContentBlock) => b.type === 'text'
      ) as Anthropic.TextBlock | undefined;
      return textBlock?.text ?? '✅ Done.';
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b: Anthropic.ContentBlock) => b.type === 'tool_use'
      ) as Anthropic.ToolUseBlock[];

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: await executeTool(block.name, block.input as Record<string, unknown>),
        }))
      );

      messages.push({ role: 'user', content: toolResults });
    } else {
      break;
    }
  }

  return '(agent loop ended unexpectedly)';
}
