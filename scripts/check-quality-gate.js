#!/usr/bin/env node
/**
 * scripts/check-quality-gate.js — 品質検査スクリプト自体のテスト（CIで実行）
 *
 * verify-event-sources.js の照合ルールと、events.js の部分書き換え（setEventField）を、
 * ネットワークを使わずに固定の文字列で確かめる。実際に起きた誤り（2026-11-14 のオール早慶戦・
 * 小野記念講堂の誤判定）を回帰テストとして入れてある。
 */
'use strict';

const assert = require('assert');
const { normalizeForMatch, setEventField, loadEvents, loadOrganizations, loadDictionary } = require('./lib/event-data');
const V = require('./verify-event-sources');
const { run: runDataCheck } = require('./check-event-data');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const SOUKEI_SOURCE = normalizeForMatch(`
  オール早慶戦 in 甲子園 2026年11月28日（土）、阪神甲子園球場（兵庫県西宮市）にて特別試合を開催します。
  13:00プレイボール。チケット S席：5,000円 A席：4,000円 B席 おとな 2,500円 こども（4歳～中学生） 1,000円
  主催：早稲田大学野球部・慶應義塾体育会野球部
`);

test('オール早慶戦：日程表の略記から作ったタイトルは止まる', () => {
  const r = V.titleCheck('オール早慶戦 in甲子園 vs全慶應義塾大学', SOUKEI_SOURCE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /全慶應義塾大学/);
});

test('オール早慶戦：公式の名称なら通る', () => {
  assert.strictEqual(V.titleCheck('オール早慶戦 in 甲子園', SOUKEI_SOURCE).ok, true);
});

test('試合の表記は相手の名前が出典にあれば通る', () => {
  const text = normalizeForMatch('11月3日(月) 13:00 vs 慶應義塾大学 アミノバイタルフィールド');
  assert.strictEqual(V.titleCheck('米式蹴球部(BIG BEARS) vs慶應義塾大学', text).ok, true);
});

test('タイトル末尾の「(1日目)」は整形として許す', () => {
  const text = normalizeForMatch('ワークショップ「漢字漢文文化圏の外交術とグローバル秩序（Global Order）」 11月21日（土）');
  assert.strictEqual(V.titleCheck('ワークショップ「漢字漢文文化圏の外交術とグローバル秩序(Global Order)」(1日目)', text).ok, true);
});

test('翻訳したタイトルは止まる', () => {
  const text = normalizeForMatch('SILS ART PROJECT 2026. Sophocles\'s Antigone  October 30');
  assert.strictEqual(V.titleCheck('SILSアートプロジェクト2026 ソフォクレス『アンティゴネ』', text).ok, false);
});

test('日付：複数の書き方を認め、桁の違う数字には一致しない', () => {
  assert.ok(V.containsDate(SOUKEI_SOURCE, '2026-11-28'));
  assert.ok(V.containsDate(normalizeForMatch('開催日 11/28(土)'), '2026-11-28'));
  assert.ok(!V.containsDate(normalizeForMatch('受付番号 11/280'), '2026-11-28'));
  assert.ok(!V.containsDate(normalizeForMatch('2026年11月29日'), '2026-11-28'));
});

test('時刻：開始時刻の書き方を認め、別の時刻には一致しない', () => {
  assert.ok(V.containsTime(SOUKEI_SOURCE, '13:00'));
  assert.ok(V.containsTime(normalizeForMatch('午後1時開始'), '13:00'));
  assert.ok(V.containsTime(normalizeForMatch('18時30分開演'), '18:30'));
  assert.ok(!V.containsTime(normalizeForMatch('13時30分開始'), '13:00'));
  assert.ok(!V.containsTime(normalizeForMatch('開場 13:00 開演 13:30'), '3:00'));
});

test('会場：辞書の別名で確認でき、出典にない会場は止まる', () => {
  const dict = loadDictionary();
  const text = normalizeForMatch('会場：早稲田大学 小野記念講堂');
  assert.strictEqual(V.venueCheck('小野記念講堂（27号館 地下2階）', text, dict).ok, true);
  assert.strictEqual(V.venueCheck('大隈記念講堂 大講堂', text, dict).ok, false);
});

