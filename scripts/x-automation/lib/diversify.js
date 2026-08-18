/**
 * diversify.js - カテゴリ偏重を防ぐための選定ロジック。
 *
 * recommendation.js の diversify() と同じ考え方(特定カテゴリで埋め尽くさない)を、
 * 週次投稿の「列挙する数件」の選定に転用したもの。
 * 現状スポーツが公開イベントの74%を占めるため、これを入れないと「今週の早稲田」が
 * 毎回スポーツの試合予定だけになり、指示書6番Bで明示的に禁止されている
 * 「スポーツだけを大量列挙して他ジャンルが存在するように見せる」状態になってしまう。
 */
const { WEEKLY_MAX_PER_CATEGORY, WEEKLY_MAX_CATEGORIES_SHOWN } = require('./config');

/**
 * イベント一覧から、カテゴリごとに最大N件までという上限を守りつつ、
 * できるだけ多くの異なるカテゴリが登場するように選び出す。
 * 各カテゴリ内では日付が早い順を優先する(呼び出し側で事前ソート済み前提)。
 *
 * 戻り値: { selected: [{category, events: [...]}], totalEligible, shownCategories, omittedCategories }
 */
function diversifyByCategory(events, {
  maxPerCategory = WEEKLY_MAX_PER_CATEGORY,
  maxCategories = WEEKLY_MAX_CATEGORIES_SHOWN,
} = {}) {
  const byCategory = new Map();
  events.forEach((ev) => {
    const cat = ev.category || 'other';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(ev);
  });

  // カテゴリの登場順は「件数が多い順」ではなく「日付が一番早いイベントを持つ順」にする。
  // 件数順にすると結局スポーツが常に先頭に来て、実質的な偏重表示になるため。
  const categoriesSortedByEarliestDate = Array.from(byCategory.entries())
    .map(([cat, evs]) => ({ cat, evs: evs.slice().sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => a.evs[0].date.localeCompare(b.evs[0].date));

  const shown = categoriesSortedByEarliestDate.slice(0, maxCategories);
  const omitted = categoriesSortedByEarliestDate.slice(maxCategories);

  const selected = shown.map(({ cat, evs }) => ({
    category: cat,
    events: evs.slice(0, maxPerCategory),
    omittedCount: Math.max(0, evs.length - maxPerCategory),
  }));

  return {
    selected,
    totalEligible: events.length,
    shownCategories: shown.map((s) => s.cat),
    omittedCategories: omitted.map((s) => s.cat),
  };
}

module.exports = { diversifyByCategory };
