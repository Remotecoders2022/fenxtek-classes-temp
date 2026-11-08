/* ============================================================
   FENXTEK — font map
   One place that knows every text role on every page of the
   website: which selector it lives on, its default size in px
   and the font it uses. The admin panel (admin-fonts.js) reads
   this to build the editor, and the site applier (site-fonts.js)
   reads it to turn saved values into CSS.

   Nothing here is written to the database — it is the catalogue.
   Saved values live under  site/fonts  as:
     { scale: 100, updatedAt: 0, pages: { <pageId>: { <itemId>: { s: 88, f: "display" } } } }
   ============================================================ */

export const FONT_PATH = "site/fonts";

/* ---------------- families ---------------- */

export const FAMILIES = [
  { id: "", label: "Keep page default", stack: "", note: "unchanged" },
  { id: "body", label: "Body — Inter Tight", stack: "'Inter Tight',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", note: "sans" },
  { id: "display", label: "Display — Instrument Serif", stack: "'Instrument Serif',Georgia,'Times New Roman',serif", note: "serif" },
  { id: "mono", label: "Mono — JetBrains Mono", stack: "'JetBrains Mono',ui-monospace,SFMono-Regular,Consolas,monospace", note: "mono" },
  { id: "hindi", label: "Hindi — Devanagari", stack: "'Tiro Devanagari','Noto Serif Devanagari','Nirmala UI','Mangal',sans-serif", note: "हिन्दी" }
];

export function familyOf(id) {
  return FAMILIES.find((f) => f.id === id) || null;
}
export function familyStack(id) {
  const f = familyOf(id);
  return f ? f.stack : "";
}
export function familyLabel(id) {
  const f = familyOf(id);
  return f ? f.label : "Keep page default";
}

/* ---------------- catalogue ----------------
   item = { id, label, sel, size, family?, sample?, hint? }
   `size` is the desktop default in px; small screens get a
   proportional step down (see step()).                       */

const item = (id, label, sel, size, extra) => Object.assign({ id, label, sel, size, family: "", sample: label }, extra || {});

