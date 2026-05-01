import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';

export type Provider = 'claude' | 'codex' | 'gemini';

export interface SymbioteConfig {
  telegramToken: string;
  authorizedChatIds?: number[];
  blacklistedChatIds?: number[];
  provider: Provider;
  useCLI: boolean;
  apiKey?: string;
  model?: string;
}

const CONFIG_DIR = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '~', '.symbiote');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export function loadConfig(): SymbioteConfig {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw) as SymbioteConfig & { authorizedChatId?: number };
  if (config.authorizedChatId !== undefined && !config.authorizedChatIds) {
    config.authorizedChatIds = [config.authorizedChatId];
    delete config.authorizedChatId;
    saveConfig(config);
  }
  return config;
}

export function saveConfig(config: SymbioteConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function addAuthorizedChatId(chatId: number): void {
  const config = loadConfig();
  if (!config.authorizedChatIds) config.authorizedChatIds = [];
  if (!config.authorizedChatIds.includes(chatId)) config.authorizedChatIds.push(chatId);
  saveConfig(config);
}

export function addBlacklistedChatId(chatId: number): void {
  const config = loadConfig();
  if (!config.blacklistedChatIds) config.blacklistedChatIds = [];
  if (!config.blacklistedChatIds.includes(chatId)) config.blacklistedChatIds.push(chatId);
  saveConfig(config);
}

function detectCLI(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function runSetupWizard(): Promise<SymbioteConfig> {
  console.log('\n🦠  Symbiote — first-time setup\n');

  const cliDetected: Record<Provider, boolean> = {
    claude: detectCLI('claude'),
    codex: detectCLI('codex'),
    gemini: detectCLI('gemini'),
  };

  const providerChoices = [
    { title: `Claude${cliDetected.claude ? '  ✓ CLI detected' : ''}`, value: 'claude' },
    { title: `Codex / OpenAI${cliDetected.codex ? '  ✓ CLI detected' : ''}`, value: 'codex' },
    { title: `Gemini${cliDetected.gemini ? '  ✓ CLI detected' : ''}`, value: 'gemini' },
  ];

  const { provider } = await prompts({
    type: 'select',
    name: 'provider',
    message: 'Which AI provider do you want to use?',
    choices: providerChoices,
  });

  if (!provider) process.exit(0);

  let useCLI = false;
  let apiKey: string | undefined;

  if (cliDetected[provider as Provider]) {
    const { mode } = await prompts({
      type: 'select',
      name: 'mode',
      message: `Use the ${provider} CLI or an API key?`,
      choices: [
        { title: 'Use CLI (already installed)', value: 'cli' },
        { title: 'Use API key', value: 'api' },
      ],
    });
    if (mode === undefined) process.exit(0);
    useCLI = mode === 'cli';
  }

  if (!useCLI) {
    const providerLinks: Record<Provider, string> = {
      claude: 'https://console.anthropic.com',
      codex: 'https://platform.openai.com',
      gemini: 'https://aistudio.google.com',
    };
    const { key } = await prompts({
      type: 'password',
      name: 'key',
      message: `Enter your ${provider} API key (${providerLinks[provider as Provider]}):`,
      validate: (v: string) => v.trim().length > 0 || 'API key cannot be empty',
    });
    if (key === undefined) process.exit(0);
    apiKey = (key as string).trim();
  }

  const { telegramToken } = await prompts({
    type: 'password',
    name: 'telegramToken',
    message: 'Enter your Telegram Bot Token (from @BotFather):',
    validate: (v: string) => v.trim().length > 0 || 'Token cannot be empty',
  });

  if (telegramToken === undefined) process.exit(0);

  const config: SymbioteConfig = {
    telegramToken: (telegramToken as string).trim(),
    provider: provider as Provider,
    useCLI,
    apiKey,
  };

  saveConfig(config);
  console.log(`\n✅  Config saved to ~/.symbiote/config.json\n`);
  return config;
}
