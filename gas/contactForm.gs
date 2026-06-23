/**
 * contactForm.gs - Waseda Calendar お問い合わせフォーム用 Google Apps Script
 *
 * セットアップ手順は docs/google-apps-script-setup.md を参照してください。
 */

// ============================================================
// 設定（ここを必ず書き換えてください）
// ============================================================

/** お問い合わせを保存するGoogleスプレッドシートのID（URLの /d/ と /edit の間の文字列） */
const SPREADSHEET_ID = 'ここにスプレッドシートIDを入れる';

/** 保存先のシート名（スプレッドシート下部のタブ名） */
const SHEET_NAME = 'お問い合わせ';

/** 通知メールの送信先（管理者のメールアドレス） */
const ADMIN_EMAIL = 'ここに管理者メールアドレスを入れる';

// ============================================================
// ラベル・優先度の対応表
// ============================================================

const INQUIRY_TYPE_LABELS = {
  'event-request': 'イベント掲載依頼',
  'event-edit': '掲載内容の修正依頼',
  'event-delete': '掲載削除依頼',
  'org-info': '団体情報の掲載・修正',
  'sponsor': '広告・協賛について',
  'bug-report': '不具合報告',
  'other': 'その他'
};

const FIRST_TIME_LABELS = {
  'first': '初めて',
  'repeat': '以前にも問い合わせたことがある',
  'unknown': 'わからない'
};

const BUDGET_LABELS = {
  'undecided': '未定',
  '0-5000': '〜5,000円',
  '5000-10000': '5,000〜10,000円',
  '10000-30000': '10,000〜30,000円',
  '30000plus': '30,000円以上'
};

/** お問い合わせ種別ごとの優先度（高 / 通常） */
const PRIORITY_MAP = {
  'event-delete': '高',
  'event-edit': '高',
  'sponsor': '高',
  'event-request': '通常',
  'org-info': '通常',
  'bug-report': '通常',
  'other': '通常'
};

// ============================================================
// エントリーポイント
// ============================================================

function doGet() {
  return ContentService.createTextOutput('Waseda Calendar contact form endpoint is running.');
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // honeypot: botが入力していたら何もせず成功扱いで返す（ボットに手がかりを与えない）
    if (payload.website) {
      return jsonResponse({ success: true });
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return jsonResponse({ success: false, error: validationError });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    let result;
    try {
      result = appendInquiry(payload);
    } finally {
      lock.releaseLock();
    }

    try {
      sendConfirmationEmail(payload, result.receiptNumber);
      sendAdminNotification(payload, result);
    } catch (mailErr) {
      // メール送信に失敗してもスプレッドシートへの保存自体は完了しているため、送信成功として返す
      Logger.log('メール送信エラー: ' + mailErr);
    }

    return jsonResponse({ success: true, receiptNumber: result.receiptNumber });
  } catch (err) {
    Logger.log('doPost エラー: ' + err);
    return jsonResponse({ success: false, error: '送信処理中にエラーが発生しました。時間をおいて再度お試しください。' });
  }
}

// ============================================================
// バリデーション（クライアント側のチェックを迂回されても安全なように再検証）
// ============================================================

function validatePayload(payload) {
  if (!payload.inquiryType) return 'お問い合わせ種別が未入力です。';
  if (!payload.firstTimeSelfReport) return '初めてかどうかの選択が未入力です。';
  if (!payload.name) return 'お名前が未入力です。';
  if (!payload.organization) return '団体名・所属が未入力です。';
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return 'メールアドレスが正しくありません。';
  if (!payload.message) return 'お問い合わせ内容が未入力です。';
  if (!payload.consent) return '個人情報の利用への同意が必要です。';
  return null;
}

// ============================================================
// スプレッドシートへの保存（受付番号発行・初回判定込み）
// ============================================================

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート "' + SHEET_NAME + '" が見つかりません。スプレッドシートのタブ名を確認してください。');
  return sheet;
}

/**
 * 受付番号の発行・初回/複数回判定・優先度判定を行い、1行追加する。
 * LockServiceで排他制御された区間内から呼び出すこと（同時アクセスでの番号重複を防ぐため）。
 */