/* Roles that appear on every page (header, footer, section frame). */
const GLOBAL = [
  {
    id: "site",
    label: "Whole website",
    items: [
      item("base", "Body text — whole site", "body, p, li, dd, dt, blockquote, figcaption, address, label, td, th, input, textarea, select", 16, {
        family: "body",
        sample: "Exam-accurate dictations from 50–160 WPM.",
        hint: "Every word that is not a heading, button or label."
      })
    ]
  },
  {
    id: "type",
    label: "Headings & paragraphs",
    items: [
      item("h2", "Section heading", "h2.h2, .cta-band h2", 88, { sample: "Six ways to train.", fluid: true }),
      item("h3", "Card & block title", "h3", 38, { sample: "Hindi Shorthand Dictation", fluid: true }),
      item("lead", "Section intro", "p.lead", 18, { sample: "Everything you need to build exam-speed shorthand.", fluid: true }),
      item("eyebrow", "Kicker label", ".eyebrow, .mono", 10.5, { family: "mono", sample: "01 — The practice room" }),
      item("secNote", "Side note", ".sec-note", 10, { family: "mono", sample: "Daily practice beats occasional intensity" }),
      item("secNoteBig", "Side note number", ".sec-note b", 34, { family: "display", sample: "08" })
    ]
  },
  {
    id: "chrome",
    label: "Header, menu & footer",
    items: [
      item("navLink", "Top navigation", ".nav a", 10.5, { sample: "Courses" }),
      item("brandName", "Logo wordmark", ".brand-txt b", 15.5, { sample: "FenxTek" }),
      item("brandSub", "Logo tagline", ".brand-txt span", 8.5, { sample: "Shorthand Classes" }),
      item("menuLink", "Mobile menu link", ".menu-list a", 58, { sample: "Courses", fluid: true }),
      item("btn", "Button label", ".btn, .ct-submit, .ct-ghost", 12.5, { sample: "Book a free demo" }),
      item("footTitle", "Footer headline", ".fx-title", 73, { sample: "Let’s get you to exam speed.", fluid: true }),
      item("footLead", "Footer paragraph", ".fx-lead", 15, { sample: "Questions about batches, fees or your exam?" }),
      item("footBrand", "Footer about text", ".fx-brand p", 13.5, { sample: "A focused academy for Hindi and English shorthand." }),
      item("footColHead", "Footer column title", ".fx-col h4", 9.5, { sample: "Explore" }),
      item("footColLink", "Footer link", ".fx-col a, .fx-legal a", 14, { sample: "Batches & fees" }),
      item("footTileKey", "Footer contact label", ".fx-tile .fx-k", 9.5, { sample: "Phone" }),
      item("footTileVal", "Footer contact value", ".fx-tile .fx-v", 15, { sample: "+91 73090 82749", fluid: true }),
      item("footChip", "Footer chips", ".fx-chips span", 8.5, { family: "mono", sample: "SSC Steno" }),
      item("footBottom", "Footer copyright", ".fx-bottom", 9.5, { sample: "© FenxTek Shorthand Classes · All rights reserved." })
    ]
  },
  {
    id: "pagehero",
    label: "Page hero (inner pages)",
    items: [
      item("pheroTitle", "Page title", ".phero-title, .ahero-title, .mhero-title, .ct-title", 98, { sample: "Batches & fees" }),
      item("pheroLead", "Page intro", ".phero .lead, .ct-lead", 18, { sample: "Eight live batches with exam-focused dictation." }),
      item("pheroStat", "Hero stat number", ".phero-stats dd, .ahero-stats dd, .mhero-stats dd", 35, { sample: "3,000+" }),
      item("pheroStatKey", "Hero stat label", ".phero-stats dt, .ahero-stats dt, .mhero-stats dt", 9.5, { family: "mono", sample: "Aspirants" }),
      item("marquee", "Ticker strip", ".mq", 16, { family: "mono", sample: "SSC Stenographer ✦ UPSSSC Steno ✦" }),
      item("ctaBandLead", "Bottom band paragraph", ".cta-band .lead", 18, { sample: "Start with a free demo dictation.", fluid: true })
    ]
  }
];

