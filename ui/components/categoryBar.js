/*
    ========================================================
    CATEGORY BAR
    ========================================================
*/

const categoryIconCache = new Map();
const categoryIconRequests = new Map();
const failedCategoryIcons = new Set();
let categoryArtworkManifestReady = false;


/*
    ========================================================
    RENDER CATEGORY BAR
    ========================================================
*/

/*
    ========================================================
    PRELOADED CATEGORY ARTWORK
    ========================================================
*/

const categoryArtworkManifest = {};

function setCategoryArtworkManifest(
    manifest
) {

    Object.keys(
        categoryArtworkManifest
    ).forEach(
        key => delete categoryArtworkManifest[key]
    );

    Object.assign(
        categoryArtworkManifest,
        manifest || {}
    );

    categoryArtworkManifestReady = true;

}


/*
    ========================================================
    RENDER CATEGORY BAR
    ========================================================
*/

function renderCategoryBar(
    categoryNames,
    selectedIndex = 0
) {

    const container =
        document.getElementById(
            "categories"
        );


    if (
        !container
    ) {

        console.warn(
            "Category container not found."
        );

        return;
    }


    container.innerHTML = "";


    categoryNames.forEach(
        (
            categoryName,
            index
        ) => {

            const category =
                document.createElement(
                    "div"
                );


            category.className =
                "category";


            category.dataset.index =
                index;


            category.dataset.categoryName =
                categoryName;


            /*
                ====================================================
                ICON
                ====================================================
            */

            const iconContainer =
                document.createElement(
                    "div"
                );


            iconContainer.className =
                "category-icon";


            /*
                ====================================================
                NAME
                ====================================================
            */

            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "category-name";


            name.textContent =
                categoryName;


            /*
                ====================================================
                BUILD CATEGORY
                ====================================================
            */

            category.appendChild(
                iconContainer
            );


            category.appendChild(
                name
            );


            /*
                ====================================================
                SELECTED STATE
                ====================================================
            */

            if (
                index ===
                selectedIndex
            ) {

                category.classList.add(
                    "selected"
                );

            }


            container.appendChild(
                category
            );


            /*
                ====================================================
                LOAD ICON
                ====================================================
            */

            loadCategoryIcon(
                categoryName,
                iconContainer
            );

        }
    );

}


/*
    ========================================================
    LOAD CATEGORY ICON
    ========================================================
*/

async function loadCategoryIcon(
    categoryName,
    container
) {

    /*
        Check memory cache first.
    */

    if (
        categoryIconCache.has(
            categoryName
        )
    ) {

        applyCategoryIcon(
            container,
            categoryIconCache.get(
                categoryName
            )
        );

        return;
    }


    /*
        If another category is already requesting
        this same icon, wait for that request.
    */

    if (
        categoryIconRequests.has(
            categoryName
        )
    ) {

        try {

            const iconUrl =
                await categoryIconRequests.get(
                    categoryName
                );


            if (
                iconUrl
            ) {

                applyCategoryIcon(
                    container,
                    iconUrl
                );

            }

        }
        catch (
            error
        ) {

            console.warn(
                `Failed to load category icon: ${categoryName}`,
                error
            );

        }

        return;
    }


    /*
        Prefer the startup-ready manifest. This keeps category
        navigation completely local after launch.
    */

    const preloadedIcon =
        categoryArtworkManifest[
            categoryName
        ];

    if (preloadedIcon) {

        categoryIconCache.set(
            categoryName,
            preloadedIcon
        );

        applyCategoryIcon(
            container,
            preloadedIcon
        );

        return;

    }


    /*
        Once the startup manifest exists, a null entry is
        authoritative. Do not fall back to IPC/network calls
        on every navigation event.
    */

    if (
        categoryArtworkManifestReady
    ) {

        failedCategoryIcons.add(
            categoryName
        );

        return;

    }

    if (
        failedCategoryIcons.has(
            categoryName
        )
    ) {

        return;

    }

    /*
        Legacy fallback for callers that render the category
        bar before the manifest has been installed.
    */

    if (
        !window.electron ||
        typeof window.electron.getCategoryIcon !==
            "function"
    ) {

        failedCategoryIcons.add(
            categoryName
        );

        return;

    }

    const request =
        window.electron.getCategoryIcon(
            categoryName
        );


    categoryIconRequests.set(
        categoryName,
        request
    );


    try {

        const iconUrl =
            await request;


        if (
            iconUrl
        ) {

            categoryIconCache.set(
                categoryName,
                iconUrl
            );


            applyCategoryIcon(
                container,
                iconUrl
            );

        }

    }
    catch (
        error
    ) {

        console.warn(
            `Failed to load category icon: ${categoryName}`,
            error
        );

    }
    finally {

        categoryIconRequests.delete(
            categoryName
        );

    }

}


