-- New-user signup bonus: 5000 credits on first profile creation.
-- Idempotent via reference_id = signup_bonus:<user_id> + partial unique index.

create unique index if not exists credit_ledger_grant_ref_idx
  on public.credit_ledger (reference_id)
  where type = 'grant' and reference_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signup_bonus constant numeric := 5000;
  v_reference_id   text;
  v_inserted_id    uuid;
begin
  v_reference_id := 'signup_bonus:' || new.id::text;

  insert into public.profiles (id, email, credits_balance)
  values (new.id, new.email, v_signup_bonus)
  on conflict (id) do nothing
  returning id into v_inserted_id;

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
      v_signup_bonus,
      'Signup bonus',
      v_reference_id
    );
  end if;

  return new;
end;
$$;
