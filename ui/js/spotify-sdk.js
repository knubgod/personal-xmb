/*
    ========================================================
    SPOTIFY WEB PLAYBACK / EME DIAGNOSTICS
    ========================================================

    This diagnostic runs before Spotify creates its player.
    It checks the same browser-level EME capability that the
    Web Playback SDK depends on, without accessing credentials.
*/

async function diagnoseSpotifyEme() {

    console.log(
        "[Spotify EME diagnostic] user agent:",
        navigator.userAgent
    );

    if (
        typeof navigator.requestMediaKeySystemAccess !==
        "function"
    ) {

        console.error(
            "[Spotify EME diagnostic] requestMediaKeySystemAccess is unavailable."
        );

        return;

    }

    const configurations = [
        {
            initDataTypes: [
                "cenc"
            ],
            audioCapabilities: [
                {
                    contentType:
                        "audio/mp4; codecs=\"mp4a.40.2\""
                }
            ],
            videoCapabilities: [
                {
                    contentType:
                        "video/mp4; codecs=\"avc1.42E01E\""
                }
            ]
        }
    ];

    try {

        const access =
            await navigator.requestMediaKeySystemAccess(
                "com.widevine.alpha",
                configurations
            );

        console.log(
            "[Spotify EME diagnostic] Widevine key system available:",
            access.keySystem
        );

        console.log(
            "[Spotify EME diagnostic] Widevine configuration:",
            access.getConfiguration()
        );

    }
    catch (error) {

        console.error(
            "[Spotify EME diagnostic] Widevine key system unavailable:",
            error?.name || "UnknownError",
            error?.message || error
        );

    }

}


diagnoseSpotifyEme();


window.onSpotifyWebPlaybackSDKReady=async()=>{
    /*
        The SDK can load before the user has authenticated with Spotify.
        Do not treat that as a player failure. The service will retry
        after spotify-auth-complete and again on the first playback action.
    */
    try{
        await window.spotifyService?.initializeWebPlayback?.();
    }catch(error){
        console.debug(
            "[Spotify] Web Playback SDK loaded; waiting for Spotify authentication.",
            error?.message||error
        );
    }
};
