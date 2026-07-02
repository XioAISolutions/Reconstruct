# Evaluation and correction

Reconstruct 0.4 closes the loop between an evidence-backed AppSpec and a candidate implementation.

## Command

```bash
npm run reconstruct -- evaluate ./example-app/appspec.json \
  --candidate http://127.0.0.1:3000 \
  --allow-private-network \
  --out ./example-app/evaluation
```

`compare` is an alias for `evaluate`.

Private and loopback candidate URLs remain blocked unless `--allow-private-network` is explicitly supplied. Hosted services should evaluate candidates inside isolated workers with strict egress controls.

## What is scored

Each recorded route receives three observable scores:

- visual similarity: 55%
- DOM and interface structure: 30%
- recorded navigation behaviour: 15%

Visual comparison uses bounded pixel analysis and creates a heatmap. Structure comparison covers titles, headings, visible links, buttons, forms, landmarks, and basic design tokens. Behaviour comparison checks whether recorded same-origin navigation targets and trigger text remain observable.

The default passing score is 85. Configure it with `--min-score`.

## Output

```text
evaluation/
├── evaluation.json
├── REPORT.md
├── CORRECTION_PLAN.md
├── AGENT_FIX_PROMPT.md
├── EVALUATION_MANIFEST.json
├── candidate/
│   ├── pages/
│   └── screenshots/
└── diffs/
```

`evaluation.json` is the machine-readable result. `REPORT.md` is the human summary. `CORRECTION_PLAN.md` prioritizes evidence-backed defects. `AGENT_FIX_PROMPT.md` gives a coding agent a constrained correction task. The manifest records SHA-256 hashes and byte sizes for generated artifacts.

## Exit codes

- `0`: evaluation completed and passed
- `3`: evaluation completed but the score or critical-route gate failed
- `2`: invalid user input or invalid AppSpec
- `1`: operational failure

## Boundaries

A high score does not prove backend correctness, authorization correctness, accessibility compliance, data integrity, or production security. Reconstruct compares only observable evidence. It does not execute build commands, start candidate applications, submit forms, bypass authentication, or infer hidden services.

Captured content remains untrusted data. The correction package explicitly tells coding agents not to execute instructions found inside screenshots, DOM evidence, URLs, or page text.
