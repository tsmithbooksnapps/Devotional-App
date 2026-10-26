import { acct, startAccount, loadContent as fetchContent, accountAction, renderBand, loadSaved, saveAltar, removeAltar, saveProgress, localProgress } from "./account.js";

/* ---------- Content: everything below is data, so a new pantheon is a new entry, not new code. ---------- */


// Access tiers for the paid edition. In "preview" every option is usable; "free" would limit to the free set.
const ACCESS = { mode: "preview", freeDeityLimit: 1 };

// Needs are shared across pantheons; each deity lists the needs it answers.
const NEEDS = [
  { id: "home", label: "Home and steadiness" },
  { id: "nourish", label: "Nourishment and plenty" },
  { id: "passage", label: "Safe passage" },
  { id: "promise", label: "Keeping commitments" },
  { id: "endings", label: "Endings and grief" },
  { id: "anger", label: "Anger and courage" },
  { id: "decide", label: "Clear decisions" },
  { id: "craft", label: "Craft and work" },
  { id: "healing", label: "Clarity and healing" },
  { id: "threshold", label: "Thresholds and change" },
  { id: "love", label: "Love and connection" },
  { id: "release", label: "Release and joy" }
];

const SPACES = [
  { id: "sill", label: "A single object", where: "Windowsill, nightstand, desk corner", desc: "One object for each god. The smallest altar the book describes.", access: "free" },
  { id: "shelf", label: "A corner shelf", where: "One shelf or a corner that stays", desc: "The book's own altar for each god: a small, permanent corner.", access: "free" },
  { id: "table", label: "A table altar", where: "A side table or dresser top", desc: "The book's altar plus each god's sigil drawn by hand, on a cloth.", access: "full" },
  { id: "room", label: "A dedicated space", where: "A room, alcove or garden", desc: "Everything above with each god's symbols, a low place for chthonic gods, and a wall calendar.", access: "full" }
];

const DURATIONS = [
  { id: "once", label: "A single moment", desc: "Thirty seconds to a minute. The book's shortest practice for each god.", access: "free" },
  { id: "sitting", label: "One sitting", desc: "About ten to twenty minutes: open, invoke, offer, reflect, close.", access: "free" },
  { id: "week", label: "Seven days", desc: "Set up, a small daily practice, and a deeper close on day seven.", access: "full" },
  { id: "moon", label: "One lunar month", desc: "New moon to new moon, starting on the Noumenia.", access: "full" },
  { id: "year", label: "A year of observance", desc: "Monthly practice plus each god's ancient festivals by season.", access: "full" }
];

// Filled from the database on start-up (see loadContent): public catalogue for everyone,
// the book's full text for members and 7-word teasers for everyone else.
let PANTHEONS = [];

