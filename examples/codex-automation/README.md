# Codex Automation Example

Build the CLI first:

```bash
npm run build
```

Send a completion notification:

```bash
PINGBRIDGE_ENDPOINT=http://127.0.0.1:8787 \
PINGBRIDGE_TOKEN="$PINGBRIDGE_TOKEN" \
./examples/codex-automation/notify.sh "GitHub commit report generated."
```

For failure paths:

```bash
node packages/cli/dist/index.js notify \
  --source trakt-dayone \
  --event sync.failed \
  --target me \
  --title "Trakt archive failed" \
  --message "OAuth invalid_grant; reauthorization required." \
  --severity error
```
