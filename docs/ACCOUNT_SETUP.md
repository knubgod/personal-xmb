# Account setup

## Discord
Set `integrations.discord.clientId` in `config/settings.json`. Register:
`http://127.0.0.1:53683/callback`

## Microsoft / Xbox
Set `integrations.microsoft.clientId` and register:
`http://127.0.0.1:53684/callback`
The Microsoft flow also attempts the Xbox Live user/XSTS token exchange.

## Riot
RSO requires an approved production application/client. Set `integrations.riot.clientId` and the client secret as:
`PERSONAL_XMB_RIOT_CLIENT_SECRET`
Register:
`http://127.0.0.1:53685/callback`

## Spotify
Enter the Spotify Client ID in Personal XMB under Settings > Accounts and save it. The Client ID is stored in the local Personal XMB user-data directory and is not committed to the repository.

Register:
`http://127.0.0.1:53682/callback`

Spotify desktop authorization uses PKCE and does not require a client secret. After authorization, the Spotify account identifier is also stored locally. Access and refresh tokens are encrypted with Electron's OS-backed `safeStorage` rather than being written as plaintext settings.

## Social-data limitations
The account surface is functional, but the providers do not expose an identical public friend API. Discord's standard OAuth flow is not the same thing as access to a user's private friend graph, Xbox social APIs are governed by Xbox services access, and Riot friend/presence data is not provided as a generic RSO friend list.