/*
    ========================================================
    PERSONAL XMB SPOTIFY SERVICE
    ========================================================

    Handles:

        Spotify authentication
        Currently playing
        Playback controls
        Progress updates

*/


const spotifyService = {

    initialized: false,

    polling: false,

    pollTimer: null,

    currentTrack: null,


    /*
        ====================================================
        INITIALIZE
        ====================================================
    */

    async initialize() {

        if (
            this.initialized
        ) {

            return;

        }


        this.initialized =
            true;


        console.log(
            "Spotify service initialized."
        );


        /*
            Start checking playback.

            The API should not be hammered continuously,
            so we use a reasonable polling interval.
        */

        await this.refreshNowPlaying();


        this.startPolling();

    },


    /*
        ====================================================
        START POLLING
        ====================================================
    */

    startPolling() {

        if (
            this.polling
        ) {

            return;

        }


        this.polling =
            true;


        this.pollTimer =
            setInterval(
                () => {

                    this.refreshNowPlaying();

                },
                5000
            );

    },


    /*
        ====================================================
        STOP POLLING
        ====================================================
    */

    stopPolling() {

        if (
            this.pollTimer
        ) {

            clearInterval(
                this.pollTimer
            );

        }


        this.pollTimer =
            null;


        this.polling =
            false;

    },


    /*
        ====================================================
        REFRESH NOW PLAYING
        ====================================================
    */

    async refreshNowPlaying() {

        try {

            const response =
                await window.electron.spotifyApi(
                    {
                        method: "GET",

                        endpoint:
                            "/me/player"
                    }
                );


            /*
                Nothing is currently playing.
            */

            if (
                !response ||
                response.status === 204 ||
                !response.item
            ) {

                this.currentTrack =
                    null;


                this.updateInterface(
                    null
                );


                return;

            }


            /*
                Build a clean object for the UI.
            */

            const item =
                response.item;


            const track = {

                id:
                    item.id,

                name:
                    item.name,

                artist:
                    item.artists
                        ?.map(
                            artist =>
                                artist.name
                        )
                        .join(", ") ||
                    "Unknown Artist",

                album:
                    item.album?.name ||
                    "Unknown Album",

                artwork:
                    item.album
                        ?.images?.[0]
                        ?.url ||
                    "",

                duration:
                    item.duration_ms ||
                    0,

                progress:
                    response.progress_ms ||
                    0,

                isPlaying:
                    Boolean(
                        response.is_playing
                    ),

                spotifyUrl:
                    item.external_urls
                        ?.spotify ||
                    ""

            };


            this.currentTrack =
                track;


            this.updateInterface(
                track
            );

        }


        catch (
            error
        ) {

            console.error(
                "Spotify refresh failed:",
                error
            );

        }

    },


    /*
        ====================================================
        UPDATE INTERFACE
        ====================================================
    */

    updateInterface(
        track
    ) {

        if (
            typeof window.updateSpotifyPlayer !==
            "function"
        ) {

            return;

        }


        window.updateSpotifyPlayer(
            track
        );

    },


    /*
        ====================================================
        LOGIN
        ====================================================
    */

    async login() {

        try {

            await window.electron.spotifyLogin();

        }


        catch (
            error
        ) {

            console.error(
                "Spotify login failed:",
                error
            );

        }

    },


    /*
        ====================================================
        PLAY / PAUSE
        ====================================================
    */

    async togglePlayback() {

        if (
            !this.currentTrack
        ) {

            return;

        }


        try {

            const endpoint =
                this.currentTrack.isPlaying
                    ? "/me/player/pause"
                    : "/me/player/play";


            await window.electron.spotifyApi(
                {
                    method: "PUT",

                    endpoint:
                        endpoint
                }
            );


            /*
                Refresh immediately rather than waiting
                for the next five-second poll.
            */

            setTimeout(
                () => {

                    this.refreshNowPlaying();

                },
                300
            );

        }


        catch (
            error
        ) {

            console.error(
                "Spotify playback toggle failed:",
                error
            );

        }

    },


    /*
        ====================================================
        NEXT
        ====================================================
    */

    async next() {

        try {

            await window.electron.spotifyApi(
                {
                    method: "POST",

                    endpoint:
                        "/me/player/next"
                }
            );


            setTimeout(
                () => {

                    this.refreshNowPlaying();

                },
                500
            );

        }


        catch (
            error
        ) {

            console.error(
                "Spotify next failed:",
                error
            );

        }

    },


    /*
        ====================================================
        PREVIOUS
        ====================================================
    */

    async previous() {

        try {

            await window.electron.spotifyApi(
                {
                    method: "POST",

                    endpoint:
                        "/me/player/previous"
                }
            );


            setTimeout(
                () => {

                    this.refreshNowPlaying();

                },
                500
            );

        }


        catch (
            error
        ) {

            console.error(
                "Spotify previous failed:",
                error
            );

        }

    }

};


/*
    ========================================================
    BUTTON EVENTS
    ========================================================
*/


document.addEventListener(
    "DOMContentLoaded",
    () => {

        const playButton =
            document.getElementById(
                "media-play"
            );


        const nextButton =
            document.getElementById(
                "media-next"
            );


        const previousButton =
            document.getElementById(
                "media-previous"
            );


        if (
            playButton
        ) {

            playButton.addEventListener(
                "click",
                () => {

                    spotifyService.togglePlayback();

                }
            );

        }


        if (
            nextButton
        ) {

            nextButton.addEventListener(
                "click",
                () => {

                    spotifyService.next();

                }
            );

        }


        if (
            previousButton
        ) {

            previousButton.addEventListener(
                "click",
                () => {

                    spotifyService.previous();

                }
            );

        }

    }
);


/*
    ========================================================
    EXPOSE SERVICE
    ========================================================
*/

window.spotifyService =
    spotifyService;