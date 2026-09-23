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
let previousGamepadButtons = [];

function buttonPressed(gamepad,index){
    return !!gamepad.buttons[index]?.pressed;
}

function buttonJustPressed(gamepad,index){
    const previous=previousGamepadButtons[index] || false;
    return buttonPressed(gamepad,index) && !previous;
}

function setInputMode(mode){
    if(activeInputMode===mode)return;
    activeInputMode=mode;
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

        if(handleSpotifyOverlay(gamepad)){
            previousGamepadButtons=gamepad.buttons.map(button=>button.pressed);
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

        previousGamepadButtons=gamepad.buttons.map(button=>button.pressed);
    }

    requestAnimationFrame(pollGamepads);
}

window.addEventListener("gamepadconnected",()=>{
    previousGamepadButtons=[];
});

window.getInputMode=()=>activeInputMode;

requestAnimationFrame(pollGamepads);
