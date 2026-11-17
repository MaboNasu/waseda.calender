#!/usr/bin/env node
/**
 * scripts/official-event-audit.js — 大学公式のイベント一覧と events.js を照らし、未掲載の候補を出す（取りこぼし監査）
 *
 *   node scripts/official-event-audit.js [--days 30] [--format md|json|weekly] [--limit 10] [--html <保存したページ>]
 *
 * 早稲田大学のイベント一覧（https://www.waseda.jp/top/event/list）は、各イベントに
 * 「Googleカレンダーに追加」のリンクがあり、題名・期間・会場・個別ページURLが機械的に読める。
 * それを読み、今日から --days 日以内に開催中・開催予定のもののうち events.js に載っていないものを出す。
 *
 * - 掲載済みかどうか：個別ページURLが externalUrl / sourceUrls と一致するか、題名（正規化）が一致・包含するか
 * - これは「候補を出す」だけ。掲載するかは EVENT_REVIEW_RULES.md で判断し、追加したものは
 *   verify-event-sources.js の照合を通ったものだけ公開される（docs/EDITORIAL_RULES.md）。
 * - 題名・会場は出典の表記のまま出す（翻訳・補足しない）。
 * - --format weekly は weekly-report.js の「5. 取りこぼし監査」にそのまま貼れる形。
 */
'use strict';

const fs = require('fs');
const { loadEvents, normalizeForMatch, todayJst } = require('./lib/event-data');

// 「Googleカレンダーに追加」リンクがある大学公式の一覧（2026-11-16 に sources.json の waseda.jp を全部調べて見つかったもの）
// {YM} は今月・来月（YYYY-MM）に置き換えて両方読む
const SOURCES = [
  { name: '早稲田大学 イベント一覧', url: 'https://www.waseda.jp/top/event/list' },
  { name: '早稲田大学 文化推進部 イベント', url: 'https://www.waseda.jp/culture/event/?date={YM}' },
  { name: '早稲田ウィークリー サークルガイド', url: 'https://www.waseda.jp/inst/weekly/circleguide/' },
  { name: '早稲田大学 ICC イベント', url: 'https://www.waseda.jp/inst/icc/events/report' },
];

