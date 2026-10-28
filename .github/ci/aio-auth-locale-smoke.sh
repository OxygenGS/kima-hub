#!/usr/bin/env bash
# Real authentication and browser acceptance on the disposable AIO CI container.
set -euo pipefail
if [ "$#" -ne 1 ] || [ "$1" != "http://127.0.0.1:3130" ] || \
   [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != OxygenGS/kima-hub ]; then
    echo "Refusing anything except the disposable repository loopback AIO fixture" >&2
    exit 1
fi
url="$1"
export KIMA_UI_BASE_URL="$url"
export KIMA_E2E_LOCALE_WALKTHROUGH=1
export KIMA_E2E_EXPECT_SYNTHETIC_MUSIC=1

# Non-secret accounts created by aio-audio-smoke.sh; no production access.
admin_user="ci_audio_admin"
admin_pass="ci-fixture-only-passphrase"
member_user="ci_audio_listener"
member_pass="ci-listener-fixture-only"
admin_login="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -d '{"username":"ci_audio_admin","password":"ci-fixture-only-passphrase"}' "$url/api/auth/login")"
token="$(printf '%s' "$admin_login" | python3 -c '
import json,sys
response=json.load(sys.stdin)
assert response["user"]["role"] == "admin", "CI audio admin missing"
print(response["token"])
')"
unset admin_login
curl -fsS --max-time 30 -o /dev/null -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' -d '{}' "$url/api/onboarding/complete"
curl -fsS --max-time 30 -H "Authorization: Bearer $token" "$url/api/auth/me" | python3 -c '
import json,sys
me=json.load(sys.stdin)
assert me["role"] == "admin" and me["onboardingComplete"] is True
print("Disposable admin completed onboarding")
'
unset token
bash .github/ci/seed-release-ui.sh
(
    cd frontend
    npm ci --no-audit --no-fund
    npx playwright install --with-deps chromium
    echo "Checking real authenticated locale flows as a CI admin"
    KIMA_TEST_USERNAME="$admin_user" KIMA_TEST_PASSWORD="$admin_pass" \
        npx playwright test tests/e2e/predeploy/authenticated-locale.spec.ts --reporter=list
    echo "Checking real authenticated locale flows as a regular CI user"
    KIMA_TEST_USERNAME="$member_user" KIMA_TEST_PASSWORD="$member_pass" \
        npx playwright test tests/e2e/predeploy/authenticated-locale.spec.ts --reporter=list
    echo "Checking complete released-source interface and actual browser audio as admin"
    KIMA_TEST_USERNAME="$admin_user" KIMA_TEST_PASSWORD="$admin_pass" \
        npx playwright test --config playwright.release-ui.config.ts
    echo "Checking complete interface and actual browser audio as regular listener"
    KIMA_TEST_USERNAME="$member_user" KIMA_TEST_PASSWORD="$member_pass" \
        npx playwright test --config playwright.release-ui.config.ts
)
echo "Real AIO authentication, EN/NL interface and browser audio checks passed for both roles"
