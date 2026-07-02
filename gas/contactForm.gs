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

/** 問い合わせ・掲載依頼を保存するシート名 */
const INQUIRY_SHEET_NAME = 'お問い合わせ';

/** 団体マスタを保存するシート名 */
const ORG_SHEET_NAME = '団体マスタ';

/** 通知メールの送信先（管理者のメールアドレス） */
const ADMIN_EMAIL = 'ここに管理者メールアドレスを入れる';

/** 確認メールに記載する、団体専用URLのベース */
const SITE_BASE_URL = 'https://wasedacalendar.com/';

/** 登録済み団体からの画像アップロード保存先フォルダ名（無ければ自動作成） */
const DRIVE_FOLDER_NAME = 'Waseda Calendar 添付画像';

/** 画像アップロードの最大サイズ（Base64換算、約5MB相当） */
const MAX_IMAGE_BASE64_LENGTH = 7000000;

// ============================================================
// ラベル・優先度の対応表
// ============================================================

const INQUIRY_TYPE_LABELS = {
  'event-request': 'イベント掲載依頼',
  'event-edit': '掲載内容の修正依頼',
  'event-delete': '掲載削除依頼',
  'org-info': '団体情報の登録・修正',
  'sponsor': '広告・協賛について',
  'bug-report': '不具合報告',
  'other': 'その他'
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

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'lookupOrg') {
    return jsonResponse(lookupOrgByIdAndToken(e.parameter.orgId, e.parameter.token));
  }
  if (action === 'myInquiries') {
    return jsonResponse(listInquiriesByOrg(e.parameter.orgId, e.parameter.token));
  }
  if (action === 'fetchGCalEvents') {
    return jsonResponse(fetchGCalEvents(e.parameter.icalUrl));
  }
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

    const rateLimitError = checkRateLimit(payload.email);
    if (rateLimitError) {
      return jsonResponse({ success: false, error: rateLimitError });
    }

    // 画像アップロードはロック外で処理する（Drive保存は時間がかかるため、ロックの保持時間を最小化する）
    if (payload.entryChoice === 'returning-org' && payload.imageBase64) {
      const driveUrl = saveImageToDrive(payload.imageBase64, payload.imageFileName, payload.imageMimeType);
      if (driveUrl) payload.referenceUrl = driveUrl;
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    let result;
    try {
      result = processSubmission(payload);
    } finally {
      lock.releaseLock();
    }

    if (result.error) {
      return jsonResponse({ success: false, error: result.error });
    }

    // 確認メール・通知メールは個別にtryで囲み、片方の失敗が他方をブロックしないようにする
    // （スプレッドシートへの保存自体はすでに完了しているため、メール送信に失敗しても送信成功として返す）
    try {
      sendConfirmationEmail(payload, result);
    } catch (mailErr) {
      Logger.log('確認メール送信エラー: ' + mailErr);
    }
    try {
      sendAdminNotification(payload, result);
    } catch (mailErr) {
      Logger.log('管理者通知メール送信エラー: ' + mailErr);
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
  if (!payload.entryChoice) return 'ご用件が選択されていません。';
  if (!payload.inquiryType) return 'お問い合わせ種別を特定できませんでした。';
  if (!payload.name) return 'お名前が未入力です。';
  if (!payload.organization) return '団体名・所属が未入力です。';
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return 'メールアドレスが正しくありません。';
  if (!payload.message) return 'お問い合わせ内容が未入力です。';
  if (!payload.consent) return '個人情報の利用への同意が必要です。';

  if (payload.entryChoice === 'returning-org' && (!payload.orgId || !payload.orgToken)) {
    return '団体認証情報が確認できませんでした。';
  }
  if (payload.entryChoice === 'new-org' || payload.entryChoice === 'returning-org') {
    if (!payload.eventName) return 'イベント名が未入力です。';
    if (!payload.eventDate) return '開催日が未入力です。';
    if (payload.eventEndDate && payload.eventEndDate < payload.eventDate) {
      return '終了日は開催日より後の日付にしてください。';
    }
  }

  if (payload.imageBase64) {
    if (payload.entryChoice !== 'returning-org') {
      return '画像添付は登録済み団体のみご利用いただけます。';
    }
    if (!payload.imageMimeType || payload.imageMimeType.indexOf('image/') !== 0) {
      return '画像ファイル以外はアップロードできません。';
    }
    if (payload.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return '画像ファイルが大きすぎます（5MBまで）。';
    }
  }
  return null;
}

// ============================================================
// 簡易レート制限（連打・スクリプトによる大量送信を抑止する応急対策）
//
// CacheServiceはリクエスト間で共有される軽量なキー・バリューキャッシュ（正確な集計ではないが、
// スプレッドシートを読み書きするより高速で、悪用の抑止には十分）。
// Webアプリのdoアクセスからは送信元IPアドレスを取得できないため、メールアドレスをキーにする。
// ============================================================

/** 同一メールアドレスからの最短送信間隔（秒）。これより短い間隔での再送信を拒否する */
const RATE_LIMIT_MIN_INTERVAL_SEC = 20;

/** 同一メールアドレスからの1時間あたりの最大送信回数（主な悪用対策は上の送信間隔側。
 *  こちらは通常利用でまず届かない値にし、大量連打だけを弾く保険として設定する） */
const RATE_LIMIT_MAX_PER_HOUR = 30;

/** レート制限チェック。問題があればエラーメッセージ文字列、問題なければnullを返す */
function checkRateLimit(email) {
  if (!email) return null;
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + String(email).toLowerCase().trim();
  const now = Date.now();

  const lastTime = cache.get(key + '_last');
  if (lastTime && (now - Number(lastTime)) < RATE_LIMIT_MIN_INTERVAL_SEC * 1000) {
    return '送信間隔が短すぎます。しばらく待ってから再度お試しください。';
  }

  const countKey = key + '_count';
  const count = Number(cache.get(countKey) || 0);
  if (count >= RATE_LIMIT_MAX_PER_HOUR) {
    return '送信回数が上限に達しました。時間をおいて再度お試しください。';
  }

  cache.put(key + '_last', String(now), 3600);
  cache.put(countKey, String(count + 1), 3600);
  return null;
}

// ============================================================
// スプレッドシート書き込み用のサニタイズ
// ============================================================

/**
 * ユーザー入力をスプレッドシートのセルに書き込む際、数式として解釈されるのを防ぐ。
 * 先頭が = + - @ の文字列は、Google スプレッドシート上でそのまま数式として実行されてしまうため
 * （数式インジェクション対策）、先頭にシングルクォートを付けて文字列として固定する。
 */
function sanitizeForSheet(value) {
  if (value === null || value === undefined) return value;
  const str = String(value);
  if (/^[=+\-@]/.test(str)) return "'" + str;
  return str;
}

// ============================================================
// シート取得
// ============================================================

function getInquirySheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(INQUIRY_SHEET_NAME);
  if (!sheet) throw new Error('シート "' + INQUIRY_SHEET_NAME + '" が見つかりません。スプレッドシートのタブ名を確認してください。');
  return sheet;
}

function getOrgSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(ORG_SHEET_NAME);
  if (!sheet) throw new Error('シート "' + ORG_SHEET_NAME + '" が見つかりません。スプレッドシートのタブ名を確認してください。');
  return sheet;
}

// ============================================================
// 団体マスタ（団体ID + 認証トークンによる照合）
// ============================================================

/** 団体マスタの列インデックス（0始まり） */
const ORG_COL = {
  id: 0, registeredAt: 1, name: 2, contactName: 3, email: 4,
  sns: 5, description: 6, token: 7, pastCount: 8, lastRequestAt: 9, memo: 10
};

function lookupOrgByIdAndToken(orgId, token) {
  if (!orgId || !token) return { success: false };
  try {
    const sheet = getOrgSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[ORG_COL.id]) === String(orgId) && String(row[ORG_COL.token]) === String(token)) {
        return {
          success: true,
          org: {
            name: row[ORG_COL.name],
            contactName: row[ORG_COL.contactName],
            email: row[ORG_COL.email],
            sns: row[ORG_COL.sns],
            description: row[ORG_COL.description]
          }
        };
      }
    }
  } catch (err) {
    Logger.log('lookupOrgByIdAndToken エラー: ' + err);
  }
  // 該当なし・トークン不一致のどちらでも同じレスポンス（団体IDの存在を推測されないようにする）
  return { success: false };
}

