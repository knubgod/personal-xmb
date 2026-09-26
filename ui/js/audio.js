/*
    ========================================================
    PERSONAL XMB
    AUDIO SERVICE
    ========================================================

    Small procedural interface sounds.

    No external audio files are required. Web Audio creates
    short console-style tones locally, which keeps the
    launcher self-contained.
*/

let xmbAudioContext = null;
let xmbMasterGain = null;
let xmbAudioEnabled = true;
let xmbAudioVolume = 0.075;

function getXmbAudioContext() {

    if (xmbAudioContext) {
        return xmbAudioContext;
    }

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return null;
        }

        xmbAudioContext =
            new AudioContext();

        xmbMasterGain =
            xmbAudioContext.createGain();

        xmbMasterGain.gain.value =
            xmbAudioVolume;

        xmbMasterGain.connect(
            xmbAudioContext.destination
        );

        return xmbAudioContext;

    }
    catch (error) {

        console.warn(
            "XMB audio unavailable:",
            error
        );

        return null;

    }

}

async function unlockXmbAudio() {

    const context =
        getXmbAudioContext();

    if (!context) {
        return;
    }

    if (context.state === "suspended") {

        try {
            await context.resume();
        }
        catch (error) {
            return;
        }

    }

}

function setXmbAudioEnabled(enabled) {
    xmbAudioEnabled = Boolean(enabled);
}

function setXmbAudioVolume(volume) {
    xmbAudioVolume = Math.max(0, Math.min(0.15, Number(volume) || 0));
    if (xmbMasterGain) {
        xmbMasterGain.gain.value = xmbAudioVolume;
    }
}

function playXmbTone(
    frequency,
    duration,
    type = "sine",
    volume = 0.45,
    delay = 0
) {

    const context =
        getXmbAudioContext();

    if (
        !xmbAudioEnabled ||
        !context ||
        !xmbMasterGain
    ) {
        return;
    }

    if (context.state === "suspended") {
        return;
    }

    const start =
        context.currentTime +
        delay;

    const oscillator =
        context.createOscillator();

    const gain =
        context.createGain();

    oscillator.type =
        type;

    oscillator.frequency.setValueAtTime(
        frequency,
        start
    );

    gain.gain.setValueAtTime(
        0.0001,
        start
    );

    gain.gain.exponentialRampToValueAtTime(
        volume,
        start + 0.008
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + duration
    );

    oscillator.connect(gain);
    gain.connect(xmbMasterGain);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);

}

function playXmbForwardSound() {

    playXmbTone(640, 0.055, "sine", 0.34);
    playXmbTone(880, 0.085, "triangle", 0.18, 0.025);

}

function playXmbBackwardSound() {

    playXmbTone(470, 0.055, "sine", 0.34);
    playXmbTone(330, 0.085, "triangle", 0.18, 0.025);

}

function playXmbNavigationSound() {

    playXmbForwardSound();

}

function playXmbCategorySound() {

    playXmbTone(
        410,
        0.08,
        "triangle",
        0.42
    );

    playXmbTone(
        760,
        0.12,
        "sine",
        0.25,
        0.035
    );

}

function playXmbOptionsSound() {

    playXmbTone(430, 0.06, "triangle", 0.28);
    playXmbTone(620, 0.09, "sine", 0.18, 0.035);

}

function playXmbBackSound() {

    playXmbTone(
        520,
        0.07,
        "triangle",
        0.34
    );

    playXmbTone(
        330,
        0.10,
        "sine",
        0.22,
        0.035
    );

}

function playXmbSelectSound() {

    playXmbTone(
        740,
        0.065,
        "triangle",
        0.40
    );

    playXmbTone(
        980,
        0.11,
        "sine",
        0.25,
        0.035
    );

}

function playXmbLaunchSound() {

    playXmbTone(
        360,
        0.16,
        "triangle",
        0.34
    );

    playXmbTone(
        720,
        0.24,
        "sine",
        0.30,
        0.075
    );

}

function playXmbStartupSound() {

    /*
        Short console-style boot chord:
        a soft low bloom followed by a bright suspended
        interval. It is intentionally brief so startup
        feels like a console handoff rather than a jingle.
    */
    playXmbTone(
        146.83,
        0.72,
        "sine",
        0.20
    );

    playXmbTone(
        220.00,
        0.62,
        "triangle",
        0.13,
        0.06
    );

    playXmbTone(
        293.66,
        0.78,
        "sine",
        0.12,
        0.20
    );

    playXmbTone(
        440.00,
        0.95,
        "sine",
        0.10,
        0.34
    );

    playXmbTone(
        587.33,
        0.72,
        "triangle",
        0.055,
        0.52
    );

}

window.xmbAudio = {

    unlock:
        unlockXmbAudio,

    navigation:
        playXmbNavigationSound,

    forward:
        playXmbForwardSound,

    backward:
        playXmbBackwardSound,

    options:
        playXmbOptionsSound,

    category:
        playXmbCategorySound,

    back:
        playXmbBackSound,

    select:
        playXmbSelectSound,

    launch:
        playXmbLaunchSound,

    startup:
        playXmbStartupSound,

    setEnabled:
        setXmbAudioEnabled,

    setVolume:
        setXmbAudioVolume

};