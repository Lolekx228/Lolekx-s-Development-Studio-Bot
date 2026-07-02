const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORE = {
  apiBase: 'lds_api_base',
  apiKey: 'lds_api_key',
  authMode: 'lds_auth_mode',
  project: 'lds_project_discohook_rework_v1',
  backups: 'lds_backups_discohook_rework_v1',
  history: 'lds_history_discohook_rework_v1',
};

const state = {
  bot: null,
  channels: [],
  apiBase: localStorage.getItem(STORE.apiBase) || '',
  apiKey: localStorage.getItem(STORE.apiKey) || '',
  authMode: localStorage.getItem(STORE.authMode) || '',
  activeMessageId: '',
  messages: [],
};

const LIMITS = {
  messages: 10,
  embeds: 10,
  fields: 25,
  buttons: 25,
  buttonsPerRow: 5,
  v2Blocks: 40,
};

function id(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}
function normalizeColor(value, fallback = '#5865f2') {
  const raw = String(value ?? '').trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : fallback;
}
function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim()) || /^attachment:\/\//i.test(String(value || '').trim());
}
function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}
function pseudoCustomId() {
  return `p_${Math.floor(Math.random() * 900000000000000000) + 100000000000000000}`;
}
function discordText(value, max = 4000) {
  return truncate(String(value ?? ''), max);
}
function truncate(value, limit) {
  const text = String(value ?? '');
  return text.length > limit ? text.slice(0, limit) : text;
}
function notify(text, kind = '') {
  if (!text) return;
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`.trim();
  toast.textContent = text;
  $('toastWrap').appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}
function setStatus(text = '', ok = true) {
  const el = $('statusLine');
  if (!el) return;
  el.textContent = text;
  el.className = `status ${text ? (ok ? 'ok' : 'bad') : ''}`.trim();
  if (text) notify(text, ok ? 'good' : 'bad');
}
function closeMenus() {
  $('floatingMenu').classList.remove('show');
  $('sendDropdown').classList.remove('show');
}
function showMenu(anchor, items) {
  closeMenus();
  const menu = $('floatingMenu');
  menu.innerHTML = '';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', () => { closeMenus(); item.run(); });
    menu.appendChild(btn);
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - 240)}px`;
  menu.classList.add('show');
}
function openModal(title, bodyHtml, actions = []) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalActions').innerHTML = '';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${action.className || 'secondary'}`.trim();
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    $('modalActions').appendChild(btn);
  }
  $('modalBackdrop').classList.add('show');
  $('modalBackdrop').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('modalBackdrop').classList.remove('show');
  $('modalBackdrop').setAttribute('aria-hidden', 'true');
}
async function copyText(text, ok = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); setStatus(ok); }
  catch { setStatus('Не удалось скопировать в буфер.', false); }
}
function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isAppsScriptProxy(base = state.apiBase) {
  const value = String(base || '').toLowerCase();
  return value.includes('script.google.com/macros/') || value.includes('script.googleusercontent.com/macros/') || value.includes('/macros/s/');
}
function splitApiPath(path) {
  const raw = String(path || '/api/health');
  const [cleanPath, query = ''] = raw.split('?');
  const apiPath = cleanPath.replace(/^\/+/, '').replace(/^api\//i, '') || 'health';
  const params = new URLSearchParams(query);
  return { apiPath, params };
}
function apiUrl(path) {
  const base = String(state.apiBase || '').trim().replace(/\/+$/, '');
  if (!base) return path;
  if (isAppsScriptProxy(base)) {
    const { apiPath, params } = splitApiPath(path);
    params.set('path', apiPath);
    params.set('panelKey', state.apiKey || '');
    return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
  }
  return `${base}${path}`;
}
async function api(path, options = {}) {
  const gas = isAppsScriptProxy();
  const method = String(options.method || 'GET').toUpperCase();
  const headers = gas
    ? (method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : {})
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (!gas && state.apiKey) {
    headers['X-Web-Api-Key'] = state.apiKey;
    headers.Authorization = `Bearer ${state.apiKey}`;
  }
  const response = await fetch(apiUrl(path), {
    credentials: state.apiBase ? 'omit' : 'same-origin',
    ...options,
    headers,
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch {
    const sample = raw.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(sample ? `Bad response: ${sample}` : `Bad response: HTTP ${response.status}`);
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function createEmbed() {
  return {
    id: id('embed'), open: true,
    author: { name: '', url: '', icon_url: '' },
    title: '', url: '', color: '#5865f2', description: '',
    fields: [], image_url: '', thumbnail_url: '',
    footer: { text: '', icon_url: '' }, timestamp: false,
  };
}
function createField() { return { id: id('field'), name: '', value: '', inline: false }; }
function createButton() { return { id: id('btn'), enabled: true, label: 'Link', url: '', emoji: '' }; }
function createV2Component(type = 'button') {
  return {
    id: id('cmp'),
    type,
    label: type === 'link' ? 'Link' : '',
    url: type === 'link' ? 'https://discohook.app' : '',
    style: type === 'link' ? 5 : 1,
    customId: pseudoCustomId(),
    placeholder: '',
    minValues: 1,
    maxValues: 1,
    optionsText: '',
    emoji: ''
  };
}
function createV2Block(type = 'text') {
  if (type === 'section') return { id: id('block'), type, open: true, text: '', accessoryType: 'button', button: createV2Component('button'), thumbnail: { url: '', description: '' } };
  if (type === 'media') return { id: id('block'), type, open: true, items: [{ id: id('media'), url: '', description: '' }] };
  if (type === 'file') return { id: id('block'), type, open: true, url: '' };
  if (type === 'separator') return { id: id('block'), type, open: true, divider: true, spacing: 1 };
  if (type === 'row') return { id: id('block'), type, open: true, components: [createV2Component('button')] };
  if (type === 'container') return { id: id('block'), type, open: true, accentColor: '#5865f2', blocks: [] };
  return { id: id('block'), type: 'text', open: true, text: '' };
}
function createMessage(type = 'v1') {
  return {
    id: id('msg'), type, open: true,
    name: '', avatarUrl: '', threadName: '',
    content: '',
    allowUserPings: true, allowRolePings: true,
    buttonsEnabled: true,
    embeds: [], buttons: [],
    useV2: type === 'v2',
    v2: { enabled: type === 'v2', container: false, accentColor: '#5865f2', blocks: type === 'v2' ? [createV2Block('text')] : [] },
  };
}
function hydrateMessage(raw) {
  const msg = { ...createMessage(raw?.useV2 || raw?.type === 'v2' || raw?.v2?.enabled ? 'v2' : 'v1'), ...(raw || {}) };
  msg.id = msg.id || id('msg');
  msg.type = msg.type || (msg.useV2 || msg.v2?.enabled ? 'v2' : 'v1');
  msg.open = msg.open !== false;
  msg.allowUserPings = msg.allowUserPings !== false;
  msg.allowRolePings = msg.allowRolePings !== false;
  msg.buttonsEnabled = msg.buttonsEnabled !== false;
  msg.embeds = Array.isArray(msg.embeds) ? msg.embeds.map((e) => ({ ...createEmbed(), ...e, id: e.id || id('embed'), open: e.open !== false, author: { name: '', url: '', icon_url: '', ...(e.author || {}) }, footer: { text: '', icon_url: '', ...(e.footer || {}) }, fields: Array.isArray(e.fields) ? e.fields.map((f) => ({ ...createField(), ...f, id: f.id || id('field') })) : [] })) : [];
  msg.buttons = Array.isArray(msg.buttons) ? msg.buttons.map((b) => ({ ...createButton(), ...b, id: b.id || id('btn'), enabled: b.enabled !== false })) : [];
  msg.v2 = { container: false, accentColor: '#5865f2', blocks: [], ...(msg.v2 || {}) };
  msg.v2.enabled = msg.type === 'v2' || msg.useV2 || msg.v2.enabled;
  msg.v2.blocks = Array.isArray(msg.v2.blocks) ? msg.v2.blocks.map(hydrateV2Block) : [];
  return msg;
}
function hydrateV2Component(raw = {}) {
  const type = raw.type || (raw.url ? 'link' : 'button');
  return { ...createV2Component(type), ...raw, id: raw.id || id('cmp'), customId: raw.customId || raw.custom_id || pseudoCustomId(), minValues: Number(raw.minValues ?? raw.min_values ?? 1), maxValues: Number(raw.maxValues ?? raw.max_values ?? 1) };
}
function hydrateV2Block(raw = {}) {
  const block = { ...createV2Block(raw.type || 'text'), ...raw, id: raw.id || id('block'), open: raw.open !== false };
  if (block.type === 'section') {
    block.button = hydrateV2Component(raw.button || raw.accessory || (raw.accessoryType === 'link' ? { type: 'link' } : { type: 'button' }));
    block.thumbnail = { url: '', description: '', ...(raw.thumbnail || {}) };
    block.accessoryType = raw.accessoryType || (raw.thumbnail?.url ? 'thumbnail' : (block.button?.type === 'link' ? 'link' : 'button'));
  }
  if (block.type === 'media') block.items = Array.isArray(raw.items) && raw.items.length ? raw.items.map((x) => ({ id: x.id || id('media'), url: x.url || x.media?.url || '', description: x.description || '' })) : [{ id: id('media'), url: raw.url || '', description: '' }];
  if (block.type === 'row') block.components = Array.isArray(raw.components) && raw.components.length ? raw.components.map(hydrateV2Component) : [createV2Component('button')];
  if (block.type === 'container') block.blocks = Array.isArray(raw.blocks) ? raw.blocks.map(hydrateV2Block) : [];
  return block;
}
function activeMessage() { return state.messages.find((m) => m.id === state.activeMessageId) || state.messages[0] || null; }
function setActive(idValue) { state.activeMessageId = idValue; saveProjectDebounced(); renderMessages(); renderPreview(); }
function saveProject() {
  localStorage.setItem(STORE.project, JSON.stringify(projectData()));
}
let saveTimer = null;
function saveProjectDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 250);
}
function projectData() {
  return {
    version: 2,
    channelId: $('channelSelect')?.value || '',
    editMessage: $('editMessageInput')?.value || '',
    activeMessageId: state.activeMessageId,
    messages: state.messages,
  };
}
function applyProject(project = {}) {
  if ($('channelSelect') && project.channelId) $('channelSelect').value = project.channelId;
  if ($('editMessageInput')) $('editMessageInput').value = project.editMessage || '';
  state.messages = Array.isArray(project.messages) && project.messages.length ? project.messages.map(hydrateMessage) : [createMessage('v1')];
  state.activeMessageId = project.activeMessageId && state.messages.some((m) => m.id === project.activeMessageId) ? project.activeMessageId : state.messages[0].id;
  renderMessages();
  renderPreview();
  saveProject();
}
function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORE.project);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function emojiToDiscord(raw) {
  const value = String(raw || '').trim();
  if (!value) return undefined;
  const custom = value.match(/^<(?<animated>a?):(?<name>[A-Za-z0-9_]{2,32}):(?<id>\d{15,25})>$/);
  if (custom?.groups) return { id: custom.groups.id, name: custom.groups.name, animated: custom.groups.animated === 'a' };
  if (/^\d{15,25}$/.test(value)) return { id: value };
  return { name: value.slice(0, 32) };
}
function selectTypeNumber(type) {
  return { select: 3, stringSelect: 3, userSelect: 5, roleSelect: 6, mentionableSelect: 7, channelSelect: 8 }[type] || 3;
}
function componentToDiscord(component = {}) {
  const type = component.type || 'button';
  const custom_id = component.customId || component.custom_id || pseudoCustomId();
  if (type === 'link') {
    const output = { type: 2, style: 5, url: component.url || '', custom_id };
    if (component.label) output.label = truncate(component.label, 80);
    const emoji = emojiToDiscord(component.emoji);
    if (emoji) output.emoji = emoji;
    return output;
  }
  if (type === 'button') {
    const output = { type: 2, style: Number(component.style) || 1, custom_id };
    if (component.label) output.label = truncate(component.label, 80);
    const emoji = emojiToDiscord(component.emoji);
    if (emoji) output.emoji = emoji;
    return output;
  }
  const select = { type: selectTypeNumber(type), custom_id, min_values: Number(component.minValues ?? 1), max_values: Number(component.maxValues ?? 1) };
  if (component.placeholder) select.placeholder = truncate(component.placeholder, 150);
  if (select.type === 3) {
    select.options = String(component.optionsText || '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 25).map((line, index) => {
      const [label, value = label, description = ''] = line.split('|').map((x) => x.trim());
      const opt = { label: truncate(label || `Option ${index + 1}`, 100), value: truncate(value || label || `option_${index + 1}`, 100) };
      if (description) opt.description = truncate(description, 100);
      return opt;
    });
  }
  return select;
}
function v2BlockToDiscord(block = {}) {
  if (block.type === 'section') {
    const section = { type: 9, components: [{ type: 10, content: discordText(block.text, 4000) }] };
    if (block.accessoryType === 'thumbnail') {
      const url = block.thumbnail?.url || '';
      if (url) section.accessory = { type: 11, media: { url }, ...(block.thumbnail?.description ? { description: truncate(block.thumbnail.description, 1024) } : {}) };
    } else if (block.accessoryType === 'link') {
      section.accessory = componentToDiscord({ ...(block.button || {}), type: 'link' });
    } else {
      section.accessory = componentToDiscord({ ...(block.button || {}), type: 'button' });
    }
    return section;
  }
  if (block.type === 'media') {
    const items = (block.items || []).map((item) => ({ media: { url: item.url || item.media?.url || '' }, ...(item.description ? { description: truncate(item.description, 1024) } : {}) })).filter((item) => item.media.url).slice(0, 10);
    return items.length ? { type: 12, items } : null;
  }
  if (block.type === 'file') {
    return block.url ? { type: 13, file: { url: block.url } } : null;
  }
  if (block.type === 'separator') {
    const out = { type: 14 };
    if (Number(block.spacing) === 2) out.spacing = 2;
    else if (Number(block.spacing) === 1) out.spacing = 1;
    if (block.divider === false) out.divider = false;
    else if (block.divider === true) out.divider = true;
    return out;
  }
  if (block.type === 'row') {
    const components = (block.components || []).map(componentToDiscord).filter(Boolean).slice(0, 5);
    return components.length ? { type: 1, components } : null;
  }
  if (block.type === 'container') {
    const components = (block.blocks || []).map(v2BlockToDiscord).filter(Boolean).slice(0, 40);
    if (!components.length) return null;
    const out = { type: 17, components };
    const color = normalizeColor(block.accentColor || '', '');
    if (color) out.accent_color = Number.parseInt(color.replace('#', ''), 16);
    return out;
  }
  const content = discordText(block.text || block.content, 4000);
  return content ? { type: 10, content } : null;
}
function buildRawV2Components(message) {
  const blocks = message.v2?.blocks || [];
  let components = blocks.map(v2BlockToDiscord).filter(Boolean);
  if (message.buttonsEnabled !== false && message.buttons?.length) {
    const urlButtons = message.buttons.filter((b) => b.enabled !== false).map((b) => componentToDiscord({ type: 'link', label: b.label, url: b.url, emoji: b.emoji })).filter(Boolean);
    for (let i = 0; i < urlButtons.length; i += 5) components.push({ type: 1, components: urlButtons.slice(i, i + 5) });
  }
  if (message.v2?.container === true && components.length) {
    const out = { type: 17, components };
    const color = normalizeColor(message.v2?.accentColor || '', '');
    if (color) out.accent_color = Number.parseInt(color.replace('#', ''), 16);
    components = [out];
  }
  return components.slice(0, 40);
}
function toApiMessage(message) {
  const output = {
    content: truncate(message.content, 2000),
    allowUserPings: Boolean(message.allowUserPings),
    allowRolePings: Boolean(message.allowRolePings),
    buttonsEnabled: message.buttonsEnabled !== false,
    buttons: (message.buttons || []).slice(0, LIMITS.buttons).map((button) => ({
      enabled: button.enabled !== false,
      label: truncate(button.label, 80),
      url: button.url,
      emoji: button.emoji || '',
    })),
  };
  if (message.type === 'v2' || message.useV2 || message.v2?.enabled) {
    const components = buildRawV2Components(message);
    output.useV2 = true;
    output.rawComponentsV2 = true;
    output.flags = 32768;
    output.components = components;
    output.attachments = [];
    output.embeds = [];
    output.v2 = {
      enabled: true,
      container: message.v2?.container === true,
      accentColor: normalizeColor(message.v2?.accentColor || '#5865f2'),
      buttonsEnabled: message.buttonsEnabled !== false,
      blocks: (message.v2?.blocks || []).slice(0, LIMITS.v2Blocks),
    };
    return output;
  }
  output.useV2 = false;
  output.embeds = (message.embeds || []).slice(0, LIMITS.embeds).map((embed) => ({
    title: truncate(embed.title, 256),
    url: embed.url,
    color: normalizeColor(embed.color || '#5865f2'),
    description: truncate(embed.description, 4096),
    timestamp: Boolean(embed.timestamp),
    author: {
      name: truncate(embed.author?.name, 256),
      url: embed.author?.url || '',
      icon_url: embed.author?.icon_url || '',
    },
    footer: {
      text: truncate(embed.footer?.text, 2048),
      icon_url: embed.footer?.icon_url || '',
    },
    image_url: embed.image_url || '',
    thumbnail_url: embed.thumbnail_url || '',
    fields: (embed.fields || []).slice(0, LIMITS.fields).map((field) => ({ name: truncate(field.name, 256), value: truncate(field.value, 1024), inline: Boolean(field.inline) })),
  }));
  return output;
}
function channelId() { return $('channelSelect')?.value || ''; }
function editMessageValue() { return $('editMessageInput')?.value.trim() || ''; }
function validateApiMessage(message) {
  const apiMsg = toApiMessage(message);
  if (apiMsg.useV2) {
    if (!Array.isArray(apiMsg.components) || apiMsg.components.length === 0) return 'V2-сообщение пустое.';
    return '';
  }
  const hasContent = apiMsg.content.trim();
  const hasEmbeds = apiMsg.embeds.some((e) => e.title || e.description || e.author.name || e.footer.text || e.image_url || e.thumbnail_url || e.fields.length);
  const hasButtons = apiMsg.buttons.some((b) => b.enabled !== false && b.label && isUrl(b.url));
  return hasContent || hasEmbeds || hasButtons ? '' : 'Сообщение пустое.';
}
async function sendOne(message, edit = false) {
  const error = validateApiMessage(message);
  if (error) throw new Error(error);
  const body = { channelId: channelId(), message: toApiMessage(message) };
  if (edit) {
    body.messageId = editMessageValue();
    return api('/api/edit', { method: 'POST', body: JSON.stringify(body) });
  }
  return api('/api/send', { method: 'POST', body: JSON.stringify(body) });
}
async function sendActiveOrEdit() {
  const msg = activeMessage();
  if (!channelId()) return setStatus('Выбери канал.', false);
  if (!msg) return setStatus('Нет активного сообщения.', false);
  const editing = Boolean(editMessageValue());
  if (editing && state.messages.length > 1 && !confirm('Редактирование применится только к активному сообщению. Продолжить?')) return;
  await sendWithButton(async () => {
    const result = await sendOne(msg, editing);
    pushHistory({ type: editing ? 'edit' : 'send', at: new Date().toISOString(), url: result.url || '', project: projectData() });
    setStatus(`${editing ? 'Изменено' : 'Отправлено'}: ${result.url || result.messageId || 'ok'}`);
  });
}
async function sendAll() {
  if (!channelId()) return setStatus('Выбери канал.', false);
  if (editMessageValue()) return setStatus('Для отправки всех сообщений очисти поле редактирования.', false);
  await sendWithButton(async () => {
    const urls = [];
    for (const msg of state.messages) {
      const result = await sendOne(msg, false);
      urls.push(result.url || result.messageId || 'ok');
    }
    pushHistory({ type: 'send-all', at: new Date().toISOString(), url: urls[0] || '', project: projectData() });
    setStatus(`Отправлено сообщений: ${urls.length}`);
  });
}
async function sendWithButton(task) {
  const btn = $('sendBtn');
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try { await task(); }
  catch (error) { setStatus(error.message || String(error), false); }
  finally { btn.disabled = false; btn.textContent = old; }
}
function pushHistory(entry) {
  const items = readJson(STORE.history, []);
  items.unshift(entry);
  localStorage.setItem(STORE.history, JSON.stringify(items.slice(0, 30)));
}
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function renderChannels() {
  const select = $('channelSelect');
  select.innerHTML = '';
  const channels = state.channels || [];
  if (!channels.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No sendable channels';
    select.appendChild(option);
    return;
  }
  const groups = new Map();
  for (const channel of channels) {
    const groupName = channel.guildName || channel.guild?.name || 'Server';
    if (!groups.has(groupName)) {
      const group = document.createElement('optgroup');
      group.label = groupName;
      groups.set(groupName, group);
      select.appendChild(group);
    }
    const option = document.createElement('option');
    option.value = channel.id;
    option.textContent = channel.label ? channel.label.replace(`${groupName} / `, '') : `#${channel.name || channel.id}`;
    option.dataset.guildId = channel.guildId || '';
    groups.get(groupName).appendChild(option);
  }
}
function selectedChannelName() {
  const option = $('channelSelect')?.selectedOptions?.[0];
  return option ? option.textContent : 'No channel selected';
}
function currentGuildId() {
  return $('channelSelect')?.selectedOptions?.[0]?.dataset.guildId || '';
}

function switchHtml(path, checked, label) {
  return `<label class="switch"><input type="checkbox" data-path="${path}" ${checked ? 'checked' : ''}><span class="switch-track"></span><span>${escapeHtml(label)}</span></label>`;
}
function inputHtml(path, value, placeholder = '', attrs = '') {
  return `<input data-path="${path}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" ${attrs}>`;
}
function textAreaHtml(path, value, placeholder = '', rows = 4, attrs = '') {
  return `<textarea data-path="${path}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${attrs}>${escapeHtml(value || '')}</textarea>`;
}
function colorHtml(path, value) {
  return `<input type="color" data-path="${path}" value="${escapeHtml(normalizeColor(value || '#5865f2'))}">`;
}
function countText(value, max) { return `${String(value || '').length}/${max}`; }
function fold(title, body, options = {}) {
  const collapsed = options.open === false ? 'collapsed' : '';
  const actions = options.actions || '';
  const sub = options.sub ? `<span class="fold-sub">${escapeHtml(options.sub)}</span>` : '';
  return `<section class="fold ${collapsed}" data-fold>
    <div class="fold-head" data-toggle-fold><div class="fold-head-left"><button class="collapse-btn" type="button">›</button><span class="fold-title">${title}</span>${sub}</div><div class="inline-row">${actions}</div></div>
    <div class="fold-body">${body}</div>
  </section>`;
}
function miniCard(title, body, actions = '', open = true) {
  return `<div class="mini-card ${open ? '' : 'collapsed'}" data-mini>
    <div class="mini-head" data-toggle-mini><div class="mini-head-left"><button class="collapse-btn" type="button">›</button><span class="mini-title">${title}</span></div><div class="inline-row">${actions}</div></div>
    <div class="mini-body">${body}</div>
  </div>`;
}
function renderMessages() {
  const list = $('messageList');
  list.innerHTML = '';
  state.messages.forEach((msg, msgIndex) => list.appendChild(renderMessageCard(msg, msgIndex)));
}
function scrollToMessageCard(messageId, smooth = true) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-message-id=\"${String(messageId).replace(/\"/g, '')}\"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    card.classList.add('just-added');
    setTimeout(() => card.classList.remove('just-added'), 1400);
  });
}
function renderMessageCard(msg, msgIndex) {
  const card = document.createElement('article');
  card.className = `message-card ${msg.open ? '' : 'collapsed'} ${msg.id === state.activeMessageId ? 'active' : ''}`.trim();
  card.dataset.messageId = msg.id;
  const typeLabel = msg.type === 'v2' ? 'Components V2' : 'Standard';
  card.innerHTML = `
    <div class="card-head" data-set-active>
      <div class="head-left">
        <span class="drag-dot">⋮⋮</span>
        <button class="collapse-btn" type="button" data-action="toggle-message">›</button>
        <span class="card-title">Сообщение ${msgIndex + 1}</span>
        <span class="pill">${typeLabel}</span>
      </div>
      <div class="card-actions">
        <button class="icon-btn" type="button" data-action="move-message-up" title="Выше">↑</button>
        <button class="icon-btn" type="button" data-action="move-message-down" title="Ниже">↓</button>
        <button class="icon-btn" type="button" data-action="duplicate-message" title="Дублировать">⧉</button>
        <button class="icon-btn" type="button" data-action="delete-message" title="Удалить">🗑</button>
      </div>
    </div>
    <div class="card-body">${msg.type === 'v2' ? renderV2Editor(msg, msgIndex) : renderV1Editor(msg, msgIndex)}</div>
  `;
  return card;
}
function renderBaseSections(msg, i) {
  const base = `messages.${i}`;
  return [
    fold('Профиль', `<div class="grid-2"><label>Имя вебхука${inputHtml(`${base}.name`, msg.name, 'Bot name')}</label><label>Аватар URL${inputHtml(`${base}.avatarUrl`, msg.avatarUrl, 'https://...')}</label></div>`, { open: false }),
    fold('Ветка', `<label>Название ветки${inputHtml(`${base}.threadName`, msg.threadName, 'Forum thread name')}</label>`, { open: false }),
    fold('Allowed mentions', `<div class="inline-row">${switchHtml(`${base}.allowUserPings`, msg.allowUserPings, 'User pings')}${switchHtml(`${base}.allowRolePings`, msg.allowRolePings, 'Role pings')}</div><p class="small-muted">@everyone и @here сервер всё равно экранирует.</p>`, { open: false }),
  ].join('');
}
function renderV1Editor(msg, i) {
  const base = `messages.${i}`;
  const content = `<label>Content ${countText(msg.content, 2000)}${textAreaHtml(`${base}.content`, msg.content, 'Введите текст сообщения', 7, 'maxlength="2000"')}</label>`;
  const embeds = renderEmbeds(msg, i);
  const buttons = renderButtons(msg, i);
  return `${renderBaseSections(msg, i)}${fold('Содержимое', content, { open: true })}${fold('Embeds', embeds, { open: true, actions: `<button class="btn small primary" type="button" data-action="add-embed">＋ Embed</button>` })}${fold('Link buttons', buttons, { open: true, actions: `<button class="btn small primary" type="button" data-action="add-button">＋ Button</button>` })}`;
}
function renderV2Editor(msg, i) {
  const base = `messages.${i}`;
  const settings = `<div class="grid-2"><label>Accent color${colorHtml(`${base}.v2.accentColor`, msg.v2.accentColor)}</label><div class="inline-row" style="align-self:end">${switchHtml(`${base}.v2.container`, msg.v2.container !== false, 'Wrap in container')}${switchHtml(`${base}.buttonsEnabled`, msg.buttonsEnabled !== false, 'Buttons enabled')}</div></div>`;
  const blocks = renderV2Blocks(msg, i);
  const buttons = renderButtons(msg, i);
  return `${renderBaseSections(msg, i)}${fold('V2 Settings', settings, { open: true })}${fold('Components V2', blocks, { open: true, actions: `<button class="btn small primary" type="button" data-action="add-v2-block">＋ Add</button>` })}${fold('Link buttons', buttons, { open: true, actions: `<button class="btn small primary" type="button" data-action="add-button">＋ Button</button>` })}`;
}
function renderEmbeds(msg, i) {
  if (!msg.embeds.length) return '<div class="empty-box">Embeds пока нет. Нажми “+ Embed”.</div>';
  return `<div class="field-list">${msg.embeds.map((embed, eIndex) => renderEmbed(msg, i, embed, eIndex)).join('')}</div>`;
}
function renderEmbed(msg, i, embed, eIndex) {
  const base = `messages.${i}.embeds.${eIndex}`;
  const actions = `<button class="icon-btn" type="button" data-action="move-embed-up" data-embed-index="${eIndex}">↑</button><button class="icon-btn" type="button" data-action="move-embed-down" data-embed-index="${eIndex}">↓</button><button class="icon-btn" type="button" data-action="duplicate-embed" data-embed-index="${eIndex}">⧉</button><button class="icon-btn" type="button" data-action="delete-embed" data-embed-index="${eIndex}">🗑</button>`;
  const fields = (embed.fields || []).length ? embed.fields.map((field, fIndex) => {
    const fbase = `${base}.fields.${fIndex}`;
    return `<div class="field-card"><div class="inline-row" style="justify-content:space-between"><strong>Field ${fIndex + 1}</strong><div class="inline-row"><button class="btn small secondary" type="button" data-action="move-field-up" data-embed-index="${eIndex}" data-field-index="${fIndex}">↑</button><button class="btn small secondary" type="button" data-action="move-field-down" data-embed-index="${eIndex}" data-field-index="${fIndex}">↓</button><button class="btn small danger" type="button" data-action="delete-field" data-embed-index="${eIndex}" data-field-index="${fIndex}">Delete</button></div></div><div class="grid-2"><label>Name ${countText(field.name, 256)}${inputHtml(`${fbase}.name`, field.name, 'Field name', 'maxlength="256"')}</label><label>Value ${countText(field.value, 1024)}${inputHtml(`${fbase}.value`, field.value, 'Field value', 'maxlength="1024"')}</label></div>${switchHtml(`${fbase}.inline`, field.inline, 'Inline')}</div>`;
  }).join('') : '<div class="empty-box">Поля отсутствуют.</div>';
  const body = `
    <div class="grid-3"><label>Title ${countText(embed.title, 256)}${inputHtml(`${base}.title`, embed.title, 'Embed title', 'maxlength="256"')}</label><label>URL${inputHtml(`${base}.url`, embed.url, 'https://...')}</label><label>Color${colorHtml(`${base}.color`, embed.color)}</label></div>
    <label>Description ${countText(embed.description, 4096)}${textAreaHtml(`${base}.description`, embed.description, 'Embed description', 5, 'maxlength="4096"')}</label>
    ${miniCard('Author', `<div class="grid-3"><label>Name${inputHtml(`${base}.author.name`, embed.author.name, 'Author')}</label><label>URL${inputHtml(`${base}.author.url`, embed.author.url, 'https://...')}</label><label>Icon URL${inputHtml(`${base}.author.icon_url`, embed.author.icon_url, 'https://...')}</label></div>`, '', false)}
    ${miniCard('Images', `<div class="grid-2"><label>Image URL${inputHtml(`${base}.image_url`, embed.image_url, 'https://...')}</label><label>Thumbnail URL${inputHtml(`${base}.thumbnail_url`, embed.thumbnail_url, 'https://...')}</label></div>`, '', false)}
    ${miniCard('Fields', `<div class="field-list">${fields}</div><button class="btn small primary" type="button" data-action="add-field" data-embed-index="${eIndex}">＋ Add field</button>`, '', false)}
    ${miniCard('Footer', `<div class="grid-2"><label>Text ${countText(embed.footer.text, 2048)}${inputHtml(`${base}.footer.text`, embed.footer.text, 'Footer', 'maxlength="2048"')}</label><label>Icon URL${inputHtml(`${base}.footer.icon_url`, embed.footer.icon_url, 'https://...')}</label></div>${switchHtml(`${base}.timestamp`, embed.timestamp, 'Timestamp')}`, '', false)}
  `;
  return miniCard(`Embed ${eIndex + 1}`, body, actions, embed.open !== false);
}
function renderButtons(msg, i) {
  const base = `messages.${i}`;
  const toggle = `<div class="inline-row">${switchHtml(`${base}.buttonsEnabled`, msg.buttonsEnabled !== false, 'Buttons enabled')}</div>`;
  if (!msg.buttons.length) return `${toggle}<div class="empty-box">URL-кнопки пока не добавлены. Сервер сейчас отправляет только link-buttons.</div>`;
  return `${toggle}<div class="field-list">${msg.buttons.map((button, bIndex) => {
    const bbase = `${base}.buttons.${bIndex}`;
    return `<div class="button-row-card"><div class="inline-row" style="justify-content:space-between"><strong>Button ${bIndex + 1}</strong><div class="inline-row"><button class="btn small secondary" type="button" data-action="move-button-up" data-button-index="${bIndex}">↑</button><button class="btn small secondary" type="button" data-action="move-button-down" data-button-index="${bIndex}">↓</button><button class="btn small danger" type="button" data-action="delete-button" data-button-index="${bIndex}">Delete</button></div></div><div class="grid-3"><label>Label ${countText(button.label, 80)}${inputHtml(`${bbase}.label`, button.label, 'Open', 'maxlength="80"')}</label><label>URL${inputHtml(`${bbase}.url`, button.url, 'https://...')}</label><label>Emoji${inputHtml(`${bbase}.emoji`, button.emoji, '🔥 или <:name:id>')}</label></div>${switchHtml(`${bbase}.enabled`, button.enabled !== false, 'Enabled')}</div>`;
  }).join('')}</div>`;
}
function renderV2Block(msg, i, block, blockIndex, parentPath = null) {
  const base = parentPath || `messages.${i}.v2.blocks.${blockIndex}`;
  const actions = `<button class="icon-btn" type="button" data-action="move-v2-up" data-block-index="${blockIndex}">↑</button><button class="icon-btn" type="button" data-action="move-v2-down" data-block-index="${blockIndex}">↓</button><button class="icon-btn" type="button" data-action="duplicate-v2" data-block-index="${blockIndex}">⧉</button><button class="icon-btn" type="button" data-action="delete-v2" data-block-index="${blockIndex}">🗑</button>`;
  let body = '';
  if (block.type === 'section') {
    body = `<label>Текст ${countText(block.text, 4000)}${textAreaHtml(`${base}.text`, block.text, 'Текст секции', 4, 'maxlength="4000"')}</label>
      <label>Accessory<select data-path="${base}.accessoryType"><option value="button" ${block.accessoryType !== 'link' && block.accessoryType !== 'thumbnail' ? 'selected' : ''}>Кнопка</option><option value="link" ${block.accessoryType === 'link' ? 'selected' : ''}>Кнопка с ссылкой</option><option value="thumbnail" ${block.accessoryType === 'thumbnail' ? 'selected' : ''}>Миниатюра</option></select></label>
      ${block.accessoryType === 'thumbnail'
        ? `<div class="grid-2"><label>Media URL${inputHtml(`${base}.thumbnail.url`, block.thumbnail?.url, 'attachment://file.png или https://...')}</label><label>Описание${inputHtml(`${base}.thumbnail.description`, block.thumbnail?.description, 'description')}</label></div>`
        : `<div class="grid-3"><label>Label${inputHtml(`${base}.button.label`, block.button?.label, 'Button')}</label><label>${block.accessoryType === 'link' ? 'URL' : 'Custom ID'}${inputHtml(`${base}.button.${block.accessoryType === 'link' ? 'url' : 'customId'}`, block.accessoryType === 'link' ? block.button?.url : block.button?.customId, block.accessoryType === 'link' ? 'https://...' : 'p_...')}</label><label>Style${inputHtml(`${base}.button.style`, block.button?.style || 1, '1')}</label></div>`}`;
  } else if (block.type === 'media') {
    const items = block.items || [];
    body = `${items.map((item, idx) => `<div class="field-card"><div class="inline-row" style="justify-content:space-between"><strong>Media ${idx + 1}</strong><button class="btn small danger" type="button" data-action="delete-media-item" data-block-index="${blockIndex}" data-item-index="${idx}">Delete</button></div><div class="grid-2"><label>URL${inputHtml(`${base}.items.${idx}.url`, item.url, 'attachment://file.png или https://...')}</label><label>Описание${inputHtml(`${base}.items.${idx}.description`, item.description, 'description')}</label></div></div>`).join('')}<button class="btn small primary" type="button" data-action="add-media-item" data-block-index="${blockIndex}">＋ Media item</button>`;
  } else if (block.type === 'file') {
    body = `<label>File URL${inputHtml(`${base}.url`, block.url, 'attachment://file.mp4')}</label>`;
  } else if (block.type === 'separator') {
    body = `<div class="inline-row">${switchHtml(`${base}.divider`, block.divider !== false, 'Divider')}</div><label>Spacing<select data-path="${base}.spacing"><option value="1" ${Number(block.spacing) !== 2 ? 'selected' : ''}>Small</option><option value="2" ${Number(block.spacing) === 2 ? 'selected' : ''}>Large</option></select></label>`;
  } else if (block.type === 'row') {
    const components = block.components || [];
    body = `${components.map((component, cIndex) => renderV2ComponentEditor(`${base}.components.${cIndex}`, component, blockIndex, cIndex)).join('')}<button class="btn small primary" type="button" data-action="add-row-component" data-block-index="${blockIndex}">＋ Component</button>`;
  } else if (block.type === 'container') {
    const nested = block.blocks || [];
    body = `<label>Accent color${colorHtml(`${base}.accentColor`, block.accentColor)}</label><div class="field-list">${nested.map((child, childIndex) => renderNestedV2Block(msg, i, child, childIndex, `${base}.blocks.${childIndex}`, blockIndex)).join('')}</div><button class="btn small primary" type="button" data-action="add-container-block" data-block-index="${blockIndex}">＋ В контейнер</button>`;
  } else {
    body = `<label>Текст ${countText(block.text, 4000)}${textAreaHtml(`${base}.text`, block.text, 'Text content', 5, 'maxlength="4000"')}</label>`;
  }
  return miniCard(`${blockIndex + 1}. ${v2BlockTitle(block.type)}`, body, actions, block.open !== false);
}
function renderNestedV2Block(msg, i, block, childIndex, base, parentIndex) {
  const body = renderV2Block(msg, i, block, childIndex, base).replaceAll(`data-block-index="${childIndex}"`, `data-block-index="${childIndex}" data-parent-block-index="${parentIndex}"`);
  return body;
}
function v2BlockTitle(type) {
  return { text: 'Содержимое', section: 'Section', media: 'Media Gallery', file: 'File', separator: 'Separator', row: 'Action Row', container: 'Container' }[type] || type;
}
function renderV2ComponentEditor(base, component, blockIndex, componentIndex) {
  const type = component.type || 'button';
  const typeSelect = `<label>Тип<select data-path="${base}.type"><option value="button" ${type === 'button' ? 'selected' : ''}>Кнопка</option><option value="link" ${type === 'link' ? 'selected' : ''}>Кнопка с ссылкой</option><option value="select" ${type === 'select' || type === 'stringSelect' ? 'selected' : ''}>Меню выбора</option><option value="userSelect" ${type === 'userSelect' ? 'selected' : ''}>User select</option><option value="roleSelect" ${type === 'roleSelect' ? 'selected' : ''}>Role select</option><option value="mentionableSelect" ${type === 'mentionableSelect' ? 'selected' : ''}>Mentionable select</option><option value="channelSelect" ${type === 'channelSelect' ? 'selected' : ''}>Channel select</option></select></label>`;
  const commonTop = `<div class="inline-row" style="justify-content:space-between"><strong>Component ${componentIndex + 1}</strong><button class="btn small danger" type="button" data-action="delete-row-component" data-block-index="${blockIndex}" data-component-index="${componentIndex}">Delete</button></div>${typeSelect}`;
  if (type === 'link') return `<div class="field-card">${commonTop}<div class="grid-3"><label>Label${inputHtml(`${base}.label`, component.label, 'Link')}</label><label>URL${inputHtml(`${base}.url`, component.url, 'https://...')}</label><label>Emoji${inputHtml(`${base}.emoji`, component.emoji, '↗')}</label></div></div>`;
  if (type === 'button') return `<div class="field-card">${commonTop}<div class="grid-3"><label>Label${inputHtml(`${base}.label`, component.label, 'Button')}</label><label>Custom ID${inputHtml(`${base}.customId`, component.customId, 'p_...')}</label><label>Style${inputHtml(`${base}.style`, component.style || 1, '1')}</label></div></div>`;
  return `<div class="field-card">${commonTop}<div class="grid-3"><label>Custom ID${inputHtml(`${base}.customId`, component.customId, 'p_...')}</label><label>Min${inputHtml(`${base}.minValues`, component.minValues ?? 1, '1')}</label><label>Max${inputHtml(`${base}.maxValues`, component.maxValues ?? 1, '1')}</label></div><label>Placeholder${inputHtml(`${base}.placeholder`, component.placeholder, 'Выберите...')}</label>${(type === 'select' || type === 'stringSelect') ? `<label>Options, по одной на строку: label|value|description${textAreaHtml(`${base}.optionsText`, component.optionsText, 'Option 1|value1|description', 4)}</label>` : ''}</div>`;
}


