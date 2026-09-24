/*
    ========================================================
    PERSONAL XMB
    CONTROLLER SUPPORT
    ========================================================

    Controller input feeds the same XMB navigation functions
    used by keyboard and mouse.

    Spotify library overlays are treated as a temporary
    controller surface:
        D-pad Up/Down = move
        A / Cross = select
        B / Circle = close
*/

let activeInputMode = "keyboard";
let gamepadConnected = false;

const previousGamepadButtons = new Map();
const previousGamepadAxes = new Map();
const gamepadAxisRepeatAt = new Map();

function buttonPressed(gamepad,index){
    return !!gamepad.buttons[index]?.pressed;
}

function getGamepadKey(gamepad, index) {
    return String(gamepad.index ?? index);
}

function buttonJustPressed(gamepad,index) {
    const key = getGamepadKey(gamepad, gamepad.index);
    const previous = previousGamepadButtons.get(key) || [];
    return buttonPressed(gamepad,index) && !previous[index];
}

function rememberGamepad(gamepad) {
    const key = getGamepadKey(gamepad, gamepad.index);
    previousGamepadButtons.set(
        key,
        gamepad.buttons.map(button => button.pressed)
    );
}

function axisDirection(gamepad, axis, negativeIndex, positiveIndex) {
    const value = gamepad.axes[axis] || 0;
    const direction = value < -0.55 ? -1 : value > 0.55 ? 1 : 0;
    if (!direction) return 0;

    const key = getGamepadKey(gamepad, gamepad.index) + ":" + axis;
    const now = performance.now();
    const previous = previousGamepadAxes.get(key) || 0;
    const lastRepeat = gamepadAxisRepeatAt.get(key) || 0;

    if (direction !== previous || now - lastRepeat >= 220) {
        previousGamepadAxes.set(key, direction);
        gamepadAxisRepeatAt.set(key, now);
        return direction;
    }

    return 0;
}

function setInputMode(mode){
    if(activeInputMode===mode)return;
    activeInputMode=mode;
    updateNavigationHints();
}

function setGamepadConnected(connected) {
    const next = Boolean(connected);
    if (gamepadConnected === next) return;
    gamepadConnected = next;
    updateNavigationHints();
}

function handleSpotifyOverlay(gamepad){
    if(!window.spotifyUi?.isOpen?.())return false;

    if(buttonJustPressed(gamepad,13)){
        window.spotifyUi.move?.(1);
        return true;
    }

    if(buttonJustPressed(gamepad,12)){
        window.spotifyUi.move?.(-1);
        return true;
    }

    if(buttonJustPressed(gamepad,15)){
        window.spotifyUi.moveFilter?.(1);
        return true;
    }

    if(buttonJustPressed(gamepad,14)){
        window.spotifyUi.moveFilter?.(-1);
        return true;
    }

    if(buttonJustPressed(gamepad,15)){
        window.spotifyUi.moveFilter?.(1);
        return true;
    }

    if(buttonJustPressed(gamepad,14)){
        window.spotifyUi.moveFilter?.(-1);
        return true;
    }

    if(buttonJustPressed(gamepad,0)){
        window.spotifyUi.select?.();
        return true;
    }

    if(buttonJustPressed(gamepad,1)){
        window.spotifyUi.close?.();
        return true;
    }

    return true;
}

