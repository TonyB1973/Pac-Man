
'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const newGameBtn = document.getElementById('newGameBtn');
const pauseBtn = document.getElementById('pauseBtn');
const soundBtn = document.getElementById('soundBtn');
const installBtn = document.getElementById('installBtn');

const TILE = 20;
const COLS = 28;
const ROWS = 31;
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

const RAW_MAP = [
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

let map = [];
let pelletsLeft = 0;
let score = 0;
let highScore = Number(localStorage.getItem('mazeMunchHigh') || 0);
let level = 1;
let lives = 3;
let running = false;
let paused = false;
let gameOver = false;
let lastTime = 0;
let powerTimer = 0;
let mouth = 0;
let audioEnabled = true;
let deferredPrompt = null;

const dirs = {
  left:{x:-1,y:0,angle:Math.PI},
  right:{x:1,y:0,angle:0},
  up:{x:0,y:-1,angle:-Math.PI/2},
  down:{x:0,y:1,angle:Math.PI/2}
};

const player = {
  x:13.5*TILE, y:23.5*TILE, r:8,
  dir:'left', nextDir:'left', speed:92
};

const enemies = [
  {name:'Blaze',x:13.5*TILE,y:14.5*TILE,dir:'left',color:'#ff5c65',home:{x:13.5,y:14.5},scatter:{x:26,y:1}},
  {name:'Fizz',x:12.5*TILE,y:14.5*TILE,dir:'up',color:'#ff6fcf',home:{x:12.5,y:14.5},scatter:{x:1,y:1}},
  {name:'Volt',x:14.5*TILE,y:14.5*TILE,dir:'right',color:'#47e9ff',home:{x:14.5,y:14.5},scatter:{x:26,y:29}},
  {name:'Moss',x:13.5*TILE,y:15.5*TILE,dir:'down',color:'#9fe870',home:{x:13.5,y:15.5},scatter:{x:1,y:29}}
];

function resetMap(){
  map = RAW_MAP.map(row => row.split(''));
  pelletsLeft = 0;
  for (const row of map) for (const c of row) if(c==='.' || c==='o') pelletsLeft++;
}

function resetPositions(){
  player.x=13.5*TILE; player.y=23.5*TILE; player.dir='left'; player.nextDir='left';
  const starts=[[13.5,14.5],[12.5,14.5],[14.5,14.5],[13.5,15.5]];
  enemies.forEach((e,i)=>{e.x=starts[i][0]*TILE;e.y=starts[i][1]*TILE;e.dir=['left','up','right','down'][i];});
  powerTimer=0;
}

function startGame(){
  score=0; level=1; lives=3; gameOver=false; paused=false;
  resetMap(); resetPositions(); updateHud();
  overlay.classList.remove('show');
  running=true; lastTime=performance.now();
  beep(440,.05);
  requestAnimationFrame(loop);
}

function nextLevel(){
  level++;
  resetMap();
  resetPositions();
  updateHud();
  beep(660,.08); setTimeout(()=>beep(880,.1),90);
}

function loseLife(){
  lives--;
  updateHud();
  beep(120,.24,'sawtooth');
  if(lives<=0){
    running=false; gameOver=true;
    overlay.querySelector('h2').textContent='GAME OVER';
    overlay.querySelector('p').innerHTML=`Final score: <strong>${score}</strong><br>Press below to play again.`;
    startBtn.textContent='PLAY AGAIN';
    overlay.classList.add('show');
  }else{
    resetPositions();
  }
}

function updateHud(){
  scoreEl.textContent=String(score).padStart(6,'0');
  highScore=Math.max(highScore,score);
  localStorage.setItem('mazeMunchHigh',String(highScore));
  highScoreEl.textContent=String(highScore).padStart(6,'0');
  levelEl.textContent=String(level).padStart(2,'0');
  livesEl.textContent='●'.repeat(lives);
}

function tileAt(px,py){
  let c=Math.floor(px/TILE), r=Math.floor(py/TILE);
  if(c<0) c=COLS-1;
  if(c>=COLS) c=0;
  return {c,r,v:(map[r] && map[r][c]) || '#'};
}
function walkable(c,r){
  if(r<0||r>=ROWS) return false;
  if(c<0||c>=COLS) return true;
  return map[r][c] !== '#';
}
function centered(v){ return Math.abs((v/TILE)-Math.round(v/TILE)-.5)<.08; }
function nearestCenter(v){ return (Math.floor(v/TILE)+.5)*TILE; }
function canTurn(entity,dirName){
  const c=Math.floor(entity.x/TILE),r=Math.floor(entity.y/TILE),d=dirs[dirName];
  return walkable(c+d.x,r+d.y);
}
function moveEntity(entity,dt,speed){
  const d=dirs[entity.dir];
  entity.x += d.x*speed*dt;
  entity.y += d.y*speed*dt;
  if(entity.x < -TILE/2) entity.x=canvas.width+TILE/2;
  if(entity.x > canvas.width+TILE/2) entity.x=-TILE/2;
}

function updatePlayer(dt){
  const cx=nearestCenter(player.x), cy=nearestCenter(player.y);
  const near=Math.abs(player.x-cx)<3 && Math.abs(player.y-cy)<3;
  if(near && canTurn(player,player.nextDir)){
    player.x=cx;player.y=cy;player.dir=player.nextDir;
  }
  if(near && !canTurn(player,player.dir)){ player.x=cx;player.y=cy; }
  else moveEntity(player,dt,player.speed+Math.min(level*3,24));

  const t=tileAt(player.x,player.y);
  if(t.v==='.'||t.v==='o'){
    map[t.r][t.c]=' ';
    pelletsLeft--;
    score += t.v==='o'?50:10;
    if(t.v==='o'){ powerTimer=7; beep(720,.08); }
    else beep(260,.018,'square',.015);
    updateHud();
    if(pelletsLeft<=0) nextLevel();
  }
}

function opposite(a,b){return (a==='left'&&b==='right')||(a==='right'&&b==='left')||(a==='up'&&b==='down')||(a==='down'&&b==='up');}
function chooseEnemyDir(e){
  const c=Math.floor(e.x/TILE),r=Math.floor(e.y/TILE);
  let options=Object.keys(dirs).filter(n=>{
    const d=dirs[n]; return walkable(c+d.x,r+d.y) && !opposite(n,e.dir);
  });
  if(!options.length) options=Object.keys(dirs).filter(n=>walkable(c+dirs[n].x,r+dirs[n].y));
  const target = powerTimer>0 ? e.scatter : {x:player.x/TILE,y:player.y/TILE};
  options.sort((a,b)=>{
    const da=dirs[a],db=dirs[b];
    const aa=Math.hypot(c+da.x-target.x,r+da.y-target.y);
    const bb=Math.hypot(c+db.x-target.x,r+db.y-target.y);
    return aa-bb;
  });
  if(powerTimer>0) options.reverse();
  if(Math.random()<.18) return options[Math.floor(Math.random()*options.length)];
  return options[0]||e.dir;
}

function updateEnemies(dt){
  enemies.forEach((e,i)=>{
    const cx=nearestCenter(e.x),cy=nearestCenter(e.y);
    if(Math.abs(e.x-cx)<2.5 && Math.abs(e.y-cy)<2.5){
      e.x=cx;e.y=cy;e.dir=chooseEnemyDir(e);
    }
    moveEntity(e,dt,72+Math.min(level*4,26));
    const dist=Math.hypot(e.x-player.x,e.y-player.y);
    if(dist<14){
      if(powerTimer>0){
        score+=200; updateHud(); beep(980,.09);
        e.x=e.home.x*TILE;e.y=e.home.y*TILE;e.dir='up';
      }else loseLife();
    }
  });
}

function draw(){
  ctx.fillStyle='#03040a';ctx.fillRect(0,0,canvas.width,canvas.height);
  drawMaze();
  drawPlayer();
  enemies.forEach(drawEnemy);
  if(paused){
    ctx.fillStyle='rgba(3,4,10,.72)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.font='900 38px system-ui';ctx.textAlign='center';ctx.fillText('PAUSED',canvas.width/2,canvas.height/2);
  }
}

function drawMaze(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const x=c*TILE,y=r*TILE,v=map[r][c];
      if(v==='#'){
        ctx.fillStyle='#102057';ctx.fillRect(x+1,y+1,TILE-2,TILE-2);
        ctx.strokeStyle='#2f6dff';ctx.lineWidth=2;ctx.strokeRect(x+3,y+3,TILE-6,TILE-6);
      }else if(v==='.'){
        ctx.fillStyle='#ffd7a3';ctx.beginPath();ctx.arc(x+TILE/2,y+TILE/2,2.2,0,Math.PI*2);ctx.fill();
      }else if(v==='o'){
        const pulse=4.5+Math.sin(performance.now()/140)*1.3;
        ctx.fillStyle='#47e9ff';ctx.shadowColor='#47e9ff';ctx.shadowBlur=14;
        ctx.beginPath();ctx.arc(x+TILE/2,y+TILE/2,pulse,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      }else if(v==='-'){
        ctx.strokeStyle='#ff6fcf';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+TILE/2);ctx.lineTo(x+TILE,y+TILE/2);ctx.stroke();
      }
    }
  }
}

