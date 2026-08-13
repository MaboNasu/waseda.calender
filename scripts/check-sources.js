#!/usr/bin/env node
/**
 * check-sources.js - sources.json に登録された各URLを取得し、前回チェック時からの
 * 変更を検知する（内容の意味は判断しない。機械的な差分検知のみ）。
 *
 * 実行方法: node scripts/check-sources.js
 * 環境変数 GITHUB_STEP_SUMMARY があれば、そこにも結果を追記する（GitHub Actions用）。
 *
 * やること:
 *   1. 各URLを取得し、HTMLからscript/style/コメントを除いたテキストを正規化
 *   2. 正規化テキストのSHA-256ハッシュ(contentHash)を計算 → 前回と比較
 *   3. テキスト中の日付らしき文字列だけを抽出し、そのハッシュ(dateTokensHash)も比較
 *      → 日付トークンが変わっていれば「日程に関わる変更の可能性が高い」として優先度high、
 *        本文ハッシュだけ変わっていれば優先度low（広告・アクセスカウンタ等のノイズの可能性）
 *   4. sources.json の lastChecked / contentHash / dateTokensHash を更新して保存
 *   5. 変更があったソースの一覧をJSON標準出力・GITHUB_STEP_SUMMARYに出す
 *      （このスクリプト自身はevents.jsを書き換えない。中身の解釈・反映は別途人間+AIが行う）
 *
 * 既知の制限:
 *   - 単純なfetchなので、JavaScriptで動的にレンダリングされるページ（例: 一部の部活公式
 *     サイトの試合日程表）は正しく取得できない場合がある。sources.jsonの該当エントリには
 *     "jsRendered": true を付けているので、それらは差分検知の精度が低い前提で運用すること。
 *   - 過検知（ノイズ変更をhighと誤判定）・見逃し（実質的な変更をlowに分類）は起こりうる。
 *     あくまで「確認すべきURLを絞り込む」ための一次フィルタであり、最終判断は人間+AIが行う。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(__dirname, 'sources.json');
const FETCH_TIMEOUT_MS = 20000;
const FETCH_MAX_BYTES = 3 * 1024 * 1024; // 3MB。巨大なページは打ち切る

/** HTMLからscript/style/コメントを除去し、タグを剥がしてテキストだけにする（簡易実装） */
function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** テキスト中の日付らしき文字列を抽出する（和暦・西暦・月日のみ表記を広めに拾う） */
function extractDateTokens(text) {
  const patterns = [
    /令和\d{1,2}年\s*\d{1,2}月\s*\d{1,2}日/g,
    /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/g,
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}/g,
    /\d{1,2}月\s*\d{1,2}日/g
  ];
  const tokens = new Set();
  patterns.forEach((re) => {
    const matches = text.match(re) || [];
    matches.forEach((m) => tokens.add(m.replace(/\s+/g, '')));
  });
  return Array.from(tokens).sort();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WasedaCalendarSourceWatcher/1.0)' }
    });
    const status = res.status;
    if (!res.ok) return { ok: false, status, text: '' };
    const reader = res.body ? res.body.getReader() : null;
    if (!reader) {
      const text = await res.text();
      return { ok: true, status, text: text.slice(0, FETCH_MAX_BYTES) };
    }
    let received = 0;
    let chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      if (received > FETCH_MAX_BYTES) break;
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { ok: true, status, text: buf.toString('utf8').slice(0, FETCH_MAX_BYTES) };
  } catch (err) {
    return { ok: false, status: null, error: err.message, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

async function checkSource(source) {
  const result = await fetchWithTimeout(source.url);
  const now = new Date().toISOString();

  if (!result.ok) {
    return {
      ...source,
      lastChecked: now,
      lastError: result.error || `HTTP ${result.status}`,
      changeStatus: 'error'
    };
  }

  const text = extractText(result.text);
  const contentHash = sha256(text);
  const dateTokens = extractDateTokens(text);
  const dateTokensHash = sha256(dateTokens.join('|'));

  let changeStatus = 'unchanged';
  if (source.contentHash === null) {
    changeStatus = 'first-check';
  } else if (source.dateTokensHash !== dateTokensHash) {
    changeStatus = 'changed-dates';
  } else if (source.contentHash !== contentHash) {
    changeStatus = 'changed-other';
  }

  return {
    ...source,
    lastChecked: now,
    lastError: null,
    contentHash,
    dateTokensHash,
    changeStatus
  };
}

async function main() {
  const raw = fs.readFileSync(SOURCES_PATH, 'utf8');
  const data = JSON.parse(raw);

  const results = [];
  // 対象サイトへの負荷・レート制限回避のため、直列で1件ずつ実行する
  for (const source of data.sources) {
    process.stderr.write(`checking: ${source.id} ... `);
    const result = await checkSource(source);
    process.stderr.write(`${result.changeStatus}\n`);
    results.push(result);
  }

  data.sources = results.map(({ changeStatus, lastError, ...rest }) => rest);
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

  const changed = results.filter((r) => r.changeStatus === 'changed-dates' || r.changeStatus === 'changed-other');
  const errors = results.filter((r) => r.changeStatus === 'error');
  const firstChecks = results.filter((r) => r.changeStatus === 'first-check');

  const summaryLines = [];
  summaryLines.push(`# ソース変更チェック結果 (${new Date().toISOString()})`);
  summaryLines.push('');
  summaryLines.push(`- 総数: ${results.length}`);
  summaryLines.push(`- 日程が変わった可能性が高い: ${changed.filter(r => r.changeStatus === 'changed-dates').length}`);
  summaryLines.push(`- その他の変更（ノイズの可能性）: ${changed.filter(r => r.changeStatus === 'changed-other').length}`);
  summaryLines.push(`- 初回チェック（比較対象なし）: ${firstChecks.length}`);
  summaryLines.push(`- 取得エラー: ${errors.length}`);
  summaryLines.push('');

  if (changed.some(r => r.changeStatus === 'changed-dates')) {
    summaryLines.push('## 日程が変わった可能性が高いソース');
    changed.filter(r => r.changeStatus === 'changed-dates').forEach((r) => {
      summaryLines.push(`- [${r.name}](${r.url}) (id: \`${r.id}\`)`);
    });
    summaryLines.push('');
  }
  if (changed.some(r => r.changeStatus === 'changed-other')) {
    summaryLines.push('## その他の変更があったソース（要確認・ノイズの可能性あり）');
    changed.filter(r => r.changeStatus === 'changed-other').forEach((r) => {
      summaryLines.push(`- [${r.name}](${r.url}) (id: \`${r.id}\`)`);
    });
    summaryLines.push('');
  }
  if (errors.length) {
    summaryLines.push('## 取得エラー');
    errors.forEach((r) => {
      summaryLines.push(`- [${r.name}](${r.url}) (id: \`${r.id}\`) — ${r.lastError}`);
    });
    summaryLines.push('');
  }

  const summary = summaryLines.join('\n');
  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n', 'utf8');
  }

  // GitHub Actions側でIssue作成の要否を判断できるよう、変更有無をファイルで渡す
  const hasChanges = changed.length > 0;
  fs.writeFileSync(
    path.join(__dirname, 'last-check-summary.md'),
    summary,
    'utf8'
  );
  fs.writeFileSync(
    path.join(__dirname, 'last-check-result.json'),
    JSON.stringify({ hasChanges, changedCount: changed.length, errorCount: errors.length }, null, 2),
    'utf8'
  );

  // 「どのソースを詳細分析すべきか」の判断材料（.claude/skills/source-check が読む）。
  // 変更が検知されたものに加えて、初回チェック（比較対象がまだ無い、例: 追加したばかりの
  // Instagramアカウント）も含める。changeStatusはsources.json本体には保存しない
  // （意味づけを含む一時的な判定結果のため）が、このファイルには残す。
  fs.writeFileSync(
    path.join(__dirname, 'last-check-changed.json'),
    JSON.stringify(
      changed.concat(firstChecks).map(({ id, name, category, url, notes, jsRendered, changeStatus }) =>
        ({ id, name, category, url, notes: notes || '', jsRendered: !!jsRendered, changeStatus })),
      null, 2
    ),
    'utf8'
  );

  process.exitCode = 0;
}

main().catch((err) => {
  console.error('check-sources.js failed:', err);
  process.exitCode = 1;
});
