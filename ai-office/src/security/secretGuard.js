/**
 * Constitution 13条: プロンプト送信前・ログ保存前・Discord投稿前の3箇所で、
 * APIキー/Tokenらしき文字列を機械的に検知してブロックするためのガード。
 *
 * 検知は「見逃しより過検知を優先」の方針(誤検知でブロックされても実害は小さいが、
 * 見逃して秘密情報が漏れると実害が大きいため)。
 */

const SECRET_PATTERNS = [
  { name: 'openai_api_key', pattern: /sk-[A-Za-z0-9_-]{16,}/g },
  { name: 'groq_api_key', pattern: /gsk_[A-Za-z0-9]{16,}/g },
  { name: 'google_api_key', pattern: /AIzaSy[A-Za-z0-9_-]{16,}/g },
  // Discord bot token: 3セグメントがピリオドで区切られたbase64風文字列
  { name: 'discord_bot_token', pattern: /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g },
  // フォールバック: 上記のどれにも一致しないが、20文字以上の高エントロピーな
  // 連続文字列(英数字+記号が混在)。誤検知が多くなりうるため、これは
  // looksLikeSecret()の判定のみに使い、redact()では上記の具体パターンを優先する。
  { name: 'generic_high_entropy_token', pattern: /(?=\S*[A-Z])(?=\S*[a-z])(?=\S*[0-9])[A-Za-z0-9_-]{28,}/g },
];

/** @param {string} text @returns {boolean} 秘密情報らしき文字列を含むか */
export function looksLikeSecret(text) {
  if (!text) return false;
  return SECRET_PATTERNS.some(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(text));
}

/** @param {string} text @returns {string} 該当箇所を [REDACTED:種別] に置換した文字列 */
export function redact(text) {
  if (!text) return text;
  let result = text;
  for (const { name, pattern } of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), `[REDACTED:${name}]`);
  }
  return result;
}

/**
 * ガード本体。呼び出し側はこれで安全確認してから実際の送信/保存を行う。
 * @param {string} text
 * @returns {{safe: boolean, redacted: string}}
 */
export function guard(text) {
  const safe = !looksLikeSecret(text);
  return { safe, redacted: safe ? text : redact(text) };
}
