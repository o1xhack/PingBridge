# Product Research Notes

PingBridge was checked against actively maintained notification infrastructure and self-hosted notification projects.

## Reviewed Projects

| Project  | Reference                                                                       | Pattern to Borrow                                                                                                                           |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Novu     | https://docs.novu.co/platform/what-is-novu and https://github.com/novuhq/novu   | API-first notification infrastructure; apps trigger notifications through a unified backend instead of implementing every channel directly. |
| Knock    | https://docs.knock.app/send-notifications/triggering-workflows/api              | Workflow trigger API accepts a high-level trigger payload and executes cross-channel delivery behind the API boundary.                      |
| SuprSend | https://docs.suprsend.com/docs/user-preferences and https://github.com/SuprSend | User preferences and channel choices are first-class product concepts, not one-off provider calls scattered through app code.               |
| Gotify   | https://github.com/gotify                                                       | Self-hosted push server with simple APIs and per-application sending identity.                                                              |
| ntfy     | https://github.com/binwiederhier/ntfy                                           | Simple HTTP publish/subscribe model that is easy for end users to configure and test.                                                       |
| Apprise  | https://github.com/caronc/apprise                                               | Provider abstraction layer that normalizes many notification destinations behind one sending interface.                                     |

## Product Conclusions

The common shape is not "make every app call provider APIs." The useful product is a unified notification boundary:

1. Apps trigger a backend notification API.
2. Users or operators define notification preferences and channels.
3. The notification service owns provider adaptation, formatting, routing, retries, and observability.
4. App developers should integrate one API/SDK instead of reimplementing Bark, Telegram, ntfy, email, SMS, or push logic repeatedly.

## PingBridge 1.0 Implications

PingBridge should be treated as a Backend Notification as a Service for developer-owned apps and plugins.

The required app/plugin flow is:

1. App developer installs `@pingbridge/client` or calls REST.
2. The app exposes settings for PingBridge endpoint/token and user notification channels.
3. The user selects Bark, Telegram, ntfy, or multiple channels and supplies their own provider values.
4. The app sends portable config to PingBridge.
5. PingBridge validates config with `checkConfig` / `/v1/configs/health`.
6. PingBridge previews one message with `previewMessage` / `/v1/messages/preview`.
7. PingBridge sends with `sendMessage` / `/v1/messages`.

This is why the SDK now exposes:

- `health()`
- `checkConfig(...)`
- `previewMessage(...)`
- `sendMessage(...)`
- legacy/static-target helpers: `preview(...)`, `notify(...)`, `changed(...)`, `failed(...)`, `authExpired(...)`

And why the repository includes:

- publishable package metadata for `@pingbridge/client`
- portable config HTTP integration tests
- provider formatting unit tests for app name, icon, group, URL, tags, and priority
- package smoke tests
- external consumer smoke tests that install the packed SDK in a temporary outside project
- provider smoke tests separated from the default quiet test gate

## Deliberate 1.0 Limits

PingBridge is not trying to copy the full Novu/Knock/SuprSend surface in 1.0.

Out of scope for this release:

- visual workflow builder
- hosted SaaS accounts
- multi-tenant dashboard
- preference-center UI components
- queue/worker architecture
- email/SMS/in-app inbox providers

In scope:

- one portable notification config contract
- Bark, Telegram Bot, and ntfy provider adapters
- app name/icon/group customization
- config health, message preview, and message send endpoints
- TypeScript SDK for third-party projects
- requirement-driven tests that validate the integration contract from outside the package