export const PAGES = [
  {
    id: "global",
    label: "Every page",
    hint: "Shared text — headings, paragraphs, buttons, header and footer. Change something here and it changes on the whole website.",
    groups: GLOBAL
  },
  {
    id: "home",
    label: "Home",
    file: "index.html",
    hint: "The landing page.",
    groups: [
      {
        id: "hero",
        label: "Hero",
        items: [
          item("heroTitle", "Headline — lines 1 & 3", ".hero-head .l1, .hero-head .l3", 144, { sample: "Master", fluid: true }),
          item("heroTitleSerif", "Headline — line 2 (serif)", ".hero-head .l2", 160, {  family: "display", sample: "shorthand", fluid: true }),
          item("heroLead", "Standfirst", ".hero-lead", 19, { sample: "Exam-accurate dictations from 50–160 WPM.", fluid: true }),
          item("heroSub", "Links under the buttons", ".hero-sub-links", 13.5, { sample: "New to FenxTek? Create a free account" }),
          item("statNum", "Stat number", ".stat b", 34, { sample: "3,000+", fluid: true }),
          item("statKey", "Stat label", ".stat > span", 9, { family: "mono", sample: "Aspirants" }),
          item("liveTitle", "Live strip title", ".live-txt b", 12.5, { sample: "AHC APS · Passage 08" }),
          item("liveSub", "Live strip detail", ".live-txt span", 9, { sample: "Now dictating · Hindi" }),
          item("liveWpm", "Live WPM", ".live-wpm", 10.5, { family: "mono", sample: "80 WPM" })
        ]
      },
      {
        id: "practice",
        label: "Practice cards",
        items: [
          item("pNum", "Card number", ".p-num", 10, { family: "mono", sample: "01 / 06" }),
          item("pTitle", "Card title", ".p-card h3", 38, { sample: "Hindi Shorthand Dictation", fluid: true }),
          item("pBody", "Card text", ".p-card p", 13.5, { sample: "Professional HD audio at 50–160 WPM." }),
          item("pChip", "Card chips", ".p-chips span", 9, { sample: "50–160 WPM" })
        ]
      },
      {
        id: "explore",
        label: "Explore grid",
        items: [
          item("ecNum", "Tile number", ".ec-n", 10, { family: "mono", sample: "01 / Courses" }),
          item("ecTitle", "Tile title", ".explore-card h3", 30, { sample: "Batches & fees", fluid: true }),
          item("ecBody", "Tile text", ".explore-card p", 13.5, { sample: "Eight live batches with exam-focused dictation." })
        ]
      },
      {
        id: "voices",
        label: "Student voices",
        items: [
          item("quote", "Quote", ".voice blockquote", 24, { sample: "Sixty to a hundred WPM in three months.", fluid: true }),
          item("quoteMark", "Quote mark", ".voice-mark", 60, { family: "display", sample: "“" }),
          item("quoteName", "Student name", ".voice footer b", 14, { sample: "Ravi Kumar" }),
          item("quoteRole", "Student exam", ".voice footer small", 9, { sample: "SSC Steno · UP" }),
          item("quoteOk", "Cleared badge", ".v-ok", 8.5, { family: "mono", sample: "Cleared" })
        ]
      }
    ]
  },
  {
    id: "courses",
    label: "Courses",
    file: "courses.html",
    hint: "Batches, what is included and the fee cards.",
    groups: [
      {
        id: "console",
        label: "Hero console",
        items: [
          item("ccTag", "Live badge", ".cc-tag", 9.5, { family: "mono", sample: "Live now" }),
          item("ccTitle", "Console title", ".cc-title", 28, { sample: "AHC APS · Passage 08", fluid: true }),
          item("ccLive", "Console status", ".cc-live", 9.5, { family: "mono", sample: "Now dictating" }),
          item("ccFoot", "Console footer", ".cc-foot", 9.5, { family: "mono", sample: "Accuracy 94%" })
        ]
      },
      {
        id: "batches",
        label: "Batch cards",
        items: [
          item("bcardName", "Batch name", ".bcard-name", 20, { sample: "Morning batch", fluid: true }),
          item("bcardTag", "Batch tag", ".bcard-tag", 9, { family: "mono", sample: "6 seats left" }),
          item("bcardNum", "Batch number", ".bcard-n", 30, { family: "mono", sample: "01" }),
          item("bcardCta", "Batch link", ".bcard-cta", 10, { sample: "View details" }),
          item("bbarStatus", "Batch bar status", ".bbar-status", 10, { sample: "8 batches · 6 live" })
        ]
      },
      {
        id: "included",
        label: "What is included",
        items: [
          item("ftileKey", "Feature title", ".ftile-k, .ftile h3", 19, { sample: "Personal mentorship" }),
          item("ftileBody", "Feature text", ".ftile p", 14, { sample: "WPM, accuracy and error patterns reviewed with you." }),
          item("ftileLink", "Feature link", ".ftile-link", 10, { sample: "See the method" })
        ]
      },
      {
        id: "fees",
        label: "Fees",
        items: [
          item("fcardName", "Fee card name", ".fcard-name", 18, { sample: "AHC Steno" }),
          item("fcardPrice", "Fee card price", ".fcard-price", 41, { sample: "₹1,899", fluid: true }),
          item("fcardTag", "Fee card tag", ".fcard-tag", 9.5, { family: "mono", sample: "Full course" }),
          item("fcardSave", "Saving line", ".fcard-save", 9, { family: "display", sample: "Save ₹400" }),
          item("fcardCta", "Fee card link", ".fcard-cta", 10, { sample: "Buy now" }),
          item("buyStrip", "Buy online strip", ".buy-strip-txt b", 19, { sample: "Buy courses online in the student portal", fluid: true }),
          item("buyStripSub", "Buy strip detail", ".buy-strip-txt span", 14, { sample: "Add to cart, apply a coupon code, pay securely." }),
          item("ptlNum", "Path step number", ".ptl-n", 44, { family: "mono", sample: "01" })
        ]
      }
    ]
  },
  {
    id: "exams",
    label: "Exams",
    file: "exams.html",
    hint: "Exam matrix, category cards and the skill ladder.",
    groups: [
      {
        id: "matrix",
        label: "Exam matrix",
        items: [
          item("xmTileNum", "Tile count", ".xm-tile b", 46, { sample: "04", fluid: true }),
          item("xmTileName", "Tile name", ".xm-tile span", 9, { sample: "Parliamentary reporter" })
        ]
      },
      {
        id: "cats",
        label: "Category cards",
        items: [
          item("xcatName", "Category name", ".xcat-n", 34, { sample: "Parliamentary reporter" }),
          item("xcatSub", "Category detail", ".xcat-sub", 14, { sample: "AHC, Rajya Sabha and Lok Sabha posts." }),
          item("xcatKey", "Category count", ".xcat-k", 9.5, { family: "mono", sample: "4 posts" }),
          item("chip", "Filter chip", ".xnav .chip", 10, { sample: "All exams" }),
          item("xsearchNum", "Search count", ".xsearch-n", 9.5, { family: "mono", sample: "31 posts" })
        ]
      },
      {
        id: "ladder",
        label: "Skill ladder",
        items: [
          item("xreadyNum", "Ladder step", ".xready-n", 30, { family: "mono", sample: "01" }),
          item("xladderBody", "Ladder text", ".xladder li, .xladder p", 16, { sample: "80 WPM with 95% accuracy." })
        ]
      }
    ]
  },
  {
    id: "method",
    label: "Method",
    file: "method.html",
    hint: "The three steps, weekly rhythm and progress chart.",
    groups: [
      {
        id: "quote",
        label: "Hero",
        items: [
          item("mheroQuote", "Hero quote", ".phero-quote", 30, {  family: "display", sample: "Three steps, repeated daily.", fluid: true }),
          item("loopNode", "Loop labels", ".loop-node", 16, { family: "mono", sample: "Listen · Write · Review" })
        ]
      },
      {
        id: "steps",
        label: "The three steps",
        items: [
          item("mstepNum", "Step number", ".mstep-n", 68, {  family: "mono", sample: "01", fluid: true }),
          item("mstepTitle", "Step title", ".mstep h3", 35.5, { sample: "Dictation", fluid: true }),
          item("mstepBody", "Step text", ".mstep p", 15.5, { sample: "Real exam audio at your target speed." }),
          item("mstepList", "Step bullets", ".mstep-list li", 14.5, { sample: "50–160 WPM" }),
          item("mstepTag", "Step tag", ".mstep-tag", 9.5, { family: "mono", sample: "Daily" }),
          item("mvpKey", "Visual label", ".mvp-k", 9.5, { family: "mono", sample: "Accuracy" }),
          item("mvpTitle", "Visual title", ".mvp-t", 21, { sample: "95% and rising" })
        ]
      },
      {
        id: "week",
        label: "Week & progress",
        items: [
          item("mdayKey", "Week day", ".mday-k", 8.5, { family: "mono", sample: "Monday" }),
          item("mprogStat", "Progress number", ".mprog-stats dd", 35.5, { sample: "120 WPM", fluid: true }),
          item("mprogKey", "Progress label", ".mprog-stats dt", 9.5, { family: "mono", sample: "Target speed" }),
          item("mchartNote", "Chart note", ".mchart-note", 8.5, { sample: "Average of the last 8 weeks" }),
          item("mwhyTitle", "Why-us tile title", ".mwhy-tile h3", 40, { sample: "Measured practice", fluid: true }),
          item("mwhyBody", "Why-us tile text", ".mwhy-tile p", 16, { sample: "Every session ends with a number." })
        ]
      }
    ]
  },
  {
    id: "about",
    label: "About",
    file: "about.html",
    hint: "Director’s message, values and student voices.",
    groups: [
      {
        id: "director",
        label: "Director",
        items: [
          item("dirInitials", "Photo initials", ".dir-ini", 136, {  family: "display", sample: "MK", fluid: true }),
          item("dirCap", "Photo caption", ".abport-cap", 13, { sample: "Mohd. Kaif — Director" }),
          item("dirLoc", "Location chip", ".abport-loc", 9.5, { family: "mono", sample: "Kanpur, Uttar Pradesh" }),
          item("dirChip", "Floating chip", ".abport-chip", 12.5, { sample: "12 years teaching" })
        ]
      },
      {
        id: "message",
        label: "Message",
        items: [
          item("abmsgQuote", "Quote", ".abmsg-quote", 82, {  family: "display", sample: "We teach the habit, not just the speed.", fluid: true }),
          item("abmsgText", "Message text", ".abmsg-text", 22, { sample: "Every batch is planned around your exam date.", fluid: true }),
          item("abmsgSign", "Signature", ".abmsg-sign", 16, { family: "display", sample: "Mohd. Kaif" }),
          item("abmsgTag", "Message tags", ".abmsg-tags span", 10.5, { family: "mono", sample: "Shorthand" })
        ]
      },
      {
        id: "values",
        label: "Values & more",
        items: [
          item("abvalNum", "Value number", ".abval-n", 30, { family: "mono", sample: "01" }),
          item("abvalTitle", "Value title", ".abval h3", 26, { sample: "Your success, our priority", fluid: true }),
          item("abvalBody", "Value text", ".abval p", 14.5, { sample: "Batches planned around your exam date." }),
          item("abexpNum", "Explore number", ".abexp-n", 10, { family: "mono", sample: "01" }),
          item("abexpTitle", "Explore title", ".abexp-card b", 22, { sample: "The method" }),
          item("abexpBody", "Explore text", ".abexp-card p", 14, { sample: "Three steps, repeated daily." }),
          item("abcontact", "Contact rows", ".abcontact-row b", 16, { sample: "Phone" })
        ]
      }
    ]
  },
  {
    id: "achievements",
    label: "Achievements",
    file: "achievements.html",
    hint: "Spotlight card and the results wall.",
    groups: [
      {
        id: "spot",
        label: "Spotlight",
        items: [
          item("aspotKey", "Spotlight label", ".aspot-k", 11, { family: "mono", sample: "Latest selection" }),
          item("aspotTitle", "Spotlight title", ".aspot-card figcaption b", 20, { sample: "Selected — AHC APS" })
        ]
      },
      {
        id: "wall",
        label: "Results wall",
        items: [
          item("awallShowing", "Showing count", ".awall-showing", 12, { sample: "Showing 9 of 24" }),
          item("achTitle", "Result title", ".ach-title", 18, { sample: "Selected — SSC Stenographer" }),
          item("achCap", "Result caption", ".ach-cap", 14, { sample: "Selected · SSC Steno 2026" }),
          item("achNo", "Result number", ".ach-no", 9.5, { family: "mono", sample: "No. 01" }),
          item("achTag", "Result tag", ".ach-tag", 9, { family: "mono", sample: "SSC" }),
          item("achMeta", "Result meta", ".ach-meta", 9.5, { family: "mono", sample: "June 2026" }),
          item("lbCount", "Lightbox counter", ".lb-count", 11, { family: "mono", sample: "03 / 24" }),
          item("lbCap", "Lightbox caption", ".lb-cap", 14, { sample: "Selected · UPSSSC" })
        ]
      }
    ]
  },
  {
    id: "membership",
    label: "Membership",
    file: "membership.html",
    hint: "Plan cards, what is inside and the FAQs.",
    groups: [
      {
        id: "stack",
        label: "Card stack",
        items: [
          item("mvisBrand", "Card brand", ".mvis-brand", 14, { family: "mono", sample: "FenxTek Member" }),
          item("mvisChip", "Card chip", ".mvis-chip", 16, { family: "mono", sample: "All courses" }),
          item("mvisMark", "Card mark", ".mvis-mark", 20, { sample: "✦" })
        ]
      },
      {
        id: "plans",
        label: "Plan cards",
        items: [
          item("mcardNum", "Plan number", ".mcard-n", 10, { family: "mono", sample: "01" }),
          item("mcardName", "Plan name", ".mcard-name", 27, { sample: "3 months", fluid: true }),
          item("mcardTag", "Plan tagline", ".mcard-tag", 13.5, { sample: "Every course unlocked" }),
          item("mcardPrice", "Plan price", ".mcard-price b", 68, { sample: "₹549", fluid: true }),
          item("mcardCur", "Rupee sign", ".mcard-cur", 30, { sample: "₹" }),
          item("mcardPer", "Price period", ".mcard-per", 10.5, { sample: "/ 3 months" }),
          item("mcardDay", "Per-day line", ".mcard-day", 9.5, { sample: "≈ ₹6 a day" }),
          item("mcardCta", "Buy button", ".mcard-cta-txt b", 15, { sample: "Buy now" }),
          item("mcardFeat", "Plan features", ".mcard-feats li", 13.5, { sample: "Every batch and course" })
        ]
      },
      {
        id: "inside",
        label: "Inside & FAQs",
        items: [
          item("mbTitle", "Inside tile title", ".mbento-tile h3", 24, { sample: "Typing software", fluid: true }),
          item("mbBody", "Inside tile text", ".mbento-tile p", 13.5, { sample: "Mangal, KrutiDev and Remington Gail." }),
          item("msNum", "Step number", ".ms-n", 56, { family: "mono", sample: "01" }),
          item("mquote", "Hindi quote", ".mquote p.hindi", 64, {  family: "hindi", sample: "आपकी सफलता, हमारी प्राथमिकता", fluid: true }),
          item("faqQ", "FAQ question", ".faq-q", 22, { sample: "Is the fee refundable?", fluid: true }),
          item("faqA", "FAQ answer", ".faq-a", 16, { sample: "Course fees are non-refundable once access starts." }),
          item("mtrust", "Trust line", ".mtrust li", 16, { sample: "Secure UPI checkout" })
        ]
      }
    ]
  },
  {
    id: "contact",
    label: "Contact",
    file: "contact.html",
    hint: "Hero, the enquiry form and the reach-out cards.",
    groups: [
      {
        id: "cthero",
        label: "Hero",
        items: [
          item("ctPoint", "Hero bullet", ".ct-points li", 16, { sample: "Free demo dictation" }),
          item("ctQuick", "Quick button", ".ct-qbtn", 13.5, { sample: "WhatsApp us" }),
          item("ctOpen", "Opening hours", ".ct-open", 10, { sample: "Open today · 8 am – 8 pm" })
        ]
      },
      {
        id: "form",
        label: "Enquiry form",
        items: [
          item("ctField", "Form text", ".ct-input", 15, { sample: "Your name" }),
          item("ctLabel", "Field label", ".ct-label", 9.5, { family: "mono", sample: "Full name" }),
          item("ctErr", "Field error", ".ct-err", 12, { sample: "Please enter your phone number" }),
          item("ctBadge", "Form badge", ".ct-badge", 9.5, { family: "mono", sample: "Replies same day" }),
          item("ctLegal", "Form small print", ".ct-legal", 12, { sample: "We never share your number." })
        ]
      },
      {
        id: "reach",
        label: "Reach us & FAQs",
        items: [
          item("ctChTitle", "Channel title", ".ct-ch b", 15.5, { sample: "Phone" }),
          item("ctChHint", "Channel hint", ".ct-ch-hint", 12.5, { sample: "+91 73090 82749" }),
          item("ctStepNum", "Step number", ".ct-step-n", 30, { family: "mono", sample: "01" }),
          item("ctVisit", "Visit card text", ".ct-visit-main", 16, { sample: "Kanpur, Uttar Pradesh" }),
          item("ctFaqQ", "FAQ question", ".ct-faq .faq-q", 22, { sample: "Do you teach English shorthand?", fluid: true }),
          item("ctFaqA", "FAQ answer", ".ct-faq .faq-a", 16, { sample: "Yes — English and Hindi, both patterns." })
        ]
      }
    ]
  },
  {
    id: "legal",
    label: "Privacy & terms",
    hint: "Both legal pages share one layout — change it here and it applies to the privacy policy and the terms & conditions.",
    file: "privacy.html",
    groups: [
      {
        id: "head",
        label: "Page head",
        items: [
          item("lgMetaKey", "Meta label", ".lg-meta small", 8.5, { family: "mono", sample: "Last updated" }),
          item("lgMetaVal", "Meta value", ".lg-meta b", 13, { sample: "7 November 2026" }),
          item("lgSummary", "Summary box", ".lg-summary", 16, { sample: "We collect only what we need to run your batch." })
        ]
      },
      {
        id: "body",
        label: "Policy text",
        items: [
          item("lgToc", "Contents list", ".lg-toc a", 13.5, { sample: "01 Information we collect" }),
          item("lgH", "Clause heading", ".lg-h", 23, { sample: "01 Information we collect", fluid: true }),
          item("lgP", "Clause paragraph", ".lg-body p", 15, { sample: "We collect the name, phone number and email…" }),
          item("lgLi", "Clause bullet", ".lg-body li", 14.5, { sample: "Name and phone number" }),
          item("lgCardB", "Card title", ".lg-card b", 14, { sample: "Account data" }),
          item("lgTable", "Table text", ".lg-table", 13.5, { sample: "Purpose · What we collect · Retention" }),
          item("lgNote", "Note box", ".lg-note", 14, { sample: "We never sell your data." }),
          item("lgContact", "Contact block", ".lg-contact", 16, { sample: "Support.fenxtek@gmail.com" }),
          item("lgUpdated", "Updated line", ".lg-updated", 15, { sample: "Last updated 7 November 2026" })
        ]
      }
    ]
  }
];

