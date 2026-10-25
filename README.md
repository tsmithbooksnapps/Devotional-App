# Devotional App

Companion app to T. Smith's devotional books, starting with *From Hearth to Ecstasy: A Devotional History of the Greek Gods*. Readers design a personal altar for one or several gods, from a single object on a windowsill to a dedicated space, and follow a practice to keep it.

## What's here

| Path | What it is |
| --- | --- |
| `preview/altar.html` | The current single-page preview (everything inline). Built from `altar-template.html` + `sigils.json`. |
| `supabase/migrations/` | Database tables and row-level security. Book text is readable only by active members; everyone else gets teasers (first 7 words). |
| `supabase/seed.sql` | The Greek pantheon's content. Safe to rerun. |
| `supabase/functions/create-checkout` | Stripe Checkout for monthly, 6-month and yearly plans. |
| `supabase/functions/stripe-webhook` | Keeps `memberships` in step with Stripe. |
| `sigils/greek/` | The 14 sigils, for the public `sigils` storage bucket. |
| `tools/` | Regenerates `seed.sql` from the preview's data. |

## Membership

Free: choose gods, explore by need, altar layouts, practice structure, teasers. Members: full book text, all spaces and lengths, saved altars across devices, tracking, new pantheons. Plans: weekly (app stores only), monthly, 6-month, yearly. No free trial.

## Content rules

Every passage is tagged Book (from the book), History (ancient practice the book documents) or Draft (app structure, for the author's review). Never present app-written text as the book's.

## Secrets

Set in Supabase, never committed: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_SIX_MONTH`, `STRIPE_PRICE_YEARLY`, `APP_ORIGIN`.
