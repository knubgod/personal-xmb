/*
    ========================================================
    PERSONAL XMB

    MAIN PROCESS

    ========================================================

    Responsible for:

    - Creating the Electron window
    - Loading configuration
    - Launching applications
    - Communicating with external services
    - Handling Steam metadata
    - Handling Steam artwork
    - Handling general artwork
    - Handling category icon downloads/cache
    - Handling Spotify authentication
    - Handling persistent artwork caching
    - Handling daily artwork refreshes
    - Preloading artwork during startup
*/


/*
    ========================================================
    MODULES
    ========================================================
*/

const {
    spawn
} = require(
    "child_process"
);

const {
    getTheGamesDBArtwork
} = require(
    "./thegamesdb"
);

const {
    app,
    BrowserWindow,
    ipcMain,
    shell,
    protocol,
    net,
    safeStorage,
    components
} = require(
    "electron"
);


const path =
    require(
        "path"
    );


const fs =
    require(
        "fs"
    );


const http =
    require(
        "http"
    );


const https =
    require(
        "https"
    );


const crypto =
    require(
        "crypto"
    );


const {
    pathToFileURL
} = require(
    "url"
);

protocol.registerSchemesAsPrivileged([
    {
        scheme: "xmb-artwork",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true
        }
    }
]);


/*
    ========================================================
    ARTWORK CACHE SETTINGS
    ========================================================
*/

const ARTWORK_CACHE_REFRESH_MS =
    24 *
    60 *
    60 *
    1000;


/*
    Startup artwork preload is deliberately separate from
    the daily refresh system.

    The daily refresh only deals with artwork that has
    already been cached.

    The startup preload also finds artwork that has NEVER
    been cached before.
*/

const ARTWORK_PRELOAD_DELAY_MS =
    1500;


/*
    Limit the number of artwork downloads happening at once.

    Keeping this low prevents startup from hammering Steam,
    Minecraft, Riot, or other artwork providers.
*/

const ARTWORK_PRELOAD_CONCURRENCY =
    5;

const UNIVERSAL_ARTWORK_TYPES = [
    "icon",
    "logo",
    "cover",
    "hero",
    "background"
];


function getDailyArtworkRefreshPath() {

    return path.join(

        app.getPath(
            "userData"
        ),

        "artwork",

        "daily-refresh.json"

    );

}


/*
    ========================================================
    WINDOW
    ========================================================
*/

let mainWindow = null;

let startupArtworkPreloadPromise = null;


function getSettingsPath() {

    return path.join(
        app.getPath("userData"),
        "settings.json"
    );

}


function readSettingsFile() {

    const settingsPath =
        getSettingsPath();

    if (!fs.existsSync(settingsPath)) {

        let bundledSettings = {};

        try {
            bundledSettings =
                readConfigFile("settings.example.json");
        }
        catch (error) {
            bundledSettings = {};
        }

        fs.mkdirSync(
            path.dirname(settingsPath),
            {recursive:true}
        );

        fs.writeFileSync(
            settingsPath,
            JSON.stringify(
                bundledSettings,
                null,
                4
            ),
            "utf8"
        );
    }

    try {
        return JSON.parse(
            fs.readFileSync(
                settingsPath,
                "utf8"
            )
        );
    }
    catch (error) {
        throw new Error(
            "Personal XMB settings could not be read."
        );
    }
}


function writeSettingsFile(settings) {

    const settingsPath =
        getSettingsPath();

    fs.mkdirSync(
        path.dirname(settingsPath),
        {recursive:true}
    );

    fs.writeFileSync(
        settingsPath,
        JSON.stringify(
            settings,
            null,
            4
        ),
        "utf8"
    );
}


function getLocalSettingsPath() {

    return path.join(
        app.getPath("userData"),
        "local-settings.json"
    );

}


function readLocalSettings() {

    const filePath =
        getLocalSettingsPath();

    try {

        return JSON.parse(
            fs.readFileSync(
                filePath,
                "utf8"
            )
        );

    }
    catch (error) {

        return {};

    }

}


function writeLocalSettings(settings) {

    const filePath =
        getLocalSettingsPath();

    fs.mkdirSync(
        path.dirname(filePath),
        {recursive:true}
    );

    fs.writeFileSync(
        filePath,
        JSON.stringify(
            settings,
            null,
            4
        ),
        "utf8"
    );

}


function getSpotifyLocalSettings() {

    const local =
        readLocalSettings();

    local.spotify =
        local.spotify ||
        {};

    return local.spotify;

}


function getSpotifyClientId() {

    const local =
        getSpotifyLocalSettings();

    if (
        typeof local.clientId === "string" &&
        local.clientId.trim()
    ) {

        return local.clientId.trim();

    }

    /*
        Migrate a legacy client ID from the old settings
        location into the local-only settings file.
    */

    const legacy =
        readSettingsFile();

    const legacyClientId =
        legacy.spotify?.clientId;

    if (
        typeof legacyClientId === "string" &&
        legacyClientId.trim()
    ) {

        local.clientId =
            legacyClientId.trim();

        const allLocal =
            readLocalSettings();

        allLocal.spotify =
            allLocal.spotify ||
            {};

        allLocal.spotify.clientId =
            local.clientId;

        writeLocalSettings(
            allLocal
        );

        return local.clientId;

    }

    return "";

}


function setSpotifyLocalIdentity(
    values = {}
) {

    const local =
        readLocalSettings();

    local.spotify =
        local.spotify ||
        {};

    if (
        typeof values.clientId === "string" &&
        values.clientId.trim()
    ) {

        local.spotify.clientId =
            values.clientId.trim();

    }

    if (
        typeof values.accountId === "string" &&
        values.accountId.trim()
    ) {

        local.spotify.accountId =
            values.accountId.trim();

    }

    if (
        typeof values.userId === "string" &&
        values.userId.trim()
    ) {

        local.spotify.userId =
            values.userId.trim();

    }

    writeLocalSettings(
        local
    );

    return local.spotify;

}


async function saveSpotifyTokens(
    tokens
) {

    if (
        !safeStorage.isEncryptionAvailable()
    ) {

        throw new Error(
            "OS secure storage is unavailable. Spotify credentials were not saved."
        );

    }

    const encrypted =
        safeStorage.encryptString(
            JSON.stringify({
                accessToken:
                    tokens.accessToken || "",
                refreshToken:
                    tokens.refreshToken || "",
                expiresAt:
                    Number(tokens.expiresAt || 0),
                scope:
                    typeof tokens.scope === "string"
                        ? tokens.scope
                        : ""
            })
        );

    const local =
        readLocalSettings();

    local.spotify =
        local.spotify ||
        {};

    local.spotify.tokens =
        encrypted.toString(
            "base64"
        );

    writeLocalSettings(
        local
    );

}


function loadSpotifyTokens() {

    const local =
        getSpotifyLocalSettings();

    if (
        !local.tokens
    ) {

        return null;

    }

    if (
        !safeStorage.isEncryptionAvailable()
    ) {

        throw new Error(
            "OS secure storage is unavailable. Spotify credentials cannot be read."
        );

    }

    try {

        const encrypted =
            Buffer.from(
                local.tokens,
                "base64"
            );

        return JSON.parse(
            safeStorage.decryptString(
                encrypted
            )
        );

    }
    catch (error) {

        throw new Error(
            "Stored Spotify credentials could not be decrypted."
        );

    }

}


function clearSpotifyTokens() {

    const local =
        readLocalSettings();

    if (
        local.spotify
    ) {

        delete local.spotify.tokens;

        writeLocalSettings(
            local
        );

    }

}


function getRendererSpotifySettings() {

    const local =
        getSpotifyLocalSettings();

    return {

        clientId:
            local.clientId || "",

        accountId:
            local.accountId || "",

        userId:
            local.userId || "",

        connected:
            Boolean(
                local.tokens
            )

    };

}




function redactSensitiveSettings(
    value
) {

    if (
        Array.isArray(value)
    ) {

        return value.map(
            item =>
                redactSensitiveSettings(item)
        );

    }

    if (
        !value ||
        typeof value !== "object"
    ) {

        return value;

    }

    const result = {};

    for (
        const [
            key,
            child
        ]
        of Object.entries(value)
    ) {

        if (
            /apiKey|accessToken|refreshToken|clientSecret|password|token/i.test(
                key
            )
        ) {

            result[key] = "";

            continue;

        }

        result[key] =
            redactSensitiveSettings(
                child
            );

    }

    return result;

}


function getRendererSafeSettings() {

    return redactSensitiveSettings(
        readSettingsFile()
    );

}


function toArtworkUrl(localPath) {

    const userData =
        path.resolve(
            app.getPath("userData")
        );

    const resolvedPath =
        path.resolve(localPath);

    const relativePath =
        path.relative(
            userData,
            resolvedPath
        );

    if (
        !relativePath ||
        relativePath.startsWith("..") ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error(
            "Artwork path is outside the Personal XMB data directory."
        );
    }

    return (
        "xmb-artwork://local/" +
        encodeURIComponent(
            relativePath.replace(/\\/g,"/")
        )
    );
}


function registerArtworkProtocol() {

    protocol.handle(
        "xmb-artwork",
        request => {

            try {

                const requestUrl =
                    new URL(request.url);

                if (
                    requestUrl.host !==
                    "local"
                ) {
                    return new Response(
                        "Not Found",
                        {status:404}
                    );
                }

                const relativePath =
                    decodeURIComponent(
                        requestUrl.pathname.replace(
                            /^\//,
                            ""
                        )
                    );

                const userData =
                    path.resolve(
                        app.getPath("userData")
                    );

                const resolvedPath =
                    path.resolve(
                        userData,
                        relativePath
                    );

                const relativeCheck =
                    path.relative(
                        userData,
                        resolvedPath
                    );

                if (
                    !relativeCheck ||
                    relativeCheck.startsWith("..") ||
                    path.isAbsolute(relativeCheck)
                ) {
                    return new Response(
                        "Forbidden",
                        {status:403}
                    );
                }

                return net.fetch(
                    pathToFileURL(
                        resolvedPath
                    ).toString()
                );
            }
            catch (error) {
                return new Response(
                    "Not Found",
                    {status:404}
                );
            }
        }
    );
}


function isTrustedRenderer(event) {

    return Boolean(
        mainWindow &&
        !mainWindow.isDestroyed() &&
        event?.sender === mainWindow.webContents &&
        event?.senderFrame === mainWindow.webContents.mainFrame
    );
}


function requireTrustedRenderer(event) {

    if (!isTrustedRenderer(event)) {
        throw new Error(
            "Untrusted renderer IPC request rejected."
        );
    }
}


function createWindow() {

    mainWindow =
        new BrowserWindow({

            width:
                1920,

            height:
                1080,

            minWidth:
                1000,

            minHeight:
                650,

            autoHideMenuBar:
                true,

            backgroundColor:
                "#05070A",

            /*
                Keep the window hidden until the initial
                artwork cache preload has completed.
            */

            show:
                false,

            webPreferences: {

                preload:
                    path.join(
                        __dirname,
                        "preload.js"
                    ),

                contextIsolation:
                    true,

                nodeIntegration:
                    false,

                sandbox:
                    true
            }
        });


    mainWindow.loadFile(
        path.join(
            __dirname,
            "ui",
            "index.html"
        )
    );


    mainWindow.on(
        "closed",
        () => {

            mainWindow =
                null;
        }
    );
}


/*
    ========================================================
    CONFIGURATION
    ========================================================
*/

function readConfigFile(
    fileName
) {

    const filePath =
        path.join(
            __dirname,
            "config",
            fileName
        );


    const file =
        fs.readFileSync(
            filePath,
            "utf8"
        );


    return JSON.parse(
        file
    );
}


/*
    ========================================================
    CONFIGURATION IPC
    ========================================================
*/

ipcMain.handle(
    "get-categories",
    event => {

        requireTrustedRenderer(event);

        return readConfigFile(
            "categories.json"
        );
    }
);


ipcMain.handle(
    "get-settings",
    event => {

        requireTrustedRenderer(event);

        const settings =
            getRendererSafeSettings();

        settings.spotify =
            {
                ...settings.spotify,
                ...getRendererSpotifySettings()
            };

        settings.integrations =
            settings.integrations || {};

        settings.integrations.steam =
            {
                ...(settings.integrations.steam || {}),
                ...getRendererSteamSettings()
            };

        return settings;
    }
);


ipcMain.handle(
    "get-themes",
    event => {

        requireTrustedRenderer(event);

        return readConfigFile(
            "themes.json"
        );
    }
);


/*
    ========================================================
    CATEGORY ICON CACHE
    ========================================================
*/

function getCategoryIconDirectory() {

    return path.join(

        app.getPath(
            "userData"
        ),

        "category-icons"

    );

}


function ensureCategoryIconDirectory() {

    const directory =
        getCategoryIconDirectory();


    if (
        !fs.existsSync(
            directory
        )
    ) {

        fs.mkdirSync(

            directory,

            {
                recursive:
                    true
            }

        );

    }


    return directory;

}


function getCategoryIconFileName(
    categoryName
) {

    return (

        String(
            categoryName
        )

            .toLowerCase()

            .replace(
                /[^a-z0-9-_]/g,
                "-"
            )

            .replace(
                /-+/g,
                "-"
            )

            .replace(
                /^-|-$/g,
                ""
            )

        + ".svg"

    );

}


const categoryIconSources = {

    "Steam":
        "https://cdn.simpleicons.org/steam",

    "Spotify":
        "https://cdn.simpleicons.org/spotify",

    "Music":
        "https://cdn.simpleicons.org/spotify",

    "Riot":
        "https://cdn.simpleicons.org/riotgames",

    "Riot Games":
        "https://cdn.simpleicons.org/riotgames",


    "Xbox":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/gamepad-2.svg",

    "PC":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/monitor.svg",

    "Windows":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/monitor.svg",


    "Settings":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/settings.svg",

    "Friends":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/users.svg",

    "Work":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/briefcase.svg",

    "Server":
        "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/server.svg"

};


