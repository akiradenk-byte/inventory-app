-- 2026-06-02 案件×部品の引当（在庫アプリと案件管理の連携）
-- Supabase MCP の apply_migration 経由で適用済み (migration name: add_desk_job_items)
-- 在庫数は自動減算しない（出庫=在庫減算は P3 入出庫履歴で扱う）。
-- name/unit_price は引当時点のスナップショット。

create table if not exists public.desk_job_items (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.desk_jobs(id) on delete cascade,
  item_id bigint references public.items(id) on delete set null,
  name text not null default '',
  unit_price integer not null default 0,
  qty integer not null default 1 check (qty >= 1),
  created_at timestamptz not null default now()
);

alter table public.desk_job_items enable row level security;
drop policy if exists desk_job_items_auth_full on public.desk_job_items;
create policy desk_job_items_auth_full on public.desk_job_items
  for all to authenticated using (true) with check (true);

create index if not exists idx_desk_job_items_job_id on public.desk_job_items(job_id);
create index if not exists idx_desk_job_items_item_id on public.desk_job_items(item_id);
