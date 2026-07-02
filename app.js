const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const BACKUP_KEY = 'lds_black_panel_backups_v2';
const HISTORY_KEY = 'lds_black_panel_history_v2';
const TEMPLATE_KEY = 'lds_black_panel_templates_v2';

const state = {
  bot: null,
  guilds: [],
  messages: [],
  activeMessageId: null,
  apiBase: localStorage.getItem('lds_api_base') || (location.protocol === 'file:' ? 'http://localhost:13579' : ''),
  apiKey: localStorage.getItem('lds_api_key') || '',
  authMode: localStorage.getItem('lds_auth_mode') || '',
};

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}
function notify(text, kind = '') {
  if (!text) return;
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`.trim();
  toast.textContent = text;
  $('toastWrap').appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
function setStatus(text = '', good = true) {
  const el = $('statusLine');
  el.textContent = text;
  el.className = `status ${text ? (good ? 'ok' : 'bad') : ''}`.trim();
  if (text) notify(text, good ? 'good' : 'bad');
}
function isAppsScriptProxy(base = state.apiBase) {
  const value = String(base || '').toLowerCase();
  return value.includes('script.google.com/macros/') || value.includes('script.googleusercontent.com/macros/') || value.includes('/macros/s/');
}
function splitApiPath(path) {
  const raw = String(path || 'health');
  const [cleanPath, queryString = ''] = raw.split('?');
  const apiPath = cleanPath.replace(/^\/+/, '').replace(/^api\//i, '') || 'health';
  const params = new URLSearchParams(queryString);
  return { apiPath, params };
}
function apiUrl(path) {
  const baseRaw = String(state.apiBase || '').trim();
  const base = baseRaw.replace(/\/$/, '');
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
  const gasMode = isAppsScriptProxy();
  const method = String(options.method || 'GET').toUpperCase();
  const headers = gasMode
    ? (method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : {})
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (!gasMode && state.apiKey) {
    headers['X-Web-Api-Key'] = state.apiKey;
    headers.Authorization = `Bearer ${state.apiKey}`;
  }
  const response = await fetch(apiUrl(path), {
    credentials: state.apiBase ? 'omit' : 'same-origin',
    ...options,
    headers,
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch {
    const sample = raw.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(sample ? `Bad response: ${sample}` : `Bad response: HTTP ${response.status}`);
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function createEmbed() {
  return {
    id: uid('embed'),
    open: true,
    authorName: '', authorIcon: '', authorUrl: '',
    title: '', url: '', color: '#5865f2', description: '',
    fields: [], image: '', thumbnail: '',
    footerText: '', footerIcon: '', timestamp: false,
  };
}
function createField() {
  return { id: uid('field'), name: '', value: '', inline: false };
}
function createV1Row() {
  return { id: uid('row'), open: true, items: [] };
}
function createV1Message() {
  return {
    id: uid('msg'),
    type: 'v1',
    open: true,
    title: '',
    content: '',
    threadName: '',
    threadId: '',
    profileName: '',
    profileAvatar: '',
    files: [],
    embeds: [],
    rows: [],
    pings: { users: true, roles: true },
  };
}
function createV2Message() {
  return {
    id: uid('msg'),
    type: 'v2',
    open: true,
    threadName: '',
    threadId: '',
    profileName: '',
    profileAvatar: '',
    files: [],
    parts: [],
    pings: { users: true, roles: true },
  };
}
function createContentPart() {
  return { id: uid('part'), type: 'content', open: true, text: '', accessory: null };
}
function createContainerPart() {
  return { id: uid('part'), type: 'container', open: true, embeds: [createEmbed()], parts: [] };
}
function createMediaGalleryPart() {
  return { id: uid('part'), type: 'media', open: true, urls: [''] };
}
function createFilePart() {
  return { id: uid('part'), type: 'file', open: true, filename: '', url: '' };
}
function createSeparatorPart() {
  return { id: uid('part'), type: 'separator', open: true, spacing: 'small', divider: true };
}
function createRowPart() {
  return { id: uid('part'), type: 'row', open: true, items: [] };
}
function createComponent(type) {
  return {
    id: uid('cmp'), type,
    label: '', url: '', placeholder: '', customId: '',
  };
}
function currentMessage() {
  return state.messages.find((m) => m.id === state.activeMessageId) || state.messages[0] || null;
}
function prettyComponentType(type) {
  return {
    button: 'Кнопка',
    link: 'Кнопка с Ссылкой',
    select: 'Меню Выбора',
    userSelect: 'Меню Выбора Пользователей',
    roleSelect: 'Меню Выбора Ролей',
    mentionableSelect: 'Меню Выбора Пользователей и Ролей',
    channelSelect: 'Меню Выбора Каналов',
  }[type] || type;
}

function cloneEmbedDeep(embed) {
  const c = structuredClone(embed);
  c.id = uid('embed');
  c.fields = (c.fields || []).map((f) => ({ ...f, id: uid('field') }));
  return c;
}
function cloneRowDeep(row) {
  const c = structuredClone(row);
  c.id = uid('row');
  c.items = (c.items || []).map((i) => ({ ...i, id: uid('cmp') }));
  return c;
}
function clonePartDeep(part) {
  const c = structuredClone(part);
  c.id = uid('part');
  if (c.type === 'container') {
    c.embeds = (c.embeds || []).map(cloneEmbedDeep);
    c.parts = (c.parts || []).map(clonePartDeep);
  }
  if (c.type === 'row') {
    c.items = (c.items || []).map((i) => ({ ...i, id: uid('cmp') }));
  }
  if (c.type === 'content' && c.accessory) c.accessory = { ...c.accessory, id: uid('cmp') };
  return c;
}
function cloneMessageDeep(message) {
  const c = structuredClone(message);
  c.id = uid('msg');
  c.files = (c.files || []).map((f) => ({ ...f }));
  if (c.type === 'v1') {
    c.embeds = (c.embeds || []).map(cloneEmbedDeep);
    c.rows = (c.rows || []).map(cloneRowDeep);
  } else {
    c.parts = (c.parts || []).map(clonePartDeep);
  }
  return c;
}

function prettyPartType(type) {
  return {
    content: 'Содержимое',
    container: 'Container',
    media: 'Media Gallery',
    file: 'Файл',
    separator: 'Разделитель',
    row: 'Строка',
  }[type] || type;
}

function renderAll() {
  if (!state.messages.length) {
    const msg = createV1Message();
    state.messages = [msg];
    state.activeMessageId = msg.id;
  }
  renderMessages();
  renderPreview();
}

function renderMessages() {
  const wrap = $('messageList');
  wrap.innerHTML = '';
  state.messages.forEach((message, index) => {
    const card = document.createElement('div');
    card.className = `message-card ${message.open ? '' : 'collapsed'}`.trim();
    card.dataset.messageId = message.id;

    const header = document.createElement('div');
    header.className = 'message-header';
    const left = document.createElement('div');
    left.className = 'message-left';
    left.innerHTML = `<span class="chev">⌄</span><span>Сообщение ${index + 1}</span>${message.type === 'v2' ? '<span class="pill-type">V2</span>' : ''}`;
    const tools = document.createElement('div');
    tools.className = 'message-tools';
    tools.innerHTML = `
      <button class="icon-btn" data-action="editMessage" title="Выбрать">✎</button>
      <button class="icon-btn" data-action="duplicateMessage" title="Дублировать">⧉</button>
      <button class="icon-btn" data-action="deleteMessage" title="Удалить">🗑</button>
    `;
    header.append(left, tools);
    header.addEventListener('click', (event) => {
      if (event.target.closest('.icon-btn')) return;
      message.open = !message.open;
      state.activeMessageId = message.id;
      renderAll();
    });

    const body = document.createElement('div');
    body.className = 'message-body';

    if (message.type === 'v1') body.appendChild(renderV1Message(message, index));
    else body.appendChild(renderV2Message(message, index));

    card.append(header, body);
    wrap.appendChild(card);
  });
}

function renderV1Message(message, index) {
  const root = document.createElement('div');
  root.className = 'message-v1';

  const contentSection = document.createElement('div');
  contentSection.className = 'message-pad';
  contentSection.innerHTML = `
    <div class="counter-line">Содержимое <span>${message.content.length}/2000</span></div>
    <textarea data-bind="content" data-message-id="${message.id}" placeholder="Введите содержимое сообщения"></textarea>
    <div class="switch-row" style="margin-top:10px">
      ${switchMarkup(`pingUsers_${message.id}`, 'Пинги пользователей', message.pings.users)}
      ${switchMarkup(`pingRoles_${message.id}`, 'Пинги ролей', message.pings.roles)}
    </div>
  `;
  contentSection.querySelector('textarea').value = message.content;

  const subs = document.createElement('div');
  subs.className = 'subsection-list';
  subs.append(
    createFoldSection('Ветка', `
      <div class="help-line">Вебхук могут создавать и использовать ветки. <a href="#">Как мне использовать это?</a></div>
      <label class="fieldline">Название Ветки Форума <span class="small-note">${message.threadName.length}/100</span><input data-bind="threadName" data-message-id="${message.id}" maxlength="100"></label>
      <label class="fieldline">ID Ветки <span class="small-note">${message.threadId.length}/30</span><input data-bind="threadId" data-message-id="${message.id}" maxlength="30"></label>
    `),
    createFoldSection('Профиль', `
      <label class="fieldline">Имя <span class="small-note">${message.profileName.length}/80</span><input data-bind="profileName" data-message-id="${message.id}" maxlength="80"></label>
      <label class="fieldline">Ссылка на Аватар<input data-bind="profileAvatar" data-message-id="${message.id}"></label>
    `),
    createFoldSection(`Файлы (${message.files.length}/10)`, `
      <div class="controls-row"><button class="btn primary small" data-action="addMockFile" data-message-id="${message.id}">Добавить Файл</button><button class="btn secondary small" data-action="pasteFile" data-message-id="${message.id}">Вставить Файл</button></div>
      <div class="help-line">Characters: 0/4000</div>
      ${(message.files || []).map((file, i) => `<div class="field-card"><div class="field-card-top"><strong>${escapeHtml(file.name || `file_${i+1}.png`)}</strong><button class="btn danger small" data-action="removeFile" data-message-id="${message.id}" data-index="${i}">Удалить</button></div><label>URL файла<input data-file-bind="url" data-message-id="${message.id}" data-index="${i}" value="${escapeHtml(file.url || '')}"></label></div>`).join('')}
    `)
  );

  const embedList = document.createElement('div');
  message.embeds.forEach((embed, embedIndex) => embedList.appendChild(renderEmbedCard(message, embed, embedIndex)));
  const rowList = document.createElement('div');
  message.rows.forEach((row, rowIndex) => rowList.appendChild(renderRowCard(message, row, rowIndex, false)));

  const footer = document.createElement('div');
  footer.className = 'card-footer-row';
  footer.innerHTML = `
    <button class="btn primary" data-action="addV1" data-message-id="${message.id}">Добавить ⌄</button>
    <button class="btn secondary" data-action="setLink" data-message-id="${message.id}">Set Link</button>
    <button class="btn secondary" data-action="messageOptions" data-message-id="${message.id}">Опции ⌄</button>
  `;

  root.append(contentSection, subs, embedList, rowList, footer);
  return root;
}

function renderV2Message(message, index) {
  const root = document.createElement('div');
  root.className = 'message-v2';

  const subs = document.createElement('div');
  subs.className = 'subsection-list';
  subs.append(
    createFoldSection('Ветка', `
      <div class="help-line">Вебхук могут создавать и использовать ветки. <a href="#">Как мне использовать это?</a></div>
      <label class="fieldline">Название Ветки Форума <span class="small-note">${message.threadName.length}/100</span><input data-bind="threadName" data-message-id="${message.id}" maxlength="100"></label>
      <label class="fieldline">ID Ветки <span class="small-note">${message.threadId.length}/30</span><input data-bind="threadId" data-message-id="${message.id}" maxlength="30"></label>
    `),
    createFoldSection('Профиль', `
      <label class="fieldline">Имя <span class="small-note">${message.profileName.length}/80</span><input data-bind="profileName" data-message-id="${message.id}" maxlength="80"></label>
      <label class="fieldline">Ссылка на Аватар<input data-bind="profileAvatar" data-message-id="${message.id}"></label>
    `),
    createFoldSection(`Файлы (${message.files.length}/10)`, `<div class="controls-row"><button class="btn primary small" data-action="addMockFile" data-message-id="${message.id}">Добавить Файл</button></div>`) 
  );

  const partList = document.createElement('div');
  (message.parts || []).forEach((part, partIndex) => partList.appendChild(renderV2PartCard(message, part, partIndex)));

  const footer = document.createElement('div');
  footer.className = 'card-footer-row';
  footer.innerHTML = `
    <button class="btn primary" data-action="addV2" data-message-id="${message.id}">Добавить ⌄</button>
    <button class="btn secondary" data-action="setLink" data-message-id="${message.id}">Set Link</button>
    <button class="btn secondary" data-action="messageOptions" data-message-id="${message.id}">Опции ⌄</button>
  `;

  root.append(subs, partList, footer);
  return root;
}

function switchMarkup(id, label, checked) {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="switch-track"></span><span>${label}</span></label>`;
}
function createFoldSection(title, innerHtml) {
  const section = document.createElement('div');
  section.className = 'message-section collapsed';
  section.innerHTML = `
    <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>${title}</strong></div></div>
    <div class="section-body">${innerHtml}</div>
  `;
  section.querySelector('.section-head').addEventListener('click', () => section.classList.toggle('collapsed'));
  return section;
}

