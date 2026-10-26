"use strict";
const fs = require("node:fs"), path = require("node:path"), { createHash, randomUUID } = require("node:crypto");
const PREFIX = "lds:action:", ID = /^\d{17,20}$/;
const FILE = path.resolve(__dirname, "../data/editor-component-actions.json");
function fail(message) { throw Object.assign(Error(message), { status: 400 }); }
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`;
    try { const fd = fs.openSync(temporary, "wx", 0o600); try { fs.writeFileSync(fd, JSON.stringify(value), "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function createActionStore(file = FILE) {
    function read() {
        if (!fs.existsSync(file)) return { version: 1, bindings: {} };
        const value = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
        if (value?.version !== 1 || !value.bindings || typeof value.bindings !== "object" || Array.isArray(value.bindings)) throw Error("Invalid component action store");
        return value;
    }
    return {
        get: id => read().bindings[id],
        reserve(entries) {
            if (!entries.length) return;
            const state = read();
            if (Object.keys(state.bindings).length + entries.filter(e => !state.bindings[e.customId]).length > 10000) fail("Слишком много обработчиков компонентов. Обратитесь к администратору.");
            for (const entry of entries) {
                const old = state.bindings[entry.customId];
                state.bindings[entry.customId] = { ...entry, ...(old?.messageId ? { messageId: old.messageId, channelId: old.channelId } : {}) };
            }
            write(file, state);
        },
        bind(entries, guildId, channelId, messageId) {
            const state = read(), active = new Set(entries.map(e => e.customId));
            let changed = entries.length > 0;
            for (const [id, value] of Object.entries(state.bindings)) if (value.guildId === guildId && value.channelId === channelId && value.messageId === messageId && !active.has(id)) { delete state.bindings[id]; changed = true; }
            for (const entry of entries) state.bindings[entry.customId] = { ...entry, channelId, messageId };
            if (changed) write(file, state);
        }
    };
}
function validateFlow(flow) {
    if (!flow || !Array.isArray(flow.actions) || flow.actions.length > 10) fail("Сценарий должен содержать до 10 действий.");
    return { actions: flow.actions.map(action => {
        if ([3, 4, 5].includes(action?.type)) {
            if (typeof action.roleId !== "string" || !ID.test(action.roleId)) fail("В действии роли укажите её ID.");
            return { type: action.type, roleId: action.roleId };
        }
        if (action?.type === 12 && !action.webhookId && !action.channelId) {
            const content = action.message?.content;
            if (typeof content !== "string" || !content.trim() || content.length > 2000) fail("Ответ действия: от 1 до 2000 символов.");
            if (Object.keys(action.message).some(key => key !== "content")) fail("Это действие поддерживает текстовый ответ. Для embeds используйте отдельное сообщение редактора.");
            if (action.flags !== undefined && ![0, 64].includes(action.flags)) fail("Флаги ответа должны быть 0 (публично) или 64 (только нажавшему).");
            return { type: 12, message: { content }, flags: action.flags ?? 64 };
        }
        fail(`Действие ${action?.type} пока не поддерживается LDS Bot. Доступны роли и текстовые ответы.`);
    }) };
}
function materialize(input, wire, context) {
    if (input !== undefined && !Array.isArray(input)) fail("components должен быть массивом.");
    const entries = [];
    function visit(raw, output, at) {
        if (!raw || !output) return;
        const hasFlow = raw.flow?.actions?.length > 0, hasFlows = raw.flows && Object.values(raw.flows).some(flow => flow?.actions?.length > 0);
        if (hasFlow || hasFlows) {
            if (![2, 3, 5, 6, 7, 8].includes(raw.type) || (raw.type === 2 && [5, 6].includes(raw.style))) fail("Действия недоступны для кнопок-ссылок и Premium-кнопок.");
            const flow = hasFlow ? validateFlow(raw.flow) : undefined, flows = Object.create(null);
            if (hasFlows) {
                if (raw.type !== 3) fail("Действия по значениям доступны для строкового меню.");
                const values = new Set((raw.options || []).map(o => o.value));
                for (const [key, value] of Object.entries(raw.flows)) {
                    if (!values.has(key)) fail("Сценарий меню ссылается на отсутствующий вариант.");
                    if (value?.actions?.length) flows[key] = validateFlow(value);
                }
            }
            const customId = PREFIX + createHash("sha256").update(JSON.stringify([context.guildId, context.channelId, context.requestId, at, flow, flows])).digest("hex").slice(0, 40);
            output.custom_id = customId;
            entries.push({ customId, guildId: context.guildId, channelId: context.channelId, ...(flow ? { flow } : {}), ...(Object.keys(flows).length ? { flows } : {}) });
        }
        (raw.components || []).forEach((child, i) => visit(child, output.components?.[i], `${at}.${i}`));
        if (raw.accessory) visit(raw.accessory, output.accessory, `${at}.accessory`);
    }
    (input || []).forEach((raw, i) => visit(raw, wire?.[i], String(i)));
    return entries;
}
function restoreFlows(components, store, guildId, channelId, messageId) {
    const result = structuredClone(components || []);
    function visit(c) {
        if (c.custom_id?.startsWith(PREFIX)) {
            const entry = store.get(c.custom_id);
            if (entry?.guildId === guildId && entry.channelId === channelId && entry.messageId === messageId) {
                if (entry.flow) c.flow = entry.flow; if (entry.flows) c.flows = entry.flows;
            }
        }
        (c.components || []).forEach(visit); if (c.accessory) visit(c.accessory);
    }
    result.forEach(visit); return result;
}
function createInteractionHandler(options = {}) {
    const store = options.store || createActionStore(), logger = options.logger || console, inFlight = new Set(), seen = new Map();
    return async function handle(interaction) {
        if (!interaction.customId?.startsWith(PREFIX) || !(interaction.isButton?.() || interaction.isAnySelectMenu?.())) return false;
        const key = `${interaction.guildId || interaction.guild?.id}:${interaction.user?.id}`;
        const respond = content => interaction.editReply({ content, allowedMentions: { parse: [], repliedUser: false } });
        let locked = false;
        try {
            const entry = store.get(interaction.customId), guildId = interaction.guild?.id;
            if (!entry || !entry.messageId || guildId !== entry.guildId || interaction.channelId !== entry.channelId || interaction.message?.id !== entry.messageId) {
                await interaction.reply({ content: "Обработчик этой кнопки недоступен или устарел. Обновите сообщение через редактор.", flags: 64 }); return true;
            }
            const values = interaction.isAnySelectMenu?.() ? [...new Set(interaction.values || [])] : [];
            const flows = entry.flows ? values.map(value => entry.flows[value]).filter(Boolean) : [entry.flow].filter(Boolean);
            if (entry.flows && (!values.length || values.some(value => !Object.hasOwn(entry.flows, value)))) fail("Для этого варианта меню не настроено действие.");
            const actions = flows.flatMap(flow => validateFlow(flow).actions);
            if (!actions.length) fail("Для компонента не настроены действия.");
            const firstReply = actions.find(a => a.type === 12);
            await interaction.deferReply({ flags: firstReply ? firstReply.flags : 64 });
            for (const [id, expires] of seen) if (expires <= Date.now()) seen.delete(id);
            if (inFlight.has(key) || seen.has(interaction.id)) { await respond("Предыдущий запрос уже обрабатывается. Подождите."); return true; }
            inFlight.add(key); locked = true; seen.set(interaction.id, Date.now() + 15 * 60_000);
            if (seen.size > 2000) seen.delete(seen.keys().next().value);
            const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
            const roleActions = actions.filter(a => [3, 4, 5].includes(a.type)), roles = new Map();
            if (roleActions.length) {
                const me = await interaction.guild.members.fetchMe();
                if (!me.permissions.has(1n << 28n)) fail("У бота нет права Manage Roles.");
                for (const action of roleActions) {
                    const role = await interaction.guild.roles.fetch(action.roleId);
                    if (!role || role.id === guildId || role.managed || !role.editable) fail("Роль недоступна: проверьте ID и иерархию ролей бота.");
                    roles.set(role.id, role);
                }
            }
            const membership = new Set(member.roles.cache.keys());
            const rendered = new Map();
            for (const action of actions.filter(a => a.type === 12)) {
                const content = action.message.content.replaceAll("{user}", `<@${interaction.user.id}>`).replaceAll("{username}", interaction.user.username || interaction.user.id).replaceAll("{values}", values.join(", "));
                if (content.length > 2000) fail("Ответ после подстановки превышает 2000 символов.");
                rendered.set(action, content);
            }
            let replied = false;
            for (const action of actions) {
                if ([3, 4, 5].includes(action.type)) {
                    const add = action.type === 3 || (action.type === 5 && !membership.has(action.roleId));
                    if (add && !membership.has(action.roleId)) { await member.roles.add(action.roleId, "LDS Studio component action"); membership.add(action.roleId); }
                    if (!add && membership.has(action.roleId)) { await member.roles.remove(action.roleId, "LDS Studio component action"); membership.delete(action.roleId); }
                } else {
                    const content = rendered.get(action);
                    const payload = { content, allowedMentions: { parse: [], users: action.message.content.includes("{user}") ? [interaction.user.id] : [], repliedUser: false } };
                    if (!replied) await interaction.editReply(payload); else await interaction.followUp({ ...payload, flags: action.flags });
                    replied = true;
                }
            }
            if (!replied) await respond("✅ Роли обновлены.");
        } catch (error) {
            logger.warn(`[EDITOR ACTIONS] Не удалось выполнить ${interaction.customId} (${error.code || error.name}).`);
            const content = error.status === 400 ? error.message : "Не удалось выполнить действие. Проверьте права и роли бота; часть предыдущих действий могла выполниться.";
            if (interaction.deferred || interaction.replied) await respond(content).catch(() => {});
            else await interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } }).catch(() => {});
        } finally { if (locked) inFlight.delete(key); }
        return true;
    };
}
const defaultStore = createActionStore();
let defaultHandler;
async function handleComponentAction(interaction) { defaultHandler ||= createInteractionHandler(); return defaultHandler(interaction); }
module.exports = { createActionStore, validateFlow, materialize, restoreFlows, createInteractionHandler, handleComponentAction, defaultStore, PREFIX };
