const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  status: $('#status'),
  apiUrl: $('#apiUrl'),
  apiKey: $('#apiKey'),
  channelSelect: $('#channelSelect'),
  roleSelect: $('#roleSelect'),
  memberQuery: $('#memberQuery'),
  memberSelect: $('#memberSelect'),
  content: $('#content'),
  allowUserPings: $('#allowUserPings'),
  allowRolePings: $('#allowRolePings'),
  embeds: $('#embeds'),
  buttons: $('#buttons'),
  preview: $('#preview'),
  result: $('#result'),
  jsonBox: $('#jsonBox'),
  editMessageId: $('#editMessageId')
};

let channels = [];

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = `status ${kind}`.trim();
}

function setResult(text, kind = '') {
  els.result.textContent = text;
  els.result.className = `result ${kind}`.trim();
}

function getApiUrl() {
  return normalizeApiUrl(els.apiUrl.value);
}

function getApiKey() {
  return els.apiKey.value.trim();
}

function normalizeApiUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  raw = raw.replace(/\s+/g, '');
  raw = raw.replace(/\/+$/, '');

  // Fix common mistake: http://ip:13579:13579 -> http://ip:13579
  raw = raw.replace(/^(https?:\/\/[^/:]+:\d+):\d+(\/.*)?$/i, '$1$2');

  // Do not save API endpoint paths as base URL.
  raw = raw.replace(/\/api\/(health|channels|roles|send|edit).*$/i, '');

  return raw;
}

function isAppsScriptUrl(url) {
  return /script\.google\.com\/macros\/s\//i.test(url) || /script\.googleusercontent\.com\/macros\//i.test(url);
}

function buildEndpoint(path) {
  const base = getApiUrl();
  if (!base) throw new Error('API URL is empty');

  if (!isAppsScriptUrl(base)) {
    return `${base}${path}`;
  }

  const pathUrl = new URL(path, 'https://local.invalid');
  const cleanPath = pathUrl.pathname
    .replace(/^\/api\/?/i, '')
    .replace(/^\/+/, '') || 'health';

  const endpoint = new URL(base);
  endpoint.searchParams.set('path', cleanPath);

  const panelKey = getApiKey();
  if (panelKey) endpoint.searchParams.set('panelKey', panelKey);

  for (const [key, value] of pathUrl.searchParams.entries()) {
    endpoint.searchParams.append(key, value);
  }

  return endpoint.toString();
}

function saveSettings() {
  els.apiUrl.value = getApiUrl();
  localStorage.setItem('lds-api-url', getApiUrl());
  localStorage.setItem('lds-api-key', getApiKey());
  setStatus('Saved', 'ok');
}

function loadSettings() {
  els.apiUrl.value = localStorage.getItem('lds-api-url') || '';
  els.apiKey.value = localStorage.getItem('lds-api-key') || '';
}

