-- Run in the dedicated project's SQL editor. Every fixture is rolled back.
begin;
insert into auth.users(id,aud,role,email) values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','cake-policy-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','cake-policy-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','cake-policy-admin@example.invalid');
insert into cake_private.moderators values('10000000-0000-4000-8000-000000000003');
insert into storage.objects(bucket_id,name,metadata) values('cake-assets','10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png','{"mimetype":"image/png","size":100}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$declare r jsonb;begin
 r:=public.cake_save(0,'{"version":3,"draft":{},"gallery":[],"inventory":{}}');
 assert (r->>'revision')::int=1,'first save';
 r:=public.cake_save(0,'{"version":3,"draft":{"new":true},"gallery":[],"inventory":{}}');
 assert (r->>'conflict')::boolean,'stale write must conflict';
 perform public.cake_asset_create('20000000-0000-4000-8000-000000000001','测试糖花',80,80,.9);
 assert public.cake_asset_visible('10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png'),'owner can read';
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
 assert (select count(*) from public.cake_assets)=0,'moderator cannot read unsubmitted private metadata';
 assert not public.cake_asset_visible('10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png'),'moderator cannot read unsubmitted private bytes';
 assert not exists(select 1 from public.cake_assets_resolve(array['20000000-0000-4000-8000-000000000001'::uuid])),'moderator cannot resolve unsubmitted private assets';
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.cake_asset_submit('20000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
 assert (select count(*) from public.cake_saves)=0,'other account cannot read save';
 assert (select count(*) from public.cake_assets)=0,'other account cannot read pending metadata';
 assert not public.cake_asset_visible('10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png'),'other account cannot read pending bytes';
 assert not public.cake_upload_allowed('10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.png'),'cannot upload under another user';
 begin perform public.cake_asset_review('20000000-0000-4000-8000-000000000001','approved','');raise exception 'non moderator was allowed';exception when raise_exception then if sqlerrm='non moderator was allowed' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.cake_asset_review('20000000-0000-4000-8000-000000000001','approved','通过');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$begin
 assert public.cake_asset_visible('10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png'),'approved bytes visible';
 assert exists(select 1 from public.cake_public_assets(now()+interval '1 second') where id='20000000-0000-4000-8000-000000000001'),'public catalog';
 assert not has_table_privilege('anon','public.cake_saves','select'),'anon cannot read saves';
 assert not has_table_privilege('authenticated','public.cake_assets','update'),'cannot self approve by direct update';
end $$;
reset role;
select 'PASS: owner isolation, pending image privacy, upload ownership, moderation, public catalog, save CAS' as result;
rollback;
