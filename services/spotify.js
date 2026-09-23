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

    async api(request){
        const result=await window.electron?.spotifyApi?.(request);
        if(!result?.success){
            throw new Error(result?.error||"Spotify API request failed.");
        }
        return result.data;
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

    async openDj(){
        try{
            const result=await window.electron?.openExternal?.("spotify:search:DJ");
            if(result)return {success:true};
        }catch(error){
            console.warn("Spotify desktop DJ URI failed:",error.message);
        }

        try{
            const result=await window.electron?.openExternal?.("https://open.spotify.com/search/DJ");
            return {
                success:!!result,
                error:result?"":"Unable to open Spotify DJ."
            };
        }catch(error){
            return {success:false,error:error.message};
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
    async openUri(uri,fallbackUrl=""){
        if(!uri&&!fallbackUrl)return false;

        try{
            if(uri){
                const opened=await window.electron?.openExternal?.(uri);
                if(opened)return true;
            }
        }catch(error){
            console.warn("Spotify URI open failed:",error.message);
        }

        if(fallbackUrl){
            try{
                return !!(await window.electron?.openExternal?.(fallbackUrl));
            }catch(error){
                console.warn("Spotify web fallback failed:",error.message);
            }
        }

        return false;
    },

    async togglePlayback(){
        const track=this.currentTrack;

        if(!track){
            await this.openUri("spotify:", "https://open.spotify.com/");
            return;
        }

        const opened=await this.openUri(
            track.uri,
            track.spotifyUrl||"https://open.spotify.com/"
        );

        if(!opened){
            console.warn("Unable to open Spotify for the current item.");
        }
    },

    async next(){
        await this.openSpotifyDesktop();
    },

    async previous(){
        await this.openSpotifyDesktop();
    },

    async openSpotifyDesktop(){
        try{
            const result=await window.electron?.spotifyLaunchDesktop?.();
            if(result?.success===false){
                throw new Error(result.error||"Unable to launch Spotify.");
            }
            return result?.success!==false;
        }catch(error){
            console.warn("Spotify desktop launch failed:",error.message);
            return false;
        }
    },

    async toggleShuffle(){
        showTemporaryMessage(
            "Playback controls are handled by Spotify."
        );
    },

    async cycleRepeat(){
        showTemporaryMessage(
            "Playback controls are handled by Spotify."
        );
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

    async playTrack(uri){
        if(!uri)return;

        const opened=await this.openUri(
            uri,
            "https://open.spotify.com/"
        );

        if(!opened){
            throw new Error("Unable to open Spotify.");
        }

        this.lastPlayerRefresh=0;
    },

    async playPlaylist(uri){
        if(!uri)return;

        const opened=await this.openUri(
            uri,
            "https://open.spotify.com/"
        );

        if(!opened){
            throw new Error("Unable to open Spotify.");
        }

        this.lastPlayerRefresh=0;
    },

    async playContext(uri){
        if(!uri)return;

        const opened=await this.openUri(
            uri,
            "https://open.spotify.com/"
        );

        if(!opened){
            throw new Error("Unable to open Spotify.");
        }

        this.lastPlayerRefresh=0;
    },

    async playPodcastShow(uri){
        if(!uri)return;

        const opened=await this.openUri(
            uri,
            "https://open.spotify.com/"
        );

        if(!opened){
            throw new Error("Unable to open Spotify.");
        }

        this.lastPlayerRefresh=0;
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

            if(row.dataset.type==="playlist"){
                await spotifyService.playPlaylist(uri);
            }else if(row.dataset.type==="song"){
                await spotifyService.playTrack(uri);
            }else if(row.dataset.type==="artist"){
                await spotifyService.playContext(uri);
            }else if(row.dataset.type==="podcast"){
                await spotifyService.playPodcastShow(uri);
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
            const playlistMap=new Map();
            const podcastMap=new Map();

            for(const item of sourceItems){
                const playedAt=item.played_at||"";
                const track=item.track;
                const context=item.context;

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
                all:sorted([...songs,...artists,...playlists,...podcasts,dj]),
                songs:sorted(songs),
                artists:sorted(artists),
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
                    '<button class="spotify-library-row" type="button" data-uri="'+
                        this.escapeAttribute(item.uri)+
                        '" data-url="'+this.escapeAttribute(item.spotifyUrl)+
                        '" data-type="'+this.escapeAttribute(item.type)+'">'+
                        (item.image
                            ?'<img src="'+this.escapeAttribute(item.image)+'" alt="" loading="lazy">'
                            :'<span class="spotify-library-row-icon '+item.type+'" aria-hidden="true">'+this.getRowIcon(item.type)+'</span>')+
                        '<span class="spotify-library-row-text"><strong></strong><span></span></span>'+
                    '</button>'
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

                    row.onclick=async()=>{
                        this.selectedIndex=index;
                        this.setRows(rowElements);

                        try{
                            await spotifyService.playContext(row.dataset.uri);
                            this.close();
                        }catch(error){
                            this.showStatus(error.message);
                        }
                    };
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
