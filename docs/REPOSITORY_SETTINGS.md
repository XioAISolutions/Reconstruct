# Recommended repository settings

Apply these controls in GitHub after the repository becomes public or before adding additional maintainers.

## Main branch protection

- require pull requests before merging
- require at least one approving review from a code owner
- dismiss stale approvals when new commits are pushed
- require the CI and Browser integration checks
- require conversations to be resolved
- block force pushes and branch deletion
- require linear history or squash merging
- restrict bypass permissions to emergency maintainers

## Security

- enable Dependabot alerts and security updates
- enable secret scanning and push protection when available
- enable private vulnerability reporting
- enable CodeQL default setup for JavaScript and GitHub Actions when supported by the organization plan
- review Actions permissions and keep the default workflow token read-only

## Actions

- allow only GitHub-authored and explicitly approved actions
- require action references to be pinned or managed by Dependabot
- do not allow workflows from forks to receive write tokens or secrets

## Releases

- create signed tags for public releases
- attach checksums and generated provenance where supported
- publish only from a protected environment with required reviewers
- never publish from a contributor pull request context