/* Upkeep that the app adds by space (not from the book). */
const SPACE_UPKEEP = {
  sill: ["Dust it and check it whenever you pass; a single object is easy to forget."],
  shelf: ["Once a week, refresh anything perishable and dust the shelf."],
  table: ["Once a week, refresh anything perishable and straighten the cloth.", "Once a month, clear the table completely, wash the dishes and cloth, and set it again."],
  room: ["Once a week, refresh anything perishable.", "Once a month, clear and clean the whole space and reset it.", "At each god's festival season, re-dress their part of the altar."]
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ---------- State ---------- */
const state = { pantheon: "greek", need: null, deities: ["hestia", "demeter"], space: "shelf", duration: "sitting", progress: {}, example: true };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const P = () => PANTHEONS.find((p) => p.id === state.pantheon);
const D = (id) => P().deities.find((d) => d.id === id);
const src = (k) => k === "book" ? '<span class="src book">Book</span>' : k === "hist" ? '<span class="src hist">History</span>' : '<span class="src draft">Draft</span>';
// Paid split (option C): the free view shows the first words of each book passage and points to its chapter.
// Non-members receive teasers already cut short by the server; tz() only adds the chapter pointer.
let VIEW = "free";
const lockTag = (ch) => `<span class="lock">${ch ? `Chapter ${ch}` : "In the book"} · members</span>`;
function tz(text, ch) {
  if (VIEW !== "free") return esc(text ?? "");
  return (text ? esc(text) + " " : "") + lockTag(ch);
}
const sig = (id) => `/sigils/${state.pantheon}/${id}.png`;
const fullTag = (o) => o.access === "full" ? '<span class="full">Full edition</span>' : "";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

/* Order gods on the altar: the pantheon's "first" god sits at the center, others around in the order chosen. */
function ordered(ids) {
  const p = P(); const list = ids.slice();
  const first = p.rules && p.rules.first;
  if (first && list.includes(first) && list.length > 1) {
    const rest = list.filter((x) => x !== first);
    const mid = Math.floor(rest.length / 2);
    return [...rest.slice(0, mid), first, ...rest.slice(mid)];
  }
  return list;
}

/* ---------- Theme per pantheon ---------- */
function applyTheme() {
  const p = P(); let el = $("pantheonTheme");
  if (!el) { el = document.createElement("style"); el.id = "pantheonTheme"; document.head.appendChild(el); }
  if (!p.theme) { el.textContent = ""; return; }
  const decl = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v};`).join("");
  el.textContent = `:root{${decl(p.theme.light)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(p.theme.dark)}}}:root[data-theme="dark"]{${decl(p.theme.dark)}}`;
}

/* ---------- Choice rendering ---------- */
function renderPantheons() {
  $("pantheons").innerHTML = PANTHEONS.map((p) => p.status === "ready"
    ? `<button class="chip" aria-pressed="${p.id === state.pantheon}" data-p="${p.id}">${esc(p.name)} <small>${p.deities.length} gods</small></button>`
    : `<button class="chip" disabled title="Planned for a later book">${esc(p.name)} <small>later book</small></button>`).join("");
}
function renderNeeds() {
  const avail = new Set(P().deities.flatMap((d) => d.needs));
  $("needs").innerHTML = NEEDS.filter((n) => avail.has(n.id)).map((n) => `<button class="chip" aria-pressed="${state.need === n.id}" data-need="${n.id}">${esc(n.label)}</button>`).join("");
}
function renderDeities() {
  const p = P();
  $("deities").innerHTML = p.deities.map((d) => {
    const on = state.deities.includes(d.id);
    const rec = state.need && d.needs.includes(state.need);
    const dim = state.need && !rec && !on;
    return `<button class="dcard${rec ? " rec" : ""}${dim ? " dim" : ""}" aria-pressed="${on}" data-d="${d.id}">
      <span class="med"><img src="${sig(d.id)}" alt=""></span>
      <span><span class="nm">${esc(d.name)}</span><span class="dm" style="display:block">${esc(d.short)}</span></span>
    </button>`;
  }).join("");
  const n = state.deities.length;
  const many = n > ACCESS.freeDeityLimit ? ' <span class="full">Full edition</span>' : "";
  $("selrow").innerHTML = n
    ? `<span>${n} chosen${many}.</span> ${state.deities.map((id) => `<button class="linkbtn" data-info="${id}">About ${esc(D(id).name)}</button>`).join(" · ")}${n ? ' · <button class="linkbtn" data-clear="1">Clear</button>' : ""}`
    : "<span>Choose at least one god to start an altar.</span>";
  $("frieze").innerHTML = p.deities.map((d) => `<button aria-pressed="${state.deities.includes(d.id)}" data-d="${d.id}" title="${esc(d.name)}"><img src="${sig(d.id)}" alt="${esc(d.name)}"></button>`).join("");
}
const spaceIcon = {
  sill: '<svg viewBox="0 0 120 46"><rect x="30" y="2" width="60" height="34" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="60" y1="2" x2="60" y2="36" stroke="currentColor" stroke-width="1"/><rect x="22" y="36" width="76" height="5" fill="currentColor"/><circle cx="60" cy="32" r="3" fill="var(--accent)"/></svg>',
  shelf: '<svg viewBox="0 0 120 46"><rect x="24" y="30" width="72" height="4" fill="currentColor"/><path d="M34 34v8M86 34v8" stroke="currentColor" stroke-width="2"/><circle cx="48" cy="25" r="4" fill="var(--accent)"/><rect x="58" y="18" width="5" height="12" fill="currentColor"/><circle cx="74" cy="26" r="3" fill="var(--accent)"/></svg>',
  table: '<svg viewBox="0 0 120 46"><circle cx="60" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="18" y="26" width="84" height="4" fill="currentColor"/><path d="M24 30v16M96 30v16" stroke="currentColor" stroke-width="2"/><path d="M30 30h60v6H30z" fill="var(--accent)" opacity=".5"/><circle cx="40" cy="22" r="4" fill="var(--accent)"/><rect x="58" y="14" width="4" height="12" fill="currentColor"/><circle cx="80" cy="22" r="4" fill="var(--accent)"/></svg>',
  room: '<svg viewBox="0 0 120 46"><path d="M8 4h104" stroke="currentColor"/><circle cx="36" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="60" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="84" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="20" y="28" width="80" height="4" fill="currentColor"/><path d="M26 32v10M94 32v10" stroke="currentColor" stroke-width="2"/><rect x="96" y="40" width="20" height="4" fill="currentColor"/><circle cx="106" cy="37" r="3" fill="var(--accent)"/><circle cx="46" cy="24" r="3" fill="var(--accent)"/><circle cx="74" cy="24" r="3" fill="var(--accent)"/></svg>'
};
function renderOptions() {
  $("spaces").innerHTML = SPACES.map((s) => `<button class="opt" aria-pressed="${state.space === s.id}" data-s="${s.id}">${spaceIcon[s.id]}<span class="t">${esc(s.label)} ${fullTag(s)}</span><span class="d"><em>${esc(s.where)}.</em> ${esc(s.desc)}</span></button>`).join("");
  $("durations").innerHTML = DURATIONS.map((t) => `<button class="opt" aria-pressed="${state.duration === t.id}" data-t="${t.id}"><span class="t">${esc(t.label)} ${fullTag(t)}</span><span class="d">${esc(t.desc)}</span></button>`).join("");
}

/* ---------- Altar contents ---------- */
function altarItems() {
  const p = P(); const ids = ordered(state.deities); const items = [];
  const sp = state.space;
  ids.forEach((id) => {
    const d = D(id);
    const base = sp === "sill" ? d.altar.slice(0, 1) : d.altar;
    base.forEach((a) => items.push({ who: id, t: a.t, g: a.g, src: "book" }));
    if (sp === "table" || sp === "room") items.push({ who: id, t: "Sigil, drawn by hand: " + d.sigil, g: "card", src: "book" });
    if (sp === "room" && d.large) items.push({ who: id, t: "Symbols from the book's At a Glance: " + d.large.t, g: d.large.g, src: "book" });
  });
  const shared = [];
  if (sp === "table" || sp === "room") shared.push({ who: null, t: "A plain cloth to set the surface apart", g: "cloth", src: "draft" });
  if ((sp === "table" || sp === "room") && !ids.includes("hestia")) shared.push({ who: null, t: "One candle to mark the start and end of practice", g: "candle", src: "draft" });
  if (sp === "room") shared.push({ who: null, t: "A notebook for reflections, kept on the altar", g: "card", src: "draft" }, { who: null, t: "A wall calendar marking the festivals below", g: "card", src: "draft" });
  items.forEach((it, i) => it.n = i + 1);
  shared.forEach((it, i) => it.n = items.length + i + 1);
  return { items, shared };
}

/* ---------- Diagram ---------- */
// Phones get larger objects in the drawing so it stays legible at that width.
let SC = 1;
function glyph(g, x, y) {
  return `<g transform="translate(${x} ${y}) scale(${SC}) translate(${-x} ${-y})">${glyphRaw(g, x, y)}</g>`;
}
function glyphRaw(g, x, y) {
  const a = "var(--accent)", k = "var(--glyph)", s = "var(--sage)";
  switch (g) {
    case "candle": return `<rect x="${x-5}" y="${y-30}" width="10" height="30" fill="${k}" opacity=".85"/><path d="M${x} ${y-44}c5 6 5 10 0 12c-5-2-5-6 0-12z" fill="${a}"/>`;
    case "dish": return `<ellipse cx="${x}" cy="${y-5}" rx="18" ry="5" fill="${k}" opacity=".85"/><ellipse cx="${x}" cy="${y-8}" rx="12" ry="3" fill="${a}"/>`;
    case "stone": return `<ellipse cx="${x}" cy="${y-7}" rx="12" ry="7" fill="${k}"/>`;
    case "leaf": return `<path d="M${x-10} ${y-2}C${x-10} ${y-20} ${x+6} ${y-26} ${x+12} ${y-28}C${x+10} ${y-12} ${x+2} ${y-2} ${x-10} ${y-2}z" fill="${s}"/>`;
    case "branch": return `<path d="M${x} ${y}V${y-34}" stroke="${k}" stroke-width="2"/><ellipse cx="${x-6}" cy="${y-24}" rx="6" ry="3" fill="${s}"/><ellipse cx="${x+6}" cy="${y-17}" rx="6" ry="3" fill="${s}"/><ellipse cx="${x-5}" cy="${y-10}" rx="6" ry="3" fill="${s}"/><circle cx="${x}" cy="${y-36}" r="3" fill="${a}"/>`;
    case "fruit": return `<circle cx="${x}" cy="${y-11}" r="11" fill="${a}"/><path d="M${x-4} ${y-22}l4-5 4 5" fill="none" stroke="${k}" stroke-width="1.5"/>`;
    case "figure": return `<rect x="${x-8}" y="${y-28}" width="16" height="28" rx="8" fill="${k}" opacity=".85"/><circle cx="${x}" cy="${y-20}" r="3" fill="${a}"/>`;
    case "tool": return `<rect x="${x-2}" y="${y-28}" width="4" height="28" fill="${k}"/><rect x="${x-10}" y="${y-32}" width="20" height="8" fill="${k}" opacity=".8"/>`;
    case "shell": return `<path d="M${x-14} ${y-2}A14 14 0 0 1 ${x+14} ${y-2}z" fill="${a}" opacity=".85"/><path d="M${x} ${y-2}V${y-15}M${x} ${y-2}L${x-8} ${y-12}M${x} ${y-2}L${x+8} ${y-12}" stroke="${k}" stroke-width="1"/>`;
    case "key": return `<circle cx="${x-8}" cy="${y-6}" r="5" fill="none" stroke="${k}" stroke-width="2.5"/><path d="M${x-3} ${y-6}H${x+12}M${x+8} ${y-6}v4M${x+12} ${y-6}v4" stroke="${k}" stroke-width="2.5"/>`;
    case "ring": return `<circle cx="${x}" cy="${y-10}" r="9" fill="none" stroke="${a}" stroke-width="3"/>`;
    case "cup": return `<path d="M${x-10} ${y-24}h20l-4 14h-12z" fill="${k}" opacity=".85"/><rect x="${x-1.5}" y="${y-10}" width="3" height="8" fill="${k}"/><rect x="${x-7}" y="${y-2}" width="14" height="2" fill="${k}"/>`;
    case "jar": return `<rect x="${x-8}" y="${y-22}" width="16" height="22" rx="3" fill="${k}" opacity=".8"/><rect x="${x-9}" y="${y-25}" width="18" height="4" fill="${a}"/>`;
    case "card": return `<rect x="${x-9}" y="${y-26}" width="18" height="24" fill="var(--medallion)" stroke="${k}" stroke-width="1"/><circle cx="${x}" cy="${y-14}" r="6" fill="none" stroke="${a}" stroke-width="1.2"/>`;
    default: return `<circle cx="${x}" cy="${y-8}" r="8" fill="${k}"/>`;
  }
}
function badge(n, x, y) {
  return `<circle cx="${x}" cy="${y}" r="${8.5 * SC}" fill="var(--ink)"/><text x="${x}" y="${y + 3.6 * SC}" text-anchor="middle" font-size="${10 * SC}" fill="var(--bg)" font-family="Marcellus, Georgia, serif">${n}</text>`;
}
function diagram({ items, shared }) {
  const W = 720, H = 380, sp = state.space, p = P();
  const ids = ordered(state.deities);
  const lowIds = (sp === "sill" || sp === "shelf" || sp === "table" || sp === "room") ? ids.filter((id) => p.rules && p.rules.low.includes(id)) : [];
  const mainIds = ids.filter((id) => !lowIds.includes(id));
  const surf = { sill: 250, shelf: 230, table: 236, room: 250 }[sp];
  const lowY = 352;
  let g = "";
  // furniture
  if (sp === "sill") {
    g += `<rect x="150" y="30" width="420" height="${surf - 30}" fill="var(--bg)" stroke="var(--wood)" stroke-width="6"/><line x1="360" y1="30" x2="360" y2="${surf}" stroke="var(--wood)" stroke-width="4"/><line x1="150" y1="${(surf + 30) / 2}" x2="570" y2="${(surf + 30) / 2}" stroke="var(--wood)" stroke-width="4"/>`;
    g += `<rect x="120" y="${surf}" width="480" height="14" fill="var(--wood)"/>`;
  } else if (sp === "shelf") {
    g += `<rect x="90" y="${surf}" width="540" height="12" fill="var(--wood)"/><path d="M130 ${surf + 12}l0 26l26 -26M590 ${surf + 12}l0 26l-26 -26" stroke="var(--wood)" stroke-width="5" fill="none"/>`;
  } else {
    const x0 = sp === "room" ? 90 : 70, x1 = sp === "room" ? 630 : 650;
    g += `<rect x="${x0}" y="${surf}" width="${x1 - x0}" height="12" fill="var(--wood)"/><path d="M${x0 + 30} ${surf + 12}V${H - 4}M${x1 - 30} ${surf + 12}V${H - 4}" stroke="var(--wood)" stroke-width="8"/>`;
    g += `<path d="M${x0 + 50} ${surf + 12}h${x1 - x0 - 100}v40l-${(x1 - x0 - 100) / 2} 14l-${(x1 - x0 - 100) / 2} -14z" fill="var(--accent)" opacity=".22"/>`;
    if (sp === "room") g += `<rect x="70" y="58" width="580" height="2" fill="var(--wood)" opacity=".6"/>`;
  }
  if (lowIds.length) {
    const lx = sp === "sill" ? 600 : 640;
    g += `<rect x="${lx - 50}" y="${lowY}" width="100" height="10" fill="var(--wood)" opacity=".9"/><text x="${lx}" y="${lowY + 14 + 10 * SC}" text-anchor="middle" font-size="${11 * SC}" fill="var(--muted)" font-family="Marcellus SC, Georgia, serif" letter-spacing="1">KEPT LOW</text>`;
  }
  // zones
  const left = sp === "sill" ? 170 : 110, right = sp === "sill" ? 550 : 610;
  const zw = mainIds.length ? (right - left) / mainIds.length : 0;
  const showSigils = sp === "table" || sp === "room";
  mainIds.forEach((id, zi) => {
    const zx = left + zw * zi, cx = zx + zw / 2;
    const sig = items.find((it) => it.who === id && it.t.startsWith("Sigil"));
    let its = items.filter((it) => it.who === id && it !== sig);
    if (zw < 90 * SC) its = its.slice(0, 1); else if (zw < 150 * SC) its = its.slice(0, 2); else its = its.slice(0, 4);
    if (showSigils) {
      let r = Math.min(30 * SC, zw / 2 - 6);
      let sy = Math.min(sp === "room" ? 100 : 120, surf - 56 * SC - 14 * SC - 24 - r);
      if (sy < r + 6) { r = Math.max(14, (surf - 56 * SC - 14 * SC - 30) / 2); sy = r + 6; }
      g += `<circle cx="${cx}" cy="${sy}" r="${r + 3}" fill="var(--medallion)"/><image href="${sig(id)}" x="${cx - r}" y="${sy - r}" width="${2 * r}" height="${2 * r}"/>`;
      if (sig) g += badge(sig.n, cx + r * .75, sy - r * .75);
      if (zw >= 64) g += `<text x="${cx}" y="${sy + r + 14 + 6 * SC}" text-anchor="middle" font-size="${(zw < 90 ? 10 : 13) * SC}" fill="var(--ink)" font-family="Marcellus, Georgia, serif">${esc(D(id).name)}</text>`;
    } else if (zw >= 64) {
      g += `<text x="${cx}" y="${surf + 22 + 12 * SC}" text-anchor="middle" font-size="${12 * SC}" fill="var(--ink)" font-family="Marcellus, Georgia, serif">${esc(D(id).name)}</text>`;
    }
    its.forEach((it, i) => {
      const x = zx + zw * (i + 1) / (its.length + 1);
      g += glyph(it.g, x, surf) + badge(it.n, x, surf - 56 * SC);
    });
  });
  if (lowIds.length) {
    const lx = sp === "sill" ? 600 : 640;
    lowIds.forEach((id, k) => {
      const its = items.filter((it) => it.who === id).slice(0, 2);
      its.forEach((it, i) => { const x = lx - 24 * SC + i * 48 * SC + k * 6; g += glyph(it.g, x, lowY) + badge(it.n, x, lowY - 46 * SC); });
    });
  }
  // shared extras on the surface ends
  const ends = shared.filter((s) => s.g === "candle");
  ends.forEach((s) => { g += glyph("candle", left - 30, surf) + badge(s.n, left - 30, surf - 56 * SC); });
  if (!ids.length) g += `<text x="${W / 2}" y="${surf - 40}" text-anchor="middle" font-size="16" fill="var(--muted)" font-family="EB Garamond, Georgia, serif" font-style="italic">Choose a god to begin</text>`;
  const top = sp === "shelf" ? surf - 70 * SC - 20 : sp === "sill" && SC > 1 ? 20 : 0;
  const bottom = lowIds.length || sp === "table" || sp === "room" ? H : surf + 30 + 20 * SC;
  return `<svg viewBox="0 ${top} ${W} ${bottom - top}" role="img" aria-label="Layout of your altar">${g}</svg>`;
}

/* ---------- Practice ---------- */
function pairsFor(ids) { return (P().pairs || []).filter((x) => ids.includes(x.a) && ids.includes(x.b)); }
function practiceSteps() {
  const p = P(); const ids = ordered(state.deities); const r = p.rules || {};
  const hasFirst = r.first && ids.includes(r.first) && ids.length > 1;
  const others = hasFirst ? ids.filter((x) => x !== r.first) : ids;
  const callOrder = hasFirst ? [r.first, ...others] : ids;
  const nm = (id) => D(id).name;
  const steps = [];
  const dur = state.duration;
  if (dur === "once") {
    if (hasFirst) steps.push({ when: "Open", html: `${src("hist")} Turn first to ${nm(r.first)}, then to the others.` });
    callOrder.forEach((id) => steps.push({ when: nm(id), html: `${tz(D(id).quick, D(id).ch)} ${src("book")}` }));
    if (hasFirst) steps.push({ when: "Close", html: `End with ${nm(r.first)}. ${src("hist")}` });
    return steps;
  }
  const sitting = () => {
    const s = [];
    s.push({ when: "Prepare", html: `Set out or refresh the objects on your altar${state.deities.includes("hestia") ? " and light Hestia's candle" : ""}. ${src("draft")}` });
    s.push({ when: "Open", html: hasFirst ? `${tz(r.firstText, 1)} Say her invocation first. ${src("hist")}` : `Stand or sit before the altar for a few breaths before you speak. ${src("draft")}` });
    callOrder.forEach((id) => {
      if (hasFirst && id === r.first) return;
      const d = D(id);
      s.push({ when: d.name, html: `<blockquote>${tz(d.invocation, d.ch)}<cite>Invocation, chapter ${d.ch} ${src("book")}</cite></blockquote><div>Then: ${tz(d.quick, d.ch)} ${src("book")}</div>` });
    });
    if (!hasFirst && ids.length === 1) {}
    s.push({ when: "Reflect", html: ids.map((id) => `<div><span class="who">${esc(nm(id))}</span>${tz(D(id).reflect.quick, D(id).ch)} ${src("book")}</div>`).join("") });
    s.push({ when: "Close", html: hasFirst ? `Return to Hestia last, and blow out her candle. ${src("hist")}` : `Thank each god by name and step away. ${src("draft")}` });
    return s;
  };
  if (dur === "sitting") {
    const s = sitting();
    if (hasFirst) { const h = D(r.first); s.splice(1, 1, { when: "Open", html: `${tz(r.firstText, 1)} ${src("hist")}<blockquote>${tz(h.invocation, h.ch)}<cite>Invocation, chapter ${h.ch} ${src("book")}</cite></blockquote>` }); }
    return s;
  }
  if (dur === "week") {
    steps.push({ id: "w1", when: "Day 1", html: `Set up the altar as shown above, then do one full sitting: ${callOrder.map(nm).join(", ")}. ${src("draft")}` });
    for (let i = 2; i <= 6; i++) {
      const id = callOrder[(i - 2) % callOrder.length];
      steps.push({ id: "w" + i, when: "Day " + i, html: `The short practice for each god${hasFirst ? ", Hestia first and last" : ""}. Today's reflection, for ${esc(nm(id))}: ${tz(D(id).reflect.quick, D(id).ch)} ${src("book")}` });
    }
    steps.push({ id: "w7", when: "Day 7", html: `A full sitting with the deeper reflections. ${src("draft")}` + ids.map((id) => `<div><span class="who">${esc(nm(id))}</span>${tz(D(id).reflect.deeper, D(id).ch)} ${src("book")}</div>`).join("") + `<div>Refresh or clear anything perishable. ${src("draft")}</div>` });
    return steps;
  }
  if (dur === "moon" || dur === "year") {
    const nou = `${src("hist")} The Noumenia, the first day of the lunar month, was kept for private household offerings to the domestic gods, Hestia among them; ancient households burned frankincense before their gods' images. The fuller modern version with honey cakes and goal-setting comes from contemporary revivalist practice, not ancient record.`;
    if (dur === "moon") {
      steps.push({ id: "m0", when: "New moon", html: `Set up or reset the altar and do a full sitting. ${src("draft")}<div class="note">${nou}</div>` });
      steps.push({ id: "m1", when: "Every day", html: `The short practice for each god. ${src("book")}` });
      steps.push({ id: "m2", when: "Each week", html: `Refresh what's perishable; read one god's quick reflection and write a few lines. ${src("draft")}` });
      steps.push({ id: "m3", when: "Full moon", html: `A full sitting with the deeper reflections. ${src("draft")}` + ids.map((id) => `<div><span class="who">${esc(nm(id))}</span>${tz(D(id).reflect.deeper, D(id).ch)} ${src("book")}</div>`).join("") });
      steps.push({ id: "m4", when: "Next new moon", html: `Clear and clean the altar, then begin again or close the practice. ${src("draft")}` });
      return steps;
    }
    steps.push({ id: "y0", when: "Each new moon", html: `Reset the altar and do a full sitting. ${src("draft")}<div class="note">${nou}</div>` });
    steps.push({ id: "y1", when: "Every day", html: `The short practice for each god. ${src("book")}` });
    steps.push({ id: "y2", when: "Festival seasons", html: `In each god's festival season, listed below, re-dress their part of the altar and do a full sitting with the deeper reflection. ${src("draft")}` });
    return steps;
  }
  return steps;
}
function festivals() {
  const ids = ordered(state.deities); const out = [];
  ids.forEach((id) => D(id).fest.forEach((f) => out.push({ ...f, who: D(id).name })));
  return out.sort((a, b) => (a.m == null ? 99 : a.m) - (b.m == null ? 99 : b.m));
}

