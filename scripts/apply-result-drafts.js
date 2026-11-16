#!/usr/bin/env node
/**
 * scripts/apply-result-drafts.js — 結果の下書きを出典と照合し、通ったものだけ results.js に入れる
 *
 *   node scripts/apply-result-drafts.js <下書きファイル> [--apply] [--json]
 *
 * 下書きの1行（AI が調べて書いたもの。# の行は無視）:
 *   evt-xxx|kind|team|outcome|score|detail|award|出典URL|出典名|根拠の引用
 *   行頭に「OK 」「NG 」が付いていてもよい（運営者の判断）。NG の行は入れない。
 *
 * 判定（AI の判断は入れない。docs/EDITORIAL_RULES.md の A/B/C と同じ考え方）:
 *   A … 出典が公式（許可したドメイン）で、出典ページのそのイベントの記載に、スコア（または成績）と
 *       対戦相手名（または大会名）がそろって書かれている → --apply で results.js に入れる
 *   C … それ以外（出典を読めない・スコアが見つからない・相手名が近くにない・形式の誤り・終了前のイベント）
 *       → 入れない。運営者の要確認に回す（行頭に OK が付いた行は、出典を読めない場合に限り
 *         根拠の引用での照合を認める）
 *
 * 結果は scripts/last-result-drafts-report.json にも保存する（コミット対象外）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadEvents, normalizeForMatch, todayJst } = require('./lib/event-data');
const { htmlToText } = require('./verify-event-sources');

const RESULTS_PATH = path.join(ROOT, 'results.js');
const REPORT_PATH = path.join(ROOT, 'scripts', 'last-result-drafts-report.json');
const KINDS = new Set(['match', 'report']);
const OUTCOMES = new Set(['win', 'loss', 'draw']);
const SCORE_RE = /^(\d{1,4})\s*[-－–—]\s*(\d{1,4})$/;
const SPECIAL_RULE = /PK|延長|サドンデス|タイブレーク|規定|不戦|棄権|抽選|ポイント|セット/;
// 公式とみなす出典（団体・大学・連盟・慶應・早稲田スポーツ新聞会）。それ以外は自動では入れない
const OFFICIAL_HOSTS = [
  /(^|\.)waseda\.jp$/, /(^|\.)waseda-afc\.jp$/, /(^|\.)wasedarugby\.com$/, /(^|\.)bigbears\.org$/,
  /(^|\.)waseda-hockey\.com$/, /(^|\.)waseda-ac\.jp$/, /(^|\.)wasedahandball\.com$/, /(^|\.)waseda-kendo\.com$/,
  /(^|\.)waseda-boxing\.com$/, /(^|\.)waseda-shooting\.com$/, /(^|\.)wasedafencing\.com$/,
  /(^|\.)keio\.ac\.jp$/, /(^|\.)wasedasports\.com$/, /(^|\.)jufa-kanto\.jp$/, /(^|\.)kanto-hockey\.jp$/,
  /(^|\.)kantorugby\.com$/, /(^|\.)kcfa\.jp$/, /(^|\.)big6\.gr\.jp$/,
  /(^|\.)handball\.or\.jp$/, /(^|\.)univas\.jp$/, /(^|\.)jfa\.jp$/, /(^|\.)rugby-japan\.jp$/,
];
const UNREADABLE_HOSTS = /(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$/;
// よく使われる大学名の略称（頭文字＋「大」で機械的に略すと「東海大学→東大」のように取り違えるので、表で持つ）
const UNIV_ABBR = {
  明治大学: ['明大'], 中央大学: ['中大'], 駒澤大学: ['駒大'], 駒沢大学: ['駒大'], 法政大学: ['法大'], 立教大学: ['立大'],
  慶應義塾大学: ['慶大', '慶應'], 慶應大学: ['慶大'], 日本大学: ['日大'], 日本体育大学: ['日体大'], 国士舘大学: ['国士大', '国士舘大'],
  筑波大学: ['筑波大', '筑大'], 東海大学: ['東海大'], 東洋大学: ['東洋大'], 帝京大学: ['帝京大'], 青山学院大学: ['青学大', '青学'],
  東京大学: ['東大'], 早稲田大学: ['早大'], 順天堂大学: ['順大'], 専修大学: ['専大'], 桐蔭横浜大学: ['桐蔭横浜大', '桐蔭大'],
  神奈川大学: ['神大', '神奈川大'], 山梨学院大学: ['山梨学院大', '山梨学院'], 亜細亜大学: ['亜大', '亜細亜大'], 立命館大学: ['立命大', '立命館大'],
  大同大学: ['大同大'], 東京農業大学: ['東農大'], 拓殖大学: ['拓大'], 流通経済大学: ['流経大'], 関東学院大学: ['関東学院大'],
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);

function parse(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^(OK|NG)?\s*\|?\s*(evt-[A-Za-z0-9-]+\|.*)$/i.exec(line);
    if (!m) return;
    const f = m[2].split('|').map((x) => x.trim());
    rows.push({ line: i + 1, decision: (m[1] || '').toUpperCase(), fields: f });
  });
  return rows;
}

function scorePatterns(a, b) {
  return [`${a}-${b}`, `${a}－${b}`, `${a}対${b}`, `${a}x${b}`, `${a}×${b}`, `${a}:${b}`, `${a}–${b}`]
    .map(normalizeForMatch);
}

/**
 * スコアの位置を返す（なければ false）。
 * - 「14-21」を「4-2」と誤認しないよう、前後が数字でないことを確かめる
 * - 桁区切り（1,818）は外して比べる
 * - 括弧の中（前後半の内訳など）は最終スコアとして数えない。「34(16-13,18-17)30」の形は 34-30 として認める
 */
