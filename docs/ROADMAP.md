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
- [ ] Discord connection/authentication
- [ ] Friends/presence data
- [ ] Online/idle/DND/offline states
- [ ] Current activity/game
- [ ] Rich presence details where available
- [ ] Friend selection/details view

### Xbox
- [ ] Xbox/Microsoft authentication
- [ ] Friends/presence data
- [ ] Current game/activity
- [ ] Online status
- [ ] Friend details

### Riot
- [ ] Riot account integration
- [ ] League presence/status where supported
- [ ] Current game information where supported
- [ ] Friend list/status where supported

### Unified Friends UI
- [ ] Cross-service friend model
- [ ] Service badges
- [ ] Duplicate-account handling
- [ ] Sort/filter controls
- [ ] Friend detail panel
- [ ] Service-specific actions
- [ ] Background refresh without blocking navigation

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
- [ ] OAuth flow
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


## Current build status — September 23, 2026

The launcher now has the first real **Accounts / Social integration layer** in place:

- Discord OAuth2 desktop login with PKCE and persistent local token storage.
- Microsoft account OAuth2 desktop login with PKCE.
- Xbox Live user-token/XSTS exchange attempted after Microsoft login.
- Riot Sign On (RSO) OAuth flow wired for approved production credentials.
- Unified account summaries exposed to the renderer through the Electron preload bridge.
- Friends & Accounts XMB surface with sign-in, reconnect, disconnect and refresh controls.
- Spotify Connect action corrected to use the existing Spotify OAuth flow.
- Provider limitations are explicitly surfaced instead of pretending Discord/Xbox/Riot expose identical friend APIs.

The next implementation step for the Friends phase is **provider-specific social adapters**: Discord's supported Social SDK path, Xbox services social access where the application is eligible, and Riot-supported account/game data. The XMB UI should continue consuming one normalized friend/presence model.
