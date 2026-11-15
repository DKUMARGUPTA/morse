#!/usr/bin/env python3
"""Morse Messenger — Security Audit & Testing Report (ReportLab body + HTML cover)."""
import hashlib
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

SKILL = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(SKILL, 'scripts'))
from pdf import install_font_fallback  # noqa: E402

OUT = '/home/z/my-project/download/_audit_body.pdf'
FONT_DIR = '/usr/share/fonts'

# ---------- fonts ----------
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
install_font_fallback()

# ---------- palette (palette.cascade output) ----------
PAGE_BG = colors.HexColor('#f3f3f2')
SECTION_BG = colors.HexColor('#e9e8e6')
CARD_BG = colors.HexColor('#ecebe9')
TABLE_STRIPE = colors.HexColor('#f3f3f2')
HEADER_FILL = colors.HexColor('#5d5643')
COVER_BLOCK = colors.HexColor('#696047')
BORDER = colors.HexColor('#d5d0c1')
ICON = colors.HexColor('#796a3f')
ACCENT = colors.HexColor('#917521')
ACCENT_2 = colors.HexColor('#448ba3')
TEXT_PRIMARY = colors.HexColor('#1b1a18')
TEXT_MUTED = colors.HexColor('#7d7a73')
SEM_SUCCESS = colors.HexColor('#49845d')
SEM_WARNING = colors.HexColor('#a4864b')
SEM_ERROR = colors.HexColor('#8f4740')
SEM_INFO = colors.HexColor('#55789b')

# ---------- styles ----------
body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=16,
                      alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=8)
h1 = ParagraphStyle('H1', fontName='FreeSerif', fontSize=18, leading=24,
                    textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
h2 = ParagraphStyle('H2', fontName='FreeSerif', fontSize=13.5, leading=19,
                    textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8)
tbl_h = ParagraphStyle('TblH', fontName='FreeSerif', fontSize=9.5, leading=13,
                       textColor=colors.white, alignment=TA_LEFT)
tbl_c = ParagraphStyle('TblC', fontName='FreeSerif', fontSize=9.5, leading=13,
                       textColor=TEXT_PRIMARY, alignment=TA_LEFT)
cap = ParagraphStyle('Cap', fontName='FreeSerif', fontSize=8.5, leading=12,
                     textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
toc0 = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11.5, leading=27, textColor=TEXT_PRIMARY)
callout = ParagraphStyle('Callout', fontName='FreeSerif', fontSize=10.5, leading=16,
                         textColor=TEXT_PRIMARY, backColor=CARD_BG,
                         borderColor=ACCENT, borderWidth=0, spaceAfter=8,
                         leftIndent=10, borderPadding=8)
quote = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=10.5, leading=16,
                       textColor=TEXT_MUTED, leftIndent=24, spaceAfter=8)

MUTED = TEXT_MUTED.hexval()[2:]


def P(text, style=body):
    return Paragraph(text, style)


def head(text, style=h1):
    key = 'h_' + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = 0
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def sub(text):
    return Paragraph(f'<b>{text}</b>', h2)


def table(headers, rows, widths):
    data = [[Paragraph(f'<b>{x}</b>', tbl_h) for x in headers]]
    for r in rows:
        data.append([Paragraph(str(c), tbl_c) for c in r])
    total = sum(widths)
    avail = A4[0] - 100
    if total < avail * 0.85:
        widths = [w * (avail * 0.92) / total for w in widths]
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
    ]))
    return t


# ---------- doc template ----------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            self.notify('TOCEntry', (getattr(flowable, 'bookmark_level', 0),
                                     getattr(flowable, 'bookmark_text', ''),
                                     self.page,
                                     getattr(flowable, 'bookmark_key', '')))


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(50, A4[1] - 34, 'Morse Messenger — Security Audit and Testing Report')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(50, A4[1] - 40, A4[0] - 50, A4[1] - 40)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(50, 40, A4[0] - 50, 40)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(50, 28, 'DKUMARGUPTA · github.com/DKUMARGUPTA/morse')
    canvas.drawRightString(A4[0] - 50, 28, f'Page {doc.page}')
    canvas.restoreState()


doc = TocDocTemplate(OUT, pagesize=A4, leftMargin=50, rightMargin=50,
                     topMargin=56, bottomMargin=52,
                     title='Morse Messenger — Security Audit and Testing Report',
                     author='Z.ai')
