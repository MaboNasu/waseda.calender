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
 * endDate（任意）:
 *   複数日にわたるイベントの終了日。指定すると、カレンダー上で開始日(date)から
 *   終了日(endDate)まで連続したバーとして表示されます。省略した場合は単日イベントとして扱われます。
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
  // 2026年度 学事日程
  // ========================================

  {
    id: "evt-001",
    title: "春学期授業12週目",
    date: "2026-07-02",
    endDate: "2026-07-08",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（12週目）です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-002",
    title: "春学期授業13週目",
    date: "2026-07-09",
    endDate: "2026-07-15",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（13週目）です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-003",
    title: "春学期授業14週目",
    date: "2026-07-16",
    endDate: "2026-07-22",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（14週目）です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-004",
    title: "授業予備週",
    date: "2026-07-23",
    endDate: "2026-07-29",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "授業予備週の期間です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-005",
    title: "夏季休業開始",
    date: "2026-07-30",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "夏季休業の開始日です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-006",
    title: "オープンキャンパス",
    date: "2026-08-01",
    endDate: "2026-08-02",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["applicant", "public"],
    feeType: "free",
    feeText: "無料",
    description: "オープンキャンパス開催期間です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-007",
    title: "9月卒業式",
    date: "2026-09-19",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student", "public"],
    feeType: "free",
    feeText: "無料",
    description: "9月卒業式です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-008",
    title: "夏季休業終了",
    date: "2026-09-20",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "夏季休業の終了日です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-009",
    title: "9月入学式",
    date: "2026-09-26",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student", "public"],
    feeType: "free",
    feeText: "無料",
    description: "9月入学式です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-010",
    title: "秋学期授業1週目",
    date: "2026-10-01",
    endDate: "2026-10-07",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期授業1週目の期間です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  }

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
