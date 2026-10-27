"""Exercise the pinned Python BullMQ worker against disposable Redis.

Run in GitHub CI after installing only the exact BullMQ/msgpack pins from the
CLAP requirements. This specifically catches compatibility regressions after
the patched BullMQ v3 transition that an import-only Docker guard misses.
No music, credentials, model files, network endpoints or production services.
"""

import asyncio
import importlib.metadata
import os
from pathlib import Path
from uuid import uuid4

from bullmq import Queue, Worker


def verify_pins() -> None:
    requirements = (Path(__file__).parent / "requirements.txt").read_text()
    for name in ("bullmq", "msgpack"):
        matching = [
            line.split("==", 1)[1].strip()
            for line in requirements.splitlines()
            if line.startswith(name + "==")
        ]
        assert len(matching) == 1, f"Missing or duplicate {name} pin"
        installed = importlib.metadata.version(name)
        assert installed == matching[0], f"{name} {installed} != pinned {matching[0]}"


async def run_smoke() -> None:
    url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6390")
    queue_name = "kima-v112-smoke-" + uuid4().hex
    processed = asyncio.Event()
    errors: list[str] = []
    handled: list[tuple[str, str]] = []

    async def process(job, token):
        assert token, "Worker must pass a job lock token"
        assert job.name == "smoke"
        assert job.data == {"trackId": "synthetic-test-only"}
        handled.append((job.name, job.id))
        processed.set()
        return {"ok": True}

    # Match the CLAP analyzer's production Worker constructor, including the
    # connection URL string and options, without loading the audio models.
    queue = Queue(queue_name, {"connection": url})
    worker = Worker(queue_name, process, {
        "connection": url,
        "concurrency": 2,
        "lockDuration": 30000,
    })
    worker.on("error", lambda error: errors.append(str(error)))
    worker.on("failed", lambda job, error: errors.append(str(error)))

    try:
        job = await queue.add("smoke", {"trackId": "synthetic-test-only"})
        await asyncio.wait_for(processed.wait(), timeout=25)
        assert handled == [("smoke", job.id)], handled
        assert not errors, errors
        print("PASS: patched Python BullMQ Worker processed a real Redis job")
    finally:
        # Fail closed on a stuck Worker shutdown rather than hanging CI.
        await asyncio.wait_for(worker.close(), timeout=20)
        await asyncio.wait_for(queue.close(), timeout=10)


if __name__ == "__main__":
    verify_pins()
    asyncio.run(run_smoke())