function renderEmbedCard(message, embed, embedIndex) {
  const card = document.createElement('div');
  card.className = `embed-card ${embed.open ? '' : 'collapsed'}`.trim();
  card.dataset.embedId = embed.id;
  card.innerHTML = `
    <div class="embed-head">
      <div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Embed ${embedIndex + 1}</strong></div>
      <div class="embed-tools">
        <button class="icon-btn" data-action="duplicateEmbed" data-message-id="${message.id}" data-embed-id="${embed.id}">⧉</button>
        <button class="icon-btn" data-action="deleteEmbed" data-message-id="${message.id}" data-embed-id="${embed.id}">🗑</button>
      </div>
    </div>
    <div class="embed-body">
      <div class="warning-box">Должен содержать текст или вложения</div>
      <div class="section-card collapsed">
        <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Автор</strong></div><div class="meta">Имя 0/256</div></div>
        <div class="section-body input-grid-2">
          <label>Имя<input data-embed-bind="authorName" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.authorName)}"></label>
          <label>Icon<input data-embed-bind="authorIcon" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.authorIcon)}"></label>
          <label style="grid-column:1/-1">URL<input data-embed-bind="authorUrl" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.authorUrl)}"></label>
        </div>
      </div>
      <div class="section-card">
        <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Тело</strong></div><div class="meta">Заголовок ${embed.title.length}/256</div></div>
        <div class="section-body">
          <div class="input-grid-3">
            <label>Заголовок<input data-embed-bind="title" data-message-id="${message.id}" data-embed-id="${embed.id}" maxlength="256" value="${escapeHtml(embed.title)}"></label>
            <label>URL<input data-embed-bind="url" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.url)}"></label>
            <label>Цвет<input type="color" data-embed-bind="color" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.color || '#5865f2')}"></label>
          </div>
          <label style="margin-top:10px">Описание ${embed.description.length}/4096<textarea data-embed-bind="description" data-message-id="${message.id}" data-embed-id="${embed.id}" rows="5">${escapeHtml(embed.description)}</textarea></label>
        </div>
      </div>
      <div class="section-card collapsed">
        <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Поля</strong></div><button class="btn primary small" data-action="addField" data-message-id="${message.id}" data-embed-id="${embed.id}">Добавить Поле</button></div>
        <div class="section-body"></div>
      </div>
      <div class="section-card collapsed">
        <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Изображения</strong></div></div>
        <div class="section-body input-grid-2">
          <label>Ссылка на основное изображение<input data-embed-bind="image" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.image)}"></label>
          <label>Ссылка на Миниатюру<input data-embed-bind="thumbnail" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.thumbnail)}"></label>
        </div>
      </div>
      <div class="section-card collapsed">
        <div class="section-head"><div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Футер</strong></div><div class="meta">Текст ${embed.footerText.length}/2048</div></div>
        <div class="section-body input-grid-2">
          <label>Текст<input data-embed-bind="footerText" data-message-id="${message.id}" data-embed-id="${embed.id}" maxlength="2048" value="${escapeHtml(embed.footerText)}"></label>
          <label>Icon<input data-embed-bind="footerIcon" data-message-id="${message.id}" data-embed-id="${embed.id}" value="${escapeHtml(embed.footerIcon)}"></label>
          <div style="grid-column:1/-1">${switchMarkup(`timestamp_${embed.id}`, 'Дата', embed.timestamp)}</div>
        </div>
      </div>
    </div>
  `;
  card.querySelector('.embed-head').addEventListener('click', (event) => {
    if (event.target.closest('.icon-btn') || event.target.closest('.btn')) return;
    embed.open = !embed.open; renderAll();
  });
  card.querySelectorAll('.section-card .section-head').forEach((head) => {
    head.addEventListener('click', (event) => {
      if (event.target.closest('.btn')) return;
      head.parentElement.classList.toggle('collapsed');
    });
  });
  const fieldsBody = card.querySelectorAll('.section-card .section-body')[1];
  embed.fields.forEach((field, i) => {
    const fieldCard = document.createElement('div');
    fieldCard.className = 'field-card';
    fieldCard.innerHTML = `
      <div class="field-card-top"><span class="mini-title">Поле ${i + 1}</span><button class="btn danger small" data-action="deleteField" data-message-id="${message.id}" data-embed-id="${embed.id}" data-field-id="${field.id}">Удалить</button></div>
      <div class="field-grid">
        <label>Имя<input data-field-bind="name" data-message-id="${message.id}" data-embed-id="${embed.id}" data-field-id="${field.id}" maxlength="256" value="${escapeHtml(field.name)}"></label>
        <label>Значение<input data-field-bind="value" data-message-id="${message.id}" data-embed-id="${embed.id}" data-field-id="${field.id}" maxlength="1024" value="${escapeHtml(field.value)}"></label>
        ${switchMarkup(`inline_${field.id}`, 'Inline', field.inline)}
      </div>
    `;
    fieldsBody.appendChild(fieldCard);
  });
  return card;
}

