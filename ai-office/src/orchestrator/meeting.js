import { randomUUID } from 'node:crypto';
import { getDecisionMaker, getDebaters } from '../roles/roles.config.js';
import { generate } from '../providers/index.js';
import { CostTracker } from '../cost/tracker.js';
import { saveMeeting, linkThreadToMeeting } from '../storage/transcriptStore.js';
import {
  buildOpeningPrompt,
  buildRebuttalPrompt,
  buildRevisionPrompt,
  buildDecisionPrompt,
  parseJsonLoose,
} from './rounds.js';

export const PHASES = {
  OPENING: 'opening',
  REBUTTAL: 'rebuttal',
  REVISION: 'revision',
  DECISION: 'decision',
};

export class MeetingOrchestrator {
  /**
   * @param {{topic: string, rounds?: number, threadId?: string, costTracker?: CostTracker}} params
   */
  constructor({ topic, rounds = 1, threadId = null, costTracker = new CostTracker() }) {
    this.meetingId = `mtg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    this.topic = topic;
    this.rounds = Math.max(1, rounds);
    this.threadId = threadId;
    this.costTracker = costTracker;
    this.debaters = getDebaters();
    this.ceo = getDecisionMaker();
    this.aborted = false;
    this.transcript = {
      meetingId: this.meetingId,
      topic,
      threadId,
      startedAt: new Date().toISOString(),
      rounds: [],
      decision: null,
      totalCostUsd: 0,
    };
    if (threadId) linkThreadToMeeting(threadId, this.meetingId);
  }

  /** /meeting cancel から呼ばれる。現在実行中のPromise.allが解決した後、次のフェーズに進まず終了する。 */
  abort() {
    this.aborted = true;
  }

  async callRole(role, phase, promptBuilder, ...args) {
    const prompt = promptBuilder(...args);
    const maxTokens = role.maxTokens[phase] ?? 400;
    const { text, usage } = await generate(role.provider, {
      systemPrompt: role.persona,
      userPrompt: prompt,
      model: role.model,
      temperature: role.temperature,
      maxTokens,
    });
    const costUsd = this.costTracker.recordUsage({
      meetingId: this.meetingId,
      role: role.id,
      provider: role.provider,
      model: role.model,
      phase,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    this.transcript.totalCostUsd += costUsd;
    return {
      roleId: role.id,
      roleName: role.name,
      color: role.color,
      provider: role.provider,
      model: role.model,
      phase,
      raw: text,
      parsed: parseJsonLoose(text),
      costUsd,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 会議を最初から最後まで実行する。
   * @param {(message: object) => Promise<void>} onMessage 各役職の発言が生成され次第呼ばれる(Discord投稿用)
   * @returns {Promise<object>} 完全なトランスクリプト
   */
  async run(onMessage) {
    // --- Round 1: 意見表明(独立生成。他者の意見は一切見せない) ---
    const openings = await Promise.all(
      this.debaters.map((role) => this.callRole(role, PHASES.OPENING, buildOpeningPrompt, this.topic)),
    );
    for (const msg of openings) await onMessage(msg);
    this.transcript.rounds.push({ phase: PHASES.OPENING, messages: openings });
    saveMeeting(this.meetingId, this.transcript);

    let currentStances = openings;

    for (let roundIndex = 0; roundIndex < this.rounds; roundIndex += 1) {
      if (this.aborted) break;

      // --- 反論フェーズ ---
      const rebuttalMsgs = await Promise.all(
        this.debaters.map((role) => {
          const myStance = currentStances.find((s) => s.roleId === role.id);
          const others = currentStances.filter((s) => s.roleId !== role.id);
          return this.callRole(role, PHASES.REBUTTAL, buildRebuttalPrompt, this.topic, role, myStance, others);
        }),
      );
      for (const msg of rebuttalMsgs) await onMessage(msg);
      this.transcript.rounds.push({ phase: PHASES.REBUTTAL, round: roundIndex + 1, messages: rebuttalMsgs });
      saveMeeting(this.meetingId, this.transcript);

      if (this.aborted) break;

      const roundRebuttals = rebuttalMsgs.flatMap((msg) =>
        (msg.parsed?.rebuttals ?? []).map((r) => ({ ...r, fromRoleId: msg.roleId, fromRoleName: msg.roleName })),
      );

      // --- 修正フェーズ ---
      const revisionMsgs = await Promise.all(
        this.debaters.map((role) => {
          const myStance = currentStances.find((s) => s.roleId === role.id);
          const rebuttalsAgainstMe = roundRebuttals.filter((r) => r.targetRole === role.id);
          return this.callRole(role, PHASES.REVISION, buildRevisionPrompt, this.topic, myStance, rebuttalsAgainstMe);
        }),
      );
      for (const msg of revisionMsgs) await onMessage(msg);
      this.transcript.rounds.push({
        phase: PHASES.REVISION,
        round: roundIndex + 1,
        messages: revisionMsgs,
        rebuttals: roundRebuttals,
      });
      saveMeeting(this.meetingId, this.transcript);

      // 修正後の立場を次ラウンドの「現在の意見」として引き継ぐ
      currentStances = currentStances.map((stance) => {
        const revision = revisionMsgs.find((r) => r.roleId === stance.roleId);
        if (!revision?.parsed?.revisedStance) return stance;
        return { ...stance, parsed: { ...stance.parsed, stance: revision.parsed.revisedStance } };
      });
    }

    if (this.aborted) {
      this.transcript.aborted = true;
      saveMeeting(this.meetingId, this.transcript);
      return this.transcript;
    }

    // --- CEOによる最終決定(全ラウンドの反論を渡す) ---
    const allRebuttals = this.transcript.rounds
      .filter((r) => r.phase === PHASES.REBUTTAL)
      .flatMap((r) => r.messages.flatMap((msg) => (msg.parsed?.rebuttals ?? []).map((reb) => ({ ...reb, fromRoleName: msg.roleName }))));

    const decisionMsg = await this.callRole(
      this.ceo,
      PHASES.DECISION,
      buildDecisionPrompt,
      this.topic,
      currentStances,
      allRebuttals,
    );
    await onMessage(decisionMsg);
    this.transcript.decision = decisionMsg;
    this.transcript.finishedAt = new Date().toISOString();
    saveMeeting(this.meetingId, this.transcript);

    return this.transcript;
  }
}