async function api(path, options = {}) {
  const base = getApiUrl();
  const key = getApiKey();
  if (!base) throw new Error('API URL is empty');
  if (!key) throw new Error('API key / panel key is empty');

  const endpoint = buildEndpoint(path);
  const method = (options.method || 'GET').toUpperCase();
  const viaAppsScript = isAppsScriptUrl(base);

  let fetchOptions;

  if (viaAppsScript) {
    // Google Apps Script cannot reliably handle browser CORS preflight.
    // So we do not send custom browser headers here.
    fetchOptions = {
      method,
      redirect: 'follow'
    };

    if (options.body !== undefined) {
      fetchOptions.body = options.body;
      fetchOptions.headers = {
        // Safelisted content type: avoids CORS preflight.
        'Content-Type': 'text/plain;charset=utf-8'
      };
    }
  }
  else {
    fetchOptions = {
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Web-Api-Key': key,
        ...(options.headers || {})
      }
    };
  }

  const response = await fetch(endpoint, fetchOptions);
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  }
  catch {
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function testConnection() {
  try {
    const data = await api('/api/health');
    setStatus(`Connected: ${data.bot || 'bot'}`, 'ok');
  } catch (error) {
    setStatus('Connection failed', 'bad');
    setResult(error.message, 'bad');
  }
}

async function loadChannels() {
  try {
    const data = await api('/api/channels');
    channels = data.channels || [];
    els.channelSelect.innerHTML = '';
    for (const channel of channels) {
      const option = document.createElement('option');
      option.value = channel.id;
      option.textContent = channel.label;
      option.dataset.guildId = channel.guildId;
      els.channelSelect.appendChild(option);
    }
    setResult(`Loaded channels: ${channels.length}`, 'ok');
    renderPreview();
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

function selectedGuildId() {
  const option = els.channelSelect.selectedOptions[0];
  return option?.dataset.guildId || '';
}

async function loadRoles() {
  try {
    const guildId = selectedGuildId();
    if (!guildId) throw new Error('Select a channel first');
    const data = await api(`/api/roles?guildId=${encodeURIComponent(guildId)}`);
    els.roleSelect.innerHTML = '';
    for (const role of data.roles || []) {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = `${role.name} (${role.id})`;
      els.roleSelect.appendChild(option);
    }
    setResult(`Loaded roles: ${(data.roles || []).length}`, 'ok');
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

async function loadMembers() {
  try {
    const guildId = selectedGuildId();
    if (!guildId) throw new Error('Select a channel first');
    const query = els.memberQuery.value.trim();
    const data = await api(`/api/members?guildId=${encodeURIComponent(guildId)}&query=${encodeURIComponent(query)}`);
    els.memberSelect.innerHTML = '';
    for (const member of data.members || []) {
      const option = document.createElement('option');
      option.value = member.id;
      const label = member.displayName || member.globalName || member.username || member.id;
      option.textContent = `${label} (${member.id})`;
      els.memberSelect.appendChild(option);
    }
    setResult(`Loaded users: ${(data.members || []).length}`, 'ok');
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  renderPreview();
}

function insertRoleMention() {
  const roleId = els.roleSelect.value;
  if (!roleId) return;
  insertAtCursor(els.content, `<@&${roleId}>`);
}

function insertUserMention() {
  const userId = els.memberSelect.value;
  if (!userId) return;
  insertAtCursor(els.content, `<@${userId}>`);
}

function addEmbed(data = {}) {
  const node = $('#embedTemplate').content.firstElementChild.cloneNode(true);
  $('.remove-embed', node).addEventListener('click', () => { node.remove(); renderPreview(); });
  $('.add-field', node).addEventListener('click', () => addField(node));
  setEmbedData(node, data);
  els.embeds.appendChild(node);
  node.addEventListener('input', renderPreview);
  node.addEventListener('change', renderPreview);
  renderPreview();
  return node;
}

function addField(embedNode, data = {}) {
  const node = $('#fieldTemplate').content.firstElementChild.cloneNode(true);
  $('[data-field="name"]', node).value = data.name || '';
  $('[data-field="value"]', node).value = data.value || '';
  $('[data-field="inline"]', node).checked = Boolean(data.inline);
  $('.remove-field', node).addEventListener('click', () => { node.remove(); renderPreview(); });
  $('.fields', embedNode).appendChild(node);
  node.addEventListener('input', renderPreview);
  node.addEventListener('change', renderPreview);
  renderPreview();
}

function setNested(target, path, value) {
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ||= {};
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)] = value;
}

function getNested(source, path) {
  return path.split('.').reduce((cur, part) => cur?.[part], source);
}

function setEmbedData(node, data) {
  for (const input of $$('[data-key]', node)) {
    const key = input.dataset.key;
    const value = getNested(data, key) ?? '';
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (input.type === 'color') input.value = normalizeHex(value || '#5865f2');
    else input.value = value;
  }
  $('.fields', node).innerHTML = '';
  for (const field of data.fields || []) addField(node, field);
}

function readEmbed(node) {
  const embed = {};
  for (const input of $$('[data-key]', node)) {
    const key = input.dataset.key;
    const value = input.type === 'checkbox' ? input.checked : input.value.trim();
    if (value || input.type === 'checkbox') setNested(embed, key, value);
  }
  embed.fields = $$('.field-editor', node).map(readField).filter(f => f.name || f.value);
  return embed;
}

function readField(node) {
  return {
    name: $('[data-field="name"]', node).value.trim(),
    value: $('[data-field="value"]', node).value.trim(),
    inline: $('[data-field="inline"]', node).checked
  };
}

function addButton(data = {}) {
  const node = $('#buttonTemplate').content.firstElementChild.cloneNode(true);
  $('[data-button="label"]', node).value = data.label || '';
  $('[data-button="url"]', node).value = data.url || '';
  $('.remove-button', node).addEventListener('click', () => { node.remove(); renderPreview(); });
  els.buttons.appendChild(node);
  node.addEventListener('input', renderPreview);
  renderPreview();
}

function readButton(node) {
  return {
    label: $('[data-button="label"]', node).value.trim(),
    url: $('[data-button="url"]', node).value.trim()
  };
}

function buildMessage() {
  return {
    content: els.content.value,
    allowUserPings: els.allowUserPings.checked,
    allowRolePings: els.allowRolePings.checked,
    embeds: $$('.embed-editor', els.embeds).map(readEmbed),
    buttons: $$('.button-editor', els.buttons).map(readButton).filter(b => b.label && b.url)
  };
}

function buildRequest() {
  return {
    channelId: els.channelSelect.value,
    message: buildMessage()
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function linkifyMentions(value) {
  return escapeHtml(value)
    .replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role:$1</span>')
    .replace(/&lt;@(\d+)&gt;/g, '<span class="mention">@user:$1</span>')
    .replace(/@\u200beveryone/g, '@everyone')
    .replace(/@\u200bhere/g, '@here');
}

function normalizeHex(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return '#5865f2';
}

function renderPreview() {
  const message = buildMessage();
  const content = message.content.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
  const embedsHtml = message.embeds.map(renderEmbedPreview).join('');
  const buttonsHtml = message.buttons.length ? `<div class="button-preview-row">${message.buttons.map(b => `<span class="button-preview">${escapeHtml(b.label)}</span>`).join('')}</div>` : '';
  els.preview.innerHTML = `
    <div class="message">
      <div class="avatar"></div>
      <div>
        <div><span class="username">Your Bot</span><span class="bot-tag">BOT</span></div>
        ${content ? `<div class="content">${linkifyMentions(content)}</div>` : ''}
        ${embedsHtml}
        ${buttonsHtml}
      </div>
    </div>`;
}

function renderEmbedPreview(embed) {
  const color = normalizeHex(embed.color);
  const author = embed.author?.name ? `<div class="embed-author">${escapeHtml(embed.author.name)}</div>` : '';
  const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : '';
  const desc = embed.description ? `<div class="embed-desc">${linkifyMentions(embed.description)}</div>` : '';
  const fields = (embed.fields || []).length ? `<div class="embed-field-grid">${embed.fields.map(field => `
    <div class="embed-field ${field.inline ? '' : 'full'}">
      <div class="embed-field-name">${escapeHtml(field.name || 'Field')}</div>
      <div class="embed-field-value">${linkifyMentions(field.value || '-')}</div>
    </div>`).join('')}</div>` : '';
  const img = embed.image_url ? `<img class="embed-image" src="${escapeHtml(embed.image_url)}" />` : '';
  const thumb = embed.thumbnail_url ? `<img class="embed-thumb" src="${escapeHtml(embed.thumbnail_url)}" />` : '';
  const footer = embed.footer?.text ? `<div class="embed-footer">${escapeHtml(embed.footer.text)}${embed.timestamp ? ' • now' : ''}</div>` : (embed.timestamp ? `<div class="embed-footer">now</div>` : '');
  if (!author && !title && !desc && !fields && !img && !thumb && !footer) return '';
  return `<div class="embed-preview" style="border-left-color:${color}">${author}${title}${desc}${fields}${thumb}${img}${footer}</div>`;
}

function extractMessageId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/\/(\d{15,25})$/) || raw.match(/(\d{15,25})/);
  return match ? match[1] : raw;
}

async function loadMessage() {
  try {
    const channelId = els.channelSelect.value;
    if (!channelId) throw new Error('Select a channel');
    const messageId = extractMessageId(els.editMessageId.value);
    if (!messageId) throw new Error('Message ID or URL is empty');
    const data = await api(`/api/message?channelId=${encodeURIComponent(channelId)}&messageId=${encodeURIComponent(messageId)}`);
    applyMessage(data.message || {});
    setResult(`Loaded message: ${data.url || data.messageId}`, 'ok');
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

async function sendMessage() {
  try {
    const request = buildRequest();
    if (!request.channelId) throw new Error('Select a channel');
    const data = await api('/api/send', { method: 'POST', body: JSON.stringify(request) });
    setResult(`Sent: ${data.url}`, 'ok');
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

async function editMessage() {
  try {
    const request = buildRequest();
    if (!request.channelId) throw new Error('Select a channel');
    const messageId = els.editMessageId.value.trim();
    if (!messageId) throw new Error('Message ID or URL is empty');
    const data = await api('/api/edit', { method: 'POST', body: JSON.stringify({ ...request, messageId }) });
    setResult(`Edited: ${data.url}`, 'ok');
  } catch (error) {
    setResult(error.message, 'bad');
  }
}

function exportJson() {
  els.jsonBox.value = JSON.stringify(buildMessage(), null, 2);
  setResult('JSON exported', 'ok');
}

function importJson() {
  try {
    const data = JSON.parse(els.jsonBox.value);
    applyMessage(data.message || data);
    setResult('JSON imported', 'ok');
  } catch (error) {
    setResult(`Import failed: ${error.message}`, 'bad');
  }
}

function applyMessage(data) {
  els.content.value = data.content || '';
  els.allowUserPings.checked = data.allowUserPings !== false;
  els.allowRolePings.checked = data.allowRolePings !== false;
  els.embeds.innerHTML = '';
  els.buttons.innerHTML = '';
  for (const embed of data.embeds || []) addEmbed(embed);
  for (const button of data.buttons || []) addButton(button);
  renderPreview();
}

function saveTemplate() {
  const name = prompt('Template name?');
  if (!name) return;
  const templates = JSON.parse(localStorage.getItem('lds-templates') || '{}');
  templates[name] = buildMessage();
  localStorage.setItem('lds-templates', JSON.stringify(templates));
  setResult(`Template saved: ${name}`, 'ok');
}

function loadTemplate() {
  const templates = JSON.parse(localStorage.getItem('lds-templates') || '{}');
  const names = Object.keys(templates);
  if (!names.length) { setResult('No saved templates', 'bad'); return; }
  const name = prompt(`Template name:\n${names.join('\n')}`);
  if (!name || !templates[name]) return;
  applyMessage(templates[name]);
  setResult(`Template loaded: ${name}`, 'ok');
}

function clearAll() {
  if (!confirm('Clear message?')) return;
  applyMessage({ content: '', embeds: [], buttons: [], allowUserPings: true, allowRolePings: true });
  els.jsonBox.value = '';
}

$('#saveSettings').addEventListener('click', saveSettings);
$('#testConnection').addEventListener('click', testConnection);
$('#loadChannels').addEventListener('click', loadChannels);
$('#loadRoles').addEventListener('click', loadRoles);
$('#loadMembers').addEventListener('click', loadMembers);
$('#insertRoleMention').addEventListener('click', insertRoleMention);
$('#insertUserMention').addEventListener('click', insertUserMention);
$('#addEmbed').addEventListener('click', () => addEmbed());
$('#addButton').addEventListener('click', () => addButton());
$('#sendMessage').addEventListener('click', sendMessage);
$('#editMessage').addEventListener('click', editMessage);
$('#loadMessage').addEventListener('click', loadMessage);
$('#exportJson').addEventListener('click', exportJson);
$('#importJson').addEventListener('click', importJson);
$('#saveTemplate').addEventListener('click', saveTemplate);
$('#loadTemplate').addEventListener('click', loadTemplate);
$('#clearAll').addEventListener('click', clearAll);
$('#refreshPreview').addEventListener('click', renderPreview);

for (const input of [els.content, els.allowUserPings, els.allowRolePings, els.channelSelect]) {
  input.addEventListener('input', renderPreview);
  input.addEventListener('change', renderPreview);
}

loadSettings();
addEmbed({ color: '#5865f2' });
renderPreview();
