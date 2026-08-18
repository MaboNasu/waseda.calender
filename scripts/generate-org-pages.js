#!/usr/bin/env node
/**
 * generate-org-pages.js - organizations.js を読み込み、団体ごとの静的HTML(org/{id}.html)を生成する。
 *
 * 実行方法: node scripts/generate-org-pages.js
 * organizations.js / events.js を更新した後に実行してください。
 * ビルドツール・npm依存なしで動く単純なNodeスクリプトです（generate-event-pages.js と同じ構成）。
 *
 * なぜ全482団体分を生成するか: organizations.js冒頭のコメントの通り、掲載依頼が来ていない団体も
 * 含めて早稲田公認団体を網羅した一覧として見せる方針のため。ただし情報が薄い団体（説明文なし・
 * SNS等のリンクなし・関連イベントなし）はrobotsをnoindexにし、sitemap.xmlにも含めない
 * （検索エンジンからは見えないが、サイト内リンクからは通常通り閲覧できる）。
 *
 * ここで使う整形ロジックはorganizations-page.js / script.jsにあるブラウザ向け関数の複製。
 * ビルドツールが無くブラウザ/Node間でコードを共有する手段が無いため、意図的に複製している。
 * ロジックを変更する場合は organizations-page.js 側と両方直すこと。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE_ORIGIN = 'https://wasedacalendar.com';
const OUTPUT_DIR = path.join(ROOT, 'org');

/** organizations.js / events.js は <script> 読み込み前提のプレーンJSなので、vmで安全に実行して
 *  必要な配列だけ取り出す（generate-event-pages.js の loadEventsModule と同じ手法）。 */
function loadDataModules() {
  const orgSrc = fs.readFileSync(path.join(ROOT, 'organizations.js'), 'utf8');
  const orgSandbox = {};
  vm.createContext(orgSandbox);
  vm.runInContext(orgSrc + '\nvar __EXPORTED__ = (typeof ORGANIZATIONS !== "undefined") ? ORGANIZATIONS : undefined;', orgSandbox, { filename: 'organizations.js' });

  const evSrc = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');
  const evSandbox = {};
  vm.createContext(evSandbox);
  vm.runInContext(evSrc + '\nvar __EXPORTED__ = (typeof EVENTS !== "undefined") ? EVENTS : undefined;', evSandbox, { filename: 'events.js' });

  return {
    organizations: Array.isArray(orgSandbox.__EXPORTED__) ? orgSandbox.__EXPORTED__ : [],
    events: Array.isArray(evSandbox.__EXPORTED__) ? evSandbox.__EXPORTED__ : []
  };
}

/* ============================================================
   以下、organizations-page.js の同名関数の複製（DOM非依存の純粋関数のみ）
   ============================================================ */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function eventEnd(ev) {
  return ev.endDate || ev.date;
}

/** 団体に紐づくイベントかどうか。organizations-page.js の isEventRelatedToOrg と同じ判定
 *  （orgId一致・relatedEventIds一致に加え、organizerの完全一致も見る。events.js側はorgIdが
 *  ほとんど未設定で、代わりに主催団体名を自由記述のorganizerに入れている実態があるため）。 */
function isEventRelatedToOrg(ev, org) {
  if (ev.orgId && String(ev.orgId) === String(org.id)) return true;
  const ids = Array.isArray(org.relatedEventIds) ? org.relatedEventIds.map(String) : [];
  if (ids.includes(String(ev.id))) return true;
  return !!(ev.organizer && org.name && String(ev.organizer).trim() === String(org.name).trim());
}

function getEventsForOrganization(org, events) {
  const today = todayStr();
  return events.filter((ev) => ev.isPublished && isEventRelatedToOrg(ev, org) && eventEnd(ev) >= today);
}