function setByPath(path, value) {
  const parts = String(path).split('.');
  let target = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (target[key] === undefined) return;
    target = target[key];
  }
  const last = parts.at(-1);
  target[/^\d+$/.test(last) ? Number(last) : last] = value;
}
function moveItem(array, from, to) {
  if (!Array.isArray(array) || from < 0 || from >= array.length || to < 0 || to >= array.length) return;
  const [item] = array.splice(from, 1);
  array.splice(to, 0, item);
}
function messageFromElement(el) {
  const card = el.closest('.message-card');
  if (!card) return null;
  return state.messages.find((m) => m.id === card.dataset.messageId) || null;
}
function messageIndex(message) { return state.messages.indexOf(message); }
function rerenderAfterStructureChange() { saveProjectDebounced(); renderMessages(); renderPreview(); }
function updatePreviewAfterInput() { saveProjectDebounced(); renderPreview(); }

function renderPreview() {
  $('previewChannel').textContent = selectedChannelName();
  const wrap = $('previewMessagesWrap');
  wrap.innerHTML = '';
  if (!state.messages.length) {
    wrap.innerHTML = '<div class="preview-empty">Nothing to preview.</div>';
    return;
  }
  for (const msg of state.messages) {
    wrap.appendChild(renderPreviewMessage(msg));
  }
}
function renderPreviewMessage(msg) {
  const row = document.createElement('div');
  row.className = 'discord-message';
  const avatar = msg.avatarUrl || state.bot?.avatarUrl || '';
  row.innerHTML = `<img class="avatar" src="${escapeHtml(avatar)}" alt=""><div class="msg-main"><div class="msg-head"><span class="username">${escapeHtml(msg.name || state.bot?.username || state.bot?.tag || 'Bot')}</span><span class="bot-tag">BOT</span><span class="time">Сегодня в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div><div class="msg-render"></div></div>`;
  const body = row.querySelector('.msg-render');
  if (msg.threadName) body.insertAdjacentHTML('beforeend', `<div class="small-muted">Ветка: ${escapeHtml(msg.threadName)}</div>`);
  if (msg.type === 'v2' || msg.useV2 || msg.v2?.enabled) renderPreviewV2(msg, body);
  else renderPreviewV1(msg, body);
  return row;
}
function renderPreviewV1(msg, body) {
  const content = document.createElement('div');
  content.className = `preview-content ${msg.content.trim() ? '' : 'empty'}`.trim();
  content.textContent = msg.content.trim() || ((msg.embeds.length || msg.buttons.length) ? '' : 'Пустое сообщение');
  body.appendChild(content);
  for (const embed of msg.embeds) body.appendChild(previewEmbed(embed));
  body.appendChild(previewButtons(msg.buttonsEnabled !== false ? msg.buttons : []));
}
function renderPreviewV2(msg, body) {
  const components = buildRawV2Components(msg);
  const container = document.createElement('div');
  container.className = 'v2-container';
  container.innerHTML = `<div class="v2-accent" style="background:${escapeHtml(normalizeColor(msg.v2?.accentColor || '#5865f2'))}"></div><div class="v2-inner"></div>`;
  const inner = container.querySelector('.v2-inner');
  if (!components.length) inner.insertAdjacentHTML('beforeend', '<div class="preview-content empty">Пустое V2 сообщение</div>');
  components.forEach((component) => previewRawComponent(component, inner));
  body.appendChild(container);
}
function previewRawComponent(component, target) {
  if (!component) return;
  if (component.type === 10) {
    const text = document.createElement('div'); text.className = 'preview-content'; text.textContent = component.content || ''; target.appendChild(text); return;
  }
  if (component.type === 9) {
    const section = document.createElement('div'); section.className = 'v2-section';
    const text = (component.components || []).map((c) => c.content || '').join('\n');
    section.innerHTML = `<div class="preview-content">${escapeHtml(text)}</div>`;
    if (component.accessory) {
      const acc = document.createElement('div');
      acc.className = component.accessory.type === 11 ? 'v2-media' : 'preview-button link';
      acc.textContent = component.accessory.type === 11 ? (component.accessory.media?.url || 'Thumbnail') : (component.accessory.label || (component.accessory.style === 5 ? 'Link' : 'Button'));
      section.appendChild(acc);
    }
    target.appendChild(section); return;
  }
  if (component.type === 12) {
    const box = document.createElement('div'); box.className = 'v2-media'; box.textContent = `Media Gallery (${(component.items || []).length})`; target.appendChild(box); return;
  }
  if (component.type === 13) {
    const box = document.createElement('div'); box.className = 'v2-media'; box.textContent = component.file?.url || 'File'; target.appendChild(box); return;
  }
  if (component.type === 14) {
    const sep = document.createElement('div'); sep.className = 'v2-separator'; sep.style.height = component.spacing === 2 ? '2px' : '1px'; if (component.divider === false) sep.style.background = 'transparent'; target.appendChild(sep); return;
  }
  if (component.type === 1) {
    const row = document.createElement('div'); row.className = 'preview-row';
    (component.components || []).forEach((c) => { const b = document.createElement('div'); b.className = 'preview-button link'; b.textContent = c.label || ({3:'Select',5:'User Select',6:'Role Select',7:'Mentionable Select',8:'Channel Select'}[c.type] || 'Button'); row.appendChild(b); });
    target.appendChild(row); return;
  }
  if (component.type === 17) {
    const ctn = document.createElement('div'); ctn.className = 'v2-container'; ctn.innerHTML = '<div class="v2-accent"></div><div class="v2-inner"></div>';
    if (component.accent_color) ctn.querySelector('.v2-accent').style.background = `#${component.accent_color.toString(16).padStart(6, '0')}`;
    (component.components || []).forEach((child) => previewRawComponent(child, ctn.querySelector('.v2-inner')));
    target.appendChild(ctn);
  }
}
function previewEmbed(embed) {
  const wrap = document.createElement('div');
  wrap.className = 'preview-embed';
  wrap.innerHTML = `<div class="embed-stripe" style="background:${escapeHtml(normalizeColor(embed.color || '#5865f2'))}"></div><div class="embed-inner"></div>`;
  const inner = wrap.querySelector('.embed-inner');
  if (embed.author?.name) inner.insertAdjacentHTML('beforeend', `<div class="embed-author">${escapeHtml(embed.author.name)}</div>`);
  if (embed.title) inner.insertAdjacentHTML('beforeend', `<div class="embed-title">${escapeHtml(embed.title)}</div>`);
  if (embed.description) inner.insertAdjacentHTML('beforeend', `<div class="embed-desc">${escapeHtml(embed.description)}</div>`);
  if (embed.fields?.length) {
    const fields = document.createElement('div');
    fields.className = 'embed-fields';
    for (const field of embed.fields) {
      const item = document.createElement('div');
      item.className = `embed-field ${field.inline ? '' : 'full'}`.trim();
      item.innerHTML = `<div class="embed-field-name">${escapeHtml(field.name || '\u200b')}</div><div class="embed-field-value">${escapeHtml(field.value || '\u200b')}</div>`;
      fields.appendChild(item);
    }
    inner.appendChild(fields);
  }
  const image = embed.image_url || '';
  const thumb = embed.thumbnail_url || '';
  if (image) inner.insertAdjacentHTML('beforeend', `<img class="embed-img" src="${escapeHtml(image)}" alt="embed image">`);
  else if (thumb) inner.insertAdjacentHTML('beforeend', `<img class="embed-img" src="${escapeHtml(thumb)}" alt="thumbnail">`);
  if (embed.footer?.text || embed.timestamp) inner.insertAdjacentHTML('beforeend', `<div class="embed-footer">${escapeHtml(embed.footer?.text || '')}${embed.timestamp ? ' • now' : ''}</div>`);
  return wrap;
}
function previewButtons(buttons) {
  const row = document.createElement('div');
  row.className = 'preview-row';
  for (const button of (buttons || []).filter((b) => b.enabled !== false && (b.label || b.url)).slice(0, LIMITS.buttons)) {
    const btn = document.createElement('div');
    btn.className = 'preview-button link';
    btn.textContent = `${button.emoji ? `${button.emoji} ` : ''}${button.label || 'Link'}`;
    row.appendChild(btn);
  }
  return row;
}

