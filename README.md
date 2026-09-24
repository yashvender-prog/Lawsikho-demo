# Section 138 Notice Drafter

A single-page HTML/CSS/JavaScript app that drafts a **first demand notice under Section 138 of the Negotiable Instruments Act, 1881** for a dishonoured cheque. By default it uses the `gpt-5.4-mini` model.

## Run it

It needs no build step and no server. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

1. Click **⚙ LLM settings** and paste your OpenAI API key. The model is `gpt-5.4-mini` by default and can be changed.
2. Pick a reference template (A–D) and fill in the case details, or click **Load sample case**.
3. Click **Generate notice with AI**. You can then edit the draft in place, ask for revisions, copy it, or download it as `.doc`, `.txt` or PDF (through Print).

**Quick draft (no AI)** builds the notice from the standard format without calling the API.

## Features

- **Form inputs:** advocate letterhead, client (payee), drawer, directors under Section 141, the transaction and supporting documents, cheque and dishonour details, interest, notice cost, tone and language (English, Hindi, or English with a Hindi translation).
- **Amount in words:** the Indian system (lakh and crore) is filled in automatically.
- **Limitation checks:**
  - whether the cheque was presented within its 3-month validity (s.138(a));
  - the 30-day deadline for sending the notice (s.138(b));
  - the 15-day payment window (s.138(c));
  - the complaint window (s.142(1)(b)).
- **Templates:** four reference templates in `js/templates.js`. The model copies their style and structure, never their facts. Real personal identifiers in templates B and C have been replaced with placeholders.
- **Prompt rules:** the model uses only the facts you enter. Anything missing becomes a highlighted `[●]` placeholder. The cheque amount is demanded on its own, with interest and costs in separate paragraphs.

## LLM settings

| Setting | Default | Notes |
|---|---|---|
| Model | `gpt-5.4-mini` | Any chat-completions model id |
| API base URL | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint works |
| Reasoning effort | model default | Sent as `reasoning_effort` only if set |
| Max output tokens | 6000 | Sent as `max_completion_tokens` |

The browser calls the API directly. The key is kept in `sessionStorage`, or in `localStorage` if you tick *Remember key*. Use it only on a machine you trust. For a shared or public deployment, send the calls through a small backend proxy so the key never reaches the browser.

## Files

```
index.html        page structure and form
css/styles.css    styling (light and dark, print layout for A4)
js/templates.js   the four reference notices
js/app.js         form logic, checks, prompt building, API call, export
```

> This is a drafting aid, not legal advice. An advocate must review every notice before it is sent.
