// 按下後要等結果的按鈕：寬度不變，換成轉圈加「正在做什麼」，完成後還原。
// 同一顆按鈕執行中再按不會重送。和一般停用（變淡）分開，看得出「有在跑」。
(() => {
  const running = new WeakSet();
  window.withBusy = async (button, label, work) => {
    if (!button) return work();
    if (running.has(button)) return undefined;
    running.add(button);
    const saved = [...button.childNodes], wasDisabled = button.disabled;
    button.style.minWidth = button.offsetWidth ? button.offsetWidth + 'px' : '';
    const spinner = document.createElement('span');
    spinner.className = 'busy-spinner'; spinner.setAttribute('aria-hidden', 'true');
    button.replaceChildren(spinner, document.createTextNode(label || '處理中…'));
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try { return await work(); }
    finally {
      running.delete(button);
      button.replaceChildren(...saved); button.disabled = wasDisabled;
      button.removeAttribute('aria-busy'); button.style.minWidth = '';
    }
  };
})();
