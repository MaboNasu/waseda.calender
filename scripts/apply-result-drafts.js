#!/usr/bin/env node
/**
 * scripts/apply-result-drafts.js — 結果の下書きを出典と照合し、通ったものだけ results.js に入れる
 *
 *   node scripts/apply-result-drafts.js <下書きファイル> [--apply] [--json] [--pages <本文.json>]
 *
 *   --pages：この環境から取得できないサイト（handball.or.jp など）は、照合する側（下書きを書いた AI ではない）が
 *   ブラウザで開いた本文を { "出典URL": "本文" } の JSON で渡せる（.verify-evidence/ に置き、コミットしない）。
 *   取得に失敗したときだけ使う。
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
 * 「# evt-xxx 見つからず」などのコメント行は、--apply で候補の状態（scripts/results-collection-state.json）に記録する
 * （parseNotes の説明を参照）。「# evt-xxx 食い違い｜項目｜掲載データ｜公式｜URL」は修正依頼の形で出力する。
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
  /(^|\.)handball\.or\.jp$/, /(^|\.)kendo\.or\.jp$/, /(^|\.)tourokurenmei\.com$/, /(^|\.)keio-soccer\.net$/, /(^|\.)wasedabbc\.org$/, /(^|\.)wasedasports-sousupo\.com$/, /(^|\.)wasedatennis\.net$/, /(^|\.)univas\.jp$/, /(^|\.)jfa\.jp$/, /(^|\.)rugby-japan\.jp$/,
];
const UNREADABLE_HOSTS = /(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$/;
// よく使われる大学名の略称（頭文字＋「大」で機械的に略すと「東海大学→東大」のように取り違えるので、表で持つ）
const UNIV_ABBR = {
  明治大学: ['明大'], 中央大学: ['中大'], 駒澤大学: ['駒大'], 駒沢大学: ['駒大'], 法政大学: ['法大'], 立教大学: ['立大'],
  慶應義塾大学: ['慶大', '慶應'], 慶應大学: ['慶大'], 日本大学: ['日大'], 日本体育大学: ['日体大'], 国士舘大学: ['国士大', '国士舘大'],
  筑波大学: ['筑波大', '筑大'], 東海大学: ['東海大'], 東洋大学: ['東洋大'], 帝京大学: ['帝京大'], 青山学院大学: ['青学大', '青学'], 青山学院大: ['青学大', '青学'], 帝京大: ['帝京大'], 筑波大: ['筑波大', '筑大'],
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

/**
 * organizations.js に団体の公式サイト（websiteUrl）として登録されているドメイン。
 * 部・サークル自身のサイトは、その団体の結果の一次情報として扱う。
 * 無料ブログ・作成サービス（wixsite・ameblo など）は誰でも作れるので除く。
 */
let CLUB_HOSTS = null;
function clubHosts() {
  if (CLUB_HOSTS) return CLUB_HOSTS;
  CLUB_HOSTS = new Set();
  try {
    const { loadOrganizations } = require('./lib/event-data');
    for (const o of loadOrganizations()) {
      if (!o.websiteUrl) continue;
      try {
        const h = new URL(o.websiteUrl).hostname.replace(/^www\./, '');
        if (!/wixsite|ameblo|wordpress\.com|jimdo|fc2|studio\.site|netlify|tumblr|github\.io|sakura\.ne\.jp|instagram|twitter|x\.com|facebook|note\.com|linktr/.test(h)) CLUB_HOSTS.add(h);
      } catch { /* 不正なURLは無視 */ }
    }
  } catch { /* organizations.js が読めないときは使わない */ }
  return CLUB_HOSTS;
}

/**
 * 「# evt-xxx 理由」のコメント行。調べた結果を候補の状態（scripts/results-collection-state.json）に残し、
 * 同じイベントを毎日調べ直さないようにする。食い違いは修正依頼の形にする。
 *   結果なし・個人成績のみ → not_applicable（もう調べない）
 *   中止・延期・不出場      → cancelled（もう調べない）
 *   食い違い               → conflict（掲載データを直すまで調べない）
 *   見つからず・未掲載・PDFのみ → not_found（1・3・7・14・30日目にまた調べる）
 */
