# Photos to Document

A simple app that combines several photos into one PDF or Word document.

- **Add photos.** Click the upload box or drag and drop pictures onto it.
- **Arrange them.** Drag items in the list, or use the ↑ / ↓ buttons. Remove any with ✕.
- **Download.** Each photo becomes its own page in the combined file — pick **Download as PDF** or **Download as Word**.

Everything happens in your browser. No photo ever leaves your computer, there is no server, no account, and no Claude or other AI involved — the app only resizes and lays out the images you give it. `image-to-document.html` at the repo root is fully self-contained (the PDF and Word libraries are embedded in the file itself), so once you have the file it works with no internet connection at all.

## Open it
Double-click `image-to-document.html` at the repository root, or open it directly in any browser.

## For developers
The app's source is `app.html`. The PDF library (jsPDF) and Word library (docx) are vendored in `vendor/` so the build has no network dependency. Edit `app.html`, then run `python3 build.py` from this directory to rebuild `../image-to-document.html`.
