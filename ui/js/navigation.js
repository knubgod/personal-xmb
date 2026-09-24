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

    window.xmbAudio?.select?.();

    const category = getCurrentCategoryData();

    /*
        Inline XMB surfaces skip the normal item submenu.
        Arrow Down still enters the item level so Left can
        return to the category bar, but the renderer owns
        the visible surface.
    */
    if (
        category?.inlineSurface === "friends"
    ) {

        navigationLevel = "items";
        currentItem = 0;
        currentAction = 0;
        setOptionsPanel(false);
        refreshNavigation(true);
        return;
    }

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

    window.xmbAudio?.options?.();

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

    window.xmbAudio?.select?.();

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

    window.xmbAudio?.select?.();

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


    const actions =
        getCurrentActions();

    /*
        Game/app items with a launch action activate directly.
        Settings-style items do not have launchType; Enter should
        execute their configured action instead of sending an
        invalid synthetic launch request to main.js.
    */

    const launchAction =
        actions.find(
            action =>
                action?.action ===
                "launch"
        );

    const directAction =
        launchAction ||
        (
            actions.length === 1
                ? actions[0]
                : null
        );

    if (
        !directAction
    ) {

        openOptions();
        return;

    }


    window.xmbAudio?.select?.();


    await executeAction(
        directAction
    );

}


/*
    ========================================================
    SELECT CURRENT ACTION
    ========================================================
*/

