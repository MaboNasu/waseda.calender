#!/usr/bin/env node
'use strict';
/**
 * Results candidate queue. No network access, LLM calls, GitHub writes or publication.
 *
 * node scripts/results-collection-queue.js [--as-of YYYY-MM-DD] [--limit 8]
 *      [--include-reports] [--backfill] [--state PATH] [--format json|md]
 *      [--output PATH]
 * node scripts/results-collection-queue.js mark --id evt-123
 *      --status not_found|conflict|not_applicable|cancelled|pending|approved|published
 *      [--checked-at YYYY-MM-DD] [--note TEXT] [--state PATH]
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_STATE = path.join(ROOT, '.local', 'results-collection-state.json');
const CHECK_DAYS = [1, 3, 7, 14, 30];
const REPORT_CATEGORIES = new Set(['music', 'theater', 'culture']);
const DONE = new Set(['not_applicable', 'cancelled', 'approved', 'published']);
const STATES = new Set(['pending', 'not_found', 'conflict', ...DONE]);

function parseArgs(argv) {
  const args = { command: 'queue', limit: 8, format: 'md', state: DEFAULT_STATE, includeReports: false, backfill: false };
  let i = 0;
  if (argv[0] === 'mark') { args.command = 'mark'; i = 1; }
  for (; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--include-reports') { args.includeReports = true; continue; }
    if (token === '--backfill') { args.backfill = true; continue; }
    const keys = { '--as-of': 'asOf', '--limit': 'limit', '--state': 'state', '--format': 'format', '--output': 'output', '--id': 'id', '--status': 'status', '--checked-at': 'checkedAt', '--note': 'note', '--events': 'events', '--results': 'results' };
    if (!(token in keys) || i + 1 >= argv.length) throw Error('Unknown or incomplete argument: ' + token);
    args[keys[token]] = argv[++i];
  }
  args.limit = Number(args.limit);
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000) throw Error('--limit must be an integer from 1 to 1000');
  if (!['md', 'json'].includes(args.format)) throw Error('--format must be md or json');
  return args;
}

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayJst() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const v = (key) => parts.find((p) => p.type === key).value;
  return v('year') + '-' + v('month') + '-' + v('day');
}

function dayDiff(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

function readData(filePath, name, optional = false) {
  if (!fs.existsSync(filePath)) {
    if (optional) return null;
    throw Error('Required data file does not exist: ' + filePath);
  }
  const src = fs.readFileSync(filePath, 'utf8');
  // Evaluate trusted local repository JS only. Never evaluate fetched web content.
  const expression = ';\nJSON.stringify(typeof ' + name + ' === "undefined" ? null : ' + name + ')';
  const json = vm.runInNewContext(src + expression, {}, { timeout: 5000, filename: filePath });
  if (!json || json === 'null') throw Error(name + ' not found in ' + filePath);
  return JSON.parse(json);
}

function readResults(filePath) {
  if (!fs.existsSync(filePath)) return { results: {}, available: false };
  const src = fs.readFileSync(filePath, 'utf8');
  const expression = ';\nJSON.stringify(typeof RESULTS !== "undefined" ? RESULTS : (typeof EVENT_RESULTS !== "undefined" ? EVENT_RESULTS : null))';
  const json = vm.runInNewContext(src + expression, {}, { timeout: 5000, filename: filePath });
  if (!json || json === 'null') throw Error('results.js exists but its RESULTS/EVENT_RESULTS object could not be read; refusing to create duplicate work.');
  const obj = JSON.parse(json);
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') throw Error('Results must be an object keyed by event ID.');
  return { results: obj, available: true };
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return { version: 1, events: {} };
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state.version !== 1 || !state.events || typeof state.events !== 'object' || Array.isArray(state.events)) throw Error('Invalid state file: ' + statePath);
  return state;
}

function queue(events, publishedResults, state, options) {
  const date = options.asOf || todayJst();
  if (!validDate(date)) throw Error('Invalid --as-of date');
  if (!Array.isArray(events)) throw Error('events.js must contain an array');
  const ids = new Set();
  const candidates = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || !e.id) continue;
    if (ids.has(e.id)) throw Error('Duplicate event id: ' + e.id);
    ids.add(e.id);
    if (e.isPublished !== true || e.mergedInto || Object.prototype.hasOwnProperty.call(publishedResults, e.id)) continue;
    const sports = e.category === 'sports';
    if (!sports && !(options.includeReports && REPORT_CATEGORIES.has(e.category))) continue;
    const end = e.endDate || e.date;
    if (!validDate(end)) continue;
    const age = dayDiff(date, end);
    if (age < 1 || (!options.backfill && age > 30)) continue;
    const s = state.events[e.id] || {};
    if (DONE.has(s.status) || s.status === 'conflict') continue; // Conflict: human resolution only.
    if (s.checkedAt) {
      if (!validDate(s.checkedAt)) throw Error('Invalid checkedAt for ' + e.id);
      const lastAge = dayDiff(s.checkedAt, end);
      if (lastAge > age) throw Error('checkedAt is in the future for ' + e.id);
      const next = CHECK_DAYS.find((n) => n > lastAge);
      if (next === undefined || age < next) continue;
    }
    // Avoid generic "match" assumptions: a sport event may be a meet or tournament report.
    candidates.push({
      id: e.id, date: e.date, endDate: end, daysSinceEnd: age,
      kindHint: sports ? 'match_or_report' : 'report_candidate',
      title: e.title || '', organizer: e.organizer || '', orgId: e.orgId || '',
      externalUrl: e.externalUrl || '', status: s.status || 'pending',
      checkedAt: s.checkedAt || '', note: s.note || ''
    });
  }
  // New/near-term results first; backlog of older events afterwards, most recent first.
  candidates.sort((a, b) => {
    const pa = a.daysSinceEnd <= 7 ? 0 : (a.daysSinceEnd <= 30 ? 1 : 2);
    const pb = b.daysSinceEnd <= 7 ? 0 : (b.daysSinceEnd <= 30 ? 1 : 2);
    return pa - pb || a.daysSinceEnd - b.daysSinceEnd || a.id.localeCompare(b.id);
  });
  return candidates.slice(0, options.limit);
}

function mdEsc(s) {
  return String(s || '').replace(/\|/g, '｜').replace(/[\r\n]+/g, ' ').replace(/</g, '＜');
}

function renderMarkdown(items, asOf, hasResults) {
  const lines = [
    '# 結果収集候補 ' + asOf + '（JST）',
    '',
    '> 下書きではありません。結果を確認していないイベントの調査候補です。',
    '> results.js ' + (hasResults ? 'を照合済み' : '未配置：既公開結果を除外できないため、パッチ統合後に再実行すること'),
    '',
    '| イベントID | 終了日 | 経過日数 | 種別候補 | タイトル | 公式URL |',
    '|---|---|---:|---|---|---|'
  ];
  for (const x of items) {
    const url = /^https?:\/\//i.test(x.externalUrl) ? x.externalUrl : '';
    lines.push('| ' + mdEsc(x.id) + ' | ' + x.endDate + ' | ' + x.daysSinceEnd + ' | ' +
      x.kindHint + ' | ' + mdEsc(x.title) + ' | ' + (url ? '[出典候補](' + url + ')' : '未設定') + ' |');
  }
  if (!items.length) lines.push('| 対象なし | | | | | |');
  lines.push('', '注：externalUrlは結果の出典とは限りません。公式結果表などで個別確認が必要です。', '');
  return lines.join('\n');
}

function mark(statePath, args) {
  if (!/^evt-[A-Za-z0-9-]+$/.test(args.id || '')) throw Error('--id must be an event ID (evt-...)');
  if (!STATES.has(args.status)) throw Error('Invalid --status');
  const checkedAt = args.checkedAt || todayJst();
  if (!validDate(checkedAt)) throw Error('Invalid --checked-at');
  const state = readState(statePath);
  const old = state.events[args.id] || {};
  const next = { status: args.status, checkedAt, note: args.note === undefined ? (old.note || '') : args.note };
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  // Exclusive lock avoids simultaneous runs overwriting status updates.
  const lock = statePath + '.lock';
  const fd = fs.openSync(lock, 'wx');
  try {
    // Re-read while holding the lock, in case another update completed.
    const latest = readState(statePath);
    latest.events[args.id] = next;
    const temp = statePath + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(latest, null, 2) + '\n', { flag: 'wx' });
      fs.renameSync(temp, statePath);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
  return next;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.command === 'mark') {
    const entry = mark(path.resolve(args.state), args);
    console.log(args.id + ': ' + entry.status + ' (' + entry.checkedAt + ')');
    return;
  }
  const asOf = args.asOf || todayJst();
  const events = readData(path.resolve(args.events || path.join(ROOT, 'events.js')), 'EVENTS');
  const loaded = readResults(path.resolve(args.results || path.join(ROOT, 'results.js')));
  const state = readState(path.resolve(args.state));
  const items = queue(events, loaded.results, state, { ...args, asOf });
  const out = args.format === 'json' ? JSON.stringify({ asOf, resultsFileAvailable: loaded.available, count: items.length, candidates: items }, null, 2) + '\n' : renderMarkdown(items, asOf, loaded.available);
  if (args.output) {
    const output = path.resolve(args.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, out);
    console.log('Wrote ' + items.length + ' candidates to ' + output);
  } else {
    process.stdout.write(out);
  }
  if (!loaded.available) console.error('WARNING: results.js not found; previously published results cannot be excluded.');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { validDate, dayDiff, queue, readState, readResults, parseArgs, renderMarkdown, mark, main };