function pollGamepads(){
    const gamepads=navigator.getGamepads();
    const connected = Array.from(gamepads).some(Boolean);

    setGamepadConnected(connected);

    for(const gamepad of gamepads){
        if(!gamepad)continue;

        const id=(gamepad.id||"").toLowerCase();
        const controllerType=
            id.includes("playstation") ||
            id.includes("dualshock") ||
            id.includes("dualsense") ||
            id.includes("sony")
                ? "playstation"
                : "xbox";

        setInputMode(controllerType);

        if(window.friendsSurface?.isInlineActive?.() && navigationLevel==="items"){
            const focus = window.friendsSurface.getInputFocus?.() || "platforms";

            if(buttonJustPressed(gamepad,1)){
                if(focus === "friends"){
                    window.friendsSurface.focusPlatforms?.();
                } else {
                    goBack();
                }
                rememberGamepad(gamepad);
                continue;
            }

            if(focus === "platforms"){
                /*
                    LB/L1 and RB/R1 are reserved for platform switching
                    while Friends is active. They have no XMB function
                    anywhere else yet.
                */
                if(buttonJustPressed(gamepad,4)) {
                    window.friendsSurface.movePlatform?.(-1);
                }

                if(buttonJustPressed(gamepad,5)) {
                    window.friendsSurface.movePlatform?.(1);
                }

                if(buttonJustPressed(gamepad,12)){
                    goBack();
                }

                if(buttonJustPressed(gamepad,13)){
                    window.friendsSurface.focusFriends?.();
                }

                if(buttonJustPressed(gamepad,0)){
                    window.friendsSurface.focusFriends?.();
                }
            } else {
                if(buttonJustPressed(gamepad,14)) window.friendsSurface.moveFriendHorizontal?.(-1);
                if(buttonJustPressed(gamepad,15)) window.friendsSurface.moveFriendHorizontal?.(1);
                if(buttonJustPressed(gamepad,12)){
                    const moved = window.friendsSurface.moveSelection?.(-1);

                    /*
                        Up at the first friend returns to the
                        Friends platform strip. Up again from the
                        platform strip returns to the main XMB.
                    */
                    if(moved === false) window.friendsSurface.focusPlatforms?.();
                }
                if(buttonJustPressed(gamepad,13)) window.friendsSurface.moveSelection?.(1);

                const vertical = axisDirection(gamepad, 1);
                const horizontal = axisDirection(gamepad, 0);
                if(vertical < 0){
                    const moved = window.friendsSurface.moveSelection?.(-1);

                    if(moved === false) goBack();
                }
                if(vertical > 0) window.friendsSurface.moveSelection?.(1);
                if(horizontal) window.friendsSurface.moveFriendHorizontal?.(horizontal);

                if(buttonJustPressed(gamepad,0)) window.friendsSurface.selectFriend?.();
            }

            rememberGamepad(gamepad);
            continue;
        }

        if(handleSpotifyOverlay(gamepad)){
            rememberGamepad(gamepad);
            continue;
        }

        if(buttonJustPressed(gamepad,12)){
            moveItem(-1);
        }

        if(buttonJustPressed(gamepad,13)){
            moveItem(1);
        }

        if(buttonJustPressed(gamepad,14)){
            if(navigationLevel==="categories"){
                moveCategory(-1);
            }else{
                goBack();
            }
        }

        if(buttonJustPressed(gamepad,15)){
            if(navigationLevel==="categories"){
                moveCategory(1);
            }
        }

        if(buttonJustPressed(gamepad,0)){
            if(navigationLevel==="categories"){
                enterItemLevel();
            }else if(navigationLevel==="items"){
                selectCurrentItem();
            }else{
                selectCurrentAction();
            }
        }

        if(buttonJustPressed(gamepad,1)){
            goBack();
        }

        if(buttonJustPressed(gamepad,3)){
            if(navigationLevel==="items"){
                openOptions();
            }
        }

        rememberGamepad(gamepad);
    }

    requestAnimationFrame(pollGamepads);
}

window.addEventListener("gamepadconnected",()=>{
    previousGamepadButtons.clear();
    previousGamepadAxes.clear();
    gamepadAxisRepeatAt.clear();
    setGamepadConnected(true);
});

window.addEventListener("gamepaddisconnected",()=>{
    setGamepadConnected(
        Array.from(navigator.getGamepads()).some(Boolean)
    );
});

window.getInputMode=()=>activeInputMode;
window.isGamepadConnected=()=>gamepadConnected;

requestAnimationFrame(pollGamepads);
