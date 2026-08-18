/**
 * url-builder.js - UTM付きURLの生成。
 *
 * サイト側の buildEventPageUrl(script.js) と同じURL形式(event/{id}.html)を使う。
 * 既存のクエリパラメータを壊さないよう、URLオブジェクト経由でパラメータを追加する
 * (指示書13番: 「既存URLにquery parameterがあっても壊さないでください」に対応)。
 */
const { SITE_ORIGIN, UTM_SOURCE, UTM_MEDIUM } = require('./config');

function withUtm(rawUrl, campaign) {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', UTM_SOURCE);
  url.searchParams.set('utm_medium', UTM_MEDIUM);
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}

/** イベント個別ページのURL(UTM付き)。script.jsのbuildEventPageUrlと同じパス形式。 */
function buildEventUrl(ev, campaign) {
  return withUtm(`${SITE_ORIGIN}/event/${encodeURIComponent(ev.id)}.html`, campaign);
}

/** トップページ(必要ならアンカー付き)のURL(UTM付き) */
function buildHomeUrl(campaign, anchor) {
  const base = anchor ? `${SITE_ORIGIN}/index.html#${anchor}` : `${SITE_ORIGIN}/index.html`;
  return withUtm(base, campaign);
}

module.exports = { withUtm, buildEventUrl, buildHomeUrl };
