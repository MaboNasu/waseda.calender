import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * @param {string} meetingId
 * @param {object} transcript
 */
export function saveMeeting(meetingId, transcript) {
  fs.writeFileSync(filePathFor(meetingId), JSON.stringify(transcript, null, 2));
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
