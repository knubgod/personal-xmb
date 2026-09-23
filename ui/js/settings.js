/*
    PERSONAL XMB SETTINGS
*/

const XMB_SETTINGS_KEY = "personal-xmb-user-settings";

const defaultUserSettings = {
    sound: true,
    soundVolume: 0.075,
    clock: true,
    hints: true,
    animations: true,
    theme: "default"
};

function getUserSettings() {

    try {

        return {
            ...defaultUserSettings,
            ...(JSON.parse(
                localStorage.getItem(XMB_SETTINGS_KEY)
            ) || {})
        };

    }
    catch (error) {

        return {
            ...defaultUserSettings
        };

    }

}

function saveUserSettings(settings) {

    localStorage.setItem(
        XMB_SETTINGS_KEY,
        JSON.stringify(settings)
    );

}

function applyUserSettings() {

    const settings = getUserSettings();

    document.body.classList.toggle(
        "hide-clock",
        !settings.clock
    );

    document.body.classList.toggle(
        "hide-hints",
        !settings.hints
    );

    document.body.classList.toggle(
        "reduced-xmb-motion",
        !settings.animations
    );

    if (window.xmbAudio?.setEnabled) {
        window.xmbAudio.setEnabled(settings.sound);
    }

    if (window.xmbAudio?.setVolume) {
        window.xmbAudio.setVolume(settings.soundVolume);
    }

    if (
        settings.theme &&
        typeof applyTheme === "function"
    ) {
        applyTheme(settings.theme);
    }

}

function closeSettingsPanel() {

    document.getElementById(
        "settings-overlay"
    )?.remove();

    window.xmbAudio?.back?.();

}

function openSettingsPanel() {

    if (
        document.getElementById(
            "settings-overlay"
        )
    ) {
        return;
    }

    const settings = getUserSettings();

    const overlay = document.createElement("div");

    overlay.id = "settings-overlay";

    overlay.innerHTML = \`
        <div class="settings-panel">
            <div class="settings-header">
                <div>
                    <div class="settings-kicker">PERSONAL XMB</div>
                    <h2>Settings</h2>
                </div>
                <button class="settings-close" type="button">ESC</button>
            </div>

            <div class="settings-grid">

                <section class="settings-group">
                    <h3>General</h3>

                    <label>
                        <span>Show Clock</span>
                        <input id="setting-clock" type="checkbox" \${settings.clock ? "checked" : ""}>
                    </label>

                    <label>
                        <span>Navigation Hints</span>
                        <input id="setting-hints" type="checkbox" \${settings.hints ? "checked" : ""}>
                    </label>

                    <label>
                        <span>Animations</span>
                        <input id="setting-animations" type="checkbox" \${settings.animations ? "checked" : ""}>
                    </label>
                </section>

                <section class="settings-group">
                    <h3>Audio</h3>

                    <label>
                        <span>Sound Effects</span>
                        <input id="setting-sound" type="checkbox" \${settings.sound ? "checked" : ""}>
                    </label>

                    <label class="range-row">
                        <span>Volume</span>
                        <input id="setting-volume" type="range" min="0" max="0.15" step="0.005" value="\${settings.soundVolume}">
                    </label>
                </section>

                <section class="settings-group">
                    <h3>Appearance</h3>
                    <label>
                        <span>Theme</span>
                        <select id="setting-theme"></select>
                    </label>
                </section>

                <section class="settings-group">
                    <h3>Artwork</h3>
                    <button id="setting-clear-cache" class="settings-action" type="button">
                        Clear Artwork Cache
                    </button>
                    <div id="settings-cache-status" class="settings-status"></div>
                </section>

                <section class="settings-group settings-system">
                    <h3>System</h3>
                    <button id="setting-maximize" class="settings-action" type="button">
                        Toggle Maximize
                    </button>
                    <button id="setting-fullscreen" class="settings-action" type="button">
                        Toggle Fullscreen
                    </button>
                    <button id="setting-exit" class="settings-action danger" type="button">
                        Exit Personal XMB
                    </button>
                </section>

            </div>

            <div class="settings-footer">
                Changes save automatically.
            </div>
        </div>
    \`;

    document.body.appendChild(overlay);

    const themeSelect =
        overlay.querySelector("#setting-theme");

    Object.keys(
        window.themesData || {}
    ).forEach(
        themeName => {

            const option =
                document.createElement("option");

            option.value =
                themeName;

            option.textContent =
                themeName.replace(/-/g, " ");

            themeSelect.appendChild(option);

        }
    );

    themeSelect.value =
        settings.theme ||
        document.body.dataset.theme ||
        "default";

    function updateSettings() {

        const next = {
            ...getUserSettings(),
            clock:
                overlay.querySelector("#setting-clock").checked,
            hints:
                overlay.querySelector("#setting-hints").checked,
            animations:
                overlay.querySelector("#setting-animations").checked,
            sound:
                overlay.querySelector("#setting-sound").checked,
            soundVolume:
                Number(
                    overlay.querySelector("#setting-volume").value
                ),
            theme:
                themeSelect.value
        };

        saveUserSettings(next);
        applyUserSettings();

    }

    overlay.querySelectorAll("input").forEach(
        input => input.addEventListener(
            "change",
            updateSettings
        )
    );

    overlay.querySelector(
        "#setting-volume"
    ).addEventListener(
        "input",
        updateSettings
    );

    themeSelect.addEventListener(
        "change",
        () => {

            updateSettings();
            window.xmbAudio?.select?.();

        }
    );

    overlay.querySelector(
        ".settings-close"
    ).addEventListener(
        "click",
        closeSettingsPanel
    );

    overlay.querySelector(
        "#setting-clear-cache"
    ).addEventListener(
        "click",
        async () => {

            const status =
                overlay.querySelector(
                    "#settings-cache-status"
                );

            status.textContent =
                "Clearing artwork cache...";

            const result =
                await window.electron?.clearArtworkCache?.();

            status.textContent =
                result?.success
                    ? "Cache cleared. Relaunch to rebuild artwork."
                    : "Unable to clear the cache.";

        }
    );

    overlay.querySelector(
        "#setting-maximize"
    ).addEventListener(
        "click",
        () => {

            window.electron?.setWindowState?.(
                "maximize"
            );

            window.xmbAudio?.select?.();

        }
    );

    overlay.querySelector(
        "#setting-fullscreen"
    ).addEventListener(
        "click",
        () => {

            window.electron?.setWindowState?.(
                "fullscreen"
            );

            window.xmbAudio?.select?.();

        }
    );

    overlay.querySelector(
        "#setting-exit"
    ).addEventListener(
        "click",
        () => {

            window.xmbAudio?.back?.();
            window.electron?.quitApp?.();

        }
    );

    window.xmbAudio?.select?.();

}

window.xmbSettings = {
    open: openSettingsPanel,
    close: closeSettingsPanel,
    apply: applyUserSettings
};

document.addEventListener(
    "DOMContentLoaded",
    applyUserSettings
);
