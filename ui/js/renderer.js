/*
    ========================================================
    PERSONAL XMB
    RENDERER
    ========================================================

    Responsible for:

        Interface initialization
        Category rendering
        Item rendering
        Selection state
        Themes
        Preview panel
        Background artwork
        Dynamic artwork
        Steam artwork


    ========================================================
    ARTWORK SYSTEM
    ========================================================

    Xbox / emulator games use:

        ICON
            Small artwork beside the item name.

        LOGO
            Transparent high-definition game logo.

        COVER
            Box / cover artwork used in the preview.

        BACKGROUND
            Optional wide artwork used as the XMB background.

    Steam games use:

        icon
        logo
        hero
        capsule
        grid
        background

    Steam presentation:

        HERO
            Primary landscape preview artwork.

        LOGO
            Transparent foreground logo.

        CAPSULE
            Fallback artwork only.

    Artwork provider determines WHERE artwork comes from.

    Artwork profile determines HOW artwork is displayed.
*/


/*
    ========================================================
    ELEMENT REFERENCES
    ========================================================
*/

const categoryHeading =
    document.getElementById(
        "category-heading"
    );


const selectedCategoryElement =
    document.getElementById(
        "selected-category"
    );


const categoryDescription =
    document.getElementById(
        "category-description"
    );


const selectionPreview =
    document.getElementById(
        "selection-preview"
    );


const selectionArtworkContainer =
    document.getElementById(
        "selection-artwork"
    );


const selectionArtworkImage =
    document.getElementById(
        "selection-artwork-image"
    );


const selectionPlatform =
    document.getElementById(
        "selection-platform"
    );


const selectionTitle =
    document.getElementById(
        "selection-title"
    );


const selectionDescription =
    document.getElementById(
        "selection-description"
    );


const selectionStatus =
    document.getElementById(
        "selection-status"
    );


const itemArea =
    document.getElementById(
        "item-area"
    );


const actionArea =
    document.getElementById(
        "action-area"
    );


const backgroundArtwork =
    document.getElementById(
        "background-artwork"
    );


const backgroundArtworkImage =
    document.getElementById(
        "background-artwork-image"
    );


/*
    ========================================================
    SESSION ARTWORK CACHE
    ========================================================

    Persistent caching is handled by main.js.

    These caches prevent the renderer from repeatedly
    requesting the same artwork during one session.
*/

const dynamicArtworkCache = {};

const steamArtworkRendererCache =
    dynamicArtworkCache;

const decodedArtworkCache = {};

let rendererArtworkPreloadPromise = null;


/*
    ========================================================
    UNIFIED STARTUP ARTWORK MANIFEST
    ========================================================
*/

function preloadDecodedArtwork(
    itemId,
    artworkType,
    source
) {

    return new Promise(
        resolve => {

            if (!source) {
                resolve(false);
                return;
            }

            const image = new Image();
            let settled = false;

            const finish = success => {

                if (settled) {
                    return;
                }

                settled = true;

                if (success) {

                    decodedArtworkCache[itemId] =
                        decodedArtworkCache[itemId] || {};

                    decodedArtworkCache[itemId][artworkType] =
                        image;

                }

                resolve(success);

            };

            image.onload = async () => {

                try {

                    if (typeof image.decode === "function") {
                        await image.decode();
                    }

                    finish(true);

                }
                catch (error) {
                    finish(true);
                }

            };

            image.onerror =
                () => finish(false);

            image.src =
                resolveLocalAssetPath(source);

        }
    );

}


async function initializeRendererArtworkManifest() {

    if (rendererArtworkPreloadPromise) {
        return rendererArtworkPreloadPromise;
    }

    rendererArtworkPreloadPromise =
        (async () => {

            if (
                !window.electron ||
                typeof window.electron.getArtworkManifest !==
                    "function"
            ) {

                console.warn(
                    "Unified artwork manifest bridge is unavailable."
                );

                return;

            }

            let manifest = {};

            try {

                manifest =
                    await window.electron.getArtworkManifest();

            }
            catch (error) {

                console.error(
                    "Failed to load artwork manifest:",
                    error
                );

                return;

            }

            const jobs = [];

            for (
                const [itemId, artwork]
                of Object.entries(manifest || {})
            ) {

                dynamicArtworkCache[itemId] = {};

                for (
                    const artworkType
                    of [
                        "icon",
                        "logo",
                        "cover",
                        "hero",
                        "background"
                    ]
                ) {

                    const source =
                        artwork?.[artworkType] ||
                        null;

                    dynamicArtworkCache[itemId][artworkType] =
                        source;

                    if (source) {

                        jobs.push({
                            itemId,
                            artworkType,
                            source
                        });

                    }

                }

            }

            let nextIndex = 0;

            async function worker() {

                while (true) {

                    const index = nextIndex++;

                    if (index >= jobs.length) {
                        return;
                    }

                    const job = jobs[index];

                    await preloadDecodedArtwork(
                        job.itemId,
                        job.artworkType,
                        job.source
                    );

                }

            }

            const workerCount =
                Math.min(
                    6,
                    jobs.length
                );

            if (workerCount > 0) {

                await Promise.all(
                    Array.from(
                        {
                            length: workerCount
                        },
                        () => worker()
                    )
                );

            }

            console.log(
                "Renderer artwork manifest ready:",
                Object.keys(manifest || {}).length,
                "items /",
                jobs.length,
                "decoded assets."
            );

        })();

    return rendererArtworkPreloadPromise;

}


/*
    ========================================================
    CHANGED: RENDERER PERFORMANCE CACHE
    ========================================================

    The old renderer rebuilt the entire item list every
    time the selection moved.

    That meant:

        UP
            ↓
        destroy every item
            ↓
        create every item
            ↓
        load every icon
            ↓
        DOWN
            ↓
        repeat

    The list now stays alive while navigating.
*/

let renderedCategoryName = "";

let renderedItemSignature = "";

const enrichedCategoryItemsCache = {};


/*
    ========================================================
    CHANGED: FAILED ICON CACHE
    ========================================================

    Prevents known-bad local icon paths from being assigned
    repeatedly during the same session.
*/

const failedIconSources = new Set();
const failedArtworkSources = new Set();


/*
    ========================================================
    CHANGED: BACKGROUND IMAGE CACHE
    ========================================================

    Large Steam hero images are expensive to repeatedly
    create and decode.

    Keep successfully loaded images in memory.
*/

const loadedBackgroundSources = new Set();


/*
    ========================================================
    CHANGED: EXPENSIVE NAVIGATION DELAY
    ========================================================

    The interface itself updates immediately.

    Large artwork/background requests wait a tiny amount
    so rapidly pressing UP/DOWN does not start a large
    number of image operations simultaneously.
*/

const ARTWORK_NAVIGATION_DELAY = 90;

let pendingArtworkUpdateTimer = null;


/*
    ========================================================
    ARTWORK REQUEST TRACKING
    ========================================================
*/

let artworkSelectionRequestId = 0;


/*
    ========================================================
    BACKGROUND REQUEST TRACKING
    ========================================================
*/

let backgroundRequestId = 0;


