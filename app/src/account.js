// Accounts, membership, content loading and saved altars, all through Supabase.
// The book's full text only ever reaches members: row level security serves it,
// and everyone else gets the 7-word teasers from public.deity_teasers().
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// Shared, mutable state that main.js reads (import bindings can't be reassigned, object fields can).
export const acct = { user: null, member: false, plan: null, saved: [], offline: false };

const LOCAL = "altars.v1";
const local = {
  get() { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch (e) { return []; } },
  set(v) { try { localStorage.setItem(LOCAL, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Web plans. Weekly is sold only in the app stores. Prices still need Tiana's confirmation.
const PLANS = [
  { id: "monthly", label: "Monthly", price: "$4.99", per: "a month" },
  { id: "six_month", label: "6 months", price: "$24.99", per: "every 6 months" },
  { id: "yearly", label: "Yearly", price: "$39.99", per: "a year", best: true }
];

let onChange = () => {};

async function readMembership() {
  acct.member = false; acct.plan = null;
  if (!acct.user) return;
  const { data } = await supabase.from("memberships").select("status, plan, current_period_end").eq("user_id", acct.user.id).maybeSingle();
  if (!data) return;
  const live = ["active", "trialing", "past_due"].includes(data.status) && (!data.current_period_end || new Date(data.current_period_end) > new Date());
  acct.member = live; acct.plan = data.plan;
}

export async function startAccount(changed) {
  onChange = changed || onChange;
  try {
    const { data } = await supabase.auth.getSession();
    acct.user = data.session?.user ?? null;
    await readMembership();
  } catch (e) { acct.offline = true; }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") newPasswordForm();
    const before = acct.user?.id;
    acct.user = session?.user ?? null;
    if (before === acct.user?.id && event !== "USER_UPDATED") return;
    await readMembership(); await loadSaved(); onChange();
  });
  const q = new URLSearchParams(location.search);
  if (q.has("joined")) await waitForMembership();
  renderBand();
}

// After Stripe checkout the webhook may land a few seconds after the redirect.
async function waitForMembership() {
  for (let i = 0; i < 8 && acct.user && !acct.member; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    await readMembership();
  }
  history.replaceState(null, "", location.pathname + location.hash);
}

/* ---------- Content ---------- */
export async function loadContent() {
  const [p, d] = await Promise.all([
    supabase.from("pantheons").select("*").order("sort"),
    supabase.from("deities").select("*").order("sort")
  ]);
  if (p.error || d.error) throw p.error || d.error;
  const ready = p.data.filter((x) => x.status === "ready").map((x) => x.id);

  let content = [], texts = [], pairs = [];
  if (acct.member) {
    const r = await Promise.all([
      supabase.from("deity_content").select("*"),
      supabase.from("pantheon_texts").select("*"),
      supabase.from("pantheon_pairs").select("*")
    ]);
    content = r[0].data || []; texts = r[1].data || []; pairs = r[2].data || [];
  } else {
    const r = await Promise.all(ready.map((id) => supabase.rpc("deity_teasers", { p_pantheon: id })));
    content = r.flatMap((x) => x.data || []);
  }
  const byDeity = Object.fromEntries(content.map((c) => [c.deity_id, c]));

  return p.data.map((pa) => {
    const t = texts.find((x) => x.pantheon_id === pa.id);
    return {
      id: pa.id, name: pa.name, book: pa.book, status: pa.status, theme: pa.theme,
      rules: pa.rules ? { ...pa.rules, low: pa.rules.low || [], firstText: t?.first_text ?? null, lowText: t?.low_text ?? null } : null,
      pairs: pairs.filter((x) => x.pantheon_id === pa.id),
      deities: d.data.filter((x) => x.pantheon_id === pa.id).map((x) => {
        const c = byDeity[x.id] || {};
        return {
          id: x.id, name: x.name, ch: x.chapter, pron: x.pronunciation, short: x.short, domain: x.domain,
          animal: x.animal, plant: x.plant, symbol: x.symbol, asked: x.asked_for, needs: x.needs || [],
          line: c.line, sigil: c.sigil, quick: c.quick, invocation: c.invocation,
          altar: c.altar || [], altarNote: c.altar_note, upkeep: c.upkeep || [], large: c.large || null,
          reflect: c.reflect || {}, hymn: c.hymn || {}, fest: c.festivals || []
        };
      })
    };
  });
}

/* ---------- Saved altars ---------- */
export async function loadSaved() {
  if (!acct.user) { acct.saved = local.get(); return; }
  const { data, error } = await supabase.from("altars").select("id, name, state, progress").order("updated_at", { ascending: false });
  acct.saved = error ? [] : data.map((a) => ({ id: a.id, name: a.name, s: a.state, progress: a.progress }));
}

export async function saveAltar(a) {
  if (!acct.user) { const l = local.get(); l.unshift(a); acct.saved = l; return local.set(l); }
  const { data, error } = await supabase.from("altars").insert({ name: a.name, state: a.s, progress: a.progress }).select("id").single();
  if (error) return false;
  acct.saved.unshift({ ...a, id: data.id });
  return true;
}

export async function removeAltar(i) {
  const a = acct.saved[i]; if (!a) return;
  if (acct.user && a.id) await supabase.from("altars").delete().eq("id", a.id);
  acct.saved.splice(i, 1);
  if (!acct.user) local.set(acct.saved);
}

// Progress ticks are kept per plan in this browser, and copied onto any saved altar with the same plan.
export function saveProgress(key, progress, matches) {
  try { const all = JSON.parse(localStorage.getItem("progress.v1")) || {}; all[key] = progress; localStorage.setItem("progress.v1", JSON.stringify(all)); } catch (e) {}
  acct.saved.forEach((a) => {
    if (!matches(a.s)) return;
    a.progress = progress;
    if (acct.user && a.id) supabase.from("altars").update({ progress }).eq("id", a.id).then(() => {});
  });
  if (!acct.user) local.set(acct.saved);
}
export function localProgress() { try { return JSON.parse(localStorage.getItem("progress.v1")) || {}; } catch (e) { return {}; } }

/* ---------- Account band and dialog ---------- */
export function renderBand() {
  const text = $("acctText"), act = $("acctActions"); if (!text) return;
  if (acct.offline) { text.textContent = "Can't reach your account right now. Showing the free view."; act.innerHTML = ""; return; }
  if (!acct.user) {
    text.textContent = "Free view: book passages show their opening words. Members read the full text.";
    act.innerHTML = `<button class="btn" data-acct="plans">Become a member</button><button class="btn ghost" data-acct="signin">Sign in</button>`;
  } else if (!acct.member) {
    text.textContent = `Signed in as ${acct.user.email}. Free view.`;
    act.innerHTML = `<button class="btn" data-acct="plans">Become a member</button><button class="btn ghost" data-acct="signout">Sign out</button>`;
  } else {
    text.textContent = `Member, signed in as ${acct.user.email}.`;
    act.innerHTML = `<button class="btn ghost" data-acct="signout">Sign out</button>`;
  }
}

function dialog(html) {
  $("accountBody").innerHTML = `<div class="dlg-head"><div><h2>${html.title}</h2></div><button class="btn ghost" data-acct="close">Close</button></div>${html.body}`;
  const d = $("account");
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
}
const close = () => { const d = $("account"); d.close ? d.close() : d.removeAttribute("open"); };
const msg = (t) => { const m = $("acctMsg"); if (m) m.textContent = t; };

function signinForm(mode, next) {
  const up = mode === "signup";
  dialog({
    title: up ? "Create your account" : "Sign in",
    body: `<form class="form" id="acctForm">
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Password<input type="password" name="password" autocomplete="${up ? "new-password" : "current-password"}" minlength="8" required></label>
      <p class="hint" id="acctMsg" role="status"></p>
      <div class="acct-actions"><button class="btn" type="submit">${up ? "Create account" : "Sign in"}</button>
      <button class="btn ghost" type="button" data-acct="${up ? "signin" : "signup"}" data-next="${next || ""}">${up ? "I already have an account" : "Create an account"}</button>
      ${up ? "" : `<button class="linkbtn" type="button" data-acct="reset">Forgot password?</button>`}</div></form>`
  });
  $("acctForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), email = f.get("email"), password = f.get("password");
    msg(up ? "Creating your account…" : "Signing in…");
    const { data, error } = up
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) { msg(error.message); return; }
    if (up && !data.session) { msg("Check your email for a link to confirm your account, then sign in."); return; }
    acct.user = data.user; await readMembership(); renderBand();
    if (next === "plans" && !acct.member) plans(); else close();
  };
}

// Reached from the reset-password email link.
function newPasswordForm() {
  dialog({
    title: "Choose a new password",
    body: `<form class="form" id="acctForm"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
      <p class="hint" id="acctMsg" role="status"></p><div class="acct-actions"><button class="btn" type="submit">Save password</button></div></form>`
  });
  $("acctForm").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: new FormData(e.target).get("password") });
    if (error) msg(error.message); else close();
  };
}

