/*
    Spotify Web Playback SDK bootstrap.

    Keep the SDK loaded, but do not create the Widevine-backed player
    until the user actually requests playback. Creating the player at
    application startup starts DRM/Connect work even when XMB is idle.
*/
window.onSpotifyWebPlaybackSDKReady=()=>{
    window.spotifyWebPlaybackSdkReady=true;
};
