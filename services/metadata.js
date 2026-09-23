// services/metadata.js

const METADATA_ARTWORK_TYPES = [
    "icon",
    "logo",
    "cover",
    "grid",
    "hero",
    "background"
];


/*
 * ========================================================
 * AUTOMATIC ARTWORK PROVIDERS
 * ========================================================
 *
 * These URLs intentionally point to actual image files.
 *
 * The Electron artwork downloader validates the downloaded
 * image data before placing it into the persistent cache.
 *
 * Minecraft uses direct assets from minecraft.net rather
 * than Wikimedia because the Wikimedia URLs were being
 * rejected by the artwork downloader.
 */

const AUTOMATIC_ARTWORK_SOURCES = {

    /*
     * ====================================================
     * LEAGUE OF LEGENDS
     * ====================================================
     */

    riot: {

        icon:
            "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/profileicon/685.png",

        logo:
            "https://cdn.simpleicons.org/leagueoflegends"

    },


    /*
     * ====================================================
     * XBOX
     * ====================================================
     */

    xbox: {

        icon:
            "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/xbox.png",

        logo:
            "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/xbox.png"

    },


    /*
     * ====================================================
     * GAME PASS
     * ====================================================
     */

    gamepass: {

        icon:
            "https://www.pngkey.com/png/detail/171-1715441_xbox-game-pass.png",

        logo:
            "https://www.pngkey.com/png/detail/171-1715441_xbox-game-pass.png"

    },


    /*
     * ====================================================
     * MINECRAFT
     * ====================================================
     *
     * Minecraft gets its own provider rather than being
     * treated as a generic Xbox application.
     *
     * These are direct image assets hosted by Minecraft.net.
     *
     * icon
     *     Square Minecraft key art.
     *
     * logo
     *     Minecraft's official logo artwork.
     *
     * cover
     *     Square Minecraft Java & Bedrock key art.
     *
     * background
     *     Wide Minecraft hero artwork.
     *
     * The same source can intentionally be used for more
     * than one artwork role when an appropriate standalone
     * asset is not available.
     */

    minecraft: {

        icon:
            "https://www.minecraft.net/content/dam/franchise/experiments/1156543/Hero-Banner_Vanilla_Ultrawide_1920x560.jpg",

        logo:
            "https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/logos/Homepage_Gameplay-Trailer_MC-OV-logo_300x300.png",

        cover:
            "https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/key-art/Homepage_Discover-our-games_MC-Vanilla-KeyArt_864x864.jpg",

        grid:
            "https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/key-art/Homepage_Discover-our-games_MC-Vanilla-KeyArt_864x864.jpg",

        hero:
            "https://www.minecraft.net/content/dam/franchise/experiments/1156543/Hero-Banner_Vanilla_Ultrawide_1920x560.jpg",

        background:
            "https://www.minecraft.net/content/dam/franchise/experiments/1156543/Hero-Banner_Vanilla_Ultrawide_1920x560.jpg"

    },


    /*
     * ====================================================
     * RETROARCH
     * ====================================================
     */

    retroarch: {

        icon:
            "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/logo.png",

        logo:
            "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/retroarch-plain-logo.png",

        background:
            "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/retroarch_bg.png"

    },


    /*
     * ====================================================
     * PLUTONIUM
     * ====================================================
     */

    plutonium: {

        icon:
            "https://img.icons8.com/?size=256&id=qXMTtlmpNgp7&format=png",

        logo:
            "https://img.icons8.com/?size=256&id=qXMTtlmpNgp7&format=png"

    },


    /*
     * ====================================================
     * SPOTIFY
     * ====================================================
     */

    spotify: {

        icon:
            "https://cdn.simpleicons.org/spotify",

        logo:
            "https://cdn.simpleicons.org/spotify"

    }

};


let metadataConfig = null;

let metadataLoaded = false;


/*
 * ========================================================
 * INITIALIZE METADATA
 * ========================================================
 */

async function initializeMetadata() {

    try {

        const response =
            await fetch(
                "../config/metadata.json"
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `Failed to load metadata.json: ${response.status} ${response.statusText}`
            );

        }


        metadataConfig =
            await response.json();


        metadataLoaded =
            true;


        console.log(
            "Metadata loaded successfully."
        );


        return metadataConfig;

    }

    catch (
        error
    ) {

        console.error(
            "Failed to initialize metadata:",
            error
        );


        metadataConfig = {

            version:
                1,

            items:
                {}

        };


        metadataLoaded =
            false;


        return metadataConfig;

    }

}


