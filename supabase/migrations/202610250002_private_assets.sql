-- Existing projects: moderators review submissions, not unsubmitted private libraries.
begin;
alter policy own_or_admin_asset on public.cake_assets using(owner_id=(select auth.uid()) or (license_accepted and status<>'private' and (select public.cake_is_moderator())));
create or replace function public.cake_asset_visible(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cake_assets where path=object_path and (status='approved' or owner_id=auth.uid() or (license_accepted and status<>'private' and public.cake_is_moderator())));
$$;
create or replace function public.cake_assets_resolve(asset_ids uuid[]) returns table(id uuid,name text,width integer,height integer,anchor numeric,path text,created_at timestamptz) language sql stable security definer set search_path='' as $$
 select id,name,width,height,anchor,path,created_at from public.cake_assets where id=any(asset_ids) and (status='approved' or owner_id=auth.uid() or (license_accepted and status<>'private' and public.cake_is_moderator())) limit 256;
$$;
commit;
