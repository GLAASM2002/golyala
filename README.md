# Velora X1 — Discord bot + dashboard

A Railway-ready Node.js / Discord.js 14 bot project with slash and prefix command foundations, Discord OAuth2 dashboard, moderation, audit logging, join-spike alerts, first-use agreement, and a configurable BallDex spawn-message detector.

## Important security note
The bot token and OAuth client secret must remain private. Since credentials were pasted into chat, **rotate the bot token and client secret in the Discord Developer Portal before deployment**. Never paste secrets into source code or commit `.env`.

## Included
- Discord.js 14 bot with slash commands and prefix commands (default `!`)
- Working moderation: `/ban`, `/kick`, `/timeout`, `/untimeout`, `/warn`, `/warnings`, `/purge`
- Utility / fun: server and member info, role/channel info, avatar, polls, random choice, text tools, timestamps, reminders, games, and bot diagnostics
- Config: `/prefix`, `/setlog`, `/setwelcome`, `/antiraid`, `/agreement`
- Basic event/audit logging and join-spike alerting (configurable)
- Dashboard login with Discord OAuth2 state validation; guild selection and settings
- Drag-and-drop dashboard help-category ordering
- First-use agreement button; acceptance stored per user
- BallDex detector watches an explicitly configured channel for spawn-like messages and announces the detected name
- Railway files, `.env.example`, SQLite persistence

## Honest scope
This project is a growing functional bot, **not a 1:1 Dyno clone and not a verified 250-command release**. The current slash-command registry contains 46 implemented commands across moderation, configuration, utility and fun categories; prefix support is intentionally a smaller subset. Discord currently limits an application to 100 global chat-input commands, so a 250-command catalog must combine slash commands with prefix commands or grouped subcommands. Features such as full ticket workflows, music playback, a web-based case-management suite, advanced automod, and production-grade anti-nuke policies are not implemented here and must not be treated as available. The dashboard controls the settings currently shown; it is not yet a complete replacement for every Dyno dashboard module.

## Setup
1. Create an application at https://discord.com/developers/applications.
2. Under **Bot**, reset/rotate the token and enable **Server Members Intent** and **Message Content Intent** if using prefix commands and member join detection. Keep privileged intents limited to what you need.
3. Under **OAuth2 → General**, add the exact redirect URI from `DISCORD_REDIRECT_URI`, for example `https://YOUR-RAILWAY-DOMAIN.up.railway.app/auth/callback`. Rotate any token or client secret that was previously shared.
4. Invite with scopes `bot applications.commands`; grant only the permissions the bot needs (View Channels, Send Messages, Embed Links, Read Message History, Moderate Members, Kick Members, Ban Members, Manage Messages, View Audit Log if desired).
5. Copy `.env.example` to `.env`, fill in values, and set `DISCORD_REDIRECT_URI` and `PUBLIC_BASE_URL` to the same public Railway domain.
6. Install and run locally:
   ```bash
   npm install
   npm run check
   npm start
   ```
7. Push the project to a private GitHub repo, create a Railway service from it, and add all `.env` values in Railway Variables. Generate a long random `SESSION_SECRET`. Add a persistent volume mounted at `/app/data` so SQLite data survives redeploys. Set `DATABASE_PATH=/app/data/velora.sqlite`.
8. After first startup, visit the Railway URL and sign in with Discord.

## Discord app settings
The bot registers slash commands globally at startup. Global command propagation can take time. Use a test guild for development if you need faster iteration.

## Dashboard
- `/` — home and feature overview
- `/auth/login` — Discord OAuth2 login
- `/dashboard` — guilds where the user has Manage Server permission and the bot is installed
- `/dashboard/:guildId` — prefix, log channel, welcome channel, anti-raid toggle, and draggable help categories

## Limits and safety behavior
- Discord bots cannot delete arbitrary messages from a user's personal DM inbox. This project does **not** claim that consent grants that capability. The agreement is informational consent for using Velora X1; the bot can delete only messages it authored where Discord permissions/API permit it.
- Anti-nuke protection is intentionally conservative: join-spike alerts and audit logs are included, but automatic punitive actions against admins are not enabled by default. Test protections on a private server before relying on them.
- BallDex detection is heuristic and channel-scoped. Configure `BALLDEX_CHANNEL_ID`; customize `src/services/ballDex.js` for the specific BallDex bot embed format you see.
- Use Discord's policies and your jurisdiction's privacy requirements when logging messages or storing consent.

## Adding features
Add a command in `src/commands/` and register it in `src/commands/index.js`. Every command should declare a name, description, options, and a handler. Test permission boundaries and failure cases before production deployment.
