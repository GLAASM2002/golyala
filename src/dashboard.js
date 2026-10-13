import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSettings, updateSettings } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLiteStore = SQLiteStoreFactory(session);
const CATEGORIES = ["Moderation","Utility","Fun","Security","Configuration"];

export async function startDashboard(client) {
  const app = express();
  app.set("view engine","ejs");
  app.set("views",path.join(__dirname,"../views"));
  app.use(express.urlencoded({extended:false,limit:"20kb"}));
  app.use(express.json({limit:"20kb"}));
  app.use(express.static(path.join(__dirname,"../public")));
  app.use(helmet({contentSecurityPolicy:false}));
  app.use(session({
    store:new SQLiteStore({db:"sessions.sqlite",dir:process.env.DATABASE_PATH ? path.dirname(path.resolve(process.env.DATABASE_PATH)) : "./data"}),
    secret:process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? (()=>{throw new Error("SESSION_SECRET must be set in production")})() : "unsafe-dev-secret-change-this"),
    resave:false,saveUninitialized:false,
    cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:7*24*60*60*1000}
  }));
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${base}/auth/callback`;
  const oauthScopes = encodeURIComponent("identify guilds");
  const buildOAuthUrl = state => `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${oauthScopes}&state=${state}`;

  const requireAuth=(req,res,next)=>req.session.user ? next() : res.redirect("/auth/login");
  app.get("/",(req,res)=>res.render("home",{user:req.session.user,oauthUrl,client}));
  app.get("/auth/login",(req,res)=>{
    if(!clientId || !process.env.DISCORD_CLIENT_SECRET) return res.status(503).send("Discord OAuth is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI in Railway Variables.");
    const state=randomBytes(24).toString("hex"); req.session.oauthState=state;
    res.redirect(buildOAuthUrl(state));
  });
  app.get("/auth/callback",async(req,res)=>{
    const code=req.query.code;
    const receivedState=String(req.query.state || ""), expectedState=String(req.session.oauthState || "");
    delete req.session.oauthState;
    if(!expectedState || !receivedState || expectedState.length!==receivedState.length || !timingSafeEqual(Buffer.from(expectedState),Buffer.from(receivedState))) return res.status(403).send("OAuth state validation failed. Please restart Discord login.");
    if(!code) return res.status(400).send("OAuth authorization code missing.");
    try {
      const tokenResponse=await fetch("https://discord.com/api/oauth2/token",{
        method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:clientId,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:redirectUri})
      });
      const token=await tokenResponse.json();
      if(!token.access_token) return res.status(401).send("Discord login failed. Check OAuth client secret and redirect URI.");
      const headers={Authorization:`Bearer ${token.access_token}`};
      const [me,guildResponse]=await Promise.all([
        fetch("https://discord.com/api/users/@me",{headers}),
        fetch("https://discord.com/api/users/@me/guilds",{headers})
      ]);
      await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
      req.session.user=await me.json();
      req.session.guilds=(await guildResponse.json()).filter(g=>(BigInt(g.permissions)&BigInt(0x20n))===0x20n);
      res.redirect("/dashboard");
    } catch(e) { console.error("OAuth callback failed:",e); res.status(500).send("Login failed. Please try again."); }
  });
  app.post("/auth/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));
  app.get("/dashboard",requireAuth,(req,res)=>{
    const guilds=(req.session.guilds||[]).map(g=>({...g,botPresent:!!client.guilds.cache.has(g.id)}));
    res.render("guilds",{user:req.session.user,guilds,client});
  });
  app.get("/dashboard/:guildId",requireAuth,(req,res)=>{
    const guildId=req.params.guildId;
    const guild=(req.session.guilds||[]).find(g=>g.id===guildId);
    if(!guild) return res.status(403).send("You need Manage Server permission for this server.");
    const discordGuild=client.guilds.cache.get(guildId);
    if(!discordGuild) return res.status(400).send("Velora X1 is not installed in this server yet.");
    const settings=getSettings(guildId);
    req.session.csrfToken ||= randomBytes(24).toString("hex");
    let order=CATEGORIES;
    try { order=JSON.parse(settings.help_order); } catch {}
    res.render("settings",{user:req.session.user,guild,settings,order,csrfToken:req.session.csrfToken,channels:discordGuild.channels.cache.filter(c=>c.isTextBased()).map(c=>({id:c.id,name:c.name})),client});
  });
  app.post("/dashboard/:guildId/settings",requireAuth,(req,res)=>{
    const guildId=req.params.guildId;
    const submittedToken=String(req.body.csrfToken || ""), expectedToken=String(req.session.csrfToken || "");
    if(!submittedToken || !expectedToken || submittedToken.length!==expectedToken.length || !timingSafeEqual(Buffer.from(submittedToken),Buffer.from(expectedToken))) return res.status(403).send("Security token expired. Reload the settings page and try again.");
    const guild=(req.session.guilds||[]).find(g=>g.id===guildId);
    if(!guild) return res.status(403).send("Forbidden");
    const discordGuild=client.guilds.cache.get(guildId);
    if(!discordGuild) return res.status(400).send("Bot not installed");
    const prefix=String(req.body.prefix||"!").slice(0,5);
    const log=req.body.log_channel_id||null, welcome=req.body.welcome_channel_id||null;
    if(/\s/.test(prefix)||!prefix) return res.status(400).send("Prefix must be 1–5 characters with no spaces.");
    for(const id of [log,welcome]) if(id && !discordGuild.channels.cache.has(id)) return res.status(400).send("Invalid channel.");
    updateSettings(guildId,{prefix,log_channel_id:log,welcome_channel_id:welcome,anti_raid:req.body.anti_raid==="on"?1:0});
    res.redirect(`/dashboard/${guildId}?saved=1`);
  });
  app.post("/dashboard/:guildId/help-order",requireAuth,(req,res)=>{
    const guildId=req.params.guildId;
    if(!(req.session.guilds||[]).some(g=>g.id===guildId)) return res.status(403).json({error:"Forbidden"});
    const submittedToken=String(req.get("X-CSRF-Token") || ""), expectedToken=String(req.session.csrfToken || "");
    if(!submittedToken || !expectedToken || submittedToken.length!==expectedToken.length || !timingSafeEqual(Buffer.from(submittedToken),Buffer.from(expectedToken))) return res.status(403).json({error:"Security token expired. Reload the page."});
    const order=req.body.order;
    if(!Array.isArray(order)||order.length!==CATEGORIES.length||order.some(x=>!CATEGORIES.includes(x))||new Set(order).size!==CATEGORIES.length) return res.status(400).json({error:"Invalid order"});
    updateSettings(guildId,{help_order:JSON.stringify(order)});
    res.json({ok:true,order});
  });
  app.get("/invite",(req,res)=>res.redirect(`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=1099780117638&scope=bot%20applications.commands`));
  app.get("/health",(req,res)=>res.json({ok:true,botReady:client.isReady(),uptime:process.uptime()}));
  app.use((req,res)=>res.status(404).render("404",{user:req.session.user}));
  const port=Number(process.env.PORT)||3000;
  app.listen(port,"0.0.0.0",()=>console.log(`Velora X1 dashboard listening on ${port}`));
}
