-- Disposable fixtures: the entire transaction rolls back, including test users.
begin;
insert into auth.users(id,aud,role,email) values
 ('11000000-0000-4000-8000-000000000001','authenticated','authenticated','gift-policy-a@example.invalid'),
 ('11000000-0000-4000-8000-000000000002','authenticated','authenticated','gift-policy-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$declare p jsonb; bad jsonb; key text; begin
 p:='{"version":1,"title":"一封甜甜的信","message":"周末快乐","signature":"小作坊","recipient":"你","template":"picnic","accent":"#dba4a4","cakeName":"测试蛋糕","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","candle":{"x":50,"y":54,"size":5}}';
 assert public.cake_gift_create('21000000-0000-4000-8000-000000000001',p)='21000000-0000-4000-8000-000000000001'::uuid;
 assert public.cake_gift_create('21000000-0000-4000-8000-000000000001',p)='21000000-0000-4000-8000-000000000001'::uuid,'retry must be idempotent';
 assert (select count(*) from public.cake_gift_list())=1,'owner lists gift';
 foreach key in array array['version','title','message','signature','recipient','template','accent','cakeName','image','candle'] loop
  bad:=jsonb_set(p,array[key],'null');
  begin perform public.cake_gift_create('21000000-0000-4000-8000-000000000002',bad);raise exception 'accepted null %',key using errcode='XX001';exception when sqlstate 'P0001' then null;end;
 end loop;
 begin perform public.cake_gift_create('21000000-0000-4000-8000-000000000003',p||'{"owner_id":"hidden"}');raise exception 'extra private fields allowed' using errcode='XX001';exception when sqlstate 'P0001' then null;end;
 begin perform public.cake_gift_create('21000000-0000-4000-8000-000000000001',p||'{"message":"changed"}');raise exception 'immutable gift changed' using errcode='XX001';exception when sqlstate 'P0001' then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
 assert (select count(*) from public.cake_gift_list())=0,'other account must not enumerate gifts';
 begin perform public.cake_gift_set_active('21000000-0000-4000-8000-000000000001',false);raise exception 'other account revoked gift' using errcode='XX001';exception when sqlstate 'P0001' then null;end;
 begin perform 1 from public.cake_gifts;raise exception 'raw table exposed' using errcode='XX001';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 assert public.cake_gift_get('21000000-0000-4000-8000-000000000001')->>'message'='周末快乐','anonymous exact link works';
 assert public.cake_gift_get('21000000-0000-4000-8000-000000000099') is null;
 begin perform 1 from public.cake_gifts;raise exception 'anonymous table exposed' using errcode='XX001';exception when insufficient_privilege then null;end;
 begin perform public.cake_gift_list();raise exception 'anonymous enumeration allowed' using errcode='XX001';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cake_gift_set_active('21000000-0000-4000-8000-000000000001',false);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin assert public.cake_gift_get('21000000-0000-4000-8000-000000000001') is null,'revocation hides snapshot';end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cake_gift_set_active('21000000-0000-4000-8000-000000000001',true);
do $$begin assert public.cake_gift_get('21000000-0000-4000-8000-000000000001') is not null,'owner may reopen';end $$;
rollback;
select 'PASS: gift ownership, immutability, null validation, anonymous access and revocation' as gift_policy_result;
