-- Ensure duplicate Stripe Checkout webhooks repair the order state without
-- crediting the profile again. The top-up ledger reference remains the
-- idempotency source of truth.

create or replace function public.complete_credit_order(
  p_order_id                    uuid,
  p_user_id                     uuid,
  p_stripe_checkout_session_id  text,
  p_stripe_payment_intent_id    text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.credit_orders%rowtype;
  v_balance      numeric;
  v_new_balance  numeric;
  v_reference_id text;
begin
  if p_order_id is null then
    raise exception 'missing_order_id' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'missing_user_id' using errcode = '22023';
  end if;
  if p_stripe_checkout_session_id is null or length(p_stripe_checkout_session_id) = 0 then
    raise exception 'missing_stripe_checkout_session_id' using errcode = '22023';
  end if;

  v_reference_id := 'stripe_checkout:' || p_stripe_checkout_session_id;

  select * into v_order
  from public.credit_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'credit_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.user_id <> p_user_id then
    raise exception 'credit_order_user_mismatch' using errcode = '22023';
  end if;
  if v_order.stripe_checkout_session_id is not null
     and v_order.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    raise exception 'credit_order_session_mismatch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.credit_ledger
    where reference_id = v_reference_id
  ) then
    update public.credit_orders set
      status                      = 'paid',
      stripe_checkout_session_id  = p_stripe_checkout_session_id,
      stripe_payment_intent_id    = p_stripe_payment_intent_id,
      paid_at                     = coalesce(paid_at, now()),
      updated_at                  = now()
    where id = v_order.id;

    select credits_balance into v_new_balance
    from public.profiles
    where id = p_user_id;

    return v_new_balance;
  end if;

  select credits_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_new_balance := v_balance + v_order.credits;

  update public.profiles set
    credits_balance          = v_new_balance,
    total_credits_purchased  = coalesce(total_credits_purchased, 0) + v_order.credits,
    updated_at               = now()
  where id = p_user_id;

  insert into public.credit_ledger (
    user_id,
    type,
    amount,
    balance_after,
    reason,
    reference_id
  )
  values (
    p_user_id,
    'topup',
    v_order.credits,
    v_new_balance,
    'stripe_checkout_completed',
    v_reference_id
  );

  update public.credit_orders set
    status                      = 'paid',
    stripe_checkout_session_id  = p_stripe_checkout_session_id,
    stripe_payment_intent_id    = p_stripe_payment_intent_id,
    paid_at                     = coalesce(paid_at, now()),
    updated_at                  = now()
  where id = v_order.id;

  return v_new_balance;
end;
$$;

revoke all on function public.complete_credit_order(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.complete_credit_order(
  uuid,
  uuid,
  text,
  text
) to service_role;