/*
    ========================================================
    SMOOTH ARTWORK DISPLAY TRACKING
    ========================================================

    Keep track of what is ACTUALLY being displayed.

    This prevents the renderer from repeatedly hiding and
    showing the same artwork while navigating.
*/

let displayedPreviewCoverSource = "";

let displayedPreviewLogoSource = "";

let displayedBackgroundSource = "";


/*
    ========================================================
    INITIALIZE SELECTION ARTWORK
    ========================================================
*/

function initializeSelectionArtwork() {

    if (
        !selectionArtworkContainer
    ) {

        return null;

    }


    let coverImage =
        selectionArtworkImage;


    if (
        !coverImage
    ) {

        coverImage =
            selectionArtworkContainer.querySelector(
                ".selection-cover"
            );

    }


    if (
        coverImage
    ) {

        coverImage.classList.add(
            "selection-cover"
        );

    }


    let logoImage =
        selectionArtworkContainer.querySelector(
            ".selection-logo"
        );


    if (
        !logoImage
    ) {

        logoImage =
            document.createElement(
                "img"
            );


        logoImage.className =
            "selection-logo";


        logoImage.alt =
            "";


        logoImage.setAttribute(
            "aria-hidden",
            "true"
        );


        selectionArtworkContainer.appendChild(
            logoImage
        );

    }


    let overlay =
        selectionArtworkContainer.querySelector(
            ".selection-artwork-overlay"
        );


    if (
        !overlay
    ) {

        overlay =
            document.createElement(
                "div"
            );


        overlay.className =
            "selection-artwork-overlay";


        overlay.setAttribute(
            "aria-hidden",
            "true"
        );


        selectionArtworkContainer.appendChild(
            overlay
        );

    }


    return {

        container:
            selectionArtworkContainer,

        cover:
            coverImage,

        logo:
            logoImage,

        overlay

    };

}


/*
    ========================================================
    GET SELECTION ARTWORK LAYERS
    ========================================================
*/

function getSelectionArtworkLayers() {

    return initializeSelectionArtwork();

}


/*
    ========================================================
    CLEAR SELECTION ARTWORK
    ========================================================
*/

function clearSelectionArtwork() {

    const layers =
        getSelectionArtworkLayers();


    /*
        Reset the renderer's knowledge of the currently
        displayed artwork.
    */

    displayedPreviewCoverSource =
        "";

    displayedPreviewLogoSource =
        "";


    if (
        !layers
    ) {

        return;

    }


    if (
        layers.cover
    ) {

        layers.cover.removeAttribute(
            "src"
        );


        layers.cover.classList.remove(
            "visible"
        );


        layers.cover.classList.remove(
            "has-artwork"
        );

    }


    if (
        layers.logo
    ) {

        layers.logo.removeAttribute(
            "src"
        );


        layers.logo.classList.remove(
            "visible"
        );


        layers.logo.classList.remove(
            "has-artwork"
        );

    }


    if (
        layers.overlay
    ) {

        layers.overlay.classList.remove(
            "visible"
        );

    }


    if (
        layers.container
    ) {

        layers.container.classList.remove(
            "has-cover"
        );


        layers.container.classList.remove(
            "has-logo"
        );


        layers.container.classList.remove(
            "boxart-mode"
        );

    }

}


/*
    ========================================================
    RESTART ARTWORK TRANSITION
    ========================================================

    Kept for compatibility with the existing renderer.

    Artwork replacement itself no longer depends on this
    function because hiding the artwork between selections
    caused the navigation stutter.
*/

function restartArtworkTransition(
    element,
    requestId,
    className = "visible"
) {

    if (
        !element
    ) {

        return;

    }


    element.classList.remove(
        className
    );


    requestAnimationFrame(
        () => {

            if (
                requestId !==
                artworkSelectionRequestId
            ) {

                return;

            }


            requestAnimationFrame(
                () => {

                    if (
                        requestId !==
                        artworkSelectionRequestId
                    ) {

                        return;

                    }


                    element.classList.add(
                        className
                    );

                }
            );

        }
    );

}


/*
    ========================================================
    INITIALIZE INTERFACE
    ========================================================
*/

async function initializeInterface() {

    await initializeRendererArtworkManifest();

    initializeSelectionArtwork();


    if (
        !window.categoriesData
    ) {

        console.warn(
            "Categories have not been loaded yet."
        );

        return;

    }


    const categoryNames =
        Object.keys(
            window.categoriesData
        );


    if (
        categoryNames.length === 0
    ) {

        console.warn(
            "No categories are available."
        );

        return;

    }


    if (
        typeof window.renderCategoryBar ===
        "function"
    ) {

        if (
            typeof window.setCategoryArtworkManifest ===
            "function"
        ) {

            const categoryManifest =
                window.electron?.getArtworkManifest
                    ? await window.electron.getArtworkManifest()
                    : {};

            window.setCategoryArtworkManifest(
                categoryNames.reduce(
                    (
                        result,
                        categoryName
                    ) => {

                        result[categoryName] =
                            categoryManifest?.__categories?.[categoryName] ||
                            null;

                        return result;

                    },
                    {}
                )
            );

        }


        window.renderCategoryBar(
            categoryNames,
            window.xmbNavigation?.getCategory() || 0
        );

    }


    if (
        window.xmbNavigation &&
        typeof window.xmbNavigation.getState ===
            "function"
    ) {

        updateInterface(
            window.xmbNavigation.getState(),
            false
        );

    }


    updateNavigationHints();


    console.log(
        "XMB interface initialized."
    );

}


/*
    ========================================================
    CATEGORY SELECTION
    ========================================================
*/

function updateRendererCategorySelection(
    categoryIndex
) {

    if (
        typeof window.updateCategorySelection ===
        "function"
    ) {

        window.updateCategorySelection(
            categoryIndex
        );

    }


    const categoryNames =
        Object.keys(
            window.categoriesData ||
            {}
        );


    const categoryName =
        categoryNames[
            categoryIndex
        ];


    if (
        !categoryName
    ) {

        return;

    }


    const category =
        window.categoriesData[
            categoryName
        ];


    updateDynamicTheme(
        category,
        null
    );

}


/*
    ========================================================
    RESOLVE LOCAL ASSET PATH
    ========================================================
*/

function resolveLocalAssetPath(
    source
) {

    if (
        typeof source !== "string" ||
        source.length === 0
    ) {

        return "";

    }


    if (
        source.startsWith(
            "file://"
        ) ||
        source.startsWith(
            "http://"
        ) ||
        source.startsWith(
            "https://"
        ) ||
        source.startsWith(
            "data:"
        ) ||
        source.startsWith(
            "blob:"
        )
    ) {

        return source;

    }


    if (
        source.startsWith(
            "assets/"
        )
    ) {

        return "../" + source;

    }


    return source;

}


/*
    ========================================================
    GET STEAM APP ID
    ========================================================
*/

function getSteamAppId(
    item
) {

    if (
        !item
    ) {

        return "";

    }


    const metadataSources =
        item.metadataSources ||
        {};


    const steamSource =
        metadataSources.steam ||
        item.sources?.steam ||
        {};


    const appId =
        steamSource.appId ||
        item.steamAppId ||
        "";


    return String(
        appId
    );

}


