import 'dotenv/config';

/**
 * APIキーもDiscordトークンも使わずに、会議フロー(意見表明→反論→修正→CEO決定)が
 * 正しく回ることを確認するためのスクリプト。
 *
 * 使い方: node scripts/dry-run.js "議題をここに書く"
 *
 * providers/index.js の generate() を強制的にモックへリダイレクトする
 * (AI_OFFICE_MOCK=1)。実際の課金・ネットワークアクセスは一切発生しない。
 */
process.env.AI_OFFICE_MOCK = '1';

const { MeetingOrchestrator } = await import('../src/orchestrator/meeting.js');

const topic = process.argv[2] ?? 'サークル紹介ページに動画投稿機能を追加すべきか';

// 本物のCostTracker/使用量ログには一切書き込まない、テスト専用のダミー実装。
const noopCostTracker = { recordUsage: () => 0 };

const orchestrator = new MeetingOrchestrator({ topic, rounds: 1, costTracker: noopCostTracker });

const transcript = await orchestrator.run(async (message) => {
  console.log(`\n=== [${message.phase}] ${message.roleName} (${message.provider}/${message.model}) ===`);
  console.log(JSON.stringify(message.parsed, null, 2));
});

console.log('\n--- SUMMARY ---');
console.log('meetingId:', transcript.meetingId);
console.log('rounds recorded:', transcript.rounds.length);
console.log('decision present:', Boolean(transcript.decision));
console.log(`(transcript saved to logs/meetings/${transcript.meetingId}.json — safe to delete, it's mock data)`);