function getPastEventsForOrganization(org, events) {
  const today = todayStr();
  return events
    .filter((ev) => ev.isPublished && isEventRelatedToOrg(ev, org) && eventEnd(ev) < today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function isOrgListed(org, events) {
  return getEventsForOrganization(org, events).length > 0 || getPastEventsForOrganization(org, events).length > 0;
}

/** organizations-page.js の orgDescriptionHTML と同じロジック（静的生成用に複製）。
 *  ロジックを変える場合は両方直すこと。 */
function orgDescriptionHtml(org, events) {
  if (org.description && org.description.trim()) {
    return `<p class="org-detail-desc">${escapeHtml(org.description)}</p>`;
  }
  const eventCount = getEventsForOrganization(org, events).length + getPastEventsForOrganization(org, events).length;
  if (eventCount > 0) {
    const genre = org.genre || 'その他';
    return `<p class="org-detail-desc">早稲田大学の${escapeHtml(genre)}系団体。${eventCount}件のイベントを掲載中です。</p>`;
  }
  return `<p class="org-detail-desc org-desc-cta">団体概要はまだ登録されていません。運営メンバーの方は<a href="/contact.html#contact-form">こちらから掲載依頼</a>できます。</p>`;
}

/** 検索エンジンに索引させるだけの中身があるかどうか。説明文・SNS/公式サイトリンク・関連イベントの
 *  いずれも無い団体（早稲田公式のサークルガイドへのリンクしか無い）はnoindexにする
 *  （薄いコンテンツページの大量生成を避けるため）。 */
function isOrgIndexEligible(org, events) {
  const hasDescription = !!(org.description && org.description.trim());
  const hasSocialLinks = !!(org.instagramUrl || org.twitterUrl || org.websiteUrl);
  const hasEvents = isOrgListed(org, events);
  return hasDescription || hasSocialLinks || hasEvents;
}

function organizationLinksHTML(org) {
  const links = [];
  if (org.instagramUrl) links.push(`<a href="${escapeHtml(org.instagramUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">Instagram ↗</a>`);
  if (org.twitterUrl) links.push(`<a href="${escapeHtml(org.twitterUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">X ↗</a>`);
  if (org.websiteUrl) links.push(`<a href="${escapeHtml(org.websiteUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">公式サイト ↗</a>`);
  if (org.guideUrl) links.push(`<a href="${escapeHtml(org.guideUrl)}" target="_blank" rel="noopener noreferrer" class="org-link">サークルガイド ↗</a>`);
  return links.length ? `<div class="org-links">${links.join('')}</div>` : '';
}

function orgListedBadgeHTML(org, events) {
  return isOrgListed(org, events) ? '<span class="org-listed-badge">掲載中</span>' : '';
}

/** 団体個別ページの絶対URL。organizations-page.js / script.js と同じ形式を維持すること */
function buildOrgPageUrl(org) {
  return `${SITE_ORIGIN}/org/${encodeURIComponent(org.id)}.html`;
}

function buildEventPageUrl(ev) {
  return `${SITE_ORIGIN}/event/${encodeURIComponent(ev.id)}.html`;
}

function relatedEventsHTML(org, events) {
  const related = getEventsForOrganization(org, events);
  return `
    <div class="org-related">
      <h2>関連イベント</h2>
      ${related.length === 0 ? '<p class="org-muted">関連イベントはまだ登録されていません。</p>' : related.map((ev) => `
        <a class="org-related-event" href="${buildEventPageUrl(ev)}">
          <strong>${escapeHtml(ev.title)}</strong>
          <span>${escapeHtml(ev.date)} ${escapeHtml(ev.startTime || '')}</span>
        </a>`).join('')}
    </div>`;
}

function pastEventsHTML(org, events) {
  const past = getPastEventsForOrganization(org, events);
  return `
    <div class="org-related org-archive">
      <h2>開催実績</h2>
      ${past.length === 0 ? '<p class="org-muted">開催実績はまだありません。</p>' : past.map((ev) => `
        <a class="org-related-event org-archive-event" href="${buildEventPageUrl(ev)}">
          <strong>${escapeHtml(ev.title)}</strong>
          <span>${escapeHtml(ev.date)}${ev.endDate && ev.endDate !== ev.date ? `〜${escapeHtml(ev.endDate)}` : ''}</span>
        </a>`).join('')}
    </div>`;
}

/** schema.org/Organization のJSON-LD */
function buildOrgJsonLd(org, pageUrl) {
  const sameAs = [org.instagramUrl, org.twitterUrl, org.websiteUrl].filter(Boolean);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: pageUrl,
    description: org.description || `${org.name}（早稲田大学公認団体）`,
    memberOf: { '@type': 'CollegeOrUniversity', name: '早稲田大学' },
    sameAs: sameAs.length ? sameAs : undefined
  };
  return data;
}

function jsonLdScriptSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/* ============================================================
   ページ生成
   ============================================================ */

function renderOrgPageHtml(org, events) {
  const pageUrl = buildOrgPageUrl(org);
  const pageTitle = `${escapeHtml(org.name)} – Waseda Calendar`;
  const description = escapeHtml(
    org.description
      ? org.description.replace(/\s+/g, ' ').trim().slice(0, 100)
      : `${org.name}（早稲田大学公認団体・${org.genre || 'その他'}）の掲載イベント一覧。`
  );
  const indexEligible = isOrgIndexEligible(org, events);
  const jsonLd = jsonLdScriptSafe(buildOrgJsonLd(org, pageUrl));

  const detailContent = `
    <div class="org-detail-header">
      <span class="org-genre">${escapeHtml(org.genre || 'その他')}</span>
      ${orgListedBadgeHTML(org, events)}
      <h1>${escapeHtml(org.name)}</h1>
      <p>${escapeHtml(org.nameKana || '')}</p>
      <p>${escapeHtml(org.alphabetName || '')}</p>
      <button type="button" class="btn btn-ghost btn-sm org-follow-btn" id="org-follow-btn"
        onclick="handleOrgFollowClick('${escapeHtml(org.id)}', this)" disabled>フォローする</button>
    </div>
    ${orgDescriptionHtml(org, events)}
    ${organizationLinksHTML(org)}
    ${relatedEventsHTML(org, events)}
    ${pastEventsHTML(org, events)}`;

  // リソース読み込み・ナビゲーションリンクはルート相対パス(先頭/)を使う。org/{id}.html は
  // ルート直下より1階層深いため。canonical/og:url/JSON-LDのURLだけは絶対URL(pageUrl)。
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-F4NHVEBKTK"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-F4NHVEBKTK');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description}" id="org-page-description">
  <meta name="robots" content="${indexEligible ? 'index, follow' : 'noindex, follow'}" id="org-page-robots">
  <link rel="canonical" href="${pageUrl}" id="org-page-canonical">
  <meta name="theme-color" content="#8B0000">
  <meta property="og:title" content="${pageTitle}" id="org-page-og-title">
  <meta property="og:description" content="${description}" id="org-page-og-description">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}" id="org-page-og-url">
  <meta property="og:image" content="${SITE_ORIGIN}/assets/og-image.png?v=1">
  <meta property="og:image:width" content="1731">
  <meta property="og:image:height" content="909">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}" id="org-page-twitter-title">
  <meta name="twitter:description" content="${description}" id="org-page-twitter-description">
  <meta name="twitter:image" content="${SITE_ORIGIN}/assets/og-image.png?v=1">
  <title id="org-page-title">${pageTitle}</title>
  <link rel="icon" type="image/png" href="/assets/icon.png?v=2">
  <link rel="manifest" href="/assets/manifest.json?v=2">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=36">
  <script type="application/ld+json" id="org-page-jsonld">${jsonLd}</script>
