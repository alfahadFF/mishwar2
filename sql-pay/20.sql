-- الدفع وإنهاء التكسي (20 من 39): خصم 3% وعمولة التكسي 12%
insert into public.app_settings(key, value) values ('wallet_pay_discount_pct', '3')
  on conflict (key) do update set value = excluded.value;

insert into public.service_commissions(service, rate) values ('taxi', 0.12)
  on conflict (service) do update set rate = excluded.rate;
