# Velora X1
Discord.js 14 community bot and OAuth dashboard, built for Railway.

## Setup
1. Use Node.js 20+ and copy `.env.example` to `.env`.
2. Reset/regenerate the exposed Discord bot token and OAuth client secret; never commit `.env`.
3. Enable Server Members Intent and Message Content Intent in Discord Developer Portal.
4. `npm install`, then `npm run deploy:commands`, then `npm start`.
5. Configure OAuth redirect URL to exactly match `DISCORD_REDIRECT_URI`.
6. Railway: deploy this repository, set variables from `.env.example`, set `PUBLIC_BASE_URL` and `DISCORD_REDIRECT_URI` to your Railway domain, and attach a persistent volume for SQLite.

## Included
100 slash command definitions and 150 prefix command entries with descriptions; functional handlers for common moderation, utility, role, poll, logging, and security workflows; OAuth login/dashboard; channel logging settings; draggable help-menu ordering; role builder; welcome messages; join-spike alerts; configurable BallDex spawn-text watcher; Railway config and SVG section art.

This is an extensible starter, not a 100% Dyno clone. Some catalog commands return explanatory responses rather than executing a specialized feature. Anti-nuke detection is not a guarantee and does not yet roll back destructive actions. Discord does not let bots delete arbitrary DMs between users; Velora can only manage its own messages where permitted. The bot cannot be launched persistently from this chat.
