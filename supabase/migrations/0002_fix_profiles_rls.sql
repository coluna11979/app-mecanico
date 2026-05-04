-- Fix: allow any authenticated user to see approved mechanic/workshop profiles
-- Needed for the workshop search page to JOIN profiles on mechanics table
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select
  using (
    auth.uid() = id
    or public.is_admin(auth.uid())
    or (status = 'approved' and role in ('mechanic', 'workshop'))
  );
