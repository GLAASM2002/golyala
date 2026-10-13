import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from "discord.js";
import { db, getSettings, updateSettings } from "../db.js";

const command = (name, description, options, handler, category = "Utility", defaultPerms) => ({
  name, description, options, handler, category, defaultPerms
});
const userOption = (name = "user", description = "Target member") => ({
  type: "user", name, description, required: true
});
const stringOption = (name, description, required = true) => ({
  type: "string", name, description, required
});
const integerOption = (name, description, required = true, min_value = 1, max_value = 100) => ({
  type: "integer", name, description, required, min_value, max_value
});
const reasonOption = { type: "string", name: "reason", description: "Reason for this action", required: false };

function makeBuilder(c) {
  const b = new SlashCommandBuilder().setName(c.name).setDescription(c.description);
  if (c.defaultPerms) b.setDefaultMemberPermissions(c.defaultPerms);
  for (const o of c.options || []) {
    if (o.type === "user") b.addUserOption(x => x.setName(o.name).setDescription(o.description).setRequired(o.required));
    if (o.type === "string") b.addStringOption(x => {
      x.setName(o.name).setDescription(o.description).setRequired(o.required);
      if (o.choices) x.addChoices(...o.choices);
      return x;
    });
    if (o.type === "integer") b.addIntegerOption(x => x.setName(o.name).setDescription(o.description).setRequired(o.required).setMinValue(o.min_value).setMaxValue(o.max_value));
    if (o.type === "channel") b.addChannelOption(x => x.setName(o.name).setDescription(o.description).setRequired(o.required).addChannelTypes(ChannelType.GuildText));
    if (o.type === "role") b.addRoleOption(x => x.setName(o.name).setDescription(o.description).setRequired(o.required));
    if (o.type === "boolean") b.addBooleanOption(x => x.setName(o.name).setDescription(o.description).setRequired(o.required));
  }
  return b;
}
const commands = [];
const add = c => commands.push({ ...c, builder: makeBuilder(c) });
const modPerm = PermissionFlagsBits.ModerateMembers;
const manageMsg = PermissionFlagsBits.ManageMessages;
const kickPerm = PermissionFlagsBits.KickMembers;
const banPerm = PermissionFlagsBits.BanMembers;

