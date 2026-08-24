/**
 * recommendation.js - 「今日、何する？」おすすめ機能(β)
 *
 * ホームページの控えめな入口から開くモーダルで、4つの質問に答えると
 * 条件に合うイベントを最大3件提案する。LLM等の外部AIは使わず、既存のイベントデータ
 * (date/endDate/scope/target/category/feeType)だけを使った決定論的なルールベース。
 *
 * 推薦ロジック(recommendationEngine)とUI(モーダルの描画・操作)を分離してある。
 * 将来、閲覧履歴やリアクション等を使った推薦に発展させる場合はrecommendationEngineの
 * 内部だけを差し替えられるようにするため。
 */

/* ============================================================
   質問の定義
   ============================================================ */
const RECOMMEND_QUESTIONS = [
  {
    id: 'when',
    title: 'いつ行きたい？',
    options: [
      { value: 'today', label: '今日' },
      { value: 'tomorrow', label: '明日' },
      { value: 'weekend', label: '今週末' },
      { value: 'week', label: '1週間以内' },
      { value: 'custom', label: '日付を選ぶ', needsDate: true }
    ]
  },
  {
    id: 'who',
    title: 'あなたは？',
    options: [
      { value: 'student', label: '早大生' },
      { value: 'obog', label: 'OBOG' },
      { value: 'public', label: '一般' },
      { value: 'any', label: '特に指定しない' }
    ]
  },
  {
    id: 'mood',
    title: '今日はどんな気分？',
    options: [
      { value: 'sports', label: 'スポーツを観たい', categories: ['sports'] },
      { value: 'culture', label: '音楽・文化を楽しみたい', categories: ['music', 'culture', 'theater'] },
      { value: 'learn', label: '何か学びたい', categories: ['lecture'] },
      { value: 'social', label: '人と交流したい', categories: ['community'] },
      { value: 'discover', label: '新しいものに出会いたい', categories: [] },
      { value: 'any', label: 'おまかせ', categories: [] }
    ]
  },
  {
    id: 'priority',
    title: '重視する？',
    options: [
      { value: 'free', label: '💴 無料・安い' },
      { value: 'any', label: '特になし' }
    ]
  }
];

/* ============================================================
   recommendationEngine - データだけを扱う純粋なロジック（DOM非依存）
   ============================================================ */