function getCategoryIconUrl(
    categoryName,
    categoryData
) {

    const icon =
        categoryData?.icon;


    if (
        typeof icon ===
        "string"
    ) {

        if (
            icon.startsWith(
                "https://"
            )
        ) {

            return icon;

        }

    }


    if (
        icon &&
        typeof icon ===
            "object" &&
        icon.provider ===
            "simple-icons" &&
        icon.slug
    ) {

        return (

            "https://cdn.simpleicons.org/" +

            encodeURIComponent(
                icon.slug
            )

        );

    }


    const automaticSource =
        categoryIconSources[
            categoryName
        ];


    if (
        automaticSource
    ) {

        return automaticSource;

    }


    const categoryLower =
        String(
            categoryName
        ).toLowerCase();


    for (
        const [
            name,
            source
        ]
        of Object.entries(
            categoryIconSources
        )
    ) {

        if (
            name.toLowerCase() ===
            categoryLower
        ) {

            return source;

        }

    }


    return null;

}


function downloadCategoryIcon(
    url,
    destination,
    redirectCount = 0
) {

    return new Promise(

        (
            resolve,
            reject
        ) => {

            if (
                redirectCount > 5
            ) {

                reject(
                    new Error(
                        "Too many category icon redirects."
                    )
                );

                return;

            }


            let parsedUrl;


            try {

                parsedUrl =
                    new URL(
                        url
                    );

            }
            catch (
                error
            ) {

                reject(
                    new Error(
                        "Invalid category icon URL."
                    )
                );

                return;

            }


            if (
                parsedUrl.protocol !==
                "https:"
            ) {

                reject(
                    new Error(
                        "Category icon URLs must use HTTPS."
                    )
                );

                return;

            }


            const request =
                https.get(

                    parsedUrl,

                    response => {

                        if (

                            response.statusCode >= 300 &&

                            response.statusCode < 400 &&

                            response.headers.location

                        ) {

                            const redirectUrl =
                                new URL(

                                    response.headers.location,

                                    parsedUrl

                                ).toString();


                            response.resume();


                            downloadCategoryIcon(

                                redirectUrl,

                                destination,

                                redirectCount + 1

                            )

                                .then(
                                    resolve
                                )

                                .catch(
                                    reject
                                );


                            return;

                        }


                        if (
                            response.statusCode !==
                            200
                        ) {

                            response.resume();


                            reject(

                                new Error(

                                    `Category icon download failed: HTTP ${response.statusCode}`

                                )

                            );


                            return;

                        }


                        const contentType =
                            String(

                                response.headers[
                                    "content-type"
                                ] ||

                                ""

                            ).toLowerCase();


                        if (
                            !contentType.startsWith(
                                "image/"
                            ) &&

                            !contentType.includes(
                                "svg"
                            )
                        ) {

                            response.resume();


                            reject(

                                new Error(

                                    "Category icon source did not return an image."

                                )

                            );


                            return;

                        }


                        const maximumSize =
                            2 *
                            1024 *
                            1024;


                        const contentLength =
                            Number(

                                response.headers[
                                    "content-length"
                                ] ||

                                0

                            );


                        if (
                            contentLength >
                            maximumSize
                        ) {

                            response.resume();


                            reject(

                                new Error(

                                    "Category icon is larger than 2 MB."

                                )

                            );


                            return;

                        }


                        const file =
                            fs.createWriteStream(

                                destination

                            );


                        let downloadedBytes =
                            0;


                        let sizeExceeded =
                            false;


                        response.on(

                            "data",

                            chunk => {

                                downloadedBytes +=
                                    chunk.length;


                                if (

                                    downloadedBytes >
                                        maximumSize &&

                                    !sizeExceeded

                                ) {

                                    sizeExceeded =
                                        true;


                                    response.destroy(

                                        new Error(

                                            "Category icon exceeded 2 MB."

                                        )

                                    );


                                    file.destroy();


                                    fs.unlink(

                                        destination,

                                        () => {}

                                    );

                                }

                            }

                        );


                        response.pipe(
                            file
                        );


                        file.on(

                            "finish",

                            () => {

                                if (
                                    sizeExceeded
                                ) {

                                    return;

                                }


                                file.close(

                                    () => {

                                        resolve(
                                            destination
                                        );

                                    }

                                );

                            }

                        );


                        file.on(

                            "error",

                            error => {

                                fs.unlink(

                                    destination,

                                    () => {}

                                );


                                reject(
                                    error
                                );

                            }

                        );


                        response.on(

                            "error",

                            error => {

                                file.destroy();


                                fs.unlink(

                                    destination,

                                    () => {}

                                );


                                reject(
                                    error
                                );

                            }

                        );

                    }

                );


            request.setTimeout(

                10000,

                () => {

                    request.destroy(

                        new Error(

                            "Category icon download timed out."

                        )

                    );

                }

            );


            request.on(

                "error",

                error => {

                    fs.unlink(

                        destination,

                        () => {}

                    );


                    reject(
                        error
                    );

                }

            );

        }

    );

}


ipcMain.handle(
    "get-category-icon",
    async (
        event,
        categoryName
    ) => {

        requireTrustedRenderer(event);

        try {

            if (
                !categoryName
            ) {

                throw new Error(

                    "Category name is required."

                );

            }


            const categories =
                readConfigFile(
                    "categories.json"
                );


            const categoryData =
                categories[
                    categoryName
                ];


            const directory =
                ensureCategoryIconDirectory();


            const fileName =
                getCategoryIconFileName(
                    categoryName
                );


            const localPath =
                path.join(

                    directory,

                    fileName

                );


            if (
                fs.existsSync(
                    localPath
                )
            ) {

                console.log(

                    `Category icon already cached: ${categoryName}`

                );


                return toArtworkUrl(
                    localPath
                );

            }


            const iconUrl =
                getCategoryIconUrl(

                    categoryName,

                    categoryData

                );


            if (
                !iconUrl
            ) {

                console.warn(

                    `No downloadable category icon configured for: ${categoryName}`

                );


                return null;

            }


            console.log(

                `Downloading category icon: ${categoryName}`

            );


            await downloadCategoryIcon(

                iconUrl,

                localPath

            );


            console.log(

                `Category icon cached: ${categoryName}`

            );


            return toArtworkUrl(
                localPath
            );

        }

        catch (
            error
        ) {

            console.error(

                `Category icon request failed: ${categoryName}`,

                error

            );


            return null;

        }

    }

);


/*
    ========================================================
    STEAM METADATA
    ========================================================
*/

function fetchSteamStoreMetadata(
    appId
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const url =
                new URL(
                    "https://store.steampowered.com/api/appdetails"
                );


            url.searchParams.set(
                "appids",
                String(
                    appId
                )
            );


            url.searchParams.set(
                "l",
                "en"
            );


            const request =
                https.get(
                    url,
                    response => {

                        let body =
                            "";


                        response.on(
                            "data",
                            chunk => {

                                body +=
                                    chunk;
                            }
                        );


                        response.on(
                            "end",
                            () => {

                                if (
                                    response.statusCode !==
                                    200
                                ) {

                                    reject(
                                        new Error(
                                            `Steam request failed: HTTP ${response.statusCode}`
                                        )
                                    );

                                    return;
                                }


                                try {

                                    const result =
                                        JSON.parse(
                                            body
                                        );


                                    const appData =
                                        result[
                                            String(
                                                appId
                                            )
                                        ];


                                    if (
                                        !appData ||
                                        !appData.success ||
                                        !appData.data
                                    ) {

                                        resolve(
                                            null
                                        );

                                        return;
                                    }


                                    resolve(
                                        appData.data
                                    );

                                }
                                catch (
                                    error
                                ) {

                                    reject(
                                        error
                                    );
                                }
                            }
                        );
                    }
                );


            request.setTimeout(
                10000,
                () => {

                    request.destroy(
                        new Error(
                            "Steam request timed out."
                        )
                    );
                }
            );


            request.on(
                "error",
                error => {

                    reject(
                        error
                    );
                }
            );
        }
    );
}


/*
    ========================================================
    STEAM METADATA NORMALIZATION
    ========================================================

    Steam Library / Big Picture artwork is preferred.

    The Steam Store API artwork remains available as a
    fallback for titles that do not provide the Library
    assets.
*/

function normalizeSteamMetadata(
    data
) {

    if (
        !data
    ) {

        return null;

    }


    const genres =
        Array.isArray(
            data.genres
        )
            ? data.genres
                .map(
                    genre =>
                        genre.description
                )
                .join(
                    ", "
                )
            : "";


    const developers =
        Array.isArray(
            data.developers
        )
            ? data.developers.join(
                ", "
            )
            : "";


    const publishers =
        Array.isArray(
            data.publishers
        )
            ? data.publishers.join(
                ", "
            )
            : "";


    const steamAppId =
        data.steam_appid;


    const steamBaseUrl =
        steamAppId
            ? `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`
            : "";


    const heroCandidates = [];

    const portraitCandidates = [];

    const logoCandidates = [];


    if (
        steamBaseUrl
    ) {

        heroCandidates.push(
            `${steamBaseUrl}/library_hero_2x.jpg`,
            `${steamBaseUrl}/library_hero.jpg`
        );


        portraitCandidates.push(
            `${steamBaseUrl}/library_600x900_2x.jpg`,
            `${steamBaseUrl}/library_600x900.jpg`
        );


        logoCandidates.push(
            `${steamBaseUrl}/logo_2x.png`,
            `${steamBaseUrl}/logo.png`
        );

    }


    if (
        data.header_image
    ) {

        heroCandidates.push(
            data.header_image
        );

    }


    if (
        data.background_raw
    ) {

        heroCandidates.push(
            data.background_raw
        );

    }


    if (
        data.background
    ) {

        heroCandidates.push(
            data.background
        );

    }


    if (
        data.capsule_image
    ) {

        portraitCandidates.push(
            data.capsule_image
        );

    }


    if (
        data.capsule_imagev5
    ) {

        portraitCandidates.push(
            data.capsule_imagev5
        );

    }


    if (
        data.logo
    ) {

        logoCandidates.push(
            data.logo
        );

    }


    const uniqueCandidates =
        candidates =>
            [
                ...new Set(
                    candidates.filter(
                        Boolean
                    )
                )
            ];


    const finalHeroCandidates =
        uniqueCandidates(
            heroCandidates
        );


    const finalPortraitCandidates =
        uniqueCandidates(
            portraitCandidates
        );


    const finalLogoCandidates =
        uniqueCandidates(
            logoCandidates
        );


    const steamArtwork = {

        icon:
            data.icon ||
            "",


        logo:
            finalLogoCandidates[0] ||
            "",


        hero:
            finalHeroCandidates[0] ||
            "",


        cover:
            finalPortraitCandidates[0] ||
            "",


        grid:
            finalPortraitCandidates[0] ||
            "",


        capsule:
            finalPortraitCandidates[0] ||
            "",


        background:
            finalHeroCandidates[0] ||
            ""

    };


    return {

        name:
            data.name ||
            "",

        developer:
            developers,

        publisher:
            publishers,

        genre:
            genres,

        releaseDate:
            data.release_date?.date ||
            "",

        description:
            data.short_description ||
            data.detailed_description ||
            "",

        platform:
            "Steam",

        artwork:
            steamArtwork,

        artworkCandidates: {

            icon:
                uniqueCandidates([
                    data.icon
                ]),

            logo:
                finalLogoCandidates,

            hero:
                finalHeroCandidates,

            cover:
                finalPortraitCandidates,

            grid:
                finalPortraitCandidates,

            capsule:
                finalPortraitCandidates,

            background:
                finalHeroCandidates

        },

        steam:
            {
                appId:
                    steamAppId
            }

    };

}


ipcMain.handle(
    "steam-get-metadata",
    async (
        event,
        appId
    ) => {

        requireTrustedRenderer(event);

        try {

            if (
                !appId
            ) {

                throw new Error(
                    "Steam App ID is required."
                );
            }


            const rawData =
                await fetchSteamStoreMetadata(
                    appId
                );


            const metadata =
                normalizeSteamMetadata(
                    rawData
                );


            if (
                !metadata
            ) {

                throw new Error(
                    "Steam metadata was unavailable."
                );
            }


            return {

                success:
                    true,

                data:
                    metadata
            };

        }
        catch (
            error
        ) {

            console.error(
                "Steam metadata request failed:",
                error
            );


            return {

                success:
                    false,

                error:
                    error.message
            };
        }
    }
);


/*
    ========================================================
    GENERAL ARTWORK CACHE
    ========================================================
*/

function getArtworkDirectory(
    itemId
) {

    return path.join(

        app.getPath(
            "userData"
        ),

        "artwork",

        String(
            itemId
        )
    );
}


function getArtworkFilePath(
    itemId,
    artworkType,
    extension = ".png"
) {

    return path.join(

        getArtworkDirectory(
            itemId
        ),

        `${artworkType}${extension}`
    );
}


function getArtworkCacheMetadataPath(
    itemId
) {

    return path.join(

        getArtworkDirectory(
            itemId
        ),

        "cache-meta.json"

    );

}


function readArtworkCacheMetadata(
    itemId
) {

    const metadataPath =
        getArtworkCacheMetadataPath(
            itemId
        );


    if (
        !fs.existsSync(
            metadataPath
        )
    ) {

        return {};

    }


    try {

        const metadata =
            JSON.parse(

                fs.readFileSync(

                    metadataPath,

                    "utf8"

                )

            );


        return (
            metadata &&
            typeof metadata ===
                "object"
                ? metadata
                : {}
        );

    }
    catch (
        error
    ) {

        console.warn(

            `Could not read artwork cache metadata for ${itemId}.`

        );


        return {};

    }

}