add(command("ping", "Show bot latency and API status.", [], async i => i.reply({ content: `Pong! Gateway: ${Math.round(i.client.ws.ping)}ms`, ephemeral: true }), "Utility"));
add(command("help", "Browse Velora X1 commands and feature categories.", [], async i => {
  const grouped = Object.groupBy ? Object.groupBy(commands, c => c.category) : commands.reduce((a,c) => ((a[c.category] ||= []).push(c),a),{});
  const embed = new EmbedBuilder().setColor(0xe11d48).setTitle("Velora X1 • Command Center")
    .setDescription("Choose a category below. Prefix commands use your server's configured prefix.")
    .addFields(Object.entries(grouped).map(([name, list]) => ({ name: `${name} (${list.length})`, value: list.slice(0, 8).map(c => `\`/${c.name}\` — ${c.description.slice(0, 65)}`).join("\n") || "No commands" })))
    .setFooter({ text: `${commands.length} implemented slash commands • Velora X1` });
  return i.reply({ embeds: [embed], ephemeral: true });
}, "Utility"));
add(command("serverinfo", "Show information about this server.", [], async i => {
  const g = i.guild;
  return i.reply({ embeds: [new EmbedBuilder().setColor(0xe11d48).setTitle(g.name)
    .setThumbnail(g.iconURL({ size: 256 })).addFields(
      {name:"Members",value:String(g.memberCount),inline:true},
      {name:"Created",value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
      {name:"Owner",value:`<@${g.ownerId}>`,inline:true}
    )], ephemeral: true });
}, "Utility"));
add(command("userinfo", "Show information about a server member.", [userOption()], async i => {
  const user = i.options.getUser("user");
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  return i.reply({ embeds: [new EmbedBuilder().setColor(0xe11d48).setTitle(user.tag)
    .setThumbnail(user.displayAvatarURL({size:256})).addFields(
      {name:"User ID",value:user.id,inline:true},
      {name:"Joined server",value:member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : "Unknown",inline:true},
      {name:"Account created",value:`<t:${Math.floor(user.createdTimestamp/1000)}:R>`,inline:true}
    )], ephemeral: true });
}, "Utility"));
add(command("avatar", "Show a user's avatar.", [{...userOption(), required:false}], async i => {
  const user = i.options.getUser("user") || i.user;
  return i.reply({ embeds: [new EmbedBuilder().setColor(0xe11d48).setTitle(`${user.username}'s avatar`).setImage(user.displayAvatarURL({size:1024}))] });
}, "Utility"));
add(command("roll", "Roll a random number between 1 and a chosen maximum.", [integerOption("max","Maximum number",false,2,1000000)], async i => {
  const max = i.options.getInteger("max") || 100;
  return i.reply(`🎲 You rolled **${Math.floor(Math.random()*max)+1}** (1–${max}).`);
}, "Fun"));
add(command("coinflip", "Flip a coin.", [], async i => i.reply(`🪙 **${Math.random()<0.5?"Heads":"Tails"}!`), "Fun"));
add(command("8ball", "Ask the magic 8-ball a question.", [stringOption("question","Your question")], async i => {
  const answers = ["Absolutely.","It is looking good.","Ask again in a moment.","Probably not.","The outlook is unclear.","Without a doubt.","I wouldn't count on it."];
  return i.reply(`🎱 ${answers[Math.floor(Math.random()*answers.length)]}`);
}, "Fun"));
add(command("poll", "Create a simple yes/no poll.", [stringOption("question","Poll question")], async i => {
  const msg = await i.reply({ content: `📊 **Poll:** ${i.options.getString("question")}\nReact with 👍 or 👎.`, fetchReply: true });
  await msg.react("👍"); await msg.react("👎");
}, "Fun"));

add(command("ban", "Ban a member from this server.", [userOption(), reasonOption], async i => {
  const user = i.options.getUser("user");
  const reason = i.options.getString("reason") || `Action by ${i.user.tag}`;
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  if (!member) return i.reply({content:"That member is not in this server.",ephemeral:true});
  if (!member.bannable) return i.reply({content:"I cannot ban that member. Check role hierarchy and permissions.",ephemeral:true});
  await user.send(`You were banned from **${i.guild.name}**. Reason: ${reason}`).catch(()=>{});
  await member.ban({reason});
  await logAction(i.guild, `🔨 **${user.tag}** was banned by ${i.user.tag}. Reason: ${reason}`);
  return i.reply({content:`Banned **${user.tag}**. Reason: ${reason}`,ephemeral:true});
}, "Moderation", banPerm));
add(command("kick", "Kick a member from this server.", [userOption(), reasonOption], async i => {
  const user = i.options.getUser("user");
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  const reason = i.options.getString("reason") || `Action by ${i.user.tag}`;
  if (!member?.kickable) return i.reply({content:"I cannot kick that member. Check role hierarchy and permissions.",ephemeral:true});
  await user.send(`You were kicked from **${i.guild.name}**. Reason: ${reason}`).catch(()=>{});
  await member.kick(reason);
  await logAction(i.guild, `👢 **${user.tag}** was kicked by ${i.user.tag}. Reason: ${reason}`);
  return i.reply({content:`Kicked **${user.tag}**. Reason: ${reason}`,ephemeral:true});
}, "Moderation", kickPerm));
add(command("timeout", "Timeout a member for up to 28 days.", [userOption(), integerOption("minutes","Duration in minutes",true,1,40320), reasonOption], async i => {
  const user = i.options.getUser("user"), member = await i.guild.members.fetch(user.id).catch(()=>null);
  const minutes = i.options.getInteger("minutes"), reason = i.options.getString("reason") || `Action by ${i.user.tag}`;
  if (!member?.moderatable) return i.reply({content:"I cannot timeout that member. Check role hierarchy and permissions.",ephemeral:true});
  await user.send(`You were timed out in **${i.guild.name}** for ${minutes} minute(s). Reason: ${reason}`).catch(()=>{});
  await member.timeout(minutes*60_000, reason);
  await logAction(i.guild, `⏱️ **${user.tag}** timed out for ${minutes}m by ${i.user.tag}. Reason: ${reason}`);
  return i.reply({content:`Timed out **${user.tag}** for ${minutes} minute(s).`,ephemeral:true});
}, "Moderation", modPerm));
add(command("untimeout", "Remove a member's timeout.", [userOption(), reasonOption], async i => {
  const user = i.options.getUser("user"), member = await i.guild.members.fetch(user.id).catch(()=>null);
  if (!member?.moderatable) return i.reply({content:"I cannot edit that member. Check role hierarchy.",ephemeral:true});
  await member.timeout(null, i.options.getString("reason") || `Action by ${i.user.tag}`);
  return i.reply({content:`Removed timeout for **${user.tag}**.`,ephemeral:true});
}, "Moderation", modPerm));
add(command("warn", "Record a warning and notify the member by DM.", [userOption(), stringOption("reason","Reason for warning")], async i => {
  const user = i.options.getUser("user"), reason = i.options.getString("reason");
  db.prepare("INSERT INTO warnings(guild_id,user_id,moderator_id,reason) VALUES(?,?,?,?)").run(i.guildId,user.id,i.user.id,reason);
  const dmSent = await user.send(`⚠️ You were warned in **${i.guild.name}**. Reason: ${reason}`).then(()=>true).catch(()=>false);
  await logAction(i.guild, `⚠️ **${user.tag}** warned by ${i.user.tag}. Reason: ${reason}`);
  return i.reply({content:`Warned **${user.tag}**. DM ${dmSent?"sent":"could not be delivered (DMs may be closed)"}.`,ephemeral:true});
}, "Moderation", manageMsg));
add(command("warnings", "List recorded warnings for a member.", [userOption()], async i => {
  const user = i.options.getUser("user");
  const rows = db.prepare("SELECT reason, moderator_id, created_at FROM warnings WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 10").all(i.guildId,user.id);
  return i.reply({content:rows.length ? `Warnings for <@${user.id}>:\n${rows.map((r,n)=>`${n+1}. ${r.reason} — <@${r.moderator_id}> (${r.created_at})`).join("\n")}` : "No warnings found.",ephemeral:true});
}, "Moderation", manageMsg));
add(command("purge", "Delete up to 100 recent messages in this channel.", [integerOption("amount","Number of messages",true,1,100)], async i => {
  const amount = i.options.getInteger("amount");
  if (!i.channel?.bulkDelete) return i.reply({content:"This channel does not support bulk deletion.",ephemeral:true});
  const deleted = await i.channel.bulkDelete(amount, true);
  return i.reply({content:`Deleted ${deleted.size} recent messages. Messages older than 14 days cannot be bulk-deleted.`,ephemeral:true});
}, "Moderation", manageMsg));
add(command("setlog", "Set the channel for moderation and bot logs.", [{type:"channel",name:"channel",description:"Log channel",required:true}], async i => {
  const ch = i.options.getChannel("channel");
  updateSettings(i.guildId,{log_channel_id:ch.id});
  return i.reply({content:`Log channel set to ${ch}.`,ephemeral:true});
}, "Configuration", PermissionFlagsBits.ManageGuild));
add(command("setwelcome", "Set the channel for new-member welcome messages.", [{type:"channel",name:"channel",description:"Welcome channel",required:true}], async i => {
  const ch = i.options.getChannel("channel");
  updateSettings(i.guildId,{welcome_channel_id:ch.id});
  return i.reply({content:`Welcome channel set to ${ch}.`,ephemeral:true});
}, "Configuration", PermissionFlagsBits.ManageGuild));
add(command("prefix", "View or change this server's prefix command trigger.", [{type:"string",name:"value",description:"New prefix (1–5 characters)",required:false}], async i => {
  if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return i.reply({content:"You need Manage Server permission.",ephemeral:true});
  const value = i.options.getString("value");
  if (!value) return i.reply({content:`Current prefix: \`${getSettings(i.guildId).prefix}\``,ephemeral:true});
  if (value.length>5 || /\s/.test(value)) return i.reply({content:"Prefix must be 1–5 characters and contain no spaces.",ephemeral:true});
  updateSettings(i.guildId,{prefix:value});
  return i.reply({content:`Prefix updated to \`${value}\`.`,ephemeral:true});
}, "Configuration", PermissionFlagsBits.ManageGuild));
add(command("antiraid", "Enable or disable join-spike alerts for this server.", [{type:"boolean",name:"enabled",description:"Enable join-spike alerts",required:true}], async i => {
  if (!i.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return i.reply({content:"You need Manage Server permission.",ephemeral:true});
  const enabled = i.options.getBoolean("enabled");
  updateSettings(i.guildId,{anti_raid:enabled?1:0});
  return i.reply({content:`Join-spike alerts ${enabled?"enabled":"disabled"}. This alerts staff; it does not automatically punish users.`,ephemeral:true});
}, "Security", PermissionFlagsBits.ManageGuild));
add(command("agreement", "Show the Velora X1 first-use agreement.", [], async i => {
  const accepted = db.prepare("SELECT user_id FROM agreements WHERE user_id=?").get(i.user.id);
  if (accepted) return i.reply({content:"You have already accepted the Velora X1 agreement.",ephemeral:true});
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("agreement:accept").setLabel("I Agree").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("agreement:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  return i.reply({content:"**Velora X1 — First-use agreement**\nBy continuing, you understand that moderators may use the bot to apply server moderation actions, and that some actions may send you a DM. Server logs should be configured transparently by server administrators. Velora X1 cannot delete arbitrary messages from your personal DM inbox. You can cancel instead of accepting.",components:[row],ephemeral:true});
}, "Security"));
add(command("invite", "Get an invite link for Velora X1.", [], async i => {
  const id = process.env.DISCORD_CLIENT_ID || i.client.user.id;
  const url = `https://discord.com/oauth2/authorize?client_id=${id}&permissions=1099780117638&scope=bot%20applications.commands`;
  return i.reply({content:`Add Velora X1: ${url}`,ephemeral:true});
}, "Utility"));

// Additional practical server-management commands. Each command validates permissions and
// relies on Discord's role hierarchy rather than claiming an action succeeded prematurely.
const manageChannels = PermissionFlagsBits.ManageChannels;
const manageRoles = PermissionFlagsBits.ManageRoles;
const manageNicknames = PermissionFlagsBits.ManageNicknames;
const manageGuild = PermissionFlagsBits.ManageGuild;
const optionalString = (name, description) => ({ type: "string", name, description, required: false });
const channelOption = (name="channel", description="Target text channel") => ({type:"channel",name,description,required:false});
const roleOption = (name="role", description="Role to assign") => ({type:"role",name,description,required:true});

add(command("slowmode", "Set slowmode for a text channel in seconds (0 disables it).", [integerOption("seconds","Seconds, from 0 to 21600",true,0,21600), channelOption()], async i => {
  const ch=i.options.getChannel("channel") || i.channel;
  if(!ch?.isTextBased() || !("setRateLimitPerUser" in ch)) return i.reply({content:"Choose a text channel that supports slowmode.",ephemeral:true});
  await ch.setRateLimitPerUser(i.options.getInteger("seconds"),`Slowmode updated by ${i.user.tag}`);
  return i.reply({content:`Slowmode set to **${i.options.getInteger("seconds")}s** in ${ch}.`,ephemeral:true});
},"Moderation",manageChannels));
add(command("lock", "Prevent @everyone from sending messages in a text channel.", [channelOption()], async i => {
  const ch=i.options.getChannel("channel") || i.channel;
  if(!ch?.isTextBased() || !ch.permissionOverwrites) return i.reply({content:"Choose a lockable text channel.",ephemeral:true});
  await ch.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:false}, {reason:`Locked by ${i.user.tag}`});
  await logAction(i.guild,`🔒 ${ch} locked by ${i.user.tag}`);
  return i.reply({content:`Locked ${ch}.`,ephemeral:true});
},"Moderation",manageChannels));
add(command("unlock", "Allow @everyone to send messages in a text channel again.", [channelOption()], async i => {
  const ch=i.options.getChannel("channel") || i.channel;
  if(!ch?.isTextBased() || !ch.permissionOverwrites) return i.reply({content:"Choose a lockable text channel.",ephemeral:true});
  await ch.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:null}, {reason:`Unlocked by ${i.user.tag}`});
  await logAction(i.guild,`🔓 ${ch} unlocked by ${i.user.tag}`);
  return i.reply({content:`Unlocked ${ch}.`,ephemeral:true});
},"Moderation",manageChannels));
add(command("nick", "Change a member's server nickname.", [userOption(), optionalString("nickname","New nickname; leave blank to clear")], async i => {
  const user=i.options.getUser("user"), member=await i.guild.members.fetch(user.id).catch(()=>null);
  if(!member?.moderatable && member?.id!==i.guild.ownerId) return i.reply({content:"I cannot change that member's nickname due to role hierarchy.",ephemeral:true});
  const nickname=i.options.getString("nickname");
  await member.setNickname(nickname || null,`Nickname changed by ${i.user.tag}`);
  return i.reply({content:`Nickname updated for ${user.tag}.`,ephemeral:true});
},"Moderation",manageNicknames));
add(command("role-add", "Assign a role to a member.", [userOption(),roleOption()], async i => {
  const user=i.options.getUser("user"), role=i.options.getRole("role"), member=await i.guild.members.fetch(user.id).catch(()=>null);
  if(!role.editable || role.managed) return i.reply({content:"I cannot assign that role; check bot role hierarchy.",ephemeral:true});
  if(!member) return i.reply({content:"Member not found in this server.",ephemeral:true});
  await member.roles.add(role,`Role assigned by ${i.user.tag}`);
  return i.reply({content:`Assigned ${role} to ${user}.`,ephemeral:true});
},"Moderation",manageRoles));
add(command("role-remove", "Remove a role from a member.", [userOption(),roleOption()], async i => {
  const user=i.options.getUser("user"), role=i.options.getRole("role"), member=await i.guild.members.fetch(user.id).catch(()=>null);
  if(!role.editable || role.managed) return i.reply({content:"I cannot remove that role; check bot role hierarchy.",ephemeral:true});
  if(!member) return i.reply({content:"Member not found in this server.",ephemeral:true});
  await member.roles.remove(role,`Role removed by ${i.user.tag}`);
  return i.reply({content:`Removed ${role} from ${user}.`,ephemeral:true});
},"Moderation",manageRoles));
add(command("membercount", "Show the server's current member count.", [], async i => i.reply(`👥 **${i.guild.name}** has **${i.guild.memberCount}** members.`),"Utility"));
add(command("roleinfo", "Show information about a role.", [roleOption()], async i => {
  const r=i.options.getRole("role");
  return i.reply({embeds:[new EmbedBuilder().setColor(r.color || 0xe11d48).setTitle(r.name).addFields(
    {name:"Role ID",value:r.id,inline:true},{name:"Members",value:String(r.members.size),inline:true},
    {name:"Mentionable",value:r.mentionable?"Yes":"No",inline:true},{name:"Position",value:String(r.position),inline:true}
  )],ephemeral:true});
},"Utility"));
add(command("channelinfo", "Show information about a text channel.", [channelOption("channel","Channel to inspect")], async i => {
  const ch=i.options.getChannel("channel") || i.channel;
  return i.reply({embeds:[new EmbedBuilder().setColor(0xe11d48).setTitle(`#${ch.name || "channel"}`).setDescription(`ID: ${ch.id}\nType: ${ch.type}\nCreated: <t:${Math.floor(ch.createdTimestamp/1000)}:R>`)],ephemeral:true});
},"Utility"));
add(command("botinfo", "Show Velora X1 runtime and version information.", [], async i => i.reply({embeds:[new EmbedBuilder().setColor(0xe11d48).setTitle("Velora X1").setDescription("Moderation, utility, security alerts and community tools.").addFields(
  {name:"Servers",value:String(i.client.guilds.cache.size),inline:true},{name:"Uptime",value:`${Math.floor(i.client.uptime/3600000)}h ${Math.floor(i.client.uptime%3600000/60000)}m`,inline:true},{name:"Node.js",value:process.version,inline:true}
)],ephemeral:true}),"Utility"));
add(command("say", "Make Velora X1 repeat a message in the current channel.", [stringOption("message","Text to send")], async i => {
  if(!i.memberPermissions.has(manageGuild)) return i.reply({content:"You need Manage Server permission.",ephemeral:true});
  const text=i.options.getString("message").slice(0,1800);
  await i.reply({content:"Message sent.",ephemeral:true});
  await i.channel.send({content:text,allowedMentions:{parse:[]}});
},"Utility",manageGuild));
add(command("announce", "Post an announcement to a chosen text channel.", [{type:"channel",name:"channel",description:"Destination channel",required:true},stringOption("message","Announcement text")], async i => {
  const ch=i.options.getChannel("channel");
  await ch.send({content:`📢 **Announcement**\n${i.options.getString("message").slice(0,1800)}`,allowedMentions:{parse:[]}});
  return i.reply({content:`Announcement posted in ${ch}.`,ephemeral:true});
},"Utility",manageGuild));
add(command("poll-create", "Create a poll with up to three options.", [stringOption("question","Poll question"),stringOption("option1","First option"),stringOption("option2","Second option"),optionalString("option3","Optional third option")], async i => {
  const opts=[i.options.getString("option1"),i.options.getString("option2"),i.options.getString("option3")].filter(Boolean);
  const emojis=["🇦","🇧","🇨"];
  const msg=await i.reply({content:`📊 **${i.options.getString("question").slice(0,250)}**\n${opts.map((x,n)=>`${emojis[n]} ${x.slice(0,150)}`).join("\n")}`,fetchReply:true,allowedMentions:{parse:[]}});
  for(let n=0;n<opts.length;n++) await msg.react(emojis[n]);
},"Fun"));
add(command("choose", "Choose randomly from a comma-separated list.", [stringOption("options","At least two comma-separated choices")], async i => {
  const choices=i.options.getString("options").split(",").map(x=>x.trim()).filter(Boolean);
  if(choices.length<2) return i.reply({content:"Provide at least two choices separated by commas.",ephemeral:true});
  return i.reply(`🎯 I choose: **${choices[Math.floor(Math.random()*choices.length)].slice(0,200)}**`);
},"Fun"));
add(command("reverse", "Reverse a text string.", [stringOption("text","Text to reverse")], async i => i.reply(i.options.getString("text").slice(0,1800).split("").reverse().join("")),"Fun"));
add(command("clap", "Add clap emojis between words.", [stringOption("text","Text to clapify")], async i => i.reply(i.options.getString("text").slice(0,700).split(/\s+/).join(" 👏 ").slice(0,1800)),"Fun"));
add(command("character-count", "Count characters and words in text.", [stringOption("text","Text to count")], async i => {
  const t=i.options.getString("text"); return i.reply(`Characters: **${t.length}**\nWords: **${t.trim()?t.trim().split(/\s+/).length:0}**`);
},"Utility"));
add(command("timestamp", "Convert a Unix timestamp into Discord timestamp formats.", [integerOption("unix","Unix timestamp in seconds",true,1,2147483647)], async i => {
  const t=i.options.getInteger("unix"); return i.reply(`Unix: ${t}\nLocal date: <t:${t}:F>\nRelative: <t:${t}:R>\nCode: \`<t:${t}:F>\``);
},"Utility"));
add(command("remind-me", "Create a simple reminder (1–1440 minutes).", [integerOption("minutes","Minutes from now",true,1,1440),stringOption("message","Reminder text")], async i => {
  const minutes=i.options.getInteger("minutes"), text=i.options.getString("message").slice(0,500);
  await i.reply({content:`Reminder set for <t:${Math.floor(Date.now()/1000)+minutes*60}:R>. I will DM you if DMs are open.`,ephemeral:true});
  setTimeout(()=>i.user.send(`⏰ Reminder from **${i.guild?.name || "Velora X1"}**: ${text}`).catch(()=>{}),minutes*60_000).unref?.();
},"Utility"));
add(command("warn-clear", "Delete all stored warnings for a member.", [userOption()], async i => {
  const user=i.options.getUser("user"); const result=db.prepare("DELETE FROM warnings WHERE guild_id=? AND user_id=?").run(i.guildId,user.id);
  await logAction(i.guild,`🧹 ${i.user.tag} cleared ${result.changes} warning(s) for ${user.tag}`);
  return i.reply({content:`Cleared ${result.changes} warning(s) for ${user.tag}.`,ephemeral:true});
},"Moderation",manageGuild));
add(command("unban", "Unban a user by their Discord ID.", [stringOption("user_id","User ID to unban"),reasonOption], async i => {
  const id=i.options.getString("user_id");
  if(!/^\d{17,20}$/.test(id)) return i.reply({content:"Enter a valid Discord user ID.",ephemeral:true});
  await i.guild.members.unban(id,i.options.getString("reason") || `Unban by ${i.user.tag}`);
  await logAction(i.guild,`♻️ User ID ${id} unbanned by ${i.user.tag}`);
  return i.reply({content:`Unbanned user ID ${id}.`,ephemeral:true});
},"Moderation",banPerm));
add(command("set-topic", "Set the topic for a text channel.", [stringOption("topic","New topic; empty clears it",false),channelOption()], async i => {
  const ch=i.options.getChannel("channel") || i.channel;
  if(!ch?.setTopic) return i.reply({content:"This channel does not support topics.",ephemeral:true});
  await ch.setTopic(i.options.getString("topic") || null,`Topic updated by ${i.user.tag}`);
  return i.reply({content:`Updated the topic for ${ch}.`,ephemeral:true});
},"Configuration",manageChannels));
add(command("server-icon", "Display the server icon.", [], async i => {
  const url=i.guild.iconURL({size:1024}); return i.reply(url ? {embeds:[new EmbedBuilder().setTitle(`${i.guild.name} icon`).setImage(url)]} : {content:"This server has no custom icon."});
},"Utility"));
add(command("joined-at", "Show when a member joined this server.", [userOption()], async i => {
  const user=i.options.getUser("user"), m=await i.guild.members.fetch(user.id).catch(()=>null);
  return i.reply(m?.joinedTimestamp ? `${user} joined <t:${Math.floor(m.joinedTimestamp/1000)}:F> (<t:${Math.floor(m.joinedTimestamp/1000)}:R>).` : "That member is not in this server.");
},"Utility"));

export async function logAction(guild, content) {
  const settings = getSettings(guild.id);
  if (!settings.log_channel_id) return;
  const channel = await guild.channels.fetch(settings.log_channel_id).catch(()=>null);
  if (channel?.isTextBased()) await channel.send({content}).catch(()=>{});
}
export { commands };
