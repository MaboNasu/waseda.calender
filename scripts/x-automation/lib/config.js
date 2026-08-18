/**
 * config.js - X自動投稿の設定値を一箇所にまとめたもの。
 *
 * 頻度・閾値はすべてここで調整できるようにしてある。挙動を変えたい場合はまずここを見ること。
 * X運用委員会(2026-08-19開催)での決定に基づく初期値。実際の投稿ログ・GA4の結果を見ながら
 * 手動で調整していく想定（x-weekly-reviewスキルの提案に基づく、安全な範囲の数値調整のみ）。
 */

const SITE_ORIGIN = 'https://wasedacalendar.com';

/** カテゴリの表示ラベル・絵文字。events.js の category と対応。 */
const CATEGORY_META = {
  sports:    { label: 'スポーツ', emoji: '⚽' },
  culture:   { label: '文化',     emoji: '🎨' },
  music:     { label: '音楽',     emoji: '🎵' },
  theater:   { label: '演劇',     emoji: '🎭' },
  lecture:   { label: '講演・学び', emoji: '🎓' },
  community: { label: '交流',     emoji: '🤝' },
  other:     { label: 'イベント', emoji: '📌' },
};

/**
 * 投稿タイプごとの設定。
 *
 * minGapDays: 同じ投稿タイプを再度投稿するまでに空けるべき最短日数(重複投稿対策)。
 *   「週1」なら6、「週0〜2」の上限として使うなら3、程度に設定。
 * enabled: falseにするとdecide-and-post.jsがそのタイプを最初から候補にしない
 *   (コード変更なしでKill Switch的に個別タイプだけ止めたい場合はここをfalseに)。
 */
const POST_TYPES = {
  weekly: {
    id: 'weekly',
    label: '今週の早稲田',
    campaign: 'weekly_waseda',
    minGapDays: 6,
    enabled: true,
  },
  today: {
    id: 'today',
    label: '今日の早稲田',
    campaign: 'today_waseda',
    minGapDays: 1,
    enabled: true,
  },
  laterToday: {
    id: 'later_today',
    label: '今日このあと',
    campaign: 'today_later',
    minGapDays: 1,
    enabled: true,
  },
  theme: {
    id: 'theme',
    label: 'テーマ型投稿',
    campaign: 'theme_event',
    minGapDays: 4, // 週0〜2の上限として、最短でも4日は空ける
    enabled: true,
  },
  recommend: {
    id: 'recommend',
    label: 'おすすめ機能誘導',
    campaign: 'recommendation',
    minGapDays: 6, // 週1想定
    enabled: true,
  },
};

/**
 * 「無料イベント」テーマ投稿は今回見送り。
 * 理由(2026-08-19時点の実データ確認): 公開中の circle イベント178件のうち、feeTypeが
 * free/paidいずれかに判明しているのは22件のみ(88%がunknown)。この状態で「無料で参加できる
 * イベント」という投稿を作ると、母数が薄すぎて同じイベントの繰り返しになるか、
 * unknownを無料と誤認させるリスクがある。feeType判明率が十分上がってから有効化を検討する。
 * (テーマ型投稿自体は無効化していない。「一般参加可」「文化・講演」等、既存データで
 * 100%判定できる条件のテーマは動く。)
 */
const THEME_FREE_EVENTS_ENABLED = false;

/** 今日の早稲田: 投稿する価値があると判断する最低ライン */
const TODAY_POST_MIN_EVENTS = 3;

/** 今日このあと: 「あと」と呼べる残り時間の範囲(分)。早すぎても遅すぎても対象外。 */
const LATER_TODAY_MIN_MINUTES_AHEAD = 90;
const LATER_TODAY_MAX_MINUTES_AHEAD = 8 * 60;

/** 週次投稿でカテゴリごとに列挙する最大件数(スポーツ偏重で他ジャンルが埋もれるのを防ぐ) */
const WEEKLY_MAX_PER_CATEGORY = 2;
/** 週次投稿で列挙するカテゴリ数の上限(あまり長くしすぎない) */
const WEEKLY_MAX_CATEGORIES_SHOWN = 4;

/** おすすめ機能誘導: 投稿する週として十分ジャンルが分散していると判断する最低カテゴリ数 */
const RECOMMEND_MIN_DISTINCT_CATEGORIES = 3;

/** UTMの共通パラメータ */
const UTM_SOURCE = 'x';
const UTM_MEDIUM = 'organic';

module.exports = {
  SITE_ORIGIN,
  CATEGORY_META,
  POST_TYPES,
  THEME_FREE_EVENTS_ENABLED,
  TODAY_POST_MIN_EVENTS,
  LATER_TODAY_MIN_MINUTES_AHEAD,
  LATER_TODAY_MAX_MINUTES_AHEAD,
  WEEKLY_MAX_PER_CATEGORY,
  WEEKLY_MAX_CATEGORIES_SHOWN,
  RECOMMEND_MIN_DISTINCT_CATEGORIES,
  UTM_SOURCE,
  UTM_MEDIUM,
};
