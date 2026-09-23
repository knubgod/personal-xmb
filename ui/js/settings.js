
/*
    PERSONAL XMB SETTINGS
    Branching XMB-style settings menus.
*/

const XMB_SETTINGS_KEY="personal-xmb-user-settings";

const defaultUserSettings={
    sound:true,soundVolume:0.075,clock:true,hints:true,animations:true,theme:"default"
};

function getUserSettings(){
    try{return {...defaultUserSettings,...(JSON.parse(localStorage.getItem(XMB_SETTINGS_KEY))||{})};}
    catch{return {...defaultUserSettings};}
}
function saveUserSettings(value){localStorage.setItem(XMB_SETTINGS_KEY,JSON.stringify(value));}

function applyUserSettings(){
    const s=getUserSettings();
    document.body.classList.toggle("hide-clock",!s.clock);
    document.body.classList.toggle("hide-hints",!s.hints);
    document.body.classList.toggle("reduced-xmb-motion",!s.animations);
    window.xmbAudio?.setEnabled?.(s.sound);
    window.xmbAudio?.setVolume?.(s.soundVolume);
    if(s.theme&&typeof applyTheme==="function")applyTheme(s.theme);
}

let settingsBranch=null;

function closeSettingsPanel(){
    settingsBranch?.remove();
    settingsBranch=null;
    document.body.classList.remove("settings-branch-open");
    window.xmbAudio?.back?.();
}

function field(label,control){return `<label class="xmb-setting-row"><span>${label}</span>${control}</label>`;}

function openSettingsPanel(section="general"){
    if(settingsBranch)settingsBranch.remove();

    const s=getUserSettings();
    const branch=document.createElement("aside");
    branch.id="settings-overlay";
    branch.className="xmb-settings-branch";
    branch.innerHTML=`
      <div class="xmb-settings-branch-inner">
        <div class="xmb-settings-branch-header">
          <div><div class="settings-kicker">SETTINGS</div><h2 id="settings-branch-title"></h2></div>
          <button class="settings-close" type="button">ESC</button>
        </div>
        <div id="settings-branch-content"></div>
      </div>`;
    document.body.appendChild(branch);
    settingsBranch=branch;
    document.body.classList.add("settings-branch-open");
    branch.querySelector(".settings-close").onclick=closeSettingsPanel;
    renderSettingsSection(section,s);
    window.xmbAudio?.select?.();
}