function renderRowCard(message, row, rowIndex, isV2, parentPart = null) {
  const card = document.createElement('div');
  card.className = `row-card ${row.open ? '' : 'collapsed'}`.trim();
  card.innerHTML = `
    <div class="row-head">
      <div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>Строка ${rowIndex + 1}</strong></div>
      <div class="row-tools">
        <button class="icon-btn" data-action="duplicateRow" data-message-id="${message.id}" data-row-id="${row.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''}>⧉</button>
        <button class="icon-btn" data-action="deleteRow" data-message-id="${message.id}" data-row-id="${row.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''}>🗑</button>
      </div>
    </div>
    <div class="row-body">
      ${row.items.length ? '' : '<div class="warning-box">Должен содержать как минимум один компонент (кнопку/выбор)</div>'}
      <div class="controls-row" style="margin-bottom:10px"><button class="btn primary" data-action="addRowComponent" data-message-id="${message.id}" data-row-id="${row.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''}>Добавить Компонент ⌄</button></div>
    </div>
  `;
  card.querySelector('.row-head').addEventListener('click', (event) => {
    if (event.target.closest('.icon-btn') || event.target.closest('.btn')) return;
    row.open = !row.open; renderAll();
  });
  const body = card.querySelector('.row-body');
  row.items.forEach((item) => body.appendChild(renderComponentItem(message, row, item, isV2, parentPart)));
  return card;
}

