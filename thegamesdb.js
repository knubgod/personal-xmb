const https = require("https");

const THEGAMESDB_API =
    "https://api.thegamesdb.net/v1";

const THEGAMESDB_CDN =
    "https://cdn.thegamesdb.net/images/original/";


/*
|--------------------------------------------------------------------------
| Caches
|--------------------------------------------------------------------------
*/

const gameLookupCache = new Map();
const artworkLookupCache = new Map();


/*
|--------------------------------------------------------------------------
| HTTP helper
|--------------------------------------------------------------------------
*/

function requestJson(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(
            url,
            {
                headers: {
                    "User-Agent": "Personal-XMB"
                }
            },
            response => {
                let body = "";

                response.setEncoding("utf8");

                response.on(
                    "data",
                    chunk => {
                        body += chunk;
                    }
                );

                response.on(
                    "end",
                    () => {
                        if (
                            response.statusCode < 200 ||
                            response.statusCode >= 300
                        ) {
                            reject(
                                new Error(
                                    `TheGamesDB returned HTTP ${response.statusCode}`
                                )
                            );

                            return;
                        }

                        try {
                            const data =
                                JSON.parse(body);

                            resolve(data);
                        } catch (error) {
                            reject(
                                new Error(
                                    "TheGamesDB returned invalid JSON."
                                )
                            );
                        }
                    }
                );
            }
        );

        request.on(
            "error",
            error => {
                reject(error);
            }
        );

        request.setTimeout(
            15000,
            () => {
                request.destroy(
                    new Error(
                        "TheGamesDB request timed out."
                    )
                );
            }
        );
    });
}


/*
|--------------------------------------------------------------------------
| Text normalization
|--------------------------------------------------------------------------
*/

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .trim();
}


/*
|--------------------------------------------------------------------------
| Platform matching
|--------------------------------------------------------------------------
*/

function platformMatches(
    game,
    requestedPlatform
) {
    if (!requestedPlatform) {
        return true;
    }

    const wanted =
        normalizeText(
            requestedPlatform
        );

    if (!wanted) {
        return true;
    }

    const possiblePlatforms = [
        game?.platform_name,
        game?.platformName,
        game?.platform_title,
        game?.platform,
        game?.platforms
    ];

    for (
        const platform of possiblePlatforms
    ) {
        if (
            Array.isArray(platform)
        ) {
            for (
                const value of platform
            ) {
                const normalized =
                    normalizeText(
                        typeof value === "object"
                            ? (
                                value?.name ||
                                value?.platform_name ||
                                value?.platformName ||
                                ""
                            )
                            : value
                    );

                if (
                    normalized === wanted ||
                    normalized.includes(wanted) ||
                    wanted.includes(normalized)
                ) {
                    return true;
                }
            }
        } else if (
            platform &&
            typeof platform === "object"
        ) {
            const values =
                Object.values(platform);

            for (
                const value of values
            ) {
                const normalized =
                    normalizeText(
                        typeof value === "object"
                            ? (
                                value?.name ||
                                value?.platform_name ||
                                value?.platformName ||
                                ""
                            )
                            : value
                    );

                if (
                    normalized === wanted ||
                    normalized.includes(wanted) ||
                    wanted.includes(normalized)
                ) {
                    return true;
                }
            }
        } else if (
            platform
        ) {
            const normalized =
                normalizeText(platform);

            if (
                normalized === wanted ||
                normalized.includes(wanted) ||
                wanted.includes(normalized)
            ) {
                return true;
            }
        }
    }

    return false;
}


/*
|--------------------------------------------------------------------------
| Find game
|--------------------------------------------------------------------------
*/

