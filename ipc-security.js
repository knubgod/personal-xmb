const { BrowserWindow } = require("electron");

function getSenderWindow(event) {
    try {
        return BrowserWindow.fromWebContents(event?.sender) || null;
    } catch {
        return null;
    }
}

function isTrustedRenderer(event) {
    const senderWindow = getSenderWindow(event);

    if (!senderWindow || senderWindow.isDestroyed()) {
        return false;
    }

    if (event?.senderFrame !== senderWindow.webContents.mainFrame) {
        return false;
    }

    const url = senderWindow.webContents.getURL();

    return url.startsWith("file://");
}

function requireTrustedRenderer(event) {
    if (!isTrustedRenderer(event)) {
        throw new Error("Untrusted renderer IPC request rejected.");
    }
}

module.exports = {
    isTrustedRenderer,
    requireTrustedRenderer
};
