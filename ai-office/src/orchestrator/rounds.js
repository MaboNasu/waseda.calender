import { ROLES } from '../roles/roles.config.js';

const ROLE_IDS = ROLES.map((r) => r.id).join(', ');

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

export function buildOpeningPrompt(topic) {
  return `【議題】
${topic}

あなたの役職の立場から、この議題について初期意見を述べてください。
他の役員の意見はまだ見えません。あなた自身の判断だけで答えてください。

以下のJSON形式のみで出力してください(前置き・説明・コードフェンスは一切付けない):
{
  "stance": "あなたの結論・立場を一文で",
  "reasoning": "理由の説明(3〜6文程度)",
  "risks": ["懸念点があれば列挙。なければ空配列"]
}`;
}

export function buildRebuttalPrompt(topic, myRole, myOpening, otherOpenings) {
  const othersText = otherOpenings
    .map((o) => `- [${o.roleId}] ${o.roleName}: ${o.parsed?.stance ?? '(出力解析失敗)'}\n  理由: ${o.parsed?.reasoning ?? ''}`)
    .join('\n');

  return `【議題】
${topic}

【あなた(${myRole.name})の意見表明】
${myOpening?.parsed?.stance ?? '(出力解析失敗)'}

【他の役員の意見表明】
${othersText}

他の役員の意見のうち、あなたが同意できない点に、少なくとも1件は具体的に反論してください
(全員に賛成のみの回答は不可)。targetRole には反論相手のidを次から選んでください: ${ROLE_IDS}

以下のJSON形式のみで出力してください:
{
  "rebuttals": [
    { "targetRole": "反論相手のid", "disagreement": "反論の要旨を一文で", "reason": "具体的な根拠" }
  ]
}`;
}

export function buildRevisionPrompt(topic, myOpening, rebuttalsAgainstMe) {
  const rebuttalsText = rebuttalsAgainstMe.length
    ? rebuttalsAgainstMe
        .map((r) => `- ${r.fromRoleName}より: ${r.disagreement}(根拠: ${r.reason})`)
        .join('\n')
    : '(あなたへの反論はありませんでした)';

  return `【議題】
${topic}

【あなたの意見表明】
${myOpening?.parsed?.stance ?? '(出力解析失敗)'}
理由: ${myOpening?.parsed?.reasoning ?? ''}

【あなたへの反論】
${rebuttalsText}

反論を踏まえて、あなたの立場を維持するか修正するかを判断してください。
維持する場合も、なぜ反論を退けるのかを明確にしてください。

以下のJSON形式のみで出力してください:
{
  "changed": true または false,
  "revisedStance": "修正後(維持する場合は元と同じ内容)の結論を一文で",
  "diffSummary": "何をどう変えたか、または維持する理由の要約(1〜3文)"
}`;
}

export function buildDecisionPrompt(topic, finalOpenings, allRebuttals) {
  const finalStancesText = finalOpenings
    .map((o) => `■ [${o.roleId}] ${o.roleName}\n最終見解: ${o.parsed?.stance ?? '(出力解析失敗)'}`)
    .join('\n\n');

  const rebuttalsText = allRebuttals.length
    ? allRebuttals.map((r) => `- ${r.fromRoleName} → ${r.targetRole}: ${r.disagreement}`).join('\n')
    : '(反論なし)';

  return `【議題】
${topic}

【各役員の最終見解(反論・修正を経た結果)】
${finalStancesText}

【会議中に出た主な反論】
${rebuttalsText}

CEOとして最終決定を下してください。誰のどの主張を採用し、何を退けたのかが
後から読んでも分かるようにしてください。

以下のJSON形式のみで出力してください:
{
  "decision": "最終決定の内容を明確に",
  "keyArguments": ["決定の根拠となった主張を2〜4件、誰の主張かも含めて"],
  "rejectedAlternatives": ["採用しなかった案とその理由を1〜3件"],
  "reasoning": "なぜこの結論に至ったかの説明(3〜6文)"
}`;
}
