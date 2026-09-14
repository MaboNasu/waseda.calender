# デザインシステム（現状抽出）

これは新しいデザインシステムを作るファイルではない。**現在`style.css`に実際に存在するルールを抽出したもの**。各項目についてCurrent（現状）／Recommended rule（今後守るべきルール）／Exceptions（例外）を書く。コード上で統一されていない箇所は正直に「現在統一されていない」と明記する。無理に統一する必要はない（それ自体が目的化した過剰な変更になる、SKILL.mdの禁止事項3参照）。

## Colors

**Current**: `:root`（`style.css`冒頭）で定義。
- ブランドカラー: `--enjy: #8B0000`（えんじ色）/ `--enjy-dark: #6B0000` / `--enjy-light: #A52020` / `--enjy-pale: #FBF0F0`（薄いホバー背景・タグ背景用）
- グレースケール: `--gray-50`〜`--gray-800`（9段階）
- テキスト: `--text-primary: #1F2937` / `--text-secondary: #4B5563` / `--text-muted: #9CA3AF`
- カテゴリタグ色（`.tag-sports`等）: 各カテゴリごとにパステル背景＋濃色文字（例: sports=`#DBEAFE`/`#1D4ED8`）。7カテゴリ全てに専用配色あり。
- 状態色: `.tag-free`=緑系, `.tag-paid`=赤系, `.tag-unknown`=グレー, `.tag-ended`=濃グレー背景に白文字

**Recommended rule**: 新しい色を追加する前に、既存の`--enjy`系・グレースケール・カテゴリタグ配色で表現できないか確認する。ブランドカラー以外の強い色（原色に近い赤・青等）を新規追加しない。

**Exceptions**: 参加費チップの色（緑＝無料/赤＝有料）は色のみに依存していない設計を維持すること（必ずテキストも併記されている。`accessibility.md`の色のみによる情報伝達禁止と対応）。

## Typography

**Current**:
- 本文: `--font-main: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif`
- 見出し: `--font-heading: 'Noto Serif JP', 'Hiragino Mincho ProN', serif`（セクションタイトル等、明朝体で権威感を出す使い分け）
- 投稿用画像生成（`image-generator.js`）内は`Noto Sans JP`固定。

**Recommended rule**: 見出し（h1/h2/セクションタイトル）は明朝体（`--font-heading`）、本文・UI要素は`--font-main`のゴシック体、という使い分けを維持する。

**Exceptions**: なし（比較的一貫している）。

## Font-size / Font-weight

**Current**: rem単位が基本。セクションタイトル`1.4rem`/700、カード内本文`0.85〜1rem`、タグ・チップ`0.68〜0.7rem`/700、ボタン`0.82rem`（`.btn-sm`）など、要素の重要度に応じた明確な段階がある。

**Recommended rule**: 新しいテキスト要素を追加するときは、既存の近い役割の要素（タグなら`.tag`、ボタンなら`.btn`系）のサイズをそのまま流用する。新しいfont-size値を単独で追加しない。

**Exceptions**: `index.html`内の`#today-count`/`#upcoming-count`等、一部の要素がクラスではなくインラインstyle（`style="font-size:0.85rem;font-weight:500;color:#6B7280;..."`）で個別指定されている。これは既存の`.section-count`クラスの定義と実質的に重複しており、**現在統一されていない**。急ぎ直す必要はないが、次にこの周辺を触る機会があれば`.section-count`クラスに寄せることを推奨。

## Spacing

**Current**: `rem`ベース（0.25刻みが多い: 0.25/0.4/0.5/0.75/1/1.25/1.5/2rem）。CSS変数化はされておらず、値は各セレクタに直書き。

**Recommended rule**: 新しいpadding/marginを追加するときは、近い階層の既存要素と同じ値を使う（0.25刻みから外れた値、例えば0.3remや0.6remのような半端な値を増やさない——ただし既存コードにも`0.6rem`等一部半端な値があり、これは許容範囲として扱う）。

**Exceptions**: なし特記事項。CSS変数化されていない点は「現状統一されていない」というより「そもそもトークン化されていない」——無理にCSS変数を新設する必要はない。

## Border radius

**Current**: `--radius-sm: 6px` / `--radius-md: 10px` / `--radius-lg: 16px`。ボタンや小さいタグは`radius-sm`〜`md`、カード・モーダル・パネルは`radius-lg`、円形要素（アイコンボタン、バッジ）は`50%`。

**Recommended rule**: 新しい角丸要素は上記3段階＋`50%`（円形）のいずれかを使う。中間的な値（例: 12px, 20px）を新設しない。

## Shadows

**Current**: `--shadow-sm` / `--shadow-md` / `--shadow-lg`の3段階（黒の低透明度box-shadow）。ホバー時に`shadow-sm`→`shadow-md`へ変化させる演出が複数箇所である（`.btn-white:hover`等）。

**Recommended rule**: 新しい影を追加する場合はこの3段階から選ぶ。

## Buttons

**Current**: `.btn`が共通ベース（`display:inline-flex`、gap、padding等）。バリアント:
- `.btn-enjy`: 塗りつぶし（プライマリ）。ホバーで`enjy-dark`＋浮き上がり＋影。
- `.btn-ghost`: アウトライン（セカンダリ）。ホバーで`enjy-pale`背景。
- `.btn-white` / `.btn-outline-white`: ヒーローセクション（暗い背景）専用。
- 修飾子: `.btn-sm`（小型）、`.btn-full`（幅100%）。