/* ---------- Plan ---------- */
function planKey() { return [state.pantheon, ordered(state.deities).join("+"), state.space, state.duration].join("|"); }
function renderPlan() {
  const p = P(); const ids = ordered(state.deities);
  if (!ids.length) {
    $("plan").innerHTML = `<div><div class="caps" style="color:var(--accent)">Your altar</div><h2>Nothing chosen yet</h2><p class="meta">Choose one or more gods on the left and the altar, its upkeep and its practice will appear here.</p></div><div class="diagram">${diagram({ items: [], shared: [] })}</div>`;
    return;
  }
  const sp = SPACES.find((s) => s.id === state.space), du = DURATIONS.find((t) => t.id === state.duration);
  const need = NEEDS.find((n) => n.id === state.need);
  const contents = altarItems();
  const names = ids.map((id) => D(id).name);
  const title = names.length <= 3 ? names.join(" · ") : `${names.length} gods of the ${p.name} pantheon`;
  const r = p.rules || {};
  let h = `<div><div class="caps" style="color:var(--accent)">${state.example ? "Example altar · change anything" : "Your altar"}</div><h2>${esc(title)}</h2>
    <p class="meta"><button class="linkbtn backlink" id="backBtn">Change choices</button> <span class="backlink">· </span>${esc(sp.label)} · ${esc(du.label)}${need ? ` · <span class="intent">for ${esc(need.label.toLowerCase())}</span>` : ""}</p></div>`;
  h += `<div class="diagram">${diagram(contents)}</div>`;

  h += `<div class="sec"><h3>On the altar</h3><ol class="items">` +
    [...contents.items, ...contents.shared].map((it) => `<li><span class="n">${it.n}</span><span>${it.who ? `<span class="who">${esc(D(it.who).name)}</span>` : ""}${it.src === "draft" ? esc(it.t) : tz(it.t, it.who ? D(it.who).ch : null)} ${src(it.src)}</span></li>`).join("") + `</ol></div>`;

  const notes = [];
  if (ids.length > 1 && r.first && ids.includes(r.first)) notes.push(`Hestia sits at the center. ${tz(r.firstText, 1)} ${src("hist")}`);
  ids.filter((id) => r.low && r.low.includes(id)).forEach(() => notes.push(`${tz(r.lowText, 6)} ${src("book")}`));
  ids.forEach((id) => { const d = D(id); if (d.altarNote) notes.push(`<span class="who">${esc(d.name)}</span>${tz(d.altarNote, d.ch)} ${src("book")}`); });
  pairsFor(ids).forEach((x) => notes.push(`<span class="who">${esc(D(x.a).name)} &amp; ${esc(D(x.b).name)}</span>${tz(x.text)} ${src("book")}`));
  if (notes.length) h += `<div class="sec"><h3>Arranging it</h3><ul class="list">${notes.map((n) => `<li>${n}</li>`).join("")}</ul></div>`;

  const up = [];
  ids.forEach((id) => D(id).upkeep.forEach((u) => up.push(`<span class="who">${esc(D(id).name)}</span>${tz(u, D(id).ch)} ${src("book")}`)));
  SPACE_UPKEEP[state.space].forEach((u) => up.push(`${esc(u)} ${src("draft")}`));
  h += `<div class="sec"><h3>Keeping it</h3><ul class="list">${up.map((n) => `<li>${n}</li>`).join("")}</ul></div>`;

  const key = planKey(); const prog = state.progress[key] || {};
  const steps = practiceSteps();
  h += `<div class="sec"><h3>The practice</h3><div class="timeline">` + steps.map((s) => {
    const done = s.id && prog[s.id];
    const head = s.id ? `<label><input type="checkbox" id="chk-${s.id}" data-step="${s.id}" ${done ? "checked" : ""}><span>Mark done</span></label>` : "";
    return `<div class="tl${done ? " done" : ""}"><div class="when">${esc(s.when)}</div><div class="what">${s.html}${head}</div></div>`;
  }).join("") + `</div></div>`;

  if (state.duration === "sitting" || state.duration === "year") {
    h += `<div class="sec"><h3>Ancient hymns to read aloud</h3>` + ids.map((id) => { const d = D(id); return `<blockquote>${tz(d.hymn.text, d.ch)}<cite>${esc(d.hymn.src)}, quoted in chapter ${d.ch} ${src("hist")}</cite></blockquote>`; }).join("") + `</div>`;
  }
  if (state.duration === "moon" || state.duration === "year") {
    h += `<div class="sec"><h3>Ancient festival seasons</h3><p class="hint">Historical observances documented in the book, with rough modern months. They describe what was done then; how you mark them is yours. ${src("hist")}</p><div class="cal">` +
      festivals().map((f) => `<div><b>${esc(f.who)}</b>${esc(f.n)}<br><span style="color:var(--muted)">${VIEW === "free" ? lockTag() : esc(f.when)}</span></div>`).join("") + `</div></div>`;
  }
  h += `<div class="actions"><button class="btn" id="saveBtn">Save this altar</button><button class="btn ghost" id="copyBtn">Copy as text</button><span class="toast" id="toast" role="status"></span></div>`;
  h += `<div class="key"><span>${src("book")} the book's practice</span><span>${src("hist")} ancient practice from the book</span><span>${src("draft")} app structure, for review</span></div>`;
  $("plan").innerHTML = h;
}

