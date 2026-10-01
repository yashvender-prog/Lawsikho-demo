"""Builds the single-file, fully offline Photos to Document app.

Inlines the vendored jsPDF and docx libraries into app.html so the
resulting image-to-document.html needs no network access at all.
"""
from pathlib import Path

root = Path(__file__).parent
out = (root / "app.html").read_text(encoding="utf-8")
out = out.replace("/*__JSPDF__*/", (root / "vendor" / "jspdf.umd.min.js").read_text(encoding="utf-8"))
out = out.replace("/*__DOCX__*/", (root / "vendor" / "docx.umd.js").read_text(encoding="utf-8"))

dest = root.parent / "image-to-document.html"
dest.write_text(out, encoding="utf-8")
print("Built", dest, ":", len(out.encode()), "bytes")
