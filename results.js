/**
 * results.js — 終わったイベントの結果（試合結果・公演や大会の報告）
 *
 * events.js とは別に、運営者が確認した結果だけを入れる。下書きは入れない。
 * 集め方・確認の手順は docs/results-collection-ops.md（候補の抽出・下書きの検査は scripts/ の結果収集ツール）。
 *
 * 1件の形:
 *   "evt-113": {
 *     kind: "match",            // match=試合 / report=公演・大会・記録会の報告
 *     team: "男子",             // 任意。団体ページの戦績を男女別などに分ける
 *     opponent: "明治大学",     // 任意（試合）。出典の表記のまま
 *     outcome: "win",           // 試合のみ: win / loss / draw
 *     score: "1-0",             // 試合のみ。早稲田側を先に書く
 *     detail: "",               // 任意。PK戦・前後半など（スコアと勝敗が一致しないときは必ず書く）
 *     award: "",                // 任意。大会の成績（「優勝」など）
 *     matches: null,            // 任意。1イベントに複数試合があるとき [{team, label, opponent, outcome, score, detail}]
 *     summary: "",              // 任意。事実を自分の言葉で1〜2文。出典の文章は写さない。選手個人の名前は書かない
 *     sources: [{ url: "https://…", label: "…" }],   // 必須。出典URLのない結果は表示しない
 *     confirmedAt: "2026-11-15"
 *   }
 *
 * ルール（docs/EDITORIAL_RULES.md・LEGAL_GUARDRAILS.md）: スコアや順位を推測で埋めない。出典どうしが食い違うものは入れない。
 * 下の表示用関数は DOM に触れない（ブラウザと静的ページ生成〔vm で読み込み〕の両方で同じものを使う）。
 * 変更したら node scripts/check-results.js を通す。
 */

