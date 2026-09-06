/**
 * pm2用の設定ファイル(自動再起動・ログ管理をpm2に任せるため)。
 * package.jsonが"type":"module"のため、拡張子を.cjsにしてCommonJSとして読ませる。
 *
 * 自動更新パイプラインの動作確認用コミット(2026-09-06)。この行はBotの動作に影響しない。
 */
module.exports = {
  apps: [
    {
      name: 'ai-office',
      script: 'src/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
    },
  ],
};
