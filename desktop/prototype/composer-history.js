// 輸入框 ↑／↓ 找回這段對話送出過的訊息（仿 Claude Code CLI）。
// 還沒送出的草稿在開始往上翻時先收起來，一路往下翻回底時還原；翻到的舊訊息改過的話，
// 來回翻也保留修改，直到送出為止。只有純邏輯，按鍵與輸入框在 app.js。
(root => {
  // 最新的在前；略過空白與連續重複（連按兩次送出同一句只記一筆）。
  function historyEntries(messages) {
    const entries = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      if (message?.role !== 'user' || typeof message.text !== 'string' || !message.text.trim()) continue;
      if (entries[0] !== message.text) entries.unshift(message.text);
    }
    return entries;
  }

  function createNavigator(readEntries) {
    let entries = [], index = -1, draft = '', edits = new Map();
    const shown = () => edits.has(index) ? edits.get(index) : entries[index];
    // 離開這一筆前記下目前文字；和原文相同就不算修改。
    const remember = text => { if (text === entries[index]) edits.delete(index); else edits.set(index, text); };
    return {
      get browsing() { return index >= 0; },
      up(text) {
        if (index < 0) {
          entries = readEntries();
          if (!entries.length) return null;
          draft = text; index = 0; return shown();
        }
        if (index >= entries.length - 1) return null;
        remember(text); index += 1; return shown();
      },
      down(text) {
        if (index < 0) return null;
        remember(text); index -= 1;
        if (index >= 0) return shown();
        const restored = draft; draft = ''; edits = new Map(); return restored;
      },
      reset() { entries = []; index = -1; draft = ''; edits = new Map(); },
    };
  }

  // 游標要在第一行（↑）或最後一行（↓）才翻歷史，其他時候照常在多行文字裡移動；有選取範圍時不翻。
  const caretOnFirstLine = (text, start, end) => start === end && !text.slice(0, start).includes('\n');
  const caretOnLastLine = (text, start, end) => start === end && !text.slice(end).includes('\n');

  const api = { historyEntries, createNavigator, caretOnFirstLine, caretOnLastLine };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.composerHistory = api;
})(typeof window === 'undefined' ? globalThis : window);
