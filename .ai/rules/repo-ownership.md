# 這份 repo 是誰的

**什麼時候適用：** 開工前，以及任何你要執行 `git push` 的時候。

## 規則

**模板是公開唯讀的，行程擁有者在自己的私有 repo 上工作。**

- 模板 repo（`wangch15/travel-planner`）是**公開**的，任何人都能讀、都能拿。
  引擎更新從它流向每一份複本，沒有任何東西應該流回去——除非是刻意開的 pull request。
- 行程擁有者的複本是**私有**的。`trips/<slug>/docs/` 會進 git，裡面放訂房確認碼、
  飲食限制、門鎖密碼這些東西（見 `privacy.md`），所以那個 repo 一定要是私有的。

## 開工前先確認

```
git remote -v
```

- `origin` 必須是**使用者自己的私有 repo**。
- `upstream` 必須是 `wangch15/travel-planner`。

`upstream` 沒接好，以後就拿不到引擎更新；照下面「取得專案的正確方式」補上。

## 每次備份 push 前都要重新查

開工時檢查過不算下一次推送的許可。**每次 push 前**都要依 `.ai/rules/stage-backup.md`
重新核對 origin 的實際 push URL，並對那個 repo 執行 `gh repo view --json visibility` 查核
（顯式指定 origin 的 owner/repo，不能誤查 upstream）。
只有本次成功得到 PRIVATE 才能 push；查不到、gh 未登入、非私有或離線都停下來，不推送。
回報「目前只有本機備份，尚未異地備份」，直到推送與遠端 commit 核對都成功才算階段完成。

### `origin` 是 `wangch15/travel-planner` 的時候

這有兩種可能，**先分清楚是哪一種再動手**：

**(a) 使用者要做自己的行程** → 走錯路了，停下來。
那代表當初是直接 clone 就開始做，行程資料會 commit 進一份公開模板的工作目錄裡。
推不上去（沒有寫入權），但那些 commit 會一直卡在本機，而且使用者的私有備份
根本不存在。照下面「取得專案的正確方式」補建自己的 repo，再把現有的 commit 推上去。

**(b) 使用者就是模板作者，正在維護引擎本身**（改 `src/`、`scripts/`、`.ai/`、文件）
→ 這是正常的，繼續做。但 `trips/` 底下只能有 `_example`（見下一節）。

分不出來是哪一種就問使用者一句。**有一個情況不用問：`origin` 是模板、
而 `trips/` 底下有 `_example` 以外的東西（包括 `_archived/` 封存的旅程）——那一定是 (a)，停下來。**

## 取得專案的正確方式

```
git clone https://github.com/wangch15/travel-planner.git
cd travel-planner
git remote rename origin upstream
gh repo create travel-planner --private --source=. --remote=origin
```

建立 repo 與推送分開，不用 create 的隱含 push。跑完驗一次 `git remote -v`，
再依 `.ai/rules/stage-backup.md` 重新核對真正的 origin 私有狀態，通過才推送並核對遠端 commit。
任一步失敗就停止，不能把建立 repo 當成已備份；成功才往下走。

**不要用 fork。** 公開 repo 的 fork **一定是公開的**，GitHub 不允許把它改成私有。
用 fork 等於把使用者的行程、`docs/` 裡的訂房資訊與私人筆記放上公開的 GitHub。

**不要用「Use this template」。** 它可以選私有，但會開一條全新的 git 歷史，
之後 `git merge upstream/main` 要 `--allow-unrelated-histories`，每個檔案都衝突——
這個 repo 的引擎／內容邊界就是為了讓那個 merge 乾淨才設計的。

## 模板 repo 裡不放任何真實行程

**如果你現在就在模板 repo（`origin` 是 `wangch15/travel-planner`）裡工作——
包含模板作者本人——`trips/` 底下只能有 `_example`。**

模板作者自己的行程也走上面那條路：另一個私有 repo。模板 repo 是公開的，
任何 commit 進去的行程資料都會公開，而且 git 歷史刪不掉。

## 最後一道 pre-push

`.githooks/pre-push` 由 `npm install` 的 prepare 安裝：設定本 repo 的 `core.hooksPath` 為 `.githooks`。
引擎更新時 hook 檔案會隨 merge 流入複本；既有使用者也要跑 npm install 並確認安裝結果。

