#!/usr/bin/env node
/**
 * scripts/check-results.js — results.js の検査（CIで実行）
 *
 * 各結果について、イベントIDが events.js にあるか・公開中で終わっているか・出典URLがあるか・
 * kind / outcome / score の形と、スコアと勝敗の一致を確かめる。スコアと勝敗が一致しない試合は detail に理由（PK戦など）が必要。
 * 表示用の関数の動作も最低限確かめる。エラーがあれば終了コード1。
 */
'use strict';

const path = require('path');
const { loadEvents, todayJst } = require('./lib/event-data');
const R = require(path.join(__dirname, '..', 'results.js'));

const KINDS = new Set(['match', 'report']);
const OUTCOMES = new Set(['win', 'loss', 'draw']);
const SCORE_RE = /^(\d+)-(\d+)$/;
const today = todayJst();
const events = new Map(loadEvents().map((e) => [e.id, e]));
const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

function checkMatch(id, m, where) {
  if (!OUTCOMES.has(m.outcome)) return err(id, `${where}outcome は win / loss / draw のどれか（今は ${m.outcome}）`);
  if (m.score == null || m.score === '') return;
  const s = SCORE_RE.exec(String(m.score));
  if (!s) return err(id, `${where}score は「早稲田側-相手」の形（例 1-0）にする（今は ${m.score}）`);
  const a = Number(s[1]), b = Number(s[2]);
  const implied = a > b ? 'win' : a < b ? 'loss' : 'draw';
  if (implied !== m.outcome && !m.detail) err(id, `${where}スコア ${m.score} と勝敗 ${m.outcome} が一致しない。PK戦などの理由を detail に書く`);
}

for (const [id, r] of Object.entries(R.RESULTS)) {
  const ev = events.get(id);
  if (!ev) { err(id, 'events.js にないイベントID'); continue; }
  if (ev.isPublished === false) err(id, '非公開のイベント');
  if ((ev.endDate || ev.date) >= today) err(id, `まだ終わっていないイベント（${ev.endDate || ev.date}）`);
  if (!KINDS.has(r.kind)) err(id, `kind は match / report（今は ${r.kind}）`);
  if (!Array.isArray(r.sources) || !r.sources.length || !r.sources.every((s) => /^https?:\/\//.test(s.url || ''))) err(id, '出典URL（sources[].url）がない');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.confirmedAt || '')) err(id, 'confirmedAt（確認日 YYYY-MM-DD）がない');
  if (r.kind === 'match') {
    if (Array.isArray(r.matches) && r.matches.length) r.matches.forEach((m, i) => checkMatch(id, m, `matches[${i}] の `));
    else checkMatch(id, r, '');
  } else if (r.kind === 'report') {
    if (r.outcome || r.score) err(id, 'report には outcome / score を書かない（記録は detail に）');
  }
  if (/[一-龠]{1,3}\s?[一-龠]{1,3}(選手|さん|君)/.test(r.summary || '')) err(id, 'summary に個人名らしき表記がある（選手個人の名前は書かない）');
}

// 表示用の関数の最低限の動作
const sampleId = Object.keys(R.RESULTS)[0];
if (sampleId) {
  const card = R.wcResultCardHTML(sampleId);
  if (!/wc-result-card/.test(card) || !/出典/.test(card)) errors.push('wcResultCardHTML が結果カードを返さない');
  if (R.wcResultCardHTML('evt-does-not-exist') !== '') errors.push('結果のないイベントで wcResultCardHTML が空でない');
}
if (R.wcFiscalYear('2027-02-01') !== 2026 || R.wcFiscalYear('2026-04-01') !== 2026) errors.push('wcFiscalYear の年度計算が誤り');

if (errors.length) {
  console.error(`results.js にエラーが ${errors.length} 件あります:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`results.js: ${Object.keys(R.RESULTS).length}件、エラーなし`);
