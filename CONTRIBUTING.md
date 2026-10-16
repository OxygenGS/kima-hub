# Contributing to OxygenGS Kima Hub

This is the independently maintained [OxygenGS fork](https://github.com/OxygenGS/kima-hub) of [Kima Hub](https://github.com/Chevron7Locked/kima-hub). Keep upstream attribution and the GPLv3 license intact.

## Where changes belong

- Contributions to **this fork** belong in OxygenGS pull requests. Do not submit fork-specific permissions, branding, release or EN/NL bugs to the upstream project as if it maintains our fork.
- The fork currently has **Issues and Discussions disabled**. The inherited upstream Discussion and sponsorship links have therefore been removed from fork templates. Do not use unrelated upstream channels as a substitute for the fork's disabled tracker.
- Normal focused changes should target `main`. Stacked Draft PRs are allowed for substantial coordinated work: currently #5 (language foundation), #6 (upstream v1.11 integration base), #7 (combined application).
- Open a pull request containing a concise description, the relevant test results and any security or migration impact. Never commit real installation identifiers, environment files, passwords, private logs or production backup paths.

## Build and verify

Start with [development.md](docs/development.md). Follow the project's TypeScript, React and backend conventions and run the relevant frontend/backend tests, lint and typechecks. Production and upgrade paths require the exact candidate commit's AIO checks, not just a successful unit-test run.

The published OxygenGS image namespace is `ghcr.io/oxygengs/kima-hub`. Do not replace fork installation instructions with an upstream image or a tag that has not been published. For published-version guidance use [OxygenGS Releases](https://github.com/OxygenGS/kima-hub/releases).

## Review and publication boundaries

A passing pull request is not automatically ready for a tag or registry push. Release candidates require explicit review, versioning, security and data-migration acceptance. Individual Docker/Compose/LXC/hypervisor installations are owned and operated separately and are not part of the fork source repository.

For suspected security issues, use an available **private** maintainer/security contact mechanism rather than posting working exploit details in public PRs or unrelated upstream channels.
