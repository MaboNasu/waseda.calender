import { buildTriagePrompt } from './rounds.js';
import { scanMandatoryCategories } from '../approval/mandatoryCategoryScanner.js';

/**
 * Round 0: CEOに議題を渡し、問題定義・招集メンバー・Owner承認カテゴリの
 * 自己申告をさせる。コード側のキーワードスキャン(mandatoryCategoryScanner.js)
 * と合わせて「機械的ルールでも二重チェック」する(どちらかが検出すれば採用=OR条件)。
 *
 * フェイルセーフ: CEOの出力が壊れている/招集メンバーが空の場合は、
 * 「誰も呼ばない」ではなく「候補全員を招集する」を既定値にする
 * (見逃しより過剰招集の方が安全なため)。
 *
 * @param {{topic: string, ceoRole: object, coreCandidates: object[], specialistCandidates: object[], callRole: Function}} params
 */
export async function runTriage({ topic, ceoRole, coreCandidates, specialistCandidates, callRole }) {
  const scannedMandatoryTags = scanMandatoryCategories(topic);

  const message = await callRole(
    ceoRole,
    'triage',
    buildTriagePrompt,
    topic,
    coreCandidates,
    specialistCandidates,
    scannedMandatoryTags,
  );

  const parsed = message.parsed ?? {};
  const coreIds = new Set(coreCandidates.map((r) => r.id));
  const specialistIds = new Set(specialistCandidates.map((r) => r.id));

  const requiredRoleIds = Array.isArray(parsed.requiredRoles)
    ? parsed.requiredRoles.filter((id) => coreIds.has(id))
    : [];
  const specialistRoleIds = Array.isArray(parsed.specialistRoles)
    ? parsed.specialistRoles.filter((id) => specialistIds.has(id))
    : [];

  const mandatoryApprovalTags = Array.from(
    new Set([...(Array.isArray(parsed.mandatoryApprovalTags) ? parsed.mandatoryApprovalTags : []), ...scannedMandatoryTags]),
  );

  return {
    message,
    problemDefinition: parsed.problemDefinition ?? '',
    // フェイルセーフ: 招集メンバーが1人も選ばれなかった(=出力が壊れている可能性)場合は全員招集
    requiredRoleIds: requiredRoleIds.length ? requiredRoleIds : coreCandidates.map((r) => r.id),
    specialistRoleIds,
    mandatoryApprovalTags,
    reasoning: parsed.reasoning ?? '',
  };
}
