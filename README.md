# 西貢區中學全景 2026

一個以官方數據為本的單頁網站，橫向比較西貢區（將軍澳、西貢市中心、坑口、調景嶺）26 間中學的中一收生數字、各級班數、學校特色，以及 Facebook、Instagram、YouTube 和小紅書連結。

校情與中一學額資料仍沿用 2026-11-01 的整理版本，沒有因本次社交帳號補查而改動。

## 社交帳號補查：2026-11-09

本次為全部 26 間學校補查四個平台，新增 29 條已核實的學校／校方部門連結，涉及 18 間學校：Facebook 8 條、Instagram 6 條、YouTube 14 條、小紅書 1 條。學校既有的頻道網址別名及不必要參數亦作去重或整理；網址數不等於平台數。

目前 25 間學校有至少一個已核實的學校／校方部門平台。按學校計算，Facebook 覆蓋 20 間、Instagram 17 間、YouTube 23 間、小紅書 2 間；這些數字不計校友會、學生組織及未核實的原有連結。

新增的小紅書連結是啓思中小幼連校的共同帳號，包含啓思中學，介面已標示並非中學獨有。鄭植之中學原有的小紅書連結保留，但因未取得校方歸屬的充分證據，標作來源未核實，不計入已核實官方平台數。

圓玄學院第三中學原有的 Joyous Foundation 慈善機構及 Dance World Cup 比賽影片連結並非學校帳號，已移出學校社交清單。校長相關個人頁面以及各校校友會連結保留並另行標示，不當作學校官方帳號。

每個帳號的分類、證據網址與說明保存在 `data/social-link-audit.json`；學校詳情亦可開啟查證來源。部分 Facebook、Instagram 及小紅書頁面受登入限制，因此不宣稱完成所有平台的即時內容檢查。未核實不代表帳號不存在。

## 檔案結構

```text
index.html                   單頁網站（無需 build）
assets/style.css             樣式
assets/app.js                排序、篩選、圖表、詳情卡及帳號分類
assets/data.js               26 間學校資料（window.SCHOOLS）及來源日期（window.META）
data/schools.csv             同步的 CSV，包含四個平台的連結、帳號分類與補查日期
data/social-link-audit.json  26 校補查結果、逐條來源及新增／移除記錄
tests/social-data.test.cjs   資料一致性與前端互動回歸測試
```

## 資料來源與限制

學校名單、班級結構、辦學宗旨、收生準則和語文政策來自家校會《中學概覽 2025/2026》。中一學額來自教育局《2024/2026 中學學位分配辦法——中學一覽表（西貢區）》及《2026 年度中一自行分配學位手冊》。社交帳號以各校官網、校方公告及可辨識的公開帳號資料核實；逐條來源見補查 JSON 與學校詳情。

中一學額未計留班位及後補／叩門取錄。7 間直資學校自訂收生，沒有統一中一學額公布，網站只列班數，不作推算。

「宣傳型態」按已核實的官方平台數歸類為 3＋、2、1 或尚未核實，不由平台數推斷更新頻率、實際宣傳策略或教學質素。校友會、學生組織和未核實的原有連結仍可查看，但不計入官方數目。

CSV 中「社交平台數」及「平台」僅列已核實的學校／校方部門平台；四個連結欄保留另標示的相關帳號，可搭配「連結帳號類別」閱讀。

## 本機預覽與測試

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000

# 在包含原始 c686587 提交的 Git 工作副本中，以 Node.js 22 或更新版本執行：
node --test tests/social-data.test.cjs
```

測試涵蓋 26 校非社交資料保留、CSV 所依據的官方平台數、逐帳號來源、原有收生總數、搜尋與篩選、全部學校詳情連結及過時文案移除。無需 npm 套件。

本頁為獨立整理，與任何學校或辦學團體無關。

## Banding、發展計劃及外評摘要：2026-11-09 查核

網站已為原有26校加入三項獨立查核記錄。總表及速覽卡顯示 Banding 坊間參考，卡片顯示文件公開狀態；按校名或「詳細資料」可閱讀文件摘要、實際涵蓋期間、原文連結、頁碼／章節，以及版本選取依據。搜尋亦支援 Banding 和摘要關鍵字。

26校都有可引用的坊間 Banding 資料，其中15校的來源標籤不一致，故逐項保留，不自行選定等級。Banding 原是學生的中一派位組別，這些學校標籤不是教育局評級，也不是入學保證。

23校取得正式發展計劃全文；另外3校只有官方關注事項或計劃概覽，清楚標示不構成正式計劃全文摘要。仁濟醫院靚次伯紀念中學的最新公開文件是校方「3+3年」六學年計劃，按原文件期間標示，沒有改稱單一三年計劃。

6校取得可讀的公開外評文件：4份全文、2份教育局公開總結章節。另外19校未找到可核讀的公開外評文件，1校找到相關來源但不能讀取，不提供推測摘要。未取得文件不代表學校沒有計劃或從未接受外評；「最新可讀公開版本」只指截至本次查核可取得的文件，不能保證未公開的新版本。外評反映所評核當時的情況，不作現時校際評分。

全部原校情、收生資料、社交帳號及 `data/schools.csv` 保持不變。新資料獨立保存：

```text
assets/school-reviews.js             26校查核資料，window.SCHOOL_REVIEWS
assets/school-review-ui.js           安全顯示Banding、文件狀態及摘要
 data/school-reviews.json             完整來源、摘要、頁碼及版本依據
 data/school-reviews.csv              新欄目獨立CSV，以school_id對應原表
 tools/build_school_reviews.py        驗證並生成JSON、JS及CSV
 tests/school-review-ui.test.cjs       顯示、來源連結及文字安全測試
 tests/school-review-integration.test.cjs  表格、搜尋、卡片及詳情整合測試
 tests/test_build_school_reviews.py    資料完整性與生成程式測試
```

新增資料通過26校身分比對及JSON／JS／CSV一致性檢查。全部35項Node測試及10項Python測試通過：

```bash
node --test tests/*.test.cjs
python3 -B -m unittest discover -s tests -p 'test_build_school_reviews.py'

# registry.json為原26校的id/name名單；results/每校檔名為id.json。
# 程式在所有學校與來源檢查通過後才生成公開資料。
python3 -B tools/build_school_reviews.py \
  --registry registry.json --results-dir results --output .
```

Banding與文件逐條來源可在新JSON及學校詳情查看。制度說明參考[教育局中學派位資料](https://www.edb.gov.hk/tc/edu-system/primary-secondary/spa-systems/secondary-spa/general-info/index.html)及[教育局校外評核報告公開安排](https://www.edb.gov.hk/tc/sch-admin/sch-quality-assurance/reports/esr-report/index.html)。