/*
    ========================================================
    IS STEAM ITEM
    ========================================================
*/

function isSteamItem(
    item
) {

    return Boolean(
        getSteamAppId(
            item
        )
    );

}


/*
    ========================================================
    GET ARTWORK PROFILE
    ========================================================
*/

function getArtworkProfile(
    item
) {

    if (
        !item
    ) {

        return "default";

    }


    if (
        typeof item.artworkProfile ===
        "string" &&
        item.artworkProfile.trim()
    ) {

        return item.artworkProfile.trim();

    }


    if (
        typeof item.metadata?.artworkProfile ===
        "string" &&
        item.metadata.artworkProfile.trim()
    ) {

        return item.metadata.artworkProfile.trim();

    }


    if (
        window.xmbMetadata &&
        typeof window.xmbMetadata.getArtworkProfile ===
            "function" &&
        item.id
    ) {

        return (
            window.xmbMetadata.getArtworkProfile(
                item.id
            ) ||
            "default"
        );

    }


    const sourceProfile =
        item.metadataSources?.artwork?.profile;


    if (
        typeof sourceProfile ===
        "string" &&
        sourceProfile.trim()
    ) {

        return sourceProfile.trim();

    }


    const originalSourceProfile =
        item.sources?.artwork?.profile;


    if (
        typeof originalSourceProfile ===
        "string" &&
        originalSourceProfile.trim()
    ) {

        return originalSourceProfile.trim();

    }


    return "default";

}


/*
    ========================================================
    GET ARTWORK PROVIDER
    ========================================================
*/

function getArtworkProvider(
    item
) {

    if (
        !item
    ) {

        return "default";

    }


    if (
        typeof item.artworkProvider ===
        "string" &&
        item.artworkProvider.trim()
    ) {

        return item.artworkProvider.trim();

    }


    if (
        typeof item.metadata?.artworkProvider ===
        "string" &&
        item.metadata.artworkProvider.trim()
    ) {

        return item.metadata.artworkProvider.trim();

    }


    if (
        window.xmbMetadata &&
        typeof window.xmbMetadata.getArtworkProvider ===
            "function" &&
        item.id
    ) {

        const metadataProvider =
            window.xmbMetadata.getArtworkProvider(
                item.id
            );


        if (
            typeof metadataProvider ===
            "string" &&
            metadataProvider.trim() &&
            metadataProvider.toLowerCase() !==
                "default"
        ) {

            return metadataProvider.trim();

        }

    }


    const metadataSourceProvider =
        item.metadataSources?.artwork?.provider;


    if (
        typeof metadataSourceProvider ===
        "string" &&
        metadataSourceProvider.trim()
    ) {

        return metadataSourceProvider.trim();

    }


    const sourceProvider =
        item.sources?.artwork?.provider;


    if (
        typeof sourceProvider ===
        "string" &&
        sourceProvider.trim()
    ) {

        return sourceProvider.trim();

    }


    const legacyProfile =
        item.artworkProfile ||
        item.metadata?.artworkProfile;


    if (
        typeof legacyProfile ===
        "string" &&
        legacyProfile.trim().toLowerCase() ===
            "thegamesdb"
    ) {

        return "thegamesdb";

    }


    return "default";

}


/*
    ========================================================
    IS BOX ART ITEM
    ========================================================
*/

function isBoxArtItem(
    item
) {

    if (
        !item
    ) {

        return false;

    }


    if (
        window.xmbMetadata &&
        typeof window.xmbMetadata.isBoxArtItem ===
            "function"
    ) {

        return Boolean(
            window.xmbMetadata.isBoxArtItem(
                item
            )
        );

    }


    const profile =
        getArtworkProfile(
            item
        ).toLowerCase();


    if (
        profile ===
        "boxart"
    ) {

        return true;

    }


    const provider =
        getArtworkProvider(
            item
        ).toLowerCase();


    if (
        provider ===
        "thegamesdb"
    ) {

        return true;

    }


    const platform =
        String(
            item.platform ||
            item.metadata?.platform ||
            ""
        ).toLowerCase();


    return (
        platform.includes(
            "xbox"
        ) ||
        platform.includes(
            "emulator"
        )
    );

}


/*
    ========================================================
    LOAD STEAM ARTWORK
    ========================================================
*/

async function loadSteamArtwork(
    item
) {

    if (
        !item ||
        !item.id
    ) {

        return null;

    }


    const appId =
        getSteamAppId(
            item
        );


    if (
        !appId
    ) {

        return null;

    }


    if (
        steamArtworkRendererCache[
            item.id
        ]
    ) {

        return (
            steamArtworkRendererCache[
                item.id
            ]
        );

    }


    if (
        !window.electron ||
        typeof window.electron.getSteamArtwork !==
            "function"
    ) {

        console.warn(
            "Steam artwork bridge is unavailable."
        );

        return null;

    }


    try {

        console.log(
            "Loading Steam artwork:",
            item.id,
            appId
        );


        const result =
            await window.electron.getSteamArtwork(
                appId,
                item.id
            );


        if (
            !result ||
            !result.success ||
            !result.data
        ) {

            console.warn(
                "No Steam artwork returned:",
                item.id,
                result?.error || ""
            );

            return null;

        }


        const artwork =
            result.data;


        steamArtworkRendererCache[
            item.id
        ] =
            artwork;


        console.log(
            "Steam artwork loaded:",
            item.id,
            artwork
        );


        return artwork;

    }

    catch (
        error
    ) {

        console.error(
            "Failed to load Steam artwork:",
            item.id,
            error
        );


        return null;

    }

}


/*
    ========================================================
    APPLY STEAM ARTWORK
    ========================================================
*/

function applySteamArtworkToItem(
    item,
    artwork
) {

    if (
        !item ||
        !artwork
    ) {

        return;

    }


    if (
        !item.artworkMetadata
    ) {

        item.artworkMetadata =
            {};

    }


    item.artworkMetadata = {

        ...item.artworkMetadata,

        ...artwork

    };

}


/*
    ========================================================
    GET ITEM LIST ICON
    ========================================================
*/

function getItemListIcon(
    item
) {

    if (
        !item
    ) {

        return "";

    }

    /*
        The startup artwork manifest is authoritative.

        Do not fall back to arbitrary paths from categories.json.
        main.js only publishes local files that actually exist.
    */

    const cachedArtwork =
        dynamicArtworkCache[item.id] ||
        {};

    const metadataArtwork =
        item.artworkMetadata ||
        {};

    return (
        metadataArtwork.icon ||
        cachedArtwork.icon ||
        metadataArtwork.logo ||
        cachedArtwork.logo ||
        metadataArtwork.cover ||
        cachedArtwork.cover ||
        ""
    );

}


/*
    ========================================================
    GET ENRICHED CATEGORY ITEMS
    ========================================================
    GET ENRICHED CATEGORY ITEMS
    ========================================================
*/