/**
 * 内部の自由記述status/approved列を、団体側に見せる3段階のステータスに変換する。
 * 却下判定はstatus列に「却下」という文字列が含まれているかどうかで行う運用とする
 * （管理者がスプレッドシートのステータス列に「却下」と入力する想定）。
 */
function mapInquiryStatusLabel(approved, statusText) {
  if (approved === true) return '掲載済み';
  const text = String(statusText || '');
  if (text.indexOf('却下') !== -1) return '却下';
  return '審査中';
}

/**
 * orgId + token が一致する場合のみ、その団体に紐づく申請一覧を返す。
 * lookupOrgByIdAndToken と同じ方針：該当なし・トークン不一致のどちらでも詳細を明かさない。
 */
function listInquiriesByOrg(orgId, token) {
  if (!orgId || !token) return { success: false };

  const orgCheck = lookupOrgByIdAndToken(orgId, token);
  if (!orgCheck.success) return { success: false };

  try {
    const sheet = getInquirySheet();
    const data = sheet.getDataRange().getValues();
    const inquiries = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[INQUIRY_COL.orgId] || '') !== String(orgId)) continue;

      const statusLabel = mapInquiryStatusLabel(row[INQUIRY_COL.approved], row[INQUIRY_COL.status]);
      inquiries.push({
        receiptNumber: row[INQUIRY_COL.receiptNumber],
        eventName: row[INQUIRY_COL.eventName],
        eventDate: formatDateValueForDisplay(row[INQUIRY_COL.eventDate]),
        status: statusLabel,
        priority: row[INQUIRY_COL.priority],
        memo: statusLabel === '却下' ? String(row[INQUIRY_COL.memo] || '') : ''
      });
    }

    // 新しい申請が上に来るよう、受付番号の降順（≒受付日時の新しい順）で返す
    inquiries.sort((a, b) => String(b.receiptNumber).localeCompare(String(a.receiptNumber)));

    return { success: true, org: orgCheck.org, inquiries: inquiries };
  } catch (err) {
    Logger.log('listInquiriesByOrg エラー: ' + err);
    return { success: false };
  }
}

/** eventDate列はDateオブジェクトと文字列の両方が入りうるため、表示用に文字列へ揃える */
function formatDateValueForDisplay(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(value);
}

function findOrgRowNumberByIdAndToken(sheet, orgId, token) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ORG_COL.id]) === String(orgId) && String(data[i][ORG_COL.token]) === String(token)) {
      return i + 1; // シートの行番号（1始まり）
    }
  }
  return -1;
}

function generateOrgId(sheet) {
  const data = sheet.getDataRange().getValues();
  let maxSeq = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][ORG_COL.id] || '');
    const match = id.match(/^WCORG-(\d+)$/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return 'WCORG-' + String(maxSeq + 1).padStart(3, '0');
}

/**
 * 団体マスタの新規登録、または既存団体の更新を行い、団体ID・トークン・団体情報を返す。
 * LockService内から呼び出すこと。
 */
