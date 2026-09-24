# Section 138 Notice Desk

A simple app for drafting **first demand notices under Section 138 of the Negotiable Instruments Act, 1881**.

- **API key box.** Paste an OpenAI key (starts with `sk-`, uses `gpt-5.4-mini`) or a Google Gemini key (starts with `AIza` or `AQ.`, uses `gemini-2.5-flash`). The app recognises which one it is. The key stays in your browser.
- **Case details page.** Everything essential to the notice: client, drawer, directors, debt, cheque, dishonour, interest and cost, advocate.
- **Generate notice.** Then **Download PDF** or **Copy text** (to paste into Word). You can also edit the notice on the page.
- **History tab.** Every notice is saved there. It starts with five sample notices.

## Open it
- **On your computer:** double-click `desktop-shortcut/Section 138 Notice Desk.html`. You can copy it to your Desktop first. It needs an internet connection.
- **Online:** https://claude.ai/artifact/C5xSdY7QyevxPULZDTxm36. The online version drafts with Claude, because claude.ai links can't connect to OpenAI or Google.

## For developers
Edit `src/app.html`, `src/templates.js` (the four reference notices) or `src/samples.js` (the five sample notices), then run `python3 build.py`. This rebuilds `index.html` and the desktop copy.

> This is a drafting aid, not legal advice. Check every notice before it is signed and sent.
