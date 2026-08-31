-- Custom instructions: per-group memories members can save about each other.
-- @gc reads these so it can reference nicknames, quirks, and context that
-- only the group's members actually know.

create table if not exists public.group_instructions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  instruction text not null,
  -- Nicknames, rules, or contextual notes — drives how GC weights them.
  category text not null default 'context'
    check (category in ('nickname', 'rule', 'context')),
  created_at timestamptz not null default now()
);

alter table public.group_instructions enable row level security;

-- At most 20 custom instructions per user per group — prevents spam without
-- blocking genuine use. The INSERT policy checks count before allowing.
create or replace function public.user_instruction_count(_group_id uuid, _user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.group_instructions
  where group_id = _group_id and user_id = _user_id;
$$;

revoke all on function public.user_instruction_count(uuid, uuid) from public, anon;
grant execute on function public.user_instruction_count(uuid, uuid) to authenticated;

-- Members can read instructions in their groups.
create policy "members can read group instructions"
  on public.group_instructions for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

-- Members can add instructions — capped at 20 per user per group.
create policy "members can add group instructions"
  on public.group_instructions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id, auth.uid())
    and public.user_instruction_count(group_id, user_id) < 20
  );

-- Members can update their own instructions (edit in place).
create policy "members can update own instructions"
  on public.group_instructions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Members can delete their own instructions.
create policy "members can delete own instructions"
  on public.group_instructions for delete
  to authenticated
  using (user_id = auth.uid());
