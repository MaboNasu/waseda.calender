#!/usr/bin/env node
/**
 * scripts/review-queue.js — 運営者の確認待ち（要確認）の一覧・反映・状態ファイル
 *
 * 確認待ちのイベントは events.js に isPublished:false のまま入っていて、reviewStatus で区別する。
 *   pending  … C判定。運営者の確認が必要（1日10件まで提示する）
 *   partial  … B判定。開始時刻か会場が欠けているだけ。試験期間中は非公開のまま件数だけ数える
 *   rejected … 運営者が見送ったもの（非公開のまま残す。同じものを再提案しないため）
 *
 * 使い方:
 *   node scripts/review-queue.js list [--limit 10]
 *       確認待ちを開催日の近い順に出す。そのまま Google ドライブの「要確認_YYYYMMDD.txt」に貼れる形。
 *       運営者は行頭に「OK」か「NG」を書く（何も書かない行は翌日に持ち越し）。
 *   node scripts/review-queue.js apply <file>
 *       運営者が OK / NG を書いたファイルを読み、OK は公開、NG は rejected にする。
 *   node scripts/review-queue.js status [--note "…"]
 *       scripts/daily-cycle-status.json を書く（午後の投稿準備が「今日の公開処理が終わったか」を確かめるのに使う）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, EVENTS_PATH, loadEvents, todayJst, setEventField } = require('./lib/event-data');

const STATUS_PATH = path.join(ROOT, 'scripts', 'daily-cycle-status.json');
const REPORT_PATH = path.join(ROOT, 'scripts', 'last-verify-report.json');
const DAILY_LIMIT = 10;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function queued(events, today) {
  return events
    .filter((e) => e.isPublished === false && (e.reviewStatus === 'pending' || e.reviewStatus === 'partial'))
    .filter((e) => (e.endDate || e.date) >= today);
}

function line(e) {
  const when = `${e.date}${e.startTime ? ` ${e.startTime}` : ''}`;
  const src = e.externalUrl || (e.sourceUrls || [])[0] || '';
  return `   |${e.id}|${when}|${e.title}|${e.organizer || ''}|${e.location || ''}|理由: ${e.reviewReason || '（記載なし）'}|${src}`;
}

function buildList(events, today, limit) {
  const all = queued(events, today);
  const pending = all.filter((e) => e.reviewStatus === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  const partial = all.filter((e) => e.reviewStatus === 'partial').sort((a, b) => a.date.localeCompare(b.date));
  const shown = pending.slice(0, limit);
  const out = [];
  out.push(`# 要確認 ${today}（確認待ち ${pending.length}件のうち、開催日の近い ${shown.length}件。1日${DAILY_LIMIT}件まで）`);
  out.push('# 行頭の空白に OK（公開する）か NG（見送る）を書いてください。何も書かない行は明日に持ち越します。');
  out.push('# 内容を直してから公開したいときは、行の最後に「→ 直す内容」を書いてください（その行は次回、直してから再確認に回します）。');
  out.push('# 形式: 判断|イベントID|日時|タイトル|主催|会場|理由|出典');
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
  const done = { ok: [], ng: [], fix: [], skipped: [] };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim().startsWith('#') || !raw.includes('|')) continue;
    const decision = raw.split('|')[0].trim().toUpperCase();
    const id = (raw.split('|')[1] || '').trim();
    if (!/^evt-\d+$/.test(id)) continue;
    const ev = events.get(id);
    if (!ev || ev.isPublished !== false || !ev.reviewStatus) { done.skipped.push(id); continue; }
    const fixNote = /→\s*(.+)$/.exec(raw);
    if (decision === 'OK' && fixNote) {
      done.fix.push(`${id}: ${fixNote[1].trim()}`);
      source = setEventField(source, id, 'reviewReason', `運営者の修正指示: ${fixNote[1].trim()}`.slice(0, 200));
    } else if (decision === 'OK') {
      source = setEventField(source, id, 'isPublished', true);
      source = setEventField(source, id, 'reviewStatus', undefined);
      source = setEventField(source, id, 'reviewReason', undefined);
      source = setEventField(source, id, 'lastUpdated', today);
      done.ok.push(id);
    } else if (decision === 'NG') {
      source = setEventField(source, id, 'reviewStatus', 'rejected');
      source = setEventField(source, id, 'lastUpdated', today);
      done.ng.push(id);
    }
  }
  loadEvents(source);
  fs.writeFileSync(EVENTS_PATH, source);
  console.log(`公開 ${done.ok.length}件 / 見送り ${done.ng.length}件 / 直してから再確認 ${done.fix.length}件 / 対象外 ${done.skipped.length}件`);
  if (done.ok.length) console.log(`公開: ${done.ok.join(', ')}`);
  if (done.ng.length) console.log(`見送り: ${done.ng.join(', ')}`);
  if (done.fix.length) console.log(`直す内容（出典で確かめてから直し、もう一度 verify-event-sources.js にかけること）:\n  ${done.fix.join('\n  ')}`);
}

function status() {
  const today = todayJst();
  const events = loadEvents();
  const all = queued(events, today);
  let verify = null;
  try {
    const r = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    if (r.today === today) verify = { mode: r.mode, summary: r.summary, applied: r.applied || [] };
  } catch { /* その日の照合がまだない */ }
  const data = {
    date: today,
    completedAt: new Date().toISOString(),
    publishedEvents: events.filter((e) => e.isPublished !== false).length,
    queue: {
      pending: all.filter((e) => e.reviewStatus === 'pending').length,
      partial: all.filter((e) => e.reviewStatus === 'partial').length,
    },
    verify,
    // 午後の定期実行がこれを Google ドライブの「要確認_YYYYMMDD.txt」に書き写す
    reviewList: buildList(events, today, DAILY_LIMIT),
    note: opt('--note') || null,
  };
  fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
}

const cmd = args[0];
try {
  if (cmd === 'list') list();
  else if (cmd === 'apply') apply(args[1]);
  else if (cmd === 'status') status();
  else { console.error('使い方: node scripts/review-queue.js list|apply <file>|status'); process.exit(2); }
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