function writeArtworkCacheMetadata(
    itemId,
    metadata
) {

    const directory =
        getArtworkDirectory(
            itemId
        );


    fs.mkdirSync(

        directory,

        {
            recursive:
                true
        }

    );


    fs.writeFileSync(

        getArtworkCacheMetadataPath(
            itemId
        ),

        JSON.stringify(
            metadata,
            null,
            4
        ),

        "utf8"

    );

}


function isArtworkCacheFresh(
    metadata,
    artworkType,
    artworkUrl
) {

    const entry =
        metadata?.[
            artworkType
        ];


    if (
        !entry
    ) {

        return false;

    }


    if (
        entry.url !==
        artworkUrl
    ) {

        return false;

    }


    if (
        !entry.checkedAt
    ) {

        return false;

    }


    return (

        Date.now() -
        Number(
            entry.checkedAt
        ) <
        ARTWORK_CACHE_REFRESH_MS

    );

}


function markArtworkCacheChecked(
    itemId,
    artworkType,
    artworkUrl
) {

    const metadata =
        readArtworkCacheMetadata(
            itemId
        );


    metadata[
        artworkType
    ] = {

        url:
            artworkUrl,

        checkedAt:
            Date.now()

    };


    writeArtworkCacheMetadata(

        itemId,

        metadata

    );

}


function getArtworkExtension(
    contentType,
    url
) {

    const type =
        String(
            contentType ||
            ""
        ).toLowerCase();


    if (
        type.includes(
            "image/png"
        )
    ) {

        return ".png";
    }


    if (
        type.includes(
            "image/webp"
        )
    ) {

        return ".webp";
    }


    if (
        type.includes(
            "image/jpeg"
        )
    ) {

        return ".jpg";
    }


    if (
        type.includes(
            "image/svg"
        )
    ) {

        return ".svg";
    }


    try {

        const pathname =
            new URL(
                url
            ).pathname;


        const extension =
            path.extname(
                pathname
            ).toLowerCase();


        if (
            [
                ".png",
                ".jpg",
                ".jpeg",
                ".webp",
                ".svg"
            ].includes(
                extension
            )
        ) {

            return extension;
        }

    }
    catch (
        error
    ) {

        /*
            Ignore invalid URL extension.
        */
    }


    return ".png";
}


function downloadFile(
    url,
    destination,
    redirectCount = 0
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (
                redirectCount > 5
            ) {

                reject(
                    new Error(
                        "Too many artwork redirects."
                    )
                );

                return;
            }


            let parsedUrl;


            try {

                parsedUrl =
                    new URL(
                        url
                    );

            }
            catch (
                error
            ) {

                reject(
                    new Error(
                        "Invalid artwork URL."
                    )
                );

                return;

            }


            if (
                parsedUrl.protocol !==
                "https:"
            ) {

                reject(
                    new Error(
                        "Artwork URLs must use HTTPS."
                    )
                );

                return;

            }


            const request =
                https.get(
                    parsedUrl,
                    response => {

                        if (
                            response.statusCode >= 300 &&
                            response.statusCode < 400 &&
                            response.headers.location
                        ) {

                            const redirectUrl =
                                new URL(
                                    response.headers.location,
                                    parsedUrl
                                ).toString();


                            response.resume();


                            downloadFile(
                                redirectUrl,
                                destination,
                                redirectCount + 1
                            )
                                .then(
                                    resolve
                                )
                                .catch(
                                    reject
                                );


                            return;
                        }


                        if (
                            response.statusCode !==
                            200
                        ) {

                            response.resume();


                            reject(
                                new Error(
                                    `Artwork download failed: HTTP ${response.statusCode}`
                                )
                            );


                            return;
                        }


                        const contentType =
                            String(
                                response.headers[
                                    "content-type"
                                ] ||
                                ""
                            ).toLowerCase();


                        if (
                            !contentType.startsWith(
                                "image/"
                            )
                        ) {

                            response.resume();


                            reject(
                                new Error(
                                    "Artwork source did not return an image."
                                )
                            );


                            return;
                        }


                        const maximumSize =
                            15 *
                            1024 *
                            1024;


                        const contentLength =
                            Number(
                                response.headers[
                                    "content-length"
                                ] ||
                                0
                            );


                        if (
                            contentLength >
                            maximumSize
                        ) {

                            response.resume();


                            reject(
                                new Error(
                                    "Artwork file is larger than 15 MB."
                                )
                            );


                            return;
                        }


                        const file =
                            fs.createWriteStream(
                                destination
                            );


                        let downloadedBytes =
                            0;


                        let sizeExceeded =
                            false;


                        response.on(
                            "data",
                            chunk => {

                                downloadedBytes +=
                                    chunk.length;


                                if (
                                    downloadedBytes >
                                    maximumSize &&
                                    !sizeExceeded
                                ) {

                                    sizeExceeded =
                                        true;


                                    response.destroy(
                                        new Error(
                                            "Artwork file is larger than 15 MB."
                                        )
                                    );


                                    file.destroy();


                                    fs.unlink(
                                        destination,
                                        () => {}
                                    );
                                }
                            }
                        );


                        response.pipe(
                            file
                        );


                        file.on(
                            "finish",
                            () => {

                                if (
                                    sizeExceeded
                                ) {

                                    return;
                                }


                                file.close(
                                    () => {

                                        resolve({

                                            contentType

                                        });

                                    }
                                );
                            }
                        );


                        file.on(
                            "error",
                            error => {

                                fs.unlink(
                                    destination,
                                    () => {}
                                );


                                reject(
                                    error
                                );
                            }
                        );


                        response.on(
                            "error",
                            error => {

                                file.destroy();


                                fs.unlink(
                                    destination,
                                    () => {}
                                );


                                reject(
                                    error
                                );
                            }
                        );
                    }
                );


            request.setTimeout(
                15000,
                () => {

                    request.destroy(
                        new Error(
                            "Artwork download timed out."
                        )
                    );
                }
            );


            request.on(
                "error",
                error => {

                    fs.unlink(
                        destination,
                        () => {}
                    );


                    reject(
                        error
                    );
                }
            );
        }
    );
}


/*
    ========================================================
    FIND GENERAL ARTWORK FILE
    ========================================================
*/

function findExistingArtworkFile(
    itemId,
    artworkType
) {

    const extensions = [

        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg"

    ];


    for (
        const extension
        of extensions
    ) {

        const filePath =
            getArtworkFilePath(

                itemId,

                artworkType,

                extension

            );


        if (
            fs.existsSync(
                filePath
            )
        ) {

            return filePath;

        }

    }


    return null;

}


async function downloadAndCacheArtwork(
    itemId,
    artworkType,
    artworkUrl,
    forceRefresh = false
) {

    if (
        !itemId ||
        !artworkType ||
        !artworkUrl
    ) {

        return null;
    }


    const artworkDirectory =
        getArtworkDirectory(
            itemId
        );


    fs.mkdirSync(
        artworkDirectory,
        {
            recursive:
                true
        }
    );


    const existingPath =
        findExistingArtworkFile(

            itemId,

            artworkType

        );


    const cacheMetadata =
        readArtworkCacheMetadata(
            itemId
        );


    if (
        existingPath &&

        !forceRefresh &&

        isArtworkCacheFresh(

            cacheMetadata,

            artworkType,

            artworkUrl

        )
    ) {

        return toArtworkUrl(
            existingPath
        );

    }


    const temporaryPath =
        path.join(

            artworkDirectory,

            `${artworkType}.download`

        );


    try {

        console.log(

            `Refreshing artwork: ${itemId} / ${artworkType}`

        );


        const result =
            await downloadFile(

                artworkUrl,

                temporaryPath

            );


        const extension =
            getArtworkExtension(

                result.contentType,

                artworkUrl

            );


        const finalPath =
            getArtworkFilePath(

                itemId,

                artworkType,

                extension

            );


        if (
            existingPath &&
            existingPath !== finalPath &&
            fs.existsSync(
                existingPath
            )
        ) {

            fs.unlinkSync(
                existingPath
            );

        }


        if (
            fs.existsSync(
                finalPath
            )
        ) {

            fs.unlinkSync(
                finalPath
            );

        }


        fs.renameSync(
            temporaryPath,
            finalPath
        );


        markArtworkCacheChecked(

            itemId,

            artworkType,

            artworkUrl

        );


        console.log(

            `Artwork cached/refreshed: ${itemId} / ${artworkType}`

        );


        return toArtworkUrl(
            finalPath
        );

    }
    catch (
        error
    ) {

        if (
            fs.existsSync(
                temporaryPath
            )
        ) {

            fs.unlink(
                temporaryPath,
                () => {}
            );
        }


        if (
            existingPath
        ) {

            console.warn(

                `Artwork refresh failed; keeping existing cache: ${itemId} / ${artworkType}`

            );


            return toArtworkUrl(
                existingPath
            );

        }


        console.error(

            `Artwork download failed: ${itemId} / ${artworkType}`,

            error

        );


        return null;
    }
}


/*
    ========================================================
    AUTOMATIC ARTWORK SOURCES
    ========================================================

    Most artwork providers are resolved by the renderer's
    metadata service.

    Startup preload happens in the Electron main process,
    so providers that have automatic artwork URLs need to
    be available here too.

    Minecraft is currently the first provider using this
    startup path.

    These URLs intentionally match the working Minecraft
    artwork sources in services/metadata.js.
*/

function getAutomaticArtworkSource(
    itemId,
    artworkType
) {

    try {

        const metadata =
            readConfigFile(
                "metadata.json"
            );

        const item =
            metadata.items?.[
                itemId
            ];

        if (
            !item
        ) {

            return null;

        }

        /*
            If metadata.json has an explicit artwork URL,
            use it first.
        */

        const directArtwork =
            item.artwork?.[
                artworkType
            ];

        if (
            typeof directArtwork ===
            "string" &&
            directArtwork.startsWith(
                "https://"
            )
        ) {

            return directArtwork;

        }

        /*
            Resolve the automatic provider.
        */

        const provider =
            item.artworkProvider;

        if (
            !provider
        ) {

            return null;

        }

        const automaticArtwork = {

            riot: {

                icon:
                    "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/profileicon/685.png",

                logo:
                    "https://cdn.simpleicons.org/leagueoflegends"

            },

            xbox: {

                icon:
                    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/xbox.png",

                logo:
                    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/xbox.png"

            },

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

            retroarch: {

                icon:
                    "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/logo.png",

                logo:
                    "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/retroarch-plain-logo.png",

                background:
                    "https://raw.githubusercontent.com/libretro/retroarch-assets/master/branding/retroarch_bg.png"

            },

            plutonium: {

                icon:
                    "https://img.icons8.com/?size=256&id=qXMTtlmpNgp7&format=png",

                logo:
                    "https://img.icons8.com/?size=256&id=qXMTtlmpNgp7&format=png"

            },

            spotify: {

                icon:
                    "https://cdn.simpleicons.org/spotify",

                logo:
                    "https://cdn.simpleicons.org/spotify"

            },

            chatgpt: {

                icon:
                    "https://cdn.simpleicons.org/openai",

                logo:
                    "https://cdn.simpleicons.org/openai"

            },

            portainer: {

                icon:
                    "https://cdn.simpleicons.org/portainer",

                logo:
                    "https://cdn.simpleicons.org/portainer"

            },

            grafana: {

                icon:
                    "https://cdn.simpleicons.org/grafana",

                logo:
                    "https://cdn.simpleicons.org/grafana"

            },

            "uptime-kuma": {

                icon:
                    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/uptime-kuma.png",

                logo:
                    "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/uptime-kuma.png"

            }

        };

        return (
            automaticArtwork[
                provider
            ]?.[
                artworkType
            ] ||
            null
        );

    }

    catch (
        error
    ) {

        console.error(
            "Failed to resolve automatic artwork source:",
            error
        );

        return null;

    }

}


/*
    ========================================================
    GET GENERAL ARTWORK SOURCE
    ========================================================
*/

async function getConfiguredArtworkSource(
    itemId,
    artworkType
) {

    try {

        const metadata =
            readConfigFile(
                "metadata.json"
            );


        const item =
            metadata.items?.[
                itemId
            ];


        if (
            !item
        ) {

            /*
                Even if metadata.json does not contain an
                explicit URL, try an automatic provider.
            */

            return getAutomaticArtworkSource(
                itemId,
                artworkType
            );

        }


        const artworkSources =
            item.sources?.artwork;


        if (
            artworkSources
        ) {

            const source =
                artworkSources[
                    artworkType
                ];


            if (
                typeof source ===
                "string" &&
                source.startsWith(
                    "https://"
                )
            ) {

                return source;

            }


            if (
                source?.url &&
                typeof source.url ===
                "string"
            ) {

                return source.url;

            }

        }


        const directArtwork =
            item.artwork?.[
                artworkType
            ];


        if (
            typeof directArtwork ===
            "string" &&
            directArtwork.startsWith(
                "https://"
            )
        ) {

            return directArtwork;

        }


        if (
            item.artworkProfile ===
            "thegamesdb"
        ) {

            const settings =
                readSettingsFile();


            const apiKey =
                settings.thegamesdb?.apiKey;


            if (
                !apiKey
            ) {

                console.warn(
                    "TheGamesDB artwork requested, but no API key is configured."
                );

                return null;

            }


            return await getTheGamesDBArtwork(
                apiKey,
                item,
                artworkType
            );

        }


        /*
            Nothing explicit was configured.

            Try an automatic provider before giving up.
        */

        return getAutomaticArtworkSource(
            itemId,
            artworkType
        );

    }

    catch (
        error
    ) {

        console.error(
            "Failed to resolve artwork source:",
            error
        );


        return null;

    }

}


