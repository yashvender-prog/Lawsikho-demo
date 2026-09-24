"""Builds the single-file app: index.html (also used as the desktop file)."""
from pathlib import Path

root = Path(__file__).parent
html = (root / "src" / "app.html").read_text(encoding="utf-8")
templates = (root / "src" / "templates.js").read_text(encoding="utf-8")
out = html.replace("/*__TEMPLATES__*/", templates)
(root / "index.html").write_text(out, encoding="utf-8")
(root / "desktop-shortcut" / "Section 138 Notice Desk.html").write_text(out, encoding="utf-8")
print("Built index.html and 'Section 138 Notice Desk.html'", len(out), "bytes")