**Recommended rule**: 新しいボタンは必ずこの4バリアント＋2修飾子の組み合わせで表現する。新しい色・新しいバリアントクラスを追加しない。1画面に「強調ボタン（`.btn-enjy`)」が並立しすぎる場合はCTA Clarityの問題として扱う（`review-checklist.md`参照）。

**Exceptions**: なし。この部分は比較的よく統一されている。

## Links

**Current**: `.event-external-link`（カード用、タップ領域確保済み）、`.org-link`（団体SNS/公式サイトリンク）、`.organizer-link`（団体ページへの内部リンク）など、文脈ごとに個別クラスがある。外部リンクは`target="_blank" rel="noopener noreferrer"`が徹底されている。

**Recommended rule**: 外部リンクを新設する場合は必ず`target="_blank" rel="noopener noreferrer"`を付ける。新しいリンクスタイルを作る前に、同じ文脈の既存クラスがないか確認する。

## Cards

**Current**: 主に2系統。
- `.event-card`系（イベント一覧）: タイトル・日時・場所・カテゴリタグ・参加費タグ・CTAリンクを含むフル情報カード。
- `.org-card`（団体一覧）: 団体名・ジャンル・掲載中バッジ・イベント件数のみのコンパクトカード（2026-09に説明文・リンクを詳細ペインへ移動済み）。

**Recommended rule**: 一覧表示用のカードは情報を絞る（Progressive Disclosure）。詳細情報は個別ページ・モーダル・詳細ペインに置く。新しいカードタイプを作る前に、この2系統のどちらに近いか検討する。

## Chips / Badges

**Current**: `.tag`（カテゴリ・料金・終了ラベル）、`.tag-audience`（対象者チップ、白背景＋えんじ色ボーダー）、`.org-listed-badge`（掲載中バッジ）、`.org-event-count-badge`。いずれも小さいpill型、`display:inline-block`または`inline-flex`。

**Recommended rule**: 新しいラベル的UIは`.tag`系のスタイル（角丸pill、小さいfont-size、意味に応じた配色）を踏襲する。

## Forms

**Current**: `.filter-select` / `.filter-input`（絞り込みパネル）、`contact.html`の申請フォーム。ラベルは`<label for="...">`で紐づけ済み（`filter-category`等で確認）。

**Recommended rule**: 新しいフォーム要素は`<label for>`を必ず紐づける（`accessibility.md`参照）。

## Filters

**Current**: `.filter-section`（PC/モバイル共通で初期折りたたみ、`#filter-toggle`の`aria-expanded`で開閉）、`.filter-grid`（`grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`でレスポンシブ）。団体一覧側は`org-genre`セレクト＋`org-keyword`テキスト入力のシンプルな2軸。

**Recommended rule**: フィルター項目を追加する場合、Hick's Law（`principles.md`）に照らして本当に必要か検討する。項目を増やすなら初期折りたたみ・段階的開示とセットで考える。

## Modal

**Current**: `.modal-header` / `.modal-body` / `.modal-footer`の3段構成。オーバーレイクリック・Escキーで閉じる、Tabキーでのフォーカストラップ実装済み（`setupModal`）。おすすめ機能モーダル（`recommend-modal`）も同じ開閉パターンを踏襲。

**Recommended rule**: 新しいモーダルは既存の`setupModal`のフォーカストラップ・Esc・オーバーレイクリックのパターンを再利用する。独自の開閉ロジックを新設しない。

## Navigation

**Current**: PC=`.header-nav`（横並びボタン）、モバイル=ハンバーガー+`.mobile-nav`（`aria-expanded`管理済み）。ページ内スクロールは`scrollToSection()`に統一され、折りたたみ済みセクションへの遷移は自動展開してからスクロールする（2026-09-14修正）。

**Recommended rule**: 新しいナビゲーション導線は`scrollToSection()`を経由する（独自のスクロール処理を書かない）。

## CTA

**Current**: `registrationUrl`（あれば`.btn-enjy`＝最優先）＋`externalUrl`（`.btn-ghost`、`registrationUrl`がある場合は控えめ、無ければ`.btn-enjy`）の2階層。カード単位では`.event-external-link`（コンパクト版）。

**Recommended rule**: 1つのイベント/画面で「強く推す行動」は1つに絞る。複数のCTAがある場合は視覚的な強弱（`.btn-enjy` vs `.btn-ghost`）で優先順位を示す。

## Responsive breakpoints

**Current**: `768px`が最も多用される主要境界（PC/モバイルレイアウト切替、`.org-layout`の1カラム化等）。それ以外に`600px`/`560px`/`480px`（より小さい画面向けの微調整）、`1200px`（中間幅の調整）が個別箇所で使用。`prefers-reduced-motion: reduce`はグローバルで全アニメーション・トランジションを無効化する対応が既に入っている。

**Recommended rule**: 主要な表示切り替え（レイアウト自体が変わるもの）は`768px`を使う。それより細かい微調整（フォントサイズ等）が必要な場合のみ小さいブレークポイントを追加する。詳細は`mobile-guidelines.md`参照。