const recommendationEngine = (() => {

  function addDaysStr(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return formatDateStr(dt);
  }

  /** Q1の回答から、対象とする日付範囲 {from, to} を求める。toがnullの場合は「from以降ずっと」 */
  function getDateWindow(answers) {
    const today = getTodayStr();
    if (answers.when === 'today') return { from: today, to: today };
    if (answers.when === 'tomorrow') { const d = addDaysStr(today, 1); return { from: d, to: d }; }
    if (answers.when === 'weekend') {
      const [y, m, d] = today.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay(); // 0=日,6=土
      const toSat = dow === 6 ? 0 : (6 - dow) % 7;
      const from = addDaysStr(today, dow === 0 ? 0 : toSat);
      const to = addDaysStr(from, dow === 0 ? 0 : 1);
      return { from: dow === 0 ? today : from, to: dow === 0 ? today : to };
    }
    if (answers.when === 'week') return { from: today, to: addDaysStr(today, 7) };
    if (answers.when === 'custom' && answers.customDate) return { from: answers.customDate, to: answers.customDate };
    return { from: today, to: null };
  }

  function isDateInWindow(ev, window) {
    const start = ev.date;
    const end = getEventEnd(ev);
    if (window.to === null) return end >= window.from;
    return start <= window.to && end >= window.from;
  }

  /** 参加資格が明確に合わないイベントは対象外にする（ハード条件）。target に public が
   *  含まれていれば誰でも参加可能とみなす。「特に指定しない」を選んだ場合は絞り込まない。 */
  function matchesAudience(ev, who) {
    if (!who || who === 'any') return true;
    const targets = Array.isArray(ev.target) ? ev.target : (ev.target ? [ev.target] : []);
    if (targets.includes('public')) return true;
    if (targets.length === 0) return true; // 対象者未設定は絞り込みで除外しない（不明を不参加扱いにしない）
    return targets.includes(who);
  }

  const moodOption = (moodValue) => RECOMMEND_QUESTIONS[2].options.find((o) => o.value === moodValue);

  /** STEP1: 推薦対象の抽出（ハード条件のみ）。
   *  scope==="schedule"（学事日程等）は最初から対象外 = organizations.js側で言う
   *  recommendationEligibleに相当する既存フィールドをそのまま利用する（新規フィールド不要）。 */
  function getEligibleEvents(answers) {
    const today = getTodayStr();
    const window = getDateWindow(answers);
    return getPublishedEvents().filter((ev) => {
      if (getEventScope(ev) === 'schedule') return false;
      if (getEventEnd(ev) < today) return false;
      if (!isDateInWindow(ev, window)) return false;
      if (!matchesAudience(ev, answers.who)) return false;
      return true;
    });
  }

  /** STEP2: スコアリング（ソフト条件のみ）。カテゴリ一致60点・無料希望との一致20点・
   *  情報充実度10点・開催日の近さ10点、の目安配分（絶対値に意味はなく順位付けのためだけの点数）。 */
  function scoreEvent(ev, answers) {
    let score = 0;
    const mood = moodOption(answers.mood);
    if (mood && mood.categories && mood.categories.length && mood.categories.includes(ev.category)) {
      score += 60;
    }
    if (answers.priority === 'free' && ev.feeType === 'free') score += 20;
    let completeness = 0;
    if (ev.description) completeness += 1;
    if (ev.location) completeness += 1;
    if (ev.externalUrl) completeness += 1;
    score += completeness * (10 / 3);
    const daysFromToday = Math.max(0, (new Date(ev.date) - new Date(getTodayStr())) / 86400000);
    score += Math.max(0, 10 - daysFromToday);
    return score;
  }

  function rankEvents(events, answers) {
    return events
      .map((ev) => ({ ev, score: scoreEvent(ev, answers) }))
      .sort((a, b) => b.score - a.score || a.ev.date.localeCompare(b.ev.date));
  }

  /** 上位から順に選びつつ、同じカテゴリが2件続いたら（代替候補がある限り）1件スキップして
   *  多様性を持たせる。無理に関連性の低いイベントを混ぜるわけではなく、あくまで並び替えのみ。 */
  function diversify(ranked, n) {
    const chosen = [];
    const counts = {};
    for (const r of ranked) {
      if (chosen.length >= n) break;
      const cat = r.ev.category;
      if ((counts[cat] || 0) >= 2 && ranked.length > n) continue;
      chosen.push(r);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    for (const r of ranked) {
      if (chosen.length >= n) break;
      if (!chosen.includes(r)) chosen.push(r);
    }
    return chosen;
  }

  /** STEP3: 結果の組み立て。気分(カテゴリ)の条件に合う候補が3件に満たない場合、
   *  不足分を「条件を少し広げた候補」として別枠で返す（日程・参加資格のハード条件は緩めない）。 */
  function buildRecommendations(answers) {
    const eligible = getEligibleEvents(answers);
    const mood = moodOption(answers.mood);
    const hasMoodFilter = !!(mood && mood.categories && mood.categories.length);
    const ranked = rankEvents(eligible, answers);

    if (!hasMoodFilter) {
      return { matched: diversify(ranked, 3), broadened: [], eligibleTotal: eligible.length };
    }

    const inCategory = ranked.filter((r) => mood.categories.includes(r.ev.category));
    if (inCategory.length >= 3) {
      return { matched: diversify(inCategory, 3), broadened: [], eligibleTotal: eligible.length };
    }
    const outCategory = ranked.filter((r) => !mood.categories.includes(r.ev.category));
    return { matched: inCategory, broadened: outCategory.slice(0, 3 - inCategory.length), eligibleTotal: eligible.length };
  }

  /** 実際にマッチした条件だけから、決定論的に(推測せず)理由文を組み立てる。 */
  function getRecommendationReason(ev, answers, isBroadened) {
    const parts = [];
    const mood = moodOption(answers.mood);
    if (!isBroadened && mood && mood.categories && mood.categories.includes(ev.category)) {
      parts.push(`「${mood.label}」に近いイベントです`);
    }
    if (answers.priority === 'free' && ev.feeType === 'free') {
      parts.push('参加費は無料です');
    }
    const targets = Array.isArray(ev.target) ? ev.target : [];
    if (targets.includes('public')) parts.push('一般参加OKです');
    if (isBroadened && parts.length === 0) parts.push('気分の条件からは少し外れますが、日程・対象者の条件には合っています');
    if (parts.length === 0) parts.push('選んだ条件に合うイベントです');
    return parts.join('。') + '。';
  }

  return { getEligibleEvents, scoreEvent, rankEvents, buildRecommendations, getRecommendationReason, getDateWindow };
})();

/* ============================================================
   UI - モーダルの開閉・質問ステップ・結果表示
   ============================================================ */
let recommendState = { step: 0, answers: {}, triggerElement: null };

function openRecommendModal() {
  recommendState = { step: 0, answers: {}, triggerElement: document.activeElement };
  trackEvent('recommendation_start', {});
  document.getElementById('recommend-modal').classList.add('active');
  document.body.style.overflow = 'hidden';
  // モーダルの半透明の背景越しに「今週開催」の一覧が透けて見えると、おすすめの3件と
  // 紛らわしく散漫な印象になるため、質問〜結果表示中はいったん非表示にする。
  const upcomingSection = document.getElementById('upcoming-section');
  if (upcomingSection) upcomingSection.classList.add('is-hidden-for-recommend');
  renderRecommendStep();
  setTimeout(() => {
    const closeBtn = document.querySelector('#recommend-modal .modal-close');
    if (closeBtn) closeBtn.focus();
  }, 0);
}

function closeRecommendModal() {
  document.getElementById('recommend-modal').classList.remove('active');
  document.body.style.overflow = '';
  const upcomingSection = document.getElementById('upcoming-section');
  if (upcomingSection) upcomingSection.classList.remove('is-hidden-for-recommend');
  if (recommendState.triggerElement && typeof recommendState.triggerElement.focus === 'function') {
    recommendState.triggerElement.focus();
  }
}

function recommendAnswer(questionId, value) {
  recommendState.answers[questionId] = value;
  trackEvent('recommendation_answer', { question: questionId, value: String(value) });
  recommendState.step += 1;
  if (recommendState.step >= RECOMMEND_QUESTIONS.length) {
    renderRecommendResults();
  } else {
    renderRecommendStep();
  }
}

function recommendGoBack() {
  if (recommendState.step <= 0) return;
  recommendState.step -= 1;
  renderRecommendStep();
}

function recommendConfirmCustomDate() {
  const input = document.getElementById('recommend-custom-date');
  if (!input || !input.value) return;
  recommendAnswer('when', 'custom');
  recommendState.answers.customDate = input.value;
}

function renderRecommendStep() {
  const body = document.getElementById('recommend-modal-body');
  if (!body) return;
  const q = RECOMMEND_QUESTIONS[recommendState.step];
  const progress = `${recommendState.step + 1} / ${RECOMMEND_QUESTIONS.length}`;

  body.innerHTML = `
    <div class="recommend-progress">${progress}</div>
    <h3 class="recommend-question-title">${escapeHtml(q.title)}</h3>
    <div class="recommend-options">
      ${q.options.map((opt) => opt.needsDate ? `
        <div class="recommend-date-option">
          <input type="date" id="recommend-custom-date" class="recommend-date-input" min="${escapeHtml(getTodayStr())}">
          <button type="button" class="recommend-option-btn" onclick="recommendConfirmCustomDate()">${escapeHtml(opt.label)}</button>
        </div>` : `
        <button type="button" class="recommend-option-btn" onclick="recommendAnswer('${q.id}', '${opt.value}')">${escapeHtml(opt.label)}</button>`
      ).join('')}
    </div>
    ${recommendState.step > 0 ? `<button type="button" class="recommend-back-btn" onclick="recommendGoBack()">← 戻る</button>` : ''}
  `;
}

function recommendResultCardHTML(ev, answers, isBroadened, rank) {
  const reason = recommendationEngine.getRecommendationReason(ev, answers, isBroadened);
  const url = buildEventPageUrl(ev);
  return `
    <a class="recommend-result-card" href="${escapeHtml(url)}" onclick="trackEvent('recommendation_result_click', {event_id: '${escapeHtml(String(ev.id))}', rank: ${rank}})">
      <div class="recommend-result-tags">
        <span class="tag ${categoryClass(ev.category)}">${escapeHtml(categoryLabel(ev.category))}</span>
        <span class="tag ${feeClass(ev.feeType)}">${escapeHtml(ev.feeText || feeLabel(ev.feeType))}</span>
      </div>
      <p class="recommend-result-title">${escapeHtml(ev.title)}</p>
      <p class="recommend-result-meta">📅 ${formatEventDateDisplay(ev)}${ev.startTime ? `　${escapeHtml(formatTime(ev.startTime, ev.endTime))}` : ''}</p>
      ${ev.location ? `<p class="recommend-result-meta">📍 ${escapeHtml(ev.location)}</p>` : ''}
      <p class="recommend-result-reason">${escapeHtml(reason)}</p>
      <span class="recommend-result-cta">詳細・参加方法を見る →</span>
    </a>`;
}

function renderRecommendResults() {
  const body = document.getElementById('recommend-modal-body');
  if (!body) return;
  const answers = recommendState.answers;
  const { matched, broadened, eligibleTotal } = recommendationEngine.buildRecommendations(answers);

  trackEvent('recommendation_complete', { matched_count: matched.length, broadened_count: broadened.length });

  let html = `<button type="button" class="recommend-back-btn recommend-restart-btn" onclick="openRecommendModal()">↺ 条件を選び直す</button>`;

  if (eligibleTotal === 0) {
    html += `
      <div class="recommend-empty-state">
        <p>選んだ日程・対象者の条件に合うイベントが見つかりませんでした。</p>
        <p class="recommend-empty-hint">日程の範囲を広げるか、対象者を「特に指定しない」にして試してみてください。</p>
      </div>`;
  } else if (matched.length === 0) {
    html += `
      <div class="recommend-empty-state">
        <p>現在この条件(気分)に合うイベントはありません。</p>
      </div>
      ${broadened.length > 0 ? `
        <p class="recommend-section-label">条件を少し広げた候補</p>
        <div class="recommend-results">
          ${broadened.map((r, i) => recommendResultCardHTML(r.ev, answers, true, i + 1)).join('')}
        </div>` : ''}`;
  } else {
    html += `
      <div class="recommend-results">
        ${matched.map((r, i) => recommendResultCardHTML(r.ev, answers, false, i + 1)).join('')}
      </div>
      ${broadened.length > 0 ? `
        <p class="recommend-section-label">条件を少し広げた候補</p>
        <div class="recommend-results">
          ${broadened.map((r, i) => recommendResultCardHTML(r.ev, answers, true, matched.length + i + 1)).join('')}
        </div>` : ''}`;
  }

  body.innerHTML = html;

  // 結果表示イベント(impression)は一覧が描画された時点で1回だけまとめて送る
  [...matched.map((r) => ({ r, type: 'matched' })), ...broadened.map((r) => ({ r, type: 'broadened' }))]
    .forEach(({ r, type }, i) => trackEvent('recommendation_result_impression', { event_id: String(r.ev.id), rank: i + 1, type }));
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('recommend-modal');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRecommendModal(); });
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') { closeRecommendModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
});