/*
    ========================================================
    GENERAL ARTWORK IPC
    ========================================================
*/


/*
    Unified renderer artwork manifest.

    The main process is the only artwork downloader. The
    renderer receives only persistent local file URLs.
*/

function findUniversalCachedArtworkFile(
    itemId,
    artworkType,
    preferSteam = false
) {

    const names =
        artworkType === "cover"
            ? ["cover", "grid", "capsule"]
            : [artworkType];

    const roots = preferSteam
        ? [
            getSteamArtworkDirectory(itemId),
            getArtworkDirectory(itemId)
        ]
        : [
            getArtworkDirectory(itemId),
            getSteamArtworkDirectory(itemId)
        ];

    for (const root of roots) {

        for (const name of names) {

            for (const extension of [
                ".png",
                ".jpg",
                ".jpeg",
                ".webp",
                ".svg"
            ]) {

                const filePath =
                    path.join(
                        root,
                        name + extension
                    );

                if (fs.existsSync(filePath)) {
                    return filePath;
                }

            }

        }

    }

    return null;
}


function buildRendererArtworkManifest() {

    let categories = {};
    let metadataConfig = {};

    try {
        categories =
            readConfigFile("categories.json");
    }
    catch (error) {
        console.error(
            "Could not read categories.json for artwork manifest:",
            error
        );
    }

    try {
        metadataConfig =
            readConfigFile("metadata.json");
    }
    catch (error) {
        console.error(
            "Could not read metadata.json for artwork manifest:",
            error
        );
    }

    const itemIds = [
        ...collectConfiguredItemIds(categories),
        ...Object.keys(metadataConfig.items || {})
    ];

    const manifest = {};

    /*
        Category chrome has its own manifest section.
    */

    manifest.__categories = {};

    for (
        const categoryName
        of Object.keys(categories)
    ) {

        const categoryIconDirectory =
            getCategoryIconDirectory();

        const categoryIconPath =
            path.join(
                categoryIconDirectory,
                getCategoryIconFileName(
                    categoryName
                )
            );

        manifest.__categories[categoryName] =
            fs.existsSync(categoryIconPath)
                ? toArtworkUrl(categoryIconPath)
                : null;

    }

    /*
        Build an item lookup from categories so local item
        icons are also part of the startup-ready manifest.
    */

    const localItemIcons = {};

    function collectLocalItemIcons(value) {

        if (Array.isArray(value)) {

            for (const entry of value) {
                collectLocalItemIcons(entry);
            }

            return;

        }

        if (!value || typeof value !== "object") {
            return;
        }

        if (
            typeof value.id === "string" &&
            typeof value.icon === "string" &&
            value.icon.startsWith("assets/")
        ) {

            const localIconPath =
                path.join(
                    __dirname,
                    "ui",
                    value.icon
                );

            /*
                Only expose local artwork that actually exists.

                categories.json can contain an icon reference for
                an item before the corresponding asset is added.
                Publishing that path into the renderer manifest
                causes Chromium to request the missing file every
                time the item is refreshed.
            */

            if (fs.existsSync(localIconPath)) {

                localItemIcons[value.id] =
                    toArtworkUrl(
                        localIconPath
                    );

            }

        }

        for (const child of Object.values(value)) {
            if (
                child &&
                typeof child === "object"
            ) {
                collectLocalItemIcons(child);
            }
        }

    }

    collectLocalItemIcons(categories);

    for (const itemId of new Set(itemIds)) {

        manifest[itemId] = {};

        for (const artworkType of UNIVERSAL_ARTWORK_TYPES) {

            const isSteam =
                Boolean(
                    metadataConfig.items?.[
                        itemId
                    ]?.sources?.steam?.appId
                );

            const filePath =
                findUniversalCachedArtworkFile(
                    itemId,
                    artworkType,
                    isSteam
                );

            manifest[itemId][artworkType] =
                filePath
                    ? toArtworkUrl(filePath)
                    : null;
        }

        /*
            A configured local icon is a legitimate universal
            icon source even when no provider artwork exists.
        */

        if (
            !manifest[itemId].icon &&
            localItemIcons[itemId]
        ) {

            manifest[itemId].icon =
                localItemIcons[itemId];

        }

    }

    return manifest;
}


ipcMain.handle(
    "get-artwork-manifest",
    async event => {

        requireTrustedRenderer(event);

        /*
            Never make the renderer wait for network artwork.

            The startup preload continues in the main process and
            warms the persistent cache in the background. The
            renderer gets the cache that exists right now and can
            resolve a selected item's artwork later without blocking
            the XMB boot sequence.
        */

        return buildRendererArtworkManifest();

    }
);


ipcMain.handle(
    "get-artwork",
    async (
        event,
        itemId,
        artworkType = "logo",
        artworkSource = null
    ) => {

        requireTrustedRenderer(event);

        try {

            if (
                !itemId
            ) {

                throw new Error(
                    "Artwork item ID is required."
                );
            }


            if (
                !artworkType
            ) {

                artworkType =
                    "logo";
            }


            const requestedArtworkType =
                String(artworkType);

            const normalizedArtworkType =
                requestedArtworkType === "grid" ||
                requestedArtworkType === "capsule"
                    ? "cover"
                    : requestedArtworkType;

            const supportedArtworkTypes = [
                ...UNIVERSAL_ARTWORK_TYPES
            ];


            if (
                !supportedArtworkTypes.includes(
                    normalizedArtworkType
                )
            ) {

                throw new Error(
                    `Unsupported artwork type: ${artworkType}`
                );
            }

            artworkType =
                normalizedArtworkType;


            let artworkUrl =
                null;


            if (
                typeof artworkSource ===
                    "string" &&
                artworkSource.startsWith(
                    "https://"
                )
            ) {

                artworkUrl =
                    artworkSource;

            }
            else if (
                artworkSource?.url &&
                typeof artworkSource.url ===
                    "string" &&
                artworkSource.url.startsWith(
                    "https://"
                )
            ) {

                artworkUrl =
                    artworkSource.url;

            }


            if (
                !artworkUrl
            ) {

                artworkUrl =
                    await getConfiguredArtworkSource(
                        String(
                            itemId
                        ),
                        String(
                            artworkType
                        )
                    );

            }


            if (
                !artworkUrl
            ) {

                return {

                    success:
                        false,

                    error:
                        "No artwork source is configured."
                };
            }


            const cachedArtwork =
                await downloadAndCacheArtwork(
                    String(
                        itemId
                    ),
                    String(
                        artworkType
                    ),
                    artworkUrl
                );


            if (
                !cachedArtwork
            ) {

                return {

                    success:
                        false,

                    error:
                        "Artwork could not be downloaded."
                };
            }


            return {

                success:
                    true,

                data:
                    cachedArtwork

            };

        }
        catch (
            error
        ) {

            console.error(
                "General artwork request failed:",
                error
            );


            return {

                success:
                    false,

                error:
                    error.message

            };
        }
    }
);


/*
    ========================================================
    STEAM ARTWORK
    ========================================================
*/

const STEAM_ARTWORK_CACHE_VERSION =
    "6";


function getSteamArtworkDirectory(
    itemId
) {

    return path.join(

        app.getPath(
            "userData"
        ),

        "artwork",

        "steam",

        String(
            itemId
        )

    );

}


function getSteamArtworkCacheVersionPath(
    itemId
) {

    return path.join(

        getSteamArtworkDirectory(
            itemId
        ),

        "cache-version.txt"

    );

}


function getSteamArtworkCacheVersion(
    itemId
) {

    const versionPath =
        getSteamArtworkCacheVersionPath(
            itemId
        );


    if (
        !fs.existsSync(
            versionPath
        )
    ) {

        return null;

    }


    try {

        return fs.readFileSync(
            versionPath,
            "utf8"
        ).trim();

    }
    catch (
        error
    ) {

        return null;

    }

}


function setSteamArtworkCacheVersion(
    itemId
) {

    const artworkDirectory =
        getSteamArtworkDirectory(
            itemId
        );


    fs.mkdirSync(
        artworkDirectory,
        {
            recursive:
                true
        }
    );


    fs.writeFileSync(

        getSteamArtworkCacheVersionPath(
            itemId
        ),

        STEAM_ARTWORK_CACHE_VERSION,

        "utf8"

    );

}


function getSteamArtworkMetadataPath(
    itemId
) {

    return path.join(

        getSteamArtworkDirectory(
            itemId
        ),

        "cache-meta.json"

    );

}


function readSteamArtworkMetadata(
    itemId
) {

    const metadataPath =
        getSteamArtworkMetadataPath(
            itemId
        );


    if (
        !fs.existsSync(
            metadataPath
        )
    ) {

        return {};

    }


    try {

        return JSON.parse(

            fs.readFileSync(

                metadataPath,

                "utf8"

            )

        );

    }
    catch (
        error
    ) {

        return {};

    }

}


function writeSteamArtworkMetadata(
    itemId,
    metadata
) {

    const directory =
        getSteamArtworkDirectory(
            itemId
        );


    fs.mkdirSync(

        directory,

        {
            recursive:
                true
        }

    );


    fs.writeFileSync(

        getSteamArtworkMetadataPath(
            itemId
        ),

        JSON.stringify(
            metadata,
            null,
            4
        ),

        "utf8"

    );

}


function isSteamArtworkFresh(
    metadata,
    artworkType,
    artworkUrl
) {

    const entry =
        metadata?.[
            artworkType
        ];


    if (
        !entry
    ) {

        return false;

    }


    if (
        entry.url !==
        artworkUrl
    ) {

        return false;

    }


    if (
        !entry.checkedAt
    ) {

        return false;

    }


    return (

        Date.now() -
        Number(
            entry.checkedAt
        ) <
        ARTWORK_CACHE_REFRESH_MS

    );

}


function markSteamArtworkChecked(
    itemId,
    artworkType,
    artworkUrl
) {

    const metadata =
        readSteamArtworkMetadata(
            itemId
        );


    metadata[
        artworkType
    ] = {

        url:
            artworkUrl,

        checkedAt:
            Date.now()

    };


    writeSteamArtworkMetadata(

        itemId,

        metadata

    );

}


function clearSteamArtworkCache(
    itemId
) {

    const artworkDirectory =
        getSteamArtworkDirectory(
            itemId
        );


    if (
        fs.existsSync(
            artworkDirectory
        )
    ) {

        fs.rmSync(

            artworkDirectory,

            {
                recursive:
                    true,

                force:
                    true
            }

        );

    }

}


function getSteamArtworkFilePath(
    itemId,
    artworkType,
    extension = ".png"
) {

    return path.join(

        getSteamArtworkDirectory(
            itemId
        ),

        `${artworkType}${extension}`

    );

}


function findExistingSteamArtworkFile(
    itemId,
    artworkType
) {

    const extensions = [

        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg"

    ];


    for (
        const extension
        of extensions
    ) {

        const filePath =
            getSteamArtworkFilePath(

                itemId,

                artworkType,

                extension

            );


        if (
            fs.existsSync(
                filePath
            )
        ) {

            return filePath;

        }

    }


    return null;

}


