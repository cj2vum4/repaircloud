-- 僅供人工審閱與執行；適用於已存在且有資料的 repair_requests。
-- 新欄位允許 NULL，無預設值，不回填、不修改既有欄位或資料。
BEGIN;

ALTER TABLE public.repair_requests
    ADD COLUMN IF NOT EXISTS assignee text,
    ADD COLUMN IF NOT EXISTS photo_url text;

-- 延續 schema.sql 的欄位白名單；不新增 UPDATE / DELETE 權限，保留既有 RLS。
GRANT INSERT (assignee, photo_url) ON TABLE public.repair_requests TO anon;
-- 原本的表級 SELECT 已涵蓋新增欄位；明確補足欄位讀取權限。
GRANT SELECT (assignee, photo_url) ON TABLE public.repair_requests TO anon;

COMMIT;
