# 把改進回饋給模板

**什麼時候適用：** 使用者提出一個建議、或你在用的過程中發現引擎有問題，
而你在考慮要不要把它送回模板。

## 對外內容先由 agent 處理

回報錯誤或附診斷資料時，先讀 `.ai/rules/diagnostic-sharing.md`：由 agent 產出去識別化的
最小診斷摘要，不叫非技術使用者自己從 stack trace 找秘密。把最終文字、附件與公開目的地
交給使用者看過並確認，才執行後面的 issue／PR 對外動作。人類模板中的個資警告仍是第二道。
`contrib-check` 只檢查檔案路徑，不能替代這份摘要的內容審查。

## 先決定：issue 還是 PR

| 你手上有什麼 | 走哪條 |
|---|---|
| 一個想法、一個抱怨、一個還沒修的 bug | **issue** |
| 已經在本機改好、測試也過了，而且是**純粹的改進** | **PR** |
| 改好了，但那是設計取捨 | **issue**，附上你的 patch 當參考 |

**分不出來就開 issue。** issue 的成本對雙方都低，被退回的 PR 才貴。

## 「純粹的改進」與「設計取捨」怎麼分

**判準只有一個：這件事能不能用「現在的行為是錯的」來描述？**

- 可以 → 純粹的改進，開 PR
- 只能用「這樣比較好」來描述 → 設計取捨，開 issue

### 純粹的改進（可以直接開 PR）

- 某個輸入會讓 `check` 或 `build` 崩潰
- 錯誤訊息沒講清楚該做什麼，改成講清楚
- 文件寫的跟程式碼實際行為不一致
- 某個分支沒有測試覆蓋，補上
- 同樣的輸出但更快、或不再重複抓同一份資料
- 在某個作業系統／Node 版本上壞掉

### 設計取捨（先開 issue 問）

- 新增一個資料欄位、一個頁面區塊
- 改變任何預設值（`sections` 的開關、`basemap` 的等高線間距）
- 改變三道人類閘門的範圍
- 加一個新的相依套件
- 改檔案結構或命名
- 任何以「我覺得這樣比較好」開頭的理由

**改外觀之前先試兩個插槽**（`theme.css`、`extra.js`）。九成的需求插槽就能解決，
那些不需要動引擎，也就不需要 PR。

## PR 的硬規則：分支裡不能有任何 `trips/` 的東西

**模板的 fork 一定是公開的**，GitHub 不允許把公開 repo 的 fork 改成私有。
分支裡只要夾帶一個 `trips/` 底下的檔案，使用者的行程、訂房確認碼與私人筆記
就公開了，而且**事後刪檔案沒有用**——git 歷史還在。

推之前一定要跑：

```
npm run contrib-check
```

它檢查 `base..HEAD` 的完整新增歷史（base 預設為 `upstream/main`），不是最終 diff。
新增後刪除、改名／搬移，以及合併進來的側支與 merge commit 都會檢查。
只要歷史中有非 `_example` 的 `trips/`、`dist/` 或 `.cache/` 禁止路徑，就以**非零退出碼**拒絕；
讀不到比較基準也拒絕。檢查或測試失敗就**停止**，不得繼續 push。
`trips/_example` 是模板附的範例，屬於引擎，可以改。

**這是路徑檢查，不檢查檔案內容。** 放在引擎檔、commit 訊息或 PR 文字中的私人資訊，
仍須人工審查；也不要換成包含私人歷史的 base 來讓檢查過關。
檢查後若新增 commit、合併或改寫歷史，推送前必須重跑。

## pre-push 會再驗一次歷史

公開目的地不是一律禁止：**乾淨的引擎分支**在目的地與本次推送範圍查核通過後，兩道都會放行。
夾帶 `trips/`（`_example` 除外）的分支，`contrib-check` 與 pre-push **兩道都會擋**，新增後刪除或改名也一樣。
這不是 contrib fork 豁免；remote／repo 取任何名字都套用同一份路徑政策與掃描程式。

`contrib-check` 預先查 base..HEAD；hook 依 Git stdin 的每個 remote-sha..local-sha 再查，
所以推送其他 ref 或檢查後新增 commit，不能沿用先前許可。新分支優先用完整且乾淨的 `upstream/main`，
否則只考慮本次 stdin 已知屬於目的地的既有 ref；缺物件、shallow 或沒有可信基準就拒絕。
禁止路徑會列出路徑與至少一個涉入 commit。詳細邊界見 repo-ownership。

**agent 不得自行加 `--no-verify`、改 hooksPath 或停用 hook** 來開 PR。
測試與歷史查核通過仍不是對外送出的授權，還是要使用者看過並同意。

## 為什麼要另外 fork

使用者自己的私有 repo 是 `gh repo create` 開的，**跟模板沒有 fork 關係**，
GitHub 不接受從無關的 repo 開 PR。所以要另外 fork 一份**只拿來送 PR** 的複本：

```
gh repo fork wangch15/travel-planner --fork-name travel-planner-contrib --clone=false
git remote add contrib https://github.com/<他的帳號>/travel-planner-contrib.git
```

