# 外部情報源と調査ルール

Claude自身の既存知識だけに依存せず、UI/UX判断の根拠を外部情報源で補強するための一覧と優先順位。

## Tier 1: 一次情報・高信頼

### Nielsen Norman Group
主用途: usability / navigation / information architecture / cognitive load / scanning behavior / mobile UX / search・filter UX

### W3C / WAI / WCAG
主用途: accessibility / contrast / keyboard navigation / focus / semantic HTML / ARIA

### Material Design
主用途: component behavior / navigation / responsive layouts / touch interaction / forms / states

### Apple Human Interface Guidelines
主用途: mobile interaction / touch targets / hierarchy / navigation / feedback

### GOV.UK Design System
主用途: practical usability / forms / clear information architecture / accessible interaction / simple layouts

## Tier 2: 補助資料

### Laws of UX
UX心理法則の整理・確認用途。これ単独を判断の根拠にはしない（`principles.md`に整理済みのため、確認・補強用）。

## Tier 3: 比較対象となる実在サービス

「正解」としてコピーするのではなく、比較・分析対象として使う。

- Google Calendar
- Eventbrite
- Meetup
- Peatix
- Time Out
- 大学イベントカレンダー（他大学の同種サービス）
- その他イベント発見サービス（必要に応じて追加調査）

## 外部調査のルール

UI/UXについて重要な判断をするときは、必要に応じて外部情報を調査する。**ただし毎回すべてを調査する必要はない。**

以下の場合は積極的に調査する:

- 判断に自信がない
- 大規模なUI変更
- 新しいUIパターンを導入する
- アクセシビリティ基準が関係する
- mobile interactionが関係する
- 既存パターンを大きく変更する
- UIについてOwnerとClaudeの意見が割れている
- 複数案の優劣が明確でない

逆に、既存パターンの単純な適用・明らかなバグ修正・`design-system.md`に既にルールがある変更では、外部調査を省略してよい。**「調査すること」自体を目的化しない**（SKILL.mdの禁止事項1〜2参照）。

### 調査時に「他サービスがこうしているから」で結論を出してはいけない

必ず以下を検討する:

1. そのサービスは何の問題を解決しているか
2. なぜそのUIになっているのか
3. Waseda Calendarにも同じ問題があるか
4. ユーザー行動は同じか
5. Waseda Calendarに適用した場合の副作用は何か

Waseda Calendarと比較対象サービスは目的が違う場合が多い（`waseda-calendar-ux.md`参照）。表面的なUIパターンの模倣は禁止する。

## イベント探索サービス研究（比較調査の視点）

イベントサービスを研究するときは、トップページの見た目ではなく、以下のユーザージャーニーの各段階を見る。

| 段階 | 見るポイント |
|---|---|
| Discovery | イベントをどう発見させているか（トップページの導線、検索、レコメンド） |
| Filtering | 日付・場所・カテゴリ等をどう絞るか（項目数、操作方法、初期表示） |
| Event Card | 一覧で何を見せるか（情報量、優先順位） |
| Event Detail | 参加判断に何を見せるか（`waseda-calendar-ux.md`の「参加判断に重要な情報」と比較） |
| CTA | 申込・公式サイトへの誘導方法（ボタンの数・ラベル・階層） |
| Trust | 公式情報・更新日・主催者情報をどう示すか |
| Mobile | スマホでどのような導線になっているか |

比較対象: Eventbrite / Meetup / Peatix / Time Out / Google Calendar 等。ただし必ず「Waseda Calendarとは目的が違う」という前提で分析すること——これらは営利のチケット販売・集客プラットフォームであり、Waseda Calendarは「イベントハブ（情報を集約し公式情報へ送客する）」である。CTAの作り方（自社サイト内で完結させたいEventbrite的な設計）をそのまま真似すると、Waseda Calendarの目的（`waseda-calendar-ux.md`参照）とズレる。
