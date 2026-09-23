
const XMB_SETTINGS_KEY="personal-xmb-user-settings";
const defaultUserSettings={sound:true,soundVolume:0.075,clock:true,hints:true,animations:true,theme:"default"};
function getUserSettings(){try{return {...defaultUserSettings,...(JSON.parse(localStorage.getItem(XMB_SETTINGS_KEY))||{})};}catch{return {...defaultUserSettings};}}
function saveUserSettings(v){localStorage.setItem(XMB_SETTINGS_KEY,JSON.stringify(v));}
function applyUserSettings(){const s=getUserSettings();document.body.classList.toggle("hide-clock",!s.clock);document.body.classList.toggle("hide-hints",!s.hints);document.body.classList.toggle("reduced-xmb-motion",!s.animations);window.xmbAudio?.setEnabled?.(s.sound);window.xmbAudio?.setVolume?.(s.soundVolume);if(s.theme&&typeof applyTheme==="function")applyTheme(s.theme);}
let settingsBranch=null;
function closeSettingsPanel(){settingsBranch?.remove();settingsBranch=null;document.body.classList.remove("settings-branch-open");window.xmbAudio?.back?.();}
function openSettingsPanel(section="general"){
 if(settingsBranch)settingsBranch.remove();
 const s=getUserSettings(), b=document.createElement("aside");b.id="settings-overlay";b.className="xmb-settings-branch";
 b.innerHTML='<div class="xmb-settings-branch-inner"><div class="xmb-settings-branch-header"><div><div class="settings-kicker">SETTINGS</div><h2 id="settings-branch-title"></h2></div><button class="settings-close" type="button">ESC</button></div><div id="settings-branch-content"></div></div>';
 document.body.appendChild(b);settingsBranch=b;document.body.classList.add("settings-branch-open");b.querySelector(".settings-close").onclick=closeSettingsPanel;renderSettingsSection(section,s);window.xmbAudio?.select?.();
}
function renderSettingsSection(section,s=getUserSettings()){
 if(!settingsBranch)return;const title=settingsBranch.querySelector("#settings-branch-title"),c=settingsBranch.querySelector("#settings-branch-content"),themes=window.themesData||{};
 const defs={
 general:["General Settings",'<label class="xmb-setting-row"><span>Show Clock</span><input id="setting-clock" type="checkbox" '+(s.clock?"checked":"")+'></label><label class="xmb-setting-row"><span>Navigation Hints</span><input id="setting-hints" type="checkbox" '+(s.hints?"checked":"")+'></label><label class="xmb-setting-row"><span>Animations</span><input id="setting-animations" type="checkbox" '+(s.animations?"checked":"")+'></label>'],
 audio:["Audio Settings",'<label class="xmb-setting-row"><span>Sound Effects</span><input id="setting-sound" type="checkbox" '+(s.sound?"checked":"")+'></label><label class="xmb-setting-row"><span>Volume</span><input id="setting-volume" type="range" min="0" max="0.15" step="0.005" value="'+s.soundVolume+'"></label>'],
 themes:["Themes",'<label class="xmb-setting-row"><span>Theme</span><select id="setting-theme"></select></label><p class="xmb-settings-description">Theme changes apply immediately.</p>'],
 artwork:["Artwork",'<button id="setting-clear-cache" class="settings-action">Clear Artwork Cache</button><div id="settings-cache-status" class="settings-status"></div>'],
 system:["System",'<button id="setting-maximize" class="settings-action">Toggle Maximize</button><button id="setting-fullscreen" class="settings-action">Toggle Fullscreen</button><button id="setting-exit" class="settings-action danger">Exit Personal XMB</button>'],
 accounts:["Accounts",'<p class="xmb-settings-description">Enter provider Client IDs, save them, then connect.</p><div class="account-setup-grid"><label>Spotify Client ID<input id="account-spotify-client" value="'+(window.xmbConfig?.spotify?.clientId||"")+'"></label><label>Discord Client ID<input id="account-discord-client" value="'+(window.xmbConfig?.integrations?.discord?.clientId||"")+'"></label><label>Microsoft Client ID<input id="account-microsoft-client" value="'+(window.xmbConfig?.integrations?.microsoft?.clientId||"")+'"></label><label>Riot Client ID<input id="account-riot-client" value="'+(window.xmbConfig?.integrations?.riot?.clientId||"")+'"></label></div><button id="save-account-config" class="settings-action">Save Account Configuration</button><button id="connect-spotify" class="settings-action">Connect Spotify</button><button id="connect-discord" class="settings-action">Connect Discord</button><button id="connect-microsoft" class="settings-action">Connect Xbox / Microsoft</button><button id="connect-riot" class="settings-action">Connect Riot</button><div id="account-status" class="settings-status"></div>']
 };
 const d=defs[section]||defs.general;title.textContent=d[0];c.innerHTML=d[1];
 if(section==="themes"){const q=c.querySelector("#setting-theme");Object.keys(themes).forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n.replace(/-/g," ");q.appendChild(o);});q.value=s.theme||"default";q.onchange=()=>{const n={...getUserSettings(),theme:q.value};saveUserSettings(n);applyUserSettings();};}
 if(section==="general")["clock","hints","animations"].forEach(k=>c.querySelector("#setting-"+k).onchange=e=>{const n={...getUserSettings(),[k]:e.target.checked};saveUserSettings(n);applyUserSettings();});
 if(section==="audio"){c.querySelector("#setting-sound").onchange=e=>{const n={...getUserSettings(),sound:e.target.checked};saveUserSettings(n);applyUserSettings();};c.querySelector("#setting-volume").oninput=e=>{const n={...getUserSettings(),soundVolume:Number(e.target.value)};saveUserSettings(n);applyUserSettings();};}
 if(section==="artwork")c.querySelector("#setting-clear-cache").onclick=async()=>{const q=c.querySelector("#settings-cache-status");q.textContent="Clearing...";const r=await window.electron?.clearArtworkCache?.();q.textContent=r?.success?"Cache cleared. Relaunch to rebuild artwork.":"Unable to clear cache.";};
 if(section==="system"){c.querySelector("#setting-maximize").onclick=()=>window.electron?.setWindowState?.("maximize");c.querySelector("#setting-fullscreen").onclick=()=>window.electron?.setWindowState?.("fullscreen");c.querySelector("#setting-exit").onclick=()=>window.electron?.quitApp?.();}
 if(section==="accounts"){
  c.querySelector("#save-account-config").onclick=async()=>{const v={spotifyClientId:c.querySelector("#account-spotify-client").value.trim(),discordClientId:c.querySelector("#account-discord-client").value.trim(),microsoftClientId:c.querySelector("#account-microsoft-client").value.trim(),riotClientId:c.querySelector("#account-riot-client").value.trim()};const r=await window.electron?.saveAccountConfig?.(v);c.querySelector("#account-status").textContent=r?.success?"Configuration saved.":"Unable to save configuration.";};
  [["spotify","connect-spotify"],["discord","connect-discord"],["microsoft","connect-microsoft"],["riot","connect-riot"]].forEach(([p,id])=>c.querySelector("#"+id).onclick=async()=>{const q=c.querySelector("#account-status");q.textContent="Connecting "+p+"...";const r=p==="spotify"?await window.electron?.spotifyLogin?.():await window.electron?.loginAccount?.(p);q.textContent=r?.success===false?(r.error||"Connection failed."):p+" authorization started in your browser.";});
 }
}
document.addEventListener("keydown",e=>{if(settingsBranch&&e.key==="Escape"){e.preventDefault();e.stopPropagation();closeSettingsPanel();}},true);
window.xmbSettings={open:openSettingsPanel,close:closeSettingsPanel,apply:applyUserSettings,openSection:renderSettingsSection};
