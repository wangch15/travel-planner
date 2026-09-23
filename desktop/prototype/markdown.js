// Small, text-only Markdown renderer: never interprets embedded HTML.
function renderMarkdown(target,text){
  target.replaceChildren();const lines=String(text).split(/\r?\n/);let i=0;
  function inline(parent,value){
    const pattern=/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;let start=0;
    for(const match of value.matchAll(pattern)){
      parent.append(document.createTextNode(value.slice(start,match.index)));const token=match[0];let node;
      if(token[0]==='`'){node=document.createElement('code');node.textContent=token.slice(1,-1);}
      else if(token.startsWith('**')){node=document.createElement('strong');node.textContent=token.slice(2,-2);}
      else{const parts=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);node=document.createElement('button');node.className='inline-link';node.textContent=parts[1];node.title=parts[2];node.onclick=()=>window.travelDesktop?.feature('open-link',{url:parts[2]});}
      parent.append(node);start=match.index+token.length;
    }parent.append(document.createTextNode(value.slice(start)));
  }
  const cellParts=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
  while(i<lines.length){const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(line.startsWith('```')){const pre=document.createElement('pre'),code=document.createElement('code');i++;const block=[];while(i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i++]);if(i<lines.length)i++;code.textContent=block.join('\n');pre.append(code);target.append(pre);continue;}
    if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      const wrap=document.createElement('div');wrap.className='message-table';const table=document.createElement('table'),head=document.createElement('tr');for(const cell of cellParts(line)){const th=document.createElement('th');inline(th,cell);head.append(th);}table.append(head);i+=2;
      while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()){const row=document.createElement('tr');for(const cell of cellParts(lines[i++])){const td=document.createElement('td');inline(td,cell);row.append(td);}table.append(row);}wrap.append(table);target.append(wrap);continue;
    }
    const heading=/^(#{1,4})\s+(.+)$/.exec(line);if(heading){const h=document.createElement('h'+Math.min(heading[1].length+1,5));inline(h,heading[2]);target.append(h);i++;continue;}
    const list=/^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(line);if(list){const numbered=/^\s*\d/.test(line),ul=document.createElement(numbered?'ol':'ul');while(i<lines.length){const m=/^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(lines[i]);if(!m)break;const li=document.createElement('li');inline(li,m[1]);ul.append(li);i++;}target.append(ul);continue;}
    const p=document.createElement('p');inline(p,line);target.append(p);i++;
  }
}
window.renderMarkdown=renderMarkdown;
