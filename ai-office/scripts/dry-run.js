import 'dotenv/config';

/**
 * APIキーもDiscordトークンも使わずに、会議フロー(Triage→意見表明→Red Team→
 * 修正→承認要否判定→CEO決定)が正しく回ることを確認するためのスクリプト。
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
const noopCostTracker = { recordUsage: () => 0, exceedsMeetingCap: () => false };

const orchestrator = new MeetingOrchestrator({ topic, costTracker: noopCostTracker });

const transcript = await orchestrator.run(async (message) => {
  console.log(`\n=== [${message.phase}] ${message.roleName} (${message.provider}/${message.model}) ===`);
  console.log(JSON.stringify(message.parsed, null, 2));
});

console.log('\n--- SUMMARY ---');
console.log('meetingId:', transcript.meetingId);
console.log('constitutionVersion:', transcript.constitutionVersion);
console.log('requiredRoleIds:', transcript.requiredRoleIds);
console.log('mandatoryApprovalTags:', transcript.mandatoryApprovalTags);
console.log('rounds recorded:', transcript.rounds.map((r) => r.phase).join(', '));
console.log('redTeamFindings:', transcript.redTeamFindings.length);
console.log('blockedOnFailure:', transcript.blockedOnFailure);
console.log('decision present:', Boolean(transcript.decision));
console.log('ownerApproval:', transcript.ownerApproval);
console.log(`(transcript saved to logs/meetings/${transcript.meetingId}.json — safe to delete, it's mock data)`);

if (transcript.decision) {
  const { saveDecisionLog } = await import('../src/storage/decisionLogRenderer.js');
  const logPath = saveDecisionLog(transcript);
  console.log(`(decision log saved to ${logPath} — safe to delete, it's mock data)`);
}
