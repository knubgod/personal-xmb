# Personal XMB Roadmap

Personal XMB is being developed as a Windows/macOS XMB-style launcher: fast, visual, controller-friendly, and built around a single consistent interface for games, apps, services, and friends.

## Prototype — v0.1

**Goal:** a seamless daily-launcher prototype that can be run outside VS Code.

### Core experience
- [x] XMB category navigation
- [x] Item/action navigation
- [x] Keyboard navigation
- [x] Mouse navigation
- [x] Mouse-wheel navigation
- [x] Navigation sound effects
- [x] Startup animation
- [x] Startup reveal / boot sequencing
- [x] Dynamic category/item backgrounds
- [x] Artwork manifest and persistent caching
- [x] Failed-artwork protection
- [x] Settings surface
- [x] Theme system
- [x] Audio controls
- [x] Window/fullscreen controls
- [x] Exit IPC bridge
- [ ] Final visual polish pass
- [ ] Packaged Windows build
- [ ] Clean standalone run outside the development environment
- [ ] One-hour real-world stability test

### Launchers
- [x] Generic Electron launch bridge
- [x] Steam launching
- [x] Riot Client / League launching
- [x] Xbox URI launching
- [x] URL/external launching
- [ ] Verify Plutonium launcher on the target PC
- [ ] Verify RetroArch launcher on the target PC
- [ ] Verify Minecraft launcher on the target PC
- [ ] Launcher error/recovery UI polish

### Artwork
- [x] Universal artwork slots
- [x] Main-process artwork caching
- [x] Renderer artwork manifest
- [x] Steam artwork support
- [x] Background artwork
- [x] Built-in Settings icons
- [x] Missing-file protection
- [ ] Finish artwork coverage for every prototype category
- [ ] Artwork loading placeholders
- [ ] Cache versioning / cleanup
- [ ] Final artwork performance pass

## Prototype Phase 2 — Friends

**Goal:** turn the Friends category into a unified presence dashboard.

### Discord
- [x] Discord connection/authentication
- [x] Discord profile retrieval
- [x] Authorized linked-account retrieval (OAuth `connections` scope)
- [x] Display Discord identity and linked accounts in Friends
- [ ] Discord Social SDK integration
- [ ] Friends/presence data
- [ ] Online/idle/DND/offline states
- [ ] Current activity/game
- [ ] Rich presence details where available
- [ ] Friend selection/details view
- [x] Truthful account-connected / friends-presence-unavailable provider state

### Xbox
- [x] Xbox/Microsoft authentication foundation
- [x] Xbox Live token/XSTS exchange foundation
- [x] Xbox Live people-list integration (up to 1,000 entries, paginated)
- [x] Xbox profile enrichment (gamertag and avatar where returned)
- [x] Xbox presence/current-title lookup where privacy/API access permits
- [x] Refresh expired Microsoft/Xbox tokens when a refresh token is available
- [ ] Runtime validation against the user's Xbox account and privacy settings

### Riot
- [x] Riot RSO account integration
- [x] Account identity retrieval
- [x] Local League Client friend-list integration via the running client's lockfile
- [x] Map League Client availability and in-game activity where returned
- [x] Graceful unavailable state when League is closed, unsupported, or its local API changes
- [ ] Runtime validation on the user's Windows/League installation
- [ ] Riot's local League Client API is unsupported by Riot; this integration is best-effort and may need maintenance

### Unified Friends UI
- [x] Inline XMB Friends surface
- [x] Cross-service normalized friend model
- [x] Service badges
- [x] Platform switching
- [x] Keyboard/controller navigation
- [x] Scrolling friend selection
- [x] Provider availability states
- [x] Background refresh without blocking navigation
- [x] Subtle selection/provider animations
- [x] XMB navigation sound integration
- [ ] Duplicate-account handling
- [ ] Sort/filter controls
- [x] Friend detail panel, populated on initial selection
- [x] Game artwork/activity preview in the right-hand detail card
- [x] Service-specific actions (Steam profile; provider connect/reconnect/disconnect)

## Phase 3 — Platform Expansion

- [ ] RetroArch category
- [ ] Plutonium category
- [ ] Battle.net category
- [ ] Additional Windows applications
- [ ] Configurable custom launchers
- [ ] Per-item executable/path configuration
- [ ] Launch arguments
- [ ] Working-directory support
- [ ] Detect installed applications where practical

## Phase 4 — Media & Services

### Spotify
- [x] OAuth flow
- [x] Launch installed Spotify desktop app without minimizing it
- [x] Remove the legacy embedded Spotify player/overlay from the XMB UI
- [ ] Now Playing
- [ ] Play/pause
- [ ] Previous/next
- [ ] Volume
- [ ] Recently played
- [ ] Album/artist artwork
- [ ] Music-focused XMB presentation

### Server / Home Lab
- [ ] Portainer status
- [ ] Grafana dashboard shortcut
- [ ] Uptime Kuma status
- [ ] Service health indicators
- [ ] Configurable server endpoints

## Phase 5 — XMB Experience

