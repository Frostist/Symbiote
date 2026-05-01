import { GoogleGenerativeAI } from '@google/generative-ai';
import { TOOLS } from '../agent';
import type { SymbioteConfig } from '../config';

const BASE_SYSTEM_PROMPT = `You are Symbiote, an AI coding agent operating inside a sandboxed folder. \
You have tools to read, write, delete files and execute shell commands, but ONLY within the sandbox. \
You also have memory tools (memory_store, memory_search, memory_connect) to build a persistent knowledge graph across conversations. \
Be concise, accurate, and always use tools to make changes rather than just describing them.`;

export async function runGeminiAgent(
  userMessage: string,
  config: SymbioteConfig,
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  memoryContext?: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey ?? '');

  const functionDeclarations = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([key, val]) => [
          key,
          { type: val.type.toUpperCase(), description: val.description },
        ])
      ),
      required: t.parameters.required,
    },
  }));

  const model = genAI.getGenerativeModel({
    model: config.model ?? 'gemini-1.5-pro',
    systemInstruction: memoryContext ? `${BASE_SYSTEM_PROMPT}\n\n${memoryContext}` : BASE_SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ functionDeclarations }] as any,
  });

  const chat = model.startChat();
  let result = await chat.sendMessage(userMessage);

  for (;;) {
    const response = result.response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const functionCalls = (response as any).functionCalls?.() as
      | Array<{ name: string; args: Record<string, unknown> }>
      | undefined;

    if (!functionCalls || functionCalls.length === 0) {
      return response.text();
    }

    const functionResponses = await Promise.all(
      functionCalls.map(async (fc) => {
        const rawResult = await executeTool(fc.name, fc.args);
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawResult);
        } catch {
          parsed = rawResult;
        }
        return {
          functionResponse: {
            name: fc.name,
            response: { result: parsed },
          },
        };
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await chat.sendMessage(functionResponses as any);
  }
}
