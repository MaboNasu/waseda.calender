#!/usr/bin/env node
/**
 * scripts/verify-event-sources.js — 出典との照合による公開判定（A / B / C）
 *
 * events.js の各イベントの「タイトル・日付・開始時刻・会場・主催・料金」が、出典ページの文字列に
 * 実際に書かれているかを機械的に確かめる。AIの判断は入れない。判定の意味は docs/EDITORIAL_RULES.md 2章。
 *
 *   A … 全項目が出典で確認できた → そのまま公開してよい
 *   B … タイトル・日付・主催は確認できたが、開始時刻か会場がデータにない（欠けているだけで矛盾はない）
 *   C … 出典にない文字列がある／出典を読めない／中止・延期の記載がある → 運営者の確認待ち
 *
 * 使い方:
 *   node scripts/verify-event-sources.js --changed-from origin/main   追加・変更したイベントだけ
 *   node scripts/verify-event-sources.js --ids evt-699,evt-700
 *   node scripts/verify-event-sources.js --upcoming 30                今後30日の公開イベントを監査
 *   追加オプション:
 *     --evidence path.json  出典を直接読めないもの（Instagram・JS描画のサイト）用の根拠。
 *                           { "evt-xxx": { "url": "https://…", "text": "日付・時刻・会場・タイトルの短い引用" } }
 *                           このファイルはコミットしない（.verify-evidence/ に置く）。
 *     --apply               --changed-from と一緒に使う。新しく追加したイベントのうち B は非公開の
 *                           確認待ち（reviewStatus:"partial"）、C は非公開の確認待ち（reviewStatus:"pending"）にする。
 *                           既存イベントの変更が C のときは書き換えず、報告だけする（変更を戻すのは手順書の仕事）。
 *     --json                結果をJSONで出す
 *
 * 結果は scripts/last-verify-report.json にも保存する（コミット対象外）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  ROOT, EVENTS_PATH, loadEvents, loadOrganizations, loadDictionary,
  normalizeForMatch, todayJst, isUpcoming, setEventField,
} = require('./lib/event-data');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const REPORT_PATH = path.join(ROOT, 'scripts', 'last-verify-report.json');
const FETCH_TIMEOUT_MS = 15000;
const UNREADABLE_HOSTS = /(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)facebook\.com$/;
// タイトルの末尾に付けてよい整形（出典になくても可）
const ALLOWED_TITLE_SUFFIX = /[（(]\s*(\d+日目|day\s*\d+|昼の部|夜の部|第\d+部|[A-Z]日程)\s*[)）]\s*$/i;
// 会場の照合で無視する一般的な前置き
const GENERIC_VENUE_TOKENS = new Set(['早稲田大学', '早稲田キャンパス', '戸山キャンパス', '西早稲田キャンパス', '所沢キャンパス', '早稲田', 'オンライン', '学外']);
// 「雨天中止」のような条件ではなく、実際に中止・延期が告知されている言い方だけを拾う
const CANCEL_WORDS = /中止(となりました|になりました|いたします|します|が決定|を決定)|開催(を)?中止|延期(となりました|になりました|いたします|します|が決定|を決定)|開催(を)?見送|開催(を)?見合わせ|開催(を)?取りやめ/;
const ORG_PREFIX = /^早稲田大学\s*/;

