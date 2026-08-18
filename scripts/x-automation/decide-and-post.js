#!/usr/bin/env node
/**
 * decide-and-post.js - Waseda Calendar X自動投稿のメインエントリポイント。
 *
 * 実行方法:
 *   node scripts/x-automation/decide-and-post.js --slot=morning
 *   node scripts/x-automation/decide-and-post.js --slot=midday
 *   node scripts/x-automation/decide-and-post.js --slot=all      (Dry Run検証・手動確認用。全タイプ評価)
 *
 * 環境変数:
 *   X_DRY_RUN=true            … 実際には投稿せず、判断結果をログ出力するだけ(既定はtrueとして扱う。
 *                                明示的に "false" を指定した場合のみ本番投稿する、安全側の初期値)
 *   X_AUTOMATION_ENABLED=false … これがfalseなら、dryRunの値に関わらず一切の投稿判断を行わず即終了する
 *                                (Kill Switch。コード変更なしで全自動投稿を止められる)
 *   WC_NOW_OVERRIDE=2026-08-24 … 「今日」を固定する(テスト・シミュレーション用)
 *
 * slotの考え方:
 *   morning (JST朝7:30想定) … weekly(月曜のみ)/today/theme/recommend をまとめて評価。
 *     どのタイプも「投稿する価値があるか」を各タイプの条件で判定し、無ければ何もしない。
 *   midday  (JST昼12:30想定) … later_today のみを評価(時間帯依存のため独立)。
 */
const {
  loadEvents,
  todayStr,
  addDaysStr,
  publishedCircleEvents,
} = require('./lib/events-data');
const { POST_TYPES, THEME_FREE_EVENTS_ENABLED } = require('./lib/config');
const {
  getTodayEvents,
  getWeekEvents,
  getLaterTodayEvent,
  isTodayPostWorthy,
  THEME_DEFINITIONS,
  getThemeEvents,
  isRecommendWorthy,
} = require('./lib/eligibility');
const { diversifyByCategory } = require('./lib/diversify');
const { buildEventUrl, buildHomeUrl } = require('./lib/url-builder');
const {
  composeTodayPost,
  composeWeeklyPost,
  composeLaterTodayPost,
  composeThemePost,
  composeRecommendPost,
  weightedLength,
} = require('./lib/copy-templates');
const {
  alreadyPostedForTarget,
  withinMinGap,
  isSubstantiallySameAsRecent,
  appendPost,
} = require('./lib/post-log');
const { postTweet } = require('./lib/x-client');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

function isDryRun() {
  // 明示的に "false" と指定された場合だけ本番投稿。それ以外(未設定含む)は安全側でdry run。
  return process.env.X_DRY_RUN !== 'false';
}

function isAutomationEnabled() {
  return process.env.X_AUTOMATION_ENABLED !== 'false';
}

/** 1件の投稿判断を実行し、結果をログに記録する共通処理。 */
async function attemptPost({ postTypeKey, targetDate, eventIds, text, dryRun }) {
  const meta = POST_TYPES[postTypeKey];
  const weight = weightedLength(text);
  console.log(`\n[${meta.label}] 投稿候補を生成しました (targetDate=${targetDate}, weight=${weight}/280)`);
  console.log('---');
  console.log(text);
  console.log('---');

  const result = await postTweet(text, { dryRun });
  const record = {
    postedAt: new Date().toISOString(),
    postType: meta.id,
    targetDate,
    eventIds,
    campaign: meta.campaign,
    claudeUsed: false,
    status: result.ok ? (dryRun ? 'dry-run' : 'success') : 'failed',
    postId: result.postId || null,
    errorType: result.ok ? null : (result.error ? result.error.type : null),
  };
  appendPost(record);

  if (!result.ok) {
    console.error(`[${meta.label}] 投稿に失敗しました: ${result.error ? result.error.message : '不明なエラー'}`);
  } else if (dryRun) {
    console.log(`[${meta.label}] Dry Run: 実際の投稿は行っていません。`);
  } else {
    console.log(`[${meta.label}] 投稿しました。Post ID: ${result.postId}`);
  }
  return result;
}

/** 投稿してよいか(頻度キャップ・冪等性・重複感)の共通ゲート。理由文字列を返す(null=投稿可)。 */
function gateCheck(postTypeKey, targetDate, eventIds) {
  const meta = POST_TYPES[postTypeKey];
  if (!meta.enabled) return `${meta.label}は設定で無効化されています`;
  if (alreadyPostedForTarget(meta.id, targetDate)) return `${meta.label}は本日分(${targetDate})を投稿済みです(冪等性チェック)`;
  if (withinMinGap(meta.id, meta.minGapDays, targetDate)) return `${meta.label}は前回投稿から${meta.minGapDays}日以内のため見送り`;
  if (isSubstantiallySameAsRecent(meta.id, eventIds)) return `${meta.label}は直近の投稿と対象イベントが半数以上重複するため見送り(重複感対策)`;
  return null;
}

async function runToday(events, today, dryRun) {
  const todayEvents = getTodayEvents(events, today);
  if (!isTodayPostWorthy(todayEvents)) {
    console.log(`[今日の早稲田] 見送り: 対象${todayEvents.length}件(最低3件必要)`);
    return;
  }
  const eventIds = todayEvents.map((e) => e.id);
  const reason = gateCheck('today', today, eventIds);
  if (reason) { console.log(`[今日の早稲田] 見送り: ${reason}`); return; }

  const url = buildHomeUrl(POST_TYPES.today.campaign, 'today-section');
  const { text } = composeTodayPost({ dateStr: today, events: todayEvents.slice(0, 6), url, omittedCount: Math.max(0, todayEvents.length - 6) });
  await attemptPost({ postTypeKey: 'today', targetDate: today, eventIds, text, dryRun });
}