</head>
<body>

<header class="site-header" role="banner">
  <div class="header-inner">
    <a href="/index.html#top" class="site-logo">
      <span class="logo-main">Waseda Calendar</span>
      <span class="logo-sub">早稲田イベント情報</span>
    </a>
    <nav class="header-nav" aria-label="メインナビゲーション">
      <a class="nav-btn" href="/index.html#today-section">本日のイベント</a>
      <a class="nav-btn" href="/index.html#upcoming-section">今週開催</a>
      <a class="nav-btn" href="/index.html#calendar-section">カレンダー</a>
      <a class="nav-btn" href="/organizations.html">公認団体</a>
      <a class="nav-btn" href="/contact.html">掲載依頼</a>
      <a class="nav-btn" href="/mypage.html">マイページ</a>
    </nav>
    <div id="header-auth" class="header-auth"></div>
    <button class="hamburger" id="hamburger-btn" aria-label="メニューを開く" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>

<nav class="mobile-nav" id="mobile-nav" aria-label="モバイルナビゲーション">
  <a class="nav-btn" href="/index.html#today-section">本日のイベント</a>
  <a class="nav-btn" href="/index.html#upcoming-section">今週開催</a>
  <a class="nav-btn" href="/index.html#calendar-section">カレンダー</a>
  <a class="nav-btn" href="/organizations.html">公認団体</a>
  <a class="nav-btn" href="/contact.html">掲載依頼・問い合わせ</a>
  <a class="nav-btn" href="/mypage.html">マイページ</a>