function upsertOrg(payload) {
  const orgSheet = getOrgSheet();
  const now = new Date();

  if (payload.entryChoice === 'returning-org') {
    const rowNum = findOrgRowNumberByIdAndToken(orgSheet, payload.orgId, payload.orgToken);
    if (rowNum === -1) {
      return { error: '団体情報の認証に失敗しました。確認メールのURLからアクセスし直してください。' };
    }
    if (payload.editOrgInfo) {
      orgSheet.getRange(rowNum, ORG_COL.name + 1).setValue(sanitizeForSheet(payload.organization));
      orgSheet.getRange(rowNum, ORG_COL.contactName + 1).setValue(sanitizeForSheet(payload.name));
      orgSheet.getRange(rowNum, ORG_COL.email + 1).setValue(sanitizeForSheet(payload.email));
      orgSheet.getRange(rowNum, ORG_COL.sns + 1).setValue(sanitizeForSheet(payload.orgSns || ''));
      orgSheet.getRange(rowNum, ORG_COL.description + 1).setValue(sanitizeForSheet(payload.orgDescription || ''));
    }
    const pastCount = Number(orgSheet.getRange(rowNum, ORG_COL.pastCount + 1).getValue()) || 0;
    orgSheet.getRange(rowNum, ORG_COL.pastCount + 1).setValue(pastCount + 1);
    orgSheet.getRange(rowNum, ORG_COL.lastRequestAt + 1).setValue(now);

    return { orgId: payload.orgId, orgToken: payload.orgToken };
  }

  // new-org または org-info（団体登録が必要な新規ケース）
  const orgId = generateOrgId(orgSheet);
  const token = Utilities.getUuid();
  orgSheet.appendRow([
    orgId, now, sanitizeForSheet(payload.organization), sanitizeForSheet(payload.name), sanitizeForSheet(payload.email),
    sanitizeForSheet(payload.orgSns || ''), sanitizeForSheet(payload.orgDescription || ''), token,
    1, now, ''
  ]);
  return { orgId: orgId, orgToken: token };
}

// ============================================================
// 問い合わせ・掲載依頼シートへの保存（受付番号発行・初回判定込み）
// ============================================================

/**
 * 列の並び（0始まり）。先頭に「掲載OK」チェックボックス列を追加したため、
 * 以降の列は元の並びから+1ずれている。
 * [0]掲載OK [1]受付番号 [8]メールアドレス
 */
const INQUIRY_COL = {
  approved: 0, receiptNumber: 1, timestamp: 2, inquiryType: 3, firstTimeSelfReport: 4, autoJudgment: 5,
  pastCount: 6, name: 7, email: 8, organization: 9, orgUrl: 10, eventName: 11,
  targetPageUrl: 12, desiredPublishDate: 13, applicationUrl: 14, budget: 15, message: 16,
  status: 17, priority: 18, assignee: 19, memo: 20, updatedAt: 21,
  // 末尾に追加した列
  orgId: 22, eventDate: 23, eventStartTime: 24, eventEndTime: 25, eventLocation: 26, referenceUrl: 27,
  eventEndDate: 28, recurringDates: 29
};