async function selectCurrentAction() {

    window.xmbAudio?.select?.();

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
        EXIT
        =================================================
    */

    if (
        action.action ===
        "exit"
    ) {

        window.xmbAudio?.back?.();

        if (
            window.electron &&
            typeof window.electron.quitApp ===
            "function"
        ) {

            window.electron.quitApp();

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


    if (["settings","themes","audio","accounts","artwork","system"].includes(action.action)) {
        window.xmbSettings?.open?.(
            action.action === "settings" ? "general" : action.action
        );
        return;
    }

    if (action.action === "friends") {
        window.friendsSurface?.open?.();
        if (!window.friendsSurface) showTemporaryMessage("Friends service is unavailable.");
        return;
    }

    if (action.action === "spotify-now-playing") {
        await window.spotifyService?.refreshNowPlaying?.();
        showTemporaryMessage("Now Playing refreshed.");
        return;
    }

    if (action.action === "spotify-recent") {
        window.spotifyUi?.showRecentlyPlayed?.();
        return;
    }

    if (action.action === "spotify-playlists") {
        window.spotifyUi?.showPlaylists?.();
        return;
    }

    if (action.action === "spotify-search") {
        window.spotifyUi?.showSearch?.();
        return;
    }

    if (action.action === "spotify-shuffle") {
        await window.spotifyService?.toggleShuffle?.();
        showTemporaryMessage(window.spotifyService?.shuffle ? "Shuffle On" : "Shuffle Off");
        return;
    }

    if (action.action === "spotify-repeat") {
        await window.spotifyService?.cycleRepeat?.();
        showTemporaryMessage("Repeat: " + (window.spotifyService?.repeat || "off"));
        return;
    }

    if (action.action === "spotify-launch") {
        const result = await window.electron?.spotifyLaunchDesktop?.();

        if (result?.success) {
            showTemporaryMessage(
                result.alreadyRunning
                    ? "Spotify is already running."
                    : result.launchedByProtocol
                        ? "Spotify launched."
                        : "Spotify launched in the background."
            );
        } else {
            showTemporaryMessage(
                result?.error || "Unable to launch Spotify."
            );
        }

        return;
    }

    if (action.action === "spotify-dj") {
        const result = await window.spotifyService?.openDj?.();
        if (result?.success === false) {
            showTemporaryMessage(result.error || "Unable to open Spotify DJ.");
        } else {
            showTemporaryMessage("Opening Spotify DJ...");
        }
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

        /*
            Settings is a real modal surface. While it is open,
            global XMB navigation must not consume arrow keys,
            Enter, or other form input.
        */

        /*
            Text fields and other editable controls own their
            keyboard input. Do not let XMB shortcuts such as O,
            arrows, or Enter fire while typing in Spotify search
            or future settings/forms.
        */
        const activeElement = document.activeElement;
        const isEditable =
            activeElement &&
            (
                activeElement.matches("input, textarea, select, button") ||
                activeElement.isContentEditable
            );

        if (isEditable) {
            if (event.key.toLowerCase() === "escape") {
                event.preventDefault();
                activeElement.blur();
            }
            return;
        }

        const key = event.key.toLowerCase();

        if (
            window.friendsSurface?.isInlineActive?.() &&
            navigationLevel === "items"
        ) {
            const focus = window.friendsSurface?.getInputFocus?.() || "platforms";

            if (key === "escape") {
                event.preventDefault();
                goBack();
                return;
            }

            if (focus === "platforms") {
                if (key === "arrowleft" || key === "arrowright") {
                    event.preventDefault();
                    window.friendsSurface?.movePlatform?.(
                        key === "arrowright" ? 1 : -1
                    );
                    return;
                }

                if (key === "arrowdown") {
                    event.preventDefault();
                    window.friendsSurface?.focusFriends?.();
                    return;
                }

                if (key === "enter") {
                    event.preventDefault();
                    return;
                }
            } else {
                if (key === "arrowleft" || key === "arrowright") {
                    event.preventDefault();
                    window.friendsSurface?.moveFriendHorizontal?.(
                        key === "arrowright" ? 1 : -1
                    );
                    return;
                }

                if (key === "arrowup") {
                    event.preventDefault();
                    const moved = window.friendsSurface?.moveSelection?.(-1);
                    if (!moved) {
                        window.friendsSurface?.focusPlatforms?.();
                    }
                    return;
                }

                if (key === "arrowdown") {
                    event.preventDefault();
                    window.friendsSurface?.moveSelection?.(1);
                    return;
                }

                if (key === "enter") {
                    event.preventDefault();
                    window.friendsSurface?.selectFriend?.();
                    return;
                }
            }
        }

        const settingsOverlay =
            document.getElementById(
                "settings-overlay"
            );

        if (
            settingsOverlay
        ) {

            if (
                event.key.toLowerCase() ===
                "escape"
            ) {

                event.preventDefault();

                window.xmbSettings?.close?.();

            }

            return;

        }

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

                window.xmbAudio?.backward?.();

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

                window.xmbAudio?.forward?.();

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

                window.xmbAudio?.backward?.();

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

                window.xmbAudio?.forward?.();

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

                window.xmbAudio?.backward?.();

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

                window.xmbAudio?.forward?.();

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
    MOUSE / POINTER INPUT
    ========================================================

    Keyboard remains the primary XMB input, but the prototype
    should also behave naturally with a mouse.

    Single click selects. Double click activates.
*/

document.addEventListener(
    "click",
    async event => {

        if (
            document.getElementById(
                "settings-overlay"
            )
        ) {

            return;

        }

        const category =
            event.target.closest(
                ".category"
            );

        if (
            category
        ) {

            const index =
                Number(
                    category.dataset.index
                );

            if (
                Number.isInteger(index)
            ) {

                selectCategory(index);

            }

            return;

        }

        const item =
            event.target.closest(
                "#items .item"
            );

        if (
            item
        ) {

            const index =
                Number(
                    item.dataset.index
                );

            if (
                Number.isInteger(index)
            ) {

                if (
                    navigationLevel !==
                    "items"
                ) {

                    enterItemLevel();

                }

                selectItem(index);

                if (
                    event.detail >= 2
                ) {

                    await selectCurrentItem();

                }

            }

            return;

        }

        const action =
            event.target.closest(
                "#actions .action"
            );

        if (
            action
        ) {

            const index =
                Number(
                    action.dataset.index
                );

            if (
                Number.isInteger(index) &&
                navigationLevel !==
                    "categories"
            ) {

                if (
                    navigationLevel !==
                    "options"
                ) {

                    openOptions();

                }

                currentAction =
                    index;

                refreshNavigation(
                    true
                );

                if (
                    event.detail >= 2
                ) {

                    await selectCurrentAction();

                }

            }

            return;

        }

        if (
            event.target.closest(
                "#back-hint"
            )
        ) {

            goBack();
            return;

        }

        if (
            event.target.closest(
                "#options-hint"
            )
        ) {

            openOptions();
            return;

        }

        if (
            event.target.closest(
                "#select-hint"
            )
        ) {

            if (
                navigationLevel ===
                "categories"
            ) {

                enterItemLevel();

            }
            else if (
                navigationLevel ===
                "items"
            ) {

                await selectCurrentItem();

            }
            else {

                await selectCurrentAction();

            }

        }

    }
);


/*
    ========================================================
    MOUSE WHEEL INPUT
    ========================================================

    Vertical wheel movement follows the active XMB axis.
*/

document.addEventListener(
    "wheel",
    event => {

        if (
            document.getElementById(
                "settings-overlay"
            )
        ) {

            return;

        }

        if (
            navigationLevel ===
            "categories"
        ) {

            if (
                Math.abs(event.deltaX) >
                Math.abs(event.deltaY)
            ) {

                moveCategory(
                    event.deltaX > 0
                        ? 1
                        : -1
                );

            }

            return;

        }

        if (
            navigationLevel ===
            "items"
        ) {

            if (
                event.deltaY !==
                0
            ) {

                moveItem(
                    event.deltaY > 0
                        ? 1
                        : -1
                );

            }

            return;

        }

        if (
            navigationLevel ===
            "options"
        ) {

            if (
                event.deltaY !==
                0
            ) {

                moveAction(
                    event.deltaY > 0
                        ? 1
                        : -1
                );

            }

        }

    },
    {
        passive: true
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