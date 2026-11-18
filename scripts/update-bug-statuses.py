#!/usr/bin/env python3
"""Update bug statuses in replica/bugs-round3.md after the fix round."""
import re

PATH = '/home/z/my-project/replica/bugs-round3.md'
STATUS = {
    'BUG-R3-001': "fixed in this round (order desc+take 200, reversed oldest-first; commit recorded in git log)",
    'BUG-R3-002': "fixed in this round (per-account key namespaces: e2ee.ts setE2eeUser/storageKey, legacy key claimed once; commit recorded in git log)",
    'BUG-R3-003': "mitigated in this round (server 409 KEY_CONFLICT guard on silent key overwrite + in-app conflict notice + explicit Settings reset with confirm; full multi-device envelope encryption remains open, tracked in parity.md next-tier)",
    'BUG-R3-004': "fixed in this round (401 -> clearSession in loadConversations/openConversation/reloadConversation/applyMessageStub/sendMessage/editMessage)",
    'BUG-R3-005': "fixed in this round (clearSession resets replyTo + composerDraft)",
    'BUG-R3-006': "fixed in this round (disablePush() before session teardown on sign-out, sign-out-all and account deletion)",
    'BUG-R3-007': "fixed in this round (convLoadError state + WifiOff retry card in chat-list; stale-list protection)",
    'BUG-R3-010': "fixed in this round (client posts its local calendar day; server validates ^\\d{4}-\\d{2}-\\d{2}$ and stores it)",
    'BUG-R3-011': "fixed in this round (GroupAvatar initials via Array.from code-point iteration)",
    'BUG-R3-012': "fixed in this round (sendMessage sets lastSendFail='rate' on 429; composer shows errSlowDown instead of errNetwork)",
    'BUG-R3-008': "open (offline banner — next round)",
    'BUG-R3-009': "open (storage event sync — next round)",
}

with open(PATH, 'r', encoding='utf-8') as f:
    text = f.read()

out = []
current = None
for line in text.split('\n'):
    m = re.match(r'^### (BUG-R3-\d+)', line)
    if m:
        current = m.group(1)
    if line.strip() == 'Status: open' and current in STATUS:
        out.append(f'Status: {STATUS[current]}')
    else:
        out.append(line)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print('updated', sum(1 for _ in STATUS), 'statuses')