/*
 * ========================================================
 * GET METADATA
 * ========================================================
 */

function getMetadata() {

    return metadataConfig;

}


/*
 * ========================================================
 * GET ITEM METADATA
 * ========================================================
 */

function getItemMetadata(
    itemId
) {

    if (
        !metadataConfig?.items ||
        !itemId
    ) {

        return null;

    }


    return (
        metadataConfig.items[
            itemId
        ] ||
        null
    );

}


/*
 * ========================================================
 * GET ITEM ARTWORK
 * ========================================================
 */

function getItemArtwork(
    itemId
) {

    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        return null;

    }


    return (
        itemMetadata.artwork ||
        null
    );

}


/*
 * ========================================================
 * GET ITEM SOURCES
 * ========================================================
 */

function getItemSources(
    itemId
) {

    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        return {};

    }


    return (
        itemMetadata.sources ||
        {}
    );

}


/*
 * ========================================================
 * GET ITEM ARTWORK SOURCES
 * ========================================================
 */

function getItemArtworkSources(
    itemId
) {

    const sources =
        getItemSources(
            itemId
        );


    return (
        sources.artwork ||
        {}
    );

}


/*
 * ========================================================
 * GET ARTWORK PROFILE
 * ========================================================
 */

function getArtworkProfile(
    itemId
) {

    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        return null;

    }


    return (
        itemMetadata.artworkProfile ||
        null
    );

}


/*
 * ========================================================
 * GET ARTWORK PROVIDER
 * ========================================================
 */

function getArtworkProvider(
    itemId
) {

    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        return null;

    }


    return (
        itemMetadata.artworkProvider ||
        null
    );

}


/*
 * ========================================================
 * GET ARTWORK QUERY
 * ========================================================
 */

function getArtworkQuery(
    itemId
) {

    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        return null;

    }


    return (
        itemMetadata.artworkQuery ||
        null
    );

}


/*
 * ========================================================
 * IS BOX ART ITEM
 * ========================================================
 */

function isBoxArtItem(
    itemId
) {

    const profile =
        getArtworkProfile(
            itemId
        );


    return (
        profile ===
        "boxart"
    );

}


/*
 * ========================================================
 * NORMALIZE ARTWORK
 * ========================================================
 */

function normalizeArtwork(
    artwork
) {

    const normalized =
        {};


    if (
        !artwork ||
        typeof artwork !==
            "object"
    ) {

        return normalized;

    }


    for (
        const type
        of METADATA_ARTWORK_TYPES
    ) {

        if (
            typeof artwork[type] ===
                "string" &&
            artwork[type]
                .trim()
                .length > 0
        ) {

            normalized[type] =
                artwork[type]
                    .trim();

        }

    }


    return normalized;

}


/*
 * ========================================================
 * GET NORMALIZED ARTWORK
 * ========================================================
 */

function getNormalizedArtwork(
    itemId
) {

    return normalizeArtwork(
        getItemArtwork(
            itemId
        )
    );

}


/*
 * ========================================================
 * GET STEAM SOURCE
 * ========================================================
 */

function getSteamSource(
    itemId
) {

    const sources =
        getItemSources(
            itemId
        );


    return (
        sources.steam ||
        null
    );

}


/*
 * ========================================================
 * GET RIOT SOURCE
 * ========================================================
 */

function getRiotSource(
    itemId
) {

    const sources =
        getItemSources(
            itemId
        );


    return (
        sources.riot ||
        null
    );

}


/*
 * ========================================================
 * GET SPOTIFY SOURCE
 * ========================================================
 */

function getSpotifySource(
    itemId
) {

    const sources =
        getItemSources(
            itemId
        );


    return (
        sources.spotify ||
        null
    );

}


/*
 * ========================================================
 * GET AUTOMATIC ARTWORK SOURCE
 * ========================================================
 *
 * Priority:
 *
 * 1. Explicit artwork URL in metadata.json
 * 2. Provider-based automatic artwork source
 *
 * Example:
 *
 * Minecraft
 *     ↓
 * artworkProvider = minecraft
 *     ↓
 * AUTOMATIC_ARTWORK_SOURCES.minecraft
 *     ↓
 * actual image URL
 */

