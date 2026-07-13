
'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const readyText = document.getElementById('readyText');
const startBtn = document.getElementById('startBtn');
const newGameBtn = document.getElementById('newGameBtn');
const pauseBtn = document.getElementById('pauseBtn');
const soundBtn = document.getElementById('soundBtn');
const installBtn = document.getElementById('installBtn');
const directionLabel = document.getElementById('directionLabel');

const TILE=20, COLS=28, ROWS=31;
canvas.width=COLS*TILE; canvas.height=ROWS*TILE;

const MAP_TEMPLATE=[
"############################",
"#............##............#",
"#.####.#####.##.#####.####.#",
"#o####.#####.##.#####.####o#",
"#.####.#####.##.#####.####.#",
"#..........................#",
"#.####.##.########.##.####.#",
"#.####.##.########.##.####.#",
"#......##....##....##......#",
"######.##### ## #####.######",
"     #.##### ## #####.#     ",
"     #.##          ##.#     ",
"     #.## ###--### ##.#     ",
"######.## #      # ##.######",
"      .   #      #   .      ",
"######.## #      # ##.######",
"     #.## ######## ##.#     ",
"     #.##          ##.#     ",
"     #.## ######## ##.#     ",
"######.## ######## ##.######",
"#............##............#",
"#.####.#####.##.#####.####.#",
"#.####.#####.##.#####.####.#",
"#o..##................##..o#",
"###.##.##.########.##.##.###",
"###.##.##.########.##.##.###",
"#......##....##....##......#",
"#.##########.##.##########.#",
"#.##########.##.##########.#",
"#..........................#",
"############################"
];

const DIR={
 left:{dc:-1,dr:0,a:Math.PI},
 right:{dc:1,dr:0,a:0},
 up:{dc:0,dr:-1,a:-Math.PI/2},
 down:{dc:0,dr:1,a:Math.PI/2}
};
const DIR_NAMES=['left','right','up','down'];

let map=[],pelletsLeft=0,score=0,level=1,lives=3;
let highScore=Number(localStorage.getItem('mazeMunch21High')||0);
let running=false,paused=false,acceptingInput=false,lastTime=0;
let powerTimer=0,roundClock=0,freezeTimer=0;
let audioEnabled=true,deferredPrompt=null;

function actor(c,r,dir,speed){
  return {c,r,fromC:c,fromR:r,toC:c,toR:r,progress:1,dir,wanted:dir,speed};
}
const player=actor(13,23,'left',5.0);

const ghostDefs=[
 {c:13,r:14,color:'#ff5b67',corner:{c:26,r:1},delay:.4},
 {c:12,r:14,color:'#ff6fce',corner:{c:1,r:1},delay:2.2},
 {c:14,r:14,color:'#4ceaff',corner:{c:26,r:29},delay:4.2},
 {c:13,r:15,color:'#a7ed63',corner:{c:1,r:29},delay:6.2}
];
const ghosts=ghostDefs.map((d,i)=>({
 ...actor(d.c,d.r,'up',3.65),
 index:i,color:d.color,corner:d.corner,homeC:d.c,homeR:d.r,
 releaseDelay:d.delay,released:false,route:[],routeIndex:0
}));

