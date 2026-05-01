#!/usr/bin/env node
import { configExists, loadConfig, runSetupWizard, SymbioteConfig } from './config';
import { SANDBOX_PATH } from './sandbox';
import { createBot } from './bot';

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

  console.log('\n🤖  Starting Telegram bot…');

  await bot.start({
    onStart: (info: { username: string }) => {
      console.log(`✅  Bot running: @${info.username}`);
      if (!config.authorizedChatId) {
        console.log(
          `\n📱  Open Telegram and send /start to @${info.username} to authorise your chat.\n`
        );
      } else {
        console.log(`📱  Authorised chat ID: ${config.authorizedChatId}\n`);
      }
      console.log('Press Ctrl+C to stop.\n');
    },
  });
}

main().catch((err: Error) => {
  console.error(`\n❌  Fatal: ${err.message}`);
  process.exit(1);
});