async function cacheSteamArtwork(
    itemId,
    metadata,
    forceRefresh = false
) {

    if (
        !itemId ||
        !metadata ||
        !metadata.artwork
    ) {

        return null;

    }


    const artworkDirectory =
        getSteamArtworkDirectory(
            itemId
        );


    fs.mkdirSync(

        artworkDirectory,

        {
            recursive:
                true
        }

    );


    const artwork =
        metadata.artwork;


    const artworkCandidates =
        metadata.artworkCandidates ||
        {};


    const cachedArtwork =
        {};


    const artworkTypes = [

        "icon",
        "logo",
        "cover",
        "grid",
        "hero",
        "capsule",
        "background"

    ];


    let cacheMetadata =
        readSteamArtworkMetadata(
            itemId
        );


    for (
        const artworkType
        of artworkTypes
    ) {

        const candidates = [

            ...(Array.isArray(
                artworkCandidates[
                    artworkType
                ]
            )
                ? artworkCandidates[
                    artworkType
                ]
                : []),

            artwork[
                artworkType
            ]

        ].filter(
            Boolean
        );


        const uniqueUrls =
            [
                ...new Set(
                    candidates
                )
            ];


        if (
            uniqueUrls.length ===
            0
        ) {

            continue;

        }


        const existingPath =
            findExistingSteamArtworkFile(

                itemId,

                artworkType

            );


        if (
            !forceRefresh &&
            existingPath
        ) {

            const existingMetadata =
                cacheMetadata[
                    artworkType
                ];


            if (
                existingMetadata &&
                uniqueUrls.includes(
                    existingMetadata.url
                ) &&
                isSteamArtworkFresh(

                    cacheMetadata,

                    artworkType,

                    existingMetadata.url

                )
            ) {

                cachedArtwork[
                    artworkType
                ] =
                    toArtworkUrl(
                        existingPath
                    );


                continue;

            }

        }


        let downloaded =
            false;


        for (
            const artworkUrl
            of uniqueUrls
        ) {

            const temporaryPath =
                path.join(

                    artworkDirectory,

                    `${artworkType}.download`

                );


            try {

                if (
                    fs.existsSync(
                        temporaryPath
                    )
                ) {

                    fs.unlinkSync(
                        temporaryPath
                    );

                }


                console.log(

                    `Trying Steam artwork: ${itemId} / ${artworkType}`,

                    artworkUrl

                );


                const result =
                    await downloadFile(

                        artworkUrl,

                        temporaryPath

                    );


                const extension =
                    getArtworkExtension(

                        result.contentType,

                        artworkUrl

                    );


                const destination =
                    getSteamArtworkFilePath(

                        itemId,

                        artworkType,

                        extension

                    );


                if (
                    existingPath &&
                    existingPath !== destination &&
                    fs.existsSync(
                        existingPath
                    )
                ) {

                    fs.unlinkSync(
                        existingPath
                    );

                }


                if (
                    fs.existsSync(
                        destination
                    )
                ) {

                    fs.unlinkSync(
                        destination
                    );

                }


                fs.renameSync(

                    temporaryPath,

                    destination

                );


                cachedArtwork[
                    artworkType
                ] =
                    toArtworkUrl(
                        destination
                    );


                cacheMetadata[
                    artworkType
                ] = {

                    url:
                        artworkUrl,

                    checkedAt:
                        Date.now()

                };


                console.log(

                    `Steam artwork cached/refreshed: ${itemId} / ${artworkType}`,

                    artworkUrl

                );


                downloaded =
                    true;


                break;

            }

            catch (
                error
            ) {

                if (
                    fs.existsSync(
                        temporaryPath
                    )
                ) {

                    fs.unlinkSync(
                        temporaryPath
                    );

                }


                console.warn(

                    `Steam artwork candidate failed: ${itemId} / ${artworkType}`,

                    artworkUrl,

                    error.message

                );

            }

        }


        if (
            !downloaded &&
            existingPath &&
            fs.existsSync(
                existingPath
            )
        ) {

            cachedArtwork[
                artworkType
            ] =
                toArtworkUrl(
                    existingPath
                );


            console.warn(

                `Steam artwork refresh failed; keeping existing cache: ${itemId} / ${artworkType}`

            );

        }

    }


    /*
        ====================================================
        SAFE ARTWORK ALIASES
        ====================================================
    */

    if (
        !cachedArtwork.grid &&
        cachedArtwork.cover
    ) {

        cachedArtwork.grid =
            cachedArtwork.cover;

    }


    if (
        !cachedArtwork.capsule &&
        cachedArtwork.cover
    ) {

        cachedArtwork.capsule =
            cachedArtwork.cover;

    }


    if (
        !cachedArtwork.background &&
        cachedArtwork.hero
    ) {

        cachedArtwork.background =
            cachedArtwork.hero;

    }


    if (
        !cachedArtwork.hero &&
        cachedArtwork.background
    ) {

        cachedArtwork.hero =
            cachedArtwork.background;

    }


    writeSteamArtworkMetadata(

        itemId,

        cacheMetadata

    );


    return cachedArtwork;

}


async function getExistingSteamArtwork(
    itemId
) {

    if (
        !itemId
    ) {

        return null;

    }


    const artworkDirectory =
        getSteamArtworkDirectory(
            itemId
        );


    if (
        !fs.existsSync(
            artworkDirectory
        )
    ) {

        return null;

    }


    const artworkTypes = [

        "icon",
        "logo",
        "cover",
        "grid",
        "hero",
        "capsule",
        "background"

    ];


    const artwork =
        {};


    let foundArtwork =
        false;


    for (
        const artworkType
        of artworkTypes
    ) {

        const filePath =
            findExistingSteamArtworkFile(

                itemId,

                artworkType

            );


        if (
            filePath
        ) {

            artwork[
                artworkType
            ] =
                toArtworkUrl(
                    filePath
                );


            foundArtwork =
                true;

        }

    }


    if (
        !foundArtwork
    ) {

        return null;

    }


    return artwork;

}


ipcMain.handle(

    "steam-get-artwork",

    async (

        event,

        appId,

        itemId

    ) => {

        requireTrustedRenderer(event);

        try {

            if (
                !appId ||
                !itemId
            ) {

                throw new Error(

                    "Steam artwork requires an App ID and item ID."

                );

            }


            const cacheVersion =
                getSteamArtworkCacheVersion(
                    itemId
                );


            const cacheNeedsRefresh =
                cacheVersion !==
                STEAM_ARTWORK_CACHE_VERSION;


            let existingArtwork =
                await getExistingSteamArtwork(

                    itemId

                );


            const rawData =
                await fetchSteamStoreMetadata(

                    appId

                );


            const metadata =
                normalizeSteamMetadata(

                    rawData

                );


            if (
                !metadata
            ) {

                return {

                    success:
                        true,

                    data:
                        existingArtwork ||

                        {}

                };

            }


            if (
                cacheNeedsRefresh
            ) {

                console.log(

                    `Refreshing Steam artwork cache version: ${itemId}`

                );


                clearSteamArtworkCache(

                    itemId

                );


                existingArtwork =
                    null;

            }


            const artwork =
                await cacheSteamArtwork(

                    itemId,

                    metadata,

                    false

                );


            const combinedArtwork = {

                ...(existingArtwork || {}),

                ...(artwork || {})

            };


            setSteamArtworkCacheVersion(

                itemId

            );


            return {

                success:
                    true,

                data:
                    combinedArtwork

            };

        }

        catch (
            error
        ) {

            console.error(

                "Steam artwork request failed:",

                error

            );


            return {

                success:
                    false,

                error:
                    error.message

            };

        }

    }

);


/*
    ========================================================
    STARTUP ARTWORK PRELOAD
    ========================================================

    This is the new part.

    The renderer normally downloads artwork when you move
    onto an item.

    That works, but it means the first time you visit a game
    there can be a short delay.

    The startup preloader solves that by warming the existing
    persistent artwork cache while the XMB is already opening.

    The UI does NOT wait for this process.
*/


function getArtworkTypesForPreload(
    itemId
) {

    return [
        ...UNIVERSAL_ARTWORK_TYPES
    ];

}


/*
    Recursively search categories.json for item IDs.

    This means the preload system does not need a hard-coded
    list of every game in the launcher.
*/

function collectConfiguredItemIds(
    value,
    itemIds = new Set()
) {

    if (
        Array.isArray(
            value
        )
    ) {

        for (
            const entry
            of value
        ) {

            collectConfiguredItemIds(
                entry,
                itemIds
            );

        }

        return itemIds;

    }


    if (
        !value ||
        typeof value !==
            "object"
    ) {

        return itemIds;

    }


    /*
        A Personal XMB item is identified by its "id".
    */

    if (
        typeof value.id ===
            "string" &&
        value.id.trim()
    ) {

        itemIds.add(
            value.id
        );

    }


    for (
        const child
        of Object.values(
            value
        )
    ) {

        if (
            child &&
            typeof child ===
                "object"
        ) {

            collectConfiguredItemIds(
                child,
                itemIds
            );

        }

    }


    return itemIds;

}


/*
    Determine whether a configured item is a Steam item.
*/

function getSteamAppIdForItem(
    itemId,
    metadataItems
) {

    const item =
        metadataItems[
            itemId
        ];


    if (
        !item
    ) {

        return null;

    }


    const appId =
        item.sources?.steam?.appId;


    if (
        appId
    ) {

        return String(
            appId
        );

    }


    return null;

}


/*
    Preload one general artwork item.

    Existing cache files are respected.
*/

async function preloadGeneralArtworkItem(
    itemId
) {

    const artworkTypes =
        getArtworkTypesForPreload(
            itemId
        );


    let downloadedAnything =
        false;


    for (
        const artworkType
        of artworkTypes
    ) {

        const source =
            await getConfiguredArtworkSource(

                itemId,

                artworkType

            );


        if (
            !source
        ) {

            continue;

        }


        const existingPath =
            findExistingArtworkFile(

                itemId,

                artworkType

            );


        const metadata =
            readArtworkCacheMetadata(
                itemId
            );


        /*
            If the cache is already fresh, do absolutely
            nothing.

            This is what makes subsequent launches fast.
        */

        if (
            existingPath &&
            isArtworkCacheFresh(

                metadata,

                artworkType,

                source

            )
        ) {

            continue;

        }


        const result =
            await downloadAndCacheArtwork(

                itemId,

                artworkType,

                source,

                false

            );


        if (
            result
        ) {

            downloadedAnything =
                true;

        }

    }


    return downloadedAnything;

}


/*
    Preload one Steam item.

    Steam has its own cache and candidate/fallback system,
    so we reuse cacheSteamArtwork instead of creating a
    second Steam downloader.
*/

async function preloadSteamArtworkItem(
    itemId,
    appId
) {

    if (
        !itemId ||
        !appId
    ) {

        return;

    }


    try {

        const cacheVersion =
            getSteamArtworkCacheVersion(
                itemId
            );


        const cacheNeedsRefresh =
            cacheVersion !==
            STEAM_ARTWORK_CACHE_VERSION;


        if (
            cacheNeedsRefresh
        ) {

            console.log(

                `Startup: refreshing Steam artwork cache version for ${itemId}`

            );


            clearSteamArtworkCache(
                itemId
            );

        }


        const rawData =
            await fetchSteamStoreMetadata(
                appId
            );


        const metadata =
            normalizeSteamMetadata(
                rawData
            );


        if (
            !metadata
        ) {

            console.warn(

                `Startup: Steam metadata unavailable for ${itemId}`

            );


            return;

        }


        await cacheSteamArtwork(

            itemId,

            metadata,

            false

        );


        setSteamArtworkCacheVersion(
            itemId
        );


    }
    catch (
        error
    ) {

        /*
            A Steam artwork failure should never prevent
            the launcher from starting.
        */

        console.warn(

            `Startup: Steam artwork preload failed for ${itemId}:`,

            error.message

        );

    }

}


/*
    Run a small number of preload jobs at once.

    This is intentionally simple and beginner-friendly.
*/

async function runArtworkPreloadQueue(
    jobs
) {

    let nextIndex =
        0;


    async function worker() {

        while (
            true
        ) {

            const currentIndex =
                nextIndex;


            nextIndex +=
                1;


            if (
                currentIndex >=
                jobs.length
            ) {

                return;

            }


            const job =
                jobs[
                    currentIndex
                ];


            try {

                await job();

            }
            catch (
                error
            ) {

                console.warn(

                    "Startup artwork preload job failed:",

                    error.message

                );

            }

        }

    }


    const workerCount =
        Math.min(

            ARTWORK_PRELOAD_CONCURRENCY,

            jobs.length

        );


    const workers = [];


    for (
        let index = 0;
        index < workerCount;
        index++
    ) {

        workers.push(
            worker()
        );

    }


    await Promise.all(
        workers
    );

}


/*
    Preload one category icon during startup.

    Category icons are part of the XMB chrome, so they should
    be ready before the category bar is first displayed.
*/

async function preloadCategoryIconOnStartup(
    categoryName,
    categoryData
) {

    const iconUrl =
        getCategoryIconUrl(
            categoryName,
            categoryData
        );

    if (!iconUrl) {
        return;
    }

    const directory =
        ensureCategoryIconDirectory();

    const localPath =
        path.join(
            directory,
            getCategoryIconFileName(
                categoryName
            )
        );

    if (fs.existsSync(localPath)) {
        return;
    }

    try {

        await downloadCategoryIcon(
            iconUrl,
            localPath
        );

        console.log(
            `Startup category icon cached: ${categoryName}`
        );

    }
    catch (error) {

        console.warn(
            `Startup category icon preload failed: ${categoryName}`,
            error.message
        );

    }

}


/*
    Main startup preload function.
*/

async function preloadArtworkOnStartup() {

    console.log(
        "Starting artwork cache preload..."
    );


    let categories;


    let metadataConfig;


    try {

        categories =
            readConfigFile(
                "categories.json"
            );

    }
    catch (
        error
    ) {

        console.error(

            "Startup artwork preload could not read categories.json:",

            error

        );


        return;

    }


    try {

        metadataConfig =
            readConfigFile(
                "metadata.json"
            );

    }
    catch (
        error
    ) {

        console.error(

            "Startup artwork preload could not read metadata.json:",

            error

        );


        return;

    }


    const metadataItems =
        metadataConfig.items ||
        {};


    const itemIds =
        [
            ...collectConfiguredItemIds(
                categories
            )
        ];


    /*
        Also include anything present in metadata.json.

        This protects artwork for items that are configured
        in metadata but are temporarily hidden from a category.
    */

    for (
        const itemId
        of Object.keys(
            metadataItems
        )
    ) {

        itemIds.push(
            itemId
        );

    }


    const uniqueItemIds =
        [
            ...new Set(
                itemIds
            )
        ];


    if (
        uniqueItemIds.length ===
        0
    ) {

        console.log(

            "Startup artwork preload found no configured items."

        );


        return;

    }


    console.log(

        `Startup artwork preload found ${uniqueItemIds.length} item(s).`

    );


    const jobs = [];


    /*
        Category icons are preloaded alongside item artwork.
    */

    for (
        const [
            categoryName,
            categoryData
        ]
        of Object.entries(
            categories
        )
    ) {

        jobs.push(

            async () => {

                await preloadCategoryIconOnStartup(
                    categoryName,
                    categoryData
                );

            }

        );

    }


    for (
        const itemId
        of uniqueItemIds
    ) {

        const steamAppId =
            getSteamAppIdForItem(

                itemId,

                metadataItems

            );


        if (
            steamAppId
        ) {

            jobs.push(

                async () => {

                    console.log(

                        `Startup artwork preload: Steam / ${itemId}`

                    );


                    await preloadSteamArtworkItem(

                        itemId,

                        steamAppId

                    );

                }

            );


            continue;

        }


        jobs.push(

            async () => {

                console.log(

                    `Startup artwork preload: ${itemId}`

                );


                await preloadGeneralArtworkItem(

                    itemId

                );

            }

        );

    }


    await runArtworkPreloadQueue(
        jobs
    );


    console.log(
        "Startup artwork cache preload complete."
    );

}


