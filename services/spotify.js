const spotifyService={
    initialized:false,
    polling:false,
    pollTimer:null,
    progressTimer:null,
    currentTrack:null,
    lastPlayerRefresh:0,
    recentCache:null,
    recentCacheAt:0,
    recentCacheTtl:60000,
    shuffle:false,
    repeat:"off",
    player:null,
    playerDeviceId:"",
    playerReady:false,
    desktopDeviceId:"",
    desktopDeviceName:"",
    playerConnecting:false,
    playerReadyPromise:null,
    playbackIntent:null,
    playbackIntentStartedAt:0,
    playbackRecoveryAttempts:0,
    playbackErrorAt:0,
    playbackErrorPauseAt:0,
    playbackCommandId:0,
    continuationMode:null,
    continuationInFlight:false,
    continuationSeedUri:"",

    async initialize(){
        if(this.initialized)return;
        this.initialized=true;

        /*
            XMB uses Spotify's Web API for library, metadata, and
            playback status. Audio playback itself is handed to the
            installed Spotify application rather than a remote
            Spotify Connect device.
        */
        await this.refreshNowPlaying();

        this.startPolling();
        this.startProgressTicker();
    },

    startPolling(){
        if(this.polling)return;
        this.polling=true;
        this.pollTimer=setInterval(
            ()=>this.refreshNowPlaying(),
            15000
        );
    },

    startProgressTicker(){
        if(this.progressTimer)return;
        this.progressTimer=setInterval(()=>{
            if(!this.currentTrack)return;

            if(
                this.currentTrack.isPlaying &&
                this.currentTrack.duration>0
            ){
                this.currentTrack.progress=Math.min(
                    this.currentTrack.duration,
                    this.currentTrack.progress+250
                );
            }

            this.renderPlayer();
        },250);
    },

    stopPolling(){
        if(this.pollTimer)clearInterval(this.pollTimer);
        if(this.progressTimer)clearInterval(this.progressTimer);

        this.pollTimer=null;
        this.progressTimer=null;
        this.polling=false;
    },

    showTemporaryMessage(message){
        const element=document.getElementById("temporary-message");
        if(!element)return;

        element.textContent=String(message||"");
        element.classList.add("visible");

        clearTimeout(this.messageTimeout);

        this.messageTimeout=setTimeout(()=>{
            element.classList.remove("visible");
        },1800);
    },

    async api(request){
        const result=await window.electron?.spotifyApi?.(request);
        if(!result?.success){
            throw new Error(result?.error||"Spotify API request failed.");
        }
        return result.data;
    },

    sleep(ms){
        return new Promise(resolve=>setTimeout(resolve,ms));
    },

    async waitForSdkState(predicate,attempts=20,delay=250){
        for(let attempt=0;attempt<attempts;attempt++){
            try{
                const state=await this.player?.getCurrentState?.();
                if(state&&predicate(state))return state;
            }catch(error){
                // The SDK can briefly report no state while Connect settles.
            }
            if(attempt<attempts-1)await this.sleep(delay);
        }
        return null;
    },

    async refreshNowPlaying(){
        const now=Date.now();

        if(now-this.lastPlayerRefresh<10000)return;

        this.lastPlayerRefresh=now;

        try{
            const data=await this.api({
                method:"GET",
                endpoint:"/me/player"
            });

            this.shuffle=!!data?.shuffle_state;
            this.repeat=data?.repeat_state||"off";

            if(!data?.item){
                this.currentTrack=null;
                this.renderPlayer();
                this.updateModes();
                return;
            }

            const item=data.item;
            const isEpisode=item.type==="episode";

            this.currentTrack={
                id:item.id,
                uri:item.uri||"",
                name:item.name||"Unknown",
                artist:isEpisode
                    ? item.show?.name||"Podcast"
                    : item.artists?.map(a=>a.name).join(", ")||"Unknown Artist",
                album:isEpisode
                    ? item.show?.name||"Podcast"
                    : item.album?.name||"Unknown Album",
                artwork:isEpisode
                    ? item.images?.[0]?.url||""
                    : item.album?.images?.[0]?.url||"",
                duration:item.duration_ms||0,
                progress:data.progress_ms||0,
                isPlaying:!!data.is_playing,
                spotifyUrl:item.external_urls?.spotify||""
            };

            this.renderPlayer();
            this.updateModes();
        }catch(error){
            console.warn("Spotify refresh failed:",error.message);
        }
    },

    renderPlayer(){
        const track=this.currentTrack;
        if(typeof window.updateSpotifyPlayer==="function"){
            window.updateSpotifyPlayer(track);
            return;
        }
    },

    async login(){
        const result=await window.electron?.spotifyLogin?.();
        if(result?.success===false){
            throw new Error(result.error||"Spotify login failed.");
        }
    },

    async getAvailableDevices(){
        const data=await this.api({
            method:"GET",
            endpoint:"/me/player/devices"
        });

        return Array.isArray(data?.devices)?data.devices:[];
    },

    /*
        Playback is intentionally handed to the installed Spotify app
        through Spotify URIs. We do not select or transfer playback to
        an arbitrary Spotify Connect device, which prevents XMB from
        accidentally starting music on an Echo, TV, or other remote device.
    */
    async openDj(){
        this.showTemporaryMessage("Spotify DJ is not exposed to third-party playback apps.");
        return {success:false,error:"Spotify DJ is not available through the Spotify Web Playback SDK."};
    },

    /*
        Spotify Web Playback SDK / Widevine is intentionally not used here.

        Electron is not a supported Spotify Web Playback SDK browser
        environment, and the SDK can connect successfully while its
        Widevine license requests fail with HTTP 500. That leaves the
        XMB renderer connected to a device that cannot actually play audio.

        Personal XMB therefore controls the installed Spotify desktop
        application through the supported Spotify Connect/Web API path.
        The XMB remains the controller; Spotify remains responsible for
        decoding and DRM.
    */
    async ensureDesktopPlayer(){
        const launch=await window.electron?.spotifyLaunchDesktop?.();

        if(launch?.success===false){
            throw new Error(
                launch.error||"Spotify desktop application could not be launched."
            );
        }

        const deadline=Date.now()+15000;
        let devices=[];

        while(Date.now()<deadline){
            try{
                devices=await this.getAvailableDevices();
            }catch(error){
                // Spotify may briefly reject the request while the desktop
                // application is registering its Connect device.
            }

            const computerDevices=devices.filter(device=>
                device?.id &&
                device?.type==="Computer" &&
                device?.is_restricted!==true
            );

            const preferred=
                computerDevices.find(device=>device.is_active)||
                computerDevices[0];

            if(preferred){
                this.desktopDeviceId=preferred.id;
                this.desktopDeviceName=preferred.name||"Spotify";
                this.playerDeviceId=preferred.id;
                this.playerReady=true;
                return preferred;
            }

            await this.sleep(500);
        }

        throw new Error(
            "Spotify desktop was launched, but its Spotify Connect device did not appear. Make sure you are signed into the Spotify desktop app."
        );
    },

    async ensureLocalPlayer(){
        return Boolean(await this.ensureDesktopPlayer());
    },

    async activatePlayer(){
        return this.ensureDesktopPlayer();
    },

    async waitForLocalPlayerActive(attempts=20,delay=300){
        for(let attempt=0;attempt<attempts;attempt++){
            try{
                const state=await this.api({
                    method:"GET",
                    endpoint:"/me/player"
                });

                if(
                    state?.device?.id===this.desktopDeviceId &&
                    state.device.is_active
                ){
                    return true;
                }
            }catch(error){
                // Spotify may briefly report no active device during startup.
            }

            if(attempt<attempts-1)await this.sleep(delay);
        }

        throw new Error(
            "Spotify desktop did not become the active playback device."
        );
    },

    async transferToLocalPlayer(play=false){
        const device=await this.ensureDesktopPlayer();

        await this.api({
            method:"PUT",
            endpoint:"/me/player",
            body:{
                device_ids:[device.id],
                play:Boolean(play)
            }
        });

        await this.waitForLocalPlayerActive();
    },

    async toggleShuffle(){
        await this.activatePlayer();
        const next=!this.shuffle;
        await this.api({
            method:"PUT",
            endpoint:"/me/player/shuffle?state="+next+"&device_id="+encodeURIComponent(this.playerDeviceId)
        });
        this.shuffle=next;
        this.updateModes();
    },

    async cycleRepeat(){
        await this.activatePlayer();
        const next=this.repeat==="off"?"context":this.repeat==="context"?"track":"off";
        await this.api({
            method:"PUT",
            endpoint:"/me/player/repeat?state="+next+"&device_id="+encodeURIComponent(this.playerDeviceId)
        });
        this.repeat=next;
        this.updateModes();
    },

    updateModes(){
        const shuffle=document.getElementById("media-shuffle");
        const repeat=document.getElementById("media-repeat");
        shuffle?.classList.toggle("active",this.shuffle);
        repeat?.classList.toggle("active",this.repeat!=="off");
        repeat?.setAttribute(
            "aria-label",
            this.repeat==="track"?"Repeat track":
            this.repeat==="context"?"Repeat context":
            "Repeat off"
        );
    },

    async recentlyPlayed(limit=50){
        return this.api({
            method:"GET",
            endpoint:"/me/player/recently-played?limit="+Math.min(50,Math.max(1,limit))
        });
    },

    async playlists(limit=20){
        return this.api({
            method:"GET",
            endpoint:"/me/playlists?limit="+Math.min(50,Math.max(1,limit))
        });
    },

    async startTrack(uri){
        if(!uri)throw new Error("Spotify track URI is missing.");

        ++this.playbackCommandId;
        this.playbackErrorAt=0;
        this.playbackIntent={type:"track",uri};
        this.playbackIntentStartedAt=Date.now();
        this.playbackRecoveryAttempts=0;

        await this.ensureDesktopPlayer();

        await this.api({
            method:"PUT",
            endpoint:"/me/player/play?device_id="+encodeURIComponent(this.desktopDeviceId),
            body:{uris:[uri]}
        });

        this.lastPlayerRefresh=0;

        await this.sleep(500);
        await this.refreshNowPlaying();
    },

    /*
        Recovery is intentionally disabled for Web Playback errors.

        Spotify's Web Playback SDK already retries its own Widevine/CDN
        work. Re-issuing start commands from playback_error races that
        internal state machine and was the source of the infinite-skip
        behavior seen in Personal XMB.
    */
    async recoverPlaybackAfterError(){
        return false;
    },

    async startContext(uri){
        if(!uri)throw new Error("Spotify context URI is missing.");

        ++this.playbackCommandId;
        this.playbackErrorAt=0;
        this.playbackIntent={type:"context",uri};
        this.playbackIntentStartedAt=Date.now();
        this.playbackRecoveryAttempts=0;

        await this.ensureDesktopPlayer();

        await this.api({
            method:"PUT",
            endpoint:"/me/player/play?device_id="+encodeURIComponent(this.desktopDeviceId),
            body:{context_uri:uri}
        });

        this.lastPlayerRefresh=0;

        await this.sleep(500);
        await this.refreshNowPlaying();
    },

    async playTrack(uri){
        this.continuationMode="related";
        this.continuationSeedUri=uri||"";
        await this.startTrack(uri);
    },

    async addToQueue(uri){
        if(!uri)throw new Error("Spotify queue item URI is missing.");
        if(!/^spotify:(track|episode):/.test(uri))throw new Error("Only Spotify tracks and episodes can be queued.");
        await this.ensureDesktopPlayer();
        await this.api({
            method:"POST",
            endpoint:"/me/player/queue?uri="+encodeURIComponent(uri)+"&device_id="+encodeURIComponent(this.desktopDeviceId)
        });
        this.showTemporaryMessage("Added to Spotify queue.");
    },

    async getQueue(){
        return this.api({method:"GET",endpoint:"/me/player/queue"});
    },

    async buildContinuationQueue(seedTrack){
        if(!seedTrack?.uri)return;
        const artist=seedTrack.artists?.[0]?.name||"";
        const title=seedTrack.name||"";
        const queries=[];
        if(artist)queries.push(artist);
        if(title&&artist)queries.push(artist+" "+title);

        const candidates=new Map();
        for(const query of queries){
            try{
                const data=await this.search(query,"track");
                for(const item of data?.tracks?.items||[]){
                    if(item?.uri&&item.uri!==seedTrack.uri&&item.is_playable!==false&&!candidates.has(item.uri))candidates.set(item.uri,item);
                }
            }catch(error){
                console.warn("Spotify continuation search failed:",error.message);
            }
        }

        const tracks=[...candidates.values()];
        for(let i=tracks.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tracks[i],tracks[j]]=[tracks[j],tracks[i]];}
        const selected=tracks.slice(0,6);
        if(!selected.length)return;

        let existing=[];
        try{const queue=await this.getQueue();existing=(queue?.queue||[]).map(item=>item?.uri).filter(Boolean);}
        catch(error){console.warn("Spotify queue check failed:",error.message);}

        let added=0;
        for(const item of selected){
            if(existing.includes(item.uri))continue;
            try{
                await this.addToQueue(item.uri);
                added++;
            }catch(error){
                console.warn("Spotify continuation queue add failed:",error.message);
            }
        }

        if(added>0){
            this.showTemporaryMessage("Continuation queue ready.");
        }
    },

    async playPlaylist(uri){
        if(!uri)throw new Error("Spotify playlist URI is missing.");
        this.continuationMode=null;
        this.continuationSeedUri="";
        await this.startContext(uri);
    },

    async playContext(uri){
        if(!uri)throw new Error("Spotify context URI is missing.");
        this.continuationMode=null;
        this.continuationSeedUri="";
        await this.startContext(uri);
    },

    async playPodcastShow(uri){
        if(!uri)throw new Error("Spotify podcast URI is missing.");
        this.continuationMode=null;
        this.continuationSeedUri="";
        await this.startContext(uri);
    },

    async albumTracks(uri,limit=50){
        const id=String(uri||"").split(":").pop();
        if(!id)throw new Error("Spotify album ID is missing.");
        return this.api({method:"GET",endpoint:"/albums/"+encodeURIComponent(id)+"/tracks?limit="+Math.min(50,Math.max(1,limit))});
    },

    async search(query,type="all"){
        const clean=String(query||"").trim();

        if(!clean)return null;

        const types=type==="all"
            ?["album","artist","playlist","track","show","episode"]
            :[type];

        return this.api({
            method:"GET",
            endpoint:
                "/search?q="+encodeURIComponent(clean)+
                "&type="+encodeURIComponent(types.join(","))+
                "&limit=10"
        });
    }

};

