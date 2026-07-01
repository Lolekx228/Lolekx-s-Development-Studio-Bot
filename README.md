LDS Message Studio - Discord-like redesign + Components V2 update

Replace on GitHub Pages:
- github-pages/index.html
- github-pages/style.css
- github-pages/app.js

Replace on bot hosting:
- bot-host/src/web/apiServer.js -> src/web/apiServer.js

Replace in Google Apps Script:
- google-apps-script/Code.gs

After editing Google Apps Script:
Deploy -> Manage deployments -> Edit -> Version: New version -> Deploy

After replacing apiServer.js on the host, restart the bot.
No npm install and no deploy:commands required for this update.

New features:
- Interface redesigned closer to Discohook layout.
- Classic mode: content + embeds + link buttons.
- Components V2 mode: Container, Text Display, Section + accessory link button, Separator, Media Gallery.
- Link buttons can be disabled globally and per button.
- Buttons can have emoji.
- Server emoji loader through /api/emojis.
- Unicode/stock emoji helper.
- User/role mention helpers still work.
- @everyone and @here are still blocked.
