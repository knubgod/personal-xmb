const { app, ipcMain, shell } = require("electron");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ports = { discord:53683, microsoft:53684, riot:53685 };
const configFile = () => path.join(__dirname,"config","settings.json");
const tokenFile = () => path.join(app.getPath("userData"),"accounts.json");

function readJson(file, fallback={}) {
    try { return JSON.parse(fs.readFileSync(file,"utf8")); }
    catch { return fallback; }
}
function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify(value,null,4),"utf8");
}
function settings() { return readJson(configFile(),{}); }
function accounts() { return readJson(tokenFile(),{}); }
function state() { return crypto.randomBytes(24).toString("hex"); }
function verifier() { return crypto.randomBytes(48).toString("base64url"); }
function challenge(v) { return crypto.createHash("sha256").update(v).digest("base64url"); }

async function requestJson(url, options={}) {
    const response = await fetch(url,options);
    const text = await response.text();
    let data={};
    try { data=text ? JSON.parse(text):{}; } catch { data={raw:text}; }
    if(!response.ok) {
        throw new Error(data.error_description || data.error?.message || data.error || `HTTP ${response.status}`);
    }
    return data;
}

function callback(port, expectedState) {
    return new Promise((resolve,reject)=>{
        const server=http.createServer((req,res)=>{
            try {
                const url=new URL(req.url,`http://127.0.0.1:${port}`);
                if(url.pathname!=="/callback"){res.writeHead(404);res.end();return;}
                if(url.searchParams.get("state")!==expectedState){
                    res.writeHead(400);res.end("Invalid OAuth state.");server.close();reject(new Error("OAuth state validation failed."));return;
                }
                if(url.searchParams.get("error")){
                    res.writeHead(400);res.end("Authorization cancelled.");server.close();reject(new Error(url.searchParams.get("error")));return;
                }
                const code=url.searchParams.get("code");
                if(!code){res.writeHead(400);res.end("No authorization code.");server.close();reject(new Error("No authorization code."));return;}
                res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
                res.end("<h1>Personal XMB connected.</h1><p>You can close this window.</p>");
                server.close();resolve(code);
            } catch(e){try{res.writeHead(500);res.end("Authorization failed.");}catch{} server.close();reject(e);}
        });
        server.on("error",reject);
        server.listen(port,"127.0.0.1");
    });
}

