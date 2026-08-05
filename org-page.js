/**
 * org-page.js - 団体個別詳細ページ (org.html?id=A-001 / org/{id}.html)
 * organizations-page.js の renderOrganizationDetail() を再利用して同じ内容を表示する。
 */

function findOrganizationById(orgId) {
  const orgs = typeof ORGANIZATIONS !== 'undefined' ? ORGANIZATIONS : [];
  return orgs.find(o => String(o.id) === String(orgId)) || null;
}

function renderOrgNotFound() {
  const wrap = document.getElementById('organization-detail');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <p>指定された団体が見つかりませんでした。</p>
      <p><a class="btn btn-ghost btn-sm" href="organizations.html">団体一覧に戻る</a></p>
    </div>`;
}

/** 団体個別ページの絶対URL。generate-org-pages.js と同じ形式を維持すること */
function buildOrgPageUrl(org) {
  return `https://wasedacalendar.com/org/${encodeURIComponent(org.id)}.html`;
}

function buildOrgJsonLd(org, pageUrl) {
  const sameAs = [org.instagramUrl, org.twitterUrl, org.websiteUrl].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: pageUrl,
    description: org.description || `${org.name}（早稲田大学公認サークル）`,
    memberOf: { '@type': 'CollegeOrUniversity', name: '早稲田大学' },
    sameAs: sameAs.length ? sameAs : undefined
  };
}

/** 団体個別ページのJSON-LDを<head>に埋め込む（この団体固有のURLを渡す） */
function injectOrgJsonLd(org) {
  const existing = document.getElementById('org-page-jsonld');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'org-page-jsonld';
  script.textContent = JSON.stringify(buildOrgJsonLd(org, buildOrgPageUrl(org)));
  document.head.appendChild(script);
}

/** 検索エンジンに索引させるだけの中身があるかどうか。scripts/generate-org-pages.js の
 *  isOrgIndexEligible と同じ判定（説明文・SNS/公式サイトリンク・関連イベントのいずれも無い
 *  団体はnoindexにする。ロジックを変える場合は両方直すこと）。 */
function isOrgIndexEligible(org) {
  const hasDescription = !!(org.description && org.description.trim());
  const hasSocialLinks = !!(org.instagramUrl || org.twitterUrl || org.websiteUrl);
  const hasEvents = getEventsForOrganization(org).length > 0 || getPastEventsForOrganization(org).length > 0;
  return hasDescription || hasSocialLinks || hasEvents;
}

/** タイトル・OGP・canonical・robotsを、表示中の団体の内容に書き換える（JSを実行するクローラー向けの補助）。
 *  canonicalは常に静的プリレンダリング版（org/{id}.html）を指す。旧 org.html?id=X 経由でも
 *  検索エンジンには「正規版はorg/{id}.htmlの方」と伝わる。 */
function updateOrgPageMeta(org) {
  const pageTitle = `${org.name} – Waseda Calendar`;
  const description = org.description
    ? org.description.replace(/\s+/g, ' ').trim().slice(0, 100)
    : `${org.name}（早稲田大学公認サークル・${org.genre || 'その他'}）の掲載イベント一覧。`;
  const url = buildOrgPageUrl(org);

  document.title = pageTitle;
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const setAttr = (id, attr, value) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, value); };

  setText('org-page-title', pageTitle);
  setAttr('org-page-description', 'content', description);
  setAttr('org-page-robots', 'content', isOrgIndexEligible(org) ? 'index, follow' : 'noindex, follow');
  setAttr('org-page-canonical', 'href', url);
  setAttr('org-page-og-title', 'content', pageTitle);
  setAttr('org-page-og-description', 'content', description);
  setAttr('org-page-og-url', 'content', url);
  setAttr('org-page-twitter-title', 'content', pageTitle);
  setAttr('org-page-twitter-description', 'content', description);
}

function renderOrgDetailPage(org) {
  updateOrgPageMeta(org);
  injectOrgJsonLd(org);
  renderOrganizationDetail(org, { headingTag: 'h1' });

  if (typeof gtag === 'function') {
    gtag('event', 'org_view', { org_id: org.id });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (hamburgerBtn && nav) {
    hamburgerBtn.addEventListener('click', () => {
      nav.classList.toggle('open');
      hamburgerBtn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!hamburgerBtn.contains(e.target) && !nav.contains(e.target)) {
        nav.classList.remove('open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // 新URL形式（org/A-001.html）にはクエリパラメータが無いため、パスからも抽出できるようにする。
  // 旧形式（org.html?id=A-001）は後方互換のため引き続きクエリパラメータを優先的に見る。
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/\/org\/([^/]+)\.html$/);
  const id = params.get('id') || (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
  const org = id ? findOrganizationById(id) : null;

  if (org) {
    renderOrgDetailPage(org);
  } else {
    renderOrgNotFound();
  }
});
