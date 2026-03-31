-- マイグレーション: quantity >= 2 のレコードを quantity=1 の個別レコードに分割
-- Supabase SQL Editor で実行してください
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'quantity'
  ) THEN
    INSERT INTO items (bc, name, cat, loc, price, note, created_at)
    SELECT bc, name, cat, loc, price, note, created_at
    FROM items
    WHERE quantity >= 2
    CROSS JOIN generate_series(2, quantity) AS s(n);
    UPDATE items SET quantity = 1 WHERE quantity >= 2;
    ALTER TABLE items DROP COLUMN IF EXISTS quantity;
    RAISE NOTICE 'マイグレーション完了';
  ELSE
    RAISE NOTICE 'quantityカラムが存在しません。マイグレーション不要です。';
  END IF;
END $$;
