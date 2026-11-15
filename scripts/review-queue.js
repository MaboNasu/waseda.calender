#!/usr/bin/env node
/**
 * scripts/review-queue.js — 運営者の確認待ち（要確認）と、毎日の処理の実行記録
 *
 * 確認待ちのイベントは events.js に isPublished:false のまま入っていて、reviewStatus で区別する。
 *   pending  … C判定。運営者の確認が必要（1日10件まで提示する）
 *   partial  … B判定。開始時刻か会場が欠けているだけ。試験期間中は非公開のまま件数だけ数える
 *   rejected … 運営者が見送ったもの（非公開のまま残す。同じものを再提案しないため）
 *
 * 使い方:
 *   node scripts/review-queue.js list [--limit 10]
 *       確認待ちを「食い違い → 決めきれない → 読めない」の順、同じ種類の中は開催日の近い順に出す。
 *       各行に内容の指紋（fp）が付く。運営者は行頭に OK / NG を書く。
 *   node scripts/review-queue.js apply <file>
 *       OK は公開、NG は rejected にする。指紋が今の内容と違う行（OK の後に中身が変わった）は適用しない。
 *   node scripts/review-queue.js start
 *       今日の処理の開始を記録する（state: running）。
 *   node scripts/review-queue.js finish [--note "…"]
 *       成功を記録する（state: success）。直前の照合（last-verify-report.json）が今日のもので、
 *       照合後に events.js が変わっていないことを確かめてから書く。満たさなければ失敗を記録して終了コード1。
 *   node scripts/review-queue.js fail --note "…"
 *       失敗を記録する（state: failed）。午後の投稿準備はこの日は動かない。
 *
 * 状態は scripts/daily-cycle-status.json。午後の投稿準備は、サイト上のこのファイルが
 * 「date が今日・state が success」のときだけ動く（docs/EDITORIAL_RULES.md 6章）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ROOT, EVENTS_PATH, loadEvents, todayJst, setEventField, eventsSha256, eventFingerprint } = require('./lib/event-data');

const STATUS_PATH = path.join(ROOT, 'scripts', 'daily-cycle-status.json');
const REPORT_PATH = path.join(ROOT, 'scripts', 'last-verify-report.json');
const DAILY_LIMIT = 10;
const CODE_ORDER = { mismatch: 0, weak: 1, unreadable: 2 };
const CODE_LABEL = { mismatch: '食い違い', weak: '決めきれない', unreadable: '出典を読めない' };

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function reasonCode(ev) {
  const m = /^\[([a-z,]+)\]/.exec(ev.reviewReason || '');
  if (!m) return 'mismatch';
  return m[1].split(',').sort((a, b) => (CODE_ORDER[a] ?? 9) - (CODE_ORDER[b] ?? 9))[0];
}

function queued(events, today) {
  return events
    .filter((e) => e.isPublished === false && (e.reviewStatus === 'pending' || e.reviewStatus === 'partial'))
    .filter((e) => (e.endDate || e.date) >= today);
}

function line(e) {
  const when = `${e.date}${e.startTime ? ` ${e.startTime}` : ''}`;
  const src = e.externalUrl || (e.sourceUrls || [])[0] || '';
  const reason = (e.reviewReason || '（記載なし）').replace(/^\[[a-z,]+\]\s*/, '');
  return `   |${e.id}|fp:${eventFingerprint(e)}|${when}|${e.title}|${e.organizer || ''}|${e.location || ''}|${CODE_LABEL[reasonCode(e)]}: ${reason}|${src}`;
}

function buildList(events, today, limit) {
  const all = queued(events, today);
  const pending = all.filter((e) => e.reviewStatus === 'pending')
    .sort((a, b) => (CODE_ORDER[reasonCode(a)] - CODE_ORDER[reasonCode(b)]) || a.date.localeCompare(b.date));
  const partial = all.filter((e) => e.reviewStatus === 'partial');
  const shown = pending.slice(0, limit);
  const out = [];
  out.push(`# 要確認 ${today}（確認待ち ${pending.length}件のうち ${shown.length}件。1日${DAILY_LIMIT}件まで）`);
  out.push('# 行頭の空白に OK（公開する）か NG（見送る）を書いてください。何も書かない行は明日に持ち越します。');
  out.push('# 直してから公開したいときは、行の最後に「→ 直す内容」を書いてください（直したうえで、もう一度確認に回します）。');
  out.push('# 形式: 判断|イベントID|内容の指紋|日時|タイトル|主催|会場|理由|出典');
  shown.forEach((e) => out.push(line(e)));
  if (pending.length > shown.length) out.push(`# ほか ${pending.length - shown.length}件は明日以降に回します。`);
  out.push(`# 参考（B区分の試験中・非公開、操作不要）: 開始時刻か会場がないだけのもの ${partial.length}件`);
  return out;
}

function list() {
  console.log(buildList(loadEvents(), todayJst(), Number(opt('--limit') || DAILY_LIMIT)).join('\n'));
}

