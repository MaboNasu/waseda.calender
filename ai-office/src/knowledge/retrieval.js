import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchDecisions } from '../storage/decisionLogRenderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');
const EXPERIMENTS_INDEX_PATH = path.join(__dirname, '..', '..', 'logs', 'experiments', '_index.json');

/** この日数を超えて更新されていないファイルには、会議中に鮮度警告を付ける(Constitution/設計案6番)。 */
const FRESHNESS_THRESHOLD_DAYS = Number(process.env.KNOWLEDGE_STALE_DAYS) || 90;

/** 全役職が常に読む、短い現況ブリーフィング。 */
const UNIVERSAL_ALWAYS_FILES = ['current-state.md'];

/** 役職ごとに常に読むファイル(議題に関わらず)。 */
const ALWAYS_FILES = {
  ceo: ['service.md', 'constraints.md'],
  cto: ['technology.md', 'constraints.md'],
  product: ['product.md', 'users.md'],
  growth: ['growth.md', 'metrics.json'],
  ux_ui: ['product.md', 'users.md'],
  red_team: [],
  cfo: ['constraints.md'],
  legal: ['constraints.md'],
};

/** 役職ごとに、議題テキストがキーワードに一致した場合だけ追加で読むファイル。 */
const CONDITIONAL_FILES = {
  ceo: [],
  cto: [{ file: 'product.md', keywords: ['機能', 'ui', 'ux', '画面', '実装'] }],
  product: [
    { file: 'event-supply.json', keywords: ['イベント', '件数', '供給', '掲載', 'カテゴリ'] },
    { file: 'metrics.json', keywords: ['指標', 'kpi', 'pv', 'アクセス', '数値', '計測'] },
  ],
  growth: [
    { file: 'event-supply.json', keywords: ['イベント', '件数', '供給'] },
    { file: 'users.md', keywords: ['ユーザー', '利用者', '属性', 'リピート'] },
  ],
  ux_ui: [{ file: 'technology.md', keywords: ['モバイル', 'スマホ', '技術', 'ブラウザ', 'レイアウト'] }],
  red_team: [],
  cfo: [{ file: 'growth.md', keywords: ['広告', '施策', 'sns', 'seo', 'x投稿', 'instagram'] }],
  legal: [{ file: 'users.md', keywords: ['個人情報', 'プライバシー', 'ユーザー'] }],
};

function readFileSafe(fileName) {
  const filePath = path.join(KNOWLEDGE_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/** Markdownの `last_updated: YYYY-MM-DD` / JSONの `"last_updated": "YYYY-MM-DD"` の両方を拾う。 */
function extractLastUpdated(content) {
  const match = content.match(/"?last_updated"?:\s*"?(\d{4}-\d{2}-\d{2})"?/);
  return match ? match[1] : null;
}

function daysSince(dateStr) {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

function formatFile(fileName) {
  const content = readFileSafe(fileName);
  if (content === null) return null;

  const lastUpdated = extractLastUpdated(content);
  let staleNote = '';
  if (lastUpdated) {
    const age = daysSince(lastUpdated);
    if (age > FRESHNESS_THRESHOLD_DAYS) {
      staleNote = `\n(⚠️ この情報は${age}日前の更新です。古くなっている可能性があるため、断定せず「要再確認」と述べてください)`;
    }
  }
  return `### knowledge/${fileName}${staleNote}\n${content}`;
}

function scanKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function bigrams(str) {
  const s = str.replace(/\s+/g, '');
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i += 1) grams.add(s.slice(i, i + 2));
  return grams;
}

function diceSimilarity(a, b) {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const gram of setA) if (setB.has(gram)) overlap += 1;
  return (2 * overlap) / (setA.size + setB.size);
}

function searchExperiments(topic, { limit = 3, threshold = 0.15 } = {}) {
  if (!fs.existsSync(EXPERIMENTS_INDEX_PATH)) return [];
  let index;
  try {
    index = JSON.parse(fs.readFileSync(EXPERIMENTS_INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }
  const experiments = Array.isArray(index) ? index : (index.experiments ?? []);
  return experiments
    .map((entry) => ({ ...entry, similarity: diceSimilarity(topic, entry.topic ?? entry.hypothesis ?? '') }))
    .filter((entry) => entry.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * 議題・役職に応じて、その役職に渡すKnowledge Baseのbriefingテキストを組み立てる。
 * ベクトルDB/RAGは使わず、ファイル単位のキーワード一致(常時/条件付き)+
 * 過去のDecision Log/Experiment Logの文字bigram類似度検索のみで構成する
 * (承認済み設計案「V1でRAGは不要」の方針に従う)。追加のLLM呼び出しは発生しない。
 *
 * @param {string} roleId roles.config.js の role.id
 * @param {string} topic 議題テキスト
 * @returns {string} 該当情報がなければ空文字(その場合、呼び出し側はbriefingを付加しない)
 */
export function getRoleBriefing(roleId, topic) {
  const always = [...UNIVERSAL_ALWAYS_FILES, ...(ALWAYS_FILES[roleId] ?? [])];
  const conditional = (CONDITIONAL_FILES[roleId] ?? [])
    .filter(({ keywords }) => scanKeywords(topic, keywords))
    .map(({ file }) => file);

  const fileNames = [...new Set([...always, ...conditional])];
  const sections = fileNames.map(formatFile).filter(Boolean);

  const relatedDecisions = searchDecisions(topic);
  const decisionsSection = relatedDecisions.length
    ? `### 関連する過去の決定(Decision Log)\n${relatedDecisions
        .map((d) => `- [${d.date}] 「${d.topic}」→ ${d.decision ?? '不明'}(類似度${Math.round(d.similarity * 100)}%、詳細: ${d.filePath}参照)`)
        .join('\n')}`
    : '';

  const relatedExperiments = searchExperiments(topic);
  const experimentsSection = relatedExperiments.length
    ? `### 関連する過去の実験(Experiment Log)\n${relatedExperiments
        .map((e) => `- [${e.startedAt ?? '日付不明'}] ${e.hypothesis ?? e.topic ?? '(内容不明)'} → 結果: ${e.result ?? '未計測'}`)
        .join('\n')}`
    : '';

  const parts = [...sections, decisionsSection, experimentsSection].filter(Boolean);
  if (parts.length === 0) return '';

  return `【Knowledge Base(参考情報)】
以下はWaseda Calendarに関する社内Knowledge Baseからの抜粋です。FACT/POLICY/ASSUMPTION/
OWNER_REPORTED/UNKNOWN等の分類が付いています。分類を無視して断定的に扱わないこと。
情報が無い・不足している場合は、一般論で埋めずに「Knowledge Baseに情報がないため
判断できない」「○○のデータが必要」と述べること。

${parts.join('\n\n')}`;
}