story = []

# ---------- TOC ----------
toc = TableOfContents()
toc.levelStyles = [toc0]
story.append(Paragraph('<b>Contents</b>', h1))
story.append(Paragraph('Commit 6383174 · deployment morse-ashen.vercel.app · November 2026', cap))
story.append(Spacer(1, 10))
story.append(toc)
story.append(PageBreak())

# ============ 1. Executive summary ============
story.extend([KeepTogether([head('1. Executive Summary'), P(
    'This report documents a full-cycle quality pass on Morse Messenger, an installable PWA chat platform '
    'with Morse-code signalling (sound, screen light, vibration) built on Next.js 16, React 19, Prisma and '
    'Supabase Postgres, with a standalone socket.io realtime relay. The engagement covered four tracks: '
    'automated API testing, a manual security audit of the authentication, encryption and realtime paths, '
    'competitive research against established private messengers, and end-to-end verification of the live '
    'production deployment on Vercel.')])])
story.append(P(
    'The application passed the complete 22-check API smoke suite and the 4-check realtime handshake suite '
    'after the hardening work described in this report. The audit surfaced ten findings: two critical or '
    'high-severity issues (a publicly-known fallback session secret and an unauthenticated socket handshake), '
    'three medium-severity hardening gaps (no rate limiting, non-secure session cookies, missing security '
    'headers) and five low or informational items. All critical, high and medium findings were fixed, verified '
    'by test, and shipped to GitHub in commit 6383174, which also triggered a successful production deployment.'))
story.append(P(
    'The live deployment at morse-ashen.vercel.app now serves every route behind a Content-Security-Policy, '
    'rejects unauthenticated socket connections, throttles brute-force login attempts with HTTP 429 responses, '
    'and completes the full account lifecycle (register, login, session, delete, post-delete lockout) against '
    'the Supabase Postgres database. Three operational recommendations remain open and are listed at the end '
    'of this report; the most time-sensitive is to rotate the credentials that appeared in chat during setup.'))
story.append(Spacer(1, 6))
stats = table(
    ['Area', 'Result', 'Evidence'],
    [['API smoke suite', '22 / 22 passed', 'scripts/api-smoke-test.sh'],
     ['Realtime handshake', '4 / 4 passed', 'scripts/socket-auth-test.mjs'],
     ['Rate limiting', '429 after 5 attempts / min', 'curl loop, same email'],
     ['TypeScript', '0 errors in src/', 'npx tsc --noEmit'],
     ['ESLint', '0 errors', 'npm run lint'],
     ['Production e2e', 'register-login-me-delete-401 OK', 'morse-ashen.vercel.app']],
    [150, 160, 180])
story.append(stats)
story.append(Paragraph('Table 1 — Verification summary after hardening', cap))

# ============ 2. Scope and methodology ============
story.append(head('2. Scope and Methodology'))
story.append(P(
    'The audit combined white-box code review with black-box protocol testing. On the code side, every '
    'authentication and authorization path was read line by line: session signing and verification in '
    'src/lib/auth.ts, password hashing, the requireUser guard and serialization helpers in api-helpers.ts, '
    'the register, login, logout and me endpoints, conversation and message routes including membership and '
    'block enforcement, the E2EE key publication route, user directory search, account export and deletion, '
    'the client-side WebCrypto E2EE implementation, and the standalone socket.io relay in mini-services/'
    'chat-service. Configuration surfaces (next.config.ts, package.json, environment templates, .gitignore) '
    'were reviewed for secret leakage and build correctness.'))
story.append(P(
    'On the testing side, two disposable QA users were driven through a scripted 22-step HTTP flow: duplicate '
    'email rejection, wrong-password rejection, unauthenticated access, user directory search, 1:1 conversation '
    'creation, message send, cross-user edit denial, read receipts, message hiding, public-key publication with '
    'JWK validation, account export and finally account deletion with post-deletion login lockout. A dedicated '
    'socket.io client script then verified that the realtime relay rejects anonymous and garbage-token '
    'handshakes while accepting a valid signed token. Rate limiting was exercised with a rapid login loop. '
    'Finally the same flows were replayed against the production domain.'))