**不要加 `--remote=false`。** `gh` 會直接拒絕：
`the --remote flag is unsupported when a repository argument is provided`。
帶 repo 參數的時候 `gh` 本來就不會動你的 remote，所以第二行要自己補。

那個 fork 是公開的，但它**只會收到乾淨的引擎分支**，不會收到他的 `main`。

## 完整流程

**驗證範圍**（2026-09-22 實測）：

- **已驗**：`contrib-check` → pre-push hook → `git push`（新分支）→ `gh pr create`
  → PR 模板，整段在真實 GitHub 上跑通過。
- **未驗**：`gh repo fork` 與跨帳號的 `git push contrib`。

**未驗的原因是 GitHub 的硬限制，不是沒人去做**：

```
A single user account cannot own both a parent and fork.
```

模板作者的帳號擁有模板本身，所以**他永遠 fork 不了自己的 repo**，`--fork-name`
也沒用。要驗這一段必須有第二個 GitHub 帳號。

**對行程擁有者來說這不是問題**——他的帳號不擁有模板，fork 正常。
但下面兩行是照 `gh` 的說明文字寫的，作者無法實測，**第一次走這條路的人
如果卡住，請開 issue 回報**。

```
# 1. 從上游開一條乾淨的分支——不要從他自己的 main 開
git fetch upstream
git switch -c contrib-<主題> upstream/main

# 2. 只把動到引擎的 commit 挑過來
git cherry-pick <commit>

# 3. 閘門
npm run contrib-check
npm test

# 4. 使用者確認後推到公開 fork；pre-push 會再驗實際 refs 的歷史
git push contrib contrib-<主題>

# 5. 成功後建立 PR（內容仍須經使用者確認）
gh pr create -R wangch15/travel-planner --head <他的帳號>:contrib-<主題>
```

`.github/PULL_REQUEST_TEMPLATE.md` 會問你四件事，照實填。

## 永遠不做的事

- `git push upstream <任何分支>`——使用者沒有寫入權，而且那不是流程
- `git push contrib main`——他的 `main` 有 `trips/`，那個 fork 是公開的
- 在 PR 裡夾帶 `trips/`（`_example` 除外）、`dist/`、`.cache/`
- **代替使用者決定要不要送**。這是他的東西，也會掛他的名字。
  你判斷「這是純粹的改進、可以送」之後，**還是要問他一句**再送。

## 有寫入權的人：模板作者與協作者

上面整套 fork 流程是給**沒有模板寫入權**的人用的。模板作者（與他加的協作者）
有寫入權，**不需要 fork**，流程更短——但判準與閘門一樣不能省。

### 改引擎 → 在模板自己的工作目錄做，不要在行程 repo 做

```
模板的工作目錄（origin 就是 wangch15/travel-planner）
  git switch -c <主題>
  ...改、寫測試、npm test...
  git push origin <主題>            ← 推分支，不推 main
  gh pr create                      ← 開 PR
  ...review、merge...

行程 repo（origin 是自己的私有 repo）
  npm run update-check              ← 應該回報落後
  走 tp-update                      ← 用真實行程驗這個改動
```

**行程 repo 是引擎的測試場，不是開發場。** 在那裡開發引擎，每個引擎 commit
都會混進行程歷史，之後每次要往模板送都得 cherry-pick 篩一遍。改完模板之後
在行程 repo 跑 `tp-update`，用真實資料驗——那才是它的角色。

**PR 的價值是 review，不是權限。** 你本來就推得上去。開 PR 是為了有一個可以
review 的 diff——自己看一次、或交給另一個 agent 看一次——再合併。
小改動不想 review 直接推 `main` 也行，那是作者的決定。

### 做行程時撞到引擎 bug，順手修了

這才會用到上面的 cherry-pick 流程，差別只在**不用 fork**：

```
行程 repo
  ...修引擎解自己的燃眉之急，commit...
  記進 trips/<slug>/docs/engine-changes.md      ← 一定要，下次 merge 靠它
  git switch -c contrib-<主題> upstream/main    ← 從乾淨的上游開
  git cherry-pick <只動引擎的 commit>
  npm run contrib-check                         ← 閘門，擋夾帶
  git push upstream contrib-<主題>              ← 直接推模板，不用 contrib fork
  gh pr create -R wangch15/travel-planner --head contrib-<主題>
```

pre-push hook 仍然會跑：目的地是模板、而 `trips/` 有真實行程，它會檢查**這條分支
的歷史**乾不乾淨。乾淨就放行，夾帶就擋——跟朋友的路徑同一道閘門。

### 判準與朋友一樣

「現在的行為是錯的」還是「這樣比較好」的判斷、`contrib-check`、`npm test`、
改了 `.ai/` 要 `sync:agent-assets`——**一樣都要**。有寫入權省掉的只有 fork，
不是閘門。

### 兩個方向、兩條路，沒有第三條

```
模板 ──(tp-update)──▶ 行程 repo
模板 ◀──(PR)───────── 行程 repo（或模板的分支）
```

## 只想回報不想修

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板，兩個都要求填引擎版本
（`npm run update-check` 看得到）。模板是公開的，任何 GitHub 帳號都能開 issue。
