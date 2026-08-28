#!/usr/bin/env node
/**
 * generate-event-pages.js - events.js を読み込み、イベントごとの静的HTML(event/{id}.html)を生成する。
 *
 * 実行方法: node scripts/generate-event-pages.js
 * events.js を更新した後（新規イベント追加時など）に実行してください。
 * ビルドツール・npm依存なしで動く単純なNodeスクリプトです（generate-sitemap.js と同じ構成）。
 *
 * なぜ必要か: event.html は1つの共通シェルで、event-page.js が ?id=evt-XXX を見て
 * クライアントJSでtitle/meta/OGP/JSON-LDを書き換える方式のため、JSを実行しないクローラーや
 * LINE/X等のシェアプレビューボットには、どのイベントも同じ汎用内容にしか見えない。
 * GitHub Pagesはクエリ文字列でルーティングできないため、イベントごとに実体の異なる
 * 静的ファイルを生成する（event/{id}.html）ことで解決する。
 *
 * ここで使う整形ロジック（escapeHtml/formatEventDateDisplay/buildEventJsonLd 等）は
 * script.js / event-page.js にあるブラウザ向け関数の複製。ビルドツールが無く
 * ブラウザ/Node間でコードを共有する手段が無いため、意図的に複製している。
 * スキーマ（buildEventJsonLd）を変更する場合は script.js 側と両方直すこと。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE_ORIGIN = 'https://wasedacalendar.com';
const OUTPUT_DIR = path.join(ROOT, 'event');
const OGP_IMAGE_DIR = path.join(ROOT, 'x-post-images');

/**
 * イベント固有のOGP画像(1200x630、scripts/generate-og-images.htmlで生成)が
 * x-post-images/{id}.png にあればそのURLを、無ければサイト共通の汎用画像を返す。
 * 生成し忘れたイベントがあっても壊れず汎用画像にフォールバックするだけなので、
 * 全件そろっている必要はない(新規イベント追加時の生成手順はCLAUDE.md参照)。
 */
function ogImageFor(ev) {
  const localPath = path.join(OGP_IMAGE_DIR, `${ev.id}.png`);
  if (fs.existsSync(localPath)) {
    return { url: `${SITE_ORIGIN}/x-post-images/${ev.id}.png`, width: 1200, height: 630 };
  }
  return { url: `${SITE_ORIGIN}/assets/og-image.png?v=1`, width: 1731, height: 909 };
}

/** events.js は <script> 読み込み前提のプレーンJSなので、vmで安全に実行して必要な値だけ取り出す。
 *  events.js側の宣言は全て const/let で、vmのサンドボックスオブジェクトのプロパティとしては
 *  現れない（varなら現れる）ため、末尾に var 経由で明示的に拾い直す一行を足している。 */
function loadEventsModule() {
  const src = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  const exportLine = '\nvar __EXPORTED__ = {' +
    ' EVENTS: (typeof EVENTS !== "undefined") ? EVENTS : undefined,' +
    ' CATEGORY_LABELS: (typeof CATEGORY_LABELS !== "undefined") ? CATEGORY_LABELS : undefined,' +
    ' CAMPUS_LABELS: (typeof CAMPUS_LABELS !== "undefined") ? CAMPUS_LABELS : undefined,' +
    ' FEE_LABELS: (typeof FEE_LABELS !== "undefined") ? FEE_LABELS : undefined,' +
    ' TARGET_LABELS: (typeof TARGET_LABELS !== "undefined") ? TARGET_LABELS : undefined' +
    ' };';
  vm.runInContext(src + exportLine, sandbox, { filename: 'events.js' });
  const exported = sandbox.__EXPORTED__ || {};
  return {
    events: Array.isArray(exported.EVENTS) ? exported.EVENTS : [],
    CATEGORY_LABELS: exported.CATEGORY_LABELS || {},
    CAMPUS_LABELS: exported.CAMPUS_LABELS || {},
    FEE_LABELS: exported.FEE_LABELS || {},
    TARGET_LABELS: exported.TARGET_LABELS || {}
  };
}

/* ============================================================
   以下、script.js / event-page.js の同名関数の複製（DOM非依存の純粋関数のみ）
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

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${y}年${m}月${d}日（${WEEKDAY_JP[date.getDay()]}）`;
}

function getEventEnd(ev) {
  return ev.endDate || ev.date;
}

function isMultiDay(ev) {
  return getEventEnd(ev) !== ev.date;
}

/** 開催終了済みかどうか。script.js の isEventEnded/endedTagHTML の複製。ビルド時点の「今日」で判定するため、
 *  終了直後のイベントは次回の自動再生成（events.js更新時のGitHub Actions）まで反映が遅れる場合がある。 */