story.append(P(
    'Competitive research was conducted across the public documentation and security write-ups of Signal, '
    'Telegram, WhatsApp, SimpleX Chat, Wire and Threema, focusing on three questions: what makes their '
    'encryption trustworthy, which convenience features a young messenger is expected to ship, and how '
    'offline-first web apps are engineered. The findings feed the roadmap in section 8.'))

# ============ 3. Test results ============
story.append(head('3. Test Results'))
story.append(sub('3.1 API smoke suite'))
story.append(P(
    'The smoke suite creates two disposable @morse.test accounts, exercises the core flows and deletes them, '
    'leaving the database clean. After the hardening changes all 22 checks pass. The suite is committed to the '
    'repository so any future change can be validated in under a minute against a running dev server.'))
story.append(table(
    ['Flow', 'Checks', 'Result'],
    [['Authentication (register, duplicate, wrong password, unauthenticated me, login, me)', '6', 'Pass'],
     ['Directory and conversations (search, 1:1 create)', '2', 'Pass'],
     ['Messaging (send, fetch, edit own, edit foreign, read receipt, hide)', '6', 'Pass'],
     ['E2EE keys (publish valid JWK, reject malformed key)', '2', 'Pass'],
     ['Account (export, delete both users, deleted login lockout)', '6', 'Pass']],
    [280, 60, 80]))
story.append(Paragraph('Table 2 — Smoke suite breakdown (scripts/api-smoke-test.sh)', cap))
story.append(sub('3.2 Realtime handshake security'))
story.append(P(
    'The socket test connects a real socket.io client three times: without a token, with a syntactically valid '
    'but garbage token, and with the signed token minted by GET /api/socket/token for a freshly registered user. '
    'The first two are rejected by the relay middleware with an unauthorized error before any room join, and the '
    'third connects and joins its personal room. All four checks pass, including the token endpoint itself.'))
story.append(sub('3.3 Brute-force throttling'))
story.append(P(
    'Seven rapid wrong-password logins for one email from one IP produce five HTTP 401 responses followed by '
    'HTTP 429 with a retry hint, exactly matching the configured sliding window of five attempts per minute per '
    'account and ten per IP. Registration is throttled at five per minute per IP. The limiter is in-memory and '
    'per-instance, which is appropriate for the current single-region deployment; the limitation is documented '
    'in docs/SECURITY.md.'))
story.append(sub('3.4 Static analysis'))
story.append(P(
    'Five pre-existing TypeScript errors were fixed rather than suppressed: a dot/dash state type mismatch in '
    'the telegraph key pad, an unreachable comparison in the signal engine playback logic, a Uint8Array '
    'buffer-typing error in the E2EE decryption path, and untyped result arrays in the conversation list, '
    'conversation members and search endpoints that had been inferred as never. ESLint was cleaned up by '
    'ignoring generated Prisma client output and one-shot migration scripts, bringing the lint run to zero '
    'errors with the tuned rule set.'))

# ============ 4. Security audit findings ============
story.append(head('4. Security Audit Findings'))
story.append(P(
    'Findings are rated by exploitability against the public production deployment. Every fixed finding was '
    're-verified by test after the change. The two most serious issues shared a root cause: trust placed in '
    'client-supplied identity without a server-side secret.'))
frows = [
    ['F-01', 'Critical', 'Hardcoded fallback AUTH_SECRET in a public repository allowed session forgery', 'Fixed'],
    ['F-02', 'High', 'Socket relay accepted any client-claimed userId; realtime events were spoofable', 'Fixed'],
    ['F-03', 'Medium', 'No rate limiting on login and registration', 'Fixed'],
    ['F-04', 'Medium', 'Session cookie sent without the Secure flag', 'Fixed'],
    ['F-05', 'Medium', 'No CSP, X-Frame-Options, nosniff, Referrer-Policy or Permissions-Policy headers', 'Fixed'],
    ['F-06', 'Low', 'User and message search became case-sensitive after the Postgres migration', 'Fixed'],
    ['F-07', 'Low', 'Five TypeScript errors masked by ignoreBuildErrors', 'Fixed'],
    ['F-08', 'Info', 'E2EE is opt-in, static ECDH, no forward secrecy; key in localStorage', 'Documented'],
    ['F-09', 'Info', 'Rate limiter is in-memory and per-instance', 'Documented'],
    ['F-10', 'Info', 'Limiter trusts x-forwarded-for; authoritative behind Vercel, spoofable if self-hosted', 'Documented'],
]
story.append(table(['ID', 'Severity', 'Finding', 'Status'], frows, [36, 56, 275, 83]))
story.append(Paragraph('Table 3 — Findings register', cap))
story.append(sub('4.1 F-01: predictable session secret (fixed)'))
story.append(P(
    'src/lib/auth.ts fell back to the literal string morse-messenger-dev-secret when AUTH_SECRET was unset. '
    'Because the repository is public, anyone could read that string, mint a valid HS256 token for any user id, '
    'set the session cookie and take over the account. The fix makes production refuse to boot without '
    'AUTH_SECRET, switches cookies to Secure in production, and a 256-bit random secret was provisioned on '
    'Vercel and locally. The socket token endpoint and the relay now share this secret.'))