function cloneMap(){
  map=MAP_TEMPLATE.map(r=>r.split(''));
  pelletsLeft=0;
  for(const row of map)for(const c of row)if(c==='.'||c==='o')pelletsLeft++;
}
function resetActor(a,c,r,dir){
  a.c=c;a.r=r;a.fromC=c;a.fromR=r;a.toC=c;a.toR=r;a.progress=1;a.dir=dir;a.wanted=dir;
}
function buildExitRoute(g){
  const route=[];
  if(g.c!==13) route.push({c:13,r:g.r});
  if(g.r===15) route.push({c:13,r:14});
  route.push({c:13,r:13},{c:13,r:12},{c:13,r:11});
  g.route=route;g.routeIndex=0;
}
function resetActors(){
  resetActor(player,13,23,'left');
  ghosts.forEach((g,i)=>{
    const d=ghostDefs[i];
    resetActor(g,d.c,d.r,'up');
    g.released=false;g.releaseDelay=d.delay;buildExitRoute(g);
  });
  powerTimer=0;roundClock=0;
}
function startGame(){
  score=0;level=1;lives=3;paused=false;running=true;acceptingInput=false;
  cloneMap();resetActors();updateHud();
  overlay.classList.remove('visible');showReady(1.0);
  lastTime=performance.now();requestAnimationFrame(loop);
}
function showReady(seconds){
  freezeTimer=seconds;acceptingInput=false;readyText.classList.add('show');
}
function finishReady(){readyText.classList.remove('show');acceptingInput=true}
function updateHud(){
  highScore=Math.max(highScore,score);
  localStorage.setItem('mazeMunch21High',String(highScore));
  scoreEl.textContent=String(score).padStart(6,'0');
  highScoreEl.textContent=String(highScore).padStart(6,'0');
  levelEl.textContent=String(level).padStart(2,'0');
  livesEl.textContent='●'.repeat(Math.max(0,lives));
}
function mapValue(c,r){
  if(r<0||r>=ROWS)return'#';
  if(c<0||c>=COLS)return r===14?' ':'#';
  return map[r][c];
}
function isOpen(c,r,allowGate=false){
  const v=mapValue(c,r);
  return v!=='#'&&(allowGate||v!=='-');
}
function wrapped(c,r){
  if(r===14&&c<0)return{c:COLS-1,r};
  if(r===14&&c>=COLS)return{c:0,r};
  return{c,r};
}
function nextTile(c,r,name){
  const d=DIR[name];return wrapped(c+d.dc,r+d.dr);
}
function canGo(c,r,name,allowGate=false){
  const n=nextTile(c,r,name);return isOpen(n.c,n.r,allowGate);
}
function beginStep(a,name,allowGate=false){
  if(!canGo(a.c,a.r,name,allowGate))return false;
  const n=nextTile(a.c,a.r,name);
  a.dir=name;a.fromC=a.c;a.fromR=a.r;a.toC=n.c;a.toR=n.r;a.progress=0;
  return true;
}
function advanceStep(a,dt,onArrive){
  if(a.progress>=1)return;
  a.progress+=a.speed*dt;
  if(a.progress>=1){
    a.progress=1;a.c=a.toC;a.r=a.toR;
    if(onArrive)onArrive(a);
  }
}
function renderPos(a){
  let fc=a.fromC,tc=a.toC;
  if(a.fromR===14&&a.toR===14){
    if(a.fromC===0&&a.toC===COLS-1)fc=COLS;
    if(a.fromC===COLS-1&&a.toC===0)tc=COLS;
  }
  let c=fc+(tc-fc)*a.progress;
  if(c<0)c+=COLS;if(c>=COLS)c-=COLS;
  const r=a.fromR+(a.toR-a.fromR)*a.progress;
  return{x:(c+.5)*TILE,y:(r+.5)*TILE};
}
function eatCurrentTile(){
  const v=mapValue(player.c,player.r);
  if(v==='.'||v==='o'){
    map[player.r][player.c]=' ';pelletsLeft--;
    score+=v==='o'?50:10;
    if(v==='o'){powerTimer=7;beep(680,.07)}
    else beep(250,.015,'square',.012);
    updateHud();
    if(pelletsLeft<=0){
      level++;cloneMap();resetActors();updateHud();showReady(1);
      beep(660,.06);setTimeout(()=>beep(880,.09),80);
    }
  }
}
function choosePlayerStep(){
  if(beginStep(player,player.wanted))return;
  beginStep(player,player.dir);
}
function updatePlayer(dt){
  if(player.progress>=1)choosePlayerStep();
  advanceStep(player,dt,()=>eatCurrentTile());
}
function opposite(a,b){
  return(a==='left'&&b==='right')||(a==='right'&&b==='left')||
        (a==='up'&&b==='down')||(a==='down'&&b==='up');
}
function chooseGhostDir(g){
  let choices=DIR_NAMES.filter(n=>canGo(g.c,g.r,n)&&!opposite(n,g.dir));
  if(!choices.length)choices=DIR_NAMES.filter(n=>canGo(g.c,g.r,n));
  const pp=renderPos(player);
  const target=powerTimer>0?g.corner:{c:pp.x/TILE-.5,r:pp.y/TILE-.5};
  choices.sort((a,b)=>{
    const na=nextTile(g.c,g.r,a),nb=nextTile(g.c,g.r,b);
    return Math.hypot(na.c-target.c,na.r-target.r)-Math.hypot(nb.c-target.c,nb.r-target.r);
  });
  if(powerTimer>0)choices.reverse();
  if(Math.random()<.1)return choices[Math.floor(Math.random()*choices.length)]||g.dir;
  return choices[0]||g.dir;
}
function beginGhostRouteStep(g){
  if(g.routeIndex>=g.route.length){
    g.released=true;
    const out=g.index%2?'left':'right';
    if(!beginStep(g,out))beginStep(g,'left')||beginStep(g,'right');
    return;
  }
  const t=g.route[g.routeIndex++];
  g.fromC=g.c;g.fromR=g.r;g.toC=t.c;g.toR=t.r;g.progress=0;
  if(t.c>g.c)g.dir='right';else if(t.c<g.c)g.dir='left';
  else if(t.r<g.r)g.dir='up';else g.dir='down';
}
function resetGhost(g){
  resetActor(g,g.homeC,g.homeR,'up');
  g.released=false;g.releaseDelay=roundClock+1.2;buildExitRoute(g);
}
function updateGhost(g,dt){
  if(!g.released){
    if(roundClock<g.releaseDelay)return;
    if(g.progress>=1)beginGhostRouteStep(g);
    advanceStep(g,dt);
    return;
  }
  if(g.progress>=1){
    const dir=chooseGhostDir(g);
    beginStep(g,dir);
  }
  advanceStep(g,dt);
}
function loseLife(){
  lives--;updateHud();beep(110,.28,'sawtooth',.05);
  if(lives<=0){
    running=false;acceptingInput=false;
    overlayTitle.textContent='GAME OVER';
    overlayText.innerHTML=`Final score: <strong>${score}</strong><br>Press below to play again.`;
    startBtn.textContent='PLAY AGAIN';overlay.classList.add('visible');
  }else{
    resetActors();showReady(1);
  }
}
function checkCollisions(){
  const p=renderPos(player);
  for(const g of ghosts){
    const q=renderPos(g);
    if(Math.hypot(q.x-p.x,q.y-p.y)<13){
      if(powerTimer>0){score+=200;updateHud();beep(980,.08);resetGhost(g)}
      else{loseLife();return}
    }
  }
}
function update(dt){
  if(freezeTimer>0){
    freezeTimer-=dt;if(freezeTimer<=0)finishReady();return;
  }
  if(!acceptingInput)return;
  powerTimer=Math.max(0,powerTimer-dt);
  roundClock+=dt;
  updatePlayer(dt);
  ghosts.forEach(g=>updateGhost(g,dt));
  checkCollisions();
}
function drawMaze(){
  ctx.fillStyle='#020309';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const x=c*TILE,y=r*TILE,v=map[r][c];
    if(v==='#'){
      const grad=ctx.createLinearGradient(x,y,x+TILE,y+TILE);
      grad.addColorStop(0,'#17336d');grad.addColorStop(1,'#0b1744');
      ctx.fillStyle=grad;ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
      ctx.strokeStyle='#3975ff';ctx.lineWidth=1.6;ctx.shadowColor='#245cff';ctx.shadowBlur=4;
      ctx.strokeRect(x+3,y+3,TILE-6,TILE-6);ctx.shadowBlur=0;
    }else if(v==='.'){
      ctx.fillStyle='#ffd4a0';ctx.beginPath();ctx.arc(x+10,y+10,2.05,0,Math.PI*2);ctx.fill();
    }else if(v==='o'){
      const p=4.6+Math.sin(performance.now()/120)*1.1;
      ctx.fillStyle='#4ceaff';ctx.shadowColor='#4ceaff';ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(x+10,y+10,p,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }else if(v==='-'){
      ctx.strokeStyle='#ff6fce';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+10);ctx.lineTo(x+20,y+10);ctx.stroke();
    }
  }
}
function drawPlayer(){
  const p=renderPos(player),mouth=.07+(Math.sin(performance.now()/70)+1)*.12;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(DIR[player.dir].a);
  ctx.fillStyle='#ffda4e';ctx.shadowColor='#ffda4e';ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,9,mouth,Math.PI*2-mouth);ctx.closePath();ctx.fill();
  ctx.restore();ctx.shadowBlur=0;
}
function drawGhost(g){
  const p=renderPos(g),fright=powerTimer>0;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle=fright?'#315cff':g.color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;
  ctx.beginPath();ctx.arc(0,-2,8,Math.PI,0);ctx.lineTo(8,7);ctx.lineTo(4,4);ctx.lineTo(0,7);
  ctx.lineTo(-4,4);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-3,-2,2.5,0,Math.PI*2);ctx.arc(3,-2,2.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=fright?'#fff':'#16204c';
  ctx.beginPath();ctx.arc(-3,-2,1.1,0,Math.PI*2);ctx.arc(3,-2,1.1,0,Math.PI*2);ctx.fill();ctx.restore();
}
function draw(){
  drawMaze();drawPlayer();ghosts.forEach(drawGhost);
  if(paused){
    ctx.fillStyle='rgba(2,3,9,.76)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.font='900 38px system-ui';ctx.textAlign='center';
    ctx.fillText('PAUSED',canvas.width/2,canvas.height/2);
  }
}
function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.033);lastTime=now;
  if(!paused)update(dt);draw();requestAnimationFrame(loop);
}
function setDirection(name){
  if(!DIR[name])return;
  player.wanted=name;directionLabel.textContent=name.toUpperCase();
}

