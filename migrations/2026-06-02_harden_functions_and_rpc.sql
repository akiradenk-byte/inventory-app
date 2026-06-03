-- 2026-06-02 セキュリティ強化（Supabase advisor 対応）
-- Supabase MCP の apply_migration 経由で適用済み
--   (migration name: harden_functions_search_path_and_revoke_rpc)

-- 関数の search_path を固定（function_search_path_mutable 警告の解消）
alter function public.update_updated_at() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- handle_new_user は新規ユーザー作成トリガー専用。REST RPC からの直接実行を禁止
-- （トリガーからの実行には影響しない）
-- anon/authenticated は PUBLIC 経由で EXECUTE を継承しているため PUBLIC からも剥奪する
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_user() from public;

-- 残る advisor 警告について:
--  * rls_policy_always_true (items/categories/locations/customers/profiles/desk_*):
--      「ログイン者は全行アクセス可」= 社内共有ワークスペースとして意図的な設計。
--      個人別に絞る場合は各テーブルに user_id を持たせ、ポリシーを user_id = auth.uid() に変更する。
--  * auth_leaked_password_protection:
--      ダッシュボード Authentication → Policies で HaveIBeenPwned 連携を ON にする（SQL不可）。