function parseNotes(text) {
  const notes = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = /^#\s*(evt-[A-Za-z0-9-]+)\s*(.*)$/.exec(raw.trim());
    if (!m) return;
    const [, id, rest] = m;
    let status = null;
    if (/食い違い/.test(rest)) status = 'conflict';
    else if (/結果なし|個人成績のみ/.test(rest)) status = 'not_applicable';
    else if (/中止|延期|不出場/.test(rest)) status = 'cancelled';
    else if (/見つからず|未掲載|PDFのみ/.test(rest)) status = 'not_found';
    if (!status) return;
    const note = { line: i + 1, id, status, text: rest.trim() };
    if (status === 'conflict') {
      const parts = rest.replace(/^食い違い[:：]?\s*/, '').split(/[｜|]/).map((x) => x.trim()).filter(Boolean);
      note.request = parts.length >= 4
        ? [id, parts[0], parts[1], parts[2], parts[3]].join('|')
        : [id, '内容', '（掲載データ）', parts.join(' ') || rest.trim(), ''].join('|');
    }
    notes.push(note);
  });
  return notes;
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
  return normText
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d)[xX](?![a-zA-Z])/g, '$1') // サヨナラ・コールドの「6x」「13x」
    .replace(/(\d)対(\d)/g, '$1-$2') // 「13x 対 3」「5対4」
    .replace(/(\d)[ーｰ](\d)/g, '$1-$2'); // 記事で長音符を区切りに使う「21ー26」
}

/**
 * 空白で区切られた表のスコア（正規化で空白を消す前の本文で見る）。
 * - 「早稲田大学 7 19 中央大学」のような対戦表示（相手が先の順も）
 * - 野球などのイニング別スコア（「早大 0 0 0 1 0 3 0 1 0 5 慶大 0 0 0 0 0 2 0 0 0 2」）の合計
 */
