import { TRANSLATIONS } from './translations.js';
import { GRAVITY, BEAM_WIDTH, GROUND_LEVEL, LEAVE_THRESHOLD, LAND_DISTANCE, WATER_DEPTH, WATER_SURFACE, SEABED_Y, EARTH_WORLD_WIDTH } from './config/constants.js';
import { ALIEN_RACES, ALIEN_SKINS } from './config/aliens.js';
import { SHIP_PAINTS } from './config/ships.js';
import { CREW_BONUSES } from './config/crew.js';

// --- LANGUAGE SYSTEM ---
let currentLang = localStorage.getItem('sadabduction_lang') || 'en';

let _trCache={};let _trCacheLang='';
function tr(key) {
  if(_trCacheLang!==currentLang){_trCache={};_trCacheLang=currentLang;}
  if(key in _trCache)return _trCache[key];
  const keys=key.split('.');
  let val=TRANSLATIONS[currentLang];
  for(const k of keys){val=val?.[k];if(val===undefined)break;}
  if(val===undefined){val=TRANSLATIONS.en;for(const k of keys){val=val?.[k];if(val===undefined)break;}}
  const result=val||key;
  _trCache[key]=result;
  return result;
}

function ta(key) {
  const result=tr(key);
  return Array.isArray(result)?result:[result];
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('sadabduction_lang', lang);
  updateHTMLText();
}

function updateHTMLText() {
  document.getElementById('game-title').textContent = tr('ui.title');
  document.getElementById('game-subtitle').textContent = tr('ui.subtitle');
  document.getElementById('kb-controls').innerHTML =
    tr('ui.controls1')+'<br>'+tr('ui.controls2')+'<br>'+tr('ui.controls3')+'<br>'+tr('ui.controls4')+'<br>'+tr('ui.controls5')+'<br>';
  document.getElementById('touch-hint').innerHTML = tr('ui.controlsTouch')+'<br>';
  document.getElementById('controls-extra').innerHTML = tr('ui.controls6')+'<br>'+tr('ui.controls7');
  document.getElementById('start-btn').textContent = tr('ui.startBtn');
  document.getElementById('specimens-label').textContent = tr('ui.specimensLabel');
  document.getElementById('structures-label').textContent = tr('ui.structuresLabel');
  // Highlight active language button
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.style.background = btn.dataset.lang === currentLang ? '#0f0' : 'none';
    btn.style.color = btn.dataset.lang === currentLang ? '#000' : '#0f0';
  });
}

try { updateHTMLText(); } catch(e) { /* start-screen DOM not populated yet; game code will re-call later */ }
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });

let selectedSkin = localStorage.getItem('sadabduction_skin') || 'classic';
let selectedRace = localStorage.getItem('sadabduction_race') || (ALIEN_SKINS.find(s=>s.id===selectedSkin)||{race:'grey'}).race;
function getAlienSkin(){ return ALIEN_SKINS.find(s=>s.id===selectedSkin) || ALIEN_SKINS[0]; }
function getRace(id){ return ALIEN_RACES.find(r=>r.id===id) || ALIEN_RACES[0]; }

// Mix a gray brightness (0-255) with a skin hex color. ratio=0 means pure gray, ratio=1 means pure skin color
function skinTint(gray, hexOrRainbow, ratio){
  if(!hexOrRainbow || hexOrRainbow==='rainbow'){
    const h=(Date.now()*0.06)%360;
    const c=Math.round(gray*(1-ratio));
    // HSL to rough RGB for rainbow
    const s=0.7,l=gray/255*0.5+0.2;
    const hk=h/60;const chroma=s*(1-Math.abs(2*l-1));const x=chroma*(1-Math.abs(hk%2-1));const m=l-chroma/2;
    let r1=0,g1=0,b1=0;
    if(hk<1){r1=chroma;g1=x;}else if(hk<2){r1=x;g1=chroma;}else if(hk<3){g1=chroma;b1=x;}
    else if(hk<4){g1=x;b1=chroma;}else if(hk<5){r1=x;b1=chroma;}else{r1=chroma;b1=x;}
    const r=Math.round((r1+m)*255*(ratio)+gray*(1-ratio));
    const g=Math.round((g1+m)*255*(ratio)+gray*(1-ratio));
    const b=Math.round((b1+m)*255*(ratio)+gray*(1-ratio));
    return `rgb(${r},${g},${b})`;
  }
  const hr=parseInt(hexOrRainbow.slice(1,3),16)||0;
  const hg=parseInt(hexOrRainbow.slice(3,5),16)||0;
  const hb=parseInt(hexOrRainbow.slice(5,7),16)||0;
  const r=Math.round(gray*(1-ratio)+hr*ratio);
  const g=Math.round(gray*(1-ratio)+hg*ratio);
  const b=Math.round(gray*(1-ratio)+hb*ratio);
  return `rgb(${r},${g},${b})`;
}

// --- MAIN MENU STATE ---
let mainMenuMode = 'menu'; // 'menu', 'skins', 'shipskins', null (in game)
let mainMenuSel = 0;
let mainMenuStars = [];
let mainMenuAlienPhase = 0;
for(let i=0;i<120;i++) mainMenuStars.push({x:Math.random(),y:Math.random(),s:Math.random()*2+0.5,sp:0.0003+Math.random()*0.001,b:Math.random()});

// --- SAVE / LOAD ---
function saveGame(){
  try{
    const data={
      score, buildingsDestroyed, upgrades:{...upgrades}, shipPaint:{...shipPaint},
      selectedSkin, crewLevels:{...crewLevels}, unlockedPlanets:[...unlockedPlanets],
      bossDefeated:{...bossDefeated}, planetProgress:{...planetProgress},
      leaderRelations:{...leaderRelations}, genocideCount, milkScore,
      specimens:mothership.specimens, totalCollected:mothership.totalCollected,
      collectedCows:mothership.collectedCows||[],
      gameStats:{...gameStats}, version:1
    };
    localStorage.setItem('sadabduction_save', JSON.stringify(data));
  }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem('sadabduction_save');
    if(!raw) return false;
    const d=JSON.parse(raw);
    score=d.score||0; buildingsDestroyed=d.buildingsDestroyed||0;
    upgrades=d.upgrades||{beamWidth:0,speed:0,flame:0};
    shipPaint=d.shipPaint||{color:'#555',accent:'#0f0',trail:'#0f0',name:'default'};
    selectedSkin=d.selectedSkin||'classic';
    crewLevels=d.crewLevels||{commander:0,scientist:0,pilot:0,engineer:0};
    unlockedPlanets=planetDefs.map(p=>p.id); // all planets always unlocked
    bossDefeated=d.bossDefeated||{};
    planetProgress=d.planetProgress||{};
    leaderRelations=d.leaderRelations||{};
    genocideCount=d.genocideCount||0;
    milkScore=d.milkScore||0;
    mothership.specimens=d.specimens||[];
    mothership.totalCollected=d.totalCollected||0;
    mothership.collectedCows=d.collectedCows||[];
    if(d.gameStats) Object.assign(gameStats,d.gameStats);
    document.getElementById('score').textContent=score;
    return true;
  }catch(e){return false;}
}
function hasSaveGame(){ return !!localStorage.getItem('sadabduction_save'); }

// --- PAUSE MENU ---
let pauseMenu = { active:false, sel:0, _cool:0 };

// --- GAME STATE ---
let gameStarted = false;
let camera = { x: 0, y: 0 };
let keys = {};
let score = 0;
let buildingsDestroyed = 0;
let particles = [];
let debris = [];
let humans = [];
let blocks = [];
let buildings = [];
let tears = [];
let speechBubbles = [];
let stars = [];
let deepStars = [];
let clouds = [];
let missiles = [];
let fires = [];
let missileCooldown = 0;
let messageTimer = 0;
let vehicles = [];
let weather = [];
let hazards = [];
let combo = { count:0, timer:0, best:0 };
let planetTerror = 0; // global terror level on current planet
let dayNightCycle = 0; // 0-1, 0=noon, 0.5=midnight
let dayNightBrightness = 0; // computed from cycle
let upgrades = { beamWidth:0, speed:0, flame:0 };
let crewLevels = { commander:0, scientist:0, pilot:0, engineer:0 };
let mothership = { specimens:[], totalCollected:0, collectedCows:[] };
let turrets = [];
let screenShake = { x:0, y:0, intensity:0 };
let laserShots = [];
let wantedLevel = 0; // 0-5 stars
let military = []; // soldiers, vehicles, aircraft
let shipHealth = 100;
let shipCloak = { active:false, energy:100, maxEnergy:100, drainRate:0.5, rechargeRate:0.3 };
let alarmPulse = 0;
let cows = []; // wacky cows on planets
let milkScore = 0; // milk collected in mothership
let gameStats = { totalAbductions:0, buildingsDestroyed:0, militaryKilled:0, cowsCollected:0, planetsConquered:0, missionsCompleted:0, bossesDefeated:0, timePlayedFrames:0 };
let leaderRelations = {}; // planetId -> number (-10 hostile to +10 ally)
let shipPaint = JSON.parse(localStorage.getItem('sadabduction_shippaint')||'null') || { color:'#bbb', accent:'#888', trail:'#0f0', name:'default' };

// --- PROGRESSION STATE ---
let planetProgress = {};
let unlockedPlanets = ['earth','mars','glimora','ice','lava','sand','asteroid'];

function initPlanetProgress() {
  planetProgress = {};
  planetDefs.forEach(def => {
    planetProgress[def.id] = { missionIndex: 0, completion: 'none' };
  });
  unlockedPlanets = planetDefs.map(p=>p.id);
  leaderRelations = {earth:0,mars:0,glimora:0,ice:0,lava:0,sand:0,asteroid:0};
  gameStats = {totalAbductions:0,buildingsDestroyed:0,militaryKilled:0,cowsCollected:0,planetsConquered:0,missionsCompleted:0,bossesDefeated:0,timePlayedFrames:0};
}

// --- BOSS SYSTEM ---
let boss = null;
let bossIntro = null;
let bossKillTimer = 0;
let bossLockdown = false;
let bossDefeated = {};
let bossDefeatOverlay = null; // {timer, duration, rank, score, mercy}

// --- RESPAWN & GENOCIDE SYSTEM ---
let genocideCount = 0;
let respawnTimer = 0;
let initialPopulation = 30;

const bossDefs = {
  earth:{name:'boss.earth.name',subtitle:'boss.earth.subtitle',maxHp:80,color:'#2a3a2a',
    dmg:{missile:1,flame:0,repulsor:2,laser:0.5,beam:0},baseScore:100},
  mars:{name:'boss.mars.name',subtitle:'boss.mars.subtitle',maxHp:100,color:'#a85030',
    dmg:{missile:1,flame:2,repulsor:0.5,laser:0.5,beam:1.5},baseScore:120},
  glimora:{name:'boss.glimora.name',subtitle:'boss.glimora.subtitle',maxHp:90,color:'#a050ff',
    dmg:{missile:0,flame:1.5,repulsor:2,laser:1,beam:0},baseScore:130},
  ice:{name:'boss.ice.name',subtitle:'boss.ice.subtitle',maxHp:110,color:'#8acaff',
    dmg:{missile:0.5,flame:3,repulsor:0.5,laser:0.5,beam:0},baseScore:150},
  lava:{name:'boss.lava.name',subtitle:'boss.lava.subtitle',maxHp:150,color:'#ff4400',
    dmg:{missile:1,flame:0,repulsor:1.5,laser:0.3,beam:2.5},baseScore:250},
};

function spawnBoss(planetId){
  const def=bossDefs[planetId];if(!def)return;
  boss={
    type:planetId,planetId,x:worldWidth-400,y:GROUND_LEVEL-60,vx:0,vy:0,
    hp:def.maxHp,maxHp:def.maxHp,phase:1,phaseTimer:0,stateTimer:0,attackTimer:0,
    facing:-1,alive:true,mercyAvailable:false,beamProgress:0,
    drones:[],shieldActive:false,submerged:false,shards:[],segments:[],
    coreOpen:false,coreTimer:0,splitParts:[],
  };
  bossKillTimer=0;bossLockdown=true;
  startBossIntro(tr(def.name),tr(def.subtitle));
}

function startBossIntro(name,subtitle){
  bossIntro={timer:0,duration:180,name,subtitle};
}

function updateBossIntro(){
  if(!bossIntro)return false;
  bossIntro.timer++;
  if(bossIntro.timer>=bossIntro.duration){bossIntro=null;return false;}
  return true; // game paused during intro
}

function drawBossIntro(){
  if(!bossIntro)return;
  const t=bossIntro.timer,d=bossIntro.duration;
  const progress=t/d;
  // Dark overlay
  const overlayAlpha=progress<0.2?progress*5*0.6:progress>0.8?(1-(progress-0.8)*5)*0.6:0.6;
  ctx.fillStyle=`rgba(0,0,0,${Math.max(0,overlayAlpha)})`;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // Boss name (appears at 33%)
  if(progress>0.33){
    const nameAlpha=Math.min(1,(progress-0.33)*5);
    ctx.globalAlpha=nameAlpha;
    ctx.fillStyle='#fff';ctx.font='bold 36px monospace';ctx.textAlign='center';
    ctx.fillText(bossIntro.name,canvas.width/2,canvas.height/2-20);
    ctx.globalAlpha=1;
  }
  // Subtitle (appears at 60%)
  if(progress>0.6){
    const subAlpha=Math.min(1,(progress-0.6)*5);
    ctx.globalAlpha=subAlpha;
    ctx.fillStyle=boss?bossDefs[boss.type]?.color||'#0f0':'#0f0';
    ctx.font='16px monospace';ctx.textAlign='center';
    ctx.fillText(bossIntro.subtitle,canvas.width/2,canvas.height/2+20);
    ctx.globalAlpha=1;
  }
  // Decorative lines
  const lineW=Math.min(canvas.width*0.6,progress*canvas.width);
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(canvas.width/2-lineW/2,canvas.height/2-40);ctx.lineTo(canvas.width/2+lineW/2,canvas.height/2-40);ctx.stroke();
  ctx.beginPath();ctx.moveTo(canvas.width/2-lineW/2,canvas.height/2+40);ctx.lineTo(canvas.width/2+lineW/2,canvas.height/2+40);ctx.stroke();
}

function damageBoss(amount,source){
  if(!boss||!boss.alive)return;
  const def=bossDefs[boss.type];
  const mult=def.dmg[source]||0;
  if(mult===0)return;
  const dmg=amount*mult;
  if(boss.shieldActive)boss.hp-=dmg*0.5; else boss.hp-=dmg;
  boss.hp=Math.max(0,boss.hp);
  // Hit particles
  for(let i=0;i<8;i++)particles.push({x:boss.x+(Math.random()-0.5)*40,y:boss.y+(Math.random()-0.5)*40,
    vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:20,color:def.color,size:Math.random()*3+1});
  triggerShake(dmg*0.3);
  // Phase transitions
  const hpPct=boss.hp/boss.maxHp;
  if(hpPct<=0.6&&boss.phase===1){boss.phase=2;boss.phaseTimer=0;triggerShake(10);
    showMessage('PHASE 2');for(let i=0;i<30;i++)particles.push({x:boss.x+(Math.random()-0.5)*80,y:boss.y+(Math.random()-0.5)*80,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:40,color:'#ff0',size:Math.random()*4+2});}
  else if(hpPct<=0.3&&boss.phase===2){boss.phase=3;boss.phaseTimer=0;triggerShake(12);
    showMessage('PHASE 3');for(let i=0;i<40;i++)particles.push({x:boss.x+(Math.random()-0.5)*100,y:boss.y+(Math.random()-0.5)*100,vx:(Math.random()-0.5)*8,vy:(Math.random()-0.5)*8,life:50,color:'#f40',size:Math.random()*5+2});}
  // Mercy mode
  if(hpPct<=0.05&&!boss.mercyAvailable){boss.mercyAvailable=true;}
  // Death
  if(boss.hp<=0){defeatBoss(false);}
}

function defeatBoss(mercy){
  if(!boss)return;
  const def=bossDefs[boss.type];
  const secs=Math.floor(bossKillTimer/60);
  const rank=secs<60?'gold':secs<120?'silver':'bronze';
  const mult=rank==='gold'?3:rank==='silver'?2:1;
  const awarded=def.baseScore*mult;
  score+=awarded;document.getElementById('score').textContent=score;
  bossDefeated[boss.planetId]=true;
  if(mercy){
    mothership.specimens.push({label:tr(def.name),planet:tr('planet.'+boss.planetId+'.name'),planetId:boss.planetId,color:'#ffd700',isBoss:true});
    showMessage(tr('boss.mercy'));
  }else{
    // Big explosion
    for(let i=0;i<60;i++)particles.push({x:boss.x+(Math.random()-0.5)*120,y:boss.y+(Math.random()-0.5)*120,
      vx:(Math.random()-0.5)*10,vy:(Math.random()-0.5)*10,life:60+Math.random()*30,
      color:['#f80','#fa0','#f40','#ff0','#f00'][Math.floor(Math.random()*5)],size:Math.random()*6+3});
    triggerShake(15);
  }
  bossDefeatOverlay={timer:0,duration:180,rank,score:awarded,mercy};
  bossLockdown=false;boss=null;
  // Complete boss mission
  if(currentMission&&currentMission.type==='boss'){currentMission.progress=1;updateMission();}
}

function drawBossDefeatOverlay(){
  if(!bossDefeatOverlay)return;
  bossDefeatOverlay.timer++;
  const t=bossDefeatOverlay.timer/bossDefeatOverlay.duration;
  if(t>=1){bossDefeatOverlay=null;return;}
  const alpha=t<0.1?t*10:t>0.8?(1-t)*5:1;
  ctx.globalAlpha=alpha;
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,canvas.width,canvas.height);
  const bo=bossDefeatOverlay;
  if(bo.mercy){
    ctx.fillStyle='#ffd700';ctx.font='bold 28px monospace';ctx.textAlign='center';
    ctx.fillText(tr('boss.captured'),canvas.width/2,canvas.height/2-20);
  }else{
    ctx.fillStyle='#fff';ctx.font='bold 28px monospace';ctx.textAlign='center';
    ctx.fillText(tr('boss.defeated'),canvas.width/2,canvas.height/2-30);
    const rc=bo.rank==='gold'?'#ffd700':bo.rank==='silver'?'#c0c0c0':'#cd7f32';
    ctx.fillStyle=rc;ctx.font='bold 22px monospace';
    ctx.fillText(tr('boss.rank'+bo.rank.charAt(0).toUpperCase()+bo.rank.slice(1)),canvas.width/2,canvas.height/2+10);
  }
  ctx.fillStyle='#0f0';ctx.font='14px monospace';
  ctx.fillText(`+${bo.score} pts`,canvas.width/2,canvas.height/2+45);
  ctx.globalAlpha=1;
}

function drawBossHpBar(){
  if(!boss||!boss.alive)return;
  const bw=canvas.width*0.6,bh=12,bx=(canvas.width-bw)/2,by=65;
  ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx-2,by-2,bw+4,bh+4);
  const hpPct=boss.hp/boss.maxHp;
  const hpColor=boss.phase===1?'#0f0':boss.phase===2?'#fa0':'#f44';
  ctx.fillStyle=hpColor;ctx.fillRect(bx,by,bw*hpPct,bh);
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
  // Boss name + HP %
  ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.textAlign='left';
  ctx.fillText(tr(bossDefs[boss.type].name),bx,by-4);
  ctx.textAlign='right';ctx.fillText(Math.ceil(hpPct*100)+'%',bx+bw,by-4);
  // Phase dots
  ctx.textAlign='center';
  for(let i=1;i<=3;i++){
    ctx.fillStyle=i<=boss.phase?'#fff':'#555';
    ctx.beginPath();ctx.arc(bx+bw/2+(i-2)*12,by+bh+8,3,0,Math.PI*2);ctx.fill();
  }
  // Mercy hint
  if(boss.mercyAvailable){
    const pulse=0.5+Math.sin(Date.now()*0.008)*0.5;
    ctx.fillStyle=`rgba(255,215,0,${pulse})`;ctx.font='12px monospace';ctx.textAlign='center';
    ctx.fillText(tr('boss.beamToCapture'),canvas.width/2,by+bh+25);
  }
}

// --- BOSS UPDATE & DRAW ---
function updateBoss(){
  if(!boss||!boss.alive)return;
  boss.phaseTimer++;boss.stateTimer++;boss.attackTimer++;
  const tx=playerMode==='ship'?ship.x:alien.x;
  const ty=playerMode==='ship'?ship.y:alien.y;
  boss.facing=boss.x<tx?1:-1;

  if(boss.type==='earth')updateEarthBoss(tx,ty);
  else if(boss.type==='mars')updateMarsBoss(tx,ty);
  else if(boss.type==='glimora')updateGlimoraBoss(tx,ty);
  else if(boss.type==='ice')updateIceBoss(tx,ty);
  else if(boss.type==='lava')updateLavaBoss(tx,ty);

  // Boss projectiles (stored in military array as type='bossBullet')
  boss.y=Math.min(boss.y,GROUND_LEVEL-20);
}

function drawBoss(){
  if(!boss||!boss.alive)return;
  ctx.save();
  if(boss.type==='earth')drawEarthBoss();
  else if(boss.type==='mars')drawMarsBoss();
  else if(boss.type==='glimora')drawGlimoraBoss();
  else if(boss.type==='ice')drawIceBoss();
  else if(boss.type==='lava')drawLavaBoss();
  ctx.restore();
}

// === EARTH BOSS: General Steelheart ===
function updateEarthBoss(tx,ty){
  const b=boss;
  // Drones
  if(b.phase===1&&b.drones.length===0&&b.phaseTimer>60){
    for(let i=0;i<2;i++)b.drones.push({x:b.x,y:b.y-80,angle:i*Math.PI,hp:5,shootTimer:0});
  }
  if(b.phase===2&&b.drones.length<4&&b.phaseTimer<30){
    while(b.drones.length<4)b.drones.push({x:b.x,y:b.y-80,angle:b.drones.length*Math.PI/2,hp:5,shootTimer:0});
    b.shieldActive=true;
  }
  // Shield: active while drones alive in phase 2
  if(b.phase===2)b.shieldActive=b.drones.length>0;
  // Tank movement
  const spd=b.phase===3?2:b.phase===2?0.3:0.8;
  const dx=tx-b.x;
  if(Math.abs(dx)>100)b.vx+=(dx>0?1:-1)*0.05*spd;
  b.vx*=0.95;b.x+=b.vx;
  b.y=GROUND_LEVEL-30;
  // Grenades
  const fireRate=b.phase===3?25:b.phase===2?50:40;
  if(b.attackTimer>fireRate){
    b.attackTimer=0;
    const spread=b.phase===2?3:1;
    const baseAngle=Math.atan2(ty-b.y,tx-b.x);
    for(let s=0;s<spread;s++){
      const angle=baseAngle+(s-(spread-1)/2)*0.25;
      const spd=5+Math.random()*2;
      military.push({type:'boulder',x:b.x+b.facing*40,y:b.y-10,vx:Math.cos(angle)*spd,vy:Math.sin(angle)*spd-3,life:120,dmg:6,color:'#fa0',boss:true});
    }
    triggerShake(3);
  }
  // Phase 3: spawn soldiers
  if(b.phase===3&&b.phaseTimer%300===0){
    for(let i=0;i<2;i++){
      military.push({type:'soldier',x:b.x+(Math.random()-0.5)*100,y:GROUND_LEVEL-20,health:3,
        alive:true,facing:b.facing,vx:0,shootTimer:0,color:'#363',gunColor:'#555'});
    }
  }
  // Update drones
  b.drones.forEach((d,i)=>{
    d.angle+=0.03;
    d.x=b.x+Math.cos(d.angle+i)*80;
    d.y=b.y-60+Math.sin(d.angle*1.5+i)*30;
    d.shootTimer++;
    if(d.shootTimer>50){
      d.shootTimer=0;
      const da=Math.atan2(ty-d.y,tx-d.x);
      military.push({type:'bullet',x:d.x,y:d.y,vx:Math.cos(da)*5,vy:Math.sin(da)*5,life:80,dmg:3,color:'#ff0',boss:true});
    }
  });
  // Drone damage from player weapons (check laserShots/missiles)
  b.drones=b.drones.filter(d=>{
    laserShots.forEach(ls=>{if(ls.life>0&&dist(ls.x,ls.y,d.x,d.y)<15){ls.life=0;d.hp-=2;
      for(let i=0;i<4;i++)particles.push({x:d.x,y:d.y,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:15,color:'#ff0',size:2});}});
    missiles.forEach(m=>{if(m.life>0&&dist(m.x,m.y,d.x,d.y)<25){d.hp-=5;explodeMissile(m);m.life=0;}});
    return d.hp>0;
  });
}

function drawEarthBoss(){
  const b=boss,x=b.x,y=b.y;
  // Tank treads
  ctx.fillStyle='#1a2a1a';ctx.fillRect(x-42,y-5,84,12);
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#2a3a2a':'#1a2a1a';ctx.fillRect(x-40+i*10,y-5,9,12);}
  // Chassis
  const cg=ctx.createLinearGradient(x,y-25,x,y);cg.addColorStop(0,'#3a4a3a');cg.addColorStop(1,'#2a3a2a');
  ctx.fillStyle=cg;ctx.fillRect(x-35,y-25,70,22);
  // Turret
  ctx.fillStyle='#4a5a4a';
  ctx.beginPath();ctx.arc(x,y-25,15,0,Math.PI*2);ctx.fill();
  // Cannon
  ctx.strokeStyle='#666';ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(x,y-25);ctx.lineTo(x+b.facing*35,y-30);ctx.stroke();
  // Red star
  ctx.fillStyle='#f44';drawStar(ctx,x,y-30,6,5);
  // Shield (phase 2)
  if(b.shieldActive){
    const sa=0.15+Math.sin(Date.now()*0.005)*0.1;
    ctx.strokeStyle=`rgba(80,150,255,${sa})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y-15,55,0,Math.PI*2);ctx.stroke();
  }
  // Drones
  b.drones.forEach(d=>{
    ctx.fillStyle='#666';ctx.fillRect(d.x-8,d.y-4,16,8);
    // Propellers
    ctx.strokeStyle='#aaa';ctx.lineWidth=1;
    const pa=Date.now()*0.03;
    ctx.beginPath();ctx.moveTo(d.x-10,d.y-5);ctx.lineTo(d.x+10*Math.cos(pa),d.y-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(d.x-10*Math.cos(pa),d.y-5);ctx.lineTo(d.x+10,d.y-5);ctx.stroke();
    // Drone HP indicator
    ctx.fillStyle=d.hp>3?'#0f0':'#f44';ctx.fillRect(d.x-6,d.y-10,12*(d.hp/5),2);
  });
  // Damage flash
  if(b.phaseTimer<5){ctx.globalAlpha=0.3;ctx.fillStyle='#fff';ctx.fillRect(x-45,y-35,90,50);ctx.globalAlpha=1;}
}

// === PLACEHOLDER BOSSES (Mars, Glimora, Ice, Lava) ===
function updateMarsBoss(tx,ty){
  const b=boss;
  const dx=tx-b.x;if(Math.abs(dx)>120)b.vx+=(dx>0?1:-1)*0.04;
  b.vx*=0.95;b.x+=b.vx;b.y=GROUND_LEVEL-50;
  if(b.attackTimer>60){b.attackTimer=0;
    for(let i=0;i<3;i++){const a=-Math.PI/3+i*Math.PI/6-Math.PI/2;
      military.push({type:'boulder',x:b.x,y:b.y-30,vx:Math.cos(a)*3,vy:Math.sin(a)*5,life:120,dmg:8,color:'#a85030',boss:true});}
    triggerShake(5);}
}
function drawMarsBoss(){
  const b=boss,x=b.x,y=b.y;
  ctx.fillStyle='#a85030';ctx.fillRect(x-20,y-80,40,80);// body
  ctx.fillStyle='#c06040';ctx.fillRect(x-25,y-90,50,15);// head
  ctx.fillStyle='#886030';ctx.fillRect(x-35,y-60,15,50);// left arm (drill)
  ctx.fillStyle='#886030';ctx.fillRect(x+20,y-60,15,50);// right arm
  ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(x-28,y-12,8,0,Math.PI*2);ctx.fill();// drill tip
  ctx.fillStyle='#f44';ctx.beginPath();ctx.arc(x-8,y-85,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+8,y-85,3,0,Math.PI*2);ctx.fill();// eyes
}

function updateGlimoraBoss(tx,ty){
  const b=boss;
  b.x+=Math.sin(b.stateTimer*0.01)*0.5;b.y=GROUND_LEVEL-200+Math.sin(b.stateTimer*0.02)*30;
  if(b.attackTimer>80){b.attackTimer=0;
    // Expanding ring
    military.push({type:'bullet',x:b.x,y:b.y,vx:4,vy:0,life:60,dmg:5,color:'#c0f',boss:true});
    military.push({type:'bullet',x:b.x,y:b.y,vx:-4,vy:0,life:60,dmg:5,color:'#c0f',boss:true});
    military.push({type:'bullet',x:b.x,y:b.y,vx:0,vy:4,life:60,dmg:5,color:'#c0f',boss:true});}
}
function drawGlimoraBoss(){
  const b=boss,x=b.x,y=b.y;
  ctx.save();ctx.translate(x,y);
  // Crystal body (diamond)
  ctx.fillStyle='#a050ff';
  ctx.beginPath();ctx.moveTo(0,-35);ctx.lineTo(25,0);ctx.lineTo(0,35);ctx.lineTo(-25,0);ctx.closePath();ctx.fill();
  // Orbiting shards
  for(let i=0;i<6;i++){const a=b.stateTimer*0.02+i*Math.PI/3,r=50;
    ctx.fillStyle='#c080ff';ctx.beginPath();const sx=Math.cos(a)*r,sy=Math.sin(a)*r*0.5;
    ctx.moveTo(sx,sy-8);ctx.lineTo(sx+5,sy+4);ctx.lineTo(sx-5,sy+4);ctx.closePath();ctx.fill();}
  ctx.restore();
}

function updateIceBoss(tx,ty){
  const b=boss;
  // Serpentine movement
  b.x+=Math.cos(b.stateTimer*0.015)*3;b.y=GROUND_LEVEL-250+Math.sin(b.stateTimer*0.02)*100;
  if(b.attackTimer>45){b.attackTimer=0;
    const a=Math.atan2(ty-b.y,tx-b.x);
    military.push({type:'bullet',x:b.x,y:b.y,vx:Math.cos(a)*5,vy:Math.sin(a)*5,life:90,dmg:5,color:'#8cf',boss:true});}
}
function drawIceBoss(){
  const b=boss,x=b.x,y=b.y;
  // Segmented snake
  for(let i=14;i>=0;i--){
    const seg=i*0.4,sx=x-Math.sin(b.stateTimer*0.015+seg)*i*4,sy=y+i*8;
    const r=i===0?12:10-i*0.3;const c=i===0?'#8acaff':'#4a6a8a';
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(sx,sy,Math.max(r,3),0,Math.PI*2);ctx.fill();
    if(i===0){// Head horns
      ctx.fillStyle='#cef';ctx.beginPath();ctx.moveTo(sx-8,sy-10);ctx.lineTo(sx-4,sy-22);ctx.lineTo(sx,sy-10);ctx.fill();
      ctx.beginPath();ctx.moveTo(sx,sy-10);ctx.lineTo(sx+4,sy-22);ctx.lineTo(sx+8,sy-10);ctx.fill();
      // Eyes
      ctx.fillStyle='#0ff';ctx.beginPath();ctx.arc(sx-4,sy-3,2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(sx+4,sy-3,2,0,Math.PI*2);ctx.fill();
    }
  }
}

function updateLavaBoss(tx,ty){
  const b=boss;
  b.y=GROUND_LEVEL-75;
  const dx=tx-b.x;if(Math.abs(dx)>150)b.vx+=(dx>0?1:-1)*0.03;
  b.vx*=0.97;b.x+=b.vx;
  // Core vulnerability window
  b.coreTimer++;
  b.coreOpen=b.phase>=2&&(b.coreTimer%480)<180; // 3 sec open, 5 sec closed
  if(b.attackTimer>50){b.attackTimer=0;
    // Lava bombs
    const count=b.phase===3?5:b.phase===2?4:3;
    for(let i=0;i<count;i++){const a=-Math.PI/2+(Math.random()-0.5)*1.5;
      military.push({type:'boulder',x:b.x,y:b.y-60,vx:Math.cos(a)*(3+Math.random()*2),vy:Math.sin(a)*6-2,life:150,dmg:10,color:'#f80',boss:true});}
    triggerShake(6);}
  // Lava particles from head crater
  if(Math.random()>0.7)particles.push({x:b.x+(Math.random()-0.5)*20,y:b.y-140,vx:(Math.random()-0.5)*2,vy:-Math.random()*3-1,life:30,color:'#f80',size:Math.random()*4+2});
}
function drawLavaBoss(){
  const b=boss,x=b.x,y=b.y;
  // Legs
  ctx.fillStyle='#3a1a0a';ctx.fillRect(x-25,y-30,18,35);ctx.fillRect(x+7,y-30,18,35);
  // Body
  ctx.fillStyle='#4a2a1a';ctx.fillRect(x-30,y-100,60,75);
  // Lava cracks on body
  ctx.strokeStyle='#f80';ctx.lineWidth=2;
  for(let i=0;i<5;i++){const cy=y-40-i*12;ctx.beginPath();ctx.moveTo(x-20+Math.sin(i)*10,cy);ctx.lineTo(x+20-Math.sin(i+1)*10,cy+6);ctx.stroke();}
  // Arms
  ctx.fillStyle='#3a1a0a';ctx.fillRect(x-50,y-90,22,50);ctx.fillRect(x+28,y-90,22,50);
  // Fists (glowing)
  ctx.fillStyle='#f60';ctx.beginPath();ctx.arc(x-39,y-42,12,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(x+39,y-42,12,0,Math.PI*2);ctx.fill();
  // Head (volcano crater)
  ctx.fillStyle='#2a0a00';ctx.beginPath();ctx.moveTo(x-20,y-100);ctx.lineTo(x-30,y-140);ctx.lineTo(x+30,y-140);ctx.lineTo(x+20,y-100);ctx.fill();
  ctx.fillStyle='#f40';ctx.beginPath();ctx.arc(x,y-140,15,Math.PI,0);ctx.fill(); // crater opening
  // Core (belly)
  if(b.coreOpen){
    const pulse=0.5+Math.sin(Date.now()*0.01)*0.3;
    ctx.fillStyle=`rgba(255,150,0,${pulse})`;ctx.beginPath();ctx.arc(x,y-65,12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ff0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y-65,15,0,Math.PI*2);ctx.stroke();
  }
}

// --- MOTHERSHIP INTERIOR ---
let mothershipMode = false; // true when inside mothership
const mothershipInterior = {
  width:1200, height:400,
  npcs:[
    {id:'commander',name:'Commander Zyx',x:450,y:0,color:'#8a8',
     idle:["The harvest continues.","More specimens. Always more.","Report, operative."],
     progress:["Impressive haul.","The council will be pleased.","Keep up the terror."],
     missions:true},
    {id:'scientist',name:'Dr. Quilb',x:2200,y:0,color:'#88a',
     idle:["Fascinating creatures...","I need more subjects.","The specimens are restless.","Come see the zoo!"],
     progress:["Excellent specimen diversity!","Their biology is... crude.","The zoo grows nicely.","More planets, more data."],
     missions:false},
    {id:'pilot',name:'Pilot Vrek',x:900,y:0,color:'#a88',
     idle:["Ship's running smooth.","Where to next, boss?","I've plotted new routes."],
     progress:["Engines upgraded nicely.","She handles like a dream.","Fuel cells are topped off."],
     missions:false},
    {id:'engineer',name:'Engineer Blip',x:1350,y:0,color:'#aa6',
     idle:["Reactor's humming.","Don't touch that.","Power levels nominal."],
     progress:["Upgraded the core!","Maximum efficiency.","She purrs like a nebula cat."],
     missions:false}
  ],
  talkingTo:null, dialogTimer:0, dialogText:'',
  commsMessages:[], commsSelected:0, commsReading:null, commsTalkAnim:0
};

// --- PLANET LEADERS (comms contacts) ---
const planetLeaders = [
  {id:'earth_president', planetId:'earth', name:'President Davis', color:'#c9a87c',
    portrait:'human', // human male in suit
    messages:[
      {text:"This is the President of Earth. Cease your abductions immediately or face consequences!", type:'demand'},
      {text:"We are willing to negotiate. Return our citizens and we'll share our... primitive technology.", type:'negotiate'},
      {text:"Our military is mobilizing. You have been warned, alien scum!", type:'threat'},
      {text:"Please... the people are terrified. What do you want from us?", type:'plea'},
      {text:"We've detected your ship near our atmosphere. Leave now!", type:'demand'},
    ],
    demands:[
      {text:"If you must terrorize us... at least abduct 3 of our worst criminals. Here are their locations.", mission:{type:'abduct',target:3,desc:'Abduct 3 Earth criminals',reward:8}},
      {text:"STOP destroying our buildings! ...Or destroy 2 more so we can collect insurance.", mission:{type:'destroy',target:2,desc:'Destroy 2 insured buildings',reward:10}},
      {text:"Our scientists want to study your terror tactics. Reach terror level 4 and we will pay.", mission:{type:'terror',target:4,desc:'Terrorize Earth to level 4',reward:12}},
      {text:"Prove you can survive on foot among our people for 20 seconds. Then we negotiate.", mission:{type:'survive',target:20,desc:'Walk among Earthlings 20s',reward:15}},
    ]},
  {id:'mars_chief', planetId:'mars', name:'Overlord Krex', color:'#cc5544',
    portrait:'martian', // red-skinned warrior
    messages:[
      {text:"You dare enter Martian space? Our warriors will crush you!", type:'threat'},
      {text:"The red sands will swallow your ship. Turn back!", type:'threat'},
      {text:"Perhaps we can strike a deal... we have resources you might want.", type:'negotiate'},
      {text:"Our scouts report your firepower. Impressive, but not enough.", type:'taunt'},
    ],
    demands:[
      {text:"You want Mars? Prove your strength. Abduct 4 of our warriors!", mission:{type:'abduct',target:4,desc:'Abduct 4 Martian warriors',reward:10}},
      {text:"Our fortresses mock you. Destroy 3 and maybe we'll respect you.", mission:{type:'destroy',target:3,desc:'Destroy 3 Martian forts',reward:12}},
      {text:"Walk our red sands for 20 seconds. If you survive, we talk.", mission:{type:'survive',target:20,desc:'Survive 20s on Mars',reward:15}},
      {text:"Show us true terror. Reach level 5 and the clans will bow.", mission:{type:'terror',target:5,desc:'Terrorize Mars to level 5',reward:18}},
    ]},
  {id:'glimora_elder', planetId:'glimora', name:'Elder Luminax', color:'#bb88ff',
    portrait:'crystal', // crystalline being
    messages:[
      {text:"The crystal harmonics detect your presence. You disturb our resonance.", type:'plea'},
      {text:"We offer knowledge of the cosmos in exchange for peace.", type:'negotiate'},
      {text:"Our light-shields are charging. You will not find us easy prey.", type:'threat'},
    ],
    demands:[
      {text:"The crystals sing of your coming. Gather 5 of our resonant beings for study.", mission:{type:'abduct',target:5,desc:'Abduct 5 crystal beings',reward:12}},
      {text:"Shatter 3 of our towers to release trapped harmonics. We will reward you.", mission:{type:'destroy',target:3,desc:'Shatter 3 crystal towers',reward:14}},
      {text:"Walk among our light for 25 seconds. Absorb our knowledge.", mission:{type:'survive',target:25,desc:'Meditate on Glimora 25s',reward:18}},
    ]},
  {id:'ice_queen', planetId:'ice', name:'Queen Frostia', color:'#88ccff',
    portrait:'ice', // ice being
    messages:[
      {text:"The frozen wastes will be your grave, outsider.", type:'threat'},
      {text:"Our glacial defenses are impenetrable. Leave while you can.", type:'threat'},
      {text:"Perhaps the cold has made us... open to diplomacy. What are your terms?", type:'negotiate'},
    ],
    demands:[
      {text:"The frozen ones are expendable. Take 5 and leave the rest.", mission:{type:'abduct',target:5,desc:'Abduct 5 Frostlings',reward:14}},
      {text:"Our ice walls block ancient tunnels. Destroy 3 structures to open them.", mission:{type:'destroy',target:3,desc:'Break 3 ice walls',reward:16}},
      {text:"Survive our blizzards for 30 seconds. Then I will respect you.", mission:{type:'survive',target:30,desc:'Brave the cold 30s',reward:20}},
    ]},
  {id:'lava_warlord', planetId:'lava', name:'Warlord Ignis', color:'#ff6633',
    portrait:'lava', // magma being
    messages:[
      {text:"BURN! Everything burns! You will burn too!", type:'threat'},
      {text:"The volcanoes answer to ME. Come closer and feel their wrath!", type:'threat'},
      {text:"You have fire in you, alien. I respect that. But I'll still destroy you.", type:'taunt'},
    ],
    demands:[
      {text:"BRING ME 6 OF MY OWN PEOPLE! I need to... discipline them.", mission:{type:'abduct',target:6,desc:'Abduct 6 for Warlord Ignis',reward:16}},
      {text:"Destroy 4 temples! I want to rebuild them BIGGER!", mission:{type:'destroy',target:4,desc:'Raze 4 fire temples',reward:18}},
      {text:"Terror level 7! Make them FEAR! Make them BURN with fear!", mission:{type:'terror',target:7,desc:'Terrorize Infernia to 7',reward:25}},
    ]},
];

// --- MISSION SYSTEM ---
let currentMission = null;
let missionComplete = false;
let missionTimer = 0;
const missionTypes = [
  {type:'abduct',desc:'Abduct {n} specimens',gen:()=>({target:Math.floor(Math.random()*4)+3,progress:0})},
  {type:'destroy',desc:'Destroy {n} buildings',gen:()=>({target:Math.floor(Math.random()*3)+2,progress:0})},
  {type:'survive',desc:'Survive {n}s on foot',gen:()=>({target:Math.floor(Math.random()*15)+15,progress:0})},
  {type:'terror',desc:'Reach terror level {n}',gen:()=>({target:Math.floor(Math.random()*3)+5,progress:0})},
];

// --- PLANET MISSION CHAINS (5 per planet, sequential) ---
const planetMissions = {
  earth: [
    {type:'abduct', target:3, desc:'Abduct 3 Earthlings', reward:5},
    {type:'destroy', target:2, desc:'Destroy 2 buildings', reward:10},
    {type:'terror', target:3, desc:'Reach terror level 3', reward:15},
    {type:'survive', target:15, desc:'Survive 15s on foot', reward:20},
    {type:'abduct', target:5, desc:'Abduct 5 in one visit', reward:30},
  ],
  mars: [
    {type:'abduct', target:4, desc:'Abduct 4 colonists', reward:5},
    {type:'destroy', target:3, desc:'Destroy 3 structures', reward:10},
    {type:'terror', target:4, desc:'Reach terror level 4', reward:15},
    {type:'survive', target:20, desc:'Survive 20s on foot', reward:20},
    {type:'abduct', target:6, desc:'Abduct 6 in one visit', reward:30},
  ],
  glimora: [
    {type:'abduct', target:5, desc:'Abduct 5 Glimorians', reward:5},
    {type:'destroy', target:3, desc:'Destroy 3 crystal towers', reward:10},
    {type:'survive', target:20, desc:'Survive 20s among Glimorians', reward:15},
    {type:'terror', target:5, desc:'Reach terror level 5', reward:20},
    {type:'abduct', target:7, desc:'Abduct 7 in one visit', reward:30},
  ],
  ice: [
    {type:'destroy', target:2, desc:'Destroy 2 ice structures', reward:5},
    {type:'abduct', target:5, desc:'Abduct 5 Frostlings', reward:10},
    {type:'terror', target:5, desc:'Reach terror level 5', reward:15},
    {type:'survive', target:25, desc:'Survive 25s in the cold', reward:20},
    {type:'abduct', target:8, desc:'Abduct 8 in one visit', reward:30},
  ],
  lava: [
    {type:'destroy', target:3, desc:'Destroy 3 fire temples', reward:5},
    {type:'abduct', target:6, desc:'Abduct 6 Infernals', reward:10},
    {type:'survive', target:25, desc:'Survive 25s on Infernia', reward:15},
    {type:'terror', target:6, desc:'Reach terror level 6', reward:20},
    {type:'abduct', target:10, desc:'Abduct 10 in one visit', reward:30},
  ],
};

// --- PLAYER ALIEN (on-foot mode) ---
let playerMode = 'ship'; // 'ship' or 'onfoot'
const alien = {
  x:0, y:GROUND_LEVEL-30, vx:0, vy:0,
  facing:1, // 1=right, -1=left
  onGround:false, grounded:false,
  walkTimer:0, jetpackFuel:100,
  shootCooldown:0, health:100,
  w:12, h:30
};

function triggerShake(intensity){ screenShake.intensity=Math.max(screenShake.intensity,intensity); }

// --- PLANET / SPACE SYSTEM ---
let gameMode = 'planet'; // 'planet' or 'space'
let currentPlanet = null;
let lastVisitedPlanet = null;
let planets = [];
let spaceWidth = 8000;
let spaceHeight = 6000;
let transition = { active:false, type:null, timer:0, duration:60, planet:null, zoom:1 };
function easeInOut(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function easeIn(t){return t*t*t;}
function easeOut(t){return 1-Math.pow(1-t,3);}
let worldWidth = 6000;
let earthMilitaryBases = []; // positions of military bases on Earth
let underwaterObjects = []; // fish, coral, shipwrecks, etc.
let flashlightOn = false; // toggled with L key
let underwaterCaves = []; // cave entrances leading to secret areas
let caveCreatures = []; // weird animals living in dry cave sections

function isOverOcean(x) {
  if(!currentPlanet || currentPlanet.id !== 'earth') return false;
  const biome = getEarthBiome(x);
  return biome.isOcean || false;
}

// --- EARTH BIOME SYSTEM ---
// Earth gets a bigger world with realistic biome layout
const earthBiomes = [
  {id:'city',      from:0,     to:3500,  groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a5a3a', grassHeight:4, treeDensity:0.08, treeCanopyColor:'#2a6a1a'},
  {id:'suburbs',   from:3500,  to:5500,  groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a5a3a', grassHeight:6, treeDensity:0.35, treeCanopyColor:'#2a7a1a'},
  {id:'farmland',  from:6000,  to:9500,  groundColor:['#4a6a2a','#3a5a1a','#2a4a0a'], grassColor:'#5a8a2a', grassHeight:10, treeDensity:0.15, treeCanopyColor:'#3a7a1a', isFarm:true},
  {id:'jungle',    from:10000, to:13500, groundColor:['#1a3a1a','#0a2a0a','#052005'], grassColor:'#1a5a1a', grassHeight:14, treeDensity:0.8, treeCanopyColor:'#0a5a0a'},
  {id:'mountains', from:14000, to:16000, groundColor:['#5a5a5a','#4a4a4a','#3a3a3a'], grassColor:'#5a6a5a', grassHeight:2, treeDensity:0.1, treeCanopyColor:'#3a5a2a', isMountain:true},
  {id:'snow',      from:16000, to:19500, groundColor:['#e8eef5','#c8d0e0','#9aa8c0'], grassColor:'#f0f4fa', grassHeight:0, treeDensity:0.25, treeCanopyColor:'#2a4a3a', isMountain:true, isSnow:true},
  {id:'desert',    from:20000, to:23500, groundColor:['#c0a060','#a08040','#806020'], grassColor:'#c0a060', grassHeight:0, treeDensity:0.02, treeCanopyColor:'#5a7a2a'},
  {id:'landmarks', from:24000, to:27000, groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a6a3a', grassHeight:6, treeDensity:0.15, treeCanopyColor:'#2a6a1a'},
  {id:'beach',     from:27300, to:27900, groundColor:['#d0c090','#c0b080','#b0a070'], grassColor:'#c0b080', grassHeight:0, treeDensity:0.05, treeCanopyColor:'#4a8a2a'},
  {id:'ocean',     from:27900, to:34000, groundColor:['#0a3a6a','#082a4a','#041a2a'], grassColor:'#0a3a6a', grassHeight:0, treeDensity:0, treeCanopyColor:'#0a3a6a', isOcean:true},
];
// Transition zones between biomes (smooth ground color blend)
const earthTransitions = [
  {from:5500,  to:6000,  biomeA:'suburbs',   biomeB:'farmland'},
  {from:9500,  to:10000, biomeA:'farmland',  biomeB:'jungle'},
  {from:13500, to:14000, biomeA:'jungle',    biomeB:'mountains'},
  {from:16000, to:16000, biomeA:'mountains', biomeB:'snow'},     // immediate (no gap)
  {from:19500, to:20000, biomeA:'snow',      biomeB:'desert'},
  {from:23500, to:24000, biomeA:'desert',    biomeB:'landmarks'},
  {from:27000, to:27300, biomeA:'landmarks', biomeB:'beach'},
  {from:27800, to:28000, biomeA:'beach',     biomeB:'ocean'},
];
function getEarthBiome(x){
  const ww=EARTH_WORLD_WIDTH;
  const wx=((x%ww)+ww)%ww;
  // Check transitions first
  for(const tr of earthTransitions){
    if(wx>=tr.from&&wx<tr.to){
      const t2=(wx-tr.from)/(tr.to-tr.from);
      const a=earthBiomes.find(b=>b.id===tr.biomeA)||earthBiomes[0];
      const b=earthBiomes.find(b2=>b2.id===tr.biomeB)||earthBiomes[0];
      return {id:'transition',groundColor:a.groundColor.map((c,i)=>lerpColor(c,b.groundColor[i],t2)),
        grassColor:lerpColor(a.grassColor,b.grassColor,t2),
        grassHeight:a.grassHeight*(1-t2)+b.grassHeight*t2,
        treeDensity:a.treeDensity*(1-t2)+b.treeDensity*t2,
        treeCanopyColor:lerpColor(a.treeCanopyColor,b.treeCanopyColor,t2)};
    }
  }
  return earthBiomes.find(b=>wx>=b.from&&wx<b.to)||earthBiomes[0];
}

// --- PLANET DEFINITIONS ---
const planetDefs = [
  {
    id: 'earth', name: 'Earth', desc: '"Home. For now."',
    radius: 180, color: '#2a5a2a', color2: '#1a3a6a', atmosphere: '#4a8aff',
    skyTop: '#0a0a1a', skyMid: '#1a1a3a', skyBot: '#2a1a2a',
    groundColor: ['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor: '#3a5a3a',
    buildingColors: [['#554','#665','#443'],['#545','#656','#434'],['#455','#566','#344']],
    inhabitantCount: 40, buildingDensity: 1, hasClouds: true, isAlien: false,
    sadFacts: ['"They had families..."','"He just got a puppy..."',
      '"She never finished her novel..."','"He promised he\'d be home for dinner..."',
      '"The dog will wait by the door forever..."','"His kid drew him a picture today..."'],
    cryPhrases: ["PLEASE NO","MY FAMILY","WHY ME","HELP","NOT LIKE THIS",
      "MOMMY","NOOOO","I LEFT THE OVEN ON","MY PARKING METER"],
  },
  {
    id: 'mars', name: 'Mars Colony', desc: '"They came here to escape Earth. Ironic."',
    radius: 140, color: '#8a3a1a', color2: '#6a2a0a', atmosphere: '#ff6a3a',
    skyTop: '#1a0a0a', skyMid: '#3a1a0a', skyBot: '#5a2a1a',
    groundColor: ['#6a3a2a','#5a2a1a','#4a1a0a'], grassColor: '#7a4a3a',
    buildingColors: [['#766','#877','#655'],['#776','#887','#665']],
    inhabitantCount: 25, buildingDensity: 0.7, hasClouds: false, isAlien: false,
    sadFacts: ['"They spent 7 months getting here..."','"Mars was supposed to be safe..."',
      '"The colony was finally self-sustaining..."','"Their oxygen supply was just restocked..."'],
    cryPhrases: ["NOT HERE TOO","WE CAME SO FAR","THE COLONY","MY OXYGEN",
      "EARTH WAS RIGHT","MAYDAY MAYDAY","SEAL THE AIRLOCK"],
  },
  {
    id: 'glimora', name: 'Glimora', desc: '"A peaceful purple world. Was."',
    radius: 200, color: '#5a2a8a', color2: '#3a1a6a', atmosphere: '#a050ff',
    skyTop: '#1a0a2a', skyMid: '#2a1a4a', skyBot: '#3a1a5a',
    groundColor: ['#4a2a5a','#3a1a4a','#2a0a3a'], grassColor: '#6a3a8a',
    buildingColors: [['#a8f','#c8f','#86d'],['#8af','#8cf','#68d']],
    inhabitantCount: 35, buildingDensity: 1.2, hasClouds: true, isAlien: true,
    alienSkin: ['#c8f','#a6d','#d8ff','#b8e'],
    alienHeadShape: 'tall', // tall oval head
    alienExtra: 'antennae',
    alienLabel: 'Glimorian',
    sadFacts: ['"They communicated through song..."','"Their art was beautiful beyond words..."',
      '"The purple flowers only bloom once a century..."','"Their children glow in the dark..."'],
    cryPhrases: ["ZYLORP NO","THE CRYSTAL TEMPLE","OUR SONGS","GLIMORA WEEPS",
      "THE ELDERS WARNED US","OUR MOONS","PURPLE FOREVER","THE PROPHECY"],
    alienTypes: [
      { type:'singer', label:'Song Weaver', scale:1, bodyWidth:5, headR:10, mass:0.8, colors:['#c8f','#a6d','#d8e'] },
      { type:'elder', label:'Crystal Elder', scale:1.2, bodyWidth:6, headR:12, mass:1.5, colors:['#86d','#648','#a8f'] },
      { type:'child', label:'Glimling', scale:0.55, bodyWidth:3, headR:9, mass:0.3, colors:['#f8f','#faf','#fcf'] },
      { type:'guard', label:'Prism Guard', scale:1.15, bodyWidth:7, headR:9, mass:1.8, colors:['#648','#426','#538'] },
    ],
  },
  {
    id: 'ice', name: 'Frostheim', desc: '"Frozen. Like their hopes."',
    radius: 160, color: '#4a6a8a', color2: '#2a4a6a', atmosphere: '#8acaff',
    skyTop: '#0a1a2a', skyMid: '#1a2a4a', skyBot: '#2a3a5a',
    groundColor: ['#8aaacc','#6a8aaa','#4a6a8a'], grassColor: '#aaccee',
    buildingColors: [['#aac','#bbd','#88a'],['#abc','#bcd','#9ab']],
    inhabitantCount: 20, buildingDensity: 0.6, hasClouds: true, isAlien: true,
    alienSkin: ['#cef','#bdf','#adf','#def'],
    alienHeadShape: 'wide', // wide flat head
    alienExtra: 'horns',
    alienLabel: 'Frostling',
    sadFacts: ['"They survived the eternal winter..."','"Their hot springs were legendary..."',
      '"The ice castles took generations to carve..."','"They finally found warmth in each other..."'],
    cryPhrases: ["IT'S COLD ENOUGH ALREADY","OUR IGLOOS","THE ICE KING",
      "FROST TAKE YOU","BRRR NO","THE FROZEN LAKE","WINTER IS FOREVER"],
    alienTypes: [
      { type:'yeti', label:'Snow Yeti', scale:1.3, bodyWidth:9, headR:10, mass:2.5, colors:['#cdf','#bce','#ade'] },
      { type:'scout', label:'Ice Scout', scale:0.9, bodyWidth:4, headR:8, mass:0.7, colors:['#8ce','#7bd','#6ac'] },
      { type:'child', label:'Snowling', scale:0.5, bodyWidth:3, headR:8, mass:0.3, colors:['#eff','#dff','#cff'] },
      { type:'shaman', label:'Frost Shaman', scale:1, bodyWidth:5, headR:11, mass:1, colors:['#68a','#579','#48a'] },
    ],
  },
  {
    id: 'lava', name: 'Infernia', desc: '"Hot planet. Hotter tempers."',
    radius: 170, color: '#8a2a0a', color2: '#aa4a0a', atmosphere: '#ff4400',
    skyTop: '#2a0a00', skyMid: '#4a1a00', skyBot: '#6a2a0a',
    groundColor: ['#4a2a1a','#3a1a0a','#5a2a0a'], grassColor: '#8a4a2a',
    buildingColors: [['#644','#755','#533'],['#654','#765','#543']],
    inhabitantCount: 30, buildingDensity: 0.8, hasClouds: false, isAlien: true,
    alienSkin: ['#f84','#e63','#f96','#d52'],
    alienHeadShape: 'pointy', // pointy demon-like head
    alienExtra: 'tail',
    alienLabel: 'Infernal',
    sadFacts: ['"They built cities on cooled lava flows..."','"Their fire dances were sacred..."',
      '"They worshipped the volcanoes..."','"The obsidian towers took millennia..."'],
    cryPhrases: ["BY THE VOLCANO","MOLTEN GODS WHY","OUR FIRE TEMPLES",
      "THE LAVA RISES","BURN EVERYTHING ELSE NOT US","ASH AND SORROW"],
    alienTypes: [
      { type:'brute', label:'Lava Brute', scale:1.25, bodyWidth:8, headR:9, mass:2, colors:['#a30','#820','#b40'] },
      { type:'imp', label:'Fire Imp', scale:0.6, bodyWidth:4, headR:7, mass:0.4, colors:['#f80','#fa0','#f60'] },
      { type:'priest', label:'Flame Priest', scale:1, bodyWidth:5, headR:10, mass:1, colors:['#420','#310','#530'] },
      { type:'dancer', label:'Ember Dancer', scale:0.95, bodyWidth:4, headR:8, mass:0.8, colors:['#f64','#f86','#f42'] },
    ],
  },
  {
    id: 'sand', name: 'Kephara', desc: '"Ancient. Eternal. Doomed."',
    radius: 190, color: '#c0a040', color2: '#a08030', atmosphere: '#e0c060',
    skyTop: '#1a1508', skyMid: '#2a2510', skyBot: '#4a3a20',
    groundColor: ['#c0a050','#b09040','#a08030'], grassColor: '#d0b060',
    buildingColors: [['#a98','#ba9','#987'],['#b98','#ca9','#a87']],
    inhabitantCount: 25, buildingDensity: 0.6, hasClouds: false, isAlien: true,
    alienSkin: ['#d4a050','#c09040','#e0b060','#b08030'],
    alienHeadShape: 'egyptian',
    alienExtra: 'headdress',
    alienLabel: 'Kepharan',
    sadFacts: ['"Their pyramids aligned with stars no one else could see..."','"The hieroglyphs told of this day..."',
      '"Their pharaohs were gods among mortals..."','"The sands remember what the cosmos forgets..."'],
    cryPhrases: ["BY THE SACRED SUN","THE PYRAMIDS WEEP","ANUBIS SAVE US",
      "OUR ETERNAL KINGDOM","THE PROPHECY WAS TRUE","CURSE YOU STARWALKER","THE SANDS WILL AVENGE US"],
    alienTypes: [
      { type:'pharaoh', label:'Sun Pharaoh', scale:1.3, bodyWidth:7, headR:11, mass:2, colors:['#c8a020','#a08010','#e0c030'] },
      { type:'priest', label:'Ra Priest', scale:1, bodyWidth:5, headR:10, mass:1, colors:['#f0e0a0','#d0c080','#e0d090'] },
      { type:'guard', label:'Horus Guard', scale:1.15, bodyWidth:7, headR:9, mass:1.8, colors:['#806020','#604010','#907030'] },
      { type:'scribe', label:'Star Scribe', scale:0.9, bodyWidth:4, headR:8, mass:0.7, colors:['#d0b070','#c0a060','#b09050'] },
      { type:'child', label:'Sphinx Child', scale:0.5, bodyWidth:3, headR:8, mass:0.3, colors:['#e0c070','#d0b060','#f0d080'] },
    ],
  },
  {
    id: 'asteroid', name: 'Gorvath Rock', desc: '"A drifting tomb. Something lives inside."',
    radius: 60, color: '#3a3a3a', color2: '#1a1a1a', atmosphere: '#4a2a4a',
    skyTop: '#000000', skyMid: '#0a0008', skyBot: '#150010',
    groundColor: ['#2a2a2a','#1a1a1a','#0a0a0a'], grassColor: '#3a3a3a',
    buildingColors: [['#333','#444','#222'],['#343','#454','#232']],
    inhabitantCount: 12, buildingDensity: 0.3, hasClouds: false, isAlien: true,
    alienSkin: ['#5a3a5a','#4a2a4a','#6a4a6a','#3a1a3a'],
    alienHeadShape: 'tall',
    alienExtra: 'antennae',
    alienLabel: 'Parasite',
    sadFacts: ['"They feed on the asteroid itself..."','"Their bodies are fused with the rock..."',
      '"They have been drifting for millennia..."','"No one comes here on purpose..."'],
    cryPhrases: ["THE HOST WEEPS","WE ARE THE ROCK","CONSUME","FUSE WITH US",
      "FOREVER DRIFTING","THE DARK FEEDS","NO ESCAPE","ABSORB"],
    alienTypes: [
      { type:'bloater', label:'Bloated Parasite', scale:1.5, bodyWidth:12, headR:8, mass:3, colors:['#5a2a5a','#4a1a4a','#6a3a6a'] },
      { type:'crawler', label:'Flesh Crawler', scale:0.5, bodyWidth:6, headR:5, mass:0.3, colors:['#8a4a6a','#6a2a4a','#aa6a8a'] },
      { type:'spitter', label:'Acid Spitter', scale:0.9, bodyWidth:5, headR:10, mass:0.8, colors:['#4a6a2a','#2a4a0a','#6a8a4a'] },
      { type:'mother', label:'Brood Mother', scale:1.8, bodyWidth:14, headR:13, mass:5, colors:['#3a1a2a','#2a0a1a','#4a2a3a'] },
      { type:'child', label:'Hatchling', scale:0.3, bodyWidth:3, headR:6, mass:0.15, colors:['#aa6a8a','#cc8aaa','#886a7a'] },
    ],
  },
  {
    id: 'sun', name: 'Helion', desc: '"The star itself. Surface temperature: too much."',
    radius: 420, color: '#ffd060', color2: '#ff8020', atmosphere: '#ffb040',
    skyTop: '#ff6020', skyMid: '#ff8040', skyBot: '#ffb060',
    groundColor: ['#ff6020','#e04010','#a02000'], grassColor: '#ff8040',
    buildingColors: [['#ff8040','#ffa060','#e06020']],
    inhabitantCount: 15, buildingDensity: 0.5, hasClouds: false, isAlien: true, isSun: true,
    alienSkin: ['#ffc040','#ff8020','#ffe080','#ff6010'],
    alienHeadShape: 'round',
    alienExtra: 'none',
    alienLabel: 'Solarian',
    sadFacts: ['"They live inside fire..."','"Their tears evaporate instantly..."','"Nothing can burn brighter than their grief..."'],
    cryPhrases: ["BURN WITH US","THE CORE WEEPS","ETERNAL FLAME","WE ARE FIRE","TOO BRIGHT TO DIE","SEE THE CORONA"],
    alienTypes: [
      { type:'ember', label:'Ember', scale:0.7, bodyWidth:5, headR:7, mass:0.5, colors:['#ffd060','#ff8020','#ffa040'] },
      { type:'flare', label:'Flare Dancer', scale:1.0, bodyWidth:6, headR:9, mass:1, colors:['#ffe080','#ffa040','#ff6020'] },
      { type:'inferno', label:'Inferno Lord', scale:1.6, bodyWidth:12, headR:13, mass:4, colors:['#ff4010','#a02000','#ffc040'] },
    ],
  },
];

// --- EARTH HUMAN TYPES ---
const earthHumanTypes = [
  { type:'normal', label:'Commuter', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#c44','#44c','#4c4','#cc4'], hat:null, extra:null },
  { type:'fat', label:'Big Larry', scale:1.1, bodyWidth:9, headR:9, mass:2.5, colors:['#a55','#5a5','#55a'], hat:null, extra:'belly' },
  { type:'child', label:'Little Timmy', scale:0.6, bodyWidth:4, headR:7, mass:0.4, colors:['#f8f','#8ff','#ff8'], hat:null, extra:'backpack' },
  { type:'priest', label:'Father Marcus', scale:1, bodyWidth:6, headR:8, mass:1, colors:['#111','#222'], hat:'collar', extra:'cross' },
  { type:'gangster', label:'Big Tony', scale:1.15, bodyWidth:7, headR:8, mass:1.5, colors:['#333','#222'], hat:'cap', extra:'chain' },
  { type:'old', label:'Grandma Rose', scale:0.85, bodyWidth:5, headR:8, mass:0.8, colors:['#a8a','#88a'], hat:'bun', extra:'cane' },
  { type:'jogger', label:'Marathon Mike', scale:1, bodyWidth:4, headR:7, mass:0.9, colors:['#f60','#0cf'], hat:'headband', extra:null },
  { type:'businesswoman', label:'CEO Karen', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#336','#633'], hat:null, extra:'briefcase' },
];
const suburbHumanTypes = [
  { type:'farmer', label:'Farmer Bob', scale:1.05, bodyWidth:6, headR:8, mass:1.2, colors:['#684','#574','#463'], hat:'straw', extra:null },
  { type:'farmer', label:'Farm Girl', scale:0.9, bodyWidth:5, headR:8, mass:0.9, colors:['#786','#675','#564'], hat:'straw', extra:null },
  { type:'normal', label:'Neighbor', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#468','#684','#846'], hat:null, extra:null },
  { type:'child', label:'Farm Kid', scale:0.6, bodyWidth:4, headR:7, mass:0.4, colors:['#8a6','#6a8'], hat:null, extra:null },
  { type:'old', label:'Grandpa Earl', scale:0.9, bodyWidth:6, headR:8, mass:1, colors:['#666','#555'], hat:null, extra:'cane' },
];
const landmarkHumanTypes = [
  { type:'normal', label:'Tourist', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#e44','#4e4','#44e','#ee4'], hat:null, extra:'briefcase' },
  { type:'normal', label:'Guide', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#684','#486'], hat:'cap', extra:null },
  { type:'child', label:'Kid Tourist', scale:0.6, bodyWidth:4, headR:7, mass:0.4, colors:['#f8f','#8ff'], hat:null, extra:'backpack' },
];
const mountainHumanTypes = [
  { type:'jogger', label:'Hiker', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#684','#486','#648'], hat:'cap', extra:'backpack' },
  { type:'normal', label:'Mountain Guide', scale:1.05, bodyWidth:5, headR:8, mass:1.1, colors:['#664','#446'], hat:null, extra:null },
];

// Biome-specific human types for Earth
const jungleHumanTypes = [
  { type:'indigenous', label:'Inca Warrior', scale:1, bodyWidth:5, headR:8, mass:1.1, colors:['#8a4a1a','#a06020','#6a3a10'], hat:'feather', extra:null },
  { type:'indigenous', label:'Tribal Elder', scale:0.9, bodyWidth:5, headR:8, mass:0.9, colors:['#904a10','#7a3a08','#603008'], hat:'feather', extra:null },
  { type:'indigenous', label:'Village Girl', scale:0.75, bodyWidth:4, headR:7, mass:0.6, colors:['#c06830','#a05820','#804010'], hat:null, extra:null },
  { type:'indigenous', label:'Hunter', scale:1.05, bodyWidth:5, headR:8, mass:1.2, colors:['#8a5020','#6a3a10'], hat:'feather', extra:null },
];
const desertHumanTypes = [
  { type:'normal', label:'Merchant', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#e8dcc8','#d4c8a0','#c0b490'], hat:null, extra:null },
  { type:'normal', label:'Shopkeeper', scale:1, bodyWidth:6, headR:8, mass:1.1, colors:['#d8c8a8','#c8b890'], hat:null, extra:null },
  { type:'child', label:'Street Kid', scale:0.65, bodyWidth:4, headR:7, mass:0.4, colors:['#e0d0b0','#d0c0a0'], hat:null, extra:null },
  { type:'old', label:'Elder', scale:0.9, bodyWidth:5, headR:8, mass:0.8, colors:['#fff','#eee','#ddd'], hat:null, extra:'cane' },
  { type:'normal', label:'Traveler', scale:1, bodyWidth:5, headR:8, mass:1, colors:['#b0a080','#908060'], hat:null, extra:null },
];
const earthTypeQuotes = {
  'priest':["GOD WHY","THIS ISN'T THE RAPTURE","FORGIVE THEM"],
  'gangster':["YO WHAT THE","NAH BRO NAH","MY CREW WILL FIND YOU"],
  'child':["MOMMY!!","I WANT DOWN","SCARY!!"],
  'fat':["MY DINNER","NOT BEFORE DESSERT","AAAA MY BACK"],
  'old':["NOT AGAIN","MY HIP!","HAROLD IS THAT YOU"],
  'jogger':["MY STRAVA!","NOOO MY STREAK"],
  'businesswoman':["CALL MY LAWYER","I'LL SUE"],
  'indigenous':["THE SPIRITS WARNED US","THE SKY DEMONS","RUN TO THE FOREST","PACHAMAMA HELP US"],
};

// --- SPACESHIP ---
const ship = { x:400, y:GROUND_LEVEL-200, vx:0, vy:0, tilt:0, boosting:false, beamActive:false, lightPhase:0 };

// --- INIT ---
const mothershipPos={x:3500,y:-600};
function initSpacePlanets() {
  planets = [];
  const positions = [
    {x:1500,y:-1500},{x:4000,y:-2500},{x:6500,y:-1800},{x:3000,y:-4200},{x:5500,y:-3800},{x:7500,y:-4500},{x:-2000,y:-6500},
    {x:22000,y:-16000}, // Sun — very far away, must travel to discover
  ];
  planetDefs.forEach((def,i) => {
    planets.push({ ...def, spaceX:positions[i].x, spaceY:positions[i].y, visited:false, savedState:null });
  });
}

function generateDeepStars() {
  deepStars = [];
  for (let i=0;i<600;i++) {
    deepStars.push({
      x:Math.random()*spaceWidth*2-spaceWidth*0.3,
      y:Math.random()*spaceHeight*2-spaceHeight*0.3,
      size:Math.random()*2.5+0.3,
      twinkle:Math.random()*Math.PI*2,
      speed:Math.random()*0.02+0.005,
      color:['#fff','#aaf','#ffa','#faa','#afa'][Math.floor(Math.random()*5)]
    });
  }
}

function generateStars() {
  stars = [];
  for (let i=0;i<200;i++) stars.push({x:Math.random()*worldWidth,y:Math.random()*1000-500,size:Math.random()*2+0.5,twinkle:Math.random()*Math.PI*2,speed:Math.random()*0.02+0.005});
}

function generateClouds() {
  clouds = [];
  if (!currentPlanet||!currentPlanet.hasClouds) return;
  for (let i=0;i<15;i++) clouds.push({x:Math.random()*worldWidth,y:GROUND_LEVEL-600-Math.random()*400,width:Math.random()*200+100,height:Math.random()*40+20,speed:Math.random()*0.2+0.05});
}

function generateBuilding(x) {
  const p = currentPlanet||planetDefs[0];
  const palette = p.buildingColors[Math.floor(Math.random()*p.buildingColors.length)];
  const color = palette[Math.floor(Math.random()*palette.length)];
  const accent = palette[Math.floor(Math.random()*palette.length)];

  function addUnit(bx, by, w, h, type, opts={}) {
    const building = {x:bx, w, blocks:[], destroyed:false, totalBlocks:1, brokenBlocks:0};
    const block = {x:bx, y:by, w, h, vx:0, vy:0,
      color: opts.color||color, accentColor: opts.accent||accent,
      fixed:true, mass:Math.max(3, w*h/300), building, row:0, col:0,
      health:opts.health||300, maxHealth:opts.health||300,
      cracked:false, onFire:false, burnTimer:0, exploding:false, explodeTimer:0,
      hasWindow:false, windowLit:false, isDoor:false,
      shape:'building', buildingType:type,
      windowSeed:Math.random()*1000, isTree:opts.isTree||false,
      ...opts};
    building.blocks.push(block); blocks.push(block); buildings.push(building);
    return block;
  }

  if(p.id==='earth'){
    const biome=getEarthBiome(x);
    if(biome.id==='jungle'){
      if(Math.random()<0.25){
        addUnit(x, GROUND_LEVEL-86, 50, 86, 'hut', {color:'#6a4a2a', roofColor:'#3a5a1a', accent:'#5a3a1a'});
      }else{
        const th=100+Math.random()*80;
        addUnit(x-15, GROUND_LEVEL-th, 55, th, 'tree', {isTree:true, health:150, treeColor:'#3a2a0a', canopyColor:'#0a5a0a'});
      }
    }else if(biome.id==='desert'){
      const r=Math.random();
      if(r<0.3) addUnit(x, GROUND_LEVEL-148, 120, 148, 'mosque', {color:'#e8dcc8', roofColor:'#d4c8a0'});
      else if(r<0.45) addUnit(x, GROUND_LEVEL-75, 64, 75, 'adobe', {color:'#c0a070', accent:'#a08050'});
      else if(r<0.55) addUnit(x, GROUND_LEVEL-62, 70, 62, 'market', {color:'#8a6a3a', roofColor:'#d4a040'});
      else if(r<0.65){const f=2+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-f*25-8, 90, f*25+8, 'sandApartment', {color:'#d8c8a0', accent:'#c8b890', floors:f});}
      else if(r<0.72) addUnit(x, GROUND_LEVEL-74, 80, 74, 'shop', {color:'#c0a870', accent:'#b8a060'});
      else if(r<0.8){const ch=50+Math.random()*60; addUnit(x, GROUND_LEVEL-ch, 30, ch, 'cactus', {isTree:true, health:100, color:'#2a7a2a'});}
      else{const th=80+Math.random()*60; addUnit(x, GROUND_LEVEL-th, 30, th, 'palmTree', {isTree:true, health:150, treeColor:'#7a5a2a', canopyColor:'#2a6a1a'});}
    }else if(biome.id==='landmarks'){
      const wx=((x%EARTH_WORLD_WIDTH)+EARTH_WORLD_WIDTH)%EARTH_WORLD_WIDTH;
      const _lmBiome=earthBiomes.find(b=>b.id==='landmarks');
      const lp=wx-(_lmBiome?_lmBiome.from:24000);
      if(lp>=200&&lp<260) addUnit(x, GROUND_LEVEL-205, 50, 205, 'statueOfLiberty', {health:800, color:'#5a8a6a'});
      else if(lp>=900&&lp<960) addUnit(x, GROUND_LEVEL-190, 70, 190, 'eiffelTower', {health:800, color:'#555', accent:'#666'});
      else if(lp>=1600&&lp<1660) addUnit(x, GROUND_LEVEL-195, 40, 195, 'bigBen', {health:800, color:'#c0a060'});
      else if(lp>=2300&&lp<2360) addUnit(x, GROUND_LEVEL-175, 55, 175, 'leaningTower', {health:800, color:'#e8e0d0'});
      else{const f=2+Math.floor(Math.random()*4); addUnit(x, GROUND_LEVEL-f*25, 90, f*25, 'apartment', {floors:f, windowCols:3});}
    }else if(biome.id==='beach'){
      // Beach: palm trees and maybe a small shack
      if(Math.random()<0.7){const th=80+Math.random()*40; addUnit(x, GROUND_LEVEL-th, 30, th, 'palmTree', {isTree:true, health:150, treeColor:'#8a6a3a', canopyColor:'#3a8a2a'});}
      else addUnit(x, GROUND_LEVEL-50, 60, 50, 'hut', {color:'#8a6a4a', roofColor:'#4a6a2a', accent:'#6a4a2a'});
    }else if(biome.id==='mountains'){
      // Mountains: sparse pines and boulders
      if(Math.random()<0.6){const th=60+Math.random()*50; addUnit(x, GROUND_LEVEL-th, 35, th, 'tree', {isTree:true, health:200, treeColor:'#2a1a0a', canopyColor:'#1a4a1a'});}
      // else nothing — rocky empty terrain
    }else if(biome.id==='snow'){
      // Snow biome: snow-capped pines and igloos
      const r=Math.random();
      if(r<0.55){const th=70+Math.random()*60; addUnit(x, GROUND_LEVEL-th, 35, th, 'tree', {isTree:true, health:200, treeColor:'#2a1a0a', canopyColor:'#1a3a2a', snowCap:true});}
      else if(r<0.7) addUnit(x, GROUND_LEVEL-60, 100, 60, 'igloo', {});
      else if(r<0.82){const f=2+Math.floor(Math.random()*2); addUnit(x, GROUND_LEVEL-f*22-44, 75, f*22+44, 'iceCastle', {floors:f});}
      // else empty snow
    }else if(biome.id==='farmland'){
      // Farmland: barns, silos, crops, farmhouses
      const r=Math.random();
      if(r<0.18) addUnit(x, GROUND_LEVEL-90, 140, 90, 'barn', {color:'#a0302a', roofColor:'#5a1a10', accent:'#d8d0b0'});
      else if(r<0.28) addUnit(x, GROUND_LEVEL-120, 50, 120, 'silo', {color:'#c0b8a0', roofColor:'#6a5a3a'});
      else if(r<0.45) addUnit(x, GROUND_LEVEL-80, 110, 80, 'farmhouse', {color:'#d8c8a0', roofColor:'#5a3a2a', accent:'#8a6a4a'});
      else if(r<0.7){const th=40+Math.random()*30; addUnit(x, GROUND_LEVEL-th, 30, th, 'haystack', {isHay:true, health:40, color:'#d4a440'});}
      else{const th=90+Math.random()*40; addUnit(x, GROUND_LEVEL-th, 35, th, 'tree', {isTree:true, health:180, treeColor:'#4a3a1a', canopyColor:'#3a7a1a'});}
    }else if(biome.id==='suburbs'){
      if(Math.random()<0.5) addUnit(x, GROUND_LEVEL-87, 130, 87, 'suburbanHouse', {roofColor:['#733','#557','#575','#753'][Math.floor(Math.random()*4)]});
      else addUnit(x, GROUND_LEVEL-86, 60, 86, 'cottage', {roofColor:'#855'});
    }else if(biome.isOcean){
      return; // no buildings in ocean
    }else{
      // City
      const r=Math.random();
      if(r<0.15) addUnit(x, GROUND_LEVEL-87, 90, 87, 'house', {roofColor:'#733'});
      else if(r<0.45){const f=3+Math.floor(Math.random()*5),c=2+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-f*25, c*30, f*25, 'apartment', {floors:f, windowCols:c});}
      else if(r<0.75){const f=6+Math.floor(Math.random()*5); addUnit(x, GROUND_LEVEL-f*25-25, 60, f*25+25, 'skyscraper', {floors:f});}
      else if(r<0.88){const f=4+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-f*25, 90, f*25, 'office', {floors:f, windowCols:3});}
      else addUnit(x, GROUND_LEVEL-155, 90, 155, 'church', {});
    }
  }else if(p.id==='mars'){
    const r=Math.random();
    if(r<0.4) addUnit(x, GROUND_LEVEL-72, 120, 72, 'dome', {});
    else if(r<0.7){const m=2+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-m*30, 60, m*30, 'habModule', {floors:m});}
    else addUnit(x, GROUND_LEVEL-65, 60, 65, 'solarArray', {});
  }else if(p.id==='glimora'){
    if(Math.random()<0.5){const h=3+Math.floor(Math.random()*4); addUnit(x, GROUND_LEVEL-h*28-28, 40, h*28+28, 'crystalTower', {floors:h, crystalHue:260+Math.random()*60});}
    else addUnit(x, GROUND_LEVEL-100, 60, 100, 'mushroom', {});
  }else if(p.id==='ice'){
    if(Math.random()<0.5) addUnit(x, GROUND_LEVEL-65, 110, 65, 'igloo', {});
    else{const f=3+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-f*22-44, 75, f*22+44, 'iceCastle', {floors:f});}
  }else if(p.id==='lava'){
    if(Math.random()<0.5){const l=3+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-l*22, l*30, l*22, 'obsidianPyramid', {layers:l});}
    else{const f=2+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-f*25-15, 84, f*25+15, 'lavaFortress', {floors:f});}
  }else if(p.id==='sand'){
    const r=Math.random();
    if(r<0.4){const l=4+Math.floor(Math.random()*4); addUnit(x, GROUND_LEVEL-l*20-18, l*35, l*20+18, 'grandPyramid', {layers:l});}
    else if(r<0.7){const c=3+Math.floor(Math.random()*2); addUnit(x, GROUND_LEVEL-95, c*28+10, 95, 'temple', {columnCount:c});}
    else{const h=4+Math.floor(Math.random()*3); addUnit(x, GROUND_LEVEL-h*22-15, 20, h*22+15, 'obelisk', {floors:h});}
  }else{
    // Asteroid and fallback
    addUnit(x, GROUND_LEVEL-40-Math.random()*40, 40+Math.random()*40, 40+Math.random()*40, 'alienStructure', {});
  }
}

// --- DRAW BUILDING UNIT ---
function drawBuildingUnit(b) {
  const sx=b.x, sy=b.y, w=b.w, h=b.h;
  const t=Date.now()*0.001;
  const _ws=(i)=>Math.sin(b.windowSeed*(i+1)*137.5)>0; // seeded window lit

  switch(b.buildingType) {
  case 'apartment': case 'office': case 'sandApartment': {
    const f=b.floors||3, cols=b.windowCols||2, flH=h/f;
    // Wall
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy,w,h);
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy,w,h);
    // Floors + windows
    for(let r=0;r<f;r++) for(let c=0;c<cols;c++){
      const wx=sx+6+c*(w-12)/cols, wy=sy+4+r*flH, ww=(w-12)/cols-4, wh=flH-8;
      ctx.fillStyle=_ws(r*cols+c)?`rgba(255,255,${150+dayNightBrightness*100},${0.3+dayNightBrightness*0.4})`:'rgba(50,50,80,0.6)';
      ctx.fillRect(wx,wy,ww,wh);
      ctx.strokeStyle='#333'; ctx.lineWidth=0.5; ctx.strokeRect(wx,wy,ww,wh);
      // Cross panes
      ctx.beginPath(); ctx.moveTo(wx+ww/2,wy); ctx.lineTo(wx+ww/2,wy+wh);
      ctx.moveTo(wx,wy+wh/2); ctx.lineTo(wx+ww,wy+wh/2); ctx.stroke();
    }
    // Door
    ctx.fillStyle='#432'; ctx.fillRect(sx+w/2-8,sy+h-flH+4,16,flH-4);
    break;
  }
  case 'skyscraper': {
    const f=b.floors||6;
    // Glass facade
    const sg=ctx.createLinearGradient(sx,sy,sx+w,sy); sg.addColorStop(0,b.color); sg.addColorStop(0.5,b.accentColor||'#667'); sg.addColorStop(1,b.color);
    ctx.fillStyle=sg; ctx.fillRect(sx,sy,w,h);
    // Windows grid
    const flH=h/(f+1);
    for(let r=0;r<f;r++) for(let c=0;c<2;c++){
      const wx=sx+5+c*(w-10)/2, wy=sy+flH*0.5+r*flH, ww=(w-10)/2-3, wh=flH-5;
      ctx.fillStyle=_ws(r*2+c)?'rgba(200,220,255,0.5)':'rgba(30,40,60,0.6)';
      ctx.fillRect(wx,wy,ww,wh);
    }
    // Antenna
    ctx.strokeStyle='#888'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2,sy-25); ctx.stroke();
    ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(sx+w/2,sy-25,2,0,Math.PI*2); ctx.fill();
    // Door
    ctx.fillStyle='rgba(150,200,255,0.4)'; ctx.fillRect(sx+w/2-10,sy+h-20,20,20);
    break;
  }
  case 'house': case 'suburbanHouse': {
    const wallH=h*0.6, roofH=h*0.4;
    // Wall
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+roofH,w*(b.buildingType==='suburbanHouse'?0.7:1),wallH);
    // Roof
    ctx.fillStyle=b.roofColor||'#733';
    ctx.beginPath(); ctx.moveTo(sx-5,sy+roofH); ctx.lineTo(sx+w*(b.buildingType==='suburbanHouse'?0.35:0.5),sy); ctx.lineTo(sx+w*(b.buildingType==='suburbanHouse'?0.7:1)+5,sy+roofH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.stroke();
    // Windows
    for(let i=0;i<3;i++){
      const wx=sx+8+i*22, wy=sy+roofH+8;
      ctx.fillStyle=_ws(i)?'rgba(255,255,200,0.5)':'rgba(50,50,80,0.5)';
      ctx.fillRect(wx,wy,14,12); ctx.strokeStyle='#333'; ctx.lineWidth=0.5; ctx.strokeRect(wx,wy,14,12);
      ctx.beginPath(); ctx.moveTo(wx+7,wy); ctx.lineTo(wx+7,wy+12); ctx.stroke();
    }
    // Door
    ctx.fillStyle='#432'; ctx.fillRect(sx+w*0.3,sy+roofH+wallH-22,14,22);
    // Garage (suburban)
    if(b.buildingType==='suburbanHouse'){
      ctx.fillStyle='#665'; ctx.fillRect(sx+w*0.72,sy+roofH+5,w*0.28,wallH-5);
      ctx.fillStyle='#776'; ctx.fillRect(sx+w*0.7,sy+roofH,w*0.3,8);
      ctx.fillStyle='#543'; ctx.fillRect(sx+w*0.75,sy+roofH+15,w*0.22,wallH-20);
    }
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+roofH,w*(b.buildingType==='suburbanHouse'?0.7:1),wallH);
    break;
  }
  case 'cottage': {
    const wallH=h*0.55, roofH=h*0.45;
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+roofH,w,wallH);
    ctx.fillStyle=b.roofColor||'#855';
    ctx.beginPath(); ctx.moveTo(sx-3,sy+roofH); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w+3,sy+roofH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.fillStyle=_ws(0)?'rgba(255,255,200,0.5)':'rgba(50,50,80,0.5)';
    ctx.fillRect(sx+w*0.6,sy+roofH+8,14,10); ctx.strokeStyle='#333'; ctx.lineWidth=0.5; ctx.strokeRect(sx+w*0.6,sy+roofH+8,14,10);
    ctx.fillStyle='#432'; ctx.fillRect(sx+8,sy+h-20,12,20);
    break;
  }
  case 'church': {
    const wallH=h*0.5, roofH=h*0.15, steepleH=h*0.35;
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+steepleH+roofH,w,wallH);
    // Steeple
    ctx.fillStyle=b.color;ctx.fillRect(sx+w*0.35,sy+steepleH,w*0.3,roofH);
    ctx.fillStyle=b.color; ctx.beginPath();
    ctx.moveTo(sx+w*0.35,sy+steepleH); ctx.lineTo(sx+w*0.5,sy); ctx.lineTo(sx+w*0.65,sy+steepleH); ctx.closePath(); ctx.fill();
    // Cross
    ctx.strokeStyle='#fc0'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(sx+w*0.5,sy+2); ctx.lineTo(sx+w*0.5,sy+steepleH*0.4);
    ctx.moveTo(sx+w*0.5-6,sy+steepleH*0.15); ctx.lineTo(sx+w*0.5+6,sy+steepleH*0.15); ctx.stroke();
    // Windows (stained glass)
    for(let i=0;i<3;i++){
      ctx.fillStyle=['rgba(200,50,50,0.5)','rgba(50,50,200,0.5)','rgba(200,200,50,0.5)'][i];
      ctx.beginPath(); ctx.arc(sx+15+i*25,sy+steepleH+roofH+wallH*0.35,6,Math.PI,0); ctx.fill();
      ctx.fillRect(sx+15+i*25-6,sy+steepleH+roofH+wallH*0.35,12,10);
    }
    ctx.fillStyle='#432'; ctx.fillRect(sx+w/2-8,sy+h-22,16,22);
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+steepleH+roofH,w,wallH);
    break;
  }
  case 'hut': {
    const stiltH=h*0.3, wallH=h*0.4, roofH=h*0.3;
    // Stilts
    ctx.fillStyle=b.accent||'#5a3a1a'; ctx.fillRect(sx+5,sy+roofH+wallH,6,stiltH); ctx.fillRect(sx+w-11,sy+roofH+wallH,6,stiltH);
    // Wall
    ctx.fillStyle=b.color; ctx.fillRect(sx+2,sy+roofH,w-4,wallH);
    // Thatch roof
    ctx.fillStyle=b.roofColor||'#3a5a1a';
    ctx.beginPath(); ctx.moveTo(sx-5,sy+roofH); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w+5,sy+roofH); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.moveTo(sx+5,sy+roofH-2); ctx.lineTo(sx+w/2,sy+roofH*0.3); ctx.lineTo(sx+w-5,sy+roofH-2); ctx.closePath(); ctx.fill();
    // Window + door
    ctx.fillStyle='rgba(50,50,80,0.5)'; ctx.fillRect(sx+w*0.6,sy+roofH+6,10,8);
    ctx.fillStyle='#432'; ctx.fillRect(sx+10,sy+roofH+wallH-16,10,16);
    break;
  }
  case 'tree': case 'palmTree': {
    const trunkW=12, trunkH=h*0.55;
    const trkC=b.treeColor||'#5a3a1a', canC=b.canopyColor||'#2a6a1a';
    // Trunk
    const tg=ctx.createLinearGradient(sx+w/2-trunkW/2,sy+h-trunkH,sx+w/2+trunkW/2,sy+h);
    tg.addColorStop(0,trkC); tg.addColorStop(0.5,'#7a5a3a'); tg.addColorStop(1,trkC);
    ctx.fillStyle=tg; ctx.fillRect(sx+w/2-trunkW/2,sy+h-trunkH,trunkW,trunkH);
    // Bark lines
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1;
    for(let i=0;i<3;i++){const ly=sy+h-trunkH+trunkH*0.2+i*trunkH*0.3;
      ctx.beginPath(); ctx.moveTo(sx+w/2-trunkW/2+2,ly); ctx.quadraticCurveTo(sx+w/2,ly+(Math.random()-0.5)*4,sx+w/2+trunkW/2-2,ly); ctx.stroke();}
    // Canopy
    if(b.buildingType==='palmTree'){
      // Palm fronds
      ctx.fillStyle=canC;
      for(let i=0;i<5;i++){const a=-1.2+i*0.6;
        ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.3);
        ctx.quadraticCurveTo(sx+w/2+Math.cos(a)*w*0.8,sy+h*0.2+Math.sin(a)*h*0.15,sx+w/2+Math.cos(a)*w,sy+h*0.35+Math.sin(t+i)*3);
        ctx.lineWidth=4; ctx.strokeStyle=canC; ctx.stroke();}
      ctx.beginPath(); ctx.arc(sx+w/2,sy+h*0.3,8,0,Math.PI*2); ctx.fillStyle=canC; ctx.fill();
    }else{
      // Round canopy blobs
      ctx.fillStyle=canC;
      ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.28,w/2+Math.sin(t+sx)*2,h*0.22+Math.cos(t*0.7+sx)*1.5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(100,200,50,0.2)';
      ctx.beginPath(); ctx.ellipse(sx+w*0.35,sy+h*0.2,w*0.25,h*0.12,0,0,Math.PI*2); ctx.fill();
      // Leaf dots
      for(let i=0;i<5;i++){ctx.fillStyle=`rgba(${30+Math.random()*40},${80+Math.random()*80},${10+Math.random()*30},0.3)`;
        ctx.beginPath(); ctx.arc(sx+w*0.2+Math.random()*w*0.6,sy+h*0.15+Math.random()*h*0.25,Math.random()*4+2,0,Math.PI*2); ctx.fill();}
    }
    break;
  }
  case 'cactus': {
    const trunk=w*0.35;
    ctx.fillStyle=b.color||'#2a7a2a';
    // Main trunk
    ctx.fillRect(sx+w/2-trunk/2,sy,trunk,h);
    ctx.fillStyle='rgba(50,150,50,0.3)'; ctx.fillRect(sx+w/2-trunk/2+2,sy,2,h);
    // Arms
    if(h>40){
      ctx.fillStyle=b.color||'#2a7a2a';
      ctx.fillRect(sx,sy+h*0.35,w/2-trunk/2,trunk*0.6);
      ctx.fillRect(sx,sy+h*0.35-trunk*0.8,trunk*0.6,trunk*0.8);
      if(w>20){
        ctx.fillRect(sx+w/2+trunk/2,sy+h*0.55,w/2-trunk/2,trunk*0.6);
        ctx.fillRect(sx+w-trunk*0.6,sy+h*0.55-trunk*0.6,trunk*0.6,trunk*0.6);
      }
    }
    ctx.strokeStyle='rgba(0,80,0,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(sx+w/2-trunk/2,sy,trunk,h);
    break;
  }
  case 'mosque': {
    const wallH=h*0.5, domeH=h*0.3;
    // Main wall
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+h-wallH,w*0.7,wallH);
    // Windows
    for(let r=0;r<3;r++) for(let c=0;c<3;c++){
      if(r===0&&c===1){ctx.fillStyle='#432'; ctx.fillRect(sx+c*w*0.23+5,sy+h-22,16,22); continue;}
      ctx.fillStyle=_ws(r*3+c)?'rgba(255,255,200,0.4)':'rgba(50,50,80,0.5)';
      ctx.fillRect(sx+c*w*0.23+5,sy+h-wallH+r*wallH/3+4,14,wallH/3-8);
    }
    // Dome
    ctx.fillStyle=b.roofColor||'#d4c8a0';
    ctx.beginPath(); ctx.ellipse(sx+w*0.35,sy+h-wallH,w*0.25,domeH*0.8,0,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+w*0.35,sy+h-wallH-domeH*0.5,w*0.15,domeH*0.4,0,Math.PI,0); ctx.fill();
    // Crescent
    ctx.fillStyle='#ffd700'; ctx.beginPath(); ctx.arc(sx+w*0.35,sy+h-wallH-domeH*0.8,4,0,Math.PI*2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation='destination-out'; ctx.beginPath(); ctx.arc(sx+w*0.35+2,sy+h-wallH-domeH*0.8,3,0,Math.PI*2); ctx.fill(); ctx.restore();
    // Minaret
    ctx.fillStyle=b.color;
    ctx.fillRect(sx+w*0.8,sy+h*0.15,w*0.12,h*0.85);
    ctx.fillStyle=b.roofColor||'#d4c8a0';
    ctx.beginPath(); ctx.ellipse(sx+w*0.86,sy+h*0.15,w*0.08,h*0.06,0,Math.PI,0); ctx.fill();
    ctx.fillStyle='#ffd700'; ctx.beginPath(); ctx.arc(sx+w*0.86,sy+h*0.1,3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+h-wallH,w*0.7,wallH);
    break;
  }
  case 'adobe': {
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+8,w,h-8);
    ctx.fillStyle=b.accent||'#a08050'; ctx.fillRect(sx-2,sy,w+4,10);
    ctx.fillStyle=_ws(0)?'rgba(255,255,200,0.4)':'rgba(50,50,80,0.5)'; ctx.fillRect(sx+w*0.6,sy+16,14,10);
    ctx.fillStyle='#432'; ctx.fillRect(sx+8,sy+h-20,12,20);
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+8,w,h-8);
    break;
  }
  case 'market': {
    ctx.fillStyle=b.color; ctx.fillRect(sx+5,sy+h*0.6,w-10,h*0.4);
    ctx.fillStyle='#432'; ctx.fillRect(sx+w/2-8,sy+h-18,16,18);
    ctx.fillStyle=b.roofColor||'#d4a040';
    ctx.beginPath(); ctx.moveTo(sx,sy+h*0.6); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h*0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.stroke();
    break;
  }
  case 'shop': {
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+h*0.35,w,h*0.65);
    ctx.fillStyle=b.accent; ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.35,w*0.4,h*0.35,0,Math.PI,0); ctx.fill();
    ctx.fillStyle=_ws(0)?'rgba(255,255,200,0.4)':'rgba(50,50,80,0.5)'; ctx.fillRect(sx+8,sy+h*0.45,w-16,h*0.2);
    ctx.fillStyle='#432'; ctx.fillRect(sx+w/2-8,sy+h-18,16,18);
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+h*0.35,w,h*0.65);
    break;
  }
  case 'statueOfLiberty': {
    // Pedestal
    ctx.fillStyle='#889';
    for(let i=0;i<3;i++){const pw=50-i*5; ctx.fillRect(sx+(50-pw)/2,sy+h-25*(i+1),pw,24);}
    // Body
    const sg=ctx.createLinearGradient(sx+15,sy+h*0.25,sx+35,sy+h*0.25);
    sg.addColorStop(0,'#4a7a5a'); sg.addColorStop(0.5,'#6a9a7a'); sg.addColorStop(1,'#4a7a5a');
    ctx.fillStyle=sg; ctx.fillRect(sx+15,sy+h*0.2,20,h*0.35);
    // Head
    ctx.fillStyle='#5a8a6a'; ctx.beginPath(); ctx.ellipse(sx+25,sy+h*0.18,9,11,0,0,Math.PI*2); ctx.fill();
    // Crown
    ctx.fillStyle='#5a8a6a';
    for(let i=0;i<7;i++){const cx=sx+18+i*2; ctx.fillRect(cx,sy+h*0.05,2,h*0.08);}
    // Torch arm
    ctx.fillStyle='#5a8a6a'; ctx.fillRect(sx+32,sy+h*0.05,6,h*0.2);
    // Flame
    ctx.fillStyle=`rgba(255,${150+Math.sin(t*5)*50},0,${0.7+Math.sin(t*10)*0.2})`;
    ctx.beginPath(); ctx.ellipse(sx+35,sy+h*0.03,5,8+Math.sin(t*5)*2,0,0,Math.PI*2); ctx.fill();
    break;
  }
  case 'eiffelTower': {
    // Legs
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.moveTo(sx,sy+h); ctx.lineTo(sx+15,sy+h*0.6); ctx.lineTo(sx+20,sy+h*0.6); ctx.lineTo(sx+20,sy+h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx+w,sy+h); ctx.lineTo(sx+w-15,sy+h*0.6); ctx.lineTo(sx+w-20,sy+h*0.6); ctx.lineTo(sx+w-20,sy+h); ctx.fill();
    // First platform
    ctx.fillStyle=b.accent||'#666'; ctx.fillRect(sx+10,sy+h*0.58,w-20,h*0.04);
    // Mid section
    ctx.fillStyle=b.color; ctx.fillRect(sx+20,sy+h*0.3,w-40,h*0.28);
    // Second platform
    ctx.fillStyle=b.accent||'#666'; ctx.fillRect(sx+18,sy+h*0.28,w-36,h*0.04);
    // Top section
    ctx.fillStyle=b.color; ctx.fillRect(sx+w/2-5,sy+h*0.05,10,h*0.23);
    // Antenna
    ctx.strokeStyle='#888'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.05); ctx.lineTo(sx+w/2,sy); ctx.stroke();
    break;
  }
  case 'bigBen': {
    const floors=6, flH=h*0.7/floors;
    // Tower body
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+h*0.25,w,h*0.75);
    // Windows per floor
    for(let r=0;r<floors;r++){
      ctx.fillStyle=_ws(r)?'rgba(255,255,200,0.4)':'rgba(50,50,80,0.5)';
      ctx.fillRect(sx+8,sy+h*0.25+r*flH+3,w-16,flH-6);
    }
    // Clock face
    ctx.fillStyle='#eee'; ctx.beginPath(); ctx.arc(sx+w/2,sy+h*0.2,w*0.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#333'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(sx+w/2,sy+h*0.2,w*0.35,0,Math.PI*2); ctx.stroke();
    const hr=t*0.1;
    ctx.strokeStyle='#333'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.2); ctx.lineTo(sx+w/2+Math.cos(hr)*w*0.2,sy+h*0.2+Math.sin(hr)*w*0.2); ctx.stroke();
    ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.2); ctx.lineTo(sx+w/2+Math.cos(hr*12)*w*0.28,sy+h*0.2+Math.sin(hr*12)*w*0.28); ctx.stroke();
    // Roof
    ctx.fillStyle='#555';
    ctx.beginPath(); ctx.moveTo(sx+2,sy+h*0.12); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w-2,sy+h*0.12); ctx.closePath(); ctx.fill();
    break;
  }
  case 'leaningTower': {
    const lean=h*0.12, floors=7, flH=h/floors;
    ctx.save(); ctx.translate(sx,sy);
    // Draw with lean (skew)
    for(let r=0;r<floors;r++){
      const lx=r*lean/floors;
      ctx.fillStyle=b.color; ctx.fillRect(lx,r*flH,w*0.7,flH-1);
      // Arched windows
      ctx.fillStyle='rgba(100,80,60,0.3)';
      for(let i=0;i<3;i++){ctx.beginPath(); ctx.arc(lx+8+i*12,r*flH+flH*0.6,4,Math.PI,0); ctx.fill();}
      // Side columns
      ctx.fillStyle='#d8d0c0'; ctx.fillRect(lx-3,r*flH,4,flH); ctx.fillRect(lx+w*0.7-1,r*flH,4,flH);
    }
    // Top dome
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.ellipse(lean+w*0.35,0,w*0.25,flH*0.5,0,Math.PI,0); ctx.fill();
    ctx.restore();
    break;
  }
  case 'dome': {
    // Mars dome
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy+h*0.6,w,h*0.4);
    // Windows
    for(let c=0;c<4;c++){ctx.fillStyle=_ws(c)?'rgba(200,220,255,0.4)':'rgba(50,50,80,0.5)'; ctx.fillRect(sx+5+c*(w/4-2),sy+h*0.65,w/4-8,h*0.25);}
    // Dome
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.6,w*0.4,h*0.45,0,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.35,w*0.25,h*0.25,0,Math.PI,0); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+h*0.6,w,h*0.4);
    break;
  }
  case 'habModule': {
    const f=b.floors||2, mH=h/f;
    for(let r=0;r<f;r++){
      ctx.fillStyle=b.color; ctx.fillRect(sx,sy+r*mH,w,mH-4);
      ctx.fillStyle=_ws(r)?'rgba(200,220,255,0.4)':'rgba(50,50,80,0.5)';
      ctx.fillRect(sx+8,sy+r*mH+4,w-16,mH-12);
      ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy+r*mH,w,mH-4);
      // Connector pipe
      if(r<f-1){ctx.fillStyle='#888'; ctx.fillRect(sx+w*0.3,sy+(r+1)*mH-4,w*0.4,8);}
    }
    if(f>0){ctx.fillStyle='#432'; ctx.fillRect(sx+w/2-8,sy+h-18,16,18);}
    break;
  }
  case 'solarArray': {
    // Base
    ctx.fillStyle=b.color; ctx.fillRect(sx+w*0.2,sy+h*0.7,w*0.6,h*0.3);
    // Pole
    ctx.fillStyle='#888'; ctx.fillRect(sx+w/2-3,sy+h*0.25,6,h*0.45);
    // Panel
    ctx.fillStyle='#2266aa'; ctx.fillRect(sx,sy,w,h*0.2);
    ctx.strokeStyle='#48c'; ctx.lineWidth=0.5;
    for(let i=1;i<4;i++){ctx.beginPath(); ctx.moveTo(sx+i*w/4,sy); ctx.lineTo(sx+i*w/4,sy+h*0.2); ctx.stroke();}
    break;
  }
  case 'crystalTower': {
    const f=b.floors||3, hue=b.crystalHue||280;
    for(let r=0;r<f;r++){
      const cw=Math.max(15,w-r*4), cx=sx+(w-cw)/2;
      ctx.fillStyle=`hsla(${hue},70%,60%,0.8)`; ctx.fillRect(cx,sy+h-28*(r+1),cw,27);
      ctx.fillStyle=`hsla(${hue},80%,80%,0.3)`; ctx.fillRect(cx+2,sy+h-28*(r+1)+2,cw*0.3,23);
      ctx.strokeStyle=`hsla(${hue},60%,40%,0.5)`; ctx.lineWidth=1; ctx.strokeRect(cx,sy+h-28*(r+1),cw,27);
    }
    // Tip
    ctx.fillStyle=`hsla(${hue},80%,70%,0.9)`;
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2-8,sy+28); ctx.lineTo(sx+w/2+8,sy+28); ctx.closePath(); ctx.fill();
    break;
  }
  case 'mushroom': {
    // Stem
    ctx.fillStyle=b.color; ctx.fillRect(sx+w*0.3,sy+h*0.4,w*0.4,h*0.6);
    // Cap
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.4,w/2+5,h*0.3,0,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.2,w*0.35,h*0.15,0,Math.PI,0); ctx.fill();
    // Window
    ctx.fillStyle='rgba(200,100,255,0.4)'; ctx.beginPath(); ctx.arc(sx+w/2,sy+h*0.32,w*0.12,0,Math.PI*2); ctx.fill();
    // Spots
    ctx.fillStyle='rgba(255,200,255,0.3)';
    ctx.beginPath(); ctx.arc(sx+w*0.3,sy+h*0.25,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+w*0.7,sy+h*0.3,3,0,Math.PI*2); ctx.fill();
    break;
  }
  case 'barn': {
    // Red barn with white trim and hayloft
    const roofH=h*0.4, wallH=h*0.6;
    // Walls
    ctx.fillStyle=b.color||'#a0302a'; ctx.fillRect(sx,sy+roofH,w,wallH);
    // Roof (gambrel style)
    ctx.fillStyle=b.roofColor||'#5a1a10';
    ctx.beginPath();
    ctx.moveTo(sx-6,sy+roofH);
    ctx.lineTo(sx+w*0.2,sy+roofH*0.35);
    ctx.lineTo(sx+w*0.5,sy);
    ctx.lineTo(sx+w*0.8,sy+roofH*0.35);
    ctx.lineTo(sx+w+6,sy+roofH);
    ctx.closePath();
    ctx.fill();
    // White trim X on big door
    const doorW=w*0.3, doorH=wallH*0.6;
    const dx=sx+w*0.35, dy=sy+roofH+wallH-doorH;
    ctx.fillStyle='#5a2a1a'; ctx.fillRect(dx,dy,doorW,doorH);
    ctx.strokeStyle=b.accent||'#d8d0b0'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(dx,dy); ctx.lineTo(dx+doorW,dy+doorH); ctx.moveTo(dx+doorW,dy); ctx.lineTo(dx,dy+doorH); ctx.stroke();
    ctx.strokeRect(dx,dy,doorW,doorH);
    // Hayloft window (top)
    ctx.fillStyle='#2a1a10'; ctx.fillRect(sx+w*0.45,sy+roofH*0.5,w*0.1,roofH*0.25);
    // Side windows
    ctx.fillStyle='rgba(200,200,120,0.6)';
    ctx.fillRect(sx+w*0.1,sy+roofH+10,w*0.1,wallH*0.3);
    ctx.fillRect(sx+w*0.8,sy+roofH+10,w*0.1,wallH*0.3);
    // Wall planks
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1;
    for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(sx+i*w/6,sy+roofH);ctx.lineTo(sx+i*w/6,sy+h);ctx.stroke();}
    break;
  }
  case 'silo': {
    // Grain silo: tall cylinder with dome top
    ctx.fillStyle=b.color||'#c0b8a0';
    ctx.fillRect(sx,sy+h*0.15,w,h*0.85);
    // Dome top
    ctx.fillStyle=b.roofColor||'#6a5a3a';
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.15,w/2,h*0.15,0,Math.PI,0); ctx.fill();
    // Vertical highlight
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.fillRect(sx+w*0.2,sy+h*0.15,w*0.12,h*0.85);
    // Ring bands
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(sx,sy+h*0.15+i*h*0.2);ctx.lineTo(sx+w,sy+h*0.15+i*h*0.2);ctx.stroke();}
    // Ladder
    ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(sx+w*0.85,sy+h*0.15); ctx.lineTo(sx+w*0.85,sy+h); ctx.moveTo(sx+w*0.95,sy+h*0.15); ctx.lineTo(sx+w*0.95,sy+h); ctx.stroke();
    for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(sx+w*0.85,sy+h*0.25+i*h*0.08);ctx.lineTo(sx+w*0.95,sy+h*0.25+i*h*0.08);ctx.stroke();}
    break;
  }
  case 'farmhouse': {
    // Farmhouse: wood cabin with porch
    const roofH=h*0.3, wallH=h*0.7;
    ctx.fillStyle=b.color||'#d8c8a0'; ctx.fillRect(sx,sy+roofH,w,wallH);
    // Roof
    ctx.fillStyle=b.roofColor||'#5a3a2a';
    ctx.beginPath(); ctx.moveTo(sx-4,sy+roofH); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w+4,sy+roofH); ctx.closePath(); ctx.fill();
    // Door
    ctx.fillStyle='#6a3a1a'; ctx.fillRect(sx+w*0.4,sy+roofH+wallH*0.4,w*0.2,wallH*0.6);
    // Windows with shutters
    ctx.fillStyle='rgba(180,200,220,0.7)';
    ctx.fillRect(sx+w*0.1,sy+roofH+10,w*0.15,wallH*0.3);
    ctx.fillRect(sx+w*0.75,sy+roofH+10,w*0.15,wallH*0.3);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(sx+w*0.1,sy+roofH+10,w*0.15,wallH*0.3);
    ctx.strokeRect(sx+w*0.75,sy+roofH+10,w*0.15,wallH*0.3);
    // Chimney
    ctx.fillStyle=b.accent||'#8a6a4a'; ctx.fillRect(sx+w*0.7,sy+roofH*0.3,w*0.1,roofH);
    // Wood planks
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=0.7;
    for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(sx,sy+roofH+i*wallH/5);ctx.lineTo(sx+w,sy+roofH+i*wallH/5);ctx.stroke();}
    break;
  }
  case 'haystack': {
    // Round haystack (like a rolled bale)
    ctx.fillStyle=b.color||'#d4a440';
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.5,w/2,h*0.5,0,0,Math.PI*2); ctx.fill();
    // Stripes (hay curl lines)
    ctx.strokeStyle='rgba(80,60,20,0.4)'; ctx.lineWidth=1;
    for(let i=0;i<5;i++){
      ctx.beginPath();
      ctx.ellipse(sx+w/2,sy+h*0.5,w/2-i*3,h*0.5-i*2,0,0,Math.PI*2);
      ctx.stroke();
    }
    // Highlight
    ctx.fillStyle='rgba(255,230,140,0.3)';
    ctx.beginPath(); ctx.ellipse(sx+w*0.35,sy+h*0.35,w*0.2,h*0.2,0,0,Math.PI*2); ctx.fill();
    break;
  }
  case 'igloo': {
    // Snow dome
    ctx.fillStyle='#cdf';
    ctx.beginPath(); ctx.ellipse(sx+w*0.4,sy+h,w*0.4,h*0.9,0,Math.PI,0); ctx.fill();
    ctx.fillStyle='#def';
    ctx.beginPath(); ctx.ellipse(sx+w*0.4,sy+h,w*0.3,h*0.7,0,Math.PI,0); ctx.fill();
    // Door tunnel
    ctx.fillStyle='#bce'; ctx.fillRect(sx+w*0.7,sy+h*0.55,w*0.3,h*0.45);
    ctx.fillStyle='#234'; ctx.beginPath(); ctx.arc(sx+w*0.85,sy+h*0.7,h*0.15,0,Math.PI*2); ctx.fill();
    // Snow texture
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.ellipse(sx+w*0.3,sy+h*0.3,w*0.15,h*0.15,0,0,Math.PI*2); ctx.fill();
    break;
  }
  case 'iceCastle': {
    const f=b.floors||3, flH=(h-44)/f;
    // Main body
    ctx.fillStyle=b.color; ctx.fillRect(sx+10,sy+44,w-20,h-44);
    // Windows
    for(let r=0;r<f;r++) for(let c=0;c<3;c++){
      ctx.fillStyle=_ws(r*3+c)?'rgba(150,200,255,0.4)':'rgba(30,50,80,0.5)';
      ctx.fillRect(sx+14+c*18,sy+48+r*flH,12,flH-6);
    }
    // Side towers
    ctx.fillStyle='rgba(200,230,255,0.8)';
    ctx.fillRect(sx,sy+22,14,h-22); ctx.fillRect(sx+w-14,sy+22,14,h-22);
    // Crenellations
    for(let i=0;i<3;i++){ctx.fillRect(sx+i*6,sy+16,4,8); ctx.fillRect(sx+w-14+i*6,sy+16,4,8);}
    ctx.strokeStyle='rgba(150,200,255,0.4)'; ctx.lineWidth=1; ctx.strokeRect(sx+10,sy+44,w-20,h-44);
    break;
  }
  case 'obsidianPyramid': {
    const l=b.layers||3;
    for(let r=0;r<l;r++){
      const rw=(l-r)/l*w, rx=sx+r*w/(l*2);
      ctx.fillStyle='#3a1a0a'; ctx.fillRect(rx,sy+h-22*(r+1),rw,21);
      ctx.fillStyle='rgba(80,0,0,0.2)'; ctx.fillRect(rx,sy+h-22*(r+1),rw,21);
      if(r<2&&Math.sin(b.windowSeed*(r+1))>0){ctx.fillStyle='rgba(255,80,0,0.4)'; ctx.fillRect(rx+rw/2-5,sy+h-22*(r+1)+4,10,13);}
      ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1; ctx.strokeRect(rx,sy+h-22*(r+1),rw,21);
    }
    break;
  }
  case 'lavaFortress': {
    const f=b.floors||2, flH=(h-15)/f;
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy,w,h-8);
    for(let r=0;r<f;r++) for(let c=0;c<3;c++){
      ctx.fillStyle=_ws(r*3+c)?'rgba(255,100,0,0.4)':'rgba(30,20,10,0.6)';
      ctx.fillRect(sx+4+c*26,sy+4+r*flH,20,flH-8);
    }
    // Battlements
    for(let i=0;i<5;i++) ctx.fillRect(sx+i*(w/5),sy-10,w/5-3,10);
    // Lava moat
    ctx.fillStyle=`rgba(255,${60+Math.random()*40},0,${0.5+Math.random()*0.3})`;
    ctx.fillRect(sx-10,sy+h-8,w+20,8);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy,w,h-8);
    break;
  }
  case 'grandPyramid': {
    const l=b.layers||4;
    // Draw as triangle
    ctx.fillStyle='#c0a050';
    ctx.beginPath(); ctx.moveTo(sx,sy+h); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h); ctx.closePath(); ctx.fill();
    // Layer lines
    ctx.strokeStyle='rgba(200,160,60,0.2)'; ctx.lineWidth=0.5;
    for(let r=1;r<l;r++){const ry=sy+r*h/l; const rw=w*(1-r/l); ctx.beginPath(); ctx.moveTo(sx+w/2-rw/2,ry); ctx.lineTo(sx+w/2+rw/2,ry); ctx.stroke();}
    // Capstone glow
    ctx.fillStyle='#ffd700';
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2-8,sy+18); ctx.lineTo(sx+w/2+8,sy+18); ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(255,255,200,${0.3+Math.sin(t*3)*0.2})`; ctx.beginPath(); ctx.arc(sx+w/2,sy+8,6,0,Math.PI*2); ctx.fill();
    // Eye/entrance
    ctx.fillStyle='rgba(255,200,50,0.5)'; ctx.beginPath();
    ctx.moveTo(sx+w/2,sy+h*0.8); ctx.lineTo(sx+w/2-6,sy+h*0.9); ctx.lineTo(sx+w/2+6,sy+h*0.9); ctx.closePath(); ctx.fill();
    break;
  }
  case 'temple': {
    const c=b.columnCount||3;
    // Roof
    ctx.fillStyle='#a08040'; ctx.fillRect(sx-3,sy,w+6,15);
    ctx.strokeStyle='rgba(200,160,60,0.3)'; ctx.lineWidth=1; ctx.strokeRect(sx-3,sy,w+6,15);
    // Hieroglyphs on roof
    ctx.fillStyle='rgba(255,200,50,0.2)';
    for(let hx=sx+5;hx<sx+w-5;hx+=8) ctx.fillRect(hx,sy+4,4,7);
    // Columns
    for(let i=0;i<c;i++){
      ctx.fillStyle='#c0a060'; ctx.fillRect(sx+i*(w/c)+2,sy+15,8,h-25);
      ctx.fillStyle='rgba(200,170,100,0.3)'; ctx.fillRect(sx+i*(w/c)+3,sy+15,6,3); ctx.fillRect(sx+i*(w/c)+3,sy+h-13,6,3);
    }
    // Base
    ctx.fillStyle=b.color||color; ctx.fillRect(sx-3,sy+h-10,w+6,10);
    break;
  }
  case 'obelisk': {
    const f=b.floors||4;
    // Shaft
    ctx.fillStyle='#b09050'; ctx.fillRect(sx,sy+15,w,h-15);
    ctx.fillStyle='rgba(255,200,50,0.15)'; ctx.fillRect(sx+2,sy+17,w-4,h-19);
    ctx.strokeStyle='rgba(100,80,30,0.4)'; ctx.lineWidth=0.5; ctx.strokeRect(sx,sy+15,w,h-15);
    // Hieroglyph lines
    for(let r=0;r<f;r++){ctx.strokeStyle='rgba(200,160,60,0.2)'; ctx.beginPath(); ctx.moveTo(sx+3,sy+20+r*22); ctx.lineTo(sx+w-3,sy+20+r*22); ctx.stroke();}
    // Gold tip
    ctx.fillStyle='#ffd700';
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx,sy+15); ctx.lineTo(sx+w,sy+15); ctx.closePath(); ctx.fill();
    break;
  }
  case 'alienStructure': {
    // Organic alien blob
    ctx.fillStyle=b.color;
    ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h/2,w/2,h/2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(100,50,100,0.3)'; ctx.beginPath(); ctx.ellipse(sx+w*0.3,sy+h*0.4,w*0.2,h*0.15,0,0,Math.PI*2); ctx.fill();
    // Pulsing spots
    ctx.fillStyle=`rgba(150,50,150,${0.3+Math.sin(t+b.windowSeed)*0.2})`;
    ctx.beginPath(); ctx.arc(sx+w*0.4,sy+h*0.3,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx+w*0.7,sy+h*0.6,3,0,Math.PI*2); ctx.fill();
    break;
  }
  case 'militaryBase': {
    // Bunker body
    ctx.fillStyle=b.color||'#4a5a4a'; ctx.fillRect(sx,sy+h*0.45,w*0.65,h*0.55);
    // Windows
    ctx.fillStyle='rgba(50,60,50,0.6)'; ctx.fillRect(sx+10,sy+h*0.5,15,10); ctx.fillRect(sx+35,sy+h*0.5,15,10);
    // Door
    ctx.fillStyle='#3a3a3a'; ctx.fillRect(sx+22,sy+h*0.7,14,h*0.3);
    // Watchtower
    ctx.fillStyle='#3a4a3a'; ctx.fillRect(sx+w*0.7,sy,w*0.15,h);
    ctx.fillStyle='#3a4a3a'; ctx.fillRect(sx+w*0.65,sy-5,w*0.25,8);
    // Fence
    ctx.fillStyle='#555'; ctx.fillRect(sx-20,sy+h*0.8,20,h*0.2); ctx.fillRect(sx+w,sy+h*0.8,20,h*0.2);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(sx,sy+h*0.45,w*0.65,h*0.55); ctx.strokeRect(sx+w*0.7,sy,w*0.15,h);
    break;
  }
  default: {
    ctx.fillStyle=b.color; ctx.fillRect(sx,sy,w,h);
    if(_ws(0)){ctx.fillStyle='rgba(255,255,200,0.4)'; ctx.fillRect(sx+6,sy+4,w-12,h-8);}
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1; ctx.strokeRect(sx,sy,w,h);
    break;
  }}

  // --- BURN OVERLAY ---
  if(b.onFire) {
    b.burnTimer = (b.burnTimer||0) + 1;
    const burnH = Math.min(h, b.burnTimer * 0.5);
    // Darkening
    ctx.fillStyle = `rgba(30,10,0,${Math.min(0.4, b.burnTimer/500)})`;
    ctx.fillRect(sx, sy, w, h);
    // Flames
    for(let i = 0; i < Math.min(8, 2 + b.burnTimer/30); i++) {
      const fx = sx + Math.random() * w;
      const fy = sy + h - Math.random() * burnH;
      const fs = 4 + Math.random() * 6 + b.burnTimer * 0.02;
      ctx.fillStyle = `rgba(255,${80+Math.random()*80},0,${0.3+Math.random()*0.3})`;
      ctx.beginPath(); ctx.arc(fx, fy, fs, 0, Math.PI*2); ctx.fill();
    }
    // Gradual health drain from fire
    if(b.burnTimer % 10 === 0) { b.health -= 2; if(b.health <= 0) checkBuildingDestroyed(b); }
  }

  // --- CRACKED OVERLAY ---
  if(b.cracked && !b.exploding) {
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(sx+w*0.3,sy); ctx.lineTo(sx+w*0.5,sy+h*0.5); ctx.lineTo(sx+w*0.7,sy+h); ctx.stroke();
    if(b.health < b.maxHealth * 0.5) {
      ctx.beginPath(); ctx.moveTo(sx+w*0.7,sy+h*0.2); ctx.lineTo(sx+w*0.4,sy+h*0.6); ctx.stroke();
    }
  }
}

// --- GENERATE INHABITANT (human or alien) ---
function generateInhabitant(x) {
  const p = currentPlanet||planetDefs[0];
  const gy = GROUND_LEVEL;
  let template, skinColor, isAlienCreature = p.isAlien;

  if (isAlienCreature && p.alienTypes) {
    const at = p.alienTypes[Math.floor(Math.random()*p.alienTypes.length)];
    template = { ...at, hat:null, extra:p.alienExtra||null };
    skinColor = p.alienSkin[Math.floor(Math.random()*p.alienSkin.length)];
  } else {
    // Earth: biome-specific humans
    if(p.id==='earth'){
      const biome=getEarthBiome(x);
      if(biome.id==='jungle'){
        template=jungleHumanTypes[Math.floor(Math.random()*jungleHumanTypes.length)];
        skinColor=`hsl(${Math.random()*15+15},${Math.random()*15+50}%,${Math.random()*10+40}%)`;
      }else if(biome.id==='desert'){
        template=desertHumanTypes[Math.floor(Math.random()*desertHumanTypes.length)];
        skinColor=`hsl(${Math.random()*20+20},${Math.random()*15+40}%,${Math.random()*15+50}%)`;
      }else if(biome.id==='suburbs'||biome.id==='suburbs2'){
        template=suburbHumanTypes[Math.floor(Math.random()*suburbHumanTypes.length)];
        skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+55}%)`;
      }else if(biome.id==='landmarks'){
        template=landmarkHumanTypes[Math.floor(Math.random()*landmarkHumanTypes.length)];
        skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+60}%)`;
      }else if(biome.id==='mountains'||biome.id==='snow'){
        template=mountainHumanTypes[Math.floor(Math.random()*mountainHumanTypes.length)];
        skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+55}%)`;
      }else if(biome.id==='farmland'){
        template=suburbHumanTypes[Math.floor(Math.random()*suburbHumanTypes.length)];
        skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+55}%)`;
      }else{
        template=earthHumanTypes[Math.floor(Math.random()*earthHumanTypes.length)];
        skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+55}%)`;
      }
    }else{
      template=earthHumanTypes[Math.floor(Math.random()*earthHumanTypes.length)];
      skinColor=`hsl(${Math.random()*30+15},${Math.random()*20+40}%,${Math.random()*20+55}%)`;
    }
  }

  const s = template.scale;
  const h = {
    headX:x, headY:gy-40*s, headVX:0, headVY:0, headR:template.headR,
    bodyX:x, bodyY:gy-28*s, bodyVX:0, bodyVY:0,
    legLX:x-4*s, legLY:gy-8*s, legLVX:0, legLVY:0,
    legRX:x+4*s, legRY:gy-8*s, legRVX:0, legRVY:0,
    armLX:x-8*s, armLY:gy-28*s, armLVX:0, armLVY:0,
    armRX:x+8*s, armRY:gy-28*s, armRVX:0, armRVY:0,
    footLX:x-5*s, footLY:gy, footLVX:0, footLVY:0,
    footRX:x+5*s, footRY:gy, footRVX:0, footRVY:0,
    type:template.type, label:template.label||p.alienLabel||'Creature', scale:s,
    bodyWidth:template.bodyWidth, hat:template.hat||null, extra:template.extra||null,
    isAlien:isAlienCreature,
    alienHeadShape:p.alienHeadShape||'normal',
    alienExtra:p.alienExtra||null,
    planetId:p.id,
    grounded:true,grabbed:false,beingBeamed:false,collected:false,
    alive:true,crying:false,panicLevel:0,
    walkDir:Math.random()>0.5?1:-1,
    walkSpeed:(Math.random()*0.5+0.3)*(template.type==='jogger'?2:template.type==='old'?0.4:template.type==='child'||template.type==='imp'?1.3:template.type==='fat'||template.type==='yeti'||template.type==='brute'?0.5:1)*(getDifficultyLevel()>=3?1.3:1),
    walkTimer:0, idleTimer:Math.random()*200,
    color:template.colors[Math.floor(Math.random()*template.colors.length)],
    skinColor:skinColor,
    mass:template.mass, ragdoll:false, cryTimer:0,
    // Behavior system
    behavior:'idle', behaviorTimer:Math.random()*300, homeX:x,
    biomeId:(p.id==='earth'?getEarthBiome(x).id:'default'),
    behaviorState:0 // sub-state for complex behaviors
  };
  // Assign initial behavior based on type/biome
  if(template.type==='farmer') h.behavior='farming';
  else if(template.type==='jogger') h.behavior='jogging';
  else if(template.type==='indigenous') h.behavior='patrol';
  else if(h.biomeId==='city') h.behavior=Math.random()<0.5?'commute':'idle';
  else h.behavior='idle';
  humans.push(h);
}

// --- WACKY COW GENERATION ---
function generateCow(x) {
  const p = currentPlanet||planetDefs[0];
  const gy = GROUND_LEVEL;
  // Each planet gets different wacky cow variants
  const cowTypes = {
    'earth': [{label:'Bessie',color:'#f5f5f5',spots:'#333',size:1,wack:'normal'},
              {label:'MegaCow',color:'#f0e0c0',spots:'#8a4a2a',size:1.5,wack:'fat'},
              {label:'Tiny Moo',color:'#ffc0cb',spots:'#a0606a',size:0.5,wack:'tiny'},
              {label:'Two-Head Cow',color:'#ddd',spots:'#555',size:1.1,wack:'twohead'},
              {label:'Chimp',color:'#6a4a2a',spots:'#4a3218',size:0.7,wack:'monkey'},
              {label:'Gorilla',color:'#2a2a2a',spots:'#1a1a1a',size:1.4,wack:'monkey'},
              {label:'Orangutan',color:'#c06820',spots:'#8a4a10',size:1.1,wack:'monkey'}],
    'mars': [{label:'Mars Moo',color:'#d88060',spots:'#8a3a1a',size:1,wack:'spacesuit'},
             {label:'Crater Cow',color:'#c06040',spots:'#602010',size:1.3,wack:'fat'},
             {label:'Dust Calf',color:'#e0a080',spots:'#b06030',size:0.5,wack:'tiny'}],
    'glimora': [{label:'Crystal Cow',color:'#e0c0ff',spots:'#a060ff',size:1,wack:'crystal'},
                {label:'Glow Moo',color:'#ff80ff',spots:'#c040ff',size:0.8,wack:'glow'},
                {label:'Mega Glimcow',color:'#d0b0ff',spots:'#8040c0',size:1.4,wack:'twohead'}],
    'ice': [{label:'Frost Cow',color:'#d0e8ff',spots:'#80b0e0',size:1,wack:'frozen'},
            {label:'Yak Moo',color:'#e0e8f0',spots:'#8090a0',size:1.5,wack:'fat'},
            {label:'Ice Calf',color:'#f0f8ff',spots:'#a0d0ff',size:0.5,wack:'tiny'}],
    'lava': [{label:'Lava Cow',color:'#ff6030',spots:'#aa2000',size:1,wack:'fire'},
             {label:'Magma Moo',color:'#ff4010',spots:'#880000',size:1.4,wack:'fat'},
             {label:'Ember Calf',color:'#ffaa60',spots:'#ff6020',size:0.5,wack:'tiny'},
             {label:'Demon Cow',color:'#440000',spots:'#ff0000',size:1.2,wack:'twohead'}],
    'sand': [{label:'Anubis Hound',color:'#1a1a1a',spots:'#ffd700',size:1.2,wack:'anubis'},
             {label:'Jackal Pup',color:'#2a2a1a',spots:'#c0a040',size:0.5,wack:'anubis'},
             {label:'Sacred Jackal',color:'#0a0a0a',spots:'#ffd700',size:1.4,wack:'anubis'}],
    'asteroid': [{label:'Rock Grub',color:'#4a3a4a',spots:'#8a5a7a',size:0.7,wack:'fat'},
                 {label:'Pustule Beast',color:'#5a4a3a',spots:'#aa8a4a',size:1.5,wack:'twohead'},
                 {label:'Vein Worm',color:'#3a2a3a',spots:'#6a4a5a',size:0.4,wack:'tiny'}]
  };
  const types = cowTypes[p.id] || cowTypes['earth'];
  const ct = types[Math.floor(Math.random()*types.length)];
  const s = ct.size;
  cows.push({
    x: x, y: gy, bodyY: gy - 15*s,
    vx: 0, vy: 0,
    size: s, color: ct.color, spots: ct.spots,
    label: ct.label, wack: ct.wack,
    walkDir: Math.random()>0.5?1:-1,
    walkSpeed: 0.2 + Math.random()*0.3,
    walkTimer: Math.random()*200,
    mooTimer: Math.random()*300,
    legAnim: 0, tailAnim: 0,
    beingBeamed: false, collected: false,
    planetId: p.id,
    hoverPhase: Math.random()*Math.PI*2, // for hovercow
    extraHeadAngle: 0 // for twohead
  });
}

function generateCows() {
  cows = [];
  const p = currentPlanet||planetDefs[0];
  if(p.id==='earth'){
    const _farm=earthBiomes.find(b=>b.id==='farmland');
    const _jungle=earthBiomes.find(b=>b.id==='jungle');
    const _snow=earthBiomes.find(b=>b.id==='snow');
    // Farmland: cows + sheep
    const cowCount=Math.floor(8+Math.random()*6);
    for(let i=0;i<cowCount;i++){
      const farmX=(_farm?_farm.from+100:6100)+Math.random()*((_farm?_farm.to-_farm.from-200:3300));
      generateCow(farmX);
    }
    // Sheep on farmland (white wool, small)
    const sheepCount=Math.floor(6+Math.random()*5);
    for(let i=0;i<sheepCount;i++){
      const sx=(_farm?_farm.from+100:6100)+Math.random()*((_farm?_farm.to-_farm.from-200:3300));
      const s=0.8;
      cows.push({x:sx,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:'#f0ede5',spots:'#d8d2c2',label:'Sheep',wack:'sheep',
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.25+Math.random()*0.35,
        walkTimer:Math.random()*200,mooTimer:Math.random()*400,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0});
    }
    // Jungle animals: monkeys + parrots + tigers
    const jungleTypes=[
      {label:'Chimp',color:'#6a4a2a',spots:'#4a3218',size:0.7,wack:'monkey'},
      {label:'Gorilla',color:'#2a2a2a',spots:'#1a1a1a',size:1.4,wack:'monkey'},
      {label:'Orangutan',color:'#c06820',spots:'#8a4a10',size:1.1,wack:'monkey'},
      {label:'Tiger',color:'#e08020',spots:'#1a1a1a',size:1.0,wack:'tiger'},
      {label:'Parrot',color:'#e02020',spots:'#20a020',size:0.5,wack:'parrot'},
    ];
    for(let i=0;i<8+Math.floor(Math.random()*5);i++){
      const ct=jungleTypes[Math.floor(Math.random()*jungleTypes.length)];
      const s=ct.size,x=(_jungle?_jungle.from+100:10100)+Math.random()*((_jungle?_jungle.to-_jungle.from-200:3300));
      cows.push({x,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:ct.color,spots:ct.spots,label:ct.label,wack:ct.wack,
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.3+Math.random()*0.6,
        walkTimer:Math.random()*200,mooTimer:Math.random()*300,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0});
    }
    // Snow biome: a few wolves/yetis wandering
    const snowTypes=[
      {label:'Wolf',color:'#9a9aa8',spots:'#5a5a68',size:0.9,wack:'monkey'},
      {label:'Yeti',color:'#f0f4fa',spots:'#c0c8d8',size:1.5,wack:'monkey'},
    ];
    for(let i=0;i<4+Math.floor(Math.random()*3);i++){
      const ct=snowTypes[Math.floor(Math.random()*snowTypes.length)];
      const s=ct.size,x=(_snow?_snow.from+100:16100)+Math.random()*((_snow?_snow.to-_snow.from-200:3300));
      cows.push({x,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:ct.color,spots:ct.spots,label:ct.label,wack:ct.wack,
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.3+Math.random()*0.5,
        walkTimer:Math.random()*200,mooTimer:Math.random()*300,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0});
    }
  }else{
    const count=Math.floor(5+Math.random()*6);
    for(let i=0;i<count;i++) generateCow(Math.random()*(worldWidth-600)+300);
  }
}

// --- UNDERWATER OBJECTS ---
let oceanBounds = {from:27900, to:34000};
function generateUnderwaterObjects() {
  underwaterObjects = [];
  if(!currentPlanet || currentPlanet.id !== 'earth') return;
  const _ob = earthBiomes.find(b=>b.id==='ocean');
  const oceanFrom = _ob?_ob.from+80:27900, oceanTo = _ob?_ob.to-80:34000;
  oceanBounds = {from:oceanFrom, to:oceanTo};
  const oceanW = oceanTo - oceanFrom;

  // Seaweed patches (near surface) — more dense
  for(let i = 0; i < 60; i++) {
    underwaterObjects.push({
      type: 'seaweed', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y, height: 40 + Math.random() * 100,
      color: ['#0a5a2a','#0a6a3a','#085a1a','#0a4a2a','#2a7a3a'][Math.floor(Math.random()*5)],
      phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1
    });
  }

  // Kelp forest (tall, in clumps) NEW
  for(let k = 0; k < 5; k++) {
    const kelpCenter = oceanFrom + 300 + Math.random() * (oceanW - 600);
    for(let i = 0; i < 8 + Math.floor(Math.random()*6); i++) {
      underwaterObjects.push({
        type: 'kelp', x: kelpCenter + (Math.random()-0.5)*120,
        y: SEABED_Y, height: 180 + Math.random() * 180,
        color: ['#2a5a1a','#1a4a10','#3a6a20'][Math.floor(Math.random()*3)],
        phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.5
      });
    }
  }

  // Coral reef clusters (shallow water) — more variety
  for(let i = 0; i < 40; i++) {
    underwaterObjects.push({
      type: 'coral', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - Math.random() * 30,
      width: 20 + Math.random() * 50, height: 15 + Math.random() * 40,
      color: ['#ff4060','#ff8040','#ffa020','#ff60a0','#a040ff','#40c0ff','#ffe080','#80ffa0'][Math.floor(Math.random()*8)],
      shape: Math.floor(Math.random() * 3)
    });
  }

  // Starfish on seabed NEW
  for(let i = 0; i < 20; i++) {
    underwaterObjects.push({
      type: 'starfish', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 2 - Math.random() * 6,
      size: 6 + Math.random() * 6,
      color: ['#ff8040','#ffc040','#ff4080','#a060ff','#40ffc0'][Math.floor(Math.random()*5)],
      rot: Math.random() * Math.PI * 2
    });
  }

  // Crabs walking on seabed NEW
  for(let i = 0; i < 10; i++) {
    underwaterObjects.push({
      type: 'crab', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 6,
      color: ['#c02020','#e04010','#a06020','#d08030'][Math.floor(Math.random()*4)],
      dir: Math.random()>0.5?1:-1, speed: 0.3+Math.random()*0.4,
      phase: Math.random()*Math.PI*2
    });
  }

  // Sea turtles NEW
  for(let i = 0; i < 4; i++) {
    underwaterObjects.push({
      type: 'turtle', x: oceanFrom + Math.random() * oceanW,
      y: GROUND_LEVEL + 150 + Math.random() * (WATER_DEPTH - 400),
      dir: Math.random()>0.5?1:-1, speed: 0.25+Math.random()*0.3,
      phase: Math.random()*Math.PI*2
    });
  }

  // Seabed rocks (decorative) NEW
  for(let i = 0; i < 30; i++) {
    underwaterObjects.push({
      type: 'seaRock', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 2,
      w: 10 + Math.random() * 25, h: 6 + Math.random() * 14,
      color: ['#4a4038','#5a4a3a','#3a3028','#6a5a48'][Math.floor(Math.random()*4)]
    });
  }

  // Shells scattered NEW
  for(let i = 0; i < 25; i++) {
    underwaterObjects.push({
      type: 'shell', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 1,
      size: 3 + Math.random() * 4,
      color: ['#f0e8d0','#e8d0b0','#d0b890','#f8e8c8'][Math.floor(Math.random()*4)],
      rot: Math.random() * Math.PI * 2
    });
  }

  // Fish schools — more of them
  for(let i = 0; i < 22; i++) {
    const depth = GROUND_LEVEL + 50 + Math.random() * (WATER_DEPTH - 100);
    const fishColor = ['#ff8800','#ffcc00','#00ccff','#ff4488','#44ff88','#8888ff','#ff40a0','#a0ff40'][Math.floor(Math.random()*8)];
    underwaterObjects.push({
      type: 'fishSchool', x: oceanFrom + Math.random() * oceanW,
      y: depth, fishCount: 5 + Math.floor(Math.random() * 10),
      color: fishColor, dir: Math.random() > 0.5 ? 1 : -1,
      speed: 0.3 + Math.random() * 0.7, phase: Math.random() * Math.PI * 2,
      spread: 30 + Math.random() * 50
    });
  }

  // Jellyfish — more glowing
  for(let i = 0; i < 18; i++) {
    underwaterObjects.push({
      type: 'jellyfish', x: oceanFrom + Math.random() * oceanW,
      y: GROUND_LEVEL + 100 + Math.random() * (WATER_DEPTH - 200),
      size: 8 + Math.random() * 18,
      color: ['rgba(200,100,255,','rgba(100,200,255,','rgba(255,150,200,','rgba(100,255,200,','rgba(255,200,120,'][Math.floor(Math.random()*5)],
      phase: Math.random() * Math.PI * 2, driftX: (Math.random() - 0.5) * 0.3
    });
  }

  // Sunken pirate ships (multiple)
  for(let i = 0; i < 2; i++) {
    underwaterObjects.push({
      type: 'shipwreck', x: oceanFrom + 500 + Math.random() * (oceanW - 1000),
      y: SEABED_Y, width: 160, height: 80
    });
  }

  // Treasure chests
  for(let i = 0; i < 5; i++) {
    underwaterObjects.push({
      type: 'treasure', x: oceanFrom + 200 + Math.random() * (oceanW - 400),
      y: SEABED_Y - 10, phase: Math.random() * Math.PI * 2
    });
  }

  // Giant whales (multiple)
  for(let i = 0; i < 2; i++) {
    underwaterObjects.push({
      type: 'whale', x: oceanFrom + 500 + Math.random() * (oceanW - 1000),
      y: GROUND_LEVEL + WATER_DEPTH * (0.35 + Math.random()*0.15),
      dir: Math.random()>0.5?1:-1, speed: 0.15, phase: Math.random() * Math.PI * 2
    });
  }

  // Sharks NEW (mid-deep, menacing)
  for(let i = 0; i < 3; i++) {
    underwaterObjects.push({
      type: 'shark', x: oceanFrom + 400 + Math.random() * (oceanW - 800),
      y: GROUND_LEVEL + WATER_DEPTH * (0.25 + Math.random()*0.4),
      dir: Math.random()>0.5?1:-1, speed: 0.4+Math.random()*0.3,
      phase: Math.random()*Math.PI*2
    });
  }

  // Anglerfish (very deep, scary with glowing lure)
  for(let i = 0; i < 4; i++) {
    underwaterObjects.push({
      type: 'anglerfish', x: oceanFrom + 400 + Math.random() * (oceanW - 800),
      y: GROUND_LEVEL + WATER_DEPTH * 0.7 + Math.random() * WATER_DEPTH * 0.2,
      dir: Math.random() > 0.5 ? 1 : -1, speed: 0.2 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2
    });
  }

  // Ancient ruins (columns on seabed)
  const ruinX = oceanFrom + 1200 + Math.random() * (oceanW - 2400);
  for(let i = 0; i < 5; i++) {
    const colH = 30 + Math.random() * 50;
    underwaterObjects.push({
      type: 'ruin', x: ruinX + i * 40 + (Math.random() - 0.5) * 20,
      y: SEABED_Y - colH, width: 12 + Math.random() * 8, height: colH,
      broken: Math.random() > 0.5
    });
  }

  // Bubbles (ambient, rise from seabed)
  for(let i = 0; i < 10; i++) {
    underwaterObjects.push({
      type: 'bubbleSource', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 10, timer: Math.random() * 200, interval: 60 + Math.random() * 120
    });
  }

  // Caves disabled for now
  underwaterCaves = [];
  caveCreatures = [];
  return;
  // eslint-disable-next-line
  const tunnelH = 120; // standard tunnel height
  const caveY = SEABED_Y + 30; // just below seabed

  // Cave 1: "The Crystal Depths" — under landmarks/desert
  const L1 = GROUND_LEVEL + 150, L2 = GROUND_LEVEL + 350, L3 = GROUND_LEVEL + 550;
  underwaterCaves.push({
    name: 'The Crystal Depths', discovered: false, glowColor: '#4080ff', accentColor: '#60f0ff',
    featureType: 'crystals',
    segments: [
      {x:20600, y:SEABED_Y-50, w:100, h:80},                    // ocean entrance
      {x:20400, y:caveY, w:250, h:tunnelH},
      {x:20200, y:L1, w:120, h:caveY - L1 + tunnelH, shaft:true},
      {x:19500, y:L1, w:500, h:tunnelH+20, dry:true},           // under landmarks
      {x:18800, y:L1+10, w:400, h:tunnelH+40, dry:true, chamber:true},
      {x:18200, y:L1, w:350, h:tunnelH, dry:true},
      {x:18400, y:L1, w:100, h:L2 - L1 + tunnelH, shaft:true, dry:true},
      {x:17500, y:L2, w:450, h:tunnelH+20, dry:true},           // under desert
      {x:16800, y:L2+10, w:600, h:tunnelH+50, dry:true, chamber:true},
      {x:16200, y:L2, w:400, h:tunnelH, dry:true},
      {x:16400, y:L2, w:100, h:L3 - L2 + tunnelH, shaft:true, dry:true},
      {x:15800, y:L3, w:700, h:tunnelH+60, dry:true, chamber:true},
    ]
  });

  // Cave 2: "The Bone Tunnels" — under city
  underwaterCaves.push({
    name: 'The Bone Tunnels', discovered: false, glowColor: '#ff4040', accentColor: '#ffaa60',
    featureType: 'bones',
    segments: [
      {x:23500, y:SEABED_Y-50, w:100, h:80},                    // ocean entrance
      {x:23550, y:caveY, w:300, h:tunnelH},
      {x:300, y:L1, w:120, h:caveY - L1 + tunnelH, shaft:true}, // wraps to city
      {x:400, y:L1, w:450, h:tunnelH, dry:true},
      {x:800, y:L1+10, w:500, h:tunnelH+30, dry:true, chamber:true},
      {x:1300, y:L1, w:400, h:tunnelH, dry:true},
      {x:1000, y:L1, w:100, h:L2 - L1 + tunnelH, shaft:true, dry:true},
      {x:1600, y:L2, w:500, h:tunnelH+20, dry:true},
      {x:2100, y:L2+10, w:600, h:tunnelH+40, dry:true, chamber:true},
      {x:2700, y:L2, w:450, h:tunnelH, dry:true},
      {x:3100, y:L2+10, w:400, h:tunnelH+50, dry:true, chamber:true},
      {x:2900, y:L1, w:100, h:L2 - L1 + tunnelH, shaft:true, dry:true},
      {x:3000, y:L1, w:350, h:tunnelH, dry:true},
      {x:1900, y:L2, w:100, h:L3 - L2 + tunnelH, shaft:true, dry:true},
      {x:1400, y:L3, w:600, h:tunnelH+60, dry:true, chamber:true},
    ]
  });

  // Cave 3: "The Sunken Kingdom" — under jungle
  underwaterCaves.push({
    name: 'The Sunken Kingdom', discovered: false, glowColor: '#ffd700', accentColor: '#80ff40',
    featureType: 'ruins',
    segments: [
      {x:21500, y:SEABED_Y-50, w:100, h:80},                    // ocean entrance
      {x:21200, y:caveY+20, w:350, h:tunnelH},
      {x:19800, y:L1, w:140, h:caveY - L1 + tunnelH, shaft:true},
      {x:19200, y:L1, w:500, h:tunnelH, dry:true},
      {x:18500, y:L1+10, w:450, h:tunnelH+30, dry:true},
      {x:18700, y:L1, w:120, h:L2 - L1 + tunnelH, shaft:true, dry:true},
      {x:17800, y:L2, w:500, h:tunnelH+20, dry:true},
      {x:17100, y:L2+10, w:600, h:tunnelH+40, dry:true, chamber:true},
      {x:16400, y:L2, w:550, h:tunnelH, dry:true},
      {x:15600, y:L2+10, w:500, h:tunnelH+20, dry:true},
      {x:15800, y:L2, w:120, h:L3 - L2 + tunnelH, shaft:true, dry:true},
      {x:8500, y:L3, w:500, h:tunnelH+30, dry:true},            // under jungle
      {x:7800, y:L3+10, w:700, h:tunnelH+70, dry:true, chamber:true},
      {x:7000, y:L3, w:500, h:tunnelH+40, dry:true},
      {x:7300, y:L2, w:120, h:L3 - L2 + tunnelH+40, shaft:true, dry:true},
      {x:6800, y:L2, w:400, h:tunnelH+20, dry:true},
      {x:6600, y:L1, w:120, h:L2 - L1 + tunnelH+20, shaft:true, dry:true},
      {x:6200, y:L1, w:500, h:tunnelH+30, dry:true, chamber:true},
    ]
  });

  // Cave 4: "Mountain Hollows" — large caves inside the mountain, explore on foot
  const bigH = 200; // tall chambers to walk around in
  const medH = 160;
  underwaterCaves.push({
    name: 'Mountain Hollows', discovered: false, glowColor: '#ff8040', accentColor: '#ffa060',
    featureType: 'crystals',
    segments: [
      // === WEST ENTRANCE — large opening in mountainside ===
      {x:10200, y:GROUND_LEVEL-80, w:180, h:120, dry:true, mountainEntrance:true},
      // Entrance hall — tall enough to fly ship in, wide enough to walk around
      {x:10150, y:GROUND_LEVEL-60, w:200, h:GROUND_LEVEL-L1+bigH+60, shaft:true, dry:true},
      // Level 1: Grand Hall
      {x:9800, y:L1, w:800, h:bigH, dry:true, chamber:true},    // The Grand Hall — huge room
      {x:9400, y:L1+10, w:500, h:medH, dry:true},               // west tunnel
      {x:8800, y:L1, w:700, h:bigH+30, dry:true, chamber:true}, // Mushroom Cavern — massive
      // Connecting tunnel east
      {x:10550, y:L1+20, w:500, h:medH, dry:true},
      {x:10950, y:L1+10, w:600, h:bigH, dry:true, chamber:true}, // Crystal Gallery
      // === EAST ENTRANCE ===
      {x:11500, y:GROUND_LEVEL-60, w:160, h:100, dry:true, mountainEntrance:true},
      {x:11500, y:GROUND_LEVEL-40, w:160, h:GROUND_LEVEL-L1+medH+40, shaft:true, dry:true},
      // Shaft down to Level 2 from Grand Hall
      {x:10100, y:L1, w:150, h:L2 - L1 + bigH, shaft:true, dry:true},
      // Level 2: Deep Hollows — even bigger chambers
      {x:9600, y:L2, w:900, h:bigH+40, dry:true, chamber:true},  // The Abyss — enormous
      {x:9100, y:L2+20, w:600, h:bigH, dry:true},                // winding passage
      {x:8400, y:L2+10, w:800, h:bigH+60, dry:true, chamber:true}, // Underground Lake
      // Shaft down to Level 3 — deepest
      {x:9900, y:L2, w:150, h:L3 - L2 + bigH, shaft:true, dry:true},
      // Level 3: The Heart of the Mountain
      {x:9400, y:L3, w:1000, h:bigH+80, dry:true, chamber:true}, // colossal final chamber
      {x:10350, y:L3+20, w:600, h:bigH+40, dry:true, chamber:true}, // treasure room
    ]
  });

  // Generate weird cave creatures in dry segments
  caveCreatures = [];
  const creatureTypes = [
    {label:'Cave Slug',type:'slug',color:'#8a6a9a',accent:'#c0a0d0',size:0.8,speed:0.15},
    {label:'Blind Crawler',type:'crawler',color:'#a08060',accent:'#d0b090',size:1.0,speed:0.3},
    {label:'Glow Worm',type:'glowworm',color:'#40ff80',accent:'#80ffa0',size:0.5,speed:0.1},
    {label:'Crystal Beetle',type:'beetle',color:'#4080c0',accent:'#60c0ff',size:0.7,speed:0.4},
    {label:'Pale Spider',type:'spider',color:'#d0c8c0',accent:'#f0e8e0',size:0.9,speed:0.5},
    {label:'Mushroom Crab',type:'mushcrab',color:'#c06040',accent:'#ff9060',size:0.6,speed:0.25},
    {label:'Cave Newt',type:'newt',color:'#ff6080',accent:'#ffa0b0',size:0.7,speed:0.35},
    {label:'Eyeless Eel',type:'eel',color:'#606080',accent:'#9090b0',size:1.2,speed:0.2},
  ];
  underwaterCaves.forEach(cave => {
    cave.segments.forEach(seg => {
      if(!seg.dry || seg.w < 200) return;
      const count = Math.floor(seg.w / 250) + 1;
      for(let i = 0; i < count; i++) {
        const ct = creatureTypes[Math.floor(Math.random() * creatureTypes.length)];
        const cx = seg.x + 40 + Math.random() * (seg.w - 80);
        const cy = seg.y + seg.h - 15 * ct.size;
        caveCreatures.push({
          x: cx, y: cy, seg: seg, cave: cave,
          vx: (Math.random() > 0.5 ? 1 : -1) * ct.speed,
          type: ct.type, label: ct.label,
          color: ct.color, accent: ct.accent,
          size: ct.size, speed: ct.speed,
          animPhase: Math.random() * Math.PI * 2,
          collected: false, beingBeamed: false,
          speechTimer: Math.random() * 400
        });
      }
    });
  });
}

// Check if ship is inside any cave segment
function isInsideCave(sx, sy) {
  for(const cave of underwaterCaves) {
    for(const seg of cave.segments) {
      if(sx > seg.x - 30 && sx < seg.x + seg.w + 30 && sy > seg.y - 30 && sy < seg.y + seg.h + 30) {
        return { cave, seg };
      }
    }
  }
  return null;
}

// --- LOAD / LEAVE PLANET ---
function loadPlanet(planet) {
  currentPlanet = planet;
  lastVisitedPlanet = planet;
  gameMode = 'planet';
  // Restore saved state or generate fresh
  respawnTimer=0;
  if (planet.savedState) {
    blocks=planet.savedState.blocks; buildings=planet.savedState.buildings;
    humans=planet.savedState.humans; fires=planet.savedState.fires;
    cows=planet.savedState.cows||[];
    underwaterObjects=planet.savedState.underwaterObjects||[];
    underwaterCaves=planet.savedState.underwaterCaves||[];
    caveCreatures=planet.savedState.caveCreatures||[];
    initialPopulation=planet.savedState.initialPop||30;
  } else {
    blocks=[]; buildings=[]; humans=[]; fires=[]; cows=[];
    // Earth gets a bigger world
    if(planet.id==='earth') worldWidth=EARTH_WORLD_WIDTH; else worldWidth=6000;
    const diff=planetProgress[planet.id]?planetProgress[planet.id].missionIndex:0;
    const density=(planet.buildingDensity||1)*(1+diff*0.15);
    let bx=200;
    while(bx<worldWidth-200){
      // Earth: vary spacing by biome
      if(planet.id==='earth'){
        const biome=getEarthBiome(bx);
        if(biome.isOcean||isOverOcean(bx)){bx+=200;continue;} // skip ocean — no buildings in water
        const biomeSpacing=biome.id==='city'?0.5:biome.id==='jungle'?0.7:biome.id==='desert'?1.5:biome.id==='landmarks'?1.2:biome.id==='mountains'?2.5:biome.id==='snow'?2.2:biome.id==='farmland'?1.3:biome.id==='beach'?2.0:biome.isOcean?99:0.9;
        generateBuilding(bx);bx+=(Math.random()*200+150)*biomeSpacing/density;
      }else{
        generateBuilding(bx);bx+=(Math.random()*200+150)/density;
      }
    }
    let popCount=Math.floor((planet.inhabitantCount||30)*(1+diff*0.2));
    if(planet.id==='earth'){
      // Biome-appropriate population for larger Earth (coords derived from biome list)
      const _range=id=>{const b=earthBiomes.find(x=>x.id===id);return b?[b.from+100,b.to-100]:[0,0];};
      const [c0,c1]=_range('city'); for(let i=0;i<18;i++) generateInhabitant(c0+Math.random()*(c1-c0));
      const [s0,s1]=_range('suburbs'); for(let i=0;i<8;i++) generateInhabitant(s0+Math.random()*(s1-s0));
      const [f0,f1]=_range('farmland'); for(let i=0;i<10;i++) generateInhabitant(f0+Math.random()*(f1-f0));
      const [j0,j1]=_range('jungle'); for(let i=0;i<6;i++) generateInhabitant(j0+Math.random()*(j1-j0));
      const [m0,m1]=_range('mountains'); for(let i=0;i<3;i++) generateInhabitant(m0+Math.random()*(m1-m0));
      const [sn0,sn1]=_range('snow'); for(let i=0;i<4;i++) generateInhabitant(sn0+Math.random()*(sn1-sn0));
      const [d0,d1]=_range('desert'); for(let i=0;i<5;i++) generateInhabitant(d0+Math.random()*(d1-d0));
      const [l0,l1]=_range('landmarks'); for(let i=0;i<5;i++) generateInhabitant(l0+Math.random()*(l1-l0));
      popCount=59;
    }else{
      for(let i=0;i<popCount;i++) generateInhabitant(Math.random()*(worldWidth-400)+200);
    }
    initialPopulation=popCount;
    generateCows();
    generateUnderwaterObjects();
    // Generate military bases on Earth (3 bases at fixed positions)
    earthMilitaryBases=[];
    if(planet.id==='earth'){
      // Military bases in city, farmland-edge, mountains, landmarks
      const _cityB=earthBiomes.find(b=>b.id==='city');
      const _lmB=earthBiomes.find(b=>b.id==='landmarks');
      const _mtB=earthBiomes.find(b=>b.id==='mountains');
      const basePositions=[
        _cityB?(_cityB.from+_cityB.to)/2:1800,
        _mtB?(_mtB.from+_mtB.to)/2:15000,
        _lmB?(_lmB.from+_lmB.to)/2:25500,
      ];
      basePositions.forEach(bx=>{
        earthMilitaryBases.push(bx);
        // Single-unit military base
        const building={x:bx,w:155,blocks:[],destroyed:false,totalBlocks:1,brokenBlocks:0};
        const block={x:bx-30,y:GROUND_LEVEL-115,w:155,h:115,vx:0,vy:0,color:'#4a5a4a',
          fixed:true,mass:10,building,row:0,col:0,
          health:800,maxHealth:800,cracked:false,onFire:false,burnTimer:0,exploding:false,explodeTimer:0,
          hasWindow:false,windowLit:false,isDoor:false,
          shape:'building',buildingType:'militaryBase',windowSeed:Math.random()*1000,isTree:false};
        building.blocks.push(block);blocks.push(block);buildings.push(building);
        // Pre-spawn soldiers
        const hpMult=(1+getDifficultyLevel()*0.15);
        for(let i=0;i<3;i++){
          military.push({type:'soldier',x:bx+20+Math.random()*80,y:GROUND_LEVEL-20,vx:0,facing:1,
            shootTimer:0,health:Math.ceil(3*hpMult),alive:true,color:'#363',gunColor:'#555',
            baseX:bx,passive:true});
        }
      });
    }
    // Hide ~30% of inhabitants inside buildings
    if(buildings.length>0){
      const hideCount=Math.floor(popCount*0.3);
      let hidden=0;
      humans.forEach(h=>{
        if(hidden>=hideCount)return;
        const nearBuilding=buildings.find(bld=>!bld.destroyed&&Math.abs(h.bodyX-(bld.x+bld.w/2))<100);
        if(nearBuilding&&Math.random()<0.5){
          h.hidden=true;h.hideBuilding=nearBuilding;
          h.bodyX=nearBuilding.x+nearBuilding.w/2;h.headX=h.bodyX;
          hidden++;
        }
      });
    }
  }
  particles=[]; debris=[]; tears=[]; speechBubbles=[]; missiles=[];
  vehicles=[]; weather=[]; hazards=[]; turrets=[];
  planetTerror=0;
  generateStars(); generateClouds(); generateWeather(); generateVehicles(); generateHazards();
  ship.x=worldWidth/2; ship.y=LEAVE_THRESHOLD+50; ship.vx=0; ship.vy=2;
  document.getElementById('planet-name').textContent=tr('planet.'+planet.id+'.name');
  showMessage(tr('planet.'+planet.id+'.desc'));
  // Auto-assign first mission of a planet; subsequent missions from Commander
  const prog=planetProgress[planet.id];
  if(currentMission&&currentMission.type==='boss'&&currentMission.planetId===planet.id){
    // Boss mission — spawn boss after landing
    setTimeout(()=>spawnBoss(planet.id),1000);
  }else if(prog&&prog.missionIndex===0&&!currentMission){
    setTimeout(()=>generateMission(),2000);
  }else if(prog&&prog.missionIndex>0&&prog.missionIndex<5&&!currentMission){
    setTimeout(()=>showMessage(tr('msg.reportToMothership')),3000);
  }
}

// --- WEATHER ---
function generateWeather(){
  const p=currentPlanet;if(!p)return;
  weather=[];
  // Weather particles are spawned dynamically in update
}

// --- VEHICLES ---
function generateVehicles(){
  const p=currentPlanet;if(!p)return;
  vehicles=[];
  if(p.id==='earth'){
    const vTypes=[
      {type:'car',w:62,h:22,color:'#c33',speed:1.5,label:'Sedan'},
      {type:'car',w:64,h:22,color:'#33c',speed:1.8,label:'Hatchback'},
      {type:'car',w:68,h:26,color:'#3a3a3a',speed:1.3,label:'SUV'},
      {type:'car',w:62,h:22,color:'#cc3',speed:2.0,label:'Taxi'},
      {type:'truck',w:100,h:32,color:'#555',speed:0.8,label:'Truck'},
      {type:'bus',w:130,h:34,color:'#e82',speed:0.6,label:'Bus'},
    ];
    // City: 6 vehicles
    for(let i=0;i<6;i++){
      const vt=vTypes[Math.floor(Math.random()*vTypes.length)];
      const vx=200+Math.random()*3200;
      vehicles.push({...vt,x:vx,y:GROUND_LEVEL,vx:(Math.random()>0.5?1:-1)*vt.speed,alive:true,
        exploding:0,homeMin:100,homeMax:3500});
    }
    // Suburbs: 3 vehicles
    for(let i=0;i<3;i++){
      const vt=vTypes[Math.floor(Math.random()*3)];
      vehicles.push({...vt,x:3600+Math.random()*1800,y:GROUND_LEVEL,vx:(Math.random()>0.5?1:-1)*vt.speed*0.7,alive:true,
        exploding:0,homeMin:3500,homeMax:5500});
    }
    // Desert: 2 trucks
    const _dst=earthBiomes.find(b=>b.id==='desert');
    const _dMin=_dst?_dst.from:20000, _dMax=_dst?_dst.to:23500;
    for(let i=0;i<2;i++){
      vehicles.push({...vTypes[4],x:_dMin+500+Math.random()*(_dMax-_dMin-1000),y:GROUND_LEVEL,vx:(Math.random()>0.5?1:-1)*0.6,alive:true,
        exploding:0,homeMin:_dMin,homeMax:_dMax,color:'#8a7060'});
    }
    // Farmland: 2 tractors (use truck body, green paint)
    const _farm=earthBiomes.find(b=>b.id==='farmland');
    if(_farm){
      for(let i=0;i<2;i++){
        vehicles.push({type:'truck',w:80,h:30,color:'#2a8a3a',speed:0.5,label:'Tractor',
          x:_farm.from+200+Math.random()*(_farm.to-_farm.from-400),y:GROUND_LEVEL,
          vx:(Math.random()>0.5?1:-1)*0.5,alive:true,exploding:0,
          homeMin:_farm.from,homeMax:_farm.to});
      }
    }
  }
}

// --- HAZARDS ---
function generateHazards(){
  const p=currentPlanet;if(!p)return;
  hazards=[];turrets=[];military=[];wantedLevel=0;shipHealth=100;alarmPulse=0;
  if(p.id==='lava'){
    for(let i=0;i<3;i++){
      hazards.push({x:Math.random()*worldWidth*0.7+400,y:GROUND_LEVEL,type:'volcano',
        timer:Math.random()*300+100,cooldown:300+Math.random()*200,active:false,erupting:0});
    }
  }
  if(p.id==='ice'){
    for(let i=0;i<2;i++){
      hazards.push({x:Math.random()*worldWidth*0.6+500,type:'blizzard',
        width:600,timer:Math.random()*400,cooldown:400,active:false,duration:200});
    }
  }
  if(p.id==='mars'){
    for(let i=0;i<3;i++){
      const tx=Math.random()*worldWidth*0.7+400;
      turrets.push({x:tx,y:GROUND_LEVEL-30,cooldown:0,range:400,alive:true,bullets:[]});
    }
  }
}

// --- MILITARY SPAWNING (based on wanted level) ---
function spawnMilitary(){
  const p=currentPlanet;if(!p)return;
  const target=playerMode==='onfoot'?alien:ship;
  const genocideMult=Math.min(18,Math.pow(3,genocideCount));
  const hpMult=(1+getDifficultyLevel()*0.15)*genocideMult;

  if(p.id==='earth'){
    // Earth: military spawns FROM bases, not randomly near player
    if(wantedLevel>=1&&earthMilitaryBases.length>0){
      // Pick nearest base to spawn from
      const nearestBase=earthMilitaryBases.reduce((best,bx)=>Math.abs(bx-target.x)<Math.abs(best-target.x)?bx:best,earthMilitaryBases[0]);
      if(military.filter(m=>m.type==='soldier'&&m.alive).length<wantedLevel*2+3){
        const sx=nearestBase+Math.random()*120;
        military.push({type:'soldier',x:sx,y:GROUND_LEVEL-20,vx:0,facing:1,
          shootTimer:0,health:Math.ceil(3*hpMult),alive:true,color:'#363',gunColor:'#555',baseX:nearestBase});
      }
      if(wantedLevel>=3&&military.filter(m=>m.type==='police'&&m.alive).length<wantedLevel-1){
        const sx=nearestBase+Math.random()*100;
        military.push({type:'police',x:sx,y:GROUND_LEVEL-14,vx:(target.x>sx?2:-2),
          w:45,h:20,alive:true,health:Math.ceil(5*hpMult),shootTimer:0,color:'#115'});
      }
      if(wantedLevel>=4&&!military.find(m=>m.type==='helicopter'&&m.alive)){
        military.push({type:'helicopter',x:nearestBase,y:GROUND_LEVEL-500,vx:-1.5,vy:0,
          alive:true,health:Math.ceil(8*hpMult),shootTimer:0,rotorAngle:0});
      }
    }
  }
  if(p.id==='mars'){
    if(wantedLevel>=2&&military.filter(m=>m.type==='soldier').length<wantedLevel*2){
      const sx=target.x+(Math.random()>0.5?1:-1)*(400+Math.random()*300);
      military.push({type:'soldier',x:sx,y:GROUND_LEVEL-20,vx:0,facing:1,
        shootTimer:0,health:Math.ceil(4*hpMult),alive:true,color:'#653',gunColor:'#666'});
    }
  }
  if(p.id==='glimora'){
    if(wantedLevel>=2&&military.filter(m=>m.type==='guardian').length<wantedLevel){
      const sx=target.x+(Math.random()>0.5?1:-1)*(350+Math.random()*300);
      military.push({type:'guardian',x:sx,y:GROUND_LEVEL-25,vx:0,facing:1,
        shootTimer:0,health:Math.ceil(6*hpMult),alive:true,shieldUp:true,shieldTimer:100,color:'#a6f'});
    }
  }
  if(p.id==='ice'){
    if(wantedLevel>=2&&military.filter(m=>m.type==='golem').length<wantedLevel){
      const sx=target.x+(Math.random()>0.5?1:-1)*(400+Math.random()*300);
      military.push({type:'golem',x:sx,y:GROUND_LEVEL-30,vx:0,facing:1,
        shootTimer:0,health:Math.ceil(10*hpMult),alive:true,throwTimer:80,color:'#8be'});
    }
  }
  if(p.id==='lava'){
    if(wantedLevel>=2&&military.filter(m=>m.type==='demon').length<wantedLevel){
      const sx=target.x+(Math.random()>0.5?1:-1)*(350+Math.random()*300);
      military.push({type:'demon',x:sx,y:GROUND_LEVEL-25,vx:0,facing:1,
        shootTimer:0,health:Math.ceil(7*hpMult),alive:true,color:'#f42'});
    }
  }
}

// --- UPDATE MILITARY ---
function updateMilitary(){
  const realTarget=playerMode==='onfoot'?{x:alien.x,y:alien.y}:{x:ship.x,y:ship.y};
  // When cloaked, military wander randomly instead of tracking
  const cloaked=shipCloak.active&&playerMode==='ship';
  const target=cloaked?{x:realTarget.x+(Math.sin(Date.now()*0.001)*500),y:realTarget.y+200}:realTarget;

  military.forEach(m=>{
    // Bullets/boulders use life, not alive
    if(m.type!=='bullet'&&m.type!=='boulder'&&!m.alive)return;

    // Face toward target
    if(m.type!=='bullet'&&m.type!=='boulder'){m.facing=m.x<target.x?1:-1;}
    const d=cloaked?9999:dist(m.x,m.y,realTarget.x,realTarget.y); // can't see cloaked ship

    if(m.type==='soldier'){
      // Passive soldiers (Earth bases) just patrol near base until provoked
      if(m.passive&&wantedLevel===0){
        // Patrol near base
        if(m.baseX!=null){
          if(m.x<m.baseX-40)m.facing=1;
          if(m.x>m.baseX+140)m.facing=-1;
          m.x+=m.facing*0.4;
        }
      }else{
        // Aggro: activate passive soldiers
        if(m.passive&&wantedLevel>0)m.passive=false;
        // Walk toward target, stop at range
        if(d>200)m.x+=m.facing*1.2;
        else if(d<120)m.x-=m.facing*0.8;
        m.shootTimer--;
        const shootRange=playerMode==='ship'?800:350;
        if(m.shootTimer<=0&&d<shootRange){
          m.shootTimer=30+Math.random()*20;
          const a=Math.atan2(target.y-m.y,target.x-m.x);
          const bulletSpeed=playerMode==='ship'?8:6;
          military.push({type:'bullet',x:m.x+m.facing*8,y:m.y-8,vx:Math.cos(a)*bulletSpeed,vy:Math.sin(a)*bulletSpeed,life:playerMode==='ship'?120:60,dmg:3});
          particles.push({x:m.x+m.facing*10,y:m.y-8,vx:m.facing*2,vy:-1,life:8,color:'#ff0',size:2});
        }
      }
    }
    else if(m.type==='police'){
      m.x+=m.vx;
      if(d<300)m.vx+=(target.x>m.x?0.1:-0.1);
      m.vx=Math.max(-3,Math.min(3,m.vx));
      if(m.x<100||m.x>worldWidth-100)m.vx*=-1;
      m.shootTimer--;
      if(m.shootTimer<=0&&d<400){
        m.shootTimer=25;
        const a=Math.atan2(target.y-m.y-10,target.x-m.x);
        military.push({type:'bullet',x:m.x,y:m.y-10,vx:Math.cos(a)*7,vy:Math.sin(a)*7,life:50,dmg:4});
      }
    }
    else if(m.type==='helicopter'){
      m.rotorAngle+=0.3;
      // Fly toward target — hover above when on foot, same height when chasing ship
      const tx=target.x;
      const hoverOffset=playerMode==='ship'?-50:-350;
      const ty=Math.max(LEAVE_THRESHOLD+100,target.y+hoverOffset);
      m.vx+=(tx-m.x)*0.002;m.vy+=(ty-m.y)*0.003;
      m.vx*=0.98;m.vy*=0.98;
      m.x+=m.vx;m.y+=m.vy;
      m.y=Math.max(LEAVE_THRESHOLD+50,m.y); // max altitude cap
      m.shootTimer--;
      if(m.shootTimer<=0&&d<500){
        m.shootTimer=20;
        const a=Math.atan2(target.y-m.y,target.x-m.x);
        military.push({type:'bullet',x:m.x,y:m.y+15,vx:Math.cos(a)*8,vy:Math.sin(a)*8,life:60,dmg:5});
      }
    }
    else if(m.type==='guardian'){
      if(d>180)m.x+=m.facing*0.8;
      m.shieldTimer--;
      if(m.shieldTimer<=0){m.shieldUp=!m.shieldUp;m.shieldTimer=m.shieldUp?100:60;}
      m.shootTimer--;
      if(m.shootTimer<=0&&d<300&&!m.shieldUp){
        m.shootTimer=35;
        const a=Math.atan2(target.y-m.y,target.x-m.x);
        military.push({type:'bullet',x:m.x+m.facing*10,y:m.y-10,vx:Math.cos(a)*5,vy:Math.sin(a)*5,life:50,dmg:4,color:'#c0f'});
        for(let i=0;i<3;i++)particles.push({x:m.x+m.facing*10,y:m.y-10,vx:Math.cos(a)*2+(Math.random()-0.5)*2,vy:Math.sin(a)*2+(Math.random()-0.5)*2,life:15,color:'#c0f',size:2});
      }
    }
    else if(m.type==='golem'){
      if(d>250)m.x+=m.facing*0.5;
      m.throwTimer--;
      if(m.throwTimer<=0&&d<400){
        m.throwTimer=80+Math.random()*40;
        const a=Math.atan2(target.y-m.y-50,target.x-m.x);
        military.push({type:'boulder',x:m.x,y:m.y-20,vx:Math.cos(a)*5,vy:Math.sin(a)*5-3,life:80,dmg:8});
      }
    }
    else if(m.type==='demon'){
      if(d>200)m.x+=m.facing*1.5;
      else if(d<100)m.x-=m.facing;
      m.shootTimer--;
      if(m.shootTimer<=0&&d<350){
        m.shootTimer=25+Math.random()*15;
        const a=Math.atan2(target.y-m.y,target.x-m.x);
        military.push({type:'bullet',x:m.x+m.facing*8,y:m.y-8,vx:Math.cos(a)*6,vy:Math.sin(a)*6,life:45,dmg:5,color:'#f80'});
        particles.push({x:m.x+m.facing*8,y:m.y-8,vx:Math.cos(a)*3,vy:Math.sin(a)*3,life:12,color:'#f40',size:3});
      }
    }

    // Prevent ground units from walking into ocean
    if(currentPlanet&&currentPlanet.id==='earth'&&m.type!=='bullet'&&m.type!=='boulder'&&m.type!=='helicopter'&&isOverOcean(m.x)){
      m.x-=(m.vx||m.facing||1)*2; m.facing=(m.facing||1)*-1;
    }

    // Bullets/boulders
    if(m.type==='bullet'||m.type==='boulder'){
      m.x+=m.vx;m.y+=m.vy;m.life--;
      if(m.type==='boulder')m.vy+=GRAVITY*0.3;
      // Hit ship
      if(playerMode==='ship'&&dist(m.x,m.y,ship.x,ship.y)<35){
        m.life=0;shipHealth-=m.dmg;ship.vx+=m.vx*0.1;ship.vy+=m.vy*0.1;triggerShake(m.dmg*0.5);
        for(let i=0;i<5;i++)particles.push({x:ship.x,y:ship.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:15,color:'#f44',size:2});
        if(shipHealth<=0){shipHealth=100+crewLevels.engineer*10;showMessage(tr('msg.shipDamaged'));ship.vy=-5;}
      }
      // Hit alien on foot
      if(playerMode==='onfoot'&&dist(m.x,m.y,alien.x,alien.y-15)<20){
        m.life=0;alien.health-=m.dmg;alien.vx+=m.vx*0.3;alien.vy+=m.vy*0.3;triggerShake(m.dmg*0.5);
        for(let i=0;i<5;i++)particles.push({x:alien.x,y:alien.y-15,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:15,color:'#0f0',size:2});
        if(alien.health<=0){alien.health=100;playerMode='ship';showMessage(tr('msg.tooInjured'));}
      }
      // Hit ground
      if(m.y>=GROUND_LEVEL){
        m.life=0;
        if(m.type==='boulder'){triggerShake(4);for(let i=0;i<8;i++)debris.push({x:m.x,y:GROUND_LEVEL,vx:(Math.random()-0.5)*5,vy:-Math.random()*4,life:40,size:Math.random()*4+2,color:'#8be'});}
      }
    }

    // Military can be killed by missiles, laser, repulsor
    if(m.type!=='bullet'&&m.type!=='boulder'&&m.health<=0){
      m.alive=false;gameStats.militaryKilled++;
      for(let i=0;i<15;i++)particles.push({x:m.x,y:m.y-10,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5-2,life:30,color:m.color||'#f80',size:Math.random()*3+1});
      triggerShake(4);score+=3;document.getElementById('score').textContent=score;
      if(m.type==='helicopter')for(let i=0;i<30;i++)particles.push({x:m.x+(Math.random()-0.5)*40,y:m.y+(Math.random()-0.5)*20,vx:(Math.random()-0.5)*8,vy:(Math.random()-0.5)*8,life:40,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*5+2});
    }
  });

  // Remove dead + expired
  military=military.filter(m=>(m.alive!==false)&&(m.life===undefined||m.life>0));

  // Military damaged by flamethrower
  if(ship.flameOn&&playerMode==='ship'){
    const flameRange=100+upgrades.flame*30,flameDmg=1.5+upgrades.flame*0.5;
    military.forEach(m=>{if(m.type==='bullet'||m.type==='boulder'||!m.alive)return;
      if(m.type==='guardian'&&m.shieldUp)return;
      const md=dist(ship.x,ship.y+60,m.x,m.y-10);
      if(md<flameRange+20&&m.y>ship.y){m.health-=flameDmg*0.5;
        if(Math.random()>0.7)particles.push({x:m.x,y:m.y-10,vx:(Math.random()-0.5)*3,vy:-Math.random()*2,life:12,color:'#f80',size:2});}
    });
  }
  // Military damaged by repulsor (handled in repulsorBlast too)

  // Military damaged by missiles
  missiles.forEach(ms=>{if(ms.life<=0)return;military.forEach(m=>{
    if(m.type==='bullet'||m.type==='boulder'||!m.alive)return;
    if(m.type==='guardian'&&m.shieldUp)return;
    if(dist(ms.x,ms.y,m.x,m.y-10)<50){m.health-=10;explodeMissile(ms);ms.life=0;}
  });});

  // Military damaged by laser shots
  laserShots.forEach(ls=>{if(ls.life<=0)return;military.forEach(m=>{
    if(m.type==='bullet'||m.type==='boulder'||!m.alive)return;
    if(m.type==='guardian'&&m.shieldUp){
      if(dist(ls.x,ls.y,m.x,m.y-10)<25){ls.life=0;for(let i=0;i<5;i++)particles.push({x:ls.x,y:ls.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:10,color:'#c0f',size:2});}
      return;
    }
    if(dist(ls.x,ls.y,m.x,m.y-10)<20){ls.life=0;m.health-=5;
      for(let i=0;i<4;i++)particles.push({x:m.x,y:m.y-10,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:15,color:m.color||'#f44',size:2});}
  });
  // Boss damage from laser
  if(boss&&boss.alive&&dist(ls.x,ls.y,boss.x,boss.y)<50){ls.life=0;damageBoss(3,'laser');}
  });
}

// --- WANTED LEVEL (scales with mission progress) ---
function getDifficultyLevel(){
  if(!currentPlanet)return 0;
  const prog=planetProgress[currentPlanet.id];
  return prog?prog.missionIndex:0;
}
function updateWantedLevel(){
  const oldLevel=wantedLevel;
  const diff=getDifficultyLevel();
  const scale=1-diff*0.15; // thresholds shrink 15% per mission
  if(planetTerror<1*scale)wantedLevel=0;
  else if(planetTerror<2.5*scale)wantedLevel=1;
  else if(planetTerror<4*scale)wantedLevel=2;
  else if(planetTerror<6*scale)wantedLevel=3;
  else if(planetTerror<8*scale)wantedLevel=4;
  else wantedLevel=5;

  if(wantedLevel>oldLevel&&wantedLevel>=2){
    alarmPulse=60;
    showMessage(tr('msg.wantedLevel').replace('{n}',wantedLevel));
  }
  if(alarmPulse>0)alarmPulse--;

  // Spawn military — rate increases with difficulty
  const spawnChance=0.97-diff*0.01-genocideCount*0.02; // 3% base, scales with difficulty + genocide
  if(wantedLevel>0&&Math.random()>spawnChance)spawnMilitary();
}

// --- MISSION FUNCTIONS ---
function generateMission(){
  if(currentMission)return;
  const planet=currentPlanet||lastVisitedPlanet;
  if(!planet)return;
  const pid=planet.id;
  const prog=planetProgress[pid];
  if(!prog||prog.missionIndex>=5)return;
  const mDef=planetMissions[pid][prog.missionIndex];
  const mDesc=ta('mission.'+pid)[prog.missionIndex]||mDef.desc;
  currentMission={type:mDef.type,desc:mDesc,target:mDef.target,progress:0,reward:mDef.reward,chainIndex:prog.missionIndex};
  missionComplete=false;missionTimer=0;
  showMessage(tr('msg.missionN').replace('{n}',prog.missionIndex+1).replace('{desc}',currentMission.desc).replace('{reward}',currentMission.reward));
}

function updateMission(){
  if(!currentMission||missionComplete)return;
  if(currentMission.type==='survive'&&playerMode==='onfoot'){missionTimer++;currentMission.progress=Math.floor(missionTimer/60);}
  if(currentMission.type==='terror')currentMission.progress=Math.floor(planetTerror);
  if(currentMission.progress>=currentMission.target){
    missionComplete=true;score+=currentMission.reward;gameStats.missionsCompleted++;
    document.getElementById('score').textContent=score;
    showMessage(tr('msg.missionComplete').replace('{reward}',currentMission.reward));
    // Leader relation boost if mission from leader
    if(currentMission.fromLeader&&currentMission.planetId){leaderRelations[currentMission.planetId]=Math.min(10,(leaderRelations[currentMission.planetId]||0)+3);}
    // Advance mission chain
    if(currentPlanet){
      const pid=currentPlanet.id;
      const prog=planetProgress[pid];
      if(prog){
        prog.missionIndex++;
        // Check completion tier thresholds
        if(prog.missionIndex>=5&&prog.completion!=='gold'){
          prog.completion='gold';
          setTimeout(()=>showMessage(tr('msg.goldRank').replace('{planet}',tr('planet.'+currentPlanet.id+'.name'))),2000);
        }else if(prog.missionIndex>=4&&prog.completion!=='gold'&&prog.completion!=='silver'){
          prog.completion='silver';
          upgrades.beamWidth++;upgrades.speed++;upgrades.flame++;
          setTimeout(()=>showMessage(tr('msg.silverRank')),2000);
        }else if(prog.missionIndex>=2&&prog.completion==='none'){
          prog.completion='bronze';
          // Unlock next planet
          const idx=planetDefs.findIndex(d=>d.id===pid);
          if(idx<planetDefs.length-1){
            const nextId=planetDefs[idx+1].id;
            if(!unlockedPlanets.includes(nextId)){
              unlockedPlanets.push(nextId);
              setTimeout(()=>showMessage(tr('msg.bronzeRank').replace('{planet}',tr('planet.'+planetDefs[idx+1].id+'.name'))),2000);
            }
          }
        }
      }
    }
    currentMission=null;
  }
}

// --- MOTHERSHIP INTERIOR ---
function enterMothership(){
  mothershipMode=true;
  const mi=mothershipInterior;
  mi.screen='menu'; // 'menu', 'bridge', 'zoo', 'upgrades'
  mi.selectedItem=0;mi.dialogText='';mi.dialogTimer=0;
  mi.milkCD=0;mi.actionAnim=0;mi.npcTalkAnim=0;mi.npcSpeechBubble='';mi.npcSpeechTimer=0;
  mi.ambientParticles=[];mi._eCool=0;mi._selCool=0;
  mi.zooCreatures=[];
  mothership.specimens.forEach((sp,i)=>{
    mi.zooCreatures.push({...sp,walkDir:Math.random()>0.5?1:-1,walkSpeed:0.2+Math.random()*0.4,
      walkTimer:Math.random()*100,x:50+Math.random()*200,baseX:0,enclosure:Math.min(Math.floor(i/4),4),
      hunger:sp.hunger||50+Math.random()*30,happiness:sp.happiness||40+Math.random()*40,feedAnim:0});
  });
  mi.milkCows=[];
  (mothership.collectedCows||[]).forEach((cow,i)=>{
    mi.milkCows.push({...cow,stallIndex:i%6,walkTimer:Math.random()*100,legAnim:0,milkAnim:0,
      hunger:cow.hunger||50+Math.random()*30,happiness:cow.happiness||40+Math.random()*40,feedAnim:0});
  });
  showMessage(tr('msg.welcomeAboard'));
  document.getElementById('planet-name').textContent=tr('hud.mothership');
}

function exitMothership(){
  mothershipMode=false;
  showMessage(tr('msg.returningToVoid'));
  document.getElementById('planet-name').textContent=tr('hud.deepSpace');
}

const MS_MENUS=[
  {id:'bridge',name:'COMMAND BRIDGE',icon:'\u2302',desc:'Talk to crew, missions, ship status',color:[50,150,255]},
  {id:'comms',name:'COMMS CHANNEL',icon:'\u2637',desc:'Incoming transmissions from planets',color:[255,100,100]},
  {id:'zoo',name:'XENOBIOLOGY ZOO',icon:'\u25C8',desc:'Specimens, livestock, milking',color:[50,255,80]},
  {id:'upgrades',name:'UPGRADES',icon:'\u26A1',desc:'Upgrade beam, speed, paint jobs',color:[255,200,50]},
  {id:'stats',name:'SHIP LOG',icon:'\u2261',desc:'Stats, relations, crew levels',color:[150,200,150]},
];

function updateMothership(){
  const mi=mothershipInterior;
  if(mi.dialogTimer>0)mi.dialogTimer--;
  if(mi.milkCD>0)mi.milkCD--;
  if(mi.actionAnim>0)mi.actionAnim--;
  if(mi.npcTalkAnim>0)mi.npcTalkAnim--;
  if(mi.npcSpeechTimer>0)mi.npcSpeechTimer--;

  // W/S or Up/Down to navigate vertically
  if(keys['w']||keys['arrowup']){if(!mi._selCool){mi._selCool=10;mi.selectedItem=Math.max(0,mi.selectedItem-1);}
  }else if(keys['s']||keys['arrowdown']){if(!mi._selCool){mi._selCool=10;mi.selectedItem++;}
  }else mi._selCool=0;
  if(mi._selCool>0)mi._selCool--;
  // A/D or Left/Right to navigate on bridge (NPCs)
  if(mi.screen==='bridge'){
    if(keys['a']||keys['arrowleft']){if(!mi._lrCool){mi._lrCool=12;mi.selectedItem=Math.max(0,mi.selectedItem-1);}}
    else if(keys['d']||keys['arrowright']){if(!mi._lrCool){mi._lrCool=12;mi.selectedItem=(mi.selectedItem+1)%mi.npcs.length;}}
    else mi._lrCool=0;
    if(mi._lrCool>0)mi._lrCool--;
  }
  if(mi.screen==='comms'){
    const avail=planetLeaders.filter(l=>unlockedPlanets.includes(l.planetId));
    if(avail.length>0){
      if(keys['a']||keys['arrowleft']){if(!mi._lrCool){mi._lrCool=12;mi.selectedItem=Math.max(0,mi.selectedItem-1);mi.commsReading=null;}}
      else if(keys['d']||keys['arrowright']){if(!mi._lrCool){mi._lrCool=12;mi.selectedItem=(mi.selectedItem+1)%avail.length;mi.commsReading=null;}}
      else mi._lrCool=0;
      if(mi._lrCool>0)mi._lrCool--;
    }
    if(mi.commsTalkAnim>0)mi.commsTalkAnim--;
  }

  // ESC = back to menu or exit (layered for zoo)
  if(keys['escape']){keys['escape']=false;
    if(mi.zooWalkMode){mi.zooWalkMode=false;}
    else if(mi.zooDetailView){mi.zooDetailView=null;}
    else if(mi.zooInsideCell){mi.zooInsideCell=null;mi.selectedItem=0;mi.zooScroll=0;}
    else if(mi.screen==='menu'){exitMothership();return;}
    else{mi.screen='menu';mi.selectedItem=0;mi.zooAction=null;mi.zooDetailView=null;mi.zooInsideCell=null;}
  }

  // E = select
  if((keys['e']||keys[' '])&&!mi._eCool){
    mi._eCool=12;keys['e']=false;keys[' ']=false;
    if(mi.screen==='menu'){
      const sel=MS_MENUS[mi.selectedItem%MS_MENUS.length];
      mi.screen=sel.id;mi.selectedItem=0;
    }else if(mi.screen==='bridge'){
      const npc=mi.npcs[mi.selectedItem%mi.npcs.length];
      mi.npcTalkAnim=60;mi.npcSpeechTimer=160;
      if(npc.missions){
        const targetPlanet=currentPlanet||lastVisitedPlanet||planets[0];
        const prog=planetProgress[targetPlanet.id];
        if(!currentMission&&prog&&prog.missionIndex<5){
          generateMission();
          if(currentMission){mi.dialogText=tr('npc.missionPrefix').replace('{n}',prog.missionIndex)+' '+currentMission.desc;mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=240;}
        }else if(prog&&prog.missionIndex>=5&&!bossDefeated[targetPlanet.id]&&!currentMission){
          currentMission={type:'boss',desc:tr('boss.'+targetPlanet.id+'.missionDesc'),target:1,progress:0,reward:0,planetId:targetPlanet.id};
          mi.dialogText=tr('boss.assignMsg').replace('{planet}',tr('planet.'+targetPlanet.id+'.name'));
          mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=240;
        }else if(prog&&prog.missionIndex>=5&&bossDefeated[targetPlanet.id]){
          mi.dialogText=tr('npc.conquered').replace('{planet}',tr('planet.'+targetPlanet.id+'.name')).replace('{rank}',prog.completion.toUpperCase());
          mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=180;
        }else if(currentMission){
          mi.dialogText=tr('npc.inProgress').replace('{desc}',currentMission.desc).replace('{progress}',currentMission.progress).replace('{target}',currentMission.target);
          mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=180;
        }else{
          const lines=mothership.totalCollected>10?npc.progress:npc.idle;
          mi.dialogText=npc.name+': '+lines[Math.floor(Math.random()*lines.length)];mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=150;
        }
      }else{
        // Crew upgrade (costs 15 pts per level)
        const crewCost=15*(1+(crewLevels[npc.id]||0));
        if(score>=crewCost){
          crewLevels[npc.id]=(crewLevels[npc.id]||0)+1;score-=crewCost;document.getElementById('score').textContent=score;
          const bonus=CREW_BONUSES[npc.id];
          mi.dialogText=`${npc.name} leveled up! Lv${crewLevels[npc.id]} - ${bonus.name}: ${bonus.desc}`;mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=200;
          playSound('collect');
        }else{
          const lines=mothership.totalCollected>10?npc.progress:npc.idle;
          mi.dialogText=npc.name+': '+lines[Math.floor(Math.random()*lines.length)]+` (Train: ${crewCost}pts)`;mi.npcSpeechBubble=mi.dialogText;mi.dialogTimer=150;
        }
      }
      if(npc.id==='commander'){alienVoiceSfx.currentTime=0;alienVoiceSfx.play().catch(()=>{});}else if(npc.id==='scientist')playSound('talkHigh');
      else if(npc.id==='pilot')playSound('talkBuzz');else playSound('talkMech');
    }else if(mi.screen==='comms'){
      const available=planetLeaders.filter(l=>unlockedPlanets.includes(l.planetId));
      if(available.length>0){
        if(mi.commsReading&&mi.commsReading.pendingMission){
          // Accept the mission
          const m=mi.commsReading.pendingMission;
          currentMission={type:m.type,desc:m.desc,target:m.target,progress:0,reward:m.reward,planetId:mi.commsReading.leader.planetId,fromLeader:true};
          missionComplete=false;missionTimer=0;
          mi.dialogText='Mission accepted: '+m.desc+' (Reward: '+m.reward+' pts)';mi.dialogTimer=180;
          mi.commsReading=null;mi.commsTalkAnim=0;
          playSound('collect');
        }else if(mi.commsReading){
          mi.commsReading=null;mi.commsTalkAnim=0;
        }else{
          const leader=available[mi.selectedItem%available.length];
          // If no active mission, chance to offer a demand/mission
          if(!currentMission&&leader.demands&&leader.demands.length>0&&Math.random()<0.5){
            const demand=leader.demands[Math.floor(Math.random()*leader.demands.length)];
            mi.commsReading={leader,msg:{text:demand.text,type:'mission'},pendingMission:demand.mission};
            mi.commsTalkAnim=200;
            mi.dialogText=leader.name+': '+demand.text;mi.dialogTimer=250;
          }else{
            const rel=leaderRelations[leader.planetId]||0;
            // Filter messages by relationship
            const pool=rel>=5?leader.messages.filter(m=>m.type==='negotiate'||m.type==='plea'):
              rel<=-5?leader.messages.filter(m=>m.type==='threat'||m.type==='demand'||m.type==='taunt'):leader.messages;
            const msg=(pool.length?pool:leader.messages)[Math.floor(Math.random()*(pool.length||leader.messages.length))];
            mi.commsReading={leader,msg};mi.commsTalkAnim=180;
            mi.dialogText=leader.name+': '+msg.text;mi.dialogTimer=200;
          }
        }
      }
    }else if(mi.screen==='zoo'){
      if(mi.milkCD>0){}
      else if(mi.zooDetailView){
        // In detail view: perform action
        const c=mi.zooDetailView;
        if(mi.zooAction==='feed'){
          c.feedAnim=30;c.hunger=Math.min(100,c.hunger+25);c.happiness=Math.min(100,c.happiness+10);mi.milkCD=10;
          mi.dialogText=c.label+': '+["*munch munch*","Nom nom nom!","Delicious!","*happy noises*"][Math.floor(Math.random()*4)];mi.dialogTimer=100;
        }else if(c._isCow){
          c.milkAnim=30;mi.milkCD=10;milkScore++;score+=1;document.getElementById('score').textContent=score;
          mi.dialogText=["*squirt squirt*","Fresh alien milk!","Grade A xenomilk!"][Math.floor(Math.random()*3)]+` (Milk: ${milkScore})`;mi.dialogTimer=100;
        }else{
          c.happiness=Math.min(100,c.happiness+5);c.feedAnim=15;mi.milkCD=8;
          mi.dialogText=c.label+': '+["*purrs*","Seems happy!","It likes you!"][Math.floor(Math.random()*3)];mi.dialogTimer=80;
        }
      }else if(mi.zooInsideCell){
        // Inside cell list: SPACE opens detail view of selected creature
        const cell=mi.zooInsideCell;
        const si=mi.selectedItem%Math.max(1,cell.items.length);
        mi.zooDetailView=cell.items[si];
      }else{
        // Cell overview: SPACE enters selected cell
        const humanCell2=mi.zooCreatures.filter(c=>!c.isAlien);
        const alienCell2=mi.zooCreatures.filter(c=>c.isAlien);
        const cowCell2=mi.milkCows.map(c=>({...c,_isCow:true}));
        const cells2=[];
        if(humanCell2.length>0)cells2.push({id:'humans',label:'HUMANS',items:humanCell2,color:[80,255,120]});
        if(alienCell2.length>0)cells2.push({id:'aliens',label:'ALIENS',items:alienCell2,color:[150,100,255]});
        if(cowCell2.length>0)cells2.push({id:'livestock',label:'LIVESTOCK',items:cowCell2,color:[255,200,100]});
        if(cells2.length>0){
          mi.zooInsideCell=cells2[mi.selectedItem%cells2.length];
          mi.selectedItem=0;mi.zooScroll=0;
        }
      }
    }else if(mi.screen==='upgrades'){
      const upgList=[{key:'beamWidth',name:'Beam Width',cost:10},{key:'speed',name:'Engine Speed',cost:10},{key:'flame',name:'Flamethrower',cost:10}];
      const totalUpg=upgList.length;
      if(mi.selectedItem<totalUpg){
        const u=upgList[mi.selectedItem%totalUpg];
        if(score>=u.cost){upgrades[u.key]++;score-=u.cost;document.getElementById('score').textContent=score;
          mi.dialogText=`${u.name} upgraded to level ${upgrades[u.key]}!`;mi.dialogTimer=120;mi.actionAnim=20;playSound('collect');
        }else{mi.dialogText=`Need ${u.cost} pts (have ${score})`;mi.dialogTimer=80;}
      }else{
        // Paint job selection
        const paintIdx=mi.selectedItem-totalUpg;
        const paint=SHIP_PAINTS[paintIdx%SHIP_PAINTS.length];
        if(paint.id===shipPaint.name){mi.dialogText='Already equipped!';mi.dialogTimer=60;}
        else if(paint.cost===0||score>=paint.cost){
          if(paint.cost>0){score-=paint.cost;document.getElementById('score').textContent=score;}
          shipPaint={color:paint.color,accent:paint.accent,trail:paint.trail,name:paint.id,ship:paint.ship||'saucer'};
          mi.dialogText=`${paint.name} applied!`;mi.dialogTimer=120;playSound('collect');
        }else{mi.dialogText=`Need ${paint.cost} pts (have ${score})`;mi.dialogTimer=80;}
      }
    }
  }
  if(!keys['e'])mi._eCool=0;

  // F key toggles feed mode in zoo
  if(mi.screen==='zoo'&&keys['f']&&!mi._fCool){mi._fCool=15;mi.zooAction=mi.zooAction==='feed'?null:'feed';}
  if(!keys['f'])mi._fCool=0;
  if(mi._fCool>0)mi._fCool--;

  // X key toggles walk mode in zoo
  if(mi.screen==='zoo'&&keys['x']&&!mi._xCool){
    mi._xCool=15; keys['x']=false;
    mi.zooWalkMode=!mi.zooWalkMode;
    if(mi.zooWalkMode){
      mi.zooAlien={x:50,y:0,vx:0,vy:0,facing:1,onGround:false,walkTimer:0};
      mi.zooDetailView=null;mi.zooInsideCell=null;
    }
  }
  if(!keys['x'])mi._xCool=0;
  if(mi._xCool>0)mi._xCool--;

  // Update zoo walk mode
  if(mi.zooWalkMode && mi.screen==='zoo'){
    const za=mi.zooAlien;
    if(keys['a']||keys['arrowleft']){za.vx-=0.4;za.facing=-1;}
    if(keys['d']||keys['arrowright']){za.vx+=0.4;za.facing=1;}
    if((keys[' ']||keys['w']||keys['arrowup'])&&za.onGround){za.vy=-6;za.onGround=false;}
    za.vy+=0.25; za.vx*=0.88;
    za.x+=za.vx; za.y+=za.vy;
    // Zoo floor
    const zooFloorY=canvas.height-50;
    if(za.y>=zooFloorY){za.y=zooFloorY;za.vy=0;za.onGround=true;}else{za.onGround=false;}
    // Zoo walls
    const zooW=Math.max(400, (mi.zooCreatures.length+mi.milkCows.length)*80+200);
    if(za.x<10)za.x=10;
    if(za.x>zooW-10)za.x=zooW-10;
    if(Math.abs(za.vx)>0.3&&za.onGround)za.walkTimer+=0.15;
    // Interact with creatures nearby (E to pet/feed)
    if(keys['e']&&!mi._eCool){
      mi._eCool=15;
      const allC=[...mi.zooCreatures,...mi.milkCows.map(c=>({...c,_isCow:true}))];
      for(const c of allC){
        const cx=c._zooWalkX||c.x||0;
        if(Math.abs(za.x-cx)<30){
          c.happiness=Math.min(100,c.happiness+8);c.feedAnim=20;
          mi.dialogText=(c.label||'Creature')+': *happy!*';mi.dialogTimer=80;
          break;
        }
      }
    }
  }

  // Animate
  (mi.zooCreatures||[]).forEach(c=>{c.walkTimer+=0.08;c.x+=c.walkDir*c.walkSpeed;
    if(c.x<10||c.x>250)c.walkDir*=-1;if(Math.random()>0.99)c.walkDir*=-1;
    if(c.feedAnim>0)c.feedAnim--;c.hunger=Math.max(0,c.hunger-0.005);c.happiness=Math.max(0,c.happiness-0.003);});
  (mi.milkCows||[]).forEach(c=>{c.walkTimer+=0.03;c.legAnim+=0.05;if(c.milkAnim>0)c.milkAnim--;
    if(c.feedAnim>0)c.feedAnim--;c.hunger=Math.max(0,c.hunger-0.005);c.happiness=Math.max(0,c.happiness-0.003);});

  if(Math.random()>0.93){
    const col=mi.screen==='menu'?[80,80,120]:mi.screen==='bridge'?[50,150,255]:mi.screen==='zoo'?[50,255,80]:[255,200,50];
    mi.ambientParticles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,
      vx:(Math.random()-0.5)*0.3,vy:-0.2-Math.random()*0.3,life:60+Math.random()*40,color:col,size:Math.random()*2+0.5});
  }
  mi.ambientParticles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;});
  mi.ambientParticles=mi.ambientParticles.filter(p=>p.life>0);
  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
}

// Large detailed NPC portrait
function drawNPCPortrait(npc,px,py,size,t,talking){
  const s=size,id=npc.id;
  if(id==='commander'){
    // Tall skeletal, 4 green eyes, armored, scarred
    ctx.fillStyle='#2a3a2a';
    ctx.beginPath();ctx.moveTo(px-s*0.5,py+s*0.05);ctx.lineTo(px-s*0.4,py-s*0.05);ctx.lineTo(px-s*0.15,py+s*0.02);ctx.lineTo(px-s*0.15,py+s*0.15);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(px+s*0.5,py+s*0.05);ctx.lineTo(px+s*0.4,py-s*0.05);ctx.lineTo(px+s*0.15,py+s*0.02);ctx.lineTo(px+s*0.15,py+s*0.15);ctx.closePath();ctx.fill();
    for(let i=0;i<3;i++){ctx.fillStyle='#4a5a4a';ctx.beginPath();ctx.moveTo(px-s*(0.35+i*0.06),py-s*0.02-i*s*0.02);ctx.lineTo(px-s*(0.37+i*0.06),py-s*0.12-i*s*0.03);ctx.lineTo(px-s*(0.33+i*0.06),py-s*0.02-i*s*0.02);ctx.closePath();ctx.fill();}
    const bg=ctx.createLinearGradient(px-s*0.2,py,px+s*0.2,py+s*0.7);bg.addColorStop(0,'#1a2a1a');bg.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=bg;ctx.fillRect(px-s*0.18,py+s*0.05,s*0.36,s*0.6);
    ctx.fillStyle='#fc0';ctx.beginPath();ctx.moveTo(px,py+s*0.12);ctx.lineTo(px-s*0.03,py+s*0.17);ctx.lineTo(px,py+s*0.22);ctx.lineTo(px+s*0.03,py+s*0.17);ctx.closePath();ctx.fill();
    ctx.fillStyle='#6a8a6a';ctx.fillRect(px-s*0.1,py-s*0.1,s*0.2,s*0.18);
    const hy=py-s*0.4;
    const hg=ctx.createRadialGradient(px,hy-s*0.05,0,px,hy,s*0.35);hg.addColorStop(0,'#8aaa8a');hg.addColorStop(0.7,'#5a7a5a');hg.addColorStop(1,'#2a3a2a');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.25,s*0.35,0,0,Math.PI*2);ctx.fill();
    for(let i=0;i<4;i++){ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(px,hy-s*0.2+i*s*0.05,s*(0.22-i*0.02),s*0.03,0,Math.PI,0);ctx.stroke();}
    ctx.strokeStyle='rgba(255,80,80,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+s*0.08,hy-s*0.2);ctx.quadraticCurveTo(px+s*0.2,hy,px+s*0.12,hy+s*0.2);ctx.stroke();
    const ey=hy+s*0.02,blink=Math.sin(t*0.5)>0.95?0.3:1;
    [[-0.12,-0.03],[0.12,-0.03],[-0.08,0.06],[0.08,0.06]].forEach(([ox,oy],idx)=>{
      ctx.fillStyle=idx<2?'rgba(0,0,0,0.9)':'rgba(10,10,10,0.7)';const es=idx<2?0.09:0.06;
      ctx.save();ctx.translate(px+s*ox,ey+s*oy);ctx.rotate(ox<0?-0.15:0.15);ctx.beginPath();ctx.ellipse(0,0,s*es,s*es*0.55*blink,0,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle=`rgba(0,${200+Math.sin(t*2+idx)*55},0,${0.4*blink})`;ctx.beginPath();ctx.arc(px+s*ox,ey+s*oy,s*es*0.3*blink,0,Math.PI*2);ctx.fill();});
    const my=hy+s*0.22;
    if(talking>0){const mo=Math.sin(t*12)*0.5+0.5;ctx.fillStyle='#0a0a0a';ctx.beginPath();ctx.ellipse(px,my,s*0.07,s*0.02+s*0.035*mo,0,0,Math.PI*2);ctx.fill();}
    else{ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-s*0.05,my);ctx.lineTo(px+s*0.05,my);ctx.stroke();}
  }else if(id==='scientist'){
    // Cephalopod, huge brain, single cyclops eye
    ctx.fillStyle='#5566aa';for(let i=0;i<4;i++){const tx=px+(i-1.5)*s*0.12,tw=Math.sin(t*2+i)*s*0.03;
      ctx.beginPath();ctx.moveTo(tx-s*0.04,py+s*0.1);ctx.quadraticCurveTo(tx+tw,py+s*0.4,tx+Math.sin(t+i*2)*s*0.08,py+s*0.7);
      ctx.lineTo(tx+s*0.03+Math.sin(t+i*2)*s*0.08,py+s*0.7);ctx.quadraticCurveTo(tx+tw+s*0.03,py+s*0.4,tx+s*0.04,py+s*0.1);ctx.closePath();ctx.fill();}
    const bbg=ctx.createRadialGradient(px,py+s*0.05,0,px,py+s*0.05,s*0.25);bbg.addColorStop(0,'#7788cc');bbg.addColorStop(1,'#4455aa');
    ctx.fillStyle=bbg;ctx.beginPath();ctx.ellipse(px,py+s*0.05,s*0.22,s*0.18,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#6677bb';ctx.fillRect(px-s*0.05,py-s*0.15,s*0.1,s*0.22);
    const hy=py-s*0.42;const hg=ctx.createRadialGradient(px,hy,0,px,hy,s*0.38);hg.addColorStop(0,'#99aadd');hg.addColorStop(0.6,'#6677bb');hg.addColorStop(1,'#3344aa');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.35,s*0.38,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(100,120,200,0.3)';ctx.lineWidth=1;for(let i=0;i<6;i++){const a=i*0.9;ctx.beginPath();ctx.moveTo(px+Math.cos(a)*s*0.1,hy-s*0.2);ctx.quadraticCurveTo(px+Math.cos(a+0.5)*s*0.3,hy+Math.sin(a)*s*0.1,px+Math.cos(a+1)*s*0.15,hy+s*0.25);ctx.stroke();}
    const ey=hy+s*0.05,blink=Math.sin(t*0.4)>0.93?0.2:1;
    ctx.fillStyle='#ddeeff';ctx.beginPath();ctx.ellipse(px,ey,s*0.18,s*0.12*blink,0,0,Math.PI*2);ctx.fill();
    const ig=ctx.createRadialGradient(px+Math.sin(t)*s*0.02,ey,0,px,ey,s*0.12);ig.addColorStop(0,'#0af');ig.addColorStop(0.5,'#048');ig.addColorStop(1,'#024');
    ctx.fillStyle=ig;ctx.beginPath();ctx.ellipse(px+Math.sin(t*0.7)*s*0.02,ey,s*0.1,s*0.08*blink,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(px+Math.sin(t*0.7)*s*0.02,ey,s*0.02,s*0.07*blink,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.beginPath();ctx.arc(px-s*0.05,ey-s*0.04,s*0.025,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(0,255,255,0.3)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(px,ey,s*0.15,0,Math.PI*2);ctx.stroke();
    const my=hy+s*0.25;if(talking>0){const mo=Math.sin(t*10)*0.5+0.5;ctx.fillStyle='#334';ctx.beginPath();ctx.ellipse(px,my,s*0.04,s*0.015+s*0.02*mo,0,0,Math.PI*2);ctx.fill();}
  }else if(id==='pilot'){
    // Insectoid, compound eyes, mandibles, antennae
    const cbg=ctx.createLinearGradient(px-s*0.3,py,px+s*0.3,py+s*0.65);cbg.addColorStop(0,'#aa6644');cbg.addColorStop(1,'#553322');
    ctx.fillStyle=cbg;ctx.beginPath();ctx.moveTo(px-s*0.3,py+s*0.05);ctx.quadraticCurveTo(px-s*0.35,py+s*0.4,px-s*0.2,py+s*0.65);ctx.lineTo(px+s*0.2,py+s*0.65);ctx.quadraticCurveTo(px+s*0.35,py+s*0.4,px+s*0.3,py+s*0.05);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1;for(let i=1;i<4;i++)ctx.beginPath(),ctx.moveTo(px-s*0.28,py+s*0.05+i*s*0.15),ctx.quadraticCurveTo(px,py+i*s*0.15,px+s*0.28,py+s*0.05+i*s*0.15),ctx.stroke();
    ctx.fillStyle='#664422';ctx.fillRect(px-s*0.2,py-s*0.02,s*0.4,s*0.1);
    ctx.fillStyle='#f80';ctx.fillRect(px-s*0.18,py-s*0.01,s*0.03,s*0.06);
    ctx.fillStyle='#996644';ctx.fillRect(px-s*0.07,py-s*0.12,s*0.14,s*0.12);
    const hy=py-s*0.38;ctx.fillStyle='#aa7755';ctx.beginPath();ctx.ellipse(px,hy,s*0.22,s*0.22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#bb8866';ctx.beginPath();ctx.moveTo(px,hy-s*0.3);ctx.lineTo(px-s*0.25,hy+s*0.12);ctx.lineTo(px+s*0.25,hy+s*0.12);ctx.closePath();ctx.fill();
    const ey=hy-s*0.02;
    [[-0.14,0],[0.14,0]].forEach(([ox])=>{const eg=ctx.createRadialGradient(px+s*ox,ey,0,px+s*ox,ey,s*0.1);eg.addColorStop(0,'#ff8800');eg.addColorStop(0.5,'#cc4400');eg.addColorStop(1,'#441100');
      ctx.fillStyle=eg;ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.1,s*0.08,ox<0?-0.2:0.2,0,Math.PI*2);ctx.fill();});
    const my=hy+s*0.15;ctx.fillStyle='#664422';
    ctx.beginPath();ctx.moveTo(px-s*0.08,my);ctx.quadraticCurveTo(px-s*0.15,my+s*0.12+Math.sin(t*3)*s*0.02,px-s*0.06,my+s*0.15);ctx.lineTo(px-s*0.03,my);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(px+s*0.08,my);ctx.quadraticCurveTo(px+s*0.15,my+s*0.12+Math.sin(t*3)*s*0.02,px+s*0.06,my+s*0.15);ctx.lineTo(px+s*0.03,my);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#aa8866';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(px-s*0.08,hy-s*0.2);ctx.quadraticCurveTo(px-s*0.2,hy-s*0.45,px-s*0.15+Math.sin(t*2)*s*0.03,hy-s*0.5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+s*0.08,hy-s*0.2);ctx.quadraticCurveTo(px+s*0.2,hy-s*0.45,px+s*0.15+Math.sin(t*2+1)*s*0.03,hy-s*0.5);ctx.stroke();
    if(talking>0){const mo=Math.sin(t*14)*0.5+0.5;ctx.fillStyle='rgba(60,30,10,0.8)';ctx.beginPath();ctx.ellipse(px,my+s*0.08,s*0.04,s*0.01+s*0.03*mo,0,0,Math.PI*2);ctx.fill();}
  }else{
    // Engineer: cyborg, half-metal, glowing eye
    ctx.fillStyle='#888844';ctx.fillRect(px-s*0.25,py+s*0.05,s*0.5,s*0.55);
    ctx.fillStyle='#555530';ctx.fillRect(px-s*0.15,py+s*0.1,s*0.3,s*0.2);
    for(let i=0;i<4;i++){ctx.fillStyle=`rgba(${i%2?255:0},${i%2?200:255},0,${0.4+Math.sin(t*3+i)*0.2})`;ctx.beginPath();ctx.arc(px-s*0.08+i*s*0.055,py+s*0.15,s*0.015,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#999966';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px-s*0.25,py+s*0.15);ctx.lineTo(px-s*0.4,py+s*0.3);ctx.lineTo(px-s*0.38,py+s*0.45);ctx.stroke();
    ctx.fillStyle=`rgba(255,200,0,${0.3+Math.sin(t*5)*0.2})`;ctx.beginPath();ctx.arc(px-s*0.38,py+s*0.45,s*0.02,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#999966';ctx.fillRect(px-s*0.1,py-s*0.08,s*0.2,s*0.15);
    const hy=py-s*0.32;
    ctx.fillStyle='#bbaa66';ctx.beginPath();ctx.ellipse(px-s*0.02,hy,s*0.22,s*0.24,0,Math.PI*0.5,Math.PI*1.5);ctx.fill();
    ctx.fillStyle='#666650';ctx.beginPath();ctx.ellipse(px+s*0.02,hy,s*0.22,s*0.24,0,-Math.PI*0.5,Math.PI*0.5);ctx.fill();
    ctx.fillStyle='#888870';for(let i=0;i<4;i++)ctx.beginPath(),ctx.arc(px+s*0.18,hy-s*0.12+i*s*0.08,s*0.015,0,Math.PI*2),ctx.fill();
    const ey=hy+s*0.02;
    ctx.fillStyle='rgba(30,30,20,0.8)';ctx.save();ctx.translate(px-s*0.1,ey);ctx.rotate(-0.1);ctx.beginPath();ctx.ellipse(0,0,s*0.08,s*0.05,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle=`rgba(0,255,0,${0.6+Math.sin(t*4)*0.3})`;ctx.beginPath();ctx.arc(px+s*0.1,ey,s*0.06,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(0,255,0,${0.2+Math.sin(t*4)*0.1})`;ctx.beginPath();ctx.arc(px+s*0.1,ey,s*0.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px+s*0.1,ey,s*0.02,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#555540';ctx.beginPath();ctx.moveTo(px-s*0.05,hy+s*0.15);ctx.lineTo(px-s*0.12,hy+s*0.25);ctx.lineTo(px+s*0.15,hy+s*0.25);ctx.lineTo(px+s*0.08,hy+s*0.15);ctx.closePath();ctx.fill();
    if(talking>0){const mo=Math.sin(t*10)*0.5+0.5;ctx.fillStyle='#333320';ctx.fillRect(px-s*0.05,hy+s*0.22,s*0.13,s*0.01+s*0.03*mo);}
  }
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`bold ${s*0.07|0}px monospace`;ctx.textAlign='center';ctx.fillText(npc.name,px,py+s*0.8);
  ctx.fillStyle='rgba(150,200,255,0.4)';ctx.font=`${s*0.055|0}px monospace`;
  const role=id==='commander'?'Fleet Commander':id==='scientist'?'Xenobiologist':id==='pilot'?'Chief Pilot':'Chief Engineer';
  ctx.fillText(role,px,py+s*0.88);
}

// Leader portrait for comms screen (same size/style as NPC portraits)
function drawLeaderPortrait(leader,px,py,size,t,talking){
  const s=size,id=leader.portrait;
  if(id==='human'){
    // Human president — suit, tie, human skin, neat hair
    // Shoulders/suit
    const bg=ctx.createLinearGradient(px-s*0.3,py,px+s*0.3,py+s*0.7);bg.addColorStop(0,'#1a1a2a');bg.addColorStop(1,'#0a0a15');
    ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(px-s*0.35,py+s*0.15);ctx.quadraticCurveTo(px-s*0.4,py+s*0.5,px-s*0.3,py+s*0.7);
    ctx.lineTo(px+s*0.3,py+s*0.7);ctx.quadraticCurveTo(px+s*0.4,py+s*0.5,px+s*0.35,py+s*0.15);ctx.closePath();ctx.fill();
    // White shirt
    ctx.fillStyle='#ddd';ctx.beginPath();ctx.moveTo(px-s*0.08,py+s*0.1);ctx.lineTo(px-s*0.12,py+s*0.5);ctx.lineTo(px+s*0.12,py+s*0.5);ctx.lineTo(px+s*0.08,py+s*0.1);ctx.closePath();ctx.fill();
    // Tie
    ctx.fillStyle='#a22';ctx.beginPath();ctx.moveTo(px,py+s*0.1);ctx.lineTo(px-s*0.03,py+s*0.15);ctx.lineTo(px,py+s*0.45);ctx.lineTo(px+s*0.03,py+s*0.15);ctx.closePath();ctx.fill();
    // Neck
    ctx.fillStyle=leader.color;ctx.fillRect(px-s*0.06,py-s*0.05,s*0.12,s*0.18);
    // Head
    const hy=py-s*0.3;
    const hg=ctx.createRadialGradient(px,hy,0,px,hy,s*0.28);hg.addColorStop(0,leader.color);hg.addColorStop(1,'#8a7060');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.22,s*0.28,0,0,Math.PI*2);ctx.fill();
    // Hair
    ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(px,hy-s*0.18,s*0.23,s*0.12,0,Math.PI,0);ctx.fill();
    ctx.fillRect(px-s*0.23,hy-s*0.12,s*0.06,s*0.15);ctx.fillRect(px+s*0.17,hy-s*0.12,s*0.06,s*0.15);
    // Eyes
    const ey=hy+s*0.02,blink=Math.sin(t*0.5)>0.95?0.3:1;
    [[-0.09,0],[0.09,0]].forEach(([ox])=>{
      ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.06,s*0.04*blink,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#346';ctx.beginPath();ctx.arc(px+s*ox,ey,s*0.025*blink,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(px+s*ox,ey,s*0.012*blink,0,Math.PI*2);ctx.fill();
    });
    // Eyebrows
    ctx.strokeStyle='#333';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(px-s*0.14,ey-s*0.06);ctx.lineTo(px-s*0.04,ey-s*0.07);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+s*0.04,ey-s*0.07);ctx.lineTo(px+s*0.14,ey-s*0.06);ctx.stroke();
    // Nose
    ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,ey+s*0.02);ctx.lineTo(px-s*0.02,ey+s*0.08);ctx.lineTo(px+s*0.02,ey+s*0.08);ctx.stroke();
    // Mouth
    const my=hy+s*0.18;
    if(talking>0){const mo=Math.sin(t*12)*0.5+0.5;ctx.fillStyle='#511';ctx.beginPath();ctx.ellipse(px,my,s*0.06,s*0.015+s*0.03*mo,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(px,my-s*0.005,s*0.05,s*0.008*mo,0,0,Math.PI);ctx.fill();
    }else{ctx.strokeStyle='rgba(100,50,50,0.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px-s*0.05,my);ctx.quadraticCurveTo(px,my+s*0.01,px+s*0.05,my);ctx.stroke();}
    // Ears
    ctx.fillStyle=leader.color;
    ctx.beginPath();ctx.ellipse(px-s*0.22,hy,s*0.04,s*0.06,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(px+s*0.22,hy,s*0.04,s*0.06,0,0,Math.PI*2);ctx.fill();
  }else if(id==='martian'){
    // Red-skinned warrior with horns
    const bg=ctx.createLinearGradient(px-s*0.3,py,px+s*0.3,py+s*0.7);bg.addColorStop(0,'#4a1a0a');bg.addColorStop(1,'#2a0a05');
    ctx.fillStyle=bg;ctx.fillRect(px-s*0.25,py+s*0.05,s*0.5,s*0.6);
    // Armor plates
    ctx.strokeStyle='rgba(255,100,50,0.3)';ctx.lineWidth=2;
    for(let i=0;i<3;i++)ctx.beginPath(),ctx.moveTo(px-s*0.2,py+s*0.15+i*s*0.15),ctx.lineTo(px+s*0.2,py+s*0.15+i*s*0.15),ctx.stroke();
    ctx.fillStyle=leader.color;ctx.fillRect(px-s*0.07,py-s*0.08,s*0.14,s*0.15);
    const hy=py-s*0.32;
    const hg=ctx.createRadialGradient(px,hy,0,px,hy,s*0.28);hg.addColorStop(0,'#dd5544');hg.addColorStop(1,'#882211');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.22,s*0.26,0,0,Math.PI*2);ctx.fill();
    // Horns
    ctx.fillStyle='#886655';
    ctx.beginPath();ctx.moveTo(px-s*0.18,hy-s*0.15);ctx.lineTo(px-s*0.28,hy-s*0.45);ctx.lineTo(px-s*0.12,hy-s*0.1);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(px+s*0.18,hy-s*0.15);ctx.lineTo(px+s*0.28,hy-s*0.45);ctx.lineTo(px+s*0.12,hy-s*0.1);ctx.closePath();ctx.fill();
    // Eyes — fierce
    const ey=hy+s*0.02,blink=Math.sin(t*0.4)>0.93?0.2:1;
    [[-0.1,0],[0.1,0]].forEach(([ox])=>{
      ctx.fillStyle='#ff0';ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.07,s*0.04*blink,ox<0?-0.1:0.1,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a00';ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.03,s*0.035*blink,0,0,Math.PI*2);ctx.fill();
    });
    const my=hy+s*0.18;
    if(talking>0){const mo=Math.sin(t*10)*0.5+0.5;ctx.fillStyle='#300';ctx.beginPath();ctx.ellipse(px,my,s*0.07,s*0.02+s*0.035*mo,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ffa';for(let i=-1;i<=1;i+=2)ctx.beginPath(),ctx.moveTo(px+i*s*0.03,my-s*0.01),ctx.lineTo(px+i*s*0.04,my-s*0.03),ctx.lineTo(px+i*s*0.02,my-s*0.01),ctx.closePath(),ctx.fill();
    }else{ctx.strokeStyle='rgba(80,20,10,0.5)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px-s*0.05,my);ctx.lineTo(px+s*0.05,my);ctx.stroke();}
  }else if(id==='crystal'){
    // Crystalline being — faceted head, glowing
    ctx.fillStyle='rgba(100,60,180,0.3)';ctx.fillRect(px-s*0.2,py+s*0.05,s*0.4,s*0.5);
    ctx.fillStyle=leader.color;ctx.fillRect(px-s*0.05,py-s*0.1,s*0.1,s*0.18);
    const hy=py-s*0.35;
    // Crystal head (diamond shape)
    ctx.fillStyle=`rgba(180,130,255,${0.6+Math.sin(t*2)*0.2})`;
    ctx.beginPath();ctx.moveTo(px,hy-s*0.35);ctx.lineTo(px+s*0.25,hy);ctx.lineTo(px,hy+s*0.25);ctx.lineTo(px-s*0.25,hy);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,200,255,0.4)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(px,hy-s*0.35);ctx.lineTo(px+s*0.25,hy);ctx.lineTo(px,hy+s*0.25);ctx.lineTo(px-s*0.25,hy);ctx.closePath();ctx.stroke();
    // Inner facets
    ctx.strokeStyle='rgba(200,150,255,0.2)';ctx.beginPath();ctx.moveTo(px,hy-s*0.35);ctx.lineTo(px,hy+s*0.25);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px-s*0.25,hy);ctx.lineTo(px+s*0.25,hy);ctx.stroke();
    // Eye
    ctx.fillStyle=`rgba(255,255,255,${0.5+Math.sin(t*3)*0.3})`;ctx.beginPath();ctx.arc(px,hy,s*0.08,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(150,80,255,0.8)`;ctx.beginPath();ctx.arc(px,hy,s*0.04,0,Math.PI*2);ctx.fill();
    const my=hy+s*0.15;
    if(talking>0){const mo=Math.sin(t*8)*0.5+0.5;ctx.fillStyle=`rgba(200,150,255,${0.3+mo*0.4})`;ctx.beginPath();ctx.ellipse(px,my,s*0.04,s*0.01+s*0.025*mo,0,0,Math.PI*2);ctx.fill();}
  }else if(id==='ice'){
    // Ice queen — pale blue, crown of icicles
    const bg=ctx.createLinearGradient(px-s*0.3,py,px+s*0.3,py+s*0.7);bg.addColorStop(0,'#1a2a3a');bg.addColorStop(1,'#0a1520');
    ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(px-s*0.3,py+s*0.15);ctx.quadraticCurveTo(px-s*0.35,py+s*0.5,px-s*0.25,py+s*0.7);
    ctx.lineTo(px+s*0.25,py+s*0.7);ctx.quadraticCurveTo(px+s*0.35,py+s*0.5,px+s*0.3,py+s*0.15);ctx.closePath();ctx.fill();
    ctx.fillStyle=leader.color;ctx.fillRect(px-s*0.06,py-s*0.05,s*0.12,s*0.22);
    const hy=py-s*0.32;
    const hg=ctx.createRadialGradient(px,hy,0,px,hy,s*0.25);hg.addColorStop(0,'#bbddff');hg.addColorStop(1,'#6699cc');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.22,s*0.26,0,0,Math.PI*2);ctx.fill();
    // Icicle crown
    for(let i=-2;i<=2;i++){const ix=px+i*s*0.08;
      ctx.fillStyle=`rgba(150,200,255,${0.5+Math.sin(t+i)*0.2})`;
      ctx.beginPath();ctx.moveTo(ix-s*0.02,hy-s*0.2);ctx.lineTo(ix,hy-s*0.2-s*0.12-Math.abs(i)*s*0.03);ctx.lineTo(ix+s*0.02,hy-s*0.2);ctx.closePath();ctx.fill();}
    const ey=hy+s*0.02,blink=Math.sin(t*0.5)>0.95?0.3:1;
    [[-0.09,0],[0.09,0]].forEach(([ox])=>{
      ctx.fillStyle='#ddf';ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.06,s*0.04*blink,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#48c';ctx.beginPath();ctx.arc(px+s*ox,ey,s*0.025*blink,0,Math.PI*2);ctx.fill();
    });
    const my=hy+s*0.16;
    if(talking>0){const mo=Math.sin(t*10)*0.5+0.5;ctx.fillStyle='#2a4a6a';ctx.beginPath();ctx.ellipse(px,my,s*0.05,s*0.01+s*0.025*mo,0,0,Math.PI*2);ctx.fill();}
    else{ctx.strokeStyle='rgba(100,150,200,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-s*0.04,my);ctx.lineTo(px+s*0.04,my);ctx.stroke();}
  }else{
    // Lava warlord — magma skin, glowing cracks, fire eyes
    ctx.fillStyle='#3a1a0a';ctx.fillRect(px-s*0.3,py+s*0.05,s*0.6,s*0.6);
    // Glowing lava cracks on armor
    ctx.strokeStyle=`rgba(255,100,0,${0.3+Math.sin(t*3)*0.2})`;ctx.lineWidth=2;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(px-s*0.2+i*s*0.1,py+s*0.1);ctx.lineTo(px-s*0.15+i*s*0.1,py+s*0.5);ctx.stroke();}
    ctx.fillStyle=leader.color;ctx.fillRect(px-s*0.08,py-s*0.08,s*0.16,s*0.15);
    const hy=py-s*0.32;
    const hg=ctx.createRadialGradient(px,hy,0,px,hy,s*0.28);hg.addColorStop(0,'#ff6633');hg.addColorStop(0.7,'#993311');hg.addColorStop(1,'#441100');
    ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(px,hy,s*0.24,s*0.28,0,0,Math.PI*2);ctx.fill();
    // Magma cracks on face
    ctx.strokeStyle=`rgba(255,200,0,${0.2+Math.sin(t*4)*0.15})`;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(px-s*0.1,hy-s*0.15);ctx.lineTo(px-s*0.05,hy+s*0.1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+s*0.08,hy-s*0.1);ctx.lineTo(px+s*0.12,hy+s*0.15);ctx.stroke();
    // Fire eyes
    const ey=hy+s*0.02;
    [[-0.1,0],[0.1,0]].forEach(([ox])=>{
      ctx.fillStyle=`rgba(255,${150+Math.sin(t*6)*50},0,0.9)`;ctx.beginPath();ctx.ellipse(px+s*ox,ey,s*0.07,s*0.05,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(px+s*ox,ey,s*0.025,0,Math.PI*2);ctx.fill();
    });
    const my=hy+s*0.2;
    if(talking>0){const mo=Math.sin(t*8)*0.5+0.5;ctx.fillStyle='#500';ctx.beginPath();ctx.ellipse(px,my,s*0.08,s*0.02+s*0.04*mo,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,150,0,${0.3+mo*0.4})`;ctx.beginPath();ctx.ellipse(px,my,s*0.06,s*0.01+s*0.02*mo,0,0,Math.PI*2);ctx.fill();
    }else{ctx.strokeStyle='rgba(200,80,20,0.4)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px-s*0.06,my);ctx.lineTo(px+s*0.06,my);ctx.stroke();}
  }
  // Name and title
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`bold ${s*0.07|0}px monospace`;ctx.textAlign='center';ctx.fillText(leader.name,px,py+s*0.8);
  ctx.fillStyle='rgba(255,150,130,0.4)';ctx.font=`${s*0.055|0}px monospace`;
  ctx.fillText(leader.planetId.toUpperCase()+' LEADER',px,py+s*0.88);
}

function drawMothership(){
  const mi=mothershipInterior;
  const cw=canvas.width,ch=canvas.height,t=Date.now()*0.001;

  // === BACKGROUND ===
  const bg=ctx.createLinearGradient(0,0,0,ch);bg.addColorStop(0,'#020210');bg.addColorStop(0.5,'#040418');bg.addColorStop(1,'#060620');
  ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);
  for(let i=0;i<60;i++){const sx=(i*173.7+t*5*(i%3+1))%cw,sy=(i*97.3+20)%ch;
    ctx.fillStyle=`rgba(255,255,255,${0.15+Math.sin(t+i)*0.1})`;ctx.beginPath();ctx.arc(sx,sy,0.7+Math.sin(t*2+i)*0.3,0,Math.PI*2);ctx.fill();}
  mi.ambientParticles.forEach(p=>{ctx.fillStyle=`rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1,p.life/30)*0.2})`;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();});

  // ================================================================
  // MAIN MENU - 3 big centered options
  // ================================================================
  if(mi.screen==='menu'){
    // Title
    ctx.fillStyle='rgba(100,200,255,0.8)';ctx.font=`bold ${Math.min(28,cw*0.04|0)}px monospace`;ctx.textAlign='center';
    ctx.fillText('MOTHERSHIP',cw/2,ch*0.12);
    ctx.fillStyle='rgba(80,150,200,0.3)';ctx.font=`${Math.min(12,cw*0.015|0)}px monospace`;
    ctx.fillText(`Score: ${score}  |  Specimens: ${mothership.specimens.length}  |  Milk: ${milkScore}`,cw/2,ch*0.17);

    // 3 big centered cards
    const cardW=Math.min(300,cw*0.35),cardH=Math.min(140,ch*0.2),gap=20;
    const totalH=MS_MENUS.length*(cardH+gap)-gap;
    const startY=(ch-totalH)/2;

    MS_MENUS.forEach((m,i)=>{
      const sel=mi.selectedItem%MS_MENUS.length===i;
      const cx=cw/2-cardW/2,cy2=startY+i*(cardH+gap);
      const c=m.color;
      // Card bg
      ctx.fillStyle=sel?`rgba(${c[0]},${c[1]},${c[2]},0.12)`:'rgba(10,10,20,0.5)';
      roundRect(ctx,cx,cy2,cardW,cardH,12);ctx.fill();
      // Border
      ctx.strokeStyle=sel?`rgba(${c[0]},${c[1]},${c[2]},${0.5+Math.sin(t*3)*0.2})`:`rgba(${c[0]},${c[1]},${c[2]},0.1)`;
      ctx.lineWidth=sel?2:1;roundRect(ctx,cx,cy2,cardW,cardH,12);ctx.stroke();
      // Glow when selected
      if(sel){const glow=ctx.createRadialGradient(cw/2,cy2+cardH/2,0,cw/2,cy2+cardH/2,cardW*0.6);
        glow.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},0.04)`);glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cw/2,cy2+cardH/2,cardW*0.6,0,Math.PI*2);ctx.fill();}
      // Icon
      ctx.fillStyle=sel?`rgba(${c[0]},${c[1]},${c[2]},0.8)`:`rgba(${c[0]},${c[1]},${c[2]},0.3)`;
      ctx.font=`${Math.min(36,cardH*0.3|0)}px monospace`;ctx.textAlign='center';
      ctx.fillText(m.icon,cw/2,cy2+cardH*0.35);
      // Name
      ctx.fillStyle=sel?`rgba(${c[0]},${c[1]},${c[2]},0.95)`:'rgba(255,255,255,0.3)';
      ctx.font=`bold ${Math.min(16,cardH*0.12|0)}px monospace`;
      ctx.fillText(m.name,cw/2,cy2+cardH*0.58);
      // Description
      ctx.fillStyle=sel?`rgba(${c[0]},${c[1]},${c[2]},0.4)`:'rgba(255,255,255,0.15)';
      ctx.font=`${Math.min(11,cardH*0.08|0)}px monospace`;
      ctx.fillText(m.desc,cw/2,cy2+cardH*0.75);
      // Key hint
      if(sel){ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${0.4+Math.sin(t*4)*0.2})`;ctx.font=`${Math.min(10,cardH*0.07|0)}px monospace`;
        ctx.fillText('[SPACE] Enter',cw/2,cy2+cardH*0.9);}
    });

    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
    ctx.fillText('W/S: Select  |  SPACE: Enter  |  ESC: Exit to space',cw/2,ch-15);

  // ================================================================
  // BRIDGE - NPC portraits with speech
  // ================================================================
  }else if(mi.screen==='bridge'){
    const selNPC=mi.npcs[mi.selectedItem%mi.npcs.length];
    // Back hint
    ctx.fillStyle='rgba(50,150,255,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
    ctx.fillStyle='rgba(50,150,255,0.6)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('COMMAND BRIDGE',cw/2,28);

    // Portrait in center (smaller, cleaner)
    const portSize=Math.min(cw*0.28,ch*0.4);
    const portCX=cw/2,portCY=ch*0.32;
    // Portrait frame - hexagonal feel
    ctx.fillStyle='rgba(0,8,20,0.5)';
    roundRect(ctx,portCX-portSize*0.5,portCY-portSize*0.55,portSize,portSize*1.1,12);ctx.fill();
    ctx.strokeStyle=`rgba(50,150,255,${0.15+Math.sin(t*2)*0.05})`;ctx.lineWidth=1;
    roundRect(ctx,portCX-portSize*0.5,portCY-portSize*0.55,portSize,portSize*1.1,12);ctx.stroke();
    // Subtle scan line
    const scanY2=portCY-portSize*0.55+((t*30)%(portSize*1.1));
    ctx.strokeStyle='rgba(50,200,255,0.06)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(portCX-portSize*0.45,scanY2);ctx.lineTo(portCX+portSize*0.45,scanY2);ctx.stroke();
    drawNPCPortrait(selNPC,portCX,portCY-portSize*0.05,portSize*0.65,t,mi.npcTalkAnim);

    // Speech bubble below portrait
    if(mi.npcSpeechTimer>0&&mi.npcSpeechBubble){
      const txt=mi.npcSpeechBubble;ctx.font='11px monospace';
      const maxBW=Math.min(380,cw*0.45);
      const words=txt.split(' ');let lines2=[],ln='';
      words.forEach(w=>{const test=ln?ln+' '+w:w;if(ctx.measureText(test).width>maxBW-24){lines2.push(ln);ln=w;}else ln=test;});
      if(ln)lines2.push(ln);
      const bh=lines2.length*16+14,bw=maxBW,bx=cw/2-bw/2,by=portCY+portSize*0.52;
      const ba=Math.min(1,mi.npcSpeechTimer/20);ctx.globalAlpha=ba;
      ctx.fillStyle='rgba(0,12,25,0.92)';roundRect(ctx,bx,by,bw,bh,8);ctx.fill();
      ctx.strokeStyle='rgba(50,150,255,0.35)';ctx.lineWidth=1;roundRect(ctx,bx,by,bw,bh,8);ctx.stroke();
      // Tail pointing up
      ctx.fillStyle='rgba(0,12,25,0.92)';ctx.beginPath();ctx.moveTo(cw/2-6,by);ctx.lineTo(cw/2,by-8);ctx.lineTo(cw/2+6,by);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(150,220,255,0.85)';ctx.font='11px monospace';ctx.textAlign='center';
      lines2.forEach((l,li)=>ctx.fillText(l,cw/2,by+14+li*16));ctx.globalAlpha=1;
    }

    // === NPC SELECTOR - nice cards with arrows ===
    const selY=ch-110;
    const cardW=Math.min(120,cw/5),cardH=70,cardGap=12;
    const totalW=mi.npcs.length*(cardW+cardGap)-cardGap;
    const startX=cw/2-totalW/2;

    // Left arrow
    ctx.fillStyle=`rgba(50,150,255,${0.3+Math.sin(t*3)*0.15})`;ctx.font='18px monospace';ctx.textAlign='center';
    ctx.fillText('\u25C0',startX-20,selY+cardH/2+6);
    // Right arrow
    ctx.fillText('\u25B6',startX+totalW+20,selY+cardH/2+6);

    mi.npcs.forEach((npc,i)=>{
      const sel2=mi.selectedItem%mi.npcs.length===i;
      const cx=startX+i*(cardW+cardGap);

      // Card background
      ctx.fillStyle=sel2?'rgba(15,30,50,0.7)':'rgba(8,8,18,0.5)';
      roundRect(ctx,cx,selY,cardW,cardH,8);ctx.fill();
      // Selected glow
      if(sel2){
        ctx.strokeStyle=`rgba(50,180,255,${0.5+Math.sin(t*3)*0.2})`;ctx.lineWidth=2;
        roundRect(ctx,cx,selY,cardW,cardH,8);ctx.stroke();
        // Glow behind card
        const gl=ctx.createRadialGradient(cx+cardW/2,selY+cardH/2,0,cx+cardW/2,selY+cardH/2,cardW*0.7);
        gl.addColorStop(0,'rgba(50,150,255,0.06)');gl.addColorStop(1,'transparent');
        ctx.fillStyle=gl;ctx.beginPath();ctx.arc(cx+cardW/2,selY+cardH/2,cardW*0.7,0,Math.PI*2);ctx.fill();
      }else{
        ctx.strokeStyle='rgba(50,100,150,0.1)';ctx.lineWidth=1;
        roundRect(ctx,cx,selY,cardW,cardH,8);ctx.stroke();
      }

      // Mini portrait (head only)
      const mx=cx+cardW/2,my=selY+22;
      ctx.fillStyle=npc.color;ctx.beginPath();ctx.ellipse(mx,my,10,12,0,0,Math.PI*2);ctx.fill();
      // Eyes
      ctx.fillStyle='#111';
      if(npc.id==='scientist'){
        // Single big eye
        ctx.fillStyle='#ddf';ctx.beginPath();ctx.arc(mx,my+1,5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#08a';ctx.beginPath();ctx.arc(mx,my+1,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(mx,my+1,1,2.5,0,0,Math.PI*2);ctx.fill();
      }else if(npc.id==='commander'){
        // 4 eyes
        [[-3,-2],[3,-2],[-2,2],[2,2]].forEach(([ox,oy])=>{
          ctx.fillStyle='rgba(0,0,0,0.8)';ctx.beginPath();ctx.ellipse(mx+ox,my+oy,2.5,1.5,ox<0?-0.15:0.15,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=`rgba(0,200,0,0.4)`;ctx.beginPath();ctx.arc(mx+ox,my+oy,1,0,Math.PI*2);ctx.fill();});
      }else if(npc.id==='pilot'){
        // Compound eyes
        [[-4,0],[4,0]].forEach(([ox])=>{
          const eg=ctx.createRadialGradient(mx+ox,my,0,mx+ox,my,4);eg.addColorStop(0,'#f80');eg.addColorStop(1,'#420');
          ctx.fillStyle=eg;ctx.beginPath();ctx.ellipse(mx+ox,my,4,3,0,0,Math.PI*2);ctx.fill();});
        // Antennae
        ctx.strokeStyle=npc.color;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(mx-3,my-10);ctx.lineTo(mx-5,my-16+Math.sin(t*2)*1.5);ctx.stroke();
        ctx.beginPath();ctx.moveTo(mx+3,my-10);ctx.lineTo(mx+5,my-16+Math.sin(t*2+1)*1.5);ctx.stroke();
      }else{
        // Cyborg: one normal eye, one glowing
        ctx.fillStyle='rgba(30,30,20,0.8)';ctx.beginPath();ctx.ellipse(mx-3,my,2.5,1.8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=`rgba(0,255,0,${0.5+Math.sin(t*4)*0.3})`;ctx.beginPath();ctx.arc(mx+4,my,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(mx+4,my,1,0,Math.PI*2);ctx.fill();
      }

      // Name
      ctx.fillStyle=sel2?'rgba(180,220,255,0.9)':'rgba(100,150,200,0.35)';
      ctx.font=`${sel2?'bold ':''}9px monospace`;ctx.textAlign='center';
      ctx.fillText(npc.name.split(' ')[1]||npc.name,mx,selY+cardH-18);
      // Role
      ctx.fillStyle=sel2?'rgba(100,180,255,0.5)':'rgba(80,120,160,0.2)';ctx.font='7px monospace';
      const role2=npc.id==='commander'?'Commander':npc.id==='scientist'?'Scientist':npc.id==='pilot'?'Pilot':'Engineer';
      ctx.fillText(role2,mx,selY+cardH-8);
    });

    // Hint below selector
    ctx.fillStyle='rgba(50,150,255,0.3)';ctx.font='9px monospace';ctx.textAlign='center';
    ctx.fillText('\u25C0 A/D \u25B6 Select crew   |   SPACE: Talk',cw/2,ch-22);

    // Stats sidebar
    ctx.fillStyle='rgba(50,150,255,0.4)';ctx.font='9px monospace';ctx.textAlign='right';
    const stats2=[`Score: ${score}`,`Specimens: ${mothership.specimens.length}`,`Milk: ${milkScore}`,
      `Beam Lv${upgrades.beamWidth}`,`Speed Lv${upgrades.speed}`,`Flame Lv${upgrades.flame}`];
    stats2.forEach((s,i)=>ctx.fillText(s,cw-15,55+i*16));
    if(currentMission){ctx.fillStyle='#ff0';ctx.font='8px monospace';ctx.fillText('MISSION:',cw-15,55+stats2.length*16+10);
      ctx.fillStyle='#fa0';ctx.fillText(currentMission.desc,cw-15,55+stats2.length*16+22);
      ctx.fillStyle='#0f0';ctx.fillText(`${currentMission.progress}/${currentMission.target}`,cw-15,55+stats2.length*16+34);}

  // ================================================================
  // ZOO - grouped cells: HUMANS | ALIENS | LIVESTOCK
  // ================================================================
  }else if(mi.screen==='zoo'){
    ctx.fillStyle='rgba(50,255,80,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
    ctx.fillStyle='rgba(50,255,80,0.6)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('XENOBIOLOGY ZOO',cw/2,28);
    ctx.fillStyle='rgba(50,255,80,0.3)';ctx.font='10px monospace';
    ctx.fillText(`${mi.zooCreatures.length} specimens | ${mi.milkCows.length} livestock | Milk: ${milkScore}`,cw/2,45);
    if(mi.zooAction==='feed'){ctx.fillStyle='rgba(255,200,50,0.6)';ctx.font='bold 10px monospace';ctx.fillText('FEED MODE [F to toggle]',cw/2,58);}

    // === ZOO WALK MODE ===
    if(mi.zooWalkMode && mi.zooAlien){
      const za=mi.zooAlien;
      const allCreatures=[...mi.zooCreatures,...mi.milkCows.map(c=>({...c,_isCow:true}))];
      const zooW=Math.max(400, allCreatures.length*80+200);
      const floorY=ch-50;
      // Camera follows alien
      const camX=Math.max(0,Math.min(zooW-cw, za.x-cw/2));

      // Background — spaceship interior
      ctx.fillStyle='#050a05';ctx.fillRect(0,55,cw,ch-55);
      // Floor
      const floorGrad=ctx.createLinearGradient(0,floorY,0,ch);
      floorGrad.addColorStop(0,'#1a2a1a');floorGrad.addColorStop(1,'#0a0a0a');
      ctx.fillStyle=floorGrad;ctx.fillRect(0,floorY,cw,ch-floorY);
      // Floor lines
      ctx.strokeStyle='rgba(50,255,80,0.08)';ctx.lineWidth=1;
      for(let fx=Math.floor((camX)/40)*40;fx<camX+cw+40;fx+=40){
        const sx=fx-camX;
        ctx.beginPath();ctx.moveTo(sx,floorY);ctx.lineTo(sx,ch);ctx.stroke();
      }
      // Ceiling
      ctx.fillStyle='#0a0f0a';ctx.fillRect(0,55,cw,20);
      // Enclosure dividers
      const encW=200;
      for(let ex=0;ex<zooW;ex+=encW){
        const sx=ex-camX;
        if(sx<-5||sx>cw+5)continue;
        ctx.strokeStyle='rgba(50,255,80,0.12)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(sx,75);ctx.lineTo(sx,floorY);ctx.stroke();
        // Energy field
        for(let ey=80;ey<floorY;ey+=8){
          ctx.fillStyle=`rgba(50,255,80,${0.02+Math.sin(t*3+ey*0.1)*0.01})`;
          ctx.fillRect(sx-1,ey,2,4);
        }
      }

      // Draw creatures
      allCreatures.forEach((c,i)=>{
        const cx2=(i*80+60);
        c._zooWalkX=cx2; // store for interaction
        const sx=cx2-camX;
        if(sx<-40||sx>cw+40)return;
        const py=floorY;const sz=1.5*(c.scale||c.size||1);
        const lo=Math.sin((c.walkTimer||0)*3)*2;
        const bounce=c.feedAnim>0?Math.sin(c.feedAnim*0.5)*3:0;
        if(c._isCow){
          ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(sx,py-8*sz+bounce,16*sz,10*sz,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=c.spots||'#333';ctx.beginPath();ctx.ellipse(sx-5*sz,py-11*sz+bounce,4*sz,3*sz,0.3,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(sx+14*sz,py-12*sz+bounce,6*sz,5*sz,0.2,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#111';ctx.beginPath();ctx.arc(sx+17*sz,py-14*sz+bounce,1.5*sz,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle=c.color||'#fff';ctx.lineWidth=2*sz;
          [[-10,-1],[-4,-1],[5,-1],[11,-1]].forEach(([ox])=>{ctx.beginPath();ctx.moveTo(sx+ox*sz,py-1*sz);ctx.lineTo(sx+ox*sz+(ox<0?lo:-lo),py+4*sz);ctx.stroke();});
        }else if(c.isAlien){
          ctx.fillStyle=c.color||'#8a8';ctx.fillRect(sx-3*sz,py-14*sz+bounce,6*sz,14*sz);
          ctx.fillStyle=c.skinColor||c.color||'#8a8';ctx.beginPath();ctx.ellipse(sx,py-20*sz+bounce,5*sz,6*sz,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#111';ctx.beginPath();ctx.ellipse(sx-2*sz,py-21*sz+bounce,1.5*sz,2.5*sz,0,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.ellipse(sx+2*sz,py-21*sz+bounce,1.5*sz,2.5*sz,0,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle=c.color||'#8a8';ctx.lineWidth=2*sz;
          ctx.beginPath();ctx.moveTo(sx-2*sz,py+bounce);ctx.lineTo(sx-4*sz+lo,py+8*sz);ctx.stroke();
          ctx.beginPath();ctx.moveTo(sx+2*sz,py+bounce);ctx.lineTo(sx+4*sz-lo,py+8*sz);ctx.stroke();
        }else{
          // Human — draw with stored appearance
          const skin=c.skinColor||'#c9a87c';
          const bw=(c.bodyWidth||5)*sz;
          // Legs
          ctx.strokeStyle=c.color||'#335';ctx.lineWidth=2.5*sz;
          ctx.beginPath();ctx.moveTo(sx-2*sz,py+bounce);ctx.lineTo(sx-4*sz+lo,py+10*sz);ctx.stroke();
          ctx.beginPath();ctx.moveTo(sx+2*sz,py+bounce);ctx.lineTo(sx+4*sz-lo,py+10*sz);ctx.stroke();
          // Shoes
          ctx.fillStyle='#333';
          ctx.fillRect(sx-5*sz+lo,py+9*sz,4*sz,2*sz);ctx.fillRect(sx+1*sz-lo,py+9*sz,4*sz,2*sz);
          // Body
          ctx.fillStyle=c.color||'#558';ctx.fillRect(sx-bw*0.8,py-14*sz+bounce,bw*1.6,14*sz);
          // Belt
          ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fillRect(sx-bw*0.8,py-2*sz+bounce,bw*1.6,1.5*sz);
          // Arms
          ctx.strokeStyle=skin;ctx.lineWidth=2*sz;
          ctx.beginPath();ctx.moveTo(sx-bw*0.8,py-10*sz+bounce);ctx.lineTo(sx-bw*0.8-4*sz-lo*0.5,py-5*sz+bounce);ctx.stroke();
          ctx.beginPath();ctx.moveTo(sx+bw*0.8,py-10*sz+bounce);ctx.lineTo(sx+bw*0.8+4*sz+lo*0.5,py-5*sz+bounce);ctx.stroke();
          // Head
          ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(sx,py-20*sz+bounce,4*sz,5*sz,0,0,Math.PI*2);ctx.fill();
          // Eyes
          ctx.fillStyle='#fff';
          ctx.beginPath();ctx.ellipse(sx-2*sz,py-21*sz+bounce,1.5*sz,1*sz,0,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.ellipse(sx+2*sz,py-21*sz+bounce,1.5*sz,1*sz,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#333';ctx.beginPath();ctx.arc(sx-2*sz,py-21*sz+bounce,0.7*sz,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(sx+2*sz,py-21*sz+bounce,0.7*sz,0,Math.PI*2);ctx.fill();
          // Hat
          if(c.hat==='cap'){ctx.fillStyle=c.color||'#333';ctx.fillRect(sx-5*sz,py-25*sz+bounce,10*sz,3*sz);ctx.fillRect(sx-3*sz,py-27*sz+bounce,8*sz,4*sz);}
          else if(c.hat==='straw'){ctx.fillStyle='#c0a060';ctx.fillRect(sx-6*sz,py-25*sz+bounce,12*sz,2*sz);ctx.fillRect(sx-3*sz,py-27*sz+bounce,6*sz,3*sz);}
          else if(c.hat==='feather'){ctx.fillStyle='#f44';ctx.beginPath();ctx.moveTo(sx+2*sz,py-25*sz+bounce);ctx.lineTo(sx+4*sz,py-30*sz+bounce);ctx.lineTo(sx+1*sz,py-26*sz+bounce);ctx.fill();}
          else if(c.hat==='headband'){ctx.fillStyle='#f60';ctx.fillRect(sx-4*sz,py-23*sz+bounce,8*sz,1.5*sz);}
          else if(c.hat==='collar'){ctx.fillStyle='#fff';ctx.fillRect(sx-2*sz,py-15.5*sz+bounce,4*sz,1.5*sz);}
          else if(c.hat==='bun'){ctx.fillStyle='#888';ctx.beginPath();ctx.arc(sx,py-25*sz+bounce,2.5*sz,0,Math.PI*2);ctx.fill();}
          // Extra
          if(c.extra==='backpack'){ctx.fillStyle='#864';ctx.fillRect(sx-bw-2*sz,py-12*sz+bounce,3*sz,8*sz);}
          else if(c.extra==='briefcase'){ctx.fillStyle='#543';ctx.fillRect(sx+bw+1*sz,py-4*sz+bounce,4*sz,3*sz);}
          else if(c.extra==='chain'){ctx.strokeStyle='#fd0';ctx.lineWidth=1*sz;ctx.beginPath();ctx.arc(sx,py-8*sz+bounce,3*sz,0,Math.PI);ctx.stroke();}
          else if(c.extra==='cane'){ctx.strokeStyle='#654';ctx.lineWidth=1.5*sz;ctx.beginPath();ctx.moveTo(sx+bw+2*sz,py-5*sz+bounce);ctx.lineTo(sx+bw+4*sz,py+8*sz);ctx.stroke();}
          else if(c.extra==='belly'){ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(sx,py-6*sz+bounce,bw*0.7,3*sz,0,0,Math.PI*2);ctx.fill();}
          else if(c.extra==='cross'){ctx.strokeStyle='#fd0';ctx.lineWidth=1*sz;ctx.beginPath();ctx.moveTo(sx,py-10*sz+bounce);ctx.lineTo(sx,py-6*sz+bounce);ctx.moveTo(sx-1.5*sz,py-8.5*sz+bounce);ctx.lineTo(sx+1.5*sz,py-8.5*sz+bounce);ctx.stroke();}
        }
        // Name tag
        ctx.fillStyle='rgba(50,255,80,0.4)';ctx.font='7px monospace';ctx.textAlign='center';
        ctx.fillText(c.label||'?',sx,py-25*(c.scale||c.size||1)+bounce);
      });

      // Draw player alien — full detailed model with skin
      const ax=za.x-camX, ay=za.y;
      // Shadow
      ctx.fillStyle='rgba(0,255,0,0.1)';ctx.beginPath();ctx.ellipse(ax,floorY+2,8,2,0,0,Math.PI*2);ctx.fill();
      drawAlienPreview(ax, ay, 1.0, getAlienSkin(), za.facing, za.walkTimer);

      // HUD
      ctx.fillStyle='rgba(50,255,80,0.5)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText('A/D: Walk  |  SPACE: Jump  |  E: Interact  |  X: Exit walk mode  |  ESC: Back',cw/2,ch-5);
    } else {

    // Group creatures into cells
    const humanCell=mi.zooCreatures.filter(c=>!c.isAlien);
    const alienCell=mi.zooCreatures.filter(c=>c.isAlien);
    const cowCell=mi.milkCows.map(c=>({...c,_isCow:true}));
    const cells=[];
    if(humanCell.length>0)cells.push({id:'humans',label:'HUMANS',items:humanCell,color:[80,255,120]});
    if(alienCell.length>0)cells.push({id:'aliens',label:'ALIENS',items:alienCell,color:[150,100,255]});
    if(cowCell.length>0)cells.push({id:'livestock',label:'LIVESTOCK',items:cowCell,color:[255,200,100]});
    if(cells.length===0){ctx.fillStyle='rgba(100,255,100,0.3)';ctx.font='14px monospace';ctx.textAlign='center';ctx.fillText('Empty zoo. Go abduct!',cw/2,ch/2);}

    // Detail view of individual creature
    if(mi.zooDetailView){
      const c=mi.zooDetailView;const isCow=!!c._isCow;
      ctx.fillStyle='rgba(0,5,0,0.9)';roundRect(ctx,cw*0.1,60,cw*0.8,ch-100,10);ctx.fill();
      ctx.strokeStyle=`rgba(0,255,100,${0.3+Math.sin(t*3)*0.1})`;ctx.lineWidth=2;roundRect(ctx,cw*0.1,60,cw*0.8,ch-100,10);ctx.stroke();
      const cx2=cw/2,cy2=ch*0.45,sz=3.5*(c.scale||c.size||1);
      const bounce=c.feedAnim>0?Math.sin(c.feedAnim*0.5)*4:0;const lo=Math.sin((c.walkTimer||t)*3)*4;
      if(isCow){
        ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(cx2,cy2-8*sz+bounce,28*sz,14*sz,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=c.spots||'#333';ctx.beginPath();ctx.ellipse(cx2-8*sz,cy2-12*sz+bounce,6*sz,4*sz,0.3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(cx2+22*sz,cy2-14*sz+bounce,10*sz,8*sz,0.2,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#111';ctx.beginPath();ctx.arc(cx2+26*sz,cy2-17*sz+bounce,2*sz,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=c.color||'#fff';ctx.lineWidth=3*sz;const lb=Math.sin((c.walkTimer||0)*2)*3;
        [[-15,-2],[-6,-2],[8,-2],[16,-2]].forEach(([ox])=>{ctx.beginPath();ctx.moveTo(cx2+ox*sz,cy2-2*sz);ctx.lineTo(cx2+ox*sz+(ox<0?lb:-lb),cy2+6*sz);ctx.stroke();});
      }else if(c.isAlien){
        ctx.fillStyle=c.color||'#8a8';ctx.fillRect(cx2-5*sz,cy2-16*sz+bounce,10*sz,16*sz);
        ctx.fillStyle=c.skinColor||c.color||'#8a8';ctx.beginPath();ctx.ellipse(cx2,cy2-24*sz+bounce,7*sz,9*sz,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#111';ctx.beginPath();ctx.ellipse(cx2-3*sz,cy2-25*sz+bounce,2*sz,3*sz,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx2+3*sz,cy2-25*sz+bounce,2*sz,3*sz,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=c.color||'#8a8';ctx.lineWidth=2.5*sz;
        ctx.beginPath();ctx.moveTo(cx2-3*sz,cy2+bounce);ctx.lineTo(cx2-5*sz+lo,cy2+10*sz);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx2+3*sz,cy2+bounce);ctx.lineTo(cx2+5*sz-lo,cy2+10*sz);ctx.stroke();
      }else{
        const skin=c.skinColor||'#c9a87c';
        ctx.strokeStyle=c.color||'#335';ctx.lineWidth=3*sz;
        ctx.beginPath();ctx.moveTo(cx2-3*sz,cy2+bounce);ctx.lineTo(cx2-5*sz+lo,cy2+12*sz);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx2+3*sz,cy2+bounce);ctx.lineTo(cx2+5*sz-lo,cy2+12*sz);ctx.stroke();
        ctx.fillStyle=c.color||'#558';ctx.fillRect(cx2-6*sz,cy2-18*sz+bounce,12*sz,18*sz);
        ctx.strokeStyle=skin;ctx.lineWidth=2.5*sz;
        ctx.beginPath();ctx.moveTo(cx2-6*sz,cy2-13*sz+bounce);ctx.lineTo(cx2-11*sz-lo*0.5,cy2-6*sz+bounce);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx2+6*sz,cy2-13*sz+bounce);ctx.lineTo(cx2+11*sz+lo*0.5,cy2-6*sz+bounce);ctx.stroke();
        ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(cx2,cy2-25*sz+bounce,6*sz,7*sz,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(cx2-2.5*sz,cy2-26*sz+bounce,2*sz,1.5*sz,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx2+2.5*sz,cy2-26*sz+bounce,2*sz,1.5*sz,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#333';ctx.beginPath();ctx.arc(cx2-2.5*sz,cy2-26*sz+bounce,1*sz,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(cx2+2.5*sz,cy2-26*sz+bounce,1*sz,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(cx2,cy2-31*sz+bounce,6.5*sz,3.5*sz,0,Math.PI,0);ctx.fill();
      }
      if(c.feedAnim>0){ctx.fillStyle='rgba(255,200,50,0.8)';ctx.font='bold 16px monospace';ctx.textAlign='center';ctx.fillText(c.feedAnim>15?'NOM NOM':':D',cx2,cy2-40*sz);}
      ctx.fillStyle='rgba(200,255,220,0.9)';ctx.font='bold 14px monospace';ctx.textAlign='center';
      ctx.fillText(c.label||'Creature',cw/2,ch-80);
      ctx.fillStyle='rgba(150,200,150,0.5)';ctx.font='11px monospace';
      ctx.fillText((c.planet||c.planetId||'')+'  |  '+(c.isAlien?'Alien':isCow?'Livestock':'Human'),cw/2,ch-64);
      const barW2=cw*0.4,barX2=cw*0.3;
      ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(barX2,ch-52,barW2,8);ctx.fillRect(barX2,ch-41,barW2,8);
      ctx.fillStyle='#fa0';ctx.fillRect(barX2,ch-52,barW2*(c.hunger||0)/100,8);
      ctx.fillStyle='#0af';ctx.fillRect(barX2,ch-41,barW2*(c.happiness||0)/100,8);
      ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='7px monospace';ctx.textAlign='left';
      ctx.fillText('HUNGER',barX2+2,ch-45);ctx.fillText('HAPPY',barX2+2,ch-34);
      ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText(mi.zooAction==='feed'?'SPACE: Feed  |  F: Toggle  |  ESC: Back':(isCow?'SPACE: Milk  |  ESC: Back':'SPACE: Pet  |  ESC: Back'),cw/2,ch-10);
    }else if(mi.zooInsideCell){
      // Inside a cell: list of individuals with W/S, SPACE to view detail
      const cell=mi.zooInsideCell;
      const cc=cell.color;
      ctx.fillStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},0.5)`;ctx.font='bold 14px monospace';ctx.textAlign='center';
      ctx.fillText(cell.label+` (${cell.items.length})`,cw/2,70);
      const rowH=48,listW=Math.min(cw-24,450),listX=cw/2-listW/2,listTop=82,listBot=ch-25;
      const maxVis=Math.floor((listBot-listTop)/rowH);
      if(!mi.zooScroll)mi.zooScroll=0;
      const si=mi.selectedItem%Math.max(1,cell.items.length);
      if(si<mi.zooScroll)mi.zooScroll=si;
      if(si>=mi.zooScroll+maxVis)mi.zooScroll=si-maxVis+1;
      cell.items.forEach((c,i)=>{
        if(i<mi.zooScroll||i>=mi.zooScroll+maxVis)return;
        const ry=listTop+(i-mi.zooScroll)*rowH;const sel=si===i;const isCow=!!c._isCow;
        ctx.fillStyle=sel?`rgba(${cc[0]/4|0},${cc[1]/4|0},${cc[2]/4|0},0.7)`:'rgba(5,10,5,0.4)';
        roundRect(ctx,listX,ry,listW,rowH-4,6);ctx.fill();
        if(sel){ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.4+Math.sin(t*4)*0.2})`;ctx.lineWidth=1.5;roundRect(ctx,listX,ry,listW,rowH-4,6);ctx.stroke();}
        // Mini figure
        const px=listX+22,py=ry+rowH-12,sz=1.2*(c.scale||c.size||1),lo2=Math.sin((c.walkTimer||0)*3)*2;
        if(isCow){ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(px,py-4*sz,10*sz,6*sz,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(px+9*sz,py-7*sz,4*sz,3*sz,0.2,0,Math.PI*2);ctx.fill();}
        else if(c.isAlien){ctx.fillStyle=c.color||'#8a8';ctx.fillRect(px-2.5*sz,py-9*sz,5*sz,9*sz);ctx.fillStyle=c.skinColor||c.color;ctx.beginPath();ctx.ellipse(px,py-13*sz,3*sz,4*sz,0,0,Math.PI*2);ctx.fill();}
        else{ctx.fillStyle=c.color||'#558';ctx.fillRect(px-3*sz,py-9*sz,6*sz,9*sz);ctx.fillStyle=c.skinColor||'#c9a87c';ctx.beginPath();ctx.ellipse(px,py-12.5*sz,2.8*sz,3.2*sz,0,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle=sel?'rgba(220,255,230,0.95)':'rgba(150,200,150,0.6)';ctx.font=sel?'bold 11px monospace':'11px monospace';ctx.textAlign='left';
        ctx.fillText(c.label||'?',listX+50,ry+16);
        ctx.fillStyle='rgba(150,200,150,0.35)';ctx.font='8px monospace';ctx.fillText(c.planet||c.planetId||'',listX+50,ry+28);
        // Bars
        ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fillRect(listX+50,ry+33,60,3);ctx.fillRect(listX+50,ry+37,60,3);
        ctx.fillStyle='#fa0';ctx.fillRect(listX+50,ry+33,60*(c.hunger||0)/100,3);
        ctx.fillStyle='#0af';ctx.fillRect(listX+50,ry+37,60*(c.happiness||0)/100,3);
        if(sel){ctx.fillStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.5+Math.sin(t*4)*0.3})`;ctx.font='9px monospace';ctx.textAlign='right';ctx.fillText('[SPACE] VIEW',listX+listW-8,ry+20);}
      });
      ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText('W/S: Select  |  SPACE: View  |  F: Feed mode  |  ESC: Back to cells',cw/2,ch-10);
    }else{
      // === CELL OVERVIEW: big cells stacked vertically, creatures walking inside ===
      const cellH=Math.min(130,(ch-80)/Math.max(1,cells.length)-10);
      const cellW=Math.min(cw-30,500),cellX=cw/2-cellW/2;
      const selCell=mi.selectedItem%Math.max(1,cells.length);
      cells.forEach((cell,ci)=>{
        const cy=65+ci*(cellH+10);
        const sel=selCell===ci;const cc=cell.color;
        // Cell background
        ctx.fillStyle='rgba(5,15,5,0.6)';roundRect(ctx,cellX,cy,cellW,cellH,8);ctx.fill();
        // Floor
        ctx.fillStyle='rgba(20,40,20,0.5)';ctx.fillRect(cellX+4,cy+cellH-18,cellW-8,14);
        // Border
        if(sel){ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.5+Math.sin(t*3)*0.2})`;ctx.lineWidth=2;}
        else{ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},0.1)`;ctx.lineWidth=1;}
        roundRect(ctx,cellX,cy,cellW,cellH,8);ctx.stroke();
        // Energy bars
        for(let bx2=cellX+8;bx2<cellX+cellW-8;bx2+=14){ctx.strokeStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.02+Math.sin(t*4+bx2*0.1)*0.01})`;ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(bx2,cy+2);ctx.lineTo(bx2,cy+cellH-2);ctx.stroke();}
        // Label
        ctx.fillStyle=sel?`rgba(${cc[0]},${cc[1]},${cc[2]},0.9)`:`rgba(${cc[0]},${cc[1]},${cc[2]},0.4)`;
        ctx.font=sel?'bold 12px monospace':'11px monospace';ctx.textAlign='left';
        ctx.fillText(`${cell.label} (${cell.items.length})`,cellX+10,cy+16);
        // Draw mini creatures walking inside
        const floorY=cy+cellH-20;
        cell.items.forEach((c,ci2)=>{
          const progress=((c.x||ci2*37)%260)/260;
          const px=cellX+20+progress*(cellW-40);const py=floorY;
          const sz=Math.min(1.0,cellW/350)*(c.scale||c.size||1);
          const lo2=Math.sin((c.walkTimer||0)*3)*1.5;
          if(c._isCow){
            ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(px,py-4*sz,10*sz,6*sz,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(px+8*sz,py-6*sz,3.5*sz,2.5*sz,0.2,0,Math.PI*2);ctx.fill();
          }else if(c.isAlien){
            ctx.fillStyle=c.color||'#8a8';ctx.fillRect(px-2*sz,py-8*sz,4*sz,8*sz);
            ctx.fillStyle=c.skinColor||c.color;ctx.beginPath();ctx.ellipse(px,py-11*sz,3*sz,3.5*sz,0,0,Math.PI*2);ctx.fill();
          }else{
            ctx.fillStyle=c.color||'#558';ctx.fillRect(px-2.5*sz,py-8*sz,5*sz,8*sz);
            ctx.fillStyle=c.skinColor||'#c9a87c';ctx.beginPath();ctx.ellipse(px,py-11*sz,2.5*sz,3*sz,0,0,Math.PI*2);ctx.fill();
          }
          // Legs
          ctx.strokeStyle=c._isCow?(c.color||'#fff'):(c.color||'#558');ctx.lineWidth=1*sz;
          ctx.beginPath();ctx.moveTo(px-1.5*sz,py);ctx.lineTo(px-2.5*sz+lo2,py+3.5*sz);ctx.stroke();
          ctx.beginPath();ctx.moveTo(px+1.5*sz,py);ctx.lineTo(px+2.5*sz-lo2,py+3.5*sz);ctx.stroke();
        });
        // Action hint
        if(sel){ctx.fillStyle=`rgba(${cc[0]},${cc[1]},${cc[2]},${0.5+Math.sin(t*4)*0.3})`;ctx.font='10px monospace';ctx.textAlign='right';
          ctx.fillText('[SPACE] ENTER',cellX+cellW-10,cy+16);}
      });
      ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText('W/S: Select cell  |  SPACE: Enter  |  X: Walk mode  |  F: Feed  |  ESC: Back',cw/2,ch-10);
    }
    } // end of walk mode else

  // ================================================================
  // UPGRADES
  // ================================================================
  }else if(mi.screen==='upgrades'){
    ctx.fillStyle='rgba(255,200,50,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
    ctx.fillStyle='rgba(255,200,50,0.6)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('SHIP UPGRADES',cw/2,28);
    ctx.fillStyle='rgba(255,200,50,0.3)';ctx.font='10px monospace';ctx.fillText(`Points: ${score}`,cw/2,45);
    const upgList=[
      {key:'beamWidth',name:'Tractor Beam Width',desc:'Wider beam catches more specimens',cost:10,icon:'B'},
      {key:'speed',name:'Engine Speed',desc:'Fly faster between planets',cost:10,icon:'S'},
      {key:'flame',name:'Flamethrower Power',desc:'More destruction, more terror',cost:10,icon:'F'}
    ];
    const allItems2=[...upgList.map(u=>({type:'upgrade',data:u})),...SHIP_PAINTS.map(p=>({type:'paint',data:p}))];
    const cardW=Math.min(350,cw*0.5),cardH=55;
    const visibleH=ch-80,scrollY=Math.max(0,mi.selectedItem*70-visibleH/2);
    // Section: Upgrades
    ctx.fillStyle='rgba(255,200,50,0.4)';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText('UPGRADES',cw/2-cardW/2,60);
    allItems2.forEach((item,i)=>{
      const sel=mi.selectedItem%(allItems2.length)===i;
      const cy2=65+i*(cardH+8)-scrollY;
      if(cy2<50||cy2>ch-30)return;
      if(i===upgList.length){ctx.fillStyle='rgba(200,150,255,0.4)';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText('PAINT JOBS',cw/2-cardW/2,cy2-3);}
      const cx=cw/2-cardW/2;
      if(item.type==='upgrade'){
        const u=item.data,lv=upgrades[u.key],canBuy=score>=u.cost;
        ctx.fillStyle=sel?'rgba(30,25,5,0.6)':'rgba(15,12,2,0.4)';roundRect(ctx,cx,cy2,cardW,cardH,6);ctx.fill();
        if(sel){ctx.strokeStyle=`rgba(255,200,50,${0.3+Math.sin(t*3)*0.15})`;ctx.lineWidth=1;roundRect(ctx,cx,cy2,cardW,cardH,6);ctx.stroke();}
        ctx.fillStyle='rgba(255,200,50,0.15)';ctx.beginPath();ctx.arc(cx+25,cy2+cardH/2,15,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,200,50,0.7)';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.fillText(u.icon,cx+25,cy2+cardH/2+5);
        ctx.fillStyle='rgba(255,200,50,0.12)';ctx.fillRect(cx+50,cy2+35,(cardW-65),6);
        ctx.fillStyle='rgba(255,200,50,0.45)';ctx.fillRect(cx+50,cy2+35,(cardW-65)*Math.min(1,lv/5),6);
        ctx.fillStyle=sel?'rgba(255,220,100,0.9)':'rgba(255,200,50,0.5)';ctx.font='11px monospace';ctx.textAlign='left';
        ctx.fillText(`${u.name} (Lv ${lv})`,cx+50,cy2+20);
        if(sel){ctx.fillStyle=canBuy?`rgba(255,200,50,${0.5+Math.sin(t*4)*0.3})`:'rgba(100,80,30,0.3)';ctx.font='10px monospace';ctx.textAlign='right';
          ctx.fillText(canBuy?`[SPACE] (${u.cost}pts)`:`Need ${u.cost}`,cx+cardW-8,cy2+20);}
      }else{
        const p=item.data,owned=shipPaint.name===p.id,canBuy=p.cost===0||score>=p.cost;
        ctx.fillStyle=sel?'rgba(20,15,30,0.6)':'rgba(10,8,15,0.4)';roundRect(ctx,cx,cy2,cardW,cardH,6);ctx.fill();
        if(sel){ctx.strokeStyle=`rgba(200,150,255,${0.3+Math.sin(t*3)*0.15})`;ctx.lineWidth=1;roundRect(ctx,cx,cy2,cardW,cardH,6);ctx.stroke();}
        // Mini ship preview
        ctx.fillStyle=p.accent;ctx.beginPath();ctx.ellipse(cx+25,cy2+cardH/2,18,5,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(cx+25,cy2+cardH/2-4,8,6,0,Math.PI,0);ctx.fill();
        ctx.fillStyle=p.trail;ctx.beginPath();ctx.arc(cx+15,cy2+cardH/2+1,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(cx+35,cy2+cardH/2+1,1.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=sel?'rgba(200,180,255,0.9)':'rgba(180,150,220,0.5)';ctx.font='11px monospace';ctx.textAlign='left';
        ctx.fillText(p.name,cx+50,cy2+20);
        ctx.fillStyle='rgba(150,130,200,0.35)';ctx.font='9px monospace';
        ctx.fillText(owned?'EQUIPPED':p.cost===0?'FREE':`${p.cost} pts`,cx+50,cy2+38);
        if(sel&&!owned){ctx.fillStyle=canBuy?`rgba(200,150,255,${0.5+Math.sin(t*4)*0.3})`:'rgba(80,60,100,0.3)';ctx.font='10px monospace';ctx.textAlign='right';
          ctx.fillText(canBuy?'[SPACE] EQUIP':'Not enough',cx+cardW-8,cy2+20);}
        if(owned){ctx.fillStyle='rgba(0,255,100,0.5)';ctx.font='8px monospace';ctx.textAlign='right';ctx.fillText('ACTIVE',cx+cardW-8,cy2+20);}
      }
    });
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('W/S: Select  |  SPACE: Buy/Equip  |  ESC: Back',cw/2,ch-10);

  // ================================================================
  // COMMS - Planet leader transmissions
  // ================================================================
  }else if(mi.screen==='comms'){
    ctx.fillStyle='rgba(255,100,100,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
    ctx.fillStyle='rgba(255,100,100,0.6)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('COMMS CHANNEL',cw/2,28);

    const available=planetLeaders.filter(l=>unlockedPlanets.includes(l.planetId));
    if(available.length===0){
      ctx.fillStyle='rgba(255,100,100,0.3)';ctx.font='14px monospace';ctx.textAlign='center';ctx.fillText('No transmissions available.',cw/2,ch/2);
    }else{
      const selLeader=available[mi.selectedItem%available.length];
      const talking=mi.commsTalkAnim>0?mi.commsTalkAnim:0;

      // Portrait in center (same size as bridge NPCs)
      const portSize=Math.min(cw*0.28,ch*0.4);
      const portCX=cw/2,portCY=ch*0.32;
      // Portrait frame with static/interference effect
      ctx.fillStyle='rgba(20,5,5,0.5)';
      roundRect(ctx,portCX-portSize*0.5,portCY-portSize*0.55,portSize,portSize*1.1,12);ctx.fill();
      ctx.strokeStyle=`rgba(255,80,80,${0.15+Math.sin(t*2)*0.05})`;ctx.lineWidth=1;
      roundRect(ctx,portCX-portSize*0.5,portCY-portSize*0.55,portSize,portSize*1.1,12);ctx.stroke();
      // Static scan lines
      for(let sy=portCY-portSize*0.5;sy<portCY+portSize*0.5;sy+=4){
        ctx.strokeStyle=`rgba(255,100,100,${0.02+Math.sin(t*7+sy*0.3)*0.015})`;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(portCX-portSize*0.45,sy);ctx.lineTo(portCX+portSize*0.45,sy);ctx.stroke();
      }
      // Draw leader portrait
      drawLeaderPortrait(selLeader,portCX,portCY-portSize*0.05,portSize*0.65,t,talking);

      // Speech bubble below portrait
      if(mi.commsReading){
        const txt=mi.commsReading.msg.text;ctx.font='11px monospace';
        const maxBW=Math.min(400,cw*0.5);
        const words=txt.split(' ');let lines2=[],ln='';
        words.forEach(w=>{const test=ln?ln+' '+w:w;if(ctx.measureText(test).width>maxBW-24){lines2.push(ln);ln=w;}else ln=test;});
        if(ln)lines2.push(ln);
        const bh=lines2.length*16+14,bw=maxBW,bx=cw/2-bw/2,by=portCY+portSize*0.52;
        const ba=Math.min(1,(180-mi.commsTalkAnim+30)/30);ctx.globalAlpha=Math.min(1,ba);
        ctx.fillStyle='rgba(20,5,0,0.92)';roundRect(ctx,bx,by,bw,bh,8);ctx.fill();
        ctx.strokeStyle='rgba(255,100,80,0.35)';ctx.lineWidth=1;roundRect(ctx,bx,by,bw,bh,8);ctx.stroke();
        ctx.fillStyle='rgba(20,5,0,0.92)';ctx.beginPath();ctx.moveTo(cw/2-6,by);ctx.lineTo(cw/2,by-8);ctx.lineTo(cw/2+6,by);ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(255,200,180,0.85)';ctx.font='11px monospace';ctx.textAlign='center';
        lines2.forEach((l,li)=>ctx.fillText(l,cw/2,by+14+li*16));
        // Mission accept prompt
        if(mi.commsReading&&mi.commsReading.pendingMission){
          const m=mi.commsReading.pendingMission;
          const ay=by+bh+8;
          ctx.fillStyle='rgba(0,20,0,0.9)';roundRect(ctx,cw/2-160,ay,320,36,6);ctx.fill();
          ctx.strokeStyle=`rgba(0,255,100,${0.4+Math.sin(t*4)*0.2})`;ctx.lineWidth=1;roundRect(ctx,cw/2-160,ay,320,36,6);ctx.stroke();
          ctx.fillStyle='#0f0';ctx.font='bold 11px monospace';ctx.textAlign='center';
          ctx.fillText(`[SPACE] Accept: ${m.desc} (+${m.reward}pts)`,cw/2,ay+22);
        }
        ctx.globalAlpha=1;
      }

      // Leader selector cards at bottom
      const selY=ch-110;
      const cardW=Math.min(120,cw/5),cardH=70,cardGap=12;
      const totalW=available.length*(cardW+cardGap)-cardGap;
      const startX=cw/2-totalW/2;

      ctx.fillStyle=`rgba(255,100,100,${0.3+Math.sin(t*3)*0.15})`;ctx.font='18px monospace';ctx.textAlign='center';
      ctx.fillText('\u25C0',startX-20,selY+cardH/2+6);
      ctx.fillText('\u25B6',startX+totalW+20,selY+cardH/2+6);

      available.forEach((leader,i)=>{
        const sel2=mi.selectedItem%available.length===i;
        const cx=startX+i*(cardW+cardGap);
        ctx.fillStyle=sel2?'rgba(30,10,10,0.7)':'rgba(12,5,5,0.5)';
        roundRect(ctx,cx,selY,cardW,cardH,8);ctx.fill();
        if(sel2){
          ctx.strokeStyle=`rgba(255,120,100,${0.5+Math.sin(t*3)*0.2})`;ctx.lineWidth=2;
          roundRect(ctx,cx,selY,cardW,cardH,8);ctx.stroke();
        }else{
          ctx.strokeStyle='rgba(255,80,60,0.1)';ctx.lineWidth=1;
          roundRect(ctx,cx,selY,cardW,cardH,8);ctx.stroke();
        }
        // Mini head
        const mx=cx+cardW/2,my=selY+22;
        ctx.fillStyle=leader.color;ctx.beginPath();ctx.ellipse(mx,my,10,12,0,0,Math.PI*2);ctx.fill();
        // Eyes
        ctx.fillStyle='#111';
        ctx.beginPath();ctx.ellipse(mx-3,my-1,2,1.5,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(mx+3,my-1,2,1.5,0,0,Math.PI*2);ctx.fill();
        // Name
        ctx.fillStyle=sel2?'rgba(255,200,180,0.9)':'rgba(200,120,100,0.35)';
        ctx.font=`${sel2?'bold ':''}8px monospace`;ctx.textAlign='center';
        ctx.fillText(leader.name.split(' ').pop(),mx,selY+cardH-18);
        // Planet
        ctx.fillStyle=sel2?'rgba(255,150,130,0.5)':'rgba(150,80,60,0.2)';ctx.font='7px monospace';
        ctx.fillText(leader.planetId.toUpperCase(),mx,selY+cardH-8);
        // Blinking transmission indicator
        if(sel2){const blink=Math.sin(t*5)>0?0.6:0.2;ctx.fillStyle=`rgba(255,50,50,${blink})`;ctx.beginPath();ctx.arc(cx+cardW-8,selY+8,3,0,Math.PI*2);ctx.fill();}
      });

      ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
      const commsHint=mi.commsReading?(mi.commsReading.pendingMission?'SPACE: Accept mission   |   ESC: Decline':'SPACE: Close   |   A/D: Switch'):'\u25C0 A/D \u25B6 Select contact   |   SPACE: Open channel';
      ctx.fillText(commsHint,cw/2,ch-22);
      // Show active mission warning if one exists
      if(currentMission){ctx.fillStyle='rgba(255,200,0,0.4)';ctx.font='8px monospace';ctx.fillText('Active mission: '+currentMission.desc,cw/2,ch-10);}
    }

  // ================================================================
  // STATS / SHIP LOG
  // ================================================================
  }else if(mi.screen==='stats'){
    ctx.fillStyle='rgba(150,200,150,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
    ctx.fillStyle='rgba(150,200,150,0.6)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('SHIP LOG',cw/2,28);

    const col1=cw*0.1,col2=cw*0.55;let y=55;
    ctx.fillStyle='rgba(150,200,150,0.5)';ctx.font='bold 11px monospace';ctx.textAlign='left';
    ctx.fillText('CAMPAIGN STATS',col1,y);y+=18;
    ctx.font='10px monospace';ctx.fillStyle='rgba(150,200,150,0.7)';
    const stats=[
      ['Abductions',gameStats.totalAbductions],['Buildings Destroyed',gameStats.buildingsDestroyed],
      ['Military Eliminated',gameStats.militaryKilled],['Cows Collected',gameStats.cowsCollected],
      ['Missions Completed',gameStats.missionsCompleted],['Bosses Defeated',gameStats.bossesDefeated],
      ['Time Played',Math.floor(gameStats.timePlayedFrames/3600)+'m'],['Score',score],
      ['Specimens',mothership.specimens.length],['Milk',milkScore],
    ];
    stats.forEach(([label,val])=>{
      ctx.fillStyle='rgba(150,200,150,0.4)';ctx.fillText(label+':',col1,y);
      ctx.fillStyle='rgba(150,255,150,0.8)';ctx.textAlign='right';ctx.fillText(''+val,col1+200,y);ctx.textAlign='left';
      y+=14;
    });

    // Relations
    y+=10;ctx.fillStyle='rgba(150,200,150,0.5)';ctx.font='bold 11px monospace';ctx.fillText('PLANET RELATIONS',col2,55);
    let ry=73;
    planetLeaders.forEach(l=>{
      const rel=leaderRelations[l.planetId]||0;
      const relLabel=rel>=5?'ALLY':rel>=2?'FRIENDLY':rel>=-2?'NEUTRAL':rel>=-5?'HOSTILE':'ENEMY';
      const relColor=rel>=5?'#0f0':rel>=2?'#8f8':rel>=-2?'#ff0':rel>=-5?'#f80':'#f44';
      ctx.fillStyle='rgba(150,200,150,0.4)';ctx.fillText(l.name,col2,ry);
      ctx.fillStyle=relColor;ctx.textAlign='right';ctx.fillText(relLabel+` (${rel>0?'+':''}${rel.toFixed(1)})`,col2+200,ry);ctx.textAlign='left';
      ry+=14;
    });

    // Crew levels
    ry+=10;ctx.fillStyle='rgba(150,200,150,0.5)';ctx.font='bold 11px monospace';ctx.fillText('CREW',col2,ry);ry+=18;
    ctx.font='10px monospace';
    Object.entries(crewLevels).forEach(([id,lv])=>{
      const bonus=CREW_BONUSES[id];
      ctx.fillStyle='rgba(150,200,150,0.4)';ctx.fillText(id.charAt(0).toUpperCase()+id.slice(1)+` Lv${lv}`,col2,ry);
      ctx.fillStyle='rgba(100,200,150,0.5)';ctx.fillText(bonus.desc,col2+110,ry);
      ry+=14;
    });

    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('ESC: Back',cw/2,ch-10);
  }

  // === DIALOG (bottom) ===
  if(mi.dialogTimer>0&&mi.dialogText&&mi.screen!=='bridge'){
    const dw=Math.min(450,mi.dialogText.length*8+50),dx=cw/2-dw/2,dy=ch-50;
    ctx.fillStyle='rgba(0,8,0,0.9)';roundRect(ctx,dx,dy,dw,32,6);ctx.fill();
    ctx.strokeStyle='rgba(0,200,100,0.4)';ctx.lineWidth=1;roundRect(ctx,dx,dy,dw,32,6);ctx.stroke();
    ctx.fillStyle='#0f0';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(mi.dialogText,cw/2,dy+20);
  }

  // === VIGNETTE ===
  const vig=ctx.createRadialGradient(cw/2,ch/2,ch*0.3,cw/2,ch/2,ch*0.85);
  vig.addColorStop(0,'transparent');vig.addColorStop(1,'rgba(0,0,0,0.25)');ctx.fillStyle=vig;ctx.fillRect(0,0,cw,ch);
}


function leavePlanet() {
  // Save planet state so you can return
  const leavingPlanet = currentPlanet;
  if (leavingPlanet) {
    leavingPlanet.savedState = { blocks:[...blocks], buildings:[...buildings], humans:[...humans], fires:[...fires], cows:[...cows], underwaterObjects:[...underwaterObjects], underwaterCaves:[...underwaterCaves], caveCreatures:[...caveCreatures], initialPop:initialPopulation };
    ship.x = leavingPlanet.spaceX;
    ship.y = leavingPlanet.spaceY - leavingPlanet.radius - 120;
  }
  gameMode = 'space';
  playerMode = 'ship';
  worldWidth = 6000; // reset to default
  earthMilitaryBases = [];
  ship.vx = 0; ship.vy = -2;
  saveGame(); // auto-save when leaving planet
  blocks=[]; buildings=[]; humans=[]; particles=[]; debris=[]; tears=[]; cows=[];
  speechBubbles=[]; missiles=[]; fires=[]; clouds=[]; vehicles=[]; weather=[]; hazards=[]; turrets=[]; laserShots=[]; military=[];
  underwaterCaves=[]; caveCreatures=[]; underwaterObjects=[];
  currentMission=null;missionComplete=false;missionTimer=0;
  currentPlanet = null;
  document.getElementById('planet-name').textContent=tr('hud.deepSpace');
  // Start zoom-out transition
  transition={active:true,type:'leaving',timer:0,duration:90,planet:leavingPlanet,zoom:6};
  showMessage(tr('msg.voidBetweenWorlds'));
}

function initWorld() {
  score=0; buildingsDestroyed=0; missileCooldown=0;
  upgrades={beamWidth:0,speed:0,flame:0};
  mothership={specimens:[],totalCollected:0};
  currentMission=null;missionComplete=false;missionTimer=0;
  wantedLevel=0;shipHealth=100;
  boss=null;bossIntro=null;bossKillTimer=0;bossLockdown=false;bossDefeated={};bossDefeatOverlay=null;
  genocideCount=0;respawnTimer=0;initialPopulation=30;
  initPlanetProgress();
  initSpacePlanets(); generateDeepStars();
  loadPlanet(planets[0]);
}

// --- INPUT ---
document.addEventListener('keydown', e => {
  if (mainMenuMode) { keys[e.key.toLowerCase()]=true; if(e.key==='Enter')keys['enter']=true; e.preventDefault(); return; }
  if (pauseMenu.active) { keys[e.key.toLowerCase()]=true; if(e.key==='Enter')keys['enter']=true; if(e.key==='Escape')keys['escape']=true; e.preventDefault(); return; }
  const k=e.key.toLowerCase();
  // ESC opens pause menu (not in mothership — mothership has its own ESC handling)
  if(k==='escape'&&gameStarted&&!mothershipMode){pauseMenu.active=true;pauseMenu.sel=0;pauseMenu._cool=10;e.preventDefault();keys[k]=true;return;}
  if (!keys[k]&&k==='enter'&&gameMode==='planet'&&!mothershipMode&&!pauseMenu.active) togglePlayerMode();
  if (!keys[k]&&k==='e'&&playerMode==='ship'&&!mothershipMode) repulsorBlast();
  if (!keys[k]&&k==='n'&&gameMode==='planet'&&playerMode==='ship') nukeplanet();
  if (!keys[k]&&k==='c'&&gameMode==='planet'&&playerMode==='ship'&&shipCloak.energy>10){shipCloak.active=!shipCloak.active;showMessage(shipCloak.active?'Cloak engaged':'Cloak disengaged');}
  if (!keys[k]&&k==='q'&&missileCooldown<=0&&playerMode==='ship') fireMissile();
  if (k==='g'&&playerMode==='ship')ship.minigunFiring=true;
  // Upgrades
  if(!keys[k]&&(k==='1'||k==='2'||k==='3')&&score>=10&&gameMode==='planet'){
    const cost=10;
    if(k==='1'){upgrades.beamWidth++;score-=cost;showMessage(tr('msg.beamWidened').replace('{n}',upgrades.beamWidth));}
    if(k==='2'){upgrades.speed++;score-=cost;showMessage(tr('msg.enginesUpgraded').replace('{n}',upgrades.speed));}
    if(k==='3'){upgrades.flame++;score-=cost;showMessage(tr('msg.flameEnhanced').replace('{n}',upgrades.flame));}
    document.getElementById('score').textContent=score;
  }
  if(!keys[k]&&(e.key==='F3'||k==='`'||k==='§')){_fpsShow=!_fpsShow;e.preventDefault();return;}
  if(!keys[k]&&e.key==='F4'){window._perfMode=!window._perfMode;showMessage(window._perfMode?'Performance mode ON':'Performance mode OFF');e.preventDefault();return;}
  if(!keys[k]&&k==='l'){flashlightOn=!flashlightOn;showMessage(flashlightOn?'Flashlight ON':'Flashlight OFF');return;}
  if(!keys[k]&&k==='m'){window._muted=!window._muted;
    [spaceAmbience,flameSfx,alienVoiceSfx,mothershipMusic,...Object.values(planetMusic)].forEach(a=>{a.muted=!!window._muted;});
    showMessage(window._muted?'Audio muted':'Audio unmuted');return;}
  keys[k]=true;
  if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()]=false; if(e.key==='Enter')keys['enter']=false; if(e.key.toLowerCase()==='g')ship.minigunFiring=false; });

// --- MOBILE / TOUCH CONTROLS ---
const isTouchDevice=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
let joystickActive=false, joystickId=null, joyX=0, joyY=0;
const touchBtns={};

function toggleFullscreen(){
  if(!document.fullscreenElement){
    (document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen||function(){}).call(document.documentElement);
  }else{
    (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document);
  }
}

function initTouchControls(){
  if(!isTouchDevice)return;
  document.getElementById('touch-controls').classList.add('active');
  document.getElementById('btn-fullscreen').style.display='block';

  const joyZone=document.getElementById('joystick-zone');
  const joyThumb=document.getElementById('joystick-thumb');
  const joyBase=document.getElementById('joystick-base');

  joyZone.addEventListener('touchstart',e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    joystickActive=true;joystickId=t.identifier;
    updateJoystick(t);
  },{passive:false});

  joyZone.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){if(t.identifier===joystickId)updateJoystick(t);}
  },{passive:false});

  joyZone.addEventListener('touchend',e=>{
    for(const t of e.changedTouches){
      if(t.identifier===joystickId){
        joystickActive=false;joystickId=null;joyX=0;joyY=0;
        joyThumb.style.left='55px';joyThumb.style.bottom='55px';
        keys['w']=false;keys['s']=false;keys['a']=false;keys['d']=false;
      }
    }
  });

  function updateJoystick(t){
    const rect=joyBase.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    let dx=t.clientX-cx, dy=t.clientY-cy;
    const maxR=50;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d>maxR){dx=dx/d*maxR;dy=dy/d*maxR;}
    joyX=dx/maxR; joyY=dy/maxR;
    joyThumb.style.left=(55+dx)+'px';
    joyThumb.style.bottom=(55-dy)+'px';
    // Map to keys
    const deadzone=0.2;
    keys['a']=joyX<-deadzone; keys['d']=joyX>deadzone;
    keys['w']=joyY<-deadzone; keys['s']=joyY>deadzone;
  }

  // Action buttons
  const btnMap={
    'btn-beam':' ','btn-missile':'q','btn-flame':'f',
    'btn-repulsor':'e','btn-boost':'shift'
  };
  Object.entries(btnMap).forEach(([id,key])=>{
    const el=document.getElementById(id);
    el.addEventListener('touchstart',e=>{
      e.preventDefault();
      keys[key]=true;
      el.classList.add('active');
      if(key==='q'&&missileCooldown<=0)fireMissile();
      if(key==='e')repulsorBlast();
    },{passive:false});
    el.addEventListener('touchend',e=>{
      e.preventDefault();
      keys[key]=false;
      el.classList.remove('active');
    },{passive:false});
    el.addEventListener('touchcancel',e=>{
      keys[key]=false;
      el.classList.remove('active');
    });
  });

  // Exit/enter ship button
  document.getElementById('btn-exit').addEventListener('touchstart',e=>{
    e.preventDefault();if(gameMode==='planet')togglePlayerMode();
  },{passive:false});

  // Upgrade buttons
  const upgBtns={'btn-upg1':'1','btn-upg2':'2','btn-upg3':'3'};
  Object.entries(upgBtns).forEach(([id,key])=>{
    document.getElementById(id).addEventListener('touchstart',e=>{
      e.preventDefault();
      if(score>=10&&gameMode==='planet'){
        if(key==='1'){upgrades.beamWidth++;score-=10;showMessage(tr('msg.beamWidened').replace('{n}',upgrades.beamWidth));}
        if(key==='2'){upgrades.speed++;score-=10;showMessage(tr('msg.enginesUpgraded').replace('{n}',upgrades.speed));}
        if(key==='3'){upgrades.flame++;score-=10;showMessage(tr('msg.flameEnhanced').replace('{n}',upgrades.flame));}
        document.getElementById('score').textContent=score;
      }
    },{passive:false});
  });

  // Show/hide upgrade buttons based on score
  setInterval(()=>{
    const el=document.getElementById('upgrade-btns');
    if(el)el.style.display=(score>=10&&gameMode==='planet')?'flex':'none';
  },500);

  // Prevent default touch on canvas to avoid scrolling
  canvas.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
  canvas.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
}

// Show fullscreen button and swap control hints on mobile
if(isTouchDevice){
  document.getElementById('btn-fullscreen').style.display='block';
  const kbC=document.querySelector('.kb-controls');if(kbC)kbC.style.display='none';
  const tH=document.querySelector('.touch-hint');if(tH)tH.style.display='inline';
}

// --- PHYSICS ---
function dist(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}
function constrainDist(p1x,p1y,p2x,p2y,t,st=0.5){const dx=p2x-p1x,dy=p2y-p1y,d=Math.sqrt(dx*dx+dy*dy)||0.001,diff=(d-t)/d*st;return{dx:dx*diff,dy:dy*diff};}

function repulsorBlast() {
  if(!gameStarted||gameMode==='space')return;
  triggerShake(6);playSound('blast');
  const bx=ship.x,by=ship.y+20,R=200,F=15;
  for(let i=0;i<30;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*5+2;particles.push({x:bx,y:by,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:30,color:'#f44',size:Math.random()*4+2});}
  blocks.forEach(b=>{const d=dist(bx,by,b.x+b.w/2,b.y+b.h/2);if(d<R){const f=(1-d/R)*F,a=Math.atan2(b.y+b.h/2-by,b.x+b.w/2-bx);b.fixed=false;b.vx+=Math.cos(a)*f;b.vy+=Math.sin(a)*f;b.health-=f*10;b.cracked=true;checkBuildingDestroyed(b);}});
  humans.forEach(h=>{if(h.collected)return;const d=dist(bx,by,h.bodyX,h.bodyY);if(d<R){const f=(1-d/R)*F*0.8,a=Math.atan2(h.bodyY-by,h.bodyX-bx);h.ragdoll=true;h.crying=true;h.panicLevel=10;const fx=Math.cos(a)*f,fy=Math.sin(a)*f;applyForce(h,fx,fy);bleedEffect(h,fx,fy);}});
  // Military damage from repulsor
  military.forEach(m=>{if(m.type==='bullet'||m.type==='boulder'||!m.alive)return;
    if(m.type==='guardian'&&m.shieldUp)return;
    const md=dist(bx,by,m.x,m.y-10);if(md<R){m.health-=8;
      const a=Math.atan2(m.y-by,m.x-bx),f=(1-md/R)*F*0.5;m.x+=Math.cos(a)*f;m.y+=Math.sin(a)*f;
    }});
  // Boss damage from repulsor
  if(boss&&boss.alive){const bd=dist(bx,by,boss.x,boss.y);if(bd<R+60)damageBoss(12,'repulsor');}
}

function getBleedColor(h){
  if(!h.isAlien)return '#c00'; // red for humans
  const p=currentPlanet;if(!p)return '#0f0';
  if(p.id==='glimora')return '#c0f'; // purple
  if(p.id==='ice')return '#0cf'; // icy blue
  if(p.id==='lava')return '#f80'; // molten orange
  if(p.id==='sand')return '#da0'; // golden
  if(p.id==='asteroid')return '#a4a'; // sickly purple
  return '#0f0'; // green default
}
function bleedEffect(h,fx,fy){
  const c=getBleedColor(h);
  for(let i=0;i<6;i++)particles.push({x:h.bodyX+(Math.random()-0.5)*10,y:h.bodyY+(Math.random()-0.5)*10,
    vx:fx*0.2+(Math.random()-0.5)*3,vy:fy*0.2+(Math.random()-0.5)*3,life:25+Math.random()*15,color:c,size:Math.random()*3+1});
}
function applyForce(h,fx,fy){h.headVX+=fx;h.headVY+=fy;h.bodyVX+=fx;h.bodyVY+=fy;h.legLVX+=fx*0.8;h.legLVY+=fy*0.8;h.legRVX+=fx*0.8;h.legRVY+=fy*0.8;h.armLVX+=fx*1.2;h.armLVY+=fy*1.2;h.armRVX+=fx*1.2;h.armRVY+=fy*1.2;h.footLVX+=fx*0.7;h.footLVY+=fy*0.7;h.footRVX+=fx*0.7;h.footRVY+=fy*0.7;}

function checkBuildingDestroyed(b){if(b.building && b.health<=0 && !b.building.destroyed){
  b.building.destroyed=true; b.exploding=true; b.explodeTimer=50;
  buildingsDestroyed++;gameStats.buildingsDestroyed++;
  if(currentPlanet)leaderRelations[currentPlanet.id]=Math.max(-10,(leaderRelations[currentPlanet.id]||0)-0.5);
  document.getElementById('buildings').textContent=buildingsDestroyed;showMessage(tr('msg.structureDemolished'));
  if(currentMission&&currentMission.type==='destroy'){currentMission.progress++;updateMission();}
  // Explosion debris
  triggerShake(6);
  for(let i=0;i<12;i++) debris.push({x:b.x+Math.random()*b.w,y:b.y+Math.random()*b.h,
    vx:(Math.random()-0.5)*6,vy:-Math.random()*8-2,life:50+Math.random()*30,
    size:Math.random()*5+2,color:b.color});
  for(let i=0;i<8;i++) particles.push({x:b.x+Math.random()*b.w,y:b.y+b.h*0.5+Math.random()*b.h*0.5,
    vx:(Math.random()-0.5)*4,vy:-Math.random()*4,life:30+Math.random()*20,
    color:`rgba(255,${100+Math.random()*100},0,0.7)`,size:Math.random()*8+4});
  // Release hidden inhabitants
  humans.forEach(h=>{if(h.hidden&&h.hideBuilding===b.building){h.hidden=false;h.panicLevel=8;h.crying=true;h.walkSpeed=2.5;h.walkDir=Math.random()>0.5?1:-1;h.bodyX=b.x+Math.random()*b.w;h.headX=h.bodyX;h.bodyY=GROUND_LEVEL-15;h.headY=h.bodyY-15;}});
}}

// --- SOUND FX (Web Audio) ---
let audioCtx;
function initAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();}
let _sndCount=0;
function playSound(type){
  try{if(window._muted)return;initAudio();if(!audioCtx)return;
  if(_sndCount>4)return; // max concurrent sounds
  _sndCount++;setTimeout(()=>_sndCount--,300);
  const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.connect(gain);gain.connect(audioCtx.destination);
  const now=audioCtx.currentTime;
  if(type==='missile'){osc.type='sawtooth';osc.frequency.setValueAtTime(200,now);osc.frequency.exponentialRampToValueAtTime(80,now+0.2);gain.gain.setValueAtTime(0.04,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.2);osc.start(now);osc.stop(now+0.2);}
  else if(type==='explosion'){const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.4,audioCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*5);const src=audioCtx.createBufferSource();src.buffer=buf;const g=audioCtx.createGain();g.gain.setValueAtTime(0.25,now);g.gain.exponentialRampToValueAtTime(0.01,now+0.4);src.connect(g);g.connect(audioCtx.destination);src.start(now);return;}
  else if(type==='flame'){osc.type='sawtooth';osc.frequency.setValueAtTime(100+Math.random()*50,now);gain.gain.setValueAtTime(0.04,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.1);osc.start(now);osc.stop(now+0.1);}
  else if(type==='beam'){osc.type='sine';osc.frequency.setValueAtTime(400,now);osc.frequency.setValueAtTime(600,now+0.05);gain.gain.setValueAtTime(0.03,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.15);osc.start(now);osc.stop(now+0.15);}
  else if(type==='blast'){osc.type='square';osc.frequency.setValueAtTime(150,now);osc.frequency.exponentialRampToValueAtTime(40,now+0.2);gain.gain.setValueAtTime(0.2,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.2);osc.start(now);osc.stop(now+0.2);}
  else if(type==='talk'){osc.type='sine';const f=150+Math.random()*200;osc.frequency.setValueAtTime(f,now);for(let i=0;i<6;i++)osc.frequency.setValueAtTime(f+Math.random()*100-50,now+i*0.04);gain.gain.setValueAtTime(0.06,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.25);osc.start(now);osc.stop(now+0.25);}
  else if(type==='talkDeep'){osc.type='sawtooth';const f=80+Math.random()*40;osc.frequency.setValueAtTime(f,now);for(let i=0;i<8;i++)osc.frequency.setValueAtTime(f+Math.random()*30-15,now+i*0.05);gain.gain.setValueAtTime(0.05,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.4);osc.start(now);osc.stop(now+0.4);}
  else if(type==='talkHigh'){osc.type='sine';const f=400+Math.random()*300;osc.frequency.setValueAtTime(f,now);for(let i=0;i<10;i++)osc.frequency.setValueAtTime(f+Math.random()*200-100,now+i*0.03);gain.gain.setValueAtTime(0.04,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.3);osc.start(now);osc.stop(now+0.3);}
  else if(type==='talkBuzz'){osc.type='square';const f=150+Math.random()*80;osc.frequency.setValueAtTime(f,now);for(let i=0;i<6;i++)osc.frequency.setValueAtTime(f+Math.random()*60-30,now+i*0.04);gain.gain.setValueAtTime(0.03,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.25);osc.start(now);osc.stop(now+0.25);}
  else if(type==='talkMech'){osc.type='triangle';const f=200+Math.random()*100;osc.frequency.setValueAtTime(f,now);osc.frequency.setValueAtTime(f*0.5,now+0.1);osc.frequency.setValueAtTime(f*0.8,now+0.2);gain.gain.setValueAtTime(0.04,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.3);osc.start(now);osc.stop(now+0.3);}
  else if(type==='collect'){osc.type='sine';osc.frequency.setValueAtTime(500,now);osc.frequency.exponentialRampToValueAtTime(1200,now+0.15);gain.gain.setValueAtTime(0.1,now);gain.gain.exponentialRampToValueAtTime(0.01,now+0.2);osc.start(now);osc.stop(now+0.2);}
  }catch(e){}
}
function fireMissile(){if(!gameStarted||gameMode==='space')return;missileCooldown=20;missiles.push({x:ship.x,y:ship.y+15,vx:ship.vx*0.3,vy:5,life:300,trail:[]});playSound('missile');}

function explodeMissile(m){
  const R=120,F=18;
  triggerShake(8);playSound('explosion');
  // Bright flash
  window._explosionFlashes=window._explosionFlashes||[];
  window._explosionFlashes.push({x:m.x,y:m.y,r:10,maxR:80,life:12});
  // Fire particles — multi-colored
  for(let i=0;i<50;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*9+2;
    const hue=Math.random()*60; // 0=red, 30=orange, 60=yellow
    particles.push({x:m.x,y:m.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,life:35+Math.random()*25,
      color:`hsl(${hue},100%,${50+Math.random()*30}%)`,size:Math.random()*7+2});}
  // Thick smoke — rises slowly, larger particles
  for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*2.5+0.5;
    particles.push({x:m.x+(Math.random()-0.5)*30,y:m.y+(Math.random()-0.5)*30,
      vx:Math.cos(a)*sp,vy:-1-Math.random()*1.5,life:70+Math.random()*50,
      color:`rgba(${60+Math.random()*40},${50+Math.random()*30},${40+Math.random()*20},0.6)`,size:Math.random()*10+5});}
  // Sparks — small bright fast
  for(let i=0;i<15;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*12+4;
    particles.push({x:m.x,y:m.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:15+Math.random()*10,color:'#ff8',size:1+Math.random()*2});}
  blocks.forEach(b=>{const d=dist(m.x,m.y,b.x+b.w/2,b.y+b.h/2);if(d<R){const f=(1-d/R)*F,a=Math.atan2(b.y+b.h/2-m.y,b.x+b.w/2-m.x);b.fixed=false;b.vx+=Math.cos(a)*f;b.vy+=Math.sin(a)*f;b.health-=f*15;b.cracked=true;checkBuildingDestroyed(b);}});
  humans.forEach(h=>{if(h.collected)return;const d=dist(m.x,m.y,h.bodyX,h.bodyY);if(d<R){const f=(1-d/R)*F*0.7,a=Math.atan2(h.bodyY-m.y,h.bodyX-m.x);h.ragdoll=true;h.crying=true;h.panicLevel=10;const fx=Math.cos(a)*f,fy=Math.sin(a)*f;applyForce(h,fx,fy);bleedEffect(h,fx,fy);}});
  // Cow explosion damage
  cows.forEach(c=>{if(c.collected)return;const d=dist(m.x,m.y,c.x,c.bodyY);if(d<R){
    c.collected=true;score+=1;document.getElementById('score').textContent=score;
    showMessage(`${c.label} obliterated!`);
    for(let i=0;i<20;i++)particles.push({x:c.x,y:c.bodyY,vx:(Math.random()-0.5)*8,vy:(Math.random()-0.5)*8,life:30,color:c.color||'#fff',size:Math.random()*4+2});
  }});
  // Military damage from explosion
  military.forEach(u=>{if(u.type==='bullet'||u.type==='boulder'||!u.alive)return;
    if(u.type==='guardian'&&u.shieldUp)return;
    const md=dist(m.x,m.y,u.x,u.y-10);if(md<R){u.health-=10*(1-md/R);
      const a=Math.atan2(u.y-m.y,u.x-m.x),f=(1-md/R)*F*0.3;u.x+=Math.cos(a)*f;}});
  for(let i=0;i<5;i++)fires.push({x:m.x+(Math.random()-0.5)*60,y:m.y+(Math.random()-0.5)*30,life:200+Math.random()*150,size:Math.random()*15+10});
  // Boss damage from missile
  if(boss&&boss.alive){const bd=dist(m.x,m.y,boss.x,boss.y);if(bd<R+50)damageBoss(10,'missile');}
}

function showMessage(msg){const el=document.getElementById('message');el.textContent=msg;el.style.opacity=1;messageTimer=180;}

function nukeplanet(){
  if(window._nukeCooldown>0)return;
  window._nukeCooldown=600; // 10 seconds cooldown
  const p=currentPlanet;if(!p)return;
  playSound('explosion');
  triggerShake(20);
  showMessage(`NUCLEAR LAUNCH DETECTED. ${p.name} is being sterilized...`);
  // White flash
  window._nukeFlash=60;
  // Kill all humans
  humans.forEach(h=>{if(!h.collected){h.ragdoll=true;h.crying=true;h.panicLevel=10;
    const a=Math.random()*Math.PI*2,f=8+Math.random()*10;applyForce(h,Math.cos(a)*f,Math.sin(a)*f-5);
    bleedEffect(h,Math.cos(a)*3,Math.sin(a)*3);}});
  // Kill all cows
  cows.forEach(c=>{if(!c.collected){c.collected=true;score+=1;
    for(let i=0;i<8;i++)particles.push({x:c.x,y:c.bodyY,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:25,color:c.color||'#fff',size:Math.random()*3+1});}});
  document.getElementById('score').textContent=score;
  // Destroy all buildings
  blocks.forEach(b=>{b.fixed=false;b.health=0;b.cracked=true;
    const a=Math.atan2(b.y-ship.y,b.x-ship.x),f=3+Math.random()*5;b.vx=Math.cos(a)*f;b.vy=Math.sin(a)*f-3;});
  // Kill military
  military.forEach(m=>{if(m.type!=='bullet'&&m.type!=='boulder'&&m.alive){m.health=0;}});
  // Kill vehicles
  vehicles.forEach(v=>{v.alive=false;v.exploding=40;});
  // Massive fire everywhere
  for(let i=0;i<30;i++)fires.push({x:camera.x+Math.random()*canvas.width,y:GROUND_LEVEL-Math.random()*100,life:300+Math.random()*200,size:Math.random()*20+10});
  // Massive particle burst
  for(let i=0;i<80;i++)particles.push({x:ship.x+(Math.random()-0.5)*canvas.width,y:ship.y+(Math.random()-0.5)*canvas.height,
    vx:(Math.random()-0.5)*10,vy:(Math.random()-0.5)*10,life:40+Math.random()*30,
    color:['#fff','#ff0','#f80','#f40','#f00'][Math.floor(Math.random()*5)],size:Math.random()*8+3});
  planetTerror=10;
  // Kill military
  military.forEach(m=>{m.alive=false;});
  // Destroy turrets
  turrets.forEach(t=>{t.alive=false;});
}

function togglePlayerMode(){
  if(playerMode==='ship'){
    // Check if in a dry cave — allow exit there too
    const caveCheck = isInsideCave(ship.x, ship.y);
    const inDryCave = caveCheck && caveCheck.seg.dry;
    if(!inDryCave && ship.y>GROUND_LEVEL-100) return;
    playerMode='onfoot';
    alien.x=ship.x;
    alien.y=inDryCave ? caveCheck.seg.y + caveCheck.seg.h - 10 : ship.y+30;
    alien.vx=ship.vx*0.5;
    alien.vy=0;
    alien.jetpackFuel=100;
    alien.health=100;
    alien.inCave=inDryCave;
    showMessage(inDryCave ? 'Exited ship in cave. Explore!' : tr('msg.onFoot'));
  }else{
    // Re-enter ship — must be near it
    const d=dist(alien.x,alien.y,ship.x,ship.y+20);
    if(d<80){
      playerMode='ship';
      alien.inCave=false;
      showMessage(tr('msg.backInCockpit'));
    }else{
      showMessage(tr('msg.getCloser'));
    }
  }
}

function alienShoot(){
  if(alien.shootCooldown>0)return;
  alien.shootCooldown=12;
  const dir=alien.facing;
  laserShots.push({x:alien.x+dir*10,y:alien.y-12,vx:dir*12,vy:0,life:30});
  // Muzzle flash
  for(let i=0;i<5;i++)particles.push({x:alien.x+dir*12,y:alien.y-12,vx:dir*(3+Math.random()*3),vy:(Math.random()-0.5)*2,life:10,color:'#0f0',size:Math.random()*3+1});
  triggerShake(2);
}

// ============================================================
// --- UPDATE ---
// ============================================================
function update(){
  if(!gameStarted)return;

  // Mothership interior
  if(mothershipMode){updateMothership();return;}

  // Screen shake decay
  if(screenShake.intensity>0){
    screenShake.x=(Math.random()-0.5)*screenShake.intensity*2;
    screenShake.y=(Math.random()-0.5)*screenShake.intensity*2;
    screenShake.intensity*=0.85;
    if(screenShake.intensity<0.3)screenShake.intensity=0;
  }else{screenShake.x=0;screenShake.y=0;}

  ship.lightPhase+=0.05;

  // --- ON-FOOT MODE ---
  if(playerMode==='onfoot'&&gameMode==='planet'){
    updateAlienOnFoot();
    // Ship hovers in place with slight bob
    ship.vy=Math.sin(ship.lightPhase)*0.1;ship.y+=ship.vy;
    ship.vx*=0.95;ship.x+=ship.vx;ship.tilt*=0.95;
    updatePlanetShared();
    return;
  }else{
    // Ship controls (only when in ship mode)
    const speedBonus=1+upgrades.speed*0.15+crewLevels.pilot*0.05;
    const accel=(keys['shift']?0.8:0.4)*speedBonus;
    ship.boosting=keys['shift'];
    if(keys['w']||keys['arrowup'])ship.vy-=accel;
    if(keys['s']||keys['arrowdown'])ship.vy+=accel;
    if(keys['a']||keys['arrowleft']){ship.vx-=accel;ship.tilt=Math.max(ship.tilt-0.02,-0.3);}
    else if(keys['d']||keys['arrowright']){ship.vx+=accel;ship.tilt=Math.min(ship.tilt+0.02,0.3);}
    else{ship.tilt*=0.9;}
    ship.vx*=0.96;ship.vy*=0.96;ship.x+=ship.vx;ship.y+=ship.vy;

    if(gameMode==='space'){updateSpace();return;}
  }

  updatePlanetShared();
}

function updatePlanetShared(){
  // Military + wanted level + respawn FIRST (must run in both ship and onfoot mode)
  updateWantedLevel();
  updateMilitary();
  // Genocide & respawn
  respawnTimer++;
  const livingPop=humans.filter(h=>!h.collected&&!h.hidden&&!(h.ragdoll&&!h.beingBeamed)).length;
  if(livingPop<2&&currentPlanet&&!planetProgress[currentPlanet.id].genocided){
    planetProgress[currentPlanet.id].genocided=true;
    genocideCount++;
    const gIdx=planetDefs.findIndex(d=>d.id===currentPlanet.id);
    if(gIdx<planetDefs.length-1){
      const nextId=planetDefs[gIdx+1].id;
      if(!unlockedPlanets.includes(nextId)){unlockedPlanets.push(nextId);}
      showMessage(tr('planet.'+currentPlanet.id+'.name')+' '+tr('msg.genocide')+' '+tr('planet.'+nextId+'.name')+' '+tr('msg.genocideUnlocked'));
    }else{
      showMessage(tr('planet.'+currentPlanet.id+'.name')+' '+tr('msg.genocide'));
    }
  }
  if(respawnTimer>=300&&livingPop<Math.floor(initialPopulation*0.3)&&livingPop>=2&&currentPlanet){
    respawnTimer=0;
    const px=playerMode==='onfoot'?alien.x:ship.x;
    let spawnX=Math.max(100,Math.min(worldWidth-100,px+(Math.random()>0.5?1:-1)*(200+Math.random()*300)));
    // Don't spawn in ocean
    if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(spawnX)) spawnX=Math.random()*15000+200;
    const hm=(1+getDifficultyLevel()*0.15)*Math.min(18,Math.pow(3,genocideCount));
    generateInhabitant(spawnX);
    const sc=currentPlanet?.id==='mars'?'#653':currentPlanet?.id==='glimora'?'#a6f':currentPlanet?.id==='ice'?'#8be':currentPlanet?.id==='lava'?'#f42':'#363';
    military.push({type:'soldier',x:spawnX+(Math.random()>0.5?50:-50),
      y:GROUND_LEVEL-20,vx:0,facing:1,shootTimer:0,
      health:Math.ceil(3*hm),alive:true,color:sc,gunColor:'#555'});
    military.push({type:'helicopter',x:spawnX,y:GROUND_LEVEL-400-Math.random()*200,vx:0,vy:0,
      alive:true,health:Math.ceil(8*hm),shootTimer:0,rotorAngle:0});
    showMessage(tr('msg.reinforcements'));
  }
  // Boss intro pauses gameplay
  if(updateBossIntro())return;
  // Boss update
  if(boss&&boss.alive){updateBoss();bossKillTimer++;}
  // Check mission completion before potential planet leave
  updateMission();
  // --- AUTO LEAVE PLANET ---
  if(bossLockdown){ship.y=Math.max(LEAVE_THRESHOLD,ship.y);}
  else if(ship.y<LEAVE_THRESHOLD){leavePlanet();return;}

  // Clamp on planet
  // Ship moves freely, world wraps entities around it (no camera jump)
  // Allow diving into ocean and caves

  // Block horizontal movement into solid ground when underwater/underground
  // Instead of popping to surface, prevent passing through the wall
  if(ship.y > GROUND_LEVEL) {
    const wasInOcean = isOverOcean(ship.x - ship.vx);
    const wasInCave = isInsideCave(ship.x - ship.vx, ship.y);
    const nowInOcean = isOverOcean(ship.x);
    const nowInCave = isInsideCave(ship.x, ship.y);
    if((wasInOcean || wasInCave) && !nowInOcean && !nowInCave) {
      // Moved from ocean/cave into solid ground — block horizontal movement
      ship.x -= ship.vx;
      ship.vx = 0;
    }
  }

  let shipMaxY = GROUND_LEVEL - 50;
  const caveHit = isInsideCave(ship.x, ship.y);
  // Also check slightly ahead (so you don't pop out when entering a segment)
  const caveAhead = !caveHit ? (isInsideCave(ship.x + ship.vx * 10, ship.y) || isInsideCave(ship.x, ship.y + 30) || isInsideCave(ship.x, ship.y + 60)) : null;
  if(caveHit) {
    // Inside a cave tunnel — allow movement within segment
    shipMaxY = caveHit.seg.y + caveHit.seg.h - 20;
    if(!caveHit.cave.discovered) { caveHit.cave.discovered = true; showMessage('SECRET CAVE: ' + caveHit.cave.name + ' discovered!'); }
  } else if(caveAhead) {
    // Near a cave segment — keep depth so we don't pop to surface
    shipMaxY = caveAhead.seg.y + caveAhead.seg.h - 20;
  } else if(isOverOcean(ship.x)) {
    shipMaxY = SEABED_Y + 200;
  } else if(ship.y > GROUND_LEVEL) {
    // Ship is underground but not in ocean or cave — it's in the rock/dirt under a town
    // Check if any cave segment is nearby to allow passage through solid ground
    let nearestCaveMaxY = GROUND_LEVEL - 50;
    for(const cave of underwaterCaves) {
      for(const seg of cave.segments) {
        // If ship is within reasonable range of a segment, allow staying at depth
        if(ship.x > seg.x - 80 && ship.x < seg.x + seg.w + 80 &&
           ship.y > seg.y - 60 && ship.y < seg.y + seg.h + 60) {
          nearestCaveMaxY = Math.max(nearestCaveMaxY, seg.y + seg.h - 20);
        }
      }
    }
    shipMaxY = nearestCaveMaxY;
  }
  ship.y=Math.max(LEAVE_THRESHOLD,Math.min(shipMaxY,ship.y));
  // Camera follows alien when on foot, ship otherwise
  if(playerMode==='onfoot'){
    camera.x=alien.x-canvas.width/2+screenShake.x;
    camera.y=alien.y-canvas.height/2+100+screenShake.y;
  }else{
    camera.x=ship.x-canvas.width/2+screenShake.x;
    camera.y=ship.y-canvas.height/2+screenShake.y;
  }
  // Wrap entities seamlessly around the player
  const hw=worldWidth/2,sx=playerMode==='onfoot'?alien.x:ship.x;
  for(let i=0;i<humans.length;i++){const h=humans[i];if(h.collected)continue;const d=h.bodyX-sx;
    if(d>hw||d<-hw){const w=d>hw?-worldWidth:worldWidth;h.bodyX+=w;h.headX+=w;h.legLX+=w;h.legRX+=w;h.armLX+=w;h.armRX+=w;h.footLX+=w;h.footRX+=w;}}
  for(let i=0;i<cows.length;i++){const c=cows[i];if(!c.collected){if(c.x-sx>hw)c.x-=worldWidth;else if(c.x-sx<-hw)c.x+=worldWidth;}}
  for(let i=0;i<blocks.length;i++){const b=blocks[i];if(b.x-sx>hw)b.x-=worldWidth;else if(b.x-sx<-hw)b.x+=worldWidth;}
  for(let i=0;i<vehicles.length;i++){const v=vehicles[i];if(v.x-sx>hw)v.x-=worldWidth;else if(v.x-sx<-hw)v.x+=worldWidth;}
  for(let i=0;i<fires.length;i++){const f=fires[i];if(f.x-sx>hw)f.x-=worldWidth;else if(f.x-sx<-hw)f.x+=worldWidth;}

  // Cloak
  if(shipCloak.active){
    shipCloak.energy-=shipCloak.drainRate;
    if(shipCloak.energy<=0){shipCloak.energy=0;shipCloak.active=false;showMessage('Cloak depleted!');}
  }else{shipCloak.energy=Math.min(shipCloak.maxEnergy,shipCloak.energy+shipCloak.rechargeRate);}

  // Beam
  const p=currentPlanet||planetDefs[0];
  const beamW=BEAM_WIDTH+upgrades.beamWidth*30+crewLevels.scientist*15;
  const wasBeam=ship.beamActive;
  const shipCaveHit = isInsideCave(ship.x, ship.y);
  const inCaveForBeam = !!shipCaveHit;
  ship.beamActive=keys[' ']&&playerMode==='ship'&&(ship.y<GROUND_LEVEL-60 || inCaveForBeam);
  if(ship.beamActive&&!wasBeam)playSound('beam');
  if(ship.beamActive){
    const bX=ship.x,bY=ship.y+15,tY=inCaveForBeam ? shipCaveHit.seg.y + shipCaveHit.seg.h : GROUND_LEVEL;
    for(let i=0;i<3;i++){const t=Math.random();particles.push({x:bX+(Math.random()-0.5)*30*t,y:bY+(tY-bY)*t+(Math.random()-0.5)*30*t,vx:(Math.random()-0.5)*2,vy:-Math.random()*2-1,life:20+Math.random()*10,color:`hsl(${120+Math.random()*40},100%,${60+Math.random()*30}%)`,size:Math.random()*3+1});}
    humans.forEach(h=>{if(h.collected||h.hidden)return;
      const hDist=Math.abs(h.bodyX-bX),bwH=15+(beamW/2-15)*Math.max(0,(h.bodyY-bY)/(tY-bY));
      if(hDist<bwH&&h.bodyY>bY){
        h.beingBeamed=true;h.crying=true;h.ragdoll=true;h.panicLevel=Math.min(h.panicLevel+0.15,10);
        const pull=(GRAVITY+0.15)/h.mass,ctr=(bX-h.bodyX)*0.01;
        ['head','body','legL','legR','armL','armR','footL','footR'].forEach(pt=>{h[pt+'VY']-=pull;h[pt+'VY']*=0.95;h[pt+'VX']+=ctr;h[pt+'VX']*=0.96;});
        h.cryTimer++;
        if(h.cryTimer%50===0){
          const _cp=ta('planet.'+p.id+'.cryPhrases');
          let quotes=_cp;
          const _eq=tr('planet.earth.typeQuotes.'+h.type);
          if(!h.isAlien&&Array.isArray(_eq))quotes=[..._eq,..._cp];
          speechBubbles.push({x:h.headX,y:h.headY-20,text:quotes[Math.floor(Math.random()*quotes.length)],life:90,vy:-0.5});
        }
        if(dist(bX,bY,h.headX,h.headY)<45){
          h.collected=true;
          // Combo system
          if(combo.timer>0){combo.count++;combo.best=Math.max(combo.best,combo.count);}else{combo.count=1;}
          combo.timer=120; // 2 seconds to chain
          const comboBonus=combo.count>1?combo.count:0;
          score+=Math.ceil((1+comboBonus)*(1+crewLevels.commander*0.1));
          mothership.totalCollected++;gameStats.totalAbductions++;
          if(currentPlanet)leaderRelations[currentPlanet.id]=Math.max(-10,(leaderRelations[currentPlanet.id]||0)-0.3);
          mothership.specimens.push({label:h.label,planet:p.name,planetId:p.id,color:h.color,skinColor:h.skinColor,hat:h.hat,extra:h.extra,isAlien:h.isAlien,alienHeadShape:h.alienHeadShape,alienExtra:h.alienExtra,scale:h.scale,bodyWidth:h.bodyWidth,type:h.type});playSound('collect');
          planetTerror=Math.min(planetTerror+0.5,10);
          if(currentMission&&currentMission.type==='abduct'){currentMission.progress++;updateMission();}
          document.getElementById('score').textContent=score;
          const comboText=combo.count>1?` COMBO x${combo.count}!`:'';
          const sf=ta('planet.'+p.id+'.sadFacts');showMessage(tr('msg.collected').replace('{label}',h.label)+comboText+' '+sf[Math.floor(Math.random()*sf.length)]);
          for(let i=0;i<20+comboBonus*5;i++)particles.push({x:h.headX,y:h.headY,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,life:40,color:combo.count>2?'#ff0':'#0f0',size:Math.random()*4+2});
          if(score%3===0){const sf2=ta('planet.'+p.id+'.sadFacts');document.getElementById('sad-fact').textContent=sf2[Math.floor(Math.random()*sf2.length)];}
        }
      }else{h.beingBeamed=false;}
    });
    // Beam cows too
    cows.forEach(c=>{if(c.collected)return;
      const hDist=Math.abs(c.x-bX),bwH=15+(beamW/2-15)*Math.max(0,(c.y-bY)/(tY-bY));
      if(hDist<bwH&&c.y>bY){c.beingBeamed=true;}else{c.beingBeamed=false;}
    });
    // Beam cave creatures
    caveCreatures.forEach(cc=>{if(cc.collected)return;
      const hDist=Math.abs(cc.x-bX),bwH=15+(beamW/2-15)*Math.max(0,(cc.y-bY)/Math.max(1,tY-bY));
      if(hDist<bwH&&cc.y>bY){cc.beingBeamed=true;}else{cc.beingBeamed=false;}
    });
  }else{humans.forEach(h=>{h.beingBeamed=false;});cows.forEach(c=>{c.beingBeamed=false;});caveCreatures.forEach(cc=>{cc.beingBeamed=false;});}
  // Boss mercy mode — tractor beam capture
  if(ship.beamActive&&boss&&boss.alive&&boss.mercyAvailable){
    const bd=dist(ship.x,ship.y+60,boss.x,boss.y);
    if(bd<beamW+40){
      boss.beamProgress+=0.015; // ~4 seconds of sustained beam
      boss.vy-=0.3; // pull boss up
      for(let i=0;i<3;i++)particles.push({x:boss.x+(Math.random()-0.5)*30,y:boss.y,vx:0,vy:-2,life:20,color:'#ffd700',size:Math.random()*3+2});
      if(boss.beamProgress>=1)defeatBoss(true);
    }else{boss.beamProgress=Math.max(0,boss.beamProgress-0.01);}
  }else if(boss){boss.beamProgress=Math.max(0,(boss.beamProgress||0)-0.01);}
  // Boss beam damage (non-mercy, for bosses weak to beam)
  if(ship.beamActive&&boss&&boss.alive&&!boss.mercyAvailable){
    const bd=dist(ship.x,ship.y+60,boss.x,boss.y);
    if(bd<beamW+40)damageBoss(0.15,'beam');
  }

  // Missiles
  if(missileCooldown>0)missileCooldown--;
  missiles.forEach(m=>{m.vy+=GRAVITY*0.5;m.x+=m.vx;m.y+=m.vy;m.life--;
    if(m.minigun){
      // Minigun bullet — small impact, no big explosion
      if(m.y>=GROUND_LEVEL){m.life=0;for(let i=0;i<3;i++)particles.push({x:m.x,y:GROUND_LEVEL,vx:(Math.random()-0.5)*3,vy:-Math.random()*2,life:10,color:'#aa8',size:1});}
      blocks.forEach(b=>{if(!b.dead&&m.x>b.x&&m.x<b.x+b.w&&m.y>b.y&&m.y<b.y+b.h){
        m.life=0;b.health-=8;b.cracked=true;if(!b.fixed)b.vx+=m.vx*0.05;checkBuildingDestroyed(b);
        for(let i=0;i<2;i++)debris.push({x:m.x,y:m.y,vx:(Math.random()-0.5)*3,vy:-Math.random()*2,life:20,size:1,color:b.color});
      }});
      humans.forEach(h=>{if(!h.collected&&Math.abs(m.x-h.bodyX)<10&&Math.abs(m.y-h.bodyY)<15){
        m.life=0;h.ragdoll=true;h.crying=true;h.panicLevel=10;applyForce(h,m.vx*0.5,-2);
      }});
      military.forEach(u=>{if(u.type==='bullet'||u.type==='boulder'||!u.alive)return;
        if(dist(m.x,m.y,u.x,u.y-10)<20){m.life=0;u.health-=3;}});
    }else{
      m.trail.push({x:m.x,y:m.y,life:15});m.trail=m.trail.filter(t=>{t.life--;return t.life>0;});
      if(Math.random()>0.5)particles.push({x:m.x+(Math.random()-0.5)*4,y:m.y-3,vx:(Math.random()-0.5)*1.5,vy:-Math.random()*2,life:20,color:'#888',size:Math.random()*3+1});
      if(m.y>=GROUND_LEVEL){explodeMissile(m);m.life=0;}
      blocks.forEach(b=>{if(!b.dead&&m.x>b.x&&m.x<b.x+b.w&&m.y>b.y&&m.y<b.y+b.h){explodeMissile(m);m.life=0;}});
    }
  });
  missiles=missiles.filter(m=>m.life>0);

  // Flamethrower
  const flameRange=100+upgrades.flame*30;
  const flameDmg=1.5+upgrades.flame*0.5;
  ship.flameOn=!!keys['f']&&playerMode==='ship'&&gameMode==='planet';
  if(keys['f']){
    if(!flameSfx._playing){flameSfx.currentTime=0;flameSfx.play().catch(()=>{});flameSfx._playing=true;}
    const flameSpread=12+upgrades.flame*5;
    // Flamethrower stream — directed downward cone with layered particles
    for(let i=0;i<5+upgrades.flame*2;i++){
      const age=Math.random(); // 0=fresh, 1=old
      const spread=age*flameSpread;
      const hue=age<0.3?50:age<0.6?30:age<0.8?15:0; // yellow->orange->red as it disperses
      const bright=60-age*25;
      particles.push({x:ship.x+(Math.random()-0.5)*spread,y:ship.y+18+age*40,
        vx:(Math.random()-0.5)*(1+age*2),vy:2+Math.random()*3+age*2,
        life:25+Math.random()*15,color:`hsl(${hue},100%,${bright}%)`,size:(1-age*0.3)*(Math.random()*5+3)});
    }
    // Heat distortion / smoke at base
    if(Math.random()>0.6)particles.push({x:ship.x+(Math.random()-0.5)*8,y:ship.y+15,vx:(Math.random()-0.5)*0.5,vy:1,life:15,color:'rgba(255,200,100,0.2)',size:8+Math.random()*5});
    blocks.forEach(b=>{if(b.dead)return;const d=dist(ship.x,ship.y+60,b.x+b.w/2,b.y+b.h/2);if(d<flameRange&&b.y>ship.y){b.health-=flameDmg;b.cracked=true;b.onFire=true;if(!b.fixed)b.vx+=(Math.random()-0.5)*0.5;if(Math.random()>0.95)fires.push({x:b.x+Math.random()*b.w,y:b.y+Math.random()*b.h,life:120+Math.random()*100,size:Math.random()*10+5});checkBuildingDestroyed(b);}});
    humans.forEach(h=>{if(h.collected)return;const d=dist(ship.x,ship.y+60,h.bodyX,h.bodyY);if(d<flameRange-20&&h.bodyY>ship.y){h.crying=true;h.panicLevel=Math.min(h.panicLevel+0.3,10);if(!h.ragdoll){h.walkDir=h.bodyX<ship.x?-1:1;h.walkSpeed=3;}}});
    // Flame kills cows
    cows.forEach(c=>{if(c.collected)return;const d=dist(ship.x,ship.y+60,c.x,c.bodyY);if(d<flameRange-10&&c.bodyY>ship.y){
      c.collected=true;score+=1;document.getElementById('score').textContent=score;
      showMessage(`${c.label} roasted!`);
      for(let i=0;i<15;i++)particles.push({x:c.x,y:c.bodyY,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,life:25,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*4+2});
    }});
    // Boss damage from flamethrower (per frame)
    if(boss&&boss.alive){const bd=dist(ship.x,ship.y+60,boss.x,boss.y);if(bd<flameRange+30)damageBoss(flameDmg*0.3,'flame');}
  }else if(flameSfx._playing){flameSfx.pause();flameSfx._playing=false;}

  // Minigun (hold G)
  if(ship.minigunFiring&&playerMode==='ship'&&gameMode==='planet'){
    if(!ship._mgCool)ship._mgCool=0;
    ship._mgCool--;
    if(ship._mgCool<=0){
      ship._mgCool=3; // fire every 3 frames = very fast
      const spread=(Math.random()-0.5)*0.3;
      const bvx=spread*4;const bvy=8;
      missiles.push({x:ship.x+(Math.random()-0.5)*10,y:ship.y+18,vx:bvx,vy:bvy,life:40,trail:[],minigun:true});
      triggerShake(1);
      particles.push({x:ship.x,y:ship.y+18,vx:(Math.random()-0.5)*2,vy:2,life:6,color:'#ff0',size:2});
    }
  }

  // Fires
  fires.forEach(f=>{f.life--;
    if(particles.length<150&&Math.random()>0.7)particles.push({x:f.x+(Math.random()-0.5)*f.size,y:f.y,vx:(Math.random()-0.5)*1,vy:-Math.random()*2-0.5,life:12,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*3+1});
    if(Math.random()>0.995)blocks.forEach(b=>{if(!b.dead&&Math.abs(f.x-b.x-b.w/2)<40&&Math.abs(f.y-b.y-b.h/2)<40){b.health-=0.5;b.cracked=true;b.onFire=true;}});
  });
  fires=fires.filter(f=>f.life>0);if(fires.length>50)fires.splice(0,fires.length-50);

  // Block physics
  blocks.forEach(b=>{if(b.fixed)return;b.vy+=GRAVITY;b.vx*=0.98;b.vy*=0.98;b.x+=b.vx;b.y+=b.vy;
    if(b.y+b.h>GROUND_LEVEL){b.y=GROUND_LEVEL-b.h;b.vy*=-0.3;b.vx*=0.8;if(Math.abs(b.vy)<0.5)b.vy=0;if(Math.abs(b.vy)>3){b.health-=Math.abs(b.vy)*5;for(let i=0;i<3;i++)debris.push({x:b.x+Math.random()*b.w,y:b.y+b.h,vx:(Math.random()-0.5)*3,vy:-Math.random()*3,life:40,size:Math.random()*3+1,color:b.color});}}
    if(b.y>GROUND_LEVEL+200){b.dead=true;}
    else if(b.health<=0&&!b.exploding){checkBuildingDestroyed(b);}
  });
  // Block collisions
  for(let i=0;i<blocks.length;i++){if(blocks[i].fixed||blocks[i].dead)continue;const a=blocks[i];for(let j=0;j<blocks.length;j++){if(i===j||blocks[j].dead)continue;const b=blocks[j];if(Math.abs(a.x-b.x)>60||Math.abs(a.y-b.y)>60)continue;if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y){const ox=Math.min(a.x+a.w-b.x,b.x+b.w-a.x),oy=Math.min(a.y+a.h-b.y,b.y+b.h-a.y);if(ox<oy){if(a.x<b.x){a.x-=ox/2;if(!b.fixed)b.x+=ox/2;}else{a.x+=ox/2;if(!b.fixed)b.x-=ox/2;}if(!b.fixed){b.vx+=a.vx*0.3;}a.vx*=-0.3;if(Math.abs(a.vx)>2&&b.fixed){b.fixed=false;b.vx=a.vx*0.2;b.vy=-1;}}else{if(a.y<b.y){a.y-=oy/2;if(!b.fixed)b.y+=oy/2;}else{a.y+=oy/2;if(!b.fixed)b.y-=oy/2;}if(!b.fixed)b.vy+=a.vy*0.3;a.vy*=-0.3;if(Math.abs(a.vy)>3&&b.fixed){b.fixed=false;b.vy=a.vy*0.2;}}}}}
  blocks=blocks.filter(b=>!b.dead);

  // Human/alien physics (skip far-away non-ragdoll humans for perf)
  const camCX=camera.x+canvas.width/2;
  humans.forEach(h=>{if(h.collected||h.hidden)return;
    if(!h.ragdoll&&!h.beingBeamed&&Math.abs(h.bodyX-camCX)>canvas.width)return; // skip distant idle humans
    if(h.ragdoll){
      const parts=['head','body','legL','legR','armL','armR','footL','footR'];
      parts.forEach(pt=>{if(!h.beingBeamed)h[pt+'VY']+=GRAVITY*0.8;h[pt+'VX']*=0.99;h[pt+'VY']*=0.99;h[pt+'X']+=h[pt+'VX'];h[pt+'Y']+=h[pt+'VY'];if(h[pt+'Y']>GROUND_LEVEL){h[pt+'Y']=GROUND_LEVEL;h[pt+'VY']*=-0.3;h[pt+'VX']*=0.8;}if(h[pt+'Y']<-2000){h[pt+'Y']=-2000;h[pt+'VY']*=-0.3;}});
      // Ragdoll death: if lying still on ground for ~5 sec, mark as dead
      if(!h.beingBeamed){
        const vel=Math.abs(h.headVX||0)+Math.abs(h.headVY||0)+Math.abs(h.bodyVX||0)+Math.abs(h.bodyVY||0);
        if(h.bodyY>=GROUND_LEVEL-5&&vel<1){h.ragdollTimer=(h.ragdollTimer||0)+1;if(h.ragdollTimer>420)h.collected=true;}
        else h.ragdollTimer=0;
        // Drowning — ragdoll humans that land in water sink and die
        if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(h.bodyX)&&h.bodyY>=GROUND_LEVEL-10){
          h.drownTimer=(h.drownTimer||0)+1;
          // Sink slowly
          ['head','body','legL','legR','armL','armR','footL','footR'].forEach(pt=>{
            h[pt+'VY']=Math.min(h[pt+'VY']+0.02,0.5); h[pt+'VX']*=0.95;
          });
          if(h.drownTimer===1){speechBubbles.push({x:h.headX,y:h.headY-15,text:'*splash!*',life:40,vy:-0.5});
            for(let i=0;i<6;i++)particles.push({x:h.bodyX+(Math.random()-0.5)*20,y:GROUND_LEVEL,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:20,color:'rgba(100,150,255,0.5)',size:Math.random()*3+1});}
          if(h.drownTimer>120)h.collected=true; // sunk
        }
      }
      const s=h.scale||1;const ac=(p1,p2,l)=>{const c=constrainDist(h[p1+'X'],h[p1+'Y'],h[p2+'X'],h[p2+'Y'],l,0.4);h[p1+'X']+=c.dx*0.5;h[p1+'Y']+=c.dy*0.5;h[p2+'X']-=c.dx*0.5;h[p2+'Y']-=c.dy*0.5;};
      ac('head','body',12*s);ac('body','legL',18*s);ac('body','legR',18*s);ac('body','armL',14*s);ac('body','armR',14*s);ac('legL','footL',14*s);ac('legR','footR',14*s);
      if(h.crying&&Math.random()>0.7)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY,vx:(Math.random()-0.5)*0.5,vy:Math.random()*0.5+0.5,life:40,size:Math.random()*2+1});
      blocks.forEach(b=>{if(b.dead||Math.abs(b.x-h.bodyX)>80||Math.abs(b.y-h.bodyY)>80)return;['head','body','legL','legR','footL','footR'].forEach(pt=>{const px=h[pt+'X'],py=h[pt+'Y'];if(px>b.x&&px<b.x+b.w&&py>b.y&&py<b.y+b.h){h[pt+'X']=px<b.x+b.w/2?b.x-5:b.x+b.w+5;h[pt+'VX']*=-0.5;if(!b.fixed)b.vx+=h[pt+'VX']*0.2;}});});
    }else{
      h.walkTimer++;h.idleTimer--;
      if(h.idleTimer<=0){const dS=dist(ship.x,ship.y,h.bodyX,h.bodyY);
        const terrorBonus=planetTerror*0.3;
        // Only panic when attacked: beam active, flamethrower, explosions nearby, or high terror
        const beamNear=ship.beamActive&&dS<300;
        const flameNear=ship.flameOn&&dS<250;
        const terrorClose=planetTerror>2&&dS<200+planetTerror*20;
        const shouldPanic=beamNear||flameNear||terrorClose;
        if(shouldPanic){h.panicLevel=Math.min(h.panicLevel+0.05+terrorBonus*0.02,10);h.crying=true;h.walkDir=h.bodyX<ship.x?-1:1;h.walkSpeed=1.5+h.panicLevel*0.3+terrorBonus*0.15;
          const screamChance=0.98-planetTerror*0.01;
          if(h.panicLevel>1.5&&Math.random()>screamChance)speechBubbles.push({x:h.headX,y:h.headY-20,text:ta('planet.'+p.id+'.cryPhrases')[Math.floor(Math.random()*ta('planet.'+p.id+'.cryPhrases').length)],life:70,vy:-0.3});
        }else if(planetTerror>5&&dS<400&&Math.random()>0.995){
          // Very high global terror — nearby inhabitants hear about attacks and flee
          h.panicLevel=Math.min(h.panicLevel+0.3,5);h.crying=true;h.walkDir=Math.random()>0.5?1:-1;h.walkSpeed=1+terrorBonus*0.2;
          speechBubbles.push({x:h.headX,y:h.headY-20,text:["THEY'RE HERE","RUN","HIDE","IT'S OVER"][Math.floor(Math.random()*4)],life:60,vy:-0.3});
        }else{
          h.panicLevel=Math.max(0,h.panicLevel-0.01);if(h.panicLevel<0.5)h.crying=false;
          h.behaviorTimer=(h.behaviorTimer||0)-1;
          // Behavior-driven movement
          if(h.behavior==='farming'){
            // Farmer: walk back and forth near home, occasionally stop and "work"
            if(h.behaviorTimer<=0){
              h.behaviorState=(h.behaviorState+1)%3;
              if(h.behaviorState===0){h.walkSpeed=0.3;h.walkDir=h.bodyX<h.homeX?1:-1;h.behaviorTimer=120+Math.random()*100;}
              else if(h.behaviorState===1){h.walkSpeed=0;h.behaviorTimer=80+Math.random()*120; // working
                if(Math.random()<0.3)speechBubbles.push({x:h.headX,y:h.headY-20,text:['*tills soil*','*waters crops*','*picks vegetables*','Ahh, fresh air!'][Math.floor(Math.random()*4)],life:70,vy:-0.3});}
              else{h.walkSpeed=0.3;h.walkDir=h.bodyX>h.homeX?-1:1;h.behaviorTimer=100+Math.random()*80;}
            }
            // Stay near home
            if(Math.abs(h.bodyX-h.homeX)>150){h.walkDir=h.bodyX>h.homeX?-1:1;}
          }else if(h.behavior==='commute'){
            // Commuter: walk purposefully in one direction, then turn around
            h.walkSpeed=0.6;
            if(h.behaviorTimer<=0){h.walkDir*=-1;h.behaviorTimer=300+Math.random()*400;
              if(Math.random()<0.2)speechBubbles.push({x:h.headX,y:h.headY-20,text:['Late for work!','Need coffee...','Ugh, Mondays','*checks phone*','*yawns*'][Math.floor(Math.random()*5)],life:60,vy:-0.3});}
          }else if(h.behavior==='jogging'){
            h.walkSpeed=1.5;
            if(h.behaviorTimer<=0){h.walkDir*=-1;h.behaviorTimer=200+Math.random()*200;
              if(Math.random()<0.15)speechBubbles.push({x:h.headX,y:h.headY-20,text:['*huff*','Keep going!','Almost there!','*pant pant*'][Math.floor(Math.random()*4)],life:50,vy:-0.3});}
          }else if(h.behavior==='patrol'){
            // Indigenous: patrol territory, stop to observe
            if(h.behaviorTimer<=0){
              h.behaviorState=(h.behaviorState+1)%4;
              if(h.behaviorState===2){h.walkSpeed=0;h.behaviorTimer=100+Math.random()*80;
                if(Math.random()<0.3)speechBubbles.push({x:h.headX,y:h.headY-20,text:['*observes*','*listens*','The forest speaks...','*tracks prints*'][Math.floor(Math.random()*4)],life:70,vy:-0.3});}
              else{h.walkSpeed=0.4;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=150+Math.random()*150;}
            }
            // Stay in biome roughly
            if(Math.abs(h.bodyX-h.homeX)>500){h.walkDir=h.bodyX>h.homeX?-1:1;}
          }else{
            // Varied idle behavior based on type
            if(h.behaviorTimer<=0){
              const roll=Math.random();
              if(h.type==='child'){
                // Kids: run around, play, laugh
                if(roll<0.3){h.walkSpeed=1.2;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=50+Math.random()*80;
                  if(Math.random()<0.2)speechBubbles.push({x:h.headX,y:h.headY-20,text:['Wheee!','Tag!','*giggles*','Catch me!','*plays*'][Math.floor(Math.random()*5)],life:50,vy:-0.3});}
                else{h.walkSpeed=0;h.behaviorTimer=40+Math.random()*60;}
              }else if(h.type==='old'){
                // Elderly: walk very slowly, sit often, reminisce
                if(roll<0.5){h.walkSpeed=0;h.behaviorTimer=100+Math.random()*150;
                  if(Math.random()<0.12)speechBubbles.push({x:h.headX,y:h.headY-20,text:['Ah, my back...','*sits down*','In my day...','*rests*','Nice weather...'][Math.floor(Math.random()*5)],life:80,vy:-0.3});}
                else{h.walkSpeed=0.15;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=80+Math.random()*100;}
              }else if(h.type==='businesswoman'){
                // Busy: walks fast, talks on phone
                h.walkSpeed=0.7;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=150+Math.random()*200;
                if(Math.random()<0.1)speechBubbles.push({x:h.headX,y:h.headY-20,text:['*on phone*','Yes, send the report','Meeting at 3','Buy buy buy!','*typing*'][Math.floor(Math.random()*5)],life:70,vy:-0.3});
              }else if(h.type==='priest'){
                // Priest: walks slowly, blesses things
                if(roll<0.4){h.walkSpeed=0;h.behaviorTimer=80+Math.random()*120;
                  if(Math.random()<0.15)speechBubbles.push({x:h.headX,y:h.headY-20,text:['*prays*','Bless this day','Peace be with you','*reads scripture*'][Math.floor(Math.random()*4)],life:80,vy:-0.3});}
                else{h.walkSpeed=0.2;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=120+Math.random()*150;}
              }else{
                // Generic: wander, sometimes stop and look around
                if(roll<0.25){h.walkSpeed=0;h.behaviorTimer=60+Math.random()*120;
                  if(Math.random()<0.08)speechBubbles.push({x:h.headX,y:h.headY-20,text:['Nice day...','*stretches*','Hmm...','*looks around*','*whistles*','*yawns*'][Math.floor(Math.random()*6)],life:60,vy:-0.3});}
                else{h.walkSpeed=0.3+Math.random()*0.3;h.walkDir=Math.random()>0.5?1:-1;h.behaviorTimer=100+Math.random()*200;}
              }
              // Nearby human interaction — chat with someone close
              if(h.walkSpeed===0&&Math.random()<0.05){
                const nearby=humans.find(h2=>h2!==h&&!h2.collected&&!h2.ragdoll&&Math.abs(h2.bodyX-h.bodyX)<40&&Math.abs(h2.bodyY-h.bodyY)<20);
                if(nearby){
                  const chats=['Hey!','How are you?','Nice weather','Did you see that?','*waves*','Good morning!'];
                  speechBubbles.push({x:h.headX,y:h.headY-20,text:chats[Math.floor(Math.random()*chats.length)],life:60,vy:-0.3});
                }
              }
            }
            // Stay in biome roughly
            if(Math.abs(h.bodyX-h.homeX)>500){h.walkDir=h.bodyX>h.homeX?-1:1;}
          }
        }
        const mv=h.walkDir*h.walkSpeed;h.headX+=mv;h.bodyX+=mv;h.legLX+=mv;h.legRX+=mv;h.armLX+=mv;h.armRX+=mv;h.footLX+=mv;h.footRX+=mv;
        // Prevent walking into ocean
        if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(h.bodyX)){h.walkDir*=-1;const bk=-mv*2;h.headX+=bk;h.bodyX+=bk;h.legLX+=bk;h.legRX+=bk;h.armLX+=bk;h.armRX+=bk;h.footLX+=bk;h.footRX+=bk;}}
      const s=h.scale||1;h.headY=GROUND_LEVEL-40*s;h.bodyY=GROUND_LEVEL-28*s;h.legLY=GROUND_LEVEL-10*s;h.legRY=GROUND_LEVEL-10*s;h.armLY=GROUND_LEVEL-28*s;h.armRY=GROUND_LEVEL-28*s;h.footLY=GROUND_LEVEL;h.footRY=GROUND_LEVEL;
      h.legLX=h.bodyX-4*s+Math.sin(h.walkTimer*0.1)*4*s;h.legRX=h.bodyX+4*s-Math.sin(h.walkTimer*0.1)*4*s;h.footLX=h.legLX-1+Math.sin(h.walkTimer*0.1)*5*s;h.footRX=h.legRX+1-Math.sin(h.walkTimer*0.1)*5*s;h.armLX=h.bodyX-8*s-Math.sin(h.walkTimer*0.1)*3;h.armRX=h.bodyX+8*s+Math.sin(h.walkTimer*0.1)*3;h.headX=h.bodyX;
      if(h.crying&&Math.random()>0.85)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY+3,vx:(Math.random()-0.5)*0.3,vy:0.8,life:30,size:1.5});
    }
  });

  // Cow update
  cows.forEach(c=>{
    if(c.collected)return;
    c.walkTimer++;c.mooTimer++;c.legAnim+=c.walkSpeed*0.15;c.tailAnim+=0.08;
    // Moo occasionally
    if(c.mooTimer>200+Math.random()*200){c.mooTimer=0;
      const mooPhrases=c.wack==='anubis'?['*howl*','AWOO','*growl*','...','*sniff*','BARK']:c.wack==='monkey'?['OOH OOH!','*screech*','AH AH AH!','*grunt*','EEK!','*chest beat*']:['MOO','MOOO!','moo?','*munch*','MOOOOO','brrrmoo'];
      speechBubbles.push({x:c.x,y:c.bodyY-20*c.size,text:mooPhrases[Math.floor(Math.random()*mooPhrases.length)],life:60,vy:-0.3});
    }
    if(c.beingBeamed){
      c.vy-=(GRAVITY+0.12);c.vy*=0.95;c.y+=c.vy;c.bodyY=c.y-15*c.size;
      if(c.y<ship.y+20){
        c.collected=true;
        mothership.collectedCows=mothership.collectedCows||[];
        mothership.collectedCows.push({label:c.label,color:c.color,spots:c.spots,wack:c.wack,size:c.size,planetId:c.planetId});
        gameStats.cowsCollected++;score+=2;document.getElementById('score').textContent=score;
        showMessage(`${c.label} abducted! Alien milk incoming...`);
        for(let i=0;i<15;i++)particles.push({x:c.x,y:c.y,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,life:30,color:'#fff',size:Math.random()*3+1});
      }
    }else{
      // Drowning — cows in ocean water sink and die
      if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(c.x)&&c.y>=GROUND_LEVEL-5){
        c._drownTimer=(c._drownTimer||0)+1;
        c.vy=0.3; c.y+=c.vy; c.bodyY=c.y-15*c.size;
        if(c._drownTimer===1){speechBubbles.push({x:c.x,y:c.bodyY-15,text:'*SPLASH!*',life:40,vy:-0.5});
          for(let i=0;i<8;i++)particles.push({x:c.x+(Math.random()-0.5)*25,y:GROUND_LEVEL,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:20,color:'rgba(100,150,255,0.5)',size:Math.random()*3+1});}
        if(c._drownTimer>100){c.collected=true;showMessage(`${c.label} drowned!`);}
        return; // skip normal movement
      }
      // Gravity - fall back to ground after beam release
      if(c.y<GROUND_LEVEL){
        c.vy=(c.vy||0)+GRAVITY*0.6;c.y+=c.vy;
        if(c.y>=GROUND_LEVEL){c.y=GROUND_LEVEL;c.vy=0;}
        c.bodyY=c.y-15*c.size;
      }else{
        c.vy=0;
        // Monkey behavior: eat from trees, climb, groom
        if(c.wack==='monkey'){
          c._eatTimer=(c._eatTimer||0)-1;
          if(c._eating){
            c.walkSpeed=0;c._eating--;
            if(c._eating<=0){
              if(Math.random()<0.4)speechBubbles.push({x:c.x,y:c.bodyY-20*c.size,text:['*nom nom*','*peels banana*','Mmm!','*munches fruit*','OOH banana!'][Math.floor(Math.random()*5)],life:60,vy:-0.3});
            }
          }else if(c._eatTimer<=0){
            // Check for nearby tree
            const nearTree=blocks.find(b=>b.isTree&&!b.dead&&Math.abs(b.x-c.x)<60);
            if(nearTree&&Math.random()<0.3){
              c._eating=100+Math.random()*120;c.walkSpeed=0;
              speechBubbles.push({x:c.x,y:c.bodyY-20*c.size,text:['*grabs fruit*','*climbs tree*','*picks banana*'][Math.floor(Math.random()*3)],life:50,vy:-0.3});
            }else{
              c._eatTimer=80+Math.random()*150;
            }
          }
          if(!c._eating){
            c.x+=c.walkDir*c.walkSpeed;
            // Stay within jungle biome (dynamic)
            const _jg=earthBiomes.find(b=>b.id==='jungle');
            const _jMin=_jg?_jg.from+100:10100, _jMax=_jg?_jg.to-100:13400;
            if(Math.random()>0.98){c.walkDir*=-1;c._dirCD=40;}
            if(c.x<_jMin){c.walkDir=1;c._dirCD=30;}
            else if(c.x>_jMax){c.walkDir=-1;c._dirCD=30;}
          }
        }else{
          // Normal cow walk
          c.x+=c.walkDir*c.walkSpeed;
          if(Math.random()>0.998){c.walkDir*=-1;c._dirCD=60;}
        }
        if(c.x<100){c.x=100;c.walkDir=1;c._dirCD=60;}
        else if(c.x>worldWidth-100){c.x=worldWidth-100;c.walkDir=-1;c._dirCD=60;}
        // Prevent walking into ocean
        if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(c.x)){c.x-=c.walkDir*c.walkSpeed*2;c.walkDir*=-1;c._dirCD=60;}
        if(!c._dirCD)c._dirCD=0;
        if(c._dirCD>0)c._dirCD--;
      }
      // Hovercow floats
      if(c.wack==='hover'&&c.y>=GROUND_LEVEL){c.hoverPhase+=0.05;c.bodyY=GROUND_LEVEL-15*c.size-8-Math.sin(c.hoverPhase)*5;c.y=c.bodyY+15*c.size;}
      else if(c.y>=GROUND_LEVEL){c.y=GROUND_LEVEL;c.bodyY=GROUND_LEVEL-15*c.size;}
      // Only panic when attacked (beam, flame, high terror)
      const dS=Math.abs(c.x-ship.x);
      const cowShouldPanic=(ship.beamActive&&dS<250)||(ship.flameOn&&dS<200)||(planetTerror>3&&dS<150);
      if(cowShouldPanic&&ship.y>GROUND_LEVEL-300){c.walkDir=c.x<ship.x?-1:1;c.walkSpeed=Math.min(c.walkSpeed+0.02,1.2);}
      else{c.walkSpeed=Math.max(0.2,c.walkSpeed-0.005);}
    }
  });

  // Cave creatures update
  caveCreatures.forEach(cc => {
    if(cc.collected) return;
    cc.animPhase += 0.06;
    cc.speechTimer++;
    if(cc.beingBeamed) {
      cc.vy = (cc.vy||0) - (GRAVITY + 0.12);
      cc.vy *= 0.95;
      cc.y += cc.vy;
      if(cc.y < ship.y + 20) {
        cc.collected = true;
        score += 3; document.getElementById('score').textContent = score;
        gameStats.caveCreaturesCollected = (gameStats.caveCreaturesCollected||0) + 1;
        mothership.specimens.push({label:cc.label, planet:(currentPlanet||planetDefs[0]).name, planetId:(currentPlanet||planetDefs[0]).id, color:cc.color, skinColor:cc.color, isCaveCreature:true, caveCreatureType:cc.type});
        showMessage(`${cc.label} captured! What IS that thing?!`);
        for(let i=0;i<12;i++) particles.push({x:cc.x,y:cc.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:25,color:cc.accent,size:Math.random()*3+1});
      }
    } else {
      // Wander within segment
      cc.x += cc.vx;
      const s = cc.seg;
      if(cc.x < s.x + 20) { cc.x = s.x + 20; cc.vx = Math.abs(cc.vx); }
      else if(cc.x > s.x + s.w - 20) { cc.x = s.x + s.w - 20; cc.vx = -Math.abs(cc.vx); }
      if(Math.random() < 0.005) cc.vx *= -1;
      cc.y = s.y + s.h - 15 * cc.size;
      // Flee from ship
      const dShip = Math.hypot(cc.x - ship.x, cc.y - ship.y);
      if(dShip < 180) {
        cc.vx = (cc.x < ship.x ? -1 : 1) * cc.speed * 2;
      }
      // Speech bubbles
      if(cc.speechTimer > 300 + Math.random() * 300) {
        cc.speechTimer = 0;
        const phrases = ['*skitter*','...','*hiss*','*click click*','*squeak*','*gurgle*','*chittering*','eee!','*drip drip*'];
        speechBubbles.push({x:cc.x, y:cc.y-15, text:phrases[Math.floor(Math.random()*phrases.length)], life:60, vy:-0.3});
      }
    }
  });

  // Particles (capped for performance)
  particles.forEach(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.life--;});particles=particles.filter(pt=>pt.life>0);
  if(particles.length>150)particles.splice(0,particles.length-150);
  debris.forEach(d=>{d.vy+=GRAVITY*0.5;d.x+=d.vx;d.y+=d.vy;d.life--;if(d.y>GROUND_LEVEL){d.y=GROUND_LEVEL;d.vy*=-0.3;d.vx*=0.8;}});debris=debris.filter(d=>d.life>0);
  if(debris.length>100)debris.splice(0,debris.length-100);
  tears.forEach(t=>{t.x+=t.vx;t.y+=t.vy;t.vy+=0.05;t.life--;});tears=tears.filter(t=>t.life>0);
  if(tears.length>80)tears.splice(0,tears.length-80);
  speechBubbles.forEach(s=>{s.y+=s.vy;s.life--;});speechBubbles=speechBubbles.filter(s=>s.life>0);if(speechBubbles.length>20)speechBubbles.splice(0,speechBubbles.length-20);
  clouds.forEach(c=>{c.x+=c.speed;if(c.x>worldWidth+200)c.x=-200;});

  // --- COMBO TIMER ---
  if(combo.timer>0){combo.timer--;if(combo.timer===0)combo.count=0;}

  // --- DAY/NIGHT CYCLE ---
  dayNightCycle=(dayNightCycle+0.00008)%1; // ~3.5 min full cycle // full cycle ~55 seconds
  dayNightBrightness=Math.max(0,Math.sin(dayNightCycle*Math.PI*2)*0.8); // 0=dark, positive=bright windows

  // --- WEATHER ---
  const wp=currentPlanet;
  if(wp){
    if(wp.id==='earth'&&Math.random()>0.88){
      // Rain
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y-10,vx:0.5,vy:8+Math.random()*4,life:80,type:'rain'});
    }
    if(wp.id==='mars'&&Math.random()>0.85){
      // Dust
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:3+Math.random()*2,vy:Math.random()-0.5,life:60,type:'dust'});
    }
    if(wp.id==='ice'&&Math.random()>0.85){
      // Snow
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y-10,vx:Math.sin(Date.now()*0.001)*0.5,vy:1+Math.random()*2,life:120,type:'snow'});
    }
    if(wp.id==='lava'&&Math.random()>0.8){
      // Embers floating up
      weather.push({x:camera.x+Math.random()*canvas.width,y:GROUND_LEVEL-Math.random()*50,vx:(Math.random()-0.5)*1.5,vy:-1-Math.random()*2,life:80,type:'ember'});
    }
    if(wp.id==='glimora'&&Math.random()>0.85){
      // Sparkles
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:(Math.random()-0.5)*0.5,vy:-0.3+Math.random()*0.6,life:60,type:'sparkle'});
    }
  }
  weather.forEach(w=>{w.x+=w.vx;w.y+=w.vy;w.life--;});
  weather=weather.filter(w=>w.life>0);if(weather.length>100)weather.splice(0,weather.length-100);

  // --- VEHICLES ---
  vehicles.forEach(v=>{
    if(!v.alive){if(v.exploding>0)v.exploding--;return;}
    v.x+=v.vx;
    // Stay in home zone, avoid ocean
    const vMin=v.homeMin||100, vMax=v.homeMax||(worldWidth-100);
    if(v.x<vMin||v.x>vMax)v.vx*=-1;
    if(currentPlanet&&currentPlanet.id==='earth'){
      // Check leading edge + small lookahead so wide buses don't drive into the surf
      const leadX = v.vx>0 ? v.x+v.w+20 : v.x-20;
      if(isOverOcean(leadX) || isOverOcean(v.x) || isOverOcean(v.x+v.w)){
        v.vx*=-1;
        // Nudge back to safe ground
        while((isOverOcean(v.x) || isOverOcean(v.x+v.w)) && v.x>0 && v.x+v.w<worldWidth){ v.x += v.vx; }
      }
    }
    // Ship collision
    if(dist(ship.x,ship.y,v.x+v.w/2,v.y)<60){
      v.alive=false;v.exploding=40;
      for(let i=0;i<25;i++)particles.push({x:v.x+v.w/2,y:v.y,vx:(Math.random()-0.5)*6,vy:-Math.random()*5,life:30,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*4+2});
      for(let i=0;i<8;i++)debris.push({x:v.x+Math.random()*v.w,y:v.y,vx:(Math.random()-0.5)*5,vy:-Math.random()*6,life:50,size:Math.random()*4+2,color:v.color});
      planetTerror=Math.min(planetTerror+0.3,10);
    }
    // Missile collision
    missiles.forEach(m=>{if(m.life>0&&m.x>v.x&&m.x<v.x+v.w&&m.y>v.y-v.h&&m.y<v.y){
      v.alive=false;v.exploding=40;explodeMissile(m);m.life=0;}});
    // Panic nearby humans
    if(planetTerror>2){const nearH=humans.filter(h=>!h.collected&&Math.abs(h.bodyX-v.x)<100);
      nearH.forEach(h=>{if(!h.ragdoll){h.walkDir=h.bodyX<v.x?-1:1;h.walkSpeed=2;}});}
  });
  vehicles=vehicles.filter(v=>v.alive||v.exploding>0);

  // --- HAZARDS ---
  hazards.forEach(hz=>{
    if(hz.type==='volcano'){
      hz.timer--;
      if(hz.timer<=0&&!hz.active){hz.active=true;hz.erupting=120;}
      if(hz.active){
        hz.erupting--;
        // Launch lava rocks
        if(particles.length<150&&Math.random()>0.8)particles.push({x:hz.x+(Math.random()-0.5)*30,y:hz.y-20,vx:(Math.random()-0.5)*4,vy:-Math.random()*8-3,life:50,color:['#f40','#f80','#fa0'][Math.floor(Math.random()*3)],size:Math.random()*5+3});
        // Damage nearby
        if(Math.random()>0.9){const d=dist(ship.x,ship.y,hz.x,hz.y);if(d<150)ship.vy-=0.5;}
        if(hz.erupting<=0){hz.active=false;hz.timer=hz.cooldown;}
      }
    }
    if(hz.type==='blizzard'){
      hz.timer--;
      if(hz.timer<=0&&!hz.active){hz.active=true;hz.timer=hz.duration;}
      if(hz.active){
        hz.timer--;
        // Wind push on ship
        if(ship.x>hz.x&&ship.x<hz.x+hz.width&&ship.y>GROUND_LEVEL-600){
          ship.vx+=0.15;ship.vy+=0.05;
          for(let i=0;i<3;i++)weather.push({x:hz.x+Math.random()*hz.width,y:camera.y+Math.random()*canvas.height,vx:5+Math.random()*3,vy:Math.random()*2,life:40,type:'snow'});
        }
        if(hz.timer<=0){hz.active=false;hz.timer=hz.cooldown;}
      }
    }
  });

  // --- TURRETS (Mars) ---
  turrets.forEach(t=>{
    if(!t.alive)return;
    t.cooldown--;
    const d=dist(ship.x,ship.y,t.x,t.y);
    if(d<t.range&&t.cooldown<=0&&ship.y<GROUND_LEVEL-80){
      t.cooldown=60+Math.random()*40;
      const a=Math.atan2(ship.y-t.y,ship.x-t.x);
      t.bullets.push({x:t.x,y:t.y-20,vx:Math.cos(a)*4,vy:Math.sin(a)*4,life:100});
    }
    t.bullets.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.life--;
      if(dist(b.x,b.y,ship.x,ship.y)<30){b.life=0;ship.vx+=b.vx*0.3;ship.vy+=b.vy*0.3;
        for(let i=0;i<10;i++)particles.push({x:ship.x,y:ship.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:20,color:'#f44',size:2});}
    });
    t.bullets=t.bullets.filter(b=>b.life>0);
    // Turret can be destroyed by missiles
    missiles.forEach(m=>{if(m.life>0&&dist(m.x,m.y,t.x,t.y)<40){t.alive=false;explodeMissile(m);m.life=0;
      showMessage(tr('msg.turretNeutralized'));}});
  });

  // --- PLANET TERROR decay ---
  planetTerror=Math.max(0,planetTerror-(0.002-getDifficultyLevel()*0.0003));
  if(window._nukeCooldown>0)window._nukeCooldown--;
  if(window._nukeFlash>0)window._nukeFlash--;

  // --- PLANET EVENTS ---
  gameStats.timePlayedFrames++;
  if(!window._eventTimer)window._eventTimer=600+Math.random()*1200;
  window._eventTimer--;
  if(window._eventTimer<=0&&gameMode==='planet'&&currentPlanet){
    window._eventTimer=1800+Math.random()*2400; // 30-70 seconds between events
    const p=currentPlanet;
    const events=[
      {name:'meteor',chance:0.25,fn:()=>{
        showMessage('METEOR SHOWER!');triggerShake(5);
        for(let i=0;i<8;i++){const mx=camera.x+Math.random()*canvas.width,my=LEAVE_THRESHOLD+Math.random()*200;
          particles.push({x:mx,y:my,vx:(Math.random()-0.5)*3,vy:3+Math.random()*4,life:80,color:'#fa0',size:Math.random()*4+3});}
        for(let i=0;i<3;i++){const mx=camera.x+Math.random()*canvas.width;
          fires.push({x:mx,y:GROUND_LEVEL-Math.random()*20,life:200+Math.random()*100,size:Math.random()*12+5});}
        blocks.forEach(b=>{if(Math.random()<0.1&&!b.dead){b.health-=20;b.cracked=true;checkBuildingDestroyed(b);}});
      }},
      {name:'festival',chance:0.2,fn:()=>{
        showMessage('The locals are celebrating!');
        humans.forEach(h=>{if(!h.collected&&!h.ragdoll){h.walkSpeed=2+Math.random();h.panicLevel=0;
          speechBubbles.push({x:h.headX,y:h.headY-20,text:['Party!','Woohoo!','Festival!','Celebrate!'][Math.floor(Math.random()*4)],life:120,vy:-0.3});}});
        for(let i=0;i<30;i++)particles.push({x:camera.x+Math.random()*canvas.width,y:GROUND_LEVEL-Math.random()*200,
          vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:120,color:['#f44','#4f4','#44f','#ff0','#f0f','#0ff'][Math.floor(Math.random()*6)],size:Math.random()*3+1});
      }},
      {name:'earthquake',chance:0.15,fn:()=>{
        if(currentPlanet&&currentPlanet.id==='earth')return; // no earthquakes on Earth
        showMessage('EARTHQUAKE!');triggerShake(12);
        blocks.forEach(b=>{if(!b.dead&&Math.random()<0.15){b.fixed=false;b.vy=-2-Math.random()*3;b.vx=(Math.random()-0.5)*4;b.health-=10;b.cracked=true;}});
        humans.forEach(h=>{if(!h.collected&&!h.ragdoll&&Math.random()<0.3){h.ragdoll=true;h.crying=true;applyForce(h,(Math.random()-0.5)*3,-2);}});
      }},
      {name:'aurora',chance:0.2,fn:()=>{
        showMessage('Aurora lights fill the sky!');
        for(let i=0;i<40;i++)particles.push({x:camera.x+Math.random()*canvas.width,y:LEAVE_THRESHOLD+Math.random()*300,
          vx:(Math.random()-0.5)*0.5,vy:-0.2,life:200+Math.random()*100,
          color:['rgba(0,255,100,0.3)','rgba(100,0,255,0.3)','rgba(0,100,255,0.3)','rgba(255,0,100,0.3)'][Math.floor(Math.random()*4)],size:Math.random()*5+2});
      }},
      {name:'windstorm',chance:0.2,fn:()=>{
        showMessage('Strong winds!');
        blocks.forEach(b=>{if(!b.fixed&&!b.dead){b.vx+=(Math.random()>0.5?3:-3);}});
        humans.forEach(h=>{if(!h.collected&&!h.ragdoll){h.bodyX+=Math.random()>0.5?30:-30;}});
        ship.vx+=(Math.random()>0.5?2:-2);
      }},
    ];
    const roll=Math.random();let cumul=0;
    for(const ev of events){cumul+=ev.chance;if(roll<cumul){ev.fn();break;}}
  }

  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
}

// --- ALIEN ON-FOOT UPDATE ---
function updateAlienOnFoot(){
  const p=currentPlanet||planetDefs[0];

  // Movement
  const walkSpeed=2.5;
  if(keys['a']||keys['arrowleft']){alien.vx-=0.5;alien.facing=-1;}
  if(keys['d']||keys['arrowright']){alien.vx+=0.5;alien.facing=1;}
  // Jump (space)
  if(keys[' ']&&alien.onGround){alien.vy=-7;alien.onGround=false;}
  // Jetpack (shift)
  if(keys['shift']&&alien.jetpackFuel>0){
    alien.vy-=0.5;alien.jetpackFuel-=0.6;
    for(let i=0;i<2;i++)particles.push({x:alien.x+(Math.random()-0.5)*6,y:alien.y+2,vx:(Math.random()-0.5)*3,vy:3+Math.random()*3,life:20,color:['#f80','#fa0','#ff0'][Math.floor(Math.random()*3)],size:Math.random()*4+2});
  }

  // Shoot (Q)
  if(keys['q'])alienShoot();
  alien.shootCooldown=Math.max(0,alien.shootCooldown-1);

  // Physics
  alien.vy+=GRAVITY*0.6;
  alien.vx*=0.85;
  alien.x+=alien.vx;alien.y+=alien.vy;

  // Cave collision for on-foot alien
  const alienCaveHit = isInsideCave(alien.x, alien.y);
  const alienCaveHitHead = isInsideCave(alien.x, alien.y - alien.h);
  alien.inCave = !!alienCaveHit;

  if(alienCaveHit) {
    const seg = alienCaveHit.seg;
    // Floor collision — stand on cave floor
    if(alien.y >= seg.y + seg.h - 4) {
      alien.y = seg.y + seg.h - 4;
      alien.vy = 0;
      alien.onGround = true;
      alien.jetpackFuel = Math.min(100, alien.jetpackFuel + 0.3);
    } else { alien.onGround = false; }
    // Ceiling collision
    if(alien.y - alien.h <= seg.y + 5 && alien.vy < 0) {
      alien.y = seg.y + alien.h + 5;
      alien.vy = 0;
    }
    // Wall collision — don't walk out of segment unless there's an adjacent segment
    const nextX = alien.x + alien.vx;
    const nextCave = isInsideCave(nextX, alien.y);
    if(!nextCave && alien.x > seg.x + 10 && alien.x < seg.x + seg.w - 10) {
      // Still inside but heading out — check if going left or right
      if(nextX <= seg.x + 5) { alien.x = seg.x + 6; alien.vx = 0; }
      else if(nextX >= seg.x + seg.w - 5) { alien.x = seg.x + seg.w - 6; alien.vx = 0; }
    } else if(!nextCave) {
      // At the edge — block
      alien.x -= alien.vx; alien.vx = 0;
    }
  } else {
    // Normal ground collision (surface)
    if(alien.y>=GROUND_LEVEL-2){alien.y=GROUND_LEVEL-2;alien.vy=0;alien.onGround=true;alien.jetpackFuel=Math.min(100,alien.jetpackFuel+0.3);}
    else{alien.onGround=false;}
  }

  // Keep alien in bounds
  alien.y=Math.max(LEAVE_THRESHOLD+100,alien.y);

  // Block collision (surface only)
  if(!alienCaveHit) {
    blocks.forEach(b=>{
      if(b.dead)return;
      if(alien.x+alien.w/2>b.x&&alien.x-alien.w/2<b.x+b.w&&alien.y>b.y&&alien.y-alien.h<b.y+b.h){
        // Stand on top
        if(alien.vy>0&&alien.y-alien.vy<=b.y+2){alien.y=b.y;alien.vy=0;alien.onGround=true;alien.jetpackFuel=Math.min(100,alien.jetpackFuel+0.3);}
        // Hit from side
        else{alien.x+=(alien.x<b.x+b.w/2?-2:2);alien.vx*=-0.3;}
      }
    });
  }

  // Alien-human collision (can't walk through people)
  humans.forEach(h=>{
    if(h.collected||h.hidden||h.ragdoll||h.beingBeamed)return;
    const dx=alien.x-h.bodyX,dy=alien.y-h.bodyY;
    if(Math.abs(dx)<15&&Math.abs(dy)<30){
      const push=dx<0?-1.5:1.5;
      alien.x+=push;alien.vx+=push*0.3;
      h.panicLevel=Math.min(h.panicLevel+0.5,10);h.crying=true;
    }
  });

  // Walk animation
  if(Math.abs(alien.vx)>0.3&&alien.onGround)alien.walkTimer+=0.15;

  // Camera follows alien
  camera.x=alien.x-canvas.width/2+screenShake.x;
  camera.y=alien.y-canvas.height/2+100+screenShake.y;

  // Laser shots
  laserShots.forEach(ls=>{
    ls.x+=ls.vx;ls.y+=ls.vy;ls.life--;
    // Hit inhabitants
    humans.forEach(h=>{
      if(h.collected)return;
      if(Math.abs(ls.x-h.bodyX)<15&&Math.abs(ls.y-h.bodyY)<20){
        ls.life=0;
        h.ragdoll=true;h.crying=true;h.panicLevel=10;
        const knockF=6*Math.sign(ls.vx);
        applyForce(h,knockF,-3);
        // Blood/spark
        const bleedColor=h.isAlien?(p.id==='glimora'?'#c0f':p.id==='ice'?'#0cf':p.id==='lava'?'#f80':p.id==='sand'?'#da0':p.id==='asteroid'?'#a4a':'#0f0'):'#c00';
        for(let i=0;i<8;i++)particles.push({x:h.bodyX,y:h.bodyY,vx:(Math.random()-0.5)*4+knockF*0.3,vy:(Math.random()-0.5)*4,life:25,color:bleedColor,size:Math.random()*3+1});
        triggerShake(3);
        planetTerror=Math.min(planetTerror+0.2,10);
        speechBubbles.push({x:h.headX,y:h.headY-20,text:ta('planet.'+p.id+'.cryPhrases')[Math.floor(Math.random()*ta('planet.'+p.id+'.cryPhrases').length)],life:60,vy:-0.4});
      }
    });
    // Hit blocks
    blocks.forEach(b=>{
      if(b.dead)return;
      if(ls.x>b.x&&ls.x<b.x+b.w&&ls.y>b.y&&ls.y<b.y+b.h){
        ls.life=0;b.health-=15;b.cracked=true;
        if(!b.fixed){b.vx+=ls.vx*0.1;}
        for(let i=0;i<4;i++)debris.push({x:ls.x,y:ls.y,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:30,size:Math.random()*2+1,color:b.color});
        checkBuildingDestroyed(b);
      }
    });
  });
  laserShots=laserShots.filter(ls=>ls.life>0);

  // Inhabitants react to alien on foot
  humans.forEach(h=>{
    if(h.collected||h.ragdoll)return;
    const d=dist(alien.x,alien.y,h.bodyX,h.bodyY);
    if(d<200){
      h.panicLevel=Math.min(h.panicLevel+0.08,8);h.crying=true;
      h.walkDir=h.bodyX<alien.x?-1:1;
      h.walkSpeed=1.8+h.panicLevel*0.2;
    }
  });

  // Update all the planet stuff (weather, vehicles, hazards, etc.)
  updatePlanetSystems();
}

function updatePlanetSystems(){
  const p=currentPlanet||planetDefs[0];

  // Combo timer
  if(combo.timer>0){combo.timer--;if(combo.timer===0)combo.count=0;}

  // Day/night
  dayNightCycle=(dayNightCycle+0.00008)%1; // ~3.5 min full cycle
  dayNightBrightness=Math.max(0,Math.sin(dayNightCycle*Math.PI*2)*0.8);

  // Weather
  if(p){
    if(p.id==='earth'&&Math.random()>0.7){
      const wx=camera.x+Math.random()*canvas.width;
      const wb=getEarthBiome(wx);
      if(wb.id==='desert'){
        // Desert: sandstorm particles
        if(Math.random()>0.5)weather.push({x:wx,y:camera.y+Math.random()*canvas.height,vx:2+Math.random()*3,vy:Math.random()-0.3,life:50,type:'dust'});
      }else if(wb.id==='mountains'){
        // Mountains: occasional snow + wind
        if(Math.random()>0.4)weather.push({x:wx,y:camera.y-10,vx:Math.sin(Date.now()*0.001)*1,vy:1.5+Math.random()*2,life:100,type:'snow'});
      }else if(!wb.isOcean){
        // Rain for non-desert, non-ocean biomes
        weather.push({x:wx,y:camera.y-10,vx:0.5,vy:8+Math.random()*4,life:80,type:'rain'});
      }
    }
    if(p.id==='mars'&&Math.random()>0.85)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:3+Math.random()*2,vy:Math.random()-0.5,life:60,type:'dust'});
    if(p.id==='ice'&&Math.random()>0.6)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y-10,vx:Math.sin(Date.now()*0.001)*0.5,vy:1+Math.random()*2,life:120,type:'snow'});
    if(p.id==='lava'&&Math.random()>0.8)weather.push({x:camera.x+Math.random()*canvas.width,y:GROUND_LEVEL-Math.random()*50,vx:(Math.random()-0.5)*1.5,vy:-1-Math.random()*2,life:80,type:'ember'});
    if(p.id==='glimora'&&Math.random()>0.85)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:(Math.random()-0.5)*0.5,vy:-0.3+Math.random()*0.6,life:60,type:'sparkle'});
    if(p.id==='sand'&&Math.random()>0.7)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:2+Math.random()*3,vy:Math.random()-0.3,life:70,type:'dust'});
    // Underwater bubbles when submerged
    if(p.id==='earth'&&isOverOcean(ship.x)&&ship.y>GROUND_LEVEL&&Math.random()>0.5){
      weather.push({x:ship.x+(Math.random()-0.5)*60,y:ship.y+20,vx:(Math.random()-0.5)*0.5,vy:-1.5-Math.random()*2,life:60+Math.random()*40,type:'bubble'});
    }
  }
  weather.forEach(w=>{w.x+=w.vx;w.y+=w.vy;w.life--;});
  weather=weather.filter(w=>w.life>0);if(weather.length>100)weather.splice(0,weather.length-100);

  // Vehicles
  vehicles.forEach(v=>{
    if(!v.alive){if(v.exploding>0)v.exploding--;return;}
    v.x+=v.vx;if(v.x<100||v.x>worldWidth-100)v.vx*=-1;
  });
  vehicles=vehicles.filter(v=>v.alive||v.exploding>0);

  // Hazards
  hazards.forEach(hz=>{
    if(hz.type==='volcano'){hz.timer--;if(hz.timer<=0&&!hz.active){hz.active=true;hz.erupting=120;}
      if(hz.active){hz.erupting--;if(Math.random()>0.6)particles.push({x:hz.x+(Math.random()-0.5)*30,y:hz.y-20,vx:(Math.random()-0.5)*4,vy:-Math.random()*8-3,life:50,color:['#f40','#f80','#fa0'][Math.floor(Math.random()*3)],size:Math.random()*5+3});if(hz.erupting<=0){hz.active=false;hz.timer=hz.cooldown;}}}
    if(hz.type==='blizzard'){hz.timer--;if(hz.timer<=0&&!hz.active){hz.active=true;hz.timer=hz.duration;}
      if(hz.active){hz.timer--;if(hz.timer<=0){hz.active=false;hz.timer=hz.cooldown;}}}
  });

  // Turrets
  turrets.forEach(t=>{
    if(!t.alive)return;t.cooldown--;
    const target=playerMode==='onfoot'?{x:alien.x,y:alien.y}:ship;
    const d=dist(target.x,target.y,t.x,t.y);
    if(d<t.range&&t.cooldown<=0){
      t.cooldown=60+Math.random()*40;
      const a=Math.atan2(target.y-t.y,target.x-t.x);
      t.bullets.push({x:t.x,y:t.y-20,vx:Math.cos(a)*4,vy:Math.sin(a)*4,life:100});
    }
    t.bullets.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.life--;
      if(playerMode==='onfoot'&&dist(b.x,b.y,alien.x,alien.y-15)<25){b.life=0;alien.vx+=b.vx*0.5;alien.vy+=b.vy*0.5;triggerShake(3);
        for(let i=0;i<6;i++)particles.push({x:alien.x,y:alien.y-15,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:15,color:'#f44',size:2});}
      else if(playerMode==='ship'&&dist(b.x,b.y,ship.x,ship.y)<30){b.life=0;ship.vx+=b.vx*0.3;ship.vy+=b.vy*0.3;
        for(let i=0;i<10;i++)particles.push({x:ship.x,y:ship.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,life:20,color:'#f44',size:2});}
    });
    t.bullets=t.bullets.filter(b=>b.life>0);
    missiles.forEach(m=>{if(m.life>0&&dist(m.x,m.y,t.x,t.y)<40){t.alive=false;explodeMissile(m);m.life=0;showMessage(tr('msg.turretNeutralized'));}});
  });

  planetTerror=Math.max(0,planetTerror-(0.002-getDifficultyLevel()*0.0003));

  // (genocide & respawn moved to top of updatePlanetShared)

  // (updateMission, updateWantedLevel, updateMilitary called at top of updatePlanetShared)

  // Cleanup dead humans
  humans=humans.filter(h=>!h.collected);

  // Particles, debris, tears, speech bubbles, clouds
  particles.forEach(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.life--;});particles=particles.filter(pt=>pt.life>0);
  debris.forEach(d=>{d.vy+=GRAVITY*0.5;d.x+=d.vx;d.y+=d.vy;d.life--;if(d.y>GROUND_LEVEL){d.y=GROUND_LEVEL;d.vy*=-0.3;d.vx*=0.8;}});debris=debris.filter(d=>d.life>0);
  tears.forEach(t=>{t.x+=t.vx;t.y+=t.vy;t.vy+=0.05;t.life--;});tears=tears.filter(t=>t.life>0);
  speechBubbles.forEach(s=>{s.y+=s.vy;s.life--;});speechBubbles=speechBubbles.filter(s=>s.life>0);if(speechBubbles.length>20)speechBubbles.splice(0,speechBubbles.length-20);
  clouds.forEach(c=>{c.x+=c.speed;if(c.x>worldWidth+200)c.x=-200;});

  // Block physics
  blocks.forEach(b=>{if(b.fixed)return;b.vy+=GRAVITY;b.vx*=0.98;b.vy*=0.98;b.x+=b.vx;b.y+=b.vy;
    if(b.y+b.h>GROUND_LEVEL){b.y=GROUND_LEVEL-b.h;b.vy*=-0.3;b.vx*=0.8;if(Math.abs(b.vy)<0.5)b.vy=0;if(Math.abs(b.vy)>3){b.health-=Math.abs(b.vy)*5;for(let i=0;i<3;i++)debris.push({x:b.x+Math.random()*b.w,y:b.y+b.h,vx:(Math.random()-0.5)*3,vy:-Math.random()*3,life:40,size:Math.random()*3+1,color:b.color});}}
    if(b.y>GROUND_LEVEL+200){b.dead=true;}
    else if(b.health<=0&&!b.exploding){checkBuildingDestroyed(b);}
  });
  blocks=blocks.filter(b=>!b.dead);

  // Fires (throttled particle creation)
  fires.forEach(f=>{f.life--;
    if(particles.length<200){
      if(Math.random()>0.7)particles.push({x:f.x+(Math.random()-0.5)*f.size,y:f.y,vx:(Math.random()-0.5)*1.5,vy:-Math.random()*3-1,life:15+Math.random()*10,color:['#f80','#fa0','#f40','#ff0','#f00'][Math.floor(Math.random()*5)],size:Math.random()*4+1});
    }
  });
  fires=fires.filter(f=>f.life>0);
  // Hard caps at end of update
  if(particles.length>200)particles.length=200;
  if(fires.length>30)fires.length=30;
  if(debris.length>60)debris.length=60;

  // Human physics (walking, ragdoll)
  const hP=currentPlanet||planetDefs[0];
  humans.forEach(h=>{if(h.collected)return;
    if(h.ragdoll){
      const parts=['head','body','legL','legR','armL','armR','footL','footR'];
      parts.forEach(pt=>{if(!h.beingBeamed)h[pt+'VY']+=GRAVITY*0.8;h[pt+'VX']*=0.99;h[pt+'VY']*=0.99;h[pt+'X']+=h[pt+'VX'];h[pt+'Y']+=h[pt+'VY'];if(h[pt+'Y']>GROUND_LEVEL){h[pt+'Y']=GROUND_LEVEL;h[pt+'VY']*=-0.3;h[pt+'VX']*=0.8;}if(h[pt+'Y']<-2000){h[pt+'Y']=-2000;h[pt+'VY']*=-0.3;}});
      const s=h.scale||1;const ac=(p1,p2,l)=>{const c=constrainDist(h[p1+'X'],h[p1+'Y'],h[p2+'X'],h[p2+'Y'],l,0.4);h[p1+'X']+=c.dx*0.5;h[p1+'Y']+=c.dy*0.5;h[p2+'X']-=c.dx*0.5;h[p2+'Y']-=c.dy*0.5;};
      ac('head','body',12*s);ac('body','legL',18*s);ac('body','legR',18*s);ac('body','armL',14*s);ac('body','armR',14*s);ac('legL','footL',14*s);ac('legR','footR',14*s);
      if(h.crying&&Math.random()>0.7)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY,vx:(Math.random()-0.5)*0.5,vy:Math.random()*0.5+0.5,life:40,size:Math.random()*2+1});
      blocks.forEach(b=>{if(b.dead||Math.abs(b.x-h.bodyX)>80||Math.abs(b.y-h.bodyY)>80)return;['head','body','legL','legR','footL','footR'].forEach(pt=>{const px=h[pt+'X'],py=h[pt+'Y'];if(px>b.x&&px<b.x+b.w&&py>b.y&&py<b.y+b.h){h[pt+'X']=px<b.x+b.w/2?b.x-5:b.x+b.w+5;h[pt+'VX']*=-0.5;if(!b.fixed)b.vx+=h[pt+'VX']*0.2;}});});
    }else{
      h.walkTimer++;h.idleTimer--;
      if(h.idleTimer<=0){
        // React to both ship and alien
        const shipD=dist(ship.x,ship.y,h.bodyX,h.bodyY);
        const alienD=playerMode==='onfoot'?dist(alien.x,alien.y,h.bodyX,h.bodyY):9999;
        const dS=Math.min(shipD,alienD);
        const terrorBonus=planetTerror*0.3;
        const panicRange=300+planetTerror*40;
        const threatX=alienD<shipD?alien.x:ship.x;
        if(dS<panicRange){h.panicLevel=Math.min(h.panicLevel+0.05+terrorBonus*0.02,10);h.crying=true;h.walkDir=h.bodyX<threatX?-1:1;h.walkSpeed=1.5+h.panicLevel*0.3+terrorBonus*0.15;
          const screamChance=0.98-planetTerror*0.01;
          if(h.panicLevel>1.5&&Math.random()>screamChance)speechBubbles.push({x:h.headX,y:h.headY-20,text:ta('planet.'+hP.id+'.cryPhrases')[Math.floor(Math.random()*ta('planet.'+hP.id+'.cryPhrases').length)],life:70,vy:-0.3});
        }else if(planetTerror>3&&Math.random()>0.99){
          h.panicLevel=Math.min(h.panicLevel+0.3,5);h.crying=true;h.walkDir=Math.random()>0.5?1:-1;h.walkSpeed=1+terrorBonus*0.2;
          speechBubbles.push({x:h.headX,y:h.headY-20,text:["THEY'RE HERE","RUN","HIDE","IT'S OVER"][Math.floor(Math.random()*4)],life:60,vy:-0.3});
        }else{h.panicLevel=Math.max(0,h.panicLevel-0.01);if(h.panicLevel<0.5)h.crying=false;h.walkSpeed=Math.random()*0.5+0.3;if(Math.random()>0.99){h.walkDir*=-1;h.idleTimer=Math.random()*100+50;}}
        const mv=h.walkDir*h.walkSpeed;h.headX+=mv;h.bodyX+=mv;h.legLX+=mv;h.legRX+=mv;h.armLX+=mv;h.armRX+=mv;h.footLX+=mv;h.footRX+=mv;
      }
      const s=h.scale||1;h.headY=GROUND_LEVEL-40*s;h.bodyY=GROUND_LEVEL-28*s;h.legLY=GROUND_LEVEL-10*s;h.legRY=GROUND_LEVEL-10*s;h.armLY=GROUND_LEVEL-28*s;h.armRY=GROUND_LEVEL-28*s;h.footLY=GROUND_LEVEL;h.footRY=GROUND_LEVEL;
      h.legLX=h.bodyX-4*s+Math.sin(h.walkTimer*0.1)*4*s;h.legRX=h.bodyX+4*s-Math.sin(h.walkTimer*0.1)*4*s;h.footLX=h.legLX-1+Math.sin(h.walkTimer*0.1)*5*s;h.footRX=h.legRX+1-Math.sin(h.walkTimer*0.1)*5*s;h.armLX=h.bodyX-8*s-Math.sin(h.walkTimer*0.1)*3;h.armRX=h.bodyX+8*s+Math.sin(h.walkTimer*0.1)*3;h.headX=h.bodyX;
      if(h.crying&&Math.random()>0.85)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY+3,vx:(Math.random()-0.5)*0.3,vy:0.8,life:30,size:1.5});
    }
  });

  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
}

// --- SPACE UPDATE ---
function updateSpace(){
  // During landing transition, don't move ship normally
  if(transition.active){
    transition.timer++;
    const t=transition.timer/transition.duration;
    if(transition.type==='landing'){
      const e=easeInOut(t);
      transition.zoom=1+e*5;
      // Smoothly pull ship toward planet center
      const pull=0.02+e*0.06;
      ship.x+=(transition.planet.spaceX-ship.x)*pull;
      ship.y+=(transition.planet.spaceY-ship.y)*pull;
      ship.vx*=0.95;ship.vy*=0.95;
      if(t>=1){transition.active=false;loadPlanet(transition.planet);}
    }else if(transition.type==='leaving'){
      const e=easeOut(t);
      transition.zoom=6-e*5;
      if(t>=1){transition.active=false;transition.zoom=1;}
    }
    camera.x=ship.x-canvas.width/2;camera.y=ship.y-canvas.height/2;
    if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
    return;
  }

  ship.x=Math.max(-4000,Math.min(spaceWidth+20000,ship.x));
  ship.y=Math.max(-spaceHeight-18000,Math.min(500,ship.y));
  camera.x=ship.x-canvas.width/2;camera.y=ship.y-canvas.height/2;

  // Sun discovery: if player gets within range, discover it
  planets.forEach(p=>{
    if(p.isSun && !p.discovered){
      const d=dist(ship.x,ship.y,p.spaceX,p.spaceY);
      if(d < p.radius + 2500){
        p.discovered = true;
        showMessage('DISCOVERED: '+p.name);
      }
    }
  });

  // Auto-land: check if ship enters a planet
  planets.forEach(p=>{
    if(p.isSun && !p.discovered) return; // can't land on undiscovered sun
    const d=dist(ship.x,ship.y,p.spaceX,p.spaceY);
    if(d<p.radius*0.6&&!transition.active){
      if(!unlockedPlanets.includes(p.id)){
        // Locked planet — push ship away
        if(!p._lockMsg||Date.now()-p._lockMsg>3000){
          showMessage(tr('msg.planetLocked').replace('{planet}',tr('planet.'+p.id+'.name')));
          p._lockMsg=Date.now();
        }
        const angle=Math.atan2(ship.y-p.spaceY,ship.x-p.spaceX);
        ship.vx+=Math.cos(angle)*0.5;ship.vy+=Math.sin(angle)*0.5;
        return;
      }
      transition={active:true,type:'landing',timer:0,duration:100,planet:p,zoom:1};
      showMessage(tr('msg.entering').replace('{planet}',tr('planet.'+p.id+'.name')));
    }
  });

  // Mothership docking
  const mDist=dist(ship.x,ship.y,mothershipPos.x,mothershipPos.y);
  if(mDist<80){
    ship.vx*=0.95;ship.vy*=0.95;
    if(mDist<50&&!mothership._dockMsg){
      mothership._dockMsg=true;
      showMessage(tr('msg.docked'));
    }
    if(mDist<50&&keys['x']&&!keys._xUsed){
      keys._xUsed=true;enterMothership();
    }
    if(!keys['x'])keys._xUsed=false;
  }else{mothership._dockMsg=false;}

  // Wormhole - distant anomaly
  if(!window.wormhole)window.wormhole={x:200,y:-5500,radius:80,angle:0,active:true};
  const wh=window.wormhole;wh.angle+=0.02;
  const whDist=dist(ship.x,ship.y,wh.x,wh.y);
  if(whDist<wh.radius*0.5&&wh.active&&!transition.active){
    // Teleport to the void dimension!
    wh.active=false;
    ship.x=4000;ship.y=-7000; // teleport far away
    // Spawn a hidden void planet
    if(!window.voidPlanetAdded){
      window.voidPlanetAdded=true;
      planets.push({
        id:'void',name:'The Void',desc:'"Nothing here makes sense. Everything here is wrong."',
        radius:220,color:'#1a0a2a',color2:'#0a0018',atmosphere:'#6020a0',
        skyTop:'#000000',skyMid:'#0a0020',skyBot:'#1a0040',
        groundColor:['#0a0020','#060018','#030010'],grassColor:'#2a1050',
        buildingColors:[['#208','#30a','#106'],['#218','#31a','#116']],
        inhabitantCount:15,buildingDensity:0.4,hasClouds:false,isAlien:true,
        alienSkin:['#60f','#40a','#80f','#308'],
        alienHeadShape:'tall',alienExtra:'antennae',alienLabel:'Void Walker',
        sadFacts:['"They exist between dimensions..."','"Time has no meaning here..."',
          '"They have always been here. And nowhere."','"The void stares back..."'],
        cryPhrases:["THE VOID SCREAMS","BETWEEN WORLDS","NOTHING IS REAL","TIME LOOPS","WE ARE THE ECHO","DIMENSION BLEEDS"],
        alienTypes:[
          {type:'wraith',label:'Void Wraith',scale:1.4,bodyWidth:4,headR:12,mass:0.5,colors:['#40a','#208','#60c']},
          {type:'echo',label:'Echo Entity',scale:0.8,bodyWidth:3,headR:9,mass:0.3,colors:['#80f','#60a','#a0f']},
          {type:'watcher',label:'Silent Watcher',scale:1.6,bodyWidth:6,headR:14,mass:3,colors:['#106','#204','#308']},
          {type:'child',label:'Void Sprite',scale:0.4,bodyWidth:2,headR:7,mass:0.2,colors:['#c0f','#a0f','#e0f']},
        ],
        spaceX:4000,spaceY:-7000,visited:false,savedState:null
      });
    }
    showMessage("The wormhole tears through reality...");
    // Create wormhole exit
    window.wormholeExit={x:4000,y:-6500,radius:80,angle:0};
  }
  // Wormhole exit - returns to normal space
  if(window.wormholeExit){
    const we=window.wormholeExit;we.angle+=0.02;
    const weDist=dist(ship.x,ship.y,we.x,we.y);
    if(weDist<we.radius*0.5&&!transition.active){
      ship.x=wh.x;ship.y=wh.y-150;wh.active=true;
      window.wormholeExit=null;
      showMessage("Back in known space. The void lingers in your mind...");
    }
  }

  particles.forEach(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.life--;});particles=particles.filter(pt=>pt.life>0);
  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
}

// ============================================================
// --- DRAW ---
// ============================================================
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(mothershipMode){drawMothership();return;}
  if(gameMode==='space'){drawSpace();return;}
  drawPlanet();
}

function drawSpace(){
  ctx.fillStyle='#020208';ctx.fillRect(0,0,canvas.width,canvas.height);
  // Stars (not affected by zoom)
  deepStars.forEach((s,_si)=>{if(window._perfMode&&_si%3!==0)return;s.twinkle+=s.speed;const sx=(s.x-camera.x*0.15)%(canvas.width+400)-200,sy=(s.y-camera.y*0.15)%(canvas.height+400)-200;
    ctx.fillStyle=s.color;ctx.globalAlpha=0.4+Math.sin(s.twinkle)*0.4;ctx.beginPath();ctx.arc(sx,sy,s.size,0,Math.PI*2);ctx.fill();});
  ctx.globalAlpha=1;

  // Apply zoom for transitions
  const z=transition.active?transition.zoom:1;
  ctx.save();
  if(z!==1){ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(z,z);ctx.translate(-canvas.width/2,-canvas.height/2);}
  ctx.translate(-camera.x,-camera.y);
  // Planets
  planets.forEach(p=>{
    if(p.isSun && !p.discovered) return; // hidden until discovered
    const sx=p.spaceX,sy=p.spaceY;
    // Atmosphere glow
    const gr=ctx.createRadialGradient(sx,sy,p.radius*0.8,sx,sy,p.radius*1.4);gr.addColorStop(0,p.atmosphere+'40');gr.addColorStop(1,'transparent');
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(sx,sy,p.radius*1.4,0,Math.PI*2);ctx.fill();
    // Planet body
    const pg=ctx.createRadialGradient(sx-p.radius*0.3,sy-p.radius*0.3,p.radius*0.1,sx,sy,p.radius);pg.addColorStop(0,p.color);pg.addColorStop(0.7,p.color2);pg.addColorStop(1,'#000');
    ctx.fillStyle=pg;ctx.beginPath();ctx.arc(sx,sy,p.radius,0,Math.PI*2);ctx.fill();
    // Surface bands
    ctx.strokeStyle=p.color+'60';ctx.lineWidth=1;
    for(let i=0;i<5;i++){const yO=(i-2)*p.radius*0.3,w=Math.sqrt(Math.max(0,p.radius*p.radius-yO*yO));ctx.beginPath();ctx.ellipse(sx,sy+yO,w,Math.abs(yO)*0.15+3,0,0,Math.PI*2);ctx.stroke();}
    const isLocked=!unlockedPlanets.includes(p.id);
    // Locked overlay
    if(isLocked){
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.beginPath();ctx.arc(sx,sy,p.radius,0,Math.PI*2);ctx.fill();
      // Lock icon
      ctx.strokeStyle='#666';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(sx,sy-8,10,Math.PI,0);ctx.stroke();
      ctx.fillStyle='#555';ctx.fillRect(sx-12,sy+2,24,16);
      ctx.fillStyle='#888';ctx.beginPath();ctx.arc(sx,sy+10,3,0,Math.PI*2);ctx.fill();
    }
    // Completion medal
    const comp=planetProgress[p.id]?planetProgress[p.id].completion:'none';
    if(comp!=='none'){
      const mc=comp==='gold'?'#ffd700':comp==='silver'?'#c0c0c0':'#cd7f32';
      ctx.fillStyle=mc;
      if(comp==='gold'){drawStar(ctx,sx+p.radius*0.7,sy-p.radius*0.7,10,5);}
      else{ctx.beginPath();ctx.arc(sx+p.radius*0.7,sy-p.radius*0.7,7,0,Math.PI*2);ctx.fill();}
    }
    // Label
    const d=dist(ship.x,ship.y,sx,sy);if(d<p.radius+600){
      const a=Math.min(1,(p.radius+600-d)/300);ctx.globalAlpha=a;
      ctx.fillStyle=isLocked?'#666':'#fff';ctx.font='16px monospace';ctx.textAlign='center';ctx.fillText(tr('planet.'+p.id+'.name'),sx,sy+p.radius+30);
      ctx.font='11px monospace';ctx.fillStyle='#aaa';
      if(isLocked){ctx.fillStyle='#f44';ctx.fillText(tr('hud.locked'),sx,sy+p.radius+50);}
      else{ctx.fillText(d<p.radius*0.8?tr('hud.entering'):d<p.radius+100?tr('hud.flyCloser'):`${tr('hud.dist')}: ${Math.floor(d-p.radius)}`,sx,sy+p.radius+50);}
      if(comp!=='none'){ctx.fillStyle=comp==='gold'?'#ffd700':comp==='silver'?'#c0c0c0':'#cd7f32';ctx.font='10px monospace';ctx.fillText(comp.toUpperCase(),sx,sy+p.radius+65);}
      ctx.globalAlpha=1;}
  });
  // --- MOTHERSHIP ---
  const mx=mothershipPos.x,my=mothershipPos.y;
  // Mothership body
  ctx.fillStyle='#333';ctx.beginPath();ctx.ellipse(mx,my,120,30,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#444';ctx.beginPath();ctx.ellipse(mx,my-10,60,25,0,Math.PI,0);ctx.fill();
  ctx.fillStyle='#555';ctx.beginPath();ctx.ellipse(mx,my-20,30,15,0,Math.PI,0);ctx.fill();
  // Lights
  for(let i=0;i<8;i++){const la=(i/8)*Math.PI*2+ship.lightPhase*0.5;ctx.fillStyle=i%2===0?'#0f0':'#0a0';ctx.beginPath();ctx.arc(mx+Math.cos(la)*100,my+Math.sin(la)*20,3,0,Math.PI*2);ctx.fill();}
  // Beam port
  ctx.fillStyle='rgba(0,255,100,0.15)';ctx.beginPath();ctx.arc(mx,my+25,15,0,Math.PI*2);ctx.fill();
  // Label
  const md=dist(ship.x,ship.y,mx,my);
  if(md<500){
    const ma=Math.min(1,(500-md)/200);ctx.globalAlpha=ma;
    ctx.fillStyle='#0f0';ctx.font='14px monospace';ctx.textAlign='center';
    ctx.fillText(tr('hud.mothership'),mx,my+55);
    ctx.font='10px monospace';ctx.fillStyle='#0a0';
    ctx.fillText(`${tr('hud.specimens')}: ${mothership.totalCollected}`,mx,my+70);
    if(md<80)ctx.fillText(tr('hud.dockedSecured'),mx,my+85);
    ctx.globalAlpha=1;
  }

  // === WORMHOLE ===
  const wh=window.wormhole;
  if(wh){
    const whsx=wh.x,whsy=wh.y,t2=Date.now()*0.001;
    const whDist=dist(ship.x,ship.y,whsx,whsy);
    if(whDist<1500){
      // Outer swirl
      for(let ring=0;ring<5;ring++){
        const r=wh.radius*(1.5-ring*0.2);
        const a=wh.active?(0.15-ring*0.02):(0.03);
        ctx.strokeStyle=`rgba(${120+ring*30},${20+ring*10},${200+ring*10},${a})`;
        ctx.lineWidth=3-ring*0.4;
        ctx.beginPath();ctx.arc(whsx,whsy,r,wh.angle+ring*0.5,wh.angle+ring*0.5+Math.PI*1.2);ctx.stroke();
        ctx.beginPath();ctx.arc(whsx,whsy,r,wh.angle+ring*0.5+Math.PI,wh.angle+ring*0.5+Math.PI*2.2);ctx.stroke();
      }
      // Core glow
      if(wh.active){
        const glow=ctx.createRadialGradient(whsx,whsy,0,whsx,whsy,wh.radius);
        glow.addColorStop(0,`rgba(180,100,255,${0.3+Math.sin(t2*3)*0.1})`);
        glow.addColorStop(0.5,`rgba(100,0,200,0.1)`);
        glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(whsx,whsy,wh.radius,0,Math.PI*2);ctx.fill();
        // Center bright spot
        ctx.fillStyle=`rgba(220,180,255,${0.5+Math.sin(t2*4)*0.3})`;
        ctx.beginPath();ctx.arc(whsx,whsy,8+Math.sin(t2*2)*3,0,Math.PI*2);ctx.fill();
        // Particle pull effect
        for(let i=0;i<3;i++){
          const pa=t2*2+i*2.1,pr=wh.radius*(0.5+Math.sin(t2+i)*0.3);
          ctx.fillStyle=`rgba(180,100,255,${0.3+Math.sin(t2+i)*0.2})`;
          ctx.beginPath();ctx.arc(whsx+Math.cos(pa)*pr,whsy+Math.sin(pa)*pr*0.5,2+Math.sin(t2*3+i)*1,0,Math.PI*2);ctx.fill();
        }
      }
      // Label
      if(whDist<800){
        const la=Math.min(1,(800-whDist)/400);ctx.globalAlpha=la;
        ctx.fillStyle='#c8f';ctx.font='14px monospace';ctx.textAlign='center';
        ctx.fillText(wh.active?'WORMHOLE':'[collapsed]',whsx,whsy+wh.radius+25);
        if(wh.active&&whDist<200){ctx.fillStyle='#a6d';ctx.font='10px monospace';ctx.fillText('fly into the anomaly...',whsx,whsy+wh.radius+42);}
        ctx.globalAlpha=1;
      }
    }
  }
  // Wormhole exit (in void space)
  if(window.wormholeExit){
    const we=window.wormholeExit,t2=Date.now()*0.001;
    for(let ring=0;ring<4;ring++){
      const r=we.radius*(1.3-ring*0.2);
      ctx.strokeStyle=`rgba(${100+ring*30},${200+ring*10},${100+ring*10},${0.12-ring*0.02})`;
      ctx.lineWidth=2;ctx.beginPath();ctx.arc(we.x,we.y,r,we.angle+ring*0.6,we.angle+ring*0.6+Math.PI*1.3);ctx.stroke();
    }
    const glow=ctx.createRadialGradient(we.x,we.y,0,we.x,we.y,we.radius*0.8);
    glow.addColorStop(0,`rgba(100,255,150,${0.2+Math.sin(t2*3)*0.1})`);glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(we.x,we.y,we.radius*0.8,0,Math.PI*2);ctx.fill();
    const wed=dist(ship.x,ship.y,we.x,we.y);
    if(wed<500){ctx.fillStyle='#8f8';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText('RETURN WORMHOLE',we.x,we.y+we.radius+20);}
  }

  drawShip();
  particles.forEach(pt=>{const sx=pt.x-camera.x,sy=pt.y-camera.y;if(sx<-20||sx>canvas.width+20||sy<-20||sy>canvas.height+20)return;ctx.globalAlpha=pt.life/30;ctx.fillStyle=pt.color;if(pt.size<3){ctx.fillRect(pt.x-pt.size/2,pt.y-pt.size/2,pt.size,pt.size);}else{ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;});
  ctx.restore();

  // Specimen count HUD in space
  if(!transition.active){
    ctx.fillStyle='#0f0';ctx.font='11px monospace';ctx.textAlign='left';
    ctx.fillText(`${tr('hud.specimens')}: ${mothership.totalCollected} | ${tr('hud.score')}: ${score}`,15,canvas.height-15);
    if(upgrades.beamWidth||upgrades.speed||upgrades.flame){
      ctx.fillText(`${tr('hud.upgrades')}: ${tr('hud.beam')} ${upgrades.beamWidth} | ${tr('hud.speed')} ${upgrades.speed} | ${tr('hud.flame')} ${upgrades.flame}`,15,canvas.height-30);
    }
  }

  // Transition overlay
  if(transition.active){
    const t=transition.timer/transition.duration;
    if(transition.type==='landing'){
      const e=easeIn(t);
      ctx.fillStyle=`rgba(255,255,255,${e*0.85})`;ctx.fillRect(0,0,canvas.width,canvas.height);
    }else if(transition.type==='leaving'){
      const e=easeOut(t);
      ctx.fillStyle=`rgba(255,255,255,${(1-e)*0.85})`;ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }

  if(!transition.active)drawMinimap();
}

function drawMinimap(){
  const mW=160,mH=120,mX=canvas.width-mW-15,mY=15;
  // Compute bounds from all planets + margin
  const pad=500;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  planets.forEach(p=>{
    if(p.isSun && !p.discovered) return; // hidden
    // Only show on minimap if visited or within 3000 of ship
    const pd=Math.sqrt((p.spaceX-ship.x)**2+(p.spaceY-ship.y)**2);
    if(pd>3000&&!p.visited)return;
    minX=Math.min(minX,p.spaceX-p.radius);maxX=Math.max(maxX,p.spaceX+p.radius);minY=Math.min(minY,p.spaceY-p.radius);maxY=Math.max(maxY,p.spaceY+p.radius);
  });
  minX=Math.min(minX,mothershipPos.x-150);maxX=Math.max(maxX,mothershipPos.x+150);minY=Math.min(minY,mothershipPos.y-50);maxY=Math.max(maxY,mothershipPos.y+50);
  if(window.wormhole){minX=Math.min(minX,window.wormhole.x-100);maxX=Math.max(maxX,window.wormhole.x+100);minY=Math.min(minY,window.wormhole.y-100);maxY=Math.max(maxY,window.wormhole.y+100);}
  if(window.wormholeExit){minX=Math.min(minX,window.wormholeExit.x-100);maxX=Math.max(maxX,window.wormholeExit.x+100);minY=Math.min(minY,window.wormholeExit.y-100);maxY=Math.max(maxY,window.wormholeExit.y+100);}
  minX-=pad;maxX+=pad;minY-=pad;maxY+=pad;
  // Also include ship
  minX=Math.min(minX,ship.x);maxX=Math.max(maxX,ship.x);minY=Math.min(minY,ship.y);maxY=Math.max(maxY,ship.y);
  const rangeX=maxX-minX||1,rangeY=maxY-minY||1;
  const sX=mW/rangeX,sY=mH/rangeY;

  ctx.fillStyle='rgba(0,20,0,0.7)';ctx.strokeStyle='#0f0';ctx.lineWidth=1;ctx.fillRect(mX,mY,mW,mH);ctx.strokeRect(mX,mY,mW,mH);
  planets.forEach(p=>{
    if(p.isSun && !p.discovered) return; // hidden until discovered
    const px=mX+(p.spaceX-minX)*sX,py=mY+(p.spaceY-minY)*sY,pr=Math.max(4,p.radius*sX);
    const pd=Math.sqrt((p.spaceX-ship.x)**2+(p.spaceY-ship.y)**2);
    const isLocked=!unlockedPlanets.includes(p.id);
    if(pd>3000&&!p.visited&&isLocked)return; // hide distant undiscovered planets
    ctx.fillStyle=isLocked?'#333':p.color;ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
    // Medal dot
    const comp=planetProgress[p.id]?planetProgress[p.id].completion:'none';
    if(comp!=='none'){ctx.fillStyle=comp==='gold'?'#ffd700':comp==='silver'?'#c0c0c0':'#cd7f32';ctx.beginPath();ctx.arc(px+pr+3,py-pr,2,0,Math.PI*2);ctx.fill();}
    // Tiny label
    ctx.fillStyle=isLocked?'#555':'#0f0';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(p.name.slice(0,4),px,py+pr+8);
  });
  // Wormhole on minimap
  if(window.wormhole){const wh=window.wormhole;const whx=mX+(wh.x-minX)*sX,why=mY+(wh.y-minY)*sY;
    ctx.fillStyle=wh.active?'#c0f':'#404';ctx.beginPath();ctx.arc(whx,why,4,0,Math.PI*2);ctx.fill();
    ctx.font='6px monospace';ctx.textAlign='center';ctx.fillStyle='#c0f';ctx.fillText('WH',whx,why+7);}
  if(window.wormholeExit){const we=window.wormholeExit;const wex=mX+(we.x-minX)*sX,wey=mY+(we.y-minY)*sY;
    ctx.fillStyle='#0f8';ctx.beginPath();ctx.arc(wex,wey,3,0,Math.PI*2);ctx.fill();}
  // Mothership on minimap
  const mmx=mX+(mothershipPos.x-minX)*sX,mmy=mY+(mothershipPos.y-minY)*sY;
  ctx.fillStyle='#0f0';ctx.beginPath();ctx.ellipse(mmx,mmy,6,2,0,0,Math.PI*2);ctx.fill();
  ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(tr('hud.base'),mmx,mmy+9);
  // Ship
  const sx=mX+(ship.x-minX)*sX,sy=mY+(ship.y-minY)*sY;ctx.fillStyle='#0f0';ctx.beginPath();ctx.arc(sx,sy,3,0,Math.PI*2);ctx.fill();
  if(Math.sin(ship.lightPhase*3)>0){ctx.strokeStyle='#0f0';ctx.beginPath();ctx.arc(sx,sy,6,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#0f0';ctx.font='9px monospace';ctx.textAlign='right';ctx.fillText(tr('hud.starMap'),mX+mW-4,mY+mH-4);
}

function drawPlanet(){
  const p=currentPlanet||planetDefs[0];
  const spaceBlend=Math.max(0,Math.min(1,(GROUND_LEVEL-800-ship.y)/1200));
  // Sky
  const sg=ctx.createLinearGradient(0,0,0,canvas.height);
  sg.addColorStop(0,lerpColor('#000005',p.skyTop,1-spaceBlend));sg.addColorStop(0.5,lerpColor('#000005',p.skyMid,1-spaceBlend));sg.addColorStop(1,lerpColor('#050510',p.skyBot,1-spaceBlend));
  ctx.fillStyle=sg;ctx.fillRect(0,0,canvas.width,canvas.height);
  // Stars
  const sa=Math.max(0.3,spaceBlend);
  stars.forEach(s=>{const sx=s.x-camera.x*0.3,sy=s.y-camera.y*0.1;if(sx<-10||sx>canvas.width+10)return;s.twinkle+=s.speed;ctx.fillStyle=`rgba(255,255,255,${(0.5+Math.sin(s.twinkle)*0.5)*sa})`;ctx.beginPath();ctx.arc(sx,sy,s.size,0,Math.PI*2);ctx.fill();});
  // Moon in the sky - fades based on which side of the planet you're on
  // Use angle around planet (0 to 1) to determine moon visibility smoothly
  const playerX=playerMode==='ship'?ship.x:alien.x;
  const planetAngle=((playerX%worldWidth)+worldWidth)%worldWidth/worldWidth; // 0-1, wraps cleanly
  // Moon is visible around angle 0.25, hidden around 0.75
  const moonAngleDist=Math.min(Math.abs(planetAngle-0.25),Math.abs(planetAngle-0.25+1),Math.abs(planetAngle-0.25-1));
  const moonVis=Math.max(0,1-moonAngleDist/0.35);
  if(spaceBlend<0.8&&moonVis>0.01){
    ctx.globalAlpha=(1-spaceBlend)*moonVis;
    // Moon position: fixed in sky, no camera parallax (prevents wrap glitch)
    const mx=canvas.width*0.78,my=80-camera.y*0.05;
    // Planet-specific moon
    const moonDef=p.id==='earth'?{color:'#ddd',color2:'#bbb',glow:'rgba(200,200,220,0.15)',size:40}:
      p.id==='mars'?{color:'#a87',color2:'#876',glow:'rgba(180,140,100,0.15)',size:25}:
      p.id==='glimora'?{color:'#c8f',color2:'#a6d',glow:'rgba(200,100,255,0.2)',size:35}:
      p.id==='ice'?{color:'#bef',color2:'#8cd',glow:'rgba(150,200,255,0.2)',size:45}:
      {color:'#f86',color2:'#d64',glow:'rgba(255,100,50,0.2)',size:30}; // lava
    // Glow
    const glow=ctx.createRadialGradient(mx,my,moonDef.size*0.5,mx,my,moonDef.size*1.8);
    glow.addColorStop(0,moonDef.glow);glow.addColorStop(1,'transparent');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(mx,my,moonDef.size*1.8,0,Math.PI*2);ctx.fill();
    // Moon body
    ctx.fillStyle=moonDef.color;ctx.beginPath();ctx.arc(mx,my,moonDef.size,0,Math.PI*2);ctx.fill();
    // Craters / surface details
    ctx.fillStyle=moonDef.color2;
    ctx.beginPath();ctx.arc(mx-moonDef.size*0.25,my-moonDef.size*0.25,moonDef.size*0.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(mx+moonDef.size*0.3,my+moonDef.size*0.12,moonDef.size*0.13,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(mx-moonDef.size*0.12,my+moonDef.size*0.3,moonDef.size*0.1,0,Math.PI*2);ctx.fill();
    // Highlight
    ctx.fillStyle='rgba(255,255,255,0.15)';ctx.beginPath();ctx.arc(mx-moonDef.size*0.2,my-moonDef.size*0.2,moonDef.size*0.4,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
  // Sun — opposite side from moon, drives day/night brightness
  const sunAngleDist=Math.min(Math.abs(planetAngle-0.75),Math.abs(planetAngle-0.75+1),Math.abs(planetAngle-0.75-1));
  const sunVis=Math.max(0,1-sunAngleDist/0.35);
  // Day/night brightness driven by sun visibility
  dayNightBrightness=sunVis;
  if(spaceBlend<0.8&&sunVis>0.05){
    ctx.globalAlpha=(1-spaceBlend)*sunVis*0.9;
    const sunX=canvas.width*0.22,sunY=70-camera.y*0.05+Math.sin(dayNightCycle*Math.PI*2)*30;
    // Sun glow
    const sunGlow=ctx.createRadialGradient(sunX,sunY,15,sunX,sunY,120);
    sunGlow.addColorStop(0,'rgba(255,240,180,0.3)');sunGlow.addColorStop(0.4,'rgba(255,200,100,0.1)');sunGlow.addColorStop(1,'transparent');
    ctx.fillStyle=sunGlow;ctx.beginPath();ctx.arc(sunX,sunY,120,0,Math.PI*2);ctx.fill();
    // Sun body
    ctx.fillStyle='#ffe890';ctx.beginPath();ctx.arc(sunX,sunY,25,0,Math.PI*2);ctx.fill();
    // Sun core
    ctx.fillStyle='#fff8d0';ctx.beginPath();ctx.arc(sunX-5,sunY-5,12,0,Math.PI*2);ctx.fill();
    // Sun rays
    ctx.strokeStyle='rgba(255,230,150,0.15)';ctx.lineWidth=2;
    for(let ri=0;ri<8;ri++){
      const ra=ri*Math.PI/4+Date.now()*0.0003;
      ctx.beginPath();ctx.moveTo(sunX+Math.cos(ra)*30,sunY+Math.sin(ra)*30);
      ctx.lineTo(sunX+Math.cos(ra)*(50+Math.sin(Date.now()*0.002+ri)*10),sunY+Math.sin(ra)*(50+Math.sin(Date.now()*0.002+ri)*10));ctx.stroke();
    }
    ctx.globalAlpha=1;
    // Brighten sky when sun is visible
    ctx.fillStyle=`rgba(80,80,40,${sunVis*0.08})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  // Night overlay when sun is not visible
  if(sunVis<0.3){
    ctx.fillStyle=`rgba(0,0,20,${(0.3-sunVis)*0.5})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  ctx.save();ctx.translate(-camera.x,-camera.y);
  // --- Puffy clouds (unified silhouette, no visible seams) ---
  clouds.forEach(c=>{
    const a = 0.88 * Math.min(1, sunVis*1.4 + 0.4);
    const base = sunVis > 0.5 ? [255,252,245] : (sunVis > 0.2 ? [245,225,220] : [85,85,115]);
    const shadowCol = sunVis > 0.5 ? [195,200,215] : (sunVis > 0.2 ? [150,135,155] : [30,30,55]);
    const highlightCol = [255,255,255];
    // Deterministic puff positions (stable per cloud)
    const seed = Math.abs(Math.sin(c.x*0.013+c.y*0.007));
    const puffs = 6 + Math.floor(seed*3);
    const puffList = [];
    for(let pi=0; pi<puffs; pi++){
      const tt = pi/(puffs-1);
      const px = c.x - c.width/2 + tt*c.width;
      const py = c.y + Math.sin(pi*1.7+c.x*0.01)*c.height*0.12;
      const shape = Math.sin(tt*Math.PI);
      const pr = c.height*0.48 * (0.6 + shape*0.7 + Math.sin(pi*2.3+c.x*0.02)*0.08);
      puffList.push({px,py,pr});
    }
    // 1. One unified silhouette path — all arcs in one subpath so the union fills flat
    ctx.save();
    ctx.beginPath();
    puffList.forEach(p=>{ctx.moveTo(p.px+p.pr,p.py);ctx.arc(p.px,p.py,p.pr,0,Math.PI*2);});
    // Fill body
    ctx.fillStyle = `rgba(${base.join(',')},${a})`;
    ctx.fill();
    // 2. Clip to silhouette so shadow/highlight don't bleed outside
    ctx.clip();
    // 3. Soft bottom shadow (linear gradient over the cloud bounds)
    const minY = Math.min(...puffList.map(p=>p.py-p.pr));
    const maxY = Math.max(...puffList.map(p=>p.py+p.pr));
    const grd = ctx.createLinearGradient(0,minY,0,maxY);
    grd.addColorStop(0,`rgba(${highlightCol.join(',')},${a*0.35})`);
    grd.addColorStop(0.55,`rgba(${base.join(',')},0)`);
    grd.addColorStop(1,`rgba(${shadowCol.join(',')},${a*0.55})`);
    ctx.fillStyle = grd;
    ctx.fillRect(c.x-c.width,minY-10,c.width*2,maxY-minY+20);
    ctx.restore();
  });
  // --- Bird flocks (Earth day only, drifting V-formations) ---
  if(p.id==='earth' && sunVis > 0.25) {
    const _bt = Date.now() * 0.001;
    const flocks = 4;
    for(let fl=0; fl<flocks; fl++) {
      const dir = fl % 2 === 0 ? 1 : -1;
      const baseX = ((fl*4200 + _bt*30*dir) % (worldWidth+600) + worldWidth) % worldWidth;
      const baseY = GROUND_LEVEL - 480 - fl*70 + Math.sin(_bt*0.3+fl)*25;
      // Cull
      if(baseX < camera.x-200 || baseX > camera.x+canvas.width+200) continue;
      // Flock of 5-7 birds in V
      const bc = 5 + (fl%3);
      for(let i=0; i<bc; i++) {
        const off = i - Math.floor(bc/2);
        const bx = baseX + off*14*dir;
        const by = baseY - Math.abs(off)*5;
        const wingPhase = Math.sin(_bt*8 + i*0.3);
        ctx.fillStyle = 'rgba(20,20,30,0.85)';
        ctx.beginPath();
        // V-wing silhouette
        ctx.moveTo(bx-6, by+wingPhase*-3);
        ctx.quadraticCurveTo(bx-2, by, bx, by+1);
        ctx.quadraticCurveTo(bx+2, by, bx+6, by+wingPhase*-3);
        ctx.lineTo(bx+3, by+1.5);
        ctx.lineTo(bx-3, by+1.5);
        ctx.closePath(); ctx.fill();
      }
    }
  }
  // Ground (flat, infinite - wraps seamlessly) with biome support
  if(p.id==='earth'){
    // Draw ground in biome-colored strips
    const _t = Date.now() * 0.001;
    for(let bx=Math.floor(camera.x/30)*30-30;bx<camera.x+canvas.width+30;bx+=30){
      const biome=getEarthBiome(bx);
      if(biome.isOcean){
        // Ocean: draw water body from surface down to seabed
        const wg=ctx.createLinearGradient(0,GROUND_LEVEL,0,SEABED_Y);
        wg.addColorStop(0,'#0a5090');wg.addColorStop(0.15,'#084080');wg.addColorStop(0.4,'#063060');wg.addColorStop(0.7,'#0a3050');wg.addColorStop(1,'#1a3850');
        ctx.fillStyle=wg;ctx.fillRect(bx,GROUND_LEVEL,31,WATER_DEPTH);
        // Sandy seabed (brighter so it's visible)
        const sg2=ctx.createLinearGradient(0,SEABED_Y,0,SEABED_Y+120);
        sg2.addColorStop(0,'#c8a868');sg2.addColorStop(0.3,'#a88848');sg2.addColorStop(1,'#5a4020');
        ctx.fillStyle=sg2;ctx.fillRect(bx,SEABED_Y,31,canvas.height+Math.abs(camera.y));
        // Seabed surface highlight band
        ctx.fillStyle='rgba(240,220,160,0.25)';
        ctx.fillRect(bx,SEABED_Y-2,31,4);
        // Deterministic speckles (pebbles / ripples on sand)
        for(let si=0;si<6;si++){
          const sx=bx+(si*5+3);
          const sa=Math.sin(sx*0.07+sx*0.013);
          if(sa>0.1){
            ctx.fillStyle='rgba(90,60,30,'+(0.25+sa*0.2)+')';
            ctx.fillRect(sx,SEABED_Y+4+si*2,2+Math.abs(sa)*2,1.5);
          }
        }
        // Animated wave surface
        const w1=Math.sin(_t*1.5+bx*0.03)*3;
        const w2=Math.sin(_t*2.2+bx*0.05)*2;
        const waveY=GROUND_LEVEL+w1+w2;
        // Wave body
        ctx.fillStyle='rgba(80,160,255,0.35)';
        ctx.beginPath();ctx.moveTo(bx,waveY-3);
        ctx.quadraticCurveTo(bx+15,waveY-3+Math.sin(_t*1.8+bx*0.04)*2,bx+31,waveY-3+Math.sin(_t*2+bx*0.06)*1.5);
        ctx.lineTo(bx+31,waveY+4);ctx.lineTo(bx,waveY+4);ctx.fill();
        // Foam/whitecap
        if(Math.sin(bx*0.07+_t*0.5)>0.6){
          ctx.fillStyle='rgba(200,230,255,0.3)';
          ctx.fillRect(bx+Math.sin(bx*0.1)*5,waveY-4,8+Math.sin(bx*0.2)*4,2);
        }
        // Sun reflection on water surface
        if(sunVis>0.2){
          ctx.fillStyle=`rgba(255,240,200,${sunVis*0.04*Math.max(0,Math.sin(_t*3+bx*0.08))})`;
          ctx.fillRect(bx,waveY-2,31,3);
        }
      } else {
        const gg=ctx.createLinearGradient(0,GROUND_LEVEL,0,GROUND_LEVEL+200);
        gg.addColorStop(0,biome.groundColor[0]);gg.addColorStop(0.3,biome.groundColor[1]);gg.addColorStop(1,biome.groundColor[2]);
        ctx.fillStyle=gg;ctx.fillRect(bx,GROUND_LEVEL,31,canvas.height+Math.abs(camera.y));
        // Grass/ground detail per biome — now with varied blade sizes
        if(biome.grassHeight>0){
          ctx.strokeStyle=biome.grassColor;ctx.lineWidth=0.8;
          const gh=biome.grassHeight;
          ctx.beginPath();
          ctx.moveTo(bx,GROUND_LEVEL);ctx.lineTo(bx-3+Math.sin(bx*0.3)*1,GROUND_LEVEL-gh);
          ctx.moveTo(bx+6,GROUND_LEVEL);ctx.lineTo(bx+3+Math.sin(bx*0.17)*1,GROUND_LEVEL-gh-1);
          ctx.moveTo(bx+15,GROUND_LEVEL);ctx.lineTo(bx+13+Math.cos(bx*0.2)*1,GROUND_LEVEL-gh*0.7);
          ctx.moveTo(bx+23,GROUND_LEVEL);ctx.lineTo(bx+26+Math.sin(bx*0.11)*1,GROUND_LEVEL-gh*1.1);
          ctx.stroke();
          // Tiny flowers on grass biomes (daytime)
          if(sunVis>0.4 && biome.grassHeight>4 && Math.sin(bx*0.09)>0.7){
            const fcol = ['#ff88cc','#ffee44','#ffffff','#ff6644'][Math.floor(Math.abs(Math.sin(bx*0.05))*4)];
            ctx.fillStyle=fcol;
            ctx.beginPath();ctx.arc(bx+12,GROUND_LEVEL-gh-2,1.3,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='#ffee44';
            ctx.beginPath();ctx.arc(bx+12,GROUND_LEVEL-gh-2,0.5,0,Math.PI*2);ctx.fill();
          }
          // Butterflies (daytime, grass biomes)
          if(sunVis>0.5 && Math.sin(bx*0.015)>0.85){
            const btfX = bx + 15 + Math.sin(_t*1.2+bx*0.02)*10;
            const btfY = GROUND_LEVEL - 30 - Math.abs(Math.sin(_t*0.8+bx*0.03))*15;
            const wingOpen = Math.sin(_t*15+bx)>0 ? 3 : 1;
            const btcol = Math.sin(bx*0.2)>0 ? '#ff66aa' : '#ffaa33';
            ctx.fillStyle = btcol;
            ctx.beginPath(); ctx.ellipse(btfX-2, btfY, wingOpen, 2.5, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(btfX+2, btfY, wingOpen, 2.5, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#222';
            ctx.fillRect(btfX-0.4, btfY-1, 0.8, 2);
          }
          // Fireflies (nighttime, grass biomes)
          if(sunVis<0.3 && Math.sin(bx*0.011)>0.7){
            for(let fi=0; fi<3; fi++){
              const ffX = bx + 5 + fi*9 + Math.sin(_t*0.9+bx*0.04+fi)*8;
              const ffY = GROUND_LEVEL - 15 - fi*12 - Math.abs(Math.sin(_t*0.6+bx*0.02+fi*1.1))*18;
              const pulse = 0.3 + Math.sin(_t*4+bx+fi*2)*0.3+0.3;
              ctx.fillStyle = `rgba(255,240,120,${pulse})`;
              ctx.beginPath(); ctx.arc(ffX, ffY, 1.3, 0, Math.PI*2); ctx.fill();
              ctx.fillStyle = `rgba(255,220,80,${pulse*0.3})`;
              ctx.beginPath(); ctx.arc(ffX, ffY, 4, 0, Math.PI*2); ctx.fill();
            }
          }
        }
        // Street lamps at night in city/suburbs
        if((biome.id==='city'||biome.id==='suburbs') && sunVis<0.4){
          for(let lp=bx; lp<bx+31; lp+=90){
            if(Math.sin(lp*0.02)>0){
              // Pole
              ctx.fillStyle='#4a4a52';
              ctx.fillRect(lp, GROUND_LEVEL-32, 1.5, 32);
              // Lamp head
              ctx.fillStyle='#6a6a72';
              ctx.beginPath(); ctx.arc(lp+0.75, GROUND_LEVEL-34, 2.2, 0, Math.PI*2); ctx.fill();
              // Warm glow
              const lampG = ctx.createRadialGradient(lp+0.75, GROUND_LEVEL-34, 0, lp+0.75, GROUND_LEVEL-34, 55);
              lampG.addColorStop(0, `rgba(255,200,120,${0.55*(1-sunVis)})`);
              lampG.addColorStop(0.5, `rgba(255,180,90,${0.18*(1-sunVis)})`);
              lampG.addColorStop(1, 'rgba(255,180,90,0)');
              ctx.fillStyle = lampG;
              ctx.fillRect(lp-55, GROUND_LEVEL-90, 110, 90);
            }
          }
        }
        // Mountain peaks — layered realistic mountain range
        if(biome.isMountain){
          // Continuous multi-octave height functions (deterministic → columns tile seamlessly)
          const _mhFar=(x)=>Math.max(0, 95+Math.sin(x*0.0035)*70+Math.sin(x*0.011+1.3)*32+Math.cos(x*0.021+2.7)*14);
          const _mhMid=(x)=>Math.max(0, 180+Math.sin(x*0.0055+0.4)*125+Math.sin(x*0.014+2.1)*60+Math.sin(x*0.031+0.9)*22+Math.cos(x*0.07+1.8)*6);
          const _mhTree=(x)=>Math.max(0, 55+Math.sin(x*0.009+2.3)*42+Math.sin(x*0.022+0.7)*18+Math.cos(x*0.04+1.2)*6);
          // --- FAR (hazy distant) ridge ---
          const fh1=_mhFar(bx), fh2=_mhFar(bx+30);
          const fg=ctx.createLinearGradient(0,GROUND_LEVEL-200,0,GROUND_LEVEL);
          fg.addColorStop(0,'#8894a4');fg.addColorStop(0.5,'#6a7686');fg.addColorStop(1,'#4c5868');
          ctx.fillStyle=fg;
          ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL);ctx.lineTo(bx,GROUND_LEVEL-fh1);ctx.lineTo(bx+30,GROUND_LEVEL-fh2);ctx.lineTo(bx+30,GROUND_LEVEL);ctx.closePath();ctx.fill();
          // Atmospheric haze over far ridge
          ctx.fillStyle='rgba(200,215,230,0.12)';
          ctx.fillRect(bx,GROUND_LEVEL-Math.max(fh1,fh2),31,Math.max(fh1,fh2));
          // Far snow dusting
          if(Math.max(fh1,fh2)>130){
            ctx.fillStyle='rgba(240,248,255,0.55)';
            ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL-fh1);ctx.lineTo(bx+30,GROUND_LEVEL-fh2);ctx.lineTo(bx+30,GROUND_LEVEL-fh2+7);ctx.lineTo(bx,GROUND_LEVEL-fh1+7);ctx.closePath();ctx.fill();
          }

          // --- MID (main) mountain ---
          const mh1=_mhMid(bx), mh2=_mhMid(bx+30);
          const mg=ctx.createLinearGradient(0,GROUND_LEVEL-360,0,GROUND_LEVEL);
          mg.addColorStop(0,'#a8aeb4');mg.addColorStop(0.12,'#807870');mg.addColorStop(0.38,'#5e564c');mg.addColorStop(0.7,'#463c30');mg.addColorStop(1,'#2c2418');
          ctx.fillStyle=mg;
          ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL);ctx.lineTo(bx,GROUND_LEVEL-mh1);ctx.lineTo(bx+30,GROUND_LEVEL-mh2);ctx.lineTo(bx+30,GROUND_LEVEL);ctx.closePath();ctx.fill();
          // Slope shading: east-facing (descending) gets darker shadow
          const _slope=mh2-mh1;
          if(_slope<-3){
            ctx.fillStyle=`rgba(0,0,0,${Math.min(0.32,-_slope/55)})`;
            ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL);ctx.lineTo(bx,GROUND_LEVEL-mh1);ctx.lineTo(bx+30,GROUND_LEVEL-mh2);ctx.lineTo(bx+30,GROUND_LEVEL);ctx.closePath();ctx.fill();
          }else if(_slope>3){
            // West-facing (ascending) gets subtle highlight
            ctx.fillStyle=`rgba(255,245,220,${Math.min(0.12,_slope/110)})`;
            ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL);ctx.lineTo(bx,GROUND_LEVEL-mh1);ctx.lineTo(bx+30,GROUND_LEVEL-mh2);ctx.lineTo(bx+30,GROUND_LEVEL);ctx.closePath();ctx.fill();
          }

          // --- SNOW CAP (elevation-based, clipped properly) ---
          const _snowLine=235;
          if(mh1>_snowLine||mh2>_snowLine){
            const jitter1=Math.sin(bx*0.09)*5, jitter2=Math.sin((bx+30)*0.09)*5;
            ctx.fillStyle='rgba(250,253,255,0.96)';
            ctx.beginPath();
            if(mh1>_snowLine&&mh2>_snowLine){
              ctx.moveTo(bx,GROUND_LEVEL-mh1);ctx.lineTo(bx+30,GROUND_LEVEL-mh2);
              ctx.lineTo(bx+30,GROUND_LEVEL-_snowLine+jitter2);ctx.lineTo(bx,GROUND_LEVEL-_snowLine+jitter1);
            }else if(mh1>_snowLine){
              const frac=(mh1-_snowLine)/(mh1-mh2);
              ctx.moveTo(bx,GROUND_LEVEL-mh1);ctx.lineTo(bx+30*frac,GROUND_LEVEL-_snowLine);ctx.lineTo(bx,GROUND_LEVEL-_snowLine+jitter1);
            }else{
              const frac=(_snowLine-mh1)/(mh2-mh1);
              ctx.moveTo(bx+30*frac,GROUND_LEVEL-_snowLine);ctx.lineTo(bx+30,GROUND_LEVEL-mh2);ctx.lineTo(bx+30,GROUND_LEVEL-_snowLine+jitter2);
            }
            ctx.closePath();ctx.fill();
            // Snow shadow/streaks for depth
            ctx.fillStyle='rgba(180,200,220,0.3)';
            if(mh1>_snowLine&&mh2>_snowLine&&_slope<-2){
              ctx.fillRect(bx+16,GROUND_LEVEL-Math.min(mh1,mh2)+2,14,3);
            }
          }

          // --- ROCK TEXTURE: scattered dark rocks on slope ---
          const _rs=Math.sin(bx*0.47)*0.5+0.5;
          if(Math.min(mh1,mh2)>20){
            for(let r=0;r<2;r++){
              const rx=bx+6+r*13+_rs*4;
              const rElev=Math.min(mh1,mh2)*(0.15+(Math.sin(bx*0.31+r*5.1)*0.5+0.5)*0.55);
              if(rElev<_snowLine-8&&rElev>12){
                ctx.fillStyle='rgba(25,18,10,0.28)';
                ctx.beginPath();ctx.ellipse(rx,GROUND_LEVEL-rElev,2.5+r,1.8,0,0,Math.PI*2);ctx.fill();
                ctx.fillStyle='rgba(255,240,210,0.12)';
                ctx.beginPath();ctx.ellipse(rx-1,GROUND_LEVEL-rElev-1,1.2,0.8,0,0,Math.PI*2);ctx.fill();
              }
            }
          }

          // --- STRATIFICATION LINES (horizontal rock bands) ---
          ctx.strokeStyle='rgba(0,0,0,0.09)';ctx.lineWidth=0.7;
          const _topMin=Math.min(mh1,mh2);
          for(let cy=18;cy<_topMin-6;cy+=22){
            const j1=Math.sin(bx*0.018+cy*0.04)*2.5, j2=Math.sin((bx+30)*0.018+cy*0.04)*2.5;
            ctx.beginPath();ctx.moveTo(bx,GROUND_LEVEL-cy-j1);ctx.lineTo(bx+30,GROUND_LEVEL-cy-j2);ctx.stroke();
          }

          // --- TREE LINE: pine silhouettes on lower slopes ---
          for(let tt=0;tt<2;tt++){
            const tx=bx+7+tt*15;
            const tH=_mhTree(tx);
            const mH_here=_mhMid(tx);
            // Trees only on slopes below snowline and not where main mountain is too tall (looks embedded)
            if(tH>16&&tH<130&&mH_here<_snowLine){
              const ty=GROUND_LEVEL-Math.max(tH, Math.min(mH_here, tH+8))+1;
              const tsize=7+((Math.sin(tx*0.29)+1)*3);
              ctx.fillStyle='#1e2e18';
              // Lower tier
              ctx.beginPath();ctx.moveTo(tx,ty-tsize);ctx.lineTo(tx-tsize*0.42,ty);ctx.lineTo(tx+tsize*0.42,ty);ctx.closePath();ctx.fill();
              // Mid tier
              ctx.beginPath();ctx.moveTo(tx,ty-tsize*1.5);ctx.lineTo(tx-tsize*0.3,ty-tsize*0.45);ctx.lineTo(tx+tsize*0.3,ty-tsize*0.45);ctx.closePath();ctx.fill();
              // Top tier
              ctx.beginPath();ctx.moveTo(tx,ty-tsize*1.9);ctx.lineTo(tx-tsize*0.2,ty-tsize*1.1);ctx.lineTo(tx+tsize*0.2,ty-tsize*1.1);ctx.closePath();ctx.fill();
              // Trunk
              ctx.fillStyle='#2a1a0e';ctx.fillRect(tx-0.8,ty-1,1.6,3);
            }
          }
          // Draw cave entrances in mountains — large visible openings
          underwaterCaves.forEach(cave=>{cave.segments.forEach(seg=>{
            if(!seg.mountainEntrance)return;
            if(Math.abs(seg.x+seg.w/2-bx-15)>30)return;
            // Large dark cave opening
            const ex=seg.x+seg.w/2, ey=seg.y+seg.h/2;
            ctx.fillStyle='#08080e';
            ctx.beginPath();ctx.ellipse(ex,ey,seg.w/2+10,seg.h/2+8,0,0,Math.PI*2);ctx.fill();
            // Depth gradient inside
            const cg=ctx.createRadialGradient(ex,ey,0,ex,ey,seg.w/2);
            cg.addColorStop(0,'rgba(255,120,40,0.06)');cg.addColorStop(1,'transparent');
            ctx.fillStyle=cg;ctx.beginPath();ctx.ellipse(ex,ey,seg.w/2,seg.h/2,0,0,Math.PI*2);ctx.fill();
            // Stalactites at entrance
            for(let st=ex-seg.w/3;st<ex+seg.w/3;st+=12){
              const sh2=5+Math.sin(st*0.3)*4;
              ctx.fillStyle='#3a3028';
              ctx.beginPath();ctx.moveTo(st,ey-seg.h/2+5);ctx.lineTo(st+3,ey-seg.h/2+5+sh2);ctx.lineTo(st+6,ey-seg.h/2+5);ctx.fill();
            }
            // Rocky arch frame
            ctx.strokeStyle='#4a3a28';ctx.lineWidth=3;
            ctx.beginPath();ctx.ellipse(ex,ey,seg.w/2+12,seg.h/2+10,0,Math.PI,0);ctx.stroke();
            // "CAVE" hint when nearby
            const pd=Math.hypot(ex-(playerMode==='onfoot'?alien.x:ship.x),ey-(playerMode==='onfoot'?alien.y:ship.y));
            if(pd<300&&cave.discovered){
              ctx.fillStyle='rgba(255,200,100,0.4)';ctx.font='8px monospace';ctx.textAlign='center';
              ctx.fillText(cave.name,ex,ey-seg.h/2-8);
            }
          });});
        }
      }
    }
    // --- DRAW UNDERWATER OBJECTS (only when submerged) ---
    const _plyY = playerMode==='onfoot' ? alien.y : ship.y;
    if(underwaterObjects.length > 0 && _plyY > GROUND_LEVEL + 50) {
      const camL = camera.x - 100, camR = camera.x + canvas.width + 100;
      const camT = camera.y - 50, camB = camera.y + canvas.height + 50;
      underwaterObjects.forEach(obj => {
        if(obj.x < camL - 200 || obj.x > camR + 200) return;

        if(obj.type === 'seaweed') {
          const sway = Math.sin(_t * obj.speed + obj.phase) * 8;
          ctx.strokeStyle = obj.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(obj.x, obj.y);
          ctx.quadraticCurveTo(obj.x + sway, obj.y - obj.height * 0.5, obj.x + sway * 1.5, obj.y - obj.height);
          ctx.stroke();
          // Leaf blobs
          for(let i = 0; i < 3; i++) {
            const ly = obj.y - obj.height * (0.3 + i * 0.25);
            const lx = obj.x + sway * (0.3 + i * 0.25) + (i % 2 === 0 ? 6 : -6);
            ctx.fillStyle = obj.color; ctx.beginPath();
            ctx.ellipse(lx, ly, 5, 3, (i % 2 === 0 ? 0.3 : -0.3), 0, Math.PI * 2); ctx.fill();
          }
        }

        else if(obj.type === 'coral') {
          if(obj.shape === 0) {
            // Fan coral
            ctx.fillStyle = obj.color; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.moveTo(obj.x, obj.y);
            ctx.quadraticCurveTo(obj.x - obj.width / 2, obj.y - obj.height, obj.x, obj.y - obj.height);
            ctx.quadraticCurveTo(obj.x + obj.width / 2, obj.y - obj.height, obj.x, obj.y);
            ctx.fill(); ctx.globalAlpha = 1;
          } else if(obj.shape === 1) {
            // Brain coral (rounded blob)
            ctx.fillStyle = obj.color;
            ctx.beginPath(); ctx.ellipse(obj.x, obj.y - obj.height / 2, obj.width / 2, obj.height / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            // Texture lines
            ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
            for(let i = 0; i < 4; i++) {
              ctx.beginPath();
              ctx.arc(obj.x, obj.y - obj.height / 2, obj.width / 2 * (0.3 + i * 0.2), 0.5, Math.PI - 0.5);
              ctx.stroke();
            }
          } else {
            // Branch coral
            ctx.strokeStyle = obj.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
            for(let i = 0; i < 5; i++) {
              const bx = obj.x - obj.width / 2 + i * obj.width / 4;
              const bh = obj.height * (0.5 + Math.random() * 0.5);
              ctx.beginPath(); ctx.moveTo(bx, obj.y);
              ctx.lineTo(bx + (i - 2) * 3, obj.y - bh); ctx.stroke();
              ctx.fillStyle = obj.color; ctx.beginPath();
              ctx.arc(bx + (i - 2) * 3, obj.y - bh, 3, 0, Math.PI * 2); ctx.fill();
            }
          }
        }

        else if(obj.type === 'fishSchool') {
          obj.x += obj.dir * obj.speed;
          // Wrap within ocean
          if(obj.x > oceanBounds.to) obj.x = oceanBounds.from;
          if(obj.x < oceanBounds.from) obj.x = oceanBounds.to;
          for(let i = 0; i < obj.fishCount; i++) {
            const fx = obj.x + Math.sin(_t * 2 + i * 1.2) * obj.spread;
            const fy = obj.y + Math.cos(_t * 1.5 + i * 0.9) * obj.spread * 0.4;
            if(fx < camL || fx > camR || fy < camT || fy > camB) continue;
            ctx.fillStyle = obj.color;
            ctx.save(); ctx.translate(fx, fy); ctx.scale(obj.dir, 1);
            // Fish body
            ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
            // Tail
            ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-10, -3); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
            // Eye
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(3, -1, 1, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }

        else if(obj.type === 'jellyfish') {
          obj.y += Math.sin(_t * 0.8 + obj.phase) * 0.3 - 0.05;
          obj.x += obj.driftX;
          if(obj.y < GROUND_LEVEL + 30) obj.y = GROUND_LEVEL + 30;
          if(obj.y > SEABED_Y - 50) obj.y = SEABED_Y - 50;
          const pulse = 0.8 + Math.sin(_t * 2 + obj.phase) * 0.2;
          const s = obj.size;
          // Glow
          ctx.fillStyle = obj.color + '0.15)';
          ctx.beginPath(); ctx.arc(obj.x, obj.y, s * 2.5, 0, Math.PI * 2); ctx.fill();
          // Bell
          ctx.fillStyle = obj.color + '0.6)';
          ctx.beginPath(); ctx.ellipse(obj.x, obj.y, s * pulse, s * 0.7, 0, Math.PI, 0); ctx.fill();
          ctx.beginPath(); ctx.ellipse(obj.x, obj.y, s * pulse, s * 0.3, 0, 0, Math.PI); ctx.fill();
          // Tentacles
          ctx.strokeStyle = obj.color + '0.4)'; ctx.lineWidth = 1.5;
          for(let i = 0; i < 5; i++) {
            const tx = obj.x - s * 0.6 + i * s * 0.3;
            ctx.beginPath(); ctx.moveTo(tx, obj.y + s * 0.3);
            ctx.quadraticCurveTo(tx + Math.sin(_t + i) * 5, obj.y + s * 1.5, tx + Math.sin(_t * 0.7 + i) * 8, obj.y + s * 2.5);
            ctx.stroke();
          }
        }

        else if(obj.type === 'shipwreck') {
          const wx = obj.x, wy = obj.y;
          // Hull (broken)
          ctx.fillStyle = '#3a2a1a';
          ctx.beginPath(); ctx.moveTo(wx - 80, wy); ctx.lineTo(wx - 60, wy - 30);
          ctx.lineTo(wx + 50, wy - 35); ctx.lineTo(wx + 80, wy - 10);
          ctx.lineTo(wx + 80, wy); ctx.closePath(); ctx.fill();
          // Deck
          ctx.fillStyle = '#4a3a2a'; ctx.fillRect(wx - 55, wy - 35, 100, 5);
          // Broken mast
          ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(wx - 10, wy - 35); ctx.lineTo(wx - 20, wy - 70); ctx.stroke();
          // Tattered sail
          ctx.fillStyle = 'rgba(200,180,150,0.3)';
          ctx.beginPath(); ctx.moveTo(wx - 18, wy - 68); ctx.lineTo(wx + 10, wy - 55);
          ctx.lineTo(wx - 5, wy - 40); ctx.closePath(); ctx.fill();
          // Porthole
          ctx.fillStyle = 'rgba(50,80,100,0.5)';
          ctx.beginPath(); ctx.arc(wx - 30, wy - 15, 5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(wx + 10, wy - 15, 5, 0, Math.PI * 2); ctx.fill();
          // Barnacles
          ctx.fillStyle = '#6a7a6a';
          for(let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(wx - 40 + i * 18, wy - 5 + (i % 2) * 3, 2 + Math.random(), 0, Math.PI * 2); ctx.fill(); }
        }

        else if(obj.type === 'treasure') {
          const glow = 0.4 + Math.sin(_t * 2 + obj.phase) * 0.2;
          // Glow
          ctx.fillStyle = `rgba(255,200,0,${glow * 0.3})`;
          ctx.beginPath(); ctx.arc(obj.x, obj.y, 25, 0, Math.PI * 2); ctx.fill();
          // Chest
          ctx.fillStyle = '#6a3a1a'; ctx.fillRect(obj.x - 12, obj.y - 10, 24, 14);
          // Lid
          ctx.fillStyle = '#7a4a2a';
          ctx.beginPath(); ctx.ellipse(obj.x, obj.y - 10, 13, 5, 0, Math.PI, 0); ctx.fill();
          // Gold lock
          ctx.fillStyle = '#ffd700'; ctx.fillRect(obj.x - 3, obj.y - 8, 6, 5);
          // Gold coins spilling
          ctx.fillStyle = `rgba(255,215,0,${glow})`;
          ctx.beginPath(); ctx.arc(obj.x + 14, obj.y - 2, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(obj.x + 18, obj.y + 1, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(obj.x - 15, obj.y, 2, 0, Math.PI * 2); ctx.fill();
        }

        else if(obj.type === 'whale') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.x = oceanBounds.to; obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.x = oceanBounds.from; obj.dir = 1; }
          const wx = obj.x, wy = obj.y;
          ctx.save(); ctx.translate(wx, wy); ctx.scale(obj.dir, 1);
          // Body
          ctx.fillStyle = '#2a4a6a';
          ctx.beginPath(); ctx.ellipse(0, 0, 60, 22, 0, 0, Math.PI * 2); ctx.fill();
          // Belly (lighter)
          ctx.fillStyle = '#4a6a8a';
          ctx.beginPath(); ctx.ellipse(0, 6, 50, 14, 0, 0, Math.PI); ctx.fill();
          // Head
          ctx.fillStyle = '#2a4a6a';
          ctx.beginPath(); ctx.ellipse(55, -2, 18, 16, 0.1, 0, Math.PI * 2); ctx.fill();
          // Eye
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(62, -6, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#335'; ctx.beginPath(); ctx.arc(62, -6, 1.5, 0, Math.PI * 2); ctx.fill();
          // Mouth line
          ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(68, 2); ctx.quadraticCurveTo(55, 8, 40, 4); ctx.stroke();
          // Tail
          ctx.fillStyle = '#2a4a6a';
          ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-85, -18); ctx.lineTo(-80, 0); ctx.lineTo(-85, 18); ctx.closePath(); ctx.fill();
          // Fin
          ctx.beginPath(); ctx.moveTo(10, -20); ctx.lineTo(0, -35); ctx.lineTo(-10, -20); ctx.closePath(); ctx.fill();
          ctx.restore();
        }

        else if(obj.type === 'anglerfish') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.x = oceanBounds.to; obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.x = oceanBounds.from; obj.dir = 1; }
          const ax = obj.x, ay = obj.y;
          ctx.save(); ctx.translate(ax, ay); ctx.scale(obj.dir, 1);
          // Body (dark, menacing)
          ctx.fillStyle = '#1a1a2a';
          ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2); ctx.fill();
          // Giant mouth
          ctx.fillStyle = '#0a0a15';
          ctx.beginPath(); ctx.ellipse(15, 3, 12, 10, 0.1, 0, Math.PI * 2); ctx.fill();
          // Teeth
          ctx.fillStyle = '#ddd';
          for(let i = 0; i < 6; i++) {
            const ta = -0.8 + i * 0.32;
            const tx = 15 + Math.cos(ta) * 11, ty = 3 + Math.sin(ta) * 9;
            ctx.beginPath(); ctx.moveTo(tx, ty);
            ctx.lineTo(tx + Math.cos(ta) * 4, ty + Math.sin(ta) * 4);
            ctx.lineTo(tx + 2, ty); ctx.closePath(); ctx.fill();
          }
          // Eye (huge, glowing)
          ctx.fillStyle = '#ff4400'; ctx.beginPath(); ctx.arc(5, -6, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(5, -6, 2.5, 0, Math.PI * 2); ctx.fill();
          // Lure (bioluminescent)
          const lureGlow = 0.5 + Math.sin(_t * 3 + obj.phase) * 0.4;
          ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(0, -14);
          ctx.quadraticCurveTo(10, -30, 20, -25); ctx.stroke();
          // Lure light
          ctx.fillStyle = `rgba(100,255,200,${lureGlow})`;
          ctx.beginPath(); ctx.arc(20, -25, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(150,255,220,${lureGlow * 0.4})`;
          ctx.beginPath(); ctx.arc(20, -25, 12, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        else if(obj.type === 'ruin') {
          ctx.fillStyle = '#6a7a6a';
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
          // Column lines
          ctx.strokeStyle = 'rgba(100,120,100,0.3)'; ctx.lineWidth = 1;
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          if(obj.broken) {
            // Broken top
            ctx.fillStyle = '#5a6a5a';
            ctx.beginPath();
            ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x + obj.width * 0.3, obj.y - 5);
            ctx.lineTo(obj.x + obj.width * 0.7, obj.y - 2); ctx.lineTo(obj.x + obj.width, obj.y);
            ctx.closePath(); ctx.fill();
          } else {
            // Capital (top decoration)
            ctx.fillStyle = '#7a8a7a';
            ctx.fillRect(obj.x - 2, obj.y, obj.width + 4, 4);
            ctx.fillRect(obj.x - 2, obj.y + obj.height - 4, obj.width + 4, 4);
          }
        }

        else if(obj.type === 'bubbleSource') {
          obj.timer++;
          if(obj.timer >= obj.interval) {
            obj.timer = 0;
            // Add visual-only bubbles as particles
            for(let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
              particles.push({
                x: obj.x + (Math.random() - 0.5) * 20, y: obj.y,
                vx: (Math.random() - 0.5) * 0.3, vy: -0.5 - Math.random() * 1,
                life: 80 + Math.random() * 60,
                color: 'rgba(150,200,255,0.4)', size: 2 + Math.random() * 3
              });
            }
          }
        }

        else if(obj.type === 'kelp') {
          // Tall kelp stalk with leafy nodes
          const sway = Math.sin(_t * obj.speed + obj.phase) * 12;
          ctx.strokeStyle = obj.color; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(obj.x, obj.y);
          ctx.bezierCurveTo(obj.x + sway*0.4, obj.y - obj.height*0.4,
                            obj.x + sway*0.9, obj.y - obj.height*0.7,
                            obj.x + sway, obj.y - obj.height);
          ctx.stroke();
          // Leaf nodes
          for(let i = 1; i < 6; i++) {
            const t = i / 6;
            const lx = obj.x + sway * t;
            const ly = obj.y - obj.height * t;
            ctx.fillStyle = obj.color;
            ctx.beginPath();
            ctx.ellipse(lx + (i%2?8:-8), ly, 9, 3, (i%2?0.5:-0.5), 0, Math.PI*2);
            ctx.fill();
          }
        }

        else if(obj.type === 'starfish') {
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(obj.rot);
          ctx.fillStyle = obj.color;
          ctx.beginPath();
          for(let i = 0; i < 10; i++) {
            const r = i%2===0 ? obj.size : obj.size*0.42;
            const a = i * Math.PI / 5;
            const px = Math.cos(a) * r, py = Math.sin(a) * r;
            if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill();
          // Dots
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          for(let i = 0; i < 5; i++) {
            const a = i * Math.PI * 2 / 5;
            ctx.beginPath(); ctx.arc(Math.cos(a)*obj.size*0.5, Math.sin(a)*obj.size*0.5, 1, 0, Math.PI*2); ctx.fill();
          }
          ctx.restore();
        }

        else if(obj.type === 'crab') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.dir = 1; }
          const bob = Math.sin(_t * 6 + obj.phase) * 1;
          ctx.save(); ctx.translate(obj.x, obj.y + bob);
          ctx.fillStyle = obj.color;
          // Body
          ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI*2); ctx.fill();
          // Legs
          ctx.strokeStyle = obj.color; ctx.lineWidth = 1.5;
          for(let i = -1; i <= 1; i += 2) {
            for(let j = 0; j < 3; j++) {
              const la = 0.3 + j*0.4;
              ctx.beginPath();
              ctx.moveTo(i*6, 2);
              ctx.lineTo(i*(10 + Math.sin(_t*4+obj.phase+j)*1), 2 + j*2);
              ctx.lineTo(i*(12 + Math.sin(_t*4+obj.phase+j)*1), 7);
              ctx.stroke();
            }
          }
          // Claws
          ctx.beginPath(); ctx.ellipse(-13, -2, 4, 3, 0.3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(13, -2, 4, 3, -0.3, 0, Math.PI*2); ctx.fill();
          // Eyes
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(-3, -5, 1.2, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(3, -5, 1.2, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        }

        else if(obj.type === 'turtle') {
          obj.x += obj.dir * obj.speed;
          obj.y += Math.sin(_t * 1.2 + obj.phase) * 0.15;
          if(obj.x > oceanBounds.to) { obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.dir = 1; }
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.scale(obj.dir, 1);
          // Shell
          ctx.fillStyle = '#2a5a2a';
          ctx.beginPath(); ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI*2); ctx.fill();
          // Shell pattern
          ctx.fillStyle = '#3a7a3a';
          for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++) {
            if(i===0&&j===0) continue;
            ctx.beginPath(); ctx.arc(i*7, j*4, 2.5, 0, Math.PI*2); ctx.fill();
          }
          // Head
          ctx.fillStyle = '#5a7a3a';
          ctx.beginPath(); ctx.ellipse(18, -2, 6, 5, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(21, -3, 1, 0, Math.PI*2); ctx.fill();
          // Flippers
          ctx.fillStyle = '#4a6a2a';
          const fl = Math.sin(_t*2+obj.phase)*0.3;
          ctx.save(); ctx.translate(-8, -6); ctx.rotate(-0.4+fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(10, -8); ctx.rotate(-0.2+fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(-10, 6); ctx.rotate(0.3-fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.restore();
        }

        else if(obj.type === 'seaRock') {
          ctx.fillStyle = obj.color;
          ctx.beginPath();
          ctx.ellipse(obj.x, obj.y, obj.w, obj.h, 0, Math.PI, 0);
          ctx.fill();
          // Shading
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(obj.x+obj.w*0.3, obj.y-obj.h*0.2, obj.w*0.5, obj.h*0.5, 0, Math.PI, 0);
          ctx.fill();
        }

        else if(obj.type === 'shell') {
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(obj.rot);
          ctx.fillStyle = obj.color;
          ctx.beginPath(); ctx.ellipse(0, 0, obj.size, obj.size*0.7, 0, 0, Math.PI*2); ctx.fill();
          // Ridges
          ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.6;
          for(let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(-obj.size*0.8, 0);
            ctx.lineTo(obj.size*0.8, (i-1.5)*obj.size*0.25);
            ctx.stroke();
          }
          ctx.restore();
        }

        else if(obj.type === 'shark') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.dir = 1; }
          obj.y += Math.sin(_t*0.6+obj.phase) * 0.25;
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.scale(obj.dir, 1);
          // Body
          ctx.fillStyle = '#4a5a6a';
          ctx.beginPath();
          ctx.moveTo(-35, 0);
          ctx.quadraticCurveTo(-20, -10, 10, -8);
          ctx.quadraticCurveTo(30, -4, 35, 0);
          ctx.quadraticCurveTo(30, 4, 10, 8);
          ctx.quadraticCurveTo(-20, 10, -35, 0);
          ctx.fill();
          // Belly
          ctx.fillStyle = '#c0c8d0';
          ctx.beginPath();
          ctx.moveTo(-25, 4); ctx.quadraticCurveTo(0, 8, 25, 4);
          ctx.quadraticCurveTo(0, 6, -25, 4);
          ctx.fill();
          // Dorsal fin
          ctx.fillStyle = '#3a4a5a';
          ctx.beginPath();
          ctx.moveTo(-5, -8); ctx.lineTo(-2, -20); ctx.lineTo(8, -8);
          ctx.closePath(); ctx.fill();
          // Tail
          ctx.beginPath();
          ctx.moveTo(-35, 0); ctx.lineTo(-50, -12); ctx.lineTo(-45, 0); ctx.lineTo(-50, 12);
          ctx.closePath(); ctx.fill();
          // Side fin
          ctx.beginPath();
          ctx.moveTo(0, 6); ctx.lineTo(-10, 18); ctx.lineTo(8, 8);
          ctx.closePath(); ctx.fill();
          // Gill slits
          ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 1;
          for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(15+i*2, -4); ctx.lineTo(15+i*2, 4); ctx.stroke(); }
          // Eye
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(25, -3, 1.5, 0, Math.PI*2); ctx.fill();
          // Teeth (mouth)
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(28, 2); ctx.lineTo(34, 2); ctx.stroke();
          ctx.restore();
        }
      });
      // --- DRAW UNDERWATER CAVES (long tunnels under towns) ---
      // Only draw caves if player is inside a cave
      const _playerCaveX = playerMode==='onfoot' ? alien.x : ship.x;
      const _playerCaveY = playerMode==='onfoot' ? alien.y : ship.y;
      const _playerInCave = isInsideCave(_playerCaveX, _playerCaveY);
      if(!_playerInCave) { /* skip all cave rendering */ } else {
      const _parseHex = (c,o) => parseInt(c.slice(o,o+2),16)||0;
      underwaterCaves.forEach(cave => {
        const segs = cave.segments;
        const gr = _parseHex(cave.glowColor,1), gg = _parseHex(cave.glowColor,3), gb = _parseHex(cave.glowColor,5);

        segs.forEach((seg, si) => {
          // Frustum cull each segment
          if(seg.x + seg.w < camL - 50 || seg.x > camR + 50) return;
          if(seg.y + seg.h < camT - 50 || seg.y > camB + 50) return;

          const sx = seg.x, sy = seg.y, sw = seg.w, sh = seg.h;

          // --- Cave background: vertical gradient (dark at top, warm at bottom) ---
          const bgGrad = ctx.createLinearGradient(0, sy, 0, sy + sh);
          bgGrad.addColorStop(0, '#05040a');
          bgGrad.addColorStop(0.5, '#0a0810');
          bgGrad.addColorStop(1, '#060508');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(sx, sy, sw, sh);

          // --- Dappled back-wall rock texture (parallax depth) ---
          for(let py2 = sy+6; py2 < sy+sh-6; py2 += 14) {
            for(let px2 = sx+6; px2 < sx+sw-6; px2 += 18) {
              const n = Math.sin(px2*0.07 + py2*0.09 + si*1.7);
              if(n > 0.15) {
                ctx.fillStyle = `rgba(38,26,18,${0.1 + (n-0.15)*0.28})`;
                ctx.beginPath(); ctx.ellipse(px2, py2, 11+n*3, 6+n*2, n*2, 0, Math.PI*2); ctx.fill();
              }
            }
          }

          // --- Irregular ceiling silhouette ---
          ctx.fillStyle = '#13100a';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          for(let rx = sx; rx <= sx+sw; rx += 5) {
            const cn = Math.sin(rx*0.11 + si*2.3) + Math.sin(rx*0.34 + si*1.1)*0.55;
            ctx.lineTo(rx, sy + 4 + cn*3);
          }
          ctx.lineTo(sx+sw, sy); ctx.closePath(); ctx.fill();

          // --- Stalactites (varied organic tear-drop shapes) ---
          const stalCount = Math.max(2, Math.floor(sw/28));
          for(let i=0; i<stalCount; i++) {
            const rx = sx + 12 + i*(sw-24)/stalCount + Math.sin(i*7.3+si)*5;
            const rh = 9 + Math.abs(Math.sin(rx*0.13+si))*16;
            const rw = 2.5 + Math.abs(Math.sin(rx*0.27))*2.5;
            ctx.fillStyle = '#0e0b06';
            ctx.beginPath();
            ctx.moveTo(rx-rw, sy+3);
            ctx.quadraticCurveTo(rx, sy+rh*0.4, rx, sy+rh);
            ctx.quadraticCurveTo(rx, sy+rh*0.4, rx+rw, sy+3);
            ctx.closePath(); ctx.fill();
            // Subtle highlight on left edge
            ctx.strokeStyle = 'rgba(200,160,110,0.08)';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(rx-rw+0.4, sy+4);
            ctx.quadraticCurveTo(rx-0.4, sy+rh*0.4, rx-0.3, sy+rh-1);
            ctx.stroke();
            // Animated dripping water (wet caves only)
            if(!seg.dry && Math.sin(rx*0.3+si) > 0.5) {
              const dripPhase = ((_t*40 + rx*0.1) % 70);
              if(dripPhase < 40) {
                const dy = sy + rh + dripPhase*0.8;
                if(dy < sy+sh-6) {
                  ctx.fillStyle = 'rgba(120,200,230,0.65)';
                  ctx.beginPath();
                  ctx.ellipse(rx + Math.sin(dy*0.1)*0.5, dy, 0.9, 1.8, 0, 0, Math.PI*2);
                  ctx.fill();
                }
              }
            }
          }

          // --- Irregular floor silhouette ---
          ctx.fillStyle = '#13100a';
          ctx.beginPath();
          ctx.moveTo(sx, sy+sh);
          for(let rx = sx; rx <= sx+sw; rx += 5) {
            const cn = Math.sin(rx*0.10 + si*1.7) + Math.sin(rx*0.28 + si*0.9)*0.5;
            ctx.lineTo(rx, sy+sh - 4 - cn*3);
          }
          ctx.lineTo(sx+sw, sy+sh); ctx.closePath(); ctx.fill();

          // --- Stalagmites ---
          const stgCount = Math.max(1, Math.floor(sw/42));
          for(let i=0; i<stgCount; i++) {
            const rx = sx + 18 + i*(sw-36)/stgCount + Math.cos(i*5.7+si)*6;
            const rh = 8 + Math.abs(Math.cos(rx*0.17+si))*14;
            const rw = 2.8 + Math.abs(Math.cos(rx*0.3))*3;
            ctx.fillStyle = '#0e0b06';
            ctx.beginPath();
            ctx.moveTo(rx-rw, sy+sh-3);
            ctx.quadraticCurveTo(rx, sy+sh-rh*0.4, rx, sy+sh-rh);
            ctx.quadraticCurveTo(rx, sy+sh-rh*0.4, rx+rw, sy+sh-3);
            ctx.closePath(); ctx.fill();
          }

          // --- Gravel/rubble scattered on floor ---
          for(let i=0; i<Math.floor(sw/20); i++) {
            const rx = sx + 8 + i*20 + Math.sin(i*2.7+si)*4;
            const rr = 0.8 + Math.abs(Math.sin(rx*0.3))*1.4;
            ctx.fillStyle = 'rgba(55,40,25,0.55)';
            ctx.beginPath(); ctx.arc(rx, sy+sh-3-rr*0.3, rr, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(100,80,55,0.25)';
            ctx.beginPath(); ctx.arc(rx-0.3, sy+sh-3-rr*0.3-0.3, rr*0.4, 0, Math.PI*2); ctx.fill();
          }

          // --- Organic side walls (noise-based silhouette) ---
          ctx.fillStyle = '#0f0d07';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          for(let py = sy; py <= sy+sh; py += 6) {
            const ww = 4 + Math.sin(py*0.11 + si)*3 + Math.sin(py*0.27)*1.5;
            ctx.lineTo(sx+ww, py);
          }
          ctx.lineTo(sx, sy+sh); ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(sx+sw, sy);
          for(let py = sy; py <= sy+sh; py += 6) {
            const ww = 4 + Math.sin(py*0.13 + si*1.4)*3 + Math.cos(py*0.29)*1.5;
            ctx.lineTo(sx+sw-ww, py);
          }
          ctx.lineTo(sx+sw, sy+sh); ctx.closePath(); ctx.fill();

          // --- Mossy patches on ledges (green tint) ---
          for(let mi=0; mi<Math.floor(sw/90); mi++) {
            const mx = sx + 30 + mi*90 + Math.sin(mi*3.1+si)*15;
            if(Math.sin(mx*0.05+si) > 0.2) {
              ctx.fillStyle = 'rgba(60,110,50,0.35)';
              ctx.beginPath();
              ctx.ellipse(mx, sy+sh-6, 14, 2.5, 0, 0, Math.PI*2); ctx.fill();
              // Tiny moss blades
              ctx.strokeStyle = 'rgba(80,140,60,0.5)'; ctx.lineWidth = 0.6;
              for(let mb=0; mb<4; mb++) {
                const bx = mx - 6 + mb*3;
                ctx.beginPath();
                ctx.moveTo(bx, sy+sh-6);
                ctx.lineTo(bx + Math.sin(mb+si)*1.2, sy+sh-10);
                ctx.stroke();
              }
            }
          }

          // --- Wall-mounted torches with warm flickering halos (dry caves) ---
          if(seg.dry && sh > 60) {
            const tStep = 220;
            for(let tcx = sx + 100; tcx < sx + sw - 100; tcx += tStep) {
              const onLeft = Math.sin(tcx*0.02+si) > 0;
              const txp = onLeft ? tcx - Math.floor(tcx/tStep)%2*5 : tcx;
              const ty = sy + 25 + Math.abs(Math.sin(tcx*0.03))*15;
              // Bracket
              ctx.fillStyle = '#3e2a14';
              ctx.fillRect(txp-1, ty-2, 7, 3);
              ctx.fillStyle = '#5a3e1e';
              ctx.fillRect(txp+5, ty-3, 2, 5);
              // Flame
              const flick = Math.sin(_t*12 + txp)*0.35 + 0.75;
              ctx.fillStyle = `rgba(255,130,30,${flick*0.85})`;
              ctx.beginPath();
              ctx.ellipse(txp+7, ty-4, 2.5, 5.5+flick*2, 0, 0, Math.PI*2); ctx.fill();
              ctx.fillStyle = `rgba(255,220,80,${flick*0.85})`;
              ctx.beginPath();
              ctx.ellipse(txp+7, ty-3, 1.5, 3.5+flick, 0, 0, Math.PI*2); ctx.fill();
              // Warm light halo (huge)
              const halo = ctx.createRadialGradient(txp+7, ty-2, 0, txp+7, ty-2, 100);
              halo.addColorStop(0, `rgba(255,170,70,${0.22*flick})`);
              halo.addColorStop(0.5, `rgba(255,130,50,${0.08*flick})`);
              halo.addColorStop(1, 'rgba(255,130,50,0)');
              ctx.fillStyle = halo;
              ctx.fillRect(sx, Math.max(sy,ty-100), sw, Math.min(sh,200));
            }
          }

          // --- Ambient biome-tinted glow ---
          const aglow = 0.035 + Math.sin(_t * 0.8 + si * 1.7) * 0.02;
          ctx.fillStyle = `rgba(${gr},${gg},${gb},${aglow})`;
          ctx.fillRect(sx, sy, sw, sh);

          // --- Floating dust motes (adds atmosphere) ---
          for(let dm=0; dm<Math.floor(sw/150); dm++) {
            const dx = sx + 50 + dm*150 + (_t*5+dm*30) % (sw-100);
            const dy = sy + 20 + Math.sin(_t*0.6 + dm + si)*25 + Math.abs(Math.sin(dm+si))*(sh-50);
            ctx.fillStyle = `rgba(255,220,160,${0.15+Math.sin(_t*2+dm)*0.08})`;
            ctx.beginPath(); ctx.arc(dx, dy, 0.6, 0, Math.PI*2); ctx.fill();
          }

          // --- FEATURES per cave type ---
          // Scatter features based on segment index (deterministic from si)
          const seed = si * 137.5 + seg.x * 0.1;

          if(cave.featureType === 'crystals') {
            // Glowing crystal clusters on floor and ceiling
            for(let i = 0; i < Math.floor(sw / 60); i++) {
              const cx = sx + 30 + i * 60 + Math.sin(seed + i) * 20;
              const onCeiling = Math.sin(seed + i * 3) > 0.3;
              const cy = onCeiling ? sy + 8 : sy + sh - 5;
              const dir = onCeiling ? 1 : -1;
              const ch = 12 + Math.sin(seed + i * 2.3) * 8;
              const hue = 180 + ((si * 30 + i * 25) % 160);
              ctx.fillStyle = `hsla(${hue},80%,55%,${0.4 + Math.sin(_t + i + si) * 0.2})`;
              ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx, cy + dir * ch); ctx.lineTo(cx + 5, cy); ctx.closePath(); ctx.fill();
              ctx.beginPath(); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 6, cy + dir * ch * 0.7); ctx.lineTo(cx + 9, cy); ctx.closePath(); ctx.fill();
              // Crystal glow
              ctx.fillStyle = `hsla(${hue},80%,70%,${0.08 + Math.sin(_t * 1.5 + i) * 0.04})`;
              ctx.beginPath(); ctx.arc(cx, cy + dir * ch * 0.5, 15, 0, Math.PI*2); ctx.fill();
            }
            // Occasional large crystal formation in wide segments
            if(sw > 500 && si % 3 === 0) {
              const fx = sx + sw * 0.5, fy = sy + sh * 0.5;
              for(let j = 0; j < 5; j++) {
                const a = j * Math.PI * 2 / 5, r = 20 + Math.sin(seed + j) * 10;
                const hue = 200 + j * 30;
                ctx.fillStyle = `hsla(${hue},90%,60%,${0.5 + Math.sin(_t * 2 + j) * 0.2})`;
                ctx.beginPath(); ctx.moveTo(fx, fy);
                ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
                ctx.lineTo(fx + Math.cos(a + 0.3) * r * 0.4, fy + Math.sin(a + 0.3) * r * 0.4);
                ctx.closePath(); ctx.fill();
              }
              ctx.fillStyle = `rgba(${gr},${gg},${gb},${0.15 + Math.sin(_t * 2) * 0.08})`;
              ctx.beginPath(); ctx.arc(fx, fy, 40, 0, Math.PI*2); ctx.fill();
            }
          }

          else if(cave.featureType === 'bones') {
            // Scattered bones, ribcages, skulls
            for(let i = 0; i < Math.floor(sw / 80); i++) {
              const bx = sx + 40 + i * 80 + Math.sin(seed + i * 4) * 20;
              const by = sy + sh - 15;
              ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
              // Random bone type
              const bt = Math.floor(Math.abs(Math.sin(seed + i * 7)) * 3);
              if(bt === 0) {
                // Long bone
                ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 25, by - 5); ctx.stroke();
                ctx.fillStyle = '#8a7a6a'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + 25, by - 5, 3, 0, Math.PI*2); ctx.fill();
              } else if(bt === 1) {
                // Ribcage
                ctx.strokeStyle = '#7a6a5a'; ctx.lineWidth = 2;
                for(let r = 0; r < 4; r++) {
                  ctx.beginPath(); ctx.moveTo(bx + r * 8, by);
                  ctx.quadraticCurveTo(bx + r * 8 + 4, by - 20, bx + r * 8 + 2, by - 30); ctx.stroke();
                }
              } else {
                // Skull
                ctx.fillStyle = '#9a8a7a';
                ctx.beginPath(); ctx.ellipse(bx, by - 8, 10, 8, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath(); ctx.arc(bx - 3, by - 10, 2.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(bx + 3, by - 10, 2.5, 0, Math.PI*2); ctx.fill();
              }
            }
            // Occasional massive skeleton in wide segments
            if(sw > 500 && si % 4 === 1) {
              const fx = sx + sw * 0.4, fy = sy + sh * 0.5;
              ctx.strokeStyle = '#8a7a6a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
              // Spine
              ctx.beginPath(); ctx.moveTo(fx - 80, fy + 10); ctx.lineTo(fx + 80, fy + 10); ctx.stroke();
              // Ribs
              for(let r = 0; r < 8; r++) {
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(fx - 60 + r * 18, fy + 10);
                ctx.quadraticCurveTo(fx - 60 + r * 18 + 5, fy - 25, fx - 60 + r * 18, fy - 40); ctx.stroke();
              }
              // Giant skull
              ctx.fillStyle = '#9a8a7a';
              ctx.beginPath(); ctx.ellipse(fx + 100, fy, 30, 22, 0.15, 0, Math.PI*2); ctx.fill();
              ctx.fillStyle = '#1a1a1a';
              ctx.beginPath(); ctx.arc(fx + 93, fy - 5, 6, 0, Math.PI*2); ctx.fill();
              ctx.beginPath(); ctx.arc(fx + 107, fy - 5, 6, 0, Math.PI*2); ctx.fill();
              // Jaw
              ctx.strokeStyle = '#8a7a6a'; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(fx + 100, fy + 8, 18, 0.2, Math.PI - 0.2); ctx.stroke();
            }
          }

          else if(cave.featureType === 'ruins') {
            // Sunken columns, carved walls, golden artifacts
            for(let i = 0; i < Math.floor(sw / 100); i++) {
              const cx = sx + 50 + i * 100 + Math.sin(seed + i * 5) * 20;
              // Column
              ctx.fillStyle = '#5a5040';
              ctx.fillRect(cx, sy + 15, 10, sh - 30);
              // Capital + base
              ctx.fillStyle = '#6a6050';
              ctx.fillRect(cx - 2, sy + 12, 14, 5);
              ctx.fillRect(cx - 2, sy + sh - 17, 14, 5);
              // Hieroglyphs on column
              ctx.fillStyle = 'rgba(255,200,50,0.15)';
              for(let h = 0; h < 3; h++) ctx.fillRect(cx + 2, sy + 25 + h * (sh/4), 6, 8);
            }
            // Carved wall sections
            if(si % 2 === 0) {
              ctx.fillStyle = 'rgba(255,200,50,0.08)';
              for(let wx = sx + 20; wx < sx + sw - 20; wx += 40) {
                ctx.fillRect(wx, sy + 5, 15, 8);
                ctx.fillRect(wx + 5, sy + sh - 13, 15, 8);
              }
            }
            // Golden artifacts in wide segments
            if(sw > 500 && si % 3 === 0) {
              const fx = sx + sw * 0.5, fy = sy + sh - 20;
              // Sarcophagus
              ctx.fillStyle = '#b09040';
              ctx.fillRect(fx - 25, fy - 15, 50, 20);
              ctx.fillStyle = '#d0b060';
              ctx.fillRect(fx - 23, fy - 13, 46, 16);
              // Face on lid
              ctx.fillStyle = '#ffd700';
              ctx.beginPath(); ctx.ellipse(fx, fy - 8, 8, 6, 0, 0, Math.PI*2); ctx.fill();
              ctx.fillStyle = '#1a1a0a';
              ctx.beginPath(); ctx.arc(fx - 3, fy - 9, 1.5, 0, Math.PI*2); ctx.fill();
              ctx.beginPath(); ctx.arc(fx + 3, fy - 9, 1.5, 0, Math.PI*2); ctx.fill();
              // Gold glow
              ctx.fillStyle = `rgba(255,215,0,${0.1 + Math.sin(_t * 2 + si) * 0.05})`;
              ctx.beginPath(); ctx.arc(fx, fy - 5, 35, 0, Math.PI*2); ctx.fill();
            }
          }

          // Dry cave visual — sandy/dusty floor, no water tint, mushroom patches
          if(seg.dry) {
            // Dry sandy floor overlay
            ctx.fillStyle = 'rgba(90,70,40,0.15)';
            ctx.fillRect(sx, sy + sh - 12, sw, 12);
            // Small mushroom clusters
            for(let mx = sx + 30; mx < sx + sw - 30; mx += 70 + Math.sin(seed + mx * 0.1) * 30) {
              const mh = 6 + Math.sin(seed + mx * 0.2) * 4;
              const hue = 280 + ((mx * 7 + si * 40) % 80);
              ctx.fillStyle = `hsla(${hue},50%,40%,0.6)`;
              ctx.fillRect(mx, sy + sh - mh - 4, 2, mh);
              ctx.beginPath(); ctx.ellipse(mx + 1, sy + sh - mh - 5, 5, 3, 0, 0, Math.PI*2); ctx.fill();
            }
            // Glowing fungus patches on ceiling
            for(let fx = sx + 50; fx < sx + sw - 50; fx += 90 + Math.cos(seed + fx * 0.08) * 40) {
              ctx.fillStyle = `rgba(100,255,150,${0.06 + Math.sin(_t * 0.7 + fx * 0.01) * 0.03})`;
              ctx.beginPath(); ctx.ellipse(fx, sy + 6, 12, 4, 0, 0, Math.PI*2); ctx.fill();
            }
          }

          // Cave name label (when discovered, show in larger chambers)
          if(cave.discovered && sw > 400 && si % 4 === 0) {
            ctx.fillStyle = `rgba(${gr},${gg},${gb},0.4)`;
            ctx.font = '10px monospace'; ctx.textAlign = 'center';
            ctx.fillText(cave.name, sx + sw/2, sy + 16);
          }
        });
      });

      // Draw cave creatures
      caveCreatures.forEach(cc => {
        if(cc.collected) return;
        if(cc.x < camL - 40 || cc.x > camR + 40 || cc.y < camT - 40 || cc.y > camB + 40) return;
        const s = cc.size, cx = cc.x, cy = cc.y;
        const ap = cc.animPhase;
        const dir = cc.vx >= 0 ? 1 : -1;

        if(cc.type === 'slug') {
          // Fat glistening slug
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx, cy, 14*s, 6*s, 0, 0, Math.PI*2); ctx.fill();
          // Slime trail
          ctx.fillStyle = 'rgba(140,200,140,0.15)';
          ctx.fillRect(cx - dir*20*s, cy + 4*s, 25*s, 2*s);
          // Eye stalks
          ctx.strokeStyle = cc.color; ctx.lineWidth = 2*s;
          ctx.beginPath(); ctx.moveTo(cx + dir*10*s, cy - 4*s);
          ctx.lineTo(cx + dir*14*s, cy - 10*s + Math.sin(ap)*2*s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + dir*7*s, cy - 4*s);
          ctx.lineTo(cx + dir*11*s, cy - 10*s + Math.sin(ap+1)*2*s); ctx.stroke();
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(cx + dir*14*s, cy - 10*s + Math.sin(ap)*2*s, 2.5*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + dir*11*s, cy - 10*s + Math.sin(ap+1)*2*s, 2.5*s, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(cx + dir*14*s, cy - 10*s + Math.sin(ap)*2*s, 1.2*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + dir*11*s, cy - 10*s + Math.sin(ap+1)*2*s, 1.2*s, 0, Math.PI*2); ctx.fill();
          // Glistening spots
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath(); ctx.arc(cx - 3*s, cy - 3*s, 2*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 5*s, cy - 2*s, 1.5*s, 0, Math.PI*2); ctx.fill();
        }
        else if(cc.type === 'crawler') {
          // Multi-legged blind crawler
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx, cy - 5*s, 12*s, 7*s, 0, 0, Math.PI*2); ctx.fill();
          // Segmented body
          for(let i = -2; i <= 2; i++) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx + i*5*s, cy - 12*s); ctx.lineTo(cx + i*5*s, cy + 2*s); ctx.stroke();
          }
          // Many legs
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 1.5*s; ctx.lineCap = 'round';
          for(let i = 0; i < 6; i++) {
            const lx = cx - 10*s + i*4*s;
            const ly = cy + 2*s;
            const swing = Math.sin(ap + i*0.8)*3*s;
            ctx.beginPath(); ctx.moveTo(lx, cy - 2*s); ctx.lineTo(lx + swing, ly); ctx.stroke();
          }
          // No eyes — just smooth head bump
          ctx.fillStyle = cc.accent;
          ctx.beginPath(); ctx.ellipse(cx + dir*10*s, cy - 6*s, 5*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
          // Antennae
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 1*s;
          ctx.beginPath(); ctx.moveTo(cx + dir*14*s, cy - 8*s);
          ctx.lineTo(cx + dir*20*s, cy - 14*s + Math.sin(ap*2)*3*s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + dir*13*s, cy - 9*s);
          ctx.lineTo(cx + dir*18*s, cy - 16*s + Math.sin(ap*2+1)*3*s); ctx.stroke();
        }
        else if(cc.type === 'glowworm') {
          // Bioluminescent worm
          ctx.fillStyle = `rgba(64,255,128,${0.15 + Math.sin(ap)*0.1})`;
          ctx.beginPath(); ctx.arc(cx, cy, 18*s, 0, Math.PI*2); ctx.fill();
          // Body segments
          for(let i = 0; i < 5; i++) {
            const sx2 = cx - dir*(i*6*s), sy2 = cy + Math.sin(ap + i*0.5)*2*s;
            ctx.fillStyle = `hsla(${140 + i*10},100%,${60 - i*5}%,${0.8 - i*0.1})`;
            ctx.beginPath(); ctx.ellipse(sx2, sy2, (5-i)*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
          }
          // Bright head
          ctx.fillStyle = '#80ffa0';
          ctx.beginPath(); ctx.arc(cx + dir*3*s, cy, 3*s, 0, Math.PI*2); ctx.fill();
          // Tiny dot eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(cx + dir*5*s, cy - 1*s, 1*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + dir*5*s, cy + 1*s, 1*s, 0, Math.PI*2); ctx.fill();
        }
        else if(cc.type === 'beetle') {
          // Iridescent cave beetle
          const hue = 200 + Math.sin(ap)*30;
          ctx.fillStyle = `hsl(${hue},70%,40%)`;
          ctx.beginPath(); ctx.ellipse(cx, cy - 4*s, 8*s, 6*s, 0, 0, Math.PI*2); ctx.fill();
          // Shell line
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, cy - 10*s); ctx.lineTo(cx, cy + 2*s); ctx.stroke();
          // Shiny spots
          ctx.fillStyle = `hsla(${hue+40},80%,70%,0.4)`;
          ctx.beginPath(); ctx.ellipse(cx - 3*s, cy - 6*s, 2*s, 3*s, -0.3, 0, Math.PI*2); ctx.fill();
          // Legs
          ctx.strokeStyle = '#333'; ctx.lineWidth = 1*s;
          for(let i = 0; i < 3; i++) {
            const lx = cx - 6*s + i*6*s;
            ctx.beginPath(); ctx.moveTo(lx, cy); ctx.lineTo(lx - 4*s + Math.sin(ap+i)*2*s, cy + 5*s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lx, cy); ctx.lineTo(lx + 4*s - Math.sin(ap+i)*2*s, cy + 5*s); ctx.stroke();
          }
          // Head + mandibles
          ctx.fillStyle = '#333';
          ctx.beginPath(); ctx.ellipse(cx + dir*8*s, cy - 4*s, 3*s, 3*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5*s;
          ctx.beginPath(); ctx.moveTo(cx + dir*11*s, cy - 5*s); ctx.lineTo(cx + dir*14*s, cy - 7*s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + dir*11*s, cy - 3*s); ctx.lineTo(cx + dir*14*s, cy - 1*s); ctx.stroke();
        }
        else if(cc.type === 'spider') {
          // Pale cave spider
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx, cy - 5*s, 6*s, 5*s, 0, 0, Math.PI*2); ctx.fill();
          // Abdomen
          ctx.beginPath(); ctx.ellipse(cx - dir*8*s, cy - 4*s, 8*s, 6*s, 0, 0, Math.PI*2); ctx.fill();
          // 8 legs
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 1.2*s; ctx.lineCap = 'round';
          for(let i = 0; i < 4; i++) {
            const base = cx + (i-1.5)*3*s;
            const knee = 10*s + Math.sin(ap + i*0.7)*3*s;
            // Left
            ctx.beginPath(); ctx.moveTo(base, cy - 3*s);
            ctx.quadraticCurveTo(base - knee, cy - 10*s, base - knee*0.8, cy + 3*s); ctx.stroke();
            // Right
            ctx.beginPath(); ctx.moveTo(base, cy - 3*s);
            ctx.quadraticCurveTo(base + knee, cy - 10*s, base + knee*0.8, cy + 3*s); ctx.stroke();
          }
          // Many eyes (8 tiny dots)
          ctx.fillStyle = '#f88';
          for(let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.arc(cx + dir*(4+i%2)*s, cy - (6+Math.floor(i/2)*2)*s, 1*s, 0, Math.PI*2); ctx.fill();
          }
        }
        else if(cc.type === 'mushcrab') {
          // Crab with mushroom cap on its back
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx, cy - 2*s, 8*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
          // Mushroom cap
          ctx.fillStyle = '#d06040';
          ctx.beginPath(); ctx.ellipse(cx, cy - 8*s, 10*s, 5*s, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#e08060';
          ctx.beginPath(); ctx.ellipse(cx, cy - 8*s, 10*s, 5*s, 0, 0, Math.PI); ctx.fill();
          // Spots on cap
          ctx.fillStyle = '#ffc080';
          ctx.beginPath(); ctx.arc(cx - 4*s, cy - 10*s, 2*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 3*s, cy - 9*s, 1.5*s, 0, Math.PI*2); ctx.fill();
          // Legs
          ctx.strokeStyle = cc.color; ctx.lineWidth = 1.5*s;
          for(let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(cx - 7*s, cy); ctx.lineTo(cx - (10+i*3)*s, cy + 4*s + Math.sin(ap+i)*2*s); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + 7*s, cy); ctx.lineTo(cx + (10+i*3)*s, cy + 4*s + Math.sin(ap+i+2)*2*s); ctx.stroke();
          }
          // Claws
          ctx.fillStyle = cc.accent;
          ctx.beginPath(); ctx.ellipse(cx + dir*12*s, cy + 1*s, 4*s, 2*s, dir*0.5, 0, Math.PI*2); ctx.fill();
          // Eyes on stalks
          ctx.strokeStyle = cc.color; ctx.lineWidth = 1.5*s;
          ctx.beginPath(); ctx.moveTo(cx - 3*s, cy - 4*s); ctx.lineTo(cx - 5*s, cy - 10*s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + 3*s, cy - 4*s); ctx.lineTo(cx + 5*s, cy - 10*s); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(cx - 5*s, cy - 10*s, 1.5*s, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 5*s, cy - 10*s, 1.5*s, 0, Math.PI*2); ctx.fill();
        }
        else if(cc.type === 'newt') {
          // Pink cave newt
          ctx.fillStyle = cc.color;
          // Body
          ctx.beginPath(); ctx.ellipse(cx, cy - 3*s, 10*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
          // Tail
          ctx.strokeStyle = cc.color; ctx.lineWidth = 3*s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx - dir*10*s, cy - 3*s);
          ctx.quadraticCurveTo(cx - dir*18*s, cy - 6*s + Math.sin(ap)*3*s, cx - dir*22*s, cy - 3*s); ctx.stroke();
          // Head
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx + dir*10*s, cy - 4*s, 5*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
          // Legs (tiny)
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 1.5*s;
          ctx.beginPath(); ctx.moveTo(cx - 5*s, cy); ctx.lineTo(cx - 8*s, cy + 4*s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + 5*s, cy); ctx.lineTo(cx + 8*s, cy + 4*s); ctx.stroke();
          // Big cute eyes
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(cx + dir*12*s, cy - 6*s, 3*s, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(cx + dir*12.5*s, cy - 6.5*s, 1.2*s, 0, Math.PI*2); ctx.fill();
          // External gills (feathery things on head)
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 1*s;
          for(let i = 0; i < 3; i++) {
            const ga = -0.5 + i*0.5;
            ctx.beginPath(); ctx.moveTo(cx + dir*8*s, cy - 6*s);
            ctx.lineTo(cx + dir*8*s + Math.cos(ga)*6*s, cy - 6*s + Math.sin(ga)*6*s + Math.sin(ap+i)*1.5*s); ctx.stroke();
          }
        }
        else if(cc.type === 'eel') {
          // Long pale eyeless eel
          ctx.strokeStyle = cc.color; ctx.lineWidth = 5*s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx + dir*15*s, cy - 2*s);
          for(let i = 0; i < 6; i++) {
            ctx.lineTo(cx - dir*i*6*s, cy - 2*s + Math.sin(ap + i*0.8)*4*s);
          }
          ctx.stroke();
          // Lighter belly
          ctx.strokeStyle = cc.accent; ctx.lineWidth = 2*s;
          ctx.beginPath(); ctx.moveTo(cx + dir*14*s, cy);
          for(let i = 0; i < 5; i++) {
            ctx.lineTo(cx - dir*i*6*s, cy + Math.sin(ap + i*0.8)*4*s);
          }
          ctx.stroke();
          // Head
          ctx.fillStyle = cc.color;
          ctx.beginPath(); ctx.ellipse(cx + dir*16*s, cy - 2*s, 5*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
          // No eyes — just a mouth slit
          ctx.strokeStyle = '#444'; ctx.lineWidth = 1*s;
          ctx.beginPath(); ctx.moveTo(cx + dir*20*s, cy - 2*s);
          ctx.lineTo(cx + dir*22*s, cy - 1*s); ctx.stroke();
          // Faint glow
          ctx.fillStyle = 'rgba(100,100,150,0.08)';
          ctx.beginPath(); ctx.arc(cx, cy, 20*s, 0, Math.PI*2); ctx.fill();
        }

        // Label when being beamed
        if(cc.beingBeamed) {
          ctx.fillStyle = 'rgba(0,255,0,0.7)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
          ctx.fillText(cc.label, cx, cy - 18*s);
        }
      });
    } // end _playerInCave else
    }
  }else{
    const gg=ctx.createLinearGradient(0,GROUND_LEVEL,0,GROUND_LEVEL+200);gg.addColorStop(0,p.groundColor[0]);gg.addColorStop(0.3,p.groundColor[1]);gg.addColorStop(1,p.groundColor[2]);
    ctx.fillStyle=gg;ctx.fillRect(camera.x-200,GROUND_LEVEL,canvas.width+400,canvas.height+Math.abs(camera.y));
    ctx.strokeStyle=p.grassColor;for(let gx=Math.floor(camera.x/30)*30;gx<camera.x+canvas.width;gx+=30){ctx.beginPath();ctx.moveTo(gx,GROUND_LEVEL);ctx.lineTo(gx-3,GROUND_LEVEL-5);ctx.moveTo(gx,GROUND_LEVEL);ctx.lineTo(gx+3,GROUND_LEVEL-6);ctx.stroke();}
  }
  // Blocks (single-unit buildings)
  blocks.forEach(b=>{if(b.dead)return;const sx=b.x,sy=b.y;if(sx+b.w<camera.x-50||sx>camera.x+canvas.width+50||sy+b.h<camera.y-50||sy>camera.y+canvas.height+50)return;
    // Explosion animation
    if(b.exploding){
      b.explodeTimer--;
      ctx.globalAlpha=Math.max(0.1,b.explodeTimer/50);
      const shake=(Math.random()-0.5)*(b.explodeTimer/8);
      ctx.save(); ctx.translate(shake,shake);
      drawBuildingUnit(b);
      ctx.restore(); ctx.globalAlpha=1;
      if(b.explodeTimer<=0) b.dead=true;
      return;
    }
    drawBuildingUnit(b);
  });
  debris.forEach(d=>{ctx.fillStyle=d.color;ctx.globalAlpha=d.life/60;ctx.fillRect(d.x,d.y,d.size,d.size);ctx.globalAlpha=1;});

  // --- DRAW INHABITANTS (with frustum culling) ---
  const _limb=(x1,y1,x2,y2,col,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  humans.forEach(h=>{if(h.collected||h.hidden)return;
    if(h.bodyX<camera.x-60||h.bodyX>camera.x+canvas.width+60||h.bodyY<camera.y-80||h.bodyY>camera.y+canvas.height+40)return;
    const s=h.scale||1,bw=h.bodyWidth||5;
    const limb=_limb;
    const legW=bw>7?4:bw<4?2:3;
    // Legs
    limb(h.bodyX-2*s,h.bodyY+5*s,h.legLX,h.legLY,h.isAlien?h.color:'#335',legW);
    limb(h.bodyX+2*s,h.bodyY+5*s,h.legRX,h.legRY,h.isAlien?h.color:'#335',legW);
    limb(h.legLX,h.legLY,h.footLX,h.footLY,h.isAlien?h.color:'#335',legW-0.5);
    limb(h.legRX,h.legRY,h.footRX,h.footRY,h.isAlien?h.color:'#335',legW-0.5);
    // Body
    limb(h.bodyX,h.bodyY-2*s,h.bodyX,h.bodyY+6*s,h.color,bw);
    // Belly
    if(h.extra==='belly'||bw>=9){ctx.fillStyle=h.color;ctx.beginPath();ctx.ellipse(h.bodyX,h.bodyY+4*s,8,6,0,0,Math.PI*2);ctx.fill();}
    // Tail for Infernia aliens
    if(h.alienExtra==='tail'){ctx.strokeStyle=h.skinColor;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(h.bodyX,h.bodyY+6*s);ctx.quadraticCurveTo(h.bodyX-12*s,h.bodyY+10*s,h.bodyX-8*s,h.bodyY+2*s);ctx.stroke();
      ctx.fillStyle='#f40';ctx.beginPath();ctx.arc(h.bodyX-8*s,h.bodyY+2*s,2,0,Math.PI*2);ctx.fill();}
    // Arms
    const at=h.beingBeamed?-10*s:8*s;
    limb(h.bodyX,h.bodyY,h.armLX,h.armLY+at,h.skinColor,2*s);
    limb(h.bodyX,h.bodyY,h.armRX,h.armRY+at,h.skinColor,2*s);
    // Extras
    if(h.extra==='briefcase'&&!h.ragdoll){ctx.fillStyle='#530';ctx.fillRect(h.armRX+2,h.armRY+at-2,6,5);}
    if(h.extra==='chain'){ctx.strokeStyle='#fc0';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(h.bodyX,h.bodyY-1,5,0.3,Math.PI-0.3);ctx.stroke();}
    if(h.extra==='cross'){ctx.strokeStyle='#fc0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(h.bodyX,h.bodyY-5*s);ctx.lineTo(h.bodyX,h.bodyY+2*s);ctx.moveTo(h.bodyX-3,h.bodyY-2*s);ctx.lineTo(h.bodyX+3,h.bodyY-2*s);ctx.stroke();}
    if(h.extra==='backpack'){ctx.fillStyle='#f44';ctx.fillRect(h.bodyX-5,h.bodyY-2*s,4,8*s);}
    if(h.extra==='cane'&&!h.ragdoll){ctx.strokeStyle='#a86';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(h.armRX+4,h.armRY+at);ctx.lineTo(h.armRX+6,h.footRY);ctx.stroke();}
    // Neck
    limb(h.bodyX,h.bodyY-2*s,h.headX,h.headY+h.headR*0.7,h.skinColor,2*s);
    // Head
    ctx.fillStyle=h.skinColor;
    if(h.alienHeadShape==='tall'){ctx.beginPath();ctx.ellipse(h.headX,h.headY,h.headR*0.7,h.headR*1.3,0,0,Math.PI*2);ctx.fill();}
    else if(h.alienHeadShape==='wide'){ctx.beginPath();ctx.ellipse(h.headX,h.headY,h.headR*1.3,h.headR*0.8,0,0,Math.PI*2);ctx.fill();}
    else if(h.alienHeadShape==='egyptian'){
      // Pharaoh-style elongated head
      ctx.beginPath();ctx.ellipse(h.headX,h.headY,h.headR*0.8,h.headR*1.2,0,0,Math.PI*2);ctx.fill();
      // Nemes headdress (side flaps)
      ctx.fillStyle=`hsl(45,70%,50%)`;
      ctx.beginPath();ctx.moveTo(h.headX-h.headR*0.9,h.headY-h.headR*0.3);ctx.lineTo(h.headX-h.headR*1.4,h.headY+h.headR*1.5);ctx.lineTo(h.headX-h.headR*0.5,h.headY+h.headR*0.8);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(h.headX+h.headR*0.9,h.headY-h.headR*0.3);ctx.lineTo(h.headX+h.headR*1.4,h.headY+h.headR*1.5);ctx.lineTo(h.headX+h.headR*0.5,h.headY+h.headR*0.8);ctx.closePath();ctx.fill();
      // Gold band on forehead
      ctx.fillStyle='#ffd700';ctx.fillRect(h.headX-h.headR*0.8,h.headY-h.headR*0.6,h.headR*1.6,h.headR*0.3);
      // Uraeus (cobra on forehead)
      ctx.fillStyle='#ffd700';ctx.beginPath();ctx.moveTo(h.headX,h.headY-h.headR*0.6);ctx.lineTo(h.headX-h.headR*0.2,h.headY-h.headR*1.4);ctx.lineTo(h.headX+h.headR*0.2,h.headY-h.headR*1.4);ctx.closePath();ctx.fill();
      ctx.fillStyle=h.skinColor;
    }
    else if(h.alienHeadShape==='pointy'){ctx.beginPath();ctx.moveTo(h.headX,h.headY-h.headR*1.4);ctx.lineTo(h.headX-h.headR,h.headY+h.headR*0.5);ctx.lineTo(h.headX+h.headR,h.headY+h.headR*0.5);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR*0.7,0,Math.PI*2);ctx.fill();}
    else{ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR,0,Math.PI*2);ctx.fill();}
    // Alien antennae (Glimora)
    if(h.alienExtra==='antennae'){ctx.strokeStyle=h.skinColor;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(h.headX-3,h.headY-h.headR);ctx.quadraticCurveTo(h.headX-8,h.headY-h.headR*2.5,h.headX-5,h.headY-h.headR*2);ctx.stroke();ctx.beginPath();ctx.moveTo(h.headX+3,h.headY-h.headR);ctx.quadraticCurveTo(h.headX+8,h.headY-h.headR*2.5,h.headX+5,h.headY-h.headR*2);ctx.stroke();
      ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(h.headX-5,h.headY-h.headR*2,2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX+5,h.headY-h.headR*2,2,0,Math.PI*2);ctx.fill();}
    // Alien horns (Frostheim)
    if(h.alienExtra==='horns'){ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(h.headX-h.headR,h.headY-2);ctx.lineTo(h.headX-h.headR-6,h.headY-h.headR*1.5);ctx.lineTo(h.headX-h.headR+4,h.headY-2);ctx.fill();ctx.beginPath();ctx.moveTo(h.headX+h.headR,h.headY-2);ctx.lineTo(h.headX+h.headR+6,h.headY-h.headR*1.5);ctx.lineTo(h.headX+h.headR-4,h.headY-2);ctx.fill();}
    // Human hats
    if(h.hat==='collar'){ctx.fillStyle='#fff';ctx.fillRect(h.headX-4,h.headY+h.headR-2,8,3);}
    if(h.hat==='cap'){ctx.fillStyle='#222';ctx.beginPath();ctx.ellipse(h.headX,h.headY-h.headR+2,h.headR+3,4,0,Math.PI,0);ctx.fill();ctx.fillRect(h.headX-h.headR-3,h.headY-h.headR+1,h.headR*2+6,3);}
    if(h.hat==='bun'){ctx.fillStyle='#ccc';ctx.beginPath();ctx.arc(h.headX,h.headY-h.headR+1,5,0,Math.PI*2);ctx.fill();}
    if(h.hat==='headband'){ctx.strokeStyle='#f00';ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR+1,Math.PI+0.3,-0.3);ctx.stroke();}
    if(h.hat==='feather'){
      // Indigenous feather headdress
      ctx.fillStyle='#a06020';ctx.fillRect(h.headX-h.headR-1,h.headY-h.headR+2,h.headR*2+2,3);
      const feathers=['#c00','#fc0','#0a0','#c00','#fc0'];
      feathers.forEach((fc,fi)=>{const fx=h.headX-h.headR+fi*(h.headR*2/4);ctx.fillStyle=fc;ctx.beginPath();ctx.moveTo(fx,h.headY-h.headR+2);ctx.lineTo(fx-2,h.headY-h.headR-10-fi%2*4);ctx.lineTo(fx+2,h.headY-h.headR-10-fi%2*4);ctx.closePath();ctx.fill();});
    }
    // Eyes
    const er=h.headR/8;
    if(h.isAlien){
      // Alien eyes - bigger, glowing
      const eyeColor=h.crying?'#f00':'#0ff';
      ctx.fillStyle=eyeColor;ctx.beginPath();ctx.ellipse(h.headX-3*er,h.headY-1*er,2*er,1.5*er,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(h.headX+3*er,h.headY-1*er,2*er,1.5*er,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(h.headX-3*er,h.headY-1*er,0.8*er,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX+3*er,h.headY-1*er,0.8*er,0,Math.PI*2);ctx.fill();
      if(h.crying){ctx.beginPath();ctx.ellipse(h.headX,h.headY+3*er,2*er,(1.5+h.panicLevel*0.2)*er,0,0,Math.PI*2);ctx.fillStyle='#300';ctx.fill();}
    }else{
      if(h.crying||h.panicLevel>1){ctx.fillStyle='#000';ctx.fillRect(h.headX-4*er,h.headY-2*er,3*er,1.5*er);ctx.fillRect(h.headX+1*er,h.headY-2*er,3*er,1.5*er);ctx.beginPath();ctx.ellipse(h.headX,h.headY+4*er,3*er,(2+h.panicLevel*0.3)*er,0,0,Math.PI*2);ctx.fillStyle='#300';ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(h.headX-5*er,h.headY-5*er);ctx.lineTo(h.headX-2*er,h.headY-4*er);ctx.moveTo(h.headX+5*er,h.headY-5*er);ctx.lineTo(h.headX+2*er,h.headY-4*er);ctx.stroke();}
      else{ctx.fillStyle='#000';ctx.beginPath();ctx.arc(h.headX-3*er,h.headY-1*er,er,0,Math.PI*2);ctx.arc(h.headX+3*er,h.headY-1*er,er,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX,h.headY+2*er,2*er,0,Math.PI);ctx.strokeStyle='#000';ctx.lineWidth=0.5;ctx.stroke();}
    }
    // Label when beamed
    if(h.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(h.label,h.headX,h.headY-h.headR-8);}
  });

  // --- DRAW COWS ---
  cows.forEach(c=>{
    if(c.collected)return;
    if(c.x<camera.x-80||c.x>camera.x+canvas.width+80)return;
    const s=c.size, cx=c.x, cy=c.wack==='hover'?c.bodyY+15*s:c.y;
    const by=c.bodyY, legY=cy;
    const wt=c.legAnim, tt=c.tailAnim;
    const dir=c.walkDir;

    // Anubis hound - completely different drawing
    if(c.wack==='anubis'){
      ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,14*s,3*s,0,0,Math.PI*2);ctx.fill();
      // Body (sleek jackal)
      ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(cx,by,16*s,9*s,0,0,Math.PI*2);ctx.fill();
      // Legs (thin, elegant)
      ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-8*s,by+5*s);ctx.lineTo(cx-9*s+Math.sin(wt)*2*s,legY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx-3*s,by+5*s);ctx.lineTo(cx-3*s-Math.sin(wt)*2*s,legY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+3*s,by+5*s);ctx.lineTo(cx+3*s+Math.sin(wt+1)*2*s,legY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+8*s,by+5*s);ctx.lineTo(cx+9*s-Math.sin(wt+1)*2*s,legY);ctx.stroke();
      // Head (jackal snout)
      const hx2=cx+dir*16*s,hy2=by-8*s;
      ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(hx2,hy2,7*s,6*s,dir*0.2,0,Math.PI*2);ctx.fill();
      // Long snout
      ctx.beginPath();ctx.ellipse(hx2+dir*7*s,hy2+2*s,5*s,3*s,dir*0.1,0,Math.PI*2);ctx.fill();
      // Tall ears (pointed, jackal-like)
      ctx.beginPath();ctx.moveTo(hx2-3*s,hy2-5*s);ctx.lineTo(hx2-1*s,hy2-14*s);ctx.lineTo(hx2+1*s,hy2-5*s);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(hx2+1*s,hy2-5*s);ctx.lineTo(hx2+3*s,hy2-14*s);ctx.lineTo(hx2+5*s,hy2-5*s);ctx.closePath();ctx.fill();
      // Gold eye (glowing)
      ctx.fillStyle='#ffd700';ctx.beginPath();ctx.arc(hx2+dir*3*s,hy2-2*s,2.5*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(hx2+dir*3*s,hy2-2*s,1.2*s,0,Math.PI*2);ctx.fill();
      // Gold collar/necklace
      ctx.strokeStyle='#ffd700';ctx.lineWidth=2*s;
      ctx.beginPath();ctx.arc(hx2-dir*5*s,hy2+4*s,6*s,0,Math.PI);ctx.stroke();
      // Gold spots (markings)
      ctx.fillStyle=c.spots;
      ctx.fillRect(cx-2*s,by-6*s,4*s,2*s);ctx.fillRect(cx+5*s,by-3*s,3*s,2*s);
      // Tail (curved upward, jackal style)
      ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;
      const tailX=cx-dir*15*s,tailY=by-4*s;
      ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.quadraticCurveTo(tailX-dir*6*s,tailY-15*s,tailX-dir*3*s,tailY-12*s);ctx.stroke();
      if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-18*s);}
      return; // skip normal cow drawing
    }

    // Monkey — completely different drawing
    if(c.wack==='monkey'){
      ctx.fillStyle='rgba(0,0,0,0.15)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,10*s,3*s,0,0,Math.PI*2);ctx.fill();
      // Legs (shorter, bent)
      ctx.strokeStyle=c.color;ctx.lineWidth=3*s;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-4*s,by+5*s);ctx.lineTo(cx-5*s+Math.sin(wt)*2*s,legY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+4*s,by+5*s);ctx.lineTo(cx+5*s-Math.sin(wt)*2*s,legY);ctx.stroke();
      // Feet
      ctx.fillStyle=c.spots;
      ctx.beginPath();ctx.ellipse(cx-5*s+Math.sin(wt)*2*s,legY,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(cx+5*s-Math.sin(wt)*2*s,legY,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
      // Body (rounder, upright)
      ctx.fillStyle=c.color;
      ctx.beginPath();ctx.ellipse(cx,by,10*s,12*s,0,0,Math.PI*2);ctx.fill();
      // Belly (lighter)
      ctx.fillStyle=c.spots;
      ctx.beginPath();ctx.ellipse(cx,by+2*s,6*s,8*s,0,0,Math.PI*2);ctx.fill();
      // Arms (swinging)
      ctx.strokeStyle=c.color;ctx.lineWidth=3*s;
      const armSwing=Math.sin(tt*2)*5*s;
      ctx.beginPath();ctx.moveTo(cx-9*s,by-4*s);ctx.lineTo(cx-14*s+armSwing,by+4*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+9*s,by-4*s);ctx.lineTo(cx+14*s-armSwing,by+4*s);ctx.stroke();
      // Hands
      ctx.fillStyle=c.spots;
      ctx.beginPath();ctx.arc(cx-14*s+armSwing,by+4*s,2.5*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(cx+14*s-armSwing,by+4*s,2.5*s,0,Math.PI*2);ctx.fill();
      // Head
      const hx=cx,hy=by-14*s;
      ctx.fillStyle=c.color;
      ctx.beginPath();ctx.ellipse(hx,hy,9*s,8*s,0,0,Math.PI*2);ctx.fill();
      // Face (lighter muzzle area)
      ctx.fillStyle='#d9a070';
      ctx.beginPath();ctx.ellipse(hx,hy+2*s,6*s,5*s,0,0,Math.PI*2);ctx.fill();
      // Eyes
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.ellipse(hx-3*s,hy-1*s,2.5*s,2*s,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(hx+3*s,hy-1*s,2.5*s,2*s,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#2a1a0a';
      ctx.beginPath();ctx.arc(hx-3*s,hy-1*s,1.2*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+3*s,hy-1*s,1.2*s,0,Math.PI*2);ctx.fill();
      // Eyebrows
      ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1.5*s;
      ctx.beginPath();ctx.moveTo(hx-5*s,hy-3*s);ctx.lineTo(hx-1*s,hy-3.5*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(hx+1*s,hy-3.5*s);ctx.lineTo(hx+5*s,hy-3*s);ctx.stroke();
      // Nostrils
      ctx.fillStyle='#4a3020';
      ctx.beginPath();ctx.arc(hx-1.5*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+1.5*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
      // Mouth
      ctx.strokeStyle='#5a3a20';ctx.lineWidth=1*s;
      ctx.beginPath();ctx.arc(hx,hy+4.5*s,2.5*s,0.2,Math.PI-0.2);ctx.stroke();
      // Ears (round)
      ctx.fillStyle=c.color;
      ctx.beginPath();ctx.arc(hx-9*s,hy-2*s,4*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+9*s,hy-2*s,4*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d9a070';
      ctx.beginPath();ctx.arc(hx-9*s,hy-2*s,2.5*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+9*s,hy-2*s,2.5*s,0,Math.PI*2);ctx.fill();
      // Long curly tail
      ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;
      ctx.beginPath();ctx.moveTo(cx-dir*8*s,by+6*s);
      ctx.quadraticCurveTo(cx-dir*18*s,by-5*s+Math.sin(tt)*4*s,cx-dir*15*s,by-15*s+Math.sin(tt*0.8)*3*s);
      ctx.stroke();
      // Tail tip curl
      ctx.beginPath();ctx.arc(cx-dir*15*s,by-15*s+Math.sin(tt*0.8)*3*s,2*s,0,Math.PI*2);ctx.fill();

      if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-24*s);}
      return; // skip normal cow drawing
    }

    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,18*s,4*s,0,0,Math.PI*2);ctx.fill();

    // Legs (4 wobbly legs)
    ctx.strokeStyle='#222';ctx.lineWidth=3*s;ctx.lineCap='round';
    const legSpread=8*s;
    ctx.beginPath();ctx.moveTo(cx-legSpread,by+5*s);ctx.lineTo(cx-legSpread+Math.sin(wt)*3*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-legSpread+6*s,by+5*s);ctx.lineTo(cx-legSpread+6*s-Math.sin(wt)*3*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+legSpread-6*s,by+5*s);ctx.lineTo(cx+legSpread-6*s+Math.sin(wt+1)*3*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+legSpread,by+5*s);ctx.lineTo(cx+legSpread-Math.sin(wt+1)*3*s,legY);ctx.stroke();

    // Hooves
    ctx.fillStyle='#333';
    [cx-legSpread+Math.sin(wt)*3*s,cx-legSpread+6*s-Math.sin(wt)*3*s,cx+legSpread-6*s+Math.sin(wt+1)*3*s,cx+legSpread-Math.sin(wt+1)*3*s].forEach(hx=>{
      ctx.beginPath();ctx.ellipse(hx,legY,2*s,1.5*s,0,0,Math.PI*2);ctx.fill();
    });

    // Body (big oval)
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(cx,by,20*s,12*s,0,0,Math.PI*2);ctx.fill();
    // Spots
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.ellipse(cx-6*s,by-3*s,5*s,4*s,0.3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cx+8*s,by+2*s,4*s,3*s,-0.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cx+2*s,by-6*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();

    // Udder (lol)
    ctx.fillStyle='#ffaaaa';
    ctx.beginPath();ctx.ellipse(cx+3*s,by+10*s,5*s,4*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff8888';
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(cx+(i-1.5)*2.5*s,by+13*s,1*s,2*s,0,0,Math.PI*2);ctx.fill();}

    // Head
    const hx=cx+dir*18*s, hy=by-6*s;
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(hx,hy,8*s,7*s,dir*0.2,0,Math.PI*2);ctx.fill();
    // Snout
    ctx.fillStyle=c.spots==='#333'?'#ddc0c0':c.spots;
    ctx.beginPath();ctx.ellipse(hx+dir*6*s,hy+2*s,4*s,3*s,0,0,Math.PI*2);ctx.fill();
    // Nostrils
    ctx.fillStyle='#333';
    ctx.beginPath();ctx.arc(hx+dir*7*s,hy+1*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx+dir*7*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
    // Eyes (derpy)
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(hx+dir*3*s,hy-3*s,3*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx-dir*1*s,hy-3*s,2.5*s,0,Math.PI*2);ctx.fill();
    // Pupils (looking different directions = wacky)
    ctx.fillStyle='#111';
    ctx.beginPath();ctx.arc(hx+dir*3*s+Math.sin(c.walkTimer*0.02)*1.5*s,hy-3*s,1.5*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx-dir*1*s-Math.sin(c.walkTimer*0.03)*1*s,hy-3.5*s,1.2*s,0,Math.PI*2);ctx.fill();
    // Ears
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(hx-dir*2*s,hy-7*s,3*s,2*s,dir*0.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx+dir*2*s,hy-7*s,3*s,2*s,-dir*0.5,0,Math.PI*2);ctx.fill();
    // Horns
    ctx.strokeStyle='#aa8';ctx.lineWidth=2*s;
    ctx.beginPath();ctx.moveTo(hx-dir*1*s,hy-6*s);ctx.lineTo(hx-dir*3*s,hy-11*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx+dir*1*s,hy-6*s);ctx.lineTo(hx+dir*3*s,hy-11*s);ctx.stroke();

    // Tail (wagging)
    ctx.strokeStyle=c.color;ctx.lineWidth=2*s;
    const tailX=cx-dir*18*s, tailY=by-5*s;
    ctx.beginPath();ctx.moveTo(tailX,tailY);
    ctx.quadraticCurveTo(tailX-dir*8*s,tailY-10*s+Math.sin(tt)*8*s,tailX-dir*12*s,tailY-5*s+Math.sin(tt*1.5)*6*s);ctx.stroke();
    // Tail tuft
    ctx.fillStyle=c.spots;ctx.beginPath();ctx.arc(tailX-dir*12*s,tailY-5*s+Math.sin(tt*1.5)*6*s,3*s,0,Math.PI*2);ctx.fill();

    // Wacky extras
    if(c.wack==='twohead'){
      // Second head on top
      const h2x=cx-dir*10*s, h2y=by-18*s;
      ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(h2x,h2y,6*s,5*s,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(h2x+2*s,h2y-1*s,2*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(h2x-2*s,h2y-1*s,2*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#111';ctx.beginPath();ctx.arc(h2x+2*s,h2y-1*s,1*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(h2x-2*s,h2y-1*s,1*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=c.spots;ctx.beginPath();ctx.ellipse(h2x,h2y+3*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();
    }
    if(c.wack==='hover'){
      // Glow underneath
      ctx.fillStyle='rgba(100,150,255,0.15)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,15*s,3*s,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(100,150,255,0.3)';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL-2,12*s,2*s,0,0,Math.PI*2);ctx.stroke();
    }
    if(c.wack==='crystal'){
      // Crystal spikes on back
      ctx.fillStyle='rgba(200,100,255,0.6)';
      for(let i=0;i<4;i++){const sx=cx-8*s+i*5*s;ctx.beginPath();ctx.moveTo(sx,by-10*s);ctx.lineTo(sx-2*s,by-18*s-i*2*s);ctx.lineTo(sx+2*s,by-10*s);ctx.closePath();ctx.fill();}
    }
    if(c.wack==='fire'){
      // Flames on back
      const t=Date.now()*0.005;
      for(let i=0;i<3;i++){
        ctx.fillStyle=`rgba(255,${100+Math.random()*80},0,${0.4+Math.random()*0.3})`;
        ctx.beginPath();ctx.arc(cx-6*s+i*6*s,by-12*s+Math.sin(t+i)*3*s,3*s+Math.random()*2*s,0,Math.PI*2);ctx.fill();
      }
    }
    if(c.wack==='frozen'){
      // Ice crystals
      ctx.strokeStyle='rgba(150,220,255,0.6)';ctx.lineWidth=1;
      for(let i=0;i<3;i++){const ix=cx-5*s+i*5*s,iy=by-12*s;
        ctx.beginPath();ctx.moveTo(ix,iy);ctx.lineTo(ix,iy-6*s);ctx.moveTo(ix-3*s,iy-3*s);ctx.lineTo(ix+3*s,iy-3*s);ctx.stroke();
      }
    }
    if(c.wack==='spacesuit'){
      // Helmet bubble
      ctx.strokeStyle='rgba(200,220,255,0.4)';ctx.lineWidth=1.5*s;
      ctx.beginPath();ctx.arc(hx,hy,9*s,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='rgba(200,220,255,0.1)';ctx.beginPath();ctx.arc(hx,hy,9*s,0,Math.PI*2);ctx.fill();
    }

    if(c.wack==='monkey'){
      // Override cow body — draw monkey instead
      // Monkey body (smaller, upright)
      const mby=by+2*s,mbx=cx;
      // Arms (swinging)
      ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;ctx.lineCap='round';
      const armSwing=Math.sin(tt*2)*4*s;
      ctx.beginPath();ctx.moveTo(mbx-5*s,mby-4*s);ctx.lineTo(mbx-10*s+armSwing,mby+2*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(mbx+5*s,mby-4*s);ctx.lineTo(mbx+10*s-armSwing,mby+2*s);ctx.stroke();
      // Hands
      ctx.fillStyle=c.spots;
      ctx.beginPath();ctx.arc(mbx-10*s+armSwing,mby+2*s,2*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(mbx+10*s-armSwing,mby+2*s,2*s,0,Math.PI*2);ctx.fill();
      // Long curly tail
      ctx.strokeStyle=c.color;ctx.lineWidth=2*s;
      ctx.beginPath();ctx.moveTo(mbx-dir*6*s,mby+2*s);
      ctx.quadraticCurveTo(mbx-dir*16*s,mby-8*s+Math.sin(tt)*4*s,mbx-dir*12*s,mby-16*s+Math.sin(tt*0.8)*3*s);ctx.stroke();
      // Ears (round, sticking out)
      ctx.fillStyle=c.spots;
      ctx.beginPath();ctx.arc(hx-7*s,hy-2*s,3*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+7*s,hy-2*s,3*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d9a080';
      ctx.beginPath();ctx.arc(hx-7*s,hy-2*s,1.8*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+7*s,hy-2*s,1.8*s,0,Math.PI*2);ctx.fill();
      // Muzzle
      ctx.fillStyle='#d9a080';ctx.beginPath();ctx.ellipse(hx,hy+3*s,4*s,3*s,0,0,Math.PI*2);ctx.fill();
      // Nostrils
      ctx.fillStyle='#444';ctx.beginPath();ctx.arc(hx-1.5*s,hy+3*s,0.8*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx+1.5*s,hy+3*s,0.8*s,0,Math.PI*2);ctx.fill();
    }

    // Label when beamed
    if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-16*s);}
  });

  // Tears
  tears.forEach(t=>{ctx.fillStyle=`rgba(100,150,255,${t.life/40})`;ctx.beginPath();ctx.arc(t.x,t.y,t.size,0,Math.PI*2);ctx.fill();});
  // Speech bubbles disabled
  // Fires
  fires.forEach(f=>{if(f.x<camera.x-30||f.x>camera.x+canvas.width+30)return;
    const fa=Math.min(1,f.life/60);const ft=Date.now()*0.005+f.x*0.1;
    // Outer glow
    ctx.fillStyle=`rgba(255,60,0,${fa*0.1})`;ctx.beginPath();ctx.arc(f.x,f.y,f.size*2,0,Math.PI*2);ctx.fill();
    // Fire tongues — 3 overlapping flame shapes
    for(let fi=0;fi<3;fi++){
      const fx=f.x+(Math.sin(ft*2+fi*2.1))*f.size*0.3;
      const fh=f.size*(0.8+Math.sin(ft*3+fi*1.7)*0.4);
      const fw=f.size*(0.3+fi*0.15);
      const hue=fi===0?15:fi===1?30:50; // red -> orange -> yellow
      ctx.fillStyle=`hsla(${hue},100%,${50+fi*10}%,${fa*(0.4-fi*0.08)})`;
      ctx.beginPath();ctx.moveTo(fx-fw,f.y);
      ctx.quadraticCurveTo(fx-fw*0.5,f.y-fh*0.6,fx,f.y-fh);
      ctx.quadraticCurveTo(fx+fw*0.5,f.y-fh*0.6,fx+fw,f.y);ctx.fill();
    }
    // Bright core
    ctx.fillStyle=`rgba(255,220,100,${fa*0.3})`;ctx.beginPath();ctx.ellipse(f.x,f.y-f.size*0.2,f.size*0.3,f.size*0.5,0,0,Math.PI*2);ctx.fill();
  });
  // Missiles
  missiles.forEach(m=>{if(m.minigun){
    // Minigun bullet — small yellow tracer
    ctx.fillStyle='#ff0';ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(m.x,m.y,1.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fa0';ctx.beginPath();ctx.arc(m.x,m.y-2,1,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }else{m.trail.forEach(t=>{ctx.globalAlpha=t.life/15*0.5;ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(t.x,t.y,2,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;ctx.save();ctx.translate(m.x,m.y);ctx.rotate(Math.atan2(m.vy,m.vx));ctx.fillStyle='#888';ctx.fillRect(-8,-2,16,4);ctx.fillStyle='#f44';ctx.fillRect(6,-2,3,4);ctx.fillStyle='#fa0';ctx.beginPath();ctx.arc(-10,0,3+Math.random()*2,0,Math.PI*2);ctx.fill();ctx.restore();}});
  // Beam
  if(ship.beamActive){const bx=ship.x,by=ship.y+15,ty=GROUND_LEVEL,bW=BEAM_WIDTH+upgrades.beamWidth*30;const bg=ctx.createLinearGradient(bx,by,bx,ty);bg.addColorStop(0,'rgba(0,255,100,0.4)');bg.addColorStop(0.5,'rgba(0,255,100,0.2)');bg.addColorStop(1,'rgba(0,255,100,0.1)');ctx.beginPath();ctx.moveTo(bx-15,by);ctx.lineTo(bx-bW/2,ty);ctx.lineTo(bx+bW/2,ty);ctx.lineTo(bx+15,by);ctx.closePath();ctx.fillStyle=bg;ctx.fill();ctx.strokeStyle='rgba(0,255,100,0.3)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(bx,ty,bW/2,bW/6,0,0,Math.PI*2);ctx.stroke();}
  // --- VEHICLES ---
  vehicles.forEach(v=>{
    if(!v.alive&&v.exploding>0){
      ctx.globalAlpha=v.exploding/40;ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(v.x+v.w/2,v.y,15+Math.random()*10,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;return;
    }
    if(!v.alive)return;
    // Flip sprite so the vehicle always faces its travel direction (never drives backwards)
    ctx.save();
    if(v.vx<0){ctx.translate(v.x+v.w/2,0);ctx.scale(-1,1);ctx.translate(-(v.x+v.w/2),0);}
    if(v.type==='car'){
      const wr=v.h*0.35;
      // Body (lower half)
      ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h*0.55,v.w,v.h*0.55);
      // Roof/cabin
      ctx.fillStyle=v.color;roundRect(ctx,v.x+v.w*0.2,v.y-v.h-2,v.w*0.6,v.h*0.5,4);ctx.fill();
      // Windows
      ctx.fillStyle='rgba(150,200,255,0.55)';
      ctx.fillRect(v.x+v.w*0.22,v.y-v.h+2,v.w*0.22,v.h*0.4);
      ctx.fillRect(v.x+v.w*0.56,v.y-v.h+2,v.w*0.22,v.h*0.4);
      // Side body trim
      ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(v.x,v.y-v.h*0.15,v.w,1.5);
      // Wheels (tires + hubcaps)
      ctx.fillStyle='#111';
      ctx.beginPath();ctx.arc(v.x+v.w*0.22,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.78,v.y,wr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#888';
      ctx.beginPath();ctx.arc(v.x+v.w*0.22,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.78,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
      // Headlights
      if(dayNightBrightness<0){ctx.fillStyle='rgba(255,255,150,0.7)';const hx=v.vx>0?v.x+v.w+2:v.x-2;ctx.beginPath();ctx.arc(hx,v.y-v.h*0.35,wr*0.8,0,Math.PI*2);ctx.fill();}
    }else if(v.type==='truck'){
      const wr=v.h*0.3;
      // Cab
      ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w*0.3,v.h);
      // Cab roof rounding
      roundRect(ctx,v.x+v.w*0.02,v.y-v.h-3,v.w*0.26,5,2);ctx.fill();
      // Cargo box
      ctx.fillStyle='#888';ctx.fillRect(v.x+v.w*0.32,v.y-v.h*1.15,v.w*0.68,v.h*1.15);
      ctx.strokeStyle='#555';ctx.lineWidth=1.2;ctx.strokeRect(v.x+v.w*0.32,v.y-v.h*1.15,v.w*0.68,v.h*1.15);
      // Cargo panel lines
      ctx.strokeStyle='#666';ctx.lineWidth=0.6;
      for(let pl=1;pl<4;pl++){const px=v.x+v.w*0.32+v.w*0.68*pl/4;ctx.beginPath();ctx.moveTo(px,v.y-v.h*1.15);ctx.lineTo(px,v.y);ctx.stroke();}
      // Windshield
      ctx.fillStyle='rgba(150,200,255,0.55)';ctx.fillRect(v.x+v.w*0.05,v.y-v.h+3,v.w*0.22,v.h*0.4);
      // Wheels (big tires)
      ctx.fillStyle='#111';
      ctx.beginPath();ctx.arc(v.x+v.w*0.15,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.65,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.87,v.y,wr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#999';
      ctx.beginPath();ctx.arc(v.x+v.w*0.15,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.65,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.87,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
    }else if(v.type==='bus'){
      const wr=v.h*0.3;
      // Body
      ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w,v.h);
      roundRect(ctx,v.x+2,v.y-v.h-3,v.w-4,5,2);ctx.fill();
      // Windows (many)
      ctx.fillStyle='rgba(150,200,255,0.55)';
      const winCount=8;
      for(let wi=0;wi<winCount;wi++){
        const wx=v.x+v.w*0.05+wi*(v.w*0.88/winCount);
        ctx.fillRect(wx,v.y-v.h+4,v.w*0.8/winCount*0.85,v.h*0.45);
      }
      // Door
      ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(v.x+v.w-v.w*0.12,v.y-v.h+3,v.w*0.08,v.h-5);
      // Wheel wells
      ctx.fillStyle='#111';
      ctx.beginPath();ctx.arc(v.x+v.w*0.12,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.85,v.y,wr,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#999';
      ctx.beginPath();ctx.arc(v.x+v.w*0.12,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.85,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
      // Route sign
      ctx.fillStyle='rgba(255,255,255,0.9)';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('42',v.x+v.w/2,v.y-v.h-1);
    }else if(v.type==='rover'){
      ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w,v.h*0.5);
      ctx.fillRect(v.x+10,v.y-v.h-8,v.w-20,8);
      ctx.fillStyle='#666';ctx.beginPath();ctx.arc(v.x+12,v.y,6,0,Math.PI*2);ctx.arc(v.x+v.w-12,v.y,6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#aaa';ctx.beginPath();ctx.arc(v.x+12,v.y,3,0,Math.PI*2);ctx.arc(v.x+v.w-12,v.y,3,0,Math.PI*2);ctx.fill();
      // Antenna
      ctx.strokeStyle='#888';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(v.x+v.w-15,v.y-v.h-8);ctx.lineTo(v.x+v.w-10,v.y-v.h-20);ctx.stroke();
      ctx.fillStyle='#f00';ctx.beginPath();ctx.arc(v.x+v.w-10,v.y-v.h-20,2,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  });

  // --- HAZARDS ---
  hazards.forEach(hz=>{
    if(hz.type==='volcano'){
      // Draw volcano mound
      ctx.fillStyle='#4a2a1a';ctx.beginPath();ctx.moveTo(hz.x-60,GROUND_LEVEL);ctx.lineTo(hz.x-15,GROUND_LEVEL-70);ctx.lineTo(hz.x+15,GROUND_LEVEL-70);ctx.lineTo(hz.x+60,GROUND_LEVEL);ctx.closePath();ctx.fill();
      ctx.fillStyle='#3a1a0a';ctx.beginPath();ctx.moveTo(hz.x-10,GROUND_LEVEL-70);ctx.lineTo(hz.x,GROUND_LEVEL-60);ctx.lineTo(hz.x+10,GROUND_LEVEL-70);ctx.closePath();ctx.fill();
      if(hz.active){ctx.fillStyle=`rgba(255,${100+Math.random()*50},0,${0.5+Math.random()*0.3})`;ctx.beginPath();ctx.arc(hz.x,GROUND_LEVEL-75,12+Math.random()*8,0,Math.PI*2);ctx.fill();}
    }
    if(hz.type==='blizzard'&&hz.active){
      // Wind streaks instead of solid rectangle
      for(let i=0;i<4;i++){
        const sx=hz.x+Math.random()*hz.width,sy=camera.y+Math.random()*canvas.height;
        ctx.strokeStyle=`rgba(200,220,255,${0.08+Math.random()*0.06})`;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+30+Math.random()*40,sy+Math.random()*6-3);ctx.stroke();
      }
    }
  });

  // --- TURRETS ---
  turrets.forEach(t=>{
    if(!t.alive)return;
    ctx.fillStyle='#666';ctx.fillRect(t.x-8,t.y,16,30); // base
    const a=Math.atan2(ship.y-t.y,ship.x-t.x);
    ctx.save();ctx.translate(t.x,t.y);ctx.rotate(a);
    ctx.fillStyle='#888';ctx.fillRect(0,-3,20,6); // barrel
    ctx.restore();
    ctx.fillStyle='#f00';ctx.beginPath();ctx.arc(t.x,t.y-3,4+Math.sin(Date.now()*0.005)*2,0,Math.PI*2);ctx.fill();
    // Bullets
    t.bullets.forEach(b=>{ctx.fillStyle='#f44';ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();});
  });

  // --- MILITARY ---
  military.forEach(m=>{
    if(!m.alive&&m.type!=='bullet'&&m.type!=='boulder')return;
    if(m.type==='soldier'){
      // Body
      ctx.fillStyle=m.color;ctx.fillRect(m.x-4,m.y-16,8,14);
      // Head (helmet)
      ctx.fillStyle='#353';ctx.beginPath();ctx.arc(m.x,m.y-20,5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#242';ctx.fillRect(m.x-6,m.y-22,12,3); // helmet rim
      // Legs
      ctx.strokeStyle=m.color;ctx.lineWidth=2;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(m.x-2,m.y-2);ctx.lineTo(m.x-3,m.y+2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(m.x+2,m.y-2);ctx.lineTo(m.x+3,m.y+2);ctx.stroke();
      // Gun
      ctx.fillStyle=m.gunColor;ctx.fillRect(m.x+m.facing*4,m.y-12,m.facing*10,3);
    }
    else if(m.type==='police'){
      // Police car
      ctx.fillStyle=m.color;ctx.fillRect(m.x-m.w/2,m.y-m.h,m.w,m.h*0.6);
      ctx.fillStyle='#113';roundRect(ctx,m.x-m.w/2+5,m.y-m.h-6,m.w-10,7,2);ctx.fill();
      // Siren lights
      ctx.fillStyle=Math.sin(Date.now()*0.02)>0?'#f00':'#00f';
      ctx.beginPath();ctx.arc(m.x-5,m.y-m.h-8,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=Math.sin(Date.now()*0.02)>0?'#00f':'#f00';
      ctx.beginPath();ctx.arc(m.x+5,m.y-m.h-8,3,0,Math.PI*2);ctx.fill();
      // Wheels
      ctx.fillStyle='#222';ctx.beginPath();ctx.arc(m.x-12,m.y,4,0,Math.PI*2);ctx.arc(m.x+12,m.y,4,0,Math.PI*2);ctx.fill();
    }
    else if(m.type==='helicopter'){
      // Body
      ctx.fillStyle='#454';ctx.beginPath();ctx.ellipse(m.x,m.y,25,10,0,0,Math.PI*2);ctx.fill();
      // Tail
      ctx.fillStyle='#343';ctx.fillRect(m.x+20,m.y-3,20,6);
      ctx.fillRect(m.x+38,m.y-8,2,12);
      // Cockpit
      ctx.fillStyle='rgba(150,200,255,0.4)';ctx.beginPath();ctx.ellipse(m.x-10,m.y-2,8,6,0,Math.PI,0);ctx.fill();
      // Rotor
      ctx.strokeStyle='#888';ctx.lineWidth=2;
      ctx.save();ctx.translate(m.x,m.y-10);ctx.rotate(m.rotorAngle);
      ctx.beginPath();ctx.moveTo(-30,0);ctx.lineTo(30,0);ctx.stroke();ctx.restore();
      // Tail rotor
      ctx.save();ctx.translate(m.x+39,m.y-3);ctx.rotate(m.rotorAngle*2);
      ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.stroke();ctx.restore();
    }
    else if(m.type==='guardian'){
      // Crystal guardian
      ctx.fillStyle=m.color;
      ctx.beginPath();ctx.moveTo(m.x,m.y-25);ctx.lineTo(m.x-10,m.y);ctx.lineTo(m.x+10,m.y);ctx.closePath();ctx.fill();
      // Head crystal
      ctx.fillStyle='#d8f';ctx.beginPath();ctx.moveTo(m.x,m.y-32);ctx.lineTo(m.x-5,m.y-25);ctx.lineTo(m.x+5,m.y-25);ctx.closePath();ctx.fill();
      // Eyes
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(m.x-3,m.y-20,2,0,Math.PI*2);ctx.arc(m.x+3,m.y-20,2,0,Math.PI*2);ctx.fill();
      // Shield
      if(m.shieldUp){
        ctx.strokeStyle=`rgba(200,100,255,${0.3+Math.sin(Date.now()*0.008)*0.2})`;ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(m.x,m.y-12,18,20,0,0,Math.PI*2);ctx.stroke();
      }
    }
    else if(m.type==='golem'){
      // Ice golem - chunky
      ctx.fillStyle=m.color;
      ctx.fillRect(m.x-12,m.y-28,24,28); // body
      ctx.fillStyle='#9cf';ctx.fillRect(m.x-14,m.y-20,28,12); // shoulders
      ctx.fillStyle='#7ae';ctx.beginPath();ctx.arc(m.x,m.y-32,10,0,Math.PI*2);ctx.fill(); // head
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(m.x-4,m.y-33,3,0,Math.PI*2);ctx.arc(m.x+4,m.y-33,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#24a';ctx.beginPath();ctx.arc(m.x-4,m.y-33,1.5,0,Math.PI*2);ctx.arc(m.x+4,m.y-33,1.5,0,Math.PI*2);ctx.fill();
    }
    else if(m.type==='demon'){
      // Fire demon
      ctx.fillStyle=m.color;
      ctx.beginPath();ctx.moveTo(m.x,m.y-28);ctx.lineTo(m.x-8,m.y);ctx.lineTo(m.x+8,m.y);ctx.closePath();ctx.fill();
      ctx.fillStyle='#f86';ctx.beginPath();ctx.arc(m.x,m.y-20,6,0,Math.PI*2);ctx.fill(); // head
      // Horns
      ctx.fillStyle='#a20';ctx.beginPath();ctx.moveTo(m.x-6,m.y-24);ctx.lineTo(m.x-10,m.y-34);ctx.lineTo(m.x-3,m.y-24);ctx.fill();
      ctx.beginPath();ctx.moveTo(m.x+6,m.y-24);ctx.lineTo(m.x+10,m.y-34);ctx.lineTo(m.x+3,m.y-24);ctx.fill();
      // Eyes
      ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(m.x-3,m.y-21,2,0,Math.PI*2);ctx.arc(m.x+3,m.y-21,2,0,Math.PI*2);ctx.fill();
      // Flame aura
      if(Math.random()>0.5){ctx.fillStyle=`rgba(255,${60+Math.random()*60},0,0.3)`;ctx.beginPath();ctx.arc(m.x+(Math.random()-0.5)*10,m.y-15+Math.random()*10,4+Math.random()*3,0,Math.PI*2);ctx.fill();}
    }
    else if(m.type==='bullet'){
      ctx.fillStyle=m.color||'#ff0';ctx.beginPath();ctx.arc(m.x,m.y,2.5,0,Math.PI*2);ctx.fill();
    }
    else if(m.type==='boulder'){
      ctx.fillStyle=m.color||'#8be';ctx.beginPath();ctx.arc(m.x,m.y,8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=m.boss?'#ff0':'#6ac';ctx.beginPath();ctx.arc(m.x-2,m.y-2,3,0,Math.PI*2);ctx.fill();
    }
  });

  // --- LASER SHOTS ---
  laserShots.forEach(ls=>{
    ctx.strokeStyle='#0f0';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(ls.x,ls.y);ctx.lineTo(ls.x-ls.vx*1.5,ls.y);ctx.stroke();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ls.x,ls.y,2,0,Math.PI*2);ctx.fill();
  });

  // --- ALIEN ON FOOT (uses current race/skin) ---
  if(playerMode==='onfoot'){
    const _askin=getAlienSkin();
    const ax=alien.x,ay=alien.y,f=alien.facing;

    // Shadow
    const alienShadowY=alien.inCave?(()=>{const ch2=isInsideCave(alien.x,alien.y);return ch2?ch2.seg.y+ch2.seg.h-2:GROUND_LEVEL;})():GROUND_LEVEL;
    ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(ax,alienShadowY,9,2.5,0,0,Math.PI*2);ctx.fill();

    // Jetpack flame (drawn before body so it emerges from behind)
    if(!alien.onGround&&keys['shift']){
      for(let i=0;i<2;i++){
        const fl=3+Math.random()*4;
        ctx.fillStyle=`rgba(${220+Math.random()*35},${80+Math.random()*80},0,${0.5+Math.random()*0.3})`;
        ctx.beginPath();ctx.ellipse(ax-f*3,ay-8+Math.random()*2,2+Math.random(),fl,0,0,Math.PI*2);ctx.fill();
      }
    }

    // Body (all races/skins + bodyType variations)
    drawAlienPreview(ax, ay, 1.0, _askin, f, alien.walkTimer);

    // --- Fuel bar ---
    const barY=ay-33-18;
    ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(ax-10,barY,20,2.5);
    ctx.fillStyle=alien.jetpackFuel>30?'#0af':'#f44';ctx.fillRect(ax-10,barY,20*(alien.jetpackFuel/100),2.5);
  }

  // Boss
  drawBoss();
  // Ship
  drawShip();
  // Particles
  particles.forEach(pt=>{const sx=pt.x-camera.x,sy=pt.y-camera.y;if(sx<-20||sx>canvas.width+20||sy<-20||sy>canvas.height+20)return;ctx.globalAlpha=pt.life/30;ctx.fillStyle=pt.color;if(pt.size<3){ctx.fillRect(pt.x-pt.size/2,pt.y-pt.size/2,pt.size,pt.size);}else{ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;});

  // --- WEATHER (drawn in world space) ---
  weather.forEach((w,_wi)=>{
    if(window._perfMode&&_wi%2!==0)return; // skip half in perf mode
    const a=w.life/(w.type==='snow'?120:w.type==='ember'?80:60);
    ctx.globalAlpha=Math.min(1,a);
    if(w.type==='rain'){ctx.strokeStyle='rgba(150,180,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w.x,w.y);ctx.lineTo(w.x+w.vx*2,w.y+w.vy*2);ctx.stroke();}
    else if(w.type==='dust'){ctx.fillStyle=`rgba(180,140,100,0.4)`;ctx.beginPath();ctx.arc(w.x,w.y,2+Math.random(),0,Math.PI*2);ctx.fill();}
    else if(w.type==='snow'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(w.x,w.y,1.5+Math.random(),0,Math.PI*2);ctx.fill();}
    else if(w.type==='ember'){ctx.fillStyle=`rgba(255,${100+Math.random()*100},0,0.7)`;ctx.beginPath();ctx.arc(w.x,w.y,1+Math.random()*2,0,Math.PI*2);ctx.fill();}
    else if(w.type==='sparkle'){const hue=260+Math.random()*60;ctx.fillStyle=`hsla(${hue},100%,80%,${0.3+Math.random()*0.4})`;ctx.beginPath();ctx.arc(w.x,w.y,1+Math.random()*1.5,0,Math.PI*2);ctx.fill();}
    else if(w.type==='bubble'){ctx.strokeStyle='rgba(150,200,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(w.x,w.y,w.life/30+1,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(200,230,255,0.1)';ctx.fill();}
    ctx.globalAlpha=1;
  });

  ctx.restore();

  // --- SHIP ARROW INDICATOR (screen space, on-foot only) ---
  if(playerMode==='onfoot'){
    // Ship position in screen space
    const ssx=ship.x-camera.x, ssy=ship.y-camera.y;
    const shipOnScreen=ssx>-40&&ssx<canvas.width+40&&ssy>-40&&ssy<canvas.height+40;
    const shipD=dist(alien.x,alien.y,ship.x,ship.y);

    if(!shipOnScreen){
      // Clamp arrow to screen edges with padding
      const pad=40;
      const ang=Math.atan2(ship.y-alien.y,ship.x-alien.x);
      let arX=canvas.width/2+Math.cos(ang)*canvas.width*0.45;
      let arY=canvas.height/2+Math.sin(ang)*canvas.height*0.45;
      arX=Math.max(pad,Math.min(canvas.width-pad,arX));
      arY=Math.max(pad,Math.min(canvas.height-pad,arY));

      // Pulsing glow
      const pulse=0.5+Math.sin(Date.now()*0.005)*0.3;
      // Arrow
      ctx.save();ctx.translate(arX,arY);ctx.rotate(ang);
      ctx.fillStyle=`rgba(0,255,100,${pulse})`;
      ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-6,-8);ctx.lineTo(-2,0);ctx.lineTo(-6,8);ctx.closePath();ctx.fill();
      ctx.strokeStyle=`rgba(0,255,100,${pulse*0.6})`;ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
      // Ship icon + distance
      ctx.fillStyle=`rgba(0,255,100,${pulse*0.8})`;ctx.font='10px monospace';ctx.textAlign='center';
      ctx.fillText(`SHIP ${Math.floor(shipD)}`,arX,arY+(ang>0?20:-14));
      // Mini ship silhouette
      ctx.fillStyle=`rgba(0,255,100,${pulse*0.5})`;
      ctx.beginPath();ctx.ellipse(arX,arY+(ang>0?-10:10),10,3,0,0,Math.PI*2);ctx.fill();
    }else if(shipD>60){
      // Ship is on screen but show a subtle label
      ctx.fillStyle='rgba(0,255,100,0.4)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText(tr('hud.ship'),ssx,ssy-20);
      // Small down arrow
      ctx.beginPath();ctx.moveTo(ssx,ssy-16);ctx.lineTo(ssx-4,ssy-22);ctx.lineTo(ssx+4,ssy-22);ctx.closePath();ctx.fill();
    }
  }

  // --- UNDERWATER OVERLAY (screen space) ---
  if(isOverOcean(ship.x) && ship.y > GROUND_LEVEL) {
    const depthRatio = Math.min(1, (ship.y - GROUND_LEVEL) / WATER_DEPTH);
    // Blue tint that increases with depth
    const blueTint = depthRatio * 0.5;
    ctx.fillStyle = `rgba(0,15,40,${blueTint})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Additional darkness at extreme depth
    if(depthRatio > 0.5) {
      const deepDark = (depthRatio - 0.5) * 1.2;
      ctx.fillStyle = `rgba(0,0,5,${Math.min(0.7, deepDark)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Caustic light ripples near surface
    if(depthRatio < 0.4) {
      const t = Date.now() * 0.001;
      ctx.globalAlpha = (0.4 - depthRatio) * 0.15;
      for(let i = 0; i < 8; i++) {
        const cx = canvas.width * 0.1 + (i / 8) * canvas.width * 0.8 + Math.sin(t + i * 1.3) * 40;
        const cy = canvas.height * 0.15 + Math.cos(t * 0.7 + i) * 30;
        ctx.fillStyle = 'rgba(100,200,255,0.3)';
        ctx.beginPath(); ctx.ellipse(cx, cy, 30 + Math.sin(t + i) * 10, 8, Math.sin(t * 0.5 + i) * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Cave darkness (extra dark when inside a cave tunnel)
    const inCave = isInsideCave(ship.x, ship.y);
    if(inCave) {
      ctx.fillStyle = 'rgba(0,0,3,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Flashlight — radial glow around the ship so you can see the area
    if(flashlightOn) {
      const flX = canvas.width / 2, flY = canvas.height / 2;
      const flR = inCave ? 220 + Math.sin(Date.now()*0.003)*10 : 180 + depthRatio * 120;
      // Punch a bright hole in the darkness using destination-out, then re-add color
      // Step 1: dark overlay with a radial hole
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const hole = ctx.createRadialGradient(flX, flY, 0, flX, flY, flR);
      hole.addColorStop(0, 'rgba(0,0,0,0.6)');
      hole.addColorStop(0.5, 'rgba(0,0,0,0.3)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hole;
      ctx.beginPath(); ctx.arc(flX, flY, flR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Step 2: warm glow overlay
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(flX, flY, 0, flX, flY, flR * 0.8);
      const intensity = inCave ? 0.25 : 0.15 + depthRatio * 0.15;
      glow.addColorStop(0, `rgba(180,220,255,${intensity})`);
      glow.addColorStop(0.3, `rgba(120,180,230,${intensity * 0.5})`);
      glow.addColorStop(0.7, `rgba(60,100,160,${intensity * 0.15})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(flX, flY, flR * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Ship light ring
      ctx.strokeStyle = `rgba(180,220,255,${0.15 + Math.sin(Date.now()*0.004)*0.05})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(flX, flY, 25, 0, Math.PI * 2); ctx.stroke();
    }

    // Depth indicator
    const depthM = Math.floor(depthRatio * 800);
    ctx.fillStyle = `rgba(100,200,255,${0.4 + depthRatio * 0.3})`;
    ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`DEPTH: ${depthM}m`, 15, canvas.height - 40);
    // Flashlight indicator
    if(!flashlightOn && depthRatio > 0.3) {
      ctx.fillStyle = `rgba(100,200,255,${0.3 + Math.sin(Date.now() * 0.005) * 0.15})`;
      ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText('[L] FLASHLIGHT', 15, canvas.height - 55);
    } else if(flashlightOn) {
      ctx.fillStyle = 'rgba(200,230,255,0.5)';
      ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText('[L] LIGHT ON', 15, canvas.height - 55);
    }
    // Oxygen warning at extreme depth
    if(depthRatio > 0.8) {
      const warn = 0.4 + Math.sin(Date.now() * 0.008) * 0.3;
      ctx.fillStyle = `rgba(255,100,50,${warn})`;
      ctx.font = '13px monospace'; ctx.textAlign = 'center';
      ctx.fillText('EXTREME DEPTH', canvas.width / 2, canvas.height - 35);
    }
  }

  // --- DAY/NIGHT OVERLAY (screen space) ---
  const nightAlpha=Math.max(0,-dayNightBrightness)*0.4;
  if(nightAlpha>0.02){ctx.fillStyle=`rgba(0,0,20,${nightAlpha})`;ctx.fillRect(0,0,canvas.width,canvas.height);}

  // --- COMBO DISPLAY ---
  if(combo.count>1&&combo.timer>0){
    const comboAlpha=Math.min(1,combo.timer/30);
    ctx.globalAlpha=comboAlpha;ctx.fillStyle=combo.count>4?'#f44':combo.count>2?'#ff0':'#0f0';
    ctx.font=`${20+combo.count*3}px monospace`;ctx.textAlign='center';
    ctx.fillText(`COMBO x${combo.count}!`,canvas.width/2,80);
    if(combo.count>2){ctx.font='12px monospace';ctx.fillText(`+${combo.count} BONUS`,canvas.width/2,100);}
    ctx.globalAlpha=1;
  }

  // --- WANTED LEVEL STARS ---
  if(wantedLevel>0){
    const sx=canvas.width-20,sy=50;
    ctx.textAlign='right';
    for(let i=0;i<5;i++){
      ctx.fillStyle=i<wantedLevel?(wantedLevel>=4?'#f44':'#fa0'):'rgba(255,255,255,0.15)';
      ctx.font='18px monospace';
      ctx.fillText('\u2605',sx-i*20,sy);
    }
    // Alarm pulse overlay
    if(alarmPulse>0){
      ctx.fillStyle=`rgba(255,0,0,${alarmPulse/60*0.08*Math.abs(Math.sin(Date.now()*0.01))})`;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }
  }

  // --- POPULATION COUNTER ---
  const popAlive=humans.filter(h=>!h.collected&&!h.hidden&&!(h.ragdoll&&!h.beingBeamed)).length;
  const popTotal=humans.length;
  const popPct=popTotal>0?popAlive/initialPopulation:1;
  ctx.fillStyle=popPct>0.5?'rgba(0,255,0,0.5)':popPct>0.2?'rgba(255,165,0,0.5)':'rgba(255,50,50,0.7)';
  ctx.font='10px monospace';ctx.textAlign='right';
  ctx.fillText(`POP: ${popAlive}/${initialPopulation}`,canvas.width-15,canvas.height-15);

  // --- SHIP HEALTH BAR ---
  if(shipHealth<100&&playerMode==='ship'){
    const hx=canvas.width/2-50,hy=50;
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(hx-1,hy-1,102,8);
    ctx.fillStyle=shipHealth>80?'#0f0':shipHealth>30?'#fa0':'#f44';
    ctx.fillRect(hx,hy,shipHealth,6);
    ctx.fillStyle='#888';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(tr('hud.hull'),canvas.width/2,hy-3);
  }

  // --- CLOAK ENERGY BAR ---
  if(playerMode==='ship'&&(shipCloak.active||shipCloak.energy<shipCloak.maxEnergy)){
    const cx=canvas.width/2-50,cy=62;
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(cx-1,cy-1,102,8);
    const ep=shipCloak.energy/shipCloak.maxEnergy*100;
    ctx.fillStyle=shipCloak.active?`rgba(0,200,255,${0.5+Math.sin(Date.now()*0.01)*0.3})`:'#08a';
    ctx.fillRect(cx,cy,ep,6);
    ctx.fillStyle='#8cf';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(shipCloak.active?'CLOAKED':'CLOAK [C]',canvas.width/2,cy-3);
  }

  // --- ALIEN HEALTH BAR (on foot) ---
  if(playerMode==='onfoot'&&alien.health<100){
    const hx=canvas.width/2-50,hy=50;
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(hx-1,hy-1,102,8);
    ctx.fillStyle=alien.health>80?'#0f0':alien.health>30?'#fa0':'#f44';
    ctx.fillRect(hx,hy,alien.health,6);
    ctx.fillStyle='#888';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(tr('hud.health'),canvas.width/2,hy-3);
  }

  // --- MISSION HUD ---
  if(currentMission&&!missionComplete){
    const prog=currentPlanet?planetProgress[currentPlanet.id]:null;
    const mi=prog?prog.missionIndex:0;
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(canvas.width/2-140,10,280,42);
    ctx.strokeStyle='rgba(0,255,0,0.3)';ctx.lineWidth=1;ctx.strokeRect(canvas.width/2-140,10,280,42);
    ctx.fillStyle='#0f0';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText(`${tr('hud.mission')} [${mi}/5]: ${currentMission.desc}`,canvas.width/2,24);
    ctx.fillStyle='#ff0';ctx.fillText(`${currentMission.progress}/${currentMission.target}  [+${currentMission.reward}]`,canvas.width/2,36);
    // Chain progress dots
    for(let i=0;i<5;i++){
      ctx.fillStyle=i<mi?'#0f0':i===mi?'#ff0':'#333';
      ctx.beginPath();ctx.arc(canvas.width/2-20+i*10,47,3,0,Math.PI*2);ctx.fill();
    }
  }

  // --- UPGRADE PROMPT ---
  if(score>=10&&playerMode==='ship'){
    ctx.fillStyle='rgba(0,255,0,0.6)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText(tr('hud.upgradePrompt'),canvas.width/2,canvas.height-15);
  }
  // --- EXPLOSION FLASHES ---
  if(window._explosionFlashes){
    window._explosionFlashes.forEach(ef=>{
      ef.life--;ef.r+=(ef.maxR-ef.r)*0.3;
      const a=ef.life/12;
      ctx.fillStyle=`rgba(255,200,80,${a*0.4})`;ctx.beginPath();ctx.arc(ef.x-camera.x,ef.y-camera.y,ef.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,255,200,${a*0.6})`;ctx.beginPath();ctx.arc(ef.x-camera.x,ef.y-camera.y,ef.r*0.4,0,Math.PI*2);ctx.fill();
      // Shockwave ring
      ctx.strokeStyle=`rgba(255,180,100,${a*0.3})`;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(ef.x-camera.x,ef.y-camera.y,ef.r*1.3,0,Math.PI*2);ctx.stroke();
    });
    window._explosionFlashes=window._explosionFlashes.filter(ef=>ef.life>0);
  }
  // --- NUKE FLASH ---
  if(window._nukeFlash>0){
    ctx.fillStyle=`rgba(255,255,255,${Math.min(1,window._nukeFlash/30)})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  if(window._nukeCooldown>0&&window._nukeCooldown<580){
    ctx.fillStyle='rgba(255,100,0,0.5)';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText(`NUKE READY IN ${Math.ceil(window._nukeCooldown/60)}s`,canvas.width/2,canvas.height-30);
  }
  // --- BOSS ---
  drawBossHpBar();
  drawBossDefeatOverlay();
  drawBossIntro();
  // Boss lockdown barrier
  if(bossLockdown){
    const pulse=0.3+Math.sin(Date.now()*0.005)*0.15;
    ctx.fillStyle=`rgba(255,0,0,${pulse})`;ctx.fillRect(0,0,canvas.width,4);
    ctx.fillStyle='rgba(255,0,0,0.15)';ctx.fillRect(0,0,canvas.width,30);
  }
}

function drawShipBody(pc,pa,pt,type){
  // Draws ship body at local (0,0) — caller handles translate/rotate.
  if(type==='xwing'){
    // X-Wing fighter: fuselage with 4 wings + nose
    ctx.fillStyle=pa;ctx.beginPath();ctx.moveTo(-28,-4);ctx.lineTo(22,-6);ctx.lineTo(28,0);ctx.lineTo(22,6);ctx.lineTo(-28,4);ctx.closePath();ctx.fill();
    // Nose
    ctx.fillStyle=pc;ctx.beginPath();ctx.moveTo(22,-3);ctx.lineTo(36,0);ctx.lineTo(22,3);ctx.closePath();ctx.fill();
    // Cockpit
    ctx.fillStyle='#224';ctx.beginPath();ctx.ellipse(10,0,6,3.5,0,0,Math.PI*2);ctx.fill();
    // S-foils (4 wings)
    ctx.fillStyle=pc;ctx.strokeStyle=pa;ctx.lineWidth=1;
    [-12,-12].forEach((_,i)=>{const sy=i===0?-1:-1;});
    // top-left wing
    ctx.beginPath();ctx.moveTo(-20,-3);ctx.lineTo(0,-18);ctx.lineTo(12,-18);ctx.lineTo(-10,-3);ctx.closePath();ctx.fill();ctx.stroke();
    // bottom-left
    ctx.beginPath();ctx.moveTo(-20,3);ctx.lineTo(0,18);ctx.lineTo(12,18);ctx.lineTo(-10,3);ctx.closePath();ctx.fill();ctx.stroke();
    // top-right
    ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(14,-14);ctx.lineTo(20,-14);ctx.lineTo(0,-3);ctx.closePath();ctx.fill();ctx.stroke();
    // bottom-right
    ctx.beginPath();ctx.moveTo(-10,3);ctx.lineTo(14,14);ctx.lineTo(20,14);ctx.lineTo(0,3);ctx.closePath();ctx.fill();ctx.stroke();
    // Laser cannons (red tips on wing ends)
    ctx.fillStyle=pa;
    [[-18,-18],[12,-18],[-18,18],[12,18]].forEach(([x,y])=>{ctx.fillRect(x-1,y-1,3,2);});
    // Engine glow
    ctx.fillStyle=`rgba(255,80,40,${0.5+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath();ctx.arc(-28,-2,3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(-28,2,3,0,Math.PI*2);ctx.fill();
  } else if(type==='tie'){
    // TIE Fighter: central ball + 2 hex wings
    // Wings
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(0,-20);ctx.lineTo(-3,-16);ctx.lineTo(-3,16);ctx.lineTo(0,20);ctx.lineTo(3,16);ctx.lineTo(3,-16);ctx.closePath();
    ctx.fill();
    // Wing panels (hex)
    ctx.fillStyle=pc;ctx.strokeStyle=pa;ctx.lineWidth=1.5;
    [[-14,0],[14,0]].forEach(([wx,_])=>{
      ctx.beginPath();
      ctx.moveTo(wx,-14);ctx.lineTo(wx-10,-8);ctx.lineTo(wx-10,8);ctx.lineTo(wx,14);ctx.lineTo(wx+10,8);ctx.lineTo(wx+10,-8);ctx.closePath();
      ctx.fill();ctx.stroke();
    });
    // Struts
    ctx.fillStyle=pa;ctx.fillRect(-14,-1,28,2);
    // Cockpit ball
    ctx.fillStyle=pc;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.fill();
    // Window (hexagonal)
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(100,180,255,${0.3+Math.sin(ship.lightPhase)*0.2})`;ctx.beginPath();ctx.arc(-1,-1,2,0,Math.PI*2);ctx.fill();
  } else if(type==='falcon'){
    // Millennium Falcon-style: round disc with fork + cockpit tube
    ctx.fillStyle=pc;ctx.beginPath();ctx.ellipse(0,0,30,12,0,0,Math.PI*2);ctx.fill();
    // Mandibles (front fork)
    ctx.fillStyle=pa;
    ctx.beginPath();ctx.moveTo(22,-4);ctx.lineTo(40,-6);ctx.lineTo(40,-1);ctx.lineTo(22,-1);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(22,4);ctx.lineTo(40,6);ctx.lineTo(40,1);ctx.lineTo(22,1);ctx.closePath();ctx.fill();
    // Detail ring
    ctx.strokeStyle=pa;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,22,8,0,0,Math.PI*2);ctx.stroke();
    // Central dish (top)
    ctx.fillStyle=pa;ctx.beginPath();ctx.arc(-4,-9,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=pc;ctx.beginPath();ctx.arc(-4,-9,2.5,0,Math.PI*2);ctx.fill();
    // Cockpit (side tube right)
    ctx.fillStyle=pa;ctx.fillRect(18,-2,10,4);
    ctx.fillStyle='#226';ctx.fillRect(20,-1,5,2);
    // Panel lines
    ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.5;
    for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*6,-10);ctx.lineTo(i*6,10);ctx.stroke();}
    // Engine glow
    ctx.fillStyle=`rgba(100,220,255,${0.5+Math.sin(ship.lightPhase)*0.3})`;
    ctx.fillRect(-32,-3,4,6);
  } else if(type==='wedge'){
    // Star Destroyer wedge (triangular)
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(40,0);ctx.lineTo(-30,-18);ctx.lineTo(-30,18);ctx.closePath();
    ctx.fill();
    // Top ridge (darker)
    ctx.fillStyle=pa;
    ctx.beginPath();ctx.moveTo(30,-2);ctx.lineTo(-20,-10);ctx.lineTo(-20,-6);ctx.lineTo(28,0);ctx.closePath();ctx.fill();
    // Bridge tower
    ctx.fillStyle=pa;ctx.fillRect(-22,-14,6,8);
    ctx.fillStyle='#334';ctx.fillRect(-21,-13,4,2);
    // Side details
    ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=0.7;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(30-i*10,-(14-i*3));ctx.lineTo(30-i*10,14-i*3);ctx.stroke();}
    // Engines
    ctx.fillStyle=`rgba(150,180,255,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    [-16,-10,-4].forEach(y=>{ctx.beginPath();ctx.arc(-30,y,2,0,Math.PI*2);ctx.fill();});
    [16,10,4].forEach(y=>{ctx.beginPath();ctx.arc(-30,y,2,0,Math.PI*2);ctx.fill();});
  } else if(type==='rocket'){
    // Retro rocket: cylinder with fins + nose cone
    // Body
    const rg=ctx.createLinearGradient(0,-7,0,7);rg.addColorStop(0,pc);rg.addColorStop(1,pa);
    ctx.fillStyle=rg;ctx.fillRect(-22,-8,38,16);
    // Nose cone
    ctx.fillStyle=pa;ctx.beginPath();ctx.moveTo(16,-8);ctx.lineTo(32,0);ctx.lineTo(16,8);ctx.closePath();ctx.fill();
    // Fins
    ctx.fillStyle=pa;
    ctx.beginPath();ctx.moveTo(-22,-8);ctx.lineTo(-32,-16);ctx.lineTo(-14,-8);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-22,8);ctx.lineTo(-32,16);ctx.lineTo(-14,8);ctx.closePath();ctx.fill();
    // Port window
    ctx.fillStyle='#224';ctx.beginPath();ctx.arc(4,0,3.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(120,200,255,${0.5+Math.sin(ship.lightPhase)*0.3})`;ctx.beginPath();ctx.arc(4,0,2,0,Math.PI*2);ctx.fill();
    // Stripes
    ctx.fillStyle=pa;
    ctx.fillRect(-10,-8,3,16);
    ctx.fillRect(-4,-8,3,16);
    // Engine
    ctx.fillStyle=`rgba(255,150,40,${0.6+Math.sin(ship.lightPhase)*0.3})`;ctx.fillRect(-26,-4,4,8);
  } else if(type==='shuttle'){
    // Space shuttle: swept wings + fuselage
    ctx.fillStyle=pc;
    // Body
    ctx.beginPath();
    ctx.moveTo(-24,-4);ctx.quadraticCurveTo(0,-9,28,-2);ctx.lineTo(32,0);ctx.lineTo(28,2);ctx.quadraticCurveTo(0,9,-24,4);ctx.closePath();
    ctx.fill();
    // Swept wings (delta)
    ctx.fillStyle=pa;
    ctx.beginPath();ctx.moveTo(-6,-4);ctx.lineTo(-22,-16);ctx.lineTo(-24,-4);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-6,4);ctx.lineTo(-22,16);ctx.lineTo(-24,4);ctx.closePath();ctx.fill();
    // Tail fin
    ctx.fillStyle=pa;ctx.beginPath();ctx.moveTo(-18,-4);ctx.lineTo(-22,-12);ctx.lineTo(-12,-4);ctx.closePath();ctx.fill();
    // Cockpit window
    ctx.fillStyle='#224';ctx.beginPath();ctx.ellipse(18,-1,6,2.5,0,0,Math.PI*2);ctx.fill();
    // Thruster
    ctx.fillStyle=`rgba(255,220,100,${0.6+Math.sin(ship.lightPhase)*0.3})`;ctx.beginPath();ctx.arc(-28,-2,2.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(-28,2,2.5,0,Math.PI*2);ctx.fill();
  } else {
    // Classic saucer (default)
    ctx.fillStyle=pa;ctx.beginPath();ctx.ellipse(0,0,35,10,0,0,Math.PI*2);ctx.fill();
    const dg=ctx.createLinearGradient(0,-18,0,0);dg.addColorStop(0,pc);dg.addColorStop(1,pa);ctx.fillStyle=dg;ctx.beginPath();ctx.ellipse(0,-5,15,13,0,Math.PI,0);ctx.fill();
    ctx.fillStyle=`rgba(0,255,100,${0.3+Math.sin(ship.lightPhase)*0.2})`;ctx.beginPath();ctx.ellipse(0,-10,8,6,0,Math.PI,0);ctx.fill();
    ctx.fillStyle=pa;ctx.beginPath();ctx.ellipse(0,5,30,5,0,0,Math.PI*2);ctx.fill();
    for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2+ship.lightPhase;ctx.fillStyle=i%2===0?pt:'#0a0';ctx.beginPath();ctx.arc(Math.cos(a)*25,Math.sin(a)*5+2,2,0,Math.PI*2);ctx.fill();}
  }
}

function drawShip(){
  ctx.save();ctx.translate(ship.x,ship.y);ctx.rotate(ship.tilt);
  if(shipCloak.active){ctx.globalAlpha=0.15+Math.sin(Date.now()*0.005)*0.05;}
  const pc=shipPaint.color,pa=shipPaint.accent,pt=shipPaint.trail;
  const type=shipPaint.ship||'saucer';
  drawShipBody(pc,pa,pt,type);
  if(ship.boosting){for(let i=0;i<3;i++){ctx.fillStyle=`rgba(255,${Math.random()*100+100},0,${Math.random()*0.5+0.3})`;ctx.beginPath();ctx.arc((Math.random()-0.5)*20,10+Math.random()*10,Math.random()*4+2,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
  if(gameMode==='space'&&(Math.abs(ship.vx)>1||Math.abs(ship.vy)>1)){for(let i=0;i<2;i++)particles.push({x:ship.x+(Math.random()-0.5)*10,y:ship.y+12,vx:-ship.vx*0.3+(Math.random()-0.5),vy:-ship.vy*0.3+(Math.random()-0.5),life:15+Math.random()*10,color:pt,size:Math.random()*2+1});}
}

// --- HELPERS ---
function drawStar(c,cx,cy,r,pts){c.beginPath();for(let i=0;i<pts*2;i++){const a=Math.PI/2*3+i*Math.PI/pts;const rad=i%2===0?r:r*0.4;c.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);}c.closePath();c.fill();}
// Draw a detailed alien preview at given position and scale with a skin
function drawAlienPreview(cx,cy,sc,skin,facing,walkPhase){
  const _r2=skin.id==='classic'?0:0.55;
  const _sb2=(g)=>skinTint(g,skin.body,_r2);
  const _sh2=(g)=>skinTint(g,skin.head,_r2);
  const _sa2=(g)=>skinTint(g,skin.accent,_r2);
  const _eyeCol2=skin.id==='classic'?'#0a0a0a':skin.eyes;
  const _glowCol2=skin.id==='classic'?'#0f0':skin.glow;
  const t2=performance.now()*0.001;
  const f=facing||1, s=sc||1;
  const lo=Math.sin((walkPhase||0))*4*s;
  const breathe=Math.sin(t2*5)*0.3*s;
  const ax=cx, ay=cy;
  const bt=skin.bodyType||'grey';

  // --- ENERGY BODY TYPE: floating particle trail beneath ---
  if(bt==='energy'){
    for(let pi=0;pi<6;pi++){
      const pa=t2*2+pi*1.1;
      const pr=4+Math.sin(pa)*2;
      const py=ay-2*s+Math.sin(pa*1.3)*3*s;
      ctx.fillStyle=`rgba(${skin.glow==='#fff'?'220,200,255':'180,120,255'},${0.4-pi*0.05})`;
      ctx.beginPath();ctx.arc(ax+Math.cos(pa)*pr*s,py,(3-pi*0.3)*s,0,Math.PI*2);ctx.fill();
    }
    // Energy aura halo
    const eg=ctx.createRadialGradient(ax,ay-14*s,0,ax,ay-14*s,22*s);
    eg.addColorStop(0,`rgba(255,255,255,0.3)`);eg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=eg;ctx.fillRect(ax-25*s,ay-35*s,50*s,40*s);
  }

  // Back arm (skip for limbless body types)
  if(bt!=='larva' && bt!=='blob' && bt!=='tentacle' && bt!=='mushroom'){
    ctx.strokeStyle=_sb2(0x8a);ctx.lineWidth=1.8*s;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(ax-f*4*s,ay-16*s);ctx.quadraticCurveTo(ax-f*9*s,ay-10*s,ax-f*11*s,ay-6*s);ctx.stroke();
    ctx.lineWidth=0.8*s;
    for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(ax-f*11*s,ay-6*s);ctx.lineTo(ax-f*(12.5+Math.abs(i)*0.5)*s,ay+(-4+i*2)*s);ctx.stroke();}
  }

  // --- LEGS (vary by body type) ---
  if(bt==='larva'){
    // No legs — worm tail body drawn later
  } else if(bt==='energy'){
    // No legs — floats
  } else if(bt==='blob'){
    // Gelatinous pulsing base — quivering puddle
    const pulse=Math.sin(t2*3)*1.2*s;
    ctx.fillStyle=_sb2(0x66);
    ctx.beginPath();ctx.ellipse(ax,ay,10*s+pulse,2*s,0,0,Math.PI*2);ctx.fill();
  } else if(bt==='tentacle'){
    // 4 wriggling tentacles instead of legs
    ctx.strokeStyle=_sb2(0x88);ctx.lineWidth=2.5*s;ctx.lineCap='round';
    for(let tl=0;tl<4;tl++){
      const tOff=(tl-1.5)*2.2*s;
      const wig=Math.sin(t2*3+tl*0.8)*3*s;
      ctx.beginPath();
      ctx.moveTo(ax+tOff,ay-10*s);
      ctx.quadraticCurveTo(ax+tOff+wig,ay-5*s,ax+tOff+wig*1.4,ay-1*s);
      ctx.stroke();
      // Suckers (tiny dots)
      ctx.fillStyle=_sa2(0x55);
      for(let sk=0;sk<3;sk++){
        ctx.beginPath();ctx.arc(ax+tOff+wig*(0.3+sk*0.3),ay-(8-sk*3)*s,0.6*s,0,Math.PI*2);ctx.fill();
      }
      ctx.strokeStyle=_sb2(0x88);
    }
  } else if(bt==='mushroom'){
    // Stubby legs (rooty)
    ctx.fillStyle=_sa2(0x88);
    ctx.beginPath();ctx.ellipse(ax-2.5*s+lo*0.3,ay-1*s,2*s,3*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+2.5*s-lo*0.3,ay-1*s,2*s,3*s,0,0,Math.PI*2);ctx.fill();
    // Root fibers
    ctx.strokeStyle=_sa2(0x44);ctx.lineWidth=0.5*s;
    for(let rf=0;rf<4;rf++){
      const rfx=ax-3*s+rf*2*s;
      ctx.beginPath();ctx.moveTo(rfx,ay);ctx.lineTo(rfx+(Math.random()*2-1)*s,ay+1.5*s);ctx.stroke();
    }
  } else if(bt==='robot'){
    // Boxy mechanical legs
    ctx.fillStyle=_sa2(0x99);
    ctx.fillRect(ax-5*s, ay-8*s, 3.5*s, 5*s);
    ctx.fillRect(ax+1.5*s, ay-8*s, 3.5*s, 5*s);
    // Feet pads
    ctx.fillStyle=_sa2(0x66);
    ctx.fillRect(ax-6*s+lo*0.4, ay-3*s, 5.5*s, 2.5*s);
    ctx.fillRect(ax+0.5*s-lo*0.4, ay-3*s, 5.5*s, 2.5*s);
    // Joint bolts
    ctx.fillStyle='#999';
    ctx.beginPath();ctx.arc(ax-3.3*s,ay-8*s,0.9*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(ax+3.3*s,ay-8*s,0.9*s,0,Math.PI*2);ctx.fill();
  } else if(bt==='insect'){
    // 4 thin legs (two pairs)
    ctx.strokeStyle=_sa2(0x77);ctx.lineWidth=1.4*s;ctx.lineCap='round';
    // Pair 1 (front)
    ctx.beginPath();ctx.moveTo(ax-4*s,ay-10*s);ctx.quadraticCurveTo(ax-7*s,ay-5*s,ax-4*s+lo*0.6,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+4*s,ay-10*s);ctx.quadraticCurveTo(ax+7*s,ay-5*s,ax+4*s-lo*0.6,ay);ctx.stroke();
    // Pair 2 (back, shifted)
    ctx.beginPath();ctx.moveTo(ax-2*s,ay-10*s);ctx.quadraticCurveTo(ax-5*s,ay-4*s,ax-2*s-lo*0.6,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+2*s,ay-10*s);ctx.quadraticCurveTo(ax+5*s,ay-4*s,ax+2*s+lo*0.6,ay);ctx.stroke();
    // Pair 3 (middle, subtle)
    ctx.lineWidth=1*s;ctx.strokeStyle=_sa2(0x55);
    ctx.beginPath();ctx.moveTo(ax-3*s,ay-12*s);ctx.quadraticCurveTo(ax-9*s,ay-8*s,ax-8*s,ay-2*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+3*s,ay-12*s);ctx.quadraticCurveTo(ax+9*s,ay-8*s,ax+8*s,ay-2*s);ctx.stroke();
  } else if(bt==='humanoid'){
    // Longer, human-proportioned legs with pants hint
    ctx.strokeStyle=_sa2(0x77);ctx.lineWidth=2.5*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(ax-3*s,ay-7*s);ctx.lineTo(ax-3*s+lo*0.3,ay-3*s);ctx.lineTo(ax-3*s+lo*0.7,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+3*s,ay-7*s);ctx.lineTo(ax+3*s-lo*0.3,ay-3*s);ctx.lineTo(ax+3*s-lo*0.7,ay);ctx.stroke();
    // Shoes
    ctx.fillStyle='#2a2030';
    ctx.beginPath();ctx.ellipse(ax-3*s+lo*0.7,ay,3.5*s,1.6*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+3*s-lo*0.7,ay,3.5*s,1.6*s,0,0,Math.PI*2);ctx.fill();
  } else if(bt==='reptile'){
    // Crouched clawed legs + tail
    ctx.strokeStyle=_sa2(0x99);ctx.lineWidth=2.2*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(ax-3*s,ay-8*s);ctx.quadraticCurveTo(ax-6*s,ay-4*s,ax-4*s+lo,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+3*s,ay-8*s);ctx.quadraticCurveTo(ax+6*s,ay-4*s,ax+4*s-lo,ay);ctx.stroke();
    // Claws
    ctx.strokeStyle='#111';ctx.lineWidth=0.7*s;
    for(let cl=0;cl<3;cl++){
      ctx.beginPath();ctx.moveTo(ax-5*s+lo+cl,ay);ctx.lineTo(ax-5*s+lo+cl*0.8,ay+1.5*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(ax+5*s-lo-cl,ay);ctx.lineTo(ax+5*s-lo-cl*0.8,ay+1.5*s);ctx.stroke();
    }
    // TAIL — curving behind
    ctx.strokeStyle=_sb2(0x88);ctx.lineWidth=3.5*s;ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(ax-f*2*s,ay-8*s);
    ctx.quadraticCurveTo(ax-f*12*s,ay-6*s+Math.sin(t2*2)*2*s,ax-f*18*s,ay-2*s+Math.cos(t2*2)*3*s);
    ctx.stroke();
    ctx.lineWidth=1.5*s;
    ctx.beginPath();
    ctx.moveTo(ax-f*18*s,ay-2*s+Math.cos(t2*2)*3*s);
    ctx.lineTo(ax-f*21*s,ay+Math.cos(t2*2)*3*s);
    ctx.stroke();
  } else {
    // GREY default: classic 2 legs
    ctx.strokeStyle=_sa2(0x99);ctx.lineWidth=2*s;
    ctx.beginPath();ctx.moveTo(ax-3*s,ay-8*s);ctx.lineTo(ax-3*s+lo*0.5,ay-4*s);ctx.lineTo(ax-3*s+lo,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+3*s,ay-8*s);ctx.lineTo(ax+3*s-lo*0.5,ay-4*s);ctx.lineTo(ax+3*s-lo,ay);ctx.stroke();
    ctx.fillStyle=_sa2(0x88);
    ctx.beginPath();ctx.ellipse(ax-3*s+lo,ay,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+3*s-lo,ay,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
  }

  // Jetpack (skip for limbless/floating types)
  if(bt!=='larva' && bt!=='energy' && bt!=='blob' && bt!=='tentacle' && bt!=='mushroom'){
    ctx.fillStyle='#4a4a4a';ctx.fillRect(ax-f*4*s-3*s,ay-19*s,7*s,9*s);
    ctx.fillStyle='#5a5a5a';ctx.fillRect(ax-f*4*s-2*s,ay-18*s,5*s,2*s);
    ctx.fillStyle='#3a3a3a';ctx.fillRect(ax-f*4*s-1*s,ay-11*s,3*s,2*s);
  }

  // --- TORSO (varies by body type) ---
  if(bt==='larva'){
    // Segmented worm body: 3 bulging segments from bottom up
    for(let seg=0;seg<3;seg++){
      const sy2=ay-4*s - seg*8*s;
      const sw2=(7 - seg*0.7)*s;
      const sbg=ctx.createRadialGradient(ax-1*s,sy2-1*s,0,ax,sy2,sw2);
      sbg.addColorStop(0,_sb2(0xcc));sbg.addColorStop(1,_sb2(0x88));
      ctx.fillStyle=sbg;
      ctx.beginPath();ctx.ellipse(ax+Math.sin(t2*3+seg)*1.5*s,sy2,sw2,5*s,0,0,Math.PI*2);ctx.fill();
      // Segment ring shadow
      ctx.strokeStyle=_sb2(0x55);ctx.lineWidth=0.6*s;
      ctx.beginPath();ctx.ellipse(ax+Math.sin(t2*3+seg)*1.5*s,sy2+3*s,sw2*0.9,1.2*s,0,0,Math.PI*2);ctx.stroke();
    }
  } else if(bt==='robot'){
    // Boxy torso with panels
    ctx.fillStyle=_sb2(0xa0);
    ctx.fillRect(ax-5*s,ay-20*s,10*s,13*s);
    // Chest panel
    ctx.fillStyle=_sb2(0x70);
    ctx.fillRect(ax-3*s,ay-17*s,6*s,7*s);
    // Status light
    ctx.fillStyle=`rgba(255,60,60,${0.6+Math.sin(t2*5)*0.3})`;
    ctx.beginPath();ctx.arc(ax,ay-13*s,1*s,0,Math.PI*2);ctx.fill();
    // Bolts at corners
    ctx.fillStyle='#888';
    for(let bl=0;bl<4;bl++){
      const bxC=ax+(bl%2?4:-4)*s, byC=ay+(bl<2?-19:-8)*s;
      ctx.beginPath();ctx.arc(bxC,byC,0.8*s,0,Math.PI*2);ctx.fill();
    }
  } else if(bt==='humanoid'){
    // Taller humanoid torso (narrower waist, broader shoulders)
    const tg2=ctx.createLinearGradient(ax-6*s,ay-22*s,ax+6*s,ay-6*s);
    tg2.addColorStop(0,_sb2(0xb0));tg2.addColorStop(0.5,_sb2(0xbb));tg2.addColorStop(1,_sb2(0xa0));
    ctx.fillStyle=tg2;
    ctx.beginPath();
    ctx.moveTo(ax-6*s,ay-20*s);ctx.lineTo(ax+6*s,ay-20*s);
    ctx.quadraticCurveTo(ax+5*s,ay-14*s,ax+4*s,ay-7*s);
    ctx.lineTo(ax-4*s,ay-7*s);
    ctx.quadraticCurveTo(ax-5*s,ay-14*s,ax-6*s,ay-20*s);
    ctx.fill();
    // Suit collar
    ctx.fillStyle=_sb2(0x66);
    ctx.fillRect(ax-3*s,ay-21*s,6*s,2*s);
  } else if(bt==='blob'){
    // Gelatinous quivering blob body (bigger, translucent)
    const q=Math.sin(t2*4)*1.2*s;
    const bg=ctx.createRadialGradient(ax-2*s,ay-14*s,1,ax,ay-12*s,14*s);
    bg.addColorStop(0,_sb2(0xdd));bg.addColorStop(0.6,_sb2(0xaa));bg.addColorStop(1,_sb2(0x66));
    ctx.fillStyle=bg;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.ellipse(ax,ay-10*s,9*s+q,11*s,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
    // Inner bubbles
    ctx.fillStyle=`rgba(255,255,255,0.25)`;
    for(let bb=0;bb<4;bb++){
      const ba=t2*1.5+bb*1.4;
      ctx.beginPath();ctx.arc(ax+Math.cos(ba)*3*s,ay-10*s+Math.sin(ba)*4*s,1.2*s,0,Math.PI*2);ctx.fill();
    }
    // Highlight
    ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.beginPath();ctx.ellipse(ax-4*s,ay-14*s,2.5*s,1.5*s,-0.4,0,Math.PI*2);ctx.fill();
  } else if(bt==='tentacle'){
    // Bulb body (octopus mantle) — tall tapered
    const bg=ctx.createRadialGradient(ax-2*s,ay-18*s,1,ax,ay-14*s,9*s);
    bg.addColorStop(0,_sb2(0xc0));bg.addColorStop(1,_sb2(0x80));
    ctx.fillStyle=bg;
    ctx.beginPath();
    ctx.moveTo(ax-5*s,ay-10*s);
    ctx.quadraticCurveTo(ax-8*s,ay-18*s,ax-6*s,ay-24*s);
    ctx.quadraticCurveTo(ax,ay-28*s,ax+6*s,ay-24*s);
    ctx.quadraticCurveTo(ax+8*s,ay-18*s,ax+5*s,ay-10*s);
    ctx.closePath();ctx.fill();
    // Spots
    ctx.fillStyle=_sa2(0x55);
    for(let sp=0;sp<5;sp++){
      ctx.beginPath();ctx.arc(ax+(sp-2)*2*s,ay-(14+Math.sin(sp)*3)*s,1*s,0,Math.PI*2);ctx.fill();
    }
  } else if(bt==='mushroom'){
    // Short chubby stipe body
    ctx.fillStyle=_sb2(0xc0);
    ctx.beginPath();
    ctx.moveTo(ax-4*s,ay-5*s);
    ctx.quadraticCurveTo(ax-5*s,ay-12*s,ax-3*s,ay-18*s);
    ctx.lineTo(ax+3*s,ay-18*s);
    ctx.quadraticCurveTo(ax+5*s,ay-12*s,ax+4*s,ay-5*s);
    ctx.closePath();ctx.fill();
    // Stipe texture (vertical)
    ctx.strokeStyle=_sb2(0x90);ctx.lineWidth=0.5*s;
    for(let st=0;st<3;st++){
      const stx=ax-2*s+st*2*s;
      ctx.beginPath();ctx.moveTo(stx,ay-7*s);ctx.lineTo(stx+0.5*s,ay-17*s);ctx.stroke();
    }
  } else if(bt==='insect'){
    // Segmented chitin torso
    ctx.fillStyle=_sb2(0xa0);
    ctx.beginPath();ctx.ellipse(ax,ay-15*s,5*s,8*s,0,0,Math.PI*2);ctx.fill();
    // Chitin plate lines
    ctx.strokeStyle=_sb2(0x55);ctx.lineWidth=0.7*s;
    for(let pl=0;pl<3;pl++){
      ctx.beginPath();ctx.moveTo(ax-4*s,ay-(19-pl*4)*s);ctx.quadraticCurveTo(ax,ay-(19-pl*4)*s+1*s,ax+4*s,ay-(19-pl*4)*s);ctx.stroke();
    }
    // Wing stubs
    ctx.fillStyle=`rgba(${skin.glow==='#fff'?'255,255,255':'180,180,255'},0.3)`;
    ctx.beginPath();ctx.ellipse(ax-f*6*s,ay-16*s,4*s,7*s,-0.3,0,Math.PI*2);ctx.fill();
  } else {
    // GREY / REPTILE default torso
    const tg2=ctx.createLinearGradient(ax-5*s,ay-22*s,ax+5*s,ay-6*s);
    tg2.addColorStop(0,_sb2(0xaa));tg2.addColorStop(0.5,_sb2(0xb5));tg2.addColorStop(1,_sb2(0x99));
    ctx.fillStyle=tg2;
    ctx.beginPath();ctx.moveTo(ax-4*s,ay-20*s);ctx.lineTo(ax+4*s,ay-20*s);
    ctx.quadraticCurveTo(ax+6*s,ay-14*s,ax+5*s,ay-7*s);ctx.lineTo(ax-5*s,ay-7*s);
    ctx.quadraticCurveTo(ax-6*s,ay-14*s,ax-4*s,ay-20*s);ctx.fill();
    // Reptile: belly scales
    if(bt==='reptile'){
      ctx.strokeStyle=_sb2(0x66);ctx.lineWidth=0.6*s;
      for(let sc=0;sc<4;sc++){
        ctx.beginPath();ctx.moveTo(ax-3*s,ay-(17-sc*3)*s);ctx.lineTo(ax+3*s,ay-(17-sc*3)*s);ctx.stroke();
      }
    }
  }

  // Neck (larva: short stalk; robot: boxy; energy/blob/tentacle: none)
  if(bt==='larva'){
    // Short neck poking out of top segment
    ctx.fillStyle=_sb2(0xb0);
    ctx.fillRect(ax-2*s,ay-22*s,4*s,3*s);
  } else if(bt==='energy' || bt==='blob' || bt==='tentacle' || bt==='mushroom'){
    // No visible neck
  } else if(bt==='robot'){
    ctx.fillStyle=_sb2(0x90);ctx.fillRect(ax-3*s,ay-24*s,6*s,5*s);
    // Neck cables
    ctx.strokeStyle='#222';ctx.lineWidth=0.6*s;
    ctx.beginPath();ctx.moveTo(ax-2*s,ay-23*s);ctx.lineTo(ax-2*s,ay-20*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+2*s,ay-23*s);ctx.lineTo(ax+2*s,ay-20*s);ctx.stroke();
  } else {
    ctx.fillStyle=_sb2(0xa5);ctx.fillRect(ax-2*s,ay-24*s,4*s,5*s);
  }

  // Head position shifts
  const _headShift = bt==='larva' ? -2*s : (bt==='blob' || bt==='tentacle') ? 10*s : bt==='mushroom' ? 4*s : 0;
  const _isHuman = bt==='humanoid' && skin.hair;

  // Head
  const hx2=ax, hy2=ay-33*s+_headShift;
  if(_isHuman){
    // Small human head (round, shorter)
    const hgH=ctx.createRadialGradient(hx2-2*s,hy2-2*s,1*s,hx2,hy2,8*s);
    hgH.addColorStop(0,_sh2(0xe0));hgH.addColorStop(0.6,_sh2(0xbc));hgH.addColorStop(1,_sh2(0x90));
    ctx.fillStyle=hgH;
    ctx.beginPath();ctx.ellipse(hx2,hy2+2*s,6.5*s,7.5*s,0,0,Math.PI*2);ctx.fill();
    // Ears
    ctx.fillStyle=_sh2(0xa0);
    ctx.beginPath();ctx.ellipse(hx2-6*s,hy2+2*s,1.2*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+6*s,hy2+2*s,1.2*s,2*s,0,0,Math.PI*2);ctx.fill();
    // Hair (top + sides)
    ctx.fillStyle=skin.hair;
    ctx.beginPath();
    ctx.moveTo(hx2-6*s,hy2-2*s);
    ctx.quadraticCurveTo(hx2-7*s,hy2-7*s,hx2-3*s,hy2-6*s);
    ctx.quadraticCurveTo(hx2,hy2-8*s,hx2+3*s,hy2-6*s);
    ctx.quadraticCurveTo(hx2+7*s,hy2-7*s,hx2+6*s,hy2-2*s);
    ctx.quadraticCurveTo(hx2+3*s,hy2-4*s,hx2,hy2-4*s);
    ctx.quadraticCurveTo(hx2-3*s,hy2-4*s,hx2-6*s,hy2-2*s);
    ctx.closePath();ctx.fill();
  } else if(bt==='blob'){
    // No separate head — eyes float in top of blob body
  } else if(bt==='tentacle'){
    // No separate head — large eye on mantle
  } else if(bt==='mushroom'){
    // Mushroom cap acting as head
    const cg=ctx.createRadialGradient(hx2-3*s,hy2-5*s,1*s,hx2,hy2,14*s);
    cg.addColorStop(0,_sh2(0xd0));cg.addColorStop(0.7,_sh2(0xa0));cg.addColorStop(1,_sh2(0x70));
    ctx.fillStyle=cg;
    ctx.beginPath();
    ctx.moveTo(hx2-12*s,hy2+4*s);
    ctx.quadraticCurveTo(hx2-14*s,hy2-8*s,hx2,hy2-12*s);
    ctx.quadraticCurveTo(hx2+14*s,hy2-8*s,hx2+12*s,hy2+4*s);
    ctx.quadraticCurveTo(hx2,hy2+7*s,hx2-12*s,hy2+4*s);
    ctx.closePath();ctx.fill();
    // White spots (fly agaric style)
    ctx.fillStyle='rgba(255,255,240,0.85)';
    const spotCoords=[[-7,-5],[0,-8],[6,-6],[-4,-1],[5,-1],[-9,0]];
    spotCoords.forEach(([sx,sy])=>{
      ctx.beginPath();ctx.ellipse(hx2+sx*s,hy2+sy*s,1.6*s,1.2*s,0,0,Math.PI*2);ctx.fill();
    });
    // Cap underside edge
    ctx.strokeStyle=_sh2(0x50);ctx.lineWidth=0.6*s;
    ctx.beginPath();ctx.moveTo(hx2-12*s,hy2+4*s);ctx.quadraticCurveTo(hx2,hy2+7*s,hx2+12*s,hy2+4*s);ctx.stroke();
  } else {
    const hg2=ctx.createRadialGradient(hx2-2*s,hy2-3*s,1*s,hx2,hy2,11*s);
    hg2.addColorStop(0,_sh2(0xcc));hg2.addColorStop(0.6,_sh2(0xb0));hg2.addColorStop(1,_sh2(0x90));
    ctx.fillStyle=hg2;
    ctx.beginPath();
    ctx.moveTo(hx2,hy2+9*s);
    ctx.quadraticCurveTo(hx2-5*s,hy2+7*s,hx2-10*s,hy2-1*s);
    ctx.quadraticCurveTo(hx2-11*s,hy2-8*s,hx2-8*s,hy2-11*s);
    ctx.quadraticCurveTo(hx2,hy2-15*s,hx2+8*s,hy2-11*s);
    ctx.quadraticCurveTo(hx2+11*s,hy2-8*s,hx2+10*s,hy2-1*s);
    ctx.quadraticCurveTo(hx2+5*s,hy2+7*s,hx2,hy2+9*s);
    ctx.fill();
  }

  // Eyes + face
  if(_isHuman){
    // Small human eyes (white with iris)
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.ellipse(hx2-2.2*s,hy2+0.5*s,1.4*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+2.2*s,hy2+0.5*s,1.4*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    ctx.beginPath();ctx.arc(hx2-2*s,hy2+0.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx2+2.4*s,hy2+0.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    // Nose
    ctx.strokeStyle=_sh2(0x80);ctx.lineWidth=0.7*s;
    ctx.beginPath();ctx.moveTo(hx2,hy2+2*s);ctx.lineTo(hx2-0.5*s,hy2+4*s);ctx.lineTo(hx2+0.5*s,hy2+4*s);ctx.stroke();
    // Mouth
    ctx.strokeStyle='#a04040';ctx.lineWidth=0.8*s;
    ctx.beginPath();ctx.moveTo(hx2-1.5*s,hy2+6*s);ctx.quadraticCurveTo(hx2,hy2+(6.5+breathe)*s,hx2+1.5*s,hy2+6*s);ctx.stroke();
  } else if(bt==='blob'){
    // Single or double eyes inside goo at top
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(ax-3*s,ay-14*s,2*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(ax+3*s,ay-14*s,2*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    const bEyeX=Math.sin(t2*2)*0.5*s;
    ctx.beginPath();ctx.arc(ax-3*s+bEyeX,ay-14*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(ax+3*s+bEyeX,ay-14*s,1*s,0,Math.PI*2);ctx.fill();
    // Mouth (tiny curve)
    ctx.strokeStyle='#222';ctx.lineWidth=0.7*s;
    ctx.beginPath();ctx.moveTo(ax-2*s,ay-9*s);ctx.quadraticCurveTo(ax,ay-(8-breathe)*s,ax+2*s,ay-9*s);ctx.stroke();
  } else if(bt==='tentacle'){
    // Big cartoonish eye on mantle
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.ellipse(ax,ay-20*s,4.5*s,3.5*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    const tEyeX=Math.sin(t2*1.5)*1*s;
    ctx.beginPath();ctx.arc(ax+tEyeX,ay-20*s,1.8*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.beginPath();ctx.arc(ax+tEyeX-0.6*s,ay-21*s,0.6*s,0,Math.PI*2);ctx.fill();
    // Beak
    ctx.fillStyle='#1a0a0a';
    ctx.beginPath();ctx.moveTo(ax-1.5*s,ay-13*s);ctx.lineTo(ax+1.5*s,ay-13*s);ctx.lineTo(ax,ay-11*s);ctx.closePath();ctx.fill();
  } else if(bt==='mushroom'){
    // Eyes on stipe (below cap)
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(hx2-2*s,hy2+8*s,1.3*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx2+2*s,hy2+8*s,1.3*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    ctx.beginPath();ctx.arc(hx2-2*s,hy2+8*s,0.7*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx2+2*s,hy2+8*s,0.7*s,0,Math.PI*2);ctx.fill();
    // Mouth
    ctx.strokeStyle=_sh2(0x30);ctx.lineWidth=0.6*s;
    ctx.beginPath();ctx.moveTo(hx2-1.5*s,hy2+11*s);ctx.quadraticCurveTo(hx2,hy2+(11.5+breathe)*s,hx2+1.5*s,hy2+11*s);ctx.stroke();
    // Floating spores
    ctx.fillStyle=_glowCol2+'88';
    for(let sp=0;sp<4;sp++){
      const spa=t2*0.8+sp*1.57;
      ctx.beginPath();ctx.arc(hx2+Math.cos(spa)*12*s,hy2-6*s+Math.sin(spa)*3*s-((t2*8+sp*4)%10)*s,0.8*s,0,Math.PI*2);ctx.fill();
    }
  } else {
    ctx.fillStyle=_eyeCol2;
    ctx.save();ctx.translate(hx2-4*s,hy2-1*s);ctx.rotate(-0.2);
    ctx.beginPath();ctx.ellipse(0,0,5*s,3.2*s,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(hx2+4*s,hy2-1*s);ctx.rotate(0.2);
    ctx.beginPath();ctx.ellipse(0,0,5*s,3.2*s,0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(skin.id!=='classic'){
      ctx.fillStyle=_glowCol2+'44';
      ctx.beginPath();ctx.arc(hx2-4*s,hy2-1*s,6*s,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(hx2+4*s,hy2-1*s,6*s,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(255,255,255,0.18)';
    ctx.beginPath();ctx.ellipse(hx2-6*s,hy2-3*s,1.5*s,1*s,-.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+2*s,hy2-3*s,1.5*s,1*s,.2,0,Math.PI*2);ctx.fill();

    // Nostrils + mouth
    ctx.fillStyle=_sh2(0x7a);
    ctx.beginPath();ctx.ellipse(hx2-1*s,hy2+4*s,0.7*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+1*s,hy2+4*s,0.7*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=_sh2(0x6a);ctx.lineWidth=0.7*s;
    ctx.beginPath();ctx.moveTo(hx2-2.5*s,hy2+6.5*s);ctx.quadraticCurveTo(hx2,hy2+(7+breathe)*s,hx2+2.5*s,hy2+6.5*s);ctx.stroke();
  }

  // Front arm + gun (skip for limbless types)
  if(bt!=='blob' && bt!=='tentacle' && bt!=='mushroom' && bt!=='larva'){
    ctx.strokeStyle=_sb2(0xaa);ctx.lineWidth=1.8*s;
    ctx.beginPath();ctx.moveTo(ax+f*4*s,ay-17*s);ctx.quadraticCurveTo(ax+f*9*s,ay-14*s,ax+f*13*s,ay-12*s);ctx.stroke();
    ctx.lineWidth=0.8*s;ctx.strokeStyle=_sb2(0x99);
    for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(ax+f*13*s,ay-12*s);ctx.lineTo(ax+f*14*s,ay+(-12.5+i*1.5)*s);ctx.stroke();}
    // Gun
    ctx.save();ctx.translate(ax+f*13*s,ay-12*s);ctx.scale(f,1);
    ctx.fillStyle='#3a3a3a';ctx.beginPath();
    ctx.moveTo(-1*s,-2.5*s);ctx.lineTo(12*s,-1.5*s);ctx.lineTo(13*s,0);ctx.lineTo(12*s,1.5*s);ctx.lineTo(-1*s,2.5*s);ctx.lineTo(-2*s,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#555';ctx.fillRect(3*s,-1*s,3*s,2*s);
    const gp=0.5+Math.sin(t2*6)*0.3;
    ctx.fillStyle=_glowCol2;ctx.globalAlpha=gp;ctx.beginPath();ctx.arc(13*s,0,2*s,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.fillStyle=_glowCol2;ctx.beginPath();ctx.arc(13*s,0,1*s,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  // Cyber overlay
  if(skin.cyber){
    ctx.strokeStyle='rgba(0,255,0,0.4)';ctx.lineWidth=0.8*s;
    ctx.strokeRect(ax-4*s,ay-19*s,8*s,10*s);
    ctx.fillStyle='rgba(0,255,0,0.1)';ctx.fillRect(ax-4*s,ay-19*s,8*s,10*s);
    ctx.strokeStyle=`rgba(0,255,0,${0.2+Math.sin(t2*5)*0.15})`;ctx.lineWidth=0.5*s;
    ctx.beginPath();ctx.moveTo(ax-4*s,ay-15*s);ctx.lineTo(ax,ay-17*s);ctx.lineTo(ax+4*s,ay-13*s);ctx.stroke();
    ctx.fillStyle=`rgba(255,0,0,${0.5+Math.sin(t2*6)*0.3})`;
    ctx.beginPath();ctx.arc(hx2+4*s,hy2-1*s,2*s,0,Math.PI*2);ctx.fill();
  }

  // --- Body-type head accessories ---
  if(bt==='insect'){
    // Twin antennae with bulbs
    ctx.strokeStyle=_sh2(0x55);ctx.lineWidth=1*s;ctx.lineCap='round';
    const ant1=Math.sin(t2*3)*2*s, ant2=Math.cos(t2*3)*2*s;
    ctx.beginPath();ctx.moveTo(hx2-3*s,hy2-11*s);ctx.quadraticCurveTo(hx2-5*s,hy2-17*s,hx2-6*s+ant1,hy2-21*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx2+3*s,hy2-11*s);ctx.quadraticCurveTo(hx2+5*s,hy2-17*s,hx2+6*s+ant2,hy2-21*s);ctx.stroke();
    ctx.fillStyle=_glowCol2;
    ctx.beginPath();ctx.arc(hx2-6*s+ant1,hy2-21*s,1.5*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx2+6*s+ant2,hy2-21*s,1.5*s,0,Math.PI*2);ctx.fill();
    // Mandibles (over mouth)
    ctx.strokeStyle=_sh2(0x40);ctx.lineWidth=0.9*s;
    ctx.beginPath();ctx.moveTo(hx2-2.5*s,hy2+6*s);ctx.lineTo(hx2-4*s,hy2+8*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx2+2.5*s,hy2+6*s);ctx.lineTo(hx2+4*s,hy2+8*s);ctx.stroke();
  } else if(bt==='robot'){
    // Single antenna with blinking light
    ctx.strokeStyle='#666';ctx.lineWidth=1.2*s;
    ctx.beginPath();ctx.moveTo(hx2,hy2-12*s);ctx.lineTo(hx2,hy2-20*s);ctx.stroke();
    ctx.fillStyle=`rgba(255,50,50,${0.4+Math.sin(t2*8)*0.4})`;
    ctx.beginPath();ctx.arc(hx2,hy2-21*s,1.5*s,0,Math.PI*2);ctx.fill();
    // Ear speakers
    ctx.fillStyle='#333';
    ctx.fillRect(hx2-11*s,hy2-3*s,2*s,6*s);
    ctx.fillRect(hx2+9*s,hy2-3*s,2*s,6*s);
    // Metallic sheen
    ctx.fillStyle='rgba(255,255,255,0.1)';
    ctx.fillRect(hx2-8*s,hy2-10*s,3*s,15*s);
  } else if(bt==='energy'){
    // Shimmering particle halo around head
    for(let ph=0;ph<8;ph++){
      const pa=t2*2+ph*(Math.PI/4);
      ctx.fillStyle=`rgba(${skin.body==='rainbow'?'255,200,255':'200,180,255'},${0.2+Math.sin(t2*4+ph)*0.15})`;
      ctx.beginPath();ctx.arc(hx2+Math.cos(pa)*14*s,hy2+Math.sin(pa)*11*s,1.5*s,0,Math.PI*2);ctx.fill();
    }
  } else if(bt==='humanoid' && !skin.hair){
    // Subtle hair tufts at top of head (non-human humanoids)
    ctx.fillStyle=_sh2(0x55);
    for(let hr=0;hr<5;hr++){
      const hx3=hx2-6*s+hr*3*s;
      ctx.beginPath();
      ctx.moveTo(hx3,hy2-11*s);
      ctx.lineTo(hx3+1*s,hy2-14*s);
      ctx.lineTo(hx3+2*s,hy2-11*s);
      ctx.closePath();ctx.fill();
    }
  }
}

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function lerpColor(c1,c2,t){const p=c=>{if(c.length===4)return[parseInt(c[1]+c[1],16),parseInt(c[2]+c[2],16),parseInt(c[3]+c[3],16)];return[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];};const a=p(c1),b=p(c2);return`rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;}

// --- SPACE AMBIENCE AUDIO ---
// Audio - lazy loaded (preload=none prevents decode lag on startup)
function mkAudio(src,vol,loop){const a=new Audio();a.preload='none';a.src=src;a.volume=vol||0;a.loop=!!loop;return a;}
const spaceAmbience=mkAudio('space-ambience.mp3',0,true);
const flameSfx=mkAudio('flame-sound.mp3',0.03,true);
const planetMusic={earth:mkAudio('earth-music.wav',0,true),asteroid:mkAudio('eerie-music.mp3',0,true)};
const mothershipMusic=mkAudio('mothership-music.mp3',0,true);
const alienVoiceSfx=mkAudio('alien-voice.mp3',0.5,false);
spaceAmbience.loop=true;spaceAmbience.volume=0;
let ambienceTarget=0,ambiencePlaying=false;
function updateAmbience(){
  // Space ambience
  ambienceTarget=(gameMode==='space'&&!mothershipMode)?0.03:0;
  const diff=ambienceTarget-spaceAmbience.volume;
  spaceAmbience.volume=Math.max(0,Math.min(1,spaceAmbience.volume+diff*0.02));
  if(ambienceTarget>0&&!ambiencePlaying){spaceAmbience.play().catch(()=>{});ambiencePlaying=true;}
  if(spaceAmbience.volume<0.01&&ambienceTarget===0&&ambiencePlaying){spaceAmbience.pause();ambiencePlaying=false;}
  // Mothership music
  if(mothershipMode){
    if(mothershipMusic.paused)mothershipMusic.play().catch(()=>{});
    mothershipMusic.volume=Math.min(0.02,mothershipMusic.volume+0.002);
  }else{mothershipMusic.volume=Math.max(0,mothershipMusic.volume-0.01);if(mothershipMusic.volume<0.01&&!mothershipMusic.paused)mothershipMusic.pause();}
  // Planet music
  const wantMusic=(gameMode==='planet'&&currentPlanet)?planetMusic[currentPlanet.id]:null;
  // Fade out wrong music
  Object.entries(planetMusic).forEach(([id,audio])=>{
    if(audio!==wantMusic){audio.volume=Math.max(0,audio.volume-0.01);if(audio.volume<0.01&&!audio.paused)audio.pause();}
  });
  // Fade in correct music
  if(wantMusic){
    if(wantMusic.paused){wantMusic.currentTime=0;wantMusic.play().catch(()=>{});}
    wantMusic.volume=Math.min(0.02,wantMusic.volume+0.002);
  }
}

// FPS counter
let _fpsFrames=0,_fpsLast=performance.now(),_fpsDisplay=0,_fpsShow=false;
function gameLoop(){
  if(mainMenuMode){
    updateMainMenu();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    drawMainMenu();
    ctx.restore();
    requestAnimationFrame(gameLoop);
    return;
  }
  // Pause menu
  if(pauseMenu.active){
    if(pauseMenu._cool>0)pauseMenu._cool--;
    else{
      if(keys['w']||keys['arrowup']){pauseMenu.sel--;pauseMenu._cool=10;}
      if(keys['s']||keys['arrowdown']){pauseMenu.sel++;pauseMenu._cool=10;}
      const items=['RESUME','SAVE GAME','SAVE & QUIT TO MENU'];
      pauseMenu.sel=((pauseMenu.sel%items.length)+items.length)%items.length;
      if(keys['escape']){keys['escape']=false;pauseMenu.active=false;pauseMenu._cool=10;}
      if(keys['enter']||keys[' ']){
        keys['enter']=false;keys[' ']=false;pauseMenu._cool=15;
        if(pauseMenu.sel===0){pauseMenu.active=false;}
        else if(pauseMenu.sel===1){saveGame();showMessage('Game saved!');pauseMenu.active=false;}
        else if(pauseMenu.sel===2){saveGame();gameStarted=false;mainMenuMode='menu';mainMenuSel=0;pauseMenu.active=false;}
      }
    }
    // Draw pause overlay
    draw();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    const cw=canvas.width,ch=canvas.height,t=performance.now()/1000;
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,cw,ch);
    ctx.fillStyle='#0f0';ctx.font='bold 28px monospace';ctx.textAlign='center';
    ctx.fillText('PAUSED',cw/2,ch*0.3);
    const items=['RESUME','SAVE GAME','SAVE & QUIT TO MENU'];
    items.forEach((label,i)=>{
      const iy=ch*0.42+i*45;
      const sel=i===pauseMenu.sel;
      if(sel){
        ctx.fillStyle=`rgba(0,255,0,${0.08+Math.sin(t*4)*0.04})`;
        roundRect(ctx,cw/2-120,iy-18,240,36,8);ctx.fill();
        ctx.strokeStyle=`rgba(0,255,0,${0.5+Math.sin(t*3)*0.2})`;ctx.lineWidth=1.5;
        roundRect(ctx,cw/2-120,iy-18,240,36,8);ctx.stroke();
      }
      ctx.fillStyle=sel?'#0f0':'rgba(0,200,0,0.4)';
      ctx.font=sel?'bold 16px monospace':'14px monospace';ctx.textAlign='center';
      ctx.fillText(label,cw/2,iy+5);
    });
    ctx.fillStyle='rgba(0,200,0,0.2)';ctx.font='10px monospace';
    ctx.fillText('ESC to resume  |  W/S to select  |  ENTER to confirm',cw/2,ch-30);
    ctx.restore();
    requestAnimationFrame(gameLoop);
    return;
  }
  let _t0=performance.now();update();window._tUpd=(performance.now()-_t0)|0;_t0=performance.now();draw();window._tDrw=(performance.now()-_t0)|0;updateAmbience();
  // FPS tracking
  _fpsFrames++;
  const now=performance.now();
  if(now-_fpsLast>=1000){_fpsDisplay=_fpsFrames;_fpsFrames=0;_fpsLast=now;}
  if(_fpsShow){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(5,5,145,70);
    ctx.fillStyle=_fpsDisplay<30?'#f44':_fpsDisplay<50?'#fa0':'#0f0';ctx.font='bold 14px monospace';ctx.textAlign='left';
    ctx.fillText(`FPS: ${_fpsDisplay}`,10,22);
    ctx.fillStyle='#aaa';ctx.font='9px monospace';
    ctx.fillText(`upd:${window._tUpd||0}ms drw:${window._tDrw||0}ms`,10,36);
    ctx.fillText(`blk:${blocks.length} hum:${humans.length} par:${particles.length}`,10,48);
    ctx.fillText(`fire:${fires.length} cow:${cows.length} wth:${weather.length}`,10,60);
    ctx.fillText(`F4:perf mode${window._perfMode?' ON':''}`,10,72);
    ctx.restore();}
  requestAnimationFrame(gameLoop);
}
function startGame(isContinue){
  document.getElementById('start-screen').style.display='none';
  gameStarted=true; mainMenuMode=null;
  if(isContinue && loadGame()){
    initSpacePlanets(); generateDeepStars();
    loadPlanet(planets[0]);
    document.getElementById('score').textContent=score;
    showMessage('Welcome back, Commander.');
  } else {
    initWorld();
    showMessage(tr('msg.startMsg'));
  }
  initTouchControls();
}

// Auto-save periodically
setInterval(()=>{ if(gameStarted) saveGame(); }, 30000);

// Draw main menu on canvas
function drawMainMenu(){
  const cw=canvas.width, ch=canvas.height, t=performance.now()/1000;
  mainMenuAlienPhase+=0.03;

  // Background — deep space
  ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);

  // Animated stars
  mainMenuStars.forEach(s=>{
    s.y+=s.sp; if(s.y>1)s.y=0;
    s.b=0.3+Math.sin(t*2+s.x*10)*0.3;
    ctx.fillStyle=`rgba(200,255,200,${s.b})`;
    ctx.fillRect(s.x*cw, s.y*ch, s.s, s.s);
  });

  // Nebula glow
  const ng=ctx.createRadialGradient(cw*0.3,ch*0.3,0,cw*0.3,ch*0.3,cw*0.5);
  ng.addColorStop(0,`rgba(0,100,50,${0.04+Math.sin(t*0.5)*0.02})`);ng.addColorStop(1,'transparent');
  ctx.fillStyle=ng;ctx.fillRect(0,0,cw,ch);
  const ng2=ctx.createRadialGradient(cw*0.7,ch*0.7,0,cw*0.7,ch*0.7,cw*0.4);
  ng2.addColorStop(0,`rgba(50,0,100,${0.03+Math.sin(t*0.7)*0.015})`);ng2.addColorStop(1,'transparent');
  ctx.fillStyle=ng2;ctx.fillRect(0,0,cw,ch);

  // titleY = bottom edge of logo bounding box.
  const titleY=ch*0.55;
  if(!window._logoImg){window._logoImg=new Image();window._logoImg.src='logo.png';}
  const li=window._logoImg;
  if(li.complete&&li.naturalWidth>0){
    const lh=Math.min(ch*0.42,360);
    const lw=lh*(li.naturalWidth/li.naturalHeight);
    ctx.save();
    ctx.shadowColor='#0f0';ctx.shadowBlur=25+Math.sin(t*2)*10;
    // Anchor logo so its bottom sits just above titleY (close to menu)
    ctx.drawImage(li,cw/2-lw/2,titleY-lh,lw,lh);
    ctx.restore();
  }else{
    ctx.save();
    ctx.shadowColor='#0f0';ctx.shadowBlur=30+Math.sin(t*2)*10;
    ctx.fillStyle='#0f0';ctx.font='bold 52px monospace';ctx.textAlign='center';
    ctx.fillText('SpaceShip',cw/2,titleY);
    ctx.restore();
  }

  // Alien preview moved into the skin/race cards themselves (see below).
  // Main menu shows only the logo — no alien.
  const skin=getAlienSkin();

  if(mainMenuMode==='menu'){
    // Menu options
    const hasSave=hasSaveGame();
    const items=[];
    if(hasSave) items.push({label:'CONTINUE', action:'continue'});
    items.push({label:'NEW GAME', action:'new'});
    items.push({label:'ALIEN SKINS', action:'skins'});
    items.push({label:'SHIP SKINS', action:'shipskins'});
    const menuY=ch*0.52;
    const itemH=42;
    mainMenuSel=((mainMenuSel%items.length)+items.length)%items.length;
    items.forEach((item,i)=>{
      const iy=menuY+i*itemH;
      const sel=i===mainMenuSel;
      // Button background
      if(sel){
        ctx.fillStyle=`rgba(0,255,0,${0.08+Math.sin(t*4)*0.04})`;
        roundRect(ctx,cw/2-130,iy-16,260,36,8);ctx.fill();
        ctx.strokeStyle=`rgba(0,255,0,${0.6+Math.sin(t*3)*0.2})`;ctx.lineWidth=2;
        roundRect(ctx,cw/2-130,iy-16,260,36,8);ctx.stroke();
      }
      ctx.fillStyle=sel?'#0f0':'rgba(0,200,0,0.4)';
      ctx.font=sel?'bold 20px monospace':'18px monospace';ctx.textAlign='center';
      ctx.fillText(item.label,cw/2,iy+6);
      if(sel){
        // Arrow indicators
        ctx.fillText('\u25B6',cw/2-120,iy+6);
        ctx.fillText('\u25C0',cw/2+120,iy+6);
      }
    });
    // Hint
    ctx.fillStyle='rgba(0,200,0,0.25)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('W/S or \u2191/\u2193 to select  |  ENTER or SPACE to confirm',cw/2,ch-30);
    // Language selector
    const langs=['EN','DE','SV','ES','PT','FR'];
    const langCodes=['en','de','sv','es','pt','fr'];
    ctx.font='10px monospace';
    const langY=ch-55;
    langs.forEach((l,i)=>{
      const lx=cw/2-75+i*30;
      const isCur=currentLang===langCodes[i];
      ctx.fillStyle=isCur?'#0f0':'rgba(0,200,0,0.3)';
      ctx.fillText(l,lx,langY);
    });
  }
  else if(mainMenuMode==='skins'){
    // --- Step 1: RACE selector ---
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('CHOOSE YOUR RACE',cw/2,ch*0.12);

    const cols=4, cardW=200, cardH=230, gap=18;
    const totalW=cols*(cardW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.18;
    mainMenuSel=((mainMenuSel%ALIEN_RACES.length)+ALIEN_RACES.length)%ALIEN_RACES.length;
    ALIEN_RACES.forEach((race,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(cardW+gap), sy=startY+row*(cardH+gap);
      const sel=i===mainMenuSel;
      const isCur=selectedRace===race.id;
      ctx.fillStyle=sel?'rgba(0,50,20,0.85)':'rgba(0,15,5,0.6)';
      roundRect(ctx,sx,sy,cardW,cardH,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2.5;roundRect(ctx,sx,sy,cardW,cardH,8);ctx.stroke();}
      if(isCur){ctx.strokeStyle='rgba(255,215,0,0.7)';ctx.lineWidth=1.5;roundRect(ctx,sx+3,sy+3,cardW-6,cardH-6,6);ctx.stroke();}
      // Preview: show first skin of race (larger)
      const previewSkin=race.skins[0];
      drawAlienPreview(sx+cardW/2, sy+cardH*0.72, 2.6, previewSkin, 1, t*2+i);
      // Race name
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.65)';
      ctx.font='bold 16px monospace';ctx.textAlign='center';
      ctx.fillText(race.name.toUpperCase(),sx+cardW/2,sy+cardH-32);
      // Description
      ctx.fillStyle='rgba(180,220,180,0.5)';ctx.font='10px monospace';
      ctx.fillText(race.description,sx+cardW/2,sy+cardH-14);
      // Variant count
      ctx.fillStyle='rgba(0,200,0,0.4)';ctx.font='9px monospace';
      ctx.fillText(race.skins.length+' VARIANTS',sx+cardW/2,sy+18);
      if(isCur){ctx.fillStyle='#fd0';ctx.font='14px monospace';ctx.fillText('\u2605',sx+cardW-14,sy+18);}
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('WASD/Arrows to browse  |  ENTER/SPACE to view variants  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='raceskins'){
    // --- Step 2: SKIN variant selector for the race the user just drilled into ---
    const race=ALIEN_RACES[window._mmRaceIdx||0]||getRace(selectedRace);
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText(race.name.toUpperCase()+' VARIANTS',cw/2,ch*0.12);
    ctx.fillStyle='rgba(180,220,180,0.5)';ctx.font='11px monospace';
    ctx.fillText(race.description,cw/2,ch*0.16);

    const skins=race.skins;
    const cols=Math.min(skins.length,4), cardW=190, cardH=230, gap=16;
    const totalW=cols*(cardW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.22;
    mainMenuSel=((mainMenuSel%skins.length)+skins.length)%skins.length;
    skins.forEach((sk,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(cardW+gap), sy=startY+row*(cardH+gap);
      const sel=i===mainMenuSel;
      const isCur=selectedSkin===sk.id;
      ctx.fillStyle=sel?'rgba(0,45,15,0.85)':'rgba(0,12,5,0.6)';
      roundRect(ctx,sx,sy,cardW,cardH,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2;roundRect(ctx,sx,sy,cardW,cardH,8);ctx.stroke();}
      if(isCur){ctx.strokeStyle='rgba(255,215,0,0.7)';ctx.lineWidth=1.5;roundRect(ctx,sx+3,sy+3,cardW-6,cardH-6,6);ctx.stroke();}
      drawAlienPreview(sx+cardW/2, sy+cardH*0.75, 2.6, sk, 1, t*2+i);
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.6)';
      ctx.font=sel?'bold 13px monospace':'12px monospace';ctx.textAlign='center';
      ctx.fillText(sk.name,sx+cardW/2,sy+cardH-14);
      if(isCur){ctx.fillStyle='#fd0';ctx.font='13px monospace';ctx.fillText('\u2605',sx+cardW-12,sy+16);}
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('A/D to browse  |  ENTER/SPACE to equip  |  ESC to back to races',cw/2,ch-20);
  }
  else if(mainMenuMode==='shipskins'){
    // Ship skin selector
    ctx.fillStyle='rgba(0,255,0,0.5)';ctx.font='bold 16px monospace';ctx.textAlign='center';
    ctx.fillText('SELECT SHIP SKIN',cw/2,ch*0.15);

    const cols=4, skinW=110, skinH=90, gap=12;
    const totalW=cols*(skinW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.22;
    mainMenuSel=((mainMenuSel%SHIP_PAINTS.length)+SHIP_PAINTS.length)%SHIP_PAINTS.length;
    SHIP_PAINTS.forEach((sp,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(skinW+gap), sy=startY+row*(skinH+gap);
      const sel=i===mainMenuSel;
      const isCur=shipPaint.name===sp.id;
      // Card
      ctx.fillStyle=sel?'rgba(0,40,0,0.8)':'rgba(0,10,0,0.5)';
      roundRect(ctx,sx,sy,skinW,skinH,6);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.6+Math.sin(t*4)*0.2})`;ctx.lineWidth=2;roundRect(ctx,sx,sy,skinW,skinH,6);ctx.stroke();}
      if(isCur){ctx.strokeStyle='rgba(255,215,0,0.6)';ctx.lineWidth=1.5;roundRect(ctx,sx+2,sy+2,skinW-4,skinH-4,4);ctx.stroke();}
      // Draw ship preview using shared body renderer
      const px=sx+skinW/2, py=sy+40;
      const sc2=1.1;
      ctx.save();
      ctx.translate(px,py);
      ctx.scale(sc2,sc2);
      drawShipBody(sp.color, sp.accent, sp.trail, sp.ship||'saucer');
      ctx.restore();
      // Name + cost
      ctx.fillStyle=sel?'#0f0':'rgba(0,200,0,0.5)';ctx.font='8px monospace';ctx.textAlign='center';
      ctx.fillText(sp.name,px,sy+skinH-14);
      if(sp.cost>0){ctx.fillStyle=sel?'#fd0':'rgba(200,200,0,0.4)';ctx.fillText(sp.cost+' pts',px,sy+skinH-5);}
      else{ctx.fillStyle='rgba(0,200,0,0.3)';ctx.fillText('FREE',px,sy+skinH-5);}
      if(isCur){ctx.fillStyle='#fd0';ctx.fillText('\u2605',sx+skinW-10,sy+12);}
    });
    ctx.fillStyle='rgba(0,200,0,0.25)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('A/D to browse  |  ENTER/SPACE to select  |  ESC to back',cw/2,ch-20);
  }
}

function updateMainMenu(){
  if(!mainMenuMode) return false;
  // Input handling with cooldown
  if(!window._mmCool) window._mmCool=0;
  if(window._mmCool>0){window._mmCool--;return true;}

  if(mainMenuMode==='menu'){
    const hasSave=hasSaveGame();
    const items=[];
    if(hasSave) items.push('continue');
    items.push('new','skins','shipskins');

    if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=10;}
    if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=10;}
    mainMenuSel=((mainMenuSel%items.length)+items.length)%items.length;

    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      const action=items[mainMenuSel];
      if(action==='continue'){startGame(true);}
      else if(action==='new'){startGame(false);}
      else if(action==='skins'){mainMenuMode='skins';mainMenuSel=ALIEN_SKINS.findIndex(s=>s.id===selectedSkin)||0;}
      else if(action==='shipskins'){mainMenuMode='shipskins';mainMenuSel=SHIP_PAINTS.findIndex(s=>s.id===shipPaint.name)||0;}
    }
    // Language hotkeys (1-6)
    const langCodes=['en','de','sv','es','pt','fr'];
    for(let i=0;i<6;i++){if(keys[''+(i+1)]){setLang(langCodes[i]);keys[''+(i+1)]=false;}}
  }
  else if(mainMenuMode==='skins'){
    // Race selection
    const cols=3;
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=cols;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=cols;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%ALIEN_RACES.length)+ALIEN_RACES.length)%ALIEN_RACES.length;

    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      // Enter variant selection for this race
      const race=ALIEN_RACES[mainMenuSel];
      window._mmRaceIdx=mainMenuSel;
      mainMenuMode='raceskins';
      // Pre-select current skin if it's in this race, else first variant
      const curIdx=race.skins.findIndex(s=>s.id===selectedSkin);
      mainMenuSel=curIdx>=0?curIdx:0;
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='menu';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='raceskins'){
    if(window._mmRaceIdx===undefined) window._mmRaceIdx=0;
    const raceObj=ALIEN_RACES[window._mmRaceIdx];
    const skins=raceObj.skins;
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=4;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=4;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%skins.length)+skins.length)%skins.length;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      selectedSkin=skins[mainMenuSel].id;
      selectedRace=raceObj.id;
      localStorage.setItem('sadabduction_skin',selectedSkin);
      localStorage.setItem('sadabduction_race',selectedRace);
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='skins';mainMenuSel=window._mmRaceIdx||0;window._mmCool=10;}
  }
  else if(mainMenuMode==='shipskins'){
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=4;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=4;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%SHIP_PAINTS.length)+SHIP_PAINTS.length)%SHIP_PAINTS.length;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      const sp=SHIP_PAINTS[mainMenuSel];
      shipPaint={color:sp.color,accent:sp.accent,trail:sp.trail,name:sp.id,ship:sp.ship||'saucer'};
      localStorage.setItem('sadabduction_shippaint',JSON.stringify(shipPaint));
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='menu';mainMenuSel=0;window._mmCool=10;}
  }
  return true;
}

gameLoop();
