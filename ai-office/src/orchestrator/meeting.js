import { randomUUID } from 'node:crypto';
import {
  getDecisionMaker,
  getFixedRoles,
  getCoreCandidates,
  getSpecialistCandidates,
  getRoleById,
} from '../roles/roles.config.js';
import { generate } from '../providers/index.js';
import { CostTracker } from '../cost/tracker.js';
import { CONSTITUTION_VERSION } from '../constitution/constitution.js';
import { saveMeeting, linkThreadToMeeting } from '../storage/transcriptStore.js';
import { looksLikeSecret } from '../security/secretGuard.js';
import { runTriage } from './triage.js';
import { PHASES } from './phases.js';
import { getRoleBriefing } from '../knowledge/retrieval.js';
import {
  buildOpeningPrompt,
  buildRedTeamPrompt,
  buildRevisionPrompt,
  buildApprovalCheckPrompt,
  buildDecisionPrompt,
  parseJsonLoose,
} from './rounds.js';

export { PHASES };

export class MeetingOrchestrator {
  /**
   * @param {{topic: string, threadId?: string, costTracker?: CostTracker}} params
   */
  constructor({ topic, threadId = null, costTracker = new CostTracker() }) {
    if (looksLikeSecret(topic)) {
      throw new Error('[secret-guard] 議題に秘密情報らしき文字列が含まれているため、会議を開始できません。');
    }
    this.meetingId = `mtg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    this.topic = topic;
    this.threadId = threadId;
    this.costTracker = costTracker;
    this.ceo = getDecisionMaker();
    this.fixedRoles = getFixedRoles(); // CTO, Red Team
    this.cto = this.fixedRoles.find((r) => r.id === 'cto');
    this.redTeam = this.fixedRoles.find((r) => r.id === 'red_team');
    this.coreCandidates = getCoreCandidates(); // Product, Growth, UX/UI
    this.specialistCandidates = getSpecialistCandidates(); // CFO, 法務
    this.aborted = false;
    this.transcript = {
      meetingId: this.meetingId,
      topic,
      threadId,
      constitutionVersion: CONSTITUTION_VERSION,
      startedAt: new Date().toISOString(),
      problemDefinition: '',
      requiredRoleIds: [],
      specialistRoleIds: [],
      mandatoryApprovalTags: [],
      rounds: [],
      redTeamFindings: [],
      failures: [],
      blockedOnFailure: null,
      decision: null,
      ownerApproval: { required: false, status: null, by: null, at: null },
      totalCostUsd: 0,
    };
    if (threadId) linkThreadToMeeting(threadId, this.meetingId);
  }

  /** /meeting cancel から呼ばれる。 */
  abort(reason = 'owner_requested') {
    this.aborted = true;
    this.abortReason = reason;
  }

  /**
   * @returns {Promise<object|null>} 呼び出しに失敗した場合は {failed: true, roleId, phase, error} を持つメッセージ、
   *   成功した場合は通常のメッセージオブジェクトを返す(例外を投げないので Promise.all がまとめて落ちない)。
   */
  async callRole(role, phase, promptBuilder, ...args) {
    const briefing = getRoleBriefing(role.id, this.topic);
    const basePrompt = briefing ? `${briefing}\n\n---\n\n${promptBuilder(...args)}` : promptBuilder(...args);
    const maxTokens = role.maxTokens[phase] ?? 400;
    const retryNote = '\n\n(前回の応答はJSON形式として不正/不完全でした。前置き・説明・コードフェンスを一切付けず、指定されたJSONオブジェクト1つだけを、省略せず最後まで完結させて出力し直してください。)';
    try {
      let text;
      let usage;
      let parsed;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = attempt === 0 ? basePrompt : `${basePrompt}${retryNote}`;
        ({ text, usage } = await generate(role.provider, {
          systemPrompt: role.persona,
          userPrompt: prompt,
          model: role.model,
          temperature: role.temperature,
          maxTokens,
        }));
        parsed = parseJsonLoose(text);
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
        if (!parsed.parseError) {
          return {
            roleId: role.id,
            roleName: role.name,
            color: role.color,
            provider: role.provider,
            model: role.model,
            phase,
            raw: text,
            parsed,
            costUsd,
            failed: false,
            timestamp: new Date().toISOString(),
          };
        }
      }
      // 2回試してもJSONとして解析できなかった場合は、そのまま(parseError付きで)返す。
      return {
        roleId: role.id,
        roleName: role.name,
        color: role.color,
        provider: role.provider,
        model: role.model,
        phase,
        raw: text,
        parsed,
        costUsd: 0,
        failed: false,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.transcript.failures.push({ phase, roleId: role.id, error: error.message, timestamp: new Date().toISOString() });
      return {
        roleId: role.id,
        roleName: role.name,
        color: role.color,
        provider: role.provider,
        model: role.model,
        phase,
        raw: '',
        parsed: {},
        costUsd: 0,
        failed: true,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  budgetExceeded() {
    return this.costTracker.exceedsMeetingCap(this.transcript.totalCostUsd);
  }

  /**
   * 会議を最初から最後まで実行する。
   * @param {(message: object) => Promise<void>} onMessage 各役職の発言が生成され次第呼ばれる(Discord投稿用)
   * @returns {Promise<object>} 完全なトランスクリプト。
   *   transcript.blockedOnFailure が非nullの場合、Ownerに続行/再試行/中止を確認する必要がある。
   */
  async run(onMessage) {
    // --- Round 0: Triage(CEOによる問題定義・招集・Owner承認カテゴリ自己申告) ---
    const triageResult = await runTriage({
      topic: this.topic,
      ceoRole: this.ceo,
      coreCandidates: this.coreCandidates,
      specialistCandidates: this.specialistCandidates,
      callRole: (...a) => this.callRole(...a),
    });
    await onMessage(triageResult.message);
    this.transcript.problemDefinition = triageResult.problemDefinition;
    this.transcript.requiredRoleIds = triageResult.requiredRoleIds;
    this.transcript.specialistRoleIds = triageResult.specialistRoleIds;
    this.transcript.mandatoryApprovalTags = triageResult.mandatoryApprovalTags;
    this.transcript.rounds.push({ phase: PHASES.TRIAGE, messages: [triageResult.message] });
    saveMeeting(this.meetingId, this.transcript);

    if (this.budgetExceeded()) return this.#abortForBudget();

    const invitedRoles = [
      ...triageResult.requiredRoleIds.map((id) => getRoleById(id)),
      ...triageResult.specialistRoleIds.map((id) => getRoleById(id)),
      this.cto,
    ].filter(Boolean);

    let important = this.transcript.mandatoryApprovalTags.length > 0;

    // --- Round 1: 意見表明(独立生成。他者の意見は見せない) ---
    const openings = await Promise.all(
      invitedRoles.map((role) => this.callRole(role, PHASES.OPENING, buildOpeningPrompt, this.topic)),
    );
    for (const msg of openings) await onMessage(msg);
    this.transcript.rounds.push({ phase: PHASES.OPENING, messages: openings });
    saveMeeting(this.meetingId, this.transcript);

    if (this.budgetExceeded()) return this.#abortForBudget();
    if (important && this.#hasFailure(openings)) return this.#blockOnFailure(PHASES.OPENING, openings);

    // --- Round 2: Red Team(固定・毎回1回) ---
    const redTeamMsg = await this.callRole(this.redTeam, PHASES.RED_TEAM, buildRedTeamPrompt, this.topic, openings);
    await onMessage(redTeamMsg);
    this.transcript.rounds.push({ phase: PHASES.RED_TEAM, messages: [redTeamMsg] });

    if (important && redTeamMsg.failed) return this.#blockOnFailure(PHASES.RED_TEAM, [redTeamMsg]);

    const redTeamFindings = Array.isArray(redTeamMsg.parsed?.findings) ? redTeamMsg.parsed.findings : [];
    this.transcript.redTeamFindings = redTeamFindings;
    important = important || redTeamFindings.length > 0;
    saveMeeting(this.meetingId, this.transcript);

    if (this.budgetExceeded()) return this.#abortForBudget();

    // --- Round 3: Revision(条件付き) ---
    const positionTags = new Set(openings.map((o) => o.parsed?.positionTag).filter(Boolean));
    const disagreement = positionTags.size > 1;
    let currentStances = openings;

    if (redTeamFindings.length > 0 || disagreement) {
      const revisionMsgs = await Promise.all(
        invitedRoles.map((role) => {
          const myOpening = openings.find((o) => o.roleId === role.id);
          const relevantFindings = redTeamFindings.filter((f) => !f.relatedRoleId || f.relatedRoleId === role.id);
          return this.callRole(role, PHASES.REVISION, buildRevisionPrompt, this.topic, myOpening, relevantFindings);
        }),
      );
      for (const msg of revisionMsgs) await onMessage(msg);
      this.transcript.rounds.push({ phase: PHASES.REVISION, messages: revisionMsgs });
      saveMeeting(this.meetingId, this.transcript);

      if (important && this.#hasFailure(revisionMsgs)) return this.#blockOnFailure(PHASES.REVISION, revisionMsgs);
      if (this.budgetExceeded()) return this.#abortForBudget();

      currentStances = openings.map((o) => {
        const revision = revisionMsgs.find((r) => r.roleId === o.roleId);
        if (!revision?.parsed?.revisedStance) return o;
        return { ...o, parsed: { ...o.parsed, stance: revision.parsed.revisedStance } };
      });
    }

    if (this.aborted) return this.#finishAborted();

    // --- Round 4: CTOによるOwner承認要否の独立判定 ---
    const ctoStance = currentStances.find((s) => s.roleId === 'cto')?.parsed?.stance;
    const approvalCheckMsg = await this.callRole(this.cto, PHASES.APPROVAL_CHECK, buildApprovalCheckPrompt, this.topic, ctoStance);
    await onMessage(approvalCheckMsg);
    this.transcript.rounds.push({ phase: PHASES.APPROVAL_CHECK, messages: [approvalCheckMsg] });
    saveMeeting(this.meetingId, this.transcript);
    // CTOの承認要否判定自体が失敗した場合は、fail-safeで「必要」とみなす(下記#buildOwnerApprovalで反映)。

    // --- Round 5: CEOによる最終決定 ---
    return this.#runDecision(currentStances, approvalCheckMsg, onMessage);
  }

  /**
   * プロバイダー障害でブロックされた会議を、Ownerの「続行」指示により
   * 現状の情報のまま決定フェーズへ進める。
   */
  async forceDecision(onMessage) {
    this.transcript.blockedOnFailure = null;
    const lastOpeningRound = this.transcript.rounds.find((r) => r.phase === PHASES.OPENING);
    const currentStances = lastOpeningRound?.messages ?? [];
    const approvalCheckMsg = { parsed: { ownerApprovalOpinion: 'required', reason: '一部役職の呼び出しに失敗したまま続行したため安全側判定' } };
    return this.#runDecision(currentStances, approvalCheckMsg, onMessage, { degraded: true });
  }

  async #runDecision(currentStances, approvalCheckMsg, onMessage, { degraded = false } = {}) {
    const decisionMsg = await this.callRole(
      this.ceo,
      PHASES.DECISION,
      buildDecisionPrompt,
      this.topic,
      currentStances,
      this.transcript.redTeamFindings,
      this.transcript.mandatoryApprovalTags,
      approvalCheckMsg.parsed,
    );

    if (decisionMsg.failed) {
      // CEO自身が決定を出せない場合は、両方の判断材料に関わらず常にブロックする。
      return this.#blockOnFailure(PHASES.DECISION, [decisionMsg]);
    }

    if (degraded) {
      decisionMsg.parsed.ownerNote = '一部役職の呼び出しに失敗した状態のまま、Ownerの指示により続行した決定です。';
    }

    await onMessage(decisionMsg);
    this.transcript.decision = decisionMsg;

    const ctoWantsApproval = approvalCheckMsg.parsed?.ownerApprovalOpinion !== 'not_required';
    const ceoWantsApproval = decisionMsg.parsed?.ownerApprovalOpinion !== 'not_required';
    this.transcript.ownerApproval.required =
      this.transcript.mandatoryApprovalTags.length > 0 || ctoWantsApproval || ceoWantsApproval;
    this.transcript.ownerApproval.status = this.transcript.ownerApproval.required ? 'pending' : null;

    this.transcript.finishedAt = new Date().toISOString();
    saveMeeting(this.meetingId, this.transcript);
    return this.transcript;
  }

  #hasFailure(messages) {
    return messages.some((m) => m.failed);
  }

  #blockOnFailure(phase, messages) {
    this.transcript.blockedOnFailure = {
      phase,
      failedRoleIds: messages.filter((m) => m.failed).map((m) => m.roleId),
    };
    saveMeeting(this.meetingId, this.transcript);
    return this.transcript;
  }

  #abortForBudget() {
    this.aborted = true;
    this.abortReason = 'budget_exceeded_mid_meeting';
    return this.#finishAborted();
  }

  #finishAborted() {
    this.transcript.aborted = true;
    this.transcript.abortReason = this.abortReason ?? 'owner_requested';
    saveMeeting(this.meetingId, this.transcript);
    return this.transcript;
  }
}