/* ---------------- helpers ---------------- */

export const PAGE_BY_ID = PAGES.reduce((m, p) => ((m[p.id] = p), m), {});
export const PAGE_IDS = PAGES.map((p) => p.id);

export function itemsOf(pageId) {
  const page = PAGE_BY_ID[pageId];
  if (!page) return [];
  return page.groups.reduce((all, g) => all.concat(g.items.filter((i) => !i.skip)), []);
}

export function itemOf(pageId, itemId) {
  return itemsOf(pageId).find((i) => i.id === itemId) || null;
}

export function countItems(pageId) {
  return itemsOf(pageId).length;
}

/* Clamp + round helpers shared by the editor and the applier. */
export const MIN_PX = 8;
export const MAX_PX = 200;

export function clampPx(n) {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!isFinite(v)) return 0;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(v * 10) / 10));
}

/* Scale (%) applied to everything that has a saved size. */
export function scaleOf(cfg) {
  const s = Number(cfg && cfg.scale);
  if (!isFinite(s) || s <= 0) return 1;
  return Math.min(2, Math.max(0.4, s / 100));
}

/* What one item resolves to, all things considered. */
export function valueOf(cfg, pageId, it) {
  const bag = cfg && cfg.pages && cfg.pages[pageId];
  const saved = bag && bag[it.id];
  const raw = saved && saved.s != null ? saved.s : it.size;
  const fam = saved && saved.f ? saved.f : it.family || "";
  return { size: clampPx(clampPx(raw) * scaleOf(cfg)), family: fam, saved: Boolean(saved && (saved.s != null || saved.f)) };
}

