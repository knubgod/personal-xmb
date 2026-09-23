const spotifyService={
    initialized:false,
    polling:false,
    pollTimer:null,
    progressTimer:null,
    currentTrack:null,
    shuffle:false,
    repeat:"off",

    async initialize(){
        if(this.initialized)return;
        this.initialized=true;
        await this.refreshNowPlaying();
        this.startPolling();
        this.startProgressTicker();
    },

    startPolling(){
        if(this.polling)return;
        this.polling=true;
        this.pollTimer=setInterval(()=>this.refreshNowPlaying(),5000);
    },

    startProgressTicker(){
        if(this.progressTimer)return;
        this.progressTimer=setInterval(()=>{
            if(!this.currentTrack)return;
            if(this.currentTrack.isPlaying&&this.currentTrack.duration>0){
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

    async api(request){
        const result=await window.electron?.spotifyApi?.(request);
        if(!result?.success){
            throw new Error(result?.error||"Spotify API request failed.");
        }
        return result.data;
    },

    async refreshNowPlaying(){
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

            this.currentTrack={
                id:item.id,
                uri:item.uri||"",
                name:item.name||"Unknown Track",
                artist:item.artists?.map(a=>a.name).join(", ")||"Unknown Artist",
                album:item.album?.name||"Unknown Album",
                artwork:item.album?.images?.[0]?.url||"",
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
            if(play)play.textContent="▶";
            return;
        }

        if(title)title.textContent=track.name;
        if(artist)artist.textContent=track.artist;
        if(artwork){
            artwork.src=track.artwork||"";
            artwork.classList.toggle("visible",Boolean(track.artwork));
        }
        if(current)current.textContent=formatTime(track.progress);
        if(duration)duration.textContent=formatTime(track.duration);
        if(fill){
            const percent=track.duration?Math.round((track.progress/track.duration)*100/5)*5:0;
            fill.className="progress-"+Math.max(0,Math.min(100,percent));
        }
        if(play){
            play.textContent=track.isPlaying?"❚❚":"▶";
            play.setAttribute("aria-label",track.isPlaying?"Pause":"Play");
        }
    },

    async openDj(){
        /*
            Spotify does not expose a public Web API endpoint for
            starting the consumer DJ feature. We therefore use
            Spotify's desktop deep-link search route and fall back
            to the official web search page if the desktop client
            cannot handle it.
        */
        try{
            const desktopResult=await window.electron?.openExternal?.("spotify:search:DJ");

            if(desktopResult){
                return {success:true};
            }

            const webResult=await window.electron?.openExternal?.("https://open.spotify.com/search/DJ");
            return {
                success:!!webResult,
                error:webResult?"":"Unable to open Spotify DJ."
            };
        }catch(error){
            try{
                const webResult=await window.electron?.openExternal?.("https://open.spotify.com/search/DJ");
                return {
                    success:!!webResult,
                    error:webResult?"":error.message
                };
            }catch(fallbackError){
                return {
                    success:false,
                    error:fallbackError.message||error.message
                };
            }
        }
    },

    async login(){
        const result=await window.electron?.spotifyLogin?.();
        if(result?.success===false){
            throw new Error(result.error||"Spotify login failed.");
        }
    },

    async togglePlayback(){
        if(!this.currentTrack)return;
        try{
            await this.api({
                method:"PUT",
                endpoint:this.currentTrack.isPlaying?"/me/player/pause":"/me/player/play"
            });
            await this.refreshNowPlaying();
        }catch(error){
            console.warn("Spotify playback failed:",error.message);
        }
    },

    async next(){
        try{
            await this.api({method:"POST",endpoint:"/me/player/next"});
            setTimeout(()=>this.refreshNowPlaying(),500);
        }catch(error){
            console.warn("Spotify next failed:",error.message);
        }
    },

    async previous(){
        try{
            await this.api({method:"POST",endpoint:"/me/player/previous"});
            setTimeout(()=>this.refreshNowPlaying(),500);
        }catch(error){
            console.warn("Spotify previous failed:",error.message);
        }
    },

    async toggleShuffle(){
        const next=!this.shuffle;
        try{
            await this.api({
                method:"PUT",
                endpoint:"/me/player/shuffle?state="+next
            });
            this.shuffle=next;
            this.updateModes();
        }catch(error){
            console.warn("Shuffle failed:",error.message);
        }
    },

    async cycleRepeat(){
        const modes=["off","context","track"];
        const next=modes[(modes.indexOf(this.repeat)+1)%modes.length];

        try{
            await this.api({
                method:"PUT",
                endpoint:"/me/player/repeat?state="+next
            });
            this.repeat=next;
            this.updateModes();
        }catch(error){
            console.warn("Repeat failed:",error.message);
        }
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

    async recentlyPlayed(limit=20){
        return this.api({
            method:"GET",
            endpoint:"/me/player/recently-played?limit="+Math.min(50,limit)
        });
    },

    async playlists(limit=20){
        return this.api({
            method:"GET",
            endpoint:"/me/playlists?limit="+Math.min(50,limit)
        });
    },

    async playTrack(uri){
        if(!uri)return;
        await this.api({
            method:"PUT",
            endpoint:"/me/player/play",
            body:{uris:[uri]}
        });
        await this.refreshNowPlaying();
    },

    async playPlaylist(uri){
        if(!uri)return;
        await this.api({
            method:"PUT",
            endpoint:"/me/player/play",
            body:{context_uri:uri}
        });
        await this.refreshNowPlaying();
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
        await spotifyService.initialize();
    });
});

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
        if(play)play.textContent="▶";
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
        play.textContent=track.isPlaying?"❚❚":"▶";
        play.setAttribute("aria-label",track.isPlaying?"Pause":"Play");
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
        {id:"playlists",name:"Playlists"},
        {id:"podcasts",name:"Podcasts"},
        {id:"dj",name:"DJ"}
    ],
    selectedFilter:0,
    recentCache:null,

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
                '<div class="spotify-library-filters" role="tablist" aria-label="Spotify library filters">'+
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
        this.overlay.querySelector(".spotify-library-filters").style.display="flex";
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
                if(result?.success===false)throw new Error(result.error||"Unable to open Spotify DJ.");
                this.close();
                return;
            }
            if(!uri)return;
            if(row.dataset.type==="playlist")await spotifyService.playPlaylist(uri);
            else await spotifyService.playTrack(uri);
            this.close();
        }catch(error){
            const status=this.overlay?.querySelector("#spotify-library-status");
            if(status)status.textContent=error.message;
        }
    },

    async loadRecentActivity(){
        if(this.recentCache)return this.recentCache;
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
            for(const item of sourceItems){
                for(const artist of item.track?.artists||[]){
                    if(!artist?.id)continue;
                    const existing=artistMap.get(artist.id);
                    if(!existing||String(item.played_at)>String(existing.playedAt)){
                        artistMap.set(artist.id,{
                            type:"artist",
                            name:artist.name||"Unknown Artist",
                            subtitle:"Artist",
                            image:"",
                            uri:artist.uri||"",
                            playedAt:item.played_at||"",
                            source:"derived"
                        });
                    }
                }
            }

            const playlistMap=new Map();
            for(const item of sourceItems){
                const context=item.context;
                if(context?.type!=="playlist"||!context.uri)continue;
                const id=context.uri.split(":").pop();
                if(!id||playlistMap.has(id))continue;
                playlistMap.set(id,{
                    type:"playlist",
                    name:"Loading playlist...",
                    subtitle:"Playlist",
                    image:"",
                    uri:context.uri,
                    playedAt:item.played_at||"",
                    source:"derived"
                });
            }

            await Promise.all([...playlistMap.values()].map(async playlist=>{
                try{
                    const id=playlist.uri.split(":").pop();
                    const result=await spotifyService.api({
                        method:"GET",
                        endpoint:"/playlists/"+encodeURIComponent(id)
                    });
                    playlist.name=result?.name||"Untitled Playlist";
                    playlist.image=result?.images?.[2]?.url||result?.images?.[0]?.url||"";
                }catch(error){
                    playlist.name="Playlist";
                }
            }));

            const artists=[...artistMap.values()];
            const playlists=[...playlistMap.values()];
            const sorted=(items)=>items.sort((a,b)=>String(b.playedAt).localeCompare(String(a.playedAt)));

            return {
                all:sorted([...songs,...artists,...playlists]),
                songs:sorted(songs),
                artists:sorted(artists),
                playlists:sorted(playlists),
                podcasts:[],
                dj:[{type:"dj",name:"Spotify DJ",subtitle:"Open Spotify DJ",image:"",uri:"",action:"dj",playedAt:"",source:"special"}]
            };
        })();

        try{return await this.recentCache;}
        catch(error){this.recentCache=null;throw error;}
    },

    getRowIcon(type){
        const icons={song:"♫",artist:"♪",playlist:"▤",dj:"✦"};
        return icons[type]||"•";
    },

    async renderRecentFilter(){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");
        const filter=this.filters[this.selectedFilter];
        overlay.querySelector("#spotify-library-title").textContent="Recently Played";
        overlay.querySelector(".spotify-library-filters").style.display="flex";
        overlay.classList.add("visible");
        content.innerHTML='<div id="spotify-library-status">Loading...</div>';
        try{
            const activity=await this.loadRecentActivity();
            let items=activity[filter.id]||[];

            if(filter.id==="podcasts"){
                content.innerHTML='<div class="spotify-library-empty"><strong>Podcast listening history is not exposed by Spotify\'s recently-played API.</strong><span>Spotify currently exposes recently played tracks here, so podcast history cannot be populated reliably.</span></div>';
                this.rows=[];
                return;
            }

            content.innerHTML=items.length?items.map((item,index)=>
                '<button class="spotify-library-row" type="button" data-uri="'+(item.uri||"")+'" data-type="'+(item.type||"")+'" data-action="'+(item.action||"")+'" data-index="'+index+'">'+
                    (item.image?'<img src="'+item.image+'" alt="">':'<span class="spotify-library-row-icon" aria-hidden="true">'+this.getRowIcon(item.type)+'</span>')+
                    '<span class="spotify-library-row-text"><strong></strong><span></span></span>'+
                '</button>'
            ).join(""):'<div id="spotify-library-status">No recent items found.</div>';

            items.forEach((item,index)=>{
                const row=content.querySelectorAll(".spotify-library-row")[index];
                if(!row)return;
                row.querySelector("strong").textContent=item.name||"Unknown";
                row.querySelector(".spotify-library-row-text > span").textContent=item.subtitle||"";
                row.onclick=()=>{this.selectedIndex=index;this.setRows([...content.querySelectorAll(".spotify-library-row")]);this.select();};
            });
            this.setRows([...content.querySelectorAll(".spotify-library-row")]);
        }catch(error){
            content.innerHTML='<div id="spotify-library-status"></div>';
            content.querySelector("#spotify-library-status").textContent=error.message;
            this.rows=[];
        }
    },

    async showRecentlyPlayed(){
        this.selectedFilter=0;
        this.recentCache=null;
        this.ensure();
        this.updateFilterVisuals();
        await this.renderRecentFilter();
    },

    async showPlaylists(){
        const overlay=this.ensure();
        const content=overlay.querySelector("#spotify-library-content");
        overlay.querySelector("#spotify-library-title").textContent="Playlists";
        overlay.querySelector(".spotify-library-filters").style.display="none";
        overlay.classList.add("visible");
        content.innerHTML='<div id="spotify-library-status">Loading...</div>';
        try{
            const data=await spotifyService.playlists(20);
            const items=data?.items||[];
            content.innerHTML=items.length?items.map((item,index)=>{
                const image=item?.images?.[2]?.url||item?.images?.[0]?.url||"";
                return '<button class="spotify-playlist-row" type="button" data-uri="'+(item?.uri||"")+'" data-index="'+index+'">'+
                    (image?'<img src="'+image+'" alt="">':'<span class="spotify-library-row-icon" aria-hidden="true">▤</span>')+
                    '<span></span></button>';
            }).join(""):'<div id="spotify-library-status">No playlists found.</div>';
            items.forEach((item,index)=>{
                const row=content.querySelectorAll(".spotify-playlist-row")[index];
                if(!row)return;
                row.querySelector("span").textContent=item.name||"Untitled Playlist";
                row.onclick=async()=>{
                    this.selectedIndex=index;
                    this.setRows([...content.querySelectorAll(".spotify-playlist-row")]);
                    try{await spotifyService.playPlaylist(row.dataset.uri);this.close();}
                    catch(error){
                        const status=content.querySelector("#spotify-library-status")||document.createElement("div");
                        status.id="spotify-library-status";
                        status.textContent=error.message;
                        content.appendChild(status);
                    }
                };
            });
            this.setRows([...content.querySelectorAll(".spotify-playlist-row")]);
        }catch(error){
            content.innerHTML='<div id="spotify-library-status"></div>';
            content.querySelector("#spotify-library-status").textContent=error.message;
        }
    }
};
document.addEventListener("keydown",event=>{
    if(!spotifyUi.isOpen())return;

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
