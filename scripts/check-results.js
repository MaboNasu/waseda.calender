#!/usr/bin/env node
/**
 * scripts/check-results.js — results.js（確認済みの結果）の検査と、表示関数のテスト（CIで実行）
 *
 *   node scripts/check-results.js
 *
 * 1. results.js の各結果について：イベントIDが events.js にある・公開中・終了済み、出典URLがある、
 *    kind / outcome / score の形、スコアと勝敗が合っている（PK戦などは detail に理由が必要）、confirmedAt の形。
 * 2. 表示関数（結果カード・開催実績の印・年度の戦績）を固定のデータでテストする（results.js の中身に依存しない）。
 * エラーがあれば終了コード1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { loadEvents, todayJst } = require('./lib/event-data');

const ROOT = path.join(__dirname, '..');
const RESULTS_SRC = fs.readFileSync(path.join(ROOT, 'results.js'), 'utf8');

function loadResultsModule(src, overrideResults) {
  const ctx = {};
  vm.createContext(ctx);
  const code = overrideResults
    ? src.replace(/const RESULTS = \{[\s\S]*?\n\};/, `const RESULTS = ${JSON.stringify(overrideResults)};`)
    : src;
  vm.runInContext(`${code}\n;this.__m = { RESULTS, wcGetResult, wcResultCardHTML, wcResultMarkHTML, wcOrgRecord, wcOrgRecordHTML, wcFiscalYear, wcResultEntries, wcOpponentFromTitle };`, ctx, { filename: 'results.js' });
  return ctx.__m;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCORE_RE = /^\s*(\d+)\s*-\s*(\d+)\s*$/;
const OUTCOMES = ['win', 'loss', 'draw'];
const SPECIAL_RULE = /PK|延長|サドンデス|タイブレーク|規定|不戦|棄権|抽選|ポイント|セット/;

function checkMatch(label, m, errors) {
  if (!OUTCOMES.includes(m.outcome)) errors.push(`${label}: outcome は win / loss / draw のどれか（今は ${m.outcome}）`);
  const s = SCORE_RE.exec(String(m.score ?? ''));
  if (!s) { errors.push(`${label}: score は「早稲田側-相手側」の数字（例 2-1）。今は「${m.score ?? ''}」`); return; }
  const [a, b] = [Number(s[1]), Number(s[2])];
  const expected = a > b ? 'win' : a < b ? 'loss' : 'draw';
  if (OUTCOMES.includes(m.outcome) && expected !== m.outcome && !SPECIAL_RULE.test(m.detail || '')) {
    errors.push(`${label}: スコア ${m.score} と勝敗 ${m.outcome} が合いません（PK戦などのときは detail に理由を書く）`);
  }
}

function checkData() {
  const { RESULTS } = loadResultsModule(RESULTS_SRC);
  const events = new Map(loadEvents().map((e) => [e.id, e]));
  const today = todayJst();
  const errors = [];
  for (const [id, r] of Object.entries(RESULTS)) {
    const ev = events.get(id);
    if (!ev) { errors.push(`${id}: events.js にないイベントID`); continue; }
    if (ev.isPublished === false) errors.push(`${id}: 非公開のイベント`);
    if ((ev.endDate || ev.date) >= today) errors.push(`${id}: まだ終わっていないイベント（${ev.endDate || ev.date}）`);
    if (!Array.isArray(r.sources) || !r.sources.length || !r.sources.every((s) => s && /^https?:\/\//.test(s.url || ''))) {
      errors.push(`${id}: 出典（sources の url）が必要`);
    }
    if (!['match', 'report'].includes(r.kind)) errors.push(`${id}: kind は match か report`);
    if (r.kind === 'match') {
      if (Array.isArray(r.matches) && r.matches.length) r.matches.forEach((m, i) => checkMatch(`${id} の matches[${i}]`, m, errors));
      else checkMatch(id, r, errors);
    }
    if (r.kind === 'report' && !r.summary && !r.award) errors.push(`${id}: report には summary か award が必要`);
    if (r.summary && String(r.summary).length > 200) errors.push(`${id}: summary は200字以内（出典の文章を写さず、自分の言葉で1〜2文）`);
    if (!DATE_RE.test(r.confirmedAt || '')) errors.push(`${id}: confirmedAt（運営者が確認した日、YYYY-MM-DD）が必要`);
  }
  return { count: Object.keys(RESULTS).length, errors };
}

async function testDisplay() {
  const fixture = {
    'evt-t1': { kind: 'match', team: '男子', outcome: 'win', score: '1-0', detail: '前半0-0／後半1-0', sources: [{ url: 'https://example.com/r1', label: '公式サイト' }], confirmedAt: '2026-11-08' },
    'evt-t2': { kind: 'match', team: '男子', outcome: 'loss', score: '0-2', sources: [{ url: 'https://example.com/r2', label: '公式サイト' }], confirmedAt: '2026-11-08' },
    'evt-t3': { kind: 'match', team: '女子', outcome: 'draw', score: '1-1', summary: '後半に追いついた。', sources: [{ url: 'https://example.com/r3' }], confirmedAt: '2026-11-08' },
    'evt-t4': { kind: 'match', outcome: 'win', score: '3-0', sources: [], confirmedAt: '2026-11-08' },
    'evt-t5': { kind: 'report', award: '準優勝', summary: '決勝で惜しくも敗れた。', sources: [{ url: 'https://example.com/r5', label: '団体サイト' }], confirmedAt: '2026-11-08' },
    'evt-t6': { kind: 'match', team: '男子', outcome: 'win', score: '2-0', sources: [{ url: 'https://example.com/r6' }], confirmedAt: '2026-03-30' },
    'evt-t7': { kind: 'match', matches: [{ team: 'A', label: '1回戦', outcome: 'win', score: '3-1' }, { team: 'A', label: '2回戦', outcome: 'loss', score: '1-2' }], sources: [{ url: 'https://example.com/r7' }], confirmedAt: '2026-11-08' },
    'evt-t8': { kind: 'match', outcome: 'win', score: '1-0', sources: [{ url: 'javascript:alert(1)' }], confirmedAt: '2026-11-08' },
  };
  const m = loadResultsModule(RESULTS_SRC, fixture);
  const ev = (id, extra = {}) => ({ id, title: '関東リーグ 第21節 vs明治大学', date: '2026-11-07', organizer: '早稲田大学ア式蹴球部', ...extra });
  const tests = [];
  const t = (name, fn) => tests.push({ name, fn });

  t('出典のない結果・http(s) 以外の出典は表示しない', () => {
    assert.strictEqual(m.wcGetResult('evt-t4'), null);
    assert.strictEqual(m.wcGetResult('evt-t8'), null);
    assert.strictEqual(m.wcResultCardHTML(ev('evt-t4')), '');
    assert.strictEqual(m.wcResultCardHTML(ev('evt-none')), '');
  });
  t('結果カード：勝敗・スコア・相手・内訳・出典が出る', () => {
    const html = m.wcResultCardHTML(ev('evt-t1'));
    assert.match(html, /○ 勝ち/);
    assert.match(html, /早稲田 <strong>1 - 0<\/strong> 明治大学/);
    assert.match(html, /前半0-0／後半1-0/);
    assert.match(html, /href="https:\/\/example.com\/r1"/);
  });
  t('報告：成績とひとことが出る', () => {
    const html = m.wcResultCardHTML(ev('evt-t5', { title: '全国大会' }));
    assert.match(html, /結果・報告/);
    assert.match(html, /準優勝/);
  });
  t('開催実績の印', () => {
    assert.match(m.wcResultMarkHTML(ev('evt-t2')), /男子 ● 0-2/);
    assert.match(m.wcResultMarkHTML(ev('evt-t5')), /準優勝/);
    assert.strictEqual(m.wcResultMarkHTML(ev('evt-none')), '');
  });
  t('年度は4月始まり', () => {
    assert.strictEqual(m.wcFiscalYear('2026-03-31'), 2025);
    assert.strictEqual(m.wcFiscalYear('2026-04-01'), 2026);
  });
  t('戦績：年度・チームごとに試合単位で数える', () => {
    const list = [ev('evt-t1'), ev('evt-t2'), ev('evt-t3'), ev('evt-t6', { date: '2026-03-30' }), ev('evt-t7')];
    const rec = m.wcOrgRecord(list, 2026);
    const by = Object.fromEntries(rec.map((r) => [r.team, r]));
    assert.deepStrictEqual([by['男子'].win, by['男子'].loss, by['男子'].draw], [1, 1, 0]);
    assert.deepStrictEqual([by['女子'].win, by['女子'].loss, by['女子'].draw], [0, 0, 1]);
    assert.deepStrictEqual([by.A.win, by.A.loss], [1, 1]);
    const html = m.wcOrgRecordHTML(list, '2026-11-16');
    assert.match(html, /2026年度の戦績/);
    assert.strictEqual(m.wcOrgRecordHTML([ev('evt-none')], '2026-11-16'), '');
  });
  t('文字はエスケープする', () => {
    const html = m.wcResultCardHTML(ev('evt-t1', { title: 'vs<script>x</script>' }));
    assert.ok(!html.includes('<script>'));
  });
  t('対戦相手はイベント名の「vs〜」から取り出す', () => {
    assert.strictEqual(m.wcOpponentFromTitle('関東大学サッカーリーグ1部 第12節 vs東海大学'), '東海大学');
    assert.strictEqual(m.wcOpponentFromTitle('早慶戦(ア式蹴球部 女子)'), '');
  });

  const D = require('./apply-result-drafts');
  const { normalizeForMatch: n } = require('./lib/event-data');
  t('下書きの照合：桁の違うスコアに一致しない', () => {
    assert.strictEqual(D.containsScore(n('早大 14-21 明大'), 4, 2), false);
    assert.notStrictEqual(D.containsScore(n('早大 4－2 駒大'), 4, 2), false);
    assert.notStrictEqual(D.containsScore(n('早稲田 2対1 慶應'), 2, 1), false);
  });
  t('下書きの照合：試合は相手名と節で照合し、大会名だけでは一致させない', () => {
    const keys = D.opponentKeys({ title: '関東大学サッカーリーグ1部 第21節 vs明治大学' }, 'match');
    assert.ok(keys.includes(n('明治大学')) && keys.includes(n('明大')) && keys.includes(n('第21節')));
    assert.ok(!keys.includes(n('関東大学サッカーリーグ1部')));
    assert.ok(D.opponentKeys({ title: '早慶戦(日本拳法部)' }, 'match').includes(n('慶應')));
  });
  t('下書きの照合：括弧内の内訳は最終スコアとして数えない', () => {
    assert.strictEqual(D.containsScore(n('早稲田 1 (0-1/1-0) 1 相手'), 0, 1), false);
    assert.notStrictEqual(D.containsScore(n('早稲田大学 34 ( 16-13 18-17 ) 30'), 34, 30), false);
    assert.notStrictEqual(D.containsScore(n('○早大1,818-1,731慶大●'), 1818, 1731), false);
  });
  t('下書きの照合：内訳つきの最終スコアを見分ける（日付の「8(土)14」は数えない）', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(D.strongScores(n('早稲田大学 0 (0-1/0-0) 1 日本体育大学')).map((x) => [x.a, x.b]))), [[0, 1]]);
    assert.strictEqual(D.strongScores(n('11/8(土)14:00 キックオフ')).length, 0);
  });
  t('下書きの照合：早慶戦は部・競技名で行を特定する（2026-11-16 の取り違えの回帰テスト）', () => {
    const keys = D.clubKeys({ title: '第100回早慶ホッケー定期戦', organizer: '早稲田大学ホッケー部' });
    assert.ok(keys.includes(n('ホッケー')));
    assert.ok(D.clubKeys({ title: '早慶戦(合気道部)' }).includes(n('合気道部')));
  });
  t('下書きの照合：「関東大学対抗戦 vs帝京大」の相手は帝京大', () => {
    const keys = D.opponentKeys({ title: 'ラグビー蹴球部 関東大学対抗戦 vs帝京大' });
    assert.ok(keys.includes(n('帝京大')));
    assert.ok(!keys.some((k) => k.includes('抗戦')));
  });
  t('下書きの照合：相手が先の順（慶應義塾大学 2-4 早稲田大学）を早稲田 4-2 として認める', async () => {
    const ev = { id: 'evt-x', title: '早慶戦(野球部)', date: '2026-11-08', organizer: '早稲田大学野球部' };
    const row = { line: 1, decision: '', fields: ['evt-x', 'match', '2回戦', 'win', '4-2', '', '', 'https://www.wasedabbc.org/game/1/', '早稲田大学野球部', ''] };
    const cache = new Map([['https://www.wasedabbc.org/game/1/', { ok: true, text: '早稲田大学野球部 2026 秋季リーグ戦 慶應義塾大学 2-4 早稲田大学 11月8日(日) 明治神宮野球場' }]]);
    const r = await D.judge(row, new Map([['evt-x', ev]]), {}, '2026-11-16', cache);
    assert.strictEqual(r.gate, 'A', r.problems.join(' / '));
  });
  t('下書きの照合：成績は大会名のあとにあるものだけ（前にある別大会の「準優勝」で通さない）', async () => {
    const ev = { id: 'evt-y', title: '全日本大学対抗テニス王座決定試合', date: '2026-10-25' };
    const mk = (text) => new Map([['https://www.wasedatennis.net/', { ok: true, text }]]);
    const row = { line: 1, decision: '', fields: ['evt-y', 'report', '', '', '', '', '準優勝', 'https://www.wasedatennis.net/', '早稲田大学庭球部', ''] };
    const ng = await D.judge(row, new Map([['evt-y', ev]]), {}, '2026-11-16', mk('関東学生選手権 シングルス準優勝 全日本大学対抗テニス王座決定試合 決勝 ●早稲田4-5法大○'));
    assert.strictEqual(ng.gate, 'C');
    const ok = await D.judge(row, new Map([['evt-y', ev]]), {}, '2026-11-16', mk('全日本大学対抗テニス王座決定試合 決勝 ●早稲田4-5法大○ 最終結果：準優勝'));
    assert.strictEqual(ok.gate, 'A', ok.problems.join(' / '));
  });
  t('下書きの読み取り：OK/NG と列', () => {
    const rows = D.parse('# x\nOK evt-1|match||win|1-0|||https://a|a|q\nNG evt-2|match||win|1-0|||https://a|a|q\nevt-3|report||||||https://a|a|q');
    assert.deepStrictEqual(rows.map((r) => [r.decision, r.fields[0], r.fields.length]), [['OK', 'evt-1', 10], ['NG', 'evt-2', 10], ['', 'evt-3', 10]]);
  });

  let failed = 0;
  for (const x of tests) {
    try { await x.fn(); console.log(`  ok  ${x.name}`); } catch (err) { failed++; console.error(`  NG  ${x.name}\n      ${err.message}`); }
  }
  return { passed: tests.length - failed, total: tests.length };
}

const data = checkData();
console.log(`results.js: 確認済みの結果 ${data.count}件`);
data.errors.forEach((e) => console.error(`  エラー: ${e}`));
testDisplay().then((t) => {
  console.log(`表示関数のテスト: ${t.passed}/${t.total} 件成功`);
  if (data.errors.length || t.passed !== t.total) process.exit(1);
});