function renderComponentItem(message, row, item, isV2, parentPart) {
  const box = document.createElement('div');
  box.className = 'field-card';
  const isLink = item.type === 'link';
  const placeholderLabel = ['select','userSelect','roleSelect','mentionableSelect','channelSelect'].includes(item.type) ? 'Placeholder' : 'Custom ID';
  box.innerHTML = `
    <div class="field-card-top"><span class="mini-title">${prettyComponentType(item.type)}</span><button class="btn danger small" data-action="deleteComponent" data-message-id="${message.id}" data-row-id="${row.id}" data-component-id="${item.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''}>Удалить</button></div>
    <div class="field-grid">
      <label>Label<input data-component-bind="label" data-message-id="${message.id}" data-row-id="${row.id}" data-component-id="${item.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''} value="${escapeHtml(item.label)}"></label>
      ${isLink ? `<label>URL<input data-component-bind="url" data-message-id="${message.id}" data-row-id="${row.id}" data-component-id="${item.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''} value="${escapeHtml(item.url)}"></label>` : `<label>${placeholderLabel}<input data-component-bind="customId" data-message-id="${message.id}" data-row-id="${row.id}" data-component-id="${item.id}" data-v2="${isV2 ? '1' : '0'}" ${parentPart ? `data-part-id="${parentPart.id}"` : ''} value="${escapeHtml(item.customId || item.placeholder || '')}"></label>`}
    </div>
  `;
  return box;
}

function renderV2PartCard(message, part, partIndex) {
  const card = document.createElement('div');
  card.className = `part-card ${part.open ? '' : 'collapsed'}`.trim();
  const label = `${prettyPartType(part.type)} ${partIndex + 1}`;
  card.innerHTML = `
    <div class="part-head">
      <div style="display:flex;align-items:center;gap:8px"><span class="chev">⌄</span><strong>${label}</strong></div>
      <div class="part-tools">
        <button class="icon-btn" data-action="duplicatePart" data-message-id="${message.id}" data-part-id="${part.id}">⧉</button>
        <button class="icon-btn" data-action="deletePart" data-message-id="${message.id}" data-part-id="${part.id}">🗑</button>
      </div>
    </div>
    <div class="part-body"></div>
  `;
  card.querySelector('.part-head').addEventListener('click', (event) => {
    if (event.target.closest('.icon-btn') || event.target.closest('.btn')) return;
    part.open = !part.open; renderAll();
  });
  const body = card.querySelector('.part-body');

  if (part.type === 'content') {
    body.innerHTML = `
      <div class="counter-line">Содержимое <span>${part.text.length}/4000</span></div>
      <textarea data-v2-bind="text" data-message-id="${message.id}" data-part-id="${part.id}" rows="4" placeholder="Введите текст блока">${escapeHtml(part.text)}</textarea>
      <div class="help-line" style="margin-top:8px">Accessory</div>
      <div class="controls-row"><button class="btn primary small" data-action="addAccessory" data-message-id="${message.id}" data-part-id="${part.id}">Add Accessory ⌄</button></div>
    `;
    if (part.accessory) {
      const acc = document.createElement('div');
      acc.className = 'field-card';
      acc.innerHTML = `
        <div class="field-card-top"><span class="mini-title">${prettyComponentType(part.accessory.type)}</span><button class="btn danger small" data-action="removeAccessory" data-message-id="${message.id}" data-part-id="${part.id}">Удалить</button></div>
        <label>Label<input data-accessory-bind="label" data-message-id="${message.id}" data-part-id="${part.id}" value="${escapeHtml(part.accessory.label || '')}"></label>
        ${part.accessory.type === 'link' ? `<label>URL<input data-accessory-bind="url" data-message-id="${message.id}" data-part-id="${part.id}" value="${escapeHtml(part.accessory.url || '')}"></label>` : ''}
      `;
      body.appendChild(acc);
    }
  }
  if (part.type === 'container') {
    const embedWrap = document.createElement('div');
    part.embeds.forEach((embed, idx) => embedWrap.appendChild(renderEmbedCard(message, embed, idx)));
    body.appendChild(embedWrap);
    const rows = document.createElement('div');
    (part.parts || []).forEach((sub, idx) => {
      if (sub.type === 'row') rows.appendChild(renderRowCard(message, sub, idx, true, part));
      if (sub.type === 'content') rows.appendChild(renderV2PartCard(message, sub, idx));
    });
    body.appendChild(rows);
    const controls = document.createElement('div');
    controls.className = 'controls-row';
    controls.innerHTML = `<button class="btn primary small" data-action="addContainerThing" data-message-id="${message.id}" data-part-id="${part.id}">Добавить ⌄</button>`;
    body.appendChild(controls);
  }
  if (part.type === 'media') {
    body.innerHTML = `<div class="help-line">Ссылки на медиа</div>`;
    part.urls.forEach((url, i) => {
      const el = document.createElement('label');
      el.className = 'fieldline';
      el.innerHTML = `Media URL ${i + 1}<input data-media-bind="url" data-message-id="${message.id}" data-part-id="${part.id}" data-index="${i}" value="${escapeHtml(url)}">`;
      body.appendChild(el);
    });
    const add = document.createElement('button'); add.className = 'btn primary small'; add.textContent = 'Добавить Media'; add.dataset.action = 'addMediaUrl'; add.dataset.messageId = message.id; add.dataset.partId = part.id; body.appendChild(add);
  }
  if (part.type === 'file') {
    body.innerHTML = `
      <label class="fieldline">Имя файла<input data-filepart-bind="filename" data-message-id="${message.id}" data-part-id="${part.id}" value="${escapeHtml(part.filename)}"></label>
      <label class="fieldline">Ссылка на файл<input data-filepart-bind="url" data-message-id="${message.id}" data-part-id="${part.id}" value="${escapeHtml(part.url)}"></label>
    `;
  }
  if (part.type === 'separator') {
    body.innerHTML = `
      <div class="switch-row">${switchMarkup(`divider_${part.id}`, 'Divider', part.divider)}</div>
      <label class="fieldline">Spacing<select data-separator-bind="spacing" data-message-id="${message.id}" data-part-id="${part.id}"><option value="small">small</option><option value="large">large</option></select></label>
    `;
    body.querySelector('select').value = part.spacing;
  }
  if (part.type === 'row') {
    return renderRowCard(message, part, partIndex, true, null);
  }
  return card;
}

function buildProject() {
  return {
    channelId: $('channelSelect').value || '',
    editMessage: $('editMessageInput').value || '',
    messages: state.messages,
    activeMessageId: state.activeMessageId,
  };
}
function applyProject(project = {}) {
  $('editMessageInput').value = project.editMessage || '';
  if (project.channelId) $('channelSelect').value = project.channelId;
  state.messages = Array.isArray(project.messages) && project.messages.length ? project.messages : [createV1Message()];
  state.activeMessageId = project.activeMessageId || state.messages[0].id;
  renderAll();
}
function buildSendPayload(message) {
  if (!message) return { channelId: '', content: '', embeds: [], buttons: [] };
  const linkButtons = [];
  const pullRows = (rows = []) => rows.forEach((row) => (row.items || []).forEach((item) => { if (item.type === 'link' && item.label && item.url) linkButtons.push({ label: item.label, url: item.url }); }));
  if (message.type === 'v1') {
    pullRows(message.rows);
    return {
      channelId: $('channelSelect').value,
      editMessage: $('editMessageInput').value,
      content: message.content || '',
      pings: message.pings || { users: true, roles: true },
      embeds: (message.embeds || []).map(packEmbed),
      buttons: linkButtons,
    };
  }
  let content = '';
  const embeds = [];
  (message.parts || []).forEach((part) => {
    if (part.type === 'content') content += `${part.text || ''}\n`;
    if (part.type === 'container') {
      (part.embeds || []).forEach((embed) => embeds.push(packEmbed(embed)));
      pullRows((part.parts || []).filter((x) => x.type === 'row'));
    }
    if (part.type === 'row') pullRows([part]);
  });
  return {
    channelId: $('channelSelect').value,
    editMessage: $('editMessageInput').value,
    content: content.trim(),
    pings: message.pings || { users: true, roles: true },
    embeds,
    buttons: linkButtons,
  };
}
function packEmbed(embed) {
  return {
    title: embed.title || '',
    description: embed.description || '',
    url: embed.url || '',
    color: embed.color || '#5865f2',
    timestamp: Boolean(embed.timestamp),
    author: { name: embed.authorName || '', url: embed.authorUrl || '', icon_url: embed.authorIcon || '' },
    footer: { text: embed.footerText || '', icon_url: embed.footerIcon || '' },
    thumbnail: { url: embed.thumbnail || '' },
    image: { url: embed.image || '' },
    fields: (embed.fields || []).map((field) => ({ name: field.name || '', value: field.value || '', inline: Boolean(field.inline) })),
  };
}

function renderPreview() {
  const wrap = $('previewMessagesWrap');
  wrap.innerHTML = '';
  const channelName = $('channelSelect').selectedOptions[0]?.textContent || 'No channel selected';
  $('previewChannel').textContent = channelName;
  const botName = state.bot?.username || state.bot?.tag || 'Discohook';
  const avatar = state.bot?.avatarUrl || '';
  if (!state.messages.length) {
    wrap.innerHTML = '<div class="message-preview empty-preview">Нет данных для предпросмотра.</div>';
    return;
  }
  state.messages.forEach((message) => {
    const msg = document.createElement('div');
    msg.className = 'discord-message';
    msg.innerHTML = `
      <img class="preview-avatar" src="${escapeHtml(message.profileAvatar || avatar)}" alt="avatar">
      <div class="message-main">
        <div class="message-headline"><span class="username">${escapeHtml(message.profileName || botName)}</span><span class="bot-tag">BOT</span><span class="timestamp">${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="message-render"></div>
      </div>
    `;
    const render = msg.querySelector('.message-render');
    if (message.threadName) {
      const thread = document.createElement('div'); thread.className = 'preview-thread'; thread.textContent = `Ветка: ${message.threadName}`; render.appendChild(thread);
    }
    if (message.type === 'v1') renderPreviewV1(message, render);
    else renderPreviewV2(message, render);
    wrap.appendChild(msg);
  });
}
function renderPreviewV1(message, render) {
  const content = document.createElement('div');
  content.className = `preview-content ${message.content.trim() ? '' : 'empty'}`.trim();
  content.textContent = message.content.trim() || ' '; render.appendChild(content);
  (message.files || []).forEach((file) => { const el = document.createElement('div'); el.className = 'preview-file'; el.textContent = file.name || 'Файл'; render.appendChild(el); });
  (message.embeds || []).forEach((embed) => render.appendChild(createPreviewEmbed(embed)));
  (message.rows || []).forEach((row) => {
    const pr = document.createElement('div'); pr.className = 'preview-row';
    (row.items || []).forEach((item) => {
      const el = document.createElement('div'); el.className = `preview-button ${item.type === 'link' ? 'link' : ''}`.trim(); el.textContent = item.label || prettyComponentType(item.type); pr.appendChild(el);
    });
    if (pr.childNodes.length) render.appendChild(pr);
  });
}
function renderPreviewV2(message, render) {
  if (!(message.parts || []).length) {
    const empty = document.createElement('div'); empty.className = 'preview-content empty'; empty.textContent = ' '; render.appendChild(empty); return;
  }
  (message.parts || []).forEach((part) => {
    if (part.type === 'content') {
      const content = document.createElement('div'); content.className = 'preview-content'; content.textContent = part.text || ' '; render.appendChild(content);
      if (part.accessory) {
        const acc = document.createElement('div'); acc.className = 'preview-accessories';
        const el = document.createElement('div'); el.className = `preview-button ${part.accessory.type === 'link' ? 'link' : ''}`.trim(); el.textContent = part.accessory.label || prettyComponentType(part.accessory.type); acc.appendChild(el); render.appendChild(acc);
      }
    }
    if (part.type === 'container') {
      (part.embeds || []).forEach((embed) => render.appendChild(createPreviewEmbed(embed)));
      (part.parts || []).forEach((sub) => {
        if (sub.type === 'row') {
          const pr = document.createElement('div'); pr.className = 'preview-row';
          (sub.items || []).forEach((item) => { const el = document.createElement('div'); el.className = `preview-button ${item.type === 'link' ? 'link' : ''}`.trim(); el.textContent = item.label || prettyComponentType(item.type); pr.appendChild(el); });
          if (pr.childNodes.length) render.appendChild(pr);
        }
      });
    }
    if (part.type === 'media') {
      const pr = document.createElement('div'); pr.className = 'preview-accessories';
      (part.urls || []).filter(Boolean).forEach(() => { const el = document.createElement('div'); el.className = 'preview-file'; el.textContent = 'Media'; pr.appendChild(el); });
      if (pr.childNodes.length) render.appendChild(pr);
    }
    if (part.type === 'file') {
      const pr = document.createElement('div'); pr.className = 'preview-file'; pr.textContent = part.filename || 'Файл'; render.appendChild(pr);
    }
    if (part.type === 'separator') {
      const sep = document.createElement('div'); sep.className = 'preview-separator'; render.appendChild(sep);
    }
    if (part.type === 'row') {
      const pr = document.createElement('div'); pr.className = 'preview-row';
      (part.items || []).forEach((item) => { const el = document.createElement('div'); el.className = `preview-button ${item.type === 'link' ? 'link' : ''}`.trim(); el.textContent = item.label || prettyComponentType(item.type); pr.appendChild(el); });
      if (pr.childNodes.length) render.appendChild(pr);
    }
  });
}
function createPreviewEmbed(embed) {
  const wrap = document.createElement('div'); wrap.className = 'preview-embed';
  wrap.innerHTML = `<div class="embed-stripe" style="background:${escapeHtml(embed.color || '#5865f2')}"></div><div class="embed-inner"></div>`;
  const inner = wrap.querySelector('.embed-inner');
  if (embed.authorName) inner.insertAdjacentHTML('beforeend', `<div class="embed-author">${escapeHtml(embed.authorName)}</div>`);
  if (embed.title) inner.insertAdjacentHTML('beforeend', `<div class="embed-title">${escapeHtml(embed.title)}</div>`);
  if (embed.description) inner.insertAdjacentHTML('beforeend', `<div class="embed-desc">${escapeHtml(embed.description)}</div>`);
  if (embed.fields?.length) {
    const grid = document.createElement('div'); grid.className = 'embed-field-grid';
    embed.fields.forEach((field) => {
      const item = document.createElement('div'); item.className = `embed-field ${field.inline ? '' : 'full'}`.trim();
      item.innerHTML = `<div class="embed-field-name">${escapeHtml(field.name || '\u200b')}</div><div class="embed-field-value">${escapeHtml(field.value || '\u200b')}</div>`;
      grid.appendChild(item);
    });
    inner.appendChild(grid);
  }
  if (embed.image) inner.insertAdjacentHTML('beforeend', `<img class="embed-img" src="${escapeHtml(embed.image)}" alt="embed image">`);
  if (embed.thumbnail && !embed.image) inner.insertAdjacentHTML('beforeend', `<img class="embed-img" src="${escapeHtml(embed.thumbnail)}" alt="embed thumb">`);
  if (embed.footerText || embed.timestamp) inner.insertAdjacentHTML('beforeend', `<div class="embed-footer">${escapeHtml(embed.footerText || '')}${embed.timestamp ? ' • now' : ''}</div>`);
  return wrap;
}

function readBackups() { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch { return []; } }
function writeBackups(items) { localStorage.setItem(BACKUP_KEY, JSON.stringify(items)); }
function readHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function writeHistory(items) { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }
function readTemplates() { try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '{}'); } catch { return {}; } }
function writeTemplates(items) { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(items)); }

function openModal(title, bodyHtml, actions = []) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modalActions').innerHTML = '';
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.className = `btn ${action.className || 'secondary'}`.trim();
    btn.textContent = action.label;
    btn.type = 'button';
    btn.onclick = action.onClick;
    $('modalActions').appendChild(btn);
  });
  $('modalBackdrop').classList.add('show');
}
function closeModal() { $('modalBackdrop').classList.remove('show'); }
function openAddMessageModal() {
  openModal('Добавить сообщение', `
    <div class="choice-list">
      <div class="choice-card" data-choice="v1"><div class="choice-title"><span>Стандартное Сообщение</span></div><div class="small-note">Может отображать текст, вложения, эмбеды.</div></div>
      <div class="choice-card" data-choice="v2"><div class="choice-title"><span>Сообщение с компонентами</span><span class="choice-badge">НОВЫЙ</span></div><div class="small-note">Более гибкое сообщение с контейнерами и компонентами.</div></div>
    </div>
  `, [{ label: 'Закрыть', onClick: closeModal }]);
  $$('[data-choice]').forEach((el) => el.addEventListener('click', () => {
    const msg = el.dataset.choice === 'v2' ? createV2Message() : createV1Message();
    state.messages.push(msg);
    state.activeMessageId = msg.id;
    closeModal(); renderAll();
  }));
}
function openBackupsModal() {
  const list = readBackups();
  openModal('Бэкапы', list.map((item) => `<div class="backup-item"><div><strong>${escapeHtml(item.name)}</strong><br><small>${new Date(item.at).toLocaleString('ru-RU')}</small></div><div class="mini-actions"><button class="btn small secondary" data-load-backup="${item.id}">Загрузить</button><button class="btn small danger" data-delete-backup="${item.id}">Удалить</button></div></div>`).join('') || '<p class="small-note">Пока пусто.</p>', [
    { label: 'Сохранить текущий', className: 'primary', onClick: () => {
      const list = readBackups(); list.unshift({ id: uid('backup'), name: `Backup ${new Date().toLocaleString('ru-RU')}`, at: new Date().toISOString(), project: buildProject() }); writeBackups(list.slice(0, 30)); openBackupsModal();
    }},
    { label: 'Закрыть', onClick: closeModal },
  ]);
  $$('[data-load-backup]').forEach((btn) => btn.onclick = () => { const item = readBackups().find((x) => x.id === btn.dataset.loadBackup); if (item) { applyProject(item.project); closeModal(); } });
  $$('[data-delete-backup]').forEach((btn) => btn.onclick = () => { writeBackups(readBackups().filter((x) => x.id !== btn.dataset.deleteBackup)); openBackupsModal(); });
}
function openHistoryModal() {
  const items = readHistory();
  openModal('История', items.map((item, i) => `<div class="backup-item"><div><strong>${escapeHtml(item.type)} #${i+1}</strong><br><small>${new Date(item.at).toLocaleString('ru-RU')} · ${escapeHtml(item.url || '')}</small></div><div class="mini-actions"><button class="btn small secondary" data-load-history="${i}">Загрузить</button></div></div>`).join('') || '<p class="small-note">История появится после отправки.</p>', [{ label: 'Закрыть', onClick: closeModal }]);
  $$('[data-load-history]').forEach((btn) => btn.onclick = () => { const item = items[Number(btn.dataset.loadHistory)]; if (item?.project) { applyProject(item.project); closeModal(); } });
}
function copyText(text, ok = 'Скопировано') {
  navigator.clipboard.writeText(text).then(() => setStatus(ok)).catch(() => setStatus('Буфер обмена недоступен.', false));
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function togglePreview(on) { $('appView').classList.toggle('preview-mode', Boolean(on)); }
function toggleSendDropdown(event) {
  event.stopPropagation();
  const menu = $('sendDropdown');
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.left = `${Math.max(12, rect.right - 190)}px`;
  menu.classList.toggle('show');
}
function closeMenus() { $('floatingMenu').classList.remove('show'); $('sendDropdown').classList.remove('show'); }
function openFloatingMenu(target, items) {
  const menu = $('floatingMenu');
  menu.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = item.label; btn.onclick = () => { closeMenus(); item.onClick(); }; menu.appendChild(btn);
  });
  const rect = target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(12, rect.left)}px`;
  menu.classList.add('show');
}

function findMessage(messageId) { return state.messages.find((m) => m.id === messageId); }
function findEmbed(message, embedId) { return (message.embeds || []).find((e) => e.id === embedId) || (message.parts || []).flatMap((p) => p.type === 'container' ? p.embeds || [] : []).find((e) => e.id === embedId); }
function findPart(message, partId) { return (message.parts || []).find((p) => p.id === partId); }

async function loadMe() {
  try {
    const data = await api('/api/me');
    state.bot = data.bot || null;
  } catch {
    const data = await api('/api/health');
    const tag = data.bot || 'Bot';
    state.bot = { tag, username: String(tag).split('#')[0] || 'Bot', avatarUrl: '' };
  }
  $('botTag').textContent = state.bot?.tag || 'Bot';
}
async function loadChannels() {
  const data = await api('/api/channels');
  const select = $('channelSelect');
  select.innerHTML = '';
  if (Array.isArray(data.guilds)) {
    state.guilds = data.guilds || [];
  } else if (Array.isArray(data.channels)) {
    const byGuild = new Map();
    for (const channel of data.channels) {
      const key = channel.guildId || channel.guildName || 'guild';
      if (!byGuild.has(key)) byGuild.set(key, { id: channel.guildId || key, name: channel.guildName || 'Server', channels: [] });
      byGuild.get(key).channels.push(channel);
    }
    state.guilds = [...byGuild.values()];
  } else {
    state.guilds = [];
  }
  state.guilds.forEach((guild) => {
    const group = document.createElement('optgroup');
    group.label = guild.name;
    (guild.channels || []).forEach((channel) => {
      const option = document.createElement('option');
      option.value = channel.id;
      option.textContent = channel.label || `#${channel.name}`;
      group.appendChild(option);
    });
    select.appendChild(group);
  });
  if (!select.options.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No sendable channels'; select.appendChild(option); }
}
async function sendPayload() {
  const message = currentMessage();
  const payload = buildSendPayload(message);
  if (!payload.channelId) return setStatus('Выбери канал.', false);
  if (!payload.content.trim() && !payload.embeds.length && !payload.buttons.length) return setStatus('Сообщение пустое.', false);
  $('sendBtn').disabled = true;
  const old = $('sendBtn').textContent; $('sendBtn').textContent = 'Отправка...';
  try {
    const editTarget = String(payload.editMessage || '').trim();
    const isApiKeyMode = state.authMode === 'api-key' || Boolean(state.apiKey);
    const data = editTarget && isApiKeyMode
      ? await api('/api/edit', { method: 'POST', body: JSON.stringify({ channelId: payload.channelId, messageId: editTarget, message: payload }) })
      : await api('/api/send', { method: 'POST', body: JSON.stringify(payload) });
    const history = readHistory(); history.unshift({ type: data.edited ? 'edit' : (editTarget && isApiKeyMode ? 'edit' : 'send'), at: new Date().toISOString(), url: data.url || '', project: buildProject() }); writeHistory(history.slice(0, 25));
    setStatus(`${(data.edited || (editTarget && isApiKeyMode)) ? 'Изменено' : 'Отправлено'}: ${data.url || data.messageId || 'ok'}`);
  } catch (error) { setStatus(error.message, false); }
  finally { $('sendBtn').disabled = false; $('sendBtn').textContent = old; }
}
async function enterApp() {
  await loadMe();
  await loadChannels();
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  if (!state.messages.length) { const msg = createV1Message(); state.messages = [msg]; state.activeMessageId = msg.id; }
  renderAll();
}
async function bootstrap() {
  if ($('apiBaseInput')) $('apiBaseInput').value = state.apiBase || '';
  if (!state.apiKey && state.authMode !== 'session') {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    return;
  }
  try { await enterApp(); }
  catch {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
  }
}