/* What the editor edits: the saved px, or the catalogue default.
   The scale is applied on top when the CSS is written, so typing
   60 in the panel always means 60 on a desktop screen. */
export function rawOf(cfg, pageId, it) {
  const bag = cfg && cfg.pages && cfg.pages[pageId];
  const saved = bag && bag[it.id];
  return saved && saved.s != null ? clampPx(saved.s) : clampPx(it.size);
}

/* ---------------- responsive curve ----------------
   A saved px is the desktop size. Below that the size steps down
   along a curve measured off the design's own clamp() sizes, so a
   custom size still behaves like the rest of the page on a phone.
   Very small text never shrinks (it is already at its floor).    */
const CURVES = [
  { at: 1200, big: 0.88, mid: 0.94, small: 1 },
  { at: 1080, big: 0.82, mid: 0.91, small: 0.99 },
  { at: 900, big: 0.72, mid: 0.85, small: 0.97 },
  { at: 760, big: 0.64, mid: 0.79, small: 0.95 },
  { at: 620, big: 0.56, mid: 0.75, small: 0.93 },
  { at: 480, big: 0.5, mid: 0.72, small: 0.92 }
];

export function step(px, width) {
  const s = Math.max(9, px);
  if (s < 14) return s;
  const band = s >= 28 ? "big" : s >= 18 ? "mid" : "small";
  const row = CURVES.find((c) => String(c.at) === String(width));
  const f = row ? row[band] : 1;
  return Math.max(9, Math.round(s * f * 10) / 10);
}

