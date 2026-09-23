# Travel Planner v2 brand assets

使用者選定的 `travel-planner-mark-on-light-v2.svg` 與 `travel-planner-mark-on-dark-v2.svg` 以原始位元複製；保留 614×592 比例、透明底、曲線與漸層。`source-checksums.json` 紀錄原始 SHA-256，測試逐檔核對。未使用 CSS filter 或重新繪製標誌。

## 介面與主題

側欄、歡迎畫面、設定頁底部、外觀預覽及關於頁直接引用透明底 v2 SVG，圖片使用 `object-fit: contain`。手動亮／暗設定優先；只有「跟隨系統」會依系統外觀選檔。背景與圓角由介面元件處理，不加進原始標誌。

## 平台圖示

`export-icons.cjs` 將對應 v2 原始 SVG 以未修改的 data URI 嵌入 1024×1024 平台圖示：亮色白底、暗色 `#191919` 底；四周保留 96px，標誌在 832×832 區域等比置中，沒有拉伸或裁切。平台圖示與介面透明標誌分開引用。

- `favicon-light.svg`／`favicon-dark.svg`：上述方形圖示，依 App 生效主題切換。
- `light/`、`dark/` PNG：由 Chromium 渲染同一圖示；尺寸 16、20、24、32、40、48、64、128、180、192、256、512、1024。
- `app.ico`：16、24、32、48、64、128、256 PNG representations，供 Windows 打包。
- `macos-icon-*.png`：macOS 專用圓角圖示；1024 畫布內背景留 64px 透明外緣，896px 背景使用 200px 圓角，標誌在 736px 區域等比置中。
- `app.icns`：以 macOS 專用圓角 PNG 經 iconutil 組成標準 16/32/128/256/512 及 @2x representations，供後續 macOS 打包。
- macOS Dock 使用 `macos-icon-256.png`；其他平台視窗使用 `icon-256.png`，皆由 `nativeTheme` 選擇對應明暗版本。
- `manifest-light.webmanifest`／`manifest-dark.webmanifest`：各自引用 192／512 PNG，`purpose: any`；未宣稱 maskable。
- Apple touch icon 使用 180 PNG。

重產：repo 根目錄執行 `npm --prefix desktop/prototype run icons`。只依賴專案內的 v2 原始 SVG，不需外部設計資料夾。macOS 產出全部格式；其他平台跳過 ICNS 產生，保留已有檔案。

## 驗證範圍

已驗證：原始 SHA-256、全部 PNG 尺寸／不透明背景／標誌實際像素、favicon 內嵌原始位元、ICO／ICNS 容器；隔離的 Electron UI 驗證手動主題優先於相反系統主題及兩種跟隨系統狀態。已目視檢查亮／暗背景的 16、24、36、76、112、256px 標誌。

Windows shell、簽章安裝器與已安裝 PWA 的 OS 圖示快取切換仍待實機驗證。匯出平台檔案不代表已驗證正式安裝包。