function formatTime(ms){
    const total=Math.max(0,Math.floor((ms||0)/1000));
    const minutes=Math.floor(total/60);
    const seconds=String(total%60).padStart(2,"0");
    return minutes+":"+seconds;
}

document.addEventListener("DOMContentLoaded",()=>{
    document.getElementById("media-play")?.addEventListener("click",()=>spotifyService.togglePlayback());
    document.getElementById("media-next")?.addEventListener("click",()=>spotifyService.next());
    document.getElementById("media-previous")?.addEventListener("click",()=>spotifyService.previous());
    document.getElementById("media-shuffle")?.addEventListener("click",()=>spotifyService.toggleShuffle());
    document.getElementById("media-repeat")?.addEventListener("click",()=>spotifyService.cycleRepeat());

    window.electron?.onSpotifyAuthComplete?.(async()=>{
        spotifyService.initialized=false;
        spotifyService.stopPolling();
        await spotifyService.initialize();
    });
});

window.spotifyService=spotifyService;

window.updateSpotifyPlayer=(track)=>{
    const title=document.getElementById("media-title");
    const artist=document.getElementById("media-artist");
    const artwork=document.getElementById("media-artwork-image");
    const current=document.getElementById("media-current");
    const duration=document.getElementById("media-duration");
    const fill=document.getElementById("media-progress-fill");
    const play=document.getElementById("media-play");

    if(!track){
        if(title)title.textContent="Nothing playing";
        if(artist)artist.textContent="No active media";
        if(artwork){
            artwork.removeAttribute("src");
            artwork.classList.remove("visible");
        }
        if(current)current.textContent="0:00";
        if(duration)duration.textContent="0:00";
        if(fill)fill.className="progress-0";
        if(play){
            play.textContent="↗";
            play.setAttribute("aria-label","Open Spotify");
        }
        spotifyService.updateModes();
        return;
    }

    if(title)title.textContent=track.name;
    if(artist)artist.textContent=track.artist;
    if(artwork){
        if(track.artwork){
            artwork.src=track.artwork;
            artwork.classList.add("visible");
        }else{
            artwork.removeAttribute("src");
            artwork.classList.remove("visible");
        }
    }
    if(current)current.textContent=formatTime(track.progress);
    if(duration)duration.textContent=formatTime(track.duration);
    if(fill){
        const percent=track.duration?Math.round((track.progress/track.duration)*100/5)*5:0;
        fill.className="progress-"+Math.max(0,Math.min(100,percent));
    }
    if(play){
        play.textContent="↗";
        play.setAttribute("aria-label","Open in Spotify");
    }
    spotifyService.updateModes();
};

