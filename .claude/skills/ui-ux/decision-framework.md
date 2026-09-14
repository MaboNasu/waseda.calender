# 意思決定フレームワーク

UI案を比較するための評価軸。重要なUI変更（`research-workflow.md`のPhase 5で複数案を検討するケース）で使う。

## 評価軸

| 軸 | 意味 |
|---|---|
| User Impact | ユーザー体験改善効果 |
| Frequency | その問題に何人のユーザーが遭遇するか |
| Severity | 問題がどれほど目的達成を妨げるか |
| Confidence | 改善効果についてどれくらい確信があるか |
| Implementation Cost | 実装コスト |
| Maintenance Cost | 今後の保守コスト |
| Consistency | 既存UIとの一貫性 |
| Accessibility | アクセシビリティへの影響 |
| Risk | regressionや副作用 |

必要に応じて定性的に **High / Medium / Low** で比較する。**数字を無理に付けて疑似科学的なスコアリングをしない**（「User Impact 8点、Risk 3点、合計...」のような加算は避ける。各軸は独立した判断材料として扱う）。

## 使い方の例

「フィルターに新しい絞り込み項目（会場）を追加すべきか」という相談を受けたとする。

| 軸 | 評価 | 根拠 |
|---|---|---|
| User Impact | Medium | 会場で絞りたいユーザーは一定数いそうだが、既存の「学内/学外」区分である程度代替できる |
| Frequency | Low〜Medium | 実データで会場欠損が61件あり、絞り込んでも該当しないイベントが一定数出る |
| Severity | Low | 無くても致命的に探せなくなるわけではない |
| Confidence | Low | 実際のユーザー要望が確認できていない |
| Implementation Cost | Small | 既存の`filter-select`パターンを1つ追加するだけ |
| Maintenance Cost | Low | データが揃っていれば低コスト |
| Consistency | High | 既存フィルターパターンに沿える |
| Accessibility | Neutral | 既存パターンを踏襲すれば問題なし |
| Risk | Low | フィルター項目が増えることでHick's Lawの観点からわずかに選択コストが上がる |

→ この場合、Confidence（確信度）が低く、Frequency/Severityも中〜低のため、「今は追加しない、必要になった具体的な根拠（問い合わせ等）が出てから再検討する」という**変更しない判断**も十分成立する（SKILL.mdの最重要原則の一部）。

## Ownerとの意見の相違を扱う指針

- Ownerの提案がUX原則・実データ・実コードと矛盾する場合、上記の評価軸を使って具体的に反論する（「原則的にダメ」という抽象論ではなく、「この提案だと〇〇という実データのケースで崩れる」のように）。
- 逆に、評価軸を並べてもConfidenceが低く優劣がつかない場合は、Ownerの判断・好みを尊重してよい（すべてを理詰めで却下する必要はない）。
- 「UX原則ではこうだから」という権威を理由にした一方的な否定はしない。原則は判断材料であり、Waseda Calendarのユーザー・サービス目的・実装・実データという4つの根拠（`waseda-calendar-ux.md`、SKILL.md）と合わせて総合判断する。
