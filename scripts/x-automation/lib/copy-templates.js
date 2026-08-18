/**
 * copy-templates.js - 投稿文の生成(テンプレートベース、Claude API呼び出しなし)。
 *
 * なぜテンプレートベースか:
 * このプロジェクトでは「情報収集の判断」に外部の有料LLM APIを毎回呼ぶことをコスト面で
 * 既に見送っている(check-sources.js / .claude/skills/source-check を参照)。X投稿の文章生成を
 * 毎回Claude APIに投げる設計も同じ性質のコストを積み上げることになるため、まずは
 * バリエーション付きテンプレートで自然さと非AI的な実用性を両立させる。
 * (Claudeを本当に使うべき場面の判断は指示書14番の通り実装後の報告で整理する。)
 *
 * events.jsに存在しないフィールド(予約要否・初参加歓迎・残席状況等)は絶対に生成しない。
 * 存在する事実(日付・時間・場所・カテゴリ・URL)だけを組み立てる。
 */
const { CATEGORY_META } = require('./config');

const X_URL_WEIGHT = 23; // t.co短縮後の固定重み
const URL_PATTERN = /https?:\/\/\S+/g;

/** ASCII/絵文字/CJKそれぞれの重みを1文字ずつ積算する下請け(URLは呼び出し元で別処理する)。 */
function weightedLengthRaw(str) {
  let total = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    const isWide =
      (code >= 0x1100 && code <= 0x115f) || // ハングル字母
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK部首・漢字・かな・ハングル等
      (code >= 0xac00 && code <= 0xd7a3) || // ハングル音節
      (code >= 0xf900 && code <= 0xfaff) || // CJK互換漢字
      (code >= 0xff00 && code <= 0xff60) || // 全角記号
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff) || // 絵文字
      (code >= 0x2600 && code <= 0x27bf); // 記号・絵文字
    total += isWide ? 2 : 1;
  }
  return total;
}

/**
 * Xの重み付き文字数。URLは実際の長さに関わらずt.co短縮後の23固定になるため、
 * 本文中のURL部分だけ23として計算し、それ以外はCJK/絵文字=2・ASCII=1で積算する。
 * (これを実装しないと、UTM付きの長いURLを含む文章を実際より大幅に長く誤判定してしまう。)
 */
function weightedLength(str) {
  const urls = str.match(URL_PATTERN) || [];
  let withoutUrls = str;
  urls.forEach((u) => { withoutUrls = withoutUrls.replace(u, ''); });
  return weightedLengthRaw(withoutUrls) + urls.length * X_URL_WEIGHT;
}

const X_MAX_WEIGHT = 280;
/** 本文(URLを除く部分)に使ってよい重みの上限。安全マージンとして少し余裕を残す。 */
const TEXT_BUDGET = X_MAX_WEIGHT - X_URL_WEIGHT - 4;

function truncateTitle(title, maxChars = 22) {
  const chars = Array.from(title);
  if (chars.length <= maxChars) return title;
  return chars.slice(0, maxChars).join('') + '…';
}

function formatEventLine(ev, { withTime = true, maxChars = 22 } = {}) {
  const meta = CATEGORY_META[ev.category] || CATEGORY_META.other;
  const title = truncateTitle(ev.title, maxChars);
  const time = withTime && ev.startTime ? `｜${ev.startTime}` : '';
  return `${meta.emoji} ${title}${time}`;
}

/** 日付を "8/18" のような短い表記にする */
function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** シードから決定論的に配列のインデックスを選ぶ(同じ日は同じ結果、日が変われば変わりやすい) */
function pickIndex(seed, length) {
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  }
  return hash % length;
}

function pickVariant(list, seed) {
  return list[pickIndex(seed, list.length)];
}

/** 本文がTEXT_BUDGETを超えていたら末尾の行から削って収める(安全弁。通常は各投稿タイプ側の件数上限で収まる想定)。 */
function fitToBudget(lines, headerLines, footerLines) {
  let body = lines.slice();
  while (weightedLength([...headerLines, ...body, ...footerLines].join('\n')) > TEXT_BUDGET && body.length > 0) {
    body = body.slice(0, -1);
  }
  const truncated = body.length < lines.length;
  return { lines: body, truncated };
}

/* ============================================================
   A. 今日の早稲田
   ============================================================ */
const TODAY_HEADERS = (dateStr) => [
  `【今日の早稲田｜${shortDate(dateStr)}】`,
  `【本日開催｜${shortDate(dateStr)}の早稲田】`,
  `早稲田、今日はこんな日です(${shortDate(dateStr)})`,
];
const TODAY_INTROS = ['今日開催されるイベントはこちら', '今日はこんなイベントがあります', '本日のラインナップ'];
const TODAY_FOOTERS = ['今日のイベントを見る👇', 'くわしくはこちら👇', '全部見る👇'];

function composeTodayPost({ dateStr, events, url, omittedCount }) {
  const seed = `today:${dateStr}`;
  const header = pickVariant(TODAY_HEADERS(dateStr), seed);
  const intro = pickVariant(TODAY_INTROS, seed + ':intro');
  const footer = pickVariant(TODAY_FOOTERS, seed + ':footer');
  const lines = events.map((ev) => formatEventLine(ev));
  const { lines: fitted, truncated } = fitToBudget(lines, [header, intro], [footer]);
  const extraNote = truncated || omittedCount > 0
    ? [`他にも${(omittedCount || 0) + (lines.length - fitted.length)}件`]
    : [];
  const text = [header, '', intro, ...fitted, ...extraNote, '', footer, url].join('\n');
  return { text };
}

/* ============================================================
   B. 今週の早稲田
   ============================================================ */
