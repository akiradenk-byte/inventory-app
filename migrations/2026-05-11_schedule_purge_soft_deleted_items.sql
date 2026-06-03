-- 2026-05-11 ゴミ箱自動クリーンアップ用 pg_cron 設定
-- Supabase MCP の apply_migration 経由で適用済み (migrations: enable_pg_cron, schedule_purge_soft_deleted_items)

-- pg_cron 拡張を有効化(未有効ならインストール)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 毎日 18:00 UTC (= 03:00 JST 翌日) に、ソフト削除から30日経過した items を物理削除
SELECT cron.schedule(
  'purge_soft_deleted_items',
  '0 18 * * *',
  $$DELETE FROM public.items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'$$
);

-- ジョブを無効化したい場合:
--   SELECT cron.unschedule('purge_soft_deleted_items');