/*
    ========================================================
    APPLY CATEGORY ICON
    ========================================================
*/

function applyCategoryIcon(
    container,
    iconUrl
) {

    if (
        !container ||
        !iconUrl
    ) {

        return;
    }


    container.innerHTML = "";


    const image =
        document.createElement(
            "img"
        );


    image.className =
        "category-icon-image";


    image.src =
        iconUrl;


    image.alt =
        "";


    image.draggable =
        false;


    /*
        If an icon fails to display, remove it rather
        than leaving a broken-image symbol.
    */

    image.addEventListener(
        "error",
        () => {

            image.remove();

        }
    );


    container.appendChild(
        image
    );

}


/*
    ========================================================
    UPDATE CATEGORY SELECTION
    ========================================================
*/

let previousCategoryIndex = 0;
let categoryScrollAnimation = null;

function updateCategoryVisibility(
    viewport,
    categories,
    selectedIndex
) {

    if (
        !viewport ||
        !categories.length
    ) {
        return;
    }

    const selected =
        categories[selectedIndex];

    if (!selected) {
        return;
    }

    /*
        The selected category is the visual anchor. Everything
        around it fades according to its actual screen distance,
        rather than by a fixed left/right class.

        This gives the XMB the soft depth effect:
            selected       = 100%
            nearby         = bright
            farther away   = dim
            outside focus  = nearly invisible
    */
    const selectedRect =
        selected.getBoundingClientRect();

    const selectedCenter =
        selectedRect.left +
        selectedRect.width / 2;

    const fadeDistance =
        Math.max(
            250,
            Math.min(
                380,
                viewport.clientWidth * 0.52
            )
        );

    categories.forEach(
        (category, index) => {

            const rect =
                category.getBoundingClientRect();

            const center =
                rect.left +
                rect.width / 2;

            const distance =
                Math.abs(
                    center -
                    selectedCenter
                );

            const normalized =
                Math.min(
                    1,
                    distance /
                    fadeDistance
                );

            /*
                Smooth cubic falloff keeps the first adjacent
                categories readable while quickly fading the
                distant ones.
            */
            const visibility =
                1 -
                (
                    normalized *
                    normalized *
                    (3 - 2 * normalized)
                );

            const isSelected =
                index === selectedIndex;

            category.style.setProperty(
                "--category-distance-opacity",
                isSelected
                    ? "1"
                    : (
                        0.08 +
                        visibility * 0.92
                    ).toFixed(3)
            );
        }
    );
}


