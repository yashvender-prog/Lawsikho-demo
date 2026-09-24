# Section 138 Notice Desk

An app that drafts **first demand notices under Section 138 of the Negotiable Instruments Act, 1881** for dishonoured cheques.

It works in four steps:

1. **Documents.** Upload the cheque, the bank's return memo, invoices, agreements or letters (PDF, scanned PDF, JPG, PNG, DOCX or TXT). AI reads them and fills in the case details.
2. **Case details.** Check and correct the parties, the debt, the cheque and the dishonour. A limitation panel shows the deadlines under Section 138(a), (b) and (c) and Section 142.
3. **Draft notice.** Pick one of the four reference templates and generate the notice with AI, or use the standard format without AI. You can edit the notice on the page and ask the AI for revisions.
4. **Download.** Save the notice as Word (.docx), PDF or plain text, or copy it.

The **History** tab keeps every notice you draft. From there you can open, download, copy into a new notice, or delete any of them, and back up or restore the whole list.

## Ways to open it

| | How | AI engine | History saved in |
|---|---|---|---|
| **Desktop file** | Copy `desktop-shortcut/Section 138 Notice Desk.html` to your Desktop and double-click it | OpenAI GPT-5.4 mini with your API key | That browser on that computer |
| **Online link** | https://claude.ai/artifact/C5xSdY7QyevxPULZDTxm36, or the `.url` (Windows) or `.webloc` (Mac) shortcut in `desktop-shortcut/` | Claude, on your Claude account (claude.ai links can't connect to OpenAI) | Your claude.ai account |

The desktop file needs an internet connection, both for the AI and for its helper libraries.

### Using your OpenAI key (desktop file)
1. Open the app, then go to **Settings**.
2. Paste your OpenAI API key, and tick "Remember the key on this computer" if you want it kept.
3. Click **Test connection**, then **Save AI settings**.

The model is `gpt-5.4-mini` by default. You can also change the API address (any OpenAI-compatible endpoint works), the reasoning effort and the maximum output tokens.

## For developers

```
src/app.html                         the app (HTML, CSS and JS in one file)
src/templates.js                     the four reference notices
build.py                             builds the single-file app
index.html                           built app (this is what is published)
desktop-shortcut/…Notice Desk.html   same built app, for the desktop
```

After editing anything in `src/`, run `python3 build.py`.

Helper libraries load from jsDelivr: pdf.js (reads PDFs), mammoth (reads Word files), JSZip (writes .docx) and jsPDF (writes PDF).

> This is a drafting aid, not legal advice. Check every notice against the original documents before it is signed and sent.
