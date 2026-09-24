---
name: Travel Planner Desktop Workbench
description: 已實作的桌面旅程工作台；中央聊天、可收合旅程列表與右側預覽。
colors:
  light-bg: "#fff"
  light-sidebar: "#f5f5f5"
  light-panel: "#fafafa"
  light-surface: "#f1f1f1"
  light-hover: "#e9e9e9"
  light-line: "#e5e5e5"
  light-text: "#202020"
  light-muted: "#666"
  light-subtle: "#666"
  light-button: "#242424"
  light-on-button: "#fff"
  light-focus: "#557daf"
  light-user: "#efefef"
  light-error: "#a92d30"
  dark-bg: "#191919"
  dark-sidebar: "#222222"
  dark-panel: "#151515"
  dark-surface: "#2b2b2b"
  dark-hover: "#343434"
  dark-line: "#353535"
  dark-text: "#ededed"
  dark-muted: "#aaa"
  dark-subtle: "#a0a0a0"
  dark-button: "#eee"
  dark-on-button: "#191919"
  dark-focus: "#a0bddd"
  dark-user: "#303030"
  dark-error: "#ff979a"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
  chat:
    fontSize: "14px"
    lineHeight: 1.85
  page-title:
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-.02em"
  dialog-title:
    fontSize: "18px"
    fontWeight: 600
  label:
    fontSize: "12px"
rounded:
  small: "5px"
  preview: "6px"
  field: "7px"
  control: "8px"
  dialog: "14px"
  conversation: "18px"
components:
  button:
    rounded: "{rounded.control}"
    padding: "9px 14px"
  user-message:
    rounded: "{rounded.conversation}"
    padding: "12px 18px"
  composer:
    rounded: "{rounded.conversation}"
    padding: "12px 16px 10px"
  modal:
    rounded: "{rounded.dialog}"
    width: "520px"
    padding: "24px 28px"
---

# Design System: Travel Planner Desktop Workbench

## Overview

本文件記錄 2026-09-22 已實作的原型，以同目錄 `style.css`、`index.html` 與 `app.js` 為依據。延續使用者確認的 Codex 聊天／側欄／預覽結構，以及 Orca 設定頁／新增旅程對話框結構；本次記錄不另立視覺方向。

介面採中性黑白灰、細邊線、平台字型與有限的狀態色。聊天保持中央主區，專案管理另開設定頁。正式品牌圖像保留原始色彩與漸層，與中性介面並存。

這是開發中的工作台：既有專案經非執行式解析及完整驗證後，使用共用引擎預覽。ChatGPT 連接、整體討論與跨日提案已接線，保存仍需人確認。研究、私人備份、網站發布、新旅程、附件、多段對話與工作恢復集中於聊天或各自設定分類；示範聊天使用固定回覆。

## Colors

Frontmatter 的 `light-*`／`dark-*` 分別對應 `style.css` 中亮色根節點與暗色 `data-theme` 的同名 CSS 變數。`bg` 用於聊天與對話框，`sidebar` 用於旅程／設定導覽，`panel` 用於預覽區，`surface` 用於輸入與提示容器。`line` 分隔區域，`hover` 也表示目前選取的導覽項目。

`text` 是主要文字，`muted` 是次要說明，`subtle` 是輸入提示；placeholder 不另外降低透明度。主要按鈕與送出按鈕採 `button`／`on-button` 反差，使用者訊息採 `user` 背景。藍色只供焦點辨識，紅色用於表單錯誤；錯誤仍有文字說明。

外觀提供亮色、暗色與跟隨系統。偏好在瀏覽器版透過 localStorage 記錄；桌面版另由 App user-data registry 保存，重開可恢復。跟隨系統時監聽系統變化。示範預覽同步切換明暗，iframe 內使用自己的簡化閱讀樣式，並非正式行程網站的主題。

## Typography

正文使用平台 sans 字型，基準與聊天行高見 frontmatter。中央旅程標題為 14px／600，設定頁主標題使用 page-title，歡迎標題為 23px／550、行高 1.5，對話框標題使用 dialog-title。導覽與預覽標題主要為 13px，次要狀態為 11px；預覽下方輔助說明為 10px。

