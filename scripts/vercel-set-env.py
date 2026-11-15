#!/usr/bin/env python3
"""Set VAPID env vars on the Vercel 'morse' project (idempotent upsert)."""
import json
import os
import sys
import urllib.request

TOKEN = os.environ["VERCEL_TOKEN"]
PROJECT = "prj_kg6echyCB6mbHXTSa48hdsBPb2jX"
API = f"https://api.vercel.com/v10/projects/{PROJECT}/env"

# read local vapid env file
vals = {}
with open("/home/z/my-project/.env.vapid.local") as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            vals[k] = v

required = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]
missing = [k for k in required if not vals.get(k)]
if missing:
    sys.exit(f"missing keys: {missing}")

def api(method, url, payload=None):
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }, data=json.dumps(payload).encode() if payload else None)
    with urllib.request.urlopen(req) as r:
        body = r.read().decode()
        return r.status, json.loads(body) if body else {}

# existing env keys
_, envs = api("GET", f"https://api.vercel.com/v9/projects/{PROJECT}/env")
existing = {e["key"]: e["id"] for e in envs.get("envs", [])}

for key in required:
    payload = {
        "key": key,
        "value": vals[key],
        "type": "encrypted",
        "target": ["production", "preview", "development"],
    }
    if key in existing:
        status, _ = api("PATCH", f"{API}/{existing[key]}", payload)
        print(f"{key}: updated ({status})")
    else:
        status, _ = api("POST", API, payload)
        print(f"{key}: created ({status})")
print("done")
