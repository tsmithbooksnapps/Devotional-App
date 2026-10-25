// Starts a Stripe Checkout session for the signed-in person and returns its URL.
import { admin, cors, PLAN_PRICES, stripe } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token ?? "");
  if (!user) return json({ error: "Sign in before choosing a plan." }, 401);

  const { plan } = await req.json().catch(() => ({}));
  const price = PLAN_PRICES[plan];
  if (!price) return json({ error: "Choose monthly, 6-month or yearly." }, 400);

  // Reuse the person's Stripe customer so every renewal lands on the same account.
  const { data: existing } = await admin.from("memberships").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  let customer = existing?.stripe_customer_id as string | undefined;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } })).id;
  }

  const origin = Deno.env.get("APP_ORIGIN") ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id, plan } },
    success_url: `${origin}/?joined=1`,
    cancel_url: `${origin}/?checkout=cancelled`,
  });
  return json({ url: session.url });
});
