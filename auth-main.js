const { app, ipcMain, shell, safeStorage } = require("electron");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { requireTrustedRenderer } = require("./ipc-security");

const ports = {
    discord: 53683,
    microsoft: 53684,
    riot: 53685
};

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const activeLogins = new Set();

const configFile = () =>
    path.join(app.getPath("userData"), "settings.json");

const bundledConfigFile = () =>
    path.join(__dirname, "config", "settings.example.json");

const tokenFile = () =>
    path.join(app.getPath("userData"), "accounts.json");

function readJson(file, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 4), "utf8");
}

function settings() {
    const userSettings = readJson(configFile(), null);

    if (userSettings && typeof userSettings === "object") {
        return userSettings;
    }

    return readJson(bundledConfigFile(), {});
}

function accounts() {
    return readJson(tokenFile(), {});
}

function state() {
    return crypto.randomBytes(24).toString("hex");
}

function verifier() {
    return crypto.randomBytes(48).toString("base64url");
}

function challenge(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("base64url");
}

function requireSecureStorage() {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            "OS secure storage is unavailable. Account credentials were not saved."
        );
    }
}

function encryptCredentials(credentials) {
    requireSecureStorage();

    return safeStorage
        .encryptString(JSON.stringify(credentials))
        .toString("base64");
}

function decryptCredentials(encoded) {
    requireSecureStorage();

    try {
        return JSON.parse(
            safeStorage.decryptString(
                Buffer.from(encoded, "base64")
            )
        );
    } catch {
        throw new Error(
            "Stored account credentials could not be decrypted."
        );
    }
}

/*
    Account credentials are kept separate from public profile/
    connection information. Older plaintext account records are
    migrated once, then the plaintext fields are removed.
*/
function loadCredentials(provider, all = accounts()) {
    const record = all[provider];

    if (!record) {
        return null;
    }

    if (typeof record.credentials === "string" && record.credentials) {
        return decryptCredentials(record.credentials);
    }

    const legacy = {
        accessToken: record.accessToken || "",
        refreshToken: record.refreshToken || "",
        userToken: record.userToken || "",
        xstsToken: record.xstsToken || "",
        userHash: record.userHash || ""
    };

    const hasLegacyCredentials = Object.values(legacy).some(Boolean);

    if (!hasLegacyCredentials) {
        return null;
    }

    record.credentials = encryptCredentials(legacy);

    delete record.accessToken;
    delete record.refreshToken;
    delete record.userToken;
    delete record.xstsToken;
    delete record.userHash;

    writeJson(tokenFile(), all);

    return legacy;
}

function saveCredentials(all, provider, credentials) {
    all[provider] = {
        ...(all[provider] || {}),
        credentials: encryptCredentials(credentials)
    };

    delete all[provider].accessToken;
    delete all[provider].refreshToken;
    delete all[provider].userToken;
    delete all[provider].xstsToken;
    delete all[provider].userHash;

    writeJson(tokenFile(), all);
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        throw new Error(
            data.error_description ||
            data.error?.message ||
            data.error ||
            `HTTP ${response.status}`
        );
    }

    return data;
}

function callback(port, expectedState) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const server = http.createServer((req, res) => {
            try {
                const url = new URL(
                    req.url,
                    `http://127.0.0.1:${port}`
                );

                if (url.pathname !== "/callback") {
                    res.writeHead(404);
                    res.end();
                    return;
                }

                if (url.searchParams.get("state") !== expectedState) {
                    res.writeHead(400);
                    res.end("Invalid OAuth state.");
                    finish(new Error("OAuth state validation failed."));
                    return;
                }

                const oauthError = url.searchParams.get("error");

                if (oauthError) {
                    const description =
                        url.searchParams.get("error_description") ||
                        "No error description was provided.";

                    console.error(
                        "[AUTH] OAuth provider rejected authorization:",
                        {
                            providerPort: port,
                            error: oauthError,
                            description
                        }
                    );

                    res.writeHead(400, {
                        "Content-Type": "text/html; charset=utf-8"
                    });
                    res.end(
                        "<h1>Personal XMB authorization failed.</h1>" +
                        "<p>You can close this window and return to XMB.</p>"
                    );

                    finish(
                        new Error(
                            `${oauthError}: ${description}`
                        )
                    );
                    return;
                }

                const code = url.searchParams.get("code");

                if (!code) {
                    res.writeHead(400);
                    res.end("No authorization code.");
                    finish(new Error("No authorization code."));
                    return;
                }

                res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8"
                });
                res.end(
                    "<h1>Personal XMB connected.</h1><p>You can close this window.</p>"
                );

                finish(null, code);
            } catch (error) {
                try {
                    res.writeHead(500);
                    res.end("Authorization failed.");
                } catch {}
                finish(error);
            }
        });

        const timeout = setTimeout(() => {
            finish(new Error("OAuth authorization timed out."));
        }, OAUTH_TIMEOUT_MS);

        function cleanup() {
            clearTimeout(timeout);

            if (!server.listening) {
                return;
            }

            try {
                server.close();
            } catch {}
        }

        function finish(error, value) {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();

            if (error) {
                reject(error);
            } else {
                resolve(value);
            }
        }

        server.on("error", finish);
        server.listen(port, "127.0.0.1");
    });
}

