#!/usr/bin/env python3
"""Upsert required env vars on the Vercel 'morse' project from local .env.
Sets DATABASE_URL (Supabase pooler) and AUTH_SECRET (same value as local dev,
so the Cloudflare realtime worker can share the same signing secret later).
Usage: python3 scripts/vercel-env-set.py  (needs VERCEL_TOKEN env or reads token arg)
"""

import json
import os
import sys
import urllib.request

PROJECT = "prj_kg6echyCB6mbHXTSa48hdsBPb2jX"
ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
TOKEN = os.environ.get("VERCEL_TOKEN", "")


def load_env():
    values = {}
    with open(ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip()
    return values


def api(method, path, payload=None):
    url = f"https://api.vercel.com{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as res:
        body = res.read().decode()
        return res.status, json.loads(body) if body else {}


def main():
    env = load_env()
    db_url = env.get("DATABASE_URL")
    auth_secret = env.get("AUTH_SECRET")
    if not db_url or not db_url.startswith("postgresql://"):
        print("FATAL: .env DATABASE_URL is not a postgres URL")
        sys.exit(1)
    if not auth_secret:
        print("FATAL: .env AUTH_SECRET missing")
        sys.exit(1)

    payload = [
        {"key": "DATABASE_URL", "value": db_url, "type": "plain",
         "target": ["production", "preview", "development"]},
        {"key": "AUTH_SECRET", "value": auth_secret, "type": "plain",
         "target": ["production", "preview", "development"]},
    ]
    status, resp = api("POST", f"/v10/projects/{PROJECT}/env?upsert=true", payload)
    print("upsert status:", status)
    if status >= 400:
        print(json.dumps(resp)[:400])
        sys.exit(1)
    created = resp.get("created", [])
    if isinstance(created, dict):
        for key, info in created.items():
            print(f"  {key}: {'updated' if info.get('updatedAt') else 'created'}")
    else:
        for info in created:
            print(f"  {info.get('key')}: updated" if info.get("updatedAt") else f"  {info.get('key')}: created")
    print("OK")


if __name__ == "__main__":
    if not TOKEN:
        print("FATAL: set VERCEL_TOKEN env var")
        sys.exit(1)
    main()
