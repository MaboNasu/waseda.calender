/**
 * x-client.js - X API v2 への投稿クライアント(OAuth 1.0a, 依存パッケージなし)。
 *
 * POST /2/tweets はOAuth 1.0aユーザーコンテキスト認証が必須(bearer token/app-onlyでは不可)。
 * 2026-08時点でdocs.x.comを確認して決定(X運用委員会 技術担当の調査結果)。
 * OAuth 1.0aを選んだ理由: OAuth 2.0ユーザーコンテキストは3-legged認証+アクセストークンの
 * 定期リフレッシュが必要で、人が介在しないcron実行と相性が悪い。OAuth 1.0aは
 * X Developer Portalで一度発行した4つの資格情報が失効なく使え、無人運用に向いている。
 *
 * 認証情報は環境変数からのみ読む(コードに直書きしない)。
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *
 * 料金(2026-08時点、docs.x.com/x-api/getting-started/pricing で確認、変動しうる):
 *   Post作成(URLなし): $0.015/件、Post作成(URL付き): $0.200/件。
 *   本システムの投稿は全てURLを含むため、実質1投稿あたり約$0.20と想定しておくこと。
 */
const crypto = require('crypto');

const API_URL = 'https://api.x.com/2/tweets';

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuthHeader({ apiKey, apiSecret, accessToken, accessTokenSecret }, method, url) {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  // POST /2/tweets はJSONボディなので、署名対象パラメータはOAuthパラメータのみ
  // (application/x-www-form-urlencoded のボディやクエリ文字列パラメータがある場合のみ、
  //  それらもここに含める必要があるが、本エンドポイントでは該当なし)。
  const sortedKeys = Object.keys(oauthParams).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`).join('&');
  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join('&');
  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const headerStr = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');
  return `OAuth ${headerStr}`;
}

function readCredentialsFromEnv() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

/**
 * エラー種別を分類する。無限リトライしない方針(指示書21番)のため、
 * ここで分類するだけでリトライは一切行わない(呼び出し側もリトライしない)。
 */
function classifyError(status, bodyText) {
  if (status === 401 || status === 403) {
    return { type: 'auth', retryable: false, message: '認証エラー。X_API_KEY等の資格情報が正しいか、失効していないか確認してください。' };
  }
  if (status === 429) {
    return { type: 'rate_limit', retryable: false, message: 'レート制限。今回はスキップし、次回の定期実行を待ちます。' };
  }
  if (status >= 500) {
    return { type: 'server_error', retryable: false, message: 'X側の一時的なサーバーエラー。次回の定期実行で再評価します。' };
  }
  if (status === 400 || status === 422) {
    return { type: 'validation', retryable: false, message: `投稿内容が拒否されました(重複投稿と判定された可能性含む): ${bodyText.slice(0, 200)}` };
  }
  return { type: 'unknown', retryable: false, message: `未分類のエラー(status=${status}): ${bodyText.slice(0, 200)}` };
}

/**
 * 投稿を実行する。
 * dryRun=true の場合はAPIを一切呼ばず、実行される内容だけを返す(指示書17番)。
 * X_AUTOMATION_ENABLED=false の場合はdryRunに関わらずここに来る前に呼び出し側で止める設計
 * (decide-and-post.js側のKill Switchチェックを参照)。
 */
async function postTweet(text, { dryRun }) {
  if (dryRun) {
    return { ok: true, dryRun: true, postId: null, text };
  }

  const creds = readCredentialsFromEnv();
  if (!creds) {
    return {
      ok: false,
      dryRun: false,
      error: { type: 'missing_credentials', retryable: false, message: 'X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET が設定されていません。' },
    };
  }

  const authHeader = buildOAuthHeader(creds, 'POST', API_URL);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
  } catch (networkErr) {
    return { ok: false, dryRun: false, error: { type: 'network', retryable: false, message: networkErr.message } };
  }

  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, dryRun: false, status: res.status, error: classifyError(res.status, bodyText) };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (e) {
    return { ok: false, dryRun: false, error: { type: 'parse_error', retryable: false, message: 'レスポンスのJSON解析に失敗しました。' } };
  }

  const postId = parsed && parsed.data && parsed.data.id ? parsed.data.id : null;
  return { ok: true, dryRun: false, postId, text };
}

module.exports = { postTweet, readCredentialsFromEnv, classifyError };
