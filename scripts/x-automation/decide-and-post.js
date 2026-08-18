#!/usr/bin/env node
/**
 * decide-and-post.js - Waseda Calendar X自動投稿のメインエントリポイント。
 *
 * 実行方法:
 *   node scripts/x-automation/decide-and-post.js --slot=morning
 *   node scripts/x-automation/decide-and-post.js --slot=midday
 *   node scripts/x-automation/decide-and-post.js --slot=all      (Dry Run検証・手動確認用。両枠を評価)
 *
 * 環境変数:
 *   X_DRY_RUN=true            … 実際には投稿せず、判断結果をログ出力するだけ(既定はtrueとして扱う。
 *                                明示的に "false" を指定した場合のみ本番投稿する、安全側の初期値)
 *   X_AUTOMATION_ENABLED=false … これがfalseなら、dryRunの値に関わらず一切の投稿判断を行わず即終了する
 *                                (Kill Switch。コード変更なしで全自動投稿を止められる)
 *   WC_NOW_OVERRIDE=2026-08-24 … 「今日」を固定する(テスト・シミュレーション用)
 *
 * slotの考え方:
 *   morning (JST朝7:30想定) … weekly(月曜のみ)/today/theme/recommend を全て候補として評価するが、
 *     投稿するのは優先順位(週次→当日→テーマ→おすすめ)に従って最も価値が高い1件だけ
 *     (「条件を満たしたら全部投稿」ではなく「候補生成と投稿決定を分離し、1枠1投稿にする」設計。
 *     ChatGPTとの検討会議(2026-08-18)で「同じ朝に最大4件同時投稿されうる」設計上の抜けを
 *     指摘され、本番投入前に修正した)。
 *   midday  (JST昼12:30想定) … later_today のみを評価(時間帯依存のため独立、朝枠の選定結果に影響されない)。
 */
const {
  loadEvents,
  todayStr,
  addDaysStr,
  publishedCircleEvents,
} = require('./lib/events-data');
const { POST_TYPES, THEME_FREE_EVENTS_ENABLED, WEEKLY_TOTAL_POST_CAP } = require('./lib/config');
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
  countPostsInLastDays,
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

/**
 * 朝枠の各投稿タイプは「候補を作る」だけを行い、投稿はしない
 * (投稿するかどうかはrunMorningSlotが優先順位に従って1件だけ決める)。
 * 戻り値: 候補があれば { candidate: {...} }、無ければ { reason: '見送り理由' }。
 */
function buildTodayCandidate(events, today) {
  const todayEvents = getTodayEvents(events, today);
  if (!isTodayPostWorthy(todayEvents)) {
    return { reason: `対象${todayEvents.length}件(最低3件必要)` };
  }
  const eventIds = todayEvents.map((e) => e.id);
  const reason = gateCheck('today', today, eventIds);
  if (reason) return { reason };

  const url = buildHomeUrl(POST_TYPES.today.campaign, 'today-section');
  const { text } = composeTodayPost({ dateStr: today, events: todayEvents.slice(0, 6), url, omittedCount: Math.max(0, todayEvents.length - 6) });
  return { candidate: { postTypeKey: 'today', targetDate: today, eventIds, text } };
}

