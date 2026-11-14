/**
 * scripts/lib/event-data.js
 *
 * 品質検査スクリプト（check-event-data.js / verify-event-sources.js / review-queue.js）が共通で使う
 * 読み込み・正規化の関数。依存パッケージは使わない（このプロジェクトの方針）。
 *
 * ここでの「正規化」は、比較のためだけの機械的な変換（全角半角・空白・括弧の揺れ）に限る。
 * 翻訳・略記の展開・言い換えは一切しない。表示用の値を書き換えるのは naming-dictionary.json に
 * 運営者が承認した組み合わせがある場合だけ（check-event-data.js --fix）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const EVENTS_PATH = path.join(ROOT, 'events.js');
const ORGS_PATH = path.join(ROOT, 'organizations.js');
const DICT_PATH = path.join(ROOT, 'scripts', 'naming-dictionary.json');

function evalArray(source, name) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${source}\n;this.__out = ${name};`, ctx);
  return ctx.__out;
}

function loadEvents(source) {
  return evalArray(source ?? fs.readFileSync(EVENTS_PATH, 'utf8'), 'EVENTS');
}

function loadOrganizations() {
  return evalArray(fs.readFileSync(ORGS_PATH, 'utf8'), 'ORGANIZATIONS');
}

function loadDictionary() {
  return JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
}

/** 比較用の正規化。NFKC（全角英数→半角、半角カナ→全角）、空白の除去、括弧・波ダッシュ類の統一。 */
function normalizeForMatch(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[〜～~]/g, '~')
    .replace(/[‐‑‒–—―−-]+/g, '-')
    .replace(/[「『]/g, '「').replace(/[」』]/g, '」')
    .replace(/[〈《＜<]/g, '<').replace(/[〉》＞>]/g, '>')
    .replace(/[【［\[]/g, '[').replace(/[】］\]]/g, ']')
    .toLowerCase();
}

/** 今日の日付（JST, YYYY-MM-DD）。WC_TODAY 環境変数で固定できる（テスト用）。 */
function todayJst() {
  if (process.env.WC_TODAY) return process.env.WC_TODAY;
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 公開中で、今日以降に終わる（または今日以降に始まる）イベントか */
function isUpcoming(ev, today, untilDays) {
  if (ev.isPublished === false) return false;
  const end = ev.endDate || ev.date;
  if (!end || end < today) return false;
  if (untilDays != null && ev.date > addDays(today, untilDays)) return false;
  return true;
}

/**
 * events.js の中の1イベントのオブジェクトリテラルの範囲（開始・終了の文字位置）を返す。
 * `id: "evt-xxx"` の行から、そのオブジェクトの { } の対応で範囲を決める。
 * 文字列リテラル内の括弧は飛ばす。見つからなければ null。
 */
function findEventObjectRange(source, id) {
  const idPattern = new RegExp(`id:\\s*["']${id.replace(/[-]/g, '\\-')}["']`);
  const m = idPattern.exec(source);
  if (!m) return null;
  // 開き括弧を後ろ向きに探す
  let start = source.lastIndexOf('{', m.index);
  if (start < 0) return null;
  let depth = 0;
  let inStr = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

/** JSの文字列リテラルとして安全な表記（ダブルクォート） */
function jsString(value) {
  return JSON.stringify(String(value));
}

/**
 * events.js の1イベントの1項目を書き換える（他の部分の書式は変えない）。
 * 項目がなければ lastUpdated の直前（なければ isPublished の直前）に追加する。
 * value が undefined なら項目を削除する。
 */
function setEventField(source, id, key, value) {
  const range = findEventObjectRange(source, id);
  if (!range) throw new Error(`events.js に ${id} が見つかりません`);
  let body = source.slice(range.start, range.end);
  const fieldRe = new RegExp(`(\\n([ \\t]*))${key}:\\s*(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\[[^\\]]*\\]|true|false|null|-?[\\d.]+)(,?)`);
  const literal = value === undefined ? null
    : (typeof value === 'boolean' || typeof value === 'number') ? String(value)
    : Array.isArray(value) ? `[${value.map(jsString).join(", ")}]`
    : jsString(value);
  const fm = fieldRe.exec(body);
  if (fm) {
    if (literal === null) {
      body = body.slice(0, fm.index) + body.slice(fm.index + fm[0].length);
    } else {
      body = body.slice(0, fm.index) + `${fm[1]}${key}: ${literal}${fm[3]}` + body.slice(fm.index + fm[0].length);
    }
  } else if (literal !== null) {
    const anchor = /\n([ \t]*)(lastUpdated|isPublished):/.exec(body);
    if (!anchor) throw new Error(`${id} に項目を追加する位置が見つかりません`);
    body = body.slice(0, anchor.index) + `\n${anchor[1]}${key}: ${literal},` + body.slice(anchor.index);
  }
  return source.slice(0, range.start) + body + source.slice(range.end);
}

module.exports = {
  ROOT,
  EVENTS_PATH,
  ORGS_PATH,
  DICT_PATH,
  loadEvents,
  loadOrganizations,
  loadDictionary,
  normalizeForMatch,
  todayJst,
  addDays,
  isUpcoming,
  findEventObjectRange,
  setEventField,
};