function getEnrichedCategoryItems(
    categoryName,
    category
) {

    if (
        enrichedCategoryItemsCache[
            categoryName
        ]
    ) {

        return (
            enrichedCategoryItemsCache[
                categoryName
            ]
        );

    }


    const items =
        Array.isArray(
            category?.items
        )
            ? category.items
            : [];


    const enrichedItems =
        items.map(
            (
                rawItem
            ) => {

                return (
                    window.xmbMetadata &&
                    typeof window.xmbMetadata.enrichItemWithMetadata ===
                        "function"
                )
                    ? window.xmbMetadata.enrichItemWithMetadata(
                        rawItem
                    )
                    : rawItem;

            }
        );


    enrichedCategoryItemsCache[
        categoryName
    ] =
        enrichedItems;


    return enrichedItems;

}


/*
    ========================================================
    CREATE ITEM SIGNATURE
    ========================================================
*/

function getItemListSignature(
    items
) {

    if (
        !Array.isArray(items)
    ) {

        return "";

    }


    return items
        .map(
            (
                item,
                index
            ) => {

                return String(
                    item?.id ||
                    item?.name ||
                    index
                );

            }
        )
        .join(
            "|"
        );

}


/*
    ========================================================
    RENDER ITEM LIST
    ========================================================
*/

function renderRendererItemList(
    items,
    selectedIndex = 0
) {

    const container =
        document.getElementById(
            "items"
        );


    if (
        !container
    ) {

        return;

    }


    container.innerHTML =
        "";


    renderedItemSignature =
        getItemListSignature(
            items
        );


    if (
        !Array.isArray(items)
    ) {

        renderedCategoryName =
            "";


        renderedItemSignature =
            "";


        return;

    }


    items.forEach(
        (
            item,
            index
        ) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "item";


            element.dataset.index =
                index;


            element.dataset.itemId =
                item.id || "";


            const icon =
                document.createElement(
                    "img"
                );


            icon.className =
                "item-icon";


            icon.alt =
                "";


            icon.setAttribute(
                "aria-hidden",
                "true"
            );


            let iconSource =
                getItemListIcon(
                    item
                );


            iconSource =
                resolveLocalAssetPath(
                    iconSource
                );


            if (
                iconSource &&
                !failedIconSources.has(
                    iconSource
                )
            ) {

                icon.dataset.xmbSource =
                    iconSource;

                icon.src =
                    iconSource;

            }


            icon.addEventListener(
                "error",
                () => {

                    if (
                        iconSource
                    ) {

                        failedIconSources.add(
                            iconSource
                        );

                    }

                    delete icon.dataset.xmbSource;

                    icon.removeAttribute(
                        "src"
                    );

                }
            );


            const content =
                document.createElement(
                    "div"
                );


            content.className =
                "item-content";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "item-name";


            name.textContent =
                item.name ||
                item.metadata?.name ||
                "";


            content.appendChild(
                name
            );


            element.appendChild(
                icon
            );


            element.appendChild(
                content
            );


            if (
                index === selectedIndex
            ) {

                element.classList.add(
                    "selected"
                );

            }


            container.appendChild(
                element
            );

        }
    );

}


/*
    ========================================================
    REFRESH RENDERED ITEM ICON
    ========================================================
*/

function refreshRenderedItemIcon(
    item
) {

    if (
        !item ||
        !item.id
    ) {

        return;

    }

    const renderedItem =
        document.querySelector(
            `#items .item[data-item-id="${CSS.escape(String(item.id))}"]`
        );

    if (
        !renderedItem
    ) {

        return;

    }

    const icon =
        renderedItem.querySelector(
            ".item-icon"
        );

    if (
        !icon
    ) {

        return;

    }

    const source =
        getItemListIcon(
            item
        );

    if (
        !source
    ) {

        icon.removeAttribute("src");
        delete icon.dataset.xmbSource;
        icon.classList.remove("loaded");

        return;

    }

    const resolvedSource =
        resolveLocalAssetPath(
            source
        );

    if (
        failedIconSources.has(
            resolvedSource
        )
    ) {

        return;

    }

    /*
        Compare the logical source rather than image.src.
        Chromium normalizes image.src into a file:// URL,
        which previously made every refresh look like a
        new source and caused repeated requests.
    */

    if (
        icon.dataset.xmbSource ===
        resolvedSource
    ) {

        return;

    }

    icon.onload =
        () => {

            icon.classList.add(
                "loaded"
            );

        };

    icon.onerror =
        () => {

            failedIconSources.add(
                resolvedSource
            );

            delete icon.dataset.xmbSource;

            icon.removeAttribute(
                "src"
            );

        };

    icon.dataset.xmbSource =
        resolvedSource;

    icon.src =
        resolvedSource;

}


/*
    ========================================================
    ITEM SELECTION/*
    ========================================================
    ITEM SELECTION
    ========================================================
*/

function updateRendererItemSelection(
    itemIndex
) {

    const items =
        document.querySelectorAll(
            "#items .item"
        );


    items.forEach(
        (
            item,
            index
        ) => {

            item.classList.toggle(
                "selected",
                index === itemIndex
            );

        }
    );


    const selectedItem =
        document.querySelector(
            `#items .item[data-index="${itemIndex}"]`
        );


    if (
        !selectedItem
    ) {

        return;

    }


    const container =
        document.getElementById(
            "items"
        );


    if (
        !container
    ) {

        return;

    }


    const containerRect =
        container.getBoundingClientRect();


    const itemRect =
        selectedItem.getBoundingClientRect();


    const outsideTop =
        itemRect.top <
        containerRect.top;


    const outsideBottom =
        itemRect.bottom >
        containerRect.bottom;


    if (
        outsideTop ||
        outsideBottom
    ) {

        selectedItem.scrollIntoView(
            {
                block:
                    "nearest",

                behavior:
                    "auto"
            }
        );

    }

}


/*
    ========================================================
    GET CURRENT ITEM
    ========================================================
*/

function getRenderedCurrentItemData() {

    if (
        !window.xmbNavigation ||
        typeof window.xmbNavigation.getCurrentItem !==
        "function"
    ) {

        return null;

    }


    return (
        window.xmbNavigation.getCurrentItem() ||
        null
    );

}


/*
    ========================================================
    GET GENERIC ARTWORK REQUEST
    ========================================================
*/

function getGenericArtworkRequest(
    item
) {

    const provider =
        getArtworkProvider(
            item
        ).toLowerCase();


    /*
        ====================================================
        PROVIDER-BASED AUTOMATIC ARTWORK
        ====================================================

        These providers do not need individual URLs in
        metadata.json.

        Returning the artwork types here causes artwork.js
        to ask metadata.js for the actual provider source.
    */

    if (
        provider === "riot"
    ) {

        return {

            icon:
                true,

            logo:
                true

        };

    }


    if (
        provider === "xbox"
    ) {

        return {

            icon:
                true,

            logo:
                true

        };

    }


    /*
        ====================================================
        MINECRAFT
        ====================================================

        Minecraft has its own artwork provider in
        metadata.json.

        It is handled separately from the Xbox provider
        because metadata.js is responsible for resolving
        Minecraft's actual artwork source.

        The renderer simply requests the artwork types
        Minecraft supports.
    */

    if (
        provider === "minecraft"
    ) {

        return {

            icon:
                true,

            logo:
                true,

            cover:
                true,

            background:
                true

        };

    }


    if (
        provider === "retroarch"
    ) {

        return {

            icon:
                true,

            logo:
                true,

            background:
                true

        };

    }


    if (
        provider === "plutonium"
    ) {

        return {

            icon:
                true,

            logo:
                true,

            background:
                true

        };

    }


    if (
        provider === "spotify"
    ) {

        return {

            icon:
                true,

            logo:
                true

        };

    }


    if (
        provider === "thegamesdb"
    ) {

        return {

            icon:
                true,

            logo:
                true,

            cover:
                true

        };

    }


    /*
        ====================================================
        MANUAL ARTWORK SOURCES
        ====================================================
    */

    const artworkSources =
        item?.metadataSources?.artwork ||
        {};


    const request =
        {
            ...artworkSources
        };


    delete request.profile;

    delete request.provider;


    return request;

}


