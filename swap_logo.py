#!/usr/bin/env python3
"""One-shot script: swap the text 'KarachiBites' logo for the new EVORA
image in the navbar (anchor) and footer (span) of all five site pages.

Run once from the project root, then delete this file."""

import os

ROOT = r"C:\Users\Ammar Sheikh\Desktop\Food Brand Demo"
PAGES = ["index.html", "menu.html", "checkout.html", "contact.html", "about.html"]

OLD_NAVBAR = '<a href="index.html" class="nav-logo">Karachi<span class="accent-text">Bites</span></a>'
NEW_NAVBAR = '<a href="index.html" class="nav-logo"><img src="assets/evora-logo.png" alt="Evora" class="nav-logo-img"></a>'

OLD_FOOTER = '<span class="nav-logo">Karachi<span class="accent-text">Bites</span></span>'
NEW_FOOTER = '<span class="nav-logo"><img src="assets/evora-logo.png" alt="Evora" class="footer-logo-img"></span>'

for name in PAGES:
    path = os.path.join(ROOT, name)
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    nav_hits = html.count(OLD_NAVBAR)
    foot_hits = html.count(OLD_FOOTER)

    html = html.replace(OLD_NAVBAR, NEW_NAVBAR)
    html = html.replace(OLD_FOOTER, NEW_FOOTER)

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"{name}: navbar={nav_hits} footer={foot_hits}")
print("Done.")
