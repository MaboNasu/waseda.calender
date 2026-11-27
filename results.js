/**
 * results.js — 終わったイベントの結果（試合結果・公演や大会の報告）
 *
 * events.js とは別のファイル。**運営者が確認した結果だけ**を入れる（下書きは入れない）。
 * 集め方と承認の流れは docs/results-collection-ops.md、入れる前に `node scripts/check-results.js` を通す。
 *
 * 形式（キーはイベントID）:
 *   "evt-113": {
 *     kind: "match",              // match=試合 / report=公演・大会・記録会の報告
 *     team: "男子",               // 任意。団体ページの戦績を男女別などに分ける
 *     outcome: "win",             // match のとき必須: win / loss / draw
 *     score: "1-0",               // match のとき必須。早稲田側を先に書く（例 "2-1"）
 *     detail: "前半0-0／後半1-0",  // 任意。PK戦などスコアと勝敗が一致しないときはここに書く
 *     opponent: "明治大学",        // 任意。なければイベント名の「vs〜」から表示する
 *     matches: null,              // 任意。1イベントに複数試合あるとき [{team, label, outcome, score, detail, opponent}]
 *     award: null,                // 任意。大会の成績（「優勝」「準優勝」「第3位」など）
 *     summary: "…",               // 任意。事実を自分の言葉で1〜2文。出典の文章を写さない。選手個人の名前は書かない
 *     sources: [{ url: "https://…", label: "ア式蹴球部 公式サイト" }],  // 必須。出典のない結果は表示しない
 *     confirmedAt: "2026-11-16"   // 運営者が確認した日
 *   }
 *
 * 守ること（LEGAL_GUARDRAILS.md / docs/EDITORIAL_RULES.md）:
 *   - スコア・順位を推測で埋めない。出典URLのない結果は載せない。
 *   - 出典どうしで食い違うときは載せない。
 *
 * 表示用の関数もこのファイルに置く。ブラウザ（各ページ）と静的ページの生成（scripts/generate-*.js が vm で読む）で
 * 同じ関数を使うので、DOM には触れない。
 */

