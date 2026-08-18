/**
 * eligibility.js - 投稿タイプごとの「対象イベント抽出」を担う純粋関数群。
 *
 * ここでは「投稿するかどうか」の最終判断はしない(それはdecide-and-post.js側)。
 * あくまで「今の events.js の状態なら、この投稿タイプの材料は何か」を機械的に返すだけ。
 * 事実の捏造をしないため、判定に使うのは events.js に実在するフィールドだけ
 * (予約要否・初参加歓迎などのフィールドはevents.jsに存在しないため一切参照しない)。
 */
const {
  overlapsRange,
  overlapsDate,
  publishedCircleEvents,
  minutesUntil,
} = require('./events-data');
const {
  TODAY_POST_MIN_EVENTS,
  LATER_TODAY_MIN_MINUTES_AHEAD,
  LATER_TODAY_MAX_MINUTES_AHEAD,
  RECOMMEND_MIN_DISTINCT_CATEGORIES,
} = require('./config');

/** 今日開催(終日含む)のイベント一覧 */
function getTodayEvents(allEvents, today) {
  return publishedCircleEvents(allEvents)
    .filter((ev) => overlapsDate(ev, today))
    .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
}

/** 今日から7日間(今日を含む)のイベント一覧。ホームの「今週開催」と同じ窓の取り方に揃えている。 */
function getWeekEvents(allEvents, today, addDaysStr) {
  const weekEnd = addDaysStr(today, 6);
  return publishedCircleEvents(allEvents)
    .filter((ev) => overlapsRange(ev, today, weekEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 「今日このあと」の対象を1件だけ選ぶ。
 * 条件: 今日開催 かつ startTime が確定していて、現在時刻から
 * LATER_TODAY_MIN_MINUTES_AHEAD〜LATER_TODAY_MAX_MINUTES_AHEAD 分後の間に開始する。
 * 複数該当する場合は最も開始が早いものを選ぶ(=直近で参加を検討しやすいもの)。
 * 該当なしなら null を返す(このタイプは無理に投稿しない前提)。
 */
function getLaterTodayEvent(allEvents, today) {
  const candidates = publishedCircleEvents(allEvents)
    .filter((ev) => overlapsDate(ev, today) && !!ev.startTime)
    .map((ev) => ({ ev, minsAhead: minutesUntil(ev.date, ev.startTime) }))
    .filter(({ minsAhead }) => minsAhead >= LATER_TODAY_MIN_MINUTES_AHEAD && minsAhead <= LATER_TODAY_MAX_MINUTES_AHEAD)
    .sort((a, b) => a.minsAhead - b.minsAhead);
  return candidates.length > 0 ? candidates[0].ev : null;
}

/** 今日は投稿する価値があるボリュームか(件数だけで判定。中身の質はdiversify側で見る) */
function isTodayPostWorthy(todayEvents) {
  return todayEvents.length >= TODAY_POST_MIN_EVENTS;
}

/**
 * テーマ型投稿の対象抽出。既存データで100%判定できる条件のみをテーマとして提供する。
 * 「無料イベント」テーマは config.THEME_FREE_EVENTS_ENABLED が false の間は呼び出し側で使わない。
 */
const THEME_DEFINITIONS = {
  publicWelcome: {
    key: 'publicWelcome',
    label: '一般参加できるイベント',
    match: (ev) => Array.isArray(ev.target) && ev.target.includes('public'),
  },
  cultureAndTalks: {
    key: 'cultureAndTalks',
    label: '文化・講演イベント',
    match: (ev) => ['culture', 'theater', 'lecture', 'music'].includes(ev.category),
  },
  weekend: {
    key: 'weekend',
    label: '週末のイベント',
    // 直近の土日(今日から7日以内)に重なるイベント。曜日はUTC日付から機械的に判定。
    match: (ev, today, addDaysStr) => {
      const weekEnd = addDaysStr(today, 6);
      if (!overlapsRange(ev, today, weekEnd)) return false;
      // 単日/複数日いずれも、範囲内に土(6)か日(0)を含むかを見る
      const start = new Date(ev.date + 'T00:00:00Z');
      const end = new Date((ev.endDate || ev.date) + 'T00:00:00Z');
      for (let d = new Date(Math.max(start, new Date(today + 'T00:00:00Z'))); d <= end && d <= new Date(weekEnd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
        const dow = d.getUTCDay();
        if (dow === 0 || dow === 6) return true;
      }
      return false;
    },
  },
};

function getThemeEvents(allEvents, today, addDaysStr, themeKey) {
  const def = THEME_DEFINITIONS[themeKey];
  if (!def) return [];
  const weekEnd = addDaysStr(today, 6);
  return publishedCircleEvents(allEvents)
    .filter((ev) => overlapsRange(ev, today, weekEnd) && def.match(ev, today, addDaysStr))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * おすすめ機能誘導投稿を出す価値があるか。
 * 「在庫が極端に偏っている場合は投稿を控えてください」(指示書12番)への対応として、
 * 今週の対象イベントが一定カテゴリ数以上に分散している週だけtrueにする。
 */
function isRecommendWorthy(weekEvents) {
  const categories = new Set(weekEvents.map((ev) => ev.category));
  return categories.size >= RECOMMEND_MIN_DISTINCT_CATEGORIES;
}

module.exports = {
  getTodayEvents,
  getWeekEvents,
  getLaterTodayEvent,
  isTodayPostWorthy,
  THEME_DEFINITIONS,
  getThemeEvents,
  isRecommendWorthy,
};