async function findGame(
    apiKey,
    item
) {
    const name =
        item?.artworkQuery ||
        item?.name ||
        "";

    const requestedPlatform =
        item?.artworkPlatform ||
        item?.platform ||
        "";

    if (!name) {
        return null;
    }

    const cacheKey =
        `${normalizeText(name)}|${normalizeText(requestedPlatform)}`;

    if (
        gameLookupCache.has(cacheKey)
    ) {
        return gameLookupCache.get(
            cacheKey
        );
    }

    const params =
        new URLSearchParams();

    params.set(
        "apikey",
        apiKey
    );

    params.set(
        "name",
        name
    );

    params.set(
        "page",
        "1"
    );

    params.set(
        "fields",
        "platform,alternates"
    );

    const url =
        `${THEGAMESDB_API}/Games/ByGameName?${params.toString()}`;

    try {
        console.log(
            `[TheGamesDB] Searching for "${name}"` +
            (
                requestedPlatform
                    ? ` (${requestedPlatform})`
                    : ""
            )
        );

        const data =
            await requestJson(url);

        const games =
            data?.data?.games;

        if (
            !Array.isArray(games) ||
            games.length === 0
        ) {
            console.warn(
                `[TheGamesDB] No games found for "${name}".`
            );

            gameLookupCache.set(
                cacheKey,
                null
            );

            return null;
        }

        const normalizedName =
            normalizeText(name);

        /*
         * Exact title matches.
         */

        const exactMatches =
            games.filter(
                game => {
                    return (
                        normalizeText(
                            game?.game_title ||
                            game?.name ||
                            ""
                        ) === normalizedName
                    );
                }
            );

        /*
         * Exact title + platform.
         */

        if (
            requestedPlatform
        ) {
            const exactPlatformMatch =
                exactMatches.find(
                    game =>
                        platformMatches(
                            game,
                            requestedPlatform
                        )
                );

            if (
                exactPlatformMatch
            ) {
                console.log(
                    "[TheGamesDB] Selected exact title/platform match:",
                    exactPlatformMatch
                );

                gameLookupCache.set(
                    cacheKey,
                    exactPlatformMatch
                );

                return exactPlatformMatch;
            }
        }

        /*
         * Exact title without platform.
         */

        if (
            exactMatches.length > 0
        ) {
            const result =
                exactMatches[0];

            console.log(
                "[TheGamesDB] Selected exact title match:",
                result
            );

            gameLookupCache.set(
                cacheKey,
                result
            );

            return result;
        }

        /*
         * Platform match.
         */

        if (
            requestedPlatform
        ) {
            const platformMatch =
                games.find(
                    game =>
                        platformMatches(
                            game,
                            requestedPlatform
                        )
                );

            if (
                platformMatch
            ) {
                console.log(
                    "[TheGamesDB] Selected platform match:",
                    platformMatch
                );

                gameLookupCache.set(
                    cacheKey,
                    platformMatch
                );

                return platformMatch;
            }
        }

        /*
         * Final fallback.
         */

        const fallback =
            games[0];

        console.log(
            "[TheGamesDB] Using first search result:",
            fallback
        );

        gameLookupCache.set(
            cacheKey,
            fallback
        );

        return fallback;
    } catch (error) {
        console.error(
            "[TheGamesDB] Game lookup failed:",
            error
        );

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| Get game images
|--------------------------------------------------------------------------
*/

async function getGameImages(
    apiKey,
    gameId
) {
    if (!gameId) {
        return null;
    }

    const cacheKey =
        String(gameId);

    if (
        artworkLookupCache.has(
            cacheKey
        )
    ) {
        return artworkLookupCache.get(
            cacheKey
        );
    }

    const params =
        new URLSearchParams();

    params.set(
        "apikey",
        apiKey
    );

    params.set(
        "games_id",
        String(gameId)
    );

    params.set(
        "filter[type]",
        "boxart,clearlogo"
    );

    const url =
        `${THEGAMESDB_API}/Games/Images?${params.toString()}`;

    try {
        console.log(
            `[TheGamesDB] Requesting images for game ${gameId}`
        );

        const data =
            await requestJson(url);

        /*
         * Keep the COMPLETE image response.
         *
         * We don't immediately assume that data is
         * data.boxart.front / data.clearlogo.
         */

        const imageData =
            data?.data || null;

        if (!imageData) {
            console.warn(
                `[TheGamesDB] Image response contained no data for game ${gameId}.`
            );

            return null;
        }

        console.log(
            `[TheGamesDB] Image response for ${gameId}:`,
            imageData
        );

        artworkLookupCache.set(
            cacheKey,
            imageData
        );

        return imageData;
    } catch (error) {
        console.error(
            `[TheGamesDB] Image lookup failed for game ${gameId}:`,
            error
        );

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| Extract a possible image URL/path from an object
|--------------------------------------------------------------------------
*/

function extractImageValue(
    value
) {
    if (!value) {
        return null;
    }

    if (
        typeof value === "string"
    ) {
        return value;
    }

    if (
        Array.isArray(value)
    ) {
        for (
            const entry of value
        ) {
            const result =
                extractImageValue(
                    entry
                );

            if (
                result
            ) {
                return result;
            }
        }

        return null;
    }

    if (
        typeof value !== "object"
    ) {
        return null;
    }

    const possibleFields = [
        "filename",
        "file",
        "path",
        "url",
        "image",
        "imagepath",
        "image_path",
        "thumb",
        "original",
        "resolution"
    ];

    for (
        const field of possibleFields
    ) {
        if (
            typeof value[field] === "string" &&
            value[field]
        ) {
            return value[field];
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Get image type from an image record
|--------------------------------------------------------------------------
*/

function getImageType(
    image
) {
    if (
        !image ||
        typeof image !== "object"
    ) {
        return "";
    }

    return normalizeText(
        image.type ||
        image.image_type ||
        image.imageType ||
        ""
    );
}


/*
|--------------------------------------------------------------------------
| Get image filename/path from an image record
|--------------------------------------------------------------------------
*/

function getImagePath(
    image
) {
    if (!image) {
        return null;
    }

    const direct =
        extractImageValue(
            image
        );

    if (
        direct
    ) {
        return direct;
    }

    /*
     * Some image records may store the actual filename
     * underneath a nested object.
     */

    const nestedCandidates = [
        image.images,
        image.data,
        image.image,
        image.file
    ];

    for (
        const candidate of nestedCandidates
    ) {
        const value =
            extractImageValue(
                candidate
            );

        if (
            value
        ) {
            return value;
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Build image URL
|--------------------------------------------------------------------------
*/

function buildImageUrl(
    value,
    imageData
) {
    if (!value) {
        return null;
    }

    if (
        typeof value !== "string"
    ) {
        return null;
    }

    /*
     * Already a complete URL.
     */

    if (
        value.startsWith(
            "https://"
        ) ||
        value.startsWith(
            "http://"
        )
    ) {
        return value;
    }

    /*
     * TheGamesDB can provide image base URL information.
     */

    const baseUrls =
        imageData?.base_url ||
        imageData?.baseUrl ||
        imageData?.images?.base_url ||
        imageData?.images?.baseUrl ||
        null;

    if (
        baseUrls &&
        typeof baseUrls === "object"
    ) {
        const original =
            baseUrls.original ||
            baseUrls.original_url ||
            baseUrls.originalUrl;

        if (
            typeof original === "string"
        ) {
            return (
                original.replace(
                    /\/+$/,
                    ""
                ) +
                "/" +
                value.replace(
                    /^\/+/,
                    ""
                )
            );
        }
    }

    /*
     * If the API already gave us an absolute-ish path.
     */

    if (
        value.startsWith("/")
    ) {
        return (
            THEGAMESDB_CDN +
            value.substring(1)
        );
    }

    /*
     * Default TheGamesDB CDN.
     */

    return (
        THEGAMESDB_CDN +
        value
    );
}


/*
|--------------------------------------------------------------------------
| Collect image records
|--------------------------------------------------------------------------
|
| The API can expose image information in several shapes.
| This converts those possibilities into a simple array.
|
*/

function collectImageRecords(
    imageData
) {
    const records = [];

    if (!imageData) {
        return records;
    }

    function addValue(
        value,
        fallbackType = ""
    ) {
        if (!value) {
            return;
        }

        if (
            Array.isArray(value)
        ) {
            for (
                const entry of value
            ) {
                addValue(
                    entry,
                    fallbackType
                );
            }

            return;
        }

        if (
            typeof value === "object"
        ) {
            /*
             * If this looks like an actual image record,
             * keep it.
             */

            const path =
                getImagePath(
                    value
                );

            const type =
                getImageType(
                    value
                ) ||
                fallbackType;

            if (
                path
            ) {
                records.push({
                    ...value,
                    type
                });

                return;
            }

            /*
             * Otherwise inspect nested object values.
             */

            for (
                const [key, nested] of
                    Object.entries(value)
            ) {
                const normalizedKey =
                    normalizeText(key);

                if (
                    normalizedKey === "boxart" ||
                    normalizedKey === "clearlogo" ||
                    normalizedKey === "logo"
                ) {
                    addValue(
                        nested,
                        normalizedKey
                    );
                }
            }

            return;
        }

        if (
            typeof value === "string"
        ) {
            records.push({
                type: fallbackType,
                filename: value
            });
        }
    }

    /*
     * Most likely current API structures.
     */

    addValue(
        imageData.images
    );

    addValue(
        imageData.boxart,
        "boxart"
    );

    addValue(
        imageData.clearlogo,
        "clearlogo"
    );

    addValue(
        imageData.clearLogo,
        "clearlogo"
    );

    addValue(
        imageData.logo,
        "clearlogo"
    );

    /*
     * Some responses may use image records directly
     * inside data.
     */

    if (
        Array.isArray(imageData)
    ) {
        addValue(
            imageData
        );
    }

    /*
     * Avoid duplicates.
     */

    const seen =
        new Set();

    return records.filter(
        record => {
            const key =
                `${getImageType(record)}|${getImagePath(record)}`;

            if (
                seen.has(key)
            ) {
                return false;
            }

            seen.add(key);

            return true;
        }
    );
}


/*
|--------------------------------------------------------------------------
| Find image by type
|--------------------------------------------------------------------------
*/

function findImageByType(
    imageData,
    wantedTypes
) {
    const records =
        collectImageRecords(
            imageData
        );

    for (
        const record of records
    ) {
        const type =
            getImageType(
                record
            );

        if (
            wantedTypes.includes(
                type
            )
        ) {
            return record;
        }
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Get front box art
|--------------------------------------------------------------------------
*/

function getFrontBoxArt(
    imageData,
    gameId
) {
    if (!imageData) {
        return null;
    }

    const records =
        collectImageRecords(
            imageData
        );

    /*
     * Prefer an explicit boxart image.
     */

    const boxart =
        records.find(
            record => {
                const type =
                    getImageType(
                        record
                    );

                return (
                    type === "boxart" ||
                    type === "box art"
                );
            }
        );

    if (
        boxart
    ) {
        const value =
            getImagePath(
                boxart
            );

        if (
            value
        ) {
            return buildImageUrl(
                value,
                imageData
            );
        }
    }

    /*
     * Fall back to the old nested structure if present.
     */

    const directCandidates = [
        imageData?.boxart?.front,
        imageData?.front,
        imageData?.frontboxart,
        imageData?.cover,
        imageData?.boxartFront
    ];

    for (
        const candidate of directCandidates
    ) {
        const value =
            extractImageValue(
                candidate
            );

        if (
            value
        ) {
            return buildImageUrl(
                value,
                imageData
            );
        }
    }

    /*
     * Last resort: use the first image record.
     */

    if (
        records.length > 0
    ) {
        const value =
            getImagePath(
                records[0]
            );

        if (
            value
        ) {
            console.warn(
                `[TheGamesDB] Using first available image as box art for game ${gameId}.`
            );

            return buildImageUrl(
                value,
                imageData
            );
        }
    }

    console.warn(
        `[TheGamesDB] No front box art found for game ${gameId}.`
    );

    return null;
}


/*
|--------------------------------------------------------------------------
| Get clear logo
|--------------------------------------------------------------------------
*/

function getClearLogo(
    imageData,
    gameId
) {
    if (!imageData) {
        return null;
    }

    const records =
        collectImageRecords(
            imageData
        );

    /*
     * Prefer clearlogo specifically.
     */

    const logo =
        records.find(
            record => {
                const type =
                    getImageType(
                        record
                    );

                return (
                    type === "clearlogo" ||
                    type === "clear logo"
                );
            }
        );

    if (
        logo
    ) {
        const value =
            getImagePath(
                logo
            );

        if (
            value
        ) {
            return buildImageUrl(
                value,
                imageData
            );
        }
    }

    /*
     * Old / alternate structures.
     */

    const candidates = [
        imageData?.clearlogo,
        imageData?.clearLogo,
        imageData?.logo,
        imageData?.clear_logo
    ];

    for (
        const candidate of candidates
    ) {
        const value =
            extractImageValue(
                candidate
            );

        if (
            value
        ) {
            return buildImageUrl(
                value,
                imageData
            );
        }
    }

    console.warn(
        `[TheGamesDB] No clear logo found for game ${gameId}.`
    );

    return null;
}


/*
|--------------------------------------------------------------------------
| Get artwork from TheGamesDB
|--------------------------------------------------------------------------
*/

async function getTheGamesDBArtwork(
    apiKey,
    item,
    artworkType
) {
    if (
        !apiKey
    ) {
        console.warn(
            "[TheGamesDB] Artwork requested without an API key."
        );

        return null;
    }

    if (
        !item
    ) {
        return null;
    }

    const type =
        String(
            artworkType || ""
        ).toLowerCase();

    if (
        ![
            "icon",
            "logo",
            "cover"
        ].includes(type)
    ) {
        return null;
    }

    const game =
        await findGame(
            apiKey,
            item
        );

    if (
        !game
    ) {
        console.warn(
            `[TheGamesDB] Could not find "${item.artworkQuery || item.name}".`
        );

        return null;
    }

    const gameId =
        game.id ||
        game.game_id ||
        game.gameID;

    if (
        !gameId
    ) {
        console.warn(
            "[TheGamesDB] Game result did not contain a game ID:",
            game
        );

        return null;
    }

    console.log(
        `[TheGamesDB] Found "${item.artworkQuery || item.name}" as game ${gameId}.`
    );

    const imageData =
        await getGameImages(
            apiKey,
            gameId
        );

    if (
        !imageData
    ) {
        return null;
    }

    /*
     * Logo is independently requested.
     */

    if (
        type === "logo"
    ) {
        const logo =
            getClearLogo(
                imageData,
                gameId
            );

        if (
            logo
        ) {
            console.log(
                `[TheGamesDB] Logo found for ${gameId}: ${logo}`
            );
        }

        return logo;
    }

    /*
     * Cover and icon currently use front box art.
     */

    if (
        type === "cover" ||
        type === "icon"
    ) {
        const cover =
            getFrontBoxArt(
                imageData,
                gameId
            );

        if (
            cover
        ) {
            console.log(
                `[TheGamesDB] ${type} found for ${gameId}: ${cover}`
            );
        }

        return cover;
    }

    return null;
}


/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    getTheGamesDBArtwork
};