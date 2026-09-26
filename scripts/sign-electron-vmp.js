/*
    ========================================================
    CASTLABS EVS / WIDEVINE PRODUCTION SIGNING
    ========================================================

    CastLabs' public +wvcus Electron builds are development-VMP
    signed. Spotify's production Widevine license service can
    reject that development signature even though Widevine and
    the Web Playback SDK initialize correctly.

    This helper signs the Electron runtime in node_modules with
    a CastLabs EVS production VMP signature.

    Prerequisites:
      1. Install the CastLabs EVS client:
         python -m pip install --upgrade castlabs-evs
      2. Create/log into your EVS account.
      3. Run this script after npm install.

    Windows:
      npm run spotify:evs:sign

    The script intentionally signs node_modules/electron/dist
    rather than a generated installer. That is the runtime used
    by "npm start".
*/

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const electronDist =
    path.resolve(
        __dirname,
        "..",
        "node_modules",
        "electron",
        "dist"
    );

if (!fs.existsSync(electronDist)) {
    console.error(
        "Electron runtime was not found at:",
        electronDist
    );

    console.error(
        "Run npm install first."
    );

    process.exit(1);
}

function run(command, args) {

    console.log(
        "",
        command,
        ...args
    );

    return spawnSync(
        command,
        args,
        {
            stdio: "inherit",
            windowsHide: false
        }
    );
}

const candidates =
    process.platform === "win32"
        ? [
            {
                command: "py",
                args: [
                    "-3",
                    "-m",
                    "castlabs_evs.vmp",
                    "sign-pkg",
                    electronDist
                ]
            },
            {
                command: "python",
                args: [
                    "-m",
                    "castlabs_evs.vmp",
                    "sign-pkg",
                    electronDist
                ]
            },
            {
                command: "python3",
                args: [
                    "-m",
                    "castlabs_evs.vmp",
                    "sign-pkg",
                    electronDist
                ]
            }
        ]
        : [
            {
                command: "python3",
                args: [
                    "-m",
                    "castlabs_evs.vmp",
                    "sign-pkg",
                    electronDist
                ]
            },
            {
                command: "python",
                args: [
                    "-m",
                    "castlabs_evs.vmp",
                    "sign-pkg",
                    electronDist
                ]
            }
        ];

let attempted = false;

for (const candidate of candidates) {

    const result =
        run(
            candidate.command,
            candidate.args
        );

    /*
        ENOENT means the interpreter itself was not found.
        Any other exit code came from the EVS client and should
        be reported rather than hidden by trying another Python.
    */

    if (result.error?.code === "ENOENT") {
        continue;
    }

    attempted = true;

    if (result.status === 0) {
        console.log(
            "",
            "CastLabs EVS VMP signing completed successfully."
        );

        console.log(
            "Restart Personal XMB before testing Spotify playback."
        );

        process.exit(0);
    }

    console.error(
        "",
        "CastLabs EVS VMP signing failed."
    );

    console.error(
        "If EVS reports a binary/signature validation error,",
        "make sure node_modules/electron is the unmodified",
        "CastLabs +wvcus build from package.json."
    );

    process.exit(
        typeof result.status === "number"
            ? result.status
            : 1
    );
}

if (!attempted) {

    console.error(
        "",
        "Python was not found."
    );

    console.error(
        "Install Python 3 and the CastLabs EVS client with:"
    );

    console.error(
        "python -m pip install --upgrade castlabs-evs"
    );

    process.exit(1);
}