</nav>

<main>
  <section class="section">
    <div class="container">
      <a href="/index.html" class="site-context-bar">
        <span class="site-context-icon">🗓</span>
        <span class="site-context-text">
          <strong>Waseda Calendar</strong>
          <span class="site-context-desc">早稲田大学のイベントをまとめて見られるカレンダーサイト</span>
        </span>
        <span class="site-context-arrow">すべて見る →</span>
      </a>
      <div class="org-detail-page">
        <div id="organization-detail" class="org-detail">${detailContent}
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="site-footer" role="contentinfo">
  <div class="footer-inner">
    <div class="footer-logo-wrap">
      <span class="footer-logo">Waseda Calendar</span>
    </div>
    <nav class="footer-links" aria-label="フッターナビゲーション">
      <a href="/index.html#today-section">本日のイベント</a>
      <a href="/index.html#calendar-section">カレンダー</a>
      <a href="/organizations.html">公認団体</a>
      <a href="/contact.html">掲載依頼・問い合わせ</a>
      <a href="/about.html">運営者情報</a>
      <a href="/terms.html">利用規約</a>
      <a href="/privacy.html">プライバシーポリシー</a>
    </nav>
    <div class="footer-disclaimers">
      <p>⚠ このサイトは早稲田大学公式サイトではありません。</p>
      <p>掲載情報は主催団体の公開情報または掲載依頼をもとに作成しています。</p>
      <p>© 2026 Waseda Calendar. All rights reserved.</p>
    </div>
  </div>
</footer>

<script src="/events.js?v=6"></script>
<script src="/organizations.js?v=8"></script>
<script src="/organizations-page.js?v=13"></script>
<script src="/org-page.js?v=1"></script>
<script type="module" src="/firebase-init.js?v=3"></script>
<script src="/auth-ui.js?v=3"></script>
<script src="/pwa-install.js?v=2"></script>
</body>
</html>
`;
}

function main() {
  const { organizations, events } = loadDataModules();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 既存の生成物を一旦全て消してから作り直す（削除・改名された団体の古いページが残り続けるのを防ぐ）
  fs.readdirSync(OUTPUT_DIR)
    .filter((name) => name.endsWith('.html'))
    .forEach((name) => fs.unlinkSync(path.join(OUTPUT_DIR, name)));

  let indexableCount = 0;
  organizations.forEach((org) => {
    const html = renderOrgPageHtml(org, events);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${org.id}.html`), html, 'utf8');
    if (isOrgIndexEligible(org, events)) indexableCount++;
  });

  console.log(`org/*.html を生成しました（全${organizations.length}件、うち索引対象${indexableCount}件）。`);
}

main();