function bindGeneralInputs() {
  document.addEventListener('input', (event) => {
    const t = event.target;
    if (t.matches('[data-bind]')) {
      const message = findMessage(t.dataset.messageId); if (!message) return;
      message[t.dataset.bind] = t.value; renderPreview();
    }
    if (t.matches('[data-file-bind]')) {
      const message = findMessage(t.dataset.messageId); if (!message) return;
      const file = message.files[Number(t.dataset.index)]; if (!file) return;
      file[t.dataset.fileBind] = t.value; renderPreview();
    }
    if (t.matches('[data-embed-bind]')) {
      const message = findMessage(t.dataset.messageId); const embed = findEmbed(message, t.dataset.embedId); if (!embed) return;
      embed[t.dataset.embedBind] = t.value; renderPreview();
    }
    if (t.matches('[data-field-bind]')) {
      const message = findMessage(t.dataset.messageId); const embed = findEmbed(message, t.dataset.embedId); if (!embed) return;
      const field = (embed.fields || []).find((x) => x.id === t.dataset.fieldId); if (!field) return;
      field[t.dataset.fieldBind] = t.value; renderPreview();
    }
    if (t.matches('[data-component-bind]')) {
      const message = findMessage(t.dataset.messageId); if (!message) return;
      const row = resolveRow(message, t.dataset.rowId, t.dataset.partId, t.dataset.v2 === '1'); if (!row) return;
      const cmp = row.items.find((x) => x.id === t.dataset.componentId); if (!cmp) return;
      cmp[t.dataset.componentBind] = t.value; renderPreview();
    }
    if (t.matches('[data-v2-bind]')) {
      const message = findMessage(t.dataset.messageId); const part = findPart(message, t.dataset.partId); if (!part) return;
      part[t.dataset.v2Bind] = t.value; renderPreview();
    }
    if (t.matches('[data-accessory-bind]')) {
      const message = findMessage(t.dataset.messageId); const part = findPart(message, t.dataset.partId); if (!part?.accessory) return;
      part.accessory[t.dataset.accessoryBind] = t.value; renderPreview();
    }
    if (t.matches('[data-media-bind]')) {
      const message = findMessage(t.dataset.messageId); const part = findPart(message, t.dataset.partId); if (!part) return;
      part.urls[Number(t.dataset.index)] = t.value; renderPreview();
    }
    if (t.matches('[data-filepart-bind]')) {
      const message = findMessage(t.dataset.messageId); const part = findPart(message, t.dataset.partId); if (!part) return;
      part[t.dataset.filepartBind] = t.value; renderPreview();
    }
    if (t.matches('[data-separator-bind]')) {
      const message = findMessage(t.dataset.messageId); const part = findPart(message, t.dataset.partId); if (!part) return;
      part[t.dataset.separatorBind] = t.value; renderPreview();
    }
  });
  document.addEventListener('change', (event) => {
    const t = event.target;
    if (t.id.startsWith('pingUsers_')) { const id = t.id.replace('pingUsers_', ''); const message = findMessage(id); if (message) { message.pings.users = t.checked; renderPreview(); } }
    if (t.id.startsWith('pingRoles_')) { const id = t.id.replace('pingRoles_', ''); const message = findMessage(id); if (message) { message.pings.roles = t.checked; renderPreview(); } }
    if (t.id.startsWith('timestamp_')) {
      const embedId = t.id.replace('timestamp_', '');
      state.messages.forEach((message) => { const embed = findEmbed(message, embedId); if (embed) embed.timestamp = t.checked; });
      renderPreview();
    }
    if (t.id.startsWith('inline_')) {
      const fieldId = t.id.replace('inline_', '');
      state.messages.forEach((message) => {
        (message.embeds || []).forEach((embed) => { const field = (embed.fields || []).find((x) => x.id === fieldId); if (field) field.inline = t.checked; });
        (message.parts || []).forEach((part) => (part.embeds || []).forEach((embed) => { const field = (embed.fields || []).find((x) => x.id === fieldId); if (field) field.inline = t.checked; }));
      });
      renderPreview();
    }
    if (t.id.startsWith('divider_')) {
      const partId = t.id.replace('divider_', '');
      state.messages.forEach((message) => { const part = findPart(message, partId); if (part) part.divider = t.checked; });
      renderPreview();
    }
  });
}
function resolveRow(message, rowId, partId, isV2) {
  if (!isV2) return (message.rows || []).find((x) => x.id === rowId);
  if (partId) {
    const part = findPart(message, partId); return (part?.parts || []).find((x) => x.id === rowId) || (message.parts || []).find((x) => x.id === rowId);
  }
  return (message.parts || []).find((x) => x.id === rowId);
}