/*
    ========================================================
    LOAD DYNAMIC ARTWORK
    ========================================================
*/

async function loadDynamicArtwork(
    item
) {

    if (
        !item ||
        !item.id
    ) {

        return;

    }


    const requestId =
        artworkSelectionRequestId;


    /*
        ====================================================
        UNIFIED STARTUP CACHE
        ====================================================
    */

    if (
        Object.prototype.hasOwnProperty.call(
            dynamicArtworkCache,
            item.id
        )
    ) {

        const artwork =
            dynamicArtworkCache[item.id] || {};

        applyDynamicArtworkToItem(
            item,
            artwork
        );

        refreshRenderedItemIcon(item);

        /*
            A manifest entry with at least one real asset is
            authoritative. A completely empty provider entry
            still gets one provider-resolution attempt so a
            missing provider URL cannot permanently hide a
            valid configured fallback.
        */

        const hasManifestArtwork =
            Object.values(artwork).some(
                source => Boolean(source)
            );

        if (
            requestId ===
            artworkSelectionRequestId
        ) {

            const currentItem =
                getRenderedCurrentItemData();

            if (
                !currentItem ||
                currentItem.id === item.id
            ) {

                updatePreviewArtwork(item);
                updateBackground(item);

            }

        }

        if (hasManifestArtwork) {
            return;
        }

    }


    /*
        ====================================================
        LEGACY PROVIDER FALLBACK
        ====================================================
    */


    /*
        ====================================================
        STEAM
        ====================================================
    */

    if (
        isSteamItem(
            item
        )
    ) {

        const steamArtwork =
            await loadSteamArtwork(
                item
            );


        if (
            steamArtwork
        ) {

            applySteamArtworkToItem(
                item,
                steamArtwork
            );


            refreshRenderedItemIcon(
                item
            );


            if (
                requestId ===
                artworkSelectionRequestId
            ) {

                const currentItem =
                    getRenderedCurrentItemData();


                if (
                    !currentItem ||
                    currentItem.id ===
                        item.id
                ) {

                    updatePreviewArtwork(
                        item
                    );


                    updateBackground(
                        item
                    );

                }

            }

        }


        return;

    }


    /*
        ====================================================
        GENERIC ARTWORK CONFIGURATION
        ====================================================
    */

    const artworkRequest =
        getGenericArtworkRequest(
            item
        );


    if (
        Object.keys(
            artworkRequest
        ).length === 0
    ) {

        return;

    }


    /*
        ====================================================
        SESSION CACHE
        ====================================================
    */

    if (
        dynamicArtworkCache[
            item.id
        ]
    ) {

        applyDynamicArtworkToItem(
            item,
            dynamicArtworkCache[
                item.id
            ]
        );


        refreshRenderedItemIcon(
            item
        );


        if (
            requestId ===
            artworkSelectionRequestId
        ) {

            const currentItem =
                getRenderedCurrentItemData();


            if (
                !currentItem ||
                currentItem.id ===
                    item.id
            ) {

                updatePreviewArtwork(
                    item
                );


                updateBackground(
                    item
                );

            }

        }


        return;

    }


    /*
        ====================================================
        ARTWORK SERVICE
        ====================================================
    */

    if (
        !window.xmbArtwork ||
        typeof window.xmbArtwork.getArtwork !==
        "function"
    ) {

        console.warn(
            "Artwork service is unavailable."
        );

        return;

    }


    try {

        const artwork =
            await window.xmbArtwork.getArtwork(
                item.id,
                artworkRequest
            );


        if (
            !artwork
        ) {

            return;

        }


        dynamicArtworkCache[
            item.id
        ] =
            artwork;


        applyDynamicArtworkToItem(
            item,
            artwork
        );


        refreshRenderedItemIcon(
            item
        );


        if (
            requestId !==
            artworkSelectionRequestId
        ) {

            return;

        }


        const currentItem =
            getRenderedCurrentItemData();


        if (
            currentItem &&
            currentItem.id !==
                item.id
        ) {

            return;

        }


        updatePreviewArtwork(
            item
        );


        updateBackground(
            item
        );

    }

    catch (
        error
    ) {

        console.error(
            "Failed to load dynamic artwork:",
            item.id,
            error
        );

    }

}


/*
    ========================================================
    APPLY DYNAMIC ARTWORK
    ========================================================
*/

function applyDynamicArtworkToItem(
    item,
    artwork
) {

    if (
        !item ||
        !artwork
    ) {

        return;

    }


    if (
        !item.artworkMetadata
    ) {

        item.artworkMetadata =
            {};

    }


    item.artworkMetadata = {

        ...item.artworkMetadata,

        ...artwork

    };

}


/*
    ========================================================
    CLEAR DYNAMIC ARTWORK CACHE
    ========================================================
*/

function clearDynamicArtworkCache() {

    Object.keys(
        dynamicArtworkCache
    ).forEach(
        (
            key
        ) => {

            delete dynamicArtworkCache[
                key
            ];

        }
    );


    Object.keys(
        steamArtworkRendererCache
    ).forEach(
        (
            key
        ) => {

            delete steamArtworkRendererCache[
                key
            ];

        }
    );


    loadedBackgroundSources.clear();


    displayedPreviewCoverSource =
        "";

    displayedPreviewLogoSource =
        "";

    displayedBackgroundSource =
        "";


    Object.keys(
        enrichedCategoryItemsCache
    ).forEach(
        (
            key
        ) => {

            delete enrichedCategoryItemsCache[
                key
            ];

        }
    );


    console.log(
        "Renderer artwork caches cleared."
    );

}


/*
    ========================================================
    GET PREVIEW ARTWORK
    ========================================================
*/

function getPreviewArtwork(
    item
) {

    if (
        !item
    ) {

        return {
            icon: "",
            logo: "",
            cover: "",
            hero: "",
            grid: "",
            capsule: "",
            background: ""
        };

    }

    const metadataArtwork =
        item.artworkMetadata ||
        {};

    const cachedArtwork =
        dynamicArtworkCache[item.id] ||
        {};

    /*
        Universal artwork slots are the renderer's source of
        truth. Raw config paths are deliberately not used as
        fallback sources because a stale path can point to a
        file that no longer exists.
    */

    return {

        icon:
            metadataArtwork.icon ||
            cachedArtwork.icon ||
            "",

        logo:
            metadataArtwork.logo ||
            cachedArtwork.logo ||
            "",

        cover:
            metadataArtwork.cover ||
            cachedArtwork.cover ||
            "",

        hero:
            metadataArtwork.hero ||
            cachedArtwork.hero ||
            "",

        grid:
            metadataArtwork.cover ||
            cachedArtwork.cover ||
            "",

        capsule:
            metadataArtwork.cover ||
            cachedArtwork.cover ||
            "",

        background:
            metadataArtwork.background ||
            cachedArtwork.background ||
            ""

    };

}