const RESULTS = {
  // ---- 早稲田大学ア式蹴球部（男子）関東大学リーグ戦 ----
  "evt-110": {
    kind: "match",
    team: "男子",
    outcome: "draw",
    score: "1-1",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/?p=62527", label: "早稲田大学 競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  "evt-111": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "0-2",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/?p=62649", label: "早稲田大学 競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  "evt-112": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "4-2",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/?p=62869", label: "早稲田大学 競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  // ---- 2026-11-16 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-709": {
    kind: "match",
    team: "B",
    outcome: "draw",
    score: "17-17",
    sources: [{ url: "https://www.wasedarugby.com/calendar/2026/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-710": {
    kind: "match",
    team: "C",
    outcome: "loss",
    score: "19-21",
    sources: [{ url: "https://www.wasedarugby.com/calendar/2026/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-704": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "0-1",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/150250", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-222": {
    kind: "match",
    matches: [
      { team: "B", outcome: "loss", score: "22-37" },
      { team: "C", outcome: "loss", score: "14-24" },
      { team: "D", outcome: "loss", score: "19-26" }
    ],
    sources: [{ url: "https://www.wasedarugby.com/calendar/2026/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-478": {
    kind: "match",
    outcome: "win",
    score: "1818-1731",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/?lng=en", label: "早稲田大学競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  "evt-600": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "0-2",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/150186", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  // ---- 2026-11-17 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-703": {
    kind: "report",
    detail: "男子3000m",
    award: "5着",
    sources: [{ url: "https://waseda-ac.jp/competition/detail/1075", label: "早稲田大学競走部公式サイト" }],
    confirmedAt: "2026-11-17"
  },
  "evt-702": {
    kind: "report",
    detail: "女子5000mW",
    award: "3着",
    sources: [{ url: "https://waseda-ac.jp/competition/detail/1074", label: "早稲田大学競走部公式サイト" }],
    confirmedAt: "2026-11-17"
  },
  // ---- 2026-11-17 修正依頼の照合で判明（evt-359の日程修正にあわせて追加）----
  "evt-359": {
    kind: "match",
    outcome: "loss",
    score: "3-5",
    sources: [
      { url: "https://w-junkoh.com/news/detail/id/33483", label: "早稲田大学準硬式野球部 公式サイト" },
      { url: "https://tourokurenmei.com/archives/21138", label: "登録連盟" }
    ],
    confirmedAt: "2026-11-17"
  },
  // ---- 2026-11-16 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-716": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "34-30",
    sources: [{ url: "https://handball.or.jp/system/prog/game_event_schedule.php?eid=405", label: "日本ハンドボール協会" }],
    confirmedAt: "2026-11-16"
  },
  "evt-717": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "24-17",
    sources: [{ url: "https://handball.or.jp/system/prog/game_event_schedule.php?eid=405", label: "日本ハンドボール協会" }],
    confirmedAt: "2026-11-16"
  },
  "evt-113": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "1-0",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/150141", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-095": {
    kind: "match",
    outcome: "loss",
    score: "13-15",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/news/2026/11/02/62621/", label: "早稲田大学競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  "evt-284": {
    kind: "match",
    team: "女子",
    outcome: "draw",
    score: "0-0",
    sources: [{ url: "https://keio-soccer.net/games/3058", label: "慶應義塾体育会ソッカー部女子" }],
    confirmedAt: "2026-11-16"
  },
  "evt-094": {
    kind: "match",
    outcome: "win",
    score: "29-5",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/news/2026/10/26/62353/", label: "早稲田大学競技スポーツセンター" }],
    confirmedAt: "2026-11-16"
  },
  // ---- 2026-11-16 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-089": {
    kind: "report",
    award: "第10位",
    sources: [{ url: "https://wasedasports-sousupo.com/news/300755/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-16"
  },
  "evt-501": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "5-3",
    sources: [{ url: "https://www.wasedabbc.org/game/48980/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-443": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "125-126",
    sources: [{ url: "https://wasedasports-sousupo.com/news/kyudo/300490/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-16"
  },
  "evt-500": {
    kind: "match",
    team: "1軍",
    outcome: "draw",
    score: "3-3",
    sources: [{ url: "https://www.wasedabbc.org/game/48974/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-225": {
    kind: "match",
    matches: [
      { label: "1回戦", outcome: "win", score: "6-1" },
      { label: "2回戦", outcome: "win", score: "4-2" }
    ],
    sources: [{ url: "https://www.wasedabbc.org/game/48855/", label: "早稲田大学野球部" }, { url: "https://www.wasedabbc.org/game/48856/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-16"
  },
  "evt-538": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "0-2",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/149762", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-16"
  },
  // ---- 2026-11-16 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-233": {
    kind: "match",
    outcome: "loss",
    score: "17-21",
    sources: [{ url: "https://www.bigbears.org/game/", label: "早稲田大学米式蹴球部 BIG BEARS" }],
    confirmedAt: "2026-11-16"
  },
  "evt-505": {
    kind: "report",
    award: "男子 準優勝／女子 準優勝",
    sources: [{ url: "https://www.wasedatennis.net/", label: "早稲田大学庭球部" }],
    confirmedAt: "2026-11-16"
  },
  // ---- 2026-11-17 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-479": {
    kind: "match",
    outcome: "loss",
    score: "3-4",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-17"
  },
  "evt-523": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "4-1",
    detail: "前半2-1／後半2-0",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/149727", label: "早稲田大学ア式蹴球部(女子部)公式サイト" }],
    confirmedAt: "2026-11-17"
  },
  // ---- 2026-11-17 結果収集で判明（男女別・複数回戦のため matches で手動対応）----
  "evt-138": {
    kind: "match",
    summary: "男子は1回戦敗退、女子はベスト8。",
    matches: [
      { team: "男子", label: "1回戦", outcome: "loss", score: "0-3", opponent: "法政大学" },
      { team: "女子", label: "1回戦", outcome: "win", score: "3-0", opponent: "東日本国際大学" },
      { team: "女子", label: "2回戦", outcome: "win", score: "3-2", opponent: "青山学院大学" },
      { team: "女子", label: "3回戦", outcome: "loss", score: "2-3", opponent: "明治大学" }
    ],
    sources: [{ url: "https://waseda-bad.com/blog/2026/11/11/2026inter_t/", label: "早稲田大学バドミントン部公式サイト" }],
    confirmedAt: "2026-11-17"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-234": {
    kind: "match",
    outcome: "loss",
    score: "7-13",
    sources: [
      { url: "https://www.bigbears.org/game/", label: "早稲田大学米式蹴球部(BIG BEARS)公式サイト" },
      { url: "https://wasedasports-sousupo.com/news/americanfootball/301711/", label: "早稲田スポーツ新聞会" }
    ],
    confirmedAt: "2026-11-18"
  },
  "evt-481": {
    kind: "match",
    outcome: "win",
    score: "63-55",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-18"
  },
  "evt-221": {
    kind: "match",
    team: "B",
    outcome: "loss",
    score: "21-26",
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/300011/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-330": {
    kind: "match",
    outcome: "loss",
    score: "6-8",
    sources: [{ url: "https://wasedasports-sousupo.com/news/baseball/waseda-baseball/300000/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-358": {
    kind: "match",
    outcome: "win",
    score: "13-3",
    sources: [{ url: "https://tourokurenmei.com/archives/21003", label: "東京六大学準硬式野球連盟" }],
    confirmedAt: "2026-11-18"
  },
  "evt-451": {
    kind: "match",
    outcome: "win",
    score: "5-4",
    sources: [{ url: "https://wlax-redbats.com/news/detail/id/33364", label: "早稲田大学ラクロス部男子 RED BATS" }],
    confirmedAt: "2026-11-18"
  },
  "evt-108": {
    kind: "match",
    outcome: "draw",
    score: "1-1",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/149661", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-232": {
    kind: "match",
    outcome: "win",
    score: "17-10",
    sources: [{ url: "https://wasedasports-sousupo.com/news/americanfootball/300104/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-329": {
    kind: "match",
    outcome: "loss",
    score: "0-1",
    sources: [{ url: "https://wasedasports-sousupo.com/news/baseball/waseda-baseball/299955/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-363": {
    kind: "match",
    outcome: "loss",
    score: "0-1",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/149567", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-450": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "7-19",
    sources: [{ url: "https://wasedaswim.com/game/detail/id/19825", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-093": {
    kind: "match",
    outcome: "win",
    score: "78-0",
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/299636/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-328": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "6-5",
    sources: [{ url: "https://www.wasedabbc.org/game/48895/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-357": {
    kind: "match",
    outcome: "loss",
    score: "1-3",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2153", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-107": {
    kind: "match",
    outcome: "loss",
    score: "2-3",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/149489", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-327": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "3-1",
    sources: [{ url: "https://www.wasedabbc.org/game/48894/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-356": {
    kind: "match",
    outcome: "loss",
    score: "5-7",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2152", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-380": {
    kind: "match",
    outcome: "loss",
    score: "74-85",
    sources: [{ url: "https://wasedasports-sousupo.com/news/basketball/men-basketball/299614/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-384": {
    kind: "match",
    team: "DE",
    outcome: "win",
    score: "67-10",
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/299641/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-386": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "13-18",
    sources: [{ url: "https://wasedaswim.com/game/detail/id/19669", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-319": {
    kind: "match",
    outcome: "win",
    score: "5-2",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2188", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-362": {
    kind: "match",
    outcome: "win",
    score: "4-2",
    sources: [{ url: "https://www.wasedabbc.org/game/48970/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-231": {
    kind: "match",
    outcome: "loss",
    score: "3-27",
    sources: [{ url: "https://wasedasports-sousupo.com/news/americanfootball/299498/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-326": {
    kind: "match",
    outcome: "win",
    score: "6-1",
    sources: [{ url: "https://www.wasedabbc.org/game/48852/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-354": {
    kind: "match",
    outcome: "win",
    score: "2-0",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2151", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-361": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "1-0",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/149256", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-106": {
    kind: "match",
    outcome: "loss",
    score: "0-1",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/149487", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-320": {
    kind: "match",
    team: "女子",
    outcome: "draw",
    score: "0-0",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/149161", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-325": {
    kind: "match",
    outcome: "win",
    score: "6-0",
    sources: [{ url: "https://www.wasedabbc.org/game/48851/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-353": {
    kind: "match",
    outcome: "win",
    score: "1-0",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2150", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-261": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "7-0",
    sources: [{ url: "https://www.wasedatennis.net/team-competition2/%E7%AC%AC116%E5%9B%9E-%E6%97%A9%E6%85%B6%E5%AF%BE%E6%8A%97%E5%BA%AD%E7%90%83%E8%A9%A6%E5%90%88", label: "早稲田大学庭球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-318": {
    kind: "match",
    outcome: "loss",
    score: "0-17",
    sources: [{ url: "https://www.wasedabbc.org/game/48850/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-092": {
    kind: "match",
    outcome: "win",
    score: "67-3",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7-vs-%E7%AB%8B%E6%95%99%E5%A4%A7-111/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-118": {
    kind: "match",
    outcome: "win",
    score: "6-2",
    sources: [{ url: "https://wlax-redbats.com/news/detail/id/33290", label: "早稲田大学ラクロス部男子 RED BATS" }],
    confirmedAt: "2026-11-18"
  },
  "evt-200": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "125-124",
    sources: [{ url: "https://wasedasports-sousupo.com/news/kyudo/298931/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-301": {
    kind: "match",
    outcome: "win",
    score: "78-77",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3429", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-105": {
    kind: "match",
    outcome: "loss",
    score: "0-3",
    sources: [{ url: "https://www.waseda-afc.jp/news-men/149085", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-230": {
    kind: "match",
    outcome: "win",
    score: "38-27",
    sources: [{ url: "https://wasedasports-sousupo.com/news/americanfootball/298890/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-300": {
    kind: "match",
    outcome: "win",
    score: "68-66",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3428", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-311": {
    kind: "match",
    team: "DE",
    outcome: "win",
    score: "19-17",
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/298915/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-312": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "0-1",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/148972", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-299": {
    kind: "match",
    outcome: "win",
    score: "72-62",
    sources: [{ url: "https://wasedasports-sousupo.com/news/basketball/men-basketball/298654/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-198": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "123-110",
    sources: [{ url: "https://wasedasports-sousupo.com/news/kyudo/298578/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-220": {
    kind: "match",
    matches: [
      { team: "B", outcome: "win", score: "66-5" },
      { team: "C", outcome: "win", score: "49-0" }
    ],
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/298446/", label: "早稲田スポーツ新聞会" }, { url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/298437/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-298": {
    kind: "match",
    outcome: "loss",
    score: "80-81",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3426", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-087": {
    kind: "report",
    award: "6位",
    sources: [{ url: "https://wasedasumo-website.com/game/detail/id/17869", label: "早稲田大学相撲部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-292": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "1-0",
    sources: [{ url: "https://www.wasedabbc.org/game/48946/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-297": {
    kind: "match",
    outcome: "loss",
    score: "65-84",
    sources: [{ url: "https://wasedasports-sousupo.com/news/basketball/men-basketball/298384/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-076": {
    kind: "report",
    team: "男子",
    award: "6位",
    sources: [{ url: "https://wasedaswim.com/news/detail/id/33237", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-117": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "4-6",
    sources: [{ url: "https://wasedasports-sousupo.com/news/lacrosse/men-lacrosse/298237/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-142": {
    kind: "report",
    team: "女子",
    award: "3位",
    sources: [{ url: "https://wasedaswim.com/news/detail/id/33237", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-229": {
    kind: "match",
    outcome: "win",
    score: "35-7",
    sources: [{ url: "https://wasedasports-sousupo.com/news/americanfootball/298227/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-279": {
    kind: "match",
    outcome: "loss",
    score: "3-6",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2147", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-091": {
    kind: "match",
    outcome: "win",
    score: "69-0",
    sources: [{ url: "https://wasedasports-sousupo.com/news/rugby/men-rugby/297913/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-258": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "1-3",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/148638", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-278": {
    kind: "match",
    outcome: "loss",
    score: "3-6",
    sources: [{ url: "https://wasedasports-sousupo.com/news/junkobaseball/297949/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-075": {
    kind: "report",
    award: "男子 男子総合6位／女子 女子総合２位",
    sources: [{ url: "https://wasedasports-sousupo.com/news/swimming/299241/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-196": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "58-48",
    sources: [{ url: "https://wasedasports-sousupo.com/news/kyudo/297519/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-219": {
    kind: "match",
    team: "C",
    outcome: "win",
    score: "27-17",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7c-vs-%E6%9D%B1%E6%B5%B7%E5%A4%A7c-7/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-191": {
    kind: "match",
    team: "1回戦",
    outcome: "loss",
    score: "1-2",
    sources: [{ url: "https://www.waseda-afc.jp/result/148450", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-190": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "1-3",
    sources: [{ url: "https://www.waseda-afc.jp/news-women/148398", label: "早稲田大学ア式蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-130": {
    kind: "report",
    team: "男子団体",
    award: "第3位",
    sources: [{ url: "https://www.uaa.keio.ac.jp/event/result/202608300929.html", label: "慶應義塾体育会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-185": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "7-5",
    sources: [{ url: "https://www.wasedabbc.org/game/48857/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-188": {
    kind: "match",
    outcome: "win",
    score: "10-0",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2143", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-228": {
    kind: "match",
    outcome: "win",
    score: "28-20",
    sources: [{ url: "https://wasedasports-sousupo.com/news/americanfootball/297018/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-244": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "92-104",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3418", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-184": {
    kind: "match",
    team: "1軍",
    outcome: "loss",
    score: "2-12",
    sources: [{ url: "https://www.wasedabbc.org/game/48773/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-187": {
    kind: "match",
    outcome: "win",
    score: "7-0",
    sources: [{ url: "https://w-junkoh.com/game/detail/id/2142", label: "早稲田大学準硬式野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-243": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "91-75",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3417", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-183": {
    kind: "match",
    team: "1軍",
    outcome: "draw",
    score: "4-4",
    sources: [{ url: "https://www.wasedabbc.org/game/48772/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-217": {
    kind: "match",
    team: "A",
    outcome: "win",
    score: "53-35",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7a-vs-%E4%BA%AC%E7%94%A3%E5%A4%A7-2-2/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-218": {
    kind: "match",
    team: "B",
    outcome: "win",
    score: "35-12",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7b-vs-%E4%BA%AC%E7%94%A3%E5%A4%A7-2/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-242": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "90-69",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3416", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-216": {
    kind: "match",
    team: "CD",
    outcome: "win",
    score: "35-12",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7cd-vs-%E9%BE%8D%E8%B0%B7%E5%A4%A7-2/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-127": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "11-6",
    sources: [{ url: "https://w-lax.com/news/detail/id/32800", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  "evt-182": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "5-4",
    sources: [{ url: "https://www.wasedabbc.org/game/48771/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-214": {
    kind: "match",
    team: "A",
    outcome: "win",
    score: "55-24",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7a-vs-%E5%A4%A9%E7%90%86%E5%A4%A7a-2/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-215": {
    kind: "match",
    team: "B",
    outcome: "loss",
    score: "17-33",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7b-vs-%E5%A4%A9%E7%90%86%E5%A4%A7b-2/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-181": {
    kind: "match",
    team: "1軍",
    outcome: "loss",
    score: "4-13",
    sources: [{ url: "https://www.wasedabbc.org/game/48770/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-212": {
    kind: "match",
    team: "C",
    outcome: "win",
    score: "40-14",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7-vs-%E5%A4%A9%E7%90%86%E5%A4%A7c/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-213": {
    kind: "match",
    team: "DE",
    outcome: "win",
    score: "34-28",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7-vs-%E5%90%8C%E5%BF%97%E7%A4%BEcd/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-065": {
    kind: "report",
    award: "男子 予選敗退／女子 予選敗退",
    sources: [{ url: "https://wasedasports-sousupo.com/news/kyudo/296060/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-180": {
    kind: "match",
    team: "1軍",
    outcome: "loss",
    score: "0-3",
    sources: [{ url: "https://www.wasedabbc.org/game/48823/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-211": {
    kind: "match",
    team: "CD",
    outcome: "win",
    score: "42-21",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7-cdvs-%E7%AB%8B%E5%91%BD%E5%A4%A7/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-210": {
    kind: "match",
    team: "DE",
    outcome: "win",
    score: "59-26",
    sources: [{ url: "https://www.wasedarugby.com/event/%E6%97%A9%E5%A4%A7de-vs-%E6%96%B0%E6%BD%9F%E9%A3%9F%E8%BE%B2%E5%A4%A7-2-3/", label: "早稲田大学ラグビー蹴球部" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-072": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "13-16",
    sources: [{ url: "https://wasedaswim.com/game/detail/id/18712", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-071": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "14-11",
    sources: [{ url: "https://wasedaswim.com/game/detail/id/18711", label: "早稲田大学水泳部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-179": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "3-0",
    sources: [{ url: "https://www.wasedabbc.org/game/48864/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-178": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "6-3",
    sources: [{ url: "https://www.wasedabbc.org/game/48822/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-044": {
    kind: "report",
    award: "男子 １位／女子 １位",
    sources: [{ url: "https://waseda-ac.jp/news/detail/973", label: "早稲田大学競走部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-045": {
    kind: "match",
    outcome: "loss",
    score: "1-3",
    sources: [{ url: "https://wasedasports-sousupo.com/news/soccer/men-soccer/295736/", label: "早稲田スポーツ新聞会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-129": {
    kind: "report",
    team: "男子団体",
    award: "第3位",
    sources: [{ url: "https://www.uaa.keio.ac.jp/topics/202608092302.html", label: "慶應義塾体育会" }],
    confirmedAt: "2026-11-18"
  },
  "evt-125": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "6-3",
    sources: [{ url: "https://w-lax.com/news/detail/id/32801", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  "evt-080": {
    kind: "match",
    outcome: "loss",
    score: "5-6",
    sources: [{ url: "https://www.wasedabbc.org/game/48860/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-123": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "5-6",
    sources: [{ url: "https://w-lax.com/game/detail/id/18867", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  "evt-079": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "20-0",
    sources: [{ url: "https://www.wasedabbc.org/game/48768/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-121": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "6-1",
    sources: [{ url: "https://w-lax.com/game/detail/id/18862", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  "evt-078": {
    kind: "match",
    team: "1軍",
    outcome: "win",
    score: "5-4",
    sources: [{ url: "https://www.wasedabbc.org/game/48767/", label: "早稲田大学野球部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-102": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "94-91",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3302", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-18 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-101": {
    kind: "match",
    team: "男子",
    outcome: "loss",
    score: "85-91",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3301", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-120": {
    kind: "match",
    team: "女子",
    outcome: "win",
    score: "8-2",
    sources: [{ url: "https://w-lax.com/game/detail/id/18866", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  "evt-099": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "101-94",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3299", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-098": {
    kind: "match",
    team: "男子",
    outcome: "win",
    score: "94-59",
    sources: [{ url: "https://waseda-basketball.com/game/detail/id/3298", label: "早稲田大学バスケットボール部" }],
    confirmedAt: "2026-11-18"
  },
  "evt-077": {
    kind: "match",
    outcome: "win",
    score: "9-0",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/news/2026/07/06/59048/", label: "早稲田大学 競技スポーツセンター" }],
    confirmedAt: "2026-11-18"
  },
  "evt-119": {
    kind: "match",
    team: "女子",
    outcome: "loss",
    score: "4-5",
    sources: [{ url: "https://w-lax.com/game/detail/id/18869", label: "早稲田大学ラクロス部女子" }],
    confirmedAt: "2026-11-18"
  },
  // ---- 2026-11-19 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-480": {
    kind: "match",
    matches: [
      { team: "男子", outcome: "win", score: "1-0" },
      { team: "女子", outcome: "draw", score: "0-0" }
    ],
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-19"
  },
  // ---- 2026-11-27 出典照合で追加（scripts/apply-result-drafts.js）----
  "evt-096": {
    kind: "match",
    outcome: "win",
    score: "44-8",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-27"
  },
  "evt-251": {
    kind: "match",
    matches: [
      { team: "男子", outcome: "win", score: "11-4" },
      { team: "女子", outcome: "win", score: "5-0" }
    ],
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-27"
  },
  "evt-502": {
    kind: "match",
    matches: [
      { team: "男子", outcome: "loss", score: "3480-3722" },
      { team: "女子", outcome: "win", score: "2405-2369" }
    ],
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-27"
  }
};

/* ============================================================
   表示用の関数（DOM非依存）
   ============================================================ */

const WC_RESULT_OUTCOMES = {
  win: { mark: '○', label: '勝ち', cls: 'win' },
  loss: { mark: '●', label: '負け', cls: 'loss' },
  draw: { mark: '△', label: '引き分け', cls: 'draw' },
};

function wcResEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wcSafeUrl(url) {
  return /^https?:\/\//i.test(String(url || '')) ? String(url) : '';
}

/** 出典つきの確認済み結果だけを返す（出典がないものは無いものとして扱う） */
function wcGetResult(eventId) {
  const r = (typeof RESULTS !== 'undefined' && RESULTS) ? RESULTS[eventId] : null;
  if (!r || !Array.isArray(r.sources)) return null;
  const sources = r.sources.filter((s) => s && wcSafeUrl(s.url));
  if (!sources.length) return null;
  return { ...r, sources };
}

/** イベント名の「vs〜」から対戦相手を取り出す（データに opponent がないとき用） */
function wcOpponentFromTitle(title) {
  const m = /(?:vs\.?|VS\.?|ｖｓ|対)\s*([^（(【\[]+?)\s*(?:[（(【\[].*)?$/.exec(String(title || ''));
  return m ? m[1].trim() : '';
}

/** 1イベントの試合を配列にする（matches があればそれ、なければ本体を1試合として） */
function wcResultLines(ev, r) {
  if (!r || r.kind !== 'match') return [];
  if (Array.isArray(r.matches) && r.matches.length) {
    return r.matches.map((m) => ({ team: m.team ?? r.team ?? '', label: m.label || '', outcome: m.outcome, score: m.score, detail: m.detail || '', opponent: m.opponent || r.opponent || wcOpponentFromTitle(ev.title) }));
  }
  return [{ team: r.team || '', label: '', outcome: r.outcome, score: r.score, detail: r.detail || '', opponent: r.opponent || wcOpponentFromTitle(ev.title) }];
}

function wcScoreParts(score) {
  const m = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(String(score || ''));
  return m ? [m[1], m[2]] : null;
}

function wcMatchLineHTML(line) {
  const o = WC_RESULT_OUTCOMES[line.outcome];
  if (!o) return '';
  const parts = wcScoreParts(line.score);
  const scoreHTML = parts
    ? `早稲田 <strong>${wcResEscape(parts[0])} - ${wcResEscape(parts[1])}</strong>${line.opponent ? ` ${wcResEscape(line.opponent)}` : ''}`
    : `<strong>${wcResEscape(line.score || '')}</strong>`;
  const prefix = [line.team, line.label].filter(Boolean).map(wcResEscape).join(' ');
  return `<div class="result-line result-${o.cls}">
      <span class="result-badge" aria-label="${o.label}">${o.mark} ${o.label}</span>
      <span class="result-score">${prefix ? `<span class="result-team">${prefix}</span> ` : ''}${scoreHTML}${line.detail ? `<span class="result-detail">（${wcResEscape(line.detail)}）</span>` : ''}</span>
    </div>`;
}

/** イベント詳細（個別ページ・モーダル）の結果カード。結果がなければ空文字 */
function wcResultCardHTML(ev) {
  if (!ev) return '';
  const r = wcGetResult(ev.id);
  if (!r) return '';
  const lines = wcResultLines(ev, r).map(wcMatchLineHTML).join('');
  const award = r.award ? `<p class="result-award">🏆 ${wcResEscape(r.award)}</p>` : '';
  const summary = r.summary ? `<p class="result-summary">${wcResEscape(r.summary)}</p>` : '';
  const sources = r.sources.map((s) => `<a href="${wcResEscape(wcSafeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${wcResEscape(s.label || '出典')} ↗</a>`).join('　');
  const title = r.kind === 'match' ? '試合結果' : '結果・報告';
  return `<section class="result-card" aria-label="${title}">
    <p class="result-card-title">${title}</p>
    ${lines}${award}${summary}
    <p class="result-sources">出典：${sources}${r.confirmedAt ? `<span class="result-confirmed">（${wcResEscape(r.confirmedAt)} 確認）</span>` : ''}</p>
  </section>`;
}

/** 団体ページの開催実績の各行に付ける小さな印（例「○ 1-0」）。結果がなければ空文字 */
function wcResultMarkHTML(ev) {
  if (!ev) return '';
  const r = wcGetResult(ev.id);
  if (!r) return '';
  if (r.kind !== 'match') return r.award ? `<span class="result-mark result-report">${wcResEscape(r.award)}</span>` : '<span class="result-mark result-report">結果あり</span>';
  return wcResultLines(ev, r).map((line) => {
    const o = WC_RESULT_OUTCOMES[line.outcome];
    if (!o) return '';
    const team = line.team ? `${wcResEscape(line.team)} ` : '';
    return `<span class="result-mark result-${o.cls}" title="${o.label}">${team}${o.mark} ${wcResEscape(line.score || '')}</span>`;
  }).join(' ');
}

/** 年度（4月始まり）。"2026-03-31" → 2025、"2026-04-01" → 2026 */
function wcFiscalYear(dateStr) {
  const [y, m] = String(dateStr || '').split('-').map(Number);
  if (!y || !m) return null;
  return m >= 4 ? y : y - 1;
}

/** 団体の戦績（年度ごと・チームごとの勝敗数）。試合ごとに数える */
function wcOrgRecord(events, fiscalYear) {
  const byTeam = new Map();
  for (const ev of events || []) {
    if (fiscalYear != null && wcFiscalYear(ev.date) !== fiscalYear) continue;
    const r = wcGetResult(ev.id);
    if (!r || r.kind !== 'match') continue;
    for (const line of wcResultLines(ev, r)) {
      if (!WC_RESULT_OUTCOMES[line.outcome]) continue;
      const key = line.team || '';
      if (!byTeam.has(key)) byTeam.set(key, { team: key, win: 0, loss: 0, draw: 0 });
      byTeam.get(key)[line.outcome]++;
    }
  }
  return [...byTeam.values()].sort((a, b) => a.team.localeCompare(b.team, 'ja'));
}

/** 団体ページ「開催実績」の見出しの下に出す今年度の戦績。試合結果がなければ空文字 */
function wcOrgRecordHTML(events, todayStr) {
  const fy = wcFiscalYear(todayStr || new Date().toISOString().slice(0, 10));
  const rows = wcOrgRecord(events, fy);
  if (!rows.length) return '';
  const items = rows.map((t) => `<span class="org-record-item">${t.team ? `<strong>${wcResEscape(t.team)}</strong> ` : ''}${t.win}勝${t.loss}敗${t.draw ? `${t.draw}分` : ''}</span>`).join('');
  return `<div class="org-record"><span class="org-record-label">${fy}年度の戦績</span>${items}<a class="org-record-link" href="/results.html">試合結果一覧 →</a></div>`;
}

/** 一覧ページ用：結果のあるイベントを新しい順に */
function wcResultEntries(events) {
  return (events || [])
    .filter((ev) => ev.isPublished !== false && wcGetResult(ev.id))
    .map((ev) => ({ ev, result: wcGetResult(ev.id) }))
    .sort((a, b) => b.ev.date.localeCompare(a.ev.date));
}
