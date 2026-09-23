/*
    Spotify Web Playback SDK bootstrap.

    The SDK looks for this callback while its script loads.
    Keep it in a local file so the renderer CSP does not need
    to allow inline JavaScript.
*/

window.spotifySdkReady = false;

window.onSpotifyWebPlaybackSDKReady = function(){
    window.spotifySdkReady = true;

    window.dispatchEvent(
        new CustomEvent("spotify-sdk-ready")
    );
};
