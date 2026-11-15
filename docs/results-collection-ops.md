# 結果収集・承認フロー（先行実装の運用仕様）

更新日: 2026-11-14。対象: Waseda Calendarの終了済みイベントに紐づく結果。
新規イベント判定は EVENT_REVIEW_RULES.md、法務は LEGAL_GUARDRAILS.md に従う。

## 最重要ルール

- **イベント収集と結果収集は別工程**。既存ルールの NOT_EVENT（試合結果・開催報告）は新規イベントとして追加しない意味。既存のイベントIDに紐づける結果候補としては調査してよい。
- events.js のIDが存在し、isPublished:true かつ endDate || date の翌日以降になったものだけを対象とする。mergedInto の旧レコードには結果を紐づけない。
- 出典で確認できない結果は書かない。スコア、順位、参加者、開催実績、勝敗を推測しない。異なる出典が食い違う場合は下書きを作らず、メモまたは conflict として止める。
- **運営者が承認した結果だけ** results.js に反映。下書きや候補は results.js に書かない。
- 要約は事実のみの独自文章1〜2文。元の文章や画像を転載しない。選手個人名を記載しない。
- 外部有料LLM APIを実装しない。利用規約・robots等を守る。Instagramの無許可の機械的スクレイピングを実装しない。
- sources.json のハッシュ差分は探索の優先順位づけであり、差分無しは結果無しの証拠ではない。
- この補助スクリプトは**結果収集の準備**であり、Webからの事実抽出・Driveへの自動保存・自動公開はまだ行わない。

## 対象と調査頻度

- スポーツ（category=sports）を優先。競技会・記録会もあるため、match か report かは出典を見て決める。
- music / theater / culture は --include-reports で候補化。結果不要なら not_applicable と記録する。
- 終了後1・3・7・14・30日を再調査目安にする。実行日が合わなければ次回以降に確認。30日以降の古い案件は通常キューから外し、--backfill や公式サイトの変化で再調査する。
- 試験は週3回、1回最大8イベントを目安にする。運営者の確認容量（1日10件、週1時間）は掲載確認と共有する。承認に件数ノルマを設けない。
- 過去のイベントは週10件程度を上限に最近のものから補完。213件の全件を無理に埋めない。

## 出典の優先順位

1. 大会主催者・競技連盟の公式結果表（確定記録・訂正の有無）
2. 早稲田の競技部・出演団体の公式結果／開催報告
3. イベントの externalUrl（告知ページの可能性があるため、結果掲載の有無を別途確認）
4. 早稲田スポーツ新聞会（記事・速報。可能なら公式結果で再照合）
5. 既存の巡回で見つかった公式Instagram投稿URLを手動補助で確認

体育会アカウントの X=巡回しない は維持し、結果収集を理由に通常のInstagram巡回へ戻さない。
同一イベントかどうかを開催日・大会名・競技区分・対戦相手で照合し、別試合との混同を防ぐ。
複数試合・不確かな団体紐づけ・出典間矛盾は、結果を出さず人間へ回す。

## 運用手順

### 1. 収集候補の抽出

Node.js 18以上、追加ライブラリ不要。ネットワークアクセス、LLM呼び出し、GitHubへの書き込みは行わない。

    node scripts/results-collection-queue.js --as-of 2026-11-14 --limit 8
    node scripts/results-collection-queue.js --include-reports --limit 8
    node scripts/results-collection-queue.js --backfill --limit 10 --format json --output .local/results-queue.json

既定では過去30日以内に終了した公開スポーツイベントを抽出する。
results.js がない場合は警告を出し、既公開結果の重複除外ができない。結果表示パッチ統合後に再実行すること。
--events / --results / --state で入力ファイルを指定できる。externalUrl は結果が確認された出典ではない。

### 2. 調査状態の更新

- not_found：出典を確認したが見つからない
- conflict：確認した出典が食い違う（人間が解消するまでキューから除外）
- not_applicable：結果を載せる意味がない
- cancelled：中止を根拠付きで確認（本体のイベント情報の更新も必要）
- pending：調査・承認が必要
- approved：運営者が承認済み
- published：results.js への反映を確認済み

状態は .local/results-collection-state.json（Git管理外）に保存。PCやセッションをまたぐ場合は運営者がこのJSONを同期すること。候補抽出だけでは状態は変わらない。

    node scripts/results-collection-queue.js mark --id evt-113 --status not_found --checked-at 2026-11-14 --note "公式結果未掲載"

mark コマンドは実際の出典確認を行わない。担当者が事実に基づいて記入する。

### 3. 下書き作成

管理者指定のGoogle Driveフォルダへ、調査担当が 結果下書き_YYYYMMDD.txt を保存する。補助スクリプト自体はDriveを操作しない。
出典矛盾・未発見は # で始まるメモにする。下書きの1行は次の10列。

    evt-113|match|男子|win|1-0|前半0-0／後半1-0||出典に基づく独自要約|https://example.org/results|競技部公式

順に イベントID|kind|team|outcome|score|detail|award|summary|出典URL|出典名。
任意の項目は空欄。複数出典・複数試合・本文に区切り文字を含む案件は、1行形式に詰め込まず別途個別確認する。

### 4. 運営者の承認と検査

出典を確認した運営者が、承認する行の**行頭にだけ OK と半角スペース**を付ける。

    OK evt-113|match|男子|win|1-0|前半0-0／後半1-0||出典に基づく独自要約|https://example.org/results|競技部公式

    node scripts/check-result-drafts.js 結果下書き_20261114.txt --as-of 2026-11-14
    node scripts/check-result-drafts.js 結果下書き_20261114.txt --out .local/results-approved.json

検査は OK 行だけを処理する。イベントID、公開・終了状態、出典URL、列数、勝敗・スコアの形式等を確認する。
**元出典の事実の正しさ、出典間矛盾、要約の転載の有無は保証できない。** 必ず人間が確認する。
--out は上書きを拒否する。生成したJSONはレビュー用であり、results.js ではない。

GitHubへの書き込み担当は、承認内容を未公開パッチの正式スキーマに照合した後、results.js に取り込み、必ず node scripts/check-results.js を実行する。パッチがGitHubへ反映されるまでこの段階は実行不可。

### 5. 公開後の再確認

出典の訂正を検知した場合、公開済みの結果を自動上書きせず、差分を要確認へ回す。PK等の特殊勝敗、団体ページの紐づけ、別試合の混入にも注意する。

## 重複実行とセッション衝突

- 候補抽出は読み取り専用。朝の掲載更新や午後のSNS投稿とは別工程とする。
- 最初は定期実行を新設せず、週3回の独立試験とする。
- 状態更新のローカルファイルには排他ロックを使う。GitHubの反映前には最新のmainを再取得してIDと結果の重複を確認する。
- **時刻をずらすだけでは重複実行は防げない。** 本番自動化時には共有ロック、実行ID、元コミットSHA、失敗時の非公開停止を別途導入する。

## 実装済み / 未実装

| 作業 | 状態 |
| --- | --- |
| 公開イベントから調査候補を抽出 | scripts/results-collection-queue.js |
| 未発見・矛盾などの状態をローカル保存 | 同上のmark |
| OK付き下書きの形式検査・JSON出力 | scripts/check-result-drafts.js |
| HTML/PDF/結果表の自動解釈 | **未実装** |
| Driveへの下書き自動保存 | **未実装** |
| results.js、表示、check-results.js | **未公開パッチと統合待ち** |
| 定期実行、結果自動公開、SNS結果投稿 | **未設定** |