function appendInquiry(payload, orgId) {
  const sheet = getInquirySheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  const dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
  const prefix = 'WC-' + dateStr + '-';

  let maxSeq = 0;
  let emailMatchCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const existingId = String(row[INQUIRY_COL.receiptNumber] || '');
    if (existingId.indexOf(prefix) === 0) {
      const seq = parseInt(existingId.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const existingEmail = String(row[INQUIRY_COL.email] || '').toLowerCase();
    if (existingEmail && existingEmail === String(payload.email).toLowerCase()) {
      emailMatchCount++;
    }
  }

  const receiptNumber = prefix + String(maxSeq + 1).padStart(3, '0');
  const autoJudgment = emailMatchCount > 0 ? '複数回目' : '初回';
  const priority = PRIORITY_MAP[payload.inquiryType] || '通常';

  const eventDescriptionNote = payload.eventDescription
    ? 'イベント内容: ' + payload.eventDescription + (payload.message ? '\n\n補足: ' + payload.message : '')
    : payload.message;

  const row = [];
  row[INQUIRY_COL.approved] = false;
  row[INQUIRY_COL.receiptNumber] = receiptNumber;
  row[INQUIRY_COL.timestamp] = now;
  row[INQUIRY_COL.inquiryType] = INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType;
  row[INQUIRY_COL.firstTimeSelfReport] = payload.entryChoice === 'returning-org' ? '以前にも問い合わせたことがある' : '初めて';
  row[INQUIRY_COL.autoJudgment] = autoJudgment;
  row[INQUIRY_COL.pastCount] = emailMatchCount;
  row[INQUIRY_COL.name] = sanitizeForSheet(payload.name);
  row[INQUIRY_COL.email] = sanitizeForSheet(payload.email);
  row[INQUIRY_COL.organization] = sanitizeForSheet(payload.organization);
  row[INQUIRY_COL.orgUrl] = sanitizeForSheet(payload.orgSns || '');
  row[INQUIRY_COL.eventName] = sanitizeForSheet(payload.eventName || payload.targetEventName || '');
  row[INQUIRY_COL.targetPageUrl] = sanitizeForSheet(payload.targetPageUrl || '');
  row[INQUIRY_COL.desiredPublishDate] = sanitizeForSheet(payload.desiredPublishDate || '');
  row[INQUIRY_COL.applicationUrl] = sanitizeForSheet(payload.applicationUrl || '');
  row[INQUIRY_COL.budget] = BUDGET_LABELS[payload.budgetRange] || sanitizeForSheet(payload.budgetRange || '');
  row[INQUIRY_COL.message] = sanitizeForSheet(eventDescriptionNote);
  row[INQUIRY_COL.status] = '未対応';
  row[INQUIRY_COL.priority] = priority;
  row[INQUIRY_COL.assignee] = '';
  row[INQUIRY_COL.memo] = '';
  row[INQUIRY_COL.updatedAt] = now;
  row[INQUIRY_COL.orgId] = orgId || '';
  row[INQUIRY_COL.eventDate] = sanitizeForSheet(payload.eventDate || '');
  row[INQUIRY_COL.eventEndDate] = sanitizeForSheet(payload.eventEndDate || '');
  row[INQUIRY_COL.eventStartTime] = sanitizeForSheet(payload.eventStartTime || '');
  row[INQUIRY_COL.eventEndTime] = sanitizeForSheet(payload.eventEndTime || '');
  row[INQUIRY_COL.eventLocation] = sanitizeForSheet(payload.eventLocation || '');
  row[INQUIRY_COL.referenceUrl] = sanitizeForSheet(payload.referenceUrl || '');
  row[INQUIRY_COL.recurringDates] = sanitizeForSheet(payload.recurringDates || '');

  sheet.appendRow(row);

  return { receiptNumber: receiptNumber, autoJudgment: autoJudgment, priority: priority, pastCount: emailMatchCount };
}

// ============================================================
// 送信処理本体（団体マスタ更新 + 問い合わせ行追加）
// LockService.getScriptLock() で排他制御された区間内から呼び出すこと
// （同時アクセスでの団体ID・受付番号の重複発行を防ぐため）
// ============================================================

function processSubmission(payload) {
  let orgId = '';
  let orgToken = payload.orgToken || '';

  const needsOrgRecord = payload.entryChoice === 'new-org'
    || payload.entryChoice === 'returning-org'
    || payload.entryChoice === 'org-info';

  if (needsOrgRecord) {
    const orgResult = upsertOrg(payload);
    if (orgResult.error) return { error: orgResult.error };
    orgId = orgResult.orgId;
    orgToken = orgResult.orgToken;
  }

  const inquiryResult = appendInquiry(payload, orgId);

  return Object.assign({}, inquiryResult, { orgId: orgId, orgToken: orgToken });
}

// ============================================================
// 画像アップロード（登録済み団体のみ・Google Driveに保存）
// ============================================================

function getOrCreateUploadFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/** Base64画像データをGoogle Driveに保存し、共有リンクを返す。失敗時は空文字を返す。 */
function saveImageToDrive(base64Data, fileName, mimeType) {
  if (!base64Data) return '';
  try {
    const folder = getOrCreateUploadFolder();
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType || 'image/png', fileName || 'upload.png');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    Logger.log('画像保存エラー: ' + err);
    return '';
  }
}

