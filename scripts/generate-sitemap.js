#!/usr/bin/env node
/**
 * generate-sitemap.js - events.js を読み込み、sitemap.xml を再生成する。
 *
 * 実行方法: node scripts/generate-sitemap.js
 * events.js を更新した後（新規イベント追加時など）に実行してください。
 * ビルドツール・npm依存なしで動く単純なNodeスクリプトです。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE_ORIGIN = 'https://wasedacalendar.com';

/** events.js / organizations.js は <script> 読み込み前提のプレーンJSなので、vmで安全に実行して
 *  配列だけ取り出す。const/letはvmのサンドボックスオブジェクトのプロパティとしては現れない
 *  （varなら現れる）ため、末尾に var 経由で明示的に拾い直す一行を足している。 */
function loadEvents() {
  const src = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar __EXPORTED_EVENTS__ = (typeof EVENTS !== "undefined") ? EVENTS : undefined;', sandbox, { filename: 'events.js' });
  return Array.isArray(sandbox.__EXPORTED_EVENTS__) ? sandbox.__EXPORTED_EVENTS__ : [];
}

function loadOrganizations() {
  const src = fs.readFileSync(path.join(ROOT, 'organizations.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar __EXPORTED_ORGS__ = (typeof ORGANIZATIONS !== "undefined") ? ORGANIZATIONS : undefined;', sandbox, { filename: 'organizations.js' });
  return Array.isArray(sandbox.__EXPORTED_ORGS__) ? sandbox.__EXPORTED_ORGS__ : [];
}

/** 団体に紐づくイベントかどうか。organizations-page.js の isEventRelatedToOrg と同じ判定
 *  （generate-org-pages.js にも同じ複製がある。ロジックを変える場合は3箇所とも直すこと）。 */
function isEventRelatedToOrg(ev, org) {
  if (ev.orgId && String(ev.orgId) === String(org.id)) return true;
  const ids = Array.isArray(org.relatedEventIds) ? org.relatedEventIds.map(String) : [];
  if (ids.includes(String(ev.id))) return true;
  return !!(ev.organizer && org.name && String(ev.organizer).trim() === String(org.name).trim());
}

/** 検索エンジンに索引させるだけの中身があるかどうか。generate-org-pages.js の
 *  isOrgIndexEligible と同じ判定（sitemapにはこの条件を満たす団体だけを載せる）。 */
function isOrgIndexEligible(org, events) {
  const hasDescription = !!(org.description && org.description.trim());
  const hasSocialLinks = !!(org.instagramUrl || org.twitterUrl || org.websiteUrl);
  const hasEvents = events.some((ev) => ev.isPublished && isEventRelatedToOrg(ev, org));
  return hasDescription || hasSocialLinks || hasEvents;
}

function xmlEscape(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function urlEntry(loc, { changefreq, priority, lastmod } = {}) {
  const lines = [`  <url>`, `    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  lines.push(`  </url>`);
  return lines.join('\n');
}

function main() {
  const events = loadEvents();
  const organizations = loadOrganizations();
  const publishedEvents = events.filter((ev) => ev.isPublished);
  const indexableOrgs = organizations.filter((org) => isOrgIndexEligible(org, events));

  const staticEntries = [
    urlEntry(`${SITE_ORIGIN}/`, { changefreq: 'daily', priority: '1.0' }),
    urlEntry(`${SITE_ORIGIN}/organizations.html`, { changefreq: 'weekly', priority: '0.7' }),
    urlEntry(`${SITE_ORIGIN}/contact.html`, { changefreq: 'monthly', priority: '0.5' }),
    urlEntry(`${SITE_ORIGIN}/about.html`, { changefreq: 'monthly', priority: '0.4' }),
    urlEntry(`${SITE_ORIGIN}/terms.html`, { changefreq: 'yearly', priority: '0.3' }),
    urlEntry(`${SITE_ORIGIN}/privacy.html`, { changefreq: 'yearly', priority: '0.3' })
    // マイページ・申請状況確認ページは利用者固有ページのため、意図的にsitemapへ含めない
    // （mypage.html / status.html はページ側のmeta robotsもnoindex, nofollow）
  ];

  const eventEntries = publishedEvents.map((ev) => {
    const loc = `${SITE_ORIGIN}/event/${encodeURIComponent(ev.id)}.html`;
    return urlEntry(loc, {
      changefreq: 'weekly',
      priority: '0.6',
      lastmod: ev.lastUpdated || undefined
    });
  });

  const orgEntries = indexableOrgs.map((org) => {
    const loc = `${SITE_ORIGIN}/org/${encodeURIComponent(org.id)}.html`;
    return urlEntry(loc, { changefreq: 'monthly', priority: '0.4' });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    [...staticEntries, ...eventEntries, ...orgEntries].join('\n')
  }\n</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  console.log(`sitemap.xml を生成しました（静的ページ${staticEntries.length}件 + イベント${eventEntries.length}件 + 団体${orgEntries.length}件 = 計${staticEntries.length + eventEntries.length + orgEntries.length}件）。`);
}

main();
