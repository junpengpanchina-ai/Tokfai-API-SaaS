# Supabase

Source of truth for the Tokfai database shape.

## Layout

```
supabase/
└── migrations/
    └── 0001_init.sql   # tables + RLS + triggers + RPC functions
```

## What's in `0001_init.sql`

| Object | Purpose | Written by |
|---|---|---|
| `public.profiles` | One row per user. Holds balance + Stripe customer id. | DMIT |
| `public.api_keys` | Hashed `sk-tokfai_...` keys. Never store plaintext. | DMIT |
| `public.usage_logs` | One row per API call. | DMIT |
| `public.credit_ledger` | Append-only ledger of every credit movement. | DMIT |
| `public.handle_new_user()` trigger | Auto-creates a `profiles` row when an auth user signs up. | Postgres |
| `public.debit_credits(...)` RPC | Atomic per-request debit. | DMIT calls it via service_role |
| `public.credit_purchase(...)` RPC | Idempotent Stripe top-up. | DMIT calls it via service_role |

## RLS posture

- **Frontend (anon key + user session)** can `SELECT` its own rows in every table — RLS enforces `auth.uid() = id` / `user_id`.
- **No** `INSERT` / `UPDATE` / `DELETE` policies exist. All writes happen from **DMIT with `service_role`**, which bypasses RLS.
- If you ever feel tempted to add an INSERT/UPDATE/DELETE policy for the `authenticated` role, stop — that write belongs in DMIT.

## How to apply

### Option A — Supabase CLI (recommended)

```bash
# one-time:
supabase link --project-ref <your-project-ref>

# apply:
supabase db push
```

### Option B — Dashboard

1. Open your Supabase project → SQL Editor.
2. Paste the contents of `migrations/0001_init.sql`.
3. Run.

The migration is **idempotent** (`create ... if not exists`, `drop ... if exists`, `do $$ ... end$$` guards) so you can safely re-run it.

## Verifying

After applying, in the SQL editor run:

```sql
select tablename from pg_tables where schemaname = 'public' order by 1;
-- expect: api_keys, credit_ledger, profiles, usage_logs

select polname, polrelid::regclass from pg_policy
  where polrelid::regclass::text like 'public.%' order by 1;
-- expect 4 policies, all SELECT-only

select proname from pg_proc where pronamespace = 'public'::regnamespace order by 1;
-- expect: credit_purchase, debit_credits, handle_new_user
```

You can also smoke-test the RPCs as `service_role` from the dashboard:

```sql
-- create a test user via Auth UI first, then:
select public.credit_purchase(
  '<uuid-of-test-user>'::uuid,
  10.00,
  'cs_test_smoketest_001'
);
-- expect: 10.000000  (the new balance)

-- Re-running with the same reference_id should be a no-op (idempotent):
select public.credit_purchase(
  '<uuid-of-test-user>'::uuid,
  10.00,
  'cs_test_smoketest_001'
);
-- expect: 10.000000  (still, not 20)
```

## What this migration intentionally does NOT do

- It does not create any policy that lets the frontend write. That's by design.
- It does not configure Stripe — Stripe lives entirely on DMIT.
- It does not create the OAuth providers — configure those in Supabase Dashboard → Authentication → Providers.

## Future migrations

Number subsequent files `0002_*.sql`, `0003_*.sql`, etc. Keep every migration idempotent so they're safe to re-run on shared databases.