function apply(file) {
  if (!file) throw new Error('使い方: node scripts/review-queue.js apply <file>');
  const today = todayJst();
  const text = fs.readFileSync(file, 'utf8');
  let source = fs.readFileSync(EVENTS_PATH, 'utf8');
  const events = new Map(loadEvents(source).map((e) => [e.id, e]));
  const done = { ok: [], ng: [], fix: [], changed: [], skipped: [] };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim().startsWith('#') || !raw.includes('|')) continue;
    const cols = raw.split('|');
    const decision = cols[0].trim().toUpperCase();
    const id = (cols[1] || '').trim();
    if (!/^evt-\d+$/.test(id) || !['OK', 'NG'].includes(decision)) continue;
    const ev = events.get(id);
    if (!ev || ev.isPublished !== false || !ev.reviewStatus) { done.skipped.push(id); continue; }
    const fp = /^fp:([0-9a-f]{8})$/.exec((cols[2] || '').trim());
    if (!fp || fp[1] !== eventFingerprint(ev)) { done.changed.push(id); continue; }
    const fixNote = /→\s*(.+)$/.exec(raw);
    if (decision === 'OK' && fixNote) {
      done.fix.push(`${id}: ${fixNote[1].trim()}`);
      source = setEventField(source, id, 'reviewReason', `[mismatch] 運営者の修正指示: ${fixNote[1].trim()}`.slice(0, 200));
    } else if (decision === 'OK') {
      source = setEventField(source, id, 'isPublished', true);
      source = setEventField(source, id, 'reviewStatus', undefined);
      source = setEventField(source, id, 'reviewReason', undefined);
      source = setEventField(source, id, 'lastUpdated', today);
      done.ok.push(id);
    } else {
      source = setEventField(source, id, 'reviewStatus', 'rejected');
      source = setEventField(source, id, 'lastUpdated', today);
      done.ng.push(id);
    }
  }
  loadEvents(source);
  fs.writeFileSync(EVENTS_PATH, source);
  console.log(`公開 ${done.ok.length}件 / 見送り ${done.ng.length}件 / 直してから再確認 ${done.fix.length}件 / 確認後に内容が変わったので保留 ${done.changed.length}件 / 対象外 ${done.skipped.length}件`);
  if (done.ok.length) console.log(`公開: ${done.ok.join(', ')}`);
  if (done.ng.length) console.log(`見送り: ${done.ng.join(', ')}`);
  if (done.changed.length) console.log(`保留（運営者の確認の後に内容が変わった。次回の要確認にもう一度出る）: ${done.changed.join(', ')}`);
  if (done.fix.length) console.log(`直す内容（出典で確かめてから直し、もう一度 verify-event-sources.js にかけること）:\n  ${done.fix.join('\n  ')}`);
}

function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')); } catch { return null; }
}

function writeStatus(data) {
  const tmp = `${STATUS_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, STATUS_PATH);
  console.log(JSON.stringify({ ...data, reviewList: data.reviewList ? `（${data.reviewList.length}行）` : undefined }, null, 2));
}

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
}

function start() {
  const today = todayJst();
  const prev = readStatus();
  if (prev && prev.date === today && prev.state === 'running') {
    const ageMin = (Date.now() - Date.parse(prev.startedAt)) / 60000;
    if (ageMin < 90) {
      console.error(`今日の処理（${prev.runId}）が ${Math.round(ageMin)}分前から実行中です。二重に起動しないでください。90分以上たって止まっている場合だけ、もう一度 start できます。`);
      process.exit(1);
    }
  }
  writeStatus({
    date: today,
    runId: `${today}-${crypto.randomBytes(3).toString('hex')}`,
    state: 'running',
    startedAt: new Date().toISOString(),
    baseCommit: gitHead(),
  });
}

function finish() {
  const today = todayJst();
  const prev = readStatus();
  const problems = [];
  if (!prev || prev.date !== today || prev.state !== 'running') problems.push('今日の start の記録がない（先に node scripts/review-queue.js start を実行する）');
  let report = null;
  try { report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); } catch { problems.push('出典照合の結果（last-verify-report.json）がない'); }
  if (report && report.today !== today) problems.push(`出典照合の結果が今日のものではない（${report.today}）`);
  const sha = eventsSha256();
  if (report && report.eventsSha256 !== sha) problems.push('出典照合のあとに events.js が変わっている（照合をやり直す）');
  if (problems.length) {
    writeStatus({ ...(prev || { date: today }), date: today, state: 'failed', failedAt: new Date().toISOString(), note: problems.join(' / ') });
    console.error(`成功を記録できません: ${problems.join(' / ')}`);
    process.exit(1);
  }
  const events = loadEvents();
  const all = queued(events, today);
  writeStatus({
    date: today,
    runId: prev.runId,
    state: 'success',
    startedAt: prev.startedAt,
    completedAt: new Date().toISOString(),
    baseCommit: prev.baseCommit,
    // 午後の投稿準備は、サイトの events.js のハッシュがこれと同じかを確かめる。違えば今日書き換わったイベントは投稿に使わない
    eventsSha256: sha,
    publishedEvents: events.filter((e) => e.isPublished !== false).length,
    queue: {
      pending: all.filter((e) => e.reviewStatus === 'pending').length,
      partial: all.filter((e) => e.reviewStatus === 'partial').length,
    },
    verify: { mode: report.mode, summary: report.summary, cReasons: report.cReasons, applied: report.applied || [] },
    // 午後の定期実行がこれを Google ドライブの「要確認_YYYYMMDD.txt」に書き写す
    reviewList: buildList(events, today, DAILY_LIMIT),
    note: opt('--note') || null,
  });
}

function fail() {
  const prev = readStatus() || {};
  writeStatus({ ...prev, date: todayJst(), state: 'failed', failedAt: new Date().toISOString(), note: opt('--note') || '（理由の記載なし）' });
}

const cmd = args[0];
if (require.main === module) try {
  if (cmd === 'list') list();
  else if (cmd === 'apply') apply(args[1]);
  else if (cmd === 'start') start();
  else if (cmd === 'finish') finish();
  else if (cmd === 'fail') fail();
  else { console.error('使い方: node scripts/review-queue.js list|apply <file>|start|finish|fail'); process.exit(2); }
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

module.exports = { buildList, reasonCode };
