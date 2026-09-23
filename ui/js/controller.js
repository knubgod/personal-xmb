/*
    ========================================================
    PERSONAL XMB
    CONTROLLER SUPPORT
    ========================================================

    Detects Xbox / PlayStation controllers using the
    browser Gamepad API.

    The controller does NOT contain its own navigation
    logic.

    It calls the same functions used by the keyboard.
*/


let activeInputMode =
    "keyboard";


let previousGamepadButtons = [];


/*
    ========================================================
    BUTTON HELPER
    ========================================================
*/

function buttonPressed(
    gamepad,
    index
) {

    if (!gamepad.buttons[index]) {
        return false;
    }

    return gamepad.buttons[index].pressed;

}


/*
    ========================================================
    CHANGE INPUT MODE
    ========================================================
*/

function setInputMode(
    mode
) {

    if (
        activeInputMode === mode
    ) {

        return;

    }


    activeInputMode =
        mode;


    updateNavigationHints();

}


/*
    ========================================================
    GAMEPAD INPUT
    ========================================================
*/

function pollGamepads() {

    const gamepads =
        navigator.getGamepads();


    for (
        const gamepad of gamepads
    ) {

        if (!gamepad) {
            continue;
        }


        /*
            Detect controller family.

            Xbox controllers usually expose:
                Xbox / XInput

            PlayStation controllers may expose:
                DualShock
                DualSense
        */

        const id =
            gamepad.id.toLowerCase();


        let controllerType =
            "xbox";


        if (
            id.includes("playstation") ||
            id.includes("dualshock") ||
            id.includes("dualsense") ||
            id.includes("sony")
        ) {

            controllerType =
                "playstation";

        }


        setInputMode(
            controllerType
        );


        /*
            ------------------------------------------------
            D-PAD
            ------------------------------------------------
        */

        if (
            buttonPressed(
                gamepad,
                12
            )
        ) {

            moveItem(-1);

        }


        if (
            buttonPressed(
                gamepad,
                13
            )
        ) {

            moveItem(1);

        }


        if (
            buttonPressed(
                gamepad,
                14
            )
        ) {

            if (
                navigationLevel ===
                "categories"
            ) {

                moveCategory(-1);

            }
            else {

                goBack();

            }

        }


        if (
            buttonPressed(
                gamepad,
                15
            )
        ) {

            if (
                navigationLevel ===
                "categories"
            ) {

                moveCategory(1);

            }

        }


        /*
            ------------------------------------------------
            A / X
            ------------------------------------------------

            Xbox:
                A = button 0

            PlayStation:
                X = button 0
        */

        if (
            buttonPressed(
                gamepad,
                0
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

                selectCurrentItem();

            }
            else {

                selectCurrentAction();

            }

        }


        /*
            ------------------------------------------------
            B / CIRCLE
            ------------------------------------------------
        */

        if (
            buttonPressed(
                gamepad,
                1
            )
        ) {

            goBack();

        }


        /*
            ------------------------------------------------
            Y / TRIANGLE
            ------------------------------------------------

            Xbox:
                Y = button 3

            PlayStation:
                Triangle = button 3
        */

        if (
            buttonPressed(
                gamepad,
                3
            )
        ) {

            if (
                navigationLevel ===
                "items"
            ) {

                openOptions();

            }

        }

    }


    requestAnimationFrame(
        pollGamepads
    );

}


/*
    ========================================================
    GAMEPAD CONNECTED
    ========================================================
*/

window.addEventListener(
    "gamepadconnected",
    () => {

        /*
            Start polling immediately when a controller
            connects.
        */

        pollGamepads();

    }
);


/*
    ========================================================
    EXPOSE INPUT MODE
    ========================================================
*/

window.getInputMode =
    () =>
        activeInputMode;