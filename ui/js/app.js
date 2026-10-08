/*
    ========================================================
    PERSONAL XMB
    APPLICATION CONTROLLER
    ========================================================

    Handles application startup and global initialization.

    Startup flow:

        Electron
            ↓
        Load configuration
            ↓
        Load metadata
            ↓
        Initialize artwork
            ↓
        Initialize services
            ↓
        Initialize renderer
            ↓
        Launcher ready
            ↓
        Background artwork preload
            ↓
        Steam artwork preload

    Artwork preloading happens AFTER the launcher becomes
    ready so downloading artwork never blocks the XMB.

    ========================================================
*/


/*
    ========================================================
    APPLICATION STATE
    ========================================================
*/

let applicationStarted = false;


/*
    ========================================================
    STARTUP UI REVEAL
    ========================================================

    The startup overlay animates independently from the
    application initialization.

    The normal XMB chrome is intentionally hidden while
    the boot logo is on screen. Once the overlay finishes,
    reveal the category bar and bottom controls.

    A small fallback timer is included so the UI cannot
    remain hidden if Chromium skips the animationend event.
*/

function initializeStartupReveal() {

    const startupOverlay =
        document.getElementById(
            "xmb-startup"
        );


    const reveal =
        () => {

            document.body.classList.add(
                "xmb-startup-complete"
            );

        };


    if (
        !startupOverlay
    ) {

        reveal();

        return;

    }


    startupOverlay.addEventListener(
        "animationend",
        event => {

            if (
                event.animationName ===
                "xmbStartupFade"
            ) {

                reveal();

            }

        },
        {
            once: true
        }
    );


    /*
        Safety fallback.

        xmbStartupFade is currently about 3.4 seconds long.
        Waiting 5 seconds ensures the logo has already
        completed before forcing the controls visible.
    */

    window.setTimeout(
        reveal,
        3800
    );

}


/*
    ========================================================
    APPLY SETTINGS
    ========================================================
*/

function applySettings() {

    if (
        !window.settingsData
    ) {

        return;

    }


    /*
        ====================================================
        THEME
        ====================================================
    */

    if (
        window.settingsData.theme
    ) {

        document.body.dataset.theme =
            window.settingsData.theme;

    }

}


/*
    ========================================================
    GET METADATA ITEMS
    ========================================================

    metadata.js returns the complete metadata configuration
    from getAllMetadata().

    The structure is:

        {
            version: 1,

            items: {
                minecraft: {...},
                some-game: {...},
                another-game: {...}
            }
        }

    The artwork preload needs an array instead.

    This helper converts the metadata object into:

        [
            {
                id: "minecraft",
                ...
            },

            {
                id: "some-game",
                ...
            }
        ]

    Keeping this conversion here means we do not have to
    change the existing metadata service.
*/

function getMetadataItems() {

    if (
        !window.xmbMetadata ||
        typeof window.xmbMetadata.getAllMetadata !==
            "function"
    ) {

        return [];

    }


    const metadata =
        window.xmbMetadata.getAllMetadata();


    if (
        !metadata ||
        typeof metadata !== "object"
    ) {

        return [];

    }


    /*
        ====================================================
        ALREADY AN ARRAY
        ====================================================

        This makes the function compatible with either
        metadata format.
    */

    if (
        Array.isArray(
            metadata
        )
    ) {

        return metadata;

    }


    /*
        ====================================================
        METADATA ITEMS OBJECT
        ====================================================
    */

    if (
        !metadata.items ||
        typeof metadata.items !== "object"
    ) {

        return [];

    }


    return Object.entries(
        metadata.items
    ).map(
        (
            [
                itemId,
                itemMetadata
            ]
        ) => {

            return {

                id:
                    itemId,

                ...(itemMetadata || {})

            };

        }
    );

}


/*
    ========================================================
    INITIALIZE GENERAL ARTWORK PRELOAD
    ========================================================

    Preloads artwork for every configured metadata item.

    This uses the existing artwork service instead of
    downloading images directly.

    That means the normal artwork pipeline remains:

        metadata.js
            ↓
        artwork.js
            ↓
        preload.js
            ↓
        main.js
            ↓
        persistent cache

    The existing cache decides whether an image actually
    needs to be downloaded.

    This function runs in the background after the launcher
    is already usable.
*/

