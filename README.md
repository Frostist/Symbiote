# 🦠 Symbiote

An AI agent you drop into any folder. It attaches to that folder, takes instructions via Telegram, and can do anything inside — but nothing outside.

## How it works

```
cd /path/to/your/project
npx symbiote
```

Symbiote locks its sandbox to the current directory at startup. Every file operation and shell command is validated against that path.

## First run

On first run a setup wizard asks:

1. **Which AI provider** — Claude, Codex (OpenAI), or Gemini. Detects installed CLIs automatically.
2. **CLI or API key mode** — use an installed CLI tool or enter an API key directly.
3. **Telegram Bot Token** — create a bot at [@BotFather](https://t.me/BotFather) in Telegram.

Config is saved globally to `~/.symbiote/config.json`. Run setup again by deleting that file.

## Telegram setup

1. Open Telegram, search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the token and paste it when Symbiote asks
4. After Symbiote starts, open your bot in Telegram and send `/start`
5. The first `/start` message authorises that chat — only that chat can control Symbiote

## Commands

| Command | Description |
|---|---|
| `/start` | Activate Symbiote (first use) or show status |
| `/sandbox` | Show the current sandbox path |
| `/provider` | Show the active provider and mode |
| _(any text)_ | Send an instruction to the agent |

## Sandboxing

- **File ops** — all paths are resolved and checked to be inside the sandbox root before execution
- **Shell commands** — every command runs with `cwd` set to the sandbox root
- A small denylist blocks obviously destructive commands (`sudo`, `rm -rf /`, etc.)
- The sandbox path is set once at startup and never changes

## Providers

| Provider | CLI mode | API key mode |
|---|---|---|
| Claude (Anthropic) | `claude -p "…"` | `claude-3-5-sonnet-20241022` |
| Codex (OpenAI) | `codex --full-auto "…"` | `gpt-4o` |
| Gemini (Google) | `gemini -p "…"` | `gemini-1.5-pro` |

> **CLI mode note:** In CLI mode the underlying tool runs in the sandbox directory but has its own permissions model. API mode gives Symbiote full control over the tool loop with hard sandbox enforcement.

## Development

```bash
npm install
npm run dev        # run with ts-node (no build step)
npm run build      # compile to dist/
npm start          # run compiled output
```

## Config format

`~/.symbiote/config.json`

```json
{
  "telegramToken": "123456:ABC...",
  "authorizedChatId": 987654321,
  "provider": "claude",
  "useCLI": false,
  "apiKey": "sk-ant-..."
}
```

## Credits

Symbiote is built on the shoulders of these open-source packages:

| Package | Description |
|---|---|
| [grammy](https://grammy.dev) | Telegram Bot framework for Node.js |
| [@anthropic-ai/sdk](https://github.com/anthropic-ai/anthropic-node) | Official Anthropic SDK for Claude API access |
| [openai](https://github.com/openai/openai-node) | Official OpenAI SDK for GPT / Codex API access |
| [@google/generative-ai](https://github.com/google/generative-ai-js) | Official Google SDK for Gemini API access |
| [prompts](https://github.com/terkelg/prompts) | Lightweight, interactive CLI prompt library |
| [ts-node](https://github.com/TypeStrong/ts-node) | TypeScript execution engine for Node.js |
| [typescript](https://www.typescriptlang.org) | Typed superset of JavaScript |