function buildWeeklyCandidate(events, today) {
  const isMonday = new Date(today + 'T00:00:00Z').getUTCDay() === 1;
  if (!isMonday) return { reason: '月曜日のみ投稿する運用のため' };
  const weekEnd = addDaysStr(today, 6);
  const weekEvents = getWeekEvents(events, today, addDaysStr);
  if (weekEvents.length === 0) return { reason: '対象イベント0件' };
  const diversified = diversifyByCategory(weekEvents);
  const eventIds = diversified.selected.flatMap((s) => s.events.map((e) => e.id));
  const reason = gateCheck('weekly', today, eventIds);
  if (reason) return { reason };

  const url = buildHomeUrl(POST_TYPES.weekly.campaign, 'upcoming-section');
  const { text } = composeWeeklyPost({ fromStr: today, toStr: weekEnd, diversified, url });
  return { candidate: { postTypeKey: 'weekly', targetDate: today, eventIds, text } };
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

function buildThemeCandidate(events, today) {
  const themeKeys = Object.keys(THEME_DEFINITIONS).filter((k) => THEME_FREE_EVENTS_ENABLED || k !== 'freeEvents');
  // 複数テーマの中からその日1つだけ、シード的に決定論で選ぶ(日替わりで偏らないようにローテーション)
  const dayIndex = new Date(today + 'T00:00:00Z').getUTCDate();
  const themeKey = themeKeys[dayIndex % themeKeys.length];

  const themeEvents = getThemeEvents(events, today, addDaysStr, themeKey);
  if (themeEvents.length < 3) {
    return { reason: `テーマ(${themeKey})対象${themeEvents.length}件(最低3件必要)` };
  }
  const diversified = diversifyByCategory(themeEvents, { maxPerCategory: 3, maxCategories: 3 });
  const eventIds = diversified.selected.flatMap((s) => s.events.map((e) => e.id));
  const reason = gateCheck('theme', today, eventIds);
  if (reason) return { reason };

  const url = buildHomeUrl(POST_TYPES.theme.campaign, 'calendar-section');
  const { text } = composeThemePost({ themeKey, dateStr: today, diversified, url });
  return { candidate: { postTypeKey: 'theme', targetDate: today, eventIds, text } };
}

function buildRecommendCandidate(events, today) {
  const weekEvents = getWeekEvents(events, today, addDaysStr);
  if (!isRecommendWorthy(weekEvents)) {
    return { reason: '今週の対象イベントのジャンルが偏っているため(在庫偏重時は投稿しない方針)' };
  }
  const eventIds = []; // 個別イベントを列挙する投稿ではないため空(重複感チェックは投稿タイプ単位の頻度キャップで担保)
  const reason = gateCheck('recommend', today, eventIds);
  if (reason) return { reason };

  const url = buildHomeUrl(POST_TYPES.recommend.campaign, 'recommend-entry');
  const { text } = composeRecommendPost({ dateStr: today, url });
  return { candidate: { postTypeKey: 'recommend', targetDate: today, eventIds, text } };
}

/**
 * 朝枠(7:30想定)の実行本体。weekly/today/theme/recommendを全て候補として評価した上で、
 * 優先順位(週次→当日→テーマ→おすすめ)で最初に見つかった1件だけを投稿する。
 * 条件を満たした他の候補は「見送り」としてログに残すだけで投稿はしない(1枠1投稿の方針)。
 */
async function runMorningSlot(events, today, dryRun) {
  const recentTotal = countPostsInLastDays(7, today);
  if (recentTotal >= WEEKLY_TOTAL_POST_CAP) {
    console.log(`[朝枠] 見送り: 直近7日間の投稿数が${recentTotal}件で上限(${WEEKLY_TOTAL_POST_CAP}件)に達しているため`);
    return;
  }

  const builders = [
    { key: 'weekly', label: POST_TYPES.weekly.label, build: buildWeeklyCandidate },
    { key: 'today', label: POST_TYPES.today.label, build: buildTodayCandidate },
    { key: 'theme', label: POST_TYPES.theme.label, build: buildThemeCandidate },
    { key: 'recommend', label: POST_TYPES.recommend.label, build: buildRecommendCandidate },
  ];

  const qualified = [];
  builders.forEach(({ key, label, build }) => {
    const { candidate, reason } = build(events, today);
    if (candidate) {
      qualified.push({ key, label, candidate });
    } else {
      console.log(`[朝枠候補:${label}] 見送り: ${reason}`);
    }
  });

  if (qualified.length === 0) {
    console.log('[朝枠] 本日は投稿対象の候補がありませんでした');
    return;
  }

  const [chosen, ...discarded] = qualified;
  if (discarded.length > 0) {
    console.log(`[朝枠] 条件は満たしたが1枠1投稿の方針により見送り: ${discarded.map((d) => d.label).join('、')}`);
  }
  console.log(`[朝枠] 選択: ${chosen.label}`);
  await attemptPost({ ...chosen.candidate, dryRun });
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
    await runMorningSlot(events, today, dryRun);
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