async function oauth(provider, cfg) {
    if (!cfg.clientId) {
        throw new Error(
            `${provider} client ID is not configured in config/settings.json.`
        );
    }

    if (activeLogins.has(provider)) {
        throw new Error(
            `${provider} authorization is already in progress.`
        );
    }

    activeLogins.add(provider);

    try {
        const s = state();
        const v = verifier();
        const redirect =
            `http://127.0.0.1:${cfg.port}/callback`;

        const query = new URLSearchParams({
            client_id: cfg.clientId,
            response_type: "code",
            redirect_uri: redirect,
            scope: cfg.scope,
            state: s,
            code_challenge: challenge(v),
            code_challenge_method: "S256"
        });

        const codePromise = callback(cfg.port, s);

        try {
            await shell.openExternal(
                `${cfg.authorize}?${query}`
            );
        } catch (error) {
            throw new Error(
                `Unable to open ${provider} authorization: ${error.message}`
            );
        }

        const code = await codePromise;

        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirect,
            client_id: cfg.clientId,
            code_verifier: v,
            ...(cfg.tokenExtra || {})
        });

        const token = await requestJson(
            cfg.token,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body
            }
        );

        const all = accounts();

        all[provider] = {
            ...(all[provider] || {}),
            connected: true,
            expiresAt: token.expires_in
                ? Date.now() + token.expires_in * 1000
                : 0,
            connectedAt: Date.now()
        };

        saveCredentials(
            all,
            provider,
            {
                accessToken: token.access_token || "",
                refreshToken:
                    token.refresh_token ||
                    loadCredentials(provider, all)?.refreshToken ||
                    ""
            }
        );

        return all;
    } finally {
        activeLogins.delete(provider);
    }
}

function summary(all = accounts()) {
    return {
        discord: {
            connected: !!all.discord?.connected,
            profile: all.discord?.profile || null
        },
        microsoft: {
            connected: !!all.microsoft?.connected,
            profile: all.microsoft?.profile || null,
            xbox: all.microsoft?.xbox || null
        },
        riot: {
            connected: !!all.riot?.connected,
            profile: all.riot?.profile || null
        }
    };
}

/*
    Discord Friends / DM helpers
    ----------------------------
    These requests stay in the main process so the Discord OAuth
    access token never reaches the renderer.
*/
function validateDiscordUserId(value) {
    const userId = String(value || "").trim();

    if (!/^\\d{15,25}$/.test(userId)) {
        throw new Error("Discord user ID is invalid.");
    }

    return userId;
}

