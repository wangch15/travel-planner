# Pre-push destination guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 對有執行 Git hooks 的推送加最後一道目的地檢查，涵蓋 agent 以外工具，不依 ref 更新內容略過查核。

**Architecture:** .githooks/pre-push 是可執行 POSIX sh 薄入口（缺 Node 也給白話拒絕），呼叫 scripts/pre-push.js。判斷放 scripts/lib/pre-push.js，直接使用 Git argv URL；其他 GitHub repo 每次以具逾時的 gh 查 PRIVATE。模板目的地例外只看工作目錄 trips/ 非底線目錄，不能冒充完整歷史掃描。prepare 的 installer 只寫 repo-local core.hooksPath，不蓋已有其他設定。

**Tech Stack:** Node.js、POSIX sh、Git、gh runner 替身、Node test。

## 步驟

1. tests/pre-push.test.js 先紅：模板有／無實際行程、私有／公開／INTERNAL、登入／格式／逾時失敗、刪除 refs、README-only、新分支、每次都查、argv URL 不依 remote 名稱改變、未知 URL 拒絕。
2. tests/install-hooks.test.js 先紅：prepare script、非 repo／無 git 靜默跳過、新 repo 設定 .githooks、既有設定不覆蓋、重跑冪等。
3. 實作 scripts/lib/pre-push.js、scripts/pre-push.js、.githooks/pre-push（100755）與 scripts/install-hooks.js。gh 固定 10 秒上限，CLI 無互動，沒有任何自訂 bypass。
4. 本機整合測試：以真實來源 hook／installer 和 prepare script 建最小無相依 fixture repo，clone 後實際 npm install。GitHub SSH URL 經測試 SSH 替身只連本機 bare repo，gh 替身回 PUBLIC；真正 git push 必須被 hook 擋住且遠端 refs 不變，再用 PRIVATE 作正向對照。測試不會連 GitHub。
5. 文件先紅：保留 stage-backup 第一道；說明 --no-verify、未安裝／其他 hooksPath、工具不執行 Git hook 時的限制。公開 contrib fork 同樣會被拒絕，不另設例外，也不叫 agent 自行繞過。
6. .ai/ 同步、完整隔離 npm test、diff 檢查、提交與交付報告。

## 不做

不對真實 GitHub push、不部署、不 fork、不開 PR、不動工作目錄 trips/，不新增 push 指令或改 public/private。
不掃 ref commit 範圍，不依有沒有 trips 改動決定查核，不做可見度快取，不以 repo 內 origin 配置取代 hook argv。
只攔不小心，不聲稱防刻意繞過；不聲稱所有桌面工具都一定執行 Git hooks。