function getAutomaticArtworkSource(
    itemId,
    artworkType
) {

    if (
        !itemId ||
        !artworkType
    ) {

        return null;

    }


    if (
        !METADATA_ARTWORK_TYPES.includes(
            artworkType
        )
    ) {

        console.warn(
            `Unsupported artwork type requested: ${artworkType}`
        );


        return null;

    }


    const itemMetadata =
        getItemMetadata(
            itemId
        );


    if (
        !itemMetadata
    ) {

        console.warn(
            `No metadata found for artwork request: ${itemId} ${artworkType}`
        );


        return null;

    }


    /*
     * ====================================================
     * MANUAL ARTWORK URL
     * ====================================================
     */

    const manualArtwork =
        itemMetadata.artwork;


    if (
        manualArtwork &&
        typeof manualArtwork[
            artworkType
        ] === "string" &&
        manualArtwork[
            artworkType
        ]
            .trim()
            .length > 0
    ) {

        return {

            url:
                manualArtwork[
                    artworkType
                ].trim(),

            provider:
                "metadata"

        };

    }


    /*
     * ====================================================
     * PROVIDER
     * ====================================================
     */

    const provider =
        itemMetadata.artworkProvider;


    if (
        !provider
    ) {

        console.warn(
            `No artwork provider configured: ${itemId} ${artworkType}`
        );


        return null;

    }


    const normalizedProvider =
        provider.toLowerCase();


    const providerSources =
        AUTOMATIC_ARTWORK_SOURCES[
            normalizedProvider
        ];


    if (
        !providerSources
    ) {

        console.warn(
            `Unknown artwork provider: ${provider} for ${itemId} ${artworkType}`
        );


        return null;

    }


    /*
     * ====================================================
     * ARTWORK URL
     * ====================================================
     */

    const url =
        providerSources[
            artworkType
        ];


    if (
        !url
    ) {

        console.warn(
            `No automatic artwork source: ${itemId} ${artworkType}`
        );


        return null;

    }


    console.log(
        `Automatic artwork source: ${itemId} ${artworkType} ${provider} ${url}`
    );


    return {

        url,

        provider

    };

}


/*
 * ========================================================
 * ENRICH ITEM WITH METADATA
 * ========================================================
 */

function enrichItemWithMetadata(
    item
) {

    if (
        !item ||
        !item.id
    ) {

        return item;

    }


    const metadata =
        getItemMetadata(
            item.id
        );


    if (
        !metadata
    ) {

        return item;

    }


    return {

        ...item,


        metadata:
            metadata.metadata ||
            {},


        artworkProfile:
            metadata.artworkProfile ||
            item.artworkProfile ||
            null,


        artworkProvider:
            metadata.artworkProvider ||
            item.artworkProvider ||
            null,


        artworkQuery:
            metadata.artworkQuery ||
            item.artworkQuery ||
            null,


        metadataSources: {

            ...(item.metadataSources || {}),

            ...(metadata.sources || {})

        },


        metadataArtwork: {

            ...(item.metadataArtwork || {}),

            ...(metadata.artwork || {})

        }

    };

}


/*
 * ========================================================
 * GET ALL METADATA
 * ========================================================
 */

function getAllMetadata() {

    return metadataConfig;

}


/*
 * ========================================================
 * IS METADATA LOADED
 * ========================================================
 */

function isMetadataLoaded() {

    return metadataLoaded;

}


/*
 * ========================================================
 * GET METADATA ARTWORK TYPES
 * ========================================================
 */

function getMetadataArtworkTypes() {

    return [
        ...METADATA_ARTWORK_TYPES
    ];

}


/*
 * ========================================================
 * PUBLIC API
 * ========================================================
 */

window.xmbMetadata = {

    initializeMetadata,

    getMetadata,

    getItemMetadata,

    getItemArtwork,

    getNormalizedArtwork,

    getItemSources,

    getItemArtworkSources,

    getArtworkProfile,

    getArtworkProvider,

    getArtworkQuery,

    getAutomaticArtworkSource,

    isBoxArtItem,

    getSteamSource,

    getRiotSource,

    getSpotifySource,

    enrichItemWithMetadata,

    getAllMetadata,

    isMetadataLoaded,

    getMetadataArtworkTypes

};