// ---------- 出典の取得 ----------

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|dd|dt|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function fetchText(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return { ok: false, reason: 'URLが不正' }; }
  if (UNREADABLE_HOSTS.test(host)) return { ok: false, reason: 'SNSのページは直接読めない（根拠の引用が必要）' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'WasedaCalendar-SourceVerifier/1.0 (+https://wasedacalendar.com/about.html)' },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|xml/.test(type)) return { ok: false, reason: `本文を読めない形式（${type || '不明'}）` };
    const text = htmlToText(await res.text());
    if (normalizeForMatch(text).length < 80) return { ok: false, reason: '本文がほとんどない（JS描画の可能性）' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'タイムアウト' : `取得失敗（${err.message}）` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 照合 ----------

function datePatterns(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return [
    `${y}年${m}月${d}日`, `${m}月${d}日`, `${y}/${m}/${d}`, `${m}/${d}`, `${y}.${m}.${d}`, `${m}.${d}`,
    `${y}-${mm}-${dd}`, `${y}/${mm}/${dd}`, `${y}.${mm}.${dd}`, `${mm}/${dd}`, `${mm}.${dd}`, `${y}${mm}${dd}`,
  ].map(normalizeForMatch);
}

function containsDate(normText, ymd) {
  // 「11/28」が「11/280」などに誤一致しないよう、後ろが数字でないことを確かめる
  return datePatterns(ymd).some((p) => {
    let i = normText.indexOf(p);
    while (i >= 0) {
      const next = normText[i + p.length];
      const prev = normText[i - 1];
      if (!(next && /\d/.test(next)) && !(prev && /\d/.test(prev))) return true;
      i = normText.indexOf(p, i + 1);
    }
    return false;
  });
}

function timePatterns(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const mm = String(m).padStart(2, '0');
  const list = [`${h}:${mm}`, `${String(h).padStart(2, '0')}:${mm}`, `${h}時${mm}分`, `${h}時${m}分`];
  if (m === 0) list.push(`${h}時`);
  if (m === 30) list.push(`${h}時半`);
  if (h > 12) list.push(`午後${h - 12}時${m ? `${m}分` : ''}`, `pm${h - 12}:${mm}`, `${h - 12}:${mm}pm`);
  if (h < 12) list.push(`午前${h}時${m ? `${m}分` : ''}`, `${h}:${mm}am`);
  return [...new Set(list.map(normalizeForMatch))];
}

function containsTime(normText, hhmm) {
  // 「3:00」が「13:00」の一部に、「13時」が「13時30分」の一部に誤一致しないよう、前後の数字を確かめる
  return timePatterns(hhmm).some((p) => {
    let i = normText.indexOf(p);
    while (i >= 0) {
      const prev = normText[i - 1];
      const after = normText.slice(i + p.length, i + p.length + 2);
      const prevDigit = prev && /\d/.test(prev);
      const nextDigit = /^\d/.test(after);
      const minutesFollow = p.endsWith('時') && /^\d/.test(after);
      if (!prevDigit && !nextDigit && !minutesFollow) return true;
      i = normText.indexOf(p, i + 1);
    }
    return false;
  });
}

function titleCheck(title, normText, ev = {}) {
  const t = String(title || '');
  let stripped = t.replace(ALLOWED_TITLE_SUFFIX, '');
  if (normText.includes(normalizeForMatch(stripped))) return { ok: true };
  // 「早慶戦(柔道部)」のように、末尾の括弧が自分の部・団体名なら、括弧の前（大会・試合の名称）を照合する
  const team = /^(.+?)\s*[（(]([^()（）]+)[)）]\s*$/.exec(stripped);
  if (team && String(ev.organizer || '').replace(ORG_PREFIX, '').includes(team[2].replace(ORG_PREFIX, '').replace(/\s/g, ''))) {
    if (normText.includes(normalizeForMatch(team[1]))) return { ok: true, note: '大会名（自分の部の名前を除く）を確認' };
    stripped = team[1];
  }
  // 試合の表記「<部の名前> vs<相手>」は、相手の名前が出典にそのまま書かれていればよい（略記の展開・補足は不可）
  const vs = /^(.+?)\s*(?:vs\.?|VS\.?|ｖｓ|対)\s*(.+)$/.exec(stripped);
  if (vs) {
    const opponent = vs[2].replace(/[（(][^)）]*[)）]\s*$/, '').trim();
    if (opponent && normText.includes(normalizeForMatch(opponent))) return { ok: true, note: '試合の表記（相手名を確認）' };
    return { ok: false, reason: `対戦相手「${opponent}」が出典にそのまま書かれていない` };
  }
  // 「講演会「…」」のように種別を前に付けた表記は、かぎ括弧の中（正式な題名）が出典にあればよい
  const quoted = /^([^「『]*)[「『](.+)[」』]([^」』]*)$/.exec(stripped);
  if (quoted && quoted[2].length >= 4 && normText.includes(normalizeForMatch(quoted[2]))) {
    return { ok: true, note: '題名（かぎ括弧の中）を確認' };
  }
  return { ok: false, reason: `タイトル「${stripped}」が出典にそのまま書かれていない` };
}

