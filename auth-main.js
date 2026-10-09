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
    path.join(__dirname, "config", "settings.json");

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
    return readJson(configFile(), {});
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

                if (url.searchParams.get("error")) {
                    res.writeHead(400);
                    res.end("Authorization cancelled.");
                    finish(
                        new Error(
                            url.searchParams.get("error")
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
            profile: all.discord?.profile || null,
            connections: Array.isArray(all.discord?.connections)
                ? all.discord.connections
                : [],
            scopes: Array.isArray(all.discord?.scopes)
                ? all.discord.scopes
                : [],
            authorizationExpiresAt:
                all.discord?.authorizationExpiresAt || 0,
            connectionsError:
                all.discord?.connectionsError || ""
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

async function discordAuthorization(all) {
    const credentials = loadCredentials("discord", all);
    if (!credentials?.accessToken) return null;
    return requestJson("https://discord.com/api/oauth2/@me", {
        headers: { Authorization: `Bearer ${credentials.accessToken}` }
    });
}

async function discordConnections(all) {
    const credentials = loadCredentials("discord", all);
    if (!credentials?.accessToken) return [];
    const connections = await requestJson("https://discord.com/api/users/@me/connections", {
        headers: { Authorization: `Bearer ${credentials.accessToken}` }
    });
    return Array.isArray(connections) ? connections : [];
}

async function refreshDiscordAccount(all) {
    const profile = await discordProfile(all);
    all.discord.profile = profile;

    let authorization = null;
    try {
        authorization = await discordAuthorization(all);
    } catch (error) {
        console.warn("Discord OAuth capability lookup failed:", error.message);
    }

    all.discord.scopes = Array.isArray(authorization?.scopes)
        ? authorization.scopes
        : String(loadCredentials("discord", all)?.scope || "").split(/\\s+/).filter(Boolean);
    all.discord.authorizationExpiresAt = authorization?.expires
        ? Date.parse(authorization.expires)
        : (all.discord.expiresAt || 0);

    if (all.discord.scopes.includes("connections")) {
        try {
            all.discord.connections = await discordConnections(all);
            delete all.discord.connectionsError;
        } catch (error) {
            all.discord.connections = [];
            all.discord.connectionsError = error.message || "Linked connections could not be loaded.";
            console.warn("Discord linked connections lookup failed:", error.message);
        }
    } else {
        all.discord.connections = [];
    }

    return profile;
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
        xuid:
            x.DisplayClaims?.xui?.[0]?.xid ||
            u.DisplayClaims?.xui?.[0]?.xid ||
            "",
        xstsToken: x.Token
    };
}

async function getXboxFriends() {
    const all = accounts();
    if (!all.microsoft?.connected) {
        return {
            friends: [],
            available: false,
            status: "not-connected",
            message: "Connect your Microsoft/Xbox account to load Xbox friends."
        };
    }

    let credentials = loadCredentials("microsoft", all);
    if (!credentials?.accessToken && !credentials?.xstsToken) {
        return {
            friends: [],
            available: false,
            status: "reauth-required",
            message: "Reconnect your Microsoft/Xbox account to refresh Xbox authorization."
        };
    }

    let xbox = {
        userHash: credentials.userHash || all.microsoft.xbox?.userHash || "",
        xuid: credentials.xuid || all.microsoft.xbox?.xuid || "",
        xstsToken: credentials.xstsToken || ""
    };

    if (!xbox.xstsToken || !xbox.userHash || !xbox.xuid) {
        if (!credentials.accessToken) {
            return {
                friends: [],
                available: false,
                status: "reauth-required",
                message: "Xbox authorization needs to be renewed. Reconnect your Microsoft account."
            };
        }

        const renewed = await xboxTokens(credentials.accessToken);
        credentials = { ...credentials, ...renewed };
        xbox = renewed;
        saveCredentials(all, "microsoft", credentials);
        all.microsoft.xbox = { userHash: xbox.userHash, xuid: xbox.xuid || "" };
        writeJson(tokenFile(), all);
    }

    if (!xbox.xuid || !/^\d{5,25}$/.test(String(xbox.xuid))) {
        return {
            friends: [],
            available: false,
            status: "xuid-unavailable",
            message: "Xbox did not provide the signed-in account's XUID. Reconnect Microsoft/Xbox and try again."
        };
    }

    let headers = {
        Authorization: `XBL3.0 x=${xbox.userHash};${xbox.xstsToken}`,
        Accept: "application/json",
        "x-xbl-contract-version": "3"
    };

    const loadPeople = async () => {
        const people = [];
        for (let startIndex = 0; startIndex < 1000; startIndex += 100) {
            const peopleUrl = new URL("https://social.xboxlive.com/users/me/people");
            peopleUrl.searchParams.set("view", "all");
            peopleUrl.searchParams.set("startIndex", String(startIndex));
            peopleUrl.searchParams.set("maxItems", "100");

            const peopleData = await requestJson(peopleUrl.toString(), { headers });
            const page = Array.isArray(peopleData?.people) ? peopleData.people : [];
            people.push(...page);

            const totalCount = Number(peopleData?.totalCount || 0);
            if (page.length < 100 || (totalCount > 0 && people.length >= totalCount)) break;
        }
        return people;
    };

    let people;
    try {
        people = await loadPeople();
    } catch (firstError) {
        const clientId = settings().integrations?.microsoft?.clientId;
        if (!credentials.refreshToken || !clientId) throw firstError;

        const token = await requestJson(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    client_id: clientId,
                    refresh_token: credentials.refreshToken,
                    scope: "openid profile email offline_access XboxLive.signin"
                })
            }
        );

        if (!token.access_token) throw firstError;

        const renewed = await xboxTokens(token.access_token);
        credentials = {
            ...credentials,
            accessToken: token.access_token,
            refreshToken: token.refresh_token || credentials.refreshToken,
            ...renewed
        };
        xbox = renewed;
        saveCredentials(all, "microsoft", credentials);
        all.microsoft.xbox = { userHash: xbox.userHash, xuid: xbox.xuid || "" };
        writeJson(tokenFile(), all);
        headers = {
            Authorization: `XBL3.0 x=${xbox.userHash};${xbox.xstsToken}`,
            Accept: "application/json",
            "x-xbl-contract-version": "3"
        };
        people = await loadPeople();
    }

    const xuids = [...new Set(people.map(person => String(person?.xuid || "")).filter(id => /^\d{5,25}$/.test(id)))];

    if (!xuids.length) {
        return { friends: [], available: true, status: "ready", message: "Xbox friend list loaded. No friends were returned." };
    }

    let profiles = [];
    try {
        const profileData = await requestJson("https://profile.xboxlive.com/users/batch", {
            method: "POST",
            headers: {
                ...headers,
                "x-xbl-contract-version": "2",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userIds: xuids,
                settings: [
                    "GameDisplayName",
                    "GameDisplayPicRaw",
                    "Gamertag",
                    "ModernGamertag",
                    "ModernGamertagSuffix"
                ]
            })
        });
        profiles = Array.isArray(profileData?.profileUsers) ? profileData.profileUsers : [];
    } catch (error) {
        console.warn("Xbox friend profile enrichment unavailable:", error.message);
    }

    let presenceRecords = [];
    try {
        const presenceData = await requestJson("https://userpresence.xboxlive.com/users/batch", {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ users: xuids, level: "all" })
        });
        presenceRecords = Array.isArray(presenceData)
            ? presenceData
            : Array.isArray(presenceData?.users)
                ? presenceData.users
                : Array.isArray(presenceData?.presenceRecords)
                    ? presenceData.presenceRecords
                    : [];
    } catch (error) {
        console.warn("Xbox friend presence enrichment unavailable:", error.message);
    }

    const settingMap = profile => Object.fromEntries(
        (Array.isArray(profile?.settings) ? profile.settings : [])
            .map(setting => [String(setting?.id || "").toLowerCase(), setting?.value || ""])
    );
    const profileMap = new Map(profiles.map(profile => [String(profile?.id || ""), settingMap(profile)]));
    const presenceMap = new Map(presenceRecords.map(record => [String(record?.xuid || ""), record]));

    const friends = xuids.map(xuid => {
        const profile = profileMap.get(xuid) || {};
        const presence = presenceMap.get(xuid) || null;
        const rawState = String(presence?.state || "").toLowerCase();
        const status = rawState === "online"
            ? "online"
            : rawState === "away"
                ? "idle"
                : rawState === "busy" || rawState === "donotdisturb" || rawState === "do not disturb"
                    ? "dnd"
                    : rawState === "offline"
                        ? "offline"
                        : "unknown";

        const titles = (Array.isArray(presence?.devices) ? presence.devices : [])
            .flatMap(device => Array.isArray(device?.titles) ? device.titles : []);
        const activeTitle = titles.find(title => String(title?.state || "").toLowerCase() === "active");
        const gameName = String(activeTitle?.name || "").trim();
        const richPresence = String(activeTitle?.activity?.richPresence || "").trim();
        const gamertag = profile.moderngamertag || profile.gamertag || profile.gamedisplayname || "";

        return {
            id: xuid,
            platform: "microsoft",
            name: String(gamertag || `Xbox user ${xuid.slice(-4)}`),
            avatar: String(profile.gamedisplaypicraw || "").toLowerCase().startsWith("https://") ? profile.gamedisplaypicraw : "",
            status,
            activity: gameName ? {
                type: "game",
                name: gameName,
                details: richPresence,
                state: "",
                startedAt: null,
                artwork: ""
            } : null
        };
    });

    return {
        friends,
        available: true,
        status: "ready",
        message: "Xbox friends and available presence data loaded."
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
                        scope:
                            "identify connections",
                        port:
                            ports.discord
                    }
                );

                await refreshDiscordAccount(all);
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
                        userHash: xbox.userHash,
                        xuid: xbox.xuid || ""
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
                                xbox.userHash,
                            xuid:
                                xbox.xuid || ""
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
    "accounts-refresh",
    async event => {
        requireTrustedRenderer(event);

        const all = accounts();

        try {
            if (all.discord?.accessToken || all.discord?.credentials) {
                await refreshDiscordAccount(all);
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


module.exports = { getXboxFriends };