// ============================================================
// Googleカレンダー取り込み（掲載依頼フォームの入力補助・任意機能）
//
// 団体が自分のGoogleカレンダーの公開/限定公開のiCal URLを貼り付けると、
// そのカレンダーの直近の予定一覧を取得してフォームに自動入力できるようにする。
// スプレッドシートへの書き込みは行わない、その場限りの読み取り専用機能。
// ============================================================

/** 取得を許可するiCal URLのホスト・パスの接頭辞（任意URLへのアクセスを防ぐため） */
const GCAL_ICAL_URL_PREFIX = 'https://calendar.google.com/calendar/ical/';

/** 取得する予定の最大件数 */
const GCAL_MAX_EVENTS = 20;

/** 解析するVEVENTブロックの上限件数（巨大なカレンダーによる実行時間・メモリの浪費を防ぐ） */
const GCAL_MAX_PARSE_BLOCKS = 500;

/** 取得するICS本文の最大サイズ（約2MB。通常のカレンダーで十分な余裕がある） */
const GCAL_MAX_ICS_LENGTH = 2000000;

function fetchGCalEvents(icalUrl) {
  if (!icalUrl || icalUrl.indexOf(GCAL_ICAL_URL_PREFIX) !== 0) {
    return { success: false, error: 'GoogleカレンダーのiCal形式URL（https://calendar.google.com/calendar/ical/... で始まるもの）を入力してください。' };
  }

  let res;
  try {
    // followRedirects:false — 指定URLのホストがリダイレクト経由で意図しない先に迂回されるのを防ぐ
    res = UrlFetchApp.fetch(icalUrl, { muteHttpExceptions: true, followRedirects: false });
  } catch (err) {
    Logger.log('fetchGCalEvents 取得エラー: ' + err);
    return { success: false, error: 'カレンダーの取得に失敗しました。URLをご確認ください。' };
  }
  if (res.getResponseCode() !== 200) {
    return { success: false, error: 'カレンダーが見つかりませんでした。URLと公開設定をご確認ください。' };
  }

  const contentText = res.getContentText();
  if (contentText.length > GCAL_MAX_ICS_LENGTH) {
    return { success: false, error: 'カレンダーのデータが大きすぎるため取得できませんでした。' };
  }

  let events;
  try {
    events = parseIcsEvents(contentText);
  } catch (err) {
    Logger.log('fetchGCalEvents 解析エラー: ' + err);
    return { success: false, error: 'カレンダーの内容を読み取れませんでした。' };
  }

  if (events.length === 0) {
    return { success: false, error: '今後の予定が見つかりませんでした。' };
  }

  return { success: true, events: events };
}

/** ICS本文をパースし、本日以降のVEVENTを開始日時順に返す（簡易パーサー・繰り返し予定の展開は行わない） */
function parseIcsEvents(icsText) {
  const unfolded = icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1, GCAL_MAX_PARSE_BLOCKS + 1).map(b => b.split('END:VEVENT')[0]);
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  const events = [];
  blocks.forEach(block => {
    try {
      const ev = parseIcsEventBlock(block);
      if (!ev) return;
      const effectiveEnd = ev.endDate || ev.date;
      if (effectiveEnd < today) return;
      events.push(ev);
    } catch (err) {
      Logger.log('VEVENT解析エラー（1件スキップ）: ' + err);
    }
  });

  events.sort((a, b) => {
    const aKey = a.date + ' ' + (a.startTime || '00:00');
    const bKey = b.date + ' ' + (b.startTime || '00:00');
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  return events.slice(0, GCAL_MAX_EVENTS);
}

function parseIcsEventBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const props = {};
  lines.forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const rawName = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const name = rawName.split(';')[0].toUpperCase();
    const isDateValue = /VALUE=DATE(?!-TIME)/.test(rawName);
    // 同名プロパティが複数出た場合は最初の1件のみ採用
    if (!(name in props)) props[name] = { value: value, isDateValue: isDateValue };
  });

  if (!props.DTSTART) return null;

  const start = parseIcsDateTime(props.DTSTART.value, props.DTSTART.isDateValue);
  let endDate = '';
  if (props.DTEND) {
    const end = parseIcsDateTime(props.DTEND.value, props.DTEND.isDateValue);
    endDate = props.DTEND.isDateValue ? addDaysToDateStr(end.date, -1) : end.date;
    if (endDate === start.date) endDate = '';
  }

  return {
    uid: props.UID ? unescapeIcsText(props.UID.value) : '',
    title: props.SUMMARY ? unescapeIcsText(props.SUMMARY.value) : '（無題の予定）',
    date: start.date,
    endDate: endDate,
    startTime: start.time,
    endTime: (props.DTEND && !props.DTEND.isDateValue) ? parseIcsDateTime(props.DTEND.value, false).time : '',
    location: props.LOCATION ? unescapeIcsText(props.LOCATION.value) : '',
    description: props.DESCRIPTION ? unescapeIcsText(props.DESCRIPTION.value) : ''
  };
}