/*
    ========================================================
    RIOT CLIENT
    ========================================================
*/

function findRiotClient() {

    const possiblePaths = process.platform === "win32"
        ? [
            path.join(
                process.env.ProgramFiles || "",
                "Riot Games",
                "Riot Client",
                "RiotClientServices.exe"
            ),
            path.join(
                process.env["ProgramFiles(x86)"] || "",
                "Riot Games",
                "Riot Client",
                "RiotClientServices.exe"
            ),
            path.join(
                process.env.LOCALAPPDATA || "",
                "Riot Games",
                "Riot Client",
                "RiotClientServices.exe"
            )
        ]
        : [];


    for (
        const filePath
        of possiblePaths
    ) {

        if (
            fs.existsSync(
                filePath
            )
        ) {

            return filePath;
        }
    }


    return null;
}


/*
    ========================================================
    APPLICATION CONTROL
    ========================================================
*/

ipcMain.handle(
    "quit-app",
    async event => {

        requireTrustedRenderer(event);

        /*
            Keep quitting in the main process so the renderer
            never needs direct access to Electron's app module.
        */

        app.quit();

        return {
            success:
                true
        };

    }
);


/*
    ========================================================
    EXTERNAL LINKS
    ========================================================
*/

ipcMain.handle(
    "open-external",
    async (
        event,
        url
    ) => {

        requireTrustedRenderer(event);

        if (!url) {

            return false;
        }


        const parsedUrl =
            new URL(
                String(url)
            );

        if (
            ![
                "https:",
                "spotify:",
                "steam:",
                "msxbox:"
            ].includes(
                parsedUrl.protocol
            )
        ) {
            throw new Error(
                "External URL protocol is not allowed."
            );
        }

        await shell.openExternal(
            parsedUrl.toString()
        );


        return true;
    }
);


/*
    ========================================================
    SPOTIFY DESKTOP LAUNCHER
    ========================================================

    Spotify playback is handled by the installed Spotify
    desktop application. XMB controls Spotify through the
    Spotify Web API while this helper makes sure the real
    Spotify client is running in the background.

    Windows:
        Supports common per-user and system install paths.

    macOS:
        Uses the Spotify application bundle.

    The launcher deliberately does not kill or restart an
    existing Spotify process.
*/

function getSpotifyExecutable() {

    if (process.platform === "win32") {

        const candidates = [
            path.join(
                process.env.APPDATA || "",
                "Spotify",
                "Spotify.exe"
            ),

            path.join(
                process.env.LOCALAPPDATA || "",
                "Spotify",
                "Spotify.exe"
            ),

            path.join(
                process.env.ProgramFiles || "",
                "Spotify",
                "Spotify.exe"
            ),

            path.join(
                process.env["ProgramFiles(x86)"] || "",
                "Spotify",
                "Spotify.exe"
            )
        ];

        for (const candidate of candidates) {

            if (
                candidate &&
                fs.existsSync(candidate)
            ) {

                return candidate;

            }

        }

        return null;

    }


    if (process.platform === "darwin") {

        const candidate =
            "/Applications/Spotify.app/Contents/MacOS/Spotify";

        if (
            fs.existsSync(candidate)
        ) {

            return candidate;

        }

    }


    return null;

}


function isSpotifyRunning() {

    return new Promise(
        resolve => {

            if (process.platform === "win32") {

                const checker =
                    spawn(
                        "tasklist",
                        [
                            "/FI",
                            "IMAGENAME eq Spotify.exe"
                        ],
                        {
                            windowsHide: true,
                            stdio: [
                                "ignore",
                                "pipe",
                                "ignore"
                            ]
                        }
                    );

                let output = "";

                checker.stdout.on(
                    "data",
                    chunk => {

                        output +=
                            chunk.toString();

                    }
                );

                checker.on(
                    "close",
                    () => {

                        resolve(
                            output
                                .toLowerCase()
                                .includes("spotify.exe")
                        );

                    }
                );

                checker.on(
                    "error",
                    () => {

                        resolve(false);

                    }
                );

                return;

            }


            if (process.platform === "darwin") {

                const checker =
                    spawn(
                        "pgrep",
                        [
                            "-x",
                            "Spotify"
                        ],
                        {
                            stdio: "ignore"
                        }
                    );

                checker.on(
                    "close",
                    code => {

                        resolve(
                            code === 0
                        );

                    }
                );

                checker.on(
                    "error",
                    () => {

                        resolve(false);

                    }
                );

                return;

            }


            resolve(false);

        }
    );

}


async function launchSpotifyDesktop() {

    if (await isSpotifyRunning()) {
        return {
            success:true,
            alreadyRunning:true
        };
    }

    if (process.platform==="win32") {

        const executable=getSpotifyExecutable();

        if (executable) {
            const launched=await new Promise(resolve=>{
                let settled=false;

                const finish=value=>{
                    if(settled)return;
                    settled=true;
                    resolve(value);
                };

                try{
                    /*
                        Spotify accepts --minimized, but some Windows
                        builds still create a visible window. Starting
                        through the fixed executable with the Windows
                        minimize flag gives those builds a second,
                        non-shell path to honor the request.
                    */
                    const child=spawn(
                        executable,
                        ["--minimized"],
                        {
                            detached:true,
                            windowsHide:true,
                            stdio:"ignore"
                        }
                    );

                    child.once("error",()=>finish(false));
                    child.once("spawn",()=>finish(true));
                }catch(error){
                    finish(false);
                }
            });

            if(launched){
                return {
                    success:true,
                    alreadyRunning:false,
                    launchedByExecutable:true,
                    minimizedRequested:true
                };
            }
        }

        /*
            Store installations and managed installs may not expose
            Spotify.exe in a normal filesystem location. Let Windows
            resolve the registered Spotify URI in that case.
        */
        try{
            await shell.openExternal("spotify:");
            return {
                success:true,
                alreadyRunning:false,
                launchedByProtocol:true
            };
        }catch(error){
            throw new Error(
                "Spotify could not be launched. Install the Spotify desktop app or register the spotify: URI with Windows."
            );
        }
    }

    if(process.platform==="darwin"){

        const executable=getSpotifyExecutable();

        if(!executable){
            try{
                await shell.openExternal("spotify:");
                return {
                    success:true,
                    alreadyRunning:false,
                    launchedByProtocol:true
                };
            }catch(error){
                throw new Error("Spotify desktop application could not be found.");
            }
        }

        const launched=await new Promise(resolve=>{
            let settled=false;

            const finish=value=>{
                if(settled)return;
                settled=true;
                resolve(value);
            };

            try{
                const child=spawn(
                    executable,
                    [],
                    {
                        detached:true,
                        stdio:"ignore"
                    }
                );

                child.once("error",()=>finish(false));
                child.once("spawn",()=>finish(true));
            }catch(error){
                finish(false);
            }
        });

        if(launched){
            return {
                success:true,
                alreadyRunning:false,
                launchedByExecutable:true
            };
        }

        throw new Error("Spotify desktop application could not be launched.");
    }

    throw new Error(
        "Spotify desktop launching is currently supported on Windows and macOS."
    );
}


ipcMain.handle(
    "spotify-launch-desktop",
    async event => {

        requireTrustedRenderer(event);

        try {

            return await launchSpotifyDesktop();

        }
        catch (error) {

            console.error(
                "Spotify desktop launch failed:",
                error
            );

            return {
                success: false,
                error:
                    error?.message ||
                    "Unable to launch Spotify."
            };

        }

    }
);


/*
    ========================================================
    LAUNCH ITEMS
    ========================================================
*/

ipcMain.handle(
    "launch-item",
    async (
        event,
        item
    ) => {

        requireTrustedRenderer(event);

        if (
            !item ||
            typeof item !== "object"
        ) {

            return {

                success:
                    false,

                error:
                    "No launch item provided."
            };
        }


        try {

            if (
                item.launchType ===
                "steam"
            ) {

                if (
                    !item.steamAppId
                ) {

                    throw new Error(
                        "Steam App ID is missing."
                    );
                }


                await shell.openExternal(
                    `steam://rungameid/${item.steamAppId}`
                );


                return {

                    success:
                        true
                };
            }


            if (
                item.launchType ===
                "riot"
            ) {

                const riotClient =
                    findRiotClient();


                if (
                    !riotClient
                ) {

                    throw new Error(
                        "Riot Client could not be found."
                    );
                }


                spawn(

                    riotClient,

                    [

                        "--launch-product=" +
                            item.riotProduct,

                        "--launch-patchline=" +
                            item.riotPatchline

                    ],

                    {

                        detached:
                            true,

                        stdio:
                            "ignore"
                    }

                ).unref();


                return {

                    success:
                        true
                };
            }


            if (
                item.launchType ===
                "xbox"
            ) {

                await shell.openExternal(

                    item.xboxUri ||
                    "msxbox:"

                );


                return {

                    success:
                        true
                };
            }


            if (
                item.launchType ===
                    "external" ||
                item.launchType ===
                    "url"
            ) {

                if (
                    !item.url
                ) {

                    throw new Error(
                        "External URL is missing."
                    );
                }


                await shell.openExternal(
                    item.url
                );


                return {

                    success:
                        true
                };
            }


            /*
                Arbitrary shell commands are intentionally not supported.

                Renderer-supplied command strings combined with shell:true
                would turn the launcher IPC endpoint into a command-injection
                primitive. If custom commands are added later, they must be
                resolved from a trusted, main-process allowlist instead.
            */

            throw new Error(
                "Unknown launch type."
            );

        }
        catch (
            error
        ) {

            console.error(
                "Failed to launch item:",
                error
            );


            return {

                success:
                    false,

                error:
                    error.message
            };
        }
    }
);


/*
    ========================================================
    SPOTIFY AUTHENTICATION + LOCAL CREDENTIAL STORAGE
    ========================================================

    Spotify client/account identifiers live in the local
    user-data directory and are never part of the repository.

    Access and refresh tokens are encrypted with Electron's
    OS-backed safeStorage API and are never exposed to the
    renderer process.
*/

function createRandomString(
    length = 64
) {

    return crypto
        .randomBytes(
            length
        )
        .toString(
            "base64url"
        )
        .slice(
            0,
            length
        );

}


function createCodeChallenge(
    verifier
) {

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            verifier
        )
        .digest(
            "base64url"
        );

}


async function fetchSpotifyProfile(
    accessToken
) {

    const response =
        await fetch(
            "https://api.spotify.com/v1/me",
            {
                headers: {
                    Authorization:
                        "Bearer " +
                        accessToken
                }
            }
        );

    const data =
        await response.json();

    if (
        !response.ok
    ) {

        throw new Error(
            data.error?.message ||
            `Spotify profile request failed: ${response.status}`
        );

    }

    return data;

}


async function refreshSpotifyToken() {

    const clientId =
        getSpotifyClientId();

    const tokens =
        loadSpotifyTokens();

    if (
        !clientId ||
        !tokens?.refreshToken
    ) {

        return null;

    }

    const body =
        new URLSearchParams({
            grant_type:
                "refresh_token",
            refresh_token:
                tokens.refreshToken,
            client_id:
                clientId
        });

    const response =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method:
                    "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body:
                    body.toString()
            }
        );

    const data =
        await response.json();

    if (
        !response.ok
    ) {

        /*
            invalid_grant means the refresh token is no
            longer usable. Remove the local credential so
            XMB will require a fresh Spotify authorization.
        */

        if (
            response.status === 400 &&
            data.error === "invalid_grant"
        ) {

            clearSpotifyTokens();

        }

        throw new Error(
            data.error_description ||
            data.error ||
            `Spotify token refresh failed: ${response.status}`
        );

    }

    const refreshed = {

        accessToken:
            data.access_token,

        refreshToken:
            data.refresh_token ||
            tokens.refreshToken,

        expiresAt:
            Date.now() +
            (
                Number(
                    data.expires_in || 3600
                ) *
                1000
            ),

        scope:
            typeof data.scope === "string"
                ? data.scope
                : (tokens.scope || "")
    };

    await saveSpotifyTokens(
        refreshed
    );

    return refreshed.accessToken;

}


