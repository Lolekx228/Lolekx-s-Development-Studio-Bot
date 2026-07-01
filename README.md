# LDS Message Studio - GitHub Pages frontend

Это статический сайт: `index.html`, `style.css`, `app.js`.
Его можно залить в отдельный GitHub репозиторий и включить GitHub Pages.

## Как залить на GitHub Pages

1. Создай репозиторий, например `lds-message-studio`.
2. Залей в корень репозитория файлы из этой папки:
   - `index.html`
   - `style.css`
   - `app.js`
3. В GitHub открой `Settings -> Pages`.
4. Source: `Deploy from a branch`.
5. Branch: `main`, folder: `/root`.
6. Открой выданную ссылку вида `https://username.github.io/lds-message-studio/`.

## Что вводить на сайте

- `Bot API URL` — адрес API бота на хостинге, например `http://IP:3000` или домен.
- `API key / password` — значение `WEB_API_KEY` из `.env` бота.

API key не хранится на GitHub. Он сохраняется только в твоём браузере через localStorage.

## Важно

Сайт сам по себе не содержит токен Discord-бота. Отправку делает backend внутри бота на хостинге.