function scoreText(normText) {
  return normText.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
}

/** 「34(16-13,18-17)30」のように前後半の内訳つきで書かれた最終スコアの一覧 */
const STRONG_RE = /(?<!\d)(\d{1,4})\(([^()]{0,40}?\d\s*[-－–—]\s*\d[^()]{0,40}?)\)(\d{1,4})(?!\d)/g;
function strongScores(normText) {
  const text = scoreText(normText);
  const out = [];
  for (const m of text.matchAll(STRONG_RE)) out.push({ a: Number(m[1]), b: Number(m[3]), at: m.index });
  return out;
}

/**
 * スコアの位置の一覧。
 * - 「14-21」を「4-2」と誤認しないよう、前後が数字でないことを確かめる
 * - 桁区切り（1,818）は外して比べる
 * - 括弧の中（前後半の内訳など）は最終スコアとして数えない
 */
function scorePositions(normText, a, b) {
  const text = scoreText(normText);
  const masked = text.replace(/\([^()]{0,40}\)/g, (m) => '(' + ' '.repeat(m.length - 2) + ')');
  const pos = [];
  for (const p of scorePatterns(a, b)) {
    let i = masked.indexOf(p);
    while (i >= 0) {
      const prev = masked[i - 1];
      const next = masked[i + p.length];
      if (!(prev && /\d/.test(prev)) && !(next && /\d/.test(next))) pos.push(i);
      i = masked.indexOf(p, i + 1);
    }
  }
  strongScores(normText).forEach((s) => { if (s.a === Number(a) && s.b === Number(b)) pos.push(s.at); });
  return [...new Set(pos)].sort((x, y) => x - y);
}

function containsScore(normText, a, b) {
  const pos = scorePositions(normText, a, b);
  return pos.length ? pos[0] : false;
}

/** 早慶戦などで、行の見出しになる部・競技の名前（「早慶戦(合気道部)」→「合気道部」、「第100回早慶ホッケー定期戦」→「ホッケー」） */
function clubKeys(ev) {
  const title = String(ev.title || '');
  const keys = new Set();
  (title.match(/[（(]([^()（）]+)[)）]/g) || []).forEach((m) => {
    const inner = m.slice(1, -1).replace(/\s*(男子|女子)\s*/g, '').trim();
    if (inner.length >= 2) keys.add(inner);
  });
  const core = title.replace(/[（(][^()（）]*[)）]/g, '').replace(/第\d+回|早慶|定期戦|戦$/g, '').trim();
  if (core.length >= 2) keys.add(core);
  if (ev.organizer) {
    const club = String(ev.organizer).replace(/^早稲田大学\s*/, '').trim();
    if (club.length >= 2) keys.add(club);
  }
  return [...keys].map(normalizeForMatch);
}

