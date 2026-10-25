const d = require('./data.js');
const q = (v) => v == null ? 'null' : `$q$${String(v)}$q$`;
const j = (v) => v == null ? 'null' : `$q$${JSON.stringify(v)}$q$::jsonb`;
const arr = (a) => `array[${a.map(q).join(',')}]::text[]`;
let o = "-- Seed: From Hearth to Ecstasy (Greek). Generated from the app's data; rerunnable.\nbegin;\n";
o += d.NEEDS.map((n, i) => `insert into public.needs (id,label,sort) values (${q(n.id)},${q(n.label)},${i}) on conflict (id) do update set label=excluded.label, sort=excluded.sort;`).join('\n') + '\n';
d.PANTHEONS.forEach((p, pi) => {
  o += `insert into public.pantheons (id,name,book,status,theme,rules,sort) values (${q(p.id)},${q(p.name)},${q(p.book)},${q(p.status)},${j(p.theme)},${j(p.rules ? { first: p.rules.first, low: p.rules.low } : null)},${pi}) on conflict (id) do update set name=excluded.name, book=excluded.book, status=excluded.status, theme=excluded.theme, rules=excluded.rules, sort=excluded.sort;\n`;
  if (p.rules) o += `insert into public.pantheon_texts values (${q(p.id)},${q(p.rules.firstText)},${q(p.rules.lowText)}) on conflict (pantheon_id) do update set first_text=excluded.first_text, low_text=excluded.low_text;\n`;
  p.deities.forEach((x, i) => {
    o += `insert into public.deities (id,pantheon_id,name,chapter,pronunciation,short,domain,animal,plant,symbol,asked_for,needs,sigil_path,sort) values (${q(x.id)},${q(p.id)},${q(x.name)},${x.ch},${q(x.pron)},${q(x.short)},${q(x.domain)},${q(x.animal)},${q(x.plant)},${q(x.symbol)},${q(x.asked)},${arr(x.needs)},${q(p.id + '/' + x.id + '.png')},${i}) on conflict (id) do update set name=excluded.name, chapter=excluded.chapter, pronunciation=excluded.pronunciation, short=excluded.short, domain=excluded.domain, animal=excluded.animal, plant=excluded.plant, symbol=excluded.symbol, asked_for=excluded.asked_for, needs=excluded.needs, sigil_path=excluded.sigil_path, sort=excluded.sort;\n`;
    o += `insert into public.deity_content values (${q(x.id)},${q(x.line)},${q(x.sigil)},${q(x.quick)},${q(x.invocation)},${j(x.altar)},${q(x.altarNote)},${j(x.upkeep)},${j(x.large)},${j(x.reflect)},${j(x.hymn)},${j(x.fest)}) on conflict (deity_id) do update set line=excluded.line, sigil=excluded.sigil, quick=excluded.quick, invocation=excluded.invocation, altar=excluded.altar, altar_note=excluded.altar_note, upkeep=excluded.upkeep, large=excluded.large, reflect=excluded.reflect, hymn=excluded.hymn, festivals=excluded.festivals;\n`;
  });
  (p.pairs || []).forEach((r) => o += `insert into public.pantheon_pairs values (${q(p.id)},${q(r.a)},${q(r.b)},${q(r.text)}) on conflict (a,b) do update set text=excluded.text;\n`);
});
o += 'commit;\n';
process.stdout.write(o);