/** 今日の日付文字列 YYYY-MM-DD。Asia/Tokyo(UTC+9、DSTなし)固定で判定する。
 *  GitHub Actions(UTC)で実行しても、ブラウザ側(script.jsのgetTodayStr)の
 *  「今日」と最大9時間ズレないようにするため。 */
function todayStrJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

function isEventEnded(ev) {
  return getEventEnd(ev) < todayStrJST();
}

function endedTagHTML(ev) {
  return isEventEnded(ev) ? '<span class="tag tag-ended">終了しました</span>' : '';
}

function formatEventDateDisplay(ev) {
  if (!isMultiDay(ev)) return formatDateDisplay(ev.date);
  const [ey, em, ed] = ev.endDate.split('-').map(Number);
  const endDate = new Date(ey, em - 1, ed);
  return `${formatDateDisplay(ev.date)}〜${em}月${ed}日（${WEEKDAY_JP[endDate.getDay()]}）`;
}

function formatTime(start, end) {
  if (!start) return '';
  if (!end) return `${start}〜`;
  return `${start}〜${end}`;
}

function makeLabelFn(labels) {
  return (key) => labels[key] || key || '—';
}

function makeTargetLabelFn(labels) {
  return (val) => {
    if (!val || val.length === 0) return '—';
    const arr = Array.isArray(val) ? val : [val];
    return arr.map((t) => labels[t] || t).join('・');
  };
}

function categoryClass(key) {
  const map = {
    sports: 'tag-sports', culture: 'tag-culture', music: 'tag-music',
    theater: 'tag-theater', lecture: 'tag-lecture', community: 'tag-community',
    other: 'tag-other'
  };
  return map[key] || 'tag-other';
}

function feeClass(key) {
  if (key === 'free') return 'tag-free';
  if (key === 'paid') return 'tag-paid';
  return 'tag-unknown';
}

/** script.js の participationChipsHTML と同じロジック（静的生成用に複製）。ロジックを変える場合は両方直すこと。 */
function participationChipsHTML(ev) {
  const targets = Array.isArray(ev.target) ? ev.target : (ev.target ? [ev.target] : []);
  const chips = [];
  if (targets.includes('public')) {
    chips.push('<span class="tag tag-audience">👤 一般参加OK</span>');
  } else if (targets.length > 0 && targets.every((t) => t === 'student')) {
    chips.push('<span class="tag tag-audience">👤 在学生限定</span>');
  }
  if (targets.includes('obog')) {
    chips.push('<span class="tag tag-audience">🎓 OBOG参加可</span>');
  }
  if (targets.includes('applicant')) {
    chips.push('<span class="tag tag-audience">📝 受験生向け</span>');
  }
  return chips.join('');
}

