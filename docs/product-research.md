# Product Research Notes

This MVP was checked against actively maintained notification/BaaS-style projects on GitHub.

## Reviewed Projects

| Project | GitHub                                | Pattern to Borrow                                                                                                                               |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Novu    | https://github.com/novuhq/novu        | Notification infrastructure exposes a backend API and SDKs; apps trigger notification workflows instead of integrating every provider directly. |
| ntfy    | https://github.com/binwiederhier/ntfy | Simple publish/subscribe HTTP API; a topic can be created by publish/subscribe and is easy to test with curl.                                   |
| Gotify  | https://github.com/gotify/server      | Self-hosted push service with server-side app tokens and a simple message API.                                                                  |
| Apprise | https://github.com/caronc/apprise     | Provider abstraction layer; many notification destinations normalize into one sending interface.                                                |

GitHub metadata checked on 2026-06-30 showed all four repos had recent pushes in June 2026 and substantial usage: Novu around 39k stars, ntfy around 31k, Apprise around 16k, and Gotify around 15k.

## MVP Implications for PingBridge

PingBridge should be treated as a backend notification service, not as a local-only sender.

The minimal usable flow is:

1. A PingBridge service operator configures provider secrets once.
2. An app developer installs a PingBridge SDK.
3. The app stores only `endpoint`, `appToken`, and `target`.
4. The app can run `health` and `preview` tests without sending real notifications.
5. The app calls `notify` for real user-visible delivery.

This is why the SDK exposes:

- `health()`
- `preview(...)`
- `notify(...)`
- `changed(...)`
- `failed(...)`
- `authExpired(...)`

And why the repository includes:

- publishable package metadata for `@pingbridge/client`
- package smoke tests
- external consumer smoke tests
- provider smoke tests separated from the default quiet test gate