const RESULTS = {
  // ---- 早稲田大学ア式蹴球部（男子）：https://www.waseda-afc.jp/game-men の日程・結果表で確認（2026-11-15） ----
  "evt-045": { kind: "match", team: "男子", opponent: "慶應義塾大学", outcome: "loss", score: "1-3", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-191": { kind: "match", team: "男子", opponent: "九州産業大学", outcome: "loss", score: "1-2", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-104": { kind: "match", team: "男子", opponent: "東海大学", outcome: "loss", score: "2-3", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-105": { kind: "match", team: "男子", opponent: "国士舘大学", outcome: "loss", score: "0-3", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-106": { kind: "match", team: "男子", opponent: "東洋大学", outcome: "loss", score: "0-1", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-107": { kind: "match", team: "男子", opponent: "筑波大学", outcome: "loss", score: "2-3", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-108": { kind: "match", team: "男子", opponent: "日本大学", outcome: "draw", score: "1-1", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-109": { kind: "match", team: "男子", opponent: "桐蔭横浜大学", outcome: "win", score: "3-0", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-110": { kind: "match", team: "男子", opponent: "法政大学", outcome: "draw", score: "1-1", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-111": { kind: "match", team: "男子", opponent: "中央大学", outcome: "loss", score: "0-2", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-112": { kind: "match", team: "男子", opponent: "駒澤大学", outcome: "win", score: "4-2", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-113": { kind: "match", team: "男子", opponent: "明治大学", outcome: "win", score: "1-0", sources: [{ url: "https://www.waseda-afc.jp/game-men", label: "ア式蹴球部 公式サイト（男子 日程・結果）" }], confirmedAt: "2026-11-15" },

  // ---- 早稲田大学ア式蹴球部（女子）：https://www.waseda-afc.jp/game-women の日程・結果表で確認（2026-11-15） ----
  "evt-320": { kind: "match", team: "女子", opponent: "日本大学", outcome: "draw", score: "0-0", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-361": { kind: "match", team: "女子", opponent: "東洋大学", outcome: "win", score: "1-0", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-363": { kind: "match", team: "女子", opponent: "十文字学園女子大学", outcome: "loss", score: "0-1", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-523": { kind: "match", team: "女子", opponent: "順天堂大学", outcome: "win", score: "4-1", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-538": { kind: "match", team: "女子", opponent: "山梨学院大学", outcome: "loss", score: "0-2", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-284": { kind: "match", team: "女子", opponent: "慶應義塾大学", outcome: "draw", score: "0-0", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" },
  "evt-600": { kind: "match", team: "女子", opponent: "神奈川大学", outcome: "loss", score: "0-2", sources: [{ url: "https://www.waseda-afc.jp/game-women", label: "ア式蹴球部 公式サイト（女子 日程・結果）" }], confirmedAt: "2026-11-15" }
};

/* ============================================================
   表示用の関数（DOM に触れない）
   ============================================================ */

const WC_OUTCOME = {
  win: { mark: "○", label: "勝ち" },
  loss: { mark: "●", label: "負け" },
  draw: { mark: "△", label: "引き分け" }
};

function wcResultEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function wcResultSafeUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) ? String(url) : "";
}

/** 出典のある結果だけを返す（出典がなければ null） */
function wcGetResult(eventId) {
  const r = (typeof RESULTS !== "undefined" && RESULTS) ? RESULTS[eventId] : null;
  if (!r || !Array.isArray(r.sources)) return null;
  const sources = r.sources.filter((s) => s && wcResultSafeUrl(s.url));
  if (!sources.length) return null;
  return Object.assign({}, r, { sources });
}

/** 1つの結果を「試合」の配列にする（matches があればそれ、なければ本体を1試合として） */
function wcResultMatches(r) {
  if (!r || r.kind !== "match") return [];
  if (Array.isArray(r.matches) && r.matches.length) return r.matches;
  return [{ team: r.team, label: "", opponent: r.opponent, outcome: r.outcome, score: r.score, detail: r.detail }];
}

function wcScoreText(m) {
  const score = String(m.score || "");
  const parts = score.split("-");
  if (parts.length !== 2) return wcResultEscape(score);
  return `早稲田 ${wcResultEscape(parts[0])} - ${wcResultEscape(parts[1])}${m.opponent ? ` ${wcResultEscape(m.opponent)}` : ""}`;
}

/** イベント詳細の結果カード（結果がなければ空文字） */
function wcResultCardHTML(eventId) {
  const r = wcGetResult(eventId);
  if (!r) return "";
  let body = "";
  if (r.kind === "match") {
    body = wcResultMatches(r).map((m) => {
      const o = WC_OUTCOME[m.outcome] || { mark: "", label: "" };
      return `<div class="wc-result-line wc-result-${wcResultEscape(m.outcome || "none")}">
          <span class="wc-result-mark" aria-hidden="true">${o.mark}</span>
          <span class="wc-result-outcome">${[m.team, m.label].filter(Boolean).map(wcResultEscape).join(" ")}${m.team || m.label ? " " : ""}${o.label}</span>
          <span class="wc-result-score">${wcScoreText(m)}</span>
          ${m.detail ? `<span class="wc-result-detail">（${wcResultEscape(m.detail)}）</span>` : ""}
        </div>`;
    }).join("");
  }
  const award = r.award ? `<div class="wc-result-award">${wcResultEscape(r.award)}</div>` : "";
  const summary = r.summary ? `<p class="wc-result-summary">${wcResultEscape(r.summary)}</p>` : "";
  const sources = r.sources.map((s) => `<a href="${wcResultEscape(wcResultSafeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${wcResultEscape(s.label || "出典")}</a>`).join("、");
  return `<section class="wc-result-card" aria-label="結果">
      <p class="wc-result-title">${r.kind === "match" ? "試合結果" : "開催結果"}</p>
      ${body}${award}${summary}
      <p class="wc-result-source">出典: ${sources}${r.confirmedAt ? `（${wcResultEscape(r.confirmedAt)} 確認）` : ""}</p>
    </section>`;
}

/** 一覧や団体ページの行に付ける小さな印（例: ○ 1-0）。結果がなければ空文字 */
function wcResultMarkHTML(eventId) {
  const r = wcGetResult(eventId);
  if (!r) return "";
  if (r.kind !== "match") return r.award ? `<span class="wc-result-chip">${wcResultEscape(r.award)}</span>` : "";
  return wcResultMatches(r).map((m) => {
    const o = WC_OUTCOME[m.outcome] || { mark: "", label: "" };
    return `<span class="wc-result-chip wc-result-${wcResultEscape(m.outcome || "none")}" title="${wcResultEscape([m.team, o.label].filter(Boolean).join(" "))}">${o.mark} ${wcResultEscape(m.score || "")}</span>`;
  }).join(" ");
}

/** 年度（4月始まり）。"2026-11-07" → 2026、"2027-02-01" → 2026 */
function wcFiscalYear(dateStr) {
  const [y, m] = String(dateStr || "").split("-").map(Number);
  if (!y || !m) return null;
  return m >= 4 ? y : y - 1;
}

/** イベントの配列から、指定した年度の戦績（チームごとの勝敗数）を数える。試合ごとに数える */
function wcRecordForEvents(events, fiscalYear) {
  const byTeam = {};
  (events || []).forEach((ev) => {
    if (!ev || wcFiscalYear(ev.date) !== fiscalYear) return;
    const r = wcGetResult(ev.id);
    wcResultMatches(r).forEach((m) => {
      if (!WC_OUTCOME[m.outcome]) return;
      const team = m.team || "";
      if (!byTeam[team]) byTeam[team] = { win: 0, loss: 0, draw: 0 };
      byTeam[team][m.outcome]++;
    });
  });
  return byTeam;
}

/** 団体ページの「◯年度の戦績」。試合結果がなければ空文字。headingTag は h3/h4 など */
function wcOrgRecordHTML(events, todayStr, headingTag) {
  const fy = wcFiscalYear(todayStr);
  if (fy == null) return "";
  const rec = wcRecordForEvents(events, fy);
  const teams = Object.keys(rec);
  if (!teams.length) return "";
  const tag = /^h[2-6]$/.test(headingTag || "") ? headingTag : "h3";
  const rows = teams.sort().map((team) => {
    const t = rec[team];
    return `<span class="wc-record-item">${team ? `${wcResultEscape(team)} ` : ""}${t.win}勝${t.loss}敗${t.draw ? `${t.draw}分` : ""}</span>`;
  }).join("");
  return `<div class="wc-org-record">
      <${tag} class="wc-org-record-title">${fy}年度の戦績</${tag}>
      <div class="wc-record-items">${rows}</div>
      <p class="wc-org-record-note">出典のある試合結果を試合ごとに数えています（${fy}年4月〜${fy + 1}年3月）。</p>
    </div>`;
}

/** 結果のあるイベントを新しい順に並べる（結果一覧ページ用） */
function wcEventsWithResults(events) {
  return (events || [])
    .filter((ev) => ev && ev.isPublished !== false && wcGetResult(ev.id))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.startTime || "").localeCompare(String(a.startTime || "")));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RESULTS, wcGetResult, wcResultMatches, wcResultCardHTML, wcResultMarkHTML, wcFiscalYear, wcRecordForEvents, wcOrgRecordHTML, wcEventsWithResults };
}
