#!/usr/bin/env node
import prompts from 'prompts';
import { addAuthorizedChatId, addBlacklistedChatId, changeProvider, configExists, loadConfig, removeAuthorizedChatId, removeBlacklistedChatId, runSetupWizard, SymbioteConfig } from './config';
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

  // Main menu
  while (true) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: '🤖  Start bot', value: 'start' },
        { title: '👥  View users', value: 'users' },
        { title: '🔄  Change provider', value: 'provider' },
        { title: '🚪  Exit', value: 'exit' },
      ],
    });

    if (action === undefined || action === 'exit') process.exit(0);
    if (action === 'start') break;

    if (action === 'users') {
      while (true) {
        const authorized = config.authorizedChatIds ?? [];
        const blacklisted = config.blacklistedChatIds ?? [];

        if (authorized.length === 0 && blacklisted.length === 0) {
          console.log('\n👥  No users yet.\n');
          break;
        }

        const userChoices = [
          ...authorized.map(id => ({ title: `✅  ${id}  (authorized)`, value: `auth:${id}` })),
          ...blacklisted.map(id => ({ title: `🚫  ${id}  (blacklisted)`, value: `bl:${id}` })),
          { title: '← Back', value: 'back' },
        ];

        const { selected } = await prompts({
          type: 'select',
          name: 'selected',
          message: 'Select a user to manage:',
          choices: userChoices,
        });

        if (!selected || selected === 'back') break;

        const isAuth = (selected as string).startsWith('auth:');
        const chatId = parseInt((selected as string).split(':')[1], 10);

        if (isAuth) {
          const { userAction } = await prompts({
            type: 'select',
            name: 'userAction',
            message: `Manage authorized user ${chatId}:`,
            choices: [
              { title: '🗑️  Remove authorization', value: 'remove' },
              { title: '🚫  Move to blacklist', value: 'blacklist' },
              { title: '← Back', value: 'back' },
            ],
          });
          if (userAction === 'remove') {
            removeAuthorizedChatId(chatId);
            config = loadConfig();
            console.log(`\n🗑️  Removed ${chatId} from authorized users.\n`);
          } else if (userAction === 'blacklist') {
            removeAuthorizedChatId(chatId);
            addBlacklistedChatId(chatId);
            config = loadConfig();
            console.log(`\n🚫  Moved ${chatId} to blacklist.\n`);
          }
        } else {
          const { userAction } = await prompts({
            type: 'select',
            name: 'userAction',
            message: `Manage blacklisted user ${chatId}:`,
            choices: [
              { title: '🗑️  Remove from blacklist', value: 'remove' },
              { title: '✅  Authorize', value: 'authorize' },
              { title: '← Back', value: 'back' },
            ],
          });
          if (userAction === 'remove') {
            removeBlacklistedChatId(chatId);
            config = loadConfig();
            console.log(`\n🗑️  Removed ${chatId} from blacklist.\n`);
          } else if (userAction === 'authorize') {
            removeBlacklistedChatId(chatId);
            addAuthorizedChatId(chatId);
            config = loadConfig();
            console.log(`\n✅  Authorized ${chatId}.\n`);
          }
        }
      }
    }

    if (action === 'provider') {
      config = await changeProvider(config);
    }
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
