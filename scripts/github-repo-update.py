#!/usr/bin/env python3
"""One-shot GitHub repo metadata updater for DKUMARGUPTA/morse.

Sets the repo description, homepage URL and topic tags in a single run.
Usage:  GH_TOKEN=<your_token> python3 scripts/github-repo-update.py
Needs a classic token with `repo` scope (or fine-grained with
Administration: write). Safe to re-run — it is idempotent.
"""

import json
import os
import sys
import urllib.request

REPO = "DKUMARGUPTA/morse"
API = f"https://api.github.com/repos/{REPO}"

DESCRIPTION = (
    "Chat normally. Talk in Morse. - E2EE-capable PWA messenger with Morse "
    "code over sound, light & vibration. Next.js 16 - React 19 - Prisma - Supabase."
)
HOMEPAGE = "https://morse-ashen.vercel.app"
TOPICS = [
    "morse-code",
    "morse",
    "messenger",
    "chat-app",
    "e2ee",
    "end-to-end-encryption",
    "encryption",
    "nextjs",
    "react",
    "typescript",
    "pwa",
    "prisma",
    "supabase",
    "websocket",
    "realtime",
    "tailwindcss",
    "vercel",
    "ham-radio",
    "cw",
    "telegraphy",
]

TOKEN = os.environ.get("GH_TOKEN", "")
if not TOKEN:
    sys.exit("GH_TOKEN env var required")


def call(method: str, url: str, body: dict | None = None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "morse-repo-setup",
    })
    with urllib.request.urlopen(req) as res:
        return res.status, res.read().decode()


def main() -> None:
    status, out = call("GET", API)
    print(f"GET repo -> {status}")
    cur = json.loads(out)

    patch = {}
    if cur.get("description") != DESCRIPTION:
        patch["description"] = DESCRIPTION
    if cur.get("homepage") != HOMEPAGE:
        patch["homepage"] = HOMEPAGE
    if patch:
        status, _ = call("PATCH", API, patch)
        print(f"PATCH description/homepage -> {status}")
        if status != 200:
            sys.exit("PATCH failed")
    else:
        print("description/homepage already up to date")

    if sorted(cur.get("topics") or []) != sorted(TOPICS):
        status, _ = call("PUT", f"{API}/topics", {"names": TOPICS})
        print(f"PUT topics ({len(TOPICS)}) -> {status}")
        if status != 200:
            sys.exit("topics update failed")
    else:
        print("topics already up to date")

    print("done.")


if __name__ == "__main__":
    main()
