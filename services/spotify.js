const spotifyService={
    initialized:false,
    polling:false,
    pollTimer:null,
    currentTrack:null,

    async initialize(){
        if(this.initialized)return;
        this.initialized=true;
        console.log("Spotify service initialized.");
        await this.refreshNowPlaying();
        this.startPolling();
    },

    startPolling(){
        if(this.polling)return;
        this.polling=true;
        this.pollTimer=setInterval(()=>this.refreshNowPlaying(),5000);
    },

    stopPolling(){
        if(this.pollTimer)clearInterval(this.pollTimer);
        this.pollTimer=null;
        this.polling=false;
    },

    async api(request){
        const result=await window.electron?.spotifyApi?.(request);
        if(!result?.success)throw new Error(result?.error||"Spotify API request failed.");
        return result.data;
    },

    async refreshNowPlaying(){
        try{
            const response=await this.api({method:"GET",endpoint:"/me/player"});
            if(!response?.item){
                this.currentTrack=null;
                this.updateInterface(null);
                return;
            }

            const item=response.item;
            this.currentTrack={
                id:item.id,
                name:item.name,
                artist:item.artists?.map(a=>a.name).join(", ")||"Unknown Artist",
                album:item.album?.name||"Unknown Album",
                artwork:item.album?.images?.[0]?.url||"",
                duration:item.duration_ms||0,
                progress:response.progress_ms||0,
                isPlaying:Boolean(response.is_playing),
                spotifyUrl:item.external_urls?.spotify||""
            };
            this.updateInterface(this.currentTrack);
        }catch(error){
            console.warn("Spotify refresh failed:",error.message);
            this.updateInterface(null);
        }
    },

    updateInterface(track){
        if(typeof window.updateSpotifyPlayer==="function"){
            window.updateSpotifyPlayer(track);
        }
    },

    async login(){
        const result=await window.electron?.spotifyLogin?.();
        if(result?.success===false)throw new Error(result.error||"Spotify login failed.");
    },

    async togglePlayback(){
        if(!this.currentTrack)return;
        const endpoint=this.currentTrack.isPlaying?"/me/player/pause":"/me/player/play";
        try{
            await this.api({method:"PUT",endpoint});
            setTimeout(()=>this.refreshNowPlaying(),350);
        }catch(error){console.warn("Spotify playback toggle failed:",error.message);}
    },

    async next(){
        try{await this.api({method:"POST",endpoint:"/me/player/next"});setTimeout(()=>this.refreshNowPlaying(),500);}
        catch(error){console.warn("Spotify next failed:",error.message);}
    },

    async previous(){
        try{await this.api({method:"POST",endpoint:"/me/player/previous"});setTimeout(()=>this.refreshNowPlaying(),500);}
        catch(error){console.warn("Spotify previous failed:",error.message);}
    },

    async recentlyPlayed(limit=10){
        try{
            return await this.api({method:"GET",endpoint:`/me/player/recently-played?limit=${Math.min(50,Math.max(1,limit))}`});
        }catch(error){
            console.warn("Spotify recently played failed:",error.message);
            return null;
        }
    }
};

document.addEventListener("DOMContentLoaded",()=>{
    const play=document.getElementById("media-play");
    const next=document.getElementById("media-next");
    const previous=document.getElementById("media-previous");

    play?.addEventListener("click",()=>spotifyService.togglePlayback());
    next?.addEventListener("click",()=>spotifyService.next());
    previous?.addEventListener("click",()=>spotifyService.previous());

    window.electron?.onSpotifyAuthComplete?.(()=>{
        spotifyService.refreshNowPlaying();
    });
});

window.spotifyService=spotifyService;