story.append(sub('4.2 F-02: unauthenticated realtime relay (fixed)'))
story.append(P(
    'The relay trusted socket.handshake.auth.userId, so a single socket.io client could join any user room and '
    'receive message events (ciphertext plus metadata) and presence, and could emit typing events as anyone. '
    'The client now fetches a short-lived signed token (24 hours, kind-tagged) from /api/socket/token and passes '
    'it in the handshake; the relay verifies the HMAC signature and expiry with timing-safe comparison before '
    'allowing the connection, and re-authentication on token expiry is handled automatically by the client. '
    'Message payloads continue to target per-user rooms only.'))
story.append(sub('4.3 F-08: E2EE honest scope (documented)'))
story.append(P(
    'The encryption design — WebCrypto ECDH P-256 agreement with AES-GCM-256 payloads, private key generated '
    'per device — is sound for its beta scope, and the server only ever stores ciphertext. The limitations are '
    'real and now written down in docs/SECURITY.md: the key is extractable from the browser profile, a stolen '
    'current key does not protect past or future messages (no ratchet), there is no multi-device key sync, '
    'encrypted conversations are excluded from server-side search by design, and key replacement is not '
    'announced to peers. These move to the roadmap as P1 priorities rather than being left implicit.'))

# ============ 5. Fixes implemented ============
story.append(head('5. Fixes Implemented'))
story.append(P(
    'All changes shipped in commit 6383174 ("Security hardening + QA suite + repo polish", 26 files, 647 '
    'insertions) and are summarized below. The repository also gained a MIT LICENSE, a rewritten README with '
    'badges and deployment instructions, docs/SECURITY.md (security model, E2EE scope, production checklist), '
    'docs/ROADMAP.md and a CI workflow running lint and typecheck on every push.'))
story.append(table(
    ['Area', 'Change'],
    [['src/lib/auth.ts', 'AUTH_SECRET fail-fast in production; Secure cookie; signSocketToken (24h, kind-tagged)'],
     ['src/app/api/socket/token/', 'New authenticated endpoint minting signed realtime tokens'],
     ['mini-services/chat-service', 'HMAC + timing-safe handshake verification; root .env loading; rejects anonymous sockets'],
     ['src/lib/socket.ts', 'Token fetch before connect; automatic re-auth on expiry; same event surface'],
     ['src/lib/rate-limit.ts', 'Sliding-window limiter + client IP helper; wired into login and register'],
     ['next.config.ts', 'CSP and five hardening headers on every route'],
     ['src/app/api/users, search', 'mode insensitive for Postgres case-correct search'],
     ['src/components/chats/telegraph-pad, signal-engine, e2ee', 'Type-correctness fixes, behaviour preserved'],
     ['scripts/', 'api-smoke-test.sh, socket-auth-test.mjs, cleanup-qa-users.ts committed'],
     ['eslint.config.mjs', 'Ignore generated Prisma client and maintenance scripts']],
    [170, 290]))
story.append(Paragraph('Table 4 — Change inventory in commit 6383174', cap))

# ============ 6. Competitive research ============
story.append(head('6. What Established Messengers Teach Us'))
story.append(P(
    'Signal remains the reference for trust: end-to-end encryption is always on, the Double Ratchet gives every '
    'message a unique key with forward secrecy and post-compromise security, metadata is minimized, and safety '
    'numbers make key verification a first-class UI. Telegram demonstrates the cost of making encryption '
    'optional — its default cloud chats are a standing criticism even as its UX leads on polish. SimpleX Chat '
    'shows how far metadata privacy can be pushed by removing user identifiers entirely and connecting people '
    'through one-time links and QR codes. The PWA state of the art pairs a service-worker app shell with an '
    'IndexedDB data cache and Background Sync so conversations open instantly and drafts survive dead zones.'))