function renderSettingsSection(section,s=getUserSettings()){
    if(!settingsBranch)return;
    const title=settingsBranch.querySelector("#settings-branch-title");
    const content=settingsBranch.querySelector("#settings-branch-content");
    const themes=window.themesData||{};

    const sections={
      general:{
        title:"General Settings",
        html:field("Show Clock",`<input id="setting-clock" type="checkbox" ${s.clock?"checked":""}>`)+
          field("Navigation Hints",`<input id="setting-hints" type="checkbox" ${s.hints?"checked":""}>`)+
          field("Animations",`<input id="setting-animations" type="checkbox" ${s.animations?"checked":""}>`)
      },
      audio:{
        title:"Audio Settings",
        html:field("Sound Effects",`<input id="setting-sound" type="checkbox" ${s.sound?"checked":""}>`)+
          field("Volume",`<input id="setting-volume" type="range" min="0" max="0.15" step="0.005" value="${s.soundVolume}">`)
      },
      themes:{
        title:"Themes",
        html:`<label class="xmb-setting-row"><span>Theme</span><select id="setting-theme"></select></label>
               <p class="xmb-settings-description">Theme changes apply immediately.</p>`
      },
      artwork:{
        title:"Artwork",
        html:`<button id="setting-clear-cache" class="settings-action">Clear Artwork Cache</button><div id="settings-cache-status" class="settings-status"></div>`
      },
      system:{
        title:"System",
        html:`<button id="setting-maximize" class="settings-action">Toggle Maximize</button>
               <button id="setting-fullscreen" class="settings-action">Toggle Fullscreen</button>
               <button id="setting-exit" class="settings-action danger">Exit Personal XMB</button>`
      },
      accounts:{
        title:"Accounts",
        html:`<p class="xmb-settings-description">Connect services used by Personal XMB. Provider credentials stay in the local configuration.</p>
          <div class="account-setup-grid">
            <label><span>Spotify Client ID</span><input id="account-spotify-client" type="text" value="${window.xmbConfig?.spotify?.clientId||""}" placeholder="Spotify Client ID"></label>
            <label><span>Discord Client ID</span><input id="account-discord-client" type="text" value="${window.xmbConfig?.integrations?.discord?.clientId||""}" placeholder="Discord Client ID"></label>
            <label><span>Microsoft Client ID</span><input id="account-microsoft-client" type="text" value="${window.xmbConfig?.integrations?.microsoft?.clientId||""}" placeholder="Microsoft Client ID"></label>
            <label><span>Riot Client ID</span><input id="account-riot-client" type="text" value="${window.xmbConfig?.integrations?.riot?.clientId||""}" placeholder="RSO Client ID"></label>
          </div>
          <div class="account-buttons">
            <button id="save-account-config" class="settings-action">Save Account Configuration</button>
            <button id="connect-spotify" class="settings-action">Connect Spotify</button>
            <button id="connect-discord" class="settings-action">Connect Discord</button>
            <button id="connect-microsoft" class="settings-action">Connect Xbox / Microsoft</button>
            <button id="connect-riot" class="settings-action">Connect Riot</button>
          </div>
          <div id="account-status" class="settings-status"></div>`
    };

    const chosen=sections[section]||sections.general;
    title.textContent=chosen.title;
    content.innerHTML=chosen.html;

    if(section==="themes"){
        const select=content.querySelector("#setting-theme");
        Object.keys(themes).forEach(name=>{const o=document.createElement("option");o.value=name;o.textContent=name.replace(/-/g," ");select.appendChild(o);});
        select.value=s.theme||document.body.dataset.theme||"default";
        select.onchange=()=>{const next={...getUserSettings(),theme:select.value};saveUserSettings(next);applyUserSettings();};
    }
    if(section==="general"){
        ["clock","hints","animations"].forEach(key=>{
            content.querySelector("#setting-"+key).onchange=e=>{const next={...getUserSettings(),[key]:e.target.checked};saveUserSettings(next);applyUserSettings();};
        });
    }
    if(section==="audio"){
        content.querySelector("#setting-sound").onchange=e=>{const next={...getUserSettings(),sound:e.target.checked};saveUserSettings(next);applyUserSettings();};
        content.querySelector("#setting-volume").oninput=e=>{const next={...getUserSettings(),soundVolume:Number(e.target.value)};saveUserSettings(next);applyUserSettings();};
    }
    if(section==="artwork"){
        content.querySelector("#setting-clear-cache").onclick=async()=>{
            const status=content.querySelector("#settings-cache-status");status.textContent="Clearing...";
            const r=await window.electron?.clearArtworkCache?.();status.textContent=r?.success?"Cache cleared. Relaunch to rebuild artwork.":"Unable to clear cache.";
        };
    }
    if(section==="system"){
        content.querySelector("#setting-maximize").onclick=()=>window.electron?.setWindowState?.("maximize");
        content.querySelector("#setting-fullscreen").onclick=()=>window.electron?.setWindowState?.("fullscreen");
        content.querySelector("#setting-exit").onclick=()=>window.electron?.quitApp?.();
    }
    if(section==="accounts"){
        content.querySelector("#save-account-config").onclick=async()=>{
            const value={
              spotifyClientId:content.querySelector("#account-spotify-client").value.trim(),
              discordClientId:content.querySelector("#account-discord-client").value.trim(),
              microsoftClientId:content.querySelector("#account-microsoft-client").value.trim(),
              riotClientId:content.querySelector("#account-riot-client").value.trim()
            };
            const r=await window.electron?.saveAccountConfig?.(value);
            content.querySelector("#account-status").textContent=r?.success?"Configuration saved.":"Unable to save configuration.";
        };
        [["spotify","connect-spotify"],["discord","connect-discord"],["microsoft","connect-microsoft"],["riot","connect-riot"]].forEach(([provider,id])=>{
            content.querySelector("#"+id).onclick=async()=>{
                const status=content.querySelector("#account-status");
                status.textContent=`Connecting ${provider}...`;
                const r=provider==="spotify"?await window.electron?.spotifyLogin?.():await window.electron?.loginAccount?.(provider);
                status.textContent=r?.success===false?(r.error||"Connection failed."):`${provider} authorization started. Complete it in your browser.`;
            };
        });
    }
}

document.addEventListener("keydown",e=>{
    if(!settingsBranch)return;
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeSettingsPanel();}
},true);

window.xmbSettings={
    open:(section="general")=>openSettingsPanel(section),
    close:closeSettingsPanel,
    apply:applyUserSettings,
    openSection:renderSettingsSection
};
