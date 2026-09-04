/**
 * roleDefinitions.js(persona/責務) と modelRouting.js(provider/model) を
 * 合成して、オーケストレーターが使う ROLES を組み立てる薄いレイヤー。
 *
 * 役職の追加・削除は roleDefinitions.js + modelRouting.js の両方に1行ずつ
 * 追加するだけで反映される(このファイル自体の変更は不要)。
 */
import { ROLE_DEFINITIONS } from './roleDefinitions.js';
import { getModelRouting } from './modelRouting.js';

export const ROLES = ROLE_DEFINITIONS.map((role) => ({
  ...role,
  isDecisionMaker: role.category === 'decision_maker',
  ...getModelRouting(role.id),
}));

export function getDecisionMaker() {
  const ceo = ROLES.find((role) => role.isDecisionMaker);
  if (!ceo) {
    throw new Error('roleDefinitions.js must define exactly one role with category: "decision_maker"');
  }
  return ceo;
}

/** 議題に関わらず毎回招集する役職(CTO / Red Team)。 */
export function getFixedRoles() {
  return ROLES.filter((role) => role.category === 'fixed');
}

/** Round0(triage)でCEOが選んで招集する候補(Product/Growth/UX-UI)。 */
export function getCoreCandidates() {
  return ROLES.filter((role) => role.category === 'core');
}

/** 議題にキーワードが該当する場合のみ追加招集する専門役(CFO/法務)。 */
export function getSpecialistCandidates() {
  return ROLES.filter((role) => role.category === 'specialist');
}

export function getRoleById(id) {
  return ROLES.find((role) => role.id === id) ?? null;
}
