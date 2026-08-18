/**
 * post-log.js - 投稿履歴の読み書きと、冪等性・重複防止のためのチェック。
 *
 * post-log.json は sources.json と同様にリポジトリにコミットする運用の状態ファイル。
 * GitHub Actions runnerは実行のたびに使い捨てになるため、「前回いつ何を投稿したか」を
 * 永続化する手段がリポジトリへのコミット以外に無い(check-sources.ymlの
 * 「sources.jsonの更新をコミット」と同じパターン)。
 *
 * 秘密情報は一切書き込まない(投稿本文・URL・イベントID・成否・エラー種別のみ)。
 */
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'post-log.json');

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return { posts: [] };
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.posts)) return { posts: [] };
    return parsed;
  } catch (e) {
    // 壊れたログで自動投稿を止めてしまうのは本末転倒だが、サイレントに空扱いにもしたくない。
    // 標準エラーに出しつつ、安全側(投稿履歴なし=何もかもnewと見なす)には倒さず、
    // 逆に「何も分からない状態では投稿しない」方が事故が少ないため空配列で返す。
    console.error('[post-log] 読み込みに失敗しました。post-log.json の内容を確認してください:', e.message);
    return { posts: [] };
  }
}

function writeLog(log) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + '\n', 'utf8');
}

function appendPost(record) {
  const log = readLog();
  log.posts.push(record);
  writeLog(log);
  return log;
}

/** 指定した投稿タイプの直近の成功投稿(dry-run含む)を新しい順に返す */
function recentPostsOfType(postType, limit = 10) {
  const log = readLog();
  return log.posts
    .filter((p) => p.postType === postType && (p.status === 'success' || p.status === 'dry-run'))
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, limit);
}

/**
 * 冪等性チェック: 同じ投稿タイプ・同じ対象日で既に投稿済みなら true。
 * GitHub Actionsの再実行や、同日に workflow が複数回走った場合の二重投稿を防ぐ。
 */
function alreadyPostedForTarget(postType, targetDate) {
  const log = readLog();
  return log.posts.some(
    (p) => p.postType === postType && p.targetDate === targetDate && (p.status === 'success' || p.status === 'dry-run')
  );
}

/**
 * 頻度キャップ: 直近の同タイプ投稿から minGapDays 日以内なら true(=まだ間隔が足りない)。
 */
function withinMinGap(postType, minGapDays, today) {
  const recent = recentPostsOfType(postType, 1);
  if (recent.length === 0) return false;
  const last = new Date(recent[0].targetDate + 'T00:00:00Z');
  const now = new Date(today + 'T00:00:00Z');
  const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
  return diffDays < minGapDays;
}

/**
 * 直近投稿との重複感チェック: 同タイプの直近1件と、対象イベントIDの重なりが
 * 50%以上ならほぼ同じ内容とみなし true を返す(指示書7番「直近の投稿とほぼ同じ」への対応)。
 */
function isSubstantiallySameAsRecent(postType, eventIds) {
  const recent = recentPostsOfType(postType, 1);
  if (recent.length === 0 || !Array.isArray(recent[0].eventIds) || recent[0].eventIds.length === 0) return false;
  const prevIds = new Set(recent[0].eventIds.map(String));
  const currentIds = eventIds.map(String);
  if (currentIds.length === 0) return false;
  const overlap = currentIds.filter((id) => prevIds.has(id)).length;
  const overlapRatio = overlap / currentIds.length;
  return overlapRatio >= 0.5;
}

/**
 * 直近days日間(today含む)の、投稿タイプを問わない合計投稿数(成功・dry-run含む)。
 * 朝枠全体の週間上限チェック用。
 */
function countPostsInLastDays(days, today) {
  const log = readLog();
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const end = new Date(today + 'T00:00:00Z');
  return log.posts.filter((p) => {
    if (p.status !== 'success' && p.status !== 'dry-run') return false;
    const posted = new Date(p.targetDate + 'T00:00:00Z');
    return posted >= cutoff && posted <= end;
  }).length;
}

module.exports = {
  LOG_PATH,
  readLog,
  writeLog,
  appendPost,
  recentPostsOfType,
  alreadyPostedForTarget,
  withinMinGap,
  isSubstantiallySameAsRecent,
  countPostsInLastDays,
};
