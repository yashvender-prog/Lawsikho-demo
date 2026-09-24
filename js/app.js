/* Section 138 NI Act – first demand notice drafter */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TEMPLATES = window.NOTICE_TEMPLATES || [];

  const DEFAULT_SETTINGS = {
    model: "gpt-5.4-mini",
    baseUrl: "https://api.openai.com/v1",
    reasoningEffort: "",
    maxTokens: 6000,
    rememberKey: false,
  };

  const FIELD_IDS = [
    "advName", "advDesignation", "advAddress", "advPhone", "advEmail", "noticeDate", "dispatchMode", "refNo",
    "clientName", "clientType", "clientAddress", "clientBusiness", "clientRep",
    "drawerName", "drawerType", "drawerAddress", "drawerDirectors", "drawerContact", "drawerSignatory",
    "txnType", "totalLiability", "txnDocs", "txnFacts", "reminders",
    "chequeNo", "chequeDate", "chequeAmount", "draweeBank", "drawerAccount", "presentDate", "payeeBank",
    "memoDate", "memoReceivedDate", "dishonourReason", "otherReason",
    "claimInterest", "interestRate", "noticeCost", "tone", "language", "reserveBNS", "extraInstructions",
    "useAllTemplates",
  ];
  const REQUIRED = ["clientName", "drawerName", "chequeNo", "chequeDate", "chequeAmount", "draweeBank", "presentDate", "memoDate"];
  const ADVOCATE_FIELDS = ["advName", "advDesignation", "advAddress", "advPhone", "advEmail"];

  const state = {
    template: TEMPLATES[0] ? TEMPLATES[0].id : null,
    settings: { ...DEFAULT_SETTINGS },
    apiKey: "",
    conversation: null, // [system, user, assistant, ...] for revisions
  };

  /* ---------------- storage (never required to work) ---------------- */
  const store = {
    get(key, area = "localStorage") {
      try { const v = window[area].getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
    },
    set(key, value, area = "localStorage") {
      try { window[area].setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
    remove(key, area = "localStorage") {
      try { window[area].removeItem(key); } catch { /* ignore */ }
    },
  };

  /* ---------------- formatting helpers ---------------- */
  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  }

  // Indian numbering system: crore, lakh, thousand, hundred
  function intToWords(n) {
    if (n === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1000);
    const hundred = Math.floor((n % 1000) / 100);
    const rest = n % 100;
    if (crore) parts.push(intToWords(crore) + " Crore");
    if (lakh) parts.push(twoDigits(lakh) + " Lakh");
    if (thousand) parts.push(twoDigits(thousand) + " Thousand");
    if (hundred) parts.push(ONES[hundred] + " Hundred");
    if (rest) parts.push((parts.length ? "and " : "") + twoDigits(rest));
    return parts.join(" ");
  }

  function parseAmount(str) {
    if (str == null) return NaN;
    const clean = String(str).replace(/[₹,\s/-]|rs\.?/gi, "");
    if (!clean) return NaN;
    return Number(clean);
  }

  function amountInWords(amount) {
    if (!isFinite(amount) || amount <= 0) return "";
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    let s = "Rupees " + intToWords(rupees);
    if (paise) s += " and " + twoDigits(paise) + " Paise";
    return s + " Only";
  }

  function formatINR(amount) {
    if (!isFinite(amount)) return "";
    const s = amount.toLocaleString("en-IN", { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 });
    return "₹" + s + "/-";
  }

  function parseDate(v) {
    if (!v) return null;
    const [y, m, d] = v.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function formatDate(d) {
    if (!d) return "";
    return `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
  }
  function isoDate(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(d.getDate(), last));
    return x;
  }
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------------- form data ---------------- */
  function val(id) {
    const el = $(id);
    if (!el) return "";
    if (el.type === "checkbox") return el.checked;
    return el.value.trim();
  }

  function isEntity(type) {
    return !/^(Individual|Proprietorship)$/.test(type);
  }

  function getData() {
    const d = {};
    FIELD_IDS.forEach((id) => (d[id] = val(id)));
    d.amount = parseAmount(d.chequeAmount);
    d.amountWords = amountInWords(d.amount);
    d.amountFig = formatINR(d.amount);
    d.reason = d.dishonourReason === "other" ? d.otherReason : d.dishonourReason;
    d.dates = {
      notice: parseDate(d.noticeDate),
      cheque: parseDate(d.chequeDate),
      present: parseDate(d.presentDate),
      memo: parseDate(d.memoDate),
      memoReceived: parseDate(d.memoReceivedDate),
    };
    d.drawerIsEntity = isEntity(d.drawerType);
    return d;
  }

  function saveForm() {
    const snapshot = {};
    FIELD_IDS.forEach((id) => (snapshot[id] = val(id)));
    snapshot.__template = state.template;
    store.set("s138.form", snapshot);
    const adv = {};
    ADVOCATE_FIELDS.forEach((id) => (adv[id] = val(id)));
    store.set("s138.advocate", adv);
  }

  function fillForm(data) {
    Object.entries(data || {}).forEach(([id, v]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v ?? "";
    });
    if (data && data.__template) selectTemplate(data.__template);
    syncDependentFields();
  }

  /* ---------------- dependent UI ---------------- */
  function syncDependentFields() {
    const d = getData();
    $("amountWords").value = d.amountWords;
    $("otherReasonWrap").hidden = $("dishonourReason").value !== "other";
    $("interestWrap").hidden = !$("claimInterest").checked;
    $("directorsWrap").hidden = !d.drawerIsEntity;
    runChecks(d);
  }

  function formatAmountField(e) {
    const n = parseAmount(e.target.value);
    if (isFinite(n) && n > 0) e.target.value = n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  /* ---------------- limitation & compliance checks ---------------- */
  function runChecks(d) {
    const out = [];
    const add = (cls, html) => out.push(`<li class="${cls}"><span>${html}</span></li>`);
    const { cheque, present, memo, memoReceived, notice } = d.dates;

    if (cheque && present) {
      const validTill = addDays(addMonths(cheque, 3), -1);
      if (present < cheque) add("err", `Presentation date (${formatDate(present)}) is before the cheque date. Check the dates.`);
      else if (present > validTill) add("err", `The cheque was presented after its 3-month validity (valid till ${formatDate(validTill)}), so a complaint under Section 138(a) would not be maintainable.`);
      else add("ok", `Presented within validity. The cheque was valid till ${formatDate(validTill)}, as Section 138(a) and RBI rules require.`);
    }

    if (present && memo && memo < present) add("err", "The return memo date is before the presentation date.");

    const infoDate = memoReceived || memo;
    if (infoDate) {
      const lastNotice = addDays(infoDate, 30);
      const basis = memoReceived ? "the date your client got the dishonour information" : "the return memo date. Add the date the client received it, if that was later";
      if (notice) {
        const gap = daysBetween(infoDate, notice);
        if (gap < 0) add("err", `The notice date is before ${memoReceived ? "the client received the memo" : "the return memo date"}.`);
        else if (notice > lastNotice) add("err", `The notice is ${gap} days after ${basis}. Section 138(b) needs it within 30 days (last date ${formatDate(lastNotice)}).`);
        else add(gap > 24 ? "warn" : "ok", `The notice is ${gap} day(s) after ${basis}. The Section 138(b) deadline is <strong>${formatDate(lastNotice)}</strong>${gap > 24 ? ", so send it at once" : ""}.`);
      } else {
        add("info", `Last date to send the notice under Section 138(b): <strong>${formatDate(lastNotice)}</strong>.`);
      }
      if (notice && notice <= lastNotice) {
        add("info", `The drawer has 15 days from <em>receipt</em> of the notice to pay (Section 138(c)). The cause of action arises on day 16, and the complaint must be filed within 1 month after that (Section 142(1)(b)).`);
      }
    }

    if (d.chequeAmount && !(d.amount > 0)) add("err", "The cheque amount is not a valid number.");
    const total = parseAmount(d.totalLiability);
    if (d.amount > 0 && total > 0 && d.amount > total) add("warn", "The cheque amount is more than the stated liability. Section 138 applies only up to the legally enforceable debt.");
    if (d.drawerIsEntity && !d.drawerDirectors) add("info", "The drawer is a company or firm. To prosecute its directors or partners under Section 141, name them in the notice.");
    if (d.claimInterest || d.noticeCost) add("info", "Interest and notice costs will be stated separately from the cheque amount, so the demand for the cheque amount stays clear and specific.");
    if (d.reason && /stop/i.test(d.reason)) add("info", "Payment was stopped by the drawer. Section 138 still applies; say the debt was legally enforceable when the cheque was issued.");

    const missing = REQUIRED.filter((id) => !val(id));
    if (missing.length && missing.length < REQUIRED.length) add("warn", `${missing.length} required field(s) are still empty. The model will put [●] placeholders there.`);

    $("checkList").innerHTML = out.length ? out.join("") : '<li class="muted">Fill in the cheque dates to see the timelines.</li>';
  }

  /* ---------------- templates UI ---------------- */
  function renderTemplates() {
    const grid = $("templateGrid");
    grid.innerHTML = "";
    TEMPLATES.forEach((t, i) => {
      const card = document.createElement("div");
      card.className = "tpl";
      card.setAttribute("role", "radio");
      card.setAttribute("tabindex", "0");
      card.dataset.id = t.id;
      card.innerHTML = `<span class="tag">Template ${String.fromCharCode(65 + i)} · ${escapeHtml(t.tag)}</span>
        <h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.summary)}</p>
        <button type="button" class="view">View full template</button>`;
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("view")) { openTemplate(t); return; }
        selectTemplate(t.id);
        saveForm();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); selectTemplate(t.id); saveForm(); }
      });
      grid.appendChild(card);
    });
    selectTemplate(state.template);
  }

  function selectTemplate(id) {
    if (!TEMPLATES.some((t) => t.id === id)) return;
    state.template = id;
    document.querySelectorAll(".tpl").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.id === id)));
  }

  function openTemplate(t) {
    $("templateDialogTitle").textContent = t.title;
    $("templateDialogBody").textContent = t.text;
    $("templateDialog").showModal();
  }

  /* ---------------- prompt construction ---------------- */
  const SYSTEM_PROMPT = `You are a senior Indian litigation advocate with long experience of cheque dishonour matters. You draft the FIRST DEMAND NOTICE under Section 138 of the Negotiable Instruments Act, 1881 (the "NI Act"), to be sent by the payee's advocate to the drawer.

NON-NEGOTIABLE RULES
1. Use ONLY the facts in the CASE DETAILS. Never invent names, dates, amounts, account numbers, documents, bank branches or events. Where a fact the notice needs is missing, insert a short bracketed placeholder such as [● date of return memo] and move on.
2. Never copy facts (names, amounts, dates, goods, places) from the reference template(s). They show tone, structure and paragraph style only.
3. The notice must contain:
   (a) cheque number, cheque date, cheque amount in figures and in words (use the words EXACTLY as supplied), and the drawee bank and branch (plus the drawer's account number if given);
   (b) a statement that the cheque was issued in discharge of a legally enforceable debt or other liability, with a short account of how that liability arose;
   (c) the date of presentation, the date of the return memo and the reason for dishonour, quoted exactly as supplied;
   (d) an express, unambiguous demand to pay THE CHEQUE AMOUNT within 15 (fifteen) days of receipt of the notice;
   (e) the consequence of non-payment: criminal proceedings under Sections 138 and 142 of the NI Act before the competent court, at the drawer's risk as to costs and consequences.
4. State the cheque amount distinctly. Any interest, notice cost or other sum goes in a SEPARATE paragraph, clearly apart from the cheque amount, so the notice is not attacked as an omnibus or vague demand.
5. If the drawer is a company, firm, LLP or other entity, address the notice to the entity AND to each director, partner or person in charge who is named. Add a paragraph on their vicarious liability under Section 141 of the NI Act.
6. If the user asks to reserve rights under the Bharatiya Nyaya Sanhita, 2023 or civil remedies, add a general "without prejudice" reservation. Do not level specific criminal charges beyond Section 138.
7. Use formal Indian legal English (or the language requested), Indian digit grouping (₹9,75,000/-) and dates in the form "8th July, 2026". Number the paragraphs 1, 2, 3 …, each starting "That …" where natural.
8. End with: the without-prejudice clause, the notice-cost clause (only if a cost is given), "A copy of this notice has been retained in my office for record and further action.", then "Yours faithfully," and the advocate's signature block.

OUTPUT FORMAT
Plain text only: no markdown, no asterisks, no headings with #, no code fences, and no commentary before or after the notice. Put a blank line between blocks, and keep lines inside a block (letterhead, address) on separate lines. Use this order:
[Advocate letterhead: name, designation, address, contact], mode of dispatch (e.g. BY REGISTERED POST A.D.), reference no. (if any), Date, "To," block (the noticee(s) with addresses), subject line starting "Sub:", salutation, opening paragraph ("Under instructions and on behalf of my client …, I hereby serve upon you the following legal notice:"), numbered paragraphs, closing and signature block.`;

  function line(label, value) { return value ? `- ${label}: ${value}` : null; }

  function buildCaseDetails(d) {
    const L = [];
    const push = (...xs) => xs.forEach((x) => (x || x === "") && L.push(x));
    push("ADVOCATE",
      line("Name", d.advName), line("Designation / enrolment", d.advDesignation), line("Office address", d.advAddress),
      line("Phone", d.advPhone), line("Email", d.advEmail), line("Our reference no.", d.refNo),
      line("Date of notice", formatDate(d.dates.notice) || "[● date]"), line("Mode of dispatch", d.dispatchMode));
    push("", "CLIENT (PAYEE)",
      line("Name", d.clientName || "[● client name]"), line("Type", d.clientType), line("Address", d.clientAddress),
      line("Business / background", d.clientBusiness), line("Authorised representative", d.clientRep));
    push("", "DRAWER (NOTICEE)",
      line("Name", d.drawerName || "[● drawer name]"), line("Type", d.drawerType), line("Address", d.drawerAddress.replace(/,?\s*\n+\s*/g, ", ")),
      d.drawerIsEntity ? line("Directors / partners / persons in charge (Section 141)", d.drawerDirectors && d.drawerDirectors.replace(/\n+/g, "; ")) : null,
      line("Contact", d.drawerContact), line("Signatory of cheque", d.drawerSignatory));
    push("", "DEBT / LIABILITY",
      line("Nature of transaction", d.txnType),
      line("Total liability / outstanding", parseAmount(d.totalLiability) > 0 ? `${formatINR(parseAmount(d.totalLiability))} (${amountInWords(parseAmount(d.totalLiability))})` : ""),
      line("Supporting documents", d.txnDocs), line("Facts (in the client's words)", d.txnFacts),
      line("Reminders / follow-ups after dishonour", d.reminders));
    push("", "CHEQUE AND DISHONOUR",
      line("Cheque number", d.chequeNo || "[● cheque no.]"), line("Cheque date", formatDate(d.dates.cheque)),
      line("Cheque amount (figures)", d.amount > 0 ? d.amountFig : ""), line("Cheque amount (words)", d.amountWords),
      line("Drawn on (drawee bank & branch)", d.draweeBank), line("Drawer's account no.", d.drawerAccount),
      line("Date of presentation", formatDate(d.dates.present)), line("Presented through (payee's bank)", d.payeeBank),
      line("Return memo date", formatDate(d.dates.memo)), line("Date the client received the memo / intimation", formatDate(d.dates.memoReceived)),
      line("Reason for dishonour (quote exactly)", d.reason ? `"${d.reason}"` : ""));
    push("", "DEMAND AND DRAFTING OPTIONS",
      line("Claim interest", d.claimInterest ? `Yes, at ${d.interestRate || "[● rate]"}% per annum, stated separately from the cheque amount` : "No"),
      line("Cost of notice", parseAmount(d.noticeCost) > 0 ? `${formatINR(parseAmount(d.noticeCost))} (${amountInWords(parseAmount(d.noticeCost))})` : "Do not claim"),
      line("Reserve rights under BNS, 2023 and civil remedies", d.reserveBNS ? "Yes" : "No"),
      line("Tone", d.tone), line("Language", d.language),
      line("Additional instructions", d.extraInstructions));
    return L.join("\n");
  }

  function buildUserPrompt(d) {
    const tpls = d.useAllTemplates ? TEMPLATES : TEMPLATES.filter((t) => t.id === state.template);
    const tplText = tpls
      .map((t) => `----- REFERENCE TEMPLATE: ${t.title} (${t.tag}) -----\n${t.text}\n----- END TEMPLATE -----`)
      .join("\n\n");
    let langNote = "";
    if (d.language === "Hindi") langNote = "\nDraft the entire notice in formal legal Hindi (Devanagari). Keep statutory references such as 'धारा 138, परक्राम्य लिखत अधिनियम, 1881'.";
    if (d.language === "English with Hindi translation appended") langNote = "\nDraft the notice in English, then add a line 'हिंदी अनुवाद' and a faithful Hindi translation.";
    return `Draft a first demand notice under Section 138 of the NI Act from the case details below. Follow the style and structure of the reference template(s), adapted to these facts.${langNote}

=== CASE DETAILS ===
${buildCaseDetails(d)}

=== REFERENCE TEMPLATE(S) (style only; do not copy their facts) ===
${tplText}`;
  }

  /* ---------------- LLM call ---------------- */
  function apiBase() {
    return (state.settings.baseUrl || DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, "");
  }

  async function callLLM(messages) {
    if (!state.apiKey) throw new Error("Add your API key in LLM settings first.");
    const body = {
      model: state.settings.model || DEFAULT_SETTINGS.model,
      messages,
      max_completion_tokens: Number(state.settings.maxTokens) || DEFAULT_SETTINGS.maxTokens,
    };
    if (state.settings.reasoningEffort) body.reasoning_effort = state.settings.reasoningEffort;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180000);
    let res;
    try {
      res = await fetch(`${apiBase()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The request timed out after 3 minutes.");
      throw new Error("Network error: couldn't reach the API. Check the base URL and your connection. (" + err.message + ")");
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText || "Unknown error";
      throw new Error(`API error ${res.status}: ${msg}`);
    }
    const choice = data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (!content) {
      if (choice && choice.finish_reason === "length") throw new Error("The model used up its token budget before writing the notice. Raise 'Max output tokens' or lower the reasoning effort in settings.");
      throw new Error("The model returned an empty response.");
    }
    return { text: cleanOutput(content), usage: data.usage };
  }

  function cleanOutput(t) {
    return t
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/```\s*$/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .trim();
  }

  /* ---------------- rendering ---------------- */
  function renderNotice(text) {
    const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
    const html = blocks.map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return "";
      const first = lines[0];
      let cls = "";
      if (lines.length === 1 && /^(legal notice|demand notice|notice)$/i.test(first)) cls = "heading";
      else if (/^(sub|subject|विषय)\s*[:.-]/i.test(first)) cls = "subject";
      else if (/^\d+\s*[.)]/.test(first) && lines.length === 1) cls = "num";
      else if (lines.length > 1 || (first.length < 70 && !/[.:]$/.test(first)) || /^(to,?|date|ref)/i.test(first)) cls = "left";
      const inner = lines.map((l) => highlight(escapeHtml(l))).join("<br>");
      return `<p${cls ? ` class="${cls}"` : ""}>${inner}</p>`;
    }).join("");
    const out = $("noticeOutput");
    out.classList.remove("empty", "loading");
    out.innerHTML = html;
    out.setAttribute("contenteditable", "true");
    out.setAttribute("spellcheck", "true");
    $("docToolbar").hidden = false;
  }

  function highlight(s) {
    return s.replace(/\[[^\]\n]{1,90}\]/g, (m) => `<span class="ph">${m}</span>`);
  }

  function currentNoticeText() {
    const out = $("noticeOutput");
    if (out.classList.contains("empty")) return "";
    return Array.from(out.querySelectorAll("p"))
      .map((p) => p.innerText.trim())
      .filter(Boolean)
      .join("\n\n") || out.innerText.trim();
  }

  function setStatus(msg, kind = "", spinning = false) {
    const el = $("status");
    el.className = "status" + (kind ? " " + kind : "");
    el.innerHTML = (spinning ? '<span class="spinner" aria-hidden="true"></span>' : "") + escapeHtml(msg);
  }

  function setBusy(busy) {
    ["generateBtn", "quickBtn", "refineBtn"].forEach((id) => ($(id).disabled = busy));
    $("noticeOutput").classList.toggle("loading", busy && !$("noticeOutput").classList.contains("empty"));
  }

  /* ---------------- validation ---------------- */
  function validate() {
    let firstBad = null;
    REQUIRED.forEach((id) => {
      const el = $(id);
      const bad = !val(id) || (id === "chequeAmount" && !(parseAmount(val(id)) > 0));
      el.classList.toggle("invalid", bad);
      if (bad && !firstBad) firstBad = el;
    });
    if (firstBad) {
      const sec = firstBad.closest("details");
      if (sec) sec.open = true;
      firstBad.focus();
      return false;
    }
    return true;
  }

  /* ---------------- actions ---------------- */
  async function generate() {
    if (!validate()) { setStatus("Please fill in the highlighted required fields.", "error"); return; }
    if (!state.apiKey) { openSettings("Add your API key to generate with AI. Quick draft works without one."); return; }
    const d = getData();
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(d) },
    ];
    setBusy(true);
    setStatus(`Drafting with ${state.settings.model}…`, "", true);
    const t0 = performance.now();
    try {
      const { text, usage } = await callLLM(messages);
      state.conversation = [...messages, { role: "assistant", content: text }];
      renderNotice(text);
      $("refineBox").hidden = false;
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      setStatus(`Draft ready in ${secs}s${usage ? ` · ${usage.total_tokens} tokens` : ""}. Check it against the documents, then fill in any highlighted [●] placeholders.`, "success");
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function refine() {
    const instruction = $("refineInput").value.trim();
    if (!instruction) { $("refineInput").focus(); return; }
    const edited = currentNoticeText();
    const base = state.conversation || [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(getData()) },
    ];
    const convo = base.slice(0, 2);
    convo.push({ role: "assistant", content: edited });
    convo.push({ role: "user", content: `Revise the notice above as follows: ${instruction}\nKeep every rule from the system prompt. Return the complete revised notice only.` });
    setBusy(true);
    setStatus("Revising…", "", true);
    try {
      const { text } = await callLLM(convo);
      state.conversation = [...convo, { role: "assistant", content: text }];
      renderNotice(text);
      $("refineInput").value = "";
      setStatus("Revision applied.", "success");
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  // Deterministic draft in the standard format, with no LLM call
  function quickDraft() {
    const d = getData();
    const P = (v, label) => v || `[● ${label}]`;
    const L = [];
    const block = (...lines) => { const b = lines.filter(Boolean); if (b.length) L.push(b.join("\n")); };

    if (d.advName) block(d.advName.toUpperCase(), d.advDesignation, d.advAddress,
      [d.advPhone && `Contact: ${d.advPhone}`, d.advEmail && `Email: ${d.advEmail}`].filter(Boolean).join(" | "));
    block(d.dispatchMode);
    block(d.refNo && `Ref: ${d.refNo}`, `Date: ${P(formatDate(d.dates.notice), "date")}`);

    const addressees = ["To,", P(d.drawerName, "name of drawer"), ...(d.drawerAddress ? d.drawerAddress.split("\n") : ["[● address]"])];
    const directors = d.drawerIsEntity && d.drawerDirectors ? d.drawerDirectors.split("\n").filter(Boolean) : [];
    if (directors.length) {
      addressees.push("", "AND", ...directors.map((x, i) => `${i + 1}. ${x}`));
    }
    L.push(addressees.join("\n"));

    const amt = d.amount > 0 ? `${d.amountFig} (${d.amountWords})` : "[● amount]";
    block(`Sub: Legal notice under Section 138 of the Negotiable Instruments Act, 1881 for dishonour of Cheque No. ${P(d.chequeNo, "cheque no.")} dated ${P(formatDate(d.dates.cheque), "cheque date")} for ${d.amount > 0 ? d.amountFig : "[● amount]"}.`);
    block(d.drawerIsEntity ? "Dear Sir/Madam," : "Sir/Madam,");

    const clientDesc = d.clientType === "Individual"
      ? `${P(d.clientName, "client name")}${d.clientAddress ? `, residing at ${d.clientAddress}` : ""}`
      : `${P(d.clientName, "client name")}${d.clientAddress ? `, having its office at ${d.clientAddress}` : ""}${d.clientRep ? `, through ${d.clientRep}` : ""}`;
    block(`Under instructions and authority from my client, ${clientDesc} (hereinafter referred to as "my client"), I hereby serve upon you the following legal notice:`);

    const paras = [];
    if (d.clientBusiness) paras.push(`That my client is ${/^[aeiou]/i.test(d.clientType) ? "an" : "a"} ${d.clientType} engaged in ${d.clientBusiness}.`);
    if (d.txnFacts) paras.push(`That ${d.txnFacts.replace(/^that\s+/i, "").replace(/\s*\n+\s*/g, " ").replace(/\.?$/, ".")}`);
    else paras.push(`That the transaction between you and my client relates to ${d.txnType.toLowerCase()}. [● Set out the facts of the transaction and how the liability arose.]`);
    if (d.txnDocs) paras.push(`That the said transaction and your liability are evidenced by ${d.txnDocs.replace(/\s*\n+\s*/g, "; ").replace(/\.?$/, ".")}`);
    const total = parseAmount(d.totalLiability);
    paras.push(`That towards the discharge of your legally enforceable debt and liability${total > 0 ? ` of ${formatINR(total)} (${amountInWords(total)})` : ""}, you issued Cheque No. ${P(d.chequeNo, "cheque no.")} dated ${P(formatDate(d.dates.cheque), "cheque date")} for a sum of ${amt}, drawn on ${P(d.draweeBank, "bank and branch")}${d.drawerAccount ? ` from your Account No. ${d.drawerAccount}` : ""}${d.drawerSignatory ? `, signed by ${d.drawerSignatory}` : ""}, in favour of my client, with the assurance that the same would be honoured on presentation.`);
    paras.push(`That my client presented the said cheque for encashment${d.payeeBank ? ` through its banker, ${d.payeeBank},` : ""} on ${P(formatDate(d.dates.present), "date of presentation")}; however, to the shock and surprise of my client, the said cheque was returned unpaid with the endorsement "${P(d.reason, "reason")}", as intimated vide Cheque Return Memo dated ${P(formatDate(d.dates.memo), "memo date")}${d.dates.memoReceived ? `, received by my client on ${formatDate(d.dates.memoReceived)}` : ""}.`);
    if (d.reminders) paras.push(`That thereafter, despite ${d.reminders}, you have failed and neglected to make payment of the said amount to my client.`);
    paras.push(`That the said cheque was issued by you towards a legally enforceable debt and liability, and its dishonour for the reason stated above constitutes an offence punishable under Section 138 of the Negotiable Instruments Act, 1881.`);
    if (d.drawerIsEntity) paras.push(`That by virtue of Section 141 of the Negotiable Instruments Act, 1881, every person who, at the time the offence was committed, was in charge of and responsible to the drawer for the conduct of its business${directors.length ? ", including the addressees named above," : ""} is also deemed guilty of the offence and liable to be proceeded against.`);
    paras.push(`Under the circumstances, I, on behalf of my client, hereby call upon you to pay the said cheque amount of ${amt} to my client within 15 (fifteen) days from the date of receipt of this notice, failing which my client shall be constrained to initiate criminal proceedings against you under Sections 138 and 142 of the Negotiable Instruments Act, 1881 before the competent court, entirely at your risk as to costs and consequences.`);
    if (d.claimInterest) paras.push(`That, separately and without prejudice to the above demand for the cheque amount, my client is entitled to interest at the rate of ${P(d.interestRate, "rate")}% per annum on the said sum from ${P(formatDate(d.dates.memo), "date of dishonour")} until realisation, which my client reserves the right to recover in appropriate proceedings.`);
    const cost = parseAmount(d.noticeCost);
    if (cost > 0) paras.push(`You are further liable to pay a sum of ${formatINR(cost)} (${amountInWords(cost)}) towards the costs and expenses incurred by my client in issuing this legal notice.`);
    paras.push(`This notice is issued without prejudice to any and all other legal rights and remedies available to my client${d.reserveBNS ? ", including civil remedies for recovery and remedies under the Bharatiya Nyaya Sanhita, 2023," : ""} all of which are expressly reserved.`);
    paras.push(`A copy of this notice has been retained in my office for record and further action.`);
    paras.forEach((p, i) => L.push(`${i + 1}. ${p}`));

    block("Yours faithfully,");
    block(d.advName || "[● Advocate name]", /^advocate/i.test(d.advDesignation) ? "" : "Advocate", d.advDesignation);

    const text = L.join("\n\n");
    state.conversation = null;
    renderNotice(text);
    $("refineBox").hidden = false;
    setStatus("Quick draft made from the standard format (no AI). Fill in any highlighted [●] placeholders, or use Generate with AI for a fuller draft.", "success");
  }

  /* ---------------- export ---------------- */
  function fileBase() {
    const d = getData();
    const who = (d.drawerName || "notice").replace(/^m\/s\.?\s*/i, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    return `S138_Notice_${who}_${d.chequeNo || "draft"}`;
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function downloadDoc() {
    const out = $("noticeOutput").cloneNode(true);
    out.querySelectorAll(".ph").forEach((s) => { s.outerHTML = `<span style="background:yellow">${s.innerHTML}</span>`; });
    out.querySelectorAll("p").forEach((p) => {
      const c = p.className;
      let style = "margin:0 0 10pt 0;text-align:justify;";
      if (c.includes("heading")) style = "margin:0 0 10pt 0;text-align:center;font-weight:bold;text-decoration:underline;";
      if (c.includes("subject")) style += "font-weight:bold;";
      if (c.includes("left")) style = style.replace("justify", "left");
      if (c.includes("num")) style += "margin-left:0.35in;text-indent:-0.35in;";
      p.setAttribute("style", style);
      p.removeAttribute("class");
    });
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Section 138 Notice</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:21cm 29.7cm;margin:2.2cm 2cm}body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5}</style></head>
<body>${out.innerHTML}</body></html>`;
    download(fileBase() + ".doc", "﻿" + html, "application/msword");
  }

  async function copyText() {
    const text = currentNoticeText();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Notice copied to the clipboard.", "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); setStatus("Notice copied to the clipboard.", "success"); } catch { setStatus("Couldn't copy. Select the text and copy it by hand.", "error"); }
      ta.remove();
    }
  }

  /* ---------------- settings ---------------- */
  function loadSettings() {
    state.settings = { ...DEFAULT_SETTINGS, ...(store.get("s138.settings") || {}) };
    state.apiKey = store.get("s138.key") || store.get("s138.key", "sessionStorage") || "";
    updateBadge();
  }

  function updateBadge() {
    const b = $("modelBadge");
    b.textContent = state.settings.model || DEFAULT_SETTINGS.model;
    b.title = state.apiKey ? "API key set" : "No API key yet. Open LLM settings.";
    b.style.opacity = state.apiKey ? "1" : ".6";
  }

  function openSettings(message) {
    $("apiKey").value = state.apiKey;
    $("rememberKey").checked = !!state.settings.rememberKey;
    $("model").value = state.settings.model;
    $("baseUrl").value = state.settings.baseUrl;
    $("reasoningEffort").value = state.settings.reasoningEffort || "";
    $("maxTokens").value = state.settings.maxTokens;
    $("settingsStatus").textContent = message || "";
    $("settingsStatus").className = "status" + (message ? " error" : "");
    $("settingsDialog").returnValue = "";
    $("settingsDialog").showModal();
  }

  function readSettingsForm() {
    return {
      model: $("model").value.trim() || DEFAULT_SETTINGS.model,
      baseUrl: $("baseUrl").value.trim() || DEFAULT_SETTINGS.baseUrl,
      reasoningEffort: $("reasoningEffort").value,
      maxTokens: Math.max(1000, Number($("maxTokens").value) || DEFAULT_SETTINGS.maxTokens),
      rememberKey: $("rememberKey").checked,
    };
  }

  function saveSettings() {
    state.settings = readSettingsForm();
    state.apiKey = $("apiKey").value.trim();
    store.set("s138.settings", state.settings);
    if (state.settings.rememberKey) {
      store.set("s138.key", state.apiKey);
      store.remove("s138.key", "sessionStorage");
    } else {
      store.remove("s138.key");
      store.set("s138.key", state.apiKey, "sessionStorage");
    }
    updateBadge();
  }

  async function testConnection() {
    const s = readSettingsForm();
    const key = $("apiKey").value.trim();
    const st = $("settingsStatus");
    if (!key) { st.className = "status error"; st.textContent = "Enter an API key first."; return; }
    st.className = "status"; st.innerHTML = '<span class="spinner"></span>Checking…';
    try {
      const res = await fetch(`${s.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(s.model)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { st.className = "status success"; st.textContent = `Connected. Model "${data.id || s.model}" is available.`; }
      else { st.className = "status error"; st.textContent = `API error ${res.status}: ${(data.error && data.error.message) || res.statusText}`; }
    } catch (err) {
      st.className = "status error"; st.textContent = "Couldn't reach the API: " + err.message;
    }
  }

  /* ---------------- sample data ---------------- */
  function loadSample() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rel = (n) => isoDate(addDays(today, n));
    fillForm({
      advName: "Ananya Deshpande",
      advDesignation: "Advocate, High Court of Madhya Pradesh",
      advAddress: "Chamber No. 14, Lawyers' Complex, M.G. Road, Indore - 452001",
      advPhone: "+91 98260 11223",
      advEmail: "ananya.deshpande@example.com",
      noticeDate: rel(0),
      dispatchMode: "BY REGISTERED POST A.D. AND EMAIL",
      refNo: "AD/NI/2026/031",
      clientName: "M/s. Shree Ganesh Steel Traders",
      clientType: "Partnership Firm",
      clientAddress: "45, Loha Mandi, Siyaganj, Indore - 452007",
      clientBusiness: "the business of wholesale trading of TMT bars, structural steel and allied construction material",
      clientRep: "its Managing Partner, Mr. Rakesh Agrawal",
      drawerName: "M/s. Kapoor Infrabuild Pvt. Ltd.",
      drawerType: "Private Limited Company",
      drawerAddress: "302, Apollo Premier, Vijay Nagar,\nIndore - 452010",
      drawerDirectors: "Mr. Sanjay Kapoor, Managing Director, 12 Scheme No. 54, Indore - 452010\nMrs. Neha Kapoor, Director, 12 Scheme No. 54, Indore - 452010",
      drawerContact: "accounts@kapoorinfra.example.com",
      drawerSignatory: "Mr. Sanjay Kapoor, Managing Director",
      txnType: "Sale / supply of goods",
      totalLiability: "6,48,500",
      txnDocs: "Purchase Order No. KIB/PO/118 dated 02.06.2026; Tax Invoices No. SGST/2026/211 and SGST/2026/219; delivery challans duly acknowledged at your site",
      txnFacts: "you placed orders with my client for supply of TMT bars and structural steel for your residential project 'Kapoor Heights' at Nipania, Indore. My client supplied the material at your site, which you accepted without any complaint about quality or quantity. Against the outstanding bill amount you handed over a cheque to my client's Managing Partner at my client's office, promising that it would be honoured on presentation.",
      reminders: "repeated telephonic reminders and an email dated " + formatDate(addDays(today, -12)),
      chequeNo: "004417",
      chequeDate: rel(-35),
      chequeAmount: "6,48,500",
      draweeBank: "ICICI Bank, Vijay Nagar Branch, Indore",
      drawerAccount: "624105000789",
      presentDate: rel(-22),
      payeeBank: "State Bank of India, Siyaganj Branch, Indore",
      memoDate: rel(-20),
      memoReceivedDate: rel(-19),
      dishonourReason: "Funds Insufficient",
      otherReason: "",
      claimInterest: true,
      interestRate: "18",
      noticeCost: "5,500",
      tone: "Firm and formal (standard)",
      language: "English",
      reserveBNS: true,
      extraInstructions: "",
      useAllTemplates: false,
      __template: "commercial-goods",
    });
    saveForm();
    setStatus("Sample case loaded. Pick Generate notice with AI or Quick draft.", "");
  }

  function clearForm() {
    if (!confirm("Clear the case details? Your advocate details will be kept.")) return;
    const adv = store.get("s138.advocate") || {};
    $("noticeForm").reset();
    fillForm(adv);
    $("noticeDate").value = isoDate(new Date());
    document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    saveForm();
    syncDependentFields();
  }

  /* ---------------- init ---------------- */
  function init() {
    loadSettings();
    renderTemplates();

    const saved = store.get("s138.form");
    if (saved) fillForm(saved);
    else fillForm(store.get("s138.advocate") || {});
    if (!$("noticeDate").value) $("noticeDate").value = isoDate(new Date());
    syncDependentFields();

    const form = $("noticeForm");
    form.addEventListener("input", (e) => {
      if (e.target.classList.contains("invalid") && e.target.value.trim()) e.target.classList.remove("invalid");
      syncDependentFields();
      saveForm();
    });
    form.addEventListener("change", () => { syncDependentFields(); saveForm(); });
    ["chequeAmount", "totalLiability", "noticeCost"].forEach((id) => $(id).addEventListener("blur", formatAmountField));

    $("generateBtn").addEventListener("click", generate);
    $("quickBtn").addEventListener("click", () => { if (validate()) quickDraft(); else setStatus("Please fill in the highlighted required fields.", "error"); });
    $("refineBtn").addEventListener("click", refine);
    $("refineInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); refine(); } });
    $("copyBtn").addEventListener("click", copyText);
    $("docBtn").addEventListener("click", downloadDoc);
    $("txtBtn").addEventListener("click", () => download(fileBase() + ".txt", currentNoticeText(), "text/plain;charset=utf-8"));
    $("printBtn").addEventListener("click", () => window.print());
    $("loadSampleBtn").addEventListener("click", loadSample);
    $("clearBtn").addEventListener("click", clearForm);

    $("settingsBtn").addEventListener("click", () => openSettings());
    $("testConnBtn").addEventListener("click", testConnection);
    $("settingsDialog").addEventListener("close", () => {
      if ($("settingsDialog").returnValue === "save") saveSettings();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