test('辞書：誤った会場名「小野梓記念講堂」は禁止語、正式名称は「小野記念講堂」', () => {
  const ono = loadDictionary().venues.find((v) => v.id === 'ono-auditorium');
  assert.strictEqual(ono.name, '小野記念講堂');
  assert.ok(ono.forbidden.includes('小野梓記念講堂'));
});

test('料金：金額が出典にない有料表記は止まる', () => {
  assert.strictEqual(V.feeCheck({ feeType: 'paid', feeText: 'S席5,000円／A席4,000円' }, SOUKEI_SOURCE).ok, true);
  assert.strictEqual(V.feeCheck({ feeType: 'paid', feeText: '一般3,000円' }, SOUKEI_SOURCE).ok, false);
  assert.strictEqual(V.feeCheck({ feeType: 'free' }, SOUKEI_SOURCE).ok, false);
});

const ctx = () => ({
  dict: loadDictionary(),
  orgById: new Map(loadOrganizations().map((o) => [o.id, o])),
  evidence: {},
  cache: new Map(),
});

test('判定：Instagramが出典のときは根拠の引用で照合し、全項目そろえば A', async () => {
  const c = ctx();
  c.evidence['evt-test1'] = { url: 'https://www.instagram.com/p/TEST/', text: '第12回定期演奏会 12月5日(金) 18:30開演 早稲田小劇場どらま館 主催 テスト研究会 入場無料' };
  const r = await V.verifyEvent({ id: 'evt-test1', title: '第12回定期演奏会', date: '2026-12-05', startTime: '18:30', location: '早稲田小劇場どらま館', organizer: 'テスト研究会', feeType: 'free', externalUrl: 'https://www.instagram.com/p/TEST/' }, c);
  assert.strictEqual(r.gate, 'A', JSON.stringify(r));
});

test('判定：開始時刻がないだけなら B', async () => {
  const c = ctx();
  c.evidence['evt-test2'] = { text: '秋の展示会 12月6日(土) 主催 テスト研究会 会場 早稲田小劇場どらま館' };
  const r = await V.verifyEvent({ id: 'evt-test2', title: '秋の展示会', date: '2026-12-06', location: '早稲田小劇場どらま館', organizer: 'テスト研究会', feeType: 'unknown', externalUrl: 'https://www.instagram.com/p/T2/' }, c);
  assert.strictEqual(r.gate, 'B', JSON.stringify(r));
});

test('判定：出典と時刻が食い違えば C（Bにしない）', async () => {
  const c = ctx();
  c.evidence['evt-test3'] = { text: '秋の展示会 12月6日(土) 14:00開始 主催 テスト研究会 会場 早稲田小劇場どらま館' };
  const r = await V.verifyEvent({ id: 'evt-test3', title: '秋の展示会', date: '2026-12-06', startTime: '13:00', location: '早稲田小劇場どらま館', organizer: 'テスト研究会', externalUrl: 'https://www.instagram.com/p/T3/' }, c);
  assert.strictEqual(r.gate, 'C');
});

test('判定：中止の記載があれば C', async () => {
  const c = ctx();
  c.evidence['evt-test4'] = { text: '秋の展示会 12月6日(土) 14:00開始 早稲田小劇場どらま館 主催 テスト研究会 ※荒天のため中止となりました' };
  const r = await V.verifyEvent({ id: 'evt-test4', title: '秋の展示会', date: '2026-12-06', startTime: '14:00', location: '早稲田小劇場どらま館', organizer: 'テスト研究会', externalUrl: 'https://www.instagram.com/p/T4/' }, c);
  assert.strictEqual(r.gate, 'C');
});

test('判定：出典を読めず根拠もなければ C', async () => {
  const r = await V.verifyEvent({ id: 'evt-test5', title: 'X', date: '2026-12-06', organizer: 'テスト研究会', externalUrl: 'https://www.instagram.com/p/T5/' }, ctx());
  assert.strictEqual(r.gate, 'C');
});