/* ---------------- CSS ---------------- */

/* desktop size, plus the step-down ladder for roles whose own size
   already changes with the screen width */
function sizeRules(sel, px, fluid) {
  if (!fluid) return `${sel}{font-size:${px}px!important}`;
  let out = `${sel}{font-size:${px}px!important}`;
  CURVES.forEach((c) => {
    out += `@media (max-width:${c.at}px){${sel}{font-size:${step(px, c.at)}px!important}}`;
  });
  return out;
}

/**
 * CSS for one page (plus the shared "every page" rules).
 * Nothing is emitted for a role the admin has not touched, so the
 * design keeps its own sizes until you set one. Turning the text
 * scale away from 100% writes every role, which is what scaling the
 * whole site up or down means.
 */
export function fontCss(cfg, pageId) {
  const all = scaleOf(cfg) !== 1;
  const out = [];
  const emit = (pid, it, scope) => {
    const bag = cfg && cfg.pages && cfg.pages[pid];
    const saved = bag && bag[it.id] ? bag[it.id] : null;
    if (!saved && !all) return;
    const v = valueOf(cfg, pid, it);
    const sel = it.sel
      .split(",")
      .map((s) => (scope ? `${scope} ${s.trim()}` : s.trim()))
      .join(",");
    const wantSize = saved ? saved.s != null : true;
    if (wantSize) out.push(sizeRules(sel, v.size, it.fluid));
    if (v.family) out.push(`${sel}{font-family:${familyStack(v.family)}!important}`);
  };
  itemsOf("global").forEach((it) => emit("global", it, ""));
  if (pageId && pageId !== "global") {
    const scope = `body[data-page="${pageId}"]`;
    itemsOf(pageId).forEach((it) => emit(pageId, it, scope));
  }
  return out.join("");
}