async function runWeekly(events, today, dryRun) {
  const isMonday = new Date(today + 'T00:00:00Z').getUTCDay() === 1;
  if (!isMonday) {
    console.log('[今週の早稲田] 見送り: 月曜日のみ投稿する運用のため');
    return;
  }
  const weekEnd = addDaysStr(today, 6);
  const weekEvents = getWeekEvents(events, today, addDaysStr);
  if (weekEvents.length === 0) {
    console.log('[今週の早稲田] 見送り: 対象イベント0件');
    return;
  }
  const diversified = diversifyByCategory(weekEvents);
  const eventIds = diversified.selected.flatMap((s) => s.events.map((e) => e.id));
  const reason = gateCheck('weekly', today, eventIds);
  if (reason) { console.log(`[今週の早稲田] 見送り: ${reason}`); return; }

  const url = buildHomeUrl(POST_TYPES.weekly.campaign, 'upcoming-section');
  const { text } = composeWeeklyPost({ fromStr: today, toStr: weekEnd, diversified, url });
  await attemptPost({ postTypeKey: 'weekly', targetDate: today, eventIds, text, dryRun });
}

async function runLaterToday(events, today, dryRun) {
  const ev = getLaterTodayEvent(events, today);
  if (!ev) {
    console.log('[今日このあと] 見送り: 開始時刻が確定していて、かつ「もうすぐ」と呼べる範囲のイベントなし');
    return;
  }
  if (!ev.location) {
    console.log('[今日このあと] 見送り: 会場情報が無く、文面が成立しないため(推測での補完は禁止)');
    return;
  }
  const eventIds = [ev.id];
  const reason = gateCheck('laterToday', today, eventIds);
  if (reason) { console.log(`[今日このあと] 見送り: ${reason}`); return; }

  const url = buildEventUrl(ev, POST_TYPES.laterToday.campaign);
  const { text } = composeLaterTodayPost({ ev, url });
  await attemptPost({ postTypeKey: 'laterToday', targetDate: today, eventIds, text, dryRun });
}

async function runTheme(events, today, dryRun) {
  const themeKeys = Object.keys(THEME_DEFINITIONS).filter((k) => THEME_FREE_EVENTS_ENABLED || k !== 'freeEvents');
  // 複数テーマの中からその日1つだけ、シード的に決定論で選ぶ(日替わりで偏らないようにローテーション)
  const dayIndex = new Date(today + 'T00:00:00Z').getUTCDate();
  const themeKey = themeKeys[dayIndex % themeKeys.length];

  const themeEvents = getThemeEvents(events, today, addDaysStr, themeKey);
  if (themeEvents.length < 3) {
    console.log(`[テーマ型投稿(${themeKey})] 見送り: 対象${themeEvents.length}件(最低3件必要)`);
    return;
  }
  const diversified = diversifyByCategory(themeEvents, { maxPerCategory: 3, maxCategories: 3 });
  const eventIds = diversified.selected.flatMap((s) => s.events.map((e) => e.id));
  const reason = gateCheck('theme', today, eventIds);
  if (reason) { console.log(`[テーマ型投稿(${themeKey})] 見送り: ${reason}`); return; }

  const url = buildHomeUrl(POST_TYPES.theme.campaign, 'calendar-section');
  const { text } = composeThemePost({ themeKey, dateStr: today, diversified, url });
  await attemptPost({ postTypeKey: 'theme', targetDate: today, eventIds, text, dryRun });
}

async function runRecommend(events, today, dryRun) {
  const weekEvents = getWeekEvents(events, today, addDaysStr);
  if (!isRecommendWorthy(weekEvents)) {
    console.log('[おすすめ機能誘導] 見送り: 今週の対象イベントのジャンルが偏っているため(在庫偏重時は投稿しない方針)');
    return;
  }
  const eventIds = []; // 個別イベントを列挙する投稿ではないため空(重複感チェックは投稿タイプ単位の頻度キャップで担保)
  const reason = gateCheck('recommend', today, eventIds);
  if (reason) { console.log(`[おすすめ機能誘導] 見送り: ${reason}`); return; }

  const url = buildHomeUrl(POST_TYPES.recommend.campaign, 'recommend-entry');
  const { text } = composeRecommendPost({ dateStr: today, url });
  await attemptPost({ postTypeKey: 'recommend', targetDate: today, eventIds, text, dryRun });
}

async function main() {
  const args = parseArgs();
  const slot = args.slot || 'morning';
  const dryRun = isDryRun();

  if (!isAutomationEnabled()) {
    console.log('[Kill Switch] X_AUTOMATION_ENABLED=false のため、判断・投稿を一切行わずに終了します。');
    return;
  }

  const events = loadEvents();
  const today = todayStr();
  console.log(`=== decide-and-post.js 実行 (slot=${slot}, today=${today}, dryRun=${dryRun}) ===`);

  if (slot === 'morning' || slot === 'all') {
    await runWeekly(events, today, dryRun);
    await runToday(events, today, dryRun);
    await runTheme(events, today, dryRun);
    await runRecommend(events, today, dryRun);
  }
  if (slot === 'midday' || slot === 'all') {
    await runLaterToday(events, today, dryRun);
  }

  console.log('\n=== 完了 ===');
}

main().catch((err) => {
  console.error('決定/投稿処理で予期しないエラーが発生しました:', err);
  process.exitCode = 1;
});
