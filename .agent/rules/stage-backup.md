# 階段保存與異地備份

**適用：** 行程擁有者在自己的私有 repo 規劃、維護或更新行程。這是階段完成條件，
不是「有空再做」。至少在閘門一通過後、研究完成後、第一次部署後與引擎更新驗證後執行；
底圖、照片、Maps 對帳與日常維護有新增成果也要保存。

模板作者維護公開引擎、或送公開貢獻分支，不能套用這份私有行程備份流程；
前者遵守 repo-ownership 的模板限制，後者另走 contributing-upstream 的人類閘門。

## 執行順序

以下是**有停止條件的步驟**，不能把指令整段無條件串接執行。

### 1. 保存本機 checkpoint

先完成該 skill 的內容驗證與必要的人類確認，再盤點 `git status --short`、diff 與 staged 檔案。
若有本階段進度更新，先寫完再保存；只加入這趟與本次已確認的改動，含必要的 docs/、profile、照片。
更新引擎時也保留本次 merge／migrate 的成果。不要 `git add -A` 夾帶不相關改動、秘密或忽略檔。

```
git add -- <逐一確認的檔案>
git commit -m "<本階段改動摘要>"
```

如果本次沒有檔案差異，不造空 commit，但仍要確認目前成果的異地備份狀態。
commit 失敗就保留工作檔、回報阻礙，不能稱已完成保存，更不能丟棄改動來讓它過。

### 2. 每次 push 前重新核對真正的 origin

**每次嘗試 push 都必須重新查，不能沿用開工時、上一階段或上次重試的結果。**
先核對 GitHub 帳號／repo 與本次分支是不是使用者已確認的備份目的地：

```
git remote get-url --push --all origin
git branch --show-current
```

有多個 push URL、找不到 origin、無法唯一對應到已確認的 GitHub repo、分支不明，
或發現目的地改了，就停止並問使用者，不猜、不改投 upstream／contrib。
fetch URL 不一定等於 push URL，所以不能只看 fetch remote 或 gh 的預設 repo。

接著執行 `gh repo view --json visibility` 的私有狀態查核；**實際呼叫要顯式指定剛核對的 origin repo**：

```
gh repo view <origin-owner>/<repo> --json visibility
```

只有這次查詢成功且 visibility 為 PRIVATE，目的地與分支仍未改變，才可執行下一步。
查詢失敗、gh 未登入、離線、輸出無法判讀、PUBLIC（public repo）、INTERNAL 或未知值都停止，**不要 push**。
不要為了讓檢查過而自行改 repo 的可見度。這是每次推送的前置條件，不是一次性 setup 檢查。

### 3. 僅推送到這次已驗證的 origin

```
git push origin HEAD:<已確認的分支>
```

禁止裸 `git push` 依賴預設 remote，也禁止 force。

**force 是規則層的禁止，`pre-push` hook 不會擋它。** hook 管的是「私人資料有沒有
推到公開的地方」，而 force 推到自己的私有 repo 不是那個問題——它的風險是蓋掉
遠端已有的歷史，那只有規則擋得住。所以**不要因為 hook 放行就以為 force 是允許的**。若中途切換目的地、分支或重試，回到第 2 步重查。
push 失敗就停止，保留本機成果；不為了「完成」而換 remote、強推或跳過權限檢查。

### 4. 驗證遠端，再回報完成

```
git ls-remote origin refs/heads/<已確認的分支>
```

核對遠端分支的 commit 與本次要保存的 commit 相符（可用 `git rev-parse HEAD` 取得本次提交）。
查不到或不相符就不能宣稱備份成功；也不要覆蓋別人的新提交來追求相同。
只有 push 成功且遠端核對成功，才能回報本階段完成。網站已上線、check 通過或本機 commit 成功，
都不能代替這個條件。只補備份時不要再 ship 一次。

## 條件 → 動作

下表的失敗措辭針對**本輪成果**，即使舊版曾有異地備份，也不能把舊版當成本輪已備份。

| 條件 | agent 必做 | 完成判定 |
|---|---|---|
| 查不到 visibility、gh 未登入或離線 | 停止，不 push；回報「目前只有本機備份，尚未異地備份」 | 不可回報階段完成 |
| visibility 是 PUBLIC、INTERNAL 或未知值 | 停止，不 push；回報「目前只有本機備份，尚未異地備份」 | 不可回報階段完成 |
| 之前查過 PRIVATE，但這次尚未查 | 重新查核 origin 私有狀態，尚不可 push | 不可回報階段完成 |
| push 失敗或遠端 commit 無法核對 | 停止；回報「目前只有本機備份，尚未異地備份」；重試前重查私有狀態 | 不可回報階段完成 |
| 這次 PRIVATE、push 成功且遠端 commit 核對成功 | 回報本階段與異地備份已完成 | 可回報階段完成 |

本機 commit 若也失敗，另明說「工作檔尚未成功提交」，不要假稱有可還原的 checkpoint。
這份流程仍是 agent 的**第一道**查核；另有 `.githooks/pre-push` 當 Git 推送的**最後一道**，見 repo-ownership。
兩者都要保留：規則擋不住非 agent 的推送，hook 又可被 `--no-verify` 或不執行 hooks 的工具繞過。
它們都不保證 repo 在查核後永遠保持私有；hook 放行也不等於遠端已成功備份。