/** Extra page ids that reuse another page's catalogue. */
export const ALIASES = { terms: "legal", privacy: "legal", 404: "global" };

export function cssPageFor(pageKey) {
  if (!pageKey) return "global";
  if (ALIASES[pageKey]) return ALIASES[pageKey];
  return PAGE_BY_ID[pageKey] ? pageKey : "global";
}

/** Drop junk before writing: only known pages/items, clean numbers. */
export function sanitize(cfg) {
  const safe = { scale: 100, updatedAt: Date.now(), pages: {} };
  const s = Number(cfg && cfg.scale);
  safe.scale = isFinite(s) && s > 0 ? Math.min(200, Math.max(40, Math.round(s))) : 100;
  const pages = (cfg && cfg.pages) || {};
  Object.keys(pages).forEach((pageId) => {
    const src = pages[pageId];
    if (!src || typeof src !== "object") return;
    const bag = {};
    itemsOf(pageId).forEach((it) => {
      const v = src[it.id];
      if (!v || typeof v !== "object") return;
      const px = parseFloat(v.s);
      const fam = familyOf(v.f) && v.f ? v.f : "";
      if (!isFinite(px) && !fam) return;
      bag[it.id] = {};
      if (isFinite(px)) bag[it.id].s = clampPx(px);
      if (fam) bag[it.id].f = fam;
    });
    if (Object.keys(bag).length) safe.pages[pageId] = bag;
  });
  return safe;
}