function bindClicks() {
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('loginError').textContent = '';
    const password = $('passwordInput').value;
    state.apiBase = ($('apiBaseInput')?.value || '').trim();
    localStorage.setItem('lds_api_base', state.apiBase);

    if (isAppsScriptProxy(state.apiBase)) {
      state.apiKey = password; // PANEL_ACCESS_KEY from Code.gs
      state.authMode = 'apps-script';
      localStorage.setItem('lds_api_key', state.apiKey);
      localStorage.setItem('lds_auth_mode', state.authMode);
      try {
        await enterApp();
        $('passwordInput').value = '';
      } catch (appsScriptError) {
        state.authMode = '';
        localStorage.removeItem('lds_auth_mode');
        $('loginError').textContent = `Apps Script: ${appsScriptError.message}`;
      }
      return;
    }

    // Direct WEB_API_KEY mode for local/server panel.
    state.apiKey = password;
    state.authMode = 'api-key';
    localStorage.setItem('lds_api_key', state.apiKey);
    localStorage.setItem('lds_auth_mode', state.authMode);
    try {
      await enterApp();
      $('passwordInput').value = '';
      return;
    } catch (apiKeyError) {
      // Fallback for old cookie-login server.
      state.apiKey = '';
      state.authMode = 'session';
      localStorage.removeItem('lds_api_key');
      localStorage.setItem('lds_auth_mode', state.authMode);
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
        await enterApp();
        $('passwordInput').value = '';
      } catch (sessionError) {
        state.authMode = '';
        localStorage.removeItem('lds_auth_mode');
        $('loginError').textContent = `API-key: ${apiKeyError.message}; session: ${sessionError.message}`;
      }
    }
  });
  $('addMessageBtn').addEventListener('click', openAddMessageModal);
  $('backupsBtn').addEventListener('click', openBackupsModal);
  $('historyBtn').addEventListener('click', openHistoryModal);
  $('settingsBtn').addEventListener('click', () => $('targetSection').scrollIntoView({ behavior: 'smooth' }));
  $('shareBtn').addEventListener('click', () => copyText(JSON.stringify(buildProject()), 'Проект скопирован в буфер'));
  $('resetBtn').addEventListener('click', () => { if (confirm('Очистить всё?')) { const msg = createV1Message(); state.messages = [msg]; state.activeMessageId = msg.id; $('editMessageInput').value = ''; renderAll(); } });
  $('addWebhookBtn').addEventListener('click', () => $('targetSection').scrollIntoView({ behavior: 'smooth' }));
  $('sendBtn').addEventListener('click', sendPayload);
  $('sendMenuBtn').addEventListener('click', toggleSendDropdown);
  $('sendDropdown').addEventListener('click', (event) => { const btn = event.target.closest('[data-send-action]'); if (!btn) return; closeMenus(); if (btn.dataset.sendAction === 'send') sendPayload(); if (btn.dataset.sendAction === 'copy') copyText(JSON.stringify(buildSendPayload(currentMessage()), null, 2), 'Payload copied'); if (btn.dataset.sendAction === 'download') downloadText(`lds-message-${Date.now()}.json`, JSON.stringify(buildSendPayload(currentMessage()), null, 2)); });
  $('channelSelect').addEventListener('change', renderPreview);
  $('editMessageInput').addEventListener('input', renderPreview);
  $('refreshChannelsBtn').addEventListener('click', () => loadChannels().then(renderPreview).catch((error) => setStatus(error.message, false)));
  $('refreshPreview').addEventListener('click', renderPreview);
  $('previewBtn').addEventListener('click', () => togglePreview(true));
  $('editorBtn').addEventListener('click', () => togglePreview(false));
  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeModal(); });

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) {
      if (!event.target.closest('.dropdown')) closeMenus();
      return;
    }
    const action = btn.dataset.action;
    const message = findMessage(btn.dataset.messageId);
    if (action === 'editMessage') { state.activeMessageId = btn.closest('.message-card').dataset.messageId; renderAll(); }
    if (action === 'duplicateMessage' && message) { const clone = cloneMessageDeep(message); state.messages.splice(state.messages.indexOf(message) + 1, 0, clone); renderAll(); }
    if (action === 'deleteMessage' && message) { if (state.messages.length > 1) state.messages = state.messages.filter((m) => m.id !== message.id); else state.messages = [createV1Message()]; state.activeMessageId = state.messages[0].id; renderAll(); }
    if (action === 'addMockFile' && message) { if (message.files.length >= 10) return setStatus('Максимум 10 файлов.', false); message.files.push({ name: `file_${message.files.length + 1}.png`, url: '' }); renderAll(); }
    if (action === 'removeFile' && message) { message.files.splice(Number(btn.dataset.index), 1); renderAll(); }
    if (action === 'pasteFile') setStatus('Вставка файлов-заглушек пока не реализована.', false);
    if (action === 'addV1' && message) {
      openFloatingMenu(btn, [
        { label: '➕ Добавить Embed', onClick: () => { message.embeds.push(createEmbed()); renderAll(); } },
        { label: '↩ Добавить Компоненты', onClick: () => { message.rows.push(createV1Row()); renderAll(); } },
      ]);
    }
    if (action === 'messageOptions' && message) {
      openFloatingMenu(btn, [
        { label: 'Сохранить как шаблон', onClick: () => saveTemplateForMessage(message) },
        { label: 'Загрузить шаблон', onClick: () => openTemplateModal(message) },
      ]);
    }
    if (action === 'setLink') setStatus('Set Link пока оставлен как заглушка.', false);
    if (action === 'duplicateEmbed' && message) {
      const embed = findEmbed(message, btn.dataset.embedId); if (!embed) return; const list = message.embeds.includes(embed) ? message.embeds : (message.parts.find((p) => (p.embeds || []).includes(embed))?.embeds || []); const idx = list.indexOf(embed); list.splice(idx + 1, 0, structuredClone(embed)); renderAll();
    }
    if (action === 'deleteEmbed' && message) {
      message.embeds = (message.embeds || []).filter((e) => e.id !== btn.dataset.embedId);
      message.parts?.forEach((part) => { if (part.embeds) part.embeds = part.embeds.filter((e) => e.id !== btn.dataset.embedId); });
      renderAll();
    }
    if (action === 'addField' && message) { const embed = findEmbed(message, btn.dataset.embedId); if (!embed) return; embed.fields.push(createField()); renderAll(); }
    if (action === 'deleteField' && message) { const embed = findEmbed(message, btn.dataset.embedId); if (!embed) return; embed.fields = embed.fields.filter((f) => f.id !== btn.dataset.fieldId); renderAll(); }
    if (action === 'duplicateRow' && message) {
      const row = resolveRow(message, btn.dataset.rowId, btn.dataset.partId, btn.dataset.v2 === '1'); if (!row) return;
      const clone = cloneRowDeep(row);
      if (btn.dataset.v2 === '1') {
        if (btn.dataset.partId) { const part = findPart(message, btn.dataset.partId); part.parts.splice(part.parts.indexOf(row) + 1, 0, clone); }
        else message.parts.splice(message.parts.indexOf(row) + 1, 0, clone);
      } else message.rows.splice(message.rows.indexOf(row) + 1, 0, clone);
      renderAll();
    }
    if (action === 'deleteRow' && message) {
      if (btn.dataset.v2 === '1') {
        if (btn.dataset.partId) { const part = findPart(message, btn.dataset.partId); part.parts = part.parts.filter((r) => r.id !== btn.dataset.rowId); }
        else message.parts = message.parts.filter((r) => r.id !== btn.dataset.rowId);
      } else message.rows = message.rows.filter((r) => r.id !== btn.dataset.rowId);
      renderAll();
    }
    if (action === 'addRowComponent' && message) {
      const row = resolveRow(message, btn.dataset.rowId, btn.dataset.partId, btn.dataset.v2 === '1'); if (!row) return;
      openFloatingMenu(btn, [
        ['button','Кнопка'], ['link','Кнопка с Ссылкой'], ['select','Меню Выбора'], ['userSelect','Меню Выбора Пользователей'], ['roleSelect','Меню Выбора Ролей'], ['mentionableSelect','Меню Выбора Пользователей и Ролей'], ['channelSelect','Меню Выбора Каналов']
          .map(([type, label]) => ({ type, label }))
      ].flat().map((item) => ({ label: item.label, onClick: () => { row.items.push(createComponent(item.type)); renderAll(); } })));
    }
    if (action === 'deleteComponent' && message) {
      const row = resolveRow(message, btn.dataset.rowId, btn.dataset.partId, btn.dataset.v2 === '1'); if (!row) return; row.items = row.items.filter((x) => x.id !== btn.dataset.componentId); renderAll();
    }
    if (action === 'addV2' && message) {
      openFloatingMenu(btn, [
        { label: 'T Содержимое', onClick: () => { message.parts.push(createContentPart()); renderAll(); } },
        { label: '⊞ Container', onClick: () => { message.parts.push(createContainerPart()); renderAll(); } },
        { label: '🖼 Media Gallery', onClick: () => { message.parts.push(createMediaGalleryPart()); renderAll(); } },
        { label: '🗎 Файл', onClick: () => { message.parts.push(createFilePart()); renderAll(); } },
        { label: '➖ Разделитель', onClick: () => { message.parts.push(createSeparatorPart()); renderAll(); } },
        { label: '☰ Строка', onClick: () => { message.parts.push(createRowPart()); renderAll(); } },
      ]);
    }
    if (action === 'duplicatePart' && message) { const part = findPart(message, btn.dataset.partId); if (!part) return; const clone = clonePartDeep(part); message.parts.splice(message.parts.indexOf(part) + 1, 0, clone); renderAll(); }
    if (action === 'deletePart' && message) { message.parts = message.parts.filter((p) => p.id !== btn.dataset.partId); renderAll(); }
    if (action === 'addAccessory' && message) {
      const part = findPart(message, btn.dataset.partId); if (!part) return;
      openFloatingMenu(btn, [
        { label: 'Кнопка', onClick: () => { part.accessory = createComponent('button'); renderAll(); } },
        { label: 'Кнопка с Ссылкой', onClick: () => { part.accessory = createComponent('link'); renderAll(); } },
        { label: 'Миниатюра', onClick: () => { part.accessory = { type: 'thumbnail', label: 'Миниатюра', url: '' }; renderAll(); } },
      ]);
    }
    if (action === 'removeAccessory' && message) { const part = findPart(message, btn.dataset.partId); if (part) { part.accessory = null; renderAll(); } }
    if (action === 'addContainerThing' && message) {
      const part = findPart(message, btn.dataset.partId); if (!part) return;
      openFloatingMenu(btn, [
        { label: 'Добавить Embed', onClick: () => { part.embeds.push(createEmbed()); renderAll(); } },
        { label: 'Добавить Строку', onClick: () => { part.parts.push(createRowPart()); renderAll(); } },
        { label: 'Добавить Содержимое', onClick: () => { part.parts.push(createContentPart()); renderAll(); } },
      ]);
    }
    if (action === 'addMediaUrl' && message) { const part = findPart(message, btn.dataset.partId); if (part) { part.urls.push(''); renderAll(); } }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeModal(); closeMenus(); }
  });
}

