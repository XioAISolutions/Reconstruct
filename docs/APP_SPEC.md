# AppSpec 0.2

AppSpec is Reconstruct's provider-neutral product contract.

Each finding carries an assessment:

```json
{
  "status": "observed",
  "confidence": 0.99,
  "reason": "Optional explanation"
}
```

Evidence references are content-addressed:

```json
{
  "type": "screenshot",
  "path": "evidence/screenshots/home.png",
  "sha256": "...64 lowercase hexadecimal characters...",
  "bytes": 12345,
  "mediaType": "image/png"
}
```

Paths are always relative to the project directory and may not contain traversal segments. The evidence manifest records every captured artifact. AppSpec does not represent private source code or hidden implementation details as observed facts.
