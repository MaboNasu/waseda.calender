import { MANDATORY_APPROVAL_CATEGORIES } from '../constitution/constitution.js';

/**
 * Constitution 5-1条のカテゴリを、議題テキストからキーワードで機械的にスキャンする。
 * CEOの自己申告(triage.js)とは独立した、コード側の二重チェック。
 *
 * 方針: 行数/ファイル数のような機械的メトリクスでは判定しない。
 * 誤検知(過検知)は許容し、見逃しを避けることを優先する。
 */
const KEYWORDS = {
  url_structure_change: ['url', 'URL', 'パス変更', 'スラッグ', 'slug', 'リダイレクト', 'redirect', 'ルーティング', 'permalink'],
  paid_api_or_billing: ['有料', '課金', '契約', '月額', 'サブスク', 'billing', 'subscription', '新規契約', 'クレジットカード', '請求'],
  auth: ['認証', 'ログイン', 'ログアウト', 'パスワード', 'oauth', 'session', 'セッション', '二段階認証', 'サインイン'],
  personal_data: ['個人情報', 'メールアドレス', '電話番号', '住所', '氏名', 'personal data', 'pii', '学籍番号', '氏名'],
  production_release: ['本番', '公開', 'リリース', 'デプロイ', 'production', 'release', 'deploy'],
  mass_deletion: ['削除', '一括削除', '全削除', '大量削除', 'drop table', 'truncate', 'delete all'],
  external_autopost_policy_change: ['自動投稿', 'x投稿', 'twitter投稿', 'instagram投稿', '投稿方針', 'autopost'],
  ai_office_governance_change: ['constitution', '憲法', '承認ルール', 'セキュリティルール', 'owner承認', 'ガバナンス', 'secretguard', 'ownergate'],
};

/**
 * @param {string} text 議題テキスト
 * @returns {string[]} 該当したカテゴリIDの配列(Constitution 5-1条のIDと一致)
 */
export function scanMandatoryCategories(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = [];
  for (const category of MANDATORY_APPROVAL_CATEGORIES) {
    const keywords = KEYWORDS[category] ?? [];
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      matched.push(category);
    }
  }
  return matched;
}
