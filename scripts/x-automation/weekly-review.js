#!/usr/bin/env node
/**
 * weekly-review.js - 投稿ログを機械的に集計するだけのスクリプト(判断はしない)。
 *
 * check-sources.js と同じ考え方: 「何が起きたか」を集計するのはスクリプトの仕事、
 * 「それをどう評価し、何を変えるか」は人間+Claude Codeのインタラクティブなセッションで行う
 * (.claude/skills/x-weekly-review/SKILL.md を参照)。ここで外部の有料LLM APIは呼ばない。
 *
 * 実行方法: node scripts/x-automation/weekly-review.js [日数(既定7)]
 */
const { readLog } = require('./lib/post-log');
const { POST_TYPES } = require('./lib/config');

function main() {
  const days = Number(process.argv[2]) || 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const log = readLog();
  const recent = log.posts.filter((p) => new Date(p.postedAt) >= since);

  console.log(`# X投稿 振り返り集計(直近${days}日、${recent.length}件のログエントリ)\n`);

  if (recent.length === 0) {
    console.log('対象期間に投稿ログがありません。');
    return;
  }

  const byType = {};
  Object.values(POST_TYPES).forEach((meta) => { byType[meta.id] = { label: meta.label, success: 0, dryRun: 0, failed: 0, eventIdsSeen: new Set() }; });

  recent.forEach((p) => {
    const bucket = byType[p.postType] || (byType[p.postType] = { label: p.postType, success: 0, dryRun: 0, failed: 0, eventIdsSeen: new Set() });
    if (p.status === 'success') bucket.success += 1;
    else if (p.status === 'dry-run') bucket.dryRun += 1;
    else if (p.status === 'failed') bucket.failed += 1;
    (p.eventIds || []).forEach((id) => bucket.eventIdsSeen.add(id));
  });

  console.log('## 投稿タイプ別');
  Object.values(byType).forEach((b) => {
    if (b.success + b.dryRun + b.failed === 0) return;
    console.log(`- ${b.label}: 成功${b.success}件 / Dry Run${b.dryRun}件 / 失敗${b.failed}件 / 登場イベント数(重複除く)${b.eventIdsSeen.size}件`);
  });

  const failed = recent.filter((p) => p.status === 'failed');
  if (failed.length > 0) {
    console.log('\n## 失敗した投稿');
    failed.forEach((p) => console.log(`- ${p.postedAt} [${p.postType}] targetDate=${p.targetDate} errorType=${p.errorType}`));
  }

  // 同一イベントが何度も登場していないか(重複感の機械的な手がかり。最終判断は人間+Claudeが行う)
  const eventCounts = {};
  recent.forEach((p) => (p.eventIds || []).forEach((id) => { eventCounts[id] = (eventCounts[id] || 0) + 1; }));
  const frequentEvents = Object.entries(eventCounts).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
  if (frequentEvents.length > 0) {
    console.log('\n## 3回以上登場したイベント(要目視確認: 出しすぎていないか)');
    frequentEvents.forEach(([id, c]) => console.log(`- ${id}: ${c}回`));
  }

  console.log('\n## GA4で確認すること(このスクリプトはGA4に自動接続していません)');
  console.log('GA4 → 集客 → トラフィック獲得 で、セッションのメディア/ソースが "x / organic" のものを');
  console.log('セッションキャンペーン別に見ると、投稿タイプごとの流入(today_waseda / weekly_waseda /');
  console.log('today_later / theme_event / recommendation)を比較できます。');
  console.log('あわせて recommendation_start / event detail 閲覧 / 外部CTAクリック等のイベントも');
  console.log('セグメントを絞って確認すると、X経由の閲覧がどこまで進んでいるか分かります。');
}

main();
