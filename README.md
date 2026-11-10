# 報修登記系統
用於登記報修問題並追蹤處理進度。
雲端任務測試

[報修欄位表（含 10 筆虛構範例資料）](文件/報修欄位表.xlsx)

## 負責人與照片網址

表單新增必填「負責人」（`assignee`），以及選填「照片網址」（`photo_url`，限 HTTP/HTTPS）。清單顯示兩者，照片網址可點開；舊紀錄若為 NULL，顯示「未指定／未提供」。照片只儲存網址，不上傳檔案。

### 已上線 Supabase 的升級順序

1. 在 Supabase 先備份或匯出 `public.repair_requests` 全部資料，記錄筆數，並保存下列查詢結果（依 id 排序的既有欄位）。驗證期間暫停新增，避免筆數因正常使用而變動。
2. 在 SQL Editor 開啟新查詢，貼入並審閱 `supabase/002_add_assignee_photo.sql`，再手動執行。此專案此次只產生檔案，沒有執行 SQL。**不要重跑首次建表用的 `supabase/schema.sql`，也不要刪除或重建資料表。** 全新環境則依序執行 schema.sql 和 002。
3. 002 只以 `ADD COLUMN IF NOT EXISTS` 補缺少的 nullable text 欄位，並補匿名角色對新欄位的 INSERT / SELECT 權限；不回填、不更新、不刪除舊資料，不改既有 RLS，亦不授予 UPDATE / DELETE。可以重跑；若同名欄位原已存在，不會改其型別或內容。
4. 再跑下列查詢，比對筆數及每筆既有欄位內容完全一致；並確認原本沒有這兩欄的舊紀錄，其新欄位都是 NULL。完成後才部署此 PR 的網頁版本。

```sql
SELECT id, created_at, reporter_name, location, category, description, urgency, status
FROM public.repair_requests ORDER BY id;
SELECT count(*) FROM public.repair_requests;
```

### 驗收

- 舊紀錄仍能顯示，原本的姓名、說明、狀態與登記時間不變；新欄位空值顯示「未指定／未提供」。
- 使用虛構資料新增兩筆，一筆留空照片、一筆填 HTTPS 照片網址，確認清單顯示負責人、照片連結與系統登記時間；空白負責人或非 HTTP/HTTPS 網址不得送出。
- 匿名角色應可新增及讀取，仍無法更新及刪除；請在測試環境驗證權限，勿用正式舊資料測試修改或刪除。
- 離線瀏覽器回歸測試：`node tests/assignee-photo.cjs`，以模擬 Supabase 驗證表單、清單與舊資料相容性，不連線正式資料庫。原本的 live 測試需要先套用 002，且會新增一筆虛構資料，請只在測試環境執行。
