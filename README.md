# Wase Calendar

早稲田大学関連のイベント情報をまとめて確認できるカレンダーサイト。

> 将来的に「**WasePass**」というイベントプラットフォームにつながる前身サービスです。

---

## サイト概要

| 項目 | 内容 |
|---|---|
| サイト名 | Wase Calendar |
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
├── script.js      # メインJavaScript（カレンダー・絞り込み・モーダル等）
├── events.js      # ★ イベントデータ管理ファイル（運営者が編集）
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

## Google AdSenseを導入する場合

現在、`index.html` にAdSense設置予定スペース（`.ad-placeholder`）が1箇所あります。

導入には以下が必要です:

1. **AdSenseアカウントの審査**（審査通過まで数週間かかる場合があります）
2. **プライバシーポリシーページの設置**（必須）
3. **AdSenseポリシーへの準拠**（コンテンツポリシー確認）
4. **cookieの同意バナー**（EU向け対応、国内でも推奨）

```html
<!-- AdSense審査通過後、.ad-placeholder を以下に置き換える例 -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
     data-ad-slot="XXXXXXXXXX"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

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

*Wase Calendar – 早稲田のイベントを、ひとつのカレンダーで。*
