# 這份 repo 是誰的

**什麼時候適用：** 開工前，以及任何你要執行 `git push` 的時候。

## 規則

**行程擁有者在自己的 fork 上工作，永遠不 push 到模板。**

模板 repo（`wangch15/travel-planner`）只進不出：引擎更新從它流向每個 fork，
沒有任何東西應該從 fork 流回去——除非是刻意開的 pull request。

## 開工前先確認

```
git remote -v
```

- `origin` 必須是**使用者自己的** fork。
- `upstream` 必須是 `wangch15/travel-planner`。

**如果 `origin` 是 `wangch15/travel-planner`，立刻停下來。**
這代表當初是 clone 而不是 fork，之後每一次 commit 都會推進模板作者的 repo。
被加為協作者的人**有寫入權限**，所以這件事不會報錯、會直接成功——正因為不會
報錯，你必須自己檢查。

修法：走 `tp-setup` 第 3 步重新 fork，或直接改 remote：

```
gh repo fork wangch15/travel-planner --remote=false --clone=false
git remote rename origin upstream
git remote add origin https://github.com/<使用者的帳號>/travel-planner.git
git remote -v
```

## 永遠不做的事

- `git push upstream <任何分支>`
- `git push --force` 到任何不是使用者自己 fork 的地方
- 直接修改模板 repo 的內容

要回報問題或提功能建議，開 issue：

```
gh issue create -R wangch15/travel-planner
```

`.github/ISSUE_TEMPLATE/` 有 bug 與功能建議兩個模板。

## 為什麼

模板作者維護引擎，每個行程擁有者維護自己的 `trips/<slug>/`。
一旦有人的行程資料進了模板 repo，別人 `git merge upstream/main` 就會拿到
陌生人的行程，邊界就破了。