hook 直接使用 Git argv 給的 remote URL，不會重新查 remote 設定。只有明確可解析的 github.com
HTTPS／git SSH URL 才能查核；不支援的 SSH alias、其他主機或含憑證的 URL 會拒絕，不猜目的地。
它每次都查可見度，不管只改 README、新增／強推分支，或刪除分支的全零 refs；不快取許可。
PUBLIC 才依 stdin 掃描完整新增歷史，PRIVATE 不掃，因為私人行程本來就應備份到私有 repo。

- 目的地是 `wangch15/travel-planner`：只有工作目錄 trips/ 底下除了 `_example` 以外沒有其他項目（隱藏檔除外）才允許。
  `trips/_archived/`（App 封存的旅程）與 `trips/_profile.md` 雖然是底線開頭，也是行程擁有者的資料，一樣會擋。
  這個例外只判斷目錄，不是歷史資料掃描，也不是模板帳號所有權驗證；模板仍只能放 `_example`。
- 其他目的地：對 URL 指定的 owner/repo 執行 gh 可見度查核，10 秒逾時即拒絕。
  PUBLIC 時仍提醒既有 repo 內容已公開，可能含訂房資訊；本次放行不代表舊資料乾淨，也不會撤回外洩資料。

PUBLIC 對每個更新使用 `remote-sha..local-sha`，不是工作目錄 HEAD 或最終 diff；多 ref 任一失敗就整批拒絕。
新分支的 remote-sha 全零時，優先使用 `refs/remotes/upstream/main`，先驗其完整歷史沒有禁止路徑，
避免誤把私人基準排除；沒有該 ref 時，只考慮本次 stdin 已知的目的地既有非零 remote SHA。
不猜其他 remote-tracking ref，也不因名稱像 contrib 就放行。基準／tip 物件缺漏、shallow 或無法讀取完整範圍就拒絕。
刪除分支沒有新增歷史，但仍查目的地：PUBLIC／PRIVATE 查核成功可刪，INTERNAL／未知／查核失敗仍拒絕。

歷史掃描與禁止路徑政策直接共用 contrib-check：非 `_example` 的 trips/、trips/_profile.md、dist/、各層 .cache/ 都擋，
包含新增後刪除、改名搬走及合併歷史。訊息列違規路徑與至少一個涉入 commit，不是只說「PUBLIC 不行」。

| 條件 | hook 動作 | 結果 |
|---|---|---|
| 其他目的地為 INTERNAL、未知或查核失敗 | 拒絕，說明原因及下一步 | 目前只有本機備份，尚未異地備份 |
| 其他目的地本次查核為 PRIVATE | 允許這次推送，之後仍須核對備份結果 | 不快取許可 |
| PUBLIC 且推送範圍可信、歷史乾淨 | 允許乾淨引擎歷史，不依 repo 名稱豁免 | 提醒舊資料仍可能已公開 |
| PUBLIC 且含禁止路徑 | 整批拒絕，列出路徑與 commit | 目前只有本機備份，尚未異地備份 |
| PUBLIC 但範圍或完整歷史無法確認 | 拒絕，不把掃不到當成乾淨 | 取得可信基準後再查核 |

`.ai/rules/stage-backup.md` 仍是第一道，不能因有 hook 就省略 agent 的每次查核。
**hook 不是萬無一失，`--no-verify` 就能繞過；它防不小心，不防刻意。** agent 不得自行繞過或停用。
若工具不執行 Git hooks、直接走 API，或尚未安裝／被改掉 hooksPath，也沒有這道保護；不能保證每款桌面工具都會攔。
查核後 repo 可見度仍可能被人更改，hook 不是持續監控或能撤回資料的機制。

## 永遠不做的事

- `git push upstream <任何分支>`
- 把任何真實行程 commit 進模板 repo
- 把行程擁有者的 repo 設成公開

要回報問題或提功能建議，開 issue（模板是公開的，任何 GitHub 帳號都能開）：

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板。

## 為什麼

模板作者維護引擎，每個行程擁有者維護自己的 `trips/<slug>/`。
公開的模板加上私有的複本，讓兩件事同時成立：引擎更新可以流向所有人，
而沒有人的行程資料會流向任何人。
