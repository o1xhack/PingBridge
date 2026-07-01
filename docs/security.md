# Security

PingBridge is intended for self-hosted trusted environments, but it still handles notification secrets.

## Token Boundary

Set `server.appToken` and require callers to send:

```http
Authorization: Bearer <token>
```

If `server.appToken` is empty, API endpoints are unauthenticated. Do this only for isolated local experiments.

## Secret Placement

PingBridge supports two secret-placement models.

For service-managed YAML targets, store provider values in the PingBridge server environment and reference them from YAML via `${NAME}`.

For portable app/plugin integrations, users may enter Bark, Telegram, or ntfy settings into the app. The app may store those values in the user's local settings or secret store, but must treat them as secrets:

- do not commit them
- do not print them in logs
- do not include them in `message`, `items`, `metadata`, titles, or errors
- do not send them to unrelated services

PingBridge uses portable provider config for the current request. It stores the normalized event and delivery result, but not the portable Bark device key, Telegram bot token, ntfy token, or ntfy topic.

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
