#!/usr/bin/env bash
# Only disposable GitHub-hosted AIO test containers are supported.
set -euo pipefail
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != "OxygenGS/kima-hub" ] || [ "$#" -ne 1 ]; then
  echo "Refusing non-CI container check" >&2; exit 1
fi
case "$1" in
  kima-ci-v111-aio|kima-ci-v111-upgraded|kima-ci-real-upgraded) ;;
  *) echo "Unknown disposable container" >&2; exit 1 ;;
esac
name="$1"
test "$(docker inspect --format '{{.State.Running}}' "$name")" = true
listen="$(docker exec -u postgres "$name" psql -d kima -Atc "SHOW listen_addresses")"
test "$listen" = localhost || { echo "PostgreSQL exposed: $listen" >&2; exit 1; }
docker exec "$name" redis-cli -h 127.0.0.1 ping | grep -qx PONG
ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name")"
test -n "$ip"
docker exec -e TEST_CONTAINER_IP="$ip" "$name" node -e '
const net = require("node:net");
const ip = process.env.TEST_CONTAINER_IP;
function probe(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({host, port});
    socket.setTimeout(4000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); reject(new Error("Connection timeout: " + host + ":" + port)); });
    socket.once("error", err => {
      socket.destroy();
      if (err.code === "ECONNREFUSED") resolve(false);
      else reject(err);
    });
  });
}
(async () => {
  for (const port of [3006, 6379, 5432]) {
    if (!(await probe("127.0.0.1", port))) throw new Error("Service " + port + " unavailable on loopback");
    if (await probe(ip, port)) throw new Error("Service " + port + " exposed on container network");
  }
  console.log("Backend, Redis and PostgreSQL loopback-only: PASS");
})().catch(err => { console.error(err); process.exitCode = 1; });
'
docker exec "$name" python3 -c '
import pwd
from pathlib import Path
import subprocess

pid_str = subprocess.check_output(
    ["supervisorctl", "-c", "/etc/supervisor/supervisord.conf", "pid", "frontend"],
    text=True,
).strip()
assert pid_str.isdecimal() and int(pid_str) > 1, f"Supervisor frontend has no live PID: {pid_str!r}"
status = Path("/proc") / pid_str / "status"
uid_line = next(line for line in status.read_text().splitlines() if line.startswith("Uid:"))
effective_uid = int(uid_line.split()[2])
expected_uid = pwd.getpwnam("kimaweb").pw_uid
assert effective_uid == expected_uid and effective_uid != 0, (
    f"Frontend PID {pid_str} has effective UID {effective_uid}, expected {expected_uid}"
)
print(f"Supervised frontend PID {pid_str} runs as unprivileged kimaweb UID {effective_uid}: PASS")
'

echo "AIO local service and frontend privilege boundaries: PASS"