ipcMain.handle(
    "spotify-login",
    async event => {

        requireTrustedRenderer(event);

        try {

            const clientId =
                getSpotifyClientId();

            if (
                !clientId
            ) {

                throw new Error(
                    "Spotify Client ID is missing. Enter it in Settings > Accounts."
                );

            }

            const verifier =
                createRandomString(
                    64
                );

            const challenge =
                createCodeChallenge(
                    verifier
                );

            const state =
                createRandomString(
                    32
                );

            const redirectUri =
                "http://127.0.0.1:53682/callback";

            const scopes = [
                "streaming",
                "user-read-currently-playing",
                "user-read-playback-state",
                "user-read-recently-played",
                "playlist-read-private",
                "user-read-private",
                "user-modify-playback-state"
            ].join(" ");

            const authorizeUrl =
                new URL(
                    "https://accounts.spotify.com/authorize"
                );

            authorizeUrl.searchParams.set(
                "client_id",
                clientId
            );

            authorizeUrl.searchParams.set(
                "response_type",
                "code"
            );

            authorizeUrl.searchParams.set(
                "redirect_uri",
                redirectUri
            );

            authorizeUrl.searchParams.set(
                "code_challenge_method",
                "S256"
            );

            authorizeUrl.searchParams.set(
                "code_challenge",
                challenge
            );

            authorizeUrl.searchParams.set(
                "scope",
                scopes
            );

            authorizeUrl.searchParams.set(
                "state",
                state
            );

            const server =
                http.createServer(
                    async (
                        request,
                        response
                    ) => {

                        try {

                            const requestUrl =
                                new URL(
                                    request.url,
                                    redirectUri
                                );

                            if (
                                requestUrl.pathname !==
                                "/callback"
                            ) {

                                response.writeHead(
                                    404
                                );

                                response.end(
                                    "Not Found"
                                );

                                return;

                            }

                            const returnedState =
                                requestUrl.searchParams.get(
                                    "state"
                                );

                            if (
                                returnedState !==
                                state
                            ) {

                                response.writeHead(
                                    400
                                );

                                response.end(
                                    "Invalid OAuth state."
                                );

                                server.close();

                                return;

                            }

                            const error =
                                requestUrl.searchParams.get(
                                    "error"
                                );

                            if (
                                error
                            ) {

                                response.writeHead(
                                    400,
                                    {
                                        "Content-Type":
                                            "text/html; charset=utf-8"
                                    }
                                );

                                response.end(
                                    "<h1>Spotify authorization cancelled.</h1>"
                                );

                                server.close();

                                return;

                            }

                            const code =
                                requestUrl.searchParams.get(
                                    "code"
                                );

                            if (
                                !code
                            ) {

                                response.writeHead(
                                    400
                                );

                                response.end(
                                    "Authorization code missing."
                                );

                                server.close();

                                return;

                            }

                            const tokenBody =
                                new URLSearchParams({
                                    client_id:
                                        clientId,
                                    grant_type:
                                        "authorization_code",
                                    code,
                                    redirect_uri:
                                        redirectUri,
                                    code_verifier:
                                        verifier
                                });

                            const tokenResponse =
                                await fetch(
                                    "https://accounts.spotify.com/api/token",
                                    {
                                        method:
                                            "POST",
                                        headers: {
                                            "Content-Type":
                                                "application/x-www-form-urlencoded"
                                        },
                                        body:
                                            tokenBody.toString()
                                    }
                                );

                            const token =
                                await tokenResponse.json();

                            if (
                                !tokenResponse.ok
                            ) {

                                throw new Error(
                                    token.error_description ||
                                    token.error ||
                                    `Spotify token exchange failed: ${tokenResponse.status}`
                                );

                            }

                            const expiresAt =
                                Date.now() +
                                (
                                    Number(
                                        token.expires_in || 3600
                                    ) *
                                    1000
                                );

                            await saveSpotifyTokens({
                                accessToken:
                                    token.access_token,
                                refreshToken:
                                    token.refresh_token,
                                expiresAt,
                                scope:
                                    token.scope || ""
                            });

                            const profile =
                                await fetchSpotifyProfile(
                                    token.access_token
                                );

                            setSpotifyLocalIdentity({
                                clientId,
                                accountId:
                                    profile.account_id ||
                                    "",
                                userId:
                                    profile.id ||
                                    ""
                            });

                            response.writeHead(
                                200,
                                {
                                    "Content-Type":
                                        "text/html; charset=utf-8"
                                }
                            );

                            response.end(
                                "<h1>Spotify connected.</h1><p>You can close this window.</p>"
                            );

                            if (
                                mainWindow &&
                                !mainWindow.isDestroyed()
                            ) {

                                mainWindow.webContents.send(
                                    "spotify-auth-complete"
                                );

                            }

                            server.close();

                        }
                        catch (
                            error
                        ) {

                            console.error(
                                "Spotify callback failed:",
                                error
                            );

                            response.writeHead(
                                500,
                                {
                                    "Content-Type":
                                        "text/html; charset=utf-8"
                                }
                            );

                            response.end(
                                "<h1>Spotify authentication failed.</h1>"
                            );

                            server.close();

                        }

                    }
                );

            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    server.listen(
                        53682,
                        "127.0.0.1",
                        resolve
                    );

                    server.once(
                        "error",
                        reject
                    );

                }
            );

            await shell.openExternal(
                authorizeUrl.toString()
            );

            return {
                success:
                    true
            };

        }
        catch (
            error
        ) {

            console.error(
                "Spotify login failed:",
                error
            );

            return {
                success:
                    false,
                error:
                    error.message
            };

        }

    }
);

/*
    ========================================================
    SPOTIFY API
    ========================================================
*/

/*
    ========================================================
    SPOTIFY WEB PLAYBACK TOKEN
    ========================================================

    The Web Playback SDK receives a short-lived access token
    in the trusted renderer. The refresh token remains in
    the main process and secure storage.
*/

ipcMain.handle(
    "spotify-playback-token",
    async event => {

        requireTrustedRenderer(event);

        try {

            let tokens =
                loadSpotifyTokens();

            if (!tokens?.accessToken) {
                throw new Error("Spotify is not connected.");
            }

            if (
                typeof tokens.scope !== "string" ||
                !tokens.scope.split(/\s+/).includes("streaming")
            ) {
                return {
                    success: false,
                    requiresReauth: true,
                    error:
                        "Spotify playback permission is missing. Reconnect Spotify in Settings > Accounts."
                };
            }

            if (
                tokens.expiresAt &&
                Date.now() >= tokens.expiresAt - 30000
            ) {
                tokens.accessToken =
                    await refreshSpotifyToken();

                if (!tokens.accessToken) {
                    throw new Error("Spotify token refresh failed.");
                }
            }

            return {
                success: true,
                accessToken: tokens.accessToken
            };

        } catch (error) {

            console.error(
                "Spotify playback token request failed:",
                error
            );

            return {
                success: false,
                error: error.message
            };
        }
    }
);


ipcMain.handle(
    "spotify-api",
    async (
        event,
        request
    ) => {

        requireTrustedRenderer(event);

        try {

            if (
                !request ||
                typeof request !== "object"
            ) {

                throw new Error(
                    "Spotify API request is invalid."
                );

            }

            const method =
                String(
                    request.method ||
                    "GET"
                ).toUpperCase();

            if (
                ![
                    "GET",
                    "POST",
                    "PUT"
                ].includes(
                    method
                )
            ) {

                throw new Error(
                    "Spotify API method is not allowed."
                );

            }

            const endpoint =
                request.endpoint;

            if (
                typeof endpoint !== "string" ||
                !endpoint.startsWith("/") ||
                endpoint.includes("\\") ||
                endpoint.includes("://") ||
                endpoint.includes(" ") ||
                endpoint.length > 500
            ) {

                throw new Error(
                    "Spotify API endpoint is invalid."
                );

            }

            if (
                !(
                    endpoint.startsWith("/me/") ||
                    endpoint.startsWith("/playlists/") ||
                    endpoint.startsWith("/artists/") ||
                    endpoint.startsWith("/shows/") ||
                    endpoint.startsWith("/search")
                )
            ) {

                throw new Error(
                    "Spotify API endpoint is not allowed."
                );

            }

            let tokens =
                loadSpotifyTokens();

            if (
                !tokens?.accessToken
            ) {

                throw new Error(
                    "Spotify is not connected."
                );

            }

            if (
                tokens.expiresAt &&
                Date.now() >=
                    tokens.expiresAt - 30000
            ) {

                tokens.accessToken =
                    await refreshSpotifyToken();

                if (
                    !tokens.accessToken
                ) {

                    throw new Error(
                        "Spotify token refresh failed."
                    );

                }

            }

            const response =
                await fetch(
                    `https://api.spotify.com/v1${endpoint}`,
                    {
                        method,
                        headers: {
                            Authorization:
                                `Bearer ${tokens.accessToken}`,
                            "Content-Type":
                                "application/json"
                        },
                        body:
                            method === "GET"
                                ? undefined
                                : request.body
                                    ? JSON.stringify(
                                        request.body
                                    )
                                    : undefined
                    }
                );

            const data =
                await response.json().catch(
                    () => ({})
                );

            if (
                response.status === 401
            ) {

                /*
                    A token can be rejected before its local
                    expiry time. Refresh once, then retry.
                */

                const refreshed =
                    await refreshSpotifyToken();

                if (
                    !refreshed
                ) {

                    throw new Error(
                        "Spotify authorization expired. Please reconnect Spotify."
                    );

                }

                const retry =
                    await fetch(
                        `https://api.spotify.com/v1${endpoint}`,
                        {
                            method,
                            headers: {
                                Authorization:
                                    `Bearer ${refreshed}`,
                                "Content-Type":
                                    "application/json"
                            },
                            body:
                                method === "GET"
                                    ? undefined
                                    : request.body
                                        ? JSON.stringify(
                                            request.body
                                        )
                                        : undefined
                        }
                    );

                const retryData =
                    await retry.json().catch(
                        () => ({})
                    );

                if (
                    !retry.ok
                ) {

                    throw new Error(
                        retryData.error?.message ||
                        `Spotify API request failed: ${retry.status}`
                    );

                }

                return {
                    success:
                        true,
                    data:
                        retryData
                };

            }

            if (
                !response.ok
            ) {

                throw new Error(
                    data.error?.message ||
                    `Spotify API request failed: ${response.status}`
                );

            }

            return {
                success:
                    true,
                data
            };

        }
        catch (
            error
        ) {

            console.error(
                "Spotify API request failed:",
                error
            );

            return {
                success:
                    false,
                error:
                    error.message
            };

        }

    }
);





/*
    ========================================================
    STEAM FRIENDS CREDENTIALS
    ========================================================

    The Steam Web API key is treated as a secret and stored
    with Electron safeStorage. The Steam ID is non-secret
    configuration and is stored alongside local settings.
*/

function getSteamLocalSettings() {

    const local =
        readLocalSettings();

    local.steam =
        local.steam ||
        {};

    return local.steam;

}


function saveSteamCredentials(
    steamId,
    apiKey
) {

    if (
        !safeStorage.isEncryptionAvailable()
    ) {

        throw new Error(
            "OS secure storage is unavailable. Steam credentials were not saved."
        );

    }

    const local =
        readLocalSettings();

    local.steam =
        local.steam ||
        {};

    local.steam.steamId =
        String(
            steamId || ""
        ).trim();

    if (
        typeof apiKey === "string" &&
        apiKey.trim()
    ) {

        local.steam.apiKey =
            safeStorage.encryptString(
                apiKey.trim()
            ).toString(
                "base64"
            );

    }

    writeLocalSettings(
        local
    );

}


function loadSteamApiKey() {

    const local =
        getSteamLocalSettings();

    if (
        !local.apiKey
    ) {

        return "";

    }

    if (
        !safeStorage.isEncryptionAvailable()
    ) {

        throw new Error(
            "OS secure storage is unavailable. Steam credentials cannot be read."
        );

    }

    try {

        return safeStorage.decryptString(
            Buffer.from(
                local.apiKey,
                "base64"
            )
        );

    }
    catch (
        error
    ) {

        throw new Error(
            "Stored Steam API credentials could not be decrypted."
        );

    }

}


function getRendererSteamSettings() {

    const local =
        getSteamLocalSettings();

    return {

        steamId:
            local.steamId || "",

        configured:
            Boolean(
                local.steamId &&
                local.apiKey
            )

    };

}


async function fetchSteamJson(
    url,
    apiKey
) {

    const response =
        await fetch(
            url,
            {
                headers: {
                    "x-webapi-key":
                        apiKey,
                    "accept":
                        "application/json"
                }
            }
        );

    const data =
        await response.json().catch(
            () => ({})
        );

    if (
        !response.ok
    ) {

        throw new Error(
            data?.error?.message ||
            data?.message ||
            `Steam Web API request failed: ${response.status}`
        );

    }

    return data;

}


async function getSteamFriends() {

    const local =
        getSteamLocalSettings();

    const steamId =
        String(
            local.steamId || ""
        ).trim();

    const apiKey =
        loadSteamApiKey();

    if (
        !/^\\d{10,20}$/.test(
            steamId
        )
    ) {

        return {
            friends: [],
            provider: "steam",
            configured: false,
            error: "Steam ID is not configured."
        };

    }

    if (
        !apiKey
    ) {

        return {
            friends: [],
            provider: "steam",
            configured: false,
            error: "Steam Web API key is not configured."
        };

    }

    const friendListUrl =
        new URL(
            "https://api.steampowered.com/ISteamUser/GetFriendList/v1/"
        );

    friendListUrl.searchParams.set(
        "steamid",
        steamId
    );

    friendListUrl.searchParams.set(
        "relationship",
        "friend"
    );

    const friendData =
        await fetchSteamJson(
            friendListUrl.toString(),
            apiKey
        );

    const friendEntries =
        Array.isArray(
            friendData?.friendslist?.friends
        )
            ? friendData.friendslist.friends
            : [];

    if (
        !friendEntries.length
    ) {

        return {
            friends: [],
            provider: "steam",
            configured: true
        };

    }

    const summaries = [];

    for (
        let index = 0;
        index < friendEntries.length;
        index += 100
    ) {

        const batch =
            friendEntries
                .slice(
                    index,
                    index + 100
                )
                .map(
                    friend =>
                        String(
                            friend.steamid
                        )
                )
                .join(",");

        const summaryUrl =
            new URL(
                "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
            );

        summaryUrl.searchParams.set(
            "steamids",
            batch
        );

        const summaryData =
            await fetchSteamJson(
                summaryUrl.toString(),
                apiKey
            );

        if (
            Array.isArray(
                summaryData?.response?.players
            )
        ) {

            summaries.push(
                ...summaryData.response.players
            );

        }

    }

    const summaryMap =
        new Map(
            summaries.map(
                player => [
                    String(player.steamid),
                    player
                ]
            )
        );

    const friends =
        friendEntries.map(
            friend => {

                const player =
                    summaryMap.get(
                        String(
                            friend.steamid
                        )
                    ) || {};

                const personaState =
                    Number(
                        player.personastate || 0
                    );

                let status =
                    "offline";

                if (
                    personaState === 1 ||
                    personaState === 5 ||
                    personaState === 6
                ) {

                    status = "online";

                }
                else if (
                    personaState === 2
                ) {

                    status = "dnd";

                }
                else if (
                    personaState === 3 ||
                    personaState === 4
                ) {

                    status = "idle";

                }

                const gameId =
                    player.gameid
                        ? String(player.gameid)
                        : "";

                const gameName =
                    typeof player.gameextrainfo === "string" &&
                    player.gameextrainfo.trim()
                        ? player.gameextrainfo.trim()
                        : "";

                return {

                    id:
                        String(
                            player.steamid ||
                            friend.steamid
                        ),

                    platform:
                        "steam",

                    name:
                        String(
                            player.personaname ||
                            player.steamid ||
                            "Steam friend"
                        ),

                    avatar:
                        typeof player.avatarfull === "string"
                            ? player.avatarfull
                            : "",

                    status,

                    activity:
                        gameName
                            ? {
                                type:
                                    "game",
                                name:
                                    gameName,
                                details:
                                    "Playing on Steam",
                                state:
                                    "",
                                startedAt:
                                    null,
                                artwork:
                                    gameId
                                        ? `https://cdn.akamai.steamstatic.com/steam/apps/${encodeURIComponent(gameId)}/header.jpg`
                                        : ""
                            }
                            : null

                };

            }
        );

    return {
        friends,
        provider: "steam",
        configured: true
    };

}


