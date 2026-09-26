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

    const direction =
        selectedIndex > previousCategoryIndex
            ? "forward"
            : selectedIndex < previousCategoryIndex
                ? "backward"
                : "";

    if(viewport && direction){
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

        clearTimeout(
            viewport._categoryMotionTimer
        );

        viewport._categoryMotionTimer =
            setTimeout(()=>{
                viewport.classList.remove(
                    "category-moving-forward",
                    "category-moving-backward"
                );
            },260);
    }

    categories.forEach(
        (
            category,
            index
        ) => {

            category.classList.toggle(
                "selected",
                index === selectedIndex
            );

            if(index === selectedIndex){
                category.scrollIntoView({
                    behavior:"smooth",
                    block:"nearest",
                    inline:"center"
                });
            }

        }
    );

    previousCategoryIndex = selectedIndex;
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