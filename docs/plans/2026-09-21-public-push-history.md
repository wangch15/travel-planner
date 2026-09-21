# Public push history Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** PUBLIC 目的地掃實際推送歷史，允許乾淨引擎分支，拒絕私人路徑；不以 fork/remote 命名豁免。

**Architecture:** 抽出 contrib-check 的 classifyPaths 與 git log 掃描為共用 contribution-history 模組，回傳違規路徑與 commit。push-history 只負責 stdin refs、base 選擇及多 ref 彙整。既有 remote SHA 使用 remote..local；新分支優先使用本機 refs/remotes/upstream/main（先確認完整歷史沒有禁止路徑），否則只使用本次 stdin 已知屬於目的地的非零 remote SHA。沒有可信 base 或缺物件／shallow 就拒絕，不猜其他 remote-tracking refs。

**Tech Stack:** Node.js、Git sandbox、gh 替身、文件契約與實際程式變異測試。

## TDD

1. tests/public-push-history.test.js 先紅：乾淨公開分支、新增後刪除／改名／合併、PRIVATE 不掃、指定 ref 非 HEAD、新分支有／無 base、多 ref、刪除、缺物件、tag、shallow。
2. tests/contrib-check.test.js 加 commit 診斷与根目錄 .cache 回歸，先紅。
3. 實作共用掃描（保留 --format= --name-only -z --no-renames -m --root），只在有違規路徑時用 literal pathspec 查該路徑的 commit。所有 Git 錯誤 fail closed。
4. PUBLIC hook 呼叫同一掃描。PRIVATE 不掃；INTERNAL／未知／登入／逾時維持拒絕。刪除不傳新歷史，但仍查目的地；PUBLIC 允許已查核的刪除。任何其他 ref 失敗整批拒絕。
5. 更新舊測試的 PUBLIC 政策，保留原防護意圖。實際修改 sandbox 模組製造兩個 mutant（範圍失敗放行、拿掉掃描），確認契約測試抓得到。
6. 文件先紅後修：恢復貢獻流程，不提供 --no-verify／hooksPath 繞過；保留 fork→push→PR 未端到端驗證。
7. 同步 .ai/ 產物、完整隔離 npm test、diff 檢查、commit 与 review 報告。

## 邊界

不推送真實 GitHub、不 fork、不開 PR、不部署、不動工作目錄 trips/。
既有本機整合測試只使用 gh／SSH 替身及暫存 bare repo；不代表真實 GitHub 貢獻流程已驗證。
路徑檢查不是內容去識別化，也不能撤回已公開的歷史。新分支基準不猜 origin/main 或同名 tracking ref。
