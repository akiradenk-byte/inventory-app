-- 2026-06-02 顧客管理機能の追加
-- Supabase MCP の apply_migration 経由で適用済み
--   (migration name: add_customers_and_item_customer_id)
-- 追加のみ・非破壊。フロント(App.jsx)の顧客機能が参照する customers テーブルと
-- items.customer_id 列が本番DBに存在しなかったため整合させる。

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null,
  furigana text not null default '',
  phone1 text not null default '',
  phone2 text not null default '',
  phone3 text not null default '',
  address text not null default '',
  postal_code text not null default '',
  memo text not null default '',
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

-- 既存テーブルと同じ「ログイン者は全アクセス可」の共有ワークスペース方針に合わせる
drop policy if exists customers_auth_full on public.customers;
create policy customers_auth_full on public.customers
  for all to authenticated using (true) with check (true);

-- items に顧客参照（nullable・顧客削除時は NULL 化）
alter table public.items
  add column if not exists customer_id bigint references public.customers(id) on delete set null;

create index if not exists idx_items_customer_id on public.items(customer_id);
create index if not exists idx_customers_is_deleted on public.customers(is_deleted);