- [ ] Category-specific visual identities
- [ ] Contextual item panels
- [ ] Improved selection transitions
- [ ] XMB-style horizontal/vertical motion tuning
- [ ] More startup/transition sound design
- [ ] Controller support
- [ ] Gamepad navigation
- [ ] Context-sensitive control hints
- [ ] Improved accessibility settings
- [ ] Reduced-motion mode
- [ ] Performance monitoring
- [ ] Startup timing optimization

## Phase 6 — Personalization

- [ ] User-selectable themes
- [ ] Custom backgrounds
- [ ] Background rotation
- [ ] Custom category ordering
- [ ] Hide/show categories
- [ ] Custom item ordering
- [ ] Custom artwork overrides
- [ ] Custom sounds
- [ ] Import/export configuration
- [ ] Backup/restore settings

## Phase 7 — Release Candidate

- [ ] Windows installer
- [ ] macOS package
- [ ] First-run setup
- [ ] Automatic configuration validation
- [ ] Dependency checks
- [ ] Launcher diagnostics
- [ ] Artwork diagnostics
- [ ] Crash/error logging
- [ ] Update strategy
- [ ] Full regression test
- [ ] Documentation
- [ ] Public release build

## Guiding priorities

1. **Navigation never breaks.**
2. **The UI should never repeatedly request something that does not exist.**
3. **The renderer should remain responsive even when network services are slow or unavailable.**
4. **External services belong behind main-process/service boundaries.**
5. **Configuration should control behavior instead of hard-coded item-specific logic wherever practical.**
6. **A service being unavailable should degrade gracefully rather than breaking the XMB.**
7. **Visual polish comes after reliable interaction, but the final product should still feel like a cohesive console-style interface.**


## Current build status — October 8, 2026

The launcher now has the first real **Accounts / Social integration layer** in place:

- Discord OAuth2 desktop login with PKCE and persistent local token storage.
- Microsoft account OAuth2 desktop login with PKCE.
- Xbox Live user-token/XSTS exchange attempted after Microsoft login.
- Riot Sign On (RSO) OAuth flow wired for approved production credentials.
- Unified account summaries exposed to the renderer through the Electron preload bridge.
- Friends & Accounts XMB surface with sign-in, reconnect, disconnect and refresh controls.
- Spotify Connect action corrected to use the existing Spotify OAuth flow.
- Provider limitations are explicitly surfaced instead of pretending Discord/Xbox/Riot expose identical friend APIs.

The current Friends implementation now has a clean provider-state model, automatic background refresh, truthful unavailable states, Steam friend data, XMB-style selection feedback, and audio hooks. The remaining real-service work is provider-specific: Discord requires the official Discord Social SDK, Xbox social access depends on the application's eligible service/API path, and Riot's public RSO flow currently identifies the signed-in account rather than exposing a general friends list. These providers must never be faked. The XMB UI continues consuming one normalized friend/presence model.

The current consolidated development base is `consolidated/xmb-approved-2026-09-26`. Friends v2 foundation, the provider registry refactor, the Friends detail panel, and the window/Spotify behavior fixes have now been merged into that base. Spotify desktop launching no longer intentionally minimizes Spotify, and the default Electron window starts maximized rather than fullscreen.


## Implementation pass — October 9, 2026

The Friends surface now renders real account cards when a provider has no friend-list data, including connected/disconnected state, account identity, Discord linked connections when the OAuth scope is granted, and connect/reconnect/disconnect/open-account actions. Refresh requests are coalesced so timer/manual refreshes do not issue duplicate concurrent Friends requests. Provider status text distinguishes a configured Steam friend-list provider from one that still needs setup.

**Provider limits remain explicit:** Steam is the only currently implemented live friend-list source. Discord profile and linked third-party accounts are available through existing OAuth scopes, but Discord friends/presence still require Social SDK access. Riot OAuth identifies the account; it does not provide a general friends list. Xbox account sign-in is available, but the Xbox social API path remains unimplemented. The UI must continue to show these limits rather than fabricating friend records.

The legacy embedded Spotify overlay/player has been removed from the renderer entry point. The Spotify category is intended to launch the installed desktop app; the launcher does not request minimized startup or minimize an existing Spotify process. OAuth/API code is retained for future desktop-control work.


## Riot/Xbox friends integration pass — October 9, 2026

The combined Friends request now queries Steam, the local League Client, and Xbox Live independently. One unavailable provider no longer prevents results from the others from rendering. Riot reads the local League Client's friends endpoint using the live lockfile credentials and makes the HTTPS request only to loopback; this is a best-effort integration because Riot does not officially support the League Client API for third-party apps.

Xbox uses the existing Microsoft OAuth account and Xbox Live/XSTS exchange to read the Xbox people collection, then requests profile and batch presence details. Friend-list pagination is capped at 1,000 entries to keep refreshes bounded. If the Xbox service rejects a request and a Microsoft refresh token is available, the provider attempts one token refresh before retrying.

The Friends detail panel now renders for the initially selected friend instead of waiting for a hover or navigation event. Game artwork has been moved out of the left-side friend tile into the right-side detail card. Presence that the service does not return is displayed as unavailable rather than assumed offline.

**Runtime testing remains required:** this environment cannot run the Electron app against the user's installed League Client or Xbox account. Xbox social endpoints can be subject to service eligibility, authorization, and privacy restrictions; the UI reports provider errors instead of synthesizing results.
