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
而 `trips/` 底下有非底線開頭的行程——那一定是 (a)，停下來。**

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
