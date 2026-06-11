-- 2026-06-11 公開サインアップの遮断
-- Supabase MCP の apply_migration 経由で適用済み (migration name: block_public_signups)
--
-- 背景: 本アプリは「共有アカウント1つで全員が使う」運用で、RLS は authenticated に全権を
-- 与えている。Supabase Auth のサインアップが開いていると、誰でも自己登録して
-- authenticated ロール（=全データへのアクセス権）を得られてしまうため、DB レベルで遮断する。
-- アプリ側のサインアップUIも同日削除済み（通常フローでユーザー作成は発生しない）。
--
-- 将来ユーザーを追加したい場合は、先にこのトリガーを外すこと:
--   drop trigger if exists block_public_signups on auth.users;
-- （追加後に再作成を推奨）
-- あわせて Supabase ダッシュボード Authentication → Sign In / Up の
-- "Allow new users to sign up" を OFF にしておくのが望ましい（こちらはSQL不可・手動設定）。

create or replace function public.block_public_signups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from 'shared@akiradenki.app' then
    raise exception 'signups are disabled for this project';
  end if;
  return new;
end;
$$;

revoke execute on function public.block_public_signups() from anon, authenticated;
revoke execute on function public.block_public_signups() from public;

drop trigger if exists block_public_signups on auth.users;
create trigger block_public_signups
  before insert on auth.users
  for each row execute function public.block_public_signups();
