import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });

// Service-role client: bypasses row level security, so it only runs inside these functions.
export const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Web plans. Weekly is sold only in the app stores (Stripe's fixed 30c fee is too large on $1.99).
export const PLAN_PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY"),
  six_month: Deno.env.get("STRIPE_PRICE_SIX_MONTH"),
  yearly: Deno.env.get("STRIPE_PRICE_YEARLY"),
};

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