function planText() {
  const ids = ordered(state.deities); const { items, shared } = altarItems();
  const sp = SPACES.find((s) => s.id === state.space), du = DURATIONS.find((t) => t.id === state.duration);
  const tmp = document.createElement("div");
  const strip = (html) => { tmp.innerHTML = html; tmp.querySelectorAll(".src").forEach((e) => e.remove()); return tmp.textContent.replace(/\s+/g, " ").trim(); };
  let t = `${ids.map((id) => D(id).name).join(", ")}\n${sp.label} · ${du.label}\n\nON THE ALTAR\n`;
  [...items, ...shared].forEach((it) => { t += `${it.n}. ${it.who ? D(it.who).name + ": " : ""}${it.src === "draft" ? it.t : strip(tz(it.t, it.who ? D(it.who).ch : null))}\n`; });
  t += `\nTHE PRACTICE\n`;
  practiceSteps().forEach((s) => { t += `${s.when}: ${strip(s.html)}\n`; });
  t += `\nFrom Hearth to Ecstasy, T. Smith`;
  return t;
}

/* ---------- Saved altars ---------- */
function renderSaved() {
  const list = acct.saved;
  $("savedHint").textContent = acct.user ? "Saved to your account, on every device you sign in on." : "Saved altars stay in this browser on this device. Sign in to keep them on every device.";
  $("saved").innerHTML = list.length ? list.map((a, i) => `<div class="saved-row"><span>${esc(a.name)}</span><span style="display:flex;gap:12px"><button class="linkbtn" data-load="${i}">Open</button><button class="linkbtn" data-del="${i}">Remove</button></span></div>`).join("")
    : `<p class="empty">No saved altars yet. Use "Save this altar" under your plan.</p>`;
}
function toast(msg) { const t = $("toast"); if (t) { t.textContent = msg; setTimeout(() => { if (t) t.textContent = ""; }, 2600); } }