function venueCheck(location, normText, dict) {
  if (!location || /^(不明|未定|未確認)$/.test(location.trim())) return { ok: null };
  if (normText.includes(normalizeForMatch(location))) return { ok: true };
  const venue = dict.venues.find((v) => v.display === location || v.aliases.includes(location));
  if (venue && [venue.name, ...venue.aliases].some((n) => normText.includes(normalizeForMatch(n)))) {
    return { ok: true, note: '辞書の別名で確認' };
  }
  // 括弧の中（号館・集合場所などの補足）は照合しない。補足が出典にない場合は注記だけ残す
  const core = location.replace(/[（(][^)）]*[)）]/g, ' ');
  const tokens = core.split(/[\s　・、，,/／〜~→]+/).map((s) => s.trim())
    .filter((s) => s.length >= 2 && !GENERIC_VENUE_TOKENS.has(s));
  if (!tokens.length) return { ok: null };
  const missing = tokens.filter((tok) => !normText.includes(normalizeForMatch(tok)));
  if (missing.length) return { ok: false, reason: `会場の「${missing.join('」「')}」が出典に書かれていない` };
  return core.trim() !== location.trim() ? { ok: true, note: '会場の括弧内の補足は照合していない' } : { ok: true };
}

/** 団体名の照合に使う言い方の候補（「早稲田大学」の有無、括弧の前・中） */
function nameVariants(name) {
  const out = new Set();
  const base = String(name || '').trim();
  if (!base) return out;
  const outer = base.replace(/[（(][^)）]*[)）]/g, '').trim();
  const inner = [...base.matchAll(/[（(]([^)）]+)[)）]/g)].map((m) => m[1].trim());
  for (const v of [base, outer, ...inner]) {
    if (v.length < 2) continue;
    out.add(v);
    const noPrefix = v.replace(ORG_PREFIX, '');
    if (noPrefix.length >= 2) out.add(noPrefix);
  }
  return out;
}

function organizerCheck(ev, normText, sourceUrls, orgById, dict) {
  const whole = String(ev.organizer || '').trim();
  if (!whole) return { ok: false, reason: '主催が空' };
  const has = (names) => [...names].some((n) => normText.includes(normalizeForMatch(n)));
  const org = ev.orgId ? orgById.get(ev.orgId) : null;
  const orgNames = new Set();
  if (org) { nameVariants(org.name).forEach((n) => orgNames.add(n)); if (org.alphabetName) orgNames.add(org.alphabetName); }
  const orgDict = ev.orgId ? dict.organizers[ev.orgId] : null;
  if (orgDict) [orgDict.display, ...(orgDict.aliases || [])].forEach((n) => nameVariants(n).forEach((x) => orgNames.add(x)));

  if (has(nameVariants(whole)) || (orgNames.size && has(orgNames))) {
    // 団体名がまるごと書かれている。ただし複数主催（「・」「／」区切り）なら全員を確かめる
    const parts = whole.split(/[・／]/).map((s) => s.trim()).filter((s) => s.length >= 2);
    if (parts.length < 2 || has(nameVariants(whole))) return { ok: true };
  }
  const parts = whole.split(/[・／]/).map((s) => s.trim()).filter(Boolean);
  const missing = parts.filter((p) => !has(nameVariants(p)) && !(parts.length === 1 && has(orgNames)));
  if (!missing.length) return { ok: true };
  // 団体自身の公式サイト・公式アカウントが出典なら、単独主催は確認済みとみなす
  const ownSites = org ? [org.websiteUrl, org.instagramUrl, org.twitterUrl].filter(Boolean).map((u) => {
    try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, ''); } catch { return null; }
  }).filter(Boolean) : [];
  const fromOwnSite = sourceUrls.some((u) => {
    try { const x = new URL(u); const key = x.hostname.replace(/^www\./, '') + x.pathname; return ownSites.some((s) => key.startsWith(s)); } catch { return false; }
  });
  if (fromOwnSite && parts.length === 1) return { ok: true, note: '団体自身の公式サイトが出典' };
  return { ok: false, reason: `主催の「${missing.join('」「')}」が出典に書かれていない` };
}