/** script.js の buildMapsSearchUrl と同じロジック（静的生成用に複製）。ロジックを変える場合は両方直すこと。 */
function buildMapsSearchUrl(ev) {
  if (!ev.location || ev.campus === 'online') return null;
  const onCampus = ev.campus && ev.campus !== 'outside' && ev.campus !== 'online';
  const query = onCampus ? `早稲田大学 ${ev.location}` : ev.location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** 主催団体の表示。orgIdが設定されている場合は団体ページへのリンクにする */
function organizerHTML(ev) {
  const text = escapeHtml(ev.organizer || '—');
  if (!ev.orgId) return text;
  return `<a href="${SITE_ORIGIN}/organizations.html?id=${encodeURIComponent(ev.orgId)}" class="organizer-link">${text}</a>`;
}

/** OGP用の説明文（改行を除去し、長すぎる場合は切り詰める）。event-page.js の buildOgDescription の複製 */
function buildOgDescription(ev) {
  const base = ev.description ? ev.description.replace(/\s+/g, ' ').trim() : '';
  const text = base || `${formatEventDateDisplay(ev)} ${ev.organizer || ''}`.trim();
  return text.length > 100 ? text.slice(0, 100) + '…' : text;
}

/** イベント個別ページの絶対URL。script.js の buildEventPageUrl と同じ形式を維持すること */
function buildEventPageUrl(ev) {
  return `${SITE_ORIGIN}/event/${encodeURIComponent(ev.id)}.html`;
}

const CAMPUS_ADDRESS = {
  waseda: { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '西早稲田1-6-1' },
  toyama: { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '戸山1-24-1' },
  nishiwaseda: { addressRegion: '東京都', addressLocality: '新宿区', streetAddress: '大久保3-4-1' },
  tokorozawa: { addressRegion: '埼玉県', addressLocality: '所沢市', streetAddress: '三ヶ島2-579-15' }
};

/** schema.org/Event のJSON-LD。script.js の buildEventJsonLd と同じ出力になるよう維持すること */
function buildEventJsonLd(ev, pageUrl, campusLabel) {
  const url = pageUrl || `${SITE_ORIGIN}/`;
  const isOnline = ev.campus === 'online';
  const campusAddress = CAMPUS_ADDRESS[ev.campus];
  const isPerformance = ev.category === 'music' || ev.category === 'theater';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    url,
    startDate: ev.startTime ? `${ev.date}T${ev.startTime}:00+09:00` : ev.date,
    endDate: ev.endTime ? `${getEventEnd(ev)}T${ev.endTime}:00+09:00` : (ev.endDate || undefined),
    eventAttendanceMode: isOnline
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: isOnline
      ? { '@type': 'VirtualLocation', url: ev.externalUrl || url }
      : {
          '@type': 'Place',
          name: ev.location || campusLabel(ev.campus),
          address: campusAddress ? { '@type': 'PostalAddress', addressCountry: 'JP', ...campusAddress } : { '@type': 'PostalAddress', addressCountry: 'JP' }
        },
    image: ev.imageUrl || ogImageFor(ev).url,
    description: ev.description || ev.title,
    organizer: { '@type': 'Organization', name: ev.organizer || 'Waseda Calendar', url: ev.externalUrl || undefined },
    performer: isPerformance ? { '@type': 'PerformingGroup', name: ev.organizer || 'Waseda Calendar' } : undefined
  };

  if (ev.feeType === 'free') {
    data.offers = {
      '@type': 'Offer', price: '0', priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
      validFrom: ev.lastUpdated ? `${ev.lastUpdated}T00:00:00+09:00` : undefined,
      url
    };
  }

  return data;
}

/** HTMLの<script type="application/ld+json">内に安全に埋め込むためのエスケープ。
 *  説明文等に "</script" という文字列が偶然含まれていてもタグが閉じてしまわないようにする。 */
