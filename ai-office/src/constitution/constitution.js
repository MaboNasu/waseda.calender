import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTITUTION_PATH = path.join(__dirname, 'constitution.md');

const raw = fs.readFileSync(CONSTITUTION_PATH, 'utf-8');
const versionMatch = raw.match(/^---\s*\nversion:\s*(\S+)/);

if (!versionMatch) {
  // サイレントに古い/壊れたConstitutionのまま起動することを防ぐ。
  throw new Error(
    'constitution.md からバージョンを読み取れませんでした。先頭が "---\\nversion: X.Y.Z" 形式になっているか確認してください。',
  );
}

/** Decision Logに記録する、このConstitutionのバージョン。 */
export const CONSTITUTION_VERSION = versionMatch[1];

/**
 * 常にOwner承認が必須なカテゴリ(Constitution 5-1条)。
 * mandatoryCategoryScanner.js と CEOの自己申告(triage.js)の両方から参照される
 * 単一の真実源。カテゴリを増減する場合はここではなく constitution.md 5-1条を
 * 先に変更し、それに合わせて更新すること(Constitution本体が優先)。
 */
export const MANDATORY_APPROVAL_CATEGORIES = [
  'url_structure_change',
  'paid_api_or_billing',
  'auth',
  'personal_data',
  'production_release',
  'mass_deletion',
  'external_autopost_policy_change',
  'ai_office_governance_change',
];

export function getConstitutionText() {
  return raw;
}