ipcMain.handle(
    "friends-get",
    async (
        event
    ) => {

        requireTrustedRenderer(event);

        try {

            return await getSteamFriends();

        }
        catch (
            error
        ) {

            console.error(
                "Steam friends request failed:",
                error
            );

            return {
                friends: [],
                provider: "steam",
                configured: true,
                error:
                    error?.message ||
                    "Unable to load Steam friends."
            };

        }

    }
);


ipcMain.handle(
    "save-account-config",
    async (
        event,
        value
    ) => {

        requireTrustedRenderer(event);

        try {

            setSpotifyLocalIdentity({
                clientId:
                    String(
                        value?.spotifyClientId ||
                        ""
                    ).trim()
            });

            saveSteamCredentials(
                String(
                    value?.steamId ||
                    ""
                ).trim(),
                String(
                    value?.steamApiKey ||
                    ""
                ).trim()
            );

            const settings =
                readSettingsFile();

            settings.integrations =
                settings.integrations ||
                {};

            settings.integrations.discord =
                settings.integrations.discord ||
                {};

            settings.integrations.microsoft =
                settings.integrations.microsoft ||
                {};

            settings.integrations.riot =
                settings.integrations.riot ||
                {};

            settings.integrations.discord.clientId =
                String(
                    value?.discordClientId ||
                    ""
                ).trim();

            settings.integrations.microsoft.clientId =
                String(
                    value?.microsoftClientId ||
                    ""
                ).trim();

            settings.integrations.riot.clientId =
                String(
                    value?.riotClientId ||
                    ""
                ).trim();

            writeSettingsFile(
                settings
            );

            return {
                success:
                    true
            };

        }
        catch (
            error
        ) {

            return {
                success:
                    false,
                error:
                    error.message
            };

        }

    }
);

/*
    ========================================================
    DAILY ARTWORK REFRESH
    ========================================================
*/

function getCurrentDateString() {

    const now =
        new Date();


    return [

        now.getFullYear(),

        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        ),

        String(
            now.getDate()
        ).padStart(
            2,
            "0"
        )

    ].join(
        "-"
    );

}


function shouldRunDailyArtworkRefresh() {

    const refreshPath =
        getDailyArtworkRefreshPath();


    if (
        !fs.existsSync(
            refreshPath
        )
    ) {

        return true;

    }


    try {

        const data =
            JSON.parse(

                fs.readFileSync(

                    refreshPath,

                    "utf8"

                )

            );


        return (
            data.lastRefreshDate !==
            getCurrentDateString()
        );

    }
    catch (
        error
    ) {

        return true;

    }

}


function markDailyArtworkRefreshStarted() {

    const artworkDirectory =
        path.dirname(
            getDailyArtworkRefreshPath()
        );


    fs.mkdirSync(

        artworkDirectory,

        {
            recursive:
                true
        }

    );


    fs.writeFileSync(

        getDailyArtworkRefreshPath(),

        JSON.stringify(

            {

                lastRefreshDate:
                    getCurrentDateString(),

                startedAt:
                    Date.now()

            },

            null,

            4

        ),

        "utf8"

    );

}


async function refreshCachedGeneralArtwork() {

    const artworkRoot =
        path.join(

            app.getPath(
                "userData"
            ),

            "artwork"

        );


    if (
        !fs.existsSync(
            artworkRoot
        )
    ) {

        return;

    }


    let itemDirectories;


    try {

        itemDirectories =
            fs.readdirSync(

                artworkRoot,

                {
                    withFileTypes:
                        true
                }

            );

    }
    catch (
        error
    ) {

        console.error(

            "Could not read general artwork cache:",

            error

        );


        return;

    }


    for (
        const directoryEntry
        of itemDirectories
    ) {

        if (
            !directoryEntry.isDirectory()
        ) {

            continue;

        }


        if (
            directoryEntry.name ===
            "steam"
        ) {

            continue;

        }


        const itemId =
            directoryEntry.name;


        const metadata =
            readArtworkCacheMetadata(
                itemId
            );


        const artworkTypes = [

            "icon",
            "logo",
            "cover",
            "grid",
            "hero",
            "background",
            "capsule"

        ];


        for (
            const artworkType
            of artworkTypes
        ) {

            const existingPath =
                findExistingArtworkFile(

                    itemId,

                    artworkType

                );


            if (
                !existingPath
            ) {

                continue;

            }


            const source =
                await getConfiguredArtworkSource(

                    itemId,

                    artworkType

                );


            if (
                !source
            ) {

                continue;

            }


            if (
                isArtworkCacheFresh(

                    metadata,

                    artworkType,

                    source

                )
            ) {

                continue;

            }


            await downloadAndCacheArtwork(

                itemId,

                artworkType,

                source,

                false

            );

        }

    }

}


async function refreshCachedSteamArtwork() {

    const steamRoot =
        path.join(

            app.getPath(
                "userData"
            ),

            "artwork",

            "steam"

        );


    if (
        !fs.existsSync(
            steamRoot
        )
    ) {

        return;

    }


    let directories;


    try {

        directories =
            fs.readdirSync(

                steamRoot,

                {
                    withFileTypes:
                        true
                }

            );

    }
    catch (
        error
    ) {

        console.error(

            "Could not read Steam artwork cache:",

            error

        );


        return;

    }


    let metadataConfig;


    try {

        metadataConfig =
            readConfigFile(
                "metadata.json"
            );

    }
    catch (
        error
    ) {

        console.error(

            "Could not read metadata.json for Steam artwork refresh:",

            error

        );


        return;

    }


    const metadataItems =
        metadataConfig.items || {};


    for (
        const directoryEntry
        of directories
    ) {

        if (
            !directoryEntry.isDirectory()
        ) {

            continue;

        }


        const itemId =
            directoryEntry.name;


        const item =
            metadataItems[
                itemId
            ];


        if (
            !item
        ) {

            console.warn(

                `Skipping Steam artwork refresh for unknown item: ${itemId}`

            );


            continue;

        }


        const appId =
            item.sources?.steam?.appId;


        if (
            !appId
        ) {

            console.warn(

                `Skipping Steam artwork refresh; no Steam App ID configured for: ${itemId}`

            );


            continue;

        }


        try {

            const rawData =
                await fetchSteamStoreMetadata(

                    appId

                );


            const normalized =
                normalizeSteamMetadata(

                    rawData

                );


            if (
                !normalized
            ) {

                console.warn(

                    `Steam metadata unavailable during daily refresh: ${itemId}`

                );


                continue;

            }


            const cacheVersion =
                getSteamArtworkCacheVersion(

                    itemId

                );


            if (
                cacheVersion !==
                STEAM_ARTWORK_CACHE_VERSION
            ) {

                clearSteamArtworkCache(

                    itemId

                );


                await cacheSteamArtwork(

                    itemId,

                    normalized,

                    false

                );


                setSteamArtworkCacheVersion(

                    itemId

                );


                continue;

            }


            await cacheSteamArtwork(

                itemId,

                normalized,

                false

            );

        }
        catch (
            error
        ) {

            console.warn(

                `Daily Steam artwork refresh failed for ${itemId} (${appId}):`,

                error.message

            );

        }

    }

}


async function runDailyArtworkRefresh() {

    if (
        !shouldRunDailyArtworkRefresh()
    ) {

        console.log(

            "Artwork cache is already up to date for today."

        );


        return;

    }


    markDailyArtworkRefreshStarted();


    console.log(

        "Starting daily artwork cache refresh..."

    );


    try {

        await refreshCachedGeneralArtwork();

    }
    catch (
        error
    ) {

        console.error(

            "General artwork refresh failed:",

            error

        );

    }


    try {

        await refreshCachedSteamArtwork();

    }
    catch (
        error
    ) {

        console.error(

            "Steam artwork refresh failed:",

            error

        );

    }


    console.log(

        "Daily artwork cache refresh complete."

    );

}


/*
    ========================================================
    WIDEVINE / EME DIAGNOSTICS
    ========================================================

    This is intentionally diagnostic-only. It reports the
    local Castlabs/Electron Widevine environment without
    exposing Spotify tokens, credentials, or account data.
*/

function registerWidevineDiagnostics() {

    const diagnosticEvents = [
        "widevine-ready",
        "widevine-update-pending",
        "widevine-error"
    ];

    for (const eventName of diagnosticEvents) {

        app.on(
            eventName,
            (...args) => {

                console.log(
                    "[Widevine diagnostic] app event: " + eventName,
                    ...args
                );

            }
        );

    }

}


function logWidevineDiagnostics() {

    console.log(
        "[Widevine diagnostic] Electron:",
        process.versions.electron
    );

    console.log(
        "[Widevine diagnostic] Chromium:",
        process.versions.chrome
    );

    console.log(
        "[Widevine diagnostic] Node:",
        process.versions.node
    );

    if (!components) {

        console.error(
            "[Widevine diagnostic] Electron components API is unavailable."
        );

        return;

    }

    try {

        console.log(
            "[Widevine diagnostic] components.status():",
            components.status()
        );

    }
    catch (error) {

        console.error(
            "[Widevine diagnostic] components.status() failed:",
            error?.message || error
        );

    }

}


/*
    ========================================================
    APPLICATION LIFECYCLE
    ========================================================
*/

app.whenReady()
    .then(
        async () => {

            /*
                ====================================================
                CREATE XMB WINDOW
                ====================================================

                The window is created hidden.

                This gives us a BrowserWindow ready to display
                without showing the XMB before artwork caching
                has completed.
                ====================================================
            */

            registerArtworkProtocol();

            registerWidevineDiagnostics();

            if (components?.whenReady) {
                try {
                    await components.whenReady();
                    console.log("Widevine components ready.");
                    logWidevineDiagnostics();
                } catch (error) {
                    console.error("Widevine component initialization failed:",error);
                    logWidevineDiagnostics();
                }
            }
            else {
                logWidevineDiagnostics();
            }

            app.on(
                "web-contents-created",
                (
                    _event,
                    contents
                ) => {

                    contents.on(
                        "will-navigate",
                        (
                            event,
                            navigationUrl
                        ) => {

                            if (
                                contents !==
                                mainWindow?.webContents
                            ) {
                                event.preventDefault();
                                return;
                            }

                            try {

                                const parsedUrl =
                                    new URL(navigationUrl);

                                if (
                                    parsedUrl.protocol !== "file:" &&
                                    parsedUrl.protocol !== "xmb-artwork:"
                                ) {
                                    event.preventDefault();
                                }

                            }
                            catch (error) {
                                event.preventDefault();
                            }
                        }
                    );

                    contents.setWindowOpenHandler(
                        ({url}) => {

                            try {

                                const parsedUrl =
                                    new URL(url);

                                if (
                                    [
                                        "https:",
                                        "spotify:",
                                        "steam:",
                                        "msxbox:"
                                    ].includes(
                                        parsedUrl.protocol
                                    )
                                ) {
                                    setImmediate(
                                        () => {
                                            shell.openExternal(
                                                parsedUrl.toString()
                                            );
                                        }
                                    );
                                }

                            }
                            catch (error) {
                                /* Reject malformed URLs. */
                            }

                            return {
                                action: "deny"
                            };
                        }
                    );

                    contents.on(
                        "will-attach-webview",
                        event => {
                            event.preventDefault();
                        }
                    );
                }
            );

            createWindow();


            /*
                Start the one authoritative artwork preload
                without blocking the visible Electron window.
            */

            startupArtworkPreloadPromise =
                preloadArtworkOnStartup()
                    .catch(
                        error => {

                            console.error(
                                "Startup artwork preload encountered an error:",
                                error
                            );

                        }
                    );


            /*
                Show immediately. The renderer startup animation
                can run while the persistent artwork cache is built.
            */

            if (
                mainWindow &&
                !mainWindow.isDestroyed()
            ) {

                mainWindow.show();

            }


            /*
                ====================================================
                DAILY ARTWORK REFRESH
                ====================================================

                This remains separate from startup caching.

                It runs after the XMB has opened so it does not
                delay startup.
                ====================================================
            */

            setTimeout(

                () => {

                    runDailyArtworkRefresh()
                        .catch(
                            error => {

                                console.error(

                                    "Daily artwork refresh encountered an error:",

                                    error

                                );

                            }
                        );

                },

                3000

            );


            app.on(
                "activate",
                () => {

                    if (
                        BrowserWindow
                            .getAllWindows()
                            .length === 0
                    ) {

                        createWindow();

                    }

                }
            );

        }
    );


app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !==
            "darwin"
        ) {

            app.quit();

        }

    }
);