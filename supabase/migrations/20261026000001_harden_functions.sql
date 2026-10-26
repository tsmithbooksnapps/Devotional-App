-- Pin search_path on helper functions and keep is_member() off the anonymous API.
alter function public.tease(text, int) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
