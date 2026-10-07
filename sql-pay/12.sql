-- الدفع وإنهاء التكسي (12 من 39): المدير: تعطيل بطاقة
drop function if exists public.admin_disable_topup_card(text);
create or replace function public.admin_disable_topup_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c topup_cards;
begin
  if not public._is_admin() then raise exception 'NOT_ALLOWED'; end if;
  select * into c from topup_cards where code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g') for update;
  if c.code is null then raise exception 'CARD_INVALID'; end if;
  if c.status = 'used' then raise exception 'CARD_USED'; end if;
  update topup_cards set status = 'disabled' where code = c.code;
  return jsonb_build_object('code', c.code, 'amount', c.amount);
end; $$;
grant execute on function public.admin_disable_topup_card(text) to authenticated;
