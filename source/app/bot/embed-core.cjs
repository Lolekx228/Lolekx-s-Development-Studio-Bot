(function (root) {
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function shape(embeds) {
    if (!Array.isArray(embeds)) throw Error('embeds должен быть массивом.');
    for (const embed of embeds) {
      if (!object(embed)) throw Error('Embed должен быть объектом.');
      for (const key of ['title','description','url','timestamp']) if (embed[key] !== undefined && typeof embed[key] !== 'string') throw Error(key + ' должен быть строкой.');
      for (const key of ['author','footer','image','thumbnail']) if (embed[key] !== undefined && !object(embed[key])) throw Error(key + ' должен быть объектом.');
      if (embed.fields !== undefined && (!Array.isArray(embed.fields) || embed.fields.some(field => !object(field)))) throw Error('fields должен быть массивом объектов.');
    }
  }
  function prepare(embeds) {
    shape(embeds);
    if (embeds.length > 10) throw Error('Максимум 10 embeds в сообщении.');
    let total = 0;
    function text(value, limit, label) {
      if (value === undefined || value === '') return undefined;
      if (typeof value !== 'string') throw Error(label + ': нужна строка.');
      const safe = value.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere');
      if (safe.length > limit) throw Error(label + ': максимум ' + limit + ' символов.');
      total += safe.length; return safe;
    }
    function url(value, label) {
      if (value === undefined || value === '') return undefined;
      if (typeof value !== 'string') throw Error(label + ': нужна ссылка.');
      let parsed; try { parsed = new URL(value); } catch { throw Error(label + ': неверная ссылка.'); }
      if (!['http:','https:'].includes(parsed.protocol) || value.length > 2048) throw Error(label + ': нужна HTTP(S)-ссылка до 2048 символов.');
      return value;
    }
    const output = embeds.map((source, i) => {
      const label = 'Embed ' + (i + 1), embed = {};
      for (const [key,limit] of [['title',256],['description',4096]]) { const value = text(source[key],limit,label + ' · ' + key); if (value !== undefined) embed[key] = value; }
      const target = url(source.url,label + ' · ссылка'); if (target) embed.url = target;
      if (source.color !== undefined && source.color !== null) { if (!Number.isInteger(source.color) || source.color < 0 || source.color > 16777215) throw Error(label + ': неверный цвет.'); embed.color = source.color; }
      if (source.timestamp) { if (!/^\d{4}-\d{2}-\d{2}T/.test(source.timestamp) || !Number.isFinite(Date.parse(source.timestamp))) throw Error(label + ': неверная дата.'); embed.timestamp = new Date(source.timestamp).toISOString(); }
      for (const key of ['image','thumbnail']) if (source[key]) { const media = url(source[key].url,label + ' · ' + key); if (media) embed[key] = {url:media}; }
      if (source.author) {
        const name = text(source.author.name,256,label + ' · автор'), icon = url(source.author.icon_url,label + ' · иконка автора'), link = url(source.author.url,label + ' · ссылка автора');
        if ((icon || link) && !name) throw Error(label + ': укажите имя автора.');
        if (name) { embed.author = {name}; if (icon) embed.author.icon_url = icon; if (link) embed.author.url = link; }
      }
      if (source.footer) {
        const value = text(source.footer.text,2048,label + ' · footer'), icon = url(source.footer.icon_url,label + ' · иконка footer');
        if (icon && !value) throw Error(label + ': укажите текст footer.');
        if (value) { embed.footer = {text:value}; if (icon) embed.footer.icon_url = icon; }
      }
      if (source.fields?.length) {
        if (source.fields.length > 25) throw Error(label + ': максимум 25 полей.');
        embed.fields = source.fields.map((field,index) => { const name = text(field.name,256,label + ' · название поля ' + (index+1)), value = text(field.value,1024,label + ' · значение поля ' + (index+1)); if (!name?.trim() || !value?.trim()) throw Error(label + ': заполните название и значение каждого поля.'); return {name,value,inline:field.inline===true}; });
      }
      if (!embed.title?.trim() && !embed.description?.trim() && !embed.fields?.length && !embed.image && !embed.thumbnail && !embed.author && !embed.footer) throw Error(label + ': embed пустой.');
      return embed;
    });
    if (total > 6000) throw Error('Общий текст всех embeds: максимум 6000 символов.');
    return output;
  }
  const api = {shape,prepare};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LDSEmbeds = api;
})(globalThis);
