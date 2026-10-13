import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH || "./data/velora.sqlite";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '!',
  log_channel_id TEXT,
  welcome_channel_id TEXT,
  anti_raid INTEGER NOT NULL DEFAULT 0,
  help_order TEXT NOT NULL DEFAULT '["Moderation","Utility","Fun","Security","Configuration"]'
);
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agreements (
  user_id TEXT PRIMARY KEY,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired INTEGER NOT NULL
);
`);
export function getSettings(guildId) {
  return db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId) ??
    { guild_id: guildId, prefix: process.env.DEFAULT_PREFIX || "!", log_channel_id: null,
      welcome_channel_id: null, anti_raid: 0,
      help_order: JSON.stringify(["Moderation","Utility","Fun","Security","Configuration"]) };
}
export function updateSettings(guildId, fields) {
  const current = getSettings(guildId);
  const next = { ...current, ...fields, guild_id: guildId };
  db.prepare(`INSERT INTO guild_settings (guild_id,prefix,log_channel_id,welcome_channel_id,anti_raid,help_order)
    VALUES (@guild_id,@prefix,@log_channel_id,@welcome_channel_id,@anti_raid,@help_order)
    ON CONFLICT(guild_id) DO UPDATE SET prefix=excluded.prefix, log_channel_id=excluded.log_channel_id,
    welcome_channel_id=excluded.welcome_channel_id, anti_raid=excluded.anti_raid, help_order=excluded.help_order`).run(next);
  return next;
}
