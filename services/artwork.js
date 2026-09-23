/*
    ========================================================
    PERSONAL XMB
    ARTWORK SERVICE
    ========================================================

    Handles artwork requests from the renderer.

    The renderer never downloads artwork directly.

    Flow:

        Renderer
            ↓
        artwork.js
            ↓
        metadata.js
            ↓
        Artwork Provider
            ↓
        preload.js
            ↓
        main.js
            ↓
        Local artwork cache
            ↓
        Renderer


    Persistent caching is handled by main.js.

    This file handles the in-memory session cache.
*/


/*
    ========================================================
    ARTWORK CACHE
    ========================================================
*/

let artworkCache = {};


/*
    ========================================================
    ACTIVE REQUESTS
    ========================================================
*/

let artworkRequests = {};


/*
    ========================================================
    ARTWORK TYPES
    ========================================================
*/

const ARTWORK_TYPES = [

    "icon",
    "logo",
    "cover",
    "grid",
    "hero",
    "background"

];


/*
    ========================================================
    GET ARTWORK
    ========================================================
*/

async function getArtwork(
    itemId,
    artworkRequest = "logo",
    artworkSource = {}
) {

    if (!itemId) {

        console.warn(
            "Artwork requested without an item ID."
        );

        return null;

    }


    /*
        ====================================================
        ARTWORK COLLECTION
        ====================================================
    */

    if (
        typeof artworkRequest === "object" &&
        artworkRequest !== null &&
        !Array.isArray(artworkRequest)
    ) {

        return getArtworkCollection(
            itemId,
            artworkRequest
        );

    }


    const normalizedItemId =
        String(itemId);


    const normalizedArtworkType =
        String(artworkRequest);


    if (
        !ARTWORK_TYPES.includes(
            normalizedArtworkType
        )
    ) {

        console.warn(
            "Unsupported artwork type:",
            normalizedArtworkType
        );

        return null;

    }


    const cacheKey =
        `${normalizedItemId}:${normalizedArtworkType}`;


    /*
        ====================================================
        MEMORY CACHE
        ====================================================
    */

    if (
        Object.prototype.hasOwnProperty.call(
            artworkCache,
            cacheKey
        )
    ) {

        return artworkCache[
            cacheKey
        ];

    }


    /*
        ====================================================
        EXISTING REQUEST
        ====================================================
    */

    if (
        artworkRequests[
            cacheKey
        ]
    ) {

        return artworkRequests[
            cacheKey
        ];

    }


    /*
        ====================================================
        ELECTRON BRIDGE
        ====================================================
    */

    if (
        !window.electron ||
        typeof window.electron.getArtwork !== "function"
    ) {

        console.error(
            "Artwork bridge is unavailable."
        );

        return null;

    }


    /*
        ====================================================
        AUTOMATIC PROVIDER LOOKUP
        ====================================================

        If the caller did not provide a direct source,
        metadata.js determines the correct provider.

        Examples:

            riot
            xbox
            minecraft
            spotify
            retroarch
            plutonium

        metadata.js returns the actual artwork URL.

        main.js then downloads and caches the artwork.
    */

    let resolvedArtworkSource =
        artworkSource || {};


    const hasExplicitSource =
        (
            typeof resolvedArtworkSource === "string" &&
            resolvedArtworkSource.trim()
        ) ||
        (
            typeof resolvedArtworkSource === "object" &&
            resolvedArtworkSource !== null &&
            typeof resolvedArtworkSource.url === "string" &&
            resolvedArtworkSource.url.trim()
        );


    /*
        ====================================================
        AUTOMATIC SOURCE
        ====================================================
    */

    if (
        !hasExplicitSource
    ) {

        if (
            !window.xmbMetadata ||
            typeof window.xmbMetadata.getAutomaticArtworkSource !==
                "function"
        ) {

            console.warn(
                "Metadata artwork provider is unavailable:",
                normalizedItemId,
                normalizedArtworkType
            );

        }

        else {

            const automaticSource =
                window.xmbMetadata.getAutomaticArtworkSource(
                    normalizedItemId,
                    normalizedArtworkType
                );


            if (
                automaticSource &&
                automaticSource.url
            ) {

                resolvedArtworkSource =
                    automaticSource;


                console.log(
                    "Automatic artwork source:",
                    normalizedItemId,
                    normalizedArtworkType,
                    automaticSource.provider || "unknown",
                    automaticSource.url
                );

            }

            else {

                console.log(
                    "No automatic artwork source:",
                    normalizedItemId,
                    normalizedArtworkType
                );

            }

        }

    }


    /*
        ====================================================
        REQUEST ARTWORK
        ====================================================
    */

    const request =
        requestSingleArtwork(
            normalizedItemId,
            normalizedArtworkType,
            resolvedArtworkSource
        );


    artworkRequests[
        cacheKey
    ] = request;


    try {

        const artwork =
            await request;


        if (
            artwork
        ) {

            artworkCache[
                cacheKey
            ] =
                artwork;

        }


        return artwork;

    }

    catch (error) {

        console.error(
            "Artwork request failed:",
            error
        );

        return null;

    }

    finally {

        delete artworkRequests[
            cacheKey
        ];

    }

}


