# Waseda Calendar

早稲田大学関連のイベント情報をまとめて確認できるカレンダーサイト。

> 将来的に「**WasePass**」というイベントプラットフォームにつながる前身サービスです。

---

## サイト概要

| 項目 | 内容 |
|---|---|
| サイト名 | Waseda Calendar |
| 目的 | 早稲田大学関連イベントの日程・時間・場所・内容の一覧表示 |
| 対象 | 在学生・OBOG・地域住民・一般参加者 |
| 種別 | 静的Webサイト（HTML/CSS/JavaScript） |
| 更新方法 | 運営者が `events.js` を直接編集 |

---

## ファイル構成

```
/
├── index.html     # メインHTML（全ページ1ファイルに集約）
├── style.css      # スタイルシート（えんじ色テーマ・レスポンシブ対応）
├── script.js      # メインJavaScript（カレンダー・絞り込み・モーダル・ランキング等）
├── events.js      # ★ イベントデータ管理ファイル（運営者が編集）
├── organizations.html # 掲載団体一覧ページ
├── organizations.js   # 掲載団体データ管理ファイル
├── organizations-page.js # 掲載団体一覧ページ用JavaScript
└── README.md      # このファイル
```

---

## ローカルでの確認方法

### 方法1: VSCode + Live Server（推奨）
1. VSCode に「Live Server」拡張機能をインストール
2. `index.html` を開き、右クリック → "Open with Live Server"

### 方法2: Python簡易サーバー
```bash
# Python 3
python -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### 方法3: Node.js
```bash
npx serve .
```

> ⚠ `file://` プロトコルで直接開くと、`events.js` の読み込みが失敗する場合があります。
> 必ずローカルサーバーを経由して確認してください。

---

## イベント情報の追加・更新方法

`events.js` の `EVENTS` 配列にオブジェクトを追加・編集します。

```javascript
const EVENTS = [
  {
    id: "evt-001",                    // 一意のID（重複不可）
    title: "早稲田大学 春の演劇祭",    // イベント名
    date: "2025-06-20",               // 開催日（YYYY-MM-DD形式）
    startTime: "14:00",               // 開始時間（HH:MM形式）
    endTime: "17:00",                 // 終了時間（HH:MM形式）
    location: "大隈記念講堂",          // 会場名（自由記述）
    campus: "waseda",                 // キャンパス区分（下記参照）
    organizer: "早稲田大学演劇倶楽部", // 主催団体名
    category: "theater",             // カテゴリ（下記参照）
    target: ["student", "public"],   // 対象者（配列、複数可）
    feeType: "free",                 // 参加費種別（"free" or "paid"）
    feeText: "無料",                  // 参加費の表示テキスト（自由記述）
    description: "春の演劇公演です。", // イベント説明
    reactions: {                       // 静的なリアクション件数（任意）
      interested: 12,                  // 気になる
      wantToGo: 5,                     // 行きたい
      going: 3                         // 参加予定
    },
    externalUrl: "https://...",      // 公式サイトURL（任意）
    lastUpdated: "2025-06-01",       // 最終更新日（YYYY-MM-DD）
    isPublished: true                // true=公開 / false=非公開（下書き）
  }
];
```

### 日付・時間の形式

| 項目 | 形式 | 例 |
|---|---|---|
| date | `YYYY-MM-DD` | `2025-06-20` |
| startTime | `HH:MM` | `14:00` |
| endTime | `HH:MM` | `17:30` |
| lastUpdated | `YYYY-MM-DD` | `2025-06-01` |

### category の選択肢

| 値 | 表示ラベル |
|---|---|
| `sports` | スポーツ |
| `culture` | 文化 |
| `music` | 音楽 |
| `theater` | 演劇 |
| `lecture` | 講演 |
| `community` | 地域 |
| `other` | その他 |

### target の選択肢（配列で複数指定可）

| 値 | 表示ラベル |
|---|---|
| `student` | 在学生向け |
| `obog` | OBOG向け |
| `public` | 一般参加可 |
| `applicant` | 受験生向け |

### campus の選択肢

| 値 | 表示ラベル |
|---|---|
| `waseda` | 早稲田キャンパス |
| `toyama` | 戸山キャンパス |
| `nishiwaseda` | 西早稲田キャンパス |
| `tokorozawa` | 所沢キャンパス |
| `takadanobaba` | 高田馬場周辺 |
| `outside` | 学外 |
| `online` | オンライン |

---

## イベント情報の削除方法

1. `events.js` を開く
2. 削除したいイベントのオブジェクトを `EVENTS` 配列から削除する
3. または、`isPublished: false` に変更して非表示にする（データを残す場合）

```javascript
// 非表示にする場合（データは残す）
isPublished: false,

// 削除する場合（配列から丸ごと削除）
// 該当オブジェクト { id: "evt-001", ... } を削除
```

---

## セキュリティ・運用上の注意

- 一般ユーザーは `events.js` を直接変更できません
- サイト上に投稿・編集・削除機能はありません
- イベント情報の変更は **運営者のみ** が `events.js` を編集することで行います
- `isPublished: false` のイベントはサイトに表示されません

---

## 問い合わせフォームに送信機能を追加する場合の選択肢

### 選択肢1: Formspree（最も簡単）
```html
<!-- index.html の <form> タグを以下に変更 -->
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
```
→ Formspree（https://formspree.io）でアカウント作成・フォームIDを取得

### 選択肢2: Googleフォーム埋め込み
- Googleフォームを作成し、`<iframe>` で埋め込む
- または、Googleフォームの送信URLにリダイレクト

