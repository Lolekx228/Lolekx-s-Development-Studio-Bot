const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  status: $('#status'), apiUrl: $('#apiUrl'), apiKey: $('#apiKey'), channelSelect: $('#channelSelect'),
  roleSelect: $('#roleSelect'), memberQuery: $('#memberQuery'), memberSelect: $('#memberSelect'),
  emojiSelect: $('#emojiSelect'), unicodeEmojiSelect: $('#unicodeEmojiSelect'), content: $('#content'),
  allowUserPings: $('#allowUserPings'), allowRolePings: $('#allowRolePings'), buttonsEnabled: $('#buttonsEnabled'),
  embeds: $('#embeds'), buttons: $('#buttons'), v2Blocks: $('#v2Blocks'), v2Container: $('#v2Container'),
  v2ButtonsEnabled: $('#v2ButtonsEnabled'), v2AccentColor: $('#v2AccentColor'), preview: $('#preview'), result: $('#result'),
  jsonBox: $('#jsonBox'), editMessageId: $('#editMessageId'), classicCard: $('#classicCard'), embedCard: $('#embedCard'), v2Card: $('#v2Card')
};

const STOCK_EMOJIS = ['😀','😄','😁','😂','🤣','😊','😎','🥳','😺','😸','❤️','💙','💜','🖤','🤍','🔥','✨','⭐','⚡','✅','❌','⚠️','📌','📢','🔔','🎉','🎁','🏆','💎','🛠️','🚧','🚌','🚎','🚃','🌙','☀️','🌈','🍪','☕','🎮','🧩','📷','📝','🔗','🔒','🔓','⬆️','⬇️','➡️','⬅️'];
let channels = [];
let serverEmojis = [];
let lastTextTarget = els.content;

function setStatus(text, kind = '') { els.status.textContent = text; els.status.className = `status ${kind}`.trim(); }
function setResult(text, kind = '') { els.result.textContent = text; els.result.className = `result ${kind}`.trim(); }
function getApiUrl() { return normalizeApiUrl(els.apiUrl.value); }
function getApiKey() { return els.apiKey.value.trim(); }
function isV2Mode() { return $('[name="messageMode"]:checked')?.value === 'v2'; }

