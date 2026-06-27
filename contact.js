/**
 * contact.js - お問い合わせフォーム
 *
 * 送信先のGoogle Apps Script WebアプリURL。
 * docs/google-apps-script-setup.md の手順でデプロイしたURLに差し替えてください。
 */
const CONTACT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyLKb-Dh8EfwYmiKwbGg-8t8ptVA7bczf5yOwQCHKuUPDOoOseom3uX9pBFNEt3QE-o/exec';

/** 団体情報フィールド（登録済み団体認証時に自動入力・読み取り専用化する対象） */
const ORG_INFO_FIELD_IDS = ['contact-name', 'contact-org', 'contact-email', 'contact-email-confirm', 'org-sns', 'org-description'];

/** 画像添付（登録済み団体のみ）の最大サイズ */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const CONDITIONAL_FIELD_GROUPS = document.querySelectorAll('.conditional-fields');

let isSubmitting = false;

/* ============================================================
   入口選択・条件付き表示
   ============================================================ */
function getEntryChoice() {
  const checked = document.querySelector('input[name="entryChoice"]:checked');
  return checked ? checked.value : '';
}

function updateConditionalFields() {
  const currentEntry = getEntryChoice();

  CONDITIONAL_FIELD_GROUPS.forEach(group => {
    const targets = (group.dataset.showForEntry || '').split(',').map(s => s.trim());
    if (targets.includes(currentEntry)) {
      group.classList.add('show');
    } else {
      group.classList.remove('show');
    }
  });
}

function resolveInquiryType(entryChoice, editDeleteType) {
  if (entryChoice === 'new-org' || entryChoice === 'returning-org') return 'event-request';
  if (entryChoice === 'edit-delete') return editDeleteType || '';
  return entryChoice;
}

/* ============================================================
   団体認証（団体ID・認証トークン）
   ============================================================ */
function setOrgFieldsReadOnly(readOnly) {
  ORG_INFO_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.readOnly = readOnly;
  });
}

function fillOrgFields(org) {
  const map = {
    'contact-name': org.contactName,
    'contact-org': org.name,
    'contact-email': org.email,
    'contact-email-confirm': org.email,
    'org-sns': org.sns,
    'org-description': org.description
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = map[id] || '';
  });
}

function showOrgAuthSuccess() {
  const pending = document.getElementById('org-auth-pending');
  const success = document.getElementById('org-auth-success');
  if (pending) pending.style.display = 'none';
  if (success) success.style.display = '';
}

function showOrgAuthPending() {
  const pending = document.getElementById('org-auth-pending');
  const success = document.getElementById('org-auth-success');
  if (pending) pending.style.display = '';
  if (success) success.style.display = 'none';
}