function discordAvatarUrl(user) {
    const id = String(user?.id || "");
    const hash = typeof user?.avatar === "string" ? user.avatar : "";

    if (!/^\\d{15,25}$/.test(id) || !/^[A-Za-z0-9_]{2,128}$/.test(hash)) {
        return "";
    }

    const extension = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${extension}?size=128`;
}

function normalizeDiscordFriend(relationship) {
    const user = relationship?.user || {};

    return {
        id: String(user.id || relationship?.id || ""),
        platform: "discord",
        name: String(
            user.global_name ||
            user.username ||
            "Unknown friend"
        ),
        username: String(user.username || ""),
        discriminator: String(user.discriminator || ""),
        avatar: discordAvatarUrl(user),
        status: "offline",
        presenceAvailable: false,
        relationshipType: Number.isFinite(relationship?.type)
            ? relationship.type
            : 1,
        activity: null
    };
}

async function getDiscordFriends(all = accounts()) {
    const credentials = loadCredentials("discord", all);

    if (!credentials?.accessToken) {
        return {
            friends: [],
            provider: "discord",
            configured: false,
            error: "Discord is not connected."
        };
    }

    const relationships = await requestJson(
        "https://discord.com/api/v10/users/@me/relationships",
        {
            headers: {
                Authorization:
                    `Bearer ${credentials.accessToken}`
            }
        }
    );

    if (!Array.isArray(relationships)) {
        throw new Error("Discord returned an invalid friends response.");
    }

    return {
        friends: relationships
            .filter(relationship => Number(relationship?.type) === 1)
            .map(normalizeDiscordFriend)
            .filter(friend => friend.id),
        provider: "discord",
        configured: true,
        presenceAvailable: false
    };
}

async function discordSendMessage(userId, content, all = accounts()) {
    const targetUserId = validateDiscordUserId(userId);
    const message = String(content || "").trim();

    if (!message) {
        throw new Error("Message cannot be empty.");
    }

    if (message.length > 2000) {
        throw new Error("Discord messages are limited to 2000 characters.");
    }

    const credentials = loadCredentials("discord", all);

    if (!credentials?.accessToken) {
        throw new Error("Discord is not connected.");
    }

    const headers = {
        Authorization:
            `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json"
    };

    const dmChannel = await requestJson(
        "https://discord.com/api/v10/users/@me/channels",
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                recipient_id: targetUserId
            })
        }
    );

    const channelId = String(dmChannel?.id || "");

    if (!/^\\d{15,25}$/.test(channelId)) {
        throw new Error("Discord did not return a valid DM channel.");
    }

    return requestJson(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                content: message,
                allowed_mentions: {
                    parse: []
                }
            })
        }
    );
}

async function discordProfile(all) {
    const credentials = loadCredentials("discord", all);

    if (!credentials?.accessToken) {
        return null;
    }

    return requestJson(
        "https://discord.com/api/users/@me",
        {
            headers: {
                Authorization:
                    `Bearer ${credentials.accessToken}`
            }
        }
    );
}

async function microsoftProfile(all) {
    const credentials = loadCredentials("microsoft", all);

    if (!credentials?.accessToken) {
        return null;
    }

    return requestJson(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail",
        {
            headers: {
                Authorization:
                    `Bearer ${credentials.accessToken}`
            }
        }
    );
}

async function riotProfile(all) {
    const credentials = loadCredentials("riot", all);

    if (!credentials?.accessToken) {
        return null;
    }

    return requestJson(
        "https://americas.api.riotgames.com/riot/account/v1/accounts/me",
        {
            headers: {
                Authorization:
                    `Bearer ${credentials.accessToken}`
            }
        }
    );
}

async function xboxTokens(msaToken) {
    const u = await requestJson(
        "https://user.auth.xboxlive.com/user/authenticate",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                RelyingParty:
                    "http://auth.xboxlive.com",
                TokenType: "JWT",
                Properties: {
                    AuthMethod: "RPS",
                    SiteName:
                        "user.auth.xboxlive.com",
                    RpsTicket: `d=${msaToken}`
                }
            })
        }
    );

    const userHash =
        u.DisplayClaims?.xui?.[0]?.uhs;

    if (!u.Token || !userHash) {
        throw new Error(
            "Xbox Live user token was not returned."
        );
    }

    const x = await requestJson(
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-xbl-contract-version": "1"
            },
            body: JSON.stringify({
                RelyingParty:
                    "http://xboxlive.com",
                TokenType: "JWT",
                Properties: {
                    SandboxId: "RETAIL",
                    UserTokens: [u.Token]
                }
            })
        }
    );

    return {
        userToken: u.Token,
        userHash:
            x.DisplayClaims?.xui?.[0]?.uhs ||
            userHash,
        xstsToken: x.Token
    };
}

ipcMain.handle(
    "accounts-get",
    event => {
        requireTrustedRenderer(event);
        return summary();
    }
);