/** ICSの日付・日時文字列を { date: 'YYYY-MM-DD', time: 'HH:MM' } に変換する（簡易実装）
 *  UTC（末尾Z）はAsia/Tokyoに変換する。TZID指定・フローティング時刻はそのままJSTの値として扱う。 */
function parseIcsDateTime(value, isDateValue) {
  const digits = value.replace('Z', '');
  const y  = digits.slice(0, 4);
  const mo = digits.slice(4, 6);
  const d  = digits.slice(6, 8);

  if (isDateValue || digits.length <= 8) {
    return { date: y + '-' + mo + '-' + d, time: '' };
  }

  const hh = digits.slice(9, 11);
  const mm = digits.slice(11, 13);
  const ss = digits.slice(13, 15) || '00';

  if (value.charAt(value.length - 1) === 'Z') {
    const utcDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    return {
      date: Utilities.formatDate(utcDate, 'Asia/Tokyo', 'yyyy-MM-dd'),
      time: Utilities.formatDate(utcDate, 'Asia/Tokyo', 'HH:mm')
    };
  }

  return { date: y + '-' + mo + '-' + d, time: hh + ':' + mm };
}

/** YYYY-MM-DD にday日を加算（負数可） */
function addDaysToDateStr(dateStr, days) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + days);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mo + '-' + da;
}