function saveTemplateForMessage(message) {
  openModal('Сохранить шаблон', '<label>Имя шаблона<input id="templateNameInput" placeholder="Название"></label>', [
    { label: 'Сохранить', className: 'primary', onClick: () => {
      const name = $('templateNameInput').value.trim(); if (!name) return setStatus('Введите имя шаблона.', false);
      const all = readTemplates(); all[name] = structuredClone(message); writeTemplates(all); closeModal(); setStatus('Шаблон сохранён.');
    }},
    { label: 'Отмена', onClick: closeModal },
  ]);
}
function openTemplateModal(message) {
  const all = readTemplates();
  openModal('Шаблоны', Object.keys(all).map((name) => `<div class="backup-item"><strong>${escapeHtml(name)}</strong><div class="mini-actions"><button class="btn small secondary" data-load-template="${escapeHtml(name)}">Загрузить</button><button class="btn small danger" data-delete-template="${escapeHtml(name)}">Удалить</button></div></div>`).join('') || '<p class="small-note">Шаблонов нет.</p>', [{ label: 'Закрыть', onClick: closeModal }]);
  $$('[data-load-template]').forEach((btn) => btn.onclick = () => {
    const tpl = structuredClone(all[btn.dataset.loadTemplate]);
    if (!tpl) return; tpl.id = message.id; const idx = state.messages.findIndex((x) => x.id === message.id); state.messages[idx] = tpl; state.activeMessageId = tpl.id; closeModal(); renderAll();
  });
  $$('[data-delete-template]').forEach((btn) => btn.onclick = () => { const data = readTemplates(); delete data[btn.dataset.deleteTemplate]; writeTemplates(data); openTemplateModal(message); });
}

bindGeneralInputs();
bindClicks();
bootstrap();
