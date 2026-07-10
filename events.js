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
 * scope の選択肢:
 *   "schedule" | "circle"
 *   トップページの大枠フィルタ（全部・学事日程・サークルイベント）で使う分類。
 *   "schedule" → 学事日程（授業期間・休業・式典など、大学が主体の日程）
 *   "circle"   → サークル・団体が主催する個別イベント（掲載依頼経由で追加するものは基本これ）
 *   省略した場合は "circle" として扱われる。
 *
 * weeklyClassOnly（任意・true/省略）:
 *   「春学期○週目」「秋学期○週目」「授業予備週/期間」など、授業が行われる期間そのものを表す
 *   学事日程にのみ true を付ける。true が付いたイベントは、日曜日は授業日ではないため
 *   カレンダー上で日曜日には表示されない（script.js の isHiddenOnSunday を参照）。
 *   オープンキャンパス・早稲田祭・卒業式・休業開始/終了・臨時休業など「授業の有無」とは関係ない
 *   学事日程には付けないこと（土日を含む期間全体をそのまま表示したいため）。
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
 * imageUrl（任意）:
 *   検索結果の構造化データ（schema.org/Event）に使う画像URL。未指定の場合はサイト共通のOGP画像が使われる。
 *
 * orgId（任意）:
 *   organizations.js の団体IDと紐づける場合に指定（例: "org-001"）。
 *   指定すると、終了済み（today > endDate）になった際にその団体のプロフィールページの
 *   「開催実績」一覧に表示されるようになる。既存イベントはorganizerのテキストのままでよく、
 *   orgIdは新規イベントから付与していく運用とする。
 *
 * reactions:
 *   現時点では静的な件数表示のみ。未指定の場合はすべて0件として扱われます。
 */