async function loadMe() {
  const data = await api('/api/health');
  state.bot = data.bot && typeof data.bot === 'object' ? data.bot : { tag: data.bot || 'Bot' };
  $('botTag').textContent = state.bot.tag || state.bot.username || 'Bot';
}
async function loadChannels() {
  const data = await api('/api/channels');
  if (Array.isArray(data.channels)) state.channels = data.channels;
  else if (Array.isArray(data.guilds)) state.channels = data.guilds.flatMap((guild) => (guild.channels || []).map((channel) => ({ ...channel, guildId: guild.id, guildName: guild.name, label: `${guild.name} / #${channel.name}` })));
  else state.channels = [];
  renderChannels();
}
async function bootstrap() {
  $('apiBaseInput').value = state.apiBase || '';
  $('passwordInput').value = state.apiKey || '';
  if (!state.apiBase && location.protocol !== 'file:' && location.hostname !== 'localhost' && !location.hostname.startsWith('127.')) {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    return;
  }
  if (!state.apiKey && state.apiBase) {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
    return;
  }
  try {
    await loadMe();
    await loadChannels();
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    const saved = loadSavedProject();
    applyProject(saved || { messages: [createMessage('v1')] });
    renderPreview();
  } catch (error) {
    $('loginError').textContent = error.message || String(error);
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
  }
}
async function login(event) {
  event.preventDefault();
  $('loginError').textContent = '';
  state.apiBase = $('apiBaseInput').value.trim().replace(/\/+$/, '');
  state.apiKey = $('passwordInput').value.trim();
  localStorage.setItem(STORE.apiBase, state.apiBase);
  localStorage.setItem(STORE.apiKey, state.apiKey);
  try {
    await loadMe();
    await loadChannels();
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    applyProject(loadSavedProject() || { messages: [createMessage('v1')] });
    setStatus('Подключено.');
  } catch (error) {
    $('loginError').textContent = error.message || String(error);
  }
}

