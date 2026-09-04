import { SlashCommandBuilder } from 'discord.js';

export const meetingCommand = new SlashCommandBuilder()
  .setName('meeting')
  .setDescription('AI経営会議(複数AI役員による議論・意思決定)')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('新しい議題でAI会議を開始する')
      .addStringOption((opt) => opt.setName('topic').setDescription('議題').setRequired(true))
      .addIntegerOption((opt) =>
        opt
          .setName('rounds')
          .setDescription('反論→修正の往復回数(既定: 1)')
          .setMinValue(1)
          .setMaxValue(3),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('decision').setDescription('このスレッドの最終決定を再表示する'),
  )
  .addSubcommand((sub) =>
    sub.setName('cost').setDescription('この会議・当月累計のAPI利用コストを表示する'),
  )
  .addSubcommand((sub) => sub.setName('cancel').setDescription('進行中の会議を中断する'));

export const commandDefinitions = [meetingCommand];
