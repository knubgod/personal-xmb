const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("electron",{
getCategories:()=>ipcRenderer.invoke("get-categories"),
getSettings:()=>ipcRenderer.invoke("get-settings"),
getThemes:()=>ipcRenderer.invoke("get-themes"),
getCategoryIcon:(name)=>ipcRenderer.invoke("get-category-icon",name),
launchItem:(item)=>ipcRenderer.invoke("launch-item",item),
openExternal:(url)=>ipcRenderer.invoke("open-external",url),
getSteamMetadata:(id)=>ipcRenderer.invoke("steam-get-metadata",id),
getSteamArtwork:(appId,itemId)=>ipcRenderer.invoke("steam-get-artwork",appId,itemId),
getArtwork:(itemId,type="logo",source={})=>ipcRenderer.invoke("get-artwork",itemId,type,source),
getArtworkManifest:()=>ipcRenderer.invoke("get-artwork-manifest"),
spotifyLogin:()=>ipcRenderer.invoke("spotify-login"),
spotifyLaunchDesktop:()=>ipcRenderer.invoke("spotify-launch-desktop"),
spotifyApi:(request)=>ipcRenderer.invoke("spotify-api",request),

onSpotifyAuthComplete:(callback)=>ipcRenderer.on("spotify-auth-complete",()=>callback()),
getAccounts:()=>ipcRenderer.invoke("accounts-get"),
getFriends:()=>ipcRenderer.invoke("friends-get"),
loginAccount:(provider)=>ipcRenderer.invoke("account-login",provider),
logoutAccount:(provider)=>ipcRenderer.invoke("account-logout",provider),
refreshAccounts:()=>ipcRenderer.invoke("accounts-refresh"),
saveAccountConfig:(value)=>ipcRenderer.invoke("save-account-config",value),
saveSteamConfig:(value)=>ipcRenderer.invoke("save-steam-config",value),

quitApp:
            () => ipcRenderer.invoke("quit-app"),

        setWindowState:
            (state) => ipcRenderer.invoke("set-window-state", state),

        clearArtworkCache:
            () => ipcRenderer.invoke("clear-artwork-cache"),

});