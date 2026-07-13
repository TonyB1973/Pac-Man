
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

const TILE = 20, COLS = 28, ROWS = 31;
canvas.width = COLS*TILE; canvas.height = ROWS*TILE;

const MAP_TEMPLATE = [
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

const DIR = {
  left:{x:-1,y:0,a:Math.PI},
  right:{x:1,y:0,a:0},
  up:{x:0,y:-1,a:-Math.PI/2},
  down:{x:0,y:1,a:Math.PI/2}
};

let map=[], pelletsLeft=0, score=0, level=1, lives=3;
let highScore=Number(localStorage.getItem('mazeMunch2High')||0);
let running=false, paused=false, acceptingInput=false, lastTime=0;
let powerTimer=0, roundClock=0, freezeTimer=0;
let audioEnabled=true, deferredPrompt=null;

const player={x:13.5*TILE,y:23.5*TILE,dir:'left',wanted:'left',speed:96,r:8};

const ghosts=[
  {x:13.5,y:14.5,color:'#ff5b67',corner:{x:26,y:1},release:0.4,released:false,routeStage:0},
  {x:12.5,y:14.5,color:'#ff6fce',corner:{x:1,y:1},release:2.2,released:false,routeStage:0},
  {x:14.5,y:14.5,color:'#4ceaff',corner:{x:26,y:29},release:4.2,released:false,routeStage:0},
  {x:13.5,y:15.5,color:'#a7ed63',corner:{x:1,y:29},release:6.2,released:false,routeStage:0}
].map((g,i)=>({...g,homeX:g.x,homeY:g.y,px:g.x*TILE,py:g.y*TILE,dir:'up',index:i}));

function cloneMap(){
  map=MAP_TEMPLATE.map(r=>r.split('')); pelletsLeft=0;
  for(const row of map) for(const c of row) if(c==='.'||c==='o') pelletsLeft++;
}
function resetActors(){
  player.x=13.5*TILE; player.y=23.5*TILE; player.dir='left'; player.wanted='left';
  ghosts.forEach(g=>{g.px=g.homeX*TILE;g.py=g.homeY*TILE;g.dir='up';g.released=false;g.routeStage=0;});
  powerTimer=0; roundClock=0;
}
function startGame(){
  score=0;level=1;lives=3;paused=false;running=true;acceptingInput=false;
  cloneMap();resetActors();updateHud();
  overlay.classList.remove('visible');
  showReady(1.1);
  lastTime=performance.now(); requestAnimationFrame(loop);
}
function showReady(seconds){
  freezeTimer=seconds;acceptingInput=false;readyText.classList.add('show');
}
function finishReady(){
  readyText.classList.remove('show');acceptingInput=true;
}
function updateHud(){
  highScore=Math.max(highScore,score);localStorage.setItem('mazeMunch2High',String(highScore));
  scoreEl.textContent=String(score).padStart(6,'0');
  highScoreEl.textContent=String(highScore).padStart(6,'0');
  levelEl.textContent=String(level).padStart(2,'0');
  livesEl.textContent='●'.repeat(Math.max(0,lives));
}
function tile(px,py){
  let c=Math.floor(px/TILE),r=Math.floor(py/TILE);
  if(c<0)c=COLS-1;if(c>=COLS)c=0;
  return {c,r,v:(map[r]&&map[r][c])||'#'};
}
function open(c,r,allowGate=false){
  if(c<0||c>=COLS)return r===14;
  if(r<0||r>=ROWS)return false;
  const v=map[r][c];
  return v!=='#'&&(allowGate||v!=='-');
}
function centerOf(v){return (Math.floor(v/TILE)+.5)*TILE}
function nearCenter(e,tol=4.8){
  return Math.abs(e.x-centerOf(e.x))<tol&&Math.abs(e.y-centerOf(e.y))<tol;
}
function canMove(e,name,allowGate=false){
  const c=Math.floor(e.x/TILE),r=Math.floor(e.y/TILE),d=DIR[name];
  return open(c+d.x,r+d.y,allowGate);
}
function move(e,dt,speed){
  const d=DIR[e.dir];e.x+=d.x*speed*dt;e.y+=d.y*speed*dt;
  if(e.x<-TILE/2)e.x=canvas.width+TILE/2;
  if(e.x>canvas.width+TILE/2)e.x=-TILE/2;
}
function setDirection(name){
  if(!DIR[name])return;
  player.wanted=name;directionLabel.textContent=name.toUpperCase();
}
function updatePlayer(dt){
  if(nearCenter(player)){
    player.x=centerOf(player.x);player.y=centerOf(player.y);
    if(canMove(player,player.wanted))player.dir=player.wanted;
    if(!canMove(player,player.dir))return;
  }
  move(player,dt,player.speed+Math.min(level*2.5,20));
  const t=tile(player.x,player.y);
  if(t.v==='.'||t.v==='o'){
    map[t.r][t.c]=' ';pelletsLeft--;
    score+=t.v==='o'?50:10;
    if(t.v==='o'){powerTimer=7;beep(680,.07);}
    else beep(250,.015,'square',.012);
    updateHud();
    if(pelletsLeft<=0){
      level++;cloneMap();resetActors();updateHud();showReady(1.0);
      beep(660,.06);setTimeout(()=>beep(880,.09),80);
    }
  }
}
function opposite(a,b){
  return (a==='left'&&b==='right')||(a==='right'&&b==='left')||(a==='up'&&b==='down')||(a==='down'&&b==='up');
}
function ghostAtCenter(g,tol=3){return Math.abs(g.px-centerOf(g.px))<tol&&Math.abs(g.py-centerOf(g.py))<tol}
function ghostCan(g,name,allowGate=false){
  const c=Math.floor(g.px/TILE),r=Math.floor(g.py/TILE),d=DIR[name];
  return open(c+d.x,r+d.y,allowGate);
}
function moveGhost(g,dt,speed){
  const d=DIR[g.dir];g.px+=d.x*speed*dt;g.py+=d.y*speed*dt;
  if(g.px<-TILE/2)g.px=canvas.width+TILE/2;
  if(g.px>canvas.width+TILE/2)g.px=-TILE/2;
}
function releaseGhost(g,dt){
  if(roundClock<g.release)return;
  const targetX=13.5*TILE, exitY=11.5*TILE;
  if(Math.abs(g.px-targetX)>1.5){
    g.dir=g.px<targetX?'right':'left';moveGhost(g,dt,75);return;
  }
  g.px=targetX;
  if(g.py>exitY){
    g.dir='up';moveGhost(g,dt,75);return;
  }
  g.py=exitY;g.released=true;g.dir=g.index%2?'left':'right';
}
function chooseGhostDirection(g){
  const c=Math.floor(g.px/TILE),r=Math.floor(g.py/TILE);
  let choices=Object.keys(DIR).filter(n=>ghostCan(g,n)&&!opposite(n,g.dir));
  if(!choices.length)choices=Object.keys(DIR).filter(n=>ghostCan(g,n));
  const target=powerTimer>0?g.corner:{x:player.x/TILE,y:player.y/TILE};
  choices.sort((a,b)=>{
    const da=DIR[a],db=DIR[b];
    return Math.hypot(c+da.x-target.x,r+da.y-target.y)-Math.hypot(c+db.x-target.x,r+db.y-target.y);
  });
  if(powerTimer>0)choices.reverse();
  if(Math.random()<.12)return choices[Math.floor(Math.random()*choices.length)]||g.dir;
  return choices[0]||g.dir;
}
function resetGhostToHouse(g){
  g.px=g.homeX*TILE;g.py=g.homeY*TILE;g.dir='up';g.released=false;g.release=roundClock+1.1;
}
function loseLife(){
  lives--;updateHud();beep(110,.28,'sawtooth',.05);
  if(lives<=0){
    running=false;acceptingInput=false;
    overlayTitle.textContent='GAME OVER';
    overlayText.innerHTML=`Final score: <strong>${score}</strong><br>Press below to play again.`;
    startBtn.textContent='PLAY AGAIN';
    overlay.classList.add('visible');
  }else{
    resetActors();showReady(1.1);
  }
}
function updateGhosts(dt){
  roundClock+=dt;
  for(const g of ghosts){
    if(!g.released){releaseGhost(g,dt);continue;}
    if(ghostAtCenter(g)){
      g.px=centerOf(g.px);g.py=centerOf(g.py);g.dir=chooseGhostDirection(g);
    }
    moveGhost(g,dt,73+Math.min(level*3,24));
    if(Math.hypot(g.px-player.x,g.py-player.y)<14){
      if(powerTimer>0){score+=200;updateHud();beep(980,.08);resetGhostToHouse(g);}
      else{loseLife();return;}
    }
  }
}
function update(dt){
  if(freezeTimer>0){
    freezeTimer-=dt;if(freezeTimer<=0)finishReady();return;
  }
  if(!acceptingInput)return;
  powerTimer=Math.max(0,powerTimer-dt);
  updatePlayer(dt);updateGhosts(dt);
}
function drawMaze(){
  ctx.fillStyle='#020309';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const x=c*TILE,y=r*TILE,v=map[r][c];
    if(v==='#'){
      const glow=ctx.createLinearGradient(x,y,x+TILE,y+TILE);
      glow.addColorStop(0,'#17336d');glow.addColorStop(1,'#0b1744');
      ctx.fillStyle=glow;ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
      ctx.strokeStyle='#3975ff';ctx.lineWidth=1.6;ctx.shadowColor='#245cff';ctx.shadowBlur=4;
      ctx.strokeRect(x+3,y+3,TILE-6,TILE-6);ctx.shadowBlur=0;
    }else if(v==='.'){
      ctx.fillStyle='#ffd4a0';ctx.beginPath();ctx.arc(x+10,y+10,2.05,0,Math.PI*2);ctx.fill();
    }else if(v==='o'){
      const p=4.6+Math.sin(performance.now()/120)*1.1;ctx.fillStyle='#4ceaff';ctx.shadowColor='#4ceaff';ctx.shadowBlur=14;
      ctx.beginPath();ctx.arc(x+10,y+10,p,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }else if(v==='-'){
      ctx.strokeStyle='#ff6fce';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+10);ctx.lineTo(x+20,y+10);ctx.stroke();
    }
  }
}
function drawPlayer(){
  const mouth=.07+(Math.sin(performance.now()/70)+1)*.12;
  ctx.save();ctx.translate(player.x,player.y);ctx.rotate(DIR[player.dir].a);
  ctx.fillStyle='#ffda4e';ctx.shadowColor='#ffda4e';ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,9,mouth,Math.PI*2-mouth);ctx.closePath();ctx.fill();
  ctx.restore();ctx.shadowBlur=0;
}
function drawGhost(g){
  const fright=powerTimer>0;ctx.save();ctx.translate(g.px,g.py);
  ctx.fillStyle=fright?'#315cff':g.color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;
  ctx.beginPath();ctx.arc(0,-2,8,Math.PI,0);ctx.lineTo(8,7);ctx.lineTo(4,4);ctx.lineTo(0,7);ctx.lineTo(-4,4);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-3,-2,2.5,0,Math.PI*2);ctx.arc(3,-2,2.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=fright?'#fff':'#16204c';ctx.beginPath();ctx.arc(-3,-2,1.1,0,Math.PI*2);ctx.arc(3,-2,1.1,0,Math.PI*2);ctx.fill();ctx.restore();
}
function draw(){
  drawMaze();drawPlayer();ghosts.forEach(drawGhost);
  if(paused){
    ctx.fillStyle='rgba(2,3,9,.76)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.font='900 38px system-ui';ctx.textAlign='center';ctx.fillText('PAUSED',canvas.width/2,canvas.height/2);
  }
}
function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.033);lastTime=now;
  if(!paused)update(dt);draw();requestAnimationFrame(loop);
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
  if(Math.hypot(dx,dy)>11)setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
}
joystick.addEventListener('pointerdown',e=>{e.preventDefault();joyId=e.pointerId;joystick.setPointerCapture(e.pointerId);joystick.classList.add('active');moveJoystick(e.clientX,e.clientY)});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===joyId){e.preventDefault();moveJoystick(e.clientX,e.clientY)}});
function releaseJoy(e){if(joyId!==null&&e.pointerId!==joyId)return;joyId=null;joystick.classList.remove('active');knob.style.transform='translate(-50%,-50%)';directionLabel.textContent='JOYSTICK'}
joystick.addEventListener('pointerup',releaseJoy);joystick.addEventListener('pointercancel',releaseJoy);

