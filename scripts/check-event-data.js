#!/usr/bin/env node
/**
 * scripts/check-event-data.js — events.js の表記・必須項目・料金表記の検査
 *
 * 使い方:
 *   node scripts/check-event-data.js                 全件を検査（エラーがあれば終了コード1）
 *   node scripts/check-event-data.js --upcoming 30   警告は今後30日の公開イベントだけ表示
 *   node scripts/check-event-data.js --ids evt-1,evt-2
 *   node scripts/check-event-data.js --fix           辞書・ルールで機械的に直せるものを直す
 *   node scripts/check-event-data.js --candidates    週次の辞書承認用に、団体名の揺れの候補を出す
 *   node scripts/check-event-data.js --json          結果をJSONで出す
 *
 * エラー（CIを止める）は「明らかに誤り」のものだけ。表記の揺れなどは警告にする。
 * ルールの根拠は docs/EDITORIAL_RULES.md。
 */
'use strict';

const fs = require('fs');
const {
  EVENTS_PATH, loadEvents, loadOrganizations, loadDictionary,
  normalizeForMatch, todayJst, isUpcoming, setEventField,
} = require('./lib/event-data');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const FEE_TYPES = ['free', 'paid', 'unknown'];
const UNKNOWN_FEE_TEXTS = ['料金未確認', '料金未公表'];
const REVIEW_STATUSES = ['pending', 'partial', 'rejected'];
const GUESS_WORDS = /推定|推測|おそらく|と思われ|たぶん|多分/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const JP_RE = /[ぁ-んァ-ヶ一-龠々]/;
const EN_SOURCE_RE = /\/news-en\/|\/en\/|[?&]lang=en\b|\/english\//i;
// URL に news-en を含むが中身は日本語のページ（2026-11-14 に確認済み）
const EN_SOURCE_EXCEPTIONS = [/\/culture\/dramakan\/news-en\//];

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function hasSource(ev) {
  return Boolean(ev.externalUrl || ev.registrationUrl || (Array.isArray(ev.sourceUrls) && ev.sourceUrls.length));
}

function run() {
  const events = loadEvents();
  const orgs = loadOrganizations();
  const dict = loadDictionary();
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const today = todayJst();
  const upcomingDays = opt('--upcoming') != null ? Number(opt('--upcoming')) : null;
  const onlyIds = opt('--ids') ? new Set(opt('--ids').split(',').map((s) => s.trim())) : null;

  const aliasToVenue = new Map();
  for (const v of dict.venues) for (const a of v.aliases) aliasToVenue.set(a, v);
  const forbidden = dict.venues.flatMap((v) => (v.forbidden || []).map((f) => ({ f, v })));

  const issues = [];
  const fixes = [];
  const add = (level, code, ev, message, fix) => {
    issues.push({ level, code, id: ev ? ev.id : null, title: ev ? ev.title : null, message });
    if (fix) fixes.push({ id: ev.id, ...fix });
  };

  // ---- ID の重複 ----
  const seen = new Map();
  for (const ev of events) {
    if (seen.has(ev.id)) add('error', 'E001', ev, `ID が重複しています（${ev.id}）`);
    seen.set(ev.id, ev);
  }

  // ---- 団体名の揺れ（同じ orgId で organizer が複数ある） ----
  const organizerVariants = new Map();
  for (const ev of events) {
    if (!ev.orgId || ev.isPublished === false) continue;
    if (!organizerVariants.has(ev.orgId)) organizerVariants.set(ev.orgId, new Map());
    const m = organizerVariants.get(ev.orgId);
    m.set(ev.organizer, (m.get(ev.organizer) || 0) + 1);
  }

  for (const ev of events) {
    if (onlyIds && !onlyIds.has(ev.id)) continue;
    const inScope = upcomingDays == null || isUpcoming(ev, today, upcomingDays);

    // ---- エラー：必須項目・形式 ----
    if (!ev.id || !ev.title || !ev.date || typeof ev.isPublished !== 'boolean') {
      add('error', 'E002', ev, '必須項目（id・title・date・isPublished）が欠けています');
    }
    if (ev.date && !validDate(ev.date)) add('error', 'E003', ev, `date の形式が不正です（${ev.date}）`);
    if (ev.endDate && !validDate(ev.endDate)) add('error', 'E003', ev, `endDate の形式が不正です（${ev.endDate}）`);
    if (ev.endDate && ev.date && ev.endDate < ev.date) add('error', 'E003', ev, `endDate が date より前です（${ev.date} → ${ev.endDate}）`);
    for (const k of ['startTime', 'endTime']) {
      if (ev[k] && !TIME_RE.test(ev[k])) {
        const padded = /^\d:[0-5]\d$/.test(ev[k]) ? `0${ev[k]}` : null;
        add('error', 'E004', ev, `${k} の形式が不正です（${ev[k]}）。HH:MM で書きます`, padded ? { [k]: padded } : null);
      }
    }
    for (const { f, v } of forbidden) {
      if ((ev.location || '').includes(f)) {
        add('error', 'E005', ev, `会場名「${f}」は誤記です。正式名称は「${v.name}」（${v.authorityUrl}）`);
      }
    }
    if (ev.feeType && !FEE_TYPES.includes(ev.feeType)) add('error', 'E008', ev, `feeType が不正です（${ev.feeType}）`);
    if (GUESS_WORDS.test(ev.feeText || '')) {
      add('error', 'E006', ev, `料金が推測で書かれています（「${ev.feeText}」）。出典にない料金は「料金未確認」にします`,
        { feeType: 'unknown', feeText: '料金未確認' });
    }
    if (ev.reviewStatus != null && !REVIEW_STATUSES.includes(ev.reviewStatus)) {
      add('error', 'E009', ev, `reviewStatus が不正です（${ev.reviewStatus}）`);
    }
    if (ev.reviewStatus && ev.reviewStatus !== 'rejected' && ev.isPublished === true) {
      add('error', 'E009', ev, `確認待ち（reviewStatus: ${ev.reviewStatus}）のイベントが公開されています`);
    }

    if (!inScope || ev.isPublished === false || ev.mergedInto) continue;

    // ---- 警告：表記 ----
    const venue = aliasToVenue.get(ev.location || '');
    if (venue && ev.location !== venue.display) {
      add('warn', 'W101', ev, `会場の表記を辞書の正式表記にそろえます（「${ev.location}」→「${venue.display}」）`,
        { location: venue.display });
    }

    const orgDict = ev.orgId ? dict.organizers[ev.orgId] : null;
    if (orgDict && ev.organizer !== orgDict.display && (orgDict.aliases || []).includes(ev.organizer)) {
      add('warn', 'W102', ev, `団体名を辞書の表示名にそろえます（「${ev.organizer}」→「${orgDict.display}」）`,
        { organizer: orgDict.display });
    } else if (orgDict && ev.organizer !== orgDict.display) {
      add('warn', 'W103', ev, `団体名「${ev.organizer}」が辞書の表示名「${orgDict.display}」と違います（別名として承認されていません）`);
    }

    // ---- 警告：翻訳の疑い ----
    const url = ev.externalUrl || '';
    if (EN_SOURCE_RE.test(url) && !EN_SOURCE_EXCEPTIONS.some((re) => re.test(url)) && JP_RE.test(ev.title || '')) {
      add('warn', 'W104', ev, '英語版ページを出典に日本語のタイトルを付けています。翻訳していないか、日本語の元ページを出典にできないか確認してください');
    }
    const org = ev.orgId ? orgById.get(ev.orgId) : null;
    if (org && ev.organizer && !JP_RE.test(ev.organizer) && JP_RE.test(org.name) && !org.alphabetName) {
      add('warn', 'W105', ev, `団体名がローマ字表記（「${ev.organizer}」）で、公認団体一覧は「${org.name}」です。団体自身の名乗りか確認してください`);
    }

    // ---- 警告：出典・料金 ----
    if (ev.scope !== 'schedule' && !hasSource(ev)) {
      add('warn', 'W106', ev, '出典URL（externalUrl / sourceUrls）がありません');
    }
    if (ev.feeType === 'unknown' && !UNKNOWN_FEE_TEXTS.includes(ev.feeText || '') && !GUESS_WORDS.test(ev.feeText || '')) {
      const fixable = !ev.feeText || ev.feeText === '料金不明';
      add('warn', 'W107', ev, `料金不明のときの表記は「料金未確認」か「料金未公表」です（今は「${ev.feeText || ''}」）`,
        fixable ? { feeText: '料金未確認' } : null);
    }
  }

  // ---- 辞書承認の候補（週次） ----
  const candidates = [];
  for (const [orgId, variants] of organizerVariants) {
    if (variants.size < 2 || dict.organizers[orgId]) continue;
    const org = orgById.get(orgId);
    candidates.push({
      orgId,
      officialListName: org ? org.name : null,
      variants: [...variants.entries()].map(([name, count]) => ({ name, count })),
    });
  }

  return { events, issues, fixes, candidates, today };
}

function applyFixes(fixes, today) {
  let source = fs.readFileSync(EVENTS_PATH, 'utf8');
  const touched = new Set();
  for (const fix of fixes) {
    for (const [key, value] of Object.entries(fix)) {
      if (key === 'id') continue;
      source = setEventField(source, fix.id, key, value);
    }
    touched.add(fix.id);
  }
  for (const id of touched) source = setEventField(source, id, 'lastUpdated', today);
  // 書き換え後も読み込めることを確かめてから保存する
  loadEvents(source);
  fs.writeFileSync(EVENTS_PATH, source);
  return touched.size;
}

function main() {
  const { issues, fixes, candidates, today } = run();
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  if (flag('--json')) {
    process.stdout.write(JSON.stringify({ today, errors, warnings: warns, fixable: fixes.length, candidates }, null, 2) + '\n');
  } else if (flag('--candidates')) {
    if (!candidates.length) console.log('団体名の揺れの候補はありません。');
    for (const c of candidates) {
      console.log(`${c.orgId}（公認団体一覧の表記: ${c.officialListName ?? '不明'}）`);
      for (const v of c.variants) console.log(`  - ${v.name}（${v.count}件）`);
    }
  } else {
    const byCode = {};
    for (const i of issues) (byCode[i.code] ||= []).push(i);
    for (const code of Object.keys(byCode).sort()) {
      const list = byCode[code];
      console.log(`\n[${list[0].level === 'error' ? 'エラー' : '警告'} ${code}] ${list.length}件`);
      for (const i of list.slice(0, 15)) console.log(`  ${i.id}  ${i.message}`);
      if (list.length > 15) console.log(`  …ほか${list.length - 15}件`);
    }
    console.log(`\nエラー ${errors.length}件 / 警告 ${warns.length}件（うち --fix で直せるもの ${fixes.length}件） / 団体名の揺れの候補 ${candidates.length}件`);
  }

  if (flag('--fix') && fixes.length) {
    const n = applyFixes(fixes, today);
    console.log(`--fix: ${n}件のイベントを書き換えました（lastUpdated を ${today} に更新）。`);
  }

  if (errors.length && !flag('--fix')) process.exit(1);
}

if (require.main === module) main();

module.exports = { run };
