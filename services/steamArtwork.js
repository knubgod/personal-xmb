/*
    ========================================================
    PERSONAL XMB
    STEAM ARTWORK SERVICE
    ========================================================

    Handles Steam artwork through the Electron main
    process.

    The renderer never downloads files directly.

    Flow:

        Renderer
            ↓
        steamArtwork.js
            ↓
        preload.js
            ↓
        main.js
            ↓
        Steam artwork
            ↓
        Local artwork cache


    main.js owns the persistent disk cache.

    This file owns the temporary in-memory cache.
*/


/*
    ========================================================
    MEMORY CACHE
    ========================================================
*/

let steamArtworkCache = {};


/*
    ========================================================
    ACTIVE REQUESTS
    ========================================================

    Prevents duplicate Steam requests during navigation.
*/

let steamArtworkRequests = {};


/*
    ========================================================
    GET STEAM ARTWORK
    ========================================================

    Returns:

        icon
        logo
        hero
        capsule
        background
*/

async function getSteamArtwork(
    appId,
    itemId
) {

    if (!appId) {

        console.warn(
            "Steam artwork requested without an App ID."
        );

        return null;

    }


    if (!itemId) {

        console.warn(
            "Steam artwork requested without an item ID."
        );

        return null;

    }


    const normalizedAppId =
        String(
            appId
        );


    const normalizedItemId =
        String(
            itemId
        );


    /*
        ====================================================
        MEMORY CACHE
        ====================================================

        Once an item has been loaded during this session,
        don't ask main.js for it again.
    */

    if (
        steamArtworkCache[
            normalizedItemId
        ]
    ) {

        return steamArtworkCache[
            normalizedItemId
        ];

    }


    /*
        ====================================================
        DUPLICATE REQUEST CHECK
        ====================================================

        This prevents several navigation events from
        requesting the same Steam game simultaneously.
    */

    if (
        steamArtworkRequests[
            normalizedItemId
        ]
    ) {

        return steamArtworkRequests[
            normalizedItemId
        ];

    }


    /*
        ====================================================
        ELECTRON BRIDGE
        ====================================================
    */

    if (
        !window.electron ||
        typeof window.electron.getSteamArtwork !==
            "function"
    ) {

        console.error(
            "Steam artwork bridge is unavailable."
        );

        return null;

    }


    /*
        ====================================================
        CREATE REQUEST
        ====================================================
    */

    const request =
        (async () => {

            try {

                console.log(
                    "Requesting Steam artwork:",
                    normalizedItemId,
                    normalizedAppId
                );


                const result =
                    await window.electron.getSteamArtwork(
                        normalizedAppId,
                        normalizedItemId
                    );


                /*
                    ====================================================
                    VALIDATE RESPONSE
                    ====================================================
                */

                if (
                    !result ||
                    !result.success
                ) {

                    console.warn(
                        "Steam artwork request failed:",
                        normalizedItemId,
                        result?.error || "Unknown error"
                    );

                    return null;

                }


                if (
                    !result.data
                ) {

                    console.warn(
                        "Steam artwork returned no data:",
                        normalizedItemId
                    );

                    return null;

                }


                const artwork =
                    result.data;


                /*
                    ====================================================
                    STORE IN MEMORY CACHE
                    ====================================================
                */

                steamArtworkCache[
                    normalizedItemId
                ] =
                    artwork;


                console.log(
                    "Steam artwork ready:",
                    normalizedItemId,
                    artwork
                );


                return artwork;

            }

            catch (
                error
            ) {

                console.error(
                    "Steam artwork request failed:",
                    normalizedItemId,
                    error
                );

                return null;

            }

        })();


    steamArtworkRequests[
        normalizedItemId
    ] =
        request;


    /*
        ====================================================
        WAIT FOR REQUEST
        ====================================================
    */

    try {

        return await request;

    }

    finally {

        /*
            The request has finished.

            Remove it from the active request list so
            future requests can be made if necessary.
        */

        delete steamArtworkRequests[
            normalizedItemId
        ];

    }

}


/*
    ========================================================
    CLEAR ARTWORK CACHE
    ========================================================
*/

function clearSteamArtworkCache() {

    steamArtworkCache =
        {};

}


/*
    ========================================================
    CLEAR ONE ITEM
    ========================================================
*/

function clearSteamItemArtworkCache(
    itemId
) {

    if (!itemId) {

        return;

    }


    delete steamArtworkCache[
        String(
            itemId
        )
    ];

}


/*
    ========================================================
    GET ARTWORK CACHE
    ========================================================
*/

function getSteamArtworkCache() {

    return {

        ...steamArtworkCache

    };

}


/*
    ========================================================
    CHECK ARTWORK TYPE
    ========================================================

    Useful for the renderer when deciding which artwork
    is available.
*/

function hasSteamArtwork(
    itemId,
    artworkType
) {

    if (
        !itemId ||
        !artworkType
    ) {

        return false;

    }


    const artwork =
        steamArtworkCache[
            String(
                itemId
            )
        ];


    return Boolean(
        artwork &&
        artwork[
            artworkType
        ]
    );

}


/*
    ========================================================
    INITIALIZE
    ========================================================
*/

function initializeSteamArtwork() {

    console.log(
        "Steam artwork service initialized."
    );

}


/*
    ========================================================
    PUBLIC API
    ========================================================
*/

window.xmbSteamArtwork = {

    initialize:
        initializeSteamArtwork,

    getSteamArtwork,

    hasSteamArtwork,

    clearSteamArtworkCache,

    clearSteamItemArtworkCache,

    getSteamArtworkCache

};