/*
    ========================================================
    PRELOAD PREVIEW IMAGE
    ========================================================
    PRELOAD PREVIEW IMAGE
    ========================================================
*/

function preloadPreviewImage(
    source,
    requestId
) {

    return new Promise(
        (
            resolve
        ) => {

            if (
                !source
            ) {

                resolve(false);
                return;

            }

            const resolvedSource =
                resolveLocalAssetPath(source);

            if (
                failedArtworkSources.has(
                    resolvedSource
                )
            ) {

                resolve(false);
                return;

            }

            const image =
                new Image();

            image.onload =
                () => {

                    if (
                        requestId !==
                        artworkSelectionRequestId
                    ) {

                        resolve(false);
                        return;

                    }

                    resolve(true);

                };

            image.onerror =
                () => {

                    failedArtworkSources.add(
                        resolvedSource
                    );

                    resolve(false);

                };

            image.src =
                resolvedSource;

        }
    );

}


/*
    ========================================================
    SET PREVIEW COVER/*
    ========================================================
    SET PREVIEW COVER
    ========================================================

    Keep the current artwork visible until the replacement
    has already been preloaded.

    This avoids the old hide → fade → show cycle.
*/

function setPreviewCover(
    source,
    requestId
) {

    const layers =
        getSelectionArtworkLayers();


    if (
        !layers ||
        !layers.cover
    ) {

        return;

    }


    if (
        requestId !==
        artworkSelectionRequestId
    ) {

        return;

    }


    if (
        !source
    ) {

        return;

    }


    const resolvedSource =
        resolveLocalAssetPath(
            source
        );


    /*
        Do nothing if this exact artwork is already
        being displayed.
    */

    if (
        displayedPreviewCoverSource ===
        resolvedSource
    ) {

        return;

    }


    /*
        The image has already been preloaded.

        Swap it while the current artwork remains visible.
    */

    layers.cover.src =
        resolvedSource;


    layers.cover.classList.add(
        "has-artwork"
    );


    layers.cover.classList.add(
        "visible"
    );


    displayedPreviewCoverSource =
        resolvedSource;

}


/*
    ========================================================
    SET PREVIEW LOGO
    ========================================================

    Logos use the same smooth replacement behavior as the
    main artwork.
*/

function setPreviewLogo(
    source,
    requestId
) {

    const layers =
        getSelectionArtworkLayers();


    if (
        !layers ||
        !layers.logo
    ) {

        return;

    }


    if (
        requestId !==
        artworkSelectionRequestId
    ) {

        return;

    }


    if (
        !source
    ) {

        /*
            The new item has no logo.

            Remove the previous item's logo so it cannot
            remain stuck on screen.
        */

        layers.logo.removeAttribute(
            "src"
        );


        layers.logo.classList.remove(
            "visible"
        );


        layers.logo.classList.remove(
            "has-artwork"
        );


        displayedPreviewLogoSource =
            "";


        return;

    }


    const resolvedSource =
        resolveLocalAssetPath(
            source
        );


    /*
        Do nothing if this exact logo is already displayed.
    */

    if (
        displayedPreviewLogoSource ===
        resolvedSource
    ) {

        return;

    }


    /*
        The new image has already been preloaded.

        Replace the old source exactly once.
    */

    layers.logo.onload =
        () => {

            if (
                requestId !==
                artworkSelectionRequestId
            ) {

                return;

            }


            layers.logo.classList.add(
                "has-artwork"
            );


            layers.logo.classList.add(
                "visible"
            );

        };


    layers.logo.src =
        resolvedSource;


    displayedPreviewLogoSource =
        resolvedSource;

}


/*
    ========================================================
    SET PREVIEW ARTWORK MODE
    ========================================================
*/

function setPreviewArtworkMode(
    item,
    hasCover,
    hasLogo
) {

    const layers =
        getSelectionArtworkLayers();


    if (
        !layers
    ) {

        return;

    }


    const boxArt =
        isBoxArtItem(
            item
        );


    layers.container.classList.toggle(
        "boxart-mode",
        boxArt
    );


    layers.container.classList.toggle(
        "has-cover",
        Boolean(
            hasCover
        )
    );


    layers.container.classList.toggle(
        "has-logo",
        Boolean(
            hasLogo
        )
    );


    layers.overlay.classList.toggle(
        "visible",
        Boolean(
            hasCover
        )
    );

}


/*
    ========================================================
    UPDATE PREVIEW ARTWORK
    ========================================================
*/

function updatePreviewArtwork(
    item
) {

    const layers =
        getSelectionArtworkLayers();


    if (
        !layers
    ) {

        return;

    }


    const requestId =
        artworkSelectionRequestId;


    const artwork =
        getPreviewArtwork(
            item
        );


    let cover =
        "";


    /*
        ====================================================
        STEAM
        ====================================================
    */

    if (
        isSteamItem(
            item
        )
    ) {

        cover =
            artwork.hero ||
            artwork.background ||
            artwork.cover ||
            "";

    }


    /*
        ====================================================
        BOX ART
        ====================================================
    */

    else if (
        isBoxArtItem(
            item
        )
    ) {

        cover =
            artwork.cover ||
            "";

    }


    /*
        ====================================================
        GENERIC
        ====================================================
    */

    else {

        cover =
            artwork.cover ||
            artwork.cover ||
            artwork.hero ||
            "";

    }


    const logo =
        artwork.logo ||
        "";


    /*
        ====================================================
        LOGO
        ====================================================

        If the new item has no logo, immediately remove the
        old logo.

        Otherwise preload the new logo before swapping it.
    */

    if (
        logo
    ) {

        preloadPreviewImage(
            logo,
            requestId
        ).then(
            (
                loaded
            ) => {

                if (
                    !loaded ||
                    requestId !==
                        artworkSelectionRequestId
                ) {

                    return;

                }


                setPreviewLogo(
                    logo,
                    requestId
                );

            }
        );

    }

    else {

        setPreviewLogo(
            "",
            requestId
        );

    }


    /*
        ====================================================
        COVER
        ====================================================
    */

    if (
        cover
    ) {

        preloadPreviewImage(
            cover,
            requestId
        ).then(
            (
                loaded
            ) => {

                if (
                    !loaded ||
                    requestId !==
                        artworkSelectionRequestId
                ) {

                    return;

                }


                setPreviewCover(
                    cover,
                    requestId
                );

            }
        );

    }

    else {

        /*
            No new cover exists.

            Remove the previous cover rather than leaving
            another item's artwork stuck on screen.
        */

        if (
            layers.cover
        ) {

            layers.cover.removeAttribute(
                "src"
            );


            layers.cover.classList.remove(
                "visible"
            );


            layers.cover.classList.remove(
                "has-artwork"
            );

        }


        displayedPreviewCoverSource =
            "";

    }


    /*
        ====================================================
        ARTWORK MODE
        ====================================================
    */

    setPreviewArtworkMode(
        item,
        Boolean(
            cover
        ),
        Boolean(
            logo
        )
    );


    /*
        ====================================================
        FALLBACK COVER
        ====================================================
    */

    if (
        !layers.cover &&
        selectionArtworkImage
    ) {

        const fallback =
            cover ||
            "";


        if (
            fallback
        ) {

            selectionArtworkImage.src =
                resolveLocalAssetPath(
                    fallback
                );


            selectionArtworkImage.classList.add(
                "visible"
            );

        }

    }

}