function feeCheck(ev, normText) {
  if (ev.feeType === 'free') {
    return /無料|入場無料|参加無料|free|カンパ/.test(normText) ? { ok: true } : { ok: false, reason: '「無料」の根拠が出典にない' };
  }
  if (ev.feeType === 'paid') {
    const amounts = (String(ev.feeText || '').normalize('NFKC').match(/\d[\d,]*/g) || []).filter((a) => a.replace(/,/g, '').length >= 3);
    if (!amounts.length) return { ok: null };
    const missing = amounts.filter((a) => !normText.includes(a) && !normText.includes(a.replace(/,/g, '')));
    return missing.length ? { ok: false, reason: `料金の「${missing.join('」「')}」が出典に書かれていない` } : { ok: true };
  }
  return { ok: null };
}

/** タイトルの周辺（同じイベントの記載範囲）を切り出す。タイトルが見つからなければ全文。 */
function eventBlock(normText, ev) {
  const key = normalizeForMatch(String(ev.title || '').replace(ALLOWED_TITLE_SUFFIX, ''));
  const i = key.length >= 4 ? normText.indexOf(key) : -1;
  if (i < 0) return normText;
  return normText.slice(Math.max(0, i - 600), i + key.length + 1500);
}

async function verifyEvent(ev, ctx) {
  const urls = [...new Set([ev.externalUrl, ...(ev.sourceUrls || []), ev.registrationUrl].filter(Boolean))];
  const texts = [];
  const unreadable = [];
  for (const url of urls) {
    const r = ctx.cache.has(url) ? ctx.cache.get(url) : await fetchText(url);
    ctx.cache.set(url, r);
    if (r.ok) texts.push(r.text); else unreadable.push(`${url}（${r.reason}）`);
  }
  const ev2 = ctx.evidence[ev.id];
  if (ev2 && ev2.text) texts.push(ev2.text);

  const result = { id: ev.id, title: ev.title, date: ev.date, gate: 'C', checks: {}, problems: [], notes: [], unreadable };
  if (!urls.length && !ev2) { result.problems.push('出典URLがない'); return result; }
  if (!texts.length) { result.problems.push('出典をどれも読めない（根拠の引用が必要）'); return result; }

  const whole = normalizeForMatch(texts.join('\n'));
  const block = eventBlock(whole, ev);

  const checks = {
    title: titleCheck(ev.title, whole, ev),
    date: containsDate(block, ev.date) || containsDate(whole, ev.date) ? { ok: true } : { ok: false, reason: `日付 ${ev.date} が出典に書かれていない` },
    startTime: !ev.startTime ? { ok: null } : (containsTime(block, ev.startTime) || containsTime(whole, ev.startTime) ? { ok: true } : { ok: false, reason: `開始時刻 ${ev.startTime} が出典に書かれていない` }),
    venue: venueCheck(ev.location, whole, ctx.dict),
    organizer: organizerCheck(ev, whole, urls, ctx.orgById, ctx.dict),
    fee: feeCheck(ev, whole),
  };
  if (ev.endDate && ev.endDate !== ev.date) {
    checks.endDate = containsDate(whole, ev.endDate) ? { ok: true } : { ok: false, reason: `終了日 ${ev.endDate} が出典に書かれていない` };
  }
  if (CANCEL_WORDS.test(block)) checks.status = { ok: false, reason: '出典のイベント付近に「中止・延期」などの記載がある' };

  result.checks = checks;
  for (const c of Object.values(checks)) {
    if (c.ok === false) result.problems.push(c.reason);
    if (c.note) result.notes.push(c.note);
  }
  if (result.problems.length) return result;
  const missingCore = !ev.startTime && !ev.allDay ? ['開始時刻'] : [];
  if (!ev.location && ev.campus !== 'online') missingCore.push('会場');
  result.gate = missingCore.length ? 'B' : 'A';
  if (missingCore.length) result.notes.push(`${missingCore.join('・')}がデータにない（欠けているだけ）`);
  return result;
}

// ---------- 対象の決定 ----------

