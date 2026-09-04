import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICING_PATH = path.join(__dirname, 'pricing.json');
const USAGE_DIR = path.join(__dirname, '..', '..', 'logs', 'usage');

const pricing = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf-8'));

export const DEFAULT_MONTHLY_BUDGET_USD = 5;
export const DEFAULT_COST_CONFIRM_THRESHOLD_USD = 0.5;
export const DEFAULT_DAILY_MEETING_LIMIT = 5;
/** Constitution 8条: OpenAI月間利用上限。唯一の主要有料コンポーネントなので別枠で管理する。 */
export const DEFAULT_OPENAI_MONTHLY_BUDGET_USD = 3;
/** Constitution 8条: 1会議あたりのAPIコスト上限。超過したら会議を強制中断する。 */
export const DEFAULT_MAX_COST_PER_MEETING_USD = 1;

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usageFilePath(monthKey) {
  return path.join(USAGE_DIR, `${monthKey}.jsonl`);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function meetingStartsFilePath(date) {
  return path.join(USAGE_DIR, `meeting-starts-${dayKey(date)}.jsonl`);
}

/**
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} 推定コスト(USD)
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const rate = pricing[model];
  if (!rate) {
    // eslint-disable-next-line no-console
    console.warn(`[cost] pricing.json に "${model}" の単価がありません。0円として集計します(要確認)。`);
    return 0;
  }
  return (inputTokens / 1000) * rate.inputPer1k + (outputTokens / 1000) * rate.outputPer1k;
}

export class CostTracker {
  constructor({
    monthlyBudgetUsd = Number(process.env.MONTHLY_BUDGET_USD) || DEFAULT_MONTHLY_BUDGET_USD,
    dailyMeetingLimit = Number(process.env.DAILY_MEETING_LIMIT) || DEFAULT_DAILY_MEETING_LIMIT,
    openaiMonthlyBudgetUsd = Number(process.env.OPENAI_MONTHLY_BUDGET_USD) || DEFAULT_OPENAI_MONTHLY_BUDGET_USD,
    maxCostPerMeetingUsd = Number(process.env.MAX_COST_PER_MEETING_USD) || DEFAULT_MAX_COST_PER_MEETING_USD,
  } = {}) {
    this.monthlyBudgetUsd = monthlyBudgetUsd;
    this.dailyMeetingLimit = dailyMeetingLimit;
    this.openaiMonthlyBudgetUsd = openaiMonthlyBudgetUsd;
    this.maxCostPerMeetingUsd = maxCostPerMeetingUsd;
    fs.mkdirSync(USAGE_DIR, { recursive: true });
  }

  /** 当月、providerが'openai'の呼び出しだけの累計コスト(USD)。Constitution 8条の別枠予算用。 */
  getOpenAIMonthlyTotalUsd(date = new Date()) {
    const filePath = usageFilePath(currentMonthKey(date));
    if (!fs.existsSync(filePath)) return 0;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    return lines.reduce((sum, line) => {
      try {
        const entry = JSON.parse(line);
        return entry.provider === 'openai' ? sum + (entry.costUsd ?? 0) : sum;
      } catch {
        return sum;
      }
    }, 0);
  }

  /** 1会議あたりのコストが上限を超えていないか。超えていたら会議を強制中断する判断材料。 */
  exceedsMeetingCap(meetingCostUsdSoFar) {
    return meetingCostUsdSoFar > this.maxCostPerMeetingUsd;
  }

  getDailyMeetingCount(date = new Date()) {
    const filePath = meetingStartsFilePath(date);
    if (!fs.existsSync(filePath)) return 0;
    return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).length;
  }

  /** 会議開始を1件記録する。/meeting start の冒頭、実際にAPI呼び出しを始める前に呼ぶこと。 */
  recordMeetingStart(meetingId, date = new Date()) {
    fs.appendFileSync(meetingStartsFilePath(date), `${JSON.stringify({ meetingId, timestamp: new Date().toISOString() })}\n`);
  }

  /** 当月の累計コスト(USD)を usage ログから再集計する。 */
  getMonthlyTotalUsd(date = new Date()) {
    const filePath = usageFilePath(currentMonthKey(date));
    if (!fs.existsSync(filePath)) return 0;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    return lines.reduce((sum, line) => {
      try {
        return sum + (JSON.parse(line).costUsd ?? 0);
      } catch {
        return sum;
      }
    }, 0);
  }

  /** 新規会議を開始してよいか(月間予算・OpenAI別枠予算・1日の回数上限)を確認する。 */
  canStartNewMeeting() {
    const monthlyTotalUsd = this.getMonthlyTotalUsd();
    const openaiMonthlyTotalUsd = this.getOpenAIMonthlyTotalUsd();
    const dailyCount = this.getDailyMeetingCount();
    const budgetOk = monthlyTotalUsd < this.monthlyBudgetUsd;
    const openaiBudgetOk = openaiMonthlyTotalUsd < this.openaiMonthlyBudgetUsd;
    const dailyLimitOk = dailyCount < this.dailyMeetingLimit;
    const reason = !budgetOk
      ? 'monthly_budget_exceeded'
      : !openaiBudgetOk
        ? 'openai_monthly_budget_exceeded'
        : !dailyLimitOk
          ? 'daily_limit_exceeded'
          : null;
    return {
      allowed: budgetOk && openaiBudgetOk && dailyLimitOk,
      reason,
      monthlyTotalUsd,
      monthlyBudgetUsd: this.monthlyBudgetUsd,
      openaiMonthlyTotalUsd,
      openaiMonthlyBudgetUsd: this.openaiMonthlyBudgetUsd,
      dailyCount,
      dailyMeetingLimit: this.dailyMeetingLimit,
    };
  }

  /**
   * 1回のAPI呼び出しの使用量を記録し、USD換算コストを返す。
   * @param {{meetingId: string, role: string, provider: string, model: string, phase: string, inputTokens: number, outputTokens: number}} record
   */
  recordUsage(record) {
    const costUsd = estimateCost(record.model, record.inputTokens, record.outputTokens);
    const entry = { ...record, costUsd, timestamp: new Date().toISOString() };
    const filePath = usageFilePath(currentMonthKey());
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
    return costUsd;
  }

  /** meetingId に紐づく行だけを usage ログ(当月分)から集計する。 */
  getMeetingCostUsd(meetingId, date = new Date()) {
    const filePath = usageFilePath(currentMonthKey(date));
    if (!fs.existsSync(filePath)) return 0;
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    return lines.reduce((sum, line) => {
      try {
        const entry = JSON.parse(line);
        return entry.meetingId === meetingId ? sum + (entry.costUsd ?? 0) : sum;
      } catch {
        return sum;
      }
    }, 0);
  }
}

/**
 * 会議開始前の概算コスト。Round0(triage)で実際に招集される役職は事前には
 * わからないため、「全役職が参加した場合」を仮定した保守的な(やや高めの)
 * 見積りにする。正確な事前見積りは不可能なので、あくまで確認ダイアログを
 * 出すか否かの目安として使う。
 * @param {object[]} roles roles.config.js の ROLES(全役職)
 */
export function estimateMeetingCostUsd(roles) {
  const ASSUMED_INPUT_TOKENS = 600;
  const ASSUMED_OUTPUT_TOKENS = 350;
  // category別の想定呼び出し回数(Revisionが発生する前提でやや多めに見積る)
  const CALLS_BY_CATEGORY = {
    decision_maker: 2, // triage + decision
    fixed: 3, // opening + revision + (CTOのみ)approvalCheck、Red Teamは1回だが安全側に3で見積る
    core: 2, // opening + revision
    specialist: 2, // opening + revision
  };
  let total = 0;
  for (const role of roles) {
    const calls = CALLS_BY_CATEGORY[role.category] ?? 2;
    total += calls * estimateCost(role.model, ASSUMED_INPUT_TOKENS, ASSUMED_OUTPUT_TOKENS);
  }
  return total;
}
