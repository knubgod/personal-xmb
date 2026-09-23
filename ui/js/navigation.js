/*
    ========================================================
    PERSONAL XMB
    NAVIGATION
    ========================================================

    Controls:

        CATEGORIES
             ↓
        ITEMS
             ↓
        OPTIONS

*/


let navigationLevel = "categories";

let currentCategory = 0;

let currentItem = 0;

let currentAction = 0;


/*
    ========================================================
    CATEGORY HELPERS
    ========================================================
*/

function getCategoryNames() {

    if (
        !window.categoriesData
    ) {

        return [];

    }


    return Object.keys(
        window.categoriesData
    );

}


function getCurrentCategoryData() {

    const categoryNames =
        getCategoryNames();


    return (
        window.categoriesData[
            categoryNames[currentCategory]
        ] || null
    );

}


/*
    ========================================================
    ITEM HELPERS
    ========================================================
*/

function getCurrentItems() {

    const category =
        getCurrentCategoryData();


    if (!category) {

        return [];

    }


    return Array.isArray(
        category.items
    )
        ? category.items
        : [];

}


function getCurrentItemData() {

    const items =
        getCurrentItems();


    return (
        items[currentItem] || null
    );

}


/*
    ========================================================
    ACTION HELPERS
    ========================================================
*/

function getCurrentActions() {

    const item =
        getCurrentItemData();


    if (!item) {

        return [];

    }


    return Array.isArray(
        item.actions
    )
        ? item.actions
        : [];

}


/*
    ========================================================
    NAVIGATION STATE
    ========================================================
*/

function getNavigationState() {

    const categoryNames =
        getCategoryNames();


    const categoryName =
        categoryNames[currentCategory] ||
        null;


    const item =
        getCurrentItemData();


    const actions =
        getCurrentActions();


    return {

        level:
            navigationLevel,

        category:
            categoryName,

        categoryIndex:
            currentCategory,

        item:
            item?.id ||
            null,

        itemIndex:
            currentItem,

        option:
            actions[currentAction] ||
            null,

        actionIndex:
            currentAction

    };

}


/*
    ========================================================
    REFRESH INTERFACE
    ========================================================
*/

function refreshNavigation(
    animate = true
) {

    if (
        typeof updateInterface ===
        "function"
    ) {

        updateInterface(
            getNavigationState(),
            animate
        );

    }


    updateNavigationHints();

}


/*
    ========================================================
    OPTIONS PANEL STATE

    CHANGED:

    The navigation system already had an Options state.
    This function now remains the single source of truth
    for opening/closing the visual panel.

    The CSS responds to:

        body.options-open

    while navigationLevel controls keyboard behavior.
    ========================================================
*/

function setOptionsPanel(
    open
) {

    document.body.classList.toggle(
        "options-open",
        Boolean(open)
    );

}


/*
    ========================================================
    ENTER ITEM LEVEL
    ========================================================
*/