function plans() {
  if (!acct.user) { signinForm("signup", "plans"); return; }
  dialog({
    title: "Become a member",
    body: `<p>Members read the book's full passages, longer plans, and every pantheon as it's added. Saved altars follow you to every device.</p>
      <div class="plans">${PLANS.map((p) => `<button class="plan${p.best ? " best" : ""}" data-acct="buy" data-plan="${p.id}"><b>${p.label}</b><span>${p.price} ${p.per}</span>${p.best ? "<small>Best value</small>" : ""}</button>`).join("")}</div>
      <p class="hint" id="acctMsg" role="status">Payment is handled by Stripe. Cancel any time.</p>`
  });
}

async function buy(plan) {
  msg("Opening secure checkout…");
  const { data, error } = await supabase.functions.invoke("create-checkout", { body: { plan } });
  if (error || !data?.url) { msg("Checkout isn't available yet. Please try again later."); return; }
  location.href = data.url;
}

export async function accountAction(action, button) {
  if (action === "close") return close();
  if (action === "signin" || action === "signup") return signinForm(action, button?.dataset.next);
  if (action === "plans") return plans();
  if (action === "buy") return buy(button.dataset.plan);
  if (action === "reset") {
    const email = $("acctForm")?.email.value;
    if (!email) return msg("Type your email above first.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    return msg(error ? error.message : "If that email has an account, a reset link is on its way.");
  }
  if (action === "signout") { await supabase.auth.signOut(); acct.user = null; acct.member = false; renderBand(); onChange(); }
}
