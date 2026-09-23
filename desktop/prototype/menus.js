/* One top-layer action menu shared by sidebar, context and chat actions. */
(() => {
  let menu, trigger;
  const close=(restore=true)=>{if(!menu)return;menu.hidePopover();menu.remove();menu=null;if(trigger?.isConnected){trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}trigger=null;};
  window.closeActionMenu=close;
  window.openActionMenu=(anchor,items,event)=>{
    event?.preventDefault();
    if(menu&&trigger===anchor&&event?.type!=='contextmenu'){close();return;}
    close(false);trigger=anchor;anchor.setAttribute('aria-expanded','true');
    menu=document.createElement('div');menu.className='action-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');menu.setAttribute('aria-label',anchor.getAttribute('aria-label')||'更多操作');
    for(const item of items){if(item.separator){const line=document.createElement('div');line.className='menu-separator';line.setAttribute('role','separator');menu.append(line);continue;}
      const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.disabled=Boolean(item.disabled);b.tabIndex=-1;if(item.danger)b.className='danger';
      if(item.icon){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+item.icon);svg.append(use);b.append(svg);}
      const text=document.createElement('span');text.textContent=item.label;b.append(text);b.onclick=()=>{close();Promise.resolve().then(item.action).catch(e=>window.notify?.(e.message||'操作未完成'));};menu.append(b);
    }
    document.body.append(menu);menu.showPopover();const rect=anchor.getBoundingClientRect();const x=event?.type==='contextmenu'?event.clientX:rect.right-menu.offsetWidth;const y=event?.type==='contextmenu'?event.clientY:rect.bottom+5;
    menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
    const buttons=()=>[...menu.querySelectorAll('button:not(:disabled)')];buttons()[0]?.focus();
    menu.onkeydown=e=>{const all=buttons(),i=all.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){close(false);}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?all.length-1:(i+(e.key==='ArrowDown'?1:-1)+all.length)%all.length;all[index]?.focus();}};
    const openedMenu=menu;openedMenu.addEventListener('toggle',e=>{if(e.newState==='closed'&&menu===openedMenu){menu=null;openedMenu.remove();trigger?.setAttribute('aria-expanded','false');trigger=null;}});
  };
  // Own dismissal so the browser cannot light-dismiss on pointerdown and then
  // make the trigger's click reopen the same menu. Keep native top-layer placement.
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!trigger?.contains(e.target))close(false);},true);
  document.addEventListener('keydown',e=>{if(menu&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}},true);
  window.addEventListener('resize',()=>close(false));document.addEventListener('scroll',()=>close(false),true);
})();
