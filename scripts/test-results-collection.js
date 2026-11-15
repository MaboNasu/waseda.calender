#!/usr/bin/env node
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const q = require('./results-collection-queue');
const d = require('./check-result-drafts');

const event = (id, props = {}) => ({
  id, title: 'テスト試合', date: '2026-11-11', category: 'sports',
  organizer: 'テスト部', isPublished: true, ...props
});
const opts = { asOf: '2026-11-14', limit: 8, includeReports: false, backfill: false };
const state = { version: 1, events: {} };

test('Japanese-calendar dates and day differences', () => {
  assert.equal(q.validDate('2026-11-14'), true);
  assert.equal(q.validDate('2026-02-29'), false);
  assert.equal(q.validDate('2028-02-29'), true);
  assert.equal(q.validDate('2026-13-01'), false);
  assert.equal(q.dayDiff('2026-11-14', '2026-11-11'), 3);
});

test('only published, ended, non-merged, missing results are queued', () => {
  const events = [
    event('evt-1'), event('evt-2', { isPublished: false }),
    event('evt-3', { date: '2026-11-15' }),
    event('evt-4', { mergedInto: 'evt-1' }),
    event('evt-5'), event('evt-6', { category: 'lecture' })
  ];
  const items = q.queue(events, { 'evt-5': { kind: 'match' } }, state, opts);
  assert.deepEqual(items.map((x) => x.id), ['evt-1']);
});

test('endDate controls whether a multi-day event has finished', () => {
  assert.equal(q.queue([event('evt-7', { endDate: '2026-11-15' })], {}, state, opts).length, 0);
  assert.equal(q.queue([event('evt-7', { endDate: '2026-11-13' })], {}, state, opts)[0].daysSinceEnd, 1);
});

test('sports can be match or report; performing arts require --include-reports', () => {
  const events = [event('evt-1'), event('evt-2', { category: 'music' }), event('evt-3', { category: 'other' })];
  assert.deepEqual(q.queue(events, {}, state, opts).map((x) => x.kindHint), ['match_or_report']);
  assert.deepEqual(q.queue(events, {}, state, { ...opts, includeReports: true }).map((x) => x.id), ['evt-1', 'evt-2']);
});

test('conflicts and completed states never get auto-queued', () => {
  const st = { version: 1, events: {
    'evt-1': { status: 'conflict', checkedAt: '2026-11-12' },
    'evt-2': { status: 'approved', checkedAt: '2026-11-12' },
    'evt-3': { status: 'not_applicable', checkedAt: '2026-11-12' }
  } };
  assert.equal(q.queue([event('evt-1'), event('evt-2'), event('evt-3')], {}, st, opts).length, 0);
});

test('not_found is rescheduled at milestones, not on every run', () => {
  const st = { version: 1, events: { 'evt-1': { status: 'not_found', checkedAt: '2026-11-13' } } };
  const events = [event('evt-1', { date: '2026-11-11' })];
  assert.equal(q.queue(events, {}, st, { ...opts, asOf: '2026-11-13' }).length, 0);
  assert.equal(q.queue(events, {}, st, { ...opts, asOf: '2026-11-14' }).length, 1);
});

test('backfill is opt-in and sorts recent events first', () => {
  const items = [event('evt-1', { date: '2026-08-01' }), event('evt-2', { date: '2026-09-20' })];
  assert.equal(q.queue(items, {}, state, opts).length, 0);
  assert.deepEqual(q.queue(items, {}, state, { ...opts, backfill: true }).map((x) => x.id), ['evt-2', 'evt-1']);
});

test('duplicate event IDs raise an error rather than creating ambiguous queue', () => {
  assert.throws(() => q.queue([event('evt-1'), event('evt-1')], {}, state, opts), /Duplicate/);
});