ipcMain.handle(
    "account-login",
    async (event, provider) => {
        requireTrustedRenderer(event);

        try {
            console.log(`[AUTH] Starting ${provider} authorization.`);

            if (
                provider !== "discord" &&
                provider !== "microsoft" &&
                provider !== "riot"
            ) {
                throw new Error(
                    "Unknown account provider."
                );
            }

            const cfg = settings();
            let all;

            if (provider === "discord") {
                all = await oauth(
                    "discord",
                    {
                        clientId:
                            cfg.integrations?.discord?.clientId,
                        authorize:
                            "https://discord.com/oauth2/authorize",
                        token:
                            "https://discord.com/api/oauth2/token",
                        // Start with the standard identity scope.
                        // Discord requires approval for relationships.read
                        // and dm_channels.read; requesting those scopes here
                        // causes authorization to be rejected unless the
                        // application has the corresponding approvals.
                        scope:
                            "identify",
                        port:
                            ports.discord
                    }
                );

                all.discord.profile =
                    await discordProfile(all);
            }

            if (provider === "microsoft") {
                all = await oauth(
                    "microsoft",
                    {
                        clientId:
                            cfg.integrations?.microsoft?.clientId,
                        authorize:
                            "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
                        token:
                            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
                        scope:
                            "openid profile email offline_access XboxLive.signin",
                        port:
                            ports.microsoft
                    }
                );

                all.microsoft.profile =
                    await microsoftProfile(all);

                try {
                    const credentials =
                        loadCredentials(
                            "microsoft",
                            all
                        );

                    const xbox =
                        await xboxTokens(
                            credentials?.accessToken
                        );

                    all.microsoft.xbox = {
                        userHash:
                            xbox.userHash
                    };

                    saveCredentials(
                        all,
                        "microsoft",
                        {
                            ...credentials,
                            userToken:
                                xbox.userToken,
                            xstsToken:
                                xbox.xstsToken,
                            userHash:
                                xbox.userHash
                        }
                    );
                } catch (error) {
                    all.microsoft.xboxError =
                        error.message;
                }

                writeJson(tokenFile(), all);
            }

            if (provider === "riot") {
                const secret =
                    process.env.PERSONAL_XMB_RIOT_CLIENT_SECRET ||
                    "";

                if (
                    !cfg.integrations?.riot?.clientId ||
                    !secret
                ) {
                    throw new Error(
                        "Riot RSO needs an approved client ID and PERSONAL_XMB_RIOT_CLIENT_SECRET."
                    );
                }

                all = await oauth(
                    "riot",
                    {
                        clientId:
                            cfg.integrations.riot.clientId,
                        authorize:
                            "https://auth.riotgames.com/authorize",
                        token:
                            "https://auth.riotgames.com/token",
                        scope:
                            "openid offline_access",
                        port:
                            ports.riot,
                        tokenExtra: {
                            client_secret:
                                secret
                        }
                    }
                );

                all.riot.profile =
                    await riotProfile(all);
            }

            writeJson(tokenFile(), all);

            return {
                success: true,
                accounts:
                    summary(all)
            };
        } catch (error) {
            console.error(
                `Account login failed for ${provider}:`,
                error
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }
);

ipcMain.handle(
    "account-logout",
    (event, provider) => {
        requireTrustedRenderer(event);

        const all = accounts();
        delete all[provider];
        writeJson(tokenFile(), all);

        return {
            success: true,
            accounts:
                summary(all)
        };
    }
);

ipcMain.handle(
    "discord-friends-get",
    async event => {
        requireTrustedRenderer(event);

        try {
            return await getDiscordFriends();
        } catch (error) {
            console.error(
                "Discord friends request failed:",
                error
            );

            return {
                friends: [],
                provider: "discord",
                configured: true,
                presenceAvailable: false,
                error:
                    error?.message ||
                    "Unable to load Discord friends."
            };
        }
    }
);

ipcMain.handle(
    "discord-send-message",
    async (event, userId, content) => {
        requireTrustedRenderer(event);

        try {
            await discordSendMessage(userId, content);

            return {
                success: true
            };
        } catch (error) {
            console.error(
                "Discord message send failed:",
                error
            );

            return {
                success: false,
                error:
                    error?.message ||
                    "Unable to send Discord message."
            };
        }
    }
);

ipcMain.handle(
    "accounts-refresh",
    async event => {
        requireTrustedRenderer(event);

        const all = accounts();

        try {
            if (all.discord?.accessToken || all.discord?.credentials) {
                all.discord.profile =
                    await discordProfile(all);
            }
        } catch {}

        try {
            if (all.microsoft?.accessToken || all.microsoft?.credentials) {
                all.microsoft.profile =
                    await microsoftProfile(all);
            }
        } catch {}

        try {
            if (all.riot?.accessToken || all.riot?.credentials) {
                all.riot.profile =
                    await riotProfile(all);
            }
        } catch {}

        writeJson(tokenFile(), all);
        return summary(all);
    }
);
