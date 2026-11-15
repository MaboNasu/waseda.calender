#!/usr/bin/env node
/**
 * scripts/weekly-report.js — 週1回の運営者確認（1時間以内）の材料を作る
 *
 *   node scripts/weekly-report.js [--crawl-state 巡回状態_YYYYMMDD.txt] [--skip-audit]
 *   node scripts/weekly-report.js apply <運営者が OK/NG を書いた週次確認ファイル>
 *       2章（団体名の表記）の OK を naming-dictionary.json に登録する（運営者の承認があるものだけ）。
 *       1章の NG と 3章の OK は、出力の「翌朝の作業へ渡すもの」に並べる（定期実行が修正依頼・巡回状態に回す）。
 *
 * 出力（標準出力）をそのまま Google ドライブの「週次確認_YYYYMMDD.txt」にする。内容は4つ。
 *   1. 公開中イベントの出典監査（今後30日・出典と食い違うもののうち、開催日の近い8件まで）
 *   2. 団体名の表記の承認候補（同じ団体IDで表記が揺れているもの。最大5件）
 *   3. 新しい Instagram アカウントの候補（organizations.js に URL があるのに巡回対象にないもの。最大10件）
 *   4. 指標（掲載数・確認待ち・料金未確認の割合）
 * 取りこぼし監査（大学のイベント一覧と照らす）は、定期実行の担当がページを読んで追記する。
 *
 * 運営者は各行の行頭に OK / NG を書く。何も書かない行は翌週に持ち越す。件数は上限であって目標ではない。
 */
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { ROOT, DICT_PATH, loadEvents, loadOrganizations, loadDictionary, todayJst, isUpcoming, addDays } = require('./lib/event-data');
const { run: runDataCheck } = require('./check-event-data');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const AUDIT_LIMIT = 8;
const DICT_LIMIT = 5;
const IG_LIMIT = 10;

function handleOf(url) {
  const m = /instagram\.com\/([A-Za-z0-9._]+)/.exec(url || '');
  return m && !['p', 'reel', 'explore', 'stories'].includes(m[1]) ? m[1].toLowerCase() : null;
}

function crawlHandles(file) {
  if (!file || !fs.existsSync(file)) return null;
  const set = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const clean = line.replace(/\\_/g, '_').trim();
    if (!clean || clean.startsWith('#')) continue;
    const id = clean.split('|')[0].trim().toLowerCase();
    if (id) set.add(id);
  }
  return set;
}

function audit(today) {
  if (args.includes('--skip-audit')) return { lines: ['# （今回は省略）'], counts: null };
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-event-sources.js'), '--upcoming', '30'], { cwd: ROOT, stdio: 'ignore', timeout: 15 * 60 * 1000 });
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'last-verify-report.json'), 'utf8'));
  const events = new Map(loadEvents().map((e) => [e.id, e]));
  const mism = report.results
    .filter((r) => r.gate === 'C' && r.codes.includes('mismatch') && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lines = mism.slice(0, AUDIT_LIMIT).map((r) => {
    const e = events.get(r.id) || {};
    const problems = r.problems.filter((p) => !/部分一致|近くにない/.test(p)).join(' / ');
    return `   |${r.id}|${r.date}|${r.title}|${problems}|${e.externalUrl || ''}`;
  });
  if (mism.length > AUDIT_LIMIT) lines.push(`# ほか ${mism.length - AUDIT_LIMIT}件は翌週以降（開催日の近い順）`);
  if (!lines.length) lines.push('# 出典と食い違う公開イベントはありません');
  return { lines, counts: { checked: report.results.length, ...report.summary, ...report.cReasons, mismatchFuture: mism.length } };
}

