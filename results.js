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
    sources: [{ url: "https://www.bigbears.org/game/", label: "早稲田大学米式蹴球部(BIG BEARS)公式サイト" }],
    confirmedAt: "2026-11-18"
  },
  "evt-481": {
    kind: "match",
    outcome: "win",
    score: "63-55",
    sources: [{ url: "https://www.waseda.jp/inst/athletic/wasedasports/soukei/", label: "早稲田大学 競技スポーツセンター(早慶戦勝敗一覧)" }],
    confirmedAt: "2026-11-18"
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