/** ICSのテキストエスケープ（\, \; \, \\ \n）を復元する */
function unescapeIcsText(value) {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// ============================================================
// メール送信
// ============================================================

function buildOrgUrlLine(result) {
  if (!result.orgId || !result.orgToken) return '';
  const url = SITE_BASE_URL + 'contact.html?orgId=' + encodeURIComponent(result.orgId) + '&token=' + encodeURIComponent(result.orgToken);
  const statusUrl = SITE_BASE_URL + 'status.html?orgId=' + encodeURIComponent(result.orgId) + '&token=' + encodeURIComponent(result.orgToken);
  return '次回からは以下の専用URLからアクセスすると、団体情報の入力を省略できます。\n' + url + '\n\n' +
    '申請の審査状況は以下の専用URLから確認できます。\n' + statusUrl + '\n\n';
}

/** メール送信元の表示名（受信者が見覚えのない個人アドレスだと判断し、迷惑メール扱いされるのを防ぐ） */
const MAIL_SENDER_NAME = 'Waseda Calendar';

/** 開催日の表示（終了日があれば範囲表示） */
function formatEventDateRange(payload) {
  if (!payload.eventDate) return '（指定なし）';
  if (payload.eventEndDate && payload.eventEndDate !== payload.eventDate) {
    return payload.eventDate + ' 〜 ' + payload.eventEndDate;
  }
  return payload.eventDate;
}

/** 定期開催で複数日が指定されている場合のメール表示行（指定なしなら空文字） */
function formatRecurringDatesLine(payload) {
  if (!payload.recurringDates) return '';
  return '定期開催の開催日一覧：' + payload.recurringDates + '\n';
}

function sendConfirmationEmail(payload, result) {
  const subject = '【Waseda Calendar】お問い合わせを受け付けました（受付番号: ' + result.receiptNumber + '）';
  const nowText = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年MM月dd日 HH:mm');
  const body = payload.name + ' 様\n\n' +
    'お問い合わせいただきありがとうございます。以下の内容で受け付けました。\n' +
    '内容を確認のうえ、必要に応じてご連絡します。\n\n' +
    '受付番号　　：' + result.receiptNumber + '\n' +
    'お問い合わせ種別：' + (INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType) + '\n' +
    '団体名・所属　：' + payload.organization + '\n' +
    'イベント名　　：' + (payload.eventName || payload.targetEventName || '（指定なし）') + '\n' +
    '開催日　　　　：' + formatEventDateRange(payload) + '\n' +
    formatRecurringDatesLine(payload) +
    '送信日時　　　：' + nowText + '\n\n' +
    'お問い合わせ内容\n' + payload.message + '\n\n' +
    buildOrgUrlLine(result) +
    'このメールは送信専用です。ご返信いただいても対応できない場合があります。\n\n' +
    'Waseda Calendar\n' +
    SITE_BASE_URL;

  MailApp.sendEmail({ to: payload.email, name: MAIL_SENDER_NAME, subject: subject, body: body });
}

function sendAdminNotification(payload, result) {
  const subject = '【Waseda Calendar】新規お問い合わせ（' + result.priority + '）' + result.receiptNumber;
  const body = '新しいお問い合わせがありました。\n\n' +
    '受付番号　　　：' + result.receiptNumber + '\n' +
    '団体ID　　　　：' + (result.orgId || '（未登録）') + '\n' +
    'お問い合わせ種別：' + (INQUIRY_TYPE_LABELS[payload.inquiryType] || payload.inquiryType) + '\n' +
    '優先度　　　　：' + result.priority + '\n' +
    '初回/複数回判定：' + result.autoJudgment + '（メールアドレス一致: ' + result.pastCount + '件）\n' +
    'お名前　　　　：' + payload.name + '\n' +
    'メールアドレス：' + payload.email + '\n' +
    '団体名・所属　：' + payload.organization + '\n' +
    'イベント名　　：' + (payload.eventName || payload.targetEventName || '（指定なし）') + '\n' +
    '開催日　　　　：' + formatEventDateRange(payload) + '\n' +
    formatRecurringDatesLine(payload) +
    '対象ページURL　：' + (payload.targetPageUrl || '（指定なし）') + '\n\n' +
    'お問い合わせ内容\n' + payload.message + '\n\n' +
    'スプレッドシートで詳細を確認してください。';

  MailApp.sendEmail({ to: ADMIN_EMAIL, name: MAIL_SENDER_NAME, subject: subject, body: body });
}

// ============================================================
// レスポンス生成
// ============================================================

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 将来的な拡張案（コメントのみ・未実装）
// ============================================================
//
// 1. 「前回の掲載依頼をコピーして新規作成」
//    登録済み団体が認証された際、問い合わせ・掲載依頼シートを団体IDで検索し、
//    最新のイベント関連行を取得して、イベント名・場所・申込URL等をフォームに
//    プリセットする doGet の追加アクション（例: action=lastEvent）を作る想定。
//    日付・時間だけ変更すればよい状態にできる。
//
// 2. 画像から情報を自動抽出（OCR / AI読み取り対応）
//    現状、登録済み団体は画像を直接アップロードできる（saveImageToDrive）が、
//    画像の内容（イベント名・日時・場所等）はまだ人が見て転記する想定。
//    将来的に件数が増えた場合、保存後にUrlFetchAppでAI（画像読み取り対応のAPI）に
//    画像を渡し、イベント名・日時・場所等を自動抽出してフォームの代入候補として
//    返す、という拡張が考えられる。API利用コストが発生するため、件数を見て判断する。
