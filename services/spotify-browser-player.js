/*
    Spotify playback bridge for a supported desktop browser.
*/

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {spawn} = require("child_process");

const PORT = 53687;

let server = null;
let secret = "";
let browserProcess = null;
let deviceId = "";
let ready = false;
let lastError = "";

function send(res,status,body,type="application/json"){
    res.writeHead(status,{
        "Content-Type":type,
        "Cache-Control":"no-store"
    });
    res.end(
        typeof body === "string"
            ? body
            : JSON.stringify(body)
    );
}

function authorized(url){
    return url.searchParams.get("key") === secret;
}

function findEdge(){
    const candidates=[
        process.env.PROGRAMFILES
            ?path.join(process.env.PROGRAMFILES,"Microsoft","Edge","Application","msedge.exe")
            :"",
        process.env["PROGRAMFILES(X86)"]
            ?path.join(process.env["PROGRAMFILES(X86)"],"Microsoft","Edge","Application","msedge.exe")
            :"",
        process.env.LOCALAPPDATA
            ?path.join(process.env.LOCALAPPDATA,"Microsoft","Edge","Application","msedge.exe")
            :""
    ].filter(Boolean);

    return candidates.find(file=>fs.existsSync(file))||"";
}

function ensureServer(getToken){
    if(server)return;

    secret=crypto.randomBytes(32).toString("hex");

    server=http.createServer(async(req,res)=>{
        try{
            const url=new URL(req.url,"http://127.0.0.1:"+PORT);

            if(!authorized(url)){
                send(res,403,{error:"Forbidden"});
                return;
            }

            if(req.method==="GET"&&url.pathname==="/player"){
                const file=path.join(__dirname,"..","ui","spotify-player.html");
                send(
                    res,
                    200,
                    fs.readFileSync(file,"utf8"),
                    "text/html; charset=utf-8"
                );
                return;
            }

            if(req.method==="GET"&&url.pathname==="/token"){
                send(res,200,await getToken());
                return;
            }

            if(req.method==="GET"&&url.pathname==="/status"){
                send(res,200,{ready,deviceId,lastError});
                return;
            }

            if(req.method==="POST"){
                let raw="";
                req.on("data",chunk=>{
                    raw+=chunk;
                    if(raw.length>16384)req.destroy();
                });
                req.on("end",()=>{
                    let body={};
                    try{body=raw?JSON.parse(raw):{};}catch{}

                    if(url.pathname==="/ready"){
                        deviceId=String(body.deviceId||"");
                        ready=Boolean(deviceId);
                        lastError="";
                    }else if(url.pathname==="/not-ready"){
                        if(!body.deviceId||body.deviceId===deviceId)ready=false;
                    }else if(url.pathname==="/error"){
                        lastError=String(body.message||"Spotify browser playback failed.");
                        ready=false;
                    }else if(url.pathname==="/autoplay-failed"){
                        lastError="Spotify browser playback needs one activation click.";
                    }

                    send(res,204,"");
                });
                return;
            }

            send(res,404,{error:"Not Found"});
        }catch(error){
            send(res,500,{error:error.message});
        }
    });

    server.listen(PORT,"127.0.0.1");
}

function open(getToken){
    ensureServer(getToken);

    const edge=findEdge();

    if(!edge){
        throw new Error(
            "Microsoft Edge was not found. Install a supported desktop browser for Spotify playback."
        );
    }

    const url=
        "http://127.0.0.1:"+
        PORT+
        "/player?key="+
        encodeURIComponent(secret);

    if(browserProcess&&!browserProcess.killed){
        return {success:true,ready,deviceId,lastError};
    }

    browserProcess=spawn(
        edge,
        [
            "--app="+url,
            "--no-first-run",
            "--disable-features=Translate"
        ],
        {
            detached:true,
            stdio:"ignore",
            windowsHide:false
        }
    );

    browserProcess.unref();

    return {success:true,ready,deviceId,lastError};
}

function status(){
    return {ready,deviceId,lastError};
}

function close(){
    try{server?.close();}catch{}
    server=null;
    browserProcess=null;
    secret="";
    deviceId="";
    ready=false;
    lastError="";
}

module.exports={open,status,close};
