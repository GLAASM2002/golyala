import "dotenv/config";
import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionsBitField
} from "discord.js";
import { commands, logAction } from "./commands/index.js";
import { db, getSettings } from "./db.js";
import { detectBallDexName } from "./services/ballDex.js";
import { startDashboard } from "./dashboard.js";

for (const key of ["DISCORD_TOKEN","DISCORD_CLIENT_ID","DISCORD_CLIENT_SECRET","SESSION_SECRET","PUBLIC_BASE_URL","DISCORD_REDIRECT_URI"]) {
  if (!process.env[key]) console.warn(`[config] Missing ${key}; some features may not work.`);
}
if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN.startsWith("replace_")) {
  console.error("Set DISCORD_TOKEN in your environment. Do not hardcode tokens.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel, Partials.Message]
});

const recentJoins = new Map();
client.once(Events.ClientReady, async c => {
  console.log(`Velora X1 logged in as ${c.user.tag}`);
  try {
    await c.application.commands.set(commands.map(c => c.builder.toJSON()));
    console.log(`Registered ${commands.length} slash commands.`);
  } catch (e) { console.error("Slash registration failed:", e); }
});

client.on(Events.GuildMemberAdd, async member => {
  const settings = getSettings(member.guild.id);
  if (settings.welcome_channel_id) {
    const ch = await member.guild.channels.fetch(settings.welcome_channel_id).catch(()=>null);
    if (ch?.isTextBased()) ch.send({embeds:[new EmbedBuilder().setColor(0xe11d48)
      .setTitle("Welcome to the server!")
      .setDescription(`Welcome ${member} to **${member.guild.name}**.`)
      .setThumbnail(member.user.displayAvatarURL({size:256}))]}).catch(()=>{});
  }
  if (!settings.anti_raid) return;
  const now = Date.now(), entries = (recentJoins.get(member.guild.id) || []).filter(t => now-t < 15_000);
  entries.push(now); recentJoins.set(member.guild.id,entries);
  if (entries.length >= 8) {
    await logAction(member.guild, `🚨 **Join-spike alert:** ${entries.length} members joined within 15 seconds. Staff should review the audit log and verify new accounts.`);
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  // BallDex detector is deliberately restricted to a configured channel.
  if (process.env.BALLDEX_CHANNEL_ID && message.channel.id === process.env.BALLDEX_CHANNEL_ID) {
    const ballName = detectBallDexName(message);
    if (ballName) await message.channel.send(`⚽ **BallDex spawn detected:** ${ballName}`).catch(()=>{});
  }

  const prefix = getSettings(message.guild.id).prefix;
  if (!message.content.startsWith(prefix)) return;
  const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = rawName?.toLowerCase();
  if (!name) return;
  const aliases = { "8ball":"8ball", "userinfo":"userinfo", "serverinfo":"serverinfo" };
  const c = commands.find(x => x.name === (aliases[name] || name));
  if (!c) return;
  // Prefix support for a safe subset; slash commands remain the canonical interface.
  try {
    if (name === "ping") return message.reply(`Pong! Gateway: ${Math.round(client.ws.ping)}ms`);
    if (name === "help") return message.reply(`**Velora X1 commands**\n${commands.map(x=>`\`${prefix}${x.name}\` — ${x.description}`).join("\n").slice(0,1800)}`);
    if (name === "serverinfo") return message.reply(`**${message.guild.name}** • ${message.guild.memberCount} members • ID ${message.guild.id}`);
    if (name === "roll") {
      const max = Math.min(1000000,Math.max(2,Number(args[0])||100));
      return message.reply(`🎲 You rolled **${Math.floor(Math.random()*max)+1}** (1–${max}).`);
    }
    if (name === "coinflip") return message.reply(`🪙 **${Math.random()<0.5?"Heads":"Tails"}!**`);
    if (name === "8ball") {
      const answers = ["Absolutely.","It is looking good.","Ask again in a moment.","Probably not.","The outlook is unclear."];
      return message.reply(`🎱 ${answers[Math.floor(Math.random()*answers.length)]}`);
    }
    if (name === "warn") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("You need Moderate Members permission.");
      const target = message.mentions.users.first();
      if (!target || args.length < 2) return message.reply(`Usage: ${prefix}warn @member reason`);
      const reason = args.slice(1).join(" ");
      db.prepare("INSERT INTO warnings(guild_id,user_id,moderator_id,reason) VALUES(?,?,?,?)").run(message.guild.id,target.id,message.author.id,reason);
      const sent = await target.send(`⚠️ You were warned in **${message.guild.name}**. Reason: ${reason}`).then(()=>true).catch(()=>false);
      await logAction(message.guild,`⚠️ **${target.tag}** warned by ${message.author.tag}. Reason: ${reason}`);
      return message.reply(`Warned ${target.tag}. DM ${sent?"sent":"could not be delivered"}.`);
    }
    if (name === "timeout") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return message.reply("You need Moderate Members permission.");
      const target = message.mentions.members.first();
      const minutes = Number(args[1]);
      if (!target || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) return message.reply(`Usage: ${prefix}timeout @member minutes [reason]`);
      if (!target.moderatable) return message.reply("I cannot timeout that member; check role hierarchy.");
      const reason = args.slice(2).join(" ") || `Action by ${message.author.tag}`;
      await target.user.send(`You were timed out in **${message.guild.name}** for ${minutes} minute(s). Reason: ${reason}`).catch(()=>{});
      await target.timeout(minutes*60_000,reason);
      await logAction(message.guild,`⏱️ **${target.user.tag}** timed out for ${minutes}m by ${message.author.tag}. Reason: ${reason}`);
      return message.reply(`Timed out ${target.user.tag} for ${minutes} minute(s).`);
    }
  } catch (e) {
    console.error(`Prefix command ${name} failed:`,e);
    message.reply("That command failed. Check bot permissions and role hierarchy.").catch(()=>{});
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "agreement:accept") {
        db.prepare("INSERT OR IGNORE INTO agreements(user_id) VALUES(?)").run(interaction.user.id);
        return interaction.update({content:"Thanks — your agreement acceptance has been saved. You can now use Velora X1.",components:[]});
      }
      if (interaction.customId === "agreement:cancel") return interaction.update({content:"Agreement cancelled. No acceptance was stored.",components:[]});
    }
    if (!interaction.isChatInputCommand()) return;
    const c = commands.find(x=>x.name===interaction.commandName);
    if (!c) return;
    if (c.defaultPerms && !interaction.memberPermissions?.has(c.defaultPerms)) {
      return interaction.reply({content:"You do not have permission to use this command.",ephemeral:true});
    }
    await c.handler(interaction);
  } catch (e) {
    console.error("Interaction error:",e);
    const payload = {content:"Something went wrong while running that command. Check bot permissions and try again.",ephemeral:true};
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(()=>{});
    else await interaction.reply(payload).catch(()=>{});
  }
});

await startDashboard(client);
client.login(process.env.DISCORD_TOKEN);
