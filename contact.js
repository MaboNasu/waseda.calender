/**
 * contact.js - お問い合わせフォーム
 *
 * 送信先のGoogle Apps Script WebアプリURL。
 * docs/google-apps-script-setup.md の手順でデプロイしたURLに差し替えてください。
 */
const CONTACT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzcXPoaemMJXb02y_9FprUvVoHSiDV5RCwSxfxEDW-iF2Z8nXWM64_ZJtaV-FMjd9tK/exec';

/** 条件付き表示の対象となるinquiryTypeの値一覧（data-show-forで使用） */
const CONDITIONAL_FIELD_GROUPS = document.querySelectorAll('.conditional-fields');

let isSubmitting = false;

/* ============================================================
   条件付き表示
   ============================================================ */
function updateConditionalFields() {
  const typeSelect = document.getElementById('inquiry-type');
  const currentType = typeSelect ? typeSelect.value : '';

  CONDITIONAL_FIELD_GROUPS.forEach(group => {
    const targets = (group.dataset.showFor || '').split(',').map(s => s.trim());
    if (targets.includes(currentType)) {
      group.classList.add('show');
    } else {
      group.classList.remove('show');
    }
  });
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

  const requiredTextFields = [
    { name: 'inquiryType', label: 'お問い合わせ種別を選択してください' },
    { name: 'firstTimeSelfReport', label: '初めてかどうかを選択してください' },
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
function buildPayload(form) {
  const fields = [
    'inquiryType', 'firstTimeSelfReport', 'name', 'organization', 'email', 'emailConfirm',
    'targetEventName', 'desiredPublishDate', 'applicationUrl', 'targetPageUrl',
    'organizationUrl', 'budgetRange', 'message'
  ];
  const payload = {};
  fields.forEach(name => {
    const el = form.elements[name];
    payload[name] = el ? el.value.trim() : '';
  });
  payload.consent = !!(form.elements['consent'] && form.elements['consent'].checked);
  payload.website = form.elements['website'] ? form.elements['website'].value : '';
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

  const payload = buildPayload(form);
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
      showResult('success', `お問い合わせを受け付けました${receiptText}。入力いただいたメールアドレス宛に確認メールをお送りしました。`);
      form.reset();
      updateConditionalFields();
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

  const typeSelect = document.getElementById('inquiry-type');
  if (typeSelect) typeSelect.addEventListener('change', updateConditionalFields);
  updateConditionalFields();

  const form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', handleSubmit);
});