test('state updates are persisted locally and can be read again', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-results-'));
  try {
    const file = path.join(root, 'state.json');
    q.mark(file, { id: 'evt-123', status: 'not_found', checkedAt: '2026-11-14', note: '公式サイト未掲載' });
    assert.deepEqual(q.readState(file).events['evt-123'], {
      status: 'not_found', checkedAt: '2026-11-14', note: '公式サイト未掲載'
    });
    q.mark(file, { id: 'evt-123', status: 'approved', checkedAt: '2026-11-15' });
    assert.equal(q.readState(file).events['evt-123'].status, 'approved');
    assert.equal(fs.existsSync(file + '.lock'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('only explicit OK rows are candidates for export', () => {
  const text = '# conflict evt-5\n' +
    'evt-1|match|男子|win|1-0|||概要|https://example.org|公式\n' +
    'OK evt-2|match|男子|win|1-0|||概要|https://example.org|公式\n';
  const rows = d.parseApproved(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fields[0], 'evt-2');
  assert.equal(rows[0].line, 3);
});

test('a valid approved match becomes review-only JSON with source and date', () => {
  const rows = d.parseApproved('OK evt-2|match|男子|win|1-0|前半0-0||得点して勝利した。|https://example.org/result|公式記録');
  const result = d.validate(rows, [event('evt-2')], '2026-11-14');
  assert.deepEqual(result.errors, []);
  assert.equal(result.approved['evt-2'].confirmedAt, '2026-11-14');
  assert.equal(result.approved['evt-2'].sources[0].url, 'https://example.org/result');
});

test('drawn regulation score with PK winner is flagged for manual review, not rejected as ordinary win', () => {
  const rows = d.parseApproved('OK evt-2|match|男子|win|0-0|PK戦4-3で勝利||PK戦で勝利した。|https://example.org/result|公式');
  const result = d.validate(rows, [event('evt-2')], '2026-11-14');
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
});

test('invalid source, mismatch, duplicate, future event and malformed columns are rejected', () => {
  const rows = d.parseApproved([
    'OK evt-2|match|男子|win|0-2|||負けた。|javascript:evil()|不明',
    'OK evt-2|match|男子|win|1-0|||勝った。|https://example.org|公式',
    'OK evt-3|match|男子|win|1-0|||勝った。|https://example.org|公式',
    'OK evt-4|match|男子'
  ].join('\n'));
  const result = d.validate(rows, [event('evt-2'), event('evt-3', { date: '2026-11-17' })], '2026-11-14');
  assert.ok(result.errors.some((x) => /score\/outcome mismatch/.test(x)));
  assert.ok(result.errors.some((x) => /URL/.test(x)));
  assert.ok(result.errors.some((x) => /duplicate/.test(x)));
  assert.ok(result.errors.some((x) => /has not finished/.test(x)));
  assert.ok(result.errors.some((x) => /expected 10/.test(x)));
});

test('report requires empty match-specific outcome and score', () => {
  const ok = d.validate(d.parseApproved('OK evt-8|report|||||優勝|大会で優勝した。|https://example.org|大会公式'),
    [event('evt-8', { category: 'sports' })], '2026-11-14');
  assert.deepEqual(ok.errors, []);
  const bad = d.validate(d.parseApproved('OK evt-8|report||win|1-0||優勝|大会で優勝した。|https://example.org|大会公式'),
    [event('evt-8')], '2026-11-14');
  assert.equal(bad.errors.length, 2);
});

test('end-to-end queue CLI reads const EVENTS and const RESULTS without modifying them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-queue-cli-'));
  try {
    const events = path.join(root, 'events.js');
    const results = path.join(root, 'results.js');
    fs.writeFileSync(events, 'const EVENTS = ' + JSON.stringify([event('evt-1'), event('evt-2')]) + ';\n');
    fs.writeFileSync(results, 'const RESULTS = {"evt-2":{"kind":"match"}};\n');
    const p = spawnSync(process.execPath, [path.join(__dirname, 'results-collection-queue.js'),
      '--events', events, '--results', results, '--state', path.join(root, 'absent-state.json'),
      '--as-of', '2026-11-14', '--format', 'json'], { encoding: 'utf8' });
    assert.equal(p.status, 0, p.stderr);
    const data = JSON.parse(p.stdout);
    assert.deepEqual(data.candidates.map((x) => x.id), ['evt-1']);
    assert.equal(data.resultsFileAvailable, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
