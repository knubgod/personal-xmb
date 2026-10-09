/*
    PERSONAL XMB — FRIENDS PROVIDER REGISTRY

    Providers expose capability/state information to the Friends UI.
    Actual credentials and privileged service calls remain in the
    main process. Providers must never invent friend data.
*/

function readAccountState({app, fs, path}) {
    try {
        const accountPath = path.join(
            app.getPath("userData"),
            "accounts.json"
        );

        if (!fs.existsSync(accountPath)) {
            return {};
        }

        return JSON.parse(
            fs.readFileSync(accountPath, "utf8")
        );
    } catch {
        return {};
    }
}

function getProviderStates({
    app,
    fs,
    path,
    steamConfigured = false
}) {
    const accounts = readAccountState({app, fs, path});

    return {
        steam: {
            label: "Steam",
            connected: Boolean(steamConfigured),
            available: true,
            status: steamConfigured ? "ready" : "not-configured",
            message: steamConfigured
                ? "Steam friends are available."
                : "Add your Steam ID and Web API key in Settings to load your Steam friends."
        },
        discord: {
            label: "Discord",
            connected: Boolean(accounts.discord?.connected),
            available: false,
            status: accounts.discord?.connected
                ? "oauth-profile-and-connections"
                : "disconnected",
            capabilities: accounts.discord?.connected
                ? [
                    "profile",
                    ...(Array.isArray(accounts.discord?.scopes) &&
                    accounts.discord.scopes.includes("connections")
                        ? ["connections"]
                        : [])
                ]
                : [],
            message: accounts.discord?.connected
                ? "Discord OAuth is connected. Personal XMB can show your profile and authorized linked accounts; friends and presence require Discord Social SDK access."
                : "Connect Discord to show your profile and authorized linked accounts."
        },
        microsoft: {
            label: "Xbox",
            connected: Boolean(accounts.microsoft?.connected),
            available: false,
            status: "provider-not-implemented",
            message: accounts.microsoft?.connected
                ? "Microsoft/Xbox is connected. Xbox friends and presence are not yet exposed by the current provider."
                : "Connect Microsoft/Xbox first to prepare this provider."
        },
        riot: {
            label: "Riot Games",
            connected: Boolean(accounts.riot?.connected),
            available: false,
            status: "rso-identity-only",
            message: accounts.riot?.connected
                ? "Riot account is connected. RSO currently identifies the account; a supported League client/social integration is required for friends."
                : "Connect Riot first to prepare this provider."
        }
    };
}

module.exports = {
    getProviderStates
};