const spotifyUi={
    overlay:null,
    rows:[],
    selectedIndex:0,
    filters:[
        {id:"all",name:"All"},
        {id:"songs",name:"Songs"},
        {id:"artists",name:"Artists"},
        {id:"albums",name:"Albums"},
        {id:"playlists",name:"Playlists"},
        {id:"podcasts",name:"Podcasts"},
        {id:"dj",name:"DJ"}
    ],
    selectedFilter:0,
    recentCache:null,
    recentCacheAt:0,
    recentCacheTtl:60000,

    ensure(){
        if(this.overlay)return this.overlay;

        const overlay=document.createElement("div");
        overlay.id="spotify-library-overlay";
        overlay.innerHTML=
            '<div class="spotify-library-panel" role="dialog" aria-modal="true">'+
                '<div class="spotify-library-header">'+
                    '<div><div class="spotify-library-kicker">SPOTIFY</div><h2 id="spotify-library-title"></h2></div>'+
                    '<button id="spotify-library-close" type="button" aria-label="Close">ESC</button>'+
                '</div>'+
                '<div class="spotify-library-filters" role="tablist" aria-label="Spotify recently played filters">'+
                    this.filters.map((filter,index)=>
                        '<button class="spotify-library-filter" type="button" data-filter-index="'+index+'" role="tab" aria-selected="'+(index===0?"true":"false")+'">'+filter.name+'</button>'
                    ).join("")+
                '</div>'+
                '<div id="spotify-library-content" tabindex="0"></div>'+
            '</div>';

        document.body.appendChild(overlay);
        this.overlay=overlay;

        overlay.querySelector("#spotify-library-close").onclick=()=>this.close();

        overlay.querySelectorAll(".spotify-library-filter").forEach((button,index)=>{
            button.onclick=()=>this.selectFilter(index);
        });

        overlay.addEventListener("click",event=>{
            if(event.target===overlay)this.close();
        });

        return overlay;
    },

    close(){
        if(!this.overlay)return;
        this.overlay.classList.remove("visible");
        this.rows=[];
        this.selectedIndex=0;
        this.selectedFilter=0;
        this.updateFilterVisuals();
    },

    isOpen(){
        return !!this.overlay?.classList.contains("visible");
    },

    updateFilterVisuals(){
        this.overlay?.querySelectorAll(".spotify-library-filter").forEach((button,index)=>{
            const selected=index===this.selectedFilter;
            button.classList.toggle("selected",selected);
            button.setAttribute("aria-selected",selected?"true":"false");
        });
    },

    moveFilter(direction){
        if(!this.filters.length)return;
        this.selectedFilter+=direction;
        if(this.selectedFilter<0)this.selectedFilter=this.filters.length-1;
        if(this.selectedFilter>=this.filters.length)this.selectedFilter=0;
        this.updateFilterVisuals();
        this.renderRecentFilter();
    },

    async selectFilter(index){
        if(index<0||index>=this.filters.length)return;
        this.selectedFilter=index;
        this.updateFilterVisuals();
        await this.renderRecentFilter();
    },

    setRows(rows){
        this.rows=rows;
        this.selectedIndex=0;
        rows.forEach((row,index)=>row.classList.toggle("selected",index===0));
        rows[0]?.focus();
    },

    move(direction){
        if(!this.rows.length)return;
        this.selectedIndex+=direction;
        if(this.selectedIndex<0)this.selectedIndex=this.rows.length-1;
        if(this.selectedIndex>=this.rows.length)this.selectedIndex=0;
        this.rows.forEach((row,index)=>row.classList.toggle("selected",index===this.selectedIndex));
        this.rows[this.selectedIndex]?.focus();
    },

    async select(){
        const row=this.rows[this.selectedIndex];
        if(!row)return;

        const action=row.dataset.action||"";
        const uri=row.dataset.uri||"";

        try{
            if(action==="dj"){
                const result=await spotifyService.openDj();
                if(result?.success===false){
                    throw new Error(result.error||"Unable to open Spotify DJ.");
                }
                this.close();
                return;
            }

            if(!uri)return;

            if(
                row.dataset.type==="track" ||
                row.dataset.type==="song" ||
                row.dataset.type==="episode"
            ){
                await spotifyService.playTrack(uri);
            }else if(
                row.dataset.type==="playlist" ||
                row.dataset.type==="artist" ||
                row.dataset.type==="album" ||
                row.dataset.type==="show" ||
                row.dataset.type==="podcast"
            ){
                await spotifyService.playContext(uri);
            }

            this.close();
        }catch(error){
            this.showStatus(error.message);
        }
    },

    showStatus(message){
        const content=this.overlay?.querySelector("#spotify-library-content");
        if(!content)return;
        let status=content.querySelector("#spotify-library-status");
        if(!status){
            status=document.createElement("div");
            status.id="spotify-library-status";
            content.prepend(status);
        }
        status.textContent=message;
    },

    async loadRecentActivity(){
        if(
            this.recentCache &&
            Date.now()-this.recentCacheAt<this.recentCacheTtl
        ){
            return this.recentCache;
        }

        this.recentCache=(async()=>{
            const data=await spotifyService.recentlyPlayed(50);
            const sourceItems=data?.items||[];

            const songs=sourceItems.map(item=>({
                type:"song",
                name:item.track?.name||"Unknown Song",
                subtitle:item.track?.artists?.map(a=>a.name).join(", ")||"Unknown Artist",
                image:item.track?.album?.images?.[2]?.url||item.track?.album?.images?.[0]?.url||"",
                uri:item.track?.uri||"",
                playedAt:item.played_at||"",
                source:"recent"
            }));

            const artistMap=new Map();
            const albumMap=new Map();
            const playlistMap=new Map();
            const podcastMap=new Map();

            for(const item of sourceItems){
                const playedAt=item.played_at||"";
                const track=item.track;
                const context=item.context;

                if(track?.album?.id){
                    const existing=albumMap.get(track.album.id);
                    if(!existing||String(playedAt)>String(existing.playedAt)){
                        albumMap.set(track.album.id,{
                            type:"album",
                            name:track.album.name||"Unknown Album",
                            subtitle:track.artists?.map(a=>a.name).join(", ")||"Album",
                            image:track.album?.images?.[2]?.url||track.album?.images?.[0]?.url||"",
                            uri:track.album.uri||"",
                            playedAt,
                            source:"derived"
                        });
                    }
                }

                for(const artist of track?.artists||[]){
                    if(!artist?.id)continue;
                    const existing=artistMap.get(artist.id);
                    if(!existing||String(playedAt)>String(existing.playedAt)){
                        artistMap.set(artist.id,{
                            type:"artist",
                            name:artist.name||"Unknown Artist",
                            subtitle:"Artist",
                            image:track?.album?.images?.[2]?.url||track?.album?.images?.[0]?.url||"",
                            uri:artist.uri||"",
                            playedAt,
                            source:"derived"
                        });
                    }
                }

                if(context?.type==="playlist"&&context.uri){
                    const id=context.uri.split(":").pop();
                    if(id&&!playlistMap.has(id)){
                        playlistMap.set(id,{
                            type:"playlist",
                            name:"Playlist",
                            subtitle:"Playlist",
                            image:track?.album?.images?.[2]?.url||track?.album?.images?.[0]?.url||"",
                            uri:context.uri,
                            playedAt,
                            source:"derived"
                        });
                    }
                }

                if(context?.type==="show"&&context.uri){
                    const id=context.uri.split(":").pop();
                    if(id&&!podcastMap.has(id)){
                        podcastMap.set(id,{
                            type:"podcast",
                            name:"Podcast",
                            subtitle:"Podcast show",
                            image:track?.album?.images?.[2]?.url||track?.album?.images?.[0]?.url||"",
                            uri:context.uri,
                            playedAt,
                            source:"derived"
                        });
                    }
                }
            }

            /*
                Do not fan out one recently-played request into dozens
                of additional Spotify API calls. A 50-track history can
                contain many unique artists/playlists/shows, and the old
                Promise.all() enrichment could immediately hit Spotify's
                rate limit.

                The recent-history response already contains the useful
                artist/playlist/show URIs. Keep those rows local and use
                the metadata Spotify already returned.
            */

            const artists=[...artistMap.values()];
            const albums=[...albumMap.values()];
            const playlists=[...playlistMap.values()];
            const podcasts=[...podcastMap.values()];
            const dj={
                type:"dj",
                name:"Spotify DJ",
                subtitle:"Open Spotify DJ",
                image:"",
                uri:"",
                action:"dj",
                playedAt:new Date().toISOString(),
                source:"special"
            };

            const sorted=items=>items.sort((a,b)=>
                String(b.playedAt).localeCompare(String(a.playedAt))
            );

            return {
                all:sorted([...songs,...artists,...albums,...playlists,...podcasts,dj]),
                songs:sorted(songs),
                artists:sorted(artists),
                albums:sorted(albums),
                playlists:sorted(playlists),
                podcasts:sorted(podcasts),
                dj:[dj]
            };
        })();

        try{
            const result=await this.recentCache;
            this.recentCacheAt=Date.now();
            return result;
        }catch(error){
            this.recentCache=null;
            this.recentCacheAt=0;
            throw error;
        }
    },

    getRowIcon(type){
        const icons={
            song:"♫",
            artist:"♪",
            album:"▰",
            playlist:"▤",
            podcast:"◉",
            dj:"✦"
        };
        return icons[type]||"•";
    },

    async renderRecentFilter(){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");
        const filter=this.filters[this.selectedFilter];

        overlay.querySelector("#spotify-library-title").textContent="Recently Played";
        overlay.querySelector(".spotify-library-filters").style.display="flex";
        overlay.classList.add("visible");
        this.updateFilterVisuals();

        content.innerHTML='<div id="spotify-library-status">Loading...</div>';

        try{
            const activity=await this.loadRecentActivity();
            const items=activity[filter.id]||[];

            if(!items.length){
                content.innerHTML=
                    '<div class="spotify-library-empty">'+
                        '<strong>No '+filter.name.toLowerCase()+' found in recent activity.</strong>'+
                        '<span>Spotify only exposes recent track history through this endpoint. Podcast entries are derived from recent track contexts when available.</span>'+
                    '</div>';
                this.rows=[];
                return;
            }

            content.innerHTML=items.map((item,index)=>
                '<button class="spotify-library-row" type="button" data-uri="'+
                    (item.uri||"")+
                    '" data-type="'+
                    (item.type||"")+
                    '" data-action="'+
                    (item.action||"")+
                    '" data-index="'+
                    index+
                '">'+
                    (item.image
                        ?'<img src="'+item.image+'" alt="" loading="lazy">'
                        :'<span class="spotify-library-row-icon '+(item.type||"")+'" aria-hidden="true">'+this.getRowIcon(item.type)+'</span>')+
                    '<span class="spotify-library-row-text"><strong></strong><span></span></span>'+
                '</button>'
            ).join("");

            const rows=[...content.querySelectorAll(".spotify-library-row")];

            rows.forEach(row=>{
                const image=row.querySelector("img");
                if(image){
                    image.referrerPolicy="no-referrer";
                    image.addEventListener("error",()=>{
                        const icon=document.createElement("span");
                        icon.className="spotify-library-row-icon "+(row.dataset.type||"");
                        icon.setAttribute("aria-hidden","true");
                        icon.textContent=this.getRowIcon(row.dataset.type||"");
                        image.replaceWith(icon);
                    },{once:true});
                }
            });

            items.forEach((item,index)=>{
                const row=rows[index];
                if(!row)return;

                row.querySelector("strong").textContent=item.name||"Unknown";
                row.querySelector(".spotify-library-row-text > span").textContent=item.subtitle||"";

                row.onclick=()=>{
                    this.selectedIndex=index;
                    this.setRows(rows);
                    this.select();
                };
            });

            this.setRows(rows);
        }catch(error){
            content.innerHTML='<div id="spotify-library-status"></div>';
            content.querySelector("#spotify-library-status").textContent=error.message;
            this.rows=[];
        }
    },

    async showSearch(){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");

        overlay.querySelector("#spotify-library-title").textContent="Search Spotify";
        overlay.classList.add("visible");
        overlay.querySelector(".spotify-library-filters").style.display="none";

        content.innerHTML=
            '<form id="spotify-search-form" class="spotify-search-form">'+
                '<input id="spotify-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search Spotify..." aria-label="Search Spotify">'+
                '<button type="submit">Search</button>'+
            '</form>'+
            '<div class="spotify-search-typebar" role="tablist" aria-label="Spotify search type">'+
                '<button type="button" class="spotify-search-type selected" data-type="all">All</button>'+
                '<button type="button" class="spotify-search-type" data-type="track">Songs</button>'+
                '<button type="button" class="spotify-search-type" data-type="artist">Artists</button>'+
                '<button type="button" class="spotify-search-type" data-type="album">Albums</button>'+
                '<button type="button" class="spotify-search-type" data-type="playlist">Playlists</button>'+
                '<button type="button" class="spotify-search-type" data-type="show">Podcasts</button>'+
                '<button type="button" class="spotify-search-type" data-type="episode">Episodes</button>'+
            '</div>'+
            '<div id="spotify-search-results"><div class="spotify-library-status">Search Spotify by song, artist, album, playlist, podcast, or episode.</div></div>';

        const form=content.querySelector("#spotify-search-form");
        const input=content.querySelector("#spotify-search-input");
        const results=content.querySelector("#spotify-search-results");
        let selectedType="all";

        content.querySelectorAll(".spotify-search-type").forEach(button=>{
            button.onclick=()=>{
                selectedType=button.dataset.type||"all";
                content.querySelectorAll(".spotify-search-type").forEach(item=>{
                    item.classList.toggle("selected",item===button);
                });
            };
        });

        form.onsubmit=async event=>{
            event.preventDefault();

            const query=input.value.trim();
            if(!query){
                results.innerHTML='<div class="spotify-library-status">Enter something to search for.</div>';
                input.focus();
                return;
            }

            results.innerHTML='<div class="spotify-library-status">Searching Spotify...</div>';

            try{
                const data=await spotifyService.search(query,selectedType);
                const groups=[
                    ["Tracks",data?.tracks?.items||[],"track"],
                    ["Artists",data?.artists?.items||[],"artist"],
                    ["Albums",data?.albums?.items||[],"album"],
                    ["Playlists",data?.playlists?.items||[],"playlist"],
                    ["Podcasts",data?.shows?.items||[],"show"],
                    ["Episodes",data?.episodes?.items||[],"episode"]
                ];

                const rows=groups.flatMap(([label,items,type])=>
                    items.filter(item=>item?.uri).map(item=>({
                        type,
                        name:item.name||"Unknown",
                        subtitle:
                            type==="track"
                                ?item.artists?.map(a=>a.name).join(", ")||"Track"
                                :type==="artist"
                                    ?"Artist"
                                    :type==="album"
                                        ?item.artists?.map(a=>a.name).join(", ")||"Album"
                                        :type==="playlist"
                                            ?item.owner?.display_name
                                                ?"Playlist • "+item.owner.display_name
                                                :"Playlist"
                                            :type==="show"
                                                ?"Podcast"
                                                :"Episode",
                        image:
                            item.images?.[2]?.url||
                            item.images?.[0]?.url||
                            item.album?.images?.[2]?.url||
                            item.album?.images?.[0]?.url||
                            "",
                        uri:item.uri,
                        spotifyUrl:item.external_urls?.spotify||""
                    }))
                );

                if(!rows.length){
                    results.innerHTML='<div class="spotify-library-status">No Spotify results found.</div>';
                    this.rows=[];
                    return;
                }

                results.innerHTML=rows.map(item=>
                    '<div class="spotify-result-group">'+
                        '<button class="spotify-library-row" type="button" data-uri="'+
                            this.escapeAttribute(item.uri)+'" data-url="'+this.escapeAttribute(item.spotifyUrl)+'" data-type="'+this.escapeAttribute(item.type)+'">'+
                            (item.image
                                ?'<img src="'+this.escapeAttribute(item.image)+'" alt="" loading="lazy">'
                                :'<span class="spotify-library-row-icon '+item.type+'" aria-hidden="true">'+this.getRowIcon(item.type)+'</span>')+
                            '<span class="spotify-library-row-text"><strong></strong><span></span></span>'+ 
                        '</button>'+ 
                        (item.type==="track"
                            ?'<button class="spotify-queue-button" type="button">+ Queue</button>'
                            :item.type==="album"
                                ?'<button class="spotify-queue-button" type="button">Open Album</button>'
                                :'')+
                    '</div>'
                ).join("");

                const rowElements=[...results.querySelectorAll(".spotify-library-row")];

                rows.forEach((item,index)=>{
                    const row=rowElements[index];
                    if(!row)return;

                    row.querySelector("strong").textContent=item.name;
                    row.querySelector(".spotify-library-row-text > span").textContent=item.subtitle;

                    const image=row.querySelector("img");
                    if(image){
                        image.referrerPolicy="no-referrer";
                        image.addEventListener("error",()=>{
                            const icon=document.createElement("span");
                            icon.className="spotify-library-row-icon "+item.type;
                            icon.setAttribute("aria-hidden","true");
                            icon.textContent=this.getRowIcon(item.type);
                            image.replaceWith(icon);
                        },{once:true});
                    }

                    row.onclick=async event=>{
                        event.preventDefault();
                        event.stopPropagation();
                        this.selectedIndex=index;
                        this.setRows(rowElements);
                        try{
                            if(item.type==="album"){
                                await this.showAlbumTracks(item);
                                return;
                            }
                            if(item.type==="track"||item.type==="episode"){
                                await spotifyService.playTrack(row.dataset.uri);
                            }else{
                                await spotifyService.playContext(row.dataset.uri);
                            }
                            this.close();
                        }catch(error){
                            console.error("Spotify search playback failed:",error);
                            this.showStatus(error.message||"Unable to start Spotify playback.");
                        }
                    };

                    const actionButton=row.parentElement?.querySelector(".spotify-queue-button");
                    if(actionButton&&item.type==="track"){
                        actionButton.onclick=async event=>{
                            event.preventDefault();
                            event.stopPropagation();
                            try{await spotifyService.addToQueue(item.uri);}
                            catch(error){this.showStatus(error.message||"Unable to add track to queue.");}
                        };
                    }
                    if(actionButton&&item.type==="album"){
                        actionButton.onclick=async event=>{
                            event.preventDefault();
                            event.stopPropagation();
                            await this.showAlbumTracks(item);
                        };
                    }
                });

                this.setRows(rowElements);
            }catch(error){
                results.innerHTML='<div class="spotify-library-status"></div>';
                results.querySelector(".spotify-library-status").textContent=error.message;
                this.rows=[];
            }
        };

        input.focus();
    },

    async showAlbumTracks(album){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");
        overlay.querySelector("#spotify-library-title").textContent=album?.name||"Album";
        overlay.querySelector(".spotify-library-filters").style.display="none";
        overlay.classList.add("visible");
        content.innerHTML='<div id="spotify-library-status">Loading album tracks...</div>';
        this.rows=[];
        try{
            const data=await spotifyService.albumTracks(album?.uri,50);
            const items=(data?.items||[]).filter(item=>item?.uri);
            content.innerHTML='<div class="spotify-album-subheader"><button id="spotify-album-back" type="button">← Back to Search</button><span>'+(album?.subtitle||"Album")+'</span></div>'+
                (items.length?items.map(item=>'<div class="spotify-result-group"><button class="spotify-library-row" type="button" data-uri="'+this.escapeAttribute(item.uri)+'" data-type="track"><span class="spotify-library-row-icon song" aria-hidden="true">'+this.getRowIcon("song")+'</span><span class="spotify-library-row-text"><strong></strong><span></span></span></button><button class="spotify-queue-button" type="button">+ Queue</button></div>').join(""):'<div id="spotify-library-status">No playable tracks were returned for this album.</div>');
            content.querySelector("#spotify-album-back")?.addEventListener("click",()=>this.showSearch());
            const rows=[...content.querySelectorAll(".spotify-library-row")];
            items.forEach((item,index)=>{
                const row=rows[index];
                if(!row)return;
                row.querySelector("strong").textContent=(item.track_number?String(item.track_number).padStart(2,"0")+"  ":"")+item.name;
                row.querySelector(".spotify-library-row-text > span").textContent=item.artists?.map(a=>a.name).join(", ")||"Track";
                row.onclick=async()=>{
                    this.selectedIndex=index;
                    this.setRows(rows);
                    try{await spotifyService.playTrack(item.uri);this.close();}
                    catch(error){this.showStatus(error.message||"Unable to start Spotify playback.");}
                };
                row.parentElement?.querySelector(".spotify-queue-button")?.addEventListener("click",async event=>{
                    event.preventDefault();event.stopPropagation();
                    try{await spotifyService.addToQueue(item.uri);}
                    catch(error){this.showStatus(error.message||"Unable to add track to queue.");}
                });
            });
            this.setRows(rows);
        }catch(error){
            content.innerHTML='<div id="spotify-library-status"></div>';
            content.querySelector("#spotify-library-status").textContent=error.message;
            this.rows=[];
        }
    },

    escapeAttribute(value){
        return String(value||"")
            .replace(/&/g,"&amp;")
            .replace(/"/g,"&quot;")
            .replace(/</g,"&lt;")
            .replace(/>/g,"&gt;");
    },

    async showRecentlyPlayed(){
        this.selectedFilter=0;
        this.ensure();
        this.recentCacheAt=0;
        await this.renderRecentFilter();
    },

    async showPlaylists(){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");

        overlay.querySelector("#spotify-library-title").textContent="Playlists";
        overlay.classList.add("visible");
        overlay.querySelector(".spotify-library-filters").style.display="none";
        content.innerHTML='<div id="spotify-library-status">Loading...</div>';

        try{
            const data=await spotifyService.playlists(20);
            const items=data?.items||[];

            content.innerHTML=items.length
                ?items.map((item,index)=>{
                    const image=item?.images?.[2]?.url||item?.images?.[0]?.url||"";
                    return '<button class="spotify-playlist-row" type="button" data-uri="'+
                        (item?.uri||"")+
                        '" data-index="'+index+'">'+
                        (image
                            ?'<img src="'+image+'" alt="" loading="lazy">'
                            :'<span class="spotify-library-row-icon playlist" aria-hidden="true">▤</span>')+
                        '<span></span>'+
                    '</button>';
                }).join("")
                :'<div id="spotify-library-status">No playlists found.</div>';

            const rows=[...content.querySelectorAll(".spotify-playlist-row")];

            items.forEach((item,index)=>{
                const row=rows[index];
                if(!row)return;

                row.querySelector("span").textContent=item.name||"Untitled Playlist";

                row.onclick=async()=>{
                    this.selectedIndex=index;
                    this.setRows(rows);

                    try{
                        await spotifyService.playPlaylist(row.dataset.uri);
                        this.close();
                    }catch(error){
                        this.showStatus(error.message);
                    }
                };
            });

            this.setRows(rows);
        }catch(error){
            content.innerHTML='<div id="spotify-library-status"></div>';
            content.querySelector("#spotify-library-status").textContent=error.message;
            this.rows=[];
        }
    }
};

document.addEventListener("keydown",event=>{
    if(!spotifyUi.isOpen())return;

    if(
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
    ){
        if(event.key!=="Escape")return;
    }

    if(event.key==="Escape"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.close();
        return;
    }

    if(event.key==="ArrowRight"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.moveFilter(1);
        return;
    }

    if(event.key==="ArrowLeft"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.moveFilter(-1);
        return;
    }

    if(event.key==="ArrowDown"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.move(1);
        return;
    }

    if(event.key==="ArrowUp"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.move(-1);
        return;
    }

    if(event.key==="Enter"){
        event.preventDefault();
        event.stopPropagation();
        spotifyUi.select();
    }
},true);

window.spotifyService=spotifyService;
window.spotifyUi=spotifyUi;
