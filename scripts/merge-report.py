#!/usr/bin/env python3
"""Merge report cover + body into the final audit PDF (normalized to A4)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/download/_audit_cover.pdf'
BODY = '/home/z/my-project/download/_audit_body.pdf'
OUT = '/home/z/my-project/download/Morse-Messenger-Security-Audit-Report.pdf'


def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize(page))
writer.add_metadata({
    '/Title': 'Morse Messenger — Security Audit and Testing Report',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Security audit, API testing, competitive research and deployment verification for Morse Messenger',
})
with open(OUT, 'wb') as f:
    writer.write(f)
print('merged ->', OUT, 'pages:', len(writer.pages))