聊天保留使用者換行並允許長字串換行；頂部旅程標題及側欄專案名稱以省略號保住操作空間。不要套用大型行銷頁標題或額外展示字型。

## Layout

全寬 Header 高 56px，整合原生視窗控制、旅程名稱與右側預覽開關；macOS 留出交通燈位置，Windows／Linux 留出原生控制區。Header 可拖曳視窗，操作按鈕排除拖曳。工作台與設定頁佔剩餘視窗高度，各區獨立捲動。

工作台使用明確 grid areas：sidebar、chat、preview。聊天永遠在中央欄，不依賴可隱藏兄弟節點的自動排列。訊息容器上限 780px、composer 上限 800px，使用者訊息靠右且不超過所在容器 85%。

- 左側預設 240px，可調 180–420px；收合按鈕位於 sidebar，收合後保留 52px 窄列供展開。
- 右側預設 360px，開啟時最低 260px；上限按聊天所需空間計算。
- 原生視窗最小寬 860px，聊天始終至少 320px。縮小視窗先約束側欄，不讓預覽覆蓋聊天。
- 分隔線可用滑鼠或觸控拖曳、左右鍵每次調 20px、Home／End 到界限、雙擊回預設。拖曳時 iframe 暫停 pointer events，避免攔截游標。
- 收合任一面板保留草稿與對話。面板寬度目前只保留於當次視窗。

設定頁是獨立的兩欄畫面，內容上限 920px。大視窗內容 padding 為 46px／52px，1100px 以下改為 36px／30px，700px 以下改為 28px／18px。940px 以下設定列的操作移到文字下方，700px 以下資訊表改為單欄。新增旅程對話框最大寬度為視窗寬減 32px、最大高度為視窗高減 40px，內容超高時自身捲動。

## Elevation & Depth

一般表面靠灰階底色與 1px 邊線分層，不使用卡片陰影。新增旅程 modal 的 backdrop 為 `#0008` 並模糊 3px。

按鈕僅在使用者未要求減少動態效果時，對背景色與文字色使用 0.15 秒 transition。其餘面板開關直接呈現，不加入位移動畫。

## Shapes

圓角依用途分配，數值見 frontmatter：一般按鈕與提示框使用 control，表單欄位使用 field，預覽 iframe 使用 preview，狀態標籤及主題選項使用 small。聊天輸入框與使用者訊息共用 conversation 圓角，modal 使用 dialog。送出按鈕為直徑 32px 的圓形，其他圖示按鈕為 34px 方形操作區。

共用導覽圖示為 20px 線條 SVG、1.6px stroke、圓端點；個別小標與空白狀態使用較小或較大的同組圖示。品牌 SVG 以原比例完整顯示，不裁剪、不加 filter。

## Components

- **旅程導覽**：選取項目以 `aria-current="page"` 和 hover 底色表示，次行文字區分示範、唯讀與設定待處理。收合／預覽開關使用 `aria-expanded`、動態名稱與 title；hidden 區域退出 tab order。
- **聊天**：使用者訊息在右側灰底對話框內，助手回覆靠左且不包同樣底框。composer 保留草稿；Enter 傳送、Shift+Enter 換行，輸入法組字時不送出。既有旅程通過預覽驗證且連接帳號／模型後可送出。聊天輸入框內提供模型選單，與設定頁同步。範圍預設「自動判斷 · 討論或直接修改」：AI 自己判斷只回答或直接提出修改提案，不要求使用者切換範圍；也可選定一天只改那天。
- **預覽**：側欄提供標題、版本狀態、外開與關閉操作；真實／候選快照可在本機瀏覽器開啟，示範模式停用外開。示範在 sandbox iframe 內呈現簡化的第一天內容；未選旅程或既有旅程尚未建置時顯示空白狀態說明。關閉按鈕將焦點送回預覽開關。
- **設定**：專案、外觀、AI、關於使用同一導覽與分隔列。開啟設定將焦點移至「回到旅程」，返回時恢復觸發控制項的焦點；目前旅程和示範草稿保留。主題選擇使用 radio group，選取底色與鍵盤焦點各自可辨識。
- **新增旅程**：原生 `dialog.showModal()` 提供 modal 焦點管理；開啟後聚焦名稱。名稱必填，目的地與初步想法選填，日期可未定。只有出發日期時保留空的回程並顯示「回程未定」；只填回程或回程早於出發會就地顯示文字錯誤。取消、關閉與 Escape 離開對話框；建立成功後聚焦聊天輸入。按鈕及說明清楚標示建立的是示範旅程。
- **焦點與回饋**：一般 `:focus-visible` 為 2px focus 色外框、向外偏移 3px。composer 以容器的 1px `:focus-within` 外框替代 textarea 外框；主題 radio 的可見選項有 2px 外框。停用按鈕透明度為 0.5；通知顯示約 6.5 秒，表單錯誤保留在表單內。
- **品牌資產**：使用者提供的 v2 透明 SVG 保持原始檔案內容；v3 以 v2 為底，在兩道摺痕切縫並做 R10 圓角，其餘不變。介面一律用 v3：明確亮／暗模式選相應 v3 SVG，跟隨系統使用生效主題對應的 v3 SVG；favicon 與 16–24px 平台圖示沿用 v2（摺痕縫在小尺寸會變成雜訊）。manifest 與 touch icon 使用對應明暗 PNG，manifest 的 purpose 為 `any`，不宣稱 maskable。桌面圖示由原始資產匯出，不能為配合灰階介面改色或重畫。

## Do's and Don'ts

- **Do** 延續中央聊天、左右面板可關閉、使用者訊息靠右，以及獨立設定頁的既有結構。
- **Do** 同步維護亮／暗主題、鍵盤焦點、停用原因與文字狀態。
- **Do** 明示示範資料僅存本次視窗；關閉後清除。主題偏好在瀏覽器與桌面皆可保留；面板尺寸尚不持久化。
- **Don't** 將簡化示範預覽描述為真實行程建置，或把固定回覆描述為已連接 AI。
- **Don't** 任意改動正式 logo 的位元內容、比例、色彩、漸層或裁剪方式。
- **Don't** 把這份桌面原型的視覺規範套用成既有行程網站的新主題。

## 2026-09-22 導覽與對話更新

- 側欄加入搜尋、專案收合與數量、示範分組，日期作次要資訊。底部固定 AI 狀態與設定；窄列保留常用圖示捷徑。
- 設定導覽依工作空間／應用程式分組，返回入口固定頂部，主內容上限 850px；同一帳號相關控制放同一個描邊區塊。
- 既有旅程的聊天／草稿保存到本機。重新開始 AI 對話保留可見歷史，但清楚標明不把舊訊息自動送到新上下文。停止或結果不明時立即提示需要重新開始。
- 品牌改為透明 v2 黑／白漸層標誌，保留原 614×592 比例；方形圖示背景只用於平台圖示。
- 標誌升級為 v3：摺疊地圖在兩道摺痕處切縫（R10 圓角），讓摺頁讀得出來；24px 以下仍用 v2。

## 設定參考補查

已透過 Computer Use 查看 Codex 設定與兩個 App 的側欄；Orca 設定依使用者提供截圖完成觀察。補上設定專用 Header、標題說明分隔、目前分類細框、設定導覽獨立捲動。設定記住當次視窗中最後分類及各頁捲動位置；⌘,／Ctrl , 開啟，Escape 返回並恢复焦點。詳細依據見 docs/reviews/2026-09-22-desktop-navigation-reference.md。

macOS Dock／ICNS 使用專用圓角背景與透明外緣；UI 的 v3 與小尺寸 v2 原始透明 SVG 不變。平台匯出參數見 assets/brand/README.md。

## 日程版本與修改對照

