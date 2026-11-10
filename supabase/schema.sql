-- 報修登記系統：供人工審閱的首次建表腳本，不會自動執行。
-- 請以資料表擁有者執行；若資料表已存在則直接失敗，避免誤認既有結構已更新。
-- 使用交易，確保建表、權限及資料列安全規則一起完成。
BEGIN;

-- 資料結構：所有欄位必填，識別碼及含時區的建立時間由資料庫產生。
CREATE TABLE public.repair_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    reporter_name text NOT NULL,
    location text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    urgency text NOT NULL DEFAULT '中',
    status text NOT NULL DEFAULT '待處理',

    -- CHECK 層：以字元數限制原始文字長度，並拒絕完全由空白組成的內容。
    CONSTRAINT repair_requests_reporter_name_check CHECK (
        char_length(reporter_name) BETWEEN 1 AND 100
        AND reporter_name ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_location_check CHECK (
        char_length(location) BETWEEN 1 AND 200
        AND location ~ '[^[:space:]]'
    ),
    CONSTRAINT repair_requests_description_check CHECK (
        char_length(description) BETWEEN 1 AND 5000
        AND description ~ '[^[:space:]]'
    ),

    -- CHECK 層：固定選項同時限制合法值與長度，禁止任意類別、緊急程度及狀態。
    CONSTRAINT repair_requests_category_check
        CHECK (category IN ('設備', '網路', '環境', '其他')),
    CONSTRAINT repair_requests_urgency_check
        CHECK (urgency IN ('低', '中', '高')),
    CONSTRAINT repair_requests_status_check
        CHECK (status IN ('待處理', '處理中', '已完成'))
);

-- GRANT 層：清除一般 API 角色與 PUBLIC 的表級權限，只對 anon 開放必要操作。
-- 本專案不自動授權新表，因此明確授予結構使用權與清單讀取權。
REVOKE ALL PRIVILEGES ON TABLE public.repair_requests FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.repair_requests TO anon;

-- GRANT 層：只准新增表單輸入欄位；不得指定 id、created_at 或 status。
-- urgency 可省略而使用預設值；不授予 UPDATE、DELETE 或其他表級寫入權限。
GRANT INSERT (reporter_name, location, category, description, urgency)
    ON TABLE public.repair_requests TO anon;

-- RLS 層：啟用資料列安全；一般連線必須同時通過權限與政策檢查。
ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;

-- RLS 層：任何匿名訪客均可讀取完整清單。
CREATE POLICY repair_requests_anon_select
    ON public.repair_requests FOR SELECT TO anon
    USING (true);

-- RLS 層：匿名新增的最終狀態必須為待處理，與欄位新增權限形成雙重限制。
-- 不建立修改及刪除政策；已登入角色亦未獲授權。
CREATE POLICY repair_requests_anon_insert
    ON public.repair_requests FOR INSERT TO anon
    WITH CHECK (status = '待處理');

-- 完成交易；本檔不包含測試資料、資料庫連線資訊或伺服器密鑰。
COMMIT;
