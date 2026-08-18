/**
 * events-data.js - events.js の安全な読み込みと、日付まわりの共通ヘルパー。
 *
 * loadEvents() は scripts/generate-sitemap.js の loadEvents() と同じ vm ベースの手法を踏襲。
 * ビルドツール・npm依存なしで動かす方針のため、ここでも Node 標準の vm モジュールだけを使う。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');

function loadEvents() {
  const src = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar __EXPORTED_EVENTS__ = (typeof EVENTS !== "undefined") ? EVENTS : undefined;', sandbox, { filename: 'events.js' });
  return Array.isArray(sandbox.__EXPORTED_EVENTS__) ? sandbox.__EXPORTED_EVENTS__ : [];
}

/** 今日の日付文字列(YYYY-MM-DD)をJSTで取得。テスト時は WC_NOW_OVERRIDE (YYYY-MM-DD or ISO) で固定可能。 */
function nowJST() {
  if (process.env.WC_NOW_OVERRIDE) {
    return new Date(process.env.WC_NOW_OVERRIDE);
  }
  // GitHub Actions runnerはUTC。JSTはUTC+9。
  const utcNow = new Date();
  return new Date(utcNow.getTime() + 9 * 60 * 60 * 1000);
}

function formatDateStr(d) {
  const y = d.getUTCFullYear ? d.getUTCFullYear() : d.getFullYear();
  // nowJST()はUTC+9したDateオブジェクトを「ローカルのつもりで」UTCメソッドで読む運用にする
  // (GitHub Actions runnerのタイムゾーンに依存しないようにするため、常にUTCゲッターで統一)
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayStr() {
  return formatDateStr(nowJST());
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return formatDateStr(d);
}

/** イベントが指定した日付範囲[from, to]と重なりを持つか(endDateが無ければ単日扱い) */
function overlapsRange(ev, from, to) {
  const end = ev.endDate || ev.date;
  return ev.date <= to && end >= from;
}

/** イベントが指定日1日と重なるか */
function overlapsDate(ev, dateStr) {
  return overlapsRange(ev, dateStr, dateStr);
}

/** 学事日程(scope:"schedule")を除いた、公開中のサークル/団体イベントだけを対象にする。
 *  X投稿は「参加できるイベント」を紹介する主旨のため、休業期間・授業週などの学事日程は対象外。 */
function publishedCircleEvents(events) {
  return events.filter((e) => e.isPublished !== false && e.scope !== 'schedule');
}

/** 現在時刻(JST, "HH:MM"文字列)を返す */
function nowTimeStr() {
  const d = nowJST();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 今日の日付+HH:MM時刻から、現在時刻までの残り分数を計算する(負なら既に過去) */
function minutesUntil(dateStr, timeStr) {
  const now = nowJST();
  const target = new Date(`${dateStr}T${timeStr}:00Z`);
  // nowJSTはUTC+9済みのDateなので、targetも同じ「UTC+9を生のUTCとして扱う」表現に合わせる
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

module.exports = {
  loadEvents,
  nowJST,
  formatDateStr,
  todayStr,
  addDaysStr,
  overlapsRange,
  overlapsDate,
  publishedCircleEvents,
  nowTimeStr,
  minutesUntil,
};
