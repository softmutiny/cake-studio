-- A dedicated Cake Studio Supabase project. Run once in the SQL editor.
begin;
create schema if not exists cake_private;
revoke all on schema cake_private from public, anon, authenticated;
create table cake_private.moderators(user_id uuid primary key references auth.users on delete cascade);
create function public.cake_is_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from cake_private.moderators where user_id=auth.uid());
$$;
revoke all on function public.cake_is_moderator() from public;
grant execute on function public.cake_is_moderator() to anon,authenticated;

create table public.cake_saves(
 owner_id uuid primary key references auth.users on delete cascade,
 revision bigint not null default 1,
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=20971520),
 updated_at timestamptz not null default now()
);
alter table public.cake_saves enable row level security;
create policy own_save on public.cake_saves for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.cake_saves from anon,authenticated;
grant select on public.cake_saves to authenticated;
create function public.cake_save(expected_revision bigint,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_row public.cake_saves; new_revision bigint;
begin
 if uid is null then raise exception '请先登录'; end if;
 if jsonb_typeof(payload)<>'object' or not(payload ?& array['version','draft','gallery','inventory']) or octet_length(payload::text)>20971520 then raise exception '存档格式或大小不符合要求'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into current_row from public.cake_saves where owner_id=uid for update;
 if coalesce(current_row.revision,0)<>expected_revision then
  return jsonb_build_object('conflict',true,'revision',coalesce(current_row.revision,0),'state',current_row.state);
 end if;
 new_revision:=expected_revision+1;
 insert into public.cake_saves(owner_id,revision,state) values(uid,new_revision,payload)
 on conflict(owner_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now();
 return jsonb_build_object('conflict',false,'revision',new_revision);
end $$;
revoke all on function public.cake_save(bigint,jsonb) from public;
grant execute on function public.cake_save(bigint,jsonb) to authenticated;

create table public.cake_assets(
 id uuid primary key,
 owner_id uuid not null references auth.users on delete cascade,
 name text not null check(char_length(name) between 1 and 24 and name !~ '[<>"&]'),
 width integer not null check(width between 12 and 180),
 height integer not null check(height between 12 and 180),
 anchor numeric not null check(anchor between .1 and 1),
 path text not null unique,
 status text not null default 'private' check(status in ('private','pending','approved','rejected')),
 license_accepted boolean not null default false,
 review_note text not null default '' check(char_length(review_note)<=300),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index cake_assets_owner on public.cake_assets(owner_id);
create index cake_assets_status on public.cake_assets(status,created_at);
alter table public.cake_assets enable row level security;
create policy own_or_admin_asset on public.cake_assets for select to authenticated using(owner_id=(select auth.uid()) or (license_accepted and status<>'private' and (select public.cake_is_moderator())));
revoke all on public.cake_assets from anon,authenticated;
grant select on public.cake_assets to authenticated;

create table cake_private.review_log(id bigint generated always as identity primary key,asset_id uuid,moderator uuid,decision text,note text,created_at timestamptz default now());

create function public.cake_asset_create(asset_id uuid,asset_name text,asset_width integer,asset_height integer,asset_anchor numeric) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); asset_path text;
begin
 if uid is null then raise exception '请先登录';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
 if exists(select 1 from public.cake_assets where id=asset_id and owner_id=uid) then return;end if;
 if (select count(*) from public.cake_assets where owner_id=uid)>=100 then raise exception '每个账号最多上传 100 个配件';end if;
 asset_path:=uid::text||'/'||asset_id::text||'.png';
 if not exists(select 1 from storage.objects where bucket_id='cake-assets' and name=asset_path and (metadata->>'mimetype')='image/png') then raise exception '请先上传 PNG 配件';end if;
 insert into public.cake_assets(id,owner_id,name,width,height,anchor,path) values(asset_id,uid,asset_name,asset_width,asset_height,asset_anchor,asset_path);
end $$;
create function public.cake_asset_submit(asset_id uuid,accept_license boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or accept_license is distinct from true then raise exception '请确认有权分享此素材，并允许其他玩家在游戏作品中使用';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
 if (select count(*) from public.cake_assets where owner_id=uid and status='pending')>=20 then raise exception '待审核配件已有 20 个，请等待审核';end if;
 update public.cake_assets set status='pending',license_accepted=true,review_note='',reviewed_at=null where id=asset_id and owner_id=uid and status in ('private','rejected');
 if not found then raise exception '这个配件不能重复投稿';end if;
end $$;
create function public.cake_asset_review(asset_id uuid,decision text,note text default '') returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cake_is_moderator() then raise exception '只有审核员可以操作';end if;
 if decision not in ('approved','rejected') or char_length(note)>300 then raise exception '审核结果无效';end if;
 update public.cake_assets set status=decision,review_note=note,reviewed_at=now() where id=asset_id and status in ('pending','approved') and license_accepted;
 if not found then raise exception '配件状态已经改变，请刷新';end if;
 insert into cake_private.review_log(asset_id,moderator,decision,note) values(asset_id,auth.uid(),decision,note);
end $$;
create function public.cake_public_assets(before_time timestamptz default now()) returns table(id uuid,name text,width integer,height integer,anchor numeric,path text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,name,width,height,anchor,path,created_at from public.cake_assets where status='approved' and created_at<before_time order by created_at desc,id limit 60;
$$;
create function public.cake_asset_visible(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cake_assets where path=object_path and (status='approved' or owner_id=auth.uid() or (license_accepted and status<>'private' and public.cake_is_moderator())));
$$;
create function public.cake_assets_resolve(asset_ids uuid[]) returns table(id uuid,name text,width integer,height integer,anchor numeric,path text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,name,width,height,anchor,path,created_at from public.cake_assets where id=any(asset_ids) and (status='approved' or owner_id=auth.uid() or (license_accepted and status<>'private' and public.cake_is_moderator())) limit 256;
$$;
revoke all on function public.cake_assets_resolve(uuid[]) from public;
grant execute on function public.cake_assets_resolve(uuid[]) to anon,authenticated;
create function public.cake_upload_allowed(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and object_path ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$')
 and (select count(*) from storage.objects where bucket_id='cake-assets' and (storage.foldername(name))[1]=auth.uid()::text)<100;
$$;
revoke all on function public.cake_asset_create(uuid,text,integer,integer,numeric),public.cake_asset_submit(uuid,boolean),public.cake_asset_review(uuid,text,text),public.cake_public_assets(timestamptz),public.cake_asset_visible(text),public.cake_upload_allowed(text) from public;
grant execute on function public.cake_asset_create(uuid,text,integer,integer,numeric),public.cake_asset_submit(uuid,boolean),public.cake_asset_review(uuid,text,text),public.cake_upload_allowed(text) to authenticated;
grant execute on function public.cake_public_assets(timestamptz),public.cake_asset_visible(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cake-assets','cake-assets',false,2097152,array['image/png']);
create policy cake_image_read on storage.objects for select to anon,authenticated using(bucket_id='cake-assets' and public.cake_asset_visible(name));
create policy cake_image_upload on storage.objects for insert to authenticated with check(bucket_id='cake-assets' and public.cake_upload_allowed(name));
-- No UPDATE/DELETE object policy: an approved image cannot be swapped after review.
commit;
