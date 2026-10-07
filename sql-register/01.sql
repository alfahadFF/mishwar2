-- التسجيل (1 من 4): البلد ووقت الموافقة على الشروط + قراءة رقم الهاتف
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- يقبل الرقم مع المفتاح الدولي أو بدونه، ومع الصفر أو بدونه، ويحدد البلد من الرقم نفسه
create or replace function public._parse_phone(p_raw text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare d text; n text; cc text; intl boolean := false; r record;
begin
  d := translate(coalesce(p_raw, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '[^0-9+]', '', 'g');
  if d like '+%' then d := substr(d, 2); intl := true;
  elsif d like '00%' then d := substr(d, 3); intl := true; end if;
  if position('+' in d) > 0 or d = '' then return null; end if;
  for r in select * from (values ('963', 'SY', '^9[0-9]{8}$'), ('962', 'JO', '^7[789][0-9]{7}$'),
                                 ('964', 'IQ', '^7[3-9][0-9]{8}$'), ('961', 'LB', '^(3[0-9]{6}|7[01689][0-9]{6}|81[0-9]{6})$')) t(code, ctry, pat)
  loop
    if d like r.code || '%' then
      n := substr(d, 4);
      if n like '0%' then n := substr(n, 2); end if;
      if n ~ r.pat then return jsonb_build_object('phone', '+' || r.code || n, 'country', r.ctry); end if;
    end if;
  end loop;
  if intl then return null; end if;
  n := case when d like '0%' then substr(d, 2) else d end;
  for r in select * from (values ('963', 'SY', '^9[0-9]{8}$'), ('962', 'JO', '^7[789][0-9]{7}$'),
                                 ('964', 'IQ', '^7[3-9][0-9]{8}$'), ('961', 'LB', '^(3[0-9]{6}|7[01689][0-9]{6}|81[0-9]{6})$')) t(code, ctry, pat)
  loop
    if n ~ r.pat then return jsonb_build_object('phone', '+' || r.code || n, 'country', r.ctry); end if;
  end loop;
  return null;
end;
$$;
