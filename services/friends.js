const friendsSurface=(()=>{
    let overlay=null;

    const labels={discord:"Discord",microsoft:"Xbox / Microsoft",riot:"Riot Games"};

    function profileName(provider,a){
        if(provider==="discord") return a.profile ? (a.profile.global_name||a.profile.username) : "Not connected";
        if(provider==="microsoft") return a.profile?.displayName || "Microsoft account";
        if(provider==="riot") return a.profile ? `${a.profile.gameName||"Riot"}#${a.profile.tagLine||""}` : "Not connected";
        return "Not connected";
    }

    function note(provider,connected){
        if(!connected) return {discord:"Sign in to connect your Discord identity.",microsoft:"Sign in with Microsoft to connect Xbox services.",riot:"Riot RSO requires an approved production application."}[provider];
        if(provider==="discord") return "Identity connected. Full friend/presence access uses Discord's supported social integration rather than ordinary user OAuth.";
        if(provider==="microsoft") return "Microsoft identity connected. Xbox social access is controlled by Xbox services and application access.";
        return "Riot account connected through RSO.";
    }

    function ensure(){
        if(overlay)return overlay;
        overlay=document.createElement("div");
        overlay.id="friends-overlay";
        overlay.innerHTML=`<div class="friends-panel">
            <div class="friends-header"><div><div class="friends-kicker">SOCIAL</div><h2>Friends & Accounts</h2><p>Connect the accounts Personal XMB can use.</p></div><button id="friends-close">ESC</button></div>
            <div id="friends-cards" class="friends-cards"></div>
            <div class="friends-footer"><span>OAuth tokens are stored in Electron user data, not the renderer.</span><button id="friends-refresh">Refresh</button></div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector("#friends-close").onclick=close;
        overlay.querySelector("#friends-refresh").onclick=refresh;
        return overlay;
    }

    function render(data){
        const root=ensure(),cards=root.querySelector("#friends-cards");
        cards.innerHTML="";
        ["discord","microsoft","riot"].forEach(provider=>{
            const a=data?.[provider]||{},connected=!!a.connected;
            const card=document.createElement("article");
            card.className=`friends-card ${connected?"connected":""}`;
            card.innerHTML=`<div class="friends-card-top"><div class="friends-service-icon">${provider==="microsoft"?"X":provider[0].toUpperCase()}</div><div><div class="friends-service">${labels[provider]}</div><div class="friends-name"></div></div><div class="friends-status">${connected?"CONNECTED":"NOT CONNECTED"}</div></div><p class="friends-note"></p><div class="friends-actions"><button class="connect">${connected?"Reconnect":"Sign In"}</button>${connected?'<button class="disconnect">Disconnect</button>':""}</div>`;
            card.querySelector(".friends-name").textContent=profileName(provider,a);
            card.querySelector(".friends-note").textContent=note(provider,connected);
            card.querySelector(".connect").onclick=()=>login(provider);
            card.querySelector(".disconnect")?.addEventListener("click",()=>logout(provider));
            cards.appendChild(card);
        });
    }

    async function refresh(){ render(await window.electron?.getAccounts?.()||{}); }
    async function login(provider){
        ensure().querySelectorAll("button").forEach(b=>b.disabled=true);
        try{
            const r=await window.electron?.loginAccount?.(provider);
            if(!r?.success) alert(r?.error||`Unable to connect ${provider}.`);
        }finally{await refresh();ensure().querySelectorAll("button").forEach(b=>b.disabled=false);}
    }
    async function logout(provider){await window.electron?.logoutAccount?.(provider);await refresh();}
    function open(){ensure().classList.add("visible");refresh();}
    function close(){overlay?.classList.remove("visible");}
    function isOpen(){return !!overlay?.classList.contains("visible");}

    document.addEventListener("keydown",e=>{if(!isOpen())return;if(e.key==="Escape"){e.preventDefault();close();}else e.stopPropagation();},true);

    /*
       Navigation currently has no provider-specific friends action.
       This listener watches the selected item after XMB activation.
    */
    document.addEventListener("keydown",()=>{
        setTimeout(()=>{
            const state=window.xmbNavigation?.getState?.();
            if(state?.item==="friends-overview"&&state.level==="items"&&document.activeElement===document.body){
                /* Opening on Enter is handled by the click/keyboard fallback below. */
            }
        },0);
    });

    document.addEventListener("click",e=>{
        const item=e.target.closest("#items .item");
        if(item && e.detail>=2 && item.dataset.index!==undefined){
            setTimeout(()=>{
                const state=window.xmbNavigation?.getState?.();
                if(state?.item==="friends-overview")open();
            },0);
        }
    });

    /*
       Also expose a small polling-free hook: when the Friends item is
       selected and Enter is pressed, this capture listener runs before
       the navigation handler.
    */
    document.addEventListener("keydown",e=>{
        if(e.key!=="Enter"||e.repeat)return;
        const state=window.xmbNavigation?.getState?.();
        if(state?.item==="friends-overview"&&state.level==="items"){
            e.preventDefault();e.stopImmediatePropagation();open();
        }
    },true);

    return {open,close,refresh,isOpen};
})();

window.friendsSurface=friendsSurface;