function appendInquiry(payload) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  // 列の並びは下のappendRowと一致させること。
  // [0]受付番号 [7]メールアドレス [8]団体名・所属
  const dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
  const prefix = 'WC-' + dateStr + '-';

  let maxSeq = 0;
  let emailMatchCount = 0;
  let orgMatch = false;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const existingId = String(row[0] || '');
    if (existingId.indexOf(prefix) === 0) {
      const seq = parseInt(existingId.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const existingEmail = String(row[7] || '').toLowerCase();
    const existingOrg = String(row[8] || '').trim();
    if (existingEmail && existingEmail === String(payload.email).toLowerCase()) {
      emailMatchCount++;
    } else if (existingOrg && existingOrg === String(payload.organization).trim()) {
      orgMatch = true;
    }
  }

  const receiptNumber = prefix + String(maxSeq + 1).padStart(3, '0');

  let autoJudgment;
  if (emailMatchCount > 0) {
    autoJudgment = '複数回目';
  } else if (orgMatch) {
    autoJudgment = '関連問い合わせの可能性あり';
  } else {
    autoJudgment = '初回';
  }

  const priority = PRIORITY_MAP[payload.inquiryType] || '通常';

  sheet.appendRow([
    receiptNumber,                                                      // 受付番号
    now,                                                                // 送信日時
    INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType,    // お問い合わせ種別
    FIRST_TIME_LABELS[payload.firstTimeSelfReport] || payload.firstTimeSelfReport, // 初回自己申告
    autoJudgment,                                                       // 自動判定
    emailMatchCount,                                                    // 過去問い合わせ回数
    payload.name,                                                       // お名前
    payload.email,                                                      // メールアドレス
    payload.organization,                                               // 団体名・所属
    payload.organizationUrl || '',                                      // 団体URL・SNS
    payload.targetEventName || '',                                      // 対象イベント名
    payload.targetPageUrl || '',                                        // 対象ページURL
    payload.desiredPublishDate || '',                                   // 希望掲載日
    payload.applicationUrl || '',                                       // 申込URL・詳細URL
    BUDGET_LABELS[payload.budgetRange] || (payload.budgetRange || ''),  // 予算感
    payload.message,                                                    // お問い合わせ内容
    '未対応',                                                            // 対応状況
    priority,                                                           // 優先度
    '',                                                                 // 担当者
    '',                                                                 // 対応メモ
    now                                                                 // 最終更新日
  ]);

  return { receiptNumber: receiptNumber, autoJudgment: autoJudgment, priority: priority, pastCount: emailMatchCount };
}

// ============================================================
// メール送信
// ============================================================

function sendConfirmationEmail(payload, receiptNumber) {
  const subject = '【Waseda Calendar】お問い合わせを受け付けました';
  const nowText = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年MM月dd日 HH:mm');
  const body = payload.name + ' 様\n\n' +
    'お問い合わせいただきありがとうございます。\n' +
    '以下の内容で受け付けました。内容を確認のうえ、必要に応じてご連絡します。\n\n' +
    '----------------------------------------\n' +
    '受付番号: ' + receiptNumber + '\n' +
    'お問い合わせ種別: ' + (INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType) + '\n' +
    '団体名・所属: ' + payload.organization + '\n' +
    '対象イベント名: ' + (payload.targetEventName || '（指定なし）') + '\n' +
    '送信日時: ' + nowText + '\n\n' +
    'お問い合わせ内容:\n' + payload.message + '\n' +
    '----------------------------------------\n\n' +
    'このメールは送信専用です。ご返信いただいても対応できない場合があります。\n\n' +
    'Waseda Calendar\n' +
    'https://wasedacalendar.com/';

  MailApp.sendEmail(payload.email, subject, body);
}

function sendAdminNotification(payload, result) {
  const subject = '【Waseda Calendar】新規お問い合わせ（' + result.priority + '）' + result.receiptNumber;
  const body = '新しいお問い合わせがありました。\n\n' +
    '----------------------------------------\n' +
    '受付番号: ' + result.receiptNumber + '\n' +
    'お問い合わせ種別: ' + (INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType) + '\n' +
    '優先度: ' + result.priority + '\n' +
    '初回/複数回判定: ' + result.autoJudgment + '（メールアドレス一致: ' + result.pastCount + '件）\n' +
    'お名前: ' + payload.name + '\n' +
    'メールアドレス: ' + payload.email + '\n' +
    '団体名・所属: ' + payload.organization + '\n' +
    '対象イベント名: ' + (payload.targetEventName || '（指定なし）') + '\n' +
    '対象ページURL: ' + (payload.targetPageUrl || '（指定なし）') + '\n\n' +
    'お問い合わせ内容:\n' + payload.message + '\n' +
    '----------------------------------------\n\n' +
    'スプレッドシートで詳細を確認してください。';

  MailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

// ============================================================
// レスポンス生成
// ============================================================

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