const WEEKLY_HEADERS = (fromStr, toStr) => [
  `【今週の早稲田｜${shortDate(fromStr)}〜${shortDate(toStr)}】`,
  `【早稲田ウィークリー｜${shortDate(fromStr)}〜${shortDate(toStr)}】`,
  `今週行けるイベントまとめ(${shortDate(fromStr)}〜${shortDate(toStr)})`,
];
const WEEKLY_INTROS = ['今週行けるイベントをまとめました', '今週の早稲田はこんな感じです', '今週のおすすめラインナップ'];
const WEEKLY_FOOTERS = ['今週のイベントはこちら👇', 'くわしくはこちら👇', '全件はこちら👇'];

/** 週次投稿の日付表示: 今週すでに始まっている複数日イベント(長期展示等)は開始日でなく
 *  終了日を「〜X/X」で示す方が「今週行けるか」の判断に役立つ。まだ始まっていなければ開始日を示す。 */
function weeklyDateLabel(ev, fromStr) {
  if (ev.endDate && ev.date < fromStr) {
    return `〜${shortDate(ev.endDate)}`;
  }
  return shortDate(ev.date);
}

function composeWeeklyPost({ fromStr, toStr, diversified, url }) {
  const seed = `weekly:${fromStr}`;
  const header = pickVariant(WEEKLY_HEADERS(fromStr, toStr), seed);
  const intro = pickVariant(WEEKLY_INTROS, seed + ':intro');
  const footer = pickVariant(WEEKLY_FOOTERS, seed + ':footer');

  const bodyLines = [];
  diversified.selected.forEach(({ category, events }) => {
    const meta = CATEGORY_META[category] || CATEGORY_META.other;
    bodyLines.push(`${meta.emoji} ${meta.label}`);
    events.forEach((ev) => {
      bodyLines.push(`　${truncateTitle(ev.title, 20)}(${weeklyDateLabel(ev, fromStr)})`);
    });
  });

  const { lines: fitted, truncated } = fitToBudget(bodyLines, [header, intro], [footer]);
  const remainingNote = (!truncated && diversified.totalEligible > fitted.filter((l) => l.startsWith('　')).length)
    ? [`他にも今週${diversified.totalEligible}件開催予定`]
    : [];
  const text = [header, '', intro, ...fitted, ...remainingNote, '', footer, url].join('\n');
  return { text };
}

/* ============================================================
   C. 今日このあと
   ============================================================ */
const LATER_HEADERS = ['【今日このあと】', '【まもなく開催】', 'もうすぐ始まります'];
const LATER_FOOTERS = ['詳細はこちら👇', 'くわしくはこちら👇'];

function composeLaterTodayPost({ ev, url }) {
  const seed = `later:${ev.date}:${ev.id}`;
  const header = pickVariant(LATER_HEADERS, seed);
  const footer = pickVariant(LATER_FOOTERS, seed + ':footer');
  const meta = CATEGORY_META[ev.category] || CATEGORY_META.other;
  const locationLine = ev.location ? [`📍${ev.location}`] : [];
  const bodyLine = `${ev.startTime}から${meta.emoji}${truncateTitle(ev.title, 40)}があります。`;
  const text = [header, '', bodyLine, ...locationLine, '', footer, url].join('\n');
  return { text };
}

/* ============================================================
   D. テーマ型投稿
   ============================================================ */
const THEME_HEADERS = {
  publicWelcome: ['一般参加できるイベント、今週はこちら', '学外の方も参加できるイベントまとめ', '一般参加OKなイベント特集'],
  cultureAndTalks: ['文化・講演イベント、今週のラインナップ', '文化系・学びのイベントまとめ', '今週の文化・講演イベント'],
  weekend: ['週末のイベント、まとめました', 'この週末、早稲田で', '週末に行けるイベント特集'],
};
const THEME_FOOTERS = ['くわしくはこちら👇', '詳細を見る👇', '全部見る👇'];

function composeThemePost({ themeKey, dateStr, diversified, url }) {
  const seed = `theme:${themeKey}:${dateStr}`;
  const header = pickVariant(THEME_HEADERS[themeKey] || THEME_HEADERS.publicWelcome, seed);
  const footer = pickVariant(THEME_FOOTERS, seed + ':footer');

  const bodyLines = [];
  diversified.selected.forEach(({ events }) => {
    events.forEach((ev) => bodyLines.push(formatEventLine(ev, { maxChars: 20 })));
  });

  const { lines: fitted } = fitToBudget(bodyLines, [header], [footer]);
  const text = [header, '', ...fitted, '', footer, url].join('\n');
  return { text };
}

/* ============================================================
   E. おすすめ機能誘導
   ============================================================ */
const RECOMMEND_VARIANTS = [
  '今週末、何するか決まっていない人へ。\nいくつかの質問に答えると、今行けるイベントを3つ提案します。',
  'まだ予定が決まってない人向け。\n簡単な質問に答えるだけで、早稲田のイベントを3つ提案するミニ機能があります。',
  '何かしたいけど決まらない、そんな時に。\n質問に答えると、条件に合うイベントを最大3件おすすめします。',
];
const RECOMMEND_FOOTERS = ['試してみる👇', 'こちらから👇', '使ってみる👇'];

function composeRecommendPost({ dateStr, url }) {
  const seed = `recommend:${dateStr}`;
  const body = pickVariant(RECOMMEND_VARIANTS, seed);
  const footer = pickVariant(RECOMMEND_FOOTERS, seed + ':footer');
  const text = [body, '', footer, url].join('\n');
  return { text };
}

module.exports = {
  weightedLength,
  X_MAX_WEIGHT,
  X_URL_WEIGHT,
  truncateTitle,
  formatEventLine,
  shortDate,
  composeTodayPost,
  composeWeeklyPost,
  composeLaterTodayPost,
  composeThemePost,
  composeRecommendPost,
};
