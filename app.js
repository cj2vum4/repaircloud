'use strict';

const form = document.querySelector('#repair-form');
const fields = document.querySelector('#form-fields');
const submitButton = document.querySelector('#submit-button');
const refreshButton = document.querySelector('#refresh-button');
const formMessage = document.querySelector('#form-message');
const listMessage = document.querySelector('#list-message');
const list = document.querySelector('#request-list');
let client;
let submitting = false;

function showMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = !text;
}

function textElement(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

function renderRequest(request) {
  const article = textElement('article', '', 'request');
  const top = textElement('div', '', 'request-top');
  top.append(textElement('h3', request.location));
  const urgencyClass = { 高: 'high', 中: 'medium', 低: 'low' }[request.urgency] || 'low';
  top.append(textElement('span', `${request.urgency}緊急`, `badge urgency-${urgencyClass}`));
  article.append(top, textElement('p', request.description, 'request-description'));
  const meta = textElement('div', '', 'meta');
  const date = new Date(request.created_at);
  const time = textElement('time', Number.isNaN(date.getTime()) ? '時間未提供' : date.toLocaleString('zh-TW', { hour12: false }));
  if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
  meta.append(textElement('span', `報修人：${request.reporter_name}`), textElement('span', request.category), textElement('span', `狀態：${request.status || '待處理'}`), time);
  article.append(meta);
  return article;
}

async function loadRequests() {
  refreshButton.disabled = true;
  list.setAttribute('aria-busy', 'true');
  showMessage(listMessage, '正在載入報修紀錄…');
  try {
    const { data, error } = await client.from('repair_requests')
      .select('id,reporter_name,location,category,description,urgency,status,created_at')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
    if (error) throw error;
    list.replaceChildren(...data.map(renderRequest));
    showMessage(listMessage, data.length ? '' : '目前還沒有報修紀錄。');
  } catch (error) {
    showMessage(listMessage, `清單載入失敗，請按「重新整理」重試。${list.childElementCount ? ' 下方保留上次載入的紀錄。' : ''} 原因：${error.message || '網路連線異常'}`, 'error');
  } finally {
    list.setAttribute('aria-busy', 'false');
    refreshButton.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || !client || !form.reportValidity()) return;
  const values = new FormData(form);
  const payload = Object.fromEntries(['reporter_name', 'location', 'category', 'description', 'urgency'].map(key => [key, String(values.get(key) || '').trim()]));
  if (Object.values(payload).some(value => !value)) {
    showMessage(formMessage, '請填寫所有欄位，內容不可只有空白。', 'error');
    return;
  }
  submitting = true;
  fields.disabled = true;
  submitButton.textContent = '正在送出…';
  showMessage(formMessage, '');
  try {
    // status 與 created_at 由資料庫預設值產生，不隨表單送出。
    const { error } = await client.from('repair_requests').insert(payload);
    if (error) throw error;
    form.reset();
    showMessage(formMessage, '報修已成功登記！', 'success');
    await loadRequests();
  } catch (error) {
    showMessage(formMessage, `送出失敗，填寫內容已保留。原因：${error.message || '網路連線異常'}。若連線中斷，請先重新整理清單確認是否已登記，再決定是否重送。`, 'error');
  } finally {
    submitting = false;
    fields.disabled = false;
    submitButton.textContent = '送出報修 ↗';
  }
});

refreshButton.addEventListener('click', loadRequests);
try {
  const config = window.REPAIR_CONFIG;
  if (!window.supabase || !config?.supabaseUrl || !config?.supabasePublishableKey) throw new Error('連線設定或 Supabase 元件未載入，請重新整理網頁。');
  client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  loadRequests();
} catch (error) {
  fields.disabled = true;
  refreshButton.disabled = true;
  list.setAttribute('aria-busy', 'false');
  showMessage(formMessage, error.message, 'error');
  showMessage(listMessage, '暫時無法連線，請重新整理網頁後再試。', 'error');
}
