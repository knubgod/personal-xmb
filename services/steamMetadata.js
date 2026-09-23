/*
    ========================================================
    PERSONAL XMB
    STEAM METADATA SERVICE
    ========================================================

    Handles Steam metadata through the Electron main
    process.

    The renderer never contacts Steam directly.

    Flow:

        Renderer
            ↓
        preload.js
            ↓
        main.js
            ↓
        Steam
            ↓
        normalized metadata
*/


let steamMetadataCache = {};


/*
    ========================================================
    GET STEAM METADATA
    ========================================================
*/

async function getSteamMetadata(
    appId
) {

    if (
        !appId
    ) {

        console.warn(
            "Steam metadata requested without an App ID."
        );

        return null;

    }


    const normalizedAppId =
        String(
            appId
        );


    /*
        Return cached metadata if we already
        retrieved this game during the current
        session.
    */

    if (
        steamMetadataCache[
            normalizedAppId
        ]
    ) {

        return steamMetadataCache[
            normalizedAppId
        ];

    }


    /*
        Make sure the Electron bridge exists.
    */

    if (
        !window.electron ||
        !window.electron.getSteamMetadata
    ) {

        console.error(
            "Steam metadata bridge is unavailable."
        );

        return null;

    }


    try {

        const result =
            await window.electron.getSteamMetadata(
                normalizedAppId
            );


        /*
            Steam metadata was not available.
        */

        if (
            !result ||
            !result.success ||
            !result.data
        ) {

            console.warn(
                "Steam metadata was unavailable:",
                normalizedAppId
            );

            return null;

        }


        const metadata =
            result.data;


        /*
            Save the result in memory so we don't
            repeatedly request the same game during
            this session.
        */

        steamMetadataCache[
            normalizedAppId
        ] =
            metadata;


        return metadata;

    }
    catch (
        error
    ) {

        console.error(
            "Steam metadata request failed:",
            error
        );

        return null;

    }

}


/*
    ========================================================
    CLEAR CACHE
    ========================================================
*/

function clearSteamMetadataCache() {

    steamMetadataCache = {};

}


/*
    ========================================================
    GET CACHE
    ========================================================
*/

function getSteamMetadataCache() {

    return {
        ...steamMetadataCache
    };

}


/*
    ========================================================
    PUBLIC STEAM METADATA API
    ========================================================
*/

window.xmbSteamMetadata = {

    getSteamMetadata,

    clearSteamMetadataCache,

    getSteamMetadataCache

};