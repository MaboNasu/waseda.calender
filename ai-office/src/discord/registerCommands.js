import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './commandDefinitions.js';

/**
 * グローバルスラッシュコマンドを登録するスクリプト。
 * `npm run register-commands` で単独実行できる(Gateway接続はしない)。
 * index.js の ready ハンドラでも自動登録しているため、通常はこのスクリプトを
 * 手動で叩く必要はないが、コマンド定義だけ即座に反映確認したい場合に使う。
 * グローバルコマンドは反映まで最大1時間程度かかることがある点に注意。
 */
async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not set. Fill it in ai-office/.env');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const application = await rest.get(Routes.oauth2CurrentApplication());

  await rest.put(Routes.applicationCommands(application.id), {
    body: commandDefinitions.map((cmd) => cmd.toJSON()),
  });

  // eslint-disable-next-line no-console
  console.log(`Registered ${commandDefinitions.length} global command(s) for application ${application.id}.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to register commands:', error);
  process.exitCode = 1;
});
