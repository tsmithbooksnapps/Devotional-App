// Receives Stripe subscription events and keeps public.memberships in step.
// Deploy with --no-verify-jwt: Stripe signs the request instead.
import { admin, stripe } from "../_shared/stripe.ts";
import type Stripe from "npm:stripe@17.7.0";

const STATUS: Record<string, string> = {
  active: "active", trialing: "trialing", past_due: "past_due",
  canceled: "canceled", unpaid: "expired", incomplete_expired: "expired", incomplete: "expired", paused: "expired",
};

async function save(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  if (!userId) return;
  const item = sub.items.data[0];
  const periodEnd = (item as unknown as { current_period_end?: number }).current_period_end
    ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const { error } = await admin.from("memberships").upsert({
    user_id: userId,
    status: STATUS[sub.status] ?? "expired",
    plan: sub.metadata?.plan ?? null,
    source: "stripe",
    external_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await save(event.data.object as Stripe.Subscription);
      break;
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) await save(await stripe.subscriptions.retrieve(s.subscription as string));
      break;
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