function openAddMessageModal() {
  openModal('Добавить сообщение', `<div class="choice-grid">
    <div class="choice-card" data-choice="v1"><div class="choice-title"><span>Стандартное сообщение</span><span class="choice-badge">V1</span></div><div class="small-muted">Content, embeds и link-buttons. Это самая стабильная отправка.</div></div>
    <div class="choice-card" data-choice="v2"><div class="choice-title"><span>Сообщение с компонентами</span><span class="choice-badge">V2</span></div><div class="small-muted">Text, section, media, separator и link-buttons через Components V2.</div></div>
  </div>`, [{ label: 'Закрыть', run: closeModal }]);
  $$('[data-choice]').forEach((card) => card.addEventListener('click', () => {
    const msg = createMessage(card.dataset.choice === 'v2' ? 'v2' : 'v1');
    const activeIndex = state.messages.findIndex((item) => item.id === state.activeMessageId);
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : state.messages.length;
    state.messages.splice(insertAt, 0, msg);
    state.activeMessageId = msg.id;
    closeModal();
    rerenderAfterStructureChange();
    scrollToMessageCard(msg.id);
  }));
}
function openJsonModal() {
  openModal('JSON проекта', `<textarea id="jsonText" rows="18">${escapeHtml(JSON.stringify(projectData(), null, 2))}</textarea>`, [
    { label: 'Copy', className: 'primary', run: () => copyText($('jsonText').value, 'JSON copied') },
    { label: 'Apply', className: 'green', run: () => { try { applyProject(JSON.parse($('jsonText').value)); closeModal(); setStatus('JSON применён.'); } catch (e) { setStatus(`JSON error: ${e.message}`, false); } } },
    { label: 'Close', run: closeModal },
  ]);
}
function openBackupsModal() {
  const backups = readJson(STORE.backups, []);
  const list = backups.map((item) => `<div class="backup-item"><div><strong>${escapeHtml(item.name)}</strong><br><span class="small-muted">${new Date(item.at).toLocaleString('ru-RU')}</span></div><div class="inline-row"><button class="btn small secondary" data-load-backup="${item.id}">Load</button><button class="btn small danger" data-delete-backup="${item.id}">Delete</button></div></div>`).join('') || '<div class="empty-box">Бэкапов пока нет.</div>';
  openModal('Бэкапы', list, [
    { label: 'Сохранить текущий', className: 'primary', run: () => { const items = readJson(STORE.backups, []); items.unshift({ id: id('backup'), name: `Backup ${new Date().toLocaleString('ru-RU')}`, at: new Date().toISOString(), project: projectData() }); localStorage.setItem(STORE.backups, JSON.stringify(items.slice(0, 30))); openBackupsModal(); } },
    { label: 'Close', run: closeModal },
  ]);
  $$('[data-load-backup]').forEach((btn) => btn.addEventListener('click', () => { const found = readJson(STORE.backups, []).find((x) => x.id === btn.dataset.loadBackup); if (found) { applyProject(found.project); closeModal(); } }));
  $$('[data-delete-backup]').forEach((btn) => btn.addEventListener('click', () => { const items = readJson(STORE.backups, []).filter((x) => x.id !== btn.dataset.deleteBackup); localStorage.setItem(STORE.backups, JSON.stringify(items)); openBackupsModal(); }));
}
function openHistoryModal() {
  const items = readJson(STORE.history, []);
  const list = items.map((item, index) => `<div class="backup-item"><div><strong>${escapeHtml(item.type)} #${index + 1}</strong><br><span class="small-muted">${new Date(item.at).toLocaleString('ru-RU')} · ${escapeHtml(item.url || '')}</span></div><button class="btn small secondary" data-load-history="${index}">Load</button></div>`).join('') || '<div class="empty-box">История появится после отправки.</div>';
  openModal('История', list, [{ label: 'Close', run: closeModal }]);
  $$('[data-load-history]').forEach((btn) => btn.addEventListener('click', () => { const item = items[Number(btn.dataset.loadHistory)]; if (item?.project) { applyProject(item.project); closeModal(); } }));
}
async function loadExistingMessage() {
  if (!channelId()) return setStatus('Выбери канал.', false);
  const messageId = editMessageValue();
  if (!messageId) return setStatus('Вставь Message ID или ссылку.', false);
  try {
    const data = await api(`/api/message?channelId=${encodeURIComponent(channelId())}&messageId=${encodeURIComponent(messageId)}`);
    const msg = hydrateMessage(data.message || {});
    state.messages = [msg];
    state.activeMessageId = msg.id;
    saveProjectDebounced();
    renderMessages();
    renderPreview();
    setStatus('Сообщение загружено.');
  } catch (error) { setStatus(error.message, false); }
}

