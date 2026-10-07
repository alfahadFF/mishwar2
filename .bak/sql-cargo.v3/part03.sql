-- الجزء 3 من 14 — جدول نسب العمولة

create table if not exists public.service_commissions (
  service text primary key,
  rate numeric(5,4) not null check (rate >= 0 and rate <= 0.5)
);

insert into public.service_commissions(service, rate) values
  ('cargo', 0.12), ('taxi', 0.12), ('taxi_shared', 0.12), ('rental', 0.12), ('contracts', 0.12), ('events', 0.12)
on conflict (service) do update set rate = excluded.rate;

alter table public.service_commissions enable row level security;

drop policy if exists "commissions_select_all" on public.service_commissions;

create policy "commissions_select_all" on public.service_commissions for select using (true);