function jsonLdScriptSafe(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

/* ============================================================
   ページ生成
   ============================================================ */

function renderEventPageHtml(ev, labelFns) {
  const { categoryLabel, campusLabel, feeLabel, targetLabel } = labelFns;
  const pageUrl = buildEventPageUrl(ev);
  const pageTitle = `${escapeHtml(ev.title)} – Waseda Calendar`;
  const description = escapeHtml(buildOgDescription(ev));
  const jsonLd = jsonLdScriptSafe(buildEventJsonLd(ev, pageUrl, campusLabel));
  const ogImage = ogImageFor(ev);

  const extLinkHTML = ev.externalUrl
    ? `<a href="${escapeHtml(ev.externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-enjy" onclick="trackEventExternalLinkClick('${escapeHtml(String(ev.id))}')">公式・詳細情報を見る ↗</a>`
    : '';
  const mapsUrl = buildMapsSearchUrl(ev);
  const mapLinkHTML = mapsUrl
    ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="event-map-link" onclick="trackEventMapClick('${escapeHtml(String(ev.id))}')">🗺 Googleマップで見る ↗</a>`
    : '';
  const chipsHTML = participationChipsHTML(ev);

  const detailContent = `
    <div class="modal-header event-page-header">
      <h1 class="modal-title">${escapeHtml(ev.title)}</h1>
    </div>
    <div class="modal-body">
      <div class="modal-tags mb-2">
        ${endedTagHTML(ev)}
        <span class="tag ${categoryClass(ev.category)}">${escapeHtml(categoryLabel(ev.category))}</span>
      </div>

      <div class="event-hero-info">
        <div class="event-hero-row">📅 ${formatEventDateDisplay(ev)}${ev.startTime ? `　${escapeHtml(formatTime(ev.startTime, ev.endTime))}` : '　終日'}</div>
        <div class="event-hero-row">📍 ${escapeHtml(ev.location || '場所は未定・確認中です')}</div>
      </div>

      <div class="event-participation-box">
        <p class="event-participation-title">参加について</p>
        <div class="event-participation-chips">
          ${chipsHTML}
          <span class="tag ${feeClass(ev.feeType)}">💴 ${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
        </div>
        ${mapLinkHTML}
        ${extLinkHTML ? `<div class="event-participation-cta">${extLinkHTML}</div>` : ''}
      </div>

      ${ev.description ? `
      <div>
        <p class="modal-desc-label">イベント説明</p>
        <p class="modal-desc-text">${escapeHtml(ev.description)}</p>
      </div>` : ''}

      <div class="modal-detail-grid event-secondary-info">
        <div class="modal-detail-item">
          <span class="modal-detail-label">主催団体</span>
          <span class="modal-detail-value">${organizerHTML(ev)}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">キャンパス区分</span>
          <span class="modal-detail-value">${escapeHtml(campusLabel(ev.campus))}</span>
        </div>
        <div class="modal-detail-item">
          <span class="modal-detail-label">対象者</span>
          <span class="modal-detail-value">${escapeHtml(targetLabel(ev.target))}</span>
        </div>
      </div>

      <div class="modal-footer">
        <span class="modal-updated">${ev.lastUpdated ? `最終更新: ${escapeHtml(ev.lastUpdated)}` : ''}</span>
      </div>
    </div>`;

  // リソース読み込み・ナビゲーションリンクはルート相対パス(先頭/)を使う。event/{id}.html は
  // ルート直下のevent.htmlより1階層深いため、他ページと同じ相対パス表記(style.css等)は使えない。
  // canonical/og:url/JSON-LDのURLだけは仕様上、絶対URL(pageUrl、SITE_ORIGIN)である必要がある。
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
  <meta name="description" content="${description}" id="event-page-description">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}" id="event-page-canonical">
  <meta name="theme-color" content="#8B0000">
  <!-- OGP（この静的ページはビルド時に実際の値を埋め込み済み。event-page.js が読み込まれても同じ値に上書きするだけなので無害） -->
  <meta property="og:title" content="${pageTitle}" id="event-page-og-title">
  <meta property="og:description" content="${description}" id="event-page-og-description">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}" id="event-page-og-url">
  <meta property="og:image" content="${ogImage.url}">
  <meta property="og:image:width" content="${ogImage.width}">
  <meta property="og:image:height" content="${ogImage.height}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}" id="event-page-twitter-title">
  <meta name="twitter:description" content="${description}" id="event-page-twitter-description">
  <meta name="twitter:image" content="${ogImage.url}">
  <meta name="twitter:image:alt" content="${pageTitle}">
  <title id="event-page-title">${pageTitle}</title>
  <link rel="icon" type="image/png" href="/assets/icon.png?v=2">
  <link rel="manifest" href="/assets/manifest.json?v=2">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=40">
  <script type="application/ld+json" id="event-page-jsonld">${jsonLd}</script>
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
      <div id="event-detail" class="event-detail-page">${detailContent}
      </div>
      <div id="event-related"></div>
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
<script src="/script.js?v=32"></script>
<script src="/image-generator.js?v=5"></script>
<script src="/event-page.js?v=10"></script>
<script type="module" src="/firebase-init.js?v=3"></script>
<script src="/auth-ui.js?v=3"></script>
<script src="/pwa-install.js?v=3"></script>
</body>
</html>
`;
}

function main() {
  const { events, CATEGORY_LABELS, CAMPUS_LABELS, FEE_LABELS, TARGET_LABELS } = loadEventsModule();
  const labelFns = {
    categoryLabel: makeLabelFn(CATEGORY_LABELS),
    campusLabel: makeLabelFn(CAMPUS_LABELS),
    feeLabel: makeLabelFn(FEE_LABELS),
    targetLabel: makeTargetLabelFn(TARGET_LABELS)
  };
  const publishedEvents = events.filter((ev) => ev.isPublished);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 既存の生成物を一旦全て消してから作り直す（isPublished:falseに変わった・削除されたイベントの
  // 古いページが残り続けるのを防ぐため）
  fs.readdirSync(OUTPUT_DIR)
    .filter((name) => name.endsWith('.html'))
    .forEach((name) => fs.unlinkSync(path.join(OUTPUT_DIR, name)));

  publishedEvents.forEach((ev) => {
    const html = renderEventPageHtml(ev, labelFns);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${ev.id}.html`), html, 'utf8');
  });

  console.log(`event/*.html を生成しました（${publishedEvents.length}件）。`);
}

main();