/**
 * 照合に使う語。試合（match）は「相手名」「第◯節・◯回戦・決勝など」「早慶」だけを使う
 * （大会名はどの節の記事にも出てくるので、別の試合を取り違えないよう使わない）。
 * 報告（report）は大会名の語を使う。
 */
function opponentKeys(ev, kind = 'match') {
  const keys = new Set();
  const title = String(ev.title || '');
  const vs = /(?:vs\.?|VS\.?|対)\s*([^（(【\[]+)/.exec(title);
  if (vs) {
    const name = vs[1].trim().replace(/^(早大|早稲田)?\s*[A-Z]?\s*/, '');
    keys.add(name);
    keys.add(name.replace(/大学$/, '大'));
    if (name.replace(/大学$/, '').length >= 2) keys.add(name.replace(/大学$/, ''));
    (UNIV_ABBR[name] || []).forEach((k) => keys.add(k));
  }
  if (/早慶/.test(title)) ['慶應', '慶大', '慶応', '早慶'].forEach((k) => keys.add(k));
  (title.match(/第\d+節|\d+回戦|準々決勝|準決勝|決勝|入替戦|定期戦/g) || []).forEach((k) => keys.add(k));
  if (kind === 'report') {
    title.replace(/[（(][^)）]*[)）]/g, ' ').split(/\s+/).filter((w) => w.length >= 4).forEach((w) => keys.add(w));
  }
  return [...keys].filter((k) => k && k.length >= 2).map(normalizeForMatch);
}

async function fetchText(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return { ok: false, reason: 'URLが不正' }; }
  if (UNREADABLE_HOSTS.test(host)) return { ok: false, reason: 'SNSのページは直接読めない' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'WasedaCalendar-ResultVerifier/1.0 (+https://wasedacalendar.com/about.html)' } });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|xml/.test(type)) return { ok: false, reason: `本文を読めない形式（${type || '不明'}）` };
    return { ok: true, text: htmlToText(await res.text()) };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'タイムアウト' : `取得失敗（${err.message}）` };
  } finally {
    clearTimeout(timer);
  }
}

