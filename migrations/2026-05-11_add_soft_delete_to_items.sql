-- 2026-05-11 ソフトデリート機能追加
-- items テーブルに deleted_at カラムとインデックスを追加(追加のみ・非破壊)
-- Supabase MCP の apply_migration 経由で適用済み (migration name: add_soft_delete_to_items)

ALTER TABLE public.items ADD COLUMN deleted_at TIMESTAMPTZ NULL DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON public.items(deleted_at);
