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
                        "audio/mp4; codecs=\"mp4a.40.2\"",
                    robustness: "SW_SECURE_CRYPTO"
                }
            ],
            videoCapabilities: [
                {
                    contentType:
                        "video/mp4; codecs=\"avc1.42E01E\"",
                    robustness: "SW_SECURE_DECODE"
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


/*
    Do not run the EME probe during XMB boot. It creates an extra
    asynchronous media-key-system request before the user even enters
    Spotify. The diagnostic is still available when the SDK reports
    an actual initialization failure.
*/

/*
    Electron is intentionally not the Spotify audio engine.
    Playback is hosted in a supported desktop browser so Spotify's
    protected-media license flow runs in a supported environment.
*/
window.onSpotifyWebPlaybackSDKReady=()=>{
    console.debug(
        "[Spotify] SDK is loaded in Electron; browser playback engine is used instead."
    );
};