function handleInput(event) {
  const el = event.target.closest('[data-path]');
  if (!el) return;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'color') value = normalizeColor(value);
  if (/\.spacing$/.test(el.dataset.path)) value = Number(value);
  setByPath(el.dataset.path, value);
  updatePreviewAfterInput();
}
function handleClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (event.target.closest('[data-toggle-fold]')) {
    if (!actionEl) event.target.closest('[data-fold]')?.classList.toggle('collapsed');
  }
  if (event.target.closest('[data-toggle-mini]')) {
    if (!actionEl) event.target.closest('[data-mini]')?.classList.toggle('collapsed');
  }
  const cardHead = event.target.closest('[data-set-active]');
  if (cardHead && !actionEl) setActive(cardHead.closest('.message-card').dataset.messageId);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  const msg = messageFromElement(actionEl);
  if (!msg && !['add-message'].includes(actionEl.dataset.action)) return;
  const mi = msg ? messageIndex(msg) : -1;
  const action = actionEl.dataset.action;
  if (action === 'toggle-message') { msg.open = !msg.open; rerenderAfterStructureChange(); return; }
  if (action === 'move-message-up') { moveItem(state.messages, mi, mi - 1); rerenderAfterStructureChange(); return; }
  if (action === 'move-message-down') { moveItem(state.messages, mi, mi + 1); rerenderAfterStructureChange(); return; }
  if (action === 'duplicate-message') { const copy = hydrateMessage(clone(msg)); copy.id = id('msg'); state.messages.splice(mi + 1, 0, copy); state.activeMessageId = copy.id; rerenderAfterStructureChange(); return; }
  if (action === 'delete-message') { state.messages.splice(mi, 1); if (!state.messages.length) state.messages.push(createMessage('v1')); state.activeMessageId = state.messages[Math.max(0, mi - 1)]?.id || state.messages[0].id; rerenderAfterStructureChange(); return; }
  if (action === 'add-embed') { if (msg.embeds.length >= LIMITS.embeds) return setStatus('Максимум 10 embeds.', false); msg.embeds.push(createEmbed()); rerenderAfterStructureChange(); return; }
  if (action === 'add-button') { if (msg.buttons.length >= LIMITS.buttons) return setStatus('Максимум 25 кнопок.', false); msg.buttons.push(createButton()); rerenderAfterStructureChange(); return; }
  const ei = Number(actionEl.dataset.embedIndex);
  const fi = Number(actionEl.dataset.fieldIndex);
  const bi = Number(actionEl.dataset.buttonIndex);
  const vi = Number(actionEl.dataset.blockIndex);
  if (action === 'delete-embed') msg.embeds.splice(ei, 1);
  if (action === 'duplicate-embed') msg.embeds.splice(ei + 1, 0, hydrateMessage({ embeds: [clone(msg.embeds[ei])] }).embeds[0]);
  if (action === 'move-embed-up') moveItem(msg.embeds, ei, ei - 1);
  if (action === 'move-embed-down') moveItem(msg.embeds, ei, ei + 1);
  if (action === 'add-field') { if (msg.embeds[ei].fields.length >= LIMITS.fields) return setStatus('Максимум 25 полей.', false); msg.embeds[ei].fields.push(createField()); }
  if (action === 'delete-field') msg.embeds[ei].fields.splice(fi, 1);
  if (action === 'move-field-up') moveItem(msg.embeds[ei].fields, fi, fi - 1);
  if (action === 'move-field-down') moveItem(msg.embeds[ei].fields, fi, fi + 1);
  if (action === 'delete-button') msg.buttons.splice(bi, 1);
  if (action === 'move-button-up') moveItem(msg.buttons, bi, bi - 1);
  if (action === 'move-button-down') moveItem(msg.buttons, bi, bi + 1);
  if (action === 'add-v2-block') {
    showMenu(actionEl, [
      { label: 'T Содержимое', run: () => { msg.v2.blocks.push(createV2Block('text')); rerenderAfterStructureChange(); } },
      { label: '▣ Section', run: () => { msg.v2.blocks.push(createV2Block('section')); rerenderAfterStructureChange(); } },
      { label: '⊞ Container', run: () => { msg.v2.blocks.push(createV2Block('container')); rerenderAfterStructureChange(); } },
      { label: '🖼 Media Gallery', run: () => { msg.v2.blocks.push(createV2Block('media')); rerenderAfterStructureChange(); } },
      { label: '📎 File', run: () => { msg.v2.blocks.push(createV2Block('file')); rerenderAfterStructureChange(); } },
      { label: '— Separator', run: () => { msg.v2.blocks.push(createV2Block('separator')); rerenderAfterStructureChange(); } },
      { label: '☰ Action Row', run: () => { msg.v2.blocks.push(createV2Block('row')); rerenderAfterStructureChange(); } },
    ]);
    return;
  }
  const parentIndex = actionEl.dataset.parentBlockIndex === undefined ? null : Number(actionEl.dataset.parentBlockIndex);
  const blockList = parentIndex === null ? msg.v2.blocks : (msg.v2.blocks[parentIndex]?.blocks || []);
  const block = blockList[vi];
  if (action === 'delete-v2') blockList.splice(vi, 1);
  if (action === 'duplicate-v2') blockList.splice(vi + 1, 0, { ...clone(blockList[vi]), id: id('block') });
  if (action === 'move-v2-up') moveItem(blockList, vi, vi - 1);
  if (action === 'move-v2-down') moveItem(blockList, vi, vi + 1);
  if (action === 'add-media-item' && block?.type === 'media') block.items.push({ id: id('media'), url: '', description: '' });
  if (action === 'delete-media-item' && block?.type === 'media') block.items.splice(Number(actionEl.dataset.itemIndex), 1);
  if (action === 'add-row-component' && block?.type === 'row') {
    showMenu(actionEl, [
      { label: 'Кнопка', run: () => { block.components.push(createV2Component('button')); rerenderAfterStructureChange(); } },
      { label: 'Кнопка с ссылкой', run: () => { block.components.push(createV2Component('link')); rerenderAfterStructureChange(); } },
      { label: 'Меню выбора', run: () => { block.components.push(createV2Component('select')); rerenderAfterStructureChange(); } },
      { label: 'User Select', run: () => { block.components.push(createV2Component('userSelect')); rerenderAfterStructureChange(); } },
      { label: 'Role Select', run: () => { block.components.push(createV2Component('roleSelect')); rerenderAfterStructureChange(); } },
      { label: 'Mentionable Select', run: () => { block.components.push(createV2Component('mentionableSelect')); rerenderAfterStructureChange(); } },
      { label: 'Channel Select', run: () => { block.components.push(createV2Component('channelSelect')); rerenderAfterStructureChange(); } },
    ]);
    return;
  }
  if (action === 'delete-row-component' && block?.type === 'row') block.components.splice(Number(actionEl.dataset.componentIndex), 1);
  if (action === 'add-container-block' && block?.type === 'container') {
    showMenu(actionEl, [
      { label: 'T Содержимое', run: () => { block.blocks.push(createV2Block('text')); rerenderAfterStructureChange(); } },
      { label: '▣ Section', run: () => { block.blocks.push(createV2Block('section')); rerenderAfterStructureChange(); } },
      { label: '🖼 Media Gallery', run: () => { block.blocks.push(createV2Block('media')); rerenderAfterStructureChange(); } },
      { label: '📎 File', run: () => { block.blocks.push(createV2Block('file')); rerenderAfterStructureChange(); } },
      { label: '— Separator', run: () => { block.blocks.push(createV2Block('separator')); rerenderAfterStructureChange(); } },
      { label: '☰ Action Row', run: () => { block.blocks.push(createV2Block('row')); rerenderAfterStructureChange(); } },
    ]);
    return;
  }
  rerenderAfterStructureChange();
}
function toggleSendMenu(event) {
  event.stopPropagation();
  const menu = $('sendDropdown');
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.min(Math.max(8, rect.right - 240), window.innerWidth - 250)}px`;
  menu.classList.toggle('show');
}
function bind() {
  $('loginForm').addEventListener('submit', login);
  $('addMessageBtn').addEventListener('click', openAddMessageModal);
  $('settingsBtn').addEventListener('click', () => $('targetSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('jsonBtn').addEventListener('click', openJsonModal);
  $('backupsBtn').addEventListener('click', openBackupsModal);
  $('historyBtn').addEventListener('click', openHistoryModal);
  $('shareBtn').addEventListener('click', () => copyText(JSON.stringify(projectData(), null, 2), 'Проект скопирован.'));
  $('resetBtn').addEventListener('click', () => { if (confirm('Очистить проект?')) applyProject({ messages: [createMessage('v1')] }); });
  $('sendBtn').addEventListener('click', sendActiveOrEdit);
  $('sendMenuBtn').addEventListener('click', toggleSendMenu);
  $('sendDropdown').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-send-action]');
    if (!btn) return;
    closeMenus();
    if (btn.dataset.sendAction === 'send-active') sendActiveOrEdit();
    if (btn.dataset.sendAction === 'send-all') sendAll();
    if (btn.dataset.sendAction === 'copy-payload') copyText(JSON.stringify({ channelId: channelId(), message: toApiMessage(activeMessage()) }, null, 2), 'Payload copied.');
    if (btn.dataset.sendAction === 'download-project') downloadText(`lds-project-${Date.now()}.json`, JSON.stringify(projectData(), null, 2));
  });
  $('refreshChannelsBtn').addEventListener('click', () => loadChannels().then(() => { renderPreview(); setStatus('Каналы обновлены.'); }).catch((e) => setStatus(e.message, false)));
  $('loadMessageBtn').addEventListener('click', loadExistingMessage);
  $('channelSelect').addEventListener('change', () => { saveProjectDebounced(); renderPreview(); });
  $('editMessageInput').addEventListener('input', saveProjectDebounced);
  $('previewBtn').addEventListener('click', () => $('appView').classList.add('preview-mode'));
  $('editorBtn').addEventListener('click', () => $('appView').classList.remove('preview-mode'));
  $('refreshPreview').addEventListener('click', renderPreview);
  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeModal(); });
  $('messageList').addEventListener('input', handleInput);
  $('messageList').addEventListener('change', handleInput);
  $('messageList').addEventListener('click', handleClick);
  document.addEventListener('click', (event) => { if (!event.target.closest('.dropdown') && !event.target.closest('#sendMenuBtn')) closeMenus(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeMenus(); closeModal(); } });
}

bind();
bootstrap();
