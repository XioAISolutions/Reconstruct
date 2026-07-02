# AppSpec 0.3

AppSpec is Reconstruct's provider-neutral product contract.

## Screens

Each captured route becomes a screen with evidence references and shared component IDs.

## Flows

Observed navigation links may include structured fields:

```json
{
  "id": "flow-home-pricing",
  "name": "Home to Pricing",
  "sourceScreenId": "screen-home",
  "targetScreenId": "screen-pricing",
  "trigger": "Pricing",
  "steps": ["Open /", "Follow Pricing", "Arrive at /pricing"],
  "assessment": {"status": "observed", "confidence": 0.95},
  "evidence": []
}
```

The source and target IDs must reference captured screens.

## Assessments

Every finding carries an assessment:

```json
{
  "status": "observed",
  "confidence": 0.99,
  "reason": "Optional explanation"
}
```

## Evidence

Evidence references are content-addressed:

```json
{
  "type": "map",
  "path": "evidence/route-graph.json",
  "sha256": "...64 lowercase hexadecimal characters...",
  "bytes": 12345,
  "mediaType": "application/json"
}
```

Paths are relative to the project directory and cannot contain traversal segments. The manifest records every captured artifact.

## Capture metadata

Multi-page runs record page count, failed pages, all crawl limits, observed hosts, screenshot methods, request count, and whether any limit truncated the result.
