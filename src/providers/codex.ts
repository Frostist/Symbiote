import OpenAI from 'openai';
import { TOOLS } from '../agent';
import type { SymbioteConfig } from '../config';

const BASE_SYSTEM_PROMPT = `You are Symbiote, an AI coding agent operating inside a sandboxed folder. \
You have tools to read, write, delete files and execute shell commands, but ONLY within the sandbox. \
You also have memory tools (memory_store, memory_search, memory_connect) to build a persistent knowledge graph across conversations. \
Be concise, accurate, and always use tools to make changes rather than just describing them.`;

export async function runCodexAgent(
  userMessage: string,
  config: SymbioteConfig,
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  memoryContext?: string
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey });

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: memoryContext ? `${BASE_SYSTEM_PROMPT}\n\n${memoryContext}` : BASE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  for (;;) {
    const response = await client.chat.completions.create({
      model: config.model ?? 'gpt-4o',
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      return choice.message.content ?? '✅ Done.';
    }

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeTool(toolCall.function.name, args);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    } else {
      break;
    }
  }

  return '(agent loop ended unexpectedly)';
}