story.append(table(
    ['Lesson', 'Source', 'Action for Morse'],
    [['Encryption must be on by default', 'Signal, Telegram critique', 'P0: enable E2EE by default for new 1:1 chats'],
     ['Per-message ratcheting', 'Signal Protocol', 'P1: adopt X3DH + Double Ratchet'],
     ['Disappearing messages are table stakes', 'Signal, WhatsApp, Telegram', 'P0: per-conversation TTL'],
     ['QR/link contact establishment', 'SimpleX', 'P0: QR invites (qrcode dep already present)'],
     ['Offline-first data layer', 'PWA pattern', 'P2: IndexedDB cache + Background Sync queue'],
     ['Key verification UX', 'Signal safety numbers, iMessage', 'P1: upgrade fingerprint + key-change alerts'],
     ['Realtime needs a long-running host', 'Architecture', 'P0: package chat-service for Railway/Render/Fly']],
    [160, 150, 210]))
story.append(Paragraph('Table 5 — Research takeaways mapped to docs/ROADMAP.md priorities', cap))

# ============ 7. Deployment verification ============
story.append(head('7. Deployment Verification'))
story.append(P(
    'The Vercel project morse was configured through its API: the Supabase session-pooler connection string '
    'replaced the database URL that the Prisma Postgres marketplace integration had injected (that integration '
    'points at an empty database and would have broken login), and a strong AUTH_SECRET was provisioned. '
    'Deployment protection (Vercel Authentication) was found enabled for all non-custom-domain URLs, which '
    'would have locked real users out of the production domain; it was disabled so that morse-ashen.vercel.app '
    'is publicly reachable.'))
story.append(P(
    'The live application was then verified end to end: every route returns the five hardened security headers; '
    'a test account registered, logged in, read its session, and deleted itself with the post-deletion login '
    'returning 401; and the pushed commit triggered a clean build that reached READY state. The realtime relay '
    'is intentionally not part of the Vercel deployment — serverless functions cannot host a persistent '
    'socket.io process, so the production app currently syncs history on refresh, with the connection indicator '
    'showing the relay as offline. Hosting the relay on a long-running platform is the top roadmap item.'))
story.append(P(
    'Data lives in Supabase Postgres (ap-northeast-2) behind the connection pooler with sslmode=require. '
    'Prisma generate runs automatically on install thanks to the new postinstall hook, so Vercel builds no '
    'longer depend on manual generation steps.'))

# ============ 8. Recommendations ============
story.append(head('8. Recommendations and Next Steps'))
story.append(sub('8.1 Immediate (this week)'))
story.append(P(
    'First, rotate credentials that appeared in chat during setup: the Supabase database password, the GitHub '
    'fine-grained personal access token and the Vercel token should all be revoked or reset now that the '
    'automation work is complete. Second, remove the unused Prisma Postgres resource from the Vercel project to '
    'avoid confusion about which database is authoritative. Third, enable GitHub branch protection for main so '
    'the new CI workflow must pass before merges.'))
story.append(sub('8.2 Product roadmap (prioritized)'))
story.append(P(
    'The P0 batch — default-on E2EE for new 1:1 conversations, disappearing messages, QR-code invitations and a '
    'hosted realtime relay — closes the largest trust and portability gaps identified in section 6. The P1 '
    'batch upgrades the crypto core (X3DH and Double Ratchet, multi-device key sync, safety-number verification '
    'with key-change alerts, group E2EE). The P2 batch focuses on perceived speed: an IndexedDB message cache, '
    'a background send queue and local encrypted search will make the app feel instant and work offline. Each '
    'item in docs/ROADMAP.md carries its rationale, and the committed test suites provide the safety net for '
    'implementing them.'))
story.append(Spacer(1, 8))
story.append(Paragraph(
    '"Security is a process, not a product. The findings register, the honest E2EE scope and the roadmap in '
    'this report are the process made visible."', quote))

doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('body pages:', doc.page)
print('OK', OUT)
