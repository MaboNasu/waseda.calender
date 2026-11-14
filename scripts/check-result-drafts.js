#!/usr/bin/env node
'use strict';
/**
 * Validate operator-approved rows from 結果下書き_YYYYMMDD.txt and optionally
 * export review-ready JSON. Never modifies results.js, publishes or calls APIs.
 *
 * node scripts/check-result-drafts.js PATH [--as-of YYYY-MM-DD] [--out PATH]
 *
 * Approved line: OK evt-123|kind|team|outcome|score|detail|award|summary|URL|source name
 * Unapproved lines and # comments are ignored.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validDate, dayDiff } = require('./results-collection-queue');

const ROOT = path.resolve(__dirname, '..');
const KINDS = new Set(['match', 'report']);
const OUTCOMES = new Set(['win', 'loss', 'draw']);
const SCORE_RE = /^(\d{1,3})\s*[-－–—]\s*(\d{1,3})$/;

function parseApproved(text) {
  const approved = [];
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const approvedMatch = trimmed.match(/^OK(?:\s+|\|)(.+)$/);
    if (!approvedMatch) continue; // Unapproved drafts are not exported.
    const fields = approvedMatch[1].split('|').map((x) => x.trim());
    approved.push({ line: index + 1, fields });
  }
  return approved;
}

function loadEvents(file = path.join(ROOT, 'events.js')) {
  const src = fs.readFileSync(file, 'utf8');
  // Trusted repository JS, not external source content.
  const json = vm.runInNewContext(src + '\n;JSON.stringify(EVENTS)', {}, { timeout: 5000, filename: file });
  const events = JSON.parse(json);
  if (!Array.isArray(events)) throw Error('Invalid EVENTS data');
  return events;
}

function validate(approved, events, asOf) {
  if (!validDate(asOf)) throw Error('Invalid --as-of');
  const byId = new Map(events.map((e) => [e.id, e]));
  const seen = new Set();
  const errors = [];
  const warnings = [];
  const output = {};
  for (const entry of approved) {
    const f = entry.fields;
    const line = entry.line;
    if (f.length !== 10) {
      errors.push('L' + line + ': expected 10 pipe-separated columns; received ' + f.length);
      continue;
    }
    const [id, kind, team, outcome, score, detail, award, summary, sourceUrl, sourceName] = f;
    const issue = (message) => errors.push('L' + line + ' ' + id + ': ' + message);
    if (!/^evt-[A-Za-z0-9-]+$/.test(id)) issue('invalid event ID');
    if (seen.has(id)) issue('duplicate approved event ID');
    seen.add(id);
    const event = byId.get(id);
    if (!event) issue('event ID not found in events.js');
    else {
      if (event.isPublished !== true || event.mergedInto) issue('event is not publicly active');
      const end = event.endDate || event.date;
      if (!validDate(end) || dayDiff(asOf, end) < 1) issue('event has not finished as of ' + asOf);
    }
    if (!KINDS.has(kind)) issue('kind must be match or report');
    if (kind === 'match' && !OUTCOMES.has(outcome)) issue('match outcome must be win/loss/draw');
    if (kind === 'report' && outcome) issue('report outcome must be empty');
    if (kind === 'report' && score) issue('report score must be empty (use detail for records)');
    if (kind === 'match' && score) {
      const m = score.match(SCORE_RE);
      if (!m) issue('score must be formatted as Waseda-first integer-integer (e.g. 1-0)');
      else {
        const left = Number(m[1]);
        const right = Number(m[2]);
        const implied = left > right ? 'win' : (left < right ? 'loss' : 'draw');
        if (implied !== outcome) {
          if (/PK|ペナルティ|延長|棄権|不戦|判定|合計|aggregate/i.test(detail)) {
            warnings.push('L' + line + ' ' + id + ': score/outcome differ; verify special rule in the original source and check-results.js');
          } else {
            issue('score/outcome mismatch without an explanation in detail');
          }
        }
      }
    }
    if (!summary) issue('summary is required');
    if (summary.length > 220) warnings.push('L' + line + ' ' + id + ': summary is long; confirm 1–2 factual sentences, not source text');
    if (/\r|\n/.test(summary)) issue('summary must be one physical line');
    let urlOk = false;
    try {
      const u = new URL(sourceUrl);
      urlOk = ['https:', 'http:'].includes(u.protocol) && !!u.hostname;
    } catch {}
    if (!urlOk) issue('a valid http(s) source URL is required');
    if (!sourceName) issue('source name is required');
    if (errors.some((x) => x.startsWith('L' + line + ' '))) continue;
    const result = {
      kind,
      ...(team ? { team } : {}),
      ...(kind === 'match' ? { outcome } : {}),
      ...(score ? { score: score.replace(/[－–—]/g, '-').replace(/\s+/g, '') } : {}),
      ...(detail ? { detail } : {}),
      ...(award ? { award } : {}),
      summary,
      sources: [{ url: sourceUrl, label: sourceName }],
      confirmedAt: asOf
    };
    output[id] = result;
  }
  return { count: approved.length, errors, warnings, approved: output };
}

function main(argv = process.argv.slice(2)) {
  const [file, ...rest] = argv;
  if (!file || file.startsWith('--')) throw Error('Usage: node scripts/check-result-drafts.js FILE [--as-of YYYY-MM-DD] [--out FILE]');
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    if (!['--as-of', '--out', '--events'].includes(rest[i]) || i + 1 >= rest.length) throw Error('Unknown/incomplete argument: ' + rest[i]);
    args[rest[i].slice(2)] = rest[++i];
  }
  const asOf = args['as-of'] || (() => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const get = (type) => parts.find((p) => p.type === type).value;
      return get('year') + '-' + get('month') + '-' + get('day');
    })();
  const rows = parseApproved(fs.readFileSync(path.resolve(file), 'utf8'));
  const result = validate(rows, loadEvents(path.resolve(args.events || path.join(ROOT, 'events.js'))), asOf);
  console.log('Approved rows: ' + result.count + ', errors: ' + result.errors.length + ', warnings: ' + result.warnings.length);
  for (const w of result.warnings) console.warn('WARNING: ' + w);
  for (const e of result.errors) console.error('ERROR: ' + e);
  if (result.count === 0) throw Error('No OK rows found; nothing to export.');
  if (result.errors.length) { process.exitCode = 1; return; }
  if (args.out) {
    const target = path.resolve(args.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(result.approved, null, 2) + '\n', { flag: 'wx' });
    console.log('Review-ready JSON (NOT published): ' + target);
  }
  console.log('Still required: human source review and node scripts/check-results.js before results.js publication.');
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { parseApproved, validate, loadEvents };
