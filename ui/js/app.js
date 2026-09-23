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


        window.themesData =
            await window.electron.getThemes();


        /*
            ================================================
            APPLY SETTINGS
            ================================================
        */

        applySettings();


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


        if (
            window.xmbSpotify &&
            typeof window.xmbSpotify.initialize ===
                "function"
        ) {

            await window.xmbSpotify.initialize();

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

        initializeGeneralArtworkPreload()
            .catch(
                error => {

                    console.error(
                        "General artwork preload failed:",
                        error
                    );

                }
            );


        initializeSteamArtwork()
            .catch(
                error => {

                    console.error(
                        "Steam artwork preload failed:",
                        error
                    );

                }
            );


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
                window.xmbSpotify &&
                typeof window.xmbSpotify.initialize ===
                    "function"
            ) {

                await window.xmbSpotify.initialize();

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

        initializeSpotifyAuthListener();

        startApplication();

    }
);