async function initializeGeneralArtworkPreload() {

    /*
        ====================================================
        SAFETY CHECK
        ====================================================
    */

    if (
        !window.xmbArtwork ||
        typeof window.xmbArtwork.getArtwork !== "function"
    ) {

        console.warn(
            "General artwork service is unavailable."
        );

        return;

    }


    if (
        !window.xmbMetadata ||
        typeof window.xmbMetadata.getAllMetadata !==
            "function"
    ) {

        console.warn(
            "Metadata service is unavailable."
        );

        return;

    }


    /*
        ====================================================
        GET ALL METADATA ITEMS
        ====================================================
    */

    const metadataItems =
        getMetadataItems();


    if (
        metadataItems.length === 0
    ) {

        console.warn(
            "No metadata items were found for artwork preload."
        );

        return;

    }


    console.log(
        "Starting general artwork preload:",
        metadataItems.length,
        "items."
    );


    /*
        ====================================================
        ARTWORK TYPES
        ====================================================

        These are all artwork types supported by the
        general artwork system.
    */

    const artworkTypes = [

        "icon",
        "logo",
        "cover",
        "grid",
        "hero",
        "background"

    ];


    /*
        ====================================================
        PRELOAD EACH ITEM
        ====================================================

        We intentionally process items one at a time.

        This prevents startup from creating a huge number
        of simultaneous downloads.
    */

    for (
        const item
        of metadataItems
    ) {

        if (
            !item ||
            !item.id
        ) {

            continue;

        }


        /*
            =================================================
            STEAM EXCLUSION
            =================================================

            Steam has its own dedicated artwork system.

            Do not send Steam items through the general
            artwork pipeline as well.
        */

        if (
            item?.sources?.steam?.appId
        ) {

            continue;

        }


        console.log(
            "Preloading artwork:",
            item.id
        );


        /*
            =================================================
            PRELOAD EACH ARTWORK TYPE
            =================================================
        */

        for (
            const artworkType
            of artworkTypes
        ) {

            try {

                await window.xmbArtwork.getArtwork(
                    item.id,
                    artworkType
                );

            }

            catch (error) {

                /*
                    One failed image should never stop the
                    rest of the artwork cache.
                */

                console.warn(
                    "Failed to preload artwork:",
                    item.id,
                    artworkType,
                    error
                );

            }

        }

    }


    console.log(
        "General artwork preload completed."
    );

}


/*
    ========================================================
    INITIALIZE STEAM ARTWORK
    ========================================================

    Steam artwork is handled separately because Steam
    provides its own artwork endpoints and metadata.
*/

async function initializeSteamArtwork() {

    /*
        ====================================================
        SAFETY CHECK
        ====================================================
    */

    if (
        !window.electron ||
        typeof window.electron.getSteamArtwork !== "function"
    ) {

        console.warn(
            "Steam artwork bridge is unavailable."
        );

        return;

    }


    if (
        !window.xmbMetadata ||
        typeof window.xmbMetadata.getAllMetadata !== "function"
    ) {

        console.warn(
            "Metadata service is unavailable."
        );

        return;

    }


    /*
        ====================================================
        GET ALL METADATA ITEMS
        ====================================================
    */

    const metadataItems =
        getMetadataItems();


    if (
        metadataItems.length === 0
    ) {

        console.warn(
            "No metadata items were found for Steam artwork."
        );

        return;

    }


    /*
        ====================================================
        PRELOAD STEAM ARTWORK
        ====================================================

        Steam artwork is handled directly through the
        Electron bridge.

        main.js handles:

            • Steam API requests
            • persistent caching
            • local artwork files
    */

    for (
        const item
        of metadataItems
    ) {

        const appId =
            item?.sources?.steam?.appId;


        if (
            !appId
        ) {

            continue;

        }


        try {

            console.log(
                "Preloading Steam artwork:",
                item.id
            );


            await window.electron.getSteamArtwork(
                appId,
                item.id
            );

        }

        catch (error) {

            console.warn(
                "Failed to preload Steam artwork:",
                item.id,
                error
            );

        }

    }


    console.log(
        "Steam artwork preload completed."
    );

}


/*
    ========================================================
    START APPLICATION
    ========================================================
*/