/*
    ========================================================
    GET ARTWORK COLLECTION
    ========================================================
*/

async function getArtworkCollection(
    itemId,
    artworkSources
) {

    if (
        !artworkSources ||
        typeof artworkSources !== "object" ||
        Array.isArray(artworkSources)
    ) {

        return null;

    }


    const artworkTypes =
        Object.keys(
            artworkSources
        ).filter(
            (
                artworkType
            ) =>
                ARTWORK_TYPES.includes(
                    artworkType
                )
        );


    if (
        artworkTypes.length === 0
    ) {

        return null;

    }


    const artwork = {};


    const results =
        await Promise.all(
            artworkTypes.map(
                async (
                    artworkType
                ) => {

                    const value =
                        await getArtwork(
                            itemId,
                            artworkType,
                            artworkSources[
                                artworkType
                            ]
                        );


                    return {

                        type:
                            artworkType,

                        value

                    };

                }
            )
        );


    results.forEach(
        (
            result
        ) => {

            if (
                result.value
            ) {

                artwork[
                    result.type
                ] =
                    result.value;

            }

        }
    );


    if (
        Object.keys(
            artwork
        ).length === 0
    ) {

        return null;

    }


    return artwork;

}


/*
    ========================================================
    REQUEST SINGLE ARTWORK
    ========================================================
*/

async function requestSingleArtwork(
    itemId,
    artworkType,
    artworkSource = {}
) {

    try {

        console.log(
            "Requesting artwork:",
            itemId,
            artworkType
        );


        /*
            =================================================
            NORMALIZE SOURCE
            =================================================
        */

        let normalizedSource =
            artworkSource;


        if (
            typeof artworkSource === "string"
        ) {

            normalizedSource = {

                url:
                    artworkSource

            };

        }


        /*
            =================================================
            NO SOURCE
            =================================================

            main.js may still have its own configured source,
            so we allow the request to continue.
        */

        if (
            !normalizedSource
        ) {

            normalizedSource = {};

        }


        /*
            =================================================
            ELECTRON ARTWORK REQUEST
            =================================================
        */

        const result =
            await window.electron.getArtwork(
                itemId,
                artworkType,
                normalizedSource
            );


        if (
            !result ||
            !result.success
        ) {

            console.warn(
                "Artwork unavailable:",
                itemId,
                artworkType,
                result?.error || ""
            );

            return null;

        }


        return (
            result.data ||
            null
        );

    }

    catch (error) {

        console.error(
            "Electron artwork request failed:",
            error
        );

        return null;

    }

}


/*
    ========================================================
    GET ITEM ARTWORK
    ========================================================
*/

async function getItemArtwork(
    itemId
) {

    if (!itemId) {

        return {};

    }


    const artwork = {};


    const results =
        await Promise.all(
            ARTWORK_TYPES.map(
                async (
                    type
                ) => {

                    return {

                        type,

                        value:
                            await getArtwork(
                                itemId,
                                type
                            )

                    };

                }
            )
        );


    results.forEach(
        (
            result
        ) => {

            if (
                result.value
            ) {

                artwork[
                    result.type
                ] =
                    result.value;

            }

        }
    );


    return artwork;

}