function loadResultsObject() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(RESULTS_PATH, 'utf8')}\n;this.__r = RESULTS;`, ctx);
  return ctx.__r;
}

async function judge(row, events, existing, today, cache) {
  const f = row.fields;
  const out = { line: row.line, id: f[0], gate: 'C', problems: [], notes: [] };
  if (row.decision === 'NG') { out.problems.push('運営者が NG'); return out; }
  if (f.length !== 10) { out.problems.push(`列の数が10ではない（${f.length}）`); return out; }
  const [id, kind, team, outcome, score, detail, award, url, label, quote] = f;
  const ev = events.get(id);
  if (!ev) { out.problems.push('events.js にないイベントID'); return out; }
  out.title = ev.title;
  if (ev.isPublished === false) out.problems.push('非公開のイベント');
  if ((ev.endDate || ev.date) >= today) out.problems.push('まだ終わっていない');
  if (existing[id]) out.problems.push('すでに結果がある');
  if (!KINDS.has(kind)) out.problems.push('kind は match か report');
  let a; let b;
  if (kind === 'match') {
    if (!OUTCOMES.has(outcome)) out.problems.push('outcome は win / loss / draw');
    const s = SCORE_RE.exec(score);
    if (!s) out.problems.push(`score の形が不正（${score}）`);
    else {
      [a, b] = [Number(s[1]), Number(s[2])];
      const exp = a > b ? 'win' : a < b ? 'loss' : 'draw';
      if (OUTCOMES.has(outcome) && exp !== outcome && !SPECIAL_RULE.test(detail)) out.problems.push(`スコア ${score} と勝敗 ${outcome} が合わない`);
    }
  } else if (!award) out.problems.push('report は award（成績）が必要');
  let host = '';
  try { host = new URL(url).hostname; } catch { out.problems.push('出典URLが不正'); }
  const official = OFFICIAL_HOSTS.some((re) => re.test(host));
  if (host && !official && !UNREADABLE_HOSTS.test(host)) out.problems.push(`出典が公式と確認できないドメイン（${host}）`);
  if (out.problems.length) return out;

  const fetched = cache.has(url) ? cache.get(url) : await fetchText(url);
  cache.set(url, fetched);
  let text;
  if (fetched.ok) text = fetched.text;
  else if (row.decision === 'OK' && quote) { text = quote; out.notes.push(`出典を読めないため運営者 OK＋根拠の引用で照合（${fetched.reason}）`); }
  else { out.problems.push(`出典を読めない（${fetched.reason}）`); return out; }

  const norm = normalizeForMatch(text);
  const keys = opponentKeys(ev, kind);
  if (kind === 'match') {
    const near = (at, w) => keys.find((k) => norm.slice(Math.max(0, at - w), at + w).includes(k));
    // 内訳つきの最終スコア（「0(0-1/0-0)1」）が相手名の近くにあれば、それを正とする（文中の途中経過「0-1」で通さない）
    const finals = strongScores(norm).filter((f) => near(f.at, 250));
    let at;
    if (finals.length) {
      const f = finals.find((x) => x.a === Number(a) && x.b === Number(b));
      if (!f) { out.problems.push(`出典の最終スコア（${finals.map((x) => `${x.a}-${x.b}`).join('、')}）と ${score} が違う`); return out; }
      at = f.at;
    } else {
      const pos = scorePositions(norm, a, b);
      if (!pos.length) { out.problems.push(`スコア ${score} が出典にない`); return out; }
      at = pos.find((p) => near(p, 250));
      if (at === undefined) { out.problems.push('スコアの近くに対戦相手名・節がない（別の試合の可能性）'); return out; }
    }
    const hit = near(at, 250);
    if (/早慶/.test(ev.title || '')) {
      // 早慶戦の一覧は全競技が並ぶので、「慶應」だけでは行を特定できない。部・競技名がスコアの直前（100字以内）にあること
      const before = norm.slice(Math.max(0, at - 100), at);
      const club = clubKeys(ev).find((k) => before.includes(k));
      if (!club) { out.problems.push('早慶戦：スコアの直前に部・競技名がない（別の競技の結果の可能性）'); return out; }
      out.notes.push(`スコアと「${club}」を確認`);
    } else {
      out.notes.push(`スコアと「${hit}」を確認`);
    }
  } else {
    const aw = normalizeForMatch(award);
    const at = norm.indexOf(aw);
    if (at < 0) { out.problems.push(`成績「${award}」が出典にない`); return out; }
    const window = norm.slice(Math.max(0, at - 600), at + 600);
    const hit = keys.find((k) => window.includes(k));
    if (!hit) { out.problems.push('成績の近くに大会名がない'); return out; }
    out.notes.push(`成績と「${hit}」を確認`);
  }
  out.gate = 'A';
  out.entry = { kind, team, outcome, score, detail, award, url, label };
  return out;
}

function entryLiteral(id, e, today) {
  const lines = [`  ${JSON.stringify(id)}: {`, `    kind: ${JSON.stringify(e.kind)},`];
  if (e.team) lines.push(`    team: ${JSON.stringify(e.team)},`);
  const cleanScore = (sc) => String(sc).replace(/[－–—]/g, '-').replace(/\s/g, '');
  if (e.kind === 'match' && Array.isArray(e.matches)) {
    lines.splice(lines.length - (e.team ? 1 : 0), e.team ? 1 : 0);
    const ms = e.matches.map((m) => `      { team: ${JSON.stringify(m.team)}, outcome: ${JSON.stringify(m.outcome)}, score: ${JSON.stringify(cleanScore(m.score))}${m.detail ? `, detail: ${JSON.stringify(m.detail)}` : ''} }`).join(',\n');
    lines.push(`    matches: [\n${ms}\n    ],`);
  } else if (e.kind === 'match') {
    lines.push(`    outcome: ${JSON.stringify(e.outcome)},`);
    lines.push(`    score: ${JSON.stringify(cleanScore(e.score))},`);
  }
  if (e.detail) lines.push(`    detail: ${JSON.stringify(e.detail)},`);
  if (e.award) lines.push(`    award: ${JSON.stringify(e.award)},`);
  lines.push(`    sources: [{ url: ${JSON.stringify(e.url)}, label: ${JSON.stringify(e.label || '出典')} }],`);
  lines.push(`    confirmedAt: ${JSON.stringify(today)}`);
  lines.push('  }');
  return lines.join('\n');
}

function applyEntries(accepted, today) {
  let src = fs.readFileSync(RESULTS_PATH, 'utf8');
  const m = /const RESULTS = \{([\s\S]*?)\n\};/.exec(src);
  if (!m) throw new Error('results.js の RESULTS が見つかりません');
  const body = m[1].replace(/\s+$/, '');
  const hasEntries = /"evt-/.test(body);
  const add = accepted.map((r) => entryLiteral(r.id, r.entry, today)).join(',\n');
  const newBody = hasEntries ? `${body},\n  // ---- ${today} 出典照合で追加（scripts/apply-result-drafts.js）----\n${add}` : `\n${add}`;
  src = src.slice(0, m.index) + `const RESULTS = {${newBody}\n};` + src.slice(m.index + m[0].length);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${src}\n;this.__r = RESULTS;`, ctx); // 読み込めることを確かめてから保存
  fs.writeFileSync(RESULTS_PATH, src);
}

async function main() {
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('使い方: node scripts/apply-result-drafts.js <下書きファイル> [--apply] [--json]'); process.exit(2); }
  const today = todayJst();
  const events = new Map(loadEvents().map((e) => [e.id, e]));
  const existing = loadResultsObject();
  const rows = parse(fs.readFileSync(file, 'utf8'));
  const cache = new Map();
  const results = [];
  for (const row of rows) results.push(await judge(row, events, existing, today, cache));
  // 1つのイベントに複数の試合・部門の行があるとき：すべて通った場合だけ、1件にまとめて入れる
  const byId = new Map();
  results.forEach((r) => { if (!byId.has(r.id)) byId.set(r.id, []); byId.get(r.id).push(r); });
  const accepted = [];
  for (const [id, group] of byId) {
    if (group.length === 1) { if (group[0].gate === 'A') accepted.push(group[0]); continue; }
    if (group.some((r) => r.gate !== 'A')) {
      group.forEach((r) => { if (r.gate === 'A') { r.gate = 'C'; r.problems.push('同じイベントのほかの行が照合を通らなかった'); } });
      continue;
    }
    const kinds = new Set(group.map((r) => r.entry.kind));
    const teams = group.map((r) => r.entry.team);
    if (kinds.size !== 1 || new Set(teams).size !== teams.length || teams.some((t) => !t)) {
      group.forEach((r) => { r.gate = 'C'; r.problems.push('同じイベントの複数行で、種類が違うかチーム名が重複・空'); });
      continue;
    }
    const first = group[0];
    const merged = { ...first, entry: { ...first.entry } };
    if (first.entry.kind === 'match') {
      merged.entry.matches = group.map((r) => ({ team: r.entry.team, outcome: r.entry.outcome, score: r.entry.score, detail: r.entry.detail }));
    } else {
      merged.entry.award = group.map((r) => `${r.entry.team} ${r.entry.award}`).join('／');
      merged.entry.team = '';
    }
    merged.notes = group.flatMap((r) => r.notes);
    accepted.push(merged);
  }
  const held = results.filter((r) => r.gate !== 'A');
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), today, accepted: accepted.length, held: held.length, results }, null, 2) + '\n');
  if (flag('--apply') && accepted.length) applyEntries(accepted, today);
  if (flag('--json')) { console.log(JSON.stringify({ accepted, held }, null, 2)); return; }
  console.log(`照合: 反映できる ${accepted.length}件 / 保留 ${held.length}件${flag('--apply') ? '（results.js に反映しました）' : '（--apply で反映）'}`);
  for (const r of accepted) console.log(`  A ${r.id} ${r.title || ''} — ${r.notes.join(' / ')}`);
  for (const r of held) console.log(`  C ${r.id} ${r.title || ''} — ${r.problems.join(' / ')}`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(2); });

module.exports = { parse, containsScore, scorePositions, strongScores, opponentKeys, clubKeys, judge };