async function lookupOrg(orgId, token) {
  const errorEl = document.getElementById('error-orgLookup');
  if (errorEl) errorEl.textContent = '';

  if (!orgId || !token) return false;

  try {
    const url = `${CONTACT_GAS_URL}?action=lookupOrg&orgId=${encodeURIComponent(orgId)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data && data.success && data.org) {
      document.getElementById('auth-org-id').value = orgId;
      document.getElementById('auth-org-token').value = token;
      fillOrgFields(data.org);
      setOrgFieldsReadOnly(true);
      showOrgAuthSuccess();
      return true;
    }
  } catch (err) {
    // ネットワークエラー等は下のfalse処理に合流
  }

  document.getElementById('auth-org-id').value = '';
  document.getElementById('auth-org-token').value = '';
  if (errorEl) errorEl.textContent = '団体ID・認証トークンを確認できませんでした。確認メールのURLからアクセスし直すか、内容をご確認ください。';
  showOrgAuthPending();
  return false;
}

function setupOrgAuth() {
  const editCheckbox = document.getElementById('edit-org-info');
  if (editCheckbox) {
    editCheckbox.addEventListener('change', () => {
      setOrgFieldsReadOnly(!editCheckbox.checked);
    });
  }

  const lookupBtn = document.getElementById('org-lookup-btn');
  if (lookupBtn) {
    lookupBtn.addEventListener('click', () => {
      const orgId = document.getElementById('manual-org-id').value.trim();
      const token = document.getElementById('manual-org-token').value.trim();
      lookupOrg(orgId, token);
    });
  }

  // URLパラメータ（確認メールのURLからアクセスした場合）に orgId/token があれば自動認証
  const params = new URLSearchParams(window.location.search);
  const urlOrgId = params.get('orgId');
  const urlToken = params.get('token');
  if (urlOrgId && urlToken) {
    const returningRadio = document.querySelector('input[name="entryChoice"][value="returning-org"]');
    if (returningRadio) returningRadio.checked = true;
    updateConditionalFields();
    lookupOrg(urlOrgId, urlToken);
  }
}

/* ============================================================
   定期開催（複数開催日のまとめ入力）
   ============================================================ */
function addRecurringDateRow() {
  const list = document.getElementById('recurring-date-list');
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'recurring-date-row';
  row.innerHTML = `
    <input type="date" class="form-control recurring-date-input">
    <button type="button" class="btn btn-ghost btn-sm recurring-date-remove" aria-label="この日付を削除">×</button>`;
  row.querySelector('.recurring-date-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

/** 「開催日」+ 追加した日付一覧 をカンマ区切りの文字列にまとめる（定期開催チェック時のみ） */
function collectRecurringDates(form) {
  const checkbox = document.getElementById('is-recurring');
  if (!checkbox || !checkbox.checked) return '';

  const mainDate = form.elements['eventDate'] ? form.elements['eventDate'].value : '';
  const extraDates = Array.from(document.querySelectorAll('.recurring-date-input'))
    .map(el => el.value)
    .filter(Boolean);

  const allDates = [mainDate, ...extraDates].filter(Boolean);
  return allDates.join(',');
}

function setupRecurringDates() {
  const checkbox = document.getElementById('is-recurring');
  const group = document.getElementById('recurring-dates-group');
  const addBtn = document.getElementById('add-recurring-date-btn');

  if (checkbox && group) {
    checkbox.addEventListener('change', () => {
      group.style.display = checkbox.checked ? '' : 'none';
    });
  }
  if (addBtn) {
    addBtn.addEventListener('click', addRecurringDateRow);
  }
}

/* ============================================================
   バリデーション
   ============================================================ */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clearAllErrors() {
  document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('.form-control.invalid').forEach(el => { el.classList.remove('invalid'); });
}

function setFieldError(fieldName, message, inputEl) {
  const errorEl = document.getElementById(`error-${fieldName}`);
  if (errorEl) errorEl.textContent = message;
  if (inputEl) inputEl.classList.add('invalid');
}

function validateForm(form) {
  clearAllErrors();
  let isValid = true;

  const entryChoice = getEntryChoice();
  if (!entryChoice) {
    setFieldError('entryChoice', 'ご用件を選択してください');
    isValid = false;
  }

  if (entryChoice === 'returning-org') {
    const orgId = document.getElementById('auth-org-id').value;
    const orgToken = document.getElementById('auth-org-token').value;
    if (!orgId || !orgToken) {
      setFieldError('orgLookup', '団体ID・認証トークンで確認を行ってください。');
      isValid = false;
    }

    const imageInput = document.getElementById('event-image');
    const imageFile = imageInput && imageInput.files[0] ? imageInput.files[0] : null;
    if (imageFile) {
      if (!imageFile.type.startsWith('image/')) {
        setFieldError('eventImage', '画像ファイルのみアップロードできます');
        isValid = false;
      } else if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        setFieldError('eventImage', 'ファイルサイズは5MBまでです');
        isValid = false;
      }
    }
  }

  if (entryChoice === 'edit-delete') {
    const editDeleteEl = form.elements['editDeleteType'];
    if (!editDeleteEl || !editDeleteEl.value) {
      setFieldError('editDeleteType', '修正・削除のどちらかを選択してください', editDeleteEl);
      isValid = false;
    }
  }

  if (entryChoice === 'new-org' || entryChoice === 'returning-org') {
    const eventNameEl = form.elements['eventName'];
    if (!eventNameEl || !eventNameEl.value.trim()) {
      setFieldError('eventName', 'イベント名を入力してください', eventNameEl);
      isValid = false;
    }
    const eventDateEl = form.elements['eventDate'];
    if (!eventDateEl || !eventDateEl.value) {
      setFieldError('eventDate', '開催日を入力してください', eventDateEl);
      isValid = false;
    }

    const eventEndDateEl = form.elements['eventEndDate'];
    if (eventDateEl && eventEndDateEl && eventEndDateEl.value && eventEndDateEl.value < eventDateEl.value) {
      setFieldError('eventEndDate', '終了日は開催日より後の日付にしてください', eventEndDateEl);
      isValid = false;
    }
  }

  const requiredTextFields = [
    { name: 'name', label: 'お名前を入力してください' },
    { name: 'organization', label: '団体名・所属を入力してください' },
    { name: 'message', label: 'お問い合わせ内容を入力してください' }
  ];

  requiredTextFields.forEach(({ name, label }) => {
    const el = form.elements[name];
    if (!el || !el.value.trim()) {
      setFieldError(name, label, el);
      isValid = false;
    }
  });

  const emailEl = form.elements['email'];
  const emailConfirmEl = form.elements['emailConfirm'];
  const email = emailEl ? emailEl.value.trim() : '';
  const emailConfirm = emailConfirmEl ? emailConfirmEl.value.trim() : '';

  if (!email) {
    setFieldError('email', 'メールアドレスを入力してください', emailEl);
    isValid = false;
  } else if (!EMAIL_PATTERN.test(email)) {
    setFieldError('email', 'メールアドレスの形式が正しくありません', emailEl);
    isValid = false;
  }

  if (!emailConfirm) {
    setFieldError('emailConfirm', '確認用のメールアドレスを入力してください', emailConfirmEl);
    isValid = false;
  } else if (email && emailConfirm !== email) {
    setFieldError('emailConfirm', 'メールアドレスが一致しません', emailConfirmEl);
    isValid = false;
  }

  const consentEl = form.elements['consent'];
  if (!consentEl || !consentEl.checked) {
    setFieldError('consent', '個人情報の利用への同意が必要です');
    isValid = false;
  }

  return isValid;
}

/* ============================================================
   画像添付（登録済み団体のみ）
   ============================================================ */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      resolve(String(result).split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   送信結果メッセージ
   ============================================================ */
function showResult(type, message) {
  const resultEl = document.getElementById('form-result');
  if (!resultEl) return;
  resultEl.className = `form-result ${type}`;
  resultEl.textContent = message;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearResult() {
  const resultEl = document.getElementById('form-result');
  if (!resultEl) return;
  resultEl.className = 'form-result';
  resultEl.textContent = '';
}

/* ============================================================
   送信処理
   ============================================================ */
async function buildPayload(form) {
  const entryChoice = getEntryChoice();
  const editDeleteType = form.elements['editDeleteType'] ? form.elements['editDeleteType'].value : '';

  const fields = [
    'name', 'organization', 'email', 'emailConfirm', 'orgSns', 'orgDescription',
    'eventName', 'eventDate', 'eventEndDate', 'eventStartTime', 'eventEndTime', 'eventLocation', 'eventDescription',
    'desiredPublishDate', 'applicationUrl', 'targetEventName', 'targetPageUrl',
    'budgetRange', 'message'
  ];
  const payload = {};
  fields.forEach(name => {
    const el = form.elements[name];
    payload[name] = el ? el.value.trim() : '';
  });

  payload.entryChoice = entryChoice;
  payload.inquiryType = resolveInquiryType(entryChoice, editDeleteType);
  payload.recurringDates = collectRecurringDates(form);
  payload.orgId = document.getElementById('auth-org-id').value;
  payload.orgToken = document.getElementById('auth-org-token').value;
  payload.editOrgInfo = !!(document.getElementById('edit-org-info') && document.getElementById('edit-org-info').checked);
  payload.consent = !!(form.elements['consent'] && form.elements['consent'].checked);
  payload.website = form.elements['website'] ? form.elements['website'].value : '';

  payload.imageBase64 = '';
  payload.imageFileName = '';
  payload.imageMimeType = '';
  const imageInput = document.getElementById('event-image');
  if (entryChoice === 'returning-org' && imageInput && imageInput.files[0]) {
    const file = imageInput.files[0];
    payload.imageBase64 = await readFileAsBase64(file);
    payload.imageFileName = file.name;
    payload.imageMimeType = file.type;
  }

  return payload;
}

async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const form = e.target;
  clearResult();

  if (!validateForm(form)) {
    showResult('error', '入力内容を確認してください。');
    return;
  }

  const payload = await buildPayload(form);
  const submitBtn = document.getElementById('contact-submit');

  // honeypot: botが入力していたら実際の送信は行わず、通常の完了表示だけ行う
  if (payload.website) {
    showResult('success', 'お問い合わせを受け付けました。入力いただいたメールアドレス宛に確認メールをお送りします。');
    form.reset();
    return;
  }

  isSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';
  }

  try {
    const res = await fetch(CONTACT_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data && data.success) {
      const receiptText = data.receiptNumber ? `（受付番号: ${data.receiptNumber}）` : '';
      showResult('success', `お問い合わせを受け付けました${receiptText}。入力いただいたメールアドレス宛に確認メールをお送りしました。届かない場合は迷惑メールフォルダもご確認ください。`);
      form.reset();
      setOrgFieldsReadOnly(false);
      showOrgAuthPending();
      updateConditionalFields();
      const recurringGroup = document.getElementById('recurring-dates-group');
      if (recurringGroup) recurringGroup.style.display = 'none';
      const recurringList = document.getElementById('recurring-date-list');
      if (recurringList) recurringList.innerHTML = '';
    } else {
      showResult('error', (data && data.error) || '送信に失敗しました。時間をおいて再度お試しください。');
    }
  } catch (err) {
    showResult('error', '送信に失敗しました。通信環境をご確認のうえ、再度お試しください。');
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '送信する';
    }
  }
}

/* ============================================================
   ハンバーガーメニュー（他ページと共通の挙動）
   ============================================================ */
function setupContactNav() {
  const btn = document.getElementById('hamburger-btn');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !nav.contains(e.target)) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setupContactNav();

  document.querySelectorAll('input[name="entryChoice"]').forEach(radio => {
    radio.addEventListener('change', updateConditionalFields);
  });
  updateConditionalFields();

  setupOrgAuth();
  setupRecurringDates();

  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', handleSubmit);
});