function updateCategorySelection(
    selectedIndex
) {

    const categories =
        document.querySelectorAll(
            ".category"
        );

    const viewport =
        document.getElementById(
            "category-viewport"
        );

    if (
        !viewport ||
        !categories.length
    ) {
        previousCategoryIndex =
            selectedIndex;

        return;
    }

    const selected =
        categories[selectedIndex];

    const direction =
        selectedIndex >
        previousCategoryIndex
            ? "forward"
            : selectedIndex <
              previousCategoryIndex
                ? "backward"
                : "";

    categories.forEach(
        (
            category,
            index
        ) => {

            category.classList.toggle(
                "selected",
                index === selectedIndex
            );

        }
    );

    if (!selected) {
        previousCategoryIndex =
            selectedIndex;

        return;
    }

    /*
        Keep the selected category on the left-ish side of the
        viewport. At the beginning/end of the strip the scroll
        naturally clamps, allowing the selected category to move
        farther toward the center when there is no more content
        to scroll.
    */
    const target =
        Math.max(
            0,
            Math.min(
                viewport.scrollWidth -
                    viewport.clientWidth,
                selected.offsetLeft +
                    selected.offsetWidth / 2 -
                    viewport.clientWidth * 0.30
            )
        );

    const start =
        viewport.scrollLeft;

    if (categoryScrollAnimation) {

        cancelAnimationFrame(
            categoryScrollAnimation
        );

        categoryScrollAnimation =
            null;

    }

    updateCategoryVisibility(
        viewport,
        categories,
        selectedIndex
    );

    if (
        direction &&
        Math.abs(
            target -
            start
        ) > 1
    ) {

        viewport.classList.remove(
            "category-moving-forward",
            "category-moving-backward"
        );

        void viewport.offsetWidth;

        viewport.classList.add(
            direction === "forward"
                ? "category-moving-forward"
                : "category-moving-backward"
        );

        const duration =
            410;

        const startedAt =
            performance.now();

        const easeInOut =
            progress =>
                progress < 0.5
                    ? 2 * progress * progress
                    : 1 -
                        Math.pow(
                            -2 * progress + 2,
                            2
                        ) /
                        2;

        const animate =
            now => {

                const progress =
                    Math.min(
                        1,
                        (
                            now -
                            startedAt
                        ) /
                        duration
                    );

                const eased =
                    easeInOut(
                        progress
                    );

                viewport.scrollLeft =
                    start +
                    (
                        target -
                        start
                    ) *
                    eased;

                /*
                    Recalculate visibility while the strip moves.
                    This makes the fade travel naturally with the
                    categories instead of snapping when selection
                    changes.
                */
                updateCategoryVisibility(
                    viewport,
                    categories,
                    selectedIndex
                );

                const velocity =
                    Math.sin(
                        progress *
                        Math.PI
                    );

                viewport.style.setProperty(
                    "--category-motion-blur",
                    (
                        0.15 +
                        velocity * 0.95
                    ).toFixed(3) +
                    "px"
                );

                if (
                    progress < 1
                ) {

                    categoryScrollAnimation =
                        requestAnimationFrame(
                            animate
                        );

                    return;

                }

                viewport.scrollLeft =
                    target;

                updateCategoryVisibility(
                    viewport,
                    categories,
                    selectedIndex
                );

                viewport.style.setProperty(
                    "--category-motion-blur",
                    "0px"
                );

                categoryScrollAnimation =
                    null;

                clearTimeout(
                    viewport._categoryMotionTimer
                );

                viewport._categoryMotionTimer =
                    setTimeout(
                        () => {

                            viewport.classList.remove(
                                "category-moving-forward",
                                "category-moving-backward"
                            );

                        },
                        35
                    );

            };

        viewport.style.setProperty(
            "--category-motion-blur",
            "0px"
        );

        categoryScrollAnimation =
            requestAnimationFrame(
                animate
            );

    }
    else {

        viewport.scrollLeft =
            target;

        updateCategoryVisibility(
            viewport,
            categories,
            selectedIndex
        );

        viewport.style.setProperty(
            "--category-motion-blur",
            "0px"
        );

    }

    previousCategoryIndex =
        selectedIndex;

}


/*
    ========================================================
    PUBLIC API
    ========================================================
*/

window.setCategoryArtworkManifest =
    setCategoryArtworkManifest;


window.renderCategoryBar =
    renderCategoryBar;


window.updateCategorySelection =
    updateCategorySelection;