/*
    ========================================================
    RENDER ACTIONS
    ========================================================
*/

function renderActions(
    actions,
    selectedIndex = 0
) {

    const container =
        document.getElementById(
            "actions"
        );


    if (
        !container
    ) {

        return;

    }


    container.innerHTML =
        "";


    if (
        !Array.isArray(actions)
    ) {

        return;

    }


    actions.forEach(
        (
            action,
            index
        ) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "action";


            element.dataset.index =
                index;


            element.textContent =
                action.name ||
                "Action";


            if (
                index === selectedIndex
            ) {

                element.classList.add(
                    "selected"
                );

            }


            container.appendChild(
                element
            );

        }
    );

}


/*
    ========================================================
    ACTION SELECTION
    ========================================================
*/

function updateActionSelection(
    actionIndex
) {

    const actions =
        document.querySelectorAll(
            "#actions .action"
        );


    actions.forEach(
        (
            action,
            index
        ) => {

            action.classList.toggle(
                "selected",
                index === actionIndex
            );

        }
    );

}


/*
    ========================================================
    PREVIEW PANEL
    ========================================================
*/

function updatePreview(
    item
) {

    artworkSelectionRequestId++;


    if (
        !item
    ) {

        clearSelectionArtwork();


        if (
            selectionPlatform
        ) {

            selectionPlatform.textContent =
                "";

        }


        if (
            selectionTitle
        ) {

            selectionTitle.textContent =
                "";

        }


        if (
            selectionDescription
        ) {

            selectionDescription.textContent =
                "";

        }


        if (
            selectionStatus
        ) {

            selectionStatus.textContent =
                "";

        }


        return;

    }


    updatePreviewArtwork(
        item
    );


    if (
        selectionPlatform
    ) {

        selectionPlatform.textContent =
            item.metadata?.platform ||
            item.platform ||
            "";

    }


    if (
        selectionTitle
    ) {

        selectionTitle.textContent =
            item.metadata?.name ||
            item.name ||
            "";

    }


    if (
        selectionDescription
    ) {

        selectionDescription.textContent =
            item.metadata?.description ||
            item.description ||
            "";

    }


    if (
        selectionStatus
    ) {

        selectionStatus.textContent =
            item.status ||
            "";

    }

}


/*
    ========================================================
    UPDATE BACKGROUND
    ========================================================

    PS3-style behavior:

        Current background stays visible while the next
        background loads.

        Once the next image is ready:

            load new image
                ↓
            swap source
                ↓
            keep visible

    There is no hide → wait → show cycle on every
    navigation event.
*/

function updateBackground(
    item
) {

    const requestId =
        ++backgroundRequestId;


    const artwork =
        item?.artworkMetadata ||
        {};


    const backgroundSource =
        isSteamItem(
            item
        )

            ? (
                artwork.hero ||
                artwork.background ||
                artwork.cover ||
                item?.background ||
                ""
            )

            : (
                artwork.background ||
                artwork.hero ||
                item?.background ||
                ""
            );


    /*
        If there is no new background, leave the current one
        alone.

        This prevents the screen from briefly becoming empty
        while artwork is being retrieved.
    */

    if (
        !backgroundSource
    ) {

        return;

    }


    if (
        !backgroundArtworkImage
    ) {

        return;

    }


    const resolvedSource =
        resolveLocalAssetPath(
            backgroundSource
        );


    /*
        If this exact background is already visible, there
        is nothing to do.
    */

    if (
        displayedBackgroundSource ===
        resolvedSource
    ) {

        return;

    }


    /*
        ====================================================
        ALREADY CACHED
        ====================================================
    */

    if (
        failedArtworkSources.has(
            resolvedSource
        )
    ) {

        return;

    }


    if (
        loadedBackgroundSources.has(
            resolvedSource
        )
    ) {

        if (
            requestId !==
            backgroundRequestId
        ) {

            return;

        }


        const currentItem =
            getRenderedCurrentItemData();


        if (
            currentItem &&
            item?.id &&
            currentItem.id !==
                item.id
        ) {

            return;

        }


        backgroundArtworkImage.src =
            resolvedSource;


        backgroundArtwork?.classList.add(
            "visible"
        );


        displayedBackgroundSource =
            resolvedSource;


        return;

    }


    /*
        ====================================================
        PRELOAD NEW BACKGROUND
        ====================================================

        The existing background remains visible while the
        browser downloads and decodes the new image.
    */

    const preload =
        new Image();


    preload.onload =
        () => {

            if (
                requestId !==
                backgroundRequestId
            ) {

                return;

            }


            const currentItem =
                getRenderedCurrentItemData();


            if (
                currentItem &&
                item?.id &&
                currentItem.id !==
                    item.id
            ) {

                return;

            }


            loadedBackgroundSources.add(
                resolvedSource
            );


            /*
                Swap only after the image is completely
                loaded.

                The old background was never hidden.
            */

            backgroundArtworkImage.src =
                resolvedSource;


            backgroundArtwork?.classList.add(
                "visible"
            );


            displayedBackgroundSource =
                resolvedSource;

        };


    preload.onerror =
        () => {

            failedArtworkSources.add(
                resolvedSource
            );

            if (
                requestId !==
                backgroundRequestId
            ) {

                return;

            }


            console.warn(
                "Background artwork failed to load:",
                resolvedSource
            );

        };


    preload.src =
        resolvedSource;

}


/*
    ========================================================
    SCHEDULE EXPENSIVE ITEM ARTWORK
    ========================================================

    Text, selection state and menu movement happen
    immediately.

    Large artwork operations wait 90ms.

    If the user presses DOWN several times quickly, the
    previous timer is cancelled and only the final item
    gets the expensive artwork request.
*/

function scheduleItemArtwork(
    item
) {

    if (
        pendingArtworkUpdateTimer
    ) {

        clearTimeout(
            pendingArtworkUpdateTimer
        );

    }


    if (
        !item
    ) {

        return;

    }


    const itemId =
        item.id;


    pendingArtworkUpdateTimer =
        setTimeout(
            () => {

                pendingArtworkUpdateTimer =
                    null;


                const currentItem =
                    getRenderedCurrentItemData();


                if (
                    !currentItem ||
                    currentItem.id !==
                        itemId
                ) {

                    return;

                }


                updateBackground(
                    item
                );


                loadDynamicArtwork(
                    item
                );

            },
            ARTWORK_NAVIGATION_DELAY
        );

}


/*
    ========================================================
    DYNAMIC THEME
    ========================================================
*/

