# Security

PingBridge is intended for self-hosted trusted environments, but it still handles notification secrets.

## Token Boundary

Set `server.appToken` and require callers to send:

```http
Authorization: Bearer <token>
```

If `server.appToken` is empty, API endpoints are unauthenticated. Do this only for isolated local experiments.

## Secret Placement

Third-party apps should not store provider secrets:

- no Telegram bot token in Obsidian plugins
- no Bark device key in shell scripts
- no ntfy private token in automation repos

Store these values in the PingBridge server environment and reference them from YAML via `${NAME}`.

## ntfy Topics

Public ntfy topics are guessable if their names are weak. Use a long private topic name or an authenticated ntfy server.

## Logs

SQLite stores event payloads and delivery errors. Do not put passwords, access tokens, one-time codes, private contact details, or sensitive personal data into event `title`, `message`, `items`, or `metadata`.

## Network Exposure

For local-only usage, bind to `127.0.0.1`.

For Docker or LAN usage, bind to `0.0.0.0` only behind firewall rules, a reverse proxy, or a private network boundary.

## Rotation

Rotate these independently:

- `PINGBRIDGE_TOKEN`
- Telegram bot token
- Bark device key
- ntfy token/topic

After rotation, restart the PingBridge server so environment-expanded config is reloaded.
