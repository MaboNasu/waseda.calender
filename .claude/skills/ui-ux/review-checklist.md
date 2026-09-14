# UI変更後のレビューチェックリスト

UI変更を行った後（または提案する前）に確認する項目。全項目が毎回関係するわけではない——変更の内容に応じて該当する項目だけ確認する。

## User Goal

- [ ] 目的達成しやすくなったか（`waseda-calendar-ux.md`のユーザージャーニーのどの段階を改善したか説明できるか）
- [ ] 不要な操作（タップ・スクロール・判断）が増えていないか

## Visual Hierarchy

- [ ] 最重要情報（イベント名・日時・参加可否に関わる情報）が最も目立つか
- [ ] 全要素が同じ強さになっていないか（すべてが太字・すべてが同じ色は階層がない状態）

## Information

- [ ] 必要情報（`waseda-calendar-ux.md`の参加判断に重要な情報リスト）が不足していないか
- [ ] 不要情報が増えていないか（情報量を増やすこと自体を改善と誤認していないか）

## CTA

- [ ] 次の行動が明確か（Information Scent）
- [ ] CTAが複数競合していないか（強調ボタンが並立していないか、`design-system.md`のCTA項目参照）

## Mobile

- [ ] 小さい画面（〜320/375/390px）で問題ないか
- [ ] タップしやすいか（44px前後のタップ領域、`mobile-guidelines.md`）
- [ ] 縦方向に読みやすいか（横スクロールを要求していないか）
- [ ] hover前提になっていないか（`mobile-guidelines.md`のHover禁止）

## Desktop

- [ ] 不自然に余白が広すぎないか
- [ ] 情報密度が低すぎないか（モバイル向けの余白設計をそのままPCに引き伸ばしていないか）

## Edge Cases（実データで確認する）

以下のような実在するデータパターンで崩れないか確認する（`waseda-calendar-ux.md`の実データ統計参照。値は今後のevents.js更新で変わりうるため、疑わしい場合は下記のようなNodeスクリプトで再確認する）。

- [ ] 長いイベントタイトル（実績: 96文字）
- [ ] 長い団体名（実績: 32文字）
- [ ] 長い会場名（実績: 38文字。投稿用画像で実際にはみ出した実例あり）
- [ ] 料金情報なし（`feeType: "unknown"`が286件中196件——多数派）
- [ ] 対象者情報なし
- [ ] URLなし（`externalUrl`欠損42件）
- [ ] 1日に多数イベント（実績: 最大9件/日）
- [ ] 複数日イベント（77件）
- [ ] 長期間イベント（14件、14日以上）

再確認用のスクリプト例（分析用に恒久ファイルを増やさず、その場でNode -eを使う。STEP 13相当）:

```bash
node -e '
const vm = require("vm"); const fs = require("fs");
const src = fs.readFileSync("events.js", "utf8");
const sandbox = {}; vm.createContext(sandbox);
vm.runInContext(src + "\nvar __E = EVENTS;", sandbox);
const events = sandbox.__E.filter(e => e.isPublished);
console.log("total:", events.length);
// 必要な統計をここに追加する
'
```

## Accessibility

- [ ] コントラスト（`accessibility.md`のtext/non-text contrast）
- [ ] キーボード操作
- [ ] フォーカス状態
- [ ] セマンティックHTML
- [ ] タップ領域

## Regression

- [ ] 既存機能を壊していないか
- [ ] 他ページに影響していないか（`CLAUDE.md`の「Every page is duplicated in two rendering paths」——クライアント側とビルド時生成の両方を変えたか）
- [ ] 共有アセット（`style.css`/`script.js`等）を変更した場合、`?v=N`のバージョンを全ファイルで更新し、静的ページを再生成したか（`CLAUDE.md`のAsset versioning）

## Consistency

- [ ] 他ページとルールが一致しているか（`design-system.md`）
- [ ] 新しいパターンを導入する前に、既存に同じ役割のUIがないか確認したか

## Complexity

- [ ] UIを必要以上に複雑にしていないか（要素・状態・分岐が増えすぎていないか）
- [ ] この変更は「変更しないという結論」の方が適切だった可能性はないか
