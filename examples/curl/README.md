# curl Example

```bash
export PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787
export PINGBRIDGE_TOKEN=change-me

curl -X POST "$PINGBRIDGE_ENDPOINT/v1/events" \
  -H "Authorization: Bearer $PINGBRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "curl-example",
    "eventType": "task.completed",
    "target": "me",
    "title": "curl notification",
    "message": "PingBridge received this event from curl.",
    "changed": true
  }'
```
