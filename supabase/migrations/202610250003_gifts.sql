-- Immutable gift snapshots. Only the random link can resolve a gift anonymously.
begin;
create table public.cake_gifts(
 id uuid primary key,
 owner_id uuid not null references auth.users on delete cascade,
 payload jsonb not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index cake_gifts_owner on public.cake_gifts(owner_id,created_at desc);
alter table public.cake_gifts enable row level security;
revoke all on public.cake_gifts from public,anon,authenticated;
-- Deliberately no direct SELECT policy: a public list cannot enumerate link tokens.
create function public.cake_gift_create(gift_id uuid,gift_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); old_row public.cake_gifts; picture text; bytes bytea; w bigint; h bigint;
begin
 if uid is null then raise exception '请先登录云存档';end if;
 if gift_id is null or substring(gift_id::text,15,1)<>'4' or substring(gift_id::text,20,1) not in ('8','9','a','b') then raise exception '分享编号无效';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,3));
 select * into old_row from public.cake_gifts where id=gift_id;
 if found then
  if old_row.owner_id=uid and old_row.payload=gift_payload and old_row.active then return gift_id;end if;
  raise exception '这份分享已经改变，请重新生成链接';
 end if;
 if (select count(*) from public.cake_gifts where owner_id=uid)>=100 then raise exception '这个账号已有 100 份礼物，请先使用已有的分享';end if;
 if (select count(*) from public.cake_gifts where owner_id=uid and active)>=30 then raise exception '最多同时开启 30 份分享，请先关闭一些旧链接';end if;
 if jsonb_typeof(gift_payload) is distinct from 'object' or octet_length(gift_payload::text)>2100000 or not(gift_payload ?& array['version','title','message','signature','recipient','template','accent','cakeName','image','candle']) or gift_payload-'version'-'title'-'message'-'signature'-'recipient'-'template'-'accent'-'cakeName'-'image'-'candle'<>'{}'::jsonb then raise exception '分享资料不完整';end if;
 if gift_payload->'version' is distinct from '1'::jsonb or coalesce(gift_payload->>'template','') not in ('picnic','moon','garden') or coalesce(gift_payload->>'accent','') !~ '^#[0-9A-Fa-f]{6}$' then raise exception '贺卡样式无效';end if;
 if jsonb_typeof(gift_payload->'title') is distinct from 'string' or char_length(gift_payload->>'title') not between 1 and 36 or jsonb_typeof(gift_payload->'message') is distinct from 'string' or char_length(gift_payload->>'message') not between 1 and 500 or jsonb_typeof(gift_payload->'signature') is distinct from 'string' or char_length(gift_payload->>'signature')>24 or jsonb_typeof(gift_payload->'recipient') is distinct from 'string' or char_length(gift_payload->>'recipient')>24 or jsonb_typeof(gift_payload->'cakeName') is distinct from 'string' or char_length(gift_payload->>'cakeName')>30 then raise exception '祝福文字长度不符合要求';end if;
 if jsonb_typeof(gift_payload->'candle') is distinct from 'object' or not((gift_payload->'candle') ?& array['x','y','size']) or (gift_payload->'candle')-'x'-'y'-'size'<>'{}'::jsonb or jsonb_typeof(gift_payload#>'{candle,x}') is distinct from 'number' or jsonb_typeof(gift_payload#>'{candle,y}') is distinct from 'number' or jsonb_typeof(gift_payload#>'{candle,size}') is distinct from 'number' then raise exception '蜡烛位置无效';end if;
 if (gift_payload#>>'{candle,x}')::numeric not between 8 and 92 or (gift_payload#>>'{candle,y}')::numeric not between 24 and 85 or (gift_payload#>>'{candle,size}')::numeric not between 3 and 7 then raise exception '蜡烛位置无效';end if;
 picture:=gift_payload->>'image';
 if picture is null or char_length(picture)>2000000 or picture !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception '蛋糕图片无效';end if;
 bytes:=decode(substring(picture from 23),'base64');
 if length(bytes)<33 or encode(substring(bytes from 1 for 8),'hex')<>'89504e470d0a1a0a' or encode(substring(bytes from 13 for 4),'hex')<>'49484452' then raise exception '请选择 PNG 蛋糕图片';end if;
 w:=get_byte(bytes,16)::bigint*16777216+get_byte(bytes,17)*65536+get_byte(bytes,18)*256+get_byte(bytes,19);
 h:=get_byte(bytes,20)::bigint*16777216+get_byte(bytes,21)*65536+get_byte(bytes,22)*256+get_byte(bytes,23);
 if w not between 1 and 1600 or h not between 1 and 1600 then raise exception '蛋糕图片尺寸过大';end if;
 insert into public.cake_gifts(id,owner_id,payload) values(gift_id,uid,gift_payload);
 return gift_id;
end $$;
create function public.cake_gift_get(gift_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select payload from public.cake_gifts where id=gift_id and active;
$$;
create function public.cake_gift_list() returns table(id uuid,active boolean,created_at timestamptz,title text,cake_name text,recipient text) language sql stable security definer set search_path='' as $$
 select id,active,created_at,payload->>'title',payload->>'cakeName',payload->>'recipient' from public.cake_gifts where owner_id=auth.uid() order by created_at desc limit 100;
$$;
create function public.cake_gift_set_active(gift_id uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or enabled is null then raise exception '请先登录';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,3));
 if enabled and (select count(*) from public.cake_gifts where owner_id=uid and active and id<>gift_id)>=30 then raise exception '最多同时开启 30 份分享';end if;
 update public.cake_gifts set active=enabled where id=gift_id and owner_id=uid;
 if not found then raise exception '只能管理自己送出的贺卡';end if;
end $$;
revoke all on function public.cake_gift_create(uuid,jsonb),public.cake_gift_get(uuid),public.cake_gift_list(),public.cake_gift_set_active(uuid,boolean) from public;
grant execute on function public.cake_gift_create(uuid,jsonb),public.cake_gift_list(),public.cake_gift_set_active(uuid,boolean) to authenticated;
grant execute on function public.cake_gift_get(uuid) to anon,authenticated;
commit;