function eventsAtRef(ref) {
  try {
    const src = execFileSync('git', ['show', `${ref}:events.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return loadEvents(src);
  } catch (err) {
    throw new Error(`git show ${ref}:events.js に失敗しました（${err.message.split('\n')[0]}）`);
  }
}

const COMPARE_KEYS = ['title', 'date', 'endDate', 'startTime', 'endTime', 'location', 'organizer', 'feeType', 'feeText', 'externalUrl', 'isPublished'];

function selectTargets(events) {
  const today = todayJst();
  if (opt('--ids')) {
    const ids = new Set(opt('--ids').split(',').map((s) => s.trim()));
    return events.filter((e) => ids.has(e.id)).map((e) => ({ ev: e, kind: 'specified' }));
  }
  if (opt('--changed-from')) {
    const before = new Map(eventsAtRef(opt('--changed-from')).map((e) => [e.id, e]));
    const out = [];
    for (const e of events) {
      const old = before.get(e.id);
      if (!old) { if (e.isPublished !== false || e.reviewStatus) out.push({ ev: e, kind: 'new' }); continue; }
      if (e.isPublished === false && !e.reviewStatus) continue;
      const changed = COMPARE_KEYS.filter((k) => JSON.stringify(old[k] ?? null) !== JSON.stringify(e[k] ?? null));
      if (changed.length && !(changed.length === 1 && changed[0] === 'isPublished')) out.push({ ev: e, kind: 'changed', changed });
    }
    return out;
  }
  const days = Number(opt('--upcoming') || 30);
  return events.filter((e) => isUpcoming(e, today, days) && e.scope !== 'schedule' && !e.mergedInto).map((e) => ({ ev: e, kind: 'audit' }));
}

// ---------- 実行 ----------

async function main() {
  const events = loadEvents();
  const ctx = {
    dict: loadDictionary(),
    orgById: new Map(loadOrganizations().map((o) => [o.id, o])),
    evidence: opt('--evidence') ? JSON.parse(fs.readFileSync(opt('--evidence'), 'utf8')) : {},
    cache: new Map(),
  };
  const targets = selectTargets(events);
  const results = [];
  for (const t of targets) {
    const r = await verifyEvent(t.ev, ctx);
    r.kind = t.kind;
    if (t.changed) r.changedFields = t.changed;
    results.push(r);
  }

  const summary = { A: 0, B: 0, C: 0 };
  results.forEach((r) => { summary[r.gate]++; });
  const report = { generatedAt: new Date().toISOString(), today: todayJst(), mode: opt('--changed-from') ? `changed-from ${opt('--changed-from')}` : opt('--ids') ? 'ids' : `upcoming ${opt('--upcoming') || 30}`, summary, results };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

  if (flag('--apply')) {
    if (!opt('--changed-from')) throw new Error('--apply は --changed-from と一緒に使います');
    let source = fs.readFileSync(EVENTS_PATH, 'utf8');
    const applied = [];
    for (const r of results) {
      if (r.kind !== 'new' || r.gate === 'A') continue;
      const status = r.gate === 'B' ? 'partial' : 'pending';
      const reason = r.gate === 'B' ? r.notes.join(' / ') : r.problems.join(' / ');
      source = setEventField(source, r.id, 'isPublished', false);
      source = setEventField(source, r.id, 'reviewStatus', status);
      source = setEventField(source, r.id, 'reviewReason', reason.slice(0, 200));
      applied.push(`${r.id} → ${status}`);
    }
    loadEvents(source);
    fs.writeFileSync(EVENTS_PATH, source);
    report.applied = applied;
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  }

  if (flag('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(`判定: A ${summary.A}件 / B ${summary.B}件 / C ${summary.C}件（対象 ${results.length}件、${report.mode}）`);
  for (const r of results.filter((x) => x.gate !== 'A')) {
    const label = r.gate === 'B' ? 'B 一部保留' : 'C 確認待ち';
    console.log(`\n[${label}] ${r.id} ${r.date} ${r.title}${r.kind === 'changed' ? `（変更: ${r.changedFields.join(', ')}）` : ''}`);
    for (const p of r.problems) console.log(`  - ${p}`);
    for (const n of r.notes) console.log(`  · ${n}`);
    for (const u of r.unreadable) console.log(`  · 読めなかった出典: ${u}`);
  }
  const changedC = results.filter((r) => r.kind === 'changed' && r.gate === 'C');
  if (changedC.length) {
    console.log(`\n既存イベントの変更のうち ${changedC.length}件が出典で確認できません。docs/DAILY_CYCLE.md の手順4に従って、その変更を戻して確認待ちに回してください。`);
  }
  if (report.applied) console.log(`\n--apply: ${report.applied.length}件を非公開の確認待ちにしました（${report.applied.join('、')}）`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(2); });
}

module.exports = { titleCheck, venueCheck, organizerCheck, nameVariants, containsDate, containsTime, feeCheck, verifyEvent, htmlToText };