function main() {
  const today = todayJst();
  const events = loadEvents();
  const orgs = loadOrganizations();
  const out = [];
  out.push(`# 週次確認 ${today}（運営者の作業は合計1時間まで。件数は上限で、全部やらなくてよい）`);
  out.push('# 行頭の空白に OK か NG を書いてください。何も書かない行は来週に持ち越します。');

  // 1. 出典監査
  const a = audit(today);
  out.push('', '## 1. 公開中イベントの出典監査（目安20分）');
  out.push('# OK＝出典を見て、掲載のほうが正しい／NG＝掲載が間違っている（翌朝の作業で出典どおりに直す）');
  out.push('# 形式: 判断|イベントID|開催日|タイトル|食い違い|出典');
  out.push(...a.lines);

  // 2. 辞書の承認候補
  const { candidates } = runDataCheck();
  out.push('', '## 2. 団体名の表記の承認（目安15分）');
  out.push('# 同じ団体の表記が揺れています。使う表記の行頭に OK を書くと、その表記にそろえます（辞書に登録）。');
  out.push('# 形式: 判断|団体ID|表記|使われている件数');
  if (!candidates.length) out.push('# 候補はありません');
  for (const c of candidates.slice(0, DICT_LIMIT)) {
    out.push(`# ${c.orgId}（大学の公認団体一覧の表記: ${c.officialListName ?? '不明'}）`);
    for (const v of c.variants) out.push(`   |${c.orgId}|${v.name}|${v.count}件`);
  }

  // 3. 新しい Instagram アカウント
  const crawl = crawlHandles(opt('--crawl-state'));
  out.push('', '## 3. 新しい Instagram アカウントの候補（目安10分）');
  out.push('# 根拠: organizations.js（大学の公認団体一覧と、団体からの掲載申請）に登録されている公式アカウントで、まだ巡回していないもの。');
  out.push('# OK＝巡回対象に入れる（初回ランクA）／NG＝入れない。名前が似ているだけのアカウントはここには出ません。');
  out.push('# 形式: 判断|アカウント|団体ID|団体名');
  if (!crawl) {
    out.push('# 巡回状態ファイルが渡されなかったため省略');
  } else {
    const usedOrgIds = new Set(events.filter((e) => e.orgId).map((e) => e.orgId));
    const cands = orgs
      .map((o) => ({ o, h: handleOf(o.instagramUrl) }))
      .filter((x) => x.h && !crawl.has(x.h) && !String(x.o.id).startsWith('T-'))
      .sort((x, y) => (usedOrgIds.has(y.o.id) - usedOrgIds.has(x.o.id)) || x.o.id.localeCompare(y.o.id));
    for (const { o, h } of cands.slice(0, IG_LIMIT)) out.push(`   |${h}|${o.id}|${o.name}`);
    if (cands.length > IG_LIMIT) out.push(`# ほか ${cands.length - IG_LIMIT}件は来週以降`);
    if (!cands.length) out.push('# 候補はありません');
  }

  // 4. 指標
  const pub = events.filter((e) => e.isPublished !== false);
  const up30 = pub.filter((e) => isUpcoming(e, today, 30) && e.scope !== 'schedule');
  const q = events.filter((e) => e.isPublished === false && e.reviewStatus);
  const count = (s) => q.filter((e) => e.reviewStatus === s && (s === 'rejected' || (e.endDate || e.date) >= today)).length;
  const newThisWeek = pub.filter((e) => e.lastUpdated && e.lastUpdated >= addDays(today, -7)).length;
  out.push('', '## 4. 指標（参考・操作不要）');
  out.push(`# 公開中 ${pub.length}件 / 今後30日 ${up30.length}件 / この7日に追加・更新 ${newThisWeek}件`);
  out.push(`# 確認待ち: C ${count('pending')}件・B（試験中） ${count('partial')}件・見送り累計 ${count('rejected')}件`);
  out.push(`# 今後30日のうち 料金未確認 ${up30.filter((e) => e.feeType === 'unknown').length}件・開始時刻なし ${up30.filter((e) => !e.startTime).length}件・出典URLなし ${up30.filter((e) => !e.externalUrl).length}件`);
  if (a.counts) out.push(`# 出典監査: 対象${a.counts.checked}件 → A ${a.counts.A}・B ${a.counts.B}・C ${a.counts.C}（食い違い ${a.counts.mismatch}・決めきれない ${a.counts.weak}・読めない ${a.counts.unreadable}）`);

  out.push('', '## 5. 取りこぼし監査（定期実行の担当が追記）');
  console.log(out.join('\n'));
}

function applyWeekly(file) {
  if (!file) throw new Error('使い方: node scripts/weekly-report.js apply <file>');
  const today = todayJst();
  const dict = loadDictionary();
  const text = fs.readFileSync(file, 'utf8');
  let section = 0;
  const variants = new Map();
  const chosen = new Map();
  const auditNg = [];
  const igOk = [];
  for (const raw of text.split(/\r?\n/)) {
    const h = /^##\s*(\d)\./.exec(raw);
    if (h) { section = Number(h[1]); continue; }
    if (raw.trim().startsWith('#') || !raw.includes('|')) continue;
    const cols = raw.split('|').map((x) => x.trim());
    const decision = cols[0].toUpperCase();
    if (section === 2 && cols[1]) {
      if (!variants.has(cols[1])) variants.set(cols[1], []);
      variants.get(cols[1]).push(cols[2]);
      if (decision === 'OK') chosen.set(cols[1], cols[2]);
    } else if (section === 1 && decision === 'NG') {
      auditNg.push(`${cols[1]}（${cols[3]}）: ${cols[4]} 出典: ${cols[5]}`);
    } else if (section === 3 && decision === 'OK') {
      igOk.push(`${cols[1]}|A||${''}|  # ${cols[2]} ${cols[3]}（${today} 運営者承認）`);
    }
  }
  for (const [orgId, display] of chosen) {
    const aliases = (variants.get(orgId) || []).filter((v) => v && v !== display);
    const prev = dict.organizers[orgId];
    dict.organizers[orgId] = {
      display,
      aliases: [...new Set([...(prev?.aliases || []), ...aliases, ...(prev && prev.display !== display ? [prev.display] : [])])].filter((v) => v !== display),
      approvedAt: today,
    };
  }
  if (chosen.size) {
    dict.version = today;
    fs.writeFileSync(DICT_PATH, JSON.stringify(dict, null, 2) + '\n');
  }
  console.log(`団体名の表記を ${chosen.size}件登録しました${chosen.size ? `（${[...chosen].map(([k, v]) => `${k}=${v}`).join('、')}）。続けて node scripts/check-event-data.js --fix でそろえる` : ''}`);
  console.log('\n# 翌朝の作業へ渡すもの');
  console.log(`## 修正依頼（出典監査で NG になったもの） ${auditNg.length}件`);
  auditNg.forEach((x) => console.log(x));
  console.log(`## 巡回状態に追加するアカウント ${igOk.length}件`);
  igOk.forEach((x) => console.log(x));
}

if (require.main === module) {
  try { if (args[0] === 'apply') applyWeekly(args[1]); else main(); } catch (err) { console.error(err.message); process.exit(2); }
}
