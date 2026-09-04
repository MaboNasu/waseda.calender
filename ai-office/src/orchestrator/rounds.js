import { MANDATORY_APPROVAL_CATEGORIES } from '../constitution/constitution.js';

/** モデル出力からJSONを寛容に取り出す。コードフェンス付きでも壊れた出力でも極力救う。 */
export function parseJsonLoose(text) {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return { parseError: true, raw: text };
  }
}

/** Round 0: CEOによる問題定義・招集メンバー決定・Owner承認カテゴリの自己申告。 */
export function buildTriagePrompt(topic, coreCandidates, specialistCandidates, scannedMandatoryTags) {
  const coreList = coreCandidates.map((r) => `- ${r.id}: ${r.name}`).join('\n');
  const specialistList = specialistCandidates.map((r) => `- ${r.id}: ${r.name}`).join('\n');
  const scannedText = scannedMandatoryTags.length
    ? `機械的キーワードスキャンでは以下のカテゴリが検出されています(参考情報。あなた自身でも独立して判断してください): ${scannedMandatoryTags.join(', ')}`
    : '機械的キーワードスキャンでは該当カテゴリは検出されていません(参考情報。あなた自身でも独立して判断してください)。';

  return `【議題】
${topic}

あなたはCEOとしてRound0(問題定義・招集)を行います。

【招集候補(Product/Growth/UX-UI。必要な分だけ選ぶ。CTOとRed Teamは常に参加するため選択不要)】
${coreList}

【専門役(金額・個人情報等に関わる議題の場合のみ追加招集)】
${specialistList}

${scannedText}

以下のJSON形式のみで出力してください:
{
  "problemDefinition": "何を決めるのか・なぜ今決めるのかを2〜3文で",
  "requiredRoles": ["招集するcore役職のidの配列。最低1つ"],
  "specialistRoles": ["追加招集する専門役職idの配列。不要なら空配列"],
  "mandatoryApprovalTags": ["該当すると思うカテゴリidの配列。次から選ぶ: ${MANDATORY_APPROVAL_CATEGORIES.join(', ')}。なければ空配列"],
  "reasoning": "招集判断とカテゴリ判断の理由を簡潔に"
}`;
}

/** Round 1: 独立した意見表明。他者の意見は見せない。 */
export function buildOpeningPrompt(topic) {
  return `【議題】
${topic}

あなたの役職の立場から、この議題について初期意見を述べてください。
他の役員の意見はまだ見えません。あなた自身の判断だけで答えてください。

以下のJSON形式のみで出力してください(前置き・説明・コードフェンスは一切付けない):
{
  "positionTag": "support または oppose または neutral のいずれか",
  "stance": "あなたの結論・立場を一文で",
  "reasoning": "理由の説明(3〜6文程度)",
  "risks": ["懸念点があれば列挙。なければ空配列"]
}`;
}

/** Round 2: Red Team(固定・毎回1回)。全員の初期意見をまとめて批判的に検証する。 */
export function buildRedTeamPrompt(topic, openings) {
  const openingsText = openings
    .map((o) => `- [${o.roleId}] ${o.roleName}(${o.parsed?.positionTag ?? '不明'}): ${o.parsed?.stance ?? '(出力解析失敗)'}\n  理由: ${o.parsed?.reasoning ?? ''}`)
    .join('\n');

  return `【議題】
${topic}

【各役職の初期意見】
${openingsText}

Red Teamとして、以下を確認してください。
- 前提は正しいか
- データはあるか
- もっと簡単な方法はないか
- 副作用はないか
- 本当に今やるべきか

反対のための反対はせず、具体的な指摘がなければ「指摘なし」で構いません。

以下のJSON形式のみで出力してください:
{
  "findings": [
    { "issue": "指摘内容", "relatedRoleId": "関連する役職id(不明なら空文字)", "severity": "low または medium または high" }
  ]
}`;
}