function drawPlayer(){
  mouth=(Math.sin(performance.now()/65)+1)*.12+.05;
  const a=dirs[player.dir].angle;
  ctx.save();ctx.translate(player.x,player.y);ctx.rotate(a);
  ctx.fillStyle='#ffd84d';ctx.shadowColor='#ffd84d';ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,9,mouth,Math.PI*2-mouth);ctx.closePath();ctx.fill();
  ctx.restore();ctx.shadowBlur=0;
}

function drawEnemy(e){
  const frightened=powerTimer>0;
  ctx.save();ctx.translate(e.x,e.y);
  ctx.fillStyle=frightened?'#3157ff':e.color;
  ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=9;
  ctx.beginPath();
  ctx.arc(0,-2,8,Math.PI,0);
  ctx.lineTo(8,7);ctx.lineTo(4,4);ctx.lineTo(0,7);ctx.lineTo(-4,4);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(-3,-2,2.4,0,Math.PI*2);ctx.arc(3,-2,2.4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=frightened?'#fff':'#1a2454';
  ctx.beginPath();ctx.arc(-3,-2,1.1,0,Math.PI*2);ctx.arc(3,-2,1.1,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function loop(now){
  if(!running)return;
  const dt=Math.min((now-lastTime)/1000,.035);lastTime=now;
  if(!paused){
    if(powerTimer>0) powerTimer=Math.max(0,powerTimer-dt);
    updatePlayer(dt);
    updateEnemies(dt);
  }
  draw();
  requestAnimationFrame(loop);
}

function setDirection(dir){
  if(dirs[dir]) player.nextDir=dir;
  document.querySelectorAll('.dir').forEach(b=>b.classList.toggle('pressed',b.dataset.dir===dir));
  setTimeout(()=>document.querySelectorAll('.dir').forEach(b=>b.classList.remove('pressed')),100);
}
document.querySelectorAll('.dir').forEach(btn=>{
  btn.addEventListener('pointerdown',e=>{e.preventDefault();setDirection(btn.dataset.dir);});
});
window.addEventListener('keydown',e=>{
  const keyMap={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
  if(keyMap[e.key]){e.preventDefault();setDirection(keyMap[e.key]);}
  if(e.key===' ')togglePause();
});
let touchStart=null;
canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];touchStart={x:t.clientX,y:t.clientY};},{passive:true});
canvas.addEventListener('touchend',e=>{
  if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;
  if(Math.hypot(dx,dy)>20)setDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
  touchStart=null;
},{passive:true});

function togglePause(){
  if(!running)return;
  paused=!paused;pauseBtn.textContent=paused?'▶':'Ⅱ';
  beep(paused?180:420,.05);
}
pauseBtn.addEventListener('click',togglePause);
soundBtn.addEventListener('click',()=>{audioEnabled=!audioEnabled;soundBtn.textContent=audioEnabled?'🔊':'🔇';});
startBtn.addEventListener('click',startGame);
newGameBtn.addEventListener('click',startGame);

let audioCtx;
function beep(freq,duration,type='sine',gain=.035){
  if(!audioEnabled)return;
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioCtx.createOscillator(),g=audioCtx.createGain();
    osc.type=type;osc.frequency.value=freq;g.gain.value=gain;
    osc.connect(g);g.connect(audioCtx.destination);osc.start();g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);osc.stop(audioCtx.currentTime+duration);
  }catch{}
}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installBtn.hidden=false;});
installBtn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installBtn.hidden=true;});

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js'));

resetMap();resetPositions();updateHud();draw();
