/**
 * events.js - Waseda Calendar イベントデータ管理ファイル
 *
 * 【運営者向け】
 * このファイルにイベント情報を追加・修正・削除することで
 * サイトのイベント情報が更新されます。
 *
 * 一般ユーザーはこのファイルを変更できません。
 * イベント情報の変更は運営者のみが行ってください。
 *
 * 日付形式: YYYY-MM-DD (例: 2025-06-15)
 * 時間形式: HH:MM (例: 14:00)
 *
 * category の選択肢:
 *   "sports" | "culture" | "music" | "theater" | "lecture" | "community" | "other"
 *
 * target の選択肢:
 *   "student" | "obog" | "public" | "applicant"
 *   ※ 複数選択可（配列で指定）
 *
 * campus の選択肢:
 *   "waseda" | "toyama" | "nishiwaseda" | "tokorozawa" | "takadanobaba" | "outside" | "online"
 *
 * feeType の選択肢:
 *   "free" | "paid"
 *
 * isPublished:
 *   true → サイトに表示する
 *   false → 非表示（下書き）
 *
 * reactions:
 *   現時点では静的な件数表示のみ。未指定の場合はすべて0件として扱われます。
 */

const EVENTS = [

  // ========================================
  // サンプルイベント（実運用時は削除してください）
  // ========================================

  // {
  //   id: "evt-001",
  //   title: "早稲田大学 春の演劇祭",
  //   date: "2025-06-20",
  //   startTime: "14:00",
  //   endTime: "17:00",
  //   location: "大隈記念講堂",
  //   campus: "waseda",
  //   organizer: "早稲田大学演劇倶楽部",
  //   category: "theater",
  //   target: ["student", "public"],
  //   feeType: "free",
  //   feeText: "無料",
  //   description: "早稲田大学演劇倶楽部による春の公演です。3本の短編を上演します。",
  //   reactions: {
  //     interested: 12,
  //     wantToGo: 5,
  //     going: 3
  //   },
  //   externalUrl: "https://example.com",
  //   lastUpdated: "2025-06-01",
  //   isPublished: true
  // },

  // ========================================
  // ここから実際のイベントを追加してください
  // ========================================

];

/**
 * カテゴリの日本語ラベル定義
 */
const CATEGORY_LABELS = {
  sports:    "スポーツ",
  culture:   "文化",
  music:     "音楽",
  theater:   "演劇",
  lecture:   "講演",
  community: "地域",
  other:     "その他"
};

/**
 * 対象者の日本語ラベル定義
 */
const TARGET_LABELS = {
  student:   "在学生向け",
  obog:      "OBOG向け",
  public:    "一般参加可",
  applicant: "受験生向け"
};

/**
 * キャンパス・場所の日本語ラベル定義
 */
const CAMPUS_LABELS = {
  waseda:       "早稲田キャンパス",
  toyama:       "戸山キャンパス",
  nishiwaseda:  "西早稲田キャンパス",
  tokorozawa:   "所沢キャンパス",
  takadanobaba: "高田馬場周辺",
  outside:      "学外",
  online:       "オンライン"
};

/**
 * 参加費種別の日本語ラベル定義
 */
const FEE_LABELS = {
  free: "無料",
  paid: "有料"
};
