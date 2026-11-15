#!/usr/bin/env bash
# Morse Messenger — API smoke test
# Usage: ./scripts/api-smoke-test.sh [BASE_URL]
# Creates two disposable QA users, exercises the core API flows, then deletes them.
set -u
BASE="${1:-http://localhost:3000}"
TS=$(date +%s)
A_EMAIL="qa-a-$TS@morse.test"
B_EMAIL="qa-b-$TS@morse.test"
PASS="qa-pass-12345"
JA=/tmp/qa-a.jar; JB=/tmp/qa-b.jar
OUT=/tmp/qa-out.json
rm -f "$JA" "$JB"
PASS_N=0; FAIL_N=0
# random client IP per run — keeps repeated runs clear of the login/register rate limits
XF="X-Forwarded-For: 10.$((RANDOM % 250 + 1)).$((RANDOM % 250 + 1)).$((RANDOM % 250 + 1))"

check() { if [ "$2" = "$3" ]; then echo "PASS: $1 ($3)"; PASS_N=$((PASS_N+1)); else echo "FAIL: $1 (expected $2, got $3)"; FAIL_N=$((FAIL_N+1)); fi }
code()  { curl -s -H "$XF" -o "$OUT" -w "%{http_code}" "$@"; }
jf()    { python3 -c "import json,sys;d=json.load(open('$OUT'));print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null || echo ""; }

# --- auth ---
c=$(code -c "$JA" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$A_EMAIL\",\"password\":\"$PASS\",\"displayName\":\"QA Tester A\"}")
check "register A" 200 "$c"
c=$(code -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$A_EMAIL\",\"password\":\"$PASS\",\"displayName\":\"QA A dup\"}")
check "duplicate email -> 409" 409 "$c"
c=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$A_EMAIL\",\"password\":\"wrong-pass\"}")
check "wrong password -> 401" 401 "$c"
c=$(code "$BASE/api/auth/me")
check "me without session -> 200 (user null by design)" 200 "$c"
c=$(code -c "$JB" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$B_EMAIL\",\"password\":\"$PASS\",\"displayName\":\"QA Tester B\"}")
check "register B" 200 "$c"
c=$(code -c "$JA" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$A_EMAIL\",\"password\":\"$PASS\"}")
check "login A" 200 "$c"
c=$(code -b "$JA" "$BASE/api/auth/me"); check "me A" 200 "$c"
A_ID=$(jf "['user']['id']")
B_ID=$(curl -s -b "$JB" "$BASE/api/auth/me" | python3 -c "import json,sys;print(json.load(sys.stdin)['user']['id'])")
echo "  A_ID=$A_ID B_ID=$B_ID"

# --- users directory ---
c=$(code -b "$JA" "$BASE/api/users?q=QA%20Tester%20B"); check "user search" 200 "$c"

# --- conversation + messages ---
c=$(code -b "$JA" -X POST "$BASE/api/conversations" -H 'Content-Type: application/json' -d "{\"userId\":\"$B_ID\"}")
check "create 1:1 conversation" 200 "$c"
CONV=$(jf "['conversationId']")
echo "  CONV=$CONV"
c=$(code -b "$JA" -X POST "$BASE/api/conversations/$CONV/messages" -H 'Content-Type: application/json' -d '{"text":"SOS hello from QA","sendMode":"dual"}')
check "send message" 200 "$c"
MSG=$(jf "['message']['id']")
c=$(code -b "$JB" "$BASE/api/conversations/$CONV")
check "B fetch conversation + messages" 200 "$c"
B_TEXT=$(python3 -c "import json;d=json.load(open('$OUT'));print(d['messages'][-1]['text'] if d.get('messages') else '')")
check "B sees message text" "SOS hello from QA" "$B_TEXT"
c=$(code -b "$JA" -X PATCH "$BASE/api/messages/$MSG" -H 'Content-Type: application/json' -d '{"text":"SOS edited"}')
check "edit own message" 200 "$c"
c=$(code -b "$JB" -X PATCH "$BASE/api/messages/$MSG" -H 'Content-Type: application/json' -d '{"text":"hijack"}')
check "edit someone else's message -> 403" 403 "$c"
c=$(code -b "$JB" -X POST "$BASE/api/conversations/$CONV/read")
check "B mark read" 200 "$c"
c=$(code -b "$JA" -X DELETE "$BASE/api/messages/$MSG")
check "hide message for self" 200 "$c"

# --- E2EE keys ---
c=$(code -b "$JA" -X POST "$BASE/api/keys" -H 'Content-Type: application/json' -d '{"publicKey":"{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"abc\",\"y\":\"def\"}"}')
check "publish public key" 200 "$c"
c=$(code -b "$JA" -X POST "$BASE/api/keys" -H 'Content-Type: application/json' -d '{"publicKey":"not-a-jwk"}')
check "bad key rejected -> 400" 400 "$c"

# --- settings + export ---
c=$(code -b "$JA" "$BASE/api/account/export"); check "account export" 200 "$c"

# --- cleanup: delete both QA accounts ---
c=$(code -b "$JA" -X DELETE "$BASE/api/account/delete" -H 'Content-Type: application/json' -d '{"confirm":"QA Tester A"}')
check "delete account A" 200 "$c"
c=$(code -b "$JB" -X DELETE "$BASE/api/account/delete" -H 'Content-Type: application/json' -d '{"confirm":"QA Tester B"}')
check "delete account B" 200 "$c"
c=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$A_EMAIL\",\"password\":\"$PASS\"}")
check "deleted user cannot login" 401 "$c"

echo ""
echo "RESULT: $PASS_N passed, $FAIL_N failed"
[ "$FAIL_N" = "0" ]
