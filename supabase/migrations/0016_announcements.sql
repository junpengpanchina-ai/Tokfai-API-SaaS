-- =============================================================================
-- Tokfai P7.8 — announcements / help center notices
--
-- Lightweight system notices for dashboard users. Admin CRUD via DMIT
-- service_role; public reads via RLS for authenticated users.
--
-- Out of scope (unchanged):
--   - billing / checkout / webhook / credit_ledger / usage_logs
-- =============================================================================

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(trim(title)) > 0),
  slug          text unique,
  summary       text,
  content       text not null check (char_length(trim(content)) > 0),
  type          text not null default 'notice'
                check (type in (
                  'notice',
                  'maintenance',
                  'billing',
                  'model',
                  'promotion',
                  'docs'
                )),
  priority      integer not null default 100 check (priority >= 0),
  enabled       boolean not null default true,
  pinned        boolean not null default false,
  visible_from  timestamptz,
  visible_until timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.announcements is
  'System announcements for dashboard users. Admin writes via DMIT service_role.';

create index if not exists announcements_enabled_pinned_priority_idx
  on public.announcements (enabled, pinned desc, priority asc, created_at desc);

create index if not exists announcements_slug_idx
  on public.announcements (slug)
  where slug is not null;

alter table public.announcements enable row level security;

-- Authenticated users may read enabled announcements within the visibility window.
create policy "announcements_select_visible"
  on public.announcements
  for select
  to authenticated
  using (
    enabled = true
    and (visible_from is null or visible_from <= now())
    and (visible_until is null or visible_until >= now())
  );

revoke insert, update, delete on public.announcements from public, anon, authenticated;
grant select on public.announcements to authenticated;
grant select, insert, update, delete on public.announcements to service_role;

insert into public.announcements (
  slug,
  title,
  summary,
  content,
  type,
  priority,
  enabled,
  pinned
)
values
  (
    'tokfai-api-beta',
    'Tokfai API 内测说明',
    '欢迎参与 Tokfai API 内测，了解当前能力与使用边界。',
    E'## Tokfai API 内测说明\n\n感谢参与 Tokfai API 内测。\n\n- 控制台提供 API Keys、Playground、用量与积分管理。\n- 对外接口兼容 OpenAI SDK，Base URL 为 `https://api.tokfai.com`。\n- 内测期间模型与价格可能调整，请以控制台 Models 与 Usage 为准。\n\n如有问题，请通过官方渠道反馈。',
    'notice',
    10,
    true,
    true
  ),
  (
    'credits-billing-guide',
    'Credits 充值与扣费说明',
    '了解积分充值、成功请求扣费与失败不扣费规则。',
    E'## Credits 充值与扣费说明\n\n- 在 **Credits** 页面选择套餐并通过 Stripe 完成充值。\n- 仅 **成功** 的 API 请求会扣除积分；失败请求不扣费。\n- 对话模型按 token 计费，图像模型按次计费。\n- 用量与账本以 **Usage**、**Credits** 页面为准。',
    'billing',
    20,
    true,
    false
  ),
  (
    'model-availability',
    '模型可用性与维护公告',
    '模型上下线与维护窗口将在此公告，请关注 Models 页面。',
    E'## 模型可用性与维护公告\n\n- 可用模型列表见控制台 **Models**。\n- 维护或上游变更时，我们会更新本栏目与模型状态。\n- 维护期间部分模型可能暂时不可用，请稍后重试。',
    'maintenance',
    30,
    true,
    false
  )
on conflict (slug) do nothing;