function updateDynamicTheme(
    category,
    item
) {

    if (
        !category
    ) {

        return;

    }


    let themeName =
        category.theme ||
        "default";


    if (
        item &&
        item.theme
    ) {

        themeName =
            item.theme;

    }


    applyTheme(
        themeName
    );

}


/*
    ========================================================
    APPLY THEME
    ========================================================
*/

function applyTheme(
    themeName
) {

    const themeCollection =
        window.themesData ||
        window.xmbThemes ||
        {};


    const theme =
        themeCollection[
            themeName
        ] ||
        themeCollection.default;


    /*
        A stale item theme should never break the interface.
        Fall back quietly to the default theme instead of
        filling the console during normal navigation.
    */

    if (
        !theme
    ) {

        return;

    }


    if (
        theme.primary
    ) {

        document.documentElement.style.setProperty(
            "--xmb-primary",
            theme.primary
        );


        document.documentElement.style.setProperty(
            "--theme-primary",
            theme.primary
        );

    }


    if (
        theme.secondary
    ) {

        document.documentElement.style.setProperty(
            "--xmb-secondary",
            theme.secondary
        );


        document.documentElement.style.setProperty(
            "--theme-background",
            theme.secondary
        );


        document.documentElement.style.setProperty(
            "--theme-secondary",
            theme.secondary
        );

    }


    if (
        theme.accent
    ) {

        document.documentElement.style.setProperty(
            "--xmb-accent",
            theme.accent
        );

    }


    if (
        theme.glow
    ) {

        document.documentElement.style.setProperty(
            "--xmb-glow",
            theme.glow
        );

    }


    if (
        theme.highlight
    ) {

        document.documentElement.style.setProperty(
            "--theme-highlight",
            theme.highlight
        );

    }


    document.body.dataset.theme =
        themeName;

}


/*
    ========================================================
    MAIN INTERFACE UPDATE
    ========================================================
*/

function updateInterface(
    navigationState,
    animate = true
) {

    if (
        !navigationState
    ) {

        return;

    }


    const navigationLevel =
        navigationState.level;


    const categoryName =
        navigationState.category;


    const categoryIndex =
        navigationState.categoryIndex ??
        0;


    const itemIndex =
        navigationState.itemIndex ??
        0;


    const actionIndex =
        navigationState.actionIndex ??
        0;


    const category =
        window.categoriesData?.[
            categoryName
        ];


    if (
        !category
    ) {

        return;

    }


    updateRendererCategorySelection(
        categoryIndex
    );


    /*
        ====================================================
        CATEGORY LEVEL
        ====================================================
    */

    if (
        navigationLevel ===
        "categories"
    ) {

        artworkSelectionRequestId++;

        backgroundRequestId++;


        if (
            pendingArtworkUpdateTimer
        ) {

            clearTimeout(
                pendingArtworkUpdateTimer
            );


            pendingArtworkUpdateTimer =
                null;

        }


        if (
            categoryHeading
        ) {

            categoryHeading.classList.remove(
                "navigation-visible"
            );

        }


        if (
            itemArea
        ) {

            itemArea.classList.remove(
                "navigation-visible"
            );

        }


        if (
            selectionPreview
        ) {

            selectionPreview.classList.remove(
                "navigation-visible"
            );

        }


        if (
            actionArea
        ) {

            actionArea.classList.remove(
                "navigation-visible"
            );

        }


        clearSelectionArtwork();


        updateDynamicTheme(
            category,
            null
        );


        renderRendererItemList(
            [],
            0
        );


        renderedCategoryName =
            "";


        renderedItemSignature =
            "";


        renderActions(
            [],
            0
        );


        return;

    }


    /*
        ====================================================
        ITEM LEVEL
        ====================================================
    */

    if (
        categoryHeading
    ) {

        categoryHeading.classList.add(
            "navigation-visible"
        );

    }


    if (
        itemArea
    ) {

        itemArea.classList.add(
            "navigation-visible"
        );

    }


    if (
        selectionPreview
    ) {

        selectionPreview.classList.add(
            "navigation-visible"
        );

    }


    if (
        actionArea
    ) {

        actionArea.classList.add(
            "navigation-visible"
        );

    }


    /*
        ====================================================
        CATEGORY INFORMATION
        ====================================================
    */

    if (
        selectedCategoryElement
    ) {

        selectedCategoryElement.textContent =
            categoryName ||
            "";

    }


    if (
        categoryDescription
    ) {

        categoryDescription.textContent =
            category.description ||
            "";

    }


    /*
        ====================================================
        GET ENRICHED ITEMS
        ====================================================
    */

    const enrichedItems =
        getEnrichedCategoryItems(
            categoryName,
            category
        );


    /*
        ====================================================
        DETERMINE WHETHER THE LIST ACTUALLY CHANGED
        ====================================================
    */

    const itemSignature =
        getItemListSignature(
            enrichedItems
        );


    const listChanged =
        renderedCategoryName !==
            categoryName ||

        renderedItemSignature !==
            itemSignature;


    /*
        ====================================================
        ONLY REBUILD DOM WHEN NECESSARY
        ====================================================
    */

    if (
        listChanged
    ) {

        renderRendererItemList(
            enrichedItems,
            itemIndex
        );


        renderedCategoryName =
            categoryName;

    }


    /*
        Selection changes now only toggle the selected
        class instead of rebuilding the whole list.
    */

    updateRendererItemSelection(
        itemIndex
    );


    /*
        ====================================================
        CURRENT ITEM
        ====================================================
    */

    const item =
        enrichedItems[
            itemIndex
        ] ||
        null;


    /*
        ====================================================
        THEME
        ====================================================
    */

    updateDynamicTheme(
        category,
        item
    );


    /*
        ====================================================
        PREVIEW
        ====================================================

        Preview text updates immediately.

        Existing cached artwork can also display
        immediately.

        Expensive new artwork is scheduled below.
    */

    updatePreview(
        item
    );


    /*
        ====================================================
        DYNAMIC ARTWORK / BACKGROUND
        ====================================================
    */

    scheduleItemArtwork(
        item
    );


    /*
        ====================================================
        ACTIONS
        ====================================================
    */

    const actions =
        Array.isArray(
            item?.actions
        )
            ? item.actions
            : [];


    renderActions(
        actions,
        actionIndex
    );


    updateActionSelection(
        actionIndex
    );


    if (
        animate
    ) {

        /*
            Reserved for transition animation work.
        */

    }

}


/*
    ========================================================
    PUBLIC RENDERER API
    ========================================================
*/

window.xmbRenderer = {

    initializeInterface,

    initializeSelectionArtwork,

    updateCategorySelection:
        updateRendererCategorySelection,

    renderItemList:
        renderRendererItemList,

    updateItemSelection:
        updateRendererItemSelection,

    updateInterface,

    updatePreview,

    updatePreviewArtwork,

    updateBackground,

    updateDynamicTheme,

    applyTheme,

    loadDynamicArtwork,

    clearDynamicArtworkCache

};


/*
    ========================================================
    INITIALIZATION COMPLETE
    ========================================================
*/

console.log(
    "XMB renderer loaded."
);