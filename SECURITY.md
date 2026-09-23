# Security

Personal XMB keeps account credentials and runtime secrets out of the repository.

## Never commit

- `config/settings.json`
- `.env` files
- Spotify access or refresh tokens
- API keys or client secrets
- Discord, Microsoft/Xbox, or Riot credentials
- local databases
- private keys or certificates
- machine-specific configuration containing usernames or filesystem paths

## Runtime storage

User account settings are created locally from `config/settings.example.json`. The real settings file is ignored by Git and is only read by the Electron main process.

Sensitive settings are redacted before configuration data is exposed to the renderer.

## Electron security model

The renderer uses:

- context isolation
- renderer sandboxing
- Node integration disabled
- a restrictive Content Security Policy
- navigation restrictions
- denied webviews
- sender validation for privileged IPC handlers
- a custom artwork protocol that only serves files inside the application's own user-data directory

Privileged IPC handlers should validate their sender before accessing the filesystem, launching processes, opening external URLs, or using stored credentials.

## Before pushing

Run a repository-wide secret scan and inspect the Git diff before publishing:

```text
git status
git diff --cached
```

If a credential is ever committed, removing the file from the latest commit is not enough. Revoke/rotate the credential and remove it from repository history.