function enterItemLevel() {

    const items =
        getCurrentItems();


    if (
        items.length === 0
    ) {

        return;

    }


    navigationLevel =
        "items";


    currentItem =
        0;


    currentAction =
        0;


    setOptionsPanel(
        false
    );


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    OPEN OPTIONS
    ========================================================
*/

function openOptions() {

    /*
        If the options menu is already open,
        pressing O closes it.

        This gives O the same toggle behavior
        as a console options button.
    */

    if (
        navigationLevel ===
        "options"
    ) {

        goBack();

        return;

    }


    if (
        navigationLevel !==
        "items"
    ) {

        return;

    }


    const actions =
        getCurrentActions();


    if (
        actions.length === 0
    ) {

        showTemporaryMessage(
            "No options available."
        );

        return;

    }


    /*
        CHANGED:

        Opening Options always starts at the first
        available action.

        The selected game itself does not change.
    */

    navigationLevel =
        "options";


    currentAction =
        0;


    setOptionsPanel(
        true
    );


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    GO BACK
    ========================================================
*/

function goBack() {

    /*
        OPTIONS → ITEMS
    */

    if (
        navigationLevel ===
        "options"
    ) {

        /*
            CHANGED:

            Closing Options returns control directly
            to the currently selected game.

            The game selection itself is preserved.
        */

        navigationLevel =
            "items";


        currentAction =
            0;


        setOptionsPanel(
            false
        );


        window.xmbAudio?.back?.();


        refreshNavigation(
            true
        );


        return;

    }


    /*
        ITEMS → CATEGORIES
    */

    if (
        navigationLevel ===
        "items"
    ) {

        navigationLevel =
            "categories";


        window.xmbAudio?.back?.();


        currentItem =
            0;


        currentAction =
            0;


        setOptionsPanel(
            false
        );


        refreshNavigation(
            true
        );


        return;

    }

}


/*
    ========================================================
    MOVE CATEGORY
    ========================================================
*/

function moveCategory(
    direction
) {

    if (
        navigationLevel !==
        "categories"
    ) {

        return;

    }


    const categories =
        getCategoryNames();


    if (
        categories.length === 0
    ) {

        return;

    }


    currentCategory +=
        direction;


    if (
        currentCategory < 0
    ) {

        currentCategory =
            categories.length - 1;

    }


    if (
        currentCategory >=
        categories.length
    ) {

        currentCategory =
            0;

    }


    currentItem =
        0;


    currentAction =
        0;


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    MOVE ITEM
    ========================================================
*/

function moveItem(
    direction
) {

    if (
        navigationLevel !==
        "items"
    ) {

        return;

    }


    const items =
        getCurrentItems();


    if (
        items.length === 0
    ) {

        return;

    }


    currentItem +=
        direction;


    if (
        currentItem < 0
    ) {

        currentItem =
            items.length - 1;

    }


    if (
        currentItem >=
        items.length
    ) {

        currentItem =
            0;

    }


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    MOVE ACTION
    ========================================================
*/

function moveAction(
    direction
) {

    if (
        navigationLevel !==
        "options"
    ) {

        return;

    }


    const actions =
        getCurrentActions();


    if (
        actions.length === 0
    ) {

        return;

    }


    currentAction +=
        direction;


    if (
        currentAction < 0
    ) {

        currentAction =
            actions.length - 1;

    }


    if (
        currentAction >=
        actions.length
    ) {

        currentAction =
            0;

    }


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    SELECT CATEGORY
    ========================================================
*/

function selectCategory(
    index
) {

    const categories =
        getCategoryNames();


    if (
        index < 0 ||
        index >= categories.length
    ) {

        return;

    }


    currentCategory =
        index;


    currentItem =
        0;


    currentAction =
        0;


    setOptionsPanel(
        false
    );


    navigationLevel =
        "categories";


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    SELECT ITEM
    ========================================================
*/

function selectItem(
    index
) {

    const items =
        getCurrentItems();


    if (
        index < 0 ||
        index >= items.length
    ) {

        return;

    }


    currentItem =
        index;


    currentAction =
        0;


    refreshNavigation(
        true
    );

}


/*
    ========================================================
    SELECT CURRENT ITEM
    ========================================================

    CHANGED - PASS 3 / PASS 4:

    Pressing ENTER while a game is selected launches the
    selected item directly.

    The navigation system does not need to know whether
    the item is:

        Steam
        Riot
        Xbox
        PC
        etc.

    That decision is handled by main.js through the
    launchItem() bridge.
    ========================================================
*/

async function selectCurrentItem() {

    if (
        navigationLevel !==
        "items"
    ) {

        return;

    }


    const item =
        getCurrentItemData();


    if (!item) {

        return;

    }


    const launchAction = {

        name:
            "Launch",

        action:
            "launch"

    };


    window.xmbAudio?.select?.();


    await executeAction(
        launchAction
    );

}


/*
    ========================================================
    SELECT CURRENT ACTION
    ========================================================
*/

async function selectCurrentAction() {

    if (
        navigationLevel !==
        "options"
    ) {

        return;

    }


    const actions =
        getCurrentActions();


    const action =
        actions[currentAction];


    if (!action) {

        return;

    }


    await executeAction(
        action
    );

}


/*
    ========================================================
    EXECUTE ACTION
    ========================================================
*/

async function executeAction(
    action
) {

    const item =
        getCurrentItemData();


    if (
        !item ||
        !action
    ) {

        return;

    }


    /*
        =================================================
        LAUNCH
        =================================================

        CHANGED - PASS 3 / PASS 4:

        Steam and Riot both arrive here.

        Steam example:

            launchType:
                "steam"

            steamAppId:
                "204360"

        Riot example:

            launchType:
                "riot"

            riotProduct:
                "league_of_legends"

            riotPatchline:
                "live"

        navigation.js does NOT directly launch either
        service.

        It passes the complete item to the Electron
        preload bridge:

            window.electron.launchItem(item)

        main.js then decides how that item should
        actually be launched.
    */

    if (
        action.action ===
        "launch"
    ) {

        if (
            !window.electron ||
            typeof window.electron.launchItem !==
            "function"
        ) {

            showTemporaryMessage(
                "Launcher service is unavailable."
            );

            return;

        }


        window.xmbAudio?.launch?.();


        showTemporaryMessage(
            `Launching ${item.name}...`
        );


        try {

            const result =
                await window.electron.launchItem(
                    item
                );


            if (
                result &&
                result.success
            ) {

                showTemporaryMessage(
                    `${item.name} launched.`
                );

            }
            else {

                showTemporaryMessage(
                    result?.error ||
                    `Unable to launch ${item.name}.`
                );

            }

        }
        catch (
            error
        ) {

            console.error(
                "Launch error:",
                error
            );


            showTemporaryMessage(
                `Unable to launch ${item.name}.`
            );

        }


        return;

    }


    /*
        =================================================
        SPOTIFY LOGIN
        =================================================
    */

    if (
        action.action ===
        "spotify-login"
    ) {

        showTemporaryMessage(
            "Opening Spotify authorization..."
        );


        if (
            window.spotifyService &&
            typeof window.spotifyService.login ===
            "function"
        ) {

            try {

                await window.spotifyService.login();

            }
            catch (
                error
            ) {

                console.error(
                    "Spotify login failed:",
                    error
                );


                showTemporaryMessage(
                    "Spotify authorization failed."
                );

            }

        }
        else {

            showTemporaryMessage(
                "Spotify service is unavailable."
            );

        }


        return;

    }


    /*
        =================================================
        INFORMATION
        =================================================
    */

    if (
        action.action ===
        "info"
    ) {

        showTemporaryMessage(
            item.description ||
            item.metadata?.description ||
            "No additional information available."
        );


        return;

    }


    /*
        =================================================
        SOURCE
        =================================================
    */

    if (
        action.action ===
        "source"
    ) {

        if (
            item.source &&
            window.electron &&
            typeof window.electron.openExternal ===
            "function"
        ) {

            window.electron.openExternal(
                item.source
            );

        }
        else {

            showTemporaryMessage(
                "No source link is configured."
            );

        }


        return;

    }


    /*
        =================================================
        SETTINGS
        =================================================
    */

    if (
        action.action ===
        "settings"
    ) {

        showTemporaryMessage(
            "Settings are coming soon."
        );


        return;

    }


    /*
        =================================================
        THEMES
        =================================================
    */

    if (
        action.action ===
        "themes"
    ) {

        showTemporaryMessage(
            "Theme settings are coming soon."
        );


        return;

    }


    /*
        =================================================
        AUDIO
        =================================================
    */

    if (
        action.action ===
        "audio"
    ) {

        showTemporaryMessage(
            "Audio settings are coming soon."
        );


        return;

    }


    /*
        =================================================
        SPOTIFY RECENT
        =================================================
    */

    if (
        action.action ===
        "spotify-recent"
    ) {

        showTemporaryMessage(
            "Recently Played is coming soon."
        );


        return;

    }


    /*
        =================================================
        FALLBACK
        =================================================
    */

    showTemporaryMessage(
        action.name ||
        "Action not implemented yet."
    );

}


/*
    ========================================================
    TEMPORARY MESSAGE
    ========================================================
*/

function showTemporaryMessage(
    message
) {

    const element =
        document.getElementById(
            "temporary-message"
        );


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.classList.add(
        "visible"
    );


    clearTimeout(
        window.xmbMessageTimeout
    );


    window.xmbMessageTimeout =
        setTimeout(
            () => {

                element.classList.remove(
                    "visible"
                );

            },
            1800
        );

}


/*
    ========================================================
    KEYBOARD INPUT
    ========================================================
*/

document.addEventListener(
    "keydown",
    async (event) => {

        if (
            window.xmbAudio &&
            typeof window.xmbAudio.unlock ===
                "function"
        ) {

            await window.xmbAudio.unlock();

        }

        if (
            event.repeat
        ) {

            return;

        }


        const key =
            event.key.toLowerCase();


        /*
            =================================================
            CATEGORIES
            =================================================
        */

        if (
            navigationLevel ===
            "categories"
        ) {

            if (
                key ===
                "arrowleft"
            ) {

                event.preventDefault();

                moveCategory(
                    -1
                );

                window.xmbAudio?.category?.();

                return;

            }


            if (
                key ===
                "arrowright"
            ) {

                event.preventDefault();

                moveCategory(
                    1
                );

                window.xmbAudio?.category?.();

                return;

            }


            if (
                key ===
                "arrowdown" ||
                key ===
                "enter"
            ) {

                event.preventDefault();

                enterItemLevel();

                return;

            }


            return;

        }


        /*
            =================================================
            ITEMS
            =================================================
        */

        if (
            navigationLevel ===
            "items"
        ) {

            if (
                key ===
                "escape" ||
                key ===
                "arrowleft"
            ) {

                event.preventDefault();

                goBack();

                return;

            }


            if (
                key ===
                "arrowup"
            ) {

                event.preventDefault();

                moveItem(
                    -1
                );

                window.xmbAudio?.navigation?.();

                return;

            }


            if (
                key ===
                "arrowdown"
            ) {

                event.preventDefault();

                moveItem(
                    1
                );

                window.xmbAudio?.navigation?.();

                return;

            }


            /*
                CHANGED:

                O opens the Options panel while keeping
                the current game selected.
            */

            if (
                key ===
                "o"
            ) {

                event.preventDefault();

                openOptions();

                return;

            }


            /*
                CHANGED - PASS 3 / PASS 4:

                ENTER launches the selected game.

                This works for Steam, Riot, and any other
                launcher supported by main.js.
            */

            if (
                key ===
                "enter"
            ) {

                event.preventDefault();

                await selectCurrentItem();

                return;

            }

        }


        /*
            =================================================
            OPTIONS
            =================================================
        */

        if (
            navigationLevel ===
            "options"
        ) {

            /*
                CHANGED:

                O, Escape and Left all close the panel.

                This makes the panel feel like a temporary
                XMB submenu rather than a separate screen.
            */

            if (
                key ===
                "escape" ||
                key ===
                "arrowleft" ||
                key ===
                "o"
            ) {

                event.preventDefault();

                goBack();

                return;

            }


            if (
                key ===
                "arrowup"
            ) {

                event.preventDefault();

                moveAction(
                    -1
                );

                window.xmbAudio?.navigation?.();

                return;

            }


            if (
                key ===
                "arrowdown"
            ) {

                event.preventDefault();

                moveAction(
                    1
                );

                window.xmbAudio?.navigation?.();

                return;

            }


            if (
                key ===
                "enter"
            ) {

                event.preventDefault();

                await selectCurrentAction();

                return;

            }

        }

    }
);


/*
    ========================================================
    NAVIGATION HINTS
    ========================================================
*/

function updateNavigationHints() {

    const mode =
        document.getElementById(
            "input-mode"
        );


    const backButton =
        document.getElementById(
            "back-button"
        );


    const backLabel =
        document.getElementById(
            "back-label"
        );


    const selectButton =
        document.getElementById(
            "select-button"
        );


    const selectLabel =
        document.getElementById(
            "select-label"
        );


    const optionsButton =
        document.getElementById(
            "options-button"
        );


    const optionsLabel =
        document.getElementById(
            "options-label"
        );


    if (mode) {

        mode.textContent =
            "KEYBOARD";

    }


    if (backButton) {

        backButton.textContent =
            "ESC";

    }


    if (backLabel) {

        backLabel.textContent =
            "Back";

    }


    if (selectButton) {

        selectButton.textContent =
            "ENTER";

    }


    if (selectLabel) {

        selectLabel.textContent =
            navigationLevel ===
            "categories"
                ? "Open"
                : "Select";

    }


    if (optionsButton) {

        optionsButton.textContent =
            "O";

    }


    if (optionsLabel) {

        optionsLabel.textContent =
            navigationLevel ===
            "options"
                ? "Close"
                : "Options";

    }

}


/*
    ========================================================
    PUBLIC NAVIGATION API
    ========================================================
*/

window.xmbNavigation = {

    getLevel:
        () =>
            navigationLevel,

    getCategory:
        () =>
            currentCategory,

    getItem:
        () =>
            currentItem,

    getAction:
        () =>
            currentAction,

    getCurrentCategory:
        getCurrentCategoryData,

    getCurrentItem:
        getCurrentItemData,

    getCurrentActions:
        getCurrentActions,

    getState:
        getNavigationState,

    selectCategory:
        selectCategory,

    selectItem:
        selectItem,

    enterItems:
        enterItemLevel,

    openOptions:
        openOptions,

    goBack:
        goBack

};