const WASEDA_NAME = '(?:早稲田大学|早稲田|早大)';
function escapeRe(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function rawScoreMatch(rawText, a, b, keys) {
  const raw = String(rawText).normalize('NFKC').replace(/\s+/g, ' ');
  const names = keys.filter((k) => k.length >= 2).map(escapeRe);
  if (!names.length) return null;
  const opp = `(?:${names.join('|')})`;
  const board = [
    new RegExp(`${WASEDA_NAME} ${a} ${b} ${opp}`),
    new RegExp(`${opp} ${b} ${a} ${WASEDA_NAME}`),
  ];
  for (const re of board) { const m = re.exec(raw); if (m) return { at: m.index, how: '対戦表示' }; }
  // イニング別スコア：チーム名のあとに1〜2桁の数か X が3〜12個、最後が合計
  const rowRe = /(早稲田大学|早稲田|早大|[^\s\d]{1,12}) ((?:(?:\d{1,2}|[xX]) ){3,12})(\d{1,3})x?(?= |$)/g;
  const rows = [];
  let m;
  while ((m = rowRe.exec(raw))) rows.push({ name: m[1], total: Number(m[3]), at: m.index });
  for (let i = 0; i < rows.length - 1; i++) {
    const r1 = rows[i];
    const r2 = rows[i + 1];
    if (r2.at - r1.at > 120) continue;
    const isW = (r) => new RegExp(`^${WASEDA_NAME}$`).test(r.name);
    const isO = (r) => keys.some((k) => k.length >= 2 && (r.name.includes(k) || k.includes(r.name)));
    if (isW(r1) && isO(r2) && r1.total === Number(a) && r2.total === Number(b)) return { at: r1.at, how: 'イニング別スコアの合計' };
    if (isO(r1) && isW(r2) && r2.total === Number(a) && r1.total === Number(b)) return { at: r1.at, how: 'イニング別スコアの合計' };
  }
  return null;
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
  // 部の名前と競技名が違うもの（出典は競技名で書くことが多い）
  const SPORT = { ア式蹴球部: 'サッカー', ラグビー蹴球部: 'ラグビー', 米式蹴球部: 'アメリカンフットボール', 庭球部: 'テニス', 軟式庭球部: 'ソフトテニス', 漕艇部: 'レガッタ', 競走部: '陸上' };
  [...keys].forEach((k) => { const base = k.replace(/\s.*$/, ''); if (SPORT[base]) keys.add(SPORT[base]); });
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
  // 「vs」を優先する。「対」は「関東大学対抗戦」の「対」を拾わないよう、後ろが「抗」のときは使わない
  const vs = /(?:vs|VS)\.?\s*([^（(【\[]+)/.exec(title) || /対(?!抗)\s*([^（(【\[]+)/.exec(title);
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
  const official = OFFICIAL_HOSTS.some((re) => re.test(host)) || clubHosts().has(host.replace(/^www\./, ''));
  if (host && !official && !UNREADABLE_HOSTS.test(host)) out.problems.push(`出典が公式と確認できないドメイン（${host}）`);
  if (out.problems.length) return out;

  const fetched = cache.has(url) ? cache.get(url) : await fetchText(url);
  cache.set(url, fetched);
  let text;
  if (fetched.ok) text = fetched.text;
  else if (cache.has(`page:${url}`)) { text = cache.get(`page:${url}`); out.notes.push(`ブラウザで取得した本文で照合（${fetched.reason}）`); }
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
      // 「早大125中―明大126中」「早大3点-明大1点」のように、単位や相手名がスコアの間に入る書き方
      keys.forEach((k) => {
        const re = new RegExp(`(?<!\\d)${a}(?:中|点|本)?-${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${b}(?:中|点|本)?(?!\\d)`);
        const m = re.exec(norm);
        if (m) pos.push(m.index);
      });
      at = pos.find((p) => near(p, 250));
      if (at === undefined || !pos.length) {
        // 出典が「相手 2-4 早稲田」の順（ホーム側が先）で書いているとき：相手名の直後に逆順のスコア、その直後に早稲田
        const rev = scorePositions(norm, b, a).find((p) => {
          const before = norm.slice(Math.max(0, p - 15), p);
          const after = norm.slice(p, p + String(b).length + String(a).length + 15);
          return keys.some((k) => before.includes(k)) && /早稲田|早大/.test(after);
        });
        if (rev !== undefined) { at = rev; out.notes.push('出典は相手が先の順で記載'); }
      }
      if (at === undefined && !/早慶/.test(ev.title || '')) {
        // 空白区切りの表（対戦表示・イニング別スコア）。早慶戦の一覧は行の取り違えが起きやすいので使わない
        const rs = rawScoreMatch(text, a, b, keys);
        if (rs) {
          out.notes.push(`${rs.how}で確認`);
          out.gate = 'A';
          out.entry = { kind, team, outcome, score, detail, award, url, label };
          return out;
        }
      }
      if (at === undefined) { out.problems.push(pos.length ? 'スコアの近くに対戦相手名・節がない（別の試合の可能性）' : `スコア ${score} が出典にない`); return out; }
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
    if (norm.indexOf(aw) < 0) { out.problems.push(`成績「${award}」が出典にない`); return out; }
    // 成績は大会名の「あと」に書かれる。大会名の前に別の大会の成績があっても通さないよう、成績の手前600字に大会名があるものだけを見る
    let hit;
    for (let at = norm.indexOf(aw); at >= 0 && !hit; at = norm.indexOf(aw, at + 1)) {
      const before = norm.slice(Math.max(0, at - 600), at);
      hit = keys.find((k) => before.includes(k));
    }
    if (!hit) { out.problems.push('成績の手前に大会名がない（別の大会の成績の可能性）'); return out; }
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
    const ms = e.matches.map((m) => `      { ${m.label ? `label: ${JSON.stringify(m.label)}` : `team: ${JSON.stringify(m.team)}`}, outcome: ${JSON.stringify(m.outcome)}, score: ${JSON.stringify(cleanScore(m.score))}${m.detail ? `, detail: ${JSON.stringify(m.detail)}` : ''} }`).join(',\n');
    lines.push(`    matches: [\n${ms}\n    ],`);
  } else if (e.kind === 'match') {
    lines.push(`    outcome: ${JSON.stringify(e.outcome)},`);
    lines.push(`    score: ${JSON.stringify(cleanScore(e.score))},`);
  }
  if (e.detail) lines.push(`    detail: ${JSON.stringify(e.detail)},`);
  if (e.award) lines.push(`    award: ${JSON.stringify(e.award)},`);
  const srcs = (e.sources && e.sources.length ? e.sources : [{ url: e.url, label: e.label }])
    .map((x) => `{ url: ${JSON.stringify(x.url)}, label: ${JSON.stringify(x.label || '出典')} }`).join(', ');
  lines.push(`    sources: [${srcs}],`);
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
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--pages');
  if (!file) { console.error('使い方: node scripts/apply-result-drafts.js <下書きファイル> [--apply] [--json]'); process.exit(2); }
  const today = todayJst();
  const events = new Map(loadEvents().map((e) => [e.id, e]));
  const existing = loadResultsObject();
  const rows = parse(fs.readFileSync(file, 'utf8'));
  const cache = new Map();
  const pagesArg = args.indexOf('--pages');
  if (pagesArg >= 0) {
    const pages = JSON.parse(fs.readFileSync(args[pagesArg + 1], 'utf8'));
    for (const [u, text] of Object.entries(pages)) cache.set(`page:${u}`, String(text));
  }
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
      // 「1回戦」「11/7」のような列は、チームではなく試合の見出し（label）として持つ
      const isLabel = (t) => /回戦$|^\d{1,2}\/\d{1,2}$|^第\d+戦$/.test(t);
      merged.entry.matches = group.map((r) => (isLabel(r.entry.team)
        ? { label: r.entry.team, outcome: r.entry.outcome, score: r.entry.score, detail: r.entry.detail }
        : { team: r.entry.team, outcome: r.entry.outcome, score: r.entry.score, detail: r.entry.detail }));
    } else {
      merged.entry.award = group.map((r) => `${r.entry.team} ${r.entry.award}`).join('／');
      merged.entry.team = '';
    }
    merged.notes = group.flatMap((r) => r.notes);
    const seen = new Set();
    merged.entry.sources = group.map((r) => ({ url: r.entry.url, label: r.entry.label })).filter((x) => !seen.has(x.url) && seen.add(x.url));
    accepted.push(merged);
  }
  const held = results.filter((r) => r.gate !== 'A');
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), today, accepted: accepted.length, held: held.length, results }, null, 2) + '\n');
  if (flag('--apply') && accepted.length) applyEntries(accepted, today);
  const notes = parseNotes(fs.readFileSync(file, 'utf8')).filter((n) => events.has(n.id) && !Object.prototype.hasOwnProperty.call(existing, n.id));
  if (flag('--apply') && !flag('--no-state')) {
    const Q = require('./results-collection-queue');
    const done = new Set(accepted.map((r) => r.id));
    for (const n of notes) if (!done.has(n.id)) Q.mark(Q.DEFAULT_STATE, { id: n.id, status: n.status, checkedAt: today, note: n.text.slice(0, 200) });
    for (const r of accepted) Q.mark(Q.DEFAULT_STATE, { id: r.id, status: 'published', checkedAt: today, note: '' });
  }
  const conflicts = notes.filter((n) => n.request);
  if (flag('--json')) { console.log(JSON.stringify({ accepted, held, notes }, null, 2)); return; }
  console.log(`照合: 反映できる ${accepted.length}件 / 保留 ${held.length}件${flag('--apply') ? (accepted.length ? '（results.js に反映しました）' : '') : '（--apply で反映）'}`);
  for (const r of accepted) console.log(`  A ${r.id} ${r.title || ''} — ${r.notes.join(' / ')}`);
  for (const r of held) console.log(`  C ${r.id} ${r.title || ''} — ${r.problems.join(' / ')}`);
  if (notes.length) {
    const count = (st) => notes.filter((n) => n.status === st).length;
    console.log(`調査メモ: 見つからず ${count('not_found')}件 / 結果なし ${count('not_applicable')}件 / 中止 ${count('cancelled')}件 / 食い違い ${count('conflict')}件${flag('--apply') && !flag('--no-state') ? '（候補の状態に記録しました）' : ''}`);
  }
  if (conflicts.length) {
    console.log('■ 掲載データとの食い違い（修正依頼の形式。出典を開いて確かめてから直す）');
    conflicts.forEach((n) => console.log(n.request));
  }
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(2); });

module.exports = { rawScoreMatch, parse, parseNotes, containsScore, scorePositions, strongScores, opponentKeys, clubKeys, judge };
