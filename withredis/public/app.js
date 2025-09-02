const el=document.getElementById('log');
const status=document.getElementById('status');
const btn=document.getElementById('btn');

let paused=false;
const MAX_LINES=100;
btn.onclick=()=>{paused=!paused;btn.textContent=paused?'Resume':'Pause';}

function appendLine(text, cls='line'){
    const div=document.createElement('div');
    div.textContent=text;
    div.className=cls;
    el.appendChild(div);
    while(el.children.length>MAX_LINES) el.removeChild(el.firstChild);
    if(!paused) el.scrollTop=el.scrollHeight;
}

function connect(){
    const ws=new WebSocket(`ws://localhost:3000/stream`);
    ws.onopen=()=>console.log('WS open');
    ws.onclose=()=>{
        console.log('WS closed, retry in 3s');
        setTimeout(connect,3000);
    }
    ws.onmessage=(ev)=>{
        const mg=JSON.parse(ev.data||`{}`);
        if(mg.type==='line'){
            appendLine(mg.text);
        }else if(mg.type==='seed'){
            (mg.lines||[]).forEach(l=>appendLine(l));
        }else if(mg.type==='info'){
            appendLine(`--- ${mg.note} ---`,'info');
        }
    }
}

connect();