async function oauth(provider, cfg) {
    if(!cfg.clientId) throw new Error(`${provider} client ID is not configured in config/settings.json.`);
    const s=state(), v=verifier(), redirect=`http://127.0.0.1:${cfg.port}/callback`;
    const query=new URLSearchParams({
        client_id:cfg.clientId,response_type:"code",redirect_uri:redirect,
        scope:cfg.scope,state:s,code_challenge:challenge(v),code_challenge_method:"S256"
    });
    const codePromise=callback(cfg.port,s);
    await shell.openExternal(`${cfg.authorize}?${query}`);
    const code=await codePromise;
    const body=new URLSearchParams({
        grant_type:"authorization_code",code,redirect_uri:redirect,
        client_id:cfg.clientId,code_verifier:v,...(cfg.tokenExtra||{})
    });
    const token=await requestJson(cfg.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const all=accounts();
    all[provider]={...(all[provider]||{}),connected:true,accessToken:token.access_token||"",refreshToken:token.refresh_token||all[provider]?.refreshToken||"",expiresAt:token.expires_in?Date.now()+token.expires_in*1000:0,connectedAt:Date.now()};
    writeJson(tokenFile(),all);
    return all;
}

function summary(all=accounts()) {
    return {
        discord:{connected:!!all.discord?.connected,profile:all.discord?.profile||null},
        microsoft:{connected:!!all.microsoft?.connected,profile:all.microsoft?.profile||null,xbox:all.microsoft?.xbox||null},
        riot:{connected:!!all.riot?.connected,profile:all.riot?.profile||null}
    };
}

async function discordProfile(all) {
    if(!all.discord?.accessToken) return null;
    return requestJson("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${all.discord.accessToken}`}});
}
async function microsoftProfile(all) {
    if(!all.microsoft?.accessToken) return null;
    return requestJson("https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail",{headers:{Authorization:`Bearer ${all.microsoft.accessToken}`}});
}
async function riotProfile(all) {
    if(!all.riot?.accessToken) return null;
    return requestJson("https://americas.api.riotgames.com/riot/account/v1/accounts/me",{headers:{Authorization:`Bearer ${all.riot.accessToken}`}});
}

async function xboxTokens(msaToken) {
    const u=await requestJson("https://user.auth.xboxlive.com/user/authenticate",{
        method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({RelyingParty:"http://auth.xboxlive.com",TokenType:"JWT",Properties:{AuthMethod:"RPS",SiteName:"user.auth.xboxlive.com",RpsTicket:`d=${msaToken}`}})
    });
    const userHash=u.DisplayClaims?.xui?.[0]?.uhs;
    if(!u.Token||!userHash) throw new Error("Xbox Live user token was not returned.");
    const x=await requestJson("https://xsts.auth.xboxlive.com/xsts/authorize",{
        method:"POST",headers:{"Content-Type":"application/json","x-xbl-contract-version":"1"},
        body:JSON.stringify({RelyingParty:"http://xboxlive.com",TokenType:"JWT",Properties:{SandboxId:"RETAIL",UserTokens:[u.Token]}})
    });
    return {userToken:u.Token,userHash:x.DisplayClaims?.xui?.[0]?.uhs||userHash,xstsToken:x.Token};
}

ipcMain.handle("accounts-get",()=>summary());

ipcMain.handle("account-login",async(_e,provider)=>{
    try {
        const cfg=settings();
        let all;
        if(provider==="discord"){
            all=await oauth("discord",{clientId:cfg.integrations?.discord?.clientId,authorize:"https://discord.com/oauth2/authorize",token:"https://discord.com/api/oauth2/token",scope:"identify connections",port:ports.discord});
            all.discord.profile=await discordProfile(all);
        } else if(provider==="microsoft"){
            all=await oauth("microsoft",{clientId:cfg.integrations?.microsoft?.clientId,authorize:"https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",token:"https://login.microsoftonline.com/consumers/oauth2/v2.0/token",scope:"openid profile email offline_access XboxLive.signin",port:ports.microsoft});
            all.microsoft.profile=await microsoftProfile(all);
            try { all.microsoft.xbox=await xboxTokens(all.microsoft.accessToken); } catch(e) { all.microsoft.xboxError=e.message; }
        } else if(provider==="riot"){
            const secret=process.env.PERSONAL_XMB_RIOT_CLIENT_SECRET||"";
            if(!cfg.integrations?.riot?.clientId||!secret) throw new Error("Riot RSO needs an approved client ID and PERSONAL_XMB_RIOT_CLIENT_SECRET.");
            all=await oauth("riot",{clientId:cfg.integrations.riot.clientId,authorize:"https://auth.riotgames.com/authorize",token:"https://auth.riotgames.com/token",scope:"openid offline_access",port:ports.riot,tokenExtra:{client_secret:secret}});
            all.riot.profile=await riotProfile(all);
        } else throw new Error("Unknown account provider.");
        writeJson(tokenFile(),all);
        return {success:true,accounts:summary(all)};
    } catch(error) {
        console.error(`Account login failed for ${provider}:`,error);
        return {success:false,error:error.message};
    }
});

ipcMain.handle("account-logout",(_e,provider)=>{
    const all=accounts(); delete all[provider]; writeJson(tokenFile(),all);
    return {success:true,accounts:summary(all)};
});

ipcMain.handle("accounts-refresh",async()=>{
    const all=accounts();
    try{if(all.discord?.accessToken)all.discord.profile=await discordProfile(all);}catch{}
    try{if(all.microsoft?.accessToken)all.microsoft.profile=await microsoftProfile(all);}catch{}
    try{if(all.riot?.accessToken)all.riot.profile=await riotProfile(all);}catch{}
    writeJson(tokenFile(),all);
    return summary(all);
});
