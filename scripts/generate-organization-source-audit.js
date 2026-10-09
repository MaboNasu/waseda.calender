#!/usr/bin/env node
/**
 * generate-organization-source-audit.js
 *
 * organizations.js の全団体を1件ずつ sources.json と突合し、
 * 「自動監視できるWeb情報源があるか」を504件すべて明示する。
 *
 * 方針:
 * - Instagram / X(Twitter) / TikTok はプロフィール情報・手動確認用であり、自動監視しない。
 * - 自動監視ソースが無いこと自体はエラーではない。sns-only / guide-only / none を正直に残す。
 * - --check は 504/504 の網羅、orgId整合性、SNS自動監視禁止、監査JSONの同期を検証する。
 *
 * Usage:
 *   node scripts/generate-organization-source-audit.js
 *   node scripts/generate-organization-source-audit.js --check
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(__dirname, 'organization-source-audit.json');
const EXPECTED_ORGANIZATION_COUNT = 504;
const SOCIAL_HOSTS = new Set([
  'instagram.com', 'www.instagram.com',
  'x.com', 'www.x.com',
  'twitter.com', 'www.twitter.com',
  'tiktok.com', 'www.tiktok.com'
]);

const WEB_VERIFIED_2026_10_09 = {
  'B-022': '現行の早稲田大学公認サークルガイドページ(id=3810)を確認。',
  'B-035': '現行の早稲田大学公認サークルガイドページ(id=3807)を確認。',
  'C-155': '公認軟式野球サークルの公式Wixサイトを確認。',
  'C-291': '早稲田ウィークリー掲載の公式SNSアカウントをプロフィール情報として確認。',
  'C-308': '2026年の団体紹介でX/Instagram @amis_waseda を確認。',
  'C-314': '現行の早稲田大学公認サークルガイドページ(id=3812)を確認。',
  'C-315': '現行の早稲田大学公認サークルガイドページ(id=3808)を確認。',
  'C-317': '現行サークルガイド(id=3811)と公式サイト wasedaaiclub.com を確認。',
  'C-318': '現行の早稲田大学公認サークルガイドページ(id=3814)を確認。',
  'C-319': '現行の早稲田大学公認サークルガイドページ(id=3813)を確認。',
  'C-320': '現行サークルガイド(id=3809)と公式Webサイトを確認。',
  'C-321': '2026年も活動中の公式X/Instagram @conan_waseda を確認。',
  'C-322': '公式サイト algo6le.main.jp と公式SNSを確認。'
};

function loadOrganizations() {
  const src = fs.readFileSync(path.join(ROOT, 'organizations.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src + '\nvar __AUDIT_ORGS__ = typeof ORGANIZATIONS !== "undefined" ? ORGANIZATIONS : [];', sandbox, {
    filename: 'organizations.js'
  });
  return Array.isArray(sandbox.__AUDIT_ORGS__) ? sandbox.__AUDIT_ORGS__ : [];
}

function loadSources() {
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
  return Array.isArray(parsed.sources) ? parsed.sources : [];
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ''; }
}

function isSocialUrl(url) {
  return SOCIAL_HOSTS.has(hostOf(url));
}

function inferSourceRole(source) {
  if (source.sourceRole) return source.sourceRole;
  const url = String(source.url || '').toLowerCase();
  const notes = String(source.notes || '').toLowerCase();

  if (/(corich\.jp|escape\.id|connpass\.com|camp-fire\.jp)/.test(url)
      || /補完ソース|プラットフォーム|upstream/.test(notes)) return 'upstream';
  if (/(ameblo\.jp|wordpress\.com|\/blog(?:\/|$))/.test(url)) return 'official-blog';
  if (/(schedule|event|events|concert|performance|stages|live-information|game20\d\d)/.test(url)) return 'event-page';
  return 'official-site';
}

function roleScore(role) {
  return ({
    'event-page': 50,
    'official-blog': 40,
    'official-site': 30,
    'upstream': 20
  })[role] || 10;
}

function compactSource(source) {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    priority: source.priority || null,
    sourceType: source.sourceType || null,
    sourceRole: inferSourceRole(source),
    cloudAccessible: source.cloudAccessible !== false,
    preferredReader: source.preferredReader || null,
    jsRendered: source.jsRendered === true,
    lastChecked: source.lastChecked || null
  };
}

function classify(org, mappedSources) {
  if (mappedSources.length) {
    const ranked = [...mappedSources].sort((a, b) => {
      const roleDiff = roleScore(inferSourceRole(b)) - roleScore(inferSourceRole(a));
      if (roleDiff) return roleDiff;
      const priorityScore = { A: 3, B: 2, C: 1 };
      return (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
    });
    return {
      sourceClass: inferSourceRole(ranked[0]),
      automatable: true,
      bestEventSourceUrl: ranked[0].url || null
    };
  }

  if (org.websiteUrl) {
    return { sourceClass: 'profile-site-only', automatable: false, bestEventSourceUrl: null };
  }
  if (org.instagramUrl || org.twitterUrl) {
    return { sourceClass: 'sns-only', automatable: false, bestEventSourceUrl: null };
  }
  if (org.guideUrl) {
    return { sourceClass: 'guide-only', automatable: false, bestEventSourceUrl: null };
  }
  return { sourceClass: 'none', automatable: false, bestEventSourceUrl: null };
}

function latestCheck(sources) {
  const values = sources.map(s => s.lastChecked).filter(Boolean).sort();
  return values.length ? values[values.length - 1] : null;
}

function buildAudit() {
  const organizations = loadOrganizations();
  const sources = loadSources();
  const orgIds = new Set(organizations.map(org => String(org.id)));

  const invalidMappedSources = sources.filter(src => src.orgId && !orgIds.has(String(src.orgId)));
  if (invalidMappedSources.length) {
    throw new Error('sources.json に存在しない orgId: ' + invalidMappedSources.map(s => `${s.id}=>${s.orgId}`).join(', '));
  }

  const socialAutomated = sources.filter(src => isSocialUrl(src.url));
  if (socialAutomated.length) {
    throw new Error('SNS URL は自動監視できません: ' + socialAutomated.map(s => s.id).join(', '));
  }

  const byOrg = new Map();
  sources.forEach(source => {
    if (!source.orgId) return;
    const key = String(source.orgId);
    if (!byOrg.has(key)) byOrg.set(key, []);
    byOrg.get(key).push(source);
  });

  const records = organizations.map(org => {
    const mappedSources = byOrg.get(String(org.id)) || [];
    const classification = classify(org, mappedSources);
    const webVerificationNote = WEB_VERIFIED_2026_10_09[String(org.id)] || null;

    let verificationStatus = 'repository-profile';
    if (webVerificationNote) verificationStatus = 'web-verified-2026-10-09';
    else if (mappedSources.length && latestCheck(mappedSources)) verificationStatus = 'automated-source-checked';
    else if (!org.guideUrl && !org.websiteUrl && !org.instagramUrl && !org.twitterUrl) verificationStatus = 'unresolved';

    return {
      orgId: org.id,
      name: org.name,
      genre: org.genre || null,
      registrationType: org.registrationType || null,
      guideUrl: org.guideUrl || null,
      websiteUrl: org.websiteUrl || null,
      instagramUrl: org.instagramUrl || null,
      twitterUrl: org.twitterUrl || null,
      automatedSources: mappedSources.map(compactSource),
      bestEventSourceUrl: classification.bestEventSourceUrl,
      sourceClass: classification.sourceClass,
      automatable: classification.automatable,
      lastAutomatedCheck: latestCheck(mappedSources),
      verificationStatus,
      verificationNote: webVerificationNote
    };
  });

  const sourceClassCounts = {};
  records.forEach(record => {
    sourceClassCounts[record.sourceClass] = (sourceClassCounts[record.sourceClass] || 0) + 1;
  });

  const summary = {
    totalOrganizations: records.length,
    automatableOrganizations: records.filter(r => r.automatable).length,
    nonAutomatableOrganizations: records.filter(r => !r.automatable).length,
    withOfficialGuide: records.filter(r => r.guideUrl).length,
    withWebsite: records.filter(r => r.websiteUrl).length,
    withSocialProfile: records.filter(r => r.instagramUrl || r.twitterUrl).length,
    unresolvedNoLinks: records.filter(r => !r.guideUrl && !r.websiteUrl && !r.instagramUrl && !r.twitterUrl).length,
    sourceClassCounts
  };

  return {
    schemaVersion: 1,
    policy: {
      universe: 'organizations.js の全504団体',
      automatedSocialMonitoring: false,
      socialPolicy: 'Instagram / X(Twitter) / TikTok はプロフィール・手動確認用途のみ。自動fetch/hash監視には使用しない。',
      unresolvedPolicy: '安定したWeb情報源が見つからない団体も none / sns-only / guide-only として明示し、推測でURLを作らない。'
    },
    summary,
    records
  };
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function validate(audit) {
  const errors = [];
  if (audit.records.length !== EXPECTED_ORGANIZATION_COUNT) {
    errors.push(`団体数が ${audit.records.length} 件です。期待値は ${EXPECTED_ORGANIZATION_COUNT} 件。`);
  }
  const ids = new Set();
  audit.records.forEach(record => {
    if (ids.has(String(record.orgId))) errors.push(`orgId重複: ${record.orgId}`);
    ids.add(String(record.orgId));
    record.automatedSources.forEach(src => {
      if (isSocialUrl(src.url)) errors.push(`SNS自動監視: ${record.orgId} / ${src.id}`);
    });
  });
  const classTotal = Object.values(audit.summary.sourceClassCounts).reduce((sum, n) => sum + n, 0);
  if (classTotal !== audit.records.length) errors.push('sourceClassCounts の合計が団体総数と一致しません。');
  return errors;
}

const audit = buildAudit();
const errors = validate(audit);
if (errors.length) {
  errors.forEach(err => console.error('❌ ' + err));
  process.exit(1);
}

const outputText = stableJson(audit);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUTPUT)) {
    console.error('❌ organization-source-audit.json がありません。生成してください。');
    process.exit(1);
  }
  const existing = fs.readFileSync(OUTPUT, 'utf8');
  if (existing !== outputText) {
    console.error('❌ organization-source-audit.json が organizations.js / sources.json と同期していません。');
    process.exit(1);
  }
  console.log(`✅ 組織情報源監査: ${audit.summary.totalOrganizations}/${EXPECTED_ORGANIZATION_COUNT} 件 accounted for`);
  console.log(`   自動監視可能: ${audit.summary.automatableOrganizations} / 非自動: ${audit.summary.nonAutomatableOrganizations}`);
  console.log(`   sourceClass: ${JSON.stringify(audit.summary.sourceClassCounts)}`);
} else {
  fs.writeFileSync(OUTPUT, outputText, 'utf8');
  console.log(`organization-source-audit.json を生成しました（${audit.records.length}件）。`);
}