/*
    ========================================================
    GET GAME ARTWORK
    ========================================================
*/

async function getGameArtwork(
    itemId
) {

    if (!itemId) {

        return {

            icon: null,
            logo: null,
            cover: null

        };

    }


    const results =
        await Promise.all([

            getArtwork(
                itemId,
                "icon"
            ),

            getArtwork(
                itemId,
                "logo"
            ),

            getArtwork(
                itemId,
                "cover"
            )

        ]);


    return {

        icon:
            results[0] || null,

        logo:
            results[1] || null,

        cover:
            results[2] || null

    };

}


/*
    ========================================================
    GET BEST ARTWORK
    ========================================================
*/

async function getBestArtwork(
    itemId,
    purpose = "preview"
) {

    const priorities = {

        logo: [

            "logo",
            "icon"

        ],


        icon: [

            "icon",
            "logo"

        ],


        cover: [

            "cover",
            "grid",
            "hero",
            "background"

        ],


        preview: [

            "cover",
            "grid",
            "hero",
            "logo",
            "icon"

        ],


        hero: [

            "hero",
            "grid",
            "cover",
            "background"

        ],


        background: [

            "background",
            "hero",
            "cover"

        ]

    };


    const priority =
        priorities[
            purpose
        ] ||
        priorities.preview;


    for (
        const artworkType
        of priority
    ) {

        const artwork =
            await getArtwork(
                itemId,
                artworkType
            );


        if (
            artwork
        ) {

            return {

                type:
                    artworkType,

                value:
                    artwork

            };

        }

    }


    return null;

}


/*
    ========================================================
    GET BEST GAME ARTWORK
    ========================================================
*/

async function getBestGameArtwork(
    itemId
) {

    const artwork =
        await getGameArtwork(
            itemId
        );


    return {

        icon:
            artwork.icon,

        logo:
            artwork.logo,

        cover:
            artwork.cover

    };

}


/*
    ========================================================
    CACHE MANAGEMENT
    ========================================================
*/

function clearArtworkCache() {

    artworkCache = {};

}


function clearArtworkRequests() {

    artworkRequests = {};

}


function clearItemArtworkCache(
    itemId
) {

    if (!itemId) {

        return;

    }


    const prefix =
        `${String(itemId)}:`;


    Object.keys(
        artworkCache
    ).forEach(
        (
            key
        ) => {

            if (
                key.startsWith(
                    prefix
                )
            ) {

                delete artworkCache[
                    key
                ];

            }

        }
    );

}


/*
    ========================================================
    HAS CACHED ARTWORK
    ========================================================
*/

function hasCachedArtwork(
    itemId,
    artworkType = "logo"
) {

    const cacheKey =
        `${String(itemId)}:${String(artworkType)}`;


    return Object.prototype.hasOwnProperty.call(
        artworkCache,
        cacheKey
    );

}


/*
    ========================================================
    GET ARTWORK CACHE
    ========================================================
*/

function getArtworkCache() {

    return {

        ...artworkCache

    };

}


/*
    ========================================================
    GET SUPPORTED ARTWORK TYPES
    ========================================================
*/

function getArtworkTypes() {

    return [

        ...ARTWORK_TYPES

    ];

}


/*
    ========================================================
    INITIALIZE
    ========================================================
*/

function initializeArtwork() {

    console.log(
        "Artwork service initialized."
    );


    console.log(
        "Supported artwork types:",
        ARTWORK_TYPES.join(
            ", "
        )
    );

}


/*
    ========================================================
    PUBLIC API
    ========================================================
*/

window.xmbArtwork = {

    initializeArtwork,

    getArtwork,

    getArtworkCollection,

    getItemArtwork,

    getGameArtwork,

    getBestArtwork,

    getBestGameArtwork,

    getArtworkTypes,

    clearArtworkCache,

    clearArtworkRequests,

    clearItemArtworkCache,

    hasCachedArtwork,

    getArtworkCache

};