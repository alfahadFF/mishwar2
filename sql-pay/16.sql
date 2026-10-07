-- الدفع وإنهاء التكسي (16 من 39): تنسيق المبالغ
create or replace function public._amt(p numeric)
returns text language sql immutable as $$ select rtrim(rtrim(round(coalesce(p, 0), 2)::text, '0'), '.') $$;
