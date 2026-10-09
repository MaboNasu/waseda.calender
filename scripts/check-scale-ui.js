#!/usr/bin/env node
/**
 * check-scale-ui.js
 *
 * イベント/団体数が増えたときに、少数件前提のUIへ退行しないための軽量回帰チェック。
 * ブラウザE2Eではなく、データ量と実装上の必須ガードをCIで検証する。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadArray(file, symbol) {
  const src = read(file);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nvar __WC_SCALE_EXPORT__ = typeof ${symbol} !== "undefined" ? ${symbol} : [];`, sandbox, { filename: file });
  return Array.isArray(sandbox.__WC_SCALE_EXPORT__) ? sandbox.__WC_SCALE_EXPORT__ : [];
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  }
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label}: "${needle}" が見つかりません`);
}

const events = loadArray('events.js', 'EVENTS');
const organizations = loadArray('organizations.js', 'ORGANIZATIONS');
const published = events.filter(ev => ev && ev.isPublished);

const script = read('script.js');
const style = read('style.css');
const orgPage = read('organizations-page.js');
const generator = read('scripts/generate-event-pages.js');
const contactHtml = read('contact.html');
const serviceWorker = read('service-worker.js');

const eventIds = new Set();
published.forEach(ev => {
  assert(ev.id, '公開イベントにidがありません');
  assert(ev.title, `${ev.id || '(id不明)'}: titleがありません`);
  assert(ev.date, `${ev.id || '(id不明)'}: dateがありません`);
  assert(!eventIds.has(String(ev.id)), `公開イベントidが重複しています: ${ev.id}`);
  eventIds.add(String(ev.id));
});

const orgIds = new Set();
organizations.forEach(org => {
  assert(org.id, '団体にidがありません');
  assert(org.name, `${org.id || '(id不明)'}: nameがありません`);
  assert(!orgIds.has(String(org.id)), `団体idが重複しています: ${org.id}`);
  orgIds.add(String(org.id));
});

// データ量の現状をログに残し、CI上で増加傾向を追いやすくする。
const longestTitle = published.reduce((max, ev) => Math.max(max, String(ev.title || '').length), 0);
const longestLocation = published.reduce((max, ev) => Math.max(max, String(ev.location || '').length), 0);
const longestOrganizer = published.reduce((max, ev) => Math.max(max, String(ev.organizer || '').length), 0);
console.log(`公開イベント: ${published.length}件 / 団体: ${organizations.length}件`);
console.log(`最長文字数 title=${longestTitle}, location=${longestLocation}, organizer=${longestOrganizer}`);

// 大量イベント対応の退行防止。
assertIncludes(script, "MOBILE_CALENDAR_DAY_VISIBLE_COUNT = 3", 'スマホ日別上限');
assertIncludes(script, "'today-section': 3", 'スマホ本日初期表示');
assertIncludes(script, "'upcoming-section': 5", 'スマホ7日間初期表示');
assertIncludes(script, 'handleCalendarDayCellClick', 'PC日付セルクリック');
assertIncludes(script, 'compareEventsChronologically', '日別時刻順');
assertIncludes(script, 'getEventTimeLabel', '時刻状態の共通表示');
assertIncludes(script, 'getEventLocationLabel', '場所状態の共通表示');
assertIncludes(script, "ev.location || ''", '場所を含むキーワード検索');
assertIncludes(script, 'LIVE_REACTION_CACHE_TTL_MS', 'リアクション取得キャッシュ');
assertIncludes(style, '-webkit-line-clamp: 3', '長いイベントタイトルのクランプ');
assertIncludes(style, '.cal-list-more', 'スマホ日別の残件導線');
assertIncludes(style, '.day-event-list-item', '日別一覧のコンパクトUI');
assertIncludes(style, '.org-archive-event-extra', '団体開催実績の折りたたみ');
assert(!orgPage.includes('すべての団体を表示する（504件）'), '団体総数を504件で固定しないでください');
assertIncludes(orgPage, 'getOrganizations().length', '団体総数の動的表示');

// キャッシュ/静的生成の版ズレ防止。
assertIncludes(generator, '/style.css?v=46', '生成イベントページ style version');
assertIncludes(generator, '/script.js?v=38', '生成イベントページ script version');
assertIncludes(generator, '/image-generator.js?v=8', '生成イベントページ image generator version');
assertIncludes(generator, '/auth-ui.js?v=5', '生成イベントページ auth UI version');
assertIncludes(contactHtml, 'organizations.js?v=8', '問い合わせページ organization data version');
assertIncludes(serviceWorker, 'image-generator', 'Service Worker freshness-critical assets');
assertIncludes(serviceWorker, "wc-cache-v11", 'Service Worker cache version');

// 実データに長文が増えても、UI側に長文対策が残っていることを確認する。
// 現時点で長文データが無い環境でもチェック自体は失敗させない。
if (longestTitle >= 40 || longestLocation >= 25 || longestOrganizer >= 25) {
  assertIncludes(style, '-webkit-line-clamp', '長文データ用クランプ');
}

if (process.exitCode) {
  console.error('スケールUI回帰チェックに失敗しました。');
  process.exit(process.exitCode);
}
console.log('✅ スケールUI回帰チェック: OK');