/** Round 3: Revision(条件付き)。Red Teamの指摘、または他者との意見相違を踏まえて修正するか判断する。 */
export function buildRevisionPrompt(topic, myOpening, relevantFindings) {
  const findingsText = relevantFindings.length
    ? relevantFindings.map((f) => `- [${f.severity}] ${f.issue}`).join('\n')
    : '(あなたに直接関連する指摘はありませんでしたが、他の役職との意見の相違を踏まえて再検討してください)';

  return `【議題】
${topic}

【あなたの意見表明】
${myOpening?.parsed?.stance ?? '(出力解析失敗)'}
理由: ${myOpening?.parsed?.reasoning ?? ''}

【Red Team等からの指摘】
${findingsText}

指摘を踏まえて、あなたの立場を維持するか修正するかを判断してください。
維持する場合も、なぜ指摘を退けるのかを明確にしてください。

以下のJSON形式のみで出力してください:
{
  "changed": true または false,
  "revisedStance": "修正後(維持する場合は元と同じ内容)の結論を一文で",
  "diffSummary": "何をどう変えたか、または維持する理由の要約(1〜3文)"
}`;
}

/** Round 4: CTOによる独立したOwner承認要否判定(CEOの判断と合議、Constitution 5-2条)。 */
export function buildApprovalCheckPrompt(topic, myStance) {
  return `【議題】
${topic}

【あなたの技術的見解】
${myStance ?? '(なし)'}

CTOとして、この変更がConstitution 5-1条の固定カテゴリ
(${MANDATORY_APPROVAL_CATEGORIES.join(', ')})のいずれかに該当する可能性がないか、
または技術的リスクの大きさからOwnerの承認を得るべきだと考えるかを判断してください。
判断に迷う場合は "required" を選んでください(安全側に倒す)。

以下のJSON形式のみで出力してください:
{
  "ownerApprovalOpinion": "required または not_required",
  "reason": "判断理由を1〜2文で"
}`;
}

/** Round 5: CEOによる最終決定。 */
export function buildDecisionPrompt(topic, finalStances, redTeamFindings, mandatoryTags, ctoApprovalOpinion) {
  const finalStancesText = finalStances
    .map((s) => `■ [${s.roleId}] ${s.roleName}\n最終見解: ${s.parsed?.stance ?? '(出力解析失敗)'}`)
    .join('\n\n');

  const findingsText = redTeamFindings.length
    ? redTeamFindings.map((f) => `- [${f.severity}] ${f.issue}`).join('\n')
    : '(Red Teamからの指摘なし)';

  const mandatoryText = mandatoryTags.length
    ? `以下のカテゴリに該当すると判定されています(機械スキャンおよび/またはRound0での自己申告): ${mandatoryTags.join(', ')}`
    : '固定カテゴリへの該当は検出されていません。';

  return `【議題】
${topic}

【各役職の最終見解】
${finalStancesText}

【Red Teamの指摘】
${findingsText}

【Owner承認カテゴリの該当状況】
${mandatoryText}

【CTOのOwner承認要否の見解】
${ctoApprovalOpinion?.ownerApprovalOpinion ?? '不明'}(理由: ${ctoApprovalOpinion?.reason ?? ''})

CEOとして最終決定を下してください。単純な多数決ではなく、根拠の質で判断してください。
Owner承認については、固定カテゴリに該当する場合、またはあなた自身かCTOのどちらか一方でも
「必要」と判断した場合は、必ず ownerApprovalRequired を true にしてください
(両方が不要と判断した場合のみ false にできます)。

以下のJSON形式のみで出力してください:
{
  "decision": "adopted または rejected または pending または experiment",
  "keyArguments": ["決定の根拠となった主張を2〜4件、誰の主張かも含めて"],
  "rejectedAlternatives": ["採用しなかった案とその理由を1〜3件。なければ空配列"],
  "reasoning": "なぜこの結論に至ったかの説明(3〜6文)",
  "ownerApprovalOpinion": "required または not_required(あなた自身の判断)",
  "verificationMethod": "採用/実験する場合の検証方法。不要なら空文字",
  "reevaluateAt": "再評価条件または時期。なければ空文字"
}`;
}