function normalizeApiUrl(value) {
  let raw = String(value || '').trim().replace(/\s+/g, '').replace(/\/+$/, '');
  raw = raw.replace(/:(\d+):(\d+)(?=\/|$)/, ':$1');
  raw = raw.replace(/\/api\/(health|channels|roles|members|emojis|message|send|edit)$/i, '');
  return raw;
}
function isAppsScriptUrl(url) { return /^https:\/\/script\.google\.com\/macros\/s\//i.test(url); }
function buildUrl(path) {
  const base = getApiUrl();
  if (!base) throw new Error('API URL is empty');
  if (isAppsScriptUrl(base)) {
    const cleanPath = path.replace(/^\/api\//, '').replace(/^\//, '');
    const sep = base.includes('?') ? '&' : '?';
    const key = encodeURIComponent(getApiKey());
    return `${base}${sep}path=${encodeURIComponent(cleanPath)}&panelKey=${key}`;
  }
  return `${base}${path}`;
}
async function api(path, options = {}) {
  const key = getApiKey();
  if (!key) throw new Error('Panel key is empty');
  const method = (options.method || 'GET').toUpperCase();
  const viaAppsScript = isAppsScriptUrl(getApiUrl());
  const fetchOptions = { method, redirect: 'follow' };
  if (viaAppsScript) {
    if (options.body !== undefined) {
      fetchOptions.body = options.body;
      fetchOptions.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    }
  } else {
    fetchOptions.headers = { 'Content-Type': 'application/json', 'X-Web-Api-Key': key, ...(options.headers || {}) };
    if (options.body !== undefined) fetchOptions.body = options.body;
  }
  const response = await fetch(buildUrl(path), fetchOptions);
  const bodyText = await response.text();
  let data;
  try { data = bodyText ? JSON.parse(bodyText) : {}; } catch { throw new Error(bodyText || `HTTP ${response.status}`); }
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function selectedGuildId() { return els.channelSelect.selectedOptions[0]?.dataset.guildId || ''; }
async function testConnection() { try { const d = await api('/api/health'); setStatus(`Connected: ${d.bot || 'bot'}`, 'ok'); } catch (e) { setStatus('Connection failed', 'bad'); setResult(e.message, 'bad'); } }
async function loadChannels() {
  try {
    const data = await api('/api/channels'); channels = data.channels || []; els.channelSelect.innerHTML = '';
    for (const ch of channels) { const o = document.createElement('option'); o.value = ch.id; o.textContent = ch.label; o.dataset.guildId = ch.guildId; els.channelSelect.appendChild(o); }
    setResult(`Loaded channels: ${channels.length}`, 'ok'); renderPreview();
  } catch (e) { setResult(e.message, 'bad'); }
}
async function loadRoles() {
  try {
    const guildId = selectedGuildId(); if (!guildId) throw new Error('Select a channel first');
    const data = await api(`/api/roles?guildId=${encodeURIComponent(guildId)}`); els.roleSelect.innerHTML = '';
    for (const role of data.roles || []) { const o = document.createElement('option'); o.value = role.id; o.textContent = `${role.name} (${role.id})`; els.roleSelect.appendChild(o); }
    setResult(`Loaded roles: ${(data.roles || []).length}`, 'ok');
  } catch (e) { setResult(e.message, 'bad'); }
}
async function loadMembers() {
  try {
    const guildId = selectedGuildId(); if (!guildId) throw new Error('Select a channel first');
    const query = els.memberQuery.value.trim(); const data = await api(`/api/members?guildId=${encodeURIComponent(guildId)}&query=${encodeURIComponent(query)}`);
    els.memberSelect.innerHTML = '';
    for (const m of data.members || []) { const o = document.createElement('option'); o.value = m.id; const label = m.displayName || m.globalName || m.username || m.id; o.textContent = `${label} (${m.id})`; els.memberSelect.appendChild(o); }
    setResult(`Loaded users: ${(data.members || []).length}`, 'ok');
  } catch (e) { setResult(e.message, 'bad'); }
}
async function loadEmojis() {
  try {
    const guildId = selectedGuildId(); if (!guildId) throw new Error('Select a channel first');
    const data = await api(`/api/emojis?guildId=${encodeURIComponent(guildId)}`); serverEmojis = data.emojis || [];
    els.emojiSelect.innerHTML = '';
    for (const emoji of serverEmojis) { const o = document.createElement('option'); o.value = emoji.mention; o.textContent = `${emoji.animated ? 'a:' : ':'}${emoji.name}:`; els.emojiSelect.appendChild(o); }
    setResult(`Loaded server emojis: ${serverEmojis.length}`, 'ok');
  } catch (e) { setResult(e.message, 'bad'); }
}
function getSelectedEmoji() { return els.emojiSelect.value || els.unicodeEmojiSelect.value || ''; }
function initUnicodeEmojis() { els.unicodeEmojiSelect.innerHTML = STOCK_EMOJIS.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join(''); }

function trackTextTarget(event) { if (event.target.matches('textarea,input')) lastTextTarget = event.target; }
function insertAtCursor(target, text) {
  const input = target || lastTextTarget || els.content; const start = input.selectionStart ?? input.value.length; const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end); input.focus(); input.selectionStart = input.selectionEnd = start + text.length; renderPreview();
}
function insertRoleMention() { if (els.roleSelect.value) insertAtCursor(lastTextTarget, `<@&${els.roleSelect.value}>`); }
function insertUserMention() { if (els.memberSelect.value) insertAtCursor(lastTextTarget, `<@${els.memberSelect.value}>`); }
function insertEmoji() { const emoji = getSelectedEmoji(); if (emoji) insertAtCursor(lastTextTarget, emoji); }
async function copyEmoji() { const emoji = getSelectedEmoji(); if (!emoji) return; await navigator.clipboard?.writeText(emoji).catch(() => null); setResult(`Emoji copied: ${emoji}`, 'ok'); }

function setNested(target, path, value) { const parts = path.split('.'); let cur = target; for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] ||= {}; cur = cur[parts[i]]; } cur[parts.at(-1)] = value; }
function getNested(source, path) { return path.split('.').reduce((cur, part) => cur?.[part], source); }
function normalizeHex(value) { const raw = String(value || '').trim(); if (/^#[0-9a-f]{6}$/i.test(raw)) return raw; if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`; return '#5865f2'; }

function addEmbed(data = {}) {
  const node = $('#embedTemplate').content.firstElementChild.cloneNode(true);
  $('.remove-embed', node).addEventListener('click', () => { node.remove(); renderPreview(); });
  $('.add-field', node).addEventListener('click', () => addField(node));
  setEmbedData(node, data); els.embeds.appendChild(node); node.addEventListener('input', renderPreview); node.addEventListener('change', renderPreview); renderPreview(); return node;
}
function addField(embedNode, data = {}) {
  const node = $('#fieldTemplate').content.firstElementChild.cloneNode(true);
  $('[data-field="name"]', node).value = data.name || ''; $('[data-field="value"]', node).value = data.value || ''; $('[data-field="inline"]', node).checked = Boolean(data.inline);
  $('.remove-field', node).addEventListener('click', () => { node.remove(); renderPreview(); }); $('.fields', embedNode).appendChild(node); node.addEventListener('input', renderPreview); node.addEventListener('change', renderPreview); renderPreview();
}
function setEmbedData(node, data) { for (const input of $$('[data-key]', node)) { const value = getNested(data, input.dataset.key) ?? ''; if (input.type === 'checkbox') input.checked = Boolean(value); else if (input.type === 'color') input.value = normalizeHex(value || '#5865f2'); else input.value = value; } $('.fields', node).innerHTML = ''; for (const field of data.fields || []) addField(node, field); }
function readEmbed(node) { const embed = {}; for (const input of $$('[data-key]', node)) { const value = input.type === 'checkbox' ? input.checked : input.value.trim(); if (value || input.type === 'checkbox') setNested(embed, input.dataset.key, value); } embed.fields = $$('.field-editor', node).map(readField).filter(f => f.name || f.value); return embed; }
function readField(node) { return { name: $('[data-field="name"]', node).value.trim(), value: $('[data-field="value"]', node).value.trim(), inline: $('[data-field="inline"]', node).checked }; }

function addButton(data = {}) {
  const node = $('#buttonTemplate').content.firstElementChild.cloneNode(true);
  $('[data-button="enabled"]', node).checked = data.enabled !== false; $('[data-button="label"]', node).value = data.label || ''; $('[data-button="emoji"]', node).value = data.emoji || ''; $('[data-button="url"]', node).value = data.url || '';
  $('.use-selected-emoji', node).addEventListener('click', () => { $('[data-button="emoji"]', node).value = getSelectedEmoji(); renderPreview(); });
  $('.remove-button', node).addEventListener('click', () => { node.remove(); renderPreview(); }); els.buttons.appendChild(node); node.addEventListener('input', renderPreview); node.addEventListener('change', renderPreview); renderPreview();
}
function readButton(node) { return { enabled: $('[data-button="enabled"]', node).checked, label: $('[data-button="label"]', node).value.trim(), emoji: $('[data-button="emoji"]', node).value.trim(), url: $('[data-button="url"]', node).value.trim() }; }

function addV2Block(type, data = {}) {
  const node = $('#v2BlockTemplate').content.firstElementChild.cloneNode(true); node.dataset.v2Type = type;
  const body = $('.v2-body', node); const label = $('.v2-label', node);
  if (type === 'text') { label.textContent = 'Text Display'; body.innerHTML = '<label>Text</label><textarea data-v2="text" rows="4" placeholder="# Header\nText..."></textarea>'; $('[data-v2="text"]', body).value = data.text || data.content || ''; }
  if (type === 'section') { label.textContent = 'Section + accessory button'; body.innerHTML = '<label>Section text</label><textarea data-v2="text" rows="3"></textarea><div class="grid3"><div><label>Button label</label><input data-v2="button.label" maxlength="80"></div><div><label>Button emoji</label><input data-v2="button.emoji" placeholder="😀 or <:name:id>"></div><div><label>Button URL</label><input data-v2="button.url" placeholder="https://..."></div></div><label class="switch"><input data-v2="button.enabled" type="checkbox" checked> Button enabled</label>'; $('[data-v2="text"]', body).value = data.text || ''; $('[data-v2="button.label"]', body).value = data.button?.label || ''; $('[data-v2="button.emoji"]', body).value = data.button?.emoji || ''; $('[data-v2="button.url"]', body).value = data.button?.url || ''; $('[data-v2="button.enabled"]', body).checked = data.button?.enabled !== false; }
  if (type === 'separator') { label.textContent = 'Separator'; body.innerHTML = '<label class="switch"><input data-v2="divider" type="checkbox" checked> Divider</label><label>Spacing</label><select data-v2="spacing"><option value="1">Small</option><option value="2">Large</option></select>'; $('[data-v2="divider"]', body).checked = data.divider !== false; $('[data-v2="spacing"]', body).value = String(data.spacing || 1); }
  if (type === 'media') { label.textContent = 'Media Gallery'; body.innerHTML = '<label>Image / media URL</label><input data-v2="url" placeholder="https://...">'; $('[data-v2="url"]', body).value = data.url || ''; }
  $('.remove-v2', node).addEventListener('click', () => { node.remove(); renderPreview(); });
  els.v2Blocks.appendChild(node); node.addEventListener('input', renderPreview); node.addEventListener('change', renderPreview); renderPreview(); return node;
}
function readV2Block(node) {
  const type = node.dataset.v2Type;
  if (type === 'text') return { type: 'text', text: $('[data-v2="text"]', node).value };
  if (type === 'separator') return { type: 'separator', divider: $('[data-v2="divider"]', node).checked, spacing: Number($('[data-v2="spacing"]', node).value || 1) };
  if (type === 'media') return { type: 'media', url: $('[data-v2="url"]', node).value.trim() };
  if (type === 'section') return { type: 'section', text: $('[data-v2="text"]', node).value, button: { enabled: $('[data-v2="button.enabled"]', node).checked, label: $('[data-v2="button.label"]', node).value.trim(), emoji: $('[data-v2="button.emoji"]', node).value.trim(), url: $('[data-v2="button.url"]', node).value.trim() } };
  return { type: 'text', text: '' };
}

function buildMessage() {
  return {
    content: els.content.value,
    useV2: isV2Mode(),
    allowUserPings: els.allowUserPings.checked,
    allowRolePings: els.allowRolePings.checked,
    buttonsEnabled: els.buttonsEnabled.checked,
    embeds: $$('.embed-editor', els.embeds).map(readEmbed),
    buttons: $$('.button-editor', els.buttons).map(readButton).filter(b => b.label && b.url),
    v2: { enabled: isV2Mode(), container: els.v2Container.checked, accentColor: els.v2AccentColor.value, buttonsEnabled: els.v2ButtonsEnabled.checked, blocks: $$('.v2-block', els.v2Blocks).map(readV2Block) }
  };
}
function buildRequest() { return { channelId: els.channelSelect.value, message: buildMessage() }; }

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
function linkifyMentions(value) { return escapeHtml(value).replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role:$1</span>').replace(/&lt;@(\d+)&gt;/g, '<span class="mention">@user:$1</span>').replace(/&lt;a?:([A-Za-z0-9_]+):(\d+)&gt;/g, '<span class="mention">:$1:</span>'); }
function renderPreview() {
  const msg = buildMessage();
  const content = msg.content.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
  const body = msg.useV2 ? renderV2Preview(msg) : `${content ? `<div class="content">${linkifyMentions(content)}</div>` : ''}${msg.embeds.map(renderEmbedPreview).join('')}${renderButtonRow(msg.buttonsEnabled ? msg.buttons : [])}`;
  els.preview.innerHTML = `<div class="message"><div class="avatar"></div><div><div><span class="username">Your Bot</span><span class="bot-tag">BOT</span></div>${body}</div></div>`;
}
function renderButtonRow(buttons) { const live = buttons.filter(b => b.enabled !== false && b.label && b.url); return live.length ? `<div class="button-preview-row">${live.map(b => `<span class="button-preview">${escapeHtml(b.emoji || '')} ${escapeHtml(b.label)}</span>`).join('')}</div>` : ''; }
function renderEmbedPreview(embed) { const color = normalizeHex(embed.color); const author = embed.author?.name ? `<div class="embed-author">${escapeHtml(embed.author.name)}</div>` : ''; const title = embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''; const desc = embed.description ? `<div class="embed-desc">${linkifyMentions(embed.description)}</div>` : ''; const fields = (embed.fields || []).length ? `<div class="embed-field-grid">${embed.fields.map(f => `<div class="embed-field ${f.inline ? '' : 'full'}"><div class="embed-field-name">${escapeHtml(f.name || 'Field')}</div><div class="embed-field-value">${linkifyMentions(f.value || '-')}</div></div>`).join('')}</div>` : ''; const img = embed.image_url ? `<img class="embed-image" src="${escapeHtml(embed.image_url)}">` : ''; const thumb = embed.thumbnail_url ? `<img class="embed-thumb" src="${escapeHtml(embed.thumbnail_url)}">` : ''; const footer = embed.footer?.text ? `<div class="embed-footer">${escapeHtml(embed.footer.text)}${embed.timestamp ? ' • now' : ''}</div>` : (embed.timestamp ? '<div class="embed-footer">now</div>' : ''); if (!author && !title && !desc && !fields && !img && !thumb && !footer) return ''; return `<div class="embed-preview" style="border-left-color:${color}">${thumb}${author}${title}${desc}${fields}${img}${footer}</div>`; }
function renderV2Preview(msg) { const inner = msg.v2.blocks.map(block => { if (block.type === 'separator') return '<hr class="v2-sep">'; if (block.type === 'media' && block.url) return `<img class="v2-media" src="${escapeHtml(block.url)}">`; if (block.type === 'section') return `<div class="v2-section"><div class="v2-text">${linkifyMentions(block.text || '')}</div>${block.button?.enabled !== false && block.button?.label ? `<span class="button-preview">${escapeHtml(block.button.emoji || '')} ${escapeHtml(block.button.label)}</span>` : ''}</div>`; return `<div class="v2-text">${linkifyMentions(block.text || '')}</div>`; }).join('') + (msg.v2.buttonsEnabled ? renderButtonRow(msg.buttons) : ''); if (msg.v2.container) return `<div class="v2-container-preview" style="border-left-color:${normalizeHex(msg.v2.accentColor)}">${inner}</div>`; return inner; }

function applyMode() { const v2 = isV2Mode(); els.classicCard.style.display = v2 ? 'none' : ''; els.embedCard.style.display = v2 ? 'none' : ''; els.v2Card.style.display = v2 ? '' : 'none'; renderPreview(); }
function extractMessageId(value) { const raw = String(value || '').trim(); const match = raw.match(/\/(\d{15,25})$/) || raw.match(/(\d{15,25})/); return match ? match[1] : raw; }
async function loadMessage() { try { const channelId = els.channelSelect.value; if (!channelId) throw new Error('Select a channel'); const messageId = extractMessageId(els.editMessageId.value); if (!messageId) throw new Error('Message ID or URL is empty'); const data = await api(`/api/message?channelId=${encodeURIComponent(channelId)}&messageId=${encodeURIComponent(messageId)}`); applyMessage(data.message || {}); setResult(`Loaded message: ${data.url || data.messageId}`, 'ok'); } catch (e) { setResult(e.message, 'bad'); } }
async function sendMessage() { try { const request = buildRequest(); if (!request.channelId) throw new Error('Select a channel'); const data = await api('/api/send', { method: 'POST', body: JSON.stringify(request) }); setResult(`Sent: ${data.url}`, 'ok'); } catch (e) { setResult(e.message, 'bad'); } }
async function editMessage() { try { const request = buildRequest(); if (!request.channelId) throw new Error('Select a channel'); const messageId = els.editMessageId.value.trim(); if (!messageId) throw new Error('Message ID or URL is empty'); const data = await api('/api/edit', { method: 'POST', body: JSON.stringify({ ...request, messageId }) }); setResult(`Edited: ${data.url}`, 'ok'); } catch (e) { setResult(e.message, 'bad'); } }
function exportJson() { els.jsonBox.value = JSON.stringify(buildMessage(), null, 2); setResult('JSON exported', 'ok'); }
function importJson() { try { const data = JSON.parse(els.jsonBox.value); applyMessage(data.message || data); setResult('JSON imported', 'ok'); } catch (e) { setResult(`Import failed: ${e.message}`, 'bad'); } }
function applyMessage(data) { els.content.value = data.content || ''; els.allowUserPings.checked = data.allowUserPings !== false; els.allowRolePings.checked = data.allowRolePings !== false; els.buttonsEnabled.checked = data.buttonsEnabled !== false; els.embeds.innerHTML = ''; els.buttons.innerHTML = ''; els.v2Blocks.innerHTML = ''; for (const embed of data.embeds || []) addEmbed(embed); for (const button of data.buttons || []) addButton(button); els.v2Container.checked = data.v2?.container !== false; els.v2ButtonsEnabled.checked = data.v2?.buttonsEnabled !== false; els.v2AccentColor.value = normalizeHex(data.v2?.accentColor || '#5865f2'); for (const block of data.v2?.blocks || []) addV2Block(block.type || 'text', block); document.querySelector(`[name="messageMode"][value="${data.useV2 || data.v2?.enabled ? 'v2' : 'classic'}"]`).checked = true; applyMode(); renderPreview(); }
function saveTemplate() { const name = prompt('Template name?'); if (!name) return; const templates = JSON.parse(localStorage.getItem('lds-templates') || '{}'); templates[name] = buildMessage(); localStorage.setItem('lds-templates', JSON.stringify(templates)); setResult(`Template saved: ${name}`, 'ok'); }
function loadTemplate() { const templates = JSON.parse(localStorage.getItem('lds-templates') || '{}'); const names = Object.keys(templates); if (!names.length) return setResult('No saved templates', 'bad'); const name = prompt(`Template name:\n${names.join('\n')}`); if (!name || !templates[name]) return; applyMessage(templates[name]); setResult(`Template loaded: ${name}`, 'ok'); }
function clearAll() { if (!confirm('Clear editor?')) return; applyMessage({ content: '', embeds: [], buttons: [], v2: { blocks: [] } }); }
function saveSettings() { localStorage.setItem('lds-api-url', normalizeApiUrl(els.apiUrl.value)); localStorage.setItem('lds-api-key', els.apiKey.value); els.apiUrl.value = normalizeApiUrl(els.apiUrl.value); setResult('Settings saved', 'ok'); }
function restoreSettings() { els.apiUrl.value = localStorage.getItem('lds-api-url') || ''; els.apiKey.value = localStorage.getItem('lds-api-key') || ''; }

function bind() {
  document.addEventListener('focusin', trackTextTarget);
  $('#saveSettings').addEventListener('click', saveSettings); $('#testConnection').addEventListener('click', testConnection); $('#loadChannels').addEventListener('click', loadChannels);
  $('#loadRoles').addEventListener('click', loadRoles); $('#insertRoleMention').addEventListener('click', insertRoleMention); $('#loadMembers').addEventListener('click', loadMembers); $('#insertUserMention').addEventListener('click', insertUserMention);
  $('#loadEmojis').addEventListener('click', loadEmojis); $('#insertEmoji').addEventListener('click', insertEmoji); $('#copyEmoji').addEventListener('click', copyEmoji);
  $('#addEmbed').addEventListener('click', () => addEmbed()); $('#addButton').addEventListener('click', () => addButton()); $('#addV2Text').addEventListener('click', () => addV2Block('text')); $('#addV2Section').addEventListener('click', () => addV2Block('section')); $('#addV2Separator').addEventListener('click', () => addV2Block('separator')); $('#addV2Media').addEventListener('click', () => addV2Block('media'));
  $('#sendMessage').addEventListener('click', sendMessage); $('#editMessage').addEventListener('click', editMessage); $('#loadMessage').addEventListener('click', loadMessage); $('#exportJson').addEventListener('click', exportJson); $('#importJson').addEventListener('click', importJson); $('#saveTemplate').addEventListener('click', saveTemplate); $('#loadTemplate').addEventListener('click', loadTemplate); $('#clearAll').addEventListener('click', clearAll); $('#refreshPreview').addEventListener('click', renderPreview);
  $$('[name="messageMode"]').forEach(r => r.addEventListener('change', applyMode)); document.addEventListener('input', renderPreview); document.addEventListener('change', renderPreview);
}

restoreSettings(); initUnicodeEmojis(); bind(); addEmbed(); addButton({ enabled: true }); addV2Block('text', { text: '# Components V2 panel\nWrite V2 content here.' }); applyMode(); renderPreview();
