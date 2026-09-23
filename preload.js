const {
    contextBridge,
    ipcRenderer
} = require(
    "electron"
);


contextBridge.exposeInMainWorld(
    "electron",
    {

        /*
            =================================================
            CONFIG
            =================================================
        */

        getCategories:
            () =>
                ipcRenderer.invoke(
                    "get-categories"
                ),


        getSettings:
            () =>
                ipcRenderer.invoke(
                    "get-settings"
                ),


        getThemes:
            () =>
                ipcRenderer.invoke(
                    "get-themes"
                ),


        /*
            =================================================
            CATEGORY ICONS
            =================================================
        */

        getCategoryIcon:
            (
                categoryName
            ) =>
                ipcRenderer.invoke(
                    "get-category-icon",
                    categoryName
                ),


        /*
            =================================================
            LAUNCHERS
            =================================================

            CHANGED - PASS 3 / PASS 4:

            The renderer uses this single bridge for all
            supported launchers.

            Steam:

                navigation.js
                    ↓
                launchItem(item)
                    ↓
                "launch-item"
                    ↓
                main.js
                    ↓
                steam://rungameid/APPID

            Riot:

                navigation.js
                    ↓
                launchItem(item)
                    ↓
                "launch-item"
                    ↓
                main.js
                    ↓
                Riot Client

            Keeping this as one generic launcher bridge
            means the renderer does not need to know how
            Steam or Riot actually starts a game.
        */

        launchItem:
            (
                item
            ) =>
                ipcRenderer.invoke(
                    "launch-item",
                    item
                ),


        /*
            =================================================
            EXTERNAL LINKS
            =================================================
        */

        openExternal:
            (
                url
            ) =>
                ipcRenderer.invoke(
                    "open-external",
                    url
                ),


        /*
            =================================================
            STEAM METADATA
            =================================================
        */

        getSteamMetadata:
            (
                appId
            ) =>
                ipcRenderer.invoke(
                    "steam-get-metadata",
                    appId
                ),


        /*
            =================================================
            STEAM ARTWORK
            =================================================

            Steam artwork is kept separate from the general
            artwork system because Steam provides its own
            artwork endpoints and metadata.

            The renderer can request:

                icon
                logo
                hero
                capsule
                background
        */

        getSteamArtwork:
            (
                appId,
                itemId
            ) =>
                ipcRenderer.invoke(
                    "steam-get-artwork",
                    appId,
                    itemId
                ),


        /*
            =================================================
            GENERAL ARTWORK
            =================================================

            The general artwork system supports:

                icon
                logo
                cover
                grid
                hero
                background

            "cover" is the important addition for the
            Xbox/emulator game-art system.

            Example:

                getArtwork(
                    "some-game",
                    "cover"
                )

            The main process handles downloading,
            caching, and returning the local file URL.

            artworkSource allows metadata.js to pass a
            direct artwork URL through to main.js.
        */

        getArtwork:
            (
                itemId,
                artworkType = "logo",
                artworkSource = {}
            ) =>
                ipcRenderer.invoke(
                    "get-artwork",
                    itemId,
                    artworkType,
                    artworkSource
                ),

        getArtworkManifest:
            () =>
                ipcRenderer.invoke(
                    "get-artwork-manifest"
                ),


        /*
            =================================================
            SPOTIFY
            =================================================
        */

        spotifyLogin:
            () =>
                ipcRenderer.invoke(
                    "spotify-login"
                ),


        spotifyApi:
            (
                request
            ) =>
                ipcRenderer.invoke(
                    "spotify-api",
                    request
                ),


        /*
            =================================================
            SPOTIFY AUTHENTICATION CALLBACK
            =================================================
        */

        onSpotifyAuthComplete:
            (
                callback
            ) => {

                ipcRenderer.on(
                    "spotify-auth-complete",
                    () => {

                        callback();

                    }
                );

            }

    }
);