test('大会名(自分の部)の表記は、括弧の前の大会名が出典にあれば通る', () => {
  const text = normalizeForMatch('第75回 早慶戦 11月21日 講道館');
  assert.strictEqual(V.titleCheck('早慶戦(柔道部)', text, { organizer: '早稲田大学柔道部' }).ok, true);
});

test('種別を前に付けた題名は、かぎ括弧の中が出典にあれば通る', () => {
  const text = normalizeForMatch('星泉氏 講演会 チベット文学との出会い 11月20日');
  assert.strictEqual(V.titleCheck('星泉氏講演会「チベット文学との出会い」', text).ok, true);
});

test('主催：「早稲田大学」の有無と括弧の中の正式名を認め、複数主催は全員を確かめる', () => {
  const dict = loadDictionary();
  const orgs = new Map();
  const wavoc = normalizeForMatch('主催：平山郁夫記念ボランティアセンター（WAVOC）');
  assert.strictEqual(V.organizerCheck({ organizer: '早稲田大学WAVOC(平山郁夫記念ボランティアセンター)' }, wavoc, [], orgs, dict).ok, true);
  const onlyWaseda = normalizeForMatch('主催：早稲田大学野球部');
  assert.strictEqual(V.organizerCheck({ organizer: '早稲田大学野球部・慶應義塾体育会野球部' }, onlyWaseda, [], orgs, dict).ok, false);
  assert.strictEqual(V.organizerCheck({ organizer: '早稲田大学野球部・慶應義塾体育会野球部' }, SOUKEI_SOURCE, [], orgs, dict).ok, true);
});

test('「雨天中止」は中止の告知として扱わない', async () => {
  const c = ctx();
  c.evidence['evt-test6'] = { text: '秋の清掃 12月6日(土) 9:00集合 早稲田小劇場どらま館 主催 テスト研究会 ※雨天中止の場合は前日に連絡します' };
  const r = await V.verifyEvent({ id: 'evt-test6', title: '秋の清掃', date: '2026-12-06', startTime: '09:00', location: '早稲田小劇場どらま館', organizer: 'テスト研究会', externalUrl: 'https://www.instagram.com/p/T6/' }, c);
  assert.strictEqual(r.gate, 'A', JSON.stringify(r.problems));
});

test('events.js の部分書き換え：他の項目と書式を変えない', () => {
  const src = [
    'const EVENTS = [',
    '  {',
    '    id: "evt-001",',
    '    title: "A {括弧} \\"引用\\"",',
    '    feeText: "料金不明",',
    '    lastUpdated: "2026-01-01",',
    '    isPublished: true',
    '  },',
    '  {',
    '    id: "evt-002",',
    '    title: "B",',
    '    isPublished: true',
    '  }',
    '];',
  ].join('\n');
  let out = setEventField(src, 'evt-001', 'feeText', '料金未確認');
  out = setEventField(out, 'evt-001', 'reviewStatus', 'pending');
  out = setEventField(out, 'evt-002', 'isPublished', false);
  out = setEventField(out, 'evt-002', 'sourceUrls', ['https://a.example/', 'https://b.example/']);
  const evs = loadEvents(out);
  assert.strictEqual(evs[0].feeText, '料金未確認');
  assert.strictEqual(evs[0].title, 'A {括弧} "引用"');
  assert.strictEqual(evs[0].reviewStatus, 'pending');
  assert.strictEqual(evs[1].isPublished, false);
  assert.strictEqual(JSON.stringify(evs[1].sourceUrls), JSON.stringify(['https://a.example/', 'https://b.example/']));
  assert.ok(out.includes('sourceUrls: ["https://a.example/", "https://b.example/"],'));
});

test('現在の events.js にエラーがない', () => {
  const { issues } = runDataCheck();
  const errors = issues.filter((i) => i.level === 'error');
  assert.strictEqual(errors.length, 0, errors.map((e) => `${e.id} ${e.message}`).join('\n'));
});

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      console.error(`  NG  ${t.name}\n      ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} 件成功`);
})();
