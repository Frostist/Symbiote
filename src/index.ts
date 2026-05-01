#!/usr/bin/env node
import prompts from 'prompts';
import { addAuthorizedChatId, addBlacklistedChatId, configExists, loadConfig, runSetupWizard, SymbioteConfig } from './config';
import { SANDBOX_PATH } from './sandbox';
import { approvalEvents, createBot, PendingApproval } from './bot';

async function main(): Promise<void> {
  console.log('\n🦠  Symbiote');
  console.log(`📁  Sandbox: ${SANDBOX_PATH}\n`);

  let config: SymbioteConfig;
  if (!configExists()) {
    config = await runSetupWizard();
  } else {
    config = loadConfig();
    const mode = config.useCLI ? 'CLI' : 'API';
    console.log(`✅  Config loaded — provider: ${config.provider} (${mode})`);
  }

  const bot = createBot(config);

  bot.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Bot error:', msg);
  });

  const approvalQueue: PendingApproval[] = [];
  let processingApproval = false;

  async function processApprovalQueue(): Promise<void> {
    if (processingApproval || approvalQueue.length === 0) return;
    processingApproval = true;
    const approval = approvalQueue.shift()!;
    const displayName = approval.username ? `@${approval.username}` : (approval.firstName ?? `Chat ${approval.chatId}`);

    console.log(`\n🔔  Authorization request from ${displayName} (ID: ${approval.chatId})`);

    const { decision } = await prompts({
      type: 'select',
      name: 'decision',
      message: `Allow ${displayName} to use Symbiote?`,
      choices: [
        { title: '✅  Whitelist (allow)', value: 'allow' },
        { title: '❌  Blacklist (deny)', value: 'deny' },
      ],
    });

    if (decision === 'allow') {
      config.authorizedChatIds = [...(config.authorizedChatIds ?? []), approval.chatId];
      addAuthorizedChatId(approval.chatId);
      await bot.api.sendMessage(approval.chatId, '✅ You have been authorized! Send me a message to get started.');
      console.log(`✅  Authorized: ${displayName}`);
    } else {
      config.blacklistedChatIds = [...(config.blacklistedChatIds ?? []), approval.chatId];
      addBlacklistedChatId(approval.chatId);
      await bot.api.sendMessage(approval.chatId, '❌ Your authorization request was denied.');
      console.log(`🚫  Blacklisted: ${displayName}`);
    }

    processingApproval = false;
    void processApprovalQueue();
  }

  approvalEvents.on('pending', (approval: PendingApproval) => {
    approvalQueue.push(approval);
    void processApprovalQueue();
  });

  console.log('\n🤖  Starting Telegram bot…');

  await bot.start({
    onStart: (info: { username: string }) => {
      console.log(`✅  Bot running: @${info.username}`);
      const authorizedCount = config.authorizedChatIds?.length ?? 0;
      if (authorizedCount === 0) {
        console.log(
          `\n📱  Open Telegram and send /start to @${info.username} — you will be prompted here to approve.\n`
        );
      } else {
        console.log(`📱  Authorized chat IDs: ${config.authorizedChatIds!.join(', ')}\n`);
      }
      console.log('Press Ctrl+C to stop.\n');
    },
  });
}

main().catch((err: Error) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  process.exit(1);
});