const EVENTS = [

  // ========================================
  // 2026年度 学事日程
  // ========================================

  {
    id: "evt-011",
    title: "春学期授業1週目",
    date: "2026-04-11",
    endDate: "2026-04-17",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（1週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-012",
    title: "春学期授業2週目",
    date: "2026-04-18",
    endDate: "2026-04-24",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（2週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-013",
    title: "春学期授業3週目",
    date: "2026-04-25",
    endDate: "2026-05-01",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（3週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-014",
    title: "春学期授業4週目",
    date: "2026-05-07",
    endDate: "2026-05-13",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（4週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-015",
    title: "春学期授業5週目",
    date: "2026-05-14",
    endDate: "2026-05-20",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（5週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-016",
    title: "春学期授業6週目",
    date: "2026-05-21",
    endDate: "2026-05-27",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（6週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-017",
    title: "春学期授業7週目",
    date: "2026-05-28",
    endDate: "2026-06-03",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（7週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-018",
    title: "春学期授業8週目",
    date: "2026-06-04",
    endDate: "2026-06-10",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（8週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-019",
    title: "春学期授業9週目",
    date: "2026-06-11",
    endDate: "2026-06-17",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（9週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-020",
    title: "春学期授業10週目",
    date: "2026-06-18",
    endDate: "2026-06-24",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（10週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-021",
    title: "春学期授業11週目",
    date: "2026-06-25",
    endDate: "2026-07-01",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "春学期の授業期間（11週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-001",
    title: "春学期授業12週目",
    date: "2026-07-02",
    endDate: "2026-07-08",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
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
    scope: "schedule",
    weeklyClassOnly: true,
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
    scope: "schedule",
    weeklyClassOnly: true,
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
    scope: "schedule",
    weeklyClassOnly: true,
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
    scope: "schedule",
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
    scope: "schedule",
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
    scope: "schedule",
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
    scope: "schedule",
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
    scope: "schedule",
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
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期授業1週目の期間です。",
    lastUpdated: "2026-06-25",
    isPublished: true
  },
  {
    id: "evt-022",
    title: "秋学期授業2週目",
    date: "2026-10-08",
    endDate: "2026-10-14",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（2週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-023",
    title: "秋学期授業3週目",
    date: "2026-10-15",
    endDate: "2026-10-21",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（3週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-024",
    title: "秋学期授業4週目",
    date: "2026-10-22",
    endDate: "2026-10-28",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（4週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-025",
    title: "秋学期授業5週目",
    date: "2026-10-29",
    endDate: "2026-11-04",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（5週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-026",
    title: "臨時休業",
    date: "2026-11-05",
    endDate: "2026-11-06",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "臨時休業期間です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-027",
    title: "早稲田祭",
    date: "2026-11-07",
    endDate: "2026-11-08",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "culture",
    scope: "schedule",
    target: ["student", "obog", "public"],
    feeType: "free",
    feeText: "無料",
    description: "早稲田祭の開催期間です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-028",
    title: "秋学期授業6週目",
    date: "2026-11-09",
    endDate: "2026-11-14",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（6週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-029",
    title: "秋学期授業7週目",
    date: "2026-11-16",
    endDate: "2026-11-21",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（7週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-030",
    title: "秋学期授業8週目",
    date: "2026-11-23",
    endDate: "2026-11-28",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（8週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-031",
    title: "秋学期授業9週目",
    date: "2026-11-30",
    endDate: "2026-12-05",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（9週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-032",
    title: "秋学期授業10週目",
    date: "2026-12-07",
    endDate: "2026-12-12",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（10週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-033",
    title: "秋学期授業11週目",
    date: "2026-12-14",
    endDate: "2026-12-19",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（11週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-034",
    title: "秋学期授業12週目",
    date: "2026-12-21",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（12週目）の一部です。冬季休業を挟んで1/6〜1/9・1/12に続きます。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-035",
    title: "冬季休業開始",
    date: "2026-12-22",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "冬季休業の開始日です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-036",
    title: "臨時休業",
    date: "2026-12-25",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "臨時休業日です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-037",
    title: "臨時休業",
    date: "2026-12-28",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "臨時休業日です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-038",
    title: "秋学期授業12週目",
    date: "2027-01-06",
    endDate: "2027-01-09",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（12週目）の一部です。12/21から続き、1/12にも続きます。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-039",
    title: "秋学期授業12週目",
    date: "2027-01-12",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（12週目）の一部です。12/21・1/6〜1/9から続きます。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-040",
    title: "秋学期授業13週目",
    date: "2027-01-13",
    endDate: "2027-01-19",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（13週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-041",
    title: "秋学期授業14週目",
    date: "2027-01-20",
    endDate: "2027-01-26",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業期間（14週目）です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },
  {
    id: "evt-042",
    title: "授業予備期間",
    date: "2027-01-27",
    endDate: "2027-02-02",
    location: "",
    campus: "waseda",
    organizer: "早稲田大学",
    category: "other",
    scope: "schedule",
    weeklyClassOnly: true,
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "秋学期の授業予備期間です。",
    lastUpdated: "2026-07-03",
    isPublished: true
  },

  // ========================================
  // サークル・団体イベント
  // ========================================

  {
    id: "evt-043",
    title: "第22回出版甲子園 企画応募受付期間",
    date: "2026-07-11",
    endDate: "2026-08-06",
    location: "",
    campus: "online",
    organizer: "出版甲子園実行委員会",
    category: "culture",
    scope: "circle",
    orgId: "C-003",
    target: ["student"],
    feeType: "free",
    feeText: "無料",
    description: "学生の、学生による、学生のための出版コンテスト「出版甲子園」。「本にしたい企画」を全国の学生から募集し、実行委員会の審査・ブラッシュアップを経て、決勝大会で出版業界関係者にプレゼンします。第22回大会の企画応募受付期間です（フォームより約1000字から応募可）。",
    externalUrl: "https://spk.picaso.jp/22taikai/application/",
    lastUpdated: "2026-07-10",
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
 * 大枠フィルタ（scope）の日本語ラベル定義
 */
const SCOPE_LABELS = {
  schedule: "学事日程",
  circle:   "サークルイベント"
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