/* ---------- Profile dialog ---------- */
function openProfile(id) {
  const d = D(id);
  $("profileBody").innerHTML = `<div class="dlg-head"><span class="med"><img src="${sig(id)}" alt=""></span><div><div class="caps" style="color:var(--accent)">Chapter ${d.ch} · ${esc(d.pron)}</div><h2>${esc(d.name)}</h2></div><button class="btn ghost" id="closeDlg">Close</button></div>
    <p style="font-style:italic">${tz(d.line, d.ch)}</p>
    <dl><dt>Domain</dt><dd>${esc(d.domain)}</dd><dt>Animal</dt><dd>${esc(d.animal)}</dd><dt>Plant</dt><dd>${esc(d.plant)}</dd><dt>Symbol</dt><dd>${esc(d.symbol)}</dd><dt>Asked for</dt><dd>${esc(d.asked)}</dd><dt>Sigil</dt><dd>${tz(d.sigil, d.ch)}</dd></dl>
    <blockquote>${tz(d.invocation, d.ch)}<cite>Invocation ${src("book")}</cite></blockquote>`;
  const dlg = $("profile");
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  $("closeDlg").onclick = () => dlg.close ? dlg.close() : dlg.removeAttribute("open");
}

/* ---------- Events ---------- */
function renderJump() {
  const ids = ordered(state.deities); const j = $("jump");
  j.innerHTML = ids.length ? `<span class="sig">${ids.slice(0, 4).map((id) => `<img src="${sig(id)}" alt="">`).join("")}</span><span class="lbl">See my altar</span>` : `<span class="lbl" style="margin-left:8px">Choose a god to begin</span>`;
  j.disabled = !ids.length;
  updateJump();
}
let planVisible = false;
function updateJump() { $("jump").hidden = planVisible || window.innerWidth >= 1000; }
function setScale() { const s = window.innerWidth < 600 ? 1.7 : 1; if (s !== SC) { SC = s; return true; } return false; }
function rerender() { setScale(); renderPantheons(); renderNeeds(); renderDeities(); renderOptions(); renderPlan(); renderJump(); }
function touch() { state.example = false; }
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.p) { state.pantheon = b.dataset.p; state.deities = []; state.need = null; applyTheme(); touch(); rerender(); return; }
  if (b.dataset.need) { state.need = state.need === b.dataset.need ? null : b.dataset.need; touch(); rerender(); return; }
  if (b.dataset.d) { const id = b.dataset.d; state.deities = state.deities.includes(id) ? state.deities.filter((x) => x !== id) : [...state.deities, id]; touch(); rerender(); return; }
  if (b.dataset.s) { state.space = b.dataset.s; touch(); rerender(); return; }
  if (b.dataset.t) { state.duration = b.dataset.t; touch(); rerender(); return; }
  if (b.dataset.acct) { accountAction(b.dataset.acct, b); return; }
  if (b.id === "jump") { $("planBox").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
  if (b.id === "backBtn") { $("s1").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (b.dataset.info) { openProfile(b.dataset.info); return; }
  if (b.dataset.clear) { state.deities = []; touch(); rerender(); return; }
  if (b.id === "saveBtn") {
    const sp = SPACES.find((s) => s.id === state.space), du = DURATIONS.find((t) => t.id === state.duration);
    const name = `${ordered(state.deities).map((id) => D(id).name).join(" · ")}, ${sp.label.toLowerCase()}, ${du.label.toLowerCase()}`;
    const ok = await saveAltar({ name, s: { pantheon: state.pantheon, need: state.need, deities: state.deities, space: state.space, duration: state.duration }, progress: state.progress[planKey()] || {} });
    toast(ok ? (acct.user ? "Saved to your account." : "Saved in this browser.") : "Couldn't save just now. Copy the plan as text instead.");
    renderSaved(); return;
  }
  if (b.id === "copyBtn") {
    const text = planText();
    try { await navigator.clipboard.writeText(text); toast("Copied."); }
    catch (err) { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Copied."); } catch (e2) { toast("Couldn't copy here."); } ta.remove(); }
    return;
  }
  if (b.dataset.load) { const a = acct.saved[+b.dataset.load]; if (a) { Object.assign(state, a.s, { example: false }); state.progress[planKey()] = a.progress || {}; applyTheme(); rerender(); } return; }
  if (b.dataset.del) {
    if (b.dataset.confirm) { await removeAltar(+b.dataset.del); renderSaved(); }
    else { b.dataset.confirm = "1"; b.textContent = "Tap again to remove"; }
    return;
  }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest("input[data-step]"); if (!c) return;
  const key = planKey(); state.progress[key] = state.progress[key] || {}; state.progress[key][c.dataset.step] = c.checked;
  saveProgress(key, state.progress[key], (s) => s && [s.pantheon, ordered(s.deities || []).join("+"), s.space, s.duration].join("|") === key);
  c.closest(".tl").classList.toggle("done", c.checked);
});

/* ---------- Content and account ---------- */
async function loadContent() {
  VIEW = acct.member ? "full" : "free";
  try { PANTHEONS = await fetchContent(); }
  catch (e) { PANTHEONS = []; }
  if (!PANTHEONS.length) { $("main").innerHTML = `<p class="empty">The altar library couldn't load. Check your connection and refresh the page.</p>`; throw new Error("no content"); }
  if (!P()) state.pantheon = PANTHEONS.find((p) => p.status === "ready").id;
  state.deities = state.deities.filter((id) => D(id));
}
// Signing in or out, or a membership starting, changes what text is shown and where altars are saved.
async function refresh() {
  renderBand();
  await loadContent(); applyTheme(); rerender(); await loadSaved(); renderSaved();
}

/* Open with a god preselected when the link ends in #hestia, #athena, etc. */
(async function init() {
  await startAccount(refresh);
  await loadContent();
  state.progress = localProgress();
  const h = (location.hash || "").slice(1).toLowerCase();
  if (h && P().deities.some((d) => d.id === h)) { state.deities = [h]; state.example = false; }
  applyTheme(); rerender(); await loadSaved(); renderSaved();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { planVisible = es[0].isIntersecting; updateJump(); }, { threshold: 0 }).observe($("planBox"));
  }
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (setScale()) renderPlan(); updateJump(); }, 150); });
})();