/* Virtual joystick */
const joystick=document.getElementById('joystick');
const knob=document.getElementById('joystickKnob');
let joyId=null;
function moveJoystick(x,y){
  const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let dx=x-cx,dy=y-cy;const max=r.width*.28,dist=Math.hypot(dx,dy);
  if(dist>max){dx=dx/dist*max;dy=dy/dist*max}
  knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
  if(Math.hypot(dx,dy)>10)setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
}
joystick.addEventListener('pointerdown',e=>{
  e.preventDefault();joyId=e.pointerId;joystick.setPointerCapture(e.pointerId);
  joystick.classList.add('active');moveJoystick(e.clientX,e.clientY)
});
joystick.addEventListener('pointermove',e=>{
  if(e.pointerId===joyId){e.preventDefault();moveJoystick(e.clientX,e.clientY)}
});
function releaseJoy(e){
  if(joyId!==null&&e.pointerId!==joyId)return;
  joyId=null;joystick.classList.remove('active');
  knob.style.transform='translate(-50%,-50%)';directionLabel.textContent='JOYSTICK'
}
joystick.addEventListener('pointerup',releaseJoy);
joystick.addEventListener('pointercancel',releaseJoy);

window.addEventListener('keydown',e=>{
  const m={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',
           ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
  if(m[e.key]){e.preventDefault();setDirection(m[e.key])}
  if(e.key===' ')togglePause();
});
let swipe=null;
canvas.addEventListener('touchstart',e=>{
  const t=e.changedTouches[0];swipe={x:t.clientX,y:t.clientY}
},{passive:true});
canvas.addEventListener('touchend',e=>{
  if(!swipe)return;
  const t=e.changedTouches[0],dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;
  if(Math.hypot(dx,dy)>18)setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
  swipe=null
},{passive:true});

function togglePause(){
  if(!running)return;paused=!paused;pauseBtn.textContent=paused?'▶':'Ⅱ';beep(paused?170:430,.05)
}
pauseBtn.addEventListener('click',togglePause);
soundBtn.addEventListener('click',()=>{audioEnabled=!audioEnabled;soundBtn.textContent=audioEnabled?'🔊':'🔇'});
startBtn.addEventListener('click',startGame);
newGameBtn.addEventListener('click',startGame);

let audioCtx;
function beep(freq,duration,type='sine',gain=.035){
  if(!audioEnabled)return;
  try{
    audioCtx||=new(window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.value=freq;g.gain.value=gain;o.connect(g);g.connect(audioCtx.destination);
    o.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);
    o.stop(audioCtx.currentTime+duration)
  }catch{}
}
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;installBtn.hidden=false
});
installBtn.addEventListener('click',async()=>{
  if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;
  deferredPrompt=null;installBtn.hidden=true
});
if('serviceWorker'in navigator){
  window.addEventListener('load',async()=>{
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs)await reg.unregister();
      await navigator.serviceWorker.register('./service-worker.js?v=21',{scope:'./'});
    }catch{}
  })
}
cloneMap();resetActors();updateHud();draw();