/* Keyboard and swipe */
window.addEventListener('keydown',e=>{
  const m={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
  if(m[e.key]){e.preventDefault();setDirection(m[e.key])}
  if(e.key===' ')togglePause();
});
let swipe=null;
canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];swipe={x:t.clientX,y:t.clientY}},{passive:true});
canvas.addEventListener('touchend',e=>{if(!swipe)return;const t=e.changedTouches[0],dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;
  if(Math.hypot(dx,dy)>18)setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));swipe=null},{passive:true});

function togglePause(){
  if(!running)return;paused=!paused;pauseBtn.textContent=paused?'▶':'Ⅱ';beep(paused?170:430,.05);
}
pauseBtn.addEventListener('click',togglePause);
soundBtn.addEventListener('click',()=>{audioEnabled=!audioEnabled;soundBtn.textContent=audioEnabled?'🔊':'🔇'});
startBtn.addEventListener('click',startGame);newGameBtn.addEventListener('click',startGame);

let audioCtx;
function beep(freq,duration,type='sine',gain=.035){
  if(!audioEnabled)return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.value=gain;
    o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);o.stop(audioCtx.currentTime+duration);
  }catch{}
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false});
installBtn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true});

if('serviceWorker'in navigator){
  window.addEventListener('load',async()=>{
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs) await reg.update();
      await navigator.serviceWorker.register('./service-worker.js?v=2',{scope:'./'});
    }catch{}
  });
}
cloneMap();resetActors();updateHud();draw();
