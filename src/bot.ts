import { Bot, Context } from 'grammy';
import { SANDBOX_PATH } from './sandbox';
import { saveAuthorizedChatId, SymbioteConfig } from './config';
import { runAgent } from './agent';

const MAX_TELEGRAM_LENGTH = 4000;

function truncate(text: string): string {
  if (text.length <= MAX_TELEGRAM_LENGTH) return text;
  return text.slice(0, MAX_TELEGRAM_LENGTH) + '\n…(truncated)';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function safeSend(
  ctx: Context,
  text: string,
  html = false
): Promise<void> {
  try {
    await ctx.reply(truncate(text), html ? { parse_mode: 'HTML' } : undefined);
  } catch {
    await ctx.reply(truncate(text));
  }
}

async function safeEdit(
  ctx: Context,
  messageId: number,
  text: string
): Promise<void> {
  if (!ctx.chat) return;
  try {
    await ctx.api.editMessageText(ctx.chat.id, messageId, truncate(text), {
      parse_mode: 'HTML',
    });
  } catch {
    try {
      await ctx.api.editMessageText(ctx.chat.id, messageId, truncate(text));
    } catch {
      await ctx.reply(truncate(text));
    }
  }
}

export function createBot(config: SymbioteConfig): Bot {
  const bot = new Bot(config.telegramToken);

  const isAuthorized = (ctx: Context): boolean => {
    if (!config.authorizedChatId) return false;
    return ctx.chat?.id === config.authorizedChatId;
  };

  bot.command('start', async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    if (!config.authorizedChatId) {
      config.authorizedChatId = chatId;
      saveAuthorizedChatId(chatId);
      await safeSend(
        ctx,
        `<b>🦠 Symbiote activated</b>\n\n` +
          `<b>Sandbox:</b> <code>${escapeHtml(SANDBOX_PATH)}</code>\n` +
          `<b>Provider:</b> <code>${config.provider}${config.useCLI ? ' (CLI)' : ' (API)'}</code>\n\n` +
          `Send me any message and I'll get to work.`,
        true
      );
    } else if (isAuthorized(ctx)) {
      await safeSend(
        ctx,
        `<b>🦠 Symbiote is running</b>\n\n` +
          `<b>Sandbox:</b> <code>${escapeHtml(SANDBOX_PATH)}</code>\n` +
          `<b>Provider:</b> <code>${config.provider}${config.useCLI ? ' (CLI)' : ' (API)'}</code>`,
        true
      );
    } else {
      await ctx.reply('❌ Unauthorized.');
    }
  });

  bot.command('sandbox', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('❌ Unauthorized.');
      return;
    }
    await safeSend(
      ctx,
      `<b>Sandbox path:</b>\n<code>${escapeHtml(SANDBOX_PATH)}</code>`,
      true
    );
  });

  bot.command('provider', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('❌ Unauthorized.');
      return;
    }
    await safeSend(
      ctx,
      `<b>Provider:</b> <code>${config.provider}${config.useCLI ? ' (CLI mode)' : ' (API mode)'}</code>`,
      true
    );
  });

  bot.on('message:text', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('❌ Unauthorized. Send /start first to authorise this chat.');
      return;
    }

    const userMessage = ctx.message.text;
    const statusMsg = await ctx.reply('⏳ Working…');

    try {
      const response = await runAgent(userMessage, config);
      await safeEdit(ctx, statusMsg.message_id, response || '✅ Done.');
    } catch (err) {
      await safeEdit(
        ctx,
        statusMsg.message_id,
        `❌ <b>Error:</b> ${escapeHtml((err as Error).message)}`
      );
    }
  });

  bot.on('message', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('❌ Unauthorized.');
      return;
    }
    await ctx.reply('ℹ️ Send me a text message with your instruction.');
  });

  return bot;
}
