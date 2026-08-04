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

/** events.js は <script> 読み込み前提のプレーンJSなので、vmで安全に実行してEVENTS配列だけ取り出す。
 *  events.js は `const EVENTS = [...]` という宣言で、const/letはvmのサンドボックスオブジェクトの
 *  プロパティとしては現れない（varなら現れる）ため、末尾に var 経由で明示的に拾い直す一行を足している。 */
function loadEvents() {
  const src = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar __EXPORTED_EVENTS__ = (typeof EVENTS !== "undefined") ? EVENTS : undefined;', sandbox, { filename: 'events.js' });
  return Array.isArray(sandbox.__EXPORTED_EVENTS__) ? sandbox.__EXPORTED_EVENTS__ : [];
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
  const publishedEvents = events.filter((ev) => ev.isPublished);

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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    [...staticEntries, ...eventEntries].join('\n')
  }\n</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');
  console.log(`sitemap.xml を生成しました（静的ページ${staticEntries.length}件 + イベント${eventEntries.length}件 = 計${staticEntries.length + eventEntries.length}件）。`);
}

main();
