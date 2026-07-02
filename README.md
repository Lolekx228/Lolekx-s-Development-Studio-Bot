LDS Message Studio — DeepSeek/Discohook 1:1 style version

Что менять на GitHub Pages:
- github-pages/index.html
- github-pages/style.css
- github-pages/app.js
- github-pages/vendor/*

Что внутри vendor:
- deepseek-ui.css — исходный большой CSS, который ты скинул
- coolicons.css — исходный CSS с иконками, который ты скинул
- highlight-default.css — исходная тема highlight.js, которую ты скинул

Картинки и шрифты НЕ переносил.
В интерфейсе оставлены места:
- IMAGE #1 — логотип/бренд
- IMAGE #2 — пустой preview/арт
- IMAGE #3 — фоновая декорация

Хост бота и Google Apps Script менять не обязательно, если у тебя уже стоит предыдущий фикс с ролями/эмодзи/V2.
Если хочешь полностью заменить пакет целиком — можешь заменить и файлы google-apps-script/bot-host из архива.

После загрузки на GitHub Pages нажми Ctrl+F5.


Дополнение в этой версии:
- Тёплая тёмная тема включена по умолчанию.
- Акцент Components V2 заменён на янтарный.
- Функционал кнопок app.js сохранён: API, загрузка каналов/ролей/эмодзи, импорт/экспорт, шаблоны, отправка/редактирование.