### 選択肢3: Google Apps Script
```javascript
// Apps Script側でPOSTを受け取り、Gmailで通知 + スプレッドシートに記録
const ENDPOINT = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";
// script.js の form.addEventListener('submit', ...) 内でfetchを追加
```

### 選択肢4: メールリンク（最も簡易）
```html
<a href="mailto:contact@example.com?subject=掲載依頼">メールで問い合わせ</a>
```

---

## リアクション機能について

現在のリアクション機能は、UIと静的な件数表示のみです。

- イベント詳細モーダルに「気になる」「行きたい」「参加予定」を表示します
- 各イベントの件数は `events.js` の `reactions` で管理します
- `reactions` がないイベントは、すべて0件として表示されます
- クリックすると「この機能は準備中です。」という案内を表示します
- 現時点では、ユーザーごとの保存・ログイン・データベース更新は行いません

本実装する場合は、ログイン認証とデータベースが必要です。将来的には、1ユーザー1イベントにつき1種類のリアクションまでに制限する想定です。

```javascript
reactions: {
  interested: 0,
  wantToGo: 0,
  going: 0
}
```

## リアクションランキングについて

トップページに「リアクションランキング」を表示します。

- 気になる数ランキング
- 行きたい数ランキング
- 参加予定数ランキング

並び替えは以下に対応しています。

- 件数が多い順
- 開催日が近い順
- 開催日が新しい順

件数が0件のイベントも表示対象です。

---

## 掲載団体一覧について

掲載団体は `organizations.js` の `ORGANIZATIONS` 配列で管理します。

```javascript
const ORGANIZATIONS = [
  {
    id: "org-001",
    name: "団体名",
    nameKana: "だんたいめい",
    alphabetName: "Dantai Name",
    genre: "スポーツ",
    description: "団体概要",
    instagramUrl: "https://www.instagram.com/xxxxx/",
    websiteUrl: "",
    relatedEventIds: []
  }
];
```

### 団体データの追加・修正・削除

- 追加: `ORGANIZATIONS` 配列に新しいオブジェクトを追加します
- 修正: 該当団体の項目を書き換えます
- 削除: 該当団体のオブジェクトを配列から削除します

### 各項目の役割

- `name`: サイト上に表示する団体名
- `nameKana`: 五十音順ソートに使う読み仮名
- `alphabetName`: アルファベット順ソートに使う英字名
- `genre`: ジャンルフィルターに使う値
- `description`: 一覧カードと詳細表示に使う団体概要
- `instagramUrl`: Instagramリンク
- `websiteUrl`: 公式サイトリンク。ない場合は空文字でOKです
- `relatedEventIds`: `events.js` のイベントIDを配列で指定します

掲載団体一覧ページでは、ジャンルフィルター、五十音順・アルファベット順の並び替え、キーワード検索が使えます。

---

## スマホ表示について

スマホ表示では、PCと同じ7列カレンダーではなく、日付ごとのリスト形式に切り替えます。

- PC: 月間グリッドカレンダー
- スマホ: イベントがある日付のみリスト表示

フォーム、検索欄、ランキング、掲載団体一覧はスマホ幅に収まるように調整しています。

---

## 将来的に管理画面を追加する場合の考え方

### Phase 1（現在）: `events.js` 直接編集
- 運営者がファイルを手動編集
- Git/GitHubでバージョン管理を推奨

### Phase 2: スプレッドシート連携
- Googleスプレッドシートをデータソースとして活用
- Google Apps Script APIでJSONを取得・表示
- 非エンジニアでも更新しやすい

### Phase 3: 簡易管理画面
- パスワード保護された `/admin/` ページを追加
- ローカルストレージまたはFirebaseでデータ管理

### Phase 4: フルバックエンド
- Node.js + PostgreSQL / Supabase / Firebase Firestore
- 管理画面、申請承認フロー、会員機能（WasePass）

---

## 広告枠・スポンサー枠について

現時点では、サイト上に広告枠を表示していません。
Google AdSenseも未導入です。

今後、広告掲載やスポンサー依頼が来た場合、またはサイトのコンテンツ量・アクセス数が増えた段階で、以下のような位置への追加を検討します。

- 絞り込みパネル下
- カレンダー下
- ページ下部、フッター手前

広告を追加する場合も、イベント情報の探しやすさを損なわない位置に配置します。
特に、イベント一覧・カレンダー・掲載依頼導線の間に大きな広告を入れすぎないよう注意してください。

`index.html` には、将来広告掲載・スポンサー枠を追加しやすいよう、絞り込みパネル下にコメントだけ残しています。

---

## 将来的に追加したい機能（WasePass への道筋）

| 機能 | 難易度 | 備考 |
|---|---|---|
| Googleフォーム連携 | ★☆☆ | Formspreeで即対応可 |
| Googleスプレッドシート連携 | ★★☆ | Apps Script |
| 管理画面 | ★★☆ | Firebase + 認証 |
| Googleカレンダー連携 | ★★☆ | Calendar API |
| InstagramやX連携 | ★★☆ | 各SNS API |
| データベース（本格移行） | ★★★ | Supabase / PostgreSQL |
| チケット販売 | ★★★ | Stripe連携 |
| WasePass会員機能 | ★★★ | 認証 + サブスク |
| Google AdSense | ★☆☆ | 審査・ポリシー対応が必要 |

---

## サイト名を「WasePass」に変更する場合

以下の箇所を変更してください:

- `index.html`: `<title>`, `.logo-main`, `.hero-badge`, `og:title`, `og:description`
- `style.css`: コメント内のサイト名（任意）
- `events.js`: コメント内のサイト名（任意）
- `README.md`: サイト名の記載箇所

---

*Waseda Calendar – 早稲田のイベントを、ひとつのカレンダーで。*