async function startApplication() {

    /*
        ====================================================
        PREVENT DOUBLE START
        ====================================================
    */

    if (
        applicationStarted
    ) {

        return;

    }


    applicationStarted = true;


    if (
        window.xmbAudio
    ) {
        /*
            Electron can start Web Audio suspended. Resume it first so
            the boot chime is actually heard during startup.
        */
        try {
            await window.xmbAudio.unlock?.();
        } catch (error) {
            console.debug("XMB startup audio unlock deferred:", error);
        }

        window.xmbAudio.startup?.();
    }


    try {

        /*
            ================================================
            LOAD CONFIGURATION
            ================================================
        */

        window.categoriesData =
            await window.electron.getCategories();


        window.settingsData =
            await window.electron.getSettings();

        window.xmbConfig = window.settingsData;


        window.themesData =
            await window.electron.getThemes();


        /*
            ================================================
            APPLY SETTINGS
            ================================================
        */

        applySettings();

        if (typeof applyUserSettings === "function") {

            applyUserSettings();

        }


        /*
            ================================================
            INITIALIZE METADATA
            ================================================
        */

        if (
            window.xmbMetadata &&
            typeof window.xmbMetadata.initializeMetadata ===
                "function"
        ) {

            await window.xmbMetadata.initializeMetadata();

        }


        /*
            ================================================
            INITIALIZE GENERAL ARTWORK
            ================================================
        */

        if (
            window.xmbArtwork &&
            typeof window.xmbArtwork.initializeArtwork ===
                "function"
        ) {

            window.xmbArtwork.initializeArtwork();

        }


        /*
            ================================================
            INITIALIZE SERVICES
            ================================================
        */

        if (
            window.xmbSteam &&
            typeof window.xmbSteam.initialize ===
                "function"
        ) {

            await window.xmbSteam.initialize();

        }


        if (
            window.xmbRiot &&
            typeof window.xmbRiot.initialize ===
                "function"
        ) {

            await window.xmbRiot.initialize();

        }


        /*
            Spotify is an optional service. Its Web Playback SDK
            can fail because of authentication, account state, SDK
            loading, or network conditions.

            Do NOT let Spotify initialization block the XMB UI.
            The renderer/navigation must always initialize even
            when Spotify is unavailable.
        */
        if (
            window.spotifyService &&
            typeof window.spotifyService.initialize ===
                "function"
        ) {

            try {

                await window.spotifyService.initialize();

            }

            catch (error) {

                console.warn(
                    "Spotify initialization did not complete. XMB will continue:",
                    error
                );

            }

        }


        if (
            window.xmbServer &&
            typeof window.xmbServer.initialize ===
                "function"
        ) {

            await window.xmbServer.initialize();

        }


        /*
            ================================================
            INITIALIZE INTERFACE
            ================================================
        */

        if (
            window.xmbRenderer &&
            typeof window.xmbRenderer.initializeInterface ===
                "function"
        ) {

            await window.xmbRenderer.initializeInterface();

        }


        /*
            ================================================
            APPLICATION READY
            ================================================
        */

        document.body.classList.add(
            "launcher-ready"
        );


        /*
            ================================================
            START ARTWORK PRELOADING
            ================================================

            IMPORTANT:

            These are intentionally NOT awaited.

            The XMB becomes usable immediately while the
            artwork cache is populated in the background.
        */

        /*
            Artwork is handled by the single main-process startup
            pipeline and the unified renderer manifest.
        */


        console.log(
            "Personal XMB application started."
        );

    }

    catch (error) {

        console.error(
            "Failed to start Personal XMB:",
            error
        );

    }

}


/*
    ========================================================
    SPOTIFY AUTHENTICATION
    ========================================================
*/

function initializeSpotifyAuthListener() {

    if (
        !window.electron ||
        typeof window.electron.onSpotifyAuthComplete !==
            "function"
    ) {

        return;

    }


    window.electron.onSpotifyAuthComplete(
        async () => {

            console.log(
                "Spotify authentication completed."
            );


            if (
                window.spotifyService &&
                typeof window.spotifyService.initialize ===
                    "function"
            ) {

                window.spotifyService.initialized = false;
                await window.spotifyService.initialize();

            }

        }
    );

}


/*
    ========================================================
    APPLICATION INITIALIZATION
    ========================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeStartupReveal();

        initializeSpotifyAuthListener();

        startApplication();

    }
);