Header 的版本入口只在既有旅程顯示，提供目前版號與歷史列表。版本列包含編號、建立原因與時間；選擇回復後先到修改對照，再回右側預覽。修改對照是原生 modal：以天數／欄位分组，每組有勾選、目前內容與候選內容；窄視窗改上下排列。全選／全不選不寫檔，只有主工作台的確認保存才能套用並建立版本。歷史不可套用或處理中時停用操作並說明原因。

版本範圍明示為每日安排，不能暗示照片、私人筆記或網站已回復。未確認候選可重開恢復，但必須核對來源並載入新預覽。恢復／保存狀態與遠端備份分開呈現。


## 2026-09-23 Operate：旅程與對話導覽

依使用者新截圖保留灰階品牌與中央聊天。側欄層級為旅程→對話；兩種列都有滑鼠 hover／focus 可見的更多觸發器和右鍵選單。popover 在 top layer，不受側欄 overflow 裁切；方向鍵/Home/End/Escape、焦點返回與外點關閉皆可操作。設定按鈕固定在收合窄列底部。示範預設列於同一旅程清單，刪除偏好持久化。

設定視覺沿用使用者提供的 Orca：主內容上限832px、24px標題、13px說明、14px設定名；細描邊、單一背景層的設定群組，選项靠右。取得專案、專案細節與旅程設定以 details 漸進展開，登入維護操作放在更多選單；工具狀態用文字與小標籤，主要操作是設定引導／連接帳號。保留完整明暗與860px最小桌面版面，不改正式Logo。

AI 服務下拉與模型下拉分開，切換前清楚告知新對話邊界。啟動先顯示正在恢復連線，不以空的初始狀態表示未登入。Demo移除直接確認；正式旅程移至可還原回收區，界面不暗示會刪除網站或遠端歷史。

共用 menus.js 使用原生 top-layer popover，由元件統一處理開關與外點關閉：同一 trigger 再點即關閉、其他 trigger 切換內容；避免 auto popover 的 pointerdown light-dismiss 與 click 重開互相衝突。原生滑鼠、鍵盤、Escape 焦點返回、右鍵與外點關閉已驗證。


## 0.2.2：對話閱讀層次

中央聊天固定頂部顯示目前對話名稱與右側更多選單。助手／使用者訊息使用無可見名稱的排版，以原有左右位置、使用者背景及 aria-label 區分角色；處理中的秒數使用獨立 message-meta。「研究與查核」位於「這次調整」同一列最右側，窄欄讓範圍選單收縮而不換行。工作暫停／未知結果／額度等待使用聊天捲動區內的水平分隔事件，保留必要核對／等待操作，不佔 composer 固定區。舊 run 狀態缺少相符 job 時顯示重新開始提示，避免沒有操作指引。


## 0.3.0：設定資訊架構

「取得專案」只有一個群組，提供本機與GitHub兩種入口；GitHub的下載／建立在同一群組內漸進展開。已連接專案是一個容器，裡面列出可展開的旅程資料。AI把新對話預設與登入管理分開：上方兩個等寬欄位，下方三個獨立服務列，badge與title同一inline heading。背景登入不影響当前對話；已保存的對話帶provider身份。

「備份與發布」是單一設定目的地，以可用鍵盤操作的分頁保留私人與公開操作的不同語意。群組標題左、主要檢查操作右；工具版本、狀態接在名稱後。統一32px控制高度及8px action gap，縮短設定列垂直間距，860px窄視窗仍保持可讀且不水平溢出。

草稿編輯與AI送出是兩個狀態：暫停不鎖草稿；未處理的結果仍阻止送出。重啟上下文前鎖定操作並flush草稿，再恢复可用輸入。


## 0.3.2：對話設定的歸屬

Provider 在首則請求被保存後固定，disabled 下拉仍顯示名稱；右上更多選單另列「使用其他 AI 開新對話」。新對話選擇器明示舊紀錄／草稿保留且不自動轉交。Model與effort仍可調整下一輪；對話切換先還原model/effort才建立選項，服務預設值只初始化新對話。回覆的設定使用tooltip，不重新加入助手名稱標籤或視覺雜訊。