function expandUrls(src, today) {
  if (!src.url.includes('{YM}')) return [src.url];
  const [y, m] = today.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [src.url.replace('{YM}', today.slice(0, 7)), src.url.replace('{YM}', next)];
}

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 「Googleカレンダーに追加」リンクからイベントを読む。dates の終了日は Google の形式（翌日）なので1日戻す */
function parseCalendarLinks(html) {
  const out = [];
  const seen = new Set();
  const re = /calendar\/render\?([^"'<>\s]+)/g;
  let m;
  while ((m = re.exec(html))) {
    let q;
    try { q = new URLSearchParams(decodeEntities(m[1])); } catch { continue; }
    const dates = q.get('dates') || '';
    const dm = /^(\d{8})(?:T\d+Z?)?\/(\d{8})(?:T\d+Z?)?$/.exec(dates);
    if (!dm) continue;
    const timed = /T/.test(dates);
    const start = ymd(dm[1]);
    let end = ymd(dm[2]);
    if (!timed && end > start) end = addDays(end, -1);
    const url = (q.get('sprop') || q.get('details') || '').trim();
    const title = decodeEntities(q.get('text') || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const key = `${url}|${title}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = { title, start, end, location: decodeEntities(q.get('location') || '').replace(/\s+/g, ' ').trim(), url };
    // サークルガイドなどは、カレンダーの期間が「申込期間」で、題名の先頭「11/27【締切：…】」が開催日のことがある
    const lead = /^(\d{1,2})\/(\d{1,2})(?!\d)/.exec(title);
    if (lead) {
      let y = Number(start.slice(0, 4));
      const md = `${String(lead[1]).padStart(2, '0')}-${String(lead[2]).padStart(2, '0')}`;
      if (`${y}-${md}` < start) y += 1;
      const day = `${y}-${md}`;
      if (!Number.isNaN(Date.parse(day)) && day >= start) { item.applyPeriod = `${start}〜${end}`; item.start = day; item.end = day; }
    }
    out.push(item);
  }
  return out;
}

function normUrl(u) {
  return String(u || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

/** 題名の比較用。【】や記号・空白を除いた正規化 */
function normTitle(t) {
  return normalizeForMatch(String(t || '').replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]/g, '')).replace(/[「」『』《》〈〉()（）・、。:：\-－―—'"“”!！?？]/g, '');
}

function findListed(item, events) {
  const u = normUrl(item.url);
  const t = normTitle(item.title);
  for (const e of events) {
    const urls = [e.externalUrl, e.registrationUrl, ...(Array.isArray(e.sourceUrls) ? e.sourceUrls : [])].filter(Boolean).map(normUrl);
    if (u && urls.includes(u)) return { event: e, by: 'URL' };
  }
  // 題名での一致は、期間が重なるものに限る（毎月の同名企画を取り違えないため）
  const overlaps = (e) => (e.endDate || e.date) >= item.start && e.date <= item.end;
  const phrases = (String(item.title).match(/[「『]([^」』]{6,})[」』]/g) || []).map((p) => normTitle(p.slice(1, -1)).slice(0, 10)).filter((p) => p.length >= 6);
  if (t.length >= 6) {
    for (const e of events) {
      if (!overlaps(e)) continue;
      const et = normTitle(e.title);
      if (et.length < 6) continue;
      const head = (x) => x.slice(0, 14);
      if (et === t || et.includes(t) || t.includes(et) || head(et) === head(t)) return { event: e, by: '題名' };
      if (phrases.some((p) => et.includes(p))) return { event: e, by: '題名の「」' };
    }
  }
  return null;
}

/** イベントではない告知（チケット販売・募集・お知らせ）は「要判断」として分けて出す */
const NOTICE_RE = /チケット販売|販売について|募集|お知らせ|のご案内について|注目企画|受付/;
const LONG_DAYS = 45;

function audit(items, events, today, days) {
  const until = addDays(today, days);
  const inRange = items.filter((x) => x.end >= today && x.start <= until);
  const rows = inRange.map((x) => {
    const hit = findListed(x, events);
    const longRun = (Date.parse(x.end) - Date.parse(x.start)) / 86400000 >= LONG_DAYS;
    return { ...x, listed: hit ? { id: hit.event.id, by: hit.by } : null, notice: NOTICE_RE.test(x.title), longRun };
  });
  return { today, until, total: items.length, inRange: rows.length, missing: rows.filter((r) => !r.listed), listed: rows.filter((r) => r.listed) };
}

function fmtDate(r) { return r.start === r.end ? r.start : `${r.start}〜${r.end}`; }

function render(result, format, sourceName, budget = { left: 10 }) {
  if (format === 'json') return JSON.stringify(result, null, 2);
  const lines = [];
  const missing = result.missing.filter((r) => !r.notice);
  const notices = result.missing.filter((r) => r.notice);
  if (format === 'weekly') {
    lines.push(`# ${sourceName}（${result.today}〜${result.until}に開催中・開催予定 ${result.inRange}件、うち未掲載 ${missing.length}件。scripts/official-event-audit.js で自動作成）`);
    lines.push('# OK＝掲載する（翌朝の作業で出典を確かめて追加）／NG＝掲載しない');
    lines.push('# 形式: 判断|題名（出典の表記のまま）|開催日|主催（出典の表記のまま）|出典URL');
    if (!missing.length) lines.push(`# 未掲載の候補はありません（確認したページ: ${SOURCES.map((s) => s.url).join(' ')}）`);
    const shown = missing.slice(0, Math.max(0, budget.left));
    budget.left -= shown.length;
    for (const r of shown) lines.push(`   |${r.title.replace(/\|/g, '｜')}|${fmtDate(r)}${r.longRun ? '（長期）' : ''}|（出典で確認）|${r.url}`);
    if (missing.length > shown.length) lines.push(`# ほか ${missing.length - shown.length}件は次週に回す（週の上限10件）`);
    return lines.join('\n');
  }
  lines.push(`## 取りこぼし監査：${sourceName}（${result.today}〜${result.until}）`);
  lines.push(`一覧 ${result.total}件のうち期間内 ${result.inRange}件。掲載済み ${result.listed.length}件、未掲載 ${missing.length}件、告知（要判断）${notices.length}件。`);
  lines.push('', '### 未掲載');
  if (!missing.length) lines.push('なし');
  missing.forEach((r) => lines.push(`- ${fmtDate(r)}｜${r.title}｜${r.location || '会場の記載なし'}｜${r.url}${r.longRun ? '｜長期' : ''}${r.applyPeriod ? `｜申込 ${r.applyPeriod}` : ''}`));
  if (notices.length) {
    lines.push('', '### 告知（イベントかどうか要判断）');
    notices.forEach((r) => lines.push(`- ${fmtDate(r)}｜${r.title}｜${r.url}`));
  }
  return lines.join('\n');
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'WasedaCalendar-OmissionAudit/1.0 (+https://wasedacalendar.com/about.html)' } });
  if (!res.ok) throw Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function main() {
  const days = Number(opt('--days', '30'));
  const format = opt('--format', 'md');
  const today = todayJst();
  const events = loadEvents().filter((e) => !e.mergedInto);
  const out = [];
  const errors = [];
  const audits = [];
  for (const src of (opt('--html') ? [SOURCES[0]] : SOURCES)) {
    const items = [];
    for (const url of expandUrls(src, today)) {
      try {
        const html = opt('--html') ? fs.readFileSync(opt('--html'), 'utf8') : await fetchHtml(url);
        const got = parseCalendarLinks(html);
        if (!got.length) errors.push(`イベントを読めない（ページの形が変わった可能性）: ${url}`);
        items.push(...got);
      } catch (err) { errors.push(`${err.message}`); }
    }
    const uniq = [...new Map(items.map((x) => [`${normUrl(x.url)}|${x.title}|${x.start}`, x])).values()];
    if (uniq.length) audits.push({ name: src.name, urls: expandUrls(src, today), result: audit(uniq, events, today, days) });
  }
  // 複数の一覧に同じイベントが載ることがあるので、未掲載はURLで1つにまとめる
  const seenUrl = new Set();
  for (const a of audits) a.result.missing = a.result.missing.filter((r) => { const k = normUrl(r.url) || r.title; if (seenUrl.has(k)) return false; seenUrl.add(k); return true; });
  if (format === 'json') { console.log(JSON.stringify({ audits, errors }, null, 2)); return; }
  if (format === 'weekly') {
    let left = Number(opt('--limit', '10'));
    out.push('# 大学公式のイベント一覧との照合（scripts/official-event-audit.js で自動作成。今日から' + days + '日以内に開催中・開催予定のもの）');
    out.push('# OK＝掲載する（翌朝の作業で出典を確かめて追加）／NG＝掲載しない。イベントかどうかは EVENT_REVIEW_RULES.md で判断');
    out.push('# 形式: 判断|題名（出典の表記のまま）|開催日|主催（出典の表記のまま）|出典URL');
    for (const a of audits) {
      const missing = a.result.missing.filter((r) => !r.notice);
      out.push(`# ${a.name}：期間内 ${a.result.inRange}件・掲載済み ${a.result.listed.length}件・未掲載 ${missing.length}件（${a.urls.join(' ')}）`);
      const shown = missing.slice(0, Math.max(0, left));
      left -= shown.length;
      shown.forEach((r) => out.push(`   |${r.title.replace(/\|/g, '｜')}|${fmtDate(r)}${r.longRun ? '（長期）' : ''}|（出典で確認）|${r.url}`));
      if (missing.length > shown.length) out.push(`#   ほか ${missing.length - shown.length}件は次週に回す（週の上限）`);
    }
    if (errors.length) out.push(`# 読めなかった一覧: ${errors.join(' / ')}`);
    console.log(out.join('\n'));
    return;
  }
  for (const a of audits) out.push(render(a.result, format, a.name));
  if (errors.length) out.push(`読めなかった一覧: ${errors.join(' / ')}`);
  console.log(out.join('\n\n'));
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(2); });

module.exports = { parseCalendarLinks, findListed, audit, normTitle, normUrl, render };
