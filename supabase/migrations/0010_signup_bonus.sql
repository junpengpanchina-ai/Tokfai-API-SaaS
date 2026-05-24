-- New-user signup bonus: 5000 credits on first profile creation.
-- Idempotent via reference_id = signup_bonus:<user_id> + partial unique index.
--
-- credit_ledger.type uses enum public.credit_ledger_type (0001_init.sql), not a
-- separate CHECK (...). 'grant' is already a valid enum value — no type widen needed.

drop index if exists public.credit_ledger_grant_ref_idx;

create unique index if not exists credit_ledger_signup_bonus_ref_idx
  on public.credit_ledger (reference_id)
  where type = 'grant' and reference_id like 'signup_bonus:%';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signup_bonus  constant numeric := 5000;
  v_reference_id  text;
  v_inserted_id   uuid;
  v_balance_after numeric;
begin
  v_reference_id := 'signup_bonus:' || new.id::text;

  insert into public.profiles (id, email, credits_balance)
  values (new.id, new.email, v_signup_bonus)
  on conflict (id) do nothing
  returning id, credits_balance into v_inserted_id, v_balance_after;

  -- Only brand-new profiles receive the bonus; existing users are untouched.
  if v_inserted_id is not null then
    insert into public.credit_ledger (
      user_id,
      type,
      amount,
      balance_after,
      reason,
      reference_id
    )
    values (
      v_inserted_id,
      'grant',
      v_signup_bonus,
      v_balance_after,
      'Signup bonus',
      v_reference_id
    );
  end if;

  return new;
end;
$$;

-- Re-assert trigger binding (originally created in 0001_init.sql).
-- Safe to re-run; required if 0001 was skipped or the trigger was dropped manually.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
