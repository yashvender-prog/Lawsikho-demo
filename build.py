"""Builds the single-file app: index.html, plus a copy for the desktop."""
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
out = (src / "app.html").read_text(encoding="utf-8")
out = out.replace("/*__TEMPLATES__*/", (src / "templates.js").read_text(encoding="utf-8"))
out = out.replace("/*__SAMPLES__*/", (src / "samples.js").read_text(encoding="utf-8"))
(root / "index.html").write_text(out, encoding="utf-8")
(root / "desktop-shortcut" / "Section 138 Notice Desk.html").write_text(out, encoding="utf-8")
print("Built index.html and desktop-shortcut/Section 138 Notice Desk.html:", len(out.encode()), "bytes")
