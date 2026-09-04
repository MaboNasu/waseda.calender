import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from '../security/secretGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEETINGS_DIR = path.join(__dirname, '..', '..', 'logs', 'meetings');

fs.mkdirSync(MEETINGS_DIR, { recursive: true });

function filePathFor(meetingId) {
  return path.join(MEETINGS_DIR, `${meetingId}.json`);
}

/**
 * 会議の完全なトランスクリプト(スナップショット)を書き込む。
 * フェーズが進むたびに呼び出すことで、途中でプロセスが落ちても
 * 直前のフェーズまでの記録がディスクに残る。
 *
 * Constitution 13条・セキュリティガード適用箇所2: 保存前にJSON全体をテキスト化して
 * 秘密情報らしき文字列をredactする(ネストされたどのフィールドに紛れ込んでも捕捉できるよう、
 * オブジェクトではなくシリアライズ後の文字列に対して適用する)。
 * @param {string} meetingId
 * @param {object} transcript
 */
export function saveMeeting(meetingId, transcript) {
  const safeJson = redact(JSON.stringify(transcript, null, 2));
  fs.writeFileSync(filePathFor(meetingId), safeJson);
}

/** @param {string} meetingId */
export function loadMeeting(meetingId) {
  const filePath = filePathFor(meetingId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** threadId から最新の meetingId を引けるよう、スレッドID→会議IDの対応も残す。 */
const THREAD_INDEX_PATH = path.join(MEETINGS_DIR, '_thread-index.json');

function loadThreadIndex() {
  if (!fs.existsSync(THREAD_INDEX_PATH)) return {};
  return JSON.parse(fs.readFileSync(THREAD_INDEX_PATH, 'utf-8'));
}

export function linkThreadToMeeting(threadId, meetingId) {
  const index = loadThreadIndex();
  index[threadId] = meetingId;
  fs.writeFileSync(THREAD_INDEX_PATH, JSON.stringify(index, null, 2));
}

export function getMeetingIdForThread(threadId) {
  return loadThreadIndex()[threadId] ?? null;
}

function normalizeTopic(topic) {
  return topic.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * 重複会議防止(Constitutionの「会議を行う条件」)。直近の会議の中から、
 * ほぼ同一の議題文字列を持つ決定済み会議を探す。誤検知を避けるため、
 * 高精度な類似度計算は行わず「正規化してほぼ完全一致」レベルの緩い判定に留める。
 * @param {string} topic
 * @param {{limit?: number}} options
 * @returns {object|null} 見つかった場合はそのmeetingのtranscript、なければnull
 */
export function findRecentDecisionByTopic(topic, { limit = 50 } = {}) {
  const normalizedTarget = normalizeTopic(topic);
  if (!normalizedTarget) return null;

  const files = fs
    .readdirSync(MEETINGS_DIR)
    .filter((name) => name.startsWith('mtg_') && name.endsWith('.json'))
    .map((name) => path.join(MEETINGS_DIR, name));

  const candidates = files
    .map((filePath) => {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter((transcript) => transcript?.decision && transcript?.topic)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);

  return candidates.find((transcript) => normalizeTopic(transcript.topic) === normalizedTarget) ?? null;
}
