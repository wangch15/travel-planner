# Desktop workbench UI and brand implementation plan

Goal: 落實使用者給定的 Codex／Orca 操作配置與正式 Logo。

Architecture: 沿用 Electron 的安全 IPC、唯讀 importer 與隔離 iframe；renderer 重整為 sidebar/chat/preview 與獨立 settings。共用固定資產清單供 Electron custom protocol 與本機 HTTP 視覺預覽。只新增 theme 的列舉 IPC，沒有任意路徑或指令入口。

Tech stack: 既有原型 HTML/CSS/JS、Electron 44.4.3、Node 原生測試與圖示容器輸出。

1. 複製並 hash 比對三份原始 SVG；使用 Chromium 從原始圖形渲染 PNG，匯出 macOS ICNS／Windows ICO，保留重產腳本與來源校驗碼。
2. 替换 renderer 為三欄；sidebar 與 preview 可獨立切換、設定頁可往返、使用者右側訊息、完整新旅程 modal。保留真實資料唯讀與草稿隔離。
3. 提供明／暗／系統主題，同步 sidebar 品牌、favicon、manifest 圖示與桌面 runtime icon。固定資產白名單拒絕任意路徑。
4. 更新 Electron smoke 覆蓋新操作與兩主題，保留 startup regression；檢查原始 SVG hashes、PNG 尺寸與 manifest 資產。瀏覽器實測圖示解碼、favicon／manifest；Windows OS 與已安裝 PWA 圖示快取行為未驗不得宣稱通過。
5. 批次截圖檢查桌面／小視窗、兩主題、modal 與設定；獨立 finish review。更新原型說明與交接。

私人的參考截图只留本機；公開文件不記原截圖中的專案、個資或私人路徑。

## 驗證紀錄

- 原始 SVG SHA-256 相符；26 張 PNG 尺寸與兩組 ICO／ICNS 容器查核通過。
- `npm test`：488 項通過。真實 package entry startup smoke 通過。
- macOS Electron smoke：設定內匯入、側欄／預覽切換、右側 user bubble、草稿保留、三種主題與 Logo、新旅程 Modal 日期／想法、預覽 HTML escaping、小視窗 drawer 通過。
- 捕捉到快速連續 renderPreview 導致初次 preview 空白，改為合併同一 frame 的更新、panel 可見後再載入 srcdoc；測試同時核對 DOM 及截圖中確實有預覽內容。
- ego-browser：light/dark SVG、favicon 與 manifest 192/512 PNG 都成功解碼；system 模式模擬 light/dark，adaptive SVG 取樣像素由 [255,255,255,255] 變成 [79,79,79,255]，原 SVG 未修改。
- mechanical detector 已跑一次，無 regex findings，但缺 parser dependencies 而降級，不能據此宣稱完整樣式／對比檢查。
- Windows 原生、安裝器與已安裝 PWA 的圖示快取行為未驗；未新增真實 AI、部署或私人資料寫入能力。

## 後續架構議題

使用者詢問是否改成 monorepo；建議 npm workspaces 分開桌面 App、旅程引擎與 CLI 能力，同時保留現有 repo 更新與指令相容性。單純內容使用者不應被迫安裝桌面工具。這是下一輪架構議題，本次沒有搬移根目錄或宣稱已完成 monorepo 遷移。

## Finish review

獨立 reviewer 的判定：ship（本次桌面原型範圍）。兩個 findings 均 resolved：亮色 placeholder 改為 #666 對 #f1f1f1，5.084:1；未填回程保留 null 並顯示「回程未定」，已用實際 modal 流程驗證。這不是 Windows、真實 AI 或正式產品發版的驗收。
