# Security — Kima Hub Community Fork

This is an independently maintained fork of [Kima Hub](https://github.com/Chevron7Locked/kima-hub) by Chevron7Locked.

This document describes the security improvements implemented in this fork, their validation, and known limitations.

## Security Improvements

### 1. Granular authorization

Two additional user permissions have been introduced:

- `canRequestAlbums` — controls album download requests.
- `canDownloadTracks` — controls individual track downloads.

Permissions are enforced by the backend, independently of frontend visibility.

Validation confirmed:
- Unauthorized album requests return HTTP 403.
- Unauthorized track downloads return HTTP 403.
- Administrators pass authorization checks.
- Requests without valid authentication return HTTP 401.

### 2. Dependency security

Frontend and backend dependencies were updated to address known vulnerabilities.

At the time of validation:
- Backend npm audit reported zero known vulnerabilities.
- Frontend production dependency audit reported zero known vulnerabilities.
- The full frontend development dependency tree still contained five high-severity audit findings.

These findings involved development tooling rather than required frontend production dependencies.

### 3. Production runtime hardening

The Docker build removes frontend development dependencies after the production build using:

`npm prune --omit=dev --ignore-scripts`

The Next.js configuration was updated so the optional bundle analyzer is loaded only when explicitly enabled.

This allows the frontend to run without its development dependencies.

### 4. Authentication

The frontend uses Bearer-token authentication for protected API requests.

Backend authorization checks do not rely solely on frontend restrictions.

## Validation

The development test suite previously passed:

- 314 frontend tests.
- 879 backend tests.
- 1,193 tests in total.

Additional validation included:
- Permission enforcement tests.
- Successful production builds.
- Successful application health checks.
- Database migration testing using restored production data.
- Successful application deployment and functional checks.

These tests do not constitute an independent penetration test or comprehensive security audit.

## Known Limitations and Residual Risks

### Docker image layers

Development dependencies have been removed from the final running container filesystem.

However, packages installed during earlier Docker build layers may remain recoverable from the image history.

A multi-stage build may reduce this exposure.

### Development dependency findings

The frontend development dependency tree contained five high-severity npm audit findings during the last recorded review.

These findings should be reassessed when dependencies are updated.

### Security guarantees

Zero reported vulnerabilities in an npm audit does not prove that an application is free of vulnerabilities.

Security depends on application configuration, dependency versions, infrastructure, authentication, authorization, and ongoing maintenance.

### Database migrations

Database migrations should be preceded by backups.

Rollback after a database schema change may require restoring a database backup rather than only reverting the Docker image.

## Vulnerability Reporting

Please report suspected vulnerabilities privately to the repository maintainer rather than publishing exploit details in a public issue.

No formal security response time or coordinated disclosure program is currently established.

## Upstream Attribution

Original project: https://github.com/Chevron7Locked/kima-hub

This fork is independently maintained and is not an official upstream security release.

License: GPLv3.
