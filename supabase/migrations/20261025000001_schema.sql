-- Hearth & Altar: core schema.
-- Public tables hold what anyone may see (names, At a Glance facts, structure).
-- deity_content and pantheon_pairs hold the book's text and are readable only by active members.
-- Teasers (first words of each passage) are served by public.deity_teasers(), never the full text.

create extension if not exists pgcrypto;

-- ---------- Catalogue (public) ----------
create table public.pantheons (
  id          text primary key,
  name        text not null,
  book        text,
  status      text not null default 'planned' check (status in ('planned', 'ready')),
  theme       jsonb,              -- per-pantheon colour tokens {light:{}, dark:{}}; null = app default
  rules       jsonb,              -- e.g. {first:'hestia', low:['hades']}; wording lives in rules_text below
  sort        int not null default 0
);

create table public.deities (
  id           text primary key,
  pantheon_id  text not null references public.pantheons(id) on delete cascade,
  name         text not null,
  chapter      int,
  pronunciation text,
  short        text,               -- two-to-four word label shown on cards
  domain       text,
  animal       text,
  plant        text,
  symbol       text,
  asked_for    text,
  needs        text[] not null default '{}',
  sigil_path   text,               -- path in the public 'sigils' storage bucket
  sort         int not null default 0
);
create index deities_pantheon_idx on public.deities (pantheon_id, sort);

create table public.needs (
  id    text primary key,
  label text not null,
  sort  int not null default 0
);

-- ---------- Book text (members only) ----------
create table public.deity_content (
  deity_id    text primary key references public.deities(id) on delete cascade,
  line        text,     -- chapter epigraph
  sigil       text,     -- how to draw the sigil
  quick       text,     -- "Short on time?" practice
  invocation  text,
  altar       jsonb not null default '[]',   -- [{t, g}] items; g = drawing glyph
  altar_note  text,
  upkeep      jsonb not null default '[]',   -- [text]
  large       jsonb,                         -- {t, g} symbols for a dedicated space
  reflect     jsonb,                         -- {quick, deeper}
  hymn        jsonb,                         -- {text, src}
  festivals   jsonb not null default '[]'    -- [{n, when, m}]
);

create table public.pantheon_texts (
  pantheon_id text primary key references public.pantheons(id) on delete cascade,
  first_text  text,   -- e.g. "Hestia first, Hestia last..."
  low_text    text
);

create table public.pantheon_pairs (
  pantheon_id text not null references public.pantheons(id) on delete cascade,
  a           text not null references public.deities(id) on delete cascade,
  b           text not null references public.deities(id) on delete cascade,
  text        text not null,
  primary key (a, b)
);

-- ---------- Memberships (written only by the server: Stripe webhook / RevenueCat webhook) ----------
create table public.memberships (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  status             text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  plan               text check (plan in ('weekly', 'monthly', 'six_month', 'yearly')),
  source             text not null check (source in ('stripe', 'apple', 'google')),
  external_id        text,          -- Stripe subscription id or store transaction id
  stripe_customer_id text,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.status in ('active', 'trialing', 'past_due')
      and (m.current_period_end is null or m.current_period_end > now())
  );
$$;

-- ---------- Saved altars (each person sees only their own) ----------
create table public.altars (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  state       jsonb not null,     -- {pantheon, need, deities[], space, duration}
  progress    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index altars_user_idx on public.altars (user_id, updated_at desc);

-- ---------- Row level security ----------
alter table public.pantheons      enable row level security;
alter table public.deities        enable row level security;
alter table public.needs          enable row level security;
alter table public.deity_content  enable row level security;
alter table public.pantheon_texts enable row level security;
alter table public.pantheon_pairs enable row level security;
alter table public.memberships    enable row level security;
alter table public.altars         enable row level security;

create policy "catalogue is public" on public.pantheons for select using (true);
create policy "catalogue is public" on public.deities   for select using (true);
create policy "catalogue is public" on public.needs     for select using (true);

create policy "members read book text" on public.deity_content  for select to authenticated using (public.is_member());
create policy "members read book text" on public.pantheon_texts for select to authenticated using (public.is_member());
create policy "members read book text" on public.pantheon_pairs for select to authenticated using (public.is_member());

create policy "see own membership" on public.memberships for select to authenticated using (user_id = auth.uid());
-- no insert/update policies: only the service role (webhooks) writes memberships

create policy "own altars" on public.altars for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Teasers for everyone ----------
create or replace function public.tease(t text, n int default 7)
returns text language sql immutable as $$
  select case when t is null then null
              when array_length(regexp_split_to_array(trim(t), '\s+'), 1) <= n then t
              else array_to_string((regexp_split_to_array(trim(t), '\s+'))[1:n], ' ') || '…' end;
$$;

create or replace function public.deity_teasers(p_pantheon text)
returns table (deity_id text, chapter int, line text, sigil text, quick text, invocation text,
               altar jsonb, altar_note text, upkeep jsonb, reflect jsonb, hymn jsonb, festivals jsonb)
language sql stable security definer set search_path = public
as $$
  select d.id, d.chapter,
         tease(c.line), tease(c.sigil), tease(c.quick), tease(c.invocation),
         (select coalesce(jsonb_agg(jsonb_build_object('t', tease(x->>'t'), 'g', x->>'g')), '[]') from jsonb_array_elements(c.altar) x),
         tease(c.altar_note),
         (select coalesce(jsonb_agg(to_jsonb(tease(x #>> '{}'))), '[]') from jsonb_array_elements(c.upkeep) x),
         jsonb_build_object('quick', tease(c.reflect->>'quick'), 'deeper', tease(c.reflect->>'deeper')),
         jsonb_build_object('text', tease(c.hymn->>'text'), 'src', c.hymn->>'src'),
         (select coalesce(jsonb_agg(jsonb_build_object('n', x->>'n', 'm', x->'m')), '[]') from jsonb_array_elements(c.festivals) x)
  from public.deities d join public.deity_content c on c.deity_id = d.id
  where d.pantheon_id = p_pantheon
  order by d.sort;
$$;
grant execute on function public.deity_teasers(text) to anon, authenticated;
grant execute on function public.is_member() to authenticated;

-- keep altars.updated_at current
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger altars_touch before update on public.altars for each row execute function public.touch_updated_at();
