import { TRANSLATIONS } from './translations.js';
import { GRAVITY, BEAM_WIDTH, GROUND_LEVEL, LEAVE_THRESHOLD, LAND_DISTANCE, WATER_DEPTH, WATER_SURFACE, SEABED_Y, EARTH_WORLD_WIDTH } from './config/constants.js';
import { ALIEN_RACES, ALIEN_SKINS } from './config/aliens.js';
import { SHIP_PAINTS, SHIP_TYPES } from './config/ships.js';
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
// Migration: if stored race no longer exists (e.g. removed titan/dinosaur), derive from skin.
if(!ALIEN_RACES.find(r=>r.id===selectedRace)){
  const _sk = ALIEN_SKINS.find(s=>s.id===selectedSkin);
  selectedRace = _sk ? _sk.race : 'grey';
  localStorage.setItem('sadabduction_race', selectedRace);
}

// --- KEY BINDINGS (rebindable in Settings) ---
// Each action has a canonical key (what the game code reads) and a user-bound physical key.
// When the user presses a physical key, we translate it to its canonical action key.
// context: 'ship' (only in spaceship), 'foot' (only when walking on foot), 'both' (works in both)
const KEY_ACTIONS = [
  {id:'moveLeft',    label:'Move Left',          canonical:'a',     context:'both'},
  {id:'moveRight',   label:'Move Right',         canonical:'d',     context:'both'},
  {id:'moveUp',      label:'Move Up / Ship Up',  canonical:'w',     context:'both'},
  {id:'moveDown',    label:'Move Down / Land',   canonical:'s',     context:'both'},
  {id:'jump',        label:'Jump',               canonical:' ',     context:'foot'},
  {id:'fire',        label:'Fire Weapon',        canonical:'q',     context:'foot'},
  {id:'interact',    label:'Interact / Enter',   canonical:'e',     context:'foot'},
  {id:'jetpack',     label:'Jetpack',            canonical:'shift', context:'foot'},
  {id:'grapple',     label:'Grappling Hook',     canonical:'g',     context:'foot'},
  {id:'switchWeap',  label:'Next Weapon',        canonical:'tab',   context:'foot'},
  {id:'toggleMode',  label:'Enter/Exit Ship',    canonical:'enter', context:'both'},
  {id:'hijackVeh',   label:'Hijack/Deploy Vehicle', canonical:'b',     context:'both'},
  {id:'cloak',       label:'Cloak',              canonical:'v',     context:'ship'},
  {id:'lasso',       label:'Lasso',              canonical:'c',     context:'ship'},
  {id:'nuke',        label:'Nuke',               canonical:'n',     context:'ship'},
  {id:'repulsor',    label:'Repulsor',           canonical:'e',     context:'ship'},
  {id:'flashlight',  label:'Flashlight',         canonical:'l',     context:'both'},
  {id:'mute',        label:'Mute Audio',         canonical:'m',     context:'both'},
];
const KEYBIND_VERSION = 4; // bump when defaults change to invalidate stale saved bindings
let keyBindings = (()=>{
  try{
    const saved=JSON.parse(localStorage.getItem('sadabduction_keybinds')||'{}');
    const savedVer=parseInt(localStorage.getItem('sadabduction_keybinds_v')||'0',10);
    const out={};
    if(savedVer!==KEYBIND_VERSION){
      // Version mismatch: discard saved bindings, use new defaults
      KEY_ACTIONS.forEach(a=>out[a.id]=a.canonical);
      localStorage.setItem('sadabduction_keybinds_v', String(KEYBIND_VERSION));
      localStorage.setItem('sadabduction_keybinds', JSON.stringify(out));
    } else {
      KEY_ACTIONS.forEach(a=>{ out[a.id]=saved[a.id]||a.canonical; });
    }
    return out;
  }catch(e){ const out={}; KEY_ACTIONS.forEach(a=>out[a.id]=a.canonical); return out; }
})();
function saveKeyBindings(){
  localStorage.setItem('sadabduction_keybinds',JSON.stringify(keyBindings));
  localStorage.setItem('sadabduction_keybinds_v', String(KEYBIND_VERSION));
}
function keyLabel(k){
  if(k===' ')return 'SPACE';
  if(k==='arrowup')return '\u2191';
  if(k==='arrowdown')return '\u2193';
  if(k==='arrowleft')return '\u2190';
  if(k==='arrowright')return '\u2192';
  return (k||'').toUpperCase();
}
// Build physical→canonical map from bindings (used in keydown/keyup)
function buildPhysicalToCanonical(){
  const m={};
  KEY_ACTIONS.forEach(a=>{
    const phys=keyBindings[a.id]||a.canonical;
    if(phys!==a.canonical){ m[phys]=a.canonical; }
  });
  return m;
}
let _physToCanon = buildPhysicalToCanonical();
function getAlienSkin(){ return ALIEN_SKINS.find(s=>s.id===selectedSkin) || ALIEN_SKINS[0]; }
function getRace(id){ return ALIEN_RACES.find(r=>r.id===id) || ALIEN_RACES[0]; }

// Mix a gray brightness (0-255) with a skin hex color. ratio=0 means pure gray, ratio=1 means pure skin color
function skinTint(gray, hexOrRainbow, ratio){
  if(!hexOrRainbow || hexOrRainbow==='rainbow'){
    const h=(frameNow*0.06)%360;
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
let mainMenuMode = 'menu'; // 'menu', 'skins', 'raceskins', 'shipskins', 'shipVariants', 'debug', 'debugPlanet', 'debugUnits', 'debugPreview', 'sandbox', 'sandboxCaves', 'sandboxCaveWalk', null (in game)
let caveWalkState = null; // {caveIdx, alien:{x,y,vx,vy,facing,walkT,onGround}, worldW}
let mainMenuSel = 0;
let mainMenuStars = [];
let mainMenuAlienPhase = 0;

// --- DEBUG MODE ---
// When active, loads a planet in a passive debug arena. Ship is hidden, no military/missions.
// Hotkeys in arena: F = all units walk right, B = all walk left, S = stop, arrows pan camera, ESC back to menu.
let debugMode = { active:false, planetId:null, panX:0, panY:0 };
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
      gameStats:{...gameStats},
      // Location snapshot — so Continue returns to where you saved
      location:{
        mode: gameMode,                     // 'planet' | 'space'
        planetId: currentPlanet ? currentPlanet.id : null,
        shipX: ship.x, shipY: ship.y,
        prehistoricEra: !!window.prehistoricEra,
      },
      version:2
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
    _pendingSavedLocation = d.location || null;
    document.getElementById('score').textContent=score;
    return true;
  }catch(e){return false;}
}
function hasSaveGame(){ return !!localStorage.getItem('sadabduction_save'); }
let _pendingSavedLocation = null;

// --- PAUSE MENU ---
let pauseMenu = { active:false, sel:0, _cool:0 };

// --- GAME STATE ---
let gameStarted = false;
let camera = { x: 0, y: 0 };
let keys = {};
let score = 0;
let buildingsDestroyed = 0;
let particles = [];
// In-place particle step: advance + compact dead ones without allocating a new array.
function stepParticles(){
  let w=0;
  for(let r=0;r<particles.length;r++){
    const p=particles[r];
    p.x+=p.vx;p.y+=p.vy;p.life--;
    if(p.life>0){if(w!==r)particles[w]=p;w++;}
  }
  if(w<particles.length)particles.length=w;
}
let debris = [];
let humans = [];
let blocks = [];
let buildings = [];
let tears = [];
let speechBubbles = [];
let stars = [];
let deepStars = [];
let clouds = [];
let ufoWrecks = []; // crashed UFO pickups — {x, y, scavenged, sparkT}
let hiddenBunkers = []; // discovered bunker entrances — {x, w, h, revealed}
let missiles = [];
let fires = [];
let ashPiles = []; // burned-down humans — {x, y, life, maxLife}
let acidPuddles = []; // persistent ground acid — {x, y, r, life, maxLife}
let rockets = []; // rocket projectiles — {x, y, vx, vy, life}
let bloodPools = []; // dark stains on the ground — {x, y, r, targetR, life, maxLife, color}
let gibs = []; // flying limb chunks — {x, y, vx, vy, rot, rotV, size, life, kind, color, onGround, groundY}
let skidMarks = []; // tire skid marks — {x, y, w, life, maxLife, alpha}
// On-foot alien weapon projectiles
let stunWaves = []; // neural stunner cones + panic wails — {x,y,r,maxR,life,maxLife,kind:'cone'|'radial',dir,effect}
let plasmaBolts = []; // arcing plasma globs — {x,y,vx,vy,life}
let gravityWells = []; // thrown orbs — {x,y,vx,vy,phase,timer,r,maxR}
let parasites = []; // homing symbiotes — {x,y,vx,vy,life,target,attachT}
let chainsawSlashes = []; // short melee arcs — {x,y,dir,life,maxLife}
let chainsawRev = 0; // visual rev level while firing
// Master pool of weapon primitives — any race picks 5 of these
const WEAPON_POOL = {
  stunner: { label:'Stunner',   cd:30,  color:'#8ef' },
  wail:    { label:'Wail',      cd:260, color:'#f8f' },
  plasma:  { label:'Plasma',    cd:22,  color:'#6f8' },
  gwell:   { label:'G-Well',    cd:540, color:'#a0f' },
  swarm:   { label:'Swarm',     cd:420, color:'#fa0' },
  laser:   { label:'Laser',     cd:10,  color:'#0ff' },
  acid:    { label:'Acid',      cd:140, color:'#cf0' },
  rocket:  { label:'Rocket',    cd:90,  color:'#f40' },
  chainsaw:{ label:'Chainsaw',  cd:6,   color:'#fd4' },
};
// Per-race loadout — each race has 5 unique weapons themed to its biology
const RACE_LOADOUTS = {
  grey:      ['stunner','wail','plasma','gwell','swarm','chainsaw'],
  larva:     ['acid','swarm','plasma','stunner','wail','chainsaw'],
  reptilian: ['plasma','rocket','wail','stunner','gwell','chainsaw'],
  insectoid: ['swarm','stunner','acid','wail','plasma','chainsaw'],
  human:     ['laser','rocket','stunner','wail','gwell','chainsaw'],
  blob:      ['acid','gwell','wail','swarm','plasma','chainsaw'],
  tentacle:  ['wail','gwell','swarm','stunner','acid','chainsaw'],
  mushroom:  ['acid','wail','swarm','stunner','gwell','chainsaw'],
  cyborg:    ['laser','rocket','stunner','plasma','gwell','chainsaw'],
  cosmic:    ['plasma','gwell','wail','laser','swarm','chainsaw'],
  southpark: ['stunner','wail','rocket','acid','swarm','chainsaw'],
};
function getRaceWeapons(){
  const ids = RACE_LOADOUTS[selectedRace] || RACE_LOADOUTS.grey;
  return ids.map(id => Object.assign({id}, WEAPON_POOL[id]));
}
// Back-compat handle — always length-5, reflects current race loadout
let ALIEN_WEAPONS = getRaceWeapons();
function refreshAlienWeapons(){ ALIEN_WEAPONS = getRaceWeapons(); }
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
  if(boss.hp<=0){triggerHitStop(18);triggerShake(18);defeatBoss(false);}
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
    const pulse=0.5+Math.sin(frameNow*0.008)*0.5;
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
    const sa=0.15+Math.sin(frameNow*0.005)*0.1;
    ctx.strokeStyle=`rgba(80,150,255,${sa})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,y-15,55,0,Math.PI*2);ctx.stroke();
  }
  // Drones
  b.drones.forEach(d=>{
    ctx.fillStyle='#666';ctx.fillRect(d.x-8,d.y-4,16,8);
    // Propellers
    ctx.strokeStyle='#aaa';ctx.lineWidth=1;
    const pa=frameNow*0.03;
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
    const pulse=0.5+Math.sin(frameNow*0.01)*0.3;
    ctx.fillStyle=`rgba(255,150,0,${pulse})`;ctx.beginPath();ctx.arc(x,y-65,12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ff0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y-65,15,0,Math.PI*2);ctx.stroke();
  }
}

// --- MOTHERSHIP INTERIOR ---
let mothershipMode = false; // true when inside mothership
// --- PYRAMID INTERIOR (Khet tomb walk-in) ---
let pyramidInteriorMode = false;
let pyramidInterior = {
  exitX: 0,           // alien.x to restore when leaving
  exitY: 0,           // alien.y to restore when leaving (for underwater exits)
  theme: 'tomb',      // 'tomb' | 'cave' | 'bunker' | ... — dictates visuals/puzzle flavor
  worldW: 1800,
  enterCD: 0,         // small cooldown after entering so E doesn't immediately re-trigger exit
  alien: {x:120, y:0, vx:0, vy:0, facing:1, walkT:0, onGround:true},
  // --- PUZZLE: step on 4 glyph plates in the sequence shown above the sarcophagus ---
  puzzle: {
    plates: [],      // [{x, glyph, color, litT}]
    targetSeq: [],   // array of plate indices in correct order
    progress: 0,     // how many correct steps taken
    solved: false,
    rewardGiven: false,
    solveAnim: 0,    // ticks of celebration animation
    hintT: 0,        // flashing hint when wrong
    lastPlateIdx: -1, // to debounce stepping on same plate
    revealT: 0,      // sarcophagus opening animation
  },
};
// Plate glyph palette
const PYR_PLATE_DEFS = [
  {glyph:'\u2600', color:'#ffd26a', name:'sun'},       // sun
  {glyph:'\u25B2', color:'#c8a058', name:'pyramid'},   // pyramid
  {glyph:'\u2625', color:'#e8bb78', name:'ankh'},      // ankh
  {glyph:'\u25C8', color:'#a8c8d8', name:'eye'},       // diamond/eye
];
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
// Camera zoom: eases to 1.25x on foot for a more intimate view, 1.0x in ship.
let worldZoom = 1;
const alien = {
  x:0, y:GROUND_LEVEL-30, vx:0, vy:0,
  facing:1, // 1=right, -1=left
  onGround:false, grounded:false,
  walkTimer:0, jetpackFuel:100,
  shootCooldown:0, health:100,
  w:12, h:30,
  weapon:0, // index into ALIEN_WEAPONS
  weaponCD:[0,0,0,0,0],
  // --- EXPLORATION STATE ---
  diveSuit:false,       // auto-equipped first time alien swims underwater
  diveSuitShownT:0,     // briefly highlights the suit when first equipped
  underwater:false,     // true this frame when submerged
  oxygen:100,           // 0-100, depletes underwater if no suit
  bubbleT:0,
  // --- GRAPPLING HOOK (press G) ---
  grapple:null,         // null | {phase:'flying'|'attached', x,y,vx,vy, anchorX,anchorY, life}
  _gPrev:false,
  // --- VEHICLE HIJACK ---
  drivingVehicle:null,  // reference to a vehicle when driving; null on foot
  _ctrlPrev:false,
};

function triggerShake(intensity){ screenShake.intensity=Math.max(screenShake.intensity,intensity); }
// Hit-stop: skip `frames` game-update frames for impactful moments. Draw still runs, so the world "freezes".
let hitStopFrames = 0;
function triggerHitStop(frames){ hitStopFrames = Math.max(hitStopFrames, frames|0); }

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
let _simPX = 0; // sim-center x, updated each frame in update()
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
// Left (cold) → Right (hot). Ice borders mountains (medium-cold).
const earthBiomes = [
  {id:'snow',      from:0,     to:5500,  groundColor:['#e8eef5','#c8d0e0','#9aa8c0'], grassColor:'#f0f4fa', grassHeight:0, treeDensity:0.25, treeCanopyColor:'#2a4a3a', isMountain:true, isSnow:true},
  {id:'mountains', from:5500,  to:10000, groundColor:['#5a5a5a','#4a4a4a','#3a3a3a'], grassColor:'#5a6a5a', grassHeight:2, treeDensity:0.1, treeCanopyColor:'#3a5a2a', isMountain:true},
  {id:'farmland',  from:10500, to:15500, groundColor:['#4a6a2a','#3a5a1a','#2a4a0a'], grassColor:'#5a8a2a', grassHeight:10, treeDensity:0.15, treeCanopyColor:'#3a7a1a', isFarm:true},
  {id:'suburbs',   from:16000, to:19500, groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a5a3a', grassHeight:6, treeDensity:0.35, treeCanopyColor:'#2a7a1a'},
  {id:'city',      from:20000, to:23500, groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a5a3a', grassHeight:4, treeDensity:0.08, treeCanopyColor:'#2a6a1a'},
  {id:'landmarks', from:24000, to:28000, groundColor:['#2a3a2a','#1a2a1a','#0a1a0a'], grassColor:'#3a6a3a', grassHeight:6, treeDensity:0.15, treeCanopyColor:'#2a6a1a'},
  {id:'jungle',    from:28500, to:34000, groundColor:['#1a3a1a','#0a2a0a','#052005'], grassColor:'#1a5a1a', grassHeight:14, treeDensity:0.8, treeCanopyColor:'#0a5a0a'},
  {id:'desert',    from:34500, to:41500, groundColor:['#c0a060','#a08040','#806020'], grassColor:'#c0a060', grassHeight:0, treeDensity:0.02, treeCanopyColor:'#5a7a2a'},
  {id:'beach',     from:42000, to:43000, groundColor:['#d0c090','#c0b080','#b0a070'], grassColor:'#c0b080', grassHeight:0, treeDensity:0.05, treeCanopyColor:'#4a8a2a'},
  {id:'ocean',     from:43000, to:52000, groundColor:['#0a3a6a','#082a4a','#041a2a'], grassColor:'#0a3a6a', grassHeight:0, treeDensity:0, treeCanopyColor:'#0a3a6a', isOcean:true},
];
// Transition zones between biomes (wide smooth ground color blend — overlap biome boundaries)
const earthTransitions = [
  {from:4000,  to:6500,  biomeA:'snow',      biomeB:'mountains'},
  {from:8500,  to:11500, biomeA:'mountains', biomeB:'farmland'},
  {from:14500, to:17000, biomeA:'farmland',  biomeB:'suburbs'},
  {from:18500, to:21000, biomeA:'suburbs',   biomeB:'city'},
  {from:22500, to:25000, biomeA:'city',      biomeB:'landmarks'},
  {from:27000, to:30000, biomeA:'landmarks', biomeB:'jungle'},
  {from:33000, to:36000, biomeA:'jungle',    biomeB:'desert'},
  {from:40000, to:42500, biomeA:'desert',    biomeB:'beach'},
  {from:42700, to:43300, biomeA:'beach',     biomeB:'ocean'},
];
function getEarthBiome(x){
  const ww=EARTH_WORLD_WIDTH;
  const wx=((x%ww)+ww)%ww;
  // Check transitions first (smoothstep easing for natural blend)
  for(const tr of earthTransitions){
    if(wx>=tr.from&&wx<tr.to){
      let t2=(wx-tr.from)/(tr.to-tr.from);
      t2=t2*t2*(3-2*t2); // smoothstep
      const a=earthBiomes.find(b=>b.id===tr.biomeA)||earthBiomes[0];
      const b=earthBiomes.find(b2=>b2.id===tr.biomeB)||earthBiomes[0];
      return {id:'transition',fromId:tr.biomeA,toId:tr.biomeB,blend:t2,
        groundColor:a.groundColor.map((c,i)=>lerpColor(c,b.groundColor[i],t2)),
        grassColor:lerpColor(a.grassColor,b.grassColor,t2),
        grassHeight:a.grassHeight*(1-t2)+b.grassHeight*t2,
        treeDensity:a.treeDensity*(1-t2)+b.treeDensity*t2,
        treeCanopyColor:lerpColor(a.treeCanopyColor,b.treeCanopyColor,t2),
        isMountain:(a.isMountain&&t2<0.5)||(b.isMountain&&t2>=0.5)||false,
        isSnow:(a.isSnow&&t2<0.5)||(b.isSnow&&t2>=0.5)||false,
        isOcean:(a.isOcean&&t2<0.5)||(b.isOcean&&t2>=0.5)||false,
        isFarm:(a.isFarm&&t2<0.5)||(b.isFarm&&t2>=0.5)||false};
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
    id: 'mars', name: 'Mars', desc: '"The Red Planet. 4th from the Sun. Dust storms forever."',
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
    id: 'glimora', name: 'Jupiter', desc: '"The gas giant. 5th from the Sun. A storm larger than Earth rages for centuries."',
    radius: 260, color: '#d4a070', color2: '#a06030', atmosphere: '#ffb060',
    skyTop: '#2a1810', skyMid: '#5a3818', skyBot: '#8a5828',
    groundColor: ['#c8a070','#a88050','#806030'], grassColor: '#d4b080',
    buildingColors: [['#d4a070','#c08040','#a06030'],['#d4b080','#b08040','#805030']],
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
    id: 'ice', name: 'Uranus', desc: '"The ice giant. 7th from the Sun. Tilted on its side, rolling through eternity."',
    radius: 160, color: '#8ed4e0', color2: '#5098b0', atmosphere: '#c0e8f0',
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
    id: 'lava', name: 'Mercury', desc: '"Closest to the Sun. A rocky furnace with no atmosphere."',
    radius: 110, color: '#a07050', color2: '#604030', atmosphere: '#ff6020',
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
    id: 'sand', name: 'Venus', desc: '"Our sister planet. 2nd from the Sun. Thick clouds of acid hide a scorched surface."',
    radius: 170, color: '#e8c078', color2: '#b08830', atmosphere: '#f0d090',
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
    id: 'tomb', name: 'Saturn', desc: '"The ringed gas giant. No solid ground — only endless ammonia cloud decks where strange drifters breathe helium winds."',
    radius: 240, color: '#e8c878', color2: '#a07840', atmosphere: '#f0d098',
    hasRings: true, isGasGiant: true,
    // Golden banded atmosphere — Saturn's real palette
    skyTop: '#b48840', skyMid: '#d4a868', skyBot: '#ecd098',
    // "Ground" is a dense cloud deck (hydrogen/ammonia crystal haze)
    groundColor: ['#f0dcb0','#c8a870','#8a6830'], grassColor: '#e8d0a0',
    buildingColors: [['#d4a868','#b08838','#806020']],
    inhabitantCount: 18, buildingDensity: 0, hasClouds: true, isAlien: true,
    alienSkin: ['#e8d0a0','#d4b878','#c0a060','#a88848'],
    alienHeadShape: 'tall',
    alienExtra: 'antennae',
    alienLabel: 'Cloud Drifter',
    sadFacts: ['"They have never touched solid ground — none exists here..."','"Born in the clouds, they live and die aloft..."','"The wind is their only home..."','"Below, the pressure crushes even light..."','"They taste the storms by color alone..."'],
    cryPhrases: ['THE WIND TAKES ALL','NO GROUND','FALLING FOREVER','THE RINGS SING','STORM-SONG','HELIUM DREAMS','DRIFT AWAY','DEEPER PRESSURES'],
    alienTypes: [
      { type:'gasWhale',    label:'Gas Whale',       scale:2.2, bodyWidth:18, headR:10, mass:0.4, colors:['#d4b878','#a88848','#e8d0a0'], float:true },
      { type:'skyJelly',    label:'Sky Jelly',       scale:1.0, bodyWidth:6,  headR:11, mass:0.15, colors:['#f0e0b8','#d4b878','#ffeed0'], float:true },
      { type:'stormWisp',   label:'Storm Wisp',      scale:0.6, bodyWidth:3,  headR:5,  mass:0.08, colors:['#fff8d8','#e8c878','#ffeea0'], float:true },
      { type:'cloudRider',  label:'Cloud Rider',     scale:1.1, bodyWidth:5,  headR:9,  mass:0.9, colors:['#c8a870','#a08848','#d8b88a'] },
      { type:'auroraSprite',label:'Aurora Sprite',   scale:0.8, bodyWidth:3,  headR:7,  mass:0.1, colors:['#a0c8ff','#ffc0e8','#c0f0ff'], float:true },
    ],
  },
  {
    id: 'asteroid', name: 'Neptune', desc: '"The deep-blue ice giant. 8th from the Sun. Winds at 2,000 km/h."',
    radius: 150, color: '#3050c0', color2: '#102080', atmosphere: '#4080ff',
    skyTop: '#000818', skyMid: '#102040', skyBot: '#203060',
    groundColor: ['#2040a0','#1028'+'60','#08143a'], grassColor: '#3060c0',
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
    id: 'sun', name: 'Sun', desc: '"Our star. The heart of the solar system. 109 Earths across."',
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
  {
    id: 'moon', name: 'Moon', desc: '"Earth\'s only natural satellite. Airless, silent, pockmarked."',
    radius: 60, color: '#d0d0d0', color2: '#8a8a8a', atmosphere: '#e0e0e0',
    skyTop: '#000000', skyMid: '#050510', skyBot: '#0a0a14',
    groundColor: ['#9a9a9a','#6a6a6a','#4a4a4a'], grassColor: '#7a7a7a',
    buildingColors: [['#888','#777','#666']],
    inhabitantCount: 0, buildingDensity: 0, hasClouds: false, isAlien: false, isMoon: true,
    orbitsEarth: true,
    sadFacts: ['"Silent. Forever silent."','"No one hears anything here..."','"Only dust and footprints remain..."'],
    cryPhrases: [],
    alienTypes: [],
  },
  {
    id: 'wormhole', name: 'Wormhole', desc: '"A tear in spacetime. Where does it lead? WHEN does it lead?"',
    radius: 180, color: '#6040c0', color2: '#100030', atmosphere: '#c060ff',
    skyTop: '#000000', skyMid: '#10002a', skyBot: '#2a0060',
    groundColor: ['#1a0040','#100028','#000018'], grassColor: '#2a0080',
    buildingColors: [['#6040c0','#4020a0','#301080']],
    inhabitantCount: 0, buildingDensity: 0, hasClouds: false, isAlien: true, isWormhole: true,
    alienLabel: 'Anomaly',
    sadFacts: ['"Time flows wrong here..."','"Spacetime frays at the edges..."','"Past and future collapse..."'],
    cryPhrases: ["WHEN AM I","TIME BLEEDS","THE LOOP","ECHO OF ECHO"],
    alienTypes: [],
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
// --- RARE COSTUME HUMANS (Earth only, ~4% spawn chance in city/suburb biomes) ---
const costumeHumanTypes = [
  { type:'president', label:'The President',  scale:1,    bodyWidth:6, headR:8, mass:1.1, colors:['#141824'], hat:'president',  extra:'briefcase', costume:'president' },
  { type:'ghost',     label:'Ghost Wizard',   scale:1,    bodyWidth:5, headR:8, mass:0.9, colors:['#f0f0f0'], hat:'ghosthat',   extra:null,        costume:'ghost'     },
  { type:'clown',     label:'Giggles',        scale:1.05, bodyWidth:6, headR:9, mass:1.1, colors:['#e33'],    hat:'clownhair',  extra:null,        costume:'clown'     },
  { type:'astronaut', label:'NASA Astronaut', scale:1,    bodyWidth:5, headR:8, mass:1.1, colors:['#e8ecf0'], hat:null,         extra:null,        costume:'astronaut' },
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

// --- PREHISTORIC (Cretaceous) DINOSAUR TYPES ---
// Used when window.prehistoricEra is true and planet is Earth.
// Flags: isDino (marks render path), dinoKind (silhouette variant), biped (true=2 legs + small arms + tail, false=quadruped)
const prehistoricHumanTypes = [
  // Warm/temperate dinos — excluded from snow by generateInhabitant's filter.
  { type:'dino', label:'T-Rex',       scale:2.6, bodyWidth:15, headR:14, mass:6,   colors:['#5a4a20','#6a5520','#4a3818'],   hat:null, extra:null, isDino:true, dinoKind:'trex',   biped:true  },
  { type:'dino', label:'Raptor',      scale:1.3, bodyWidth:6,  headR:8,  mass:1.4, colors:['#8a6820','#a08040','#704818'],   hat:null, extra:null, isDino:true, dinoKind:'raptor', biped:true  },
  { type:'dino', label:'Stegosaurus', scale:2.2, bodyWidth:18, headR:9,  mass:4.5, colors:['#3a6a4a','#2a4a3a','#4a7a5a'],   hat:null, extra:null, isDino:true, dinoKind:'stego',  biped:false },
  { type:'dino', label:'Triceratops', scale:2.1, bodyWidth:16, headR:13, mass:4.8, colors:['#6a4a30','#7a5a40','#4a3820'],   hat:null, extra:null, isDino:true, dinoKind:'tricera',biped:false },
  { type:'dino', label:'Brontosaurus',scale:3.0, bodyWidth:20, headR:9,  mass:8,   colors:['#4a6a5a','#5a7a6a','#3a5a4a'],   hat:null, extra:null, isDino:true, dinoKind:'bronto', biped:false },
  { type:'dino', label:'Pterodactyl', scale:1.4, bodyWidth:5,  headR:9,  mass:0.9, colors:['#5a4020','#6a4830','#4a3018'],   hat:null, extra:null, isDino:true, dinoKind:'ptero',  biped:true  },
  // Polar dinos — only spawn in snow biome. Reuse silhouettes with cold palettes.
  { type:'dino', label:'Cryolophosaurus', scale:1.5, bodyWidth:7,  headR:9,  mass:1.8, colors:['#d8e0ec','#b0bcd0','#8090a8'], hat:null, extra:null, isDino:true, dinoKind:'raptor',  biped:true,  biomes:['snow'] },
  { type:'dino', label:'Pachyrhinosaurus', scale:2.0, bodyWidth:15, headR:13, mass:4.0, colors:['#c0c8d8','#a0a8c0','#7080a0'], hat:null, extra:null, isDino:true, dinoKind:'tricera', biped:false, biomes:['snow'] },
  { type:'dino', label:'Nanuqsaurus',     scale:2.0, bodyWidth:12, headR:12, mass:3.5, colors:['#c8d0e0','#a0acc0','#6a7890'], hat:null, extra:null, isDino:true, dinoKind:'trex',    biped:true,  biomes:['snow'] },
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
const ship = { x:400, y:GROUND_LEVEL-200, vx:0, vy:0, tilt:0, boosting:false, beamActive:false, lightPhase:0, lasso:null };

// --- INIT ---
const mothershipPos={x:3500,y:-600};
function initSpacePlanets() {
  planets = [];
  // Positions match planetDefs array order.
  // planetDefs: [earth, mars, glimora(=Jupiter), ice(=Uranus), lava(=Mercury), sand(=Venus), tomb(=Saturn), asteroid(=Neptune), sun, moon, wormhole]
  // Laid out in real solar-system order along a diagonal. Sun in -x direction (inner),
  // Wormhole in +x direction past Neptune (outer, farthest). Moon orbits Earth.
  const positions = [
    {x:1500,  y:-1500},   // [0] Earth — anchor
    {x:4000,  y:-2500},   // [1] Mars — outward from Earth
    {x:6500,  y:-3500},   // [2] Jupiter (id:glimora)
    {x:11500, y:-5500},   // [3] Uranus (id:ice)
    {x:-3000, y:-500},    // [4] Mercury (id:lava) — inner
    {x:-500,  y:-1000},   // [5] Venus (id:sand) — inner, between Mercury and Earth
    {x:9000,  y:-4500},   // [6] Saturn (id:tomb)
    {x:14000, y:-6500},   // [7] Neptune (id:asteroid) — outermost real planet
    {x:-6500, y:0},       // [8] Sun — farthest inner
    {x:1590,  y:-1500},   // [9] Moon — child of Earth; position overridden by orbit tick
    {x:17500, y:-7800},   // [10] Wormhole — FURTHEST outer; leads to prehistoric Earth
  ];
  planetDefs.forEach((def,i) => {
    planets.push({ ...def, spaceX:positions[i].x, spaceY:positions[i].y, visited:false, savedState:null });
  });
  // --- Orbits ---
  // Each planet orbits the Sun with a period proportional to its real orbital period.
  // Current (spaceX, spaceY) is taken as the starting point → gives orbitRadius + orbitAngle.
  // Sun and Wormhole don't orbit. Orbits keep the existing solar-order layout intact on t=0.
  const sunPlanet = planets.find(p=>p.isSun);
  const sunX = sunPlanet ? sunPlanet.spaceX : 0;
  const sunY = sunPlanet ? sunPlanet.spaceY : 0;
  // Real orbital periods in Earth years (keys are planet ids — lava=Mercury, sand=Venus, glimora=Jupiter, tomb=Saturn, ice=Uranus, asteroid=Neptune)
  const orbitalYears = { lava:0.241, sand:0.615, earth:1, mars:1.881, glimora:11.86, tomb:29.46, ice:84.01, asteroid:164.8 };
  // One Earth year = 30 real minutes (60fps * 1800s). Far planets barely drift; feels
  // astronomical rather than arcade. Inner planets (Mercury, Venus) are still visibly moving.
  const EARTH_PERIOD_FRAMES = 60 * 1800;
  planets.forEach(p=>{
    if(p.isSun || p.isWormhole){ p.orbits=false; return; }
    if(p.orbitsEarth){
      // Moon orbits Earth, not the Sun. Distance is tiny (scaled for visibility).
      p.orbits = true;
      p.orbitRadius = 420; // Earth radius 180 + clearance so the moon reads as a distinct body
      p.orbitAngle = 0;
      // ~27.3 Earth days in real life.
      p.orbitSpeed = (Math.PI * 2) / (EARTH_PERIOD_FRAMES * (27.3/365));
      return;
    }
    const dx = p.spaceX - sunX, dy = p.spaceY - sunY;
    p.orbits = true;
    p.orbitRadius = Math.hypot(dx, dy);
    p.orbitAngle = Math.atan2(dy, dx);
    p.initOrbitAngle = p.orbitAngle;
    p.initSpaceX = p.spaceX;
    p.initSpaceY = p.spaceY;
    const years = orbitalYears[p.id] || 1;
    p.orbitSpeed = (Math.PI * 2) / (EARTH_PERIOD_FRAMES * years);
  });
  // Store moon's initial angle too
  planets.forEach(p=>{ if(p.orbitsEarth){ p.initOrbitAngle = p.orbitAngle; } });
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
      // Rare pyramids — open (enterable puzzle) or closed (decorative)
      if(r<0.04){const l=4+Math.floor(Math.random()*3);const ph=l*22+30,pw=l*40;addUnit(x,GROUND_LEVEL-ph,pw,ph,'openPyramid',{layers:l,health:600});}
      else if(r<0.08){const l=4+Math.floor(Math.random()*3);const ph=l*22+30,pw=l*40;addUnit(x,GROUND_LEVEL-ph,pw,ph,'closedPyramid',{layers:l,health:600});}
      else if(r<0.3) addUnit(x, GROUND_LEVEL-148, 120, 148, 'mosque', {color:'#e8dcc8', roofColor:'#d4c8a0'});
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
  }else if(p.id==='tomb'){
    // Saturn gas giant — no solid buildings. buildingDensity:0 means this should never fire.
  }else{
    // Asteroid and fallback
    addUnit(x, GROUND_LEVEL-40-Math.random()*40, 40+Math.random()*40, 40+Math.random()*40, 'alienStructure', {});
  }
}

// Helper: push a decorative entity (tree/volcano) directly into blocks/buildings arrays.
function _addDecor(bx, by, w, h, type, opts={}) {
  const building = {x:bx, w, blocks:[], destroyed:false, totalBlocks:1, brokenBlocks:0};
  const block = {x:bx, y:by, w, h, vx:0, vy:0,
    color: opts.color||'#4a3a1a', accentColor: opts.accent||'#2a1a0a',
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

// Prehistoric flora — biome-appropriate Mesozoic-era trees spread across old Earth.
function generatePrehistoricFlora() {
  let x = 200;
  while (x < worldWidth - 200) {
    const biome = getEarthBiome(x);
    if (biome.isOcean || isOverOcean(x)) { x += 200; continue; }
    let placed = false;
    const r = Math.random();
    switch (biome.id) {
      case 'snow': {
        // Snow-capped conifers (hardy conifers lived at polar dino regions)
        if (r < 0.55) {
          const th = 90 + Math.random()*60;
          _addDecor(x, GROUND_LEVEL-th, 40, th, 'tree',
            {isTree:true, health:200, treeColor:'#3a2a14', canopyColor:'#1a3a28', conifer:true, snowCap:true});
          placed = true;
        }
        break;
      }
      case 'mountains': {
        if (r < 0.45) {
          const th = 80 + Math.random()*50;
          _addDecor(x, GROUND_LEVEL-th, 40, th, 'tree',
            {isTree:true, health:180, treeColor:'#3a2a10', canopyColor:'#224a24', conifer:true});
          placed = true;
        } else if (r < 0.6) {
          const th = 70 + Math.random()*40;
          _addDecor(x, GROUND_LEVEL-th, 45, th, 'tree',
            {isTree:true, health:170, treeColor:'#5a4a20', canopyColor:'#a4c040', ginkgo:true});
          placed = true;
        }
        break;
      }
      case 'farmland':
      case 'suburbs': {
        if (r < 0.5) {
          const th = 70 + Math.random()*50;
          _addDecor(x, GROUND_LEVEL-th, 40, th, 'tree',
            {isTree:true, health:170, treeColor:'#3a2a10', canopyColor:'#2a5a2a', conifer:true});
          placed = true;
        } else if (r < 0.7) {
          const th = 80 + Math.random()*40;
          _addDecor(x, GROUND_LEVEL-th, 50, th, 'tree',
            {isTree:true, health:180, treeColor:'#5a4020', canopyColor:'#b0c840', ginkgo:true});
          placed = true;
        }
        break;
      }
      case 'jungle': {
        if (r < 0.55) {
          const th = 90 + Math.random()*70;
          _addDecor(x, GROUND_LEVEL-th, 70, th, 'tree',
            {isTree:true, health:160, treeColor:'#2a1a0a', canopyColor:'#2a6028', treeFern:true});
          placed = true;
        } else if (r < 0.8) {
          const th = 55 + Math.random()*30;
          _addDecor(x, GROUND_LEVEL-th, 50, th, 'tree',
            {isTree:true, health:150, treeColor:'#3a2814', canopyColor:'#4a7828', cycad:true});
          placed = true;
        }
        break;
      }
      case 'desert': {
        if (r < 0.18) {
          const th = 50 + Math.random()*25;
          _addDecor(x, GROUND_LEVEL-th, 45, th, 'tree',
            {isTree:true, health:150, treeColor:'#4a3818', canopyColor:'#5c7828', cycad:true});
          placed = true;
        }
        break;
      }
      case 'beach': {
        if (r < 0.3) {
          const th = 70 + Math.random()*35;
          _addDecor(x, GROUND_LEVEL-th, 40, th, 'tree',
            {isTree:true, health:170, treeColor:'#3a2a10', canopyColor:'#2a5a2a', conifer:true});
          placed = true;
        }
        break;
      }
      case 'city':
      case 'landmarks': {
        if (r < 0.25) {
          const th = 55 + Math.random()*30;
          _addDecor(x, GROUND_LEVEL-th, 48, th, 'tree',
            {isTree:true, health:150, treeColor:'#3a2814', canopyColor:'#4a7828', cycad:true});
          placed = true;
        } else if (r < 0.45) {
          const th = 70 + Math.random()*40;
          _addDecor(x, GROUND_LEVEL-th, 45, th, 'tree',
            {isTree:true, health:170, treeColor:'#5a4020', canopyColor:'#a8c040', ginkgo:true});
          placed = true;
        }
        break;
      }
      default: {
        if (r < 0.3) {
          const th = 80 + Math.random()*40;
          _addDecor(x, GROUND_LEVEL-th, 45, th, 'tree',
            {isTree:true, health:180, treeColor:'#3a2a10', canopyColor:'#2a5a2a', conifer:true});
          placed = true;
        }
      }
    }
    // Spacing: denser in forests, sparser in open biomes
    const spacing = (biome.id==='jungle') ? 90 : (biome.id==='desert') ? 260 : (biome.id==='snow') ? 140 : (biome.id==='mountains') ? 150 : 120;
    x += spacing + Math.random()*60;
    if (!placed) x += 20;
  }
}

// Prehistoric volcanoes — a few scattered across old Earth.
function generatePrehistoricVolcanoes() {
  // Pick ~3 spots in varied biomes, avoiding ocean.
  const positions = [
    {frac: 0.12, snowCap: true},  // polar/snow area
    {frac: 0.48, snowCap: false}, // mid, likely desert/mountains
    {frac: 0.78, snowCap: false}, // later in world
  ];
  for (const p of positions) {
    let vx = Math.floor(worldWidth * p.frac);
    // nudge off ocean
    let tries = 0;
    while (tries < 20 && (isOverOcean(vx) || (getEarthBiome(vx).isOcean))) {
      vx += 400; tries++;
      if (vx > worldWidth - 300) vx = 400;
    }
    const h = 180 + Math.random()*120;
    const w = 220 + Math.random()*100;
    _addDecor(vx, GROUND_LEVEL-h, w, h, 'volcano',
      {health:1200, color:'#3a2618', accent:'#1a1008', snowCap: p.snowCap});
  }
}

// --- DRAW BUILDING UNIT ---
function drawBuildingUnit(b) {
  const sx=b.x, sy=b.y, w=b.w, h=b.h;
  const t=frameT;
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
    // Glass facade (gradient cached on fixed buildings)
    let sg=b._facadeGrad;
    if(!sg||!b.fixed){sg=ctx.createLinearGradient(sx,sy,sx+w,sy);sg.addColorStop(0,b.color);sg.addColorStop(0.5,b.accentColor||'#667');sg.addColorStop(1,b.color);if(b.fixed)b._facadeGrad=sg;}
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
    // --- Conifer (tall layered spire — araucaria / sequoia silhouette) ---
    if(b.conifer){
      // Thin straight trunk
      ctx.fillStyle=trkC; ctx.fillRect(sx+w/2-3,sy+h*0.2,6,h*0.8);
      // Stacked triangle layers
      const layers=5;
      for(let i=0;i<layers;i++){
        const ly=sy+h*0.08+i*(h*0.18);
        const lw=w*(0.5+i*0.1);
        ctx.fillStyle=i%2===0?canC:'rgba(0,0,0,0.12)';
        if(i%2===1) ctx.fillStyle=canC;
        ctx.beginPath();
        ctx.moveTo(sx+w/2,ly);
        ctx.lineTo(sx+w/2-lw/2,ly+h*0.22);
        ctx.lineTo(sx+w/2+lw/2,ly+h*0.22);
        ctx.closePath(); ctx.fill();
        if(b.snowCap){
          ctx.fillStyle='rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.moveTo(sx+w/2,ly+2);
          ctx.lineTo(sx+w/2-lw*0.42,ly+h*0.2);
          ctx.lineTo(sx+w/2+lw*0.42,ly+h*0.2);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    // --- Ginkgo (fan-shape canopy, autumn-tinted) ---
    if(b.ginkgo){
      ctx.fillStyle=trkC; ctx.fillRect(sx+w/2-4,sy+h-trunkH,8,trunkH);
      ctx.fillStyle=canC;
      // Fan-shaped canopy made of 3 overlapping ellipses
      ctx.beginPath(); ctx.ellipse(sx+w/2,sy+h*0.25,w*0.55,h*0.3,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx+w*0.3,sy+h*0.35,w*0.3,h*0.18,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx+w*0.7,sy+h*0.35,w*0.3,h*0.18,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(220,220,120,0.35)';
      ctx.beginPath(); ctx.ellipse(sx+w*0.45,sy+h*0.2,w*0.2,h*0.12,0,0,Math.PI*2); ctx.fill();
      break;
    }
    // --- Tree fern (thin trunk with arching fronds radiating out) ---
    if(b.treeFern){
      ctx.fillStyle=trkC; ctx.fillRect(sx+w/2-3,sy+h*0.15,6,h*0.85);
      // Bark rings
      ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=1;
      for(let i=0;i<5;i++){const ry=sy+h*0.25+i*h*0.15;
        ctx.beginPath(); ctx.moveTo(sx+w/2-3,ry); ctx.lineTo(sx+w/2+3,ry); ctx.stroke();}
      // Fronds
      ctx.strokeStyle=canC; ctx.lineWidth=3; ctx.lineCap='round';
      for(let i=0;i<7;i++){const a=-Math.PI*0.5 + (i-3)*0.55;
        const fx=sx+w/2+Math.cos(a)*w*0.55;
        const fy=sy+h*0.15+Math.sin(a)*h*0.2;
        ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.2);
        ctx.quadraticCurveTo(sx+w/2+Math.cos(a)*w*0.3,sy+h*0.15+Math.sin(a)*h*0.12+Math.sin(t+i)*2, fx,fy); ctx.stroke();
        ctx.fillStyle=canC; ctx.beginPath(); ctx.arc(fx,fy,3,0,Math.PI*2); ctx.fill();}
      break;
    }
    // --- Cycad (short stout trunk with palm-like crown of stiff fronds) ---
    if(b.cycad){
      const cTrunkW=w*0.35;
      ctx.fillStyle=trkC;
      ctx.fillRect(sx+w/2-cTrunkW/2,sy+h*0.4,cTrunkW,h*0.6);
      // Textured scales
      ctx.fillStyle='rgba(0,0,0,0.25)';
      for(let i=0;i<4;i++){ctx.fillRect(sx+w/2-cTrunkW/2,sy+h*0.45+i*h*0.14,cTrunkW,2);}
      // Stiff fronds crown
      ctx.strokeStyle=canC; ctx.lineWidth=3; ctx.lineCap='round';
      for(let i=0;i<9;i++){const a=-Math.PI*0.5 + (i-4)*0.38;
        ctx.beginPath(); ctx.moveTo(sx+w/2,sy+h*0.4);
        ctx.lineTo(sx+w/2+Math.cos(a)*w*0.55, sy+h*0.4+Math.sin(a)*h*0.35); ctx.stroke();}
      ctx.fillStyle=canC;
      ctx.beginPath(); ctx.arc(sx+w/2,sy+h*0.4,6,0,Math.PI*2); ctx.fill();
      break;
    }
    // Trunk (gradient cached on fixed trees)
    let tg=b._trunkGrad;
    if(!tg||!b.fixed){tg=ctx.createLinearGradient(sx+w/2-trunkW/2,sy+h-trunkH,sx+w/2+trunkW/2,sy+h);tg.addColorStop(0,trkC);tg.addColorStop(0.5,'#7a5a3a');tg.addColorStop(1,trkC);if(b.fixed)b._trunkGrad=tg;}
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
  case 'volcano': {
    // Prehistoric Earth volcano: dark cone + crater glow + rising smoke + lava drips.
    const cx=sx+w/2;
    // Snow cap check
    const isSnowy = !!b.snowCap;
    // Silhouette slope (filled polygon)
    const grad=ctx.createLinearGradient(cx,sy,cx,sy+h);
    grad.addColorStop(0,'#4a2a20');
    grad.addColorStop(0.5,'#3a1e16');
    grad.addColorStop(1,'#1a100c');
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(sx,sy+h);
    ctx.lineTo(sx+w*0.3,sy+h*0.12);
    ctx.lineTo(sx+w*0.7,sy+h*0.12);
    ctx.lineTo(sx+w,sy+h);
    ctx.closePath(); ctx.fill();
    // Rugged shading
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(sx+w*0.25,sy+h*0.5); ctx.lineTo(sx+w*0.35,sy+h*0.7); ctx.lineTo(sx+w*0.3,sy+h*0.9); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx+w*0.75,sy+h*0.4); ctx.lineTo(sx+w*0.7,sy+h*0.6); ctx.lineTo(sx+w*0.72,sy+h*0.85); ctx.stroke();
    // Snow cap on flanks (optional)
    if(isSnowy){
      ctx.fillStyle='rgba(240,245,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(sx+w*0.3,sy+h*0.12);
      ctx.lineTo(sx+w*0.18,sy+h*0.4);
      ctx.lineTo(sx+w*0.28,sy+h*0.45);
      ctx.lineTo(sx+w*0.4,sy+h*0.35);
      ctx.lineTo(sx+w*0.5,sy+h*0.45);
      ctx.lineTo(sx+w*0.6,sy+h*0.38);
      ctx.lineTo(sx+w*0.72,sy+h*0.45);
      ctx.lineTo(sx+w*0.82,sy+h*0.4);
      ctx.lineTo(sx+w*0.7,sy+h*0.12);
      ctx.closePath(); ctx.fill();
    }
    // Crater rim
    const crW=w*0.4, crH=h*0.06, crY=sy+h*0.12;
    ctx.fillStyle='#2a1410';
    ctx.beginPath(); ctx.ellipse(cx,crY,crW/2,crH,0,0,Math.PI*2); ctx.fill();
    // Lava glow in crater (animated)
    const glowP=0.7+Math.sin(t*2+sx*0.01)*0.25;
    const lg=ctx.createRadialGradient(cx,crY,0,cx,crY,crW*0.55);
    lg.addColorStop(0,`rgba(255,220,80,${glowP})`);
    lg.addColorStop(0.4,`rgba(255,120,20,${glowP*0.7})`);
    lg.addColorStop(1,'rgba(120,30,0,0)');
    ctx.fillStyle=lg;
    ctx.beginPath(); ctx.ellipse(cx,crY,crW*0.6,crH*3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,180,40,${glowP})`;
    ctx.beginPath(); ctx.ellipse(cx,crY-1,crW*0.35,crH*0.8,0,0,Math.PI*2); ctx.fill();
    // Lava dribble down one side (animated length)
    const dribPh=Math.sin(t*0.7+sx*0.02);
    const dribLen=h*(0.15+0.25*Math.max(0,dribPh));
    ctx.strokeStyle='rgba(255,120,30,0.85)'; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(cx-crW*0.3,crY+crH);
    ctx.quadraticCurveTo(cx-crW*0.4,crY+crH+dribLen*0.5, cx-crW*0.22, crY+crH+dribLen);
    ctx.stroke();
    ctx.strokeStyle='rgba(255,220,80,0.6)'; ctx.lineWidth=1.2;
    ctx.stroke();
    // Smoke: few layered puffs above crater (don't push to particles — draw directly)
    for(let i=0;i<4;i++){
      const ph=t*0.6 + i*1.1 + sx*0.03;
      const rise=((t*0.8 + i*0.9 + sx*0.01) % 5)/5;
      const sxo=cx + Math.sin(ph)*crW*0.3;
      const syo=crY - rise*h*1.2;
      const sr=10 + rise*18;
      ctx.fillStyle=`rgba(140,130,125,${(1-rise)*0.35})`;
      ctx.beginPath(); ctx.arc(sxo,syo,sr,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=`rgba(80,70,70,${(1-rise)*0.25})`;
      ctx.beginPath(); ctx.arc(sxo+4,syo+2,sr*0.7,0,Math.PI*2); ctx.fill();
    }
    // Rare ember spark dropped into particles (camera-visible only)
    if(Math.random()<0.04 && typeof particles!=='undefined'){
      particles.push({x:cx+(Math.random()-0.5)*crW*0.3, y:crY, vx:(Math.random()-0.5)*1.5, vy:-1.5-Math.random()*1.5, life:40+Math.random()*30, color:['#f80','#fa0','#ff6'][Math.floor(Math.random()*3)], size:1+Math.random()*1.5});
    }
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
  case 'closedPyramid': {
    const l=b.layers||5;
    // Back shadow face (darker receding)
    ctx.fillStyle='#6a4a1e';
    ctx.beginPath(); ctx.moveTo(sx,sy+h); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h); ctx.closePath(); ctx.fill();
    // Lit left face
    ctx.fillStyle='#d8a858';
    ctx.beginPath(); ctx.moveTo(sx,sy+h); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w/2,sy+h); ctx.closePath(); ctx.fill();
    // Stepped block tiers
    const tiers=Math.max(6,l*2);
    ctx.strokeStyle='rgba(60,36,14,0.55)'; ctx.lineWidth=1;
    for(let r=1;r<tiers;r++){
      const ry=sy+r*h/tiers; const rw=w*(1-r/tiers);
      ctx.beginPath(); ctx.moveTo(sx+w/2-rw/2,ry); ctx.lineTo(sx+w/2+rw/2,ry); ctx.stroke();
    }
    // Vertical block seams (on lit face only)
    ctx.strokeStyle='rgba(60,36,14,0.28)'; ctx.lineWidth=0.7;
    for(let r=1;r<tiers;r++){
      const ry0=sy+(r-1)*h/tiers, ry1=sy+r*h/tiers;
      const rw0=w*(1-(r-1)/tiers)/2, rw1=w*(1-r/tiers)/2;
      const nb=Math.max(2,Math.floor(rw0/16));
      for(let bi=1;bi<=nb;bi++){
        const bt0=bi/nb, bt1=bi/nb;
        const x0=sx+w/2 - rw0*bt0;
        const x1=sx+w/2 - rw1*bt1;
        ctx.beginPath(); ctx.moveTo(x0,ry0); ctx.lineTo(x1,ry1); ctx.stroke();
      }
    }
    // Seam between two faces (center vertical)
    ctx.strokeStyle='rgba(40,24,10,0.5)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2,sy+h); ctx.stroke();
    // Capstone (dull — sealed, no glow)
    ctx.fillStyle='#8a6828';
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2-7,sy+14); ctx.lineTo(sx+w/2+7,sy+14); ctx.closePath(); ctx.fill();
    // Carved sun-disc glyph (flush with face, NOT a doorway — just etched stone)
    ctx.strokeStyle='rgba(60,36,14,0.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(sx+w/2, sy+h*0.7, 7, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx+w/2, sy+h*0.7, 3, 0, Math.PI*2); ctx.stroke();
    // Rays radiating from the disc
    for(let ri=0;ri<8;ri++){
      const ang=ri*Math.PI/4, r1=9, r2=12;
      ctx.beginPath();
      ctx.moveTo(sx+w/2+Math.cos(ang)*r1, sy+h*0.7+Math.sin(ang)*r1);
      ctx.lineTo(sx+w/2+Math.cos(ang)*r2, sy+h*0.7+Math.sin(ang)*r2);
      ctx.stroke();
    }
    break;
  }
  case 'openPyramid': {
    const l=b.layers||5;
    // Smooth solid pyramid triangle (matches sandbox 'grandPyramid' look)
    ctx.fillStyle='#c0a050';
    ctx.beginPath(); ctx.moveTo(sx,sy+h); ctx.lineTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h); ctx.closePath(); ctx.fill();
    // Layer lines
    ctx.strokeStyle='rgba(200,160,60,0.2)'; ctx.lineWidth=0.5;
    for(let r=1;r<l;r++){
      const ry=sy+r*h/l;
      const rw=w*(1-r/l);
      ctx.beginPath(); ctx.moveTo(sx+w/2-rw/2,ry); ctx.lineTo(sx+w/2+rw/2,ry); ctx.stroke();
    }
    // Golden capstone
    ctx.fillStyle='#ffd700';
    ctx.beginPath(); ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w/2-8,sy+18); ctx.lineTo(sx+w/2+8,sy+18); ctx.closePath(); ctx.fill();
    // Capstone pulsing glow
    ctx.fillStyle=`rgba(255,255,200,${0.3+Math.sin(t*3)*0.2})`;
    ctx.beginPath(); ctx.arc(sx+w/2,sy+8,6,0,Math.PI*2); ctx.fill();
    // Eye/entrance above doorway (decorative — matches sandbox grandPyramid)
    ctx.fillStyle='rgba(255,200,50,0.5)';
    ctx.beginPath();
    ctx.moveTo(sx+w/2,sy+h*0.55); ctx.lineTo(sx+w/2-7,sy+h*0.65); ctx.lineTo(sx+w/2+7,sy+h*0.65); ctx.closePath();
    ctx.fill();
    // DARK OPEN DOORWAY at base center (walk-in entrance)
    const dw=Math.min(28, w*0.14), dh=Math.min(40, h*0.32);
    const dx=sx+w/2-dw/2, dy=sy+h-dh;
    ctx.fillStyle='#050302';
    ctx.fillRect(dx, dy, dw, dh);
    // Torchlight peeking out
    const dg=ctx.createRadialGradient(sx+w/2, dy+dh*0.4, 1, sx+w/2, dy+dh*0.4, dw*1.2);
    dg.addColorStop(0,`rgba(255,170,60,${0.5+Math.sin(t*4)*0.15})`);
    dg.addColorStop(0.7,'rgba(180,80,20,0.15)');
    dg.addColorStop(1,'transparent');
    ctx.fillStyle=dg; ctx.fillRect(dx-10, dy-10, dw+20, dh+14);
    // Sandstone door frame
    ctx.fillStyle='#b88860';
    ctx.fillRect(dx-4, dy-4, 4, dh+4); // left
    ctx.fillRect(dx+dw, dy-4, 4, dh+4); // right
    ctx.fillRect(dx-4, dy-4, dw+8, 5); // lintel
    // Glyphs above door
    ctx.fillStyle='rgba(60,36,14,0.8)';
    ctx.font='bold 8px monospace'; ctx.textAlign='center';
    ctx.fillText('\u2600 \u25B2 \u2600', sx+w/2, dy-7);
    break;
  }
  case 'halfPyramid': {
    const l=b.layers||3;
    const tgt=b.targetLayers||(l+2);
    // The pyramid would fully span triangle with apex at (sx+w/2, sy - extraH)
    // where extraH corresponds to the missing (tgt-l) layers. We only draw up to sy (truncated).
    const layerH=h/l;
    // Ghost/outline of the unfinished apex
    const missingLayers=tgt-l;
    const apexY=sy - missingLayers*layerH;
    const apexX=sx+w/2;
    const fullW = w * (tgt/l);
    const fullLeft = sx+w/2 - fullW/2;
    const fullRight= sx+w/2 + fullW/2;
    // Dashed "plan" outline of full intended pyramid
    ctx.strokeStyle='rgba(180,140,80,0.35)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(fullLeft, sy+h); ctx.lineTo(apexX, apexY); ctx.lineTo(fullRight, sy+h); ctx.stroke();
    ctx.setLineDash([]);
    // Built portion — truncated pyramid (trapezoid)
    const topHalfW = w/2 * (1 - (missingLayers*layerH)/((missingLayers+l)*layerH));
    // simpler: the top edge width at sy is w * (missingLayers/tgt) from the apex
    const topW = fullW * (missingLayers/tgt);
    const topLeft = sx+w/2 - topW/2;
    const topRight= sx+w/2 + topW/2;
    // Back face shadow
    ctx.fillStyle='#6a4a1e';
    ctx.beginPath();
    ctx.moveTo(sx, sy+h); ctx.lineTo(topLeft, sy); ctx.lineTo(topRight, sy); ctx.lineTo(sx+w, sy+h);
    ctx.closePath(); ctx.fill();
    // Lit left face
    ctx.fillStyle='#d8a858';
    ctx.beginPath();
    ctx.moveTo(sx, sy+h); ctx.lineTo(topLeft, sy); ctx.lineTo(sx+w/2, sy); ctx.lineTo(sx+w/2, sy+h);
    ctx.closePath(); ctx.fill();
    // Stepped tiers on built portion
    ctx.strokeStyle='rgba(60,36,14,0.55)'; ctx.lineWidth=1;
    for(let r=1;r<l;r++){
      const ry=sy+h-r*layerH;
      const rw=w*(1-r/tgt);
      ctx.beginPath(); ctx.moveTo(sx+w/2-rw/2, ry); ctx.lineTo(sx+w/2+rw/2, ry); ctx.stroke();
    }
    // Seam
    ctx.strokeStyle='rgba(40,24,10,0.5)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(sx+w/2, sy); ctx.lineTo(sx+w/2, sy+h); ctx.stroke();
    // Flat working top surface
    ctx.fillStyle='#e0b870';
    ctx.fillRect(topLeft, sy-2, topW, 3);
    ctx.strokeStyle='rgba(60,36,14,0.7)';
    ctx.strokeRect(topLeft, sy-2, topW, 3);
    // SCAFFOLDING on the right slope — wooden poles + planks
    ctx.strokeStyle='#6a4020'; ctx.lineWidth=2;
    const slopeDX = (fullRight - (sx+w))/(apexY - (sy+h)); // rise/run along right slope
    for(let si=0;si<3;si++){
      const polyY = sy+h - si*20 - 20;
      const slopeX = (sx+w) + slopeDX*(polyY-(sy+h));
      // Vertical pole
      ctx.beginPath(); ctx.moveTo(slopeX+2, sy+h); ctx.lineTo(slopeX+2, polyY); ctx.stroke();
      // Plank out to slope
      ctx.strokeStyle='#5a3418'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(slopeX+2, polyY); ctx.lineTo(slopeX-10, polyY); ctx.stroke();
      ctx.strokeStyle='#6a4020'; ctx.lineWidth=2;
    }
    // Ladder leaning against top
    ctx.strokeStyle='#8a5a28'; ctx.lineWidth=1.8;
    const ladX=topRight+1, ladX2=sx+w-4;
    ctx.beginPath(); ctx.moveTo(ladX, sy-1); ctx.lineTo(ladX2, sy+h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ladX+4, sy-1); ctx.lineTo(ladX2+4, sy+h); ctx.stroke();
    const ladRungs=5;
    for(let ri=1;ri<ladRungs;ri++){
      const rt=ri/ladRungs;
      const rx0=ladX+(ladX2-ladX)*rt;
      const ry0=sy-1+h*rt;
      ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.lineTo(rx0+4, ry0); ctx.stroke();
    }
    // Pile of hewn blocks at base
    ctx.fillStyle='#b08840';
    ctx.fillRect(sx-14, sy+h-10, 12, 10);
    ctx.fillRect(sx-6, sy+h-18, 12, 8);
    ctx.fillRect(sx+w+2, sy+h-8, 12, 8);
    ctx.strokeStyle='rgba(60,36,14,0.6)'; ctx.lineWidth=0.8;
    ctx.strokeRect(sx-14, sy+h-10, 12, 10);
    ctx.strokeRect(sx-6, sy+h-18, 12, 8);
    ctx.strokeRect(sx+w+2, sy+h-8, 12, 8);
    // Dust puff at top (construction active)
    ctx.fillStyle=`rgba(220,200,160,${0.25+Math.sin(t*2+b.windowSeed*0.01)*0.15})`;
    ctx.beginPath(); ctx.arc(sx+w/2, sy-6, 5+Math.sin(t*3)*1.5, 0, Math.PI*2); ctx.fill();
    break;
  }
  case 'sphinx': {
    // Colossal sphinx: recumbent lion body + pharaoh head with nemes headdress
    // Sandstone body plinth
    ctx.fillStyle='#b08848';
    ctx.fillRect(sx, sy+h-12, w, 12);
    ctx.strokeStyle='rgba(60,36,14,0.5)'; ctx.lineWidth=1;
    ctx.strokeRect(sx, sy+h-12, w, 12);
    // Lion body (lying down, long & low)
    const bodyY=sy+h*0.42;
    ctx.fillStyle='#d4a868';
    ctx.beginPath();
    ctx.moveTo(sx+6, sy+h-12);
    ctx.lineTo(sx+6, bodyY+10);
    ctx.quadraticCurveTo(sx+w*0.2, bodyY, sx+w*0.55, bodyY+4);
    ctx.lineTo(sx+w*0.9, bodyY+12);
    ctx.lineTo(sx+w-6, bodyY+14);
    ctx.lineTo(sx+w-6, sy+h-12);
    ctx.closePath();
    ctx.fill();
    // Body shadow underside
    ctx.fillStyle='#8a6a38';
    ctx.fillRect(sx+6, sy+h-18, w-12, 6);
    // Front paws (two rectangles in front of body)
    ctx.fillStyle='#c49858';
    ctx.fillRect(sx+w*0.55, sy+h-16, 10, 16);
    ctx.fillRect(sx+w*0.72, sy+h-16, 10, 16);
    // Paw toes
    ctx.strokeStyle='rgba(60,36,14,0.55)'; ctx.lineWidth=1;
    for(let pi=0;pi<2;pi++){
      const px0=sx+w*0.55+pi*w*0.17;
      for(let ti=0;ti<3;ti++){
        ctx.beginPath(); ctx.moveTo(px0+1+ti*3, sy+h-3); ctx.lineTo(px0+1+ti*3, sy+h-6); ctx.stroke();
      }
    }
    // Haunches (rear bump)
    ctx.fillStyle='#c89860';
    ctx.beginPath();
    ctx.ellipse(sx+w*0.12, bodyY+12, 14, 10, 0, 0, Math.PI*2);
    ctx.fill();
    // Tail curled along side
    ctx.strokeStyle='#a07838'; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(sx+4, bodyY+18);
    ctx.quadraticCurveTo(sx-8, bodyY+8, sx+2, bodyY-2);
    ctx.stroke();
    ctx.fillStyle='#8a6028';
    ctx.beginPath(); ctx.arc(sx+2, bodyY-2, 3, 0, Math.PI*2); ctx.fill();
    // HEAD at front with nemes (striped pharaoh headdress)
    const headCX=sx+w-18, headCY=sy+h*0.28;
    // Nemes headdress back (gold/blue striped cloth)
    ctx.fillStyle='#d4a030';
    ctx.beginPath();
    ctx.moveTo(headCX-16, headCY-4);
    ctx.quadraticCurveTo(headCX, headCY-24, headCX+16, headCY-4);
    ctx.lineTo(headCX+20, headCY+20);
    ctx.lineTo(headCX-20, headCY+20);
    ctx.closePath();
    ctx.fill();
    // Nemes stripes (alternating blue)
    ctx.fillStyle='rgba(40,80,140,0.7)';
    for(let si=0;si<4;si++){
      ctx.fillRect(headCX-20+si*10, headCY-4, 4, 24);
    }
    // Face (sandstone)
    ctx.fillStyle='#d8b078';
    ctx.beginPath();
    ctx.ellipse(headCX, headCY+2, 12, 14, 0, 0, Math.PI*2);
    ctx.fill();
    // Broken nose (classic sphinx damage)
    ctx.fillStyle='#b0843c';
    ctx.beginPath();
    ctx.ellipse(headCX, headCY+6, 3, 2, 0, 0, Math.PI*2);
    ctx.fill();
    // Eyes (stoic)
    ctx.fillStyle='rgba(40,24,8,0.85)';
    ctx.fillRect(headCX-5, headCY, 3, 1.5);
    ctx.fillRect(headCX+2, headCY, 3, 1.5);
    // Mouth line
    ctx.strokeStyle='rgba(60,36,14,0.7)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(headCX-3, headCY+10); ctx.lineTo(headCX+3, headCY+10); ctx.stroke();
    // False beard (pharaoh)
    ctx.fillStyle='#b8903c';
    ctx.fillRect(headCX-2, headCY+14, 4, 8);
    // Uraeus (rearing cobra on forehead)
    ctx.fillStyle='#ffd040';
    ctx.beginPath(); ctx.arc(headCX, headCY-8, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#a8781c';
    ctx.fillRect(headCX-1, headCY-12, 2, 4);
    // Sand piled against base
    ctx.fillStyle='#c8a060';
    ctx.beginPath();
    ctx.moveTo(sx-4, sy+h);
    ctx.quadraticCurveTo(sx+12, sy+h-5, sx+24, sy+h);
    ctx.closePath(); ctx.fill();
    break;
  }
  case 'desertMarket': {
    // Open-air Egyptian bazaar — canopies, merchandise piles, clay jars
    // Back wall (adobe)
    ctx.fillStyle='#b08048';
    ctx.fillRect(sx, sy+h*0.45, w, h*0.55);
    ctx.strokeStyle='rgba(60,36,14,0.4)'; ctx.lineWidth=1;
    ctx.strokeRect(sx, sy+h*0.45, w, h*0.55);
    // Adobe brick lines
    for(let by=sy+h*0.55; by<sy+h-6; by+=8){
      ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx+w, by); ctx.stroke();
    }
    // Striped cloth canopy across front (red/white — trader awning)
    const canY=sy+h*0.25;
    const canH=h*0.2;
    ctx.fillStyle='#c04030';
    ctx.fillRect(sx-2, canY, w+4, canH);
    ctx.fillStyle='#e8d8a0';
    for(let cx=sx;cx<sx+w;cx+=12){
      ctx.fillRect(cx, canY, 6, canH);
    }
    // Canopy poles
    ctx.fillStyle='#5a3a18';
    ctx.fillRect(sx-2, canY, 3, h*0.55);
    ctx.fillRect(sx+w-1, canY, 3, h*0.55);
    // Ripple at bottom of canopy (scalloped edge)
    ctx.fillStyle='#8a2818';
    for(let ex=sx-2; ex<sx+w+2; ex+=8){
      ctx.beginPath();
      ctx.moveTo(ex, canY+canH);
      ctx.lineTo(ex+4, canY+canH+3);
      ctx.lineTo(ex+8, canY+canH);
      ctx.closePath(); ctx.fill();
    }
    // Clay amphora jars on shelf (fruit/oil merchants)
    for(let ji=0; ji<3; ji++){
      const jx=sx+12+ji*24, jy=sy+h*0.62;
      ctx.fillStyle='#a05028';
      ctx.beginPath();
      ctx.moveTo(jx-5, jy);
      ctx.quadraticCurveTo(jx-7, jy+8, jx-4, jy+14);
      ctx.lineTo(jx+4, jy+14);
      ctx.quadraticCurveTo(jx+7, jy+8, jx+5, jy);
      ctx.closePath(); ctx.fill();
      // Jar neck
      ctx.fillStyle='#8a4020';
      ctx.fillRect(jx-3, jy-4, 6, 4);
      // Glyph stripe
      ctx.fillStyle='rgba(40,20,6,0.6)';
      ctx.fillRect(jx-4, jy+6, 8, 1);
    }
    // Pile of bread loaves / cloth bolts on ground
    ctx.fillStyle='#d4a060';
    for(let li=0;li<3;li++){
      ctx.beginPath();
      ctx.ellipse(sx+w*0.65+li*6, sy+h-5-li*3, 6, 3, 0, 0, Math.PI*2);
      ctx.fill();
    }
    // Stacked baskets
    ctx.fillStyle='#8a6030';
    ctx.fillRect(sx+w*0.78, sy+h-16, 12, 8);
    ctx.fillRect(sx+w*0.80, sy+h-24, 8, 8);
    ctx.strokeStyle='rgba(40,20,6,0.55)'; ctx.lineWidth=0.7;
    for(let bi=0;bi<3;bi++){ ctx.beginPath(); ctx.moveTo(sx+w*0.78, sy+h-14+bi*2); ctx.lineTo(sx+w*0.78+12, sy+h-14+bi*2); ctx.stroke(); }
    // Scales of Ma'at (merchant's scale)
    ctx.strokeStyle='#a8882a'; ctx.lineWidth=1.5;
    const scX=sx+w*0.25, scY=sy+h*0.5;
    ctx.beginPath(); ctx.moveTo(scX, scY); ctx.lineTo(scX, scY-14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(scX-8, scY-14); ctx.lineTo(scX+8, scY-14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(scX-8, scY-14); ctx.lineTo(scX-8, scY-8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(scX+8, scY-14); ctx.lineTo(scX+8, scY-8); ctx.stroke();
    ctx.fillStyle='#c8a040';
    ctx.beginPath(); ctx.arc(scX-8, scY-6, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(scX+8, scY-6, 3, 0, Math.PI*2); ctx.fill();
    break;
  }
  case 'anubisStatue': {
    // Anubis — jackal-headed god statue on plinth
    // Plinth
    ctx.fillStyle='#b08040';
    ctx.fillRect(sx, sy+h-20, w, 20);
    ctx.strokeStyle='rgba(40,24,8,0.6)'; ctx.lineWidth=1;
    ctx.strokeRect(sx, sy+h-20, w, 20);
    // Hieroglyphs on plinth
    ctx.fillStyle='rgba(60,36,14,0.7)';
    ctx.font='bold 8px monospace'; ctx.textAlign='center';
    ctx.fillText('\u2625 \u2600 \u2625', sx+w/2, sy+h-6);
    // Body (dark basalt)
    ctx.fillStyle='#2a2418';
    ctx.fillRect(sx+w/2-12, sy+h-54, 24, 34);
    // Shoulder cape lines
    ctx.fillStyle='#3a3220';
    ctx.fillRect(sx+w/2-13, sy+h-54, 26, 4);
    // Arms crossed holding crook & flail
    ctx.fillStyle='#1a1610';
    ctx.fillRect(sx+w/2-8, sy+h-48, 4, 14); // left arm
    ctx.fillRect(sx+w/2+4, sy+h-48, 4, 14); // right arm
    // Crook (shepherd's staff)
    ctx.strokeStyle='#c8a040'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(sx+w/2-6, sy+h-46);
    ctx.lineTo(sx+w/2-6, sy+h-60);
    ctx.quadraticCurveTo(sx+w/2-10, sy+h-64, sx+w/2-10, sy+h-60);
    ctx.stroke();
    // Flail
    ctx.strokeStyle='#c8a040';
    ctx.beginPath(); ctx.moveTo(sx+w/2+6, sy+h-46); ctx.lineTo(sx+w/2+6, sy+h-60); ctx.stroke();
    for(let fi=0;fi<3;fi++){
      ctx.beginPath(); ctx.moveTo(sx+w/2+6, sy+h-60); ctx.lineTo(sx+w/2+4+fi*2, sy+h-64); ctx.stroke();
    }
    // Jackal head (pointed snout + tall ears)
    const jhCX=sx+w/2, jhCY=sy+h-62;
    ctx.fillStyle='#1a140a';
    // Head
    ctx.beginPath();
    ctx.ellipse(jhCX, jhCY, 10, 9, 0, 0, Math.PI*2);
    ctx.fill();
    // Snout (protruding forward)
    ctx.beginPath();
    ctx.moveTo(jhCX+4, jhCY-1);
    ctx.lineTo(jhCX+16, jhCY);
    ctx.lineTo(jhCX+16, jhCY+4);
    ctx.lineTo(jhCX+4, jhCY+5);
    ctx.closePath(); ctx.fill();
    // Tall pointed ears
    ctx.beginPath();
    ctx.moveTo(jhCX-6, jhCY-7);
    ctx.lineTo(jhCX-9, jhCY-16);
    ctx.lineTo(jhCX-2, jhCY-9);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(jhCX+2, jhCY-9);
    ctx.lineTo(jhCX+4, jhCY-16);
    ctx.lineTo(jhCX+7, jhCY-7);
    ctx.closePath(); ctx.fill();
    // Eye (glowing gold)
    ctx.fillStyle=`rgba(255,210,80,${0.6+Math.sin(t*2)*0.3})`;
    ctx.beginPath(); ctx.arc(jhCX+2, jhCY, 1.5, 0, Math.PI*2); ctx.fill();
    // Gold collar
    ctx.fillStyle='#d4a020';
    ctx.fillRect(sx+w/2-12, sy+h-54, 24, 3);
    // Subtle aura
    const aura=ctx.createRadialGradient(jhCX, jhCY, 2, jhCX, jhCY, 40);
    aura.addColorStop(0,`rgba(255,210,100,${0.12+Math.sin(t*1.5)*0.05})`);
    aura.addColorStop(1,'transparent');
    ctx.fillStyle=aura;
    ctx.beginPath(); ctx.arc(jhCX, jhCY, 40, 0, Math.PI*2); ctx.fill();
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
  case 'starship': {
    // SpaceX Starship silhouette: long silver cylinder with nose cone + fins at base
    const cx=sx+w/2;
    // Main cylinder (stainless)
    const sg=ctx.createLinearGradient(sx,sy,sx+w,sy);
    sg.addColorStop(0,'#7a828a');sg.addColorStop(0.3,'#d0d4d8');sg.addColorStop(0.6,'#e8ecf0');sg.addColorStop(1,'#8a9098');
    ctx.fillStyle=sg;
    ctx.fillRect(sx,sy+h*0.15,w,h*0.72);
    // Nose cone (top)
    ctx.fillStyle='#d0d4d8';
    ctx.beginPath();
    ctx.moveTo(sx,sy+h*0.15);
    ctx.quadraticCurveTo(cx,sy-h*0.05,sx+w,sy+h*0.15);
    ctx.closePath();ctx.fill();
    // Nose highlight
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.beginPath();ctx.moveTo(sx+w*0.35,sy+h*0.14);ctx.quadraticCurveTo(cx-2,sy+h*0.02,cx-w*0.05,sy+h*0.12);ctx.closePath();ctx.fill();
    // Forward flaps
    ctx.fillStyle='#6a7278';
    ctx.beginPath();ctx.moveTo(sx,sy+h*0.28);ctx.lineTo(sx-w*0.18,sy+h*0.42);ctx.lineTo(sx,sy+h*0.38);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+w,sy+h*0.28);ctx.lineTo(sx+w+w*0.18,sy+h*0.42);ctx.lineTo(sx+w,sy+h*0.38);ctx.closePath();ctx.fill();
    // Heat-shield tile band (dark dotted texture on one side)
    ctx.fillStyle='rgba(30,30,35,0.35)';
    for(let ti=0;ti<14;ti++){
      const ty=sy+h*0.18+ti*(h*0.68/14);
      ctx.fillRect(sx+2,ty,w*0.45,h*0.68/14-1);
    }
    // "STARSHIP" text vertical
    ctx.fillStyle='rgba(40,40,50,0.65)';ctx.font='bold 8px monospace';ctx.textAlign='center';
    ctx.save();ctx.translate(cx+w*0.12,sy+h*0.5);ctx.rotate(-Math.PI/2);
    ctx.fillText('STARSHIP',0,0);ctx.restore();
    // Aft flaps
    ctx.fillStyle='#5a6268';
    ctx.beginPath();ctx.moveTo(sx,sy+h*0.78);ctx.lineTo(sx-w*0.22,sy+h*0.92);ctx.lineTo(sx,sy+h*0.87);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(sx+w,sy+h*0.78);ctx.lineTo(sx+w+w*0.22,sy+h*0.92);ctx.lineTo(sx+w,sy+h*0.87);ctx.closePath();ctx.fill();
    // Engine bells (3)
    ctx.fillStyle='#1a1a22';
    const eby=sy+h*0.88, ebh=h*0.12;
    for(let ei=0;ei<3;ei++){
      const ex=sx+w*0.2+ei*w*0.3;
      ctx.beginPath();ctx.moveTo(ex,eby);ctx.lineTo(ex+w*0.2,eby);ctx.lineTo(ex+w*0.16,eby+ebh);ctx.lineTo(ex+w*0.04,eby+ebh);ctx.closePath();ctx.fill();
    }
    // Landing legs (4 stubs)
    ctx.strokeStyle='#4a4a52';ctx.lineWidth=2;
    for(let lg=0;lg<4;lg++){
      const lx=sx+w*0.15+lg*w*0.23;
      ctx.beginPath();ctx.moveTo(lx,sy+h*0.88);ctx.lineTo(lx-6+lg*4,sy+h);ctx.stroke();
    }
    // Panel outline
    ctx.strokeStyle='rgba(40,40,50,0.4)';ctx.lineWidth=1;
    ctx.strokeRect(sx,sy+h*0.15,w,h*0.72);
    // Hull rings
    for(let rr=1;rr<5;rr++){
      ctx.beginPath();ctx.moveTo(sx,sy+h*0.15+rr*(h*0.72/5));ctx.lineTo(sx+w,sy+h*0.15+rr*(h*0.72/5));ctx.stroke();
    }
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
    const burnH = Math.min(h, b.burnTimer * 0.8);
    // Charring — darker and faster
    ctx.fillStyle = `rgba(20,8,0,${Math.min(0.6, b.burnTimer/300)})`;
    ctx.fillRect(sx, sy, w, h);
    // Flames — denser
    const flameCount = Math.min(14, 4 + b.burnTimer/20);
    for(let i = 0; i < flameCount; i++) {
      const fx = sx + Math.random() * w;
      const fy = sy + h - Math.random() * burnH;
      const fs = 5 + Math.random() * 8 + b.burnTimer * 0.03;
      ctx.fillStyle = `rgba(255,${80+Math.random()*120},0,${0.35+Math.random()*0.35})`;
      ctx.beginPath(); ctx.arc(fx, fy, fs, 0, Math.PI*2); ctx.fill();
    }
    // Bright core embers
    for(let i = 0; i < 3; i++){
      const ex = sx + Math.random()*w, ey = sy + h - Math.random()*burnH*0.7;
      ctx.fillStyle = `rgba(255,230,120,${0.4+Math.random()*0.3})`;
      ctx.beginPath(); ctx.arc(ex, ey, 2+Math.random()*2, 0, Math.PI*2); ctx.fill();
    }
    // Faster health drain
    if(b.burnTimer % 6 === 0) { b.health -= 4; if(b.health <= 0) checkBuildingDestroyed(b); }
    // Occasionally shed falling ember fires
    if(b.burnTimer > 30 && Math.random() < 0.03 && fires.length < 40){
      fires.push({x: sx + Math.random()*w, y: sy + Math.random()*h, life: 80+Math.random()*60, size: 4+Math.random()*4, vy: 0, vx: (Math.random()-0.5)*0.6, stuck: false});
    }
    // Ignite nearby humans
    if(b.burnTimer % 20 === 0){
      const bx = sx + w/2, by = sy + h/2;
      for(let hi = 0; hi < humans.length; hi++){
        const hm = humans[hi];
        if(hm.collected||hm.hidden||hm.onFire) continue;
        if(Math.abs(hm.bodyX - bx) < w*0.6 + 20 && Math.abs(hm.bodyY - by) < h*0.6 + 40){
          hm.onFire = true; hm.burnTimer = 320 + Math.random()*180; hm.ignitionCD = 60;
          break;
        }
      }
    }
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
    // Earth: biome-specific humans (or Cretaceous dinosaurs, during prehistoricEra)
    if(p.id==='earth' && window.prehistoricEra){
      // Biome-aware dino pick: entries with a `biomes` list are restricted to those biomes;
      // entries without one are excluded from the snow biome (no tropical dinos in the Arctic).
      const biomeId = getEarthBiome(x).id;
      const candidates = prehistoricHumanTypes.filter(t => t.biomes ? t.biomes.includes(biomeId) : biomeId!=='snow');
      template = (candidates.length ? candidates : prehistoricHumanTypes)[Math.floor(Math.random()*(candidates.length||prehistoricHumanTypes.length))];
      // Dinos: reptilian skin uses template colors rather than human hsl
      skinColor = template.colors[0];
    } else if(p.id==='earth'){
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
    // Rare costume spawn on Earth (president / ghost / clown / astronaut)
    if(p.id==='earth' && !window.prehistoricEra && Math.random()<0.04){
      template = costumeHumanTypes[Math.floor(Math.random()*costumeHumanTypes.length)];
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
    costume:template.costume||null,
    isAstronaut:template.costume==='astronaut' || false,
    isAlien:isAlienCreature,
    float:template.float||false,
    floatPhase:Math.random()*Math.PI*2,
    isDino:template.isDino||false, dinoKind:template.dinoKind||null, biped:template.biped,
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
    behaviorState:0, // sub-state for complex behaviors
    // Burning state
    onFire:false, burnTimer:0, ignitionCD:0,
    // Job commute: many humans get a workplace (workX) separate from home
    workX:x
  };
  // Assign workX: office-ish humans commute between homeX and workX across biome
  const commuteBiomes=['city','suburbs','suburbs2','landmarks','farmland'];
  const commuteTypes=['businesswoman','priest','old','fat','child'];
  const canCommute = p.id==='earth' && (commuteBiomes.includes(h.biomeId) || commuteTypes.includes(template.type));
  if(canCommute){
    // Pick a work location 400-1400px from home, biased away from ocean
    for(let tries=0;tries<5;tries++){
      const dir=Math.random()>0.5?1:-1;
      const off=400+Math.random()*1000;
      const wx=Math.max(200,Math.min(worldWidth-200,x+dir*off));
      if(!isOverOcean(wx)){h.workX=wx;break;}
    }
  }
  // Assign initial behavior based on type/biome
  if(template.type==='farmer') h.behavior='farming';
  else if(template.type==='jogger') h.behavior='jogging';
  else if(template.type==='indigenous') h.behavior='patrol';
  else if(canCommute && h.workX!==h.homeX) h.behavior=Math.random()<0.7?'commute':'idle';
  else h.behavior='idle';
  humans.push(h);
}

// --- WACKY COW GENERATION ---
const COW_TYPES = {
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

// Vehicle catalogs keyed by planet id (for debug preview). Earth is the only planet with real road traffic.
const VEHICLE_TYPES = {
  'earth': [
    {type:'car',w:62,h:22,color:'#c33',speed:1.5,label:'Sedan'},
    {type:'car',w:64,h:22,color:'#33c',speed:1.8,label:'Hatchback'},
    {type:'car',w:68,h:26,color:'#3a3a3a',speed:1.3,label:'SUV'},
    {type:'car',w:62,h:22,color:'#cc3',speed:2.0,label:'Taxi'},
    {type:'truck',w:100,h:32,color:'#555',speed:0.8,label:'Truck'},
    {type:'bus',w:130,h:34,color:'#e82',speed:0.6,label:'Bus'},
    {type:'truck',w:80,h:30,color:'#2a8a3a',speed:0.5,label:'Tractor'},
  ],
};

function generateCow(x, biomeMin, biomeMax) {
  const p = currentPlanet||planetDefs[0];
  const gy = GROUND_LEVEL;
  const types = COW_TYPES[p.id] || COW_TYPES['earth'];
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
    extraHeadAngle: 0, // for twohead
    biomeMin: biomeMin, biomeMax: biomeMax
  });
}

function generateCows() {
  cows = [];
  const p = currentPlanet||planetDefs[0];
  if(p.id==='earth'){
    const _farm=earthBiomes.find(b=>b.id==='farmland');
    const _jungle=earthBiomes.find(b=>b.id==='jungle');
    const _snow=earthBiomes.find(b=>b.id==='snow');
    const _desertB=earthBiomes.find(b=>b.id==='desert');
    const farmMin=_farm?_farm.from+100:6100, farmMax=_farm?_farm.to-100:9400;
    const jungleMin=_jungle?_jungle.from+100:10100, jungleMax=_jungle?_jungle.to-100:13400;
    const snowMin=_snow?_snow.from+100:16100, snowMax=_snow?_snow.to-100:19400;
    const desMin=_desertB?_desertB.from+200:34700, desMax=_desertB?_desertB.to-200:41300;
    // Farmland: cows + sheep
    const cowCount=Math.floor(8+Math.random()*6);
    for(let i=0;i<cowCount;i++){
      const farmX=farmMin+Math.random()*(farmMax-farmMin);
      generateCow(farmX,farmMin,farmMax);
    }
    // Sheep on farmland (white wool, small)
    const sheepCount=Math.floor(6+Math.random()*5);
    for(let i=0;i<sheepCount;i++){
      const sx=farmMin+Math.random()*(farmMax-farmMin);
      const s=0.8;
      cows.push({x:sx,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:'#f0ede5',spots:'#d8d2c2',label:'Sheep',wack:'sheep',
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.25+Math.random()*0.35,
        walkTimer:Math.random()*200,mooTimer:Math.random()*400,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0,
        biomeMin:farmMin,biomeMax:farmMax});
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
      const s=ct.size,x=jungleMin+Math.random()*(jungleMax-jungleMin);
      cows.push({x,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:ct.color,spots:ct.spots,label:ct.label,wack:ct.wack,
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.3+Math.random()*0.6,
        walkTimer:Math.random()*200,mooTimer:Math.random()*300,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0,
        biomeMin:jungleMin,biomeMax:jungleMax});
    }
    // Desert biome: camels
    const camelCount=3+Math.floor(Math.random()*4);
    for(let i=0;i<camelCount;i++){
      const cx=desMin+Math.random()*(desMax-desMin);
      const s=1.1;
      cows.push({x:cx,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-18*s,vx:0,vy:0,
        size:s,color:'#d4a860',spots:'#8a6a3a',label:'Camel',wack:'camel',
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.18+Math.random()*0.22,
        walkTimer:Math.random()*200,mooTimer:Math.random()*500,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0,
        biomeMin:desMin,biomeMax:desMax});
    }
    // Snow biome: a few wolves/yetis wandering
    const snowTypes=[
      {label:'Wolf',color:'#9a9aa8',spots:'#5a5a68',size:0.9,wack:'monkey'},
      {label:'Yeti',color:'#f0f4fa',spots:'#c0c8d8',size:1.5,wack:'monkey'},
    ];
    for(let i=0;i<4+Math.floor(Math.random()*3);i++){
      const ct=snowTypes[Math.floor(Math.random()*snowTypes.length)];
      const s=ct.size,x=snowMin+Math.random()*(snowMax-snowMin);
      cows.push({x,y:GROUND_LEVEL,bodyY:GROUND_LEVEL-15*s,vx:0,vy:0,
        size:s,color:ct.color,spots:ct.spots,label:ct.label,wack:ct.wack,
        walkDir:Math.random()>0.5?1:-1,walkSpeed:0.3+Math.random()*0.5,
        walkTimer:Math.random()*200,mooTimer:Math.random()*300,legAnim:0,tailAnim:0,
        beingBeamed:false,collected:false,planetId:p.id,hoverPhase:Math.random()*Math.PI*2,extraHeadAngle:0,
        biomeMin:snowMin,biomeMax:snowMax});
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

  // Hidden seabed cave mouths — entrances to bioluminescent deep caves (need dive suit)
  // Scatter 2 across the ocean, spaced apart
  const caveCount = 2;
  for(let ci = 0; ci < caveCount; ci++) {
    const cxSlot = oceanFrom + 400 + (oceanW-800)*((ci+0.5)/caveCount) + (Math.random()-0.5)*200;
    underwaterObjects.push({
      type: 'seabedCave',
      x: cxSlot,
      y: SEABED_Y - 4,
      w: 90 + Math.random()*30,
      h: 70 + Math.random()*20,
      glowPhase: Math.random()*Math.PI*2,
      motePhase: Math.random()*Math.PI*2,
    });
  }

  // Bubbles (ambient, rise from seabed)
  for(let i = 0; i < 10; i++) {
    underwaterObjects.push({
      type: 'bubbleSource', x: oceanFrom + Math.random() * oceanW,
      y: SEABED_Y - 10, timer: Math.random() * 200, interval: 60 + Math.random() * 120
    });
  }

  // Prehistoric marine reptiles — only during the dinosaur era
  if (window.prehistoricEra) {
    // Mosasaurus — apex predator, big and fast
    for (let i = 0; i < 2; i++) {
      underwaterObjects.push({
        type: 'mosasaurus', x: oceanFrom + Math.random() * oceanW,
        y: GROUND_LEVEL + 180 + Math.random() * (WATER_DEPTH - 420),
        dir: Math.random()>0.5?1:-1, speed: 0.6 + Math.random()*0.4,
        phase: Math.random()*Math.PI*2,
        bodyColor:'#2a3a4a', bellyColor:'#6a8090',
      });
    }
    // Plesiosaurus — long-necked, slower, more common
    for (let i = 0; i < 3; i++) {
      underwaterObjects.push({
        type: 'plesiosaurus', x: oceanFrom + Math.random() * oceanW,
        y: GROUND_LEVEL + 140 + Math.random() * (WATER_DEPTH - 380),
        dir: Math.random()>0.5?1:-1, speed: 0.35 + Math.random()*0.25,
        phase: Math.random()*Math.PI*2,
        bodyColor:'#3a5a48', bellyColor:'#8aaa90',
      });
    }
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
    // Prehistoric Earth: no buildings, but generate biome-appropriate flora + a few volcanoes.
    if(planet.id==='earth' && window.prehistoricEra){
      generatePrehistoricFlora();
      generatePrehistoricVolcanoes();
      bx = worldWidth;
    }
    // Planets with buildingDensity 0 (e.g. Moon) stay empty
    if((planet.buildingDensity||1) === 0) bx = worldWidth;
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
    let popCount=Math.floor((planet.inhabitantCount!=null?planet.inhabitantCount:30)*(1+diff*0.2));
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
    // Earth desert: guarantee at least one enterable pyramid
    if(planet.id==='earth'){
      const openPys = buildings.filter(bl => bl.blocks[0]&&bl.blocks[0].buildingType==='openPyramid');
      if(openPys.length===0){
        const closedPys = buildings.filter(bl => bl.blocks[0]&&bl.blocks[0].buildingType==='closedPyramid');
        if(closedPys.length>0){
          closedPys[Math.floor(Math.random()*closedPys.length)].blocks[0].buildingType='openPyramid';
        } else {
          // No pyramids generated at all — drop one in the middle of the desert biome
          const _des=earthBiomes.find(b=>b.id==='desert');
          if(_des){
            const px=(_des.from+_des.to)/2, l=5;
            const ph=l*22+30, pw=l*40;
            const building={x:px-pw/2,w:pw,blocks:[],destroyed:false,totalBlocks:1,brokenBlocks:0};
            const block={x:px-pw/2,y:GROUND_LEVEL-ph,w:pw,h:ph,vx:0,vy:0,
              color:'#d8c080',accentColor:'#b89860',fixed:true,mass:Math.max(3,pw*ph/300),building,row:0,col:0,
              health:600,maxHealth:600,cracked:false,onFire:false,burnTimer:0,exploding:false,explodeTimer:0,
              hasWindow:false,windowLit:false,isDoor:false,
              shape:'building',buildingType:'openPyramid',layers:l,windowSeed:Math.random()*1000,isTree:false};
            building.blocks.push(block);blocks.push(block);buildings.push(building);
          }
        }
      }
    }
    // Moon: spawn 1-4 astronauts + one SpaceX Starship — only in the modern era.
    // 68M years ago there were no humans or spacecraft on the Moon.
    if(planet.id==='moon' && !window.prehistoricEra){
      const shipX = worldWidth*0.5;
      // Starship building (tall narrow rocket)
      const shW=80, shH=260;
      const sBuilding={x:shipX-shW/2, w:shW, blocks:[], destroyed:false, totalBlocks:1, brokenBlocks:0};
      const sBlock={x:shipX-shW/2, y:GROUND_LEVEL-shH, w:shW, h:shH, vx:0, vy:0,
        color:'#d4d8dc', accentColor:'#6a7278', fixed:true, mass:12, building:sBuilding, row:0, col:0,
        health:500, maxHealth:500, cracked:false, onFire:false, burnTimer:0, exploding:false, explodeTimer:0,
        hasWindow:false, windowLit:false, isDoor:false,
        shape:'building', buildingType:'starship', windowSeed:Math.random()*1000, isTree:false};
      sBuilding.blocks.push(sBlock); blocks.push(sBlock); buildings.push(sBuilding);
      // Astronauts (1-4) wandering near the ship
      const nAstro = 1 + Math.floor(Math.random()*4);
      for(let i=0;i<nAstro;i++){
        const ax = shipX + (Math.random()*600-300);
        generateInhabitant(ax);
        const h = humans[humans.length-1];
        if(h){ h.isAstronaut = true; h.color='#e8ecf0'; h.skinColor='#f0d8b8'; }
      }
      popCount = nAstro;
      initialPopulation = nAstro;
    }
    // Saturn: gas giant — inhabitants drift in the cloud decks, handled by normal generation.
    if(!(planet.id==='earth' && window.prehistoricEra)) generateCows();
    generateUnderwaterObjects();
    // Generate military bases on Earth (3 bases at fixed positions)
    // Skip during prehistoricEra — no armies 68M years ago
    earthMilitaryBases=[];
    // Military bases on Earth disabled for now — will be reworked later.
    if(false && planet.id==='earth' && !window.prehistoricEra){
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
        // No pre-spawned garrison — military only deploys when the player draws heat (wantedLevel>0)
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
  // Crashed UFO wrecks — 1-3 per planet, mysterious ancient hulks. Scavenge for bonus score & particles.
  ufoWrecks=[];
  hiddenBunkers=[];
  if(planet.id!=='moon' || !window.prehistoricEra){
    const nWrecks = 1 + Math.floor(Math.random()*3);
    for(let i=0;i<nWrecks;i++){
      let wx = 400 + Math.random()*(worldWidth-800);
      // Avoid Earth oceans
      if(planet.id==='earth' && typeof isOverOcean==='function'){ for(let tries=0;tries<6 && isOverOcean(wx);tries++) wx = 400 + Math.random()*(worldWidth-800); }
      ufoWrecks.push({x:wx,y:GROUND_LEVEL-8,scavenged:false,sparkT:Math.random()*100});
    }
    // Hidden bunkers — 1-2 per planet, revealed only when within ~80px
    const nBunkers = 1 + Math.floor(Math.random()*2);
    for(let i=0;i<nBunkers;i++){
      let bxx = 600 + Math.random()*(worldWidth-1200);
      if(planet.id==='earth' && typeof isOverOcean==='function'){ for(let tries=0;tries<6 && isOverOcean(bxx);tries++) bxx = 600 + Math.random()*(worldWidth-1200); }
      hiddenBunkers.push({x:bxx, w:80, h:24, revealed:false, looted:false});
    }
  }
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
  if(p.id==='earth' && window.prehistoricEra) return; // no cars in the Cretaceous
  if(p.id==='earth'){
    const vTypes=VEHICLE_TYPES.earth.slice(0,6); // first six: city/suburb traffic (not the tractor)
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

  // Military is disabled on all planets for now — will be reworked later.
  return;
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
  const target=cloaked?{x:realTarget.x+(Math.sin(frameT)*500),y:realTarget.y+200}:realTarget;

  military.forEach(m=>{
    // Bullets/boulders use life, not alive
    if(m.type!=='bullet'&&m.type!=='boulder'&&!m.alive)return;

    // Detect damage this frame: passive soldiers become hostile when attacked
    if(m.type!=='bullet'&&m.type!=='boulder'){
      if(m._prevHealth!=null && m.health < m._prevHealth){
        if(m.passive) provokeMilitary(m.x, m.y);
      }
      m._prevHealth = m.health;
    }

    // Stunned: frozen in place — skip AI this frame
    if(m.type!=='bullet'&&m.type!=='boulder'&&m.stunTimer>0){
      m.stunTimer--;
      if(m.stunTimer%6===0)particles.push({x:m.x+(Math.random()-0.5)*10,y:m.y-20,vx:(Math.random()-0.5)*0.3,vy:-0.5,life:18,color:'rgba(140,220,255,0.7)',size:1.4});
      return;
    }

    // Face toward target
    if(m.type!=='bullet'&&m.type!=='boulder'){m.facing=m.x<target.x?1:-1;}
    const d=cloaked?9999:dist(m.x,m.y,realTarget.x,realTarget.y); // can't see cloaked ship

    if(m.type==='soldier'){
      // Passive soldiers (Earth bases) just patrol near base until provoked
      if(m.passive){
        // Patrol near base
        if(m.baseX!=null){
          if(m.x<m.baseX-40)m.facing=1;
          if(m.x>m.baseX+140)m.facing=-1;
          m.x+=m.facing*0.4;
        }
      }else{
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
  // Wanted-level system removed: military is now passive at Earth bases
  // and only becomes hostile when the player provokes them (see provokeMilitary()).
  if(alarmPulse>0)alarmPulse--;
}

// Called when the player attacks military — flips nearby units hostile.
function provokeMilitary(ax, ay){
  wantedLevel=1; // keeps existing aggressive AI paths active
  military.forEach(m=>{
    if(m.type==='bullet'||m.type==='boulder'||!m.alive) return;
    if(ax==null || dist(m.x,m.y,ax,ay) < 600) m.passive=false;
  });
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
  mi.screen='menu'; // 'menu', 'bridge', 'zoo', 'upgrades', 'starmap', 'arena', 'lab'
  mi.selectedItem=0;mi.dialogText='';mi.dialogTimer=0;
  mi.milkCD=0;mi.actionAnim=0;mi.npcTalkAnim=0;mi.npcSpeechBubble='';mi.npcSpeechTimer=0;
  mi.ambientParticles=[];mi._eCool=0;mi._selCool=0;
  // Walkable hub state (alien walks a corridor, doors lead to screens)
  mi.hub={x:600, vx:0, facing:1, walkT:0, prevDoor:-1, doorX:[], nearDoor:-1, width:1800};
  // Bridge-style space view state (big windows + random outside events)
  mi.spaceEvents=[];
  mi._eventCD=120+Math.random()*180;
  mi._nebulaPhase=Math.random()*1000;
  // Hub crew — varied NPC officers, scientists, engineers, bots (NO children)
  // Flatten all race skins into one pool, excluding the player's current skin so crew looks different.
  const playerSkin = (typeof getAlienSkin==='function') ? getAlienSkin() : null;
  const playerSkinId = playerSkin && playerSkin.id;
  const _allSkins=[];
  if(typeof ALIEN_RACES!=='undefined' && ALIEN_RACES.length){
    ALIEN_RACES.forEach(r=>{ (r.skins||[]).forEach(s=>{ if(s && s.id!==playerSkinId) _allSkins.push(s); }); });
  }
  mi.hubCrew=[];
  const crewRoster=[
    {role:'officer',   accent:'#c44', scale:1.05, label:'Officer'},
    {role:'scientist', accent:'#8cf', scale:1.00, label:'Scientist'},
    {role:'engineer',  accent:'#fa0', scale:0.95, label:'Engineer'},
    {role:'guard',     accent:'#aaa', scale:1.10, label:'Guard'},
    {role:'medic',     accent:'#fff', scale:0.98, label:'Medic'},
    {role:'bot',       accent:'#8fa', scale:0.85, label:'Maint-Bot'},
  ];
  // Shuffle the skin pool so each crew member gets a distinct alien species.
  for(let i=_allSkins.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[_allSkins[i],_allSkins[j]]=[_allSkins[j],_allSkins[i]];}
  for(let i=0;i<crewRoster.length;i++){
    const r=crewRoster[i];
    const crewSkin = _allSkins.length ? _allSkins[i%_allSkins.length] : playerSkin;
    mi.hubCrew.push({
      role: r.role,
      accent: r.accent,
      label: r.label,
      x:200+i*260, vx:0, facing:i%2===0?1:-1, walkT:Math.random()*10,
      skin: crewSkin,
      scale: r.scale,
      task: Math.random()<0.5?'walk':'work',
      taskT: 120+Math.random()*240,
      targetX: 200+Math.random()*1400,
      consoleI: i,
      sparkT: 0,
      bob: Math.random()*Math.PI*2,
    });
  }
  // Floating probe-drone that glides above the corridor
  mi.hubDrone = {
    x: 400, y: 140, vx: 0.6, baseY: 140, phase: Math.random()*10,
  };
  // Overhead service gantry with a cargo drone running along a rail
  mi.gantryDrone = {
    x: 200, vx: 0.8, cargoHue: 200 + Math.random()*80,
    blinkPhase: Math.random()*Math.PI*2,
  };
  // Data ticker running across the wall
  mi.tickerOffset = 0;
  mi.tickerText = ' // SYS-CORE 04:17  |  HULL INTEGRITY 98%  |  NAV-BEACON LOCKED  |  CARGO HOLD: SPECIMENS + LIVESTOCK  |  JUMP DRIVE: IDLE  |  OXYGEN-MIX NOMINAL  |  WARP-CORE 72%  |  COMMS: 3 NEW TRANSMISSIONS  |  LIFE SUPPORT: GREEN  |  AI-WATCH: OBELI ONLINE ';
  // Cable bundles hanging from ceiling (static once positioned)
  mi.hubCables=[];
  for(let i=0;i<12;i++){
    mi.hubCables.push({
      x: 80+i*150+Math.random()*40,
      len: 10+Math.random()*22,
      thick: 1+Math.random()*1.5,
      hue: 20+Math.random()*340,
      sag: 4+Math.random()*6,
    });
  }
  // Fixed consoles along the back wall (blinking screens + holograms)
  mi.hubConsoles=[];
  const conCount=6;
  for(let i=0;i<conCount;i++){
    mi.hubConsoles.push({x:150+i*(1800-300)/(conCount-1), seed:i*97.3, holo: i%2===0});
  }
  // Star map state
  mi.starmap={sel:0, surveyCD:{}};
  // Arena state
  mi.arena={active:false, mode:0, time:0, score:0, bestBronze:0, bestSilver:0, bestGold:0,
    ghosts:[], beamActive:false, beamY:0, resultTimer:0, announce:''};
  // Lab state
  mi.lab={station:0, specIndex:0, running:false, t:0, bar:0, barDir:1, sweetLo:0.4, sweetHi:0.6, outcome:'', outcomeT:0};
  // Zoo riot state
  mi.riot={active:false, escapees:[], defended:0, lost:0, spawnT:0, duration:0, trigger:'none'};
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
  // Grace period to prevent auto-reentry while still close to mothership
  mothership._exitCool=180;
  showMessage(tr('msg.returningToVoid'));
  document.getElementById('planet-name').textContent=tr('hud.deepSpace');
}

const MS_MENUS=[
  {id:'bridge',name:'COMMAND BRIDGE',icon:'\u2302',desc:'Talk to crew, missions, ship status',color:[50,150,255]},
  {id:'starmap',name:'STAR MAP',icon:'\u2735',desc:'Plot destinations, survey planets',color:[120,180,255]},
  {id:'comms',name:'COMMS CHANNEL',icon:'\u2637',desc:'Incoming transmissions from planets',color:[255,100,100]},
  {id:'lab',name:'SPECIMEN LAB',icon:'\u269B',desc:'Experiment on specimens for tech',color:[140,255,200]},
  {id:'arena',name:'TRAINING ARENA',icon:'\u2694',desc:'Abduction drills for XP and skins',color:[255,150,80]},
  {id:'zoo',name:'XENOBIOLOGY ZOO',icon:'\u25C8',desc:'Specimens, livestock, milking',color:[50,255,80]},
  {id:'upgrades',name:'UPGRADES',icon:'\u26A1',desc:'Upgrade beam, speed, paint jobs',color:[255,200,50]},
  {id:'stats',name:'SHIP LOG',icon:'\u2261',desc:'Stats, relations, crew levels',color:[150,200,150]},
];

// --- STARMAP ---
function updateStarmap(){
  const mi=mothershipInterior,sm=mi.starmap;
  const avail=planets;
  if(keys['a']||keys['arrowleft']){if(!mi._lrCool){mi._lrCool=12;sm.sel=(sm.sel-1+avail.length)%avail.length;}}
  else if(keys['d']||keys['arrowright']){if(!mi._lrCool){mi._lrCool=12;sm.sel=(sm.sel+1)%avail.length;}}
  else mi._lrCool=0;
  if(mi._lrCool>0)mi._lrCool--;
  if(keys['escape']){keys['escape']=false;mi.screen='menu';return;}
  if((keys['e']||keys[' '])&&!mi._eCool){
    mi._eCool=14;keys['e']=false;keys[' ']=false;
    const p=avail[sm.sel];
    if(unlockedPlanets.includes(p.id)){
      exitMothership();
      if(gameMode==='planet')leavePlanet();
      setTimeout(()=>{loadPlanet(p);},50);
    }else{
      mi.dialogText='Planet locked. Complete missions to unlock.';mi.dialogTimer=120;
    }
  }
  if(!keys['e']&&!keys[' ']&&mi._eCool>0)mi._eCool--;
}

function drawStarmap(){
  const mi=mothershipInterior,sm=mi.starmap,cw=canvas.width,ch=canvas.height,t=frameT;
  ctx.fillStyle='rgba(120,180,255,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
  // Star field
  for(let i=0;i<80;i++){const sx=(i*137.5+t*3)%cw,sy=(i*83.1+40)%ch;
    ctx.fillStyle=`rgba(180,200,255,${0.2+Math.sin(t*2+i)*0.15})`;ctx.fillRect(sx,sy,1,1);}
  // Planets arranged horizontally
  const n=planets.length,spacing=Math.min(130,(cw-120)/n);
  const startX=cw/2-((n-1)*spacing)/2,cy=ch*0.5;
  // Connection line
  ctx.strokeStyle='rgba(120,180,255,0.15)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(startX,cy);ctx.lineTo(startX+(n-1)*spacing,cy);ctx.stroke();
  planets.forEach((p,i)=>{
    const px=startX+i*spacing,sel=i===sm.sel,locked=!unlockedPlanets.includes(p.id);
    const prog=planetProgress[p.id];
    const r=22+(sel?6:0)+(sel?Math.sin(t*3)*2:0);
    // Planet body
    ctx.fillStyle=locked?'#334':p.color||'#8af';
    ctx.beginPath();ctx.arc(px,cy,r,0,Math.PI*2);ctx.fill();
    if(locked){ctx.fillStyle='rgba(0,0,0,0.4)';ctx.beginPath();ctx.arc(px,cy,r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#aaa';ctx.font='14px monospace';ctx.textAlign='center';ctx.fillText('\u{1F512}',px,cy+5);}
    if(sel){
      ctx.strokeStyle=`rgba(120,180,255,${0.6+Math.sin(t*4)*0.3})`;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(px,cy,r+8,0,Math.PI*2);ctx.stroke();
    }
    // Name
    ctx.fillStyle=sel?'#cdf':'rgba(180,200,230,0.5)';ctx.font=`${sel?'bold ':''}11px monospace`;ctx.textAlign='center';
    ctx.fillText((p.name||p.id).toUpperCase(),px,cy+r+18);
    // Progress
    if(prog){
      ctx.fillStyle='rgba(150,255,180,0.6)';ctx.font='9px monospace';
      const label=bossDefeated[p.id]?'COMPLETE':`Mission ${Math.min(prog.missionIndex,5)}/5`;
      ctx.fillText(label,px,cy+r+32);
    }
  });
  // Detail panel
  const p=planets[sm.sel];
  if(p){
    const prog=planetProgress[p.id]||{};
    const dx=cw/2-200,dy=ch-140,dw=400,dh=100;
    ctx.fillStyle='rgba(0,12,30,0.7)';roundRect(ctx,dx,dy,dw,dh,10);ctx.fill();
    ctx.strokeStyle='rgba(120,180,255,0.3)';roundRect(ctx,dx,dy,dw,dh,10);ctx.stroke();
    ctx.fillStyle='#cdf';ctx.font='bold 13px monospace';ctx.textAlign='left';
    ctx.fillText((p.name||p.id).toUpperCase(),dx+15,dy+22);
    ctx.fillStyle='rgba(180,200,230,0.6)';ctx.font='10px monospace';
    const lines=[
      unlockedPlanets.includes(p.id)?'Status: UNLOCKED':'Status: LOCKED',
      `Boss: ${bossDefeated[p.id]?'DEFEATED':'Active'}`,
      `Completion: ${(prog.completion||'none').toUpperCase()}`,
    ];
    lines.forEach((l,i)=>ctx.fillText(l,dx+15,dy+44+i*14));
    ctx.fillStyle=`rgba(120,220,255,${0.5+Math.sin(t*4)*0.3})`;ctx.font='bold 10px monospace';ctx.textAlign='right';
    ctx.fillText(unlockedPlanets.includes(p.id)?'[SPACE] Jump':'[LOCKED]',dx+dw-15,dy+dh-10);
  }
  ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='9px monospace';ctx.textAlign='center';
  ctx.fillText('A/D: Select planet  |  SPACE: Jump  |  ESC: Back',cw/2,ch-15);
}

// --- TRAINING ARENA ---
function updateArena(){
  const mi=mothershipInterior,a=mi.arena;
  if(keys['escape']){keys['escape']=false;if(a.active){a.active=false;a.resultTimer=0;}else{mi.screen='menu';}return;}
  if(!a.active){
    if(keys['a']||keys['arrowleft']){if(!mi._lrCool){mi._lrCool=12;a.mode=(a.mode-1+3)%3;}}
    else if(keys['d']||keys['arrowright']){if(!mi._lrCool){mi._lrCool=12;a.mode=(a.mode+1)%3;}}
    else mi._lrCool=0;
    if(mi._lrCool>0)mi._lrCool--;
    if((keys['e']||keys[' '])&&!mi._eCool){
      mi._eCool=14;keys['e']=false;keys[' ']=false;
      a.active=true;a.time=0;a.score=0;a.ghosts=[];a.beamY=120;a.beamActive=false;a.announce='GO!';a.resultTimer=90;
      // Spawn ghosts based on mode
      const count=a.mode===0?8:a.mode===1?14:20;
      for(let i=0;i<count;i++){
        a.ghosts.push({x:60+Math.random()*(canvas.width-120),y:canvas.height-80-Math.random()*30,
          vx:(Math.random()-0.5)*(0.6+a.mode*0.4),flee:0,caught:false,t:Math.random()*6});
      }
    }
    if(!keys['e']&&!keys[' ']&&mi._eCool>0)mi._eCool--;
    return;
  }
  // Active drill
  a.time++;
  if(a.resultTimer>0)a.resultTimer--;
  const duration=a.mode===0?1200:a.mode===1?1500:1800; // 20s/25s/30s @60fps
  // Player-controlled beam: A/D moves beam X (alien up top)
  a._beamX = a._beamX==null ? canvas.width/2 : a._beamX;
  if(keys['a']||keys['arrowleft']) a._beamX-=5;
  if(keys['d']||keys['arrowright']) a._beamX+=5;
  a._beamX=Math.max(30,Math.min(canvas.width-30,a._beamX));
  a.beamActive = !!(keys[' ']||keys['e']);
  // Ghost AI
  a.ghosts.forEach(g=>{
    if(g.caught)return;
    g.t+=0.08;
    const dx=a._beamX-g.x;
    if(Math.abs(dx)<200){g.flee=Math.min(1,g.flee+0.05);g.vx-=Math.sign(dx)*0.04;}
    else g.flee=Math.max(0,g.flee-0.02);
    g.x+=g.vx;g.vx*=0.95;
    if(g.x<30||g.x>canvas.width-30)g.vx*=-1;
    // Beam catch
    if(a.beamActive && Math.abs(g.x-a._beamX)<24 && g.y>canvas.height-110){
      g.caught=true;g.caughtT=30;a.score++;playSound('collect');
    }
  });
  // End
  if(a.time>=duration){
    a.active=false;a.resultTimer=180;
    const bronze=a.mode===0?4:a.mode===1?7:10;
    const silver=a.mode===0?6:a.mode===1?10:14;
    const gold=a.mode===0?8:a.mode===1?13:18;
    let reward=0,medal='';
    if(a.score>=gold){reward=30;medal='GOLD';}
    else if(a.score>=silver){reward=18;medal='SILVER';}
    else if(a.score>=bronze){reward=10;medal='BRONZE';}
    if(reward>0){score+=reward;document.getElementById('score').textContent=score;}
    a.announce=medal?`${medal}! +${reward} pts (${a.score} caught)`:`Try again (${a.score} caught)`;
  }
}

function drawArena(){
  const mi=mothershipInterior,a=mi.arena,cw=canvas.width,ch=canvas.height,t=frameT;
  ctx.fillStyle='rgba(255,150,80,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
  ctx.fillStyle='rgba(255,150,80,0.7)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('TRAINING ARENA',cw/2,28);
  // Arena floor
  const floorY=ch-50;
  const fg=ctx.createLinearGradient(0,floorY,0,ch);fg.addColorStop(0,'#2a1808');fg.addColorStop(1,'#0a0403');
  ctx.fillStyle=fg;ctx.fillRect(0,floorY,cw,ch-floorY);
  // Grid
  ctx.strokeStyle='rgba(255,150,80,0.1)';ctx.lineWidth=1;
  for(let gx=0;gx<cw;gx+=40){ctx.beginPath();ctx.moveTo(gx,floorY);ctx.lineTo(gx,ch);ctx.stroke();}
  // Ceiling rail
  ctx.fillStyle='#1a0a03';ctx.fillRect(0,55,cw,20);

  if(!a.active && !a.resultTimer){
    // Mode select
    ctx.fillStyle='rgba(255,200,150,0.85)';ctx.font='bold 14px monospace';ctx.textAlign='center';
    ctx.fillText('Select drill mode',cw/2,ch*0.28);
    const modes=['EASY - 20s / 8 targets','MEDIUM - 25s / 14 targets','HARD - 30s / 20 targets'];
    modes.forEach((m,i)=>{
      const y=ch*0.38+i*38,sel=a.mode===i;
      ctx.fillStyle=sel?'rgba(255,180,100,0.85)':'rgba(255,200,150,0.3)';
      ctx.font=`${sel?'bold ':''}13px monospace`;ctx.fillText((sel?'\u25B6 ':'  ')+m,cw/2,y);
    });
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='10px monospace';
    ctx.fillText('A/D: Mode  |  SPACE: Start drill  |  ESC: Back',cw/2,ch-20);
    return;
  }
  // Active or result
  // Ghosts (stylized humans)
  a.ghosts.forEach(g=>{
    if(g.caught){if(g.caughtT>0){g.caughtT--;
      ctx.fillStyle=`rgba(255,220,100,${g.caughtT/30})`;
      ctx.beginPath();ctx.arc(g.x,g.y-20,10+(30-g.caughtT)*0.6,0,Math.PI*2);ctx.fill();}return;}
    const panic=g.flee>0.4;
    ctx.fillStyle=panic?'#f55':'#69c';
    ctx.fillRect(g.x-4,g.y-16,8,14);
    ctx.fillStyle='#d9a';ctx.beginPath();ctx.arc(g.x,g.y-20,4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=panic?'#f55':'#69c';ctx.lineWidth=2;
    const sw=Math.sin(g.t)*3;
    ctx.beginPath();ctx.moveTo(g.x-2,g.y-2);ctx.lineTo(g.x-3+sw,g.y+6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(g.x+2,g.y-2);ctx.lineTo(g.x+3-sw,g.y+6);ctx.stroke();
  });
  // Alien + beam
  if(a._beamX!=null){
    const ax=a._beamX,ay=75;
    ctx.fillStyle='#8cf';ctx.fillRect(ax-8,ay-20,16,22);
    ctx.fillStyle='#9df';ctx.beginPath();ctx.ellipse(ax,ay-26,10,11,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(ax-3,ay-27,1.5,3,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+3,ay-27,1.5,3,0,0,Math.PI*2);ctx.fill();
    if(a.beamActive){
      const bg=ctx.createLinearGradient(ax,ay,ax,floorY);
      bg.addColorStop(0,'rgba(180,255,220,0.6)');bg.addColorStop(1,'rgba(180,255,220,0.1)');
      ctx.fillStyle=bg;
      ctx.beginPath();ctx.moveTo(ax-6,ay+4);ctx.lineTo(ax-22,floorY);ctx.lineTo(ax+22,floorY);ctx.lineTo(ax+6,ay+4);ctx.closePath();ctx.fill();
    }
  }
  // HUD
  const duration=a.mode===0?1200:a.mode===1?1500:1800;
  const timeLeft=Math.max(0,Math.ceil((duration-a.time)/60));
  ctx.fillStyle='rgba(255,200,150,0.9)';ctx.font='bold 14px monospace';ctx.textAlign='center';
  ctx.fillText(`${timeLeft}s   |   Caught: ${a.score}`,cw/2,50);
  // Announce
  if(a.resultTimer>0&&a.announce){
    ctx.fillStyle=`rgba(255,220,120,${Math.min(1,a.resultTimer/30)})`;
    ctx.font='bold 22px monospace';ctx.textAlign='center';
    ctx.fillText(a.announce,cw/2,ch*0.35);
  }
  ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='9px monospace';ctx.textAlign='center';
  ctx.fillText('A/D: Move  |  SPACE: Beam  |  ESC: Abort',cw/2,ch-15);
}

// --- SPECIMEN LAB ---
function updateLab(){
  const mi=mothershipInterior,lab=mi.lab;
  if(keys['escape']){keys['escape']=false;if(lab.running){lab.running=false;}else{mi.screen='menu';}return;}
  const specs=mothership.specimens||[];
  if(specs.length===0){
    if((keys['e']||keys[' '])&&!mi._eCool){mi._eCool=10;keys['e']=false;keys[' ']=false;}
    if(!keys['e']&&!keys[' ']&&mi._eCool>0)mi._eCool--;
    return;
  }
  if(!lab.running){
    if(keys['a']||keys['arrowleft']){if(!mi._lrCool){mi._lrCool=12;lab.specIndex=(lab.specIndex-1+specs.length)%specs.length;}}
    else if(keys['d']||keys['arrowright']){if(!mi._lrCool){mi._lrCool=12;lab.specIndex=(lab.specIndex+1)%specs.length;}}
    else mi._lrCool=0;
    if(mi._lrCool>0)mi._lrCool--;
    if((keys['e']||keys[' '])&&!mi._eCool){
      mi._eCool=14;keys['e']=false;keys[' ']=false;
      lab.running=true;lab.t=0;lab.bar=0;lab.barDir=1;
      const w=0.12+Math.random()*0.08;
      const c=0.35+Math.random()*0.3;
      lab.sweetLo=c-w/2;lab.sweetHi=c+w/2;
      lab.outcome='';lab.outcomeT=0;
    }
    if(!keys['e']&&!keys[' ']&&mi._eCool>0)mi._eCool--;
    return;
  }
  // Running: moving bar, SPACE to lock
  lab.t++;
  lab.bar += lab.barDir*0.018;
  if(lab.bar>=1){lab.bar=1;lab.barDir=-1;}
  if(lab.bar<=0){lab.bar=0;lab.barDir=1;}
  if((keys['e']||keys[' '])&&!mi._eCool){
    mi._eCool=20;keys['e']=false;keys[' ']=false;
    const hit = lab.bar>=lab.sweetLo && lab.bar<=lab.sweetHi;
    if(hit){
      const gain=5+Math.floor(Math.random()*6);
      score+=gain;document.getElementById('score').textContent=score;
      lab.outcome=`Breakthrough! +${gain} pts`;
      playSound('collect');
    }else{
      lab.outcome='Specimen survives, no insight.';
    }
    lab.outcomeT=150;lab.running=false;
  }
  if(!keys['e']&&!keys[' ']&&mi._eCool>0)mi._eCool--;
  if(lab.outcomeT>0)lab.outcomeT--;
}

function drawLab(){
  const mi=mothershipInterior,lab=mi.lab,cw=canvas.width,ch=canvas.height,t=frameT;
  ctx.fillStyle='rgba(140,255,200,0.3)';ctx.font='10px monospace';ctx.textAlign='left';ctx.fillText('\u25C0 ESC Back',15,25);
  ctx.fillStyle='rgba(140,255,200,0.7)';ctx.font='18px monospace';ctx.textAlign='center';ctx.fillText('SPECIMEN LAB',cw/2,28);
  const specs=mothership.specimens||[];
  if(specs.length===0){
    ctx.fillStyle='rgba(140,255,200,0.5)';ctx.font='12px monospace';ctx.textAlign='center';
    ctx.fillText('No specimens collected yet. Abduct something first!',cw/2,ch/2);
    return;
  }
  const sp=specs[lab.specIndex%specs.length];
  // Specimen capsule in center
  const px=cw/2,py=ch*0.4;
  // Glass tube
  const tg=ctx.createLinearGradient(px-40,py-80,px+40,py+80);
  tg.addColorStop(0,'rgba(140,255,200,0.2)');tg.addColorStop(0.5,'rgba(140,255,200,0.05)');tg.addColorStop(1,'rgba(140,255,200,0.2)');
  ctx.fillStyle=tg;roundRect(ctx,px-45,py-85,90,170,18);ctx.fill();
  ctx.strokeStyle='rgba(140,255,200,0.4)';ctx.lineWidth=2;roundRect(ctx,px-45,py-85,90,170,18);ctx.stroke();
  // Bubbles
  for(let i=0;i<5;i++){
    const by=py+80-((t*40+i*33)%170);
    ctx.fillStyle='rgba(200,255,230,0.4)';
    ctx.beginPath();ctx.arc(px-20+i*10,by,2+Math.sin(t+i)*1,0,Math.PI*2);ctx.fill();
  }
  // Specimen (simple body)
  const bob=Math.sin(t*1.5)*3;
  ctx.fillStyle=sp.color||'#9ac';
  ctx.fillRect(px-8,py-10+bob,16,24);
  ctx.fillStyle=sp.skinColor||sp.color||'#d9a';
  ctx.beginPath();ctx.arc(px,py-16+bob,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';
  ctx.beginPath();ctx.arc(px-2.5,py-16+bob,1.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(px+2.5,py-16+bob,1.2,0,Math.PI*2);ctx.fill();
  // Label
  ctx.fillStyle='rgba(200,255,230,0.9)';ctx.font='bold 12px monospace';ctx.textAlign='center';
  ctx.fillText((sp.label||sp.type||'Specimen').toUpperCase(),px,py+110);
  ctx.fillStyle='rgba(140,220,180,0.5)';ctx.font='10px monospace';
  ctx.fillText(`${lab.specIndex+1} / ${specs.length}`,px,py+126);

  if(!lab.running){
    ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText('A/D: Choose specimen  |  SPACE: Begin experiment  |  ESC: Back',cw/2,ch-18);
    if(lab.outcomeT>0&&lab.outcome){
      ctx.fillStyle=`rgba(160,255,200,${Math.min(1,lab.outcomeT/40)})`;
      ctx.font='bold 14px monospace';ctx.fillText(lab.outcome,cw/2,ch*0.82);
    }
    return;
  }
  // Running: sweet-spot bar
  const bw=Math.min(400,cw*0.6),bh=24,bx=cw/2-bw/2,by=ch-110;
  ctx.fillStyle='rgba(0,20,15,0.7)';roundRect(ctx,bx,by,bw,bh,6);ctx.fill();
  // Sweet zone
  ctx.fillStyle='rgba(140,255,200,0.4)';
  ctx.fillRect(bx+bw*lab.sweetLo,by,bw*(lab.sweetHi-lab.sweetLo),bh);
  // Marker
  const mxp=bx+bw*lab.bar;
  ctx.fillStyle='#fff';ctx.fillRect(mxp-2,by-4,4,bh+8);
  ctx.strokeStyle='rgba(140,255,200,0.6)';roundRect(ctx,bx,by,bw,bh,6);ctx.stroke();
  ctx.fillStyle='rgba(200,255,230,0.8)';ctx.font='11px monospace';ctx.textAlign='center';
  ctx.fillText('Hit the sweet spot — SPACE to lock',cw/2,by-10);
  ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='10px monospace';
  ctx.fillText('ESC: Cancel',cw/2,ch-18);
}

// --- ZOO RIOT ---
function maybeTriggerRiot(){
  const mi=mothershipInterior;
  if(!mi.riot)return;
  if(mi.riot.active)return;
  const total=(mi.zooCreatures||[]).length+(mi.milkCows||[]).length;
  if(total>=3 && Math.random()<0.25){
    mi.riot.active=true;
    mi.riot.escapees=[];
    mi.riot.defended=0;mi.riot.lost=0;mi.riot.spawnT=60;mi.riot.duration=900;
    mi.riot.trigger='containment breach';
    mi.dialogText='\u26A0 CONTAINMENT BREACH! Re-stun escapees with SPACE!';mi.dialogTimer=180;
  }
}
function updateZooRiot(){
  const mi=mothershipInterior,r=mi.riot;
  r.duration--;
  if(r.spawnT>0)r.spawnT--;
  else if(r.escapees.length<4){
    r.spawnT=90+Math.random()*60;
    const cw=canvas.width;
    r.escapees.push({x:Math.random()<0.5?-20:cw+20,y:canvas.height-55,vx:(Math.random()<0.5?1:-1)*(0.8+Math.random()*0.6),stun:0});
  }
  r.escapees.forEach(e=>{
    if(e.stun>0){e.stun--;return;}
    e.x+=e.vx;
    if(e.x<-40){e.vx*=-1;e.x=-40;}
    if(e.x>canvas.width+40){e.vx*=-1;e.x=canvas.width+40;}
    // Lost if lingers too long in walk mode? Simpler: if x at edge beyond 300 frames, count as lost
    e.age=(e.age||0)+1;
    if(e.age>720){e.lost=true;}
  });
  // Stun with SPACE (only in walk mode where alien is present)
  if(mi.zooWalkMode&&mi.zooAlien&&(keys['q'])&&!mi._stunCool){
    mi._stunCool=20;
    const za=mi.zooAlien;
    r.escapees.forEach(e=>{
      if(e.stun>0||e.lost||e.defended)return;
      if(Math.abs(e.x-za.x)<80 && Math.abs(e.y-za.y)<60){
        e.stun=120;e.defended=true;r.defended++;
        score+=2;document.getElementById('score').textContent=score;
      }
    });
  }
  if(!keys['q']&&mi._stunCool>0)mi._stunCool--;
  // Cleanup lost
  r.escapees=r.escapees.filter(e=>{if(e.lost){r.lost++;return false;}return true;});
  if(r.duration<=0 || (r.defended>=3 && r.escapees.every(e=>e.defended))){
    r.active=false;
    mi.dialogText=r.lost>0?`Breach contained. Lost ${r.lost}, defended ${r.defended}.`:`All escapees recaptured! +${r.defended*2} pts`;
    mi.dialogTimer=180;
  }
}
function drawZooRiot(){
  const mi=mothershipInterior,r=mi.riot;
  if(!r||!r.active)return;
  const cw=canvas.width,t=frameT;
  // Red alert strobe
  ctx.fillStyle=`rgba(255,40,40,${0.08+Math.sin(t*6)*0.06})`;ctx.fillRect(0,0,cw,canvas.height);
  ctx.fillStyle=`rgba(255,60,60,${0.7+Math.sin(t*5)*0.3})`;ctx.font='bold 12px monospace';ctx.textAlign='center';
  ctx.fillText(`\u26A0 BREACH  ${Math.ceil(r.duration/60)}s  |  Caught ${r.defended}  |  Lost ${r.lost}`,cw/2,72);
  // Escapees
  r.escapees.forEach(e=>{
    if(e.defended){ctx.fillStyle='rgba(100,200,255,0.6)';ctx.fillRect(e.x-5,e.y-14,10,14);return;}
    ctx.fillStyle=e.stun>0?'#9cf':'#f66';
    ctx.fillRect(e.x-4,e.y-14,8,14);
    ctx.fillStyle='#d9a';ctx.beginPath();ctx.arc(e.x,e.y-18,4,0,Math.PI*2);ctx.fill();
    if(e.stun>0){
      ctx.fillStyle=`rgba(140,220,255,${0.5+Math.sin(t*10)*0.3})`;
      ctx.beginPath();ctx.arc(e.x,e.y-24,3,0,Math.PI*2);ctx.fill();
    }
  });
}

// ============================================================
// --- HUB CREW MEMBER RENDERING (varied roles, no children) ---
// ============================================================
function drawHubCrewMember(c, cx, floorY, t){
  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, floorY+2, 14, 3, 0, 0, Math.PI*2); ctx.fill();

  // Bot has a completely different body — not an alien
  if(c.role==='bot'){
    const bobY = floorY + Math.sin(c.bob)*1.2;
    // Treads
    ctx.fillStyle='#222';
    ctx.fillRect(cx-11, bobY-6, 22, 6);
    // Wheel segments
    ctx.fillStyle='#555';
    for(let wi=0;wi<4;wi++){
      ctx.fillRect(cx-10+wi*6, bobY-5, 4, 4);
    }
    // Chassis
    ctx.fillStyle='#7a8a95';
    ctx.fillRect(cx-10, bobY-24, 20, 18);
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
    ctx.strokeRect(cx-10, bobY-24, 20, 18);
    // Hazard stripe
    ctx.fillStyle='#f93';
    ctx.fillRect(cx-10, bobY-12, 20, 3);
    ctx.fillStyle='#222';
    for(let hi=0;hi<5;hi++){
      ctx.fillRect(cx-10+hi*5, bobY-12, 2.5, 3);
    }
    // Head / sensor cluster
    ctx.fillStyle='#334';
    ctx.fillRect(cx-6, bobY-32, 12, 8);
    // Eye
    const eyeLit = (Math.sin(t*4+c.bob)+1)*0.5;
    ctx.fillStyle=`rgba(255,220,80,${0.7+eyeLit*0.3})`;
    ctx.beginPath(); ctx.arc(cx, bobY-28, 2.5, 0, Math.PI*2); ctx.fill();
    // Arm with welding torch
    const armAng = Math.sin(c.bob*2)*0.3 + 0.4;
    const armX = cx + c.facing*(8);
    const tipX = armX + c.facing*Math.cos(armAng)*10;
    const tipY = bobY-16 + Math.sin(armAng)*6;
    ctx.strokeStyle='#445'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(armX, bobY-16); ctx.lineTo(tipX, tipY); ctx.stroke();
    // Torch flame (occasional)
    if(c.sparkT>0){
      const fg=ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 8);
      fg.addColorStop(0,'rgba(180,220,255,0.9)');
      fg.addColorStop(0.5,'rgba(100,150,255,0.5)');
      fg.addColorStop(1,'transparent');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(tipX, tipY, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(tipX, tipY, 1.6, 0, Math.PI*2); ctx.fill();
    }
    // Antenna
    ctx.strokeStyle='#333'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx+4, bobY-32); ctx.lineTo(cx+6, bobY-40); ctx.stroke();
    ctx.fillStyle='#f33';
    ctx.beginPath(); ctx.arc(cx+6, bobY-40, 1.5, 0, Math.PI*2); ctx.fill();
    return;
  }

  // Alien crew — reuse the real renderer if available
  if(c.skin && typeof drawAlienPreview==='function'){
    drawAlienPreview(cx, floorY, c.scale, c.skin, c.facing, c.walkT);
  }else{
    ctx.fillStyle='#6ab58e';
    ctx.fillRect(cx-6, floorY-22, 12, 18);
    ctx.beginPath(); ctx.arc(cx, floorY-27, 7, 0, Math.PI*2); ctx.fill();
  }

  // Role-specific accessories painted on TOP of the base alien
  const bodyTop = floorY - 26*c.scale;
  const headY = floorY - 34*c.scale;
  const chestY = floorY - 20*c.scale;
  const handY = floorY - 10*c.scale;
  const handX = cx + c.facing*9*c.scale;

  if(c.role==='officer'){
    // Peaked cap
    ctx.fillStyle='#1a1a22';
    ctx.fillRect(cx-7, headY-5, 14, 4);
    ctx.fillRect(cx-9+c.facing*2, headY-1, 6, 2); // visor
    // Red insignia
    ctx.fillStyle=c.accent;
    ctx.fillRect(cx-2, headY-4, 4, 2);
    // Shoulder epaulettes
    ctx.fillStyle='#dca';
    ctx.fillRect(cx-6, chestY, 3, 2);
    ctx.fillRect(cx+3, chestY, 3, 2);
    // Sash
    ctx.strokeStyle=c.accent; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(cx-5, chestY); ctx.lineTo(cx+5, chestY+8); ctx.stroke();
  } else if(c.role==='scientist'){
    // Lab coat flap
    ctx.fillStyle='#e8f0ff';
    ctx.fillRect(cx-7, chestY, 14, 14);
    ctx.strokeStyle='rgba(100,120,150,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx, chestY); ctx.lineTo(cx, chestY+14); ctx.stroke();
    // Glasses
    ctx.strokeStyle='#222'; ctx.lineWidth=1;
    ctx.strokeRect(cx-5, headY-1, 4, 3);
    ctx.strokeRect(cx+1, headY-1, 4, 3);
    // Clipboard in hand
    ctx.fillStyle='#c9b080';
    ctx.fillRect(handX-3, handY-4, 6, 8);
    ctx.fillStyle='#fff';
    ctx.fillRect(handX-2, handY-3, 4, 5);
    ctx.strokeStyle='#888'; ctx.lineWidth=0.5;
    for(let li=0;li<3;li++){ ctx.beginPath(); ctx.moveTo(handX-2, handY-2+li*1.5); ctx.lineTo(handX+2, handY-2+li*1.5); ctx.stroke(); }
  } else if(c.role==='engineer'){
    // Hard hat
    ctx.fillStyle=c.accent;
    ctx.fillRect(cx-7, headY-4, 14, 5);
    ctx.fillStyle='#d80';
    ctx.fillRect(cx-7, headY+1, 14, 1);
    // Tool belt
    ctx.fillStyle='#6a4020';
    ctx.fillRect(cx-7, chestY+8, 14, 3);
    ctx.fillStyle='#aaa';
    ctx.fillRect(cx-5, chestY+8, 2, 3); // wrench
    ctx.fillRect(cx+3, chestY+8, 2, 3); // screwdriver
    // Wrench in hand
    ctx.strokeStyle='#999'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(handX, handY-4); ctx.lineTo(handX, handY+4); ctx.stroke();
    ctx.fillStyle='#bbb';
    ctx.fillRect(handX-2, handY-6, 4, 3);
  } else if(c.role==='guard'){
    // Helmet
    ctx.fillStyle='#2a2a32';
    ctx.fillRect(cx-8, headY-4, 16, 6);
    // Visor (blue tint)
    ctx.fillStyle='rgba(80,180,255,0.75)';
    ctx.fillRect(cx-6, headY-1, 12, 3);
    // Armor plates
    ctx.fillStyle='#4a5058';
    ctx.fillRect(cx-8, chestY, 16, 10);
    ctx.strokeStyle='#222'; ctx.lineWidth=0.8;
    ctx.strokeRect(cx-8, chestY, 16, 10);
    ctx.beginPath(); ctx.moveTo(cx, chestY); ctx.lineTo(cx, chestY+10); ctx.stroke();
    // Rifle at hip
    ctx.fillStyle='#333';
    ctx.fillRect(cx + c.facing*4, chestY+6, c.facing*12, 3);
    ctx.fillStyle='#666';
    ctx.fillRect(cx + c.facing*14, chestY+7, c.facing*3, 1);
  } else if(c.role==='medic'){
    // Cap with red cross
    ctx.fillStyle='#fff';
    ctx.fillRect(cx-6, headY-4, 12, 4);
    ctx.fillStyle='#e33';
    ctx.fillRect(cx-1, headY-4, 2, 4);
    ctx.fillRect(cx-3, headY-3, 6, 2);
    // White coat
    ctx.fillStyle='rgba(240,250,255,0.85)';
    ctx.fillRect(cx-7, chestY, 14, 12);
    ctx.fillStyle='#e33';
    ctx.fillRect(cx-1, chestY+2, 2, 4);
    ctx.fillRect(cx-3, chestY+3, 6, 2);
    // Medkit
    ctx.fillStyle='#fff';
    ctx.fillRect(handX-3, handY-3, 6, 5);
    ctx.fillStyle='#e33';
    ctx.fillRect(handX-1, handY-2, 2, 3);
    ctx.fillRect(handX-2, handY-1, 4, 1);
  }

  // Subtle floating label when walking (optional, small)
  if(c.task==='walk' && Math.abs(c.vx)>0.1){
    ctx.fillStyle='rgba(180,220,255,0.35)';
    ctx.font='8px monospace'; ctx.textAlign='center';
    ctx.fillText(c.label, cx, headY-10);
  }
}

// ============================================================
// --- PYRAMID INTERIOR (Khet tomb walk-in) ---
// ============================================================
function initPyramidPuzzle(){
  const pi=pyramidInterior;
  const pz=pi.puzzle;
  // Place 4 plates evenly across the middle of the chamber
  pz.plates=[];
  const startX=420, spacing=200;
  // Pick 4 distinct glyphs (shuffle copy of PYR_PLATE_DEFS)
  const pool=PYR_PLATE_DEFS.slice();
  for(let i=pool.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]];}
  for(let i=0;i<4;i++){
    pz.plates.push({x:startX+i*spacing, glyph:pool[i].glyph, color:pool[i].color, name:pool[i].name, litT:0});
  }
  // Target sequence — a random permutation of indices 0..3
  pz.targetSeq=[0,1,2,3];
  for(let i=pz.targetSeq.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [pz.targetSeq[i],pz.targetSeq[j]]=[pz.targetSeq[j],pz.targetSeq[i]];}
  pz.progress=0;
  pz.solved=false;
  pz.rewardGiven=false;
  pz.solveAnim=0;
  pz.hintT=0;
  pz.lastPlateIdx=-1;
  pz.revealT=0;
}

function updatePyramidInterior(){
  const pi=pyramidInterior;
  const a=pi.alien;
  const ch=canvas.height;
  const floorY=ch-70;
  // Movement
  if(keys['a']||keys['arrowleft']){a.vx-=0.5;a.facing=-1;}
  if(keys['d']||keys['arrowright']){a.vx+=0.5;a.facing=1;}
  if(keys[' ']&&a.onGround){a.vy=-7;a.onGround=false;}
  a.vy+=GRAVITY*0.6;
  a.vx*=0.85;
  a.x+=a.vx; a.y+=a.vy;
  // Floor (canvas-relative, not world GROUND_LEVEL)
  if(a.y>=floorY){a.y=floorY;a.vy=0;a.onGround=true;}
  // Walk anim
  if(Math.abs(a.vx)>0.3&&a.onGround) a.walkT+=0.15;
  // Bounds
  if(a.x<40) a.x=40;
  if(a.x>pi.worldW-40) a.x=pi.worldW-40;
  // Exit cooldown
  if(pi.enterCD>0) pi.enterCD--;

  // --- PUZZLE ---
  const pz=pi.puzzle;
  // Tick lit timers
  pz.plates.forEach(pl=>{ if(pl.litT>0) pl.litT--; });
  if(pz.hintT>0) pz.hintT--;
  if(pz.solveAnim>0) pz.solveAnim--;
  if(pz.solved && pz.revealT<120) pz.revealT++;
  // Detect stepping on a plate (alien feet at floorY, near plate x)
  if(!pz.solved && a.onGround){
    let steppingIdx=-1;
    for(let i=0;i<pz.plates.length;i++){
      const pl=pz.plates[i];
      if(Math.abs(a.x-pl.x)<28){ steppingIdx=i; break; }
    }
    if(steppingIdx>=0 && steppingIdx!==pz.lastPlateIdx){
      // Newly stepped onto a plate
      const expected=pz.targetSeq[pz.progress];
      pz.plates[steppingIdx].litT=40;
      if(steppingIdx===expected){
        pz.progress++;
        if(pz.progress>=pz.targetSeq.length){
          pz.solved=true;
          pz.solveAnim=200;
          showMessage(pi.theme==='cave' ? 'The chest unlocks! Deep-sea treasure revealed.' : 'The tomb opens! Ancient treasure revealed.');
        }
      } else {
        // Wrong — reset progress and flash red hint
        pz.progress=0;
        pz.hintT=40;
      }
    }
    pz.lastPlateIdx=steppingIdx;
  }
  // Reward: approach opened sarcophagus with E
  if(pz.solved && !pz.rewardGiven){
    const sarX=pi.worldW-230; // sarcophagus center x (matches drawPyramidInterior)
    if(Math.abs(a.x-sarX)<60 && (keys['e']||keys['enter'])){
      keys['e']=false; keys['enter']=false;
      pz.rewardGiven=true;
      score=(typeof score==='number'?score:0)+50;
      try{ document.getElementById('score').textContent=score; }catch(e){}
      showMessage(pi.theme==='cave' ? '+50 pearls from the deep chest!' : '+50 ancient credits from the tomb!');
    }
  }

  // Exit: ESC or walk back through the doorway (near x<100 pressing E)
  const nearExit=a.x<100;
  if(pi.enterCD<=0 && (keys['escape'] || (nearExit && (keys['e']||keys['enter'])))){
    keys['escape']=false; keys['e']=false; keys['enter']=false;
    pyramidInteriorMode=false;
    alien.x=pi.exitX;
    if(pi.theme==='cave' && pi.exitY) alien.y=pi.exitY;
    alien.vx=0; alien.vy=0;
    if(pi.theme==='cave') showMessage('You drift back into the ocean.');
    else showMessage('You step back into the desert sun.');
  }
}

function drawPyramidInterior(){
  const pi=pyramidInterior;
  const a=pi.alien;
  const cw=canvas.width, ch=canvas.height;
  const t=frameT;
  // Camera
  const camX=Math.max(0, Math.min(pi.worldW-cw, a.x-cw/2));
  ctx.clearRect(0,0,cw,ch);
  const isCave = pi.theme==='cave';
  // Background — tomb stone vs deep cave water
  const bg=ctx.createLinearGradient(0,0,0,ch);
  if(isCave){
    bg.addColorStop(0,'#041018');
    bg.addColorStop(0.5,'#062030');
    bg.addColorStop(1,'#020810');
  } else {
    bg.addColorStop(0,'#1a0f06');
    bg.addColorStop(0.6,'#2a1808');
    bg.addColorStop(1,'#0a0502');
  }
  ctx.fillStyle=bg; ctx.fillRect(0,0,cw,ch);

  ctx.save();
  ctx.translate(-camX, 0);

  // Floor (canvas-relative — independent of world GROUND_LEVEL)
  const floorTop=ch-70;
  if(isCave){
    // Wet cave floor — dark rock with bioluminescent puddles
    ctx.fillStyle='#0a1418';
    ctx.fillRect(0, floorTop, pi.worldW, ch-floorTop);
    // Rocky bumps
    ctx.fillStyle='#142028';
    for(let bx=0; bx<pi.worldW; bx+=70){
      const bh=6+((bx*7)%10);
      ctx.beginPath();
      ctx.ellipse(bx+(Math.sin(bx)*12), floorTop+bh/2, 38, bh, 0, 0, Math.PI*2);
      ctx.fill();
    }
    // Glowing puddle highlights
    for(let px=60; px<pi.worldW; px+=180){
      const pulse=0.4+Math.sin(t*1.5+px)*0.3;
      ctx.fillStyle=`rgba(80,200,255,${0.15*pulse})`;
      ctx.beginPath();
      ctx.ellipse(px, floorTop+8, 30, 4, 0, 0, Math.PI*2); ctx.fill();
    }
  } else {
    ctx.fillStyle='#3a2614';
    ctx.fillRect(0, floorTop, pi.worldW, ch-floorTop);
    ctx.strokeStyle='rgba(20,10,4,0.6)'; ctx.lineWidth=1;
    for(let x=0;x<pi.worldW;x+=48){
      ctx.beginPath(); ctx.moveTo(x,floorTop); ctx.lineTo(x,ch); ctx.stroke();
    }
    for(let y=floorTop+24;y<ch;y+=24){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(pi.worldW,y); ctx.stroke();
    }
  }

  // Ceiling
  const ceilH=80;
  if(isCave){
    // Irregular rock ceiling with stalactites
    ctx.fillStyle='#06101a';
    ctx.fillRect(0,0,pi.worldW,ceilH);
    ctx.fillStyle='#0c1824';
    ctx.beginPath();
    ctx.moveTo(0,ceilH);
    for(let sx=0; sx<=pi.worldW; sx+=40){
      const sh=ceilH + 12 + Math.sin(sx*0.07)*8 + ((sx*13)%14);
      ctx.lineTo(sx, sh);
    }
    ctx.lineTo(pi.worldW, ceilH);
    ctx.closePath();
    ctx.fill();
    // Stalactite teeth
    ctx.fillStyle='#050b12';
    for(let tx=30; tx<pi.worldW; tx+=55){
      const th=18+((tx*11)%22);
      ctx.beginPath();
      ctx.moveTo(tx-6, ceilH);
      ctx.lineTo(tx+6, ceilH);
      ctx.lineTo(tx, ceilH+th);
      ctx.closePath(); ctx.fill();
    }
  } else {
    ctx.fillStyle='#1a0e06';
    ctx.fillRect(0,0,pi.worldW,ceilH);
    ctx.fillStyle='#2a1808';
    for(let step=0;step<3;step++){
      const stepY=ceilH+step*14;
      const indent=step*30;
      ctx.fillRect(indent, stepY, pi.worldW-2*indent, 14);
    }
  }

  // Wall band
  if(isCave){
    // Kelp/barnacle decoration strip
    ctx.fillStyle='rgba(40,100,120,0.18)';
    ctx.fillRect(0, ceilH+50, pi.worldW, 50);
    ctx.strokeStyle='rgba(60,180,220,0.4)'; ctx.lineWidth=1;
    for(let gx=40; gx<pi.worldW; gx+=60){
      const sway=Math.sin(t*1.2+gx*0.05)*3;
      ctx.beginPath(); ctx.moveTo(gx, ceilH+95);
      ctx.quadraticCurveTo(gx+sway, ceilH+75, gx+sway*1.3, ceilH+55);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle='rgba(200,160,80,0.12)';
    ctx.fillRect(0, ceilH+50, pi.worldW, 40);
    ctx.fillStyle='rgba(200,160,80,0.5)';
    ctx.font='bold 18px serif'; ctx.textAlign='center';
    const glyphs=['\u2600','\u25B2','\u2625','\u2604','\u26B0','\u2698','\u2694','\u2618'];
    for(let gx=40; gx<pi.worldW; gx+=80){
      ctx.fillText(glyphs[Math.floor(gx/80)%glyphs.length], gx, ceilH+78);
    }
  }

  // Pillars / Crystal clusters
  for(let px=200; px<pi.worldW-100; px+=360){
    if(isCave){
      // Giant crystal cluster
      const crystalCols=['#4fd0ff','#9f7cff','#5affc8','#ff9fe0'];
      const col=crystalCols[(px/360|0)%crystalCols.length];
      const pulse=0.6+Math.sin(t*1.5+px)*0.3;
      const cr=parseInt(col.slice(1,3),16), cgg=parseInt(col.slice(3,5),16), cbb=parseInt(col.slice(5,7),16);
      // Glow aura
      const aura=ctx.createRadialGradient(px, ceilH+200, 4, px, ceilH+200, 160);
      aura.addColorStop(0, `rgba(${cr},${cgg},${cbb},${0.35*pulse})`);
      aura.addColorStop(1,'transparent');
      ctx.fillStyle=aura;
      ctx.beginPath(); ctx.arc(px, ceilH+200, 160, 0, Math.PI*2); ctx.fill();
      // Crystal shards growing up from floor
      ctx.fillStyle=col;
      for(let k=0;k<5;k++){
        const kx=px-30+k*15;
        const kh=40+((k*17)%60);
        ctx.beginPath();
        ctx.moveTo(kx-6, floorTop);
        ctx.lineTo(kx, floorTop-kh);
        ctx.lineTo(kx+6, floorTop);
        ctx.closePath();
        ctx.globalAlpha=0.85;
        ctx.fill();
      }
      // Highlights on each shard
      ctx.fillStyle='rgba(255,255,255,0.6)';
      for(let k=0;k<5;k++){
        const kx=px-30+k*15;
        const kh=40+((k*17)%60);
        ctx.beginPath();
        ctx.moveTo(kx-1, floorTop-2);
        ctx.lineTo(kx, floorTop-kh+4);
        ctx.lineTo(kx+1, floorTop-2);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha=1;
    } else {
      ctx.fillStyle='#3a2614';
      ctx.fillRect(px-18, ceilH+94, 36, floorTop-ceilH-94);
      ctx.fillStyle='#4a3018';
      ctx.fillRect(px-24, ceilH+94, 48, 10);
      ctx.fillRect(px-24, floorTop-10, 48, 10);
      ctx.fillStyle='rgba(200,160,80,0.35)';
      ctx.fillRect(px-12, ceilH+130, 24, 2);
      ctx.fillRect(px-12, ceilH+170, 24, 2);
      ctx.fillRect(px-12, ceilH+210, 24, 2);
    }
  }

  // Light sources — torches vs bioluminescent mushrooms
  for(let tx=140; tx<pi.worldW; tx+=240){
    if(isCave){
      // Glowing mushroom cluster on wall
      const pulse=0.7+Math.sin(t*2+tx)*0.2;
      const mcol=['rgba(120,220,255,','rgba(180,130,255,','rgba(120,255,200,'][((tx/240)|0)%3];
      const fg=ctx.createRadialGradient(tx, ceilH+130, 2, tx, ceilH+130, 90*pulse);
      fg.addColorStop(0, `${mcol}${0.6*pulse})`);
      fg.addColorStop(1, 'transparent');
      ctx.fillStyle=fg;
      ctx.fillRect(tx-100, ceilH+60, 200, 180);
      // Mushroom stalks + caps
      for(let mi=0; mi<3; mi++){
        const mx=tx-14+mi*14;
        ctx.fillStyle='#e8f4f0';
        ctx.fillRect(mx-2, ceilH+120, 4, 16);
        ctx.fillStyle=`${mcol}${0.85})`;
        ctx.beginPath();
        ctx.ellipse(mx, ceilH+120, 8, 5, 0, Math.PI, 0);
        ctx.fill();
        // Cap spots
        ctx.fillStyle='rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(mx-2, ceilH+118, 1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(mx+2, ceilH+116, 1, 0, Math.PI*2); ctx.fill();
      }
    } else {
      ctx.fillStyle='#2a1a08';
      ctx.fillRect(tx-3, ceilH+120, 6, 30);
      const flick=0.8+Math.sin(t*14+tx)*0.2;
      const fg=ctx.createRadialGradient(tx, ceilH+118, 2, tx, ceilH+118, 80*flick);
      fg.addColorStop(0, `rgba(255,220,120,${0.9*flick})`);
      fg.addColorStop(0.4, `rgba(240,130,40,${0.4*flick})`);
      fg.addColorStop(1, 'transparent');
      ctx.fillStyle=fg;
      ctx.fillRect(tx-90, ceilH+60, 180, 160);
      ctx.fillStyle=`rgba(255,200,80,${flick})`;
      ctx.beginPath();
      ctx.ellipse(tx, ceilH+112, 5, 10*flick, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Caustic light ripples underwater
  if(isCave){
    ctx.globalAlpha=0.25;
    for(let ci=0;ci<6;ci++){
      const cx1=(ci*157 + t*30)%pi.worldW;
      const cy1=ceilH+40+Math.sin(t+ci)*8;
      const cg=ctx.createRadialGradient(cx1, cy1, 2, cx1, cy1, 80);
      cg.addColorStop(0,'rgba(160,230,255,0.4)');
      cg.addColorStop(1,'transparent');
      ctx.fillStyle=cg;
      ctx.beginPath(); ctx.arc(cx1, cy1, 80, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // === PUZZLE PLATES on the floor (stepped-on tiles) ===
  const pz=pi.puzzle;
  pz.plates.forEach((pl,idx)=>{
    const plx=pl.x, ply=floorTop-2;
    const lit=pl.litT>0;
    const litFrac=lit?(pl.litT/40):0;
    // Stone plate (raised block)
    ctx.fillStyle=lit?pl.color:'#5a4020';
    ctx.fillRect(plx-26, ply-8, 52, 10);
    ctx.fillStyle=lit?'#fff7c0':'#7a5a30';
    ctx.fillRect(plx-26, ply-8, 52, 2);
    // Crack lines
    ctx.strokeStyle='rgba(20,10,4,0.55)'; ctx.lineWidth=1;
    ctx.strokeRect(plx-26, ply-8, 52, 10);
    // Carved glyph on top
    ctx.fillStyle=lit?`rgba(255,240,180,${0.7+litFrac*0.3})`:'rgba(200,160,80,0.55)';
    ctx.font='bold 18px serif'; ctx.textAlign='center';
    ctx.fillText(pl.glyph, plx, ply);
    // Glow aura when lit
    if(lit){
      const glow=ctx.createRadialGradient(plx, ply-8, 2, plx, ply-8, 80);
      glow.addColorStop(0, `rgba(${parseInt(pl.color.slice(1,3),16)},${parseInt(pl.color.slice(3,5),16)},${parseInt(pl.color.slice(5,7),16)},${0.5*litFrac})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle=glow;
      ctx.beginPath(); ctx.arc(plx, ply-8, 80, 0, Math.PI*2); ctx.fill();
      // Upward light shaft
      const shaftG=ctx.createLinearGradient(plx, ply-8, plx, ceilH+120);
      shaftG.addColorStop(0, `rgba(255,230,150,${0.35*litFrac})`);
      shaftG.addColorStop(1, 'transparent');
      ctx.fillStyle=shaftG;
      ctx.fillRect(plx-10, ceilH+120, 20, ply-ceilH-128);
    }
  });

  // === SARCOPHAGUS / ANCIENT CHEST at the far back — opens when solved ===
  const sarcX=pi.worldW-320, sarcY=floorTop-48;
  // Target sequence tablet above (the "hint")
  const tabX=sarcX+90, tabY=ceilH+120;
  // Stone tablet
  ctx.fillStyle=isCave?'#0c1820':'#3a2614';
  ctx.fillRect(tabX-90, tabY-18, 180, 56);
  ctx.strokeStyle=isCave?'rgba(120,220,255,0.55)':'rgba(200,160,80,0.5)'; ctx.lineWidth=2;
  ctx.strokeRect(tabX-90, tabY-18, 180, 56);
  ctx.fillStyle=isCave?'rgba(160,230,255,0.7)':'rgba(200,160,80,0.5)';
  ctx.font='bold 10px monospace'; ctx.textAlign='center';
  ctx.fillText(isCave?'DEEP RUNES':'TOMB SEAL', tabX, tabY-5);
  // Target sequence glyphs — green if already stepped, yellow if current, faded if future
  const plateDefs=pz.plates;
  ctx.font='bold 24px serif';
  for(let i=0;i<pz.targetSeq.length;i++){
    const gx=tabX + (i-1.5)*42;
    const gy=tabY+28;
    const plateIdx=pz.targetSeq[i];
    const pl=plateDefs[plateIdx];
    if(!pl)continue;
    let glyphCol, bgCol;
    if(pz.solved){ glyphCol='#ffd880'; bgCol='rgba(255,200,80,0.35)'; }
    else if(i<pz.progress){ glyphCol='#8f8'; bgCol='rgba(100,220,120,0.25)'; }
    else if(i===pz.progress){
      const pulse=0.5+Math.sin(t*5)*0.3;
      glyphCol=`rgba(255,230,150,${pulse+0.3})`;
      bgCol=`rgba(255,210,120,${pulse*0.3})`;
    } else { glyphCol='rgba(200,160,80,0.5)'; bgCol='rgba(120,90,40,0.15)'; }
    // Slot bg
    ctx.fillStyle=bgCol; ctx.fillRect(gx-16, gy-18, 32, 26);
    ctx.strokeStyle='rgba(200,160,80,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(gx-16, gy-18, 32, 26);
    ctx.fillStyle=glyphCol;
    ctx.fillText(pl.glyph, gx, gy);
  }
  // Error hint flash
  if(pz.hintT>0){
    ctx.fillStyle=`rgba(255,60,60,${pz.hintT/40*0.35})`;
    ctx.fillRect(tabX-90, tabY-18, 180, 56);
  }

  // Sarcophagus body / Ancient chest
  const isOpen=pz.solved;
  const openT=Math.min(1, pz.revealT/60);
  if(isCave){
    // Barnacle-encrusted ancient chest
    ctx.fillStyle='#4a3a28';
    ctx.fillRect(sarcX, sarcY, 180, 48);
    // Metal straps
    ctx.fillStyle='#8a6a48';
    ctx.fillRect(sarcX, sarcY+10, 180, 3);
    ctx.fillRect(sarcX, sarcY+34, 180, 3);
    ctx.fillRect(sarcX+86, sarcY, 8, 48);
    // Lid (flips open when solved)
    ctx.fillStyle=isOpen?'#6a5034':'#5a4028';
    ctx.save();
    ctx.translate(sarcX, sarcY);
    ctx.rotate(-openT*0.7);
    ctx.fillRect(0, -14, 180, 14);
    ctx.fillStyle='#8a6a48';
    ctx.fillRect(0, -10, 180, 2);
    ctx.restore();
    // Barnacles on chest
    ctx.fillStyle='#c8d4d0';
    for(let bi=0;bi<10;bi++){
      const bxp=sarcX+10+((bi*23)%160);
      const byp=sarcY+8+((bi*17)%32);
      ctx.beginPath(); ctx.arc(bxp, byp, 2+((bi*3)%3), 0, Math.PI*2); ctx.fill();
    }
    // Keyhole
    ctx.fillStyle='#1a0a02';
    ctx.fillRect(sarcX+86, sarcY+20, 8, 10);
    ctx.beginPath(); ctx.arc(sarcX+90, sarcY+22, 4, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle='#6a4a20';
    ctx.fillRect(sarcX, sarcY, 180, 48);
    ctx.fillStyle=isOpen?'#a67840':'#8a6828';
    ctx.fillRect(sarcX - openT*60, sarcY-8, 180, 10);
    ctx.fillStyle='#d4a848';
    ctx.beginPath();
    ctx.arc(sarcX+90, sarcY+22, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(40,20,4,0.8)';
    ctx.font='bold 14px serif'; ctx.textAlign='center';
    ctx.fillText('\u2625', sarcX+90, sarcY+28);
  }

  // Open tomb reveal — golden glow + treasure inside
  if(isOpen){
    const inX=sarcX+120-openT*10, inY=sarcY-4;
    // Gold glow bursting out
    const sg=ctx.createRadialGradient(sarcX+90, sarcY-20, 2, sarcX+90, sarcY-20, 140);
    sg.addColorStop(0,`rgba(255,230,140,${0.6*openT})`);
    sg.addColorStop(0.5,`rgba(255,180,60,${0.25*openT})`);
    sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg;
    ctx.beginPath(); ctx.arc(sarcX+90, sarcY-20, 140, 0, Math.PI*2); ctx.fill();
    // Treasure pile inside
    ctx.fillStyle='#ffd060';
    ctx.fillRect(sarcX+12, sarcY+4, 60, 6);
    ctx.fillRect(sarcX+20, sarcY-2, 40, 6);
    ctx.fillStyle='#fff2a0';
    for(let ti=0;ti<8;ti++){
      const tx=sarcX+14+ti*8, ty=sarcY+6-((ti*37)%5);
      ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI*2); ctx.fill();
    }
    // Sparkles
    for(let si=0;si<12;si++){
      const phase=(t*2+si*0.7)%1;
      const sx2=sarcX+20+((si*27)%140);
      const sy2=sarcY-10-phase*30;
      ctx.fillStyle=`rgba(255,240,180,${1-phase})`;
      ctx.fillRect(sx2, sy2, 2, 2);
    }
    // Interact prompt
    if(!pz.rewardGiven && Math.abs(a.x-(sarcX+90))<120){
      ctx.fillStyle='#ffd880';
      ctx.font='bold 12px monospace'; ctx.textAlign='center';
      ctx.fillText('[E] claim treasure', sarcX+90, sarcY-46);
    }
  }

  // Doorway back to outside
  const dX=60, dW=44, dH=80;
  const dY=floorTop-dH;
  if(isCave){
    // Cave mouth leading back to water — irregular opening
    ctx.fillStyle='#02060a';
    ctx.beginPath();
    ctx.moveTo(dX+dW/2, dY-8);
    ctx.quadraticCurveTo(dX-6, dY+dH*0.2, dX+4, dY+dH);
    ctx.lineTo(dX+dW-4, dY+dH);
    ctx.quadraticCurveTo(dX+dW+10, dY+dH*0.3, dX+dW/2, dY-8);
    ctx.closePath(); ctx.fill();
    // Water-light spill (teal)
    const spill=ctx.createLinearGradient(dX,dY,dX+160,dY);
    spill.addColorStop(0,'rgba(100,220,255,0.35)');
    spill.addColorStop(1,'transparent');
    ctx.fillStyle=spill;
    ctx.fillRect(dX+dW, dY, 160, dH);
    // Rocky lip
    ctx.strokeStyle='#0c1824'; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(dX+dW/2, dY-8);
    ctx.quadraticCurveTo(dX-6, dY+dH*0.2, dX+4, dY+dH);
    ctx.moveTo(dX+dW/2, dY-8);
    ctx.quadraticCurveTo(dX+dW+10, dY+dH*0.3, dX+dW-4, dY+dH);
    ctx.stroke();
    // Rising bubbles inside
    for(let bi=0;bi<5;bi++){
      const bp=((t*0.8 + bi*0.2)%1);
      const bxp=dX+dW/2 + Math.sin(bi+t)*6;
      const byp=dY+dH - bp*dH;
      ctx.fillStyle=`rgba(200,240,255,${(1-bp)*0.7})`;
      ctx.beginPath(); ctx.arc(bxp, byp, 1.6, 0, Math.PI*2); ctx.fill();
    }
  } else {
    ctx.fillStyle='#0a0502';
    ctx.fillRect(dX, dY, dW, dH);
    const sun=ctx.createLinearGradient(dX,dY,dX+150,dY);
    sun.addColorStop(0,'rgba(255,220,140,0.5)');
    sun.addColorStop(1,'transparent');
    ctx.fillStyle=sun;
    ctx.fillRect(dX+dW, dY, 160, dH);
    ctx.fillStyle='#8a6828';
    ctx.fillRect(dX-4, dY-4, 4, dH+4);
    ctx.fillRect(dX+dW, dY-4, 4, dH+4);
    ctx.fillRect(dX-4, dY-4, dW+8, 5);
  }

  // Dust motes / floating particles
  for(let di=0;di<30;di++){
    const dx=(di*173+((t*20)|0))%pi.worldW;
    const dy=ceilH+120+((di*67+t*15)%180);
    if(isCave){
      ctx.fillStyle=`rgba(160,230,255,${0.2+(di%3)*0.1})`;
    } else {
      ctx.fillStyle=`rgba(255,220,140,${0.15+(di%3)*0.1})`;
    }
    ctx.fillRect(dx, dy, 2, 2);
  }

  // Alien — reuse the real on-foot renderer so it looks identical to the overworld
  const ax=a.x, ay=floorTop;
  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(ax, floorTop+2, 16, 4, 0, 0, Math.PI*2); ctx.fill();
  drawAlienPreview(ax, ay, 1.0, getAlienSkin(), a.facing, a.walkT);

  ctx.restore();

  // Vignette
  const vg=ctx.createRadialGradient(cw/2,ch/2,ch*0.3,cw/2,ch/2,ch*0.8);
  vg.addColorStop(0,'transparent');
  vg.addColorStop(1,'rgba(0,0,0,0.75)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,cw,ch);

  // HUD
  ctx.fillStyle=isCave?'#aef0ff':'#ffd880';
  ctx.font='bold 16px monospace'; ctx.textAlign='left';
  ctx.fillText(isCave?'DEEP CAVE':'TOMB INTERIOR', 20, 28);
  ctx.fillStyle='#aaa';
  ctx.font='12px monospace';
  ctx.fillText('A/D move  SPACE jump  ESC leave', 20, 46);
  // Puzzle hint line
  const pz2=pi.puzzle;
  const hintCol=isCave?'rgba(160,230,255,0.9)':'rgba(255,220,140,0.85)';
  if(!pz2.solved){
    ctx.fillStyle=hintCol;
    ctx.font='12px monospace';
    ctx.fillText(`Step on the glyphs in the order shown on the ${isCave?'runes above the chest':'seal above the tomb'}  [${pz2.progress}/${pz2.targetSeq.length}]`, 20, 64);
  } else if(!pz2.rewardGiven){
    ctx.fillStyle=isCave?'rgba(160,240,255,0.95)':'rgba(255,230,140,0.95)';
    ctx.font='bold 13px monospace';
    ctx.fillText(isCave?'CHEST UNLOCKED — approach the chest':'TOMB OPENED — approach the sarcophagus', 20, 64);
  } else {
    ctx.fillStyle='rgba(140,220,160,0.8)';
    ctx.font='12px monospace';
    ctx.fillText('Treasure claimed.', 20, 64);
  }

  // Celebration banner briefly after solving
  if(pz2.solveAnim>120){
    const a2=(pz2.solveAnim-120)/80;
    ctx.fillStyle=isCave?`rgba(160,230,255,${a2*0.9})`:`rgba(255,220,120,${a2*0.9})`;
    ctx.font='bold 32px serif'; ctx.textAlign='center';
    ctx.fillText(isCave?'THE RUNES GLOW':'THE SEAL IS BROKEN', cw/2, ch/2);
  }

  // Prompt near door
  if(a.x<140){
    ctx.fillStyle=isCave?'#aef0ff':'#ffd880';
    ctx.font='bold 14px monospace'; ctx.textAlign='center';
    ctx.fillText(isCave?'[E] exit cave':'[E] exit tomb', cw/2, ch-40);
  }
}

function updateMothership(){
  const mi=mothershipInterior;
  if(mi.dialogTimer>0)mi.dialogTimer--;
  if(mi.milkCD>0)mi.milkCD--;
  if(mi.actionAnim>0)mi.actionAnim--;
  if(mi.npcTalkAnim>0)mi.npcTalkAnim--;
  if(mi.npcSpeechTimer>0)mi.npcSpeechTimer--;

  // --- WALKABLE HUB (main menu) — on-foot style physics ---
  if(mi.screen==='menu'){
    const h=mi.hub;
    const edgePad=200, usable=h.width-edgePad*2;
    h.doorX=MS_MENUS.map((m,i)=>edgePad+(usable*i)/(MS_MENUS.length-1));
    // Init physics fields (guard in case entering an old save)
    if(h.vy==null)h.vy=0;
    if(h.y==null)h.y=0; // 0 = on floor, negative = in the air (offset)
    if(h.onGround==null)h.onGround=true;
    // Walk
    if(keys['a']||keys['arrowleft']){h.vx-=0.5;h.facing=-1;}
    if(keys['d']||keys['arrowright']){h.vx+=0.5;h.facing=1;}
    // Jump (SPACE) like on-foot
    if(keys[' ']&&h.onGround){h.vy=-7;h.onGround=false;}
    // --- GRAPPLING HOOK (G) — hooks into the corridor ceiling ---
    // Ceiling height in alien-local coords: floor is y=0, ceiling ~ -(canvas.height-140)
    const hubCeilingY = -(canvas.height - 140);
    const gNowH = !!keys['g'];
    if(gNowH && !h._gPrev){
      if(h.grapple){ h.grapple=null; }
      else {
        const dir=h.facing, sp=14;
        h.grapple={phase:'flying', x:h.x+dir*10, y:h.y-14, vx:dir*sp*0.7, vy:-sp*0.7, anchorX:0, anchorY:0, life:60};
      }
    }
    h._gPrev=gNowH;
    if(h.grapple){
      const g=h.grapple;
      if(g.phase==='flying'){
        g.x+=g.vx; g.y+=g.vy; g.vy+=0.22; g.life--;
        // Hit ceiling
        if(g.y<=hubCeilingY+10){ g.phase='attached'; g.anchorX=g.x; g.anchorY=hubCeilingY+10; g.life=240; }
        else if(g.life<=0 || g.y>4){ h.grapple=null; }
      } else {
        g.life--;
        const dx=g.anchorX-h.x, dy=g.anchorY-h.y+10;
        const d=Math.hypot(dx,dy)||1;
        const pull=Math.min(0.85, 0.4+d*0.0012);
        h.vx += (dx/d)*pull;
        h.vy += (dy/d)*pull - 0.36*0.6; // counter gravity while pulling
        h.onGround=false;
        if(d<20) h.grapple=null;
        if(g.life<=0) h.grapple=null;
      }
    }
    // Physics
    h.vy+=0.36; // gravity
    h.vx*=0.85;
    h.x+=h.vx;
    h.y+=h.vy;
    // Floor
    if(h.y>=0){h.y=0;h.vy=0;h.onGround=true;}else{h.onGround=false;}
    // Ceiling bump (prevent flying through the top)
    if(h.y<hubCeilingY+6){h.y=hubCeilingY+6; if(h.vy<0)h.vy=0;}
    // Walls
    if(h.x<40){h.x=40;h.vx=0;}
    if(h.x>h.width-40){h.x=h.width-40;h.vx=0;}
    if(Math.abs(h.vx)>0.3&&h.onGround)h.walkT+=0.22;
    // Nearest door
    let bestD=9999,bestI=-1;
    h.doorX.forEach((dx,i)=>{const d=Math.abs(dx-h.x);if(d<bestD){bestD=d;bestI=i;}});
    h.nearDoor = bestD<70?bestI:-1;
    // E = enter door
    if(keys['e']&&!mi._eCool&&h.nearDoor>=0){
      mi._eCool=14;keys['e']=false;
      mi.screen=MS_MENUS[h.nearDoor].id;mi.selectedItem=0;
      if(mi.screen==='zoo'){
        maybeTriggerRiot();
        // Auto-enter "prison cell" walk mode: player walks among creatures
        const all=[...mi.zooCreatures, ...mi.milkCows];
        const zooW=Math.max(1400, all.length*140+600);
        mi.zooWidth=zooW;
        mi.zooWalkMode=true;
        mi.zooAlien={x:zooW*0.5, y:0, vx:0, vy:0, facing:1, onGround:false, walkTimer:0};
        mi.zooDetailView=null; mi.zooInsideCell=null;
        // Scatter creatures across the cell floor
        all.forEach((c,i)=>{
          c.x=80+i*((zooW-160)/Math.max(1,all.length));
          c.walkDir=Math.random()<0.5?-1:1;
        });
      }
      if(mi.screen==='arena'){mi.arena.active=false;mi.arena.mode=0;}
      if(mi.screen==='lab'){mi.lab.running=false;mi.lab.outcome='';mi.lab.outcomeT=0;}
    }
    if(!keys['e']&&mi._eCool>0)mi._eCool--;
    if(keys['escape']){keys['escape']=false;exitMothership();return;}
    if(Math.random()>0.93){
      mi.ambientParticles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,
        vx:(Math.random()-0.5)*0.3,vy:-0.2-Math.random()*0.3,life:60+Math.random()*40,color:[80,100,140],size:Math.random()*2+0.5});
    }
    mi.ambientParticles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;});
    mi.ambientParticles=mi.ambientParticles.filter(p=>p.life>0);
    // --- Crew NPCs wander between consoles ---
    if(mi.hubCrew){
      mi.hubCrew.forEach(c=>{
        c.bob += 0.08;
        if(c.task==='walk'){
          const dx=c.targetX-c.x;
          if(Math.abs(dx)<10){c.task='work';c.taskT=180+Math.random()*300;c.vx=0;}
          else{
            const spd = c.role==='bot'?0.35:(c.role==='guard'?0.7:0.5);
            c.vx=Math.sign(dx)*spd;c.facing=Math.sign(dx);c.x+=c.vx;c.walkT+=0.22;
          }
        }else{
          c.taskT--;
          // Engineer/bot spark while "working"
          if((c.role==='engineer'||c.role==='bot') && Math.random()<0.08){
            c.sparkT=8;
            for(let si=0;si<3;si++){
              mi.ambientParticles.push({
                x:c.x+(Math.random()-0.5)*6, y:(canvas.height-70)-8,
                vx:(Math.random()-0.5)*1.2, vy:-0.4-Math.random()*0.8,
                life:20+Math.random()*10, color:[255,200+Math.random()*40,80], size:1+Math.random()*1.2
              });
            }
          }
          if(c.sparkT>0)c.sparkT--;
          if(c.taskT<=0){c.task='walk';c.targetX=120+Math.random()*(h.width-240);}
        }
      });
    }
    // Drone patrols the corridor
    if(mi.hubDrone){
      const d=mi.hubDrone;
      d.phase+=0.05;
      d.x+=d.vx;
      if(d.x>h.width-100){d.vx=-Math.abs(d.vx);}
      if(d.x<100){d.vx=Math.abs(d.vx);}
      d.y = d.baseY + Math.sin(d.phase)*14;
    }
    // Overhead cargo gantry drone — runs along a fixed rail
    if(mi.gantryDrone){
      const g=mi.gantryDrone;
      g.x+=g.vx;
      if(g.x>h.width-80){g.vx=-Math.abs(g.vx);}
      if(g.x<80){g.vx=Math.abs(g.vx);}
    }
    // Ticker scroll
    mi.tickerOffset=(mi.tickerOffset+0.7)%99999;
    // --- Random outside events ---
    if(mi.spaceEvents){
      mi._eventCD--;
      if(mi._eventCD<=0){
        const types=['asteroid','cruiser','fighter','comet','battle','wormhole','fleet'];
        const type=types[(Math.random()*types.length)|0];
        const fromLeft=Math.random()<0.5;
        const cw=canvas.width;
        const ev={type,t:0,life:300+Math.random()*240};
        if(type==='asteroid'){ev.x=fromLeft?-60:cw+60;ev.y=100+Math.random()*180;ev.vx=fromLeft?0.8+Math.random()*0.6:-(0.8+Math.random()*0.6);ev.vy=(Math.random()-0.5)*0.3;ev.rot=0;ev.rotV=(Math.random()-0.5)*0.03;ev.r=18+Math.random()*22;}
        else if(type==='cruiser'){ev.x=fromLeft?-200:cw+200;ev.y=110+Math.random()*150;ev.vx=fromLeft?1.1:-1.1;ev.size=1.0+Math.random()*0.6;ev.life=500;}
        else if(type==='fighter'){ev.x=fromLeft?-40:cw+40;ev.y=90+Math.random()*200;ev.vx=fromLeft?3.5:-3.5;ev.vy=(Math.random()-0.5)*0.8;ev.life=200;}
        else if(type==='comet'){ev.x=fromLeft?-80:cw+80;ev.y=60+Math.random()*60;ev.vx=fromLeft?4.5:-4.5;ev.vy=0.8+Math.random()*0.6;ev.life=180;}
        else if(type==='battle'){ev.x=cw*0.3+Math.random()*cw*0.4;ev.y=120+Math.random()*100;ev.shots=[];ev.life=400;}
        else if(type==='wormhole'){ev.x=cw*0.2+Math.random()*cw*0.6;ev.y=100+Math.random()*120;ev.life=360;ev.r=0;}
        else if(type==='fleet'){ev.x=fromLeft?-100:cw+100;ev.y=90+Math.random()*150;ev.vx=fromLeft?1.4:-1.4;ev.life=380;ev.count=3+((Math.random()*3)|0);}
        mi.spaceEvents.push(ev);
        mi._eventCD=200+Math.random()*320;
      }
      // Update events
      mi.spaceEvents.forEach(ev=>{
        ev.t++;
        if(ev.type==='asteroid'){ev.x+=ev.vx;ev.y+=ev.vy;ev.rot+=ev.rotV;}
        else if(ev.type==='cruiser'||ev.type==='fleet'){ev.x+=ev.vx;}
        else if(ev.type==='fighter'){ev.x+=ev.vx;ev.y+=ev.vy;}
        else if(ev.type==='comet'){ev.x+=ev.vx;ev.y+=ev.vy;}
        else if(ev.type==='battle'){
          if(ev.t%22===0)ev.shots.push({x:ev.x-30,y:ev.y,vx:2.2,life:30,c:'#f44'});
          if(ev.t%28===0)ev.shots.push({x:ev.x+30,y:ev.y+8,vx:-2.2,life:30,c:'#4af'});
          ev.shots.forEach(s=>{s.x+=s.vx;s.life--;});
          ev.shots=ev.shots.filter(s=>s.life>0);
        }
        else if(ev.type==='wormhole'){
          const prog=ev.t/ev.life;
          ev.r = prog<0.3 ? (prog/0.3)*40 : prog>0.8 ? (1-(prog-0.8)/0.2)*40 : 40;
        }
        ev.life--;
      });
      mi.spaceEvents=mi.spaceEvents.filter(ev=>ev.life>0 && ev.x>-400 && ev.x<canvas.width+400);
    }
    if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
    return;
  }

  // Screen-specific updates
  if(mi.screen==='starmap')updateStarmap();
  else if(mi.screen==='arena')updateArena();
  else if(mi.screen==='lab')updateLab();
  if(mi.screen==='zoo'&&mi.riot&&mi.riot.active)updateZooRiot();

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
    if(mi.zooDetailView){mi.zooDetailView=null;}
    else if(mi.zooWalkMode){mi.zooWalkMode=false;mi.screen='menu';mi.selectedItem=0;mi.zooAction=null;}
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
      const all=[...mi.zooCreatures, ...mi.milkCows];
      const zooW=Math.max(1400, all.length*140+600);
      mi.zooWidth=zooW;
      mi.zooAlien={x:zooW*0.5,y:0,vx:0,vy:0,facing:1,onGround:false,walkTimer:0};
      all.forEach((c,i)=>{ if(c.x==null||c.x<30||c.x>zooW-30) c.x=80+i*((zooW-160)/Math.max(1,all.length)); });
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
    // --- GRAPPLING HOOK (G) — hooks into the cell ceiling bars ---
    const zooFloorY=canvas.height-50;
    const zooCeilY=70; // matches drawMothership ceiling
    const gNowZ = !!keys['g'];
    if(gNowZ && !za._gPrev){
      if(za.grapple){ za.grapple=null; }
      else {
        const dir=za.facing, sp=13;
        za.grapple={phase:'flying', x:za.x+dir*10, y:za.y-24, vx:dir*sp*0.7, vy:-sp*0.7, anchorX:0, anchorY:0, life:60};
      }
    }
    za._gPrev=gNowZ;
    if(za.grapple){
      const g=za.grapple;
      if(g.phase==='flying'){
        g.x+=g.vx; g.y+=g.vy; g.vy+=0.18; g.life--;
        if(g.y<=zooCeilY+16){ g.phase='attached'; g.anchorX=g.x; g.anchorY=zooCeilY+16; g.life=220; }
        else if(g.life<=0 || g.y>=zooFloorY){ za.grapple=null; }
      } else {
        g.life--;
        const dx=g.anchorX-za.x, dy=g.anchorY-(za.y-20);
        const d=Math.hypot(dx,dy)||1;
        const pull=Math.min(0.8, 0.35+d*0.001);
        za.vx += (dx/d)*pull;
        za.vy += (dy/d)*pull - 0.25*0.7; // counter gravity
        za.onGround=false;
        if(d<22) za.grapple=null;
        if(g.life<=0) za.grapple=null;
      }
    }
    za.vy+=0.25; za.vx*=0.88;
    za.x+=za.vx; za.y+=za.vy;
    // Zoo floor
    if(za.y>=zooFloorY){za.y=zooFloorY;za.vy=0;za.onGround=true;}else{za.onGround=false;}
    // Zoo ceiling bump
    if(za.y<zooCeilY+30){za.y=zooCeilY+30; if(za.vy<0)za.vy=0;}
    // Zoo walls
    const zooW=mi.zooWidth||Math.max(1400, (mi.zooCreatures.length+mi.milkCows.length)*140+600);
    if(za.x<30)za.x=30;
    if(za.x>zooW-30)za.x=zooW-30;
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
  {
    const zMin=30, zMax=(mi.zooWidth||260)-30;
    (mi.zooCreatures||[]).forEach((c,ci)=>{
      c.walkTimer+=0.08;
      // State machine: 'walk', 'sleep', 'fight', 'eat'. Transitions randomly every few seconds.
      if(c._stateT==null){c._state='walk'; c._stateT=120+Math.random()*240;}
      c._stateT--;
      if(c._stateT<=0){
        const r=Math.random();
        if(r<0.55)c._state='walk';
        else if(r<0.8)c._state='sleep';
        else if(r<0.95)c._state='eat';
        else c._state='fight';
        c._stateT=120+Math.random()*300;
        // Find a fight partner nearby (same enclosure)
        if(c._state==='fight'){
          const partners=mi.zooCreatures.filter(o=>o!==c&&o.enclosure===c.enclosure&&Math.abs(o.x-c.x)<140);
          c._fightPartner = partners.length ? partners[Math.floor(Math.random()*partners.length)] : null;
          if(c._fightPartner){c._fightPartner._state='fight';c._fightPartner._stateT=c._stateT;c._fightPartner._fightPartner=c;}
          else c._state='walk';
        }
      }
      if(c._state==='walk'){
        c.x+=c.walkDir*c.walkSpeed;
        if(c.x<zMin||c.x>zMax)c.walkDir*=-1;
        if(Math.random()>0.99)c.walkDir*=-1;
      } else if(c._state==='sleep'){
        // Idle, tiny breathing bob handled via walkTimer in draw
      } else if(c._state==='eat'){
        // Wiggle toward food-bowl side
        if(Math.random()>0.7)c.x += (c.walkDir)*0.05;
      } else if(c._state==='fight' && c._fightPartner){
        const p=c._fightPartner;
        const dx=p.x-c.x;
        if(Math.abs(dx)>10) c.x += Math.sign(dx)*0.6;
        else if(Math.random()>0.85){
          // Fight punch — small impact particles
          if(typeof mi.ambientParticles!=='undefined' && mi.ambientParticles.length<60){
            mi.ambientParticles.push({x:canvas.width/2,y:canvas.height/2,vx:0,vy:0,life:8,color:[255,240,80],size:2});
          }
          c.happiness=Math.max(0,c.happiness-0.5);
        }
      }
      if(c.feedAnim>0)c.feedAnim--;
      c.hunger=Math.max(0,c.hunger-0.005);
      c.happiness=Math.max(0,c.happiness-0.003);
    });
    (mi.milkCows||[]).forEach(c=>{c.walkTimer+=0.03;c.legAnim+=0.05;if(c.milkAnim>0)c.milkAnim--;
      c.x=(c.x==null?zMin+Math.random()*(zMax-zMin):c.x)+(c.walkDir||(c.walkDir=Math.random()<0.5?-1:1))*0.15;
      if(c.x<zMin||c.x>zMax)c.walkDir*=-1;
      if(c.feedAnim>0)c.feedAnim--;c.hunger=Math.max(0,c.hunger-0.005);c.happiness=Math.max(0,c.happiness-0.003);});
  }

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
  const cw=canvas.width,ch=canvas.height,t=frameT;

  // === BACKGROUND ===
  const bg=ctx.createLinearGradient(0,0,0,ch);bg.addColorStop(0,'#020210');bg.addColorStop(0.5,'#040418');bg.addColorStop(1,'#060620');
  ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);
  for(let i=0;i<60;i++){const sx=(i*173.7+t*5*(i%3+1))%cw,sy=(i*97.3+20)%ch;
    ctx.fillStyle=`rgba(255,255,255,${0.15+Math.sin(t+i)*0.1})`;ctx.beginPath();ctx.arc(sx,sy,0.7+Math.sin(t*2+i)*0.3,0,Math.PI*2);ctx.fill();}
  mi.ambientParticles.forEach(p=>{ctx.fillStyle=`rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1,p.life/30)*0.2})`;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();});

  // ================================================================
  // MAIN MENU - WALKABLE CORRIDOR
  // ================================================================
  if(mi.screen==='menu'){
    const h=mi.hub;
    const camX=Math.max(0,Math.min(h.width-cw, h.x-cw/2));
    // Deep space backdrop through viewports
    const floorY=ch-70, ceilY=70;
    // Corridor floor
    const fg=ctx.createLinearGradient(0,floorY,0,ch);fg.addColorStop(0,'#0a1a2a');fg.addColorStop(1,'#040810');
    ctx.fillStyle=fg;ctx.fillRect(0,floorY,cw,ch-floorY);
    // Grid floor lines (perspective-ish)
    ctx.strokeStyle='rgba(100,180,255,0.08)';ctx.lineWidth=1;
    for(let fx=Math.floor(camX/60)*60;fx<camX+cw+60;fx+=60){
      const sx=fx-camX;
      ctx.beginPath();ctx.moveTo(sx,floorY);ctx.lineTo(sx,ch);ctx.stroke();
    }
    // Reflective floor highlight — thin gloss band just below the floor line
    const glossG=ctx.createLinearGradient(0, floorY, 0, floorY+14);
    glossG.addColorStop(0,'rgba(140,200,255,0.22)');
    glossG.addColorStop(1,'transparent');
    ctx.fillStyle=glossG; ctx.fillRect(0, floorY, cw, 14);
    // Power conduits embedded in floor
    for(let fx=Math.floor(camX/90)*90; fx<camX+cw+90; fx+=90){
      const sx=fx-camX;
      const flick=0.4+Math.sin(t*3+fx*0.01)*0.3;
      ctx.fillStyle=`rgba(120,220,255,${flick*0.5})`;
      ctx.fillRect(sx-1, floorY+6, 2, 2);
      // Pulse travelling along
      const ph=(t*1.2 + fx*0.008)%1;
      ctx.fillStyle=`rgba(160,240,255,${0.7*(1-ph)})`;
      ctx.fillRect(sx-1 + ph*60, floorY+6, 3, 2);
    }
    // Low floor mist (semi-transparent undulating band)
    const mistG=ctx.createLinearGradient(0, floorY-4, 0, floorY+24);
    mistG.addColorStop(0,'transparent');
    mistG.addColorStop(0.5,'rgba(120,180,230,0.08)');
    mistG.addColorStop(1,'rgba(80,140,200,0.14)');
    ctx.fillStyle=mistG; ctx.fillRect(0, floorY-4, cw, 28);
    // Ceiling
    ctx.fillStyle='#050814';ctx.fillRect(0,0,cw,ceilY);
    ctx.strokeStyle='rgba(100,180,255,0.15)';ctx.beginPath();ctx.moveTo(0,ceilY);ctx.lineTo(cw,ceilY);ctx.stroke();
    // Ceiling light strips
    for(let lx=Math.floor(camX/120)*120;lx<camX+cw+120;lx+=120){
      const sx=lx-camX;
      ctx.fillStyle=`rgba(150,220,255,${0.25+Math.sin(t*2+lx*0.01)*0.08})`;
      ctx.fillRect(sx+10,ceilY-10,100,4);
    }
    // === Hanging structural pipes (grapple targets) ===
    for(let px=Math.floor(camX/180)*180; px<camX+cw+180; px+=180){
      const sx=px-camX+60;
      // Pipe bracket at ceiling
      ctx.fillStyle='#2a3848';
      ctx.fillRect(sx-4, ceilY, 8, 6);
      ctx.fillStyle='#4a5a6a';
      ctx.fillRect(sx-2, ceilY+6, 4, 14);
      // Horizontal pipe / conduit
      ctx.fillStyle='#3a4858';
      ctx.fillRect(sx-22, ceilY+18, 44, 5);
      ctx.fillStyle='rgba(255,255,255,0.18)';
      ctx.fillRect(sx-22, ceilY+18, 44, 1);
      // Running energy pulse on pipe
      const ph2=(t*0.7 + px*0.005)%1;
      ctx.fillStyle=`rgba(120,230,255,${0.8*(1-Math.abs(ph2-0.5)*2)})`;
      ctx.fillRect(sx-22 + ph2*44, ceilY+19, 4, 3);
    }
    // === Warning lights between doors ===
    for(let wx=Math.floor(camX/200)*200; wx<camX+cw+200; wx+=200){
      const sx=wx-camX;
      const blink=0.35+Math.sin(t*2.4+wx*0.02)*0.55;
      const warnCol = Math.floor(wx/200)%2===0 ? [255,120,60] : [120,220,255];
      ctx.fillStyle=`rgba(${warnCol[0]},${warnCol[1]},${warnCol[2]},${Math.max(0,blink)*0.9})`;
      ctx.beginPath(); ctx.arc(sx, ceilY+42, 3.5, 0, Math.PI*2); ctx.fill();
      // Halo
      const wg=ctx.createRadialGradient(sx,ceilY+42,0,sx,ceilY+42,16);
      wg.addColorStop(0,`rgba(${warnCol[0]},${warnCol[1]},${warnCol[2]},${Math.max(0,blink)*0.35})`);
      wg.addColorStop(1,'transparent');
      ctx.fillStyle=wg; ctx.beginPath(); ctx.arc(sx,ceilY+42,16,0,Math.PI*2); ctx.fill();
    }
    // === Floor steam vents (occasional puff) ===
    for(let vx=Math.floor(camX/240)*240; vx<camX+cw+240; vx+=240){
      const sx=vx-camX+120;
      // Vent grate
      ctx.fillStyle='#182028';
      ctx.fillRect(sx-10, floorY-2, 20, 4);
      ctx.strokeStyle='rgba(140,180,220,0.3)'; ctx.lineWidth=0.5;
      for(let si=0;si<4;si++){ ctx.beginPath(); ctx.moveTo(sx-8+si*5, floorY-1); ctx.lineTo(sx-8+si*5, floorY+2); ctx.stroke(); }
      // Puffing steam cloud (driven by time, staggered)
      const cyc=(t*0.6 + vx*0.01)%3;
      if(cyc<1.2){
        const k=cyc/1.2;
        const sa=0.35*(1-k);
        const sr=6+k*18;
        const sy=floorY-2 - k*22;
        const sgrad=ctx.createRadialGradient(sx,sy,0,sx,sy,sr);
        sgrad.addColorStop(0,`rgba(200,220,240,${sa})`);
        sgrad.addColorStop(1,'transparent');
        ctx.fillStyle=sgrad; ctx.beginPath(); ctx.arc(sx,sy,sr,0,Math.PI*2); ctx.fill();
      }
    }
    // Back wall base
    ctx.fillStyle='#081224';ctx.fillRect(0,ceilY,cw,floorY-ceilY);
    // === BIG PANORAMIC WINDOW (back wall, continuous) ===
    const wTop=ceilY+10, wBot=floorY-150, wH=wBot-wTop;
    ctx.save();
    ctx.beginPath();ctx.rect(0,wTop,cw,wH);ctx.clip();
    // Deep space gradient (nebula base)
    const nebGrad=ctx.createLinearGradient(0,wTop,0,wBot);
    const nPhase=t*0.05+mi._nebulaPhase;
    nebGrad.addColorStop(0,`hsl(${240+Math.sin(nPhase*0.3)*15|0},55%,7%)`);
    nebGrad.addColorStop(0.5,`hsl(${270+Math.sin(nPhase*0.22)*25|0},50%,10%)`);
    nebGrad.addColorStop(1,`hsl(${220+Math.cos(nPhase*0.28)*20|0},55%,5%)`);
    ctx.fillStyle=nebGrad;ctx.fillRect(0,wTop,cw,wH);
    // Nebula clouds (parallax slow)
    for(let i=0;i<6;i++){
      const nx=((i*427 - camX*0.04 + t*4)%(cw+500))-250;
      const ny=wTop+40+((i*131)%(wH-80));
      const nr=140+((i*53)%80);
      const hue=(200+i*35+Math.sin(t*0.08+i)*20)|0;
      const rg=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);
      rg.addColorStop(0,`hsla(${hue},70%,45%,0.22)`);
      rg.addColorStop(0.6,`hsla(${hue-30},65%,35%,0.08)`);
      rg.addColorStop(1,'transparent');
      ctx.fillStyle=rg;ctx.beginPath();ctx.arc(nx,ny,nr,0,Math.PI*2);ctx.fill();
    }
    // Parallax starfield — 3 layers
    for(let layer=0;layer<3;layer++){
      const speed=0.15+layer*0.35, alpha=0.25+layer*0.2, count=35+layer*15;
      for(let i=0;i<count;i++){
        const hash=i*739.7+layer*2113;
        const sx=((hash + t*speed*10 - camX*(0.08+layer*0.08))%cw+cw*2)%cw;
        const sy=wTop+2+((hash*0.37)%wH);
        const sz=0.5+layer*0.4+(i%7===0?0.6:0);
        const twinkle=0.65+Math.sin(t*2+i)*0.35;
        ctx.fillStyle=`rgba(${200+layer*15},${215+layer*10},255,${alpha*twinkle})`;
        ctx.fillRect(sx,sy,sz,sz);
      }
    }
    // Distant rotating planet (anchored, slow drift)
    const plX=(cw*0.72 - camX*0.05 + 800)%((cw+400))-200+cw*0.05;
    const plY=wTop+wH*0.42, plR=Math.min(54,wH*0.34);
    const plGrad=ctx.createRadialGradient(plX-plR*0.35,plY-plR*0.4,plR*0.1,plX,plY,plR);
    plGrad.addColorStop(0,'#ffcc88');plGrad.addColorStop(0.35,'#c97040');plGrad.addColorStop(0.75,'#5a2410');plGrad.addColorStop(1,'#180806');
    ctx.fillStyle=plGrad;ctx.beginPath();ctx.arc(plX,plY,plR,0,Math.PI*2);ctx.fill();
    // Planet surface bands (rotation)
    ctx.save();ctx.beginPath();ctx.arc(plX,plY,plR,0,Math.PI*2);ctx.clip();
    for(let b=0;b<5;b++){
      const by=plY-plR+((b*plR*0.5 + t*3)%(plR*2));
      ctx.fillStyle=`rgba(80,40,20,${0.08+b*0.03})`;
      ctx.fillRect(plX-plR,by,plR*2,plR*0.2);
    }
    ctx.restore();
    // Planet rim glow
    const rimG=ctx.createRadialGradient(plX,plY,plR*0.85,plX,plY,plR*1.25);
    rimG.addColorStop(0,'rgba(255,180,120,0.22)');rimG.addColorStop(1,'transparent');
    ctx.fillStyle=rimG;ctx.beginPath();ctx.arc(plX,plY,plR*1.25,0,Math.PI*2);ctx.fill();
    // === RENDER SPACE EVENTS (outside the window) ===
    if(mi.spaceEvents) mi.spaceEvents.forEach(ev=>{
      if(ev.type==='asteroid'){
        ctx.save();ctx.translate(ev.x,ev.y);ctx.rotate(ev.rot);
        ctx.fillStyle='#5a4030';ctx.beginPath();
        for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2,rr=ev.r*(0.85+Math.sin(i*2.3)*0.15);
          const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}
        ctx.closePath();ctx.fill();
        ctx.fillStyle='#3a2818';ctx.beginPath();ctx.arc(-ev.r*0.25,-ev.r*0.2,ev.r*0.22,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(ev.r*0.3,ev.r*0.15,ev.r*0.15,0,Math.PI*2);ctx.fill();
        ctx.restore();
      } else if(ev.type==='cruiser'){
        const s=ev.size, dir=Math.sign(ev.vx)||1;
        ctx.save();ctx.translate(ev.x,ev.y);ctx.scale(dir*s,s);
        // Hull
        ctx.fillStyle='#334a66';ctx.beginPath();
        ctx.moveTo(-60,0);ctx.lineTo(-40,-10);ctx.lineTo(30,-12);ctx.lineTo(60,-4);ctx.lineTo(60,4);ctx.lineTo(30,12);ctx.lineTo(-40,10);ctx.closePath();ctx.fill();
        ctx.fillStyle='#1a2838';ctx.fillRect(-40,-14,70,4);
        // Window strip
        for(let i=-30;i<30;i+=8){ctx.fillStyle=`rgba(255,230,150,${0.6+Math.sin(t*3+i)*0.3})`;ctx.fillRect(i,-6,4,3);}
        // Engine glow behind
        ctx.fillStyle='rgba(120,200,255,0.9)';ctx.beginPath();ctx.arc(-60,0,4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(120,200,255,0.3)';ctx.beginPath();ctx.ellipse(-75,0,18,3,0,0,Math.PI*2);ctx.fill();
        ctx.restore();
      } else if(ev.type==='fighter'){
        const dir=Math.sign(ev.vx)||1;
        ctx.save();ctx.translate(ev.x,ev.y);ctx.scale(dir,1);
        ctx.fillStyle='#8a8a98';ctx.beginPath();
        ctx.moveTo(-14,0);ctx.lineTo(-6,-5);ctx.lineTo(14,-2);ctx.lineTo(14,2);ctx.lineTo(-6,5);ctx.closePath();ctx.fill();
        ctx.fillStyle='#4af';ctx.fillRect(-2,-3,6,2);
        // Engine trail
        ctx.fillStyle='rgba(255,180,80,0.8)';ctx.beginPath();ctx.arc(-14,0,2.5,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(255,140,40,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-32,0);ctx.stroke();
        ctx.restore();
      } else if(ev.type==='comet'){
        ctx.save();
        const g=ctx.createLinearGradient(ev.x,ev.y,ev.x-ev.vx*12,ev.y-ev.vy*12);
        g.addColorStop(0,'rgba(255,255,255,0.95)');g.addColorStop(0.5,'rgba(180,220,255,0.5)');g.addColorStop(1,'transparent');
        ctx.strokeStyle=g;ctx.lineWidth=3;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(ev.x,ev.y);ctx.lineTo(ev.x-ev.vx*14,ev.y-ev.vy*14);ctx.stroke();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ev.x,ev.y,2.5,0,Math.PI*2);ctx.fill();
        const gl=ctx.createRadialGradient(ev.x,ev.y,0,ev.x,ev.y,8);
        gl.addColorStop(0,'rgba(200,230,255,0.6)');gl.addColorStop(1,'transparent');
        ctx.fillStyle=gl;ctx.beginPath();ctx.arc(ev.x,ev.y,8,0,Math.PI*2);ctx.fill();
        ctx.restore();
      } else if(ev.type==='battle'){
        // Two distant ships shooting
        const s1x=ev.x-40,s1y=ev.y, s2x=ev.x+40,s2y=ev.y+6;
        ctx.fillStyle='#556'; ctx.beginPath();ctx.ellipse(s1x,s1y,10,3,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#664'; ctx.beginPath();ctx.ellipse(s2x,s2y,10,3,0,0,Math.PI*2);ctx.fill();
        ev.shots.forEach(sh=>{
          ctx.strokeStyle=sh.c;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sh.x,sh.y);ctx.lineTo(sh.x+sh.vx*4,sh.y);ctx.stroke();
        });
        // Occasional flash
        if(ev.t%22===0){const fg=ctx.createRadialGradient(s2x,s2y,0,s2x,s2y,14);fg.addColorStop(0,'rgba(255,180,100,0.8)');fg.addColorStop(1,'transparent');ctx.fillStyle=fg;ctx.beginPath();ctx.arc(s2x,s2y,14,0,Math.PI*2);ctx.fill();}
      } else if(ev.type==='wormhole'){
        ctx.save();ctx.translate(ev.x,ev.y);
        for(let i=6;i>=0;i--){
          const rr=ev.r*(1-i*0.1);
          const hue=260+i*15+t*30;
          ctx.strokeStyle=`hsla(${hue%360},80%,60%,${0.45-i*0.04})`;
          ctx.lineWidth=3;ctx.beginPath();
          ctx.ellipse(0,0,rr,rr*0.6,t*0.3+i*0.4,0,Math.PI*2);ctx.stroke();
        }
        const wg=ctx.createRadialGradient(0,0,0,0,0,ev.r);
        wg.addColorStop(0,'rgba(255,220,255,0.6)');wg.addColorStop(1,'transparent');
        ctx.fillStyle=wg;ctx.beginPath();ctx.arc(0,0,ev.r,0,Math.PI*2);ctx.fill();
        ctx.restore();
      } else if(ev.type==='fleet'){
        const dir=Math.sign(ev.vx)||1;
        for(let i=0;i<ev.count;i++){
          const fx=ev.x - dir*i*24 - (i%2)*dir*4;
          const fy=ev.y + (i%2===0?0:8);
          ctx.save();ctx.translate(fx,fy);ctx.scale(dir,1);
          ctx.fillStyle='#9ab';ctx.beginPath();
          ctx.moveTo(-10,0);ctx.lineTo(-4,-3);ctx.lineTo(10,-1);ctx.lineTo(10,1);ctx.lineTo(-4,3);ctx.closePath();ctx.fill();
          ctx.fillStyle='rgba(255,160,80,0.8)';ctx.beginPath();ctx.arc(-10,0,1.8,0,Math.PI*2);ctx.fill();
          ctx.restore();
        }
      }
    });
    // Subtle crew/player silhouette reflections on the window glass
    // (still inside the window clip so they only appear within the pane)
    if(mi.hubCrew){
      ctx.globalCompositeOperation='lighter';
      const reflY = wBot - 18; // near bottom of window glass
      mi.hubCrew.forEach(c=>{
        const rx=c.x-camX;
        if(rx<-20||rx>cw+20)return;
        // Tiny ghost silhouette, very faint
        ctx.fillStyle=`rgba(160,220,255,0.07)`;
        ctx.beginPath();
        ctx.ellipse(rx, reflY-6, 4, 9, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath();
        ctx.arc(rx, reflY-14, 3, 0, Math.PI*2); ctx.fill();
      });
      // Player reflection
      const plRX=(mi.hub?mi.hub.x:0)-camX;
      if(plRX>-20 && plRX<cw+20){
        ctx.fillStyle='rgba(180,240,255,0.11)';
        ctx.beginPath();
        ctx.ellipse(plRX, reflY-7, 5, 10, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath();
        ctx.arc(plRX, reflY-16, 3.2, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
    }
    ctx.restore();
    // Window structural pillars
    const pillarSp=380;
    for(let px=0;px<cw+pillarSp;px+=pillarSp){
      const ox=((px - camX*0.2)%pillarSp + pillarSp)%pillarSp + Math.floor((px-camX*0.2)/pillarSp)*pillarSp;
      const sx=px - ((camX*0.2)%pillarSp);
      if(sx<-30||sx>cw+30)continue;
      const pg=ctx.createLinearGradient(sx,wTop,sx+18,wTop);
      pg.addColorStop(0,'#0a1528');pg.addColorStop(0.5,'#1a2a40');pg.addColorStop(1,'#0a1528');
      ctx.fillStyle=pg;ctx.fillRect(sx,wTop,18,wH);
      ctx.strokeStyle='rgba(100,180,255,0.25)';ctx.lineWidth=1;ctx.strokeRect(sx,wTop,18,wH);
      // Rivets
      ctx.fillStyle='rgba(180,220,255,0.35)';
      for(let ry=wTop+10;ry<wBot-8;ry+=24){ctx.beginPath();ctx.arc(sx+9,ry,1.2,0,Math.PI*2);ctx.fill();}
    }
    // Outer window frame
    ctx.strokeStyle='rgba(120,200,255,0.55)';ctx.lineWidth=3;ctx.strokeRect(0,wTop,cw,wH);
    // Faint reflection sheen on glass
    const sheen=ctx.createLinearGradient(0,wTop,0,wBot);
    sheen.addColorStop(0,'rgba(140,200,255,0.06)');sheen.addColorStop(0.5,'rgba(140,200,255,0.02)');sheen.addColorStop(1,'rgba(140,200,255,0.08)');
    ctx.fillStyle=sheen;ctx.fillRect(0,wTop,cw,wH);
    // === WALL BELOW WINDOW (consoles area) ===
    const wallTop=wBot, wallBot=floorY;
    const wallGrad=ctx.createLinearGradient(0,wallTop,0,wallBot);
    wallGrad.addColorStop(0,'#0d1a2c');wallGrad.addColorStop(1,'#050a15');
    ctx.fillStyle=wallGrad;ctx.fillRect(0,wallTop,cw,wallBot-wallTop);
    // Pipes running along top of lower wall
    ctx.strokeStyle='rgba(80,140,200,0.4)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,wallTop+6);ctx.lineTo(cw,wallTop+6);ctx.stroke();
    ctx.strokeStyle='rgba(200,140,80,0.35)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,wallTop+12);ctx.lineTo(cw,wallTop+12);ctx.stroke();
    // Consoles
    if(mi.hubConsoles) mi.hubConsoles.forEach(con=>{
      const sx=con.x-camX;
      if(sx<-80||sx>cw+80)return;
      const cbW=70, cbH=wallBot-wallTop-22, cbY=wallTop+20;
      // Base
      ctx.fillStyle='#1a2838';ctx.fillRect(sx-cbW/2,cbY,cbW,cbH);
      ctx.strokeStyle='rgba(100,180,255,0.4)';ctx.lineWidth=1;ctx.strokeRect(sx-cbW/2,cbY,cbW,cbH);
      // Screen
      const scH=30;
      ctx.fillStyle='#020816';ctx.fillRect(sx-cbW/2+6,cbY+6,cbW-12,scH);
      // Screen content — blinking bars
      for(let i=0;i<6;i++){
        const bh=4+Math.abs(Math.sin(t*2+con.seed+i))*14;
        ctx.fillStyle=`hsla(${140+((con.seed*7+i*40)|0)%200},80%,55%,${0.65+Math.sin(t*3+i)*0.2})`;
        ctx.fillRect(sx-cbW/2+10+i*9,cbY+6+scH-bh-2,6,bh);
      }
      // Buttons
      for(let i=0;i<4;i++){
        const on=((Math.sin(t*1.5+con.seed+i*1.7)+1)*0.5)>0.6;
        ctx.fillStyle=on?'rgba(100,255,120,0.85)':'rgba(60,80,100,0.7)';
        ctx.fillRect(sx-cbW/2+8+i*14,cbY+44,8,5);
      }
      // Hologram above some consoles
      if(con.holo){
        const hx=sx, hy=cbY-22, hr=14;
        const hg=ctx.createRadialGradient(hx,hy,0,hx,hy,hr);
        hg.addColorStop(0,`rgba(140,220,255,${0.45+Math.sin(t*3)*0.15})`);
        hg.addColorStop(1,'transparent');
        ctx.fillStyle=hg;ctx.beginPath();ctx.arc(hx,hy,hr,0,Math.PI*2);ctx.fill();
        // Rotating mini planet hologram
        ctx.strokeStyle='rgba(140,220,255,0.7)';ctx.lineWidth=1;
        ctx.beginPath();ctx.ellipse(hx,hy,8,8*Math.abs(Math.cos(t*1.5+con.seed)),0,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.ellipse(hx,hy,8,3,t*1.5+con.seed,0,Math.PI*2);ctx.stroke();
        // Projector base
        ctx.fillStyle='rgba(100,180,255,0.6)';ctx.fillRect(sx-4,cbY-2,8,4);
      }
    });
    // Occasional steam puff from pipes
    if(Math.random()<0.02){
      mi.ambientParticles.push({x:camX+Math.random()*cw, y:wallTop+8, vx:(Math.random()-0.5)*0.2, vy:-0.4-Math.random()*0.3, life:40+Math.random()*30, color:[200,220,255], size:1.5+Math.random()*1.5});
    }

    // === VOLUMETRIC LIGHT SHAFTS (god-rays) from ceiling strips down to floor ===
    for(let lx=Math.floor(camX/120)*120; lx<camX+cw+120; lx+=120){
      const sx=lx-camX + 60;
      const breathe=0.55+Math.sin(t*1.3+lx*0.013)*0.15;
      const topW=36, botW=110;
      const ray=ctx.createLinearGradient(sx, ceilY, sx, floorY);
      ray.addColorStop(0, `rgba(180,230,255,${0.22*breathe})`);
      ray.addColorStop(0.7, `rgba(140,200,255,${0.05*breathe})`);
      ray.addColorStop(1, 'transparent');
      ctx.fillStyle=ray;
      ctx.beginPath();
      ctx.moveTo(sx-topW/2, ceilY);
      ctx.lineTo(sx+topW/2, ceilY);
      ctx.lineTo(sx+botW/2, floorY);
      ctx.lineTo(sx-botW/2, floorY);
      ctx.closePath();
      ctx.fill();
      const pool=ctx.createRadialGradient(sx, floorY+2, 4, sx, floorY+2, 70);
      pool.addColorStop(0, `rgba(160,220,255,${0.28*breathe})`);
      pool.addColorStop(1, 'transparent');
      ctx.fillStyle=pool;
      ctx.beginPath(); ctx.ellipse(sx, floorY+2, 70, 8, 0, 0, Math.PI*2); ctx.fill();
    }

    // === OVERHEAD SERVICE GANTRY RAIL (hanging below ceiling) ===
    const railY=ceilY+14;
    const railG=ctx.createLinearGradient(0, railY, 0, railY+6);
    railG.addColorStop(0,'#223348');
    railG.addColorStop(0.5,'#4a6478');
    railG.addColorStop(1,'#1a2430');
    ctx.fillStyle=railG;
    ctx.fillRect(0, railY, cw, 5);
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1;
    ctx.strokeRect(0, railY, cw, 5);
    for(let rx=Math.floor(camX/160)*160; rx<camX+cw+160; rx+=160){
      const sx=rx-camX;
      ctx.fillStyle='#162230';
      ctx.fillRect(sx-2, ceilY, 4, 14);
      ctx.fillStyle='rgba(120,180,220,0.5)';
      ctx.fillRect(sx-1, ceilY+2, 2, 2);
    }
    if(mi.gantryDrone){
      const g=mi.gantryDrone;
      const gx=g.x-camX;
      if(gx>-60 && gx<cw+60){
        const dir=Math.sign(g.vx)||1;
        const gy=railY+5;
        ctx.fillStyle='#3a5068';
        ctx.fillRect(gx-6, gy, 12, 6);
        ctx.fillStyle='#8aa8c0';
        ctx.fillRect(gx-5, gy, 10, 1);
        const bodyH=22;
        ctx.fillStyle='#2a3a50';
        ctx.fillRect(gx-18, gy+6, 36, bodyH);
        ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1;
        for(let li=0;li<3;li++){
          ctx.beginPath(); ctx.moveTo(gx-18+li*12, gy+6); ctx.lineTo(gx-18+li*12, gy+6+bodyH); ctx.stroke();
        }
        ctx.fillStyle=`hsl(${g.cargoHue},80%,55%)`;
        ctx.fillRect(gx-18, gy+14, 36, 4);
        ctx.fillStyle='rgba(0,0,0,0.6)';
        for(let hi=0;hi<5;hi++){
          ctx.beginPath();
          ctx.moveTo(gx-18+hi*8, gy+14);
          ctx.lineTo(gx-14+hi*8, gy+14);
          ctx.lineTo(gx-18+hi*8, gy+18);
          ctx.closePath(); ctx.fill();
        }
        const blink=(Math.sin(t*6+g.blinkPhase)+1)*0.5;
        ctx.fillStyle=`rgba(${dir>0?'100,255,140':'255,140,100'},${0.5+blink*0.5})`;
        ctx.beginPath(); ctx.arc(gx+dir*16, gy+10, 1.8, 0, Math.PI*2); ctx.fill();
        const dl=ctx.createLinearGradient(gx, gy+bodyH+6, gx, gy+bodyH+60);
        dl.addColorStop(0, `rgba(255,220,140,${0.25+blink*0.15})`);
        dl.addColorStop(1,'transparent');
        ctx.fillStyle=dl;
        ctx.beginPath();
        ctx.moveTo(gx-6, gy+bodyH+6);
        ctx.lineTo(gx+6, gy+bodyH+6);
        ctx.lineTo(gx+18, gy+bodyH+60);
        ctx.lineTo(gx-18, gy+bodyH+60);
        ctx.closePath(); ctx.fill();
      }
    }

    // === DATA TICKER BAND (scrolling text just below the rail) ===
    const tickY=railY+14;
    ctx.fillStyle='rgba(10,20,40,0.82)';
    ctx.fillRect(0, tickY, cw, 14);
    ctx.strokeStyle='rgba(100,180,255,0.4)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0, tickY); ctx.lineTo(cw, tickY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, tickY+14); ctx.lineTo(cw, tickY+14); ctx.stroke();
    ctx.fillStyle='rgba(140,220,255,0.85)';
    ctx.font='bold 9px monospace';
    ctx.textAlign='left';
    const tt=mi.tickerText||'';
    if(!mi._tickerW){ mi._tickerW = ctx.measureText(tt).width || 1; }
    const tw=mi._tickerW;
    const off=(mi.tickerOffset||0)%tw;
    let tx2=-off;
    while(tx2 < cw){
      ctx.fillText(tt, tx2, tickY+10);
      tx2+=tw;
    }
    const tdot=(Math.sin(t*3)+1)*0.5;
    ctx.fillStyle=`rgba(100,255,120,${0.6+tdot*0.4})`;
    ctx.beginPath(); ctx.arc(8, tickY+7, 2, 0, Math.PI*2); ctx.fill();

    // === OVERHEAD CABLE BUNDLES (hanging from ceiling) ===
    if(mi.hubCables) mi.hubCables.forEach(cb=>{
      const sx=cb.x-camX;
      if(sx<-40||sx>cw+40)return;
      // Main cable
      ctx.strokeStyle=`hsla(${cb.hue},60%,30%,0.85)`;
      ctx.lineWidth=cb.thick+1.5;
      ctx.beginPath();
      ctx.moveTo(sx-6, ceilY);
      ctx.quadraticCurveTo(sx, ceilY+cb.len+cb.sag, sx+6, ceilY+cb.len*0.6);
      ctx.stroke();
      // Secondary cable
      ctx.strokeStyle=`hsla(${(cb.hue+140)%360},50%,35%,0.7)`;
      ctx.lineWidth=cb.thick;
      ctx.beginPath();
      ctx.moveTo(sx+3, ceilY);
      ctx.quadraticCurveTo(sx+6, ceilY+cb.len*0.9+cb.sag*0.6, sx+10, ceilY+cb.len*0.5);
      ctx.stroke();
      // Occasional signal pulse along cable
      const pulse=(t*0.6+cb.x*0.01)%1;
      if(pulse<0.3){
        const py=ceilY + pulse/0.3 * cb.len;
        ctx.fillStyle=`hsla(${cb.hue},90%,70%,${0.8*(1-pulse/0.3)})`;
        ctx.beginPath();ctx.arc(sx + pulse*4, py, 1.8, 0, Math.PI*2); ctx.fill();
      }
    });

    // === CREW NPCs (drawn before player so they sit behind) ===
    if(mi.hubCrew) mi.hubCrew.forEach(c=>{
      const cx=c.x-camX;
      if(cx<-60||cx>cw+60)return;
      drawHubCrewMember(c, cx, floorY, t);
    });

    // === FLOATING PROBE DRONE ===
    if(mi.hubDrone){
      const d=mi.hubDrone;
      const dx=d.x-camX;
      if(dx>-60&&dx<cw+60){
        const dy=d.y;
        // Glow beam pointing down
        const bg=ctx.createLinearGradient(dx, dy, dx, floorY);
        bg.addColorStop(0,'rgba(140,220,255,0.45)');
        bg.addColorStop(1,'rgba(140,220,255,0)');
        ctx.fillStyle=bg;
        ctx.beginPath();
        ctx.moveTo(dx-3, dy+6);
        ctx.lineTo(dx+3, dy+6);
        ctx.lineTo(dx+18, floorY);
        ctx.lineTo(dx-18, floorY);
        ctx.closePath();
        ctx.fill();
        // Glow halo
        const glow=ctx.createRadialGradient(dx, dy, 2, dx, dy, 26);
        glow.addColorStop(0,'rgba(140,220,255,0.55)');
        glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow;
        ctx.beginPath();ctx.arc(dx, dy, 26, 0, Math.PI*2);ctx.fill();
        // Body (small saucer)
        ctx.fillStyle='#223';
        ctx.beginPath();ctx.ellipse(dx, dy, 10, 4, 0, 0, Math.PI*2);ctx.fill();
        ctx.fillStyle='#445';
        ctx.beginPath();ctx.ellipse(dx, dy-2, 6, 3, 0, 0, Math.PI*2);ctx.fill();
        // Red blinker
        const blink=(Math.sin(t*8)+1)*0.5;
        ctx.fillStyle=`rgba(255,80,80,${0.5+blink*0.5})`;
        ctx.beginPath();ctx.arc(dx+d.vx>0?-8:8, dy, 1.5, 0, Math.PI*2); ctx.fill();
        // Eye/sensor ring
        ctx.fillStyle=`rgba(140,220,255,${0.7+Math.sin(t*3)*0.2})`;
        ctx.beginPath();ctx.arc(dx, dy+1, 2, 0, Math.PI*2); ctx.fill();
      }
    }
    // Doors (one per menu entry) — each styled specifically to its content
    h.doorX.forEach((dx,i)=>{
      const sx=dx-camX;
      if(sx<-120||sx>cw+120)return;
      const m=MS_MENUS[i];
      const c=m.color;
      const near=h.nearDoor===i;
      const dw=76,dh=140,dy=floorY-dh;
      const flick=0.85+Math.sin(t*6+i)*0.1+(Math.random()<0.005?-0.2:0);
      // Heavy bulkhead frame (industrial, riveted)
      const frameCol=`rgb(${20+c[0]*0.15|0},${25+c[1]*0.15|0},${35+c[2]*0.15|0})`;
      ctx.fillStyle=frameCol;ctx.fillRect(sx-dw/2-7,dy-9,dw+14,dh+12);
      // Frame highlight (top/left)
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},0.12)`;
      ctx.fillRect(sx-dw/2-7,dy-9,dw+14,2);
      ctx.fillRect(sx-dw/2-7,dy-9,2,dh+12);
      // Rivets on frame
      ctx.fillStyle='rgba(0,0,0,0.5)';
      for(let ri=0;ri<5;ri++){const ry=dy-5+ri*(dh/4);
        ctx.beginPath();ctx.arc(sx-dw/2-4,ry,1.3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx+dw/2+4,ry,1.3,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle='rgba(180,190,210,0.35)';
      for(let ri=0;ri<5;ri++){const ry=dy-5+ri*(dh/4);
        ctx.beginPath();ctx.arc(sx-dw/2-4.3,ry-0.3,0.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx+dw/2+3.7,ry-0.3,0.5,0,Math.PI*2);ctx.fill();
      }
      // Door recess (darker back)
      ctx.fillStyle='#020610';ctx.fillRect(sx-dw/2,dy,dw,dh);
      // Door panel with diagonal gradient
      const dg=ctx.createLinearGradient(sx-dw/2,dy,sx+dw/2,dy+dh);
      dg.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${near?0.38:0.18})`);
      dg.addColorStop(0.5,`rgba(${c[0]*0.6|0},${c[1]*0.6|0},${c[2]*0.6|0},${near?0.55:0.3})`);
      dg.addColorStop(1,`rgba(${c[0]*0.3|0},${c[1]*0.3|0},${c[2]*0.3|0},${near?0.65:0.42})`);
      ctx.fillStyle=dg;ctx.fillRect(sx-dw/2,dy,dw,dh);
      // Diagonal panel cut lines (sci-fi detail)
      ctx.strokeStyle=`rgba(${c[0]},${c[1]},${c[2]},${near?0.35:0.18})`;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(sx-dw/2,dy+28);ctx.lineTo(sx-8,dy+28);ctx.lineTo(sx-4,dy+34);ctx.lineTo(sx+dw/2,dy+34);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sx-dw/2,dy+dh-34);ctx.lineTo(sx+4,dy+dh-34);ctx.lineTo(sx+8,dy+dh-28);ctx.lineTo(sx+dw/2,dy+dh-28);ctx.stroke();

      // === SPECIALIZED DOOR VIEWPORT / CONTENT WINDOW ===
      // A glowing window in the middle of each door shows a peek of what's inside
      const vpX=sx, vpY=dy+dh*0.42, vpW=dw-22, vpH=48;
      // Viewport frame
      ctx.fillStyle='#000';ctx.fillRect(vpX-vpW/2,vpY-vpH/2,vpW,vpH);
      ctx.strokeStyle=`rgba(${c[0]},${c[1]},${c[2]},${near?0.9:0.5})`;ctx.lineWidth=1.5;
      ctx.strokeRect(vpX-vpW/2,vpY-vpH/2,vpW,vpH);
      ctx.save();
      ctx.beginPath();ctx.rect(vpX-vpW/2+1,vpY-vpH/2+1,vpW-2,vpH-2);ctx.clip();
      // Fill base
      ctx.fillStyle=`rgba(${c[0]*0.15|0},${c[1]*0.15|0},${c[2]*0.15|0},1)`;
      ctx.fillRect(vpX-vpW/2,vpY-vpH/2,vpW,vpH);
      const vpL=vpX-vpW/2, vpT=vpY-vpH/2;
      if(m.id==='bridge'){
        // Starfield + pilot silhouette with console glow
        for(let si=0;si<12;si++){const ssx=vpL+((si*17+t*30)%vpW),ssy=vpT+((si*13+2)%vpH);
          ctx.fillStyle=`rgba(200,230,255,${0.5+Math.sin(t*3+si)*0.3})`;ctx.fillRect(ssx,ssy,1,1);}
        // Console line
        ctx.fillStyle='rgba(80,150,255,0.5)';ctx.fillRect(vpL,vpT+vpH-10,vpW,3);
        // Pilot head silhouette
        ctx.fillStyle='rgba(0,0,0,0.85)';ctx.beginPath();ctx.arc(vpX,vpT+vpH-12,5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(80,150,255,0.3)';ctx.fillRect(vpX-6,vpT+vpH-7,12,2);
      } else if(m.id==='starmap'){
        // Galaxy swirl
        for(let si=0;si<20;si++){
          const a=t*0.5+si*0.4;
          const r=2+si*0.8;
          const gx=vpX+Math.cos(a)*r, gy=vpY+Math.sin(a)*r*0.5;
          ctx.fillStyle=`rgba(${150+si*5},${180-si*3},255,${0.7-si*0.025})`;
          ctx.fillRect(gx,gy,1.2,1.2);
        }
        // Planet orbits
        ctx.strokeStyle='rgba(120,180,255,0.35)';ctx.lineWidth=0.5;
        ctx.beginPath();ctx.ellipse(vpX,vpY,12,5,0,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.ellipse(vpX,vpY,20,8,0,0,Math.PI*2);ctx.stroke();
        // Central star
        ctx.fillStyle='#ffd';ctx.beginPath();ctx.arc(vpX,vpY,1.8,0,Math.PI*2);ctx.fill();
      } else if(m.id==='comms'){
        // Concentric radio waves pulsing out
        for(let wi=0;wi<4;wi++){
          const wr=((t*20+wi*10)%24);
          ctx.strokeStyle=`rgba(255,120,120,${0.7-wr/24*0.7})`;ctx.lineWidth=1.2;
          ctx.beginPath();ctx.arc(vpX,vpY,wr,0,Math.PI*2);ctx.stroke();
        }
        // Antenna
        ctx.strokeStyle='#f88';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(vpX,vpY+2);ctx.lineTo(vpX,vpY-8);ctx.stroke();
        ctx.fillStyle='#f44';ctx.beginPath();ctx.arc(vpX,vpY-9,1.8,0,Math.PI*2);ctx.fill();
      } else if(m.id==='lab'){
        // Test tube with bubbling liquid
        ctx.strokeStyle='rgba(180,220,200,0.7)';ctx.lineWidth=1.2;
        ctx.strokeRect(vpX-5,vpT+6,10,vpH-12);
        // Liquid
        const liqH=(vpH-12)*0.6;
        ctx.fillStyle=`rgba(140,255,180,0.7)`;ctx.fillRect(vpX-4,vpT+vpH-6-liqH,8,liqH);
        // Bubbles
        for(let bi=0;bi<3;bi++){
          const by=vpT+vpH-6-((t*15+bi*8)%liqH);
          ctx.fillStyle='rgba(220,255,230,0.85)';
          ctx.beginPath();ctx.arc(vpX+Math.sin(t*3+bi)*2.5,by,1.2,0,Math.PI*2);ctx.fill();
        }
        // Specimen silhouette next to tube
        ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(vpX+10,vpT+vpH-14,4,10);
        ctx.beginPath();ctx.arc(vpX+12,vpT+vpH-16,2,0,Math.PI*2);ctx.fill();
      } else if(m.id==='arena'){
        // Crossed swords + sparks
        ctx.strokeStyle='rgba(255,180,100,0.9)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(vpX-10,vpY-8);ctx.lineTo(vpX+10,vpY+8);ctx.stroke();
        ctx.beginPath();ctx.moveTo(vpX-10,vpY+8);ctx.lineTo(vpX+10,vpY-8);ctx.stroke();
        // Hilts
        ctx.fillStyle='#a63';
        ctx.fillRect(vpX-12,vpY-10,4,4);ctx.fillRect(vpX+8,vpY-10,4,4);
        ctx.fillRect(vpX-12,vpY+6,4,4);ctx.fillRect(vpX+8,vpY+6,4,4);
        // Sparks
        for(let si=0;si<6;si++){const sa=t*2+si;
          const sox=Math.cos(sa)*(4+si), soy=Math.sin(sa)*(4+si);
          ctx.fillStyle=`rgba(255,${200+si*10},80,${0.9-si*0.12})`;
          ctx.fillRect(vpX+sox,vpY+soy,1.5,1.5);
        }
      } else if(m.id==='zoo'){
        // Cages with creature silhouettes pacing
        ctx.strokeStyle='rgba(80,100,80,0.8)';ctx.lineWidth=0.8;
        for(let bx=vpL+4;bx<vpL+vpW;bx+=4){
          ctx.beginPath();ctx.moveTo(bx,vpT+2);ctx.lineTo(bx,vpT+vpH-4);ctx.stroke();
        }
        // Floor
        ctx.fillStyle='rgba(60,45,30,0.6)';ctx.fillRect(vpL,vpT+vpH-6,vpW,6);
        // Creature silhouette pacing
        const pc=vpL+8+((t*10)%(vpW-16));
        ctx.fillStyle='rgba(0,0,0,0.85)';
        ctx.fillRect(pc-3,vpT+vpH-14,6,8);
        ctx.beginPath();ctx.arc(pc,vpT+vpH-16,3,0,Math.PI*2);ctx.fill();
        // Eyes glowing
        ctx.fillStyle='#f44';ctx.fillRect(pc-2,vpT+vpH-17,1,1);ctx.fillRect(pc+1,vpT+vpH-17,1,1);
      } else if(m.id==='upgrades'){
        // Rotating gear + wrench
        ctx.save();ctx.translate(vpX-5,vpY);ctx.rotate(t);
        ctx.strokeStyle='rgba(255,220,80,0.9)';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.stroke();
        for(let gi=0;gi<8;gi++){const ga=gi*Math.PI/4;
          ctx.beginPath();ctx.moveTo(Math.cos(ga)*5,Math.sin(ga)*5);ctx.lineTo(Math.cos(ga)*9,Math.sin(ga)*9);ctx.stroke();}
        ctx.fillStyle='rgba(255,220,80,0.4)';ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();
        ctx.restore();
        // Static wrench
        ctx.strokeStyle='rgba(200,200,210,0.8)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(vpX+4,vpY+6);ctx.lineTo(vpX+11,vpY-2);ctx.stroke();
        ctx.fillStyle='rgba(200,200,210,0.8)';ctx.beginPath();ctx.arc(vpX+12,vpY-3,2.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(0,0,0,0.6)';ctx.beginPath();ctx.arc(vpX+12,vpY-3,1.2,0,Math.PI*2);ctx.fill();
      } else if(m.id==='stats'){
        // Log bars + pie chart
        ctx.fillStyle='rgba(150,200,150,0.7)';
        for(let bi=0;bi<5;bi++){const bh=3+Math.abs(Math.sin(t*0.8+bi))*10;
          ctx.fillRect(vpL+4+bi*5,vpT+vpH-4-bh,3,bh);}
        // Pie
        const pcx=vpX+10, pcy=vpY;
        ctx.fillStyle='rgba(150,200,150,0.5)';ctx.beginPath();ctx.arc(pcx,pcy,7,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(255,200,50,0.7)';ctx.beginPath();ctx.moveTo(pcx,pcy);ctx.arc(pcx,pcy,7,-Math.PI/2,-Math.PI/2+Math.PI*1.2);ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(80,150,255,0.7)';ctx.beginPath();ctx.moveTo(pcx,pcy);ctx.arc(pcx,pcy,7,-Math.PI/2+Math.PI*1.2,-Math.PI/2+Math.PI*1.8);ctx.closePath();ctx.fill();
      }
      ctx.restore();
      // Viewport scanlines
      ctx.fillStyle='rgba(0,0,0,0.18)';
      for(let sl=0;sl<vpH;sl+=2)ctx.fillRect(vpX-vpW/2,vpY-vpH/2+sl,vpW,1);
      // Viewport glow
      if(near){
        const vg=ctx.createRadialGradient(vpX,vpY,0,vpX,vpY,vpW);
        vg.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},0.15)`);vg.addColorStop(1,'transparent');
        ctx.fillStyle=vg;ctx.fillRect(sx-dw/2-10,dy-10,dw+20,dh+20);
      }

      // === TOP SIGNAGE / ICON PLATE ===
      // Illuminated sign plate above door
      const signY=dy-4, signH=22;
      ctx.fillStyle='#0c1826';ctx.fillRect(sx-dw/2,signY-signH,dw,signH);
      ctx.strokeStyle=`rgba(${c[0]},${c[1]},${c[2]},0.4)`;ctx.lineWidth=1;ctx.strokeRect(sx-dw/2,signY-signH,dw,signH);
      // Animated status light (left)
      const stOn=((Math.sin(t*2+i)+1)*0.5)>0.3;
      ctx.fillStyle=stOn?`rgba(${c[0]},${c[1]},${c[2]},${0.9*flick})`:'rgba(30,30,30,0.8)';
      ctx.beginPath();ctx.arc(sx-dw/2+6,signY-signH/2,2,0,Math.PI*2);ctx.fill();
      if(stOn){
        ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},0.25)`;
        ctx.beginPath();ctx.arc(sx-dw/2+6,signY-signH/2,5,0,Math.PI*2);ctx.fill();
      }
      // Door number plate (right)
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},0.6)`;
      ctx.font='bold 7px monospace';ctx.textAlign='right';
      ctx.fillText(`${String(i+1).padStart(2,'0')}`,sx+dw/2-4,signY-signH/2+2);
      // Icon glow
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${near?flick:0.5*flick})`;
      ctx.font='18px monospace';ctx.textAlign='center';
      ctx.fillText(m.icon,sx-3,signY-5);

      // Door label with underline
      ctx.fillStyle=near?`rgba(${c[0]},${c[1]},${c[2]},0.95)`:'rgba(180,200,230,0.45)';
      ctx.font=`${near?'bold ':''}10px monospace`;
      ctx.textAlign='center';
      ctx.fillText(m.name,sx,dy+dh+16);
      ctx.strokeStyle=near?`rgba(${c[0]},${c[1]},${c[2]},0.7)`:'rgba(180,200,230,0.2)';
      ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(sx-dw/2+6,dy+dh+20);ctx.lineTo(sx+dw/2-6,dy+dh+20);ctx.stroke();

      // Floor light strip below door (brighter when near)
      const stripGrad=ctx.createLinearGradient(sx,dy+dh,sx,dy+dh+8);
      stripGrad.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${near?0.7*flick:0.25})`);
      stripGrad.addColorStop(1,'transparent');
      ctx.fillStyle=stripGrad;ctx.fillRect(sx-dw/2,dy+dh,dw,8);
      // Floor reflection
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${near?0.12:0.05})`;
      ctx.beginPath();ctx.ellipse(sx,floorY+2,dw*0.6,4,0,0,Math.PI*2);ctx.fill();
      // Hazard-stripe safety zone on floor in front of the door
      const hazY=floorY+10, hazH=5;
      ctx.save();
      ctx.beginPath(); ctx.rect(sx-dw/2-6, hazY, dw+12, hazH); ctx.clip();
      // Yellow base
      ctx.fillStyle=near?'rgba(255,220,60,0.65)':'rgba(200,180,50,0.38)';
      ctx.fillRect(sx-dw/2-6, hazY, dw+12, hazH);
      // Black diagonal slashes
      ctx.fillStyle='rgba(20,16,6,0.85)';
      for(let hx=-12; hx<dw+18; hx+=8){
        ctx.beginPath();
        ctx.moveTo(sx-dw/2+hx, hazY);
        ctx.lineTo(sx-dw/2+hx+4, hazY);
        ctx.lineTo(sx-dw/2+hx-1, hazY+hazH);
        ctx.lineTo(sx-dw/2+hx-5, hazY+hazH);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // Glowing threshold bar right at the door sill
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${near?0.9*flick:0.5})`;
      ctx.fillRect(sx-dw/2+4, dy+dh-3, dw-8, 2);
      // Warning chevrons on door frame sides (animated)
      const chev=(Math.sin(t*2+i)+1)*0.5;
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${0.3+chev*0.5})`;
      for(let chi=0;chi<3;chi++){
        const chy=dy+30+chi*38;
        ctx.beginPath();
        ctx.moveTo(sx-dw/2-10, chy);
        ctx.lineTo(sx-dw/2-4, chy+5);
        ctx.lineTo(sx-dw/2-10, chy+10);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx+dw/2+10, chy);
        ctx.lineTo(sx+dw/2+4, chy+5);
        ctx.lineTo(sx+dw/2+10, chy+10);
        ctx.closePath(); ctx.fill();
      }

      // Prompt
      if(near){
        const bob=Math.sin(t*4)*2;
        ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${0.6+Math.sin(t*5)*0.3})`;
        ctx.font='bold 10px monospace';
        ctx.textAlign='center';
        ctx.fillText('[E] ENTER',sx,dy-38+bob);
        // Sweep glow
        const glow=ctx.createRadialGradient(sx,dy+dh/2,0,sx,dy+dh/2,dw*1.4);
        glow.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},0.15)`);glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sx,dy+dh/2,dw*1.4,0,Math.PI*2);ctx.fill();
      }
    });
    // Ambient particles (drawn after doors)
    mi.ambientParticles.forEach(p=>{
      ctx.fillStyle=`rgba(${p.color[0]},${p.color[1]},${p.color[2]},${Math.min(1,p.life/30)*0.3})`;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
    });
    // Alien walking sprite (y offset from jump)
    const ax=h.x-camX, ay=floorY+(h.y||0);
    const step=Math.sin(h.walkT)*4;
    const legPhase=h.onGround?Math.sin(h.walkT):0.6;
    // Jump shadow on floor
    if(h.y<-2){
      const shAlpha=Math.max(0.08,0.35+h.y*0.01);
      ctx.fillStyle=`rgba(0,0,0,${shAlpha})`;ctx.beginPath();ctx.ellipse(ax,floorY+2,14,3,0,0,Math.PI*2);ctx.fill();
    }
    // === FLOATING HOLOGRAPHIC WAYPOINT ABOVE PLAYER ===
    // Points to the nearest non-current door
    if(h.doorX && h.doorX.length){
      // Find nearest door
      let nearestI=0, nearestD=1e9;
      h.doorX.forEach((dx,i)=>{
        const d=Math.abs(dx-h.x);
        if(d<nearestD){nearestD=d; nearestI=i;}
      });
      const isNearDoor = h.nearDoor===nearestI;
      // Only show waypoint if NOT already right at a door
      if(!isNearDoor && nearestD>40){
        const m2=MS_MENUS[nearestI];
        const c2=m2.color;
        const direction = h.doorX[nearestI] > h.x ? 1 : -1;
        const hx=ax, hy=ay-80 + Math.sin(t*2)*3;
        // Ring base (projector-style)
        ctx.strokeStyle=`rgba(${c2[0]},${c2[1]},${c2[2]},0.6)`;
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.ellipse(hx, hy+14, 18, 4, 0, 0, Math.PI*2); ctx.stroke();
        // Projector beam stem
        ctx.fillStyle=`rgba(${c2[0]},${c2[1]},${c2[2]},0.15)`;
        ctx.fillRect(hx-8, hy+6, 16, 10);
        // Hologram glow
        const hg=ctx.createRadialGradient(hx, hy, 2, hx, hy, 36);
        hg.addColorStop(0, `rgba(${c2[0]},${c2[1]},${c2[2]},0.28)`);
        hg.addColorStop(1,'transparent');
        ctx.fillStyle=hg;
        ctx.beginPath(); ctx.arc(hx, hy, 36, 0, Math.PI*2); ctx.fill();
        // Arrow
        ctx.fillStyle=`rgba(${c2[0]},${c2[1]},${c2[2]},${0.85+Math.sin(t*4)*0.15})`;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(direction, 1);
        ctx.beginPath();
        ctx.moveTo(-10, -6);
        ctx.lineTo(4, -6);
        ctx.lineTo(4, -12);
        ctx.lineTo(18, 0);
        ctx.lineTo(4, 12);
        ctx.lineTo(4, 6);
        ctx.lineTo(-10, 6);
        ctx.closePath();
        ctx.fill();
        // Inner highlight
        ctx.fillStyle=`rgba(255,255,255,${0.35+Math.sin(t*4)*0.15})`;
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(2, -4);
        ctx.lineTo(2, -9);
        ctx.lineTo(14, 0);
        ctx.lineTo(2, 9);
        ctx.lineTo(2, 4);
        ctx.lineTo(-8, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // Door name label below arrow
        ctx.fillStyle=`rgba(${c2[0]},${c2[1]},${c2[2]},0.8)`;
        ctx.font='bold 8px monospace';
        ctx.textAlign='center';
        ctx.fillText(m2.name, hx, hy+26);
        // Scanlines over hologram
        ctx.fillStyle='rgba(0,0,0,0.18)';
        for(let sl=-12; sl<18; sl+=3){
          ctx.fillRect(hx-18, hy+sl, 36, 1);
        }
      }
    }
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.35)';ctx.beginPath();ctx.ellipse(ax,ay+2,14,3,0,0,Math.PI*2);ctx.fill();
    // Player alien sprite (matches selected race/skin)
    drawAlienPreview(ax, ay, 1.0, getAlienSkin(), h.facing, h.walkT);

    // === GRAPPLING HOOK rope + claw ===
    if(h.grapple){
      const g=h.grapple;
      const handX=ax+h.facing*6, handY=ay-14;
      const tipX=(g.phase==='attached')?(g.anchorX - h.x + ax):(g.x - h.x + ax);
      const tipY=(g.phase==='attached')?(g.anchorY - h.y + ay):(g.y - h.y + ay);
      // Rope
      const rg=ctx.createLinearGradient(handX,handY,tipX,tipY);
      rg.addColorStop(0,'rgba(200,180,140,0.85)'); rg.addColorStop(1,'rgba(255,220,160,0.95)');
      ctx.strokeStyle=rg; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(tipX,tipY); ctx.stroke();
      // Hook claw at tip
      const rang=Math.atan2(tipY-handY,tipX-handX);
      ctx.save(); ctx.translate(tipX,tipY); ctx.rotate(rang);
      ctx.fillStyle='#c0a060';
      ctx.beginPath(); ctx.moveTo(-4,-3); ctx.lineTo(2,-1); ctx.lineTo(2,1); ctx.lineTo(-4,3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#e0c080'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(2,-1); ctx.lineTo(6,-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 1); ctx.lineTo(6, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(7, 0); ctx.stroke();
      if(g.phase==='attached'){
        ctx.fillStyle=`rgba(255,220,120,${0.4+Math.sin(t*6)*0.3})`;
        ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // Top HUD
    ctx.fillStyle='rgba(100,200,255,0.85)';ctx.font=`bold 16px monospace`;ctx.textAlign='center';
    ctx.fillText('MOTHERSHIP',cw/2,28);
    ctx.fillStyle='rgba(120,180,220,0.5)';ctx.font='10px monospace';
    ctx.fillText(`Score: ${score}  |  Specimens: ${mothership.specimens.length}  |  Milk: ${milkScore}`,cw/2,46);
    // Bottom hint
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='10px monospace';ctx.textAlign='center';
    ctx.fillText('A/D: Walk  |  SPACE: Jump  |  G: Grapple  |  E: Enter door  |  ESC: Exit',cw/2,ch-15);

  // ================================================================
  // BRIDGE - NPC portraits with speech
  // ================================================================
  }else if(mi.screen==='bridge'){
    const selNPC=mi.npcs[mi.selectedItem%mi.npcs.length];

    // === AMBIENT BRIDGE BACKGROUND ===
    // Starfield viewport at the back
    const vpY=60, vpH=ch*0.18, vpPad=40;
    ctx.fillStyle='rgba(0,5,20,0.7)';ctx.fillRect(vpPad,vpY,cw-vpPad*2,vpH);
    ctx.strokeStyle='rgba(80,180,255,0.2)';ctx.lineWidth=1;ctx.strokeRect(vpPad,vpY,cw-vpPad*2,vpH);
    mi._bridgeStars = mi._bridgeStars || Array.from({length:60},(_,i)=>({x:Math.random(),y:Math.random(),sp:0.3+Math.random()*1.2}));
    for(const s of mi._bridgeStars){
      s.x -= s.sp*0.002;
      if(s.x<0) s.x+=1;
      const alpha = 0.3+s.sp*0.4;
      ctx.fillStyle=`rgba(200,220,255,${alpha})`;
      ctx.fillRect(vpPad+s.x*(cw-vpPad*2), vpY+s.y*vpH, 1.5, 1.5);
    }
    // Holographic rotating planet in viewport
    const hpX=cw*0.82, hpY=vpY+vpH/2, hpR=vpH*0.35;
    ctx.save();
    ctx.globalAlpha=0.5;
    ctx.fillStyle='rgba(60,180,255,0.25)';ctx.beginPath();ctx.arc(hpX,hpY,hpR,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(100,220,255,0.6)';ctx.lineWidth=1.2;
    for(let i=0;i<4;i++){
      const off=(t*0.3+i*0.5)%(Math.PI*2);
      ctx.beginPath();ctx.ellipse(hpX,hpY,hpR,hpR*Math.abs(Math.cos(off)),0,0,Math.PI*2);ctx.stroke();
    }
    ctx.strokeStyle='rgba(100,220,255,0.3)';ctx.beginPath();ctx.ellipse(hpX,hpY,hpR*1.4,hpR*0.3,0.3,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba(150,220,255,0.5)';ctx.font='9px monospace';ctx.textAlign='center';
    ctx.fillText('⊙ NAV: '+((currentPlanet&&currentPlanet.name)||'VOID'),hpX,hpY+hpR+14);
    ctx.restore();
    // Crew silhouettes at side consoles — two background crew working
    const crewPos=[{x:vpPad+40,y:vpY+vpH-8},{x:cw-vpPad-80,y:vpY+vpH-8}];
    crewPos.forEach((cp,ci)=>{
      const bob=Math.sin(t*(1.5+ci*0.3))*1.5;
      ctx.fillStyle='rgba(20,40,80,0.9)';
      ctx.beginPath();ctx.ellipse(cp.x,cp.y+8,14,4,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(60,120,180,0.8)';
      ctx.fillRect(cp.x-7,cp.y-18+bob,14,18);
      ctx.fillStyle=ci===0?'rgba(180,140,220,0.85)':'rgba(120,200,150,0.85)';
      ctx.beginPath();ctx.arc(cp.x,cp.y-22+bob,6,0,Math.PI*2);ctx.fill();
      // Console lights
      ctx.fillStyle=`rgba(100,220,255,${0.4+Math.sin(t*4+ci)*0.3})`;
      ctx.fillRect(cp.x-10,cp.y+4,20,3);
    });

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
      const zooW=mi.zooWidth||Math.max(600, allCreatures.length*75+320);
      const floorY=ch-50;
      const ceilY=70;
      // Zoom in for closeup feel — scale the whole interior scene
      const zooZoom=1.6;
      // Camera follows alien horizontally, biased so the visible width matches zoom
      const visW=cw/zooZoom;
      const camX=Math.max(0,Math.min(Math.max(0,zooW-visW), za.x-visW/2)) - (cw-visW)/2;
      // Pivot the zoom on the floor / player area so the ground stays visible
      const pivotY=floorY-30;      // roughly where the player's torso is
      const screenPivotY=ch-90;    // where that pivot should land on screen
      ctx.save();
      ctx.translate(cw/2, screenPivotY);
      ctx.scale(zooZoom, zooZoom);
      ctx.translate(-cw/2, -pivotY);

      // === PRISON CELL INTERIOR ===
      // Back wall (concrete)
      const wallGrad=ctx.createLinearGradient(0,ceilY,0,floorY);
      wallGrad.addColorStop(0,'#2a2620');wallGrad.addColorStop(0.6,'#1a1612');wallGrad.addColorStop(1,'#100d0a');
      ctx.fillStyle=wallGrad;ctx.fillRect(0,ceilY,cw,floorY-ceilY);
      // Concrete block pattern on wall
      ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=1;
      const blockW=60,blockH=30;
      for(let by=ceilY;by<floorY;by+=blockH){
        const rowOffset=((by-ceilY)/blockH)%2===0?0:blockW/2;
        for(let bx=Math.floor((camX-rowOffset)/blockW)*blockW - rowOffset;bx<camX+cw+blockW;bx+=blockW){
          const sx=bx-camX;
          ctx.strokeRect(sx,by,blockW,blockH);
        }
        // Horizontal mortar line
        ctx.beginPath();ctx.moveTo(0,by);ctx.lineTo(cw,by);ctx.stroke();
      }
      // Grime streaks on wall
      ctx.fillStyle='rgba(0,0,0,0.25)';
      for(let i=0;i<8;i++){
        const gx=((i*217 - camX*0.5)%(cw+80)+cw+80)%(cw+80)-40;
        const gh=40+((i*13)%60);
        ctx.fillRect(gx,ceilY+(i*17)%40,3,gh);
      }
      // Barred window on back wall (occasional)
      for(let wx=0;wx<zooW;wx+=420){
        const sx=wx+180-camX;
        if(sx<-80||sx>cw+80)continue;
        const ww=80,wh=50,wy=ceilY+30;
        ctx.fillStyle='#050810';ctx.fillRect(sx,wy,ww,wh);
        // Stars beyond bars
        for(let si=0;si<6;si++){const ssx=sx+((si*17+t*3)%ww),ssy=wy+((si*13)%wh);
          ctx.fillStyle=`rgba(200,220,255,${0.4+Math.sin(t+si)*0.3})`;ctx.fillRect(ssx,ssy,1,1);}
        // Vertical bars across window
        ctx.fillStyle='#1a1a1a';ctx.strokeStyle='#3a3a3a';ctx.lineWidth=1;
        for(let bi=0;bi<5;bi++){const bbx=sx+8+bi*16;ctx.fillRect(bbx,wy,3,wh);ctx.strokeRect(bbx,wy,3,wh);}
        // Window frame
        ctx.strokeStyle='#3a3428';ctx.lineWidth=3;ctx.strokeRect(sx-2,wy-2,ww+4,wh+4);
        ctx.strokeStyle='rgba(0,0,0,0.6)';ctx.lineWidth=1;ctx.strokeRect(sx,wy,ww,wh);
      }
      // Dripping water stains
      for(let i=0;i<5;i++){
        const dx=((i*313)%zooW)-camX;
        if(dx<-10||dx>cw+10)continue;
        const dyTop=ceilY+8, dyLen=30+((i*19)%60);
        const dg=ctx.createLinearGradient(dx,dyTop,dx,dyTop+dyLen);
        dg.addColorStop(0,'rgba(60,80,60,0.5)');dg.addColorStop(1,'transparent');
        ctx.fillStyle=dg;ctx.fillRect(dx,dyTop,2,dyLen);
      }
      // Ceiling (metal plates with rivets)
      const ceilGrad=ctx.createLinearGradient(0,0,0,ceilY);
      ceilGrad.addColorStop(0,'#0a0a0a');ceilGrad.addColorStop(1,'#1a1814');
      ctx.fillStyle=ceilGrad;ctx.fillRect(0,0,cw,ceilY);
      ctx.strokeStyle='rgba(0,0,0,0.6)';ctx.lineWidth=1;
      for(let px=Math.floor(camX/120)*120;px<camX+cw+120;px+=120){
        const sx=px-camX;
        ctx.strokeRect(sx,10,120,ceilY-10);
        // Rivets
        ctx.fillStyle='rgba(90,85,75,0.8)';
        ctx.beginPath();ctx.arc(sx+8,18,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx+112,18,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx+8,ceilY-8,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx+112,ceilY-8,1.5,0,Math.PI*2);ctx.fill();
      }
      // === Horizontal cage bars along the ceiling (grapple targets) ===
      ctx.fillStyle='#1a1814';
      ctx.fillRect(0, ceilY+14, cw, 6);
      ctx.strokeStyle='rgba(0,0,0,0.65)'; ctx.lineWidth=1;
      ctx.strokeRect(0, ceilY+14, cw, 6);
      // Vertical bar segments dropping down
      ctx.fillStyle='#222018';
      for(let bx=Math.floor(camX/40)*40; bx<camX+cw+40; bx+=40){
        const sx=bx-camX;
        ctx.fillRect(sx-1, ceilY+20, 2, 10);
        // Metal sheen
        ctx.fillStyle='rgba(255,255,255,0.1)';
        ctx.fillRect(sx-1, ceilY+20, 1, 10);
        ctx.fillStyle='#222018';
      }
      // Hanging light bulbs (flicker)
      for(let lx=150;lx<zooW;lx+=300){
        const sx=lx-camX;
        if(sx<-40||sx>cw+40)continue;
        const flick=0.85+Math.sin(t*17+lx)*0.1+(Math.random()<0.02?-0.3:0);
        // Cord
        ctx.strokeStyle='#222';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(sx,ceilY);ctx.lineTo(sx,ceilY+20);ctx.stroke();
        // Bulb
        ctx.fillStyle=`rgba(255,220,140,${flick})`;
        ctx.beginPath();ctx.arc(sx,ceilY+25,5,0,Math.PI*2);ctx.fill();
        // Light cone
        const lg=ctx.createRadialGradient(sx,ceilY+25,0,sx,ceilY+25,160);
        lg.addColorStop(0,`rgba(255,220,140,${0.25*flick})`);
        lg.addColorStop(0.5,`rgba(255,200,120,${0.08*flick})`);
        lg.addColorStop(1,'transparent');
        ctx.fillStyle=lg;
        ctx.beginPath();ctx.moveTo(sx-80,ceilY+25);ctx.lineTo(sx+80,ceilY+25);ctx.lineTo(sx+120,floorY);ctx.lineTo(sx-120,floorY);ctx.closePath();ctx.fill();
      }
      // Floor (concrete with cracks)
      const floorGrad=ctx.createLinearGradient(0,floorY,0,ch);
      floorGrad.addColorStop(0,'#2a2620');floorGrad.addColorStop(1,'#0a0806');
      ctx.fillStyle=floorGrad;ctx.fillRect(0,floorY,cw,ch-floorY);
      // Floor tiles
      ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1;
      for(let fx=Math.floor((camX)/60)*60;fx<camX+cw+60;fx+=60){
        const sx=fx-camX;
        ctx.beginPath();ctx.moveTo(sx,floorY);ctx.lineTo(sx,ch);ctx.stroke();
      }
      ctx.strokeStyle='rgba(0,0,0,0.3)';
      ctx.beginPath();ctx.moveTo(0,floorY+20);ctx.lineTo(cw,floorY+20);ctx.stroke();
      // Cracks
      ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=0.7;
      for(let i=0;i<6;i++){
        const cx=((i*251)%zooW)-camX;
        if(cx<-30||cx>cw+30)continue;
        ctx.beginPath();ctx.moveTo(cx,floorY+6);ctx.lineTo(cx+10,floorY+20);ctx.lineTo(cx+4,ch-10);ctx.stroke();
      }
      // Puddle/stain occasional
      for(let i=0;i<4;i++){
        const px=((i*443)%zooW)-camX;
        if(px<-20||px>cw+20)continue;
        ctx.fillStyle='rgba(20,15,10,0.5)';
        ctx.beginPath();ctx.ellipse(px,floorY+22+(i%2)*6,14+((i*3)%8),3,0,0,Math.PI*2);ctx.fill();
      }
      // (No left/right boundary walls — more open space to walk)
      // Draw creatures — use their real walking x (within the prison cell bounds)
      allCreatures.forEach((c,i)=>{
        const cx2=(c.x!=null)?c.x:(i*80+60);
        c._zooWalkX=cx2; // store for interaction
        const sx=cx2-camX;
        if(sx<-40||sx>cw+40)return;
        const py=floorY;
        const sc=(c.scale||c.size||1);
        const lo=Math.sin((c.walkTimer||0)*3)*2;
        const bounce=c.feedAnim>0?Math.sin(c.feedAnim*0.5)*3:0;
        if(c._isCow){
          const sz=1.5*sc;
          ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(sx,py-8*sz+bounce,16*sz,10*sz,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=c.spots||'#333';ctx.beginPath();ctx.ellipse(sx-5*sz,py-11*sz+bounce,4*sz,3*sz,0.3,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=c.color||'#fff';ctx.beginPath();ctx.ellipse(sx+14*sz,py-12*sz+bounce,6*sz,5*sz,0.2,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#111';ctx.beginPath();ctx.arc(sx+17*sz,py-14*sz+bounce,1.5*sz,0,Math.PI*2);ctx.fill();
          ctx.strokeStyle=c.color||'#fff';ctx.lineWidth=2*sz;
          [[-10,-1],[-4,-1],[5,-1],[11,-1]].forEach(([ox])=>{ctx.beginPath();ctx.moveTo(sx+ox*sz,py-1*sz);ctx.lineTo(sx+ox*sz+(ox<0?lo:-lo),py+4*sz);ctx.stroke();});
        }else{
          // Humans & aliens — use the full renderHuman() with synthesized physics positions
          // so they look exactly like what was captured.
          const s=sc, bw=c.bodyWidth||5;
          const headR=4*s;
          const ph=(c.walkTimer||0)*0.25;
          const legSwing=Math.sin(ph)*3*s;
          const armSwing=-Math.sin(ph)*2*s;
          const bob=Math.abs(Math.sin(ph))*1*s+bounce;
          const bodyX=sx, bodyY=py-14*s-bob;
          const headX=bodyX, headY=bodyY-8*s-headR;
          const legLX=bodyX-2*s-legSwing, legLY=py-5*s;
          const legRX=bodyX+2*s+legSwing, legRY=py-5*s;
          const footLX=bodyX-3*s-legSwing*1.2, footLY=py;
          const footRX=bodyX+3*s+legSwing*1.2, footRY=py;
          const armLX=bodyX-6*s+armSwing, armLY=bodyY-4*s;
          const armRX=bodyX+6*s-armSwing, armRY=bodyY-4*s;
          const tmp={
            ...c,
            scale:s, bodyWidth:bw, headR,
            bodyX, bodyY, headX, headY,
            legLX, legLY, legRX, legRY, footLX, footLY, footRX, footRY,
            armLX, armLY, armRX, armRY,
            walkDir: c.walkDir||1,
            ragdoll:false, beingBeamed:false, onFire:false,
            panicLevel: c.panicLevel||0,
            color: c.color||(c.isAlien?'#8a8':'#558'),
            skinColor: c.skinColor||(c.isAlien?(c.color||'#8a8'):'#c9a87c'),
          };
          renderHuman(tmp);
        }
        // Name tag
        ctx.fillStyle='rgba(50,255,80,0.4)';ctx.font='7px monospace';ctx.textAlign='center';
        ctx.fillText(c.label||'?',sx,py-30*sc+bounce);
      });

      // Draw player alien — full detailed model with skin
      const ax=za.x-camX, ay=za.y;
      // Shadow (fades when airborne)
      const airFrac=Math.max(0, Math.min(1, (floorY-ay)/220));
      ctx.fillStyle=`rgba(0,0,0,${0.4*(1-airFrac*0.7)})`;
      ctx.beginPath();ctx.ellipse(ax,floorY+2,10*(1-airFrac*0.5),2.5*(1-airFrac*0.5),0,0,Math.PI*2);ctx.fill();
      drawAlienPreview(ax, ay, 1.0, getAlienSkin(), za.facing, za.walkTimer);

      // === GRAPPLING HOOK rope + claw ===
      if(za.grapple){
        const g=za.grapple;
        const handX=ax+za.facing*6, handY=ay-14;
        const tipX=(g.phase==='attached')?(g.anchorX - za.x + ax):(g.x - za.x + ax);
        const tipY=(g.phase==='attached')?(g.anchorY):(g.y);
        const rg=ctx.createLinearGradient(handX,handY,tipX,tipY);
        rg.addColorStop(0,'rgba(200,180,140,0.85)'); rg.addColorStop(1,'rgba(255,220,160,0.95)');
        ctx.strokeStyle=rg; ctx.lineWidth=1.4;
        ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(tipX,tipY); ctx.stroke();
        const rang=Math.atan2(tipY-handY,tipX-handX);
        ctx.save(); ctx.translate(tipX,tipY); ctx.rotate(rang);
        ctx.fillStyle='#c0a060';
        ctx.beginPath(); ctx.moveTo(-4,-3); ctx.lineTo(2,-1); ctx.lineTo(2,1); ctx.lineTo(-4,3); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='#e0c080'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(2,-1); ctx.lineTo(6,-3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, 1); ctx.lineTo(6, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(7, 0); ctx.stroke();
        if(g.phase==='attached'){
          ctx.fillStyle=`rgba(255,220,120,${0.4+Math.sin(t*6)*0.3})`;
          ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore(); // end zoom

      // Dim vignette
      const vg=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.3,cw/2,ch/2,Math.max(cw,ch)*0.65);
      vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.55)');
      ctx.fillStyle=vg;ctx.fillRect(0,0,cw,ch);

      // HUD
      ctx.fillStyle='rgba(200,180,120,0.7)';ctx.font='9px monospace';ctx.textAlign='center';
      ctx.fillText('A/D: Walk  |  SPACE: Jump  |  G: Grapple  |  E: Interact  |  X: List view  |  ESC: Back',cw/2,ch-5);
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
          // Behavior state indicators
          if(c._state==='sleep'){
            ctx.fillStyle='rgba(180,220,255,0.8)';ctx.font=`${Math.round(6*sz+4)}px monospace`;ctx.textAlign='left';
            const z=Math.sin(t*2)*2;
            ctx.fillText('z',px+4*sz,py-12*sz+z);
            ctx.fillText('Z',px+6*sz,py-16*sz+z*0.5);
          } else if(c._state==='fight'){
            // Red puff
            ctx.fillStyle=`rgba(255,120,60,${0.5+Math.sin(t*8)*0.3})`;
            ctx.beginPath();ctx.arc(px+Math.sin(t*10)*3*sz,py-12*sz,2.2*sz,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='rgba(255,255,120,0.9)';ctx.font=`bold ${Math.round(6*sz+3)}px monospace`;ctx.textAlign='center';
            if(((t*6)|0)%2===0) ctx.fillText('!',px,py-14*sz);
          } else if(c._state==='eat'){
            ctx.fillStyle='rgba(160,120,80,0.7)';
            ctx.beginPath();ctx.arc(px,py+1,2*sz,0,Math.PI*2);ctx.fill();
            if(((t*4)|0)%2===0){
              ctx.fillStyle='rgba(255,240,120,0.9)';ctx.font=`${Math.round(5*sz+3)}px monospace`;ctx.textAlign='center';
              ctx.fillText('*',px,py-12*sz);
            }
          }
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
  }else if(mi.screen==='starmap'){
    drawStarmap();
  }else if(mi.screen==='arena'){
    drawArena();
  }else if(mi.screen==='lab'){
    drawLab();
  }

  // Zoo riot overlay (drawn on top of zoo)
  if(mi.screen==='zoo'&&mi.riot&&mi.riot.active)drawZooRiot();

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
    // Snap Earth-orbiting bodies (the moon) to their correct orbital positions BEFORE
    // the first space frame renders. Without this the moon flashes on top of Earth for
    // a moment because orbit tick doesn't run during the leaving transition.
    const _earthP = planets.find(pp=>pp.id==='earth');
    if(_earthP){
      planets.forEach(pp=>{
        if(!pp.orbitsEarth) return;
        const ang = (pp.orbitAngle!=null) ? pp.orbitAngle : (pp.initOrbitAngle||0);
        pp.spaceX = _earthP.spaceX + Math.cos(ang) * pp.orbitRadius;
        pp.spaceY = _earthP.spaceY + Math.sin(ang) * pp.orbitRadius;
      });
    }
  }
  gameMode = 'space';
  playerMode = 'ship';
  worldWidth = 6000; // reset to default
  earthMilitaryBases = [];
  ship.vx = 0; ship.vy = -2;
  saveGame(); // auto-save when leaving planet
  blocks=[]; buildings=[]; humans=[]; particles=[]; debris=[]; tears=[]; cows=[];
  bloodPools=[]; gibs=[]; skidMarks=[]; bloodDroplets=[];
  speechBubbles=[]; missiles=[]; fires=[]; clouds=[]; vehicles=[]; weather=[]; hazards=[]; turrets=[]; laserShots=[]; military=[];
  stunWaves=[]; plasmaBolts=[]; gravityWells=[]; parasites=[]; ashPiles=[]; acidPuddles=[]; rockets=[]; chainsawSlashes=[]; chainsawRev=0;
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
  // Rebinding capture: if a settings binding is waiting, consume this key as the new binding
  if(window._mmAwaitBind){
    const raw=e.key.toLowerCase();
    if(raw!=='escape' && raw!=='tab'){ // allow ESC to cancel; tab reserved but allowed if user chooses
      keyBindings[window._mmAwaitBind]=raw;
      saveKeyBindings();
      _physToCanon=buildPhysicalToCanonical();
    }
    window._mmAwaitBind=null;
    e.preventDefault();
    return;
  }
  if (mainMenuMode) { keys[e.key.toLowerCase()]=true; if(e.key==='Enter')keys['enter']=true; e.preventDefault(); return; }
  if (pauseMenu.active) { keys[e.key.toLowerCase()]=true; if(e.key==='Enter')keys['enter']=true; if(e.key==='Escape')keys['escape']=true; e.preventDefault(); return; }
  let k=e.key.toLowerCase();
  // Translate physical→canonical for rebound keys
  if(_physToCanon[k]) k=_physToCanon[k];
  // ESC opens pause menu (not in mothership — mothership has its own ESC handling)
  if(k==='escape'&&gameStarted&&!mothershipMode&&!pyramidInteriorMode){pauseMenu.active=true;pauseMenu.sel=0;pauseMenu._cool=10;e.preventDefault();keys[k]=true;return;}
  if (!keys[k]&&k==='enter'&&gameMode==='planet'&&!mothershipMode&&!pyramidInteriorMode&&!pauseMenu.active) togglePlayerMode();
  if (!keys[k]&&k==='b'&&gameMode==='planet'&&!mothershipMode&&!pyramidInteriorMode&&!pauseMenu.active){
    if(playerMode==='onfoot') hijackNearestVehicle();
    else if(playerMode==='ship') ejectFromShipIntoVehicle();
  }
  if (!keys[k]&&k==='e'&&playerMode==='ship'&&!mothershipMode) repulsorBlast();
  if (!keys[k]&&k==='e'&&playerMode==='onfoot'&&gameMode==='planet'&&!mothershipMode&&!pyramidInteriorMode){ interactScavenge(); }
  if (!keys[k]&&k==='n'&&gameMode==='planet'&&playerMode==='ship') nukeplanet();
  if (!keys[k]&&k==='v'&&gameMode==='planet'&&playerMode==='ship'&&shipCloak.energy>10){shipCloak.active=!shipCloak.active;showMessage(shipCloak.active?'Cloak engaged':'Cloak disengaged');}
  if (!keys[k]&&k==='q'&&missileCooldown<=0&&playerMode==='ship') fireMissile();
  if (k==='g'&&playerMode==='ship')ship.minigunFiring=true;
  if (!keys[k]&&k==='c'&&playerMode==='ship'&&gameMode==='planet'&&!mothershipMode) toggleLasso();
  // Vehicle cloak: while driving a hijacked vehicle, 'v' toggles cloak (matches ship cloak; no energy limit).
  if (!keys[k]&&k==='v'&&playerMode==='onfoot'&&alien.drivingVehicle&&gameMode==='planet'&&!mothershipMode&&!pyramidInteriorMode){
    const v=alien.drivingVehicle;
    v.cloaked=!v.cloaked;
    showMessage(v.cloaked?'Vehicle cloak engaged':'Vehicle cloak disengaged');
  }
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
  if(!keys[k]&&k==='t'&&playerMode==='onfoot'&&gameMode==='planet'&&!mothershipMode&&!pyramidInteriorMode){toggleMindControl();return;}
  if(!keys[k]&&k==='m'){window._muted=!window._muted;
    [spaceAmbience,flameSfx,beamSfx,alienVoiceSfx,missileSfx,lassoSfx,nukeSfx,underwaterSfx,mothershipMusic,prehistoricMusic,vehicleSplatSfx,...Object.values(planetMusic)].forEach(a=>{a.muted=!!window._muted;});
    showMessage(window._muted?'Audio muted':'Audio unmuted');return;}
  keys[k]=true;
  if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
});
document.addEventListener('keyup', e => {
  let k=e.key.toLowerCase();
  if(_physToCanon[k]) k=_physToCanon[k];
  keys[k]=false;
  if(e.key==='Enter')keys['enter']=false;
  if(k==='g')ship.minigunFiring=false;
});

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
  blocks.forEach(b=>{const d=dist(bx,by,b.x+b.w/2,b.y+b.h/2);if(d<R){const f=(1-d/R)*F,a=Math.atan2(b.y+b.h/2-by,b.x+b.w/2-bx);b.fixed=false;b.vx+=Math.cos(a)*f;b.vy+=Math.sin(a)*f;b.health-=f*10;maybeEvictFromDamage(b);b.cracked=true;checkBuildingDestroyed(b);}});
  humans.forEach(h=>{if(h.collected)return;const d=dist(bx,by,h.bodyX,h.bodyY);if(d<R){const f=(1-d/R)*F*0.8,a=Math.atan2(h.bodyY-by,h.bodyX-bx);h.ragdoll=true;h.crying=true;h.panicLevel=10;const fx=Math.cos(a)*f,fy=Math.sin(a)*f;applyForce(h,fx,fy);bleedEffect(h,fx,fy,1.5); if(d<R*0.5)spawnGibs(h,fx,fy,2);}});
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
function bleedEffect(h,fx,fy,power){
  const c=getBleedColor(h);
  const N=power||1;
  // Blood spray particles
  for(let i=0;i<6*N;i++)particles.push({x:h.bodyX+(Math.random()-0.5)*10,y:h.bodyY+(Math.random()-0.5)*10,
    vx:fx*0.2+(Math.random()-0.5)*3.5,vy:fy*0.2+(Math.random()-0.5)*3.5-1,life:25+Math.random()*20,color:c,size:Math.random()*3+1,gravity:0.15});
  // Blood drops that arc and land → spawn pool
  for(let i=0;i<2*N;i++){
    const gy=(h.groundY!=null?h.groundY:(typeof GROUND_LEVEL!=='undefined'?GROUND_LEVEL:h.bodyY+40));
    bloodDroplets.push({x:h.bodyX,y:h.bodyY-5,vx:fx*0.15+(Math.random()-0.5)*3,vy:fy*0.15-1-Math.random()*2,groundY:gy,color:c,size:1.5+Math.random()*1.5});
  }
}
// Single-frame droplet tracker — non-persistent; when they hit ground they spawn a blood pool
let bloodDroplets=[];
function stepBloodDroplets(){
  for(let i=bloodDroplets.length-1;i>=0;i--){
    const d=bloodDroplets[i];
    d.vy+=0.35; d.x+=d.vx; d.y+=d.vy;
    if(d.y>=d.groundY){
      bloodPools.push({x:d.x,y:d.groundY,r:d.size*0.5,targetR:2+Math.random()*3,life:1200,maxLife:1200,color:d.color});
      bloodDroplets.splice(i,1);
    }
  }
}
function spawnGibs(h,ix,iy,power){
  const c=getBleedColor(h);
  const bodyC=(h.color||'#558');
  const skin=(h.skinColor||'#c9a87c');
  const P=power||1;
  // Big blood burst
  bleedEffect(h,ix,iy,1+P);
  // Limb chunks
  const parts=['arm','leg','head','torso','hand','foot'];
  const gy=(h.groundY!=null?h.groundY:(typeof GROUND_LEVEL!=='undefined'?GROUND_LEVEL:h.bodyY+40));
  const n=3+((P*2)|0);
  for(let i=0;i<n;i++){
    const kind=parts[(Math.random()*parts.length)|0];
    const sz=kind==='head'?5:(kind==='torso'?7:(kind==='hand'||kind==='foot'?3:4));
    gibs.push({x:h.bodyX+(Math.random()-0.5)*6, y:h.bodyY+(Math.random()-0.5)*10,
      vx:ix*0.25+(Math.random()-0.5)*6, vy:iy*0.25-2-Math.random()*4,
      rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.4,
      size:sz, life:240+Math.random()*120, kind, color:kind==='torso'?bodyC:skin, bloodC:c, groundY:gy, onGround:false});
  }
  // Big pool under kill site
  bloodPools.push({x:h.bodyX,y:gy,r:1,targetR:14+Math.random()*10+P*4,life:1500,maxLife:1500,color:c});
}
function stepGibs(){
  for(let i=gibs.length-1;i>=0;i--){
    const g=gibs[i];
    if(!g.onGround){
      g.vy+=0.35; g.vx*=0.99; g.x+=g.vx; g.y+=g.vy; g.rot+=g.rotV;
      if(g.y>=g.groundY-g.size*0.3){
        g.y=g.groundY-g.size*0.3; g.onGround=true;
        g.vx*=0.2; g.vy=0; g.rotV*=0.2;
        // Splat — drop a small pool
        bloodPools.push({x:g.x,y:g.groundY,r:1,targetR:3+Math.random()*3,life:900,maxLife:900,color:g.bloodC});
        // Blood spray on impact
        for(let j=0;j<3;j++)particles.push({x:g.x,y:g.groundY-2,vx:(Math.random()-0.5)*2,vy:-0.5-Math.random()*1.5,life:15,color:g.bloodC,size:1+Math.random()});
      }
    }
    g.life--;
    if(g.life<=0)gibs.splice(i,1);
  }
}
function stepBloodPools(){
  for(let i=bloodPools.length-1;i>=0;i--){
    const p=bloodPools[i];
    if(p.r<p.targetR)p.r+=0.18;
    p.life--;
    if(p.life<=0)bloodPools.splice(i,1);
  }
}
function stepSkidMarks(){
  for(let i=skidMarks.length-1;i>=0;i--){
    const s=skidMarks[i]; s.life--;
    if(s.life<=0)skidMarks.splice(i,1);
  }
}
function drawBloodPools(){
  for(const p of bloodPools){
    const sx=p.x-camera.x, sy=p.y-camera.y;
    if(sx<-40||sx>canvas.width+40||sy<-20||sy>canvas.height+20)continue;
    const fade=Math.min(1,p.life/p.maxLife);
    ctx.fillStyle=p.color;ctx.globalAlpha=0.35+fade*0.45;
    ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r*0.4,0,0,Math.PI*2);ctx.fill();
    // Darker inner
    ctx.globalAlpha=0.3*fade;
    ctx.fillStyle='#1a0000';
    ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*0.55,p.r*0.22,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
}
function drawGibs(){
  for(const g of gibs){
    const sx=g.x-camera.x, sy=g.y-camera.y;
    if(sx<-30||sx>canvas.width+30||sy<-30||sy>canvas.height+30)continue;
    ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rot);
    // Trailing blood stream while airborne
    if(!g.onGround && Math.random()<0.4){
      particles.push({x:g.x,y:g.y,vx:(Math.random()-0.5)*0.5,vy:0.5+Math.random(),life:12,color:g.bloodC,size:1+Math.random()});
    }
    ctx.fillStyle=g.color;
    if(g.kind==='head'){
      ctx.beginPath();ctx.ellipse(0,0,g.size,g.size*1.15,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';ctx.fillRect(-1.5,-0.5,1.3,1.3);ctx.fillRect(0.3,-0.5,1.3,1.3);
    } else if(g.kind==='torso'){
      ctx.fillRect(-g.size*0.7,-g.size,g.size*1.4,g.size*2);
    } else if(g.kind==='arm'||g.kind==='leg'){
      ctx.fillRect(-g.size*0.3,-g.size,g.size*0.6,g.size*2);
      ctx.fillStyle=g.bloodC;ctx.fillRect(-g.size*0.35,-g.size-0.5,g.size*0.7,1);
    } else {
      ctx.fillRect(-g.size*0.6,-g.size*0.6,g.size*1.2,g.size*1.2);
    }
    ctx.restore();
  }
}
function drawSkidMarks(){
  for(const s of skidMarks){
    const sx=s.x-camera.x;
    if(sx<-60||sx>canvas.width+60)continue;
    const fade=s.life/s.maxLife;
    ctx.fillStyle=`rgba(20,20,20,${0.45*fade})`;
    ctx.fillRect(s.x-s.w/2,s.y,s.w,2);
  }
}
function applyForce(h,fx,fy){h.headVX+=fx;h.headVY+=fy;h.bodyVX+=fx;h.bodyVY+=fy;h.legLVX+=fx*0.8;h.legLVY+=fy*0.8;h.legRVX+=fx*0.8;h.legRVY+=fy*0.8;h.armLVX+=fx*1.2;h.armLVY+=fy*1.2;h.armRVX+=fx*1.2;h.armRVY+=fy*1.2;h.footLVX+=fx*0.7;h.footLVY+=fy*0.7;h.footRVX+=fx*0.7;h.footRVY+=fy*0.7;}

// Occupants themed per building type — the unit that flees out when a building is hit/destroyed
// should look like it belongs there (priest from a church, farmer from a barn, etc.).
const BUILDING_OCCUPANTS = {
  church:     {label:'Priest',     color:'#1a1a1a', skinColor:'#d8b892', hat:'collar',  extra:'cross'},
  mosque:     {label:'Imam',       color:'#e8e8e8', skinColor:'#c9a478', hat:'headband',extra:null},
  temple:     {label:'Monk',       color:'#c27030', skinColor:'#d8b070', hat:'bun',     extra:null},
  shop:       {label:'Shopkeeper', color:'#4860a0', skinColor:'#d8b892', hat:'cap',     extra:'briefcase'},
  market:     {label:'Merchant',   color:'#803030', skinColor:'#c9a060', hat:'straw',   extra:'backpack'},
  barn:       {label:'Farmer',     color:'#6a8030', skinColor:'#c9a060', hat:'straw',   extra:'cane'},
  silo:       {label:'Farmer',     color:'#6a8030', skinColor:'#c9a060', hat:'straw',   extra:null},
  farmhouse:  {label:'Farmer',     color:'#6a5030', skinColor:'#c9a060', hat:'straw',   extra:null},
  cottage:    {label:'Villager',   color:'#705030', skinColor:'#c9a060', hat:'straw',   extra:null},
  suburbanHouse:{label:'Resident', color:'#4458a0', skinColor:'#d8b892', hat:'cap',     extra:null},
  skyscraper: {label:'Office Worker', color:'#303050', skinColor:'#d8b892', hat:'cap',  extra:'briefcase'},
  adobe:      {label:'Villager',   color:'#a06030', skinColor:'#b88050', hat:'headband',extra:null},
  hut:        {label:'Hunter',     color:'#6a4820', skinColor:'#9c6838', hat:'feather', extra:'cane'},
  igloo:      {label:'Inuit',      color:'#f0f0f0', skinColor:'#d8b892', hat:'bun',     extra:'belly'},
  dome:       {label:'Scientist',  color:'#ffffff', skinColor:'#d8b892', hat:'collar',  extra:'briefcase'},
  militaryBase:{label:'Soldier',   color:'#445c30', skinColor:'#d8b892', hat:'cap',     extra:null},
};

function dressHumanForBuilding(h, buildingType){
  const o = BUILDING_OCCUPANTS[buildingType];
  if(!o) return; // no theming for trees, silos etc.
  h.label = o.label;
  if(o.color) h.color = o.color;
  if(o.skinColor) h.skinColor = o.skinColor;
  h.hat = o.hat;
  h.extra = o.extra;
}

// Kick a hidden inhabitant out of a damaged building. Used both on destruction
// and on first-cracked damage (with a probability) so shooting a church sees a priest flee.
function evictInhabitant(h, b){
  if(!h.hidden) return;
  h.hidden = false;
  h.panicLevel = 8;
  h.crying = true;
  h.walkSpeed = 2.5;
  h.walkDir = Math.random() > 0.5 ? 1 : -1;
  h.bodyX = b.x + Math.random() * b.w;
  h.headX = h.bodyX;
  h.bodyY = GROUND_LEVEL - 15;
  h.headY = h.bodyY - 15;
  // Theme the unit to match the building they came from.
  dressHumanForBuilding(h, b.buildingType);
  // Burst out effect
  for(let i=0;i<6;i++) debris.push({x:h.bodyX,y:h.bodyY,vx:(Math.random()-0.5)*4,vy:-Math.random()*3-1,
    life:25+Math.random()*15,size:Math.random()*2+1,color:b.color||'#888'});
}

// Mind control — hijack the nearest human. While controlled, A/D walks them, jumping with SPACE.
// Toggle off (or they die) to release. Alien stays frozen in place while controlling.
let mindControl = null; // {target, duration}
function toggleMindControl(){
  if(mindControl){
    if(mindControl.target){mindControl.target.mindControlled=false;mindControl.target.panicLevel=10;}
    mindControl=null; showMessage('Mind link severed'); return;
  }
  // Find nearest non-collected, non-ragdoll human within 260
  let best=null, bestD=260;
  for(const h of humans){
    if(h.collected||h.hidden||h.ragdoll||h.isDino)continue;
    const d=dist(alien.x,alien.y,h.bodyX,h.bodyY);
    if(d<bestD){bestD=d; best=h;}
  }
  if(!best){showMessage('No target in range'); return;}
  best.mindControlled=true; best.panicLevel=0; best.crying=false; best.stunTimer=0;
  mindControl = {target:best, duration:600};
  showMessage('Mind link established — A/D to walk the puppet');
}

// E-key on foot: scavenge UFO wrecks or breach hidden bunkers when near one.
function interactScavenge(){
  // UFO wreck
  for(const w of ufoWrecks){
    if(w.scavenged)continue;
    if(Math.abs(alien.x-w.x)<50 && Math.abs(alien.y-w.y)<60){
      w.scavenged=true;
      const bonus=100+Math.floor(Math.random()*150);
      score+=bonus;
      document.getElementById('score').textContent=score;
      // Effect
      for(let i=0;i<18;i++){
        const a=Math.random()*Math.PI*2;
        particles.push({x:w.x,y:w.y-6,vx:Math.cos(a)*(1+Math.random()*3),vy:Math.sin(a)*(1+Math.random()*3)-1,life:30,color:['#8cf','#cef','#ff8'][Math.floor(Math.random()*3)],size:Math.random()*2+1});
      }
      playSound && playSound('collect');
      triggerShake(2);
      showMessage('Scavenged alien tech +'+bonus);
      return;
    }
  }
  // Bunker
  for(const bk of hiddenBunkers){
    if(bk.looted)continue;
    if(Math.abs(alien.x-(bk.x+bk.w/2))<40){
      bk.looted=true;
      const bonus=250+Math.floor(Math.random()*300);
      score+=bonus;
      document.getElementById('score').textContent=score;
      // Spawn 1-2 captive prisoners at the hatch that flee — quick abduction fodder
      for(let i=0;i<2;i++){
        if(typeof generateInhabitant==='function'){
          generateInhabitant(bk.x+bk.w/2+(Math.random()-0.5)*30);
          const h=humans[humans.length-1];
          if(h){ h.panicLevel=10; h.crying=true; h.walkSpeed=2.5; h.walkDir=Math.random()<0.5?-1:1; h.label=(h.label||'Captive')+' (rescued)'; }
        }
      }
      // Smoke + flash
      for(let i=0;i<20;i++){
        particles.push({x:bk.x+bk.w/2+(Math.random()-0.5)*bk.w,y:GROUND_LEVEL-10,vx:(Math.random()-0.5)*2,vy:-Math.random()*3,life:40,color:['#333','#555','#777','#fa4'][Math.floor(Math.random()*4)],size:Math.random()*3+2});
      }
      triggerShake(4);
      playSound && playSound('explosion');
      showMessage('Bunker breached! +'+bonus+' — prisoners released');
      return;
    }
  }
}

// On first damage (not destruction) — small chance one hidden occupant bursts out.
// Call this right before `b.cracked = true` so we only fire once per building.
function maybeEvictFromDamage(b){
  if(!b || !b.building || b._evicted) return;
  if(b.cracked) return; // already cracked, only first strike evicts
  if(Math.random() > 0.35) return; // ~35% of first hits spawn a fleeing occupant
  const candidates = humans.filter(h => h.hidden && h.hideBuilding === b.building);
  if(candidates.length === 0) return;
  const h = candidates[Math.floor(Math.random() * candidates.length)];
  evictInhabitant(h, b);
  b._evicted = true;
  showMessage(`A ${h.label} flees the ${b.buildingType||'building'}!`);
}

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
  // Release hidden inhabitants (themed to the building)
  humans.forEach(h=>{ if(h.hidden && h.hideBuilding===b.building) evictInhabitant(h,b); });
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
  if(type==='missile'){try{missileSfx.currentTime=0;missileSfx.play().catch(()=>{});}catch(e){}return;}
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
  else if(type==='splat'){const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*0.2,audioCtx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*12);const src=audioCtx.createBufferSource();src.buffer=buf;const g=audioCtx.createGain();g.gain.setValueAtTime(0.18,now);g.gain.exponentialRampToValueAtTime(0.01,now+0.2);src.connect(g);g.connect(audioCtx.destination);src.start(now);return;}
  }catch(e){}
}
function fireMissile(){if(!gameStarted||gameMode==='space')return;missileCooldown=20;missiles.push({x:ship.x,y:ship.y+15,vx:ship.vx*0.3,vy:5,life:300,trail:[]});playSound('missile');}

// Lasso / grapple hook — attach to nearest building or unit and drag it around.
function toggleLasso(){
  if(!gameStarted||gameMode!=='planet'||mothershipMode)return;
  if(ship.lasso){
    // Release — hurl the target in the direction the ship is moving (telekinetic throw)
    const l=ship.lasso, tgt=l.target;
    if(tgt){
      const throwVX = ship.vx*2.8, throwVY = ship.vy*2.8 - 4;
      if(l.targetType==='block'){
        tgt.lassoed=false;
        tgt.vx=(tgt.vx||0)+throwVX; tgt.vy=(tgt.vy||0)+throwVY;
        tgt.thrown=60;
      } else if(l.targetType==='human'){
        tgt.lassoed=false;
        applyForce(tgt, throwVX, throwVY);
        tgt.ragdoll=true; tgt.panicLevel=10;
      } else if(l.targetType==='vehicle'){
        tgt.lassoed=false;
        tgt.vx=(tgt.vx||0)+throwVX; tgt.vy=(tgt.vy||0)+throwVY;
        tgt.airborne=true;
      }
    }
    ship.lasso=null;
    showMessage('Thrown!');
    return;
  }
  // Find closest target in range
  const range=340;
  let best=null, bestD=range;
  // Buildings (prefer non-tree fixed structures first)
  for(const b of blocks){
    if(b.dead||b.collected)continue;
    if(b.isTree)continue; // trees are too many — skip to avoid spam
    const bcx=b.x+b.w/2, bcy=b.y+b.h/2;
    const d=Math.hypot(bcx-ship.x, bcy-ship.y);
    if(d<bestD){bestD=d; best={targetType:'block', target:b};}
  }
  // Humans
  for(const h of humans){
    if(h.collected||h.hidden)continue;
    const d=Math.hypot(h.bodyX-ship.x, h.bodyY-ship.y);
    if(d<bestD){bestD=d; best={targetType:'human', target:h};}
  }
  // Vehicles
  for(const v of vehicles){
    if(!v.alive)continue;
    const vcx=v.x+(v.w||40)/2, vcy=v.y-(v.h||20)/2;
    const d=Math.hypot(vcx-ship.x, vcy-ship.y);
    if(d<bestD){bestD=d; best={targetType:'vehicle', target:v};}
  }
  if(!best){showMessage('No lasso target in range');return;}
  if(best.targetType==='block'){
    const b=best.target;
    b.fixed=false;
    b.lassoed=true;
    // Detach from building so uprooting doesn't insta-destroy the parent
    if(b.building){b.building.destroyed=true;}
  } else if(best.targetType==='human'){
    best.target.lassoed=true;
    best.target.ragdoll=true;
    best.target.crying=true;
    best.target.panicLevel=10;
  } else if(best.targetType==='vehicle'){
    best.target.lassoed=true;
    best.target.airborne=true;
  }
  ship.lasso={targetType:best.targetType, target:best.target};
  try{lassoSfx.currentTime=0;lassoSfx.play().catch(()=>{});}catch(e){}
  showMessage('Lasso attached!');
}

// Per-frame lasso physics — called from the main update loop when ship.lasso is active.
function updateLasso(){
  const l=ship.lasso; if(!l)return;
  const tgt=l.target;
  // Auto-release conditions
  if(!tgt||tgt.dead||tgt.collected||tgt.hidden||(l.targetType==='vehicle'&&!tgt.alive)){ship.lasso=null;return;}
  let tx,ty;
  if(l.targetType==='block'){tx=tgt.x+tgt.w/2; ty=tgt.y+tgt.h/2;}
  else if(l.targetType==='vehicle'){tx=tgt.x+(tgt.w||40)/2; ty=tgt.y-(tgt.h||20)/2;}
  else {tx=tgt.bodyX; ty=tgt.bodyY;}
  const dx=ship.x-tx, dy=(ship.y+20)-ty;
  const d=Math.hypot(dx,dy)||1;
  // Break if yanked too far
  if(d>700){
    if(l.targetType==='block')tgt.lassoed=false;
    else tgt.lassoed=false;
    ship.lasso=null; showMessage('Lasso snapped!'); return;
  }
  // Spring pull — stronger the further it is, but capped
  const desiredLen=90;
  const stretch=Math.max(0, d-desiredLen);
  const pull=Math.min(0.9, stretch*0.012);
  const ux=dx/d, uy=dy/d;
  if(l.targetType==='block'){
    tgt.vx += ux*pull;
    tgt.vy += uy*pull - 0.25; // counter gravity so it hangs
    tgt.vx*=0.96; tgt.vy*=0.96;
    // Damage things the dragged block slams into
    blocks.forEach(o=>{
      if(o===tgt||o.dead||!o.fixed)return;
      if(tgt.x<o.x+o.w&&tgt.x+tgt.w>o.x&&tgt.y<o.y+o.h&&tgt.y+tgt.h>o.y){
        const speed=Math.hypot(tgt.vx,tgt.vy);
        if(speed>2){
          o.health-=speed*4;
          maybeEvictFromDamage(o);
          o.cracked=true;
          checkBuildingDestroyed(o);
        }
      }
    });
  } else if(l.targetType==='vehicle'){
    tgt.vx = (tgt.vx||0) + ux*pull*1.2;
    tgt.vy = (tgt.vy||0) + uy*pull*1.2 - 0.35;
    tgt.vx*=0.94; tgt.vy*=0.94;
    tgt.airborne=true;
    // Slam damage to buildings on contact
    blocks.forEach(o=>{
      if(o.dead||!o.fixed)return;
      if(tgt.x<o.x+o.w && tgt.x+tgt.w>o.x && tgt.y-tgt.h<o.y+o.h && tgt.y>o.y){
        const speed=Math.hypot(tgt.vx,tgt.vy);
        if(speed>3){
          o.health-=speed*3; maybeEvictFromDamage(o); o.cracked=true; checkBuildingDestroyed(o);
        }
      }
    });
  } else {
    // Human — pull all body parts
    const parts=['head','body','legL','legR','armL','armR','footL','footR'];
    parts.forEach(pt=>{
      tgt[pt+'VX']=(tgt[pt+'VX']||0) + ux*pull*0.8;
      tgt[pt+'VY']=(tgt[pt+'VY']||0) + uy*pull*0.8 - 0.12;
      tgt[pt+'VX']*=0.95; tgt[pt+'VY']*=0.95;
    });
  }
}

function explodeMissile(m){
  const R=120,F=18;
  triggerShake(8);triggerHitStop(4);playSound('explosion');
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
  blocks.forEach(b=>{const d=dist(m.x,m.y,b.x+b.w/2,b.y+b.h/2);if(d<R){const f=(1-d/R)*F,a=Math.atan2(b.y+b.h/2-m.y,b.x+b.w/2-m.x);b.fixed=false;b.vx+=Math.cos(a)*f;b.vy+=Math.sin(a)*f;b.health-=f*15;maybeEvictFromDamage(b);b.cracked=true;checkBuildingDestroyed(b);}});
  humans.forEach(h=>{if(h.collected)return;const d=dist(m.x,m.y,h.bodyX,h.bodyY);if(d<R){const f=(1-d/R)*F*0.7,a=Math.atan2(h.bodyY-m.y,h.bodyX-m.x);h.ragdoll=true;h.crying=true;h.panicLevel=10;const fx=Math.cos(a)*f,fy=Math.sin(a)*f;applyForce(h,fx,fy);bleedEffect(h,fx,fy,1.8); if(d<R*0.45)spawnGibs(h,fx,fy,2.5);}});
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
  try{nukeSfx.currentTime=0;nukeSfx.play().catch(()=>{playSound('explosion');});}catch(e){playSound('explosion');}
  triggerShake(20);triggerHitStop(10);
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
  blocks.forEach(b=>{b.fixed=false;b.health=0;maybeEvictFromDamage(b);b.cracked=true;
    const a=Math.atan2(b.y-ship.y,b.x-ship.x),f=3+Math.random()*5;b.vx=Math.cos(a)*f;b.vy=Math.sin(a)*f-3;});
  // Kill military
  military.forEach(m=>{if(m.type!=='bullet'&&m.type!=='boulder'&&m.alive){m.health=0;}});
  // Kill vehicles
  vehicles.forEach(v=>{if(v.indestructible)return;v.alive=false;v.exploding=40;});
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
    // If driving a hijacked vehicle: dismount first (back to on-foot)
    if(alien.drivingVehicle){
      const v=alien.drivingVehicle;
      alien.drivingVehicle=null;
      v.hijacked=false;
      v.indestructible=false;
      v.vx=0;
      alien.x=v.x+v.w+12;
      alien.y=GROUND_LEVEL-10;
      alien.vx=0; alien.vy=0;
      alien.onGround=false;
      showMessage('Dismounted vehicle');
      return;
    }
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

function ejectFromShipIntoVehicle(){
  if(playerMode!=='ship') return;
  // Need to be near ground (same altitude check as togglePlayerMode)
  if(ship.y<GROUND_LEVEL-100){ showMessage('Get closer to the ground first'); return; }
  // Pick a spawn X: prefer ship.x, but not over ocean
  let spawnX=ship.x;
  if(currentPlanet&&currentPlanet.id==='earth'){
    let tries=0;
    while(isOverOcean(spawnX) && tries<40){ spawnX = ship.x + (Math.random()-0.5)*800; tries++; }
    if(isOverOcean(spawnX)){ showMessage('Cannot drop a vehicle over water'); return; }
  }
  // Pick vehicle type — use first earth car if available, else a default sedan.
  const vTypes = (VEHICLE_TYPES[currentPlanet&&currentPlanet.id]||VEHICLE_TYPES.earth);
  const vt = vTypes[Math.floor(Math.random()*Math.min(4,vTypes.length))]; // small cars only (first 4)
  const v = {...vt, x:spawnX-vt.w/2, y:GROUND_LEVEL, vx:0, alive:true,
    homeMin:100, homeMax:worldWidth-100,
    hijacked:true, indestructible:true};
  vehicles.push(v);
  // Switch to on-foot and drive
  playerMode='onfoot';
  alien.drivingVehicle=v;
  alien.x=v.x+v.w*0.3;
  alien.y=v.y-v.h*0.55;
  alien.vx=0; alien.vy=0;
  alien.jetpackFuel=100;
  alien.health=100;
  alien.inCave=false;
  // Little drop-in flash
  for(let i=0;i<16;i++)particles.push({x:v.x+v.w/2,y:v.y-10,vx:(Math.random()-0.5)*3,vy:-Math.random()*2,life:25,color:['#0f0','#8f8','#fff'][Math.floor(Math.random()*3)],size:Math.random()*3+1});
  triggerShake(3);
  showMessage('Deployed with '+(vt.label||'vehicle')+'!');
}

function hijackNearestVehicle(){
  if(playerMode!=='onfoot') return;
  if(alien.drivingVehicle) return;
  let nearest=null, nd=160;
  for(let i=0;i<vehicles.length;i++){
    const v=vehicles[i];
    if(!v.alive) continue;
    const d=dist(alien.x,alien.y,v.x+v.w/2,v.y-v.h/2);
    if(d<nd){nd=d; nearest=v;}
  }
  if(!nearest){showMessage('No vehicle nearby'); return;}
  alien.drivingVehicle=nearest;
  nearest.hijacked=true;
  nearest.indestructible=true;
  nearest.vx=0;
  // Panic humans nearby
  for(let hi=0;hi<humans.length;hi++){const h=humans[hi];
    if(h.collected||h.ragdoll)continue;
    if(Math.abs(h.bodyX-nearest.x)<200){h.walkDir=h.bodyX<nearest.x?-1:1;h.walkSpeed=2.5;}
  }
  planetTerror=Math.min(planetTerror+0.3,10);
  showMessage('Vehicle hijacked! ENTER to dismount.');
}

function alienShoot(){
  const loadout = getRaceWeapons();
  const wi = alien.weapon|0;
  const wDef = loadout[wi] || loadout[0];
  if((alien.weaponCD[wi]||0)>0) return;
  const dir=alien.facing;
  alien.weaponCD[wi]=wDef.cd;
  switch(wDef.id){
    case 'stunner':
      stunWaves.push({x:alien.x+dir*8,y:alien.y-14,r:0,maxR:110,life:20,maxLife:20,kind:'cone',dir,effect:'stun'});
      for(let i=0;i<6;i++)particles.push({x:alien.x+dir*14,y:alien.y-12,vx:dir*(2+Math.random()*3),vy:(Math.random()-0.5)*1.5,life:10,color:'#8ef',size:Math.random()*2+1});
      triggerShake(1); break;
    case 'wail':
      stunWaves.push({x:alien.x,y:alien.y-14,r:0,maxR:340,life:36,maxLife:36,kind:'radial',dir:0,effect:'panic'});
      for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2;particles.push({x:alien.x,y:alien.y-14,vx:Math.cos(a)*2,vy:Math.sin(a)*2,life:18,color:'#f8f',size:Math.random()*2+1});}
      triggerShake(5); break;
    case 'plasma':
      plasmaBolts.push({x:alien.x+dir*10,y:alien.y-14,vx:dir*9,vy:-3,life:90});
      for(let i=0;i<5;i++)particles.push({x:alien.x+dir*12,y:alien.y-12,vx:dir*(3+Math.random()*3),vy:(Math.random()-0.5)*2,life:10,color:'#6f8',size:Math.random()*3+1});
      triggerShake(2); break;
    case 'gwell':
      gravityWells.push({x:alien.x+dir*16,y:alien.y-30,vx:dir*7,vy:-7,phase:'arming',timer:0,r:0,maxR:150});
      triggerShake(2); break;
    case 'swarm':
      for(let i=0;i<4;i++){
        parasites.push({x:alien.x+dir*10,y:alien.y-14,vx:dir*(1+Math.random()*2.5),vy:-2-Math.random()*2,life:540,target:null,attachT:0});
      }
      triggerShake(2); break;
    case 'laser':
      // Fast hitscan-style shot — uses existing laserShots array
      laserShots.push({x:alien.x+dir*10,y:alien.y-14,vx:dir*18,vy:0,life:40});
      for(let i=0;i<3;i++)particles.push({x:alien.x+dir*12,y:alien.y-12,vx:dir*2,vy:(Math.random()-0.5)*1,life:8,color:'#0ff',size:Math.random()*2+1});
      break;
    case 'acid':
      // Lob a puddle forward that lingers on the ground and damages anything stepping in it
      acidPuddles.push({x:alien.x+dir*40+Math.random()*30*dir,y:GROUND_LEVEL,r:22+Math.random()*6,life:360,maxLife:360});
      for(let i=0;i<10;i++)particles.push({x:alien.x+dir*10,y:alien.y-10,vx:dir*(1+Math.random()*2)+(Math.random()-0.5),vy:-1-Math.random()*3,life:28,color:'#cf0',size:Math.random()*3+1});
      triggerShake(1); break;
    case 'rocket':
      rockets.push({x:alien.x+dir*12,y:alien.y-14,vx:dir*10,vy:-1.2,life:140});
      for(let i=0;i<6;i++)particles.push({x:alien.x+dir*14,y:alien.y-12,vx:-dir*(1+Math.random()*2),vy:(Math.random()-0.5)*1.5,life:14,color:'#f80',size:Math.random()*3+1});
      triggerShake(3); break;
    case 'chainsaw':
      // Rapid melee arc in front of the alien — short range, big damage, bloody particles
      chainsawSlashes.push({x:alien.x+dir*14,y:alien.y-12,dir,life:10,maxLife:10});
      chainsawRev=Math.min(30, chainsawRev+4);
      for(let i=0;i<4;i++)particles.push({
        x:alien.x+dir*(12+Math.random()*10),
        y:alien.y-10+(Math.random()-0.5)*10,
        vx:dir*(1+Math.random()*2),
        vy:(Math.random()-0.5)*1.5,
        life:8,color:'#fd4',size:Math.random()*2+1,
      });
      triggerShake(1); break;
  }
}
function alienSwitchWeapon(delta){
  const n=getRaceWeapons().length;
  alien.weapon=((alien.weapon|0)+delta+n)%n;
}

// --- ON-FOOT WEAPON ENTITY UPDATES ---
function updateAlienWeapons(){
  // Stun waves (cone + radial)
  for(let i=0;i<stunWaves.length;i++){
    const w=stunWaves[i];
    const t=1-(w.life/w.maxLife);
    w.r=w.maxR*t;
    w.life--;
    // Apply effect each frame of expansion (with tiny chance per target to avoid re-hitting forever)
    // Humans
    for(let hi=0;hi<humans.length;hi++){
      const h=humans[hi];
      if(h.collected||h.ragdoll||h.hidden)continue;
      const d=dist(w.x,w.y,h.bodyX,h.bodyY);
      if(d>w.r||d<w.r-40)continue; // only on the expanding shell
      if(w.kind==='cone'){
        const dx=h.bodyX-w.x;
        if(Math.sign(dx)!==w.dir)continue;
        if(Math.abs(h.bodyY-w.y)>80)continue;
      }
      if(w.effect==='stun'){
        h.stunTimer=120; h.walkSpeed=0; h.crying=false; h.panicLevel=0;
      } else if(w.effect==='panic'){
        h.panicLevel=Math.min(10,(h.panicLevel||0)+4); h.crying=true;
        h.walkDir=h.bodyX<w.x?-1:1; h.walkSpeed=2.5;
      }
    }
    // Military
    for(let mi=0;mi<military.length;mi++){
      const m=military[mi];
      if(m.type==='bullet'||m.type==='boulder'||!m.alive)continue;
      const d=dist(w.x,w.y,m.x,m.y);
      if(d>w.r||d<w.r-40)continue;
      if(w.kind==='cone'){
        const dx=m.x-w.x;
        if(Math.sign(dx)!==w.dir)continue;
        if(Math.abs(m.y-w.y)>100)continue;
      }
      if(w.effect==='stun'){ m.stunTimer=150; m.shootTimer=Math.max(m.shootTimer||0,90); }
      else if(w.effect==='panic'){ m.shootTimer=Math.max(m.shootTimer||0,60); m.stunTimer=Math.max(m.stunTimer||0,45); }
    }
    // Wail (panic) shatters building windows — visible glass shards
    if(w.effect==='panic' && !w._shattered && w.r>60){
      for(let bi=0;bi<blocks.length;bi++){
        const bl=blocks[bi];
        if(bl.dead||!bl.fixed)continue;
        const bcx=bl.x+bl.w/2, bcy=bl.y+bl.h/2;
        const d=dist(w.x,w.y,bcx,bcy);
        if(d>w.maxR)continue;
        bl.windowsShattered=true;
        // Spray glass shards outward
        if(particles.length<250){
          for(let gi=0;gi<4;gi++){
            const a=Math.random()*Math.PI*2;
            particles.push({x:bcx+(Math.random()-0.5)*bl.w*0.6,y:bcy+(Math.random()-0.5)*bl.h*0.6,vx:Math.cos(a)*(1.5+Math.random()*2),vy:-Math.random()*3-1,life:30,color:'rgba(200,230,255,0.85)',size:Math.random()*1.8+0.6});
          }
        }
      }
      w._shattered=true;
    }
  }
  stunWaves=stunWaves.filter(w=>w.life>0);

  // Plasma bolts
  for(let i=0;i<plasmaBolts.length;i++){
    const b=plasmaBolts[i];
    b.vy+=GRAVITY*0.45; b.x+=b.vx; b.y+=b.vy; b.life--;
    if(Math.random()>0.3)particles.push({x:b.x,y:b.y,vx:(Math.random()-0.5)*1,vy:(Math.random()-0.5)*1,life:14,color:'#6f8',size:Math.random()*2+1});
    // Ground impact
    if(b.y>=GROUND_LEVEL-2){ plasmaExplode(b); b.life=0; continue; }
    // Humans
    for(let hi=0;hi<humans.length;hi++){
      const h=humans[hi];
      if(h.collected||h.hidden||h.ragdoll)continue;
      if(Math.abs(b.x-h.bodyX)<16&&Math.abs(b.y-h.bodyY)<22){ plasmaExplode(b); h.ragdoll=true; h.panicLevel=10; applyForce(h,b.vx*0.6,-3); h.plasmaMelt=(h.plasmaMelt||0)+90; b.life=0; break; }
    }
    if(b.life<=0)continue;
    // Military
    for(let mi=0;mi<military.length;mi++){
      const m=military[mi];
      if(!m.alive||m.type==='bullet'||m.type==='boulder')continue;
      if(Math.abs(b.x-m.x)<18&&Math.abs(b.y-m.y)<24){ plasmaExplode(b); m.health-=6; if(m.health<=0)m.alive=false; b.life=0; break; }
    }
    if(b.life<=0)continue;
    // Blocks
    for(let bi=0;bi<blocks.length;bi++){
      const bl=blocks[bi];
      if(bl.dead)continue;
      if(b.x>bl.x&&b.x<bl.x+bl.w&&b.y>bl.y&&b.y<bl.y+bl.h){ plasmaExplode(b); bl.health-=10; bl.cracked=true; bl.onFire=true; if(bl.health<=0)checkBuildingDestroyed(bl); b.life=0; break; }
    }
  }
  plasmaBolts=plasmaBolts.filter(b=>b.life>0);

  // Gravity wells
  for(let i=0;i<gravityWells.length;i++){
    const g=gravityWells[i];
    if(g.phase==='arming'){
      g.vy+=GRAVITY*0.5; g.x+=g.vx; g.y+=g.vy;
      if(g.y>=GROUND_LEVEL-4){ g.y=GROUND_LEVEL-4; g.phase='pulling'; g.timer=150; g.vx=0; g.vy=0; triggerShake(3); }
    } else if(g.phase==='pulling'){
      g.timer--; g.r=g.maxR;
      // Pull humans + military + vehicles + blocks in radius
      for(let hi=0;hi<humans.length;hi++){
        const h=humans[hi];
        if(h.collected||h.hidden)continue;
        const dx=g.x-h.bodyX, dy=g.y-h.bodyY;
        const d=Math.hypot(dx,dy);
        if(d<g.r&&d>5){
          const f=(1-d/g.r)*0.8;
          h.bodyX+=dx/d*f*2; h.headX=h.bodyX;
          if(h.ragdoll){h.headVX+=dx/d*f; h.headVY+=dy/d*f; h.bodyVX+=dx/d*f;}
          else { h.walkDir=dx>0?1:-1; h.walkSpeed=0.4; h.panicLevel=Math.min(10,h.panicLevel+0.1); h.crying=true; }
        }
      }
      for(let mi=0;mi<military.length;mi++){
        const m=military[mi];
        if(!m.alive||m.type==='bullet'||m.type==='boulder')continue;
        const dx=g.x-m.x, dy=g.y-m.y; const d=Math.hypot(dx,dy);
        if(d<g.r&&d>5){const f=(1-d/g.r)*1.2; m.x+=dx/d*f*2; m.y+=dy/d*f*0.5; m.stunTimer=Math.max(m.stunTimer||0,20);}
      }
      for(let vi=0;vi<vehicles.length;vi++){
        const v=vehicles[vi]; if(!v.alive)continue;
        const dx=g.x-(v.x+v.w/2), dy=g.y-v.y; const d=Math.hypot(dx,dy);
        if(d<g.r&&d>5){const f=(1-d/g.r)*0.6; v.x+=dx/d*f*1.5;}
      }
      for(let bi=0;bi<blocks.length;bi++){
        const bl=blocks[bi]; if(bl.dead||bl.fixed)continue;
        const dx=g.x-(bl.x+bl.w/2), dy=g.y-(bl.y+bl.h/2); const d=Math.hypot(dx,dy);
        if(d<g.r&&d>5){const f=(1-d/g.r)*0.5; bl.vx+=dx/d*f; bl.vy+=dy/d*f;}
      }
      // Pull particles
      if(Math.random()>0.3){
        const a=Math.random()*Math.PI*2, rr=g.maxR*0.9;
        particles.push({x:g.x+Math.cos(a)*rr,y:g.y+Math.sin(a)*rr,vx:-Math.cos(a)*2,vy:-Math.sin(a)*2,life:24,color:'#a0f',size:Math.random()*2+1});
      }
      if(g.timer<=0){ g.phase='detonate'; g.timer=20; triggerShake(12); }
    } else if(g.phase==='detonate'){
      g.timer--; g.r=g.maxR*(1+0.8*(1-g.timer/20));
      if(g.timer===19){
        // Damage everything in radius
        const R=g.maxR;
        humans.forEach(h=>{ if(h.collected||h.hidden)return; const d=dist(g.x,g.y,h.bodyX,h.bodyY); if(d<R){ h.ragdoll=true; h.panicLevel=10; applyForce(h,(h.bodyX-g.x)*0.1,-5-Math.random()*3); } });
        military.forEach(m=>{ if(!m.alive||m.type==='bullet'||m.type==='boulder')return; const d=dist(g.x,g.y,m.x,m.y); if(d<R){ m.health-=20; if(m.health<=0)m.alive=false; } });
        blocks.forEach(bl=>{ if(bl.dead)return; const d=dist(g.x,g.y,bl.x+bl.w/2,bl.y+bl.h/2); if(d<R){ bl.health-=40; bl.cracked=true; bl.onFire=true; if(!bl.fixed){bl.vx+=(bl.x-g.x)*0.04;bl.vy-=4;} if(bl.health<=0)checkBuildingDestroyed(bl); } });
        vehicles.forEach(v=>{ if(!v.alive||v.indestructible)return; const d=dist(g.x,g.y,v.x+v.w/2,v.y); if(d<R){ v.alive=false; v.exploding=40; } });
        for(let pi=0;pi<40;pi++){const a=Math.random()*Math.PI*2;particles.push({x:g.x,y:g.y,vx:Math.cos(a)*(3+Math.random()*5),vy:Math.sin(a)*(3+Math.random()*5),life:30,color:['#a0f','#f0f','#60f'][Math.floor(Math.random()*3)],size:Math.random()*3+1});}
      }
      if(g.timer<=0) g.phase='done';
    }
  }
  gravityWells=gravityWells.filter(g=>g.phase!=='done');

  // Parasites
  for(let i=0;i<parasites.length;i++){
    const pr=parasites[i];
    pr.life--;
    if(pr.target){
      const t=pr.target;
      const tx=t.bodyX!=null?t.bodyX:t.x, ty=t.bodyY!=null?t.bodyY:t.y;
      const tAlive = t.collected!==true && (t.alive!==false) && !t.hidden;
      if(!tAlive){ pr.target=null; }
      else {
        pr.attachT++;
        pr.x=tx+(Math.sin(frameT*4+i)*4); pr.y=ty-12+Math.cos(frameT*5+i)*3;
        if(pr.attachT%18===0){
          if(t.bodyX!=null){ // human
            if(!t.ragdoll){ t.panicLevel=Math.min(10,(t.panicLevel||0)+2); t.crying=true; t.walkSpeed=0.2; t.stunTimer=Math.max(t.stunTimer||0,40); }
            if(pr.attachT>150 && Math.random()>0.5){ t.ragdoll=true; applyForce(t,(Math.random()-0.5)*3,-2); }
          } else { // military
            t.health-=2; t.stunTimer=Math.max(t.stunTimer||0,30); if(t.health<=0)t.alive=false;
          }
        }
        if(Math.random()>0.7) particles.push({x:pr.x,y:pr.y,vx:(Math.random()-0.5)*1,vy:(Math.random()-0.5)*1,life:10,color:'#fa0',size:1.5});
        if(pr.life<=0 || pr.attachT>240) pr.target=null;
      }
    } else {
      // Seek nearest military first, then human
      let best=null, bestD=450;
      for(let mi=0;mi<military.length;mi++){const m=military[mi]; if(!m.alive||m.type==='bullet'||m.type==='boulder')continue; const d=dist(pr.x,pr.y,m.x,m.y); if(d<bestD){bestD=d; best=m;}}
      if(!best){ for(let hi=0;hi<humans.length;hi++){const h=humans[hi]; if(h.collected||h.hidden||h.ragdoll)continue; const d=dist(pr.x,pr.y,h.bodyX,h.bodyY); if(d<bestD){bestD=d; best=h;}} }
      if(best){
        const tx=best.bodyX!=null?best.bodyX:best.x, ty=best.bodyY!=null?best.bodyY:best.y;
        const dx=tx-pr.x, dy=ty-pr.y, d=Math.hypot(dx,dy)||1;
        pr.vx=(pr.vx*0.8)+(dx/d)*2;
        pr.vy=(pr.vy*0.8)+(dy/d)*2-0.05;
        if(d<18){ pr.target=best; pr.attachT=0; }
      } else {
        pr.vy+=GRAVITY*0.2; pr.vx*=0.98;
      }
      pr.x+=pr.vx; pr.y+=pr.vy;
      if(pr.y>GROUND_LEVEL-2){pr.y=GROUND_LEVEL-2; pr.vy*=-0.4; pr.vx*=0.7;}
      if(Math.random()>0.6) particles.push({x:pr.x,y:pr.y,vx:-pr.vx*0.2,vy:-pr.vy*0.2,life:8,color:'#fa0',size:1.2});
    }
  }
  parasites=parasites.filter(pr=>pr.life>0);

  // Chainsaw slashes — short melee arc, big damage, blood/spark particles
  if(chainsawRev>0) chainsawRev-=0.5;
  for(let i=0;i<chainsawSlashes.length;i++){
    const s=chainsawSlashes[i];
    s.life--;
    const range=42, width=28;
    const cx=s.x+s.dir*range*0.5, cy=s.y;
    // Humans
    for(let hi=0;hi<humans.length;hi++){
      const h=humans[hi];
      if(h.collected||h.hidden)continue;
      const dx=h.bodyX-s.x;
      if(Math.sign(dx)!==s.dir) continue;
      if(Math.abs(dx)>range) continue;
      if(Math.abs(h.bodyY-s.y)>width) continue;
      h.ragdoll=true; h.panicLevel=10; applyForce(h,s.dir*2,-2);
      for(let p=0;p<4;p++)particles.push({x:h.bodyX,y:h.bodyY,vx:(Math.random()-0.5)*3,vy:-1-Math.random()*2,life:18,color:'#c22',size:1+Math.random()*2});
    }
    // Military
    for(let mi=0;mi<military.length;mi++){
      const m=military[mi];
      if(!m.alive||m.type==='bullet'||m.type==='boulder')continue;
      const dx=m.x-s.x;
      if(Math.sign(dx)!==s.dir) continue;
      if(Math.abs(dx)>range) continue;
      if(Math.abs(m.y-s.y)>width+6) continue;
      m.health-=8; m.stunTimer=Math.max(m.stunTimer||0,20);
      if(m.health<=0)m.alive=false;
      for(let p=0;p<3;p++)particles.push({x:m.x,y:m.y,vx:(Math.random()-0.5)*3,vy:-1-Math.random()*2,life:16,color:'#c22',size:1+Math.random()*2});
    }
    // Blocks
    for(let bi=0;bi<blocks.length;bi++){
      const bl=blocks[bi]; if(bl.dead)continue;
      if(bl.x+bl.w<s.x-range||bl.x>s.x+range)continue;
      if(bl.y+bl.h<s.y-width||bl.y>s.y+width)continue;
      const bx=bl.x+bl.w*0.5;
      if(Math.sign(bx-s.x)!==s.dir) continue;
      bl.health-=3; bl.cracked=true;
      if(Math.random()<0.3) particles.push({x:bx,y:bl.y,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:14,color:'#c90',size:1.5});
      if(bl.health<=0) checkBuildingDestroyed(bl);
    }
    // Sparks / motor smoke
    if(Math.random()<0.6) particles.push({x:cx,y:cy+(Math.random()-0.5)*20,vx:(Math.random()-0.5)*2,vy:-Math.random()*1.5,life:10,color:Math.random()<0.5?'#fd4':'#fff',size:1+Math.random()});
  }
  chainsawSlashes=chainsawSlashes.filter(s=>s.life>0);

  // Acid puddles — persistent ground DOT
  for(let i=0;i<acidPuddles.length;i++){
    const ap=acidPuddles[i]; ap.life--;
    if(Math.random()<0.5)particles.push({x:ap.x+(Math.random()-0.5)*ap.r*2,y:ap.y-2,vx:(Math.random()-0.5)*0.4,vy:-0.3-Math.random()*0.5,life:18,color:'#cf0',size:1.5});
    // Damage humans
    for(let hi=0;hi<humans.length;hi++){
      const h=humans[hi];
      if(h.collected||h.hidden||h.ragdoll)continue;
      if(Math.abs(h.bodyX-ap.x)<ap.r && Math.abs(h.bodyY-ap.y)<30){
        h.panicLevel=Math.min(10,(h.panicLevel||0)+0.2); h.crying=true;
        if(!h.onFire&&Math.random()<0.05){ h.onFire=true; h.burnTimer=240; h.ignitionCD=60; }
        if(Math.random()<0.1){ h.ragdoll=true; applyForce(h,(Math.random()-0.5)*1.5,-1.5); }
      }
    }
    // Damage blocks above puddle
    for(let bi=0;bi<blocks.length;bi++){
      const b=blocks[bi]; if(b.dead)continue;
      if(b.x+b.w>ap.x-ap.r && b.x<ap.x+ap.r && b.y+b.h>ap.y-6 && b.y<ap.y+2){
        if(Math.random()<0.2){ b.health-=0.5; maybeEvictFromDamage(b);b.cracked=true; if(b.health<=0)checkBuildingDestroyed(b); }
      }
    }
  }
  acidPuddles=acidPuddles.filter(a=>a.life>0);
  if(acidPuddles.length>12)acidPuddles.splice(0,acidPuddles.length-12);

  // Rockets — straight projectile, bigger boom
  for(let i=0;i<rockets.length;i++){
    const r=rockets[i];
    r.vy+=GRAVITY*0.05; r.x+=r.vx; r.y+=r.vy; r.life--;
    if(Math.random()<0.9)particles.push({x:r.x-r.vx*0.5,y:r.y-r.vy*0.5,vx:-r.vx*0.1+(Math.random()-0.5),vy:(Math.random()-0.5)+0.5,life:16,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*3+1});
    let hit=false;
    if(r.y>=GROUND_LEVEL-2) hit=true;
    if(!hit){
      for(let hi=0;hi<humans.length;hi++){
        const h=humans[hi];
        if(h.collected||h.hidden||h.ragdoll)continue;
        if(Math.abs(r.x-h.bodyX)<16 && Math.abs(r.y-h.bodyY)<22){ hit=true; break; }
      }
    }
    if(!hit){
      for(let bi=0;bi<blocks.length;bi++){
        const bl=blocks[bi]; if(bl.dead)continue;
        if(r.x>bl.x&&r.x<bl.x+bl.w&&r.y>bl.y&&r.y<bl.y+bl.h){ hit=true; break; }
      }
    }
    if(hit){
      // Big explosion
      const R=70;
      for(let pi=0;pi<24;pi++){const a=Math.random()*Math.PI*2;particles.push({x:r.x,y:r.y,vx:Math.cos(a)*(3+Math.random()*5),vy:Math.sin(a)*(3+Math.random()*5),life:28,color:['#f80','#fa0','#f40','#ff0'][Math.floor(Math.random()*4)],size:Math.random()*4+2});}
      fires.push({x:r.x,y:r.y,life:180,size:14,vx:0,vy:0,stuck:false});
      triggerShake(6);
      // Damage radius
      humans.forEach(h=>{ if(h.collected||h.hidden)return; const d=dist(r.x,r.y,h.bodyX,h.bodyY); if(d<R){ h.ragdoll=true; const fx=(h.bodyX-r.x)/R*6, fy=-5; applyForce(h,fx,fy); h.onFire=true; h.burnTimer=300; bleedEffect(h,fx*2,fy*2,2); if(d<R*0.5)spawnGibs(h,fx*2,fy*2,3); }});
      blocks.forEach(b=>{ if(b.dead)return; const d=dist(r.x,r.y,b.x+b.w/2,b.y+b.h/2); if(d<R){ b.health-=40; maybeEvictFromDamage(b);b.cracked=true; b.onFire=true; if(!b.fixed){b.vx+=(b.x-r.x)*0.05; b.vy-=3;} if(b.health<=0)checkBuildingDestroyed(b); }});
      military.forEach(m=>{ if(!m.alive||m.type==='bullet'||m.type==='boulder')return; const d=dist(r.x,r.y,m.x,m.y); if(d<R){ m.health-=30; if(m.health<=0)m.alive=false; }});
      r.life=0;
    }
  }
  rockets=rockets.filter(r=>r.life>0);
}

function plasmaExplode(b){
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2;particles.push({x:b.x,y:b.y,vx:Math.cos(a)*(2+Math.random()*3),vy:Math.sin(a)*(2+Math.random()*3),life:22,color:['#6f8','#8fa','#2f4'][Math.floor(Math.random()*3)],size:Math.random()*3+1});}
  triggerShake(3);
}

// ============================================================
// --- UPDATE ---
// ============================================================
function update(){
  if(!gameStarted)return;

  // Mothership interior
  if(mothershipMode){updateMothership();return;}

  // Pyramid tomb interior (Khet)
  if(pyramidInteriorMode){updatePyramidInterior();return;}

  // Screen shake decay
  if(screenShake.intensity>0){
    screenShake.x=(Math.random()-0.5)*screenShake.intensity*2;
    screenShake.y=(Math.random()-0.5)*screenShake.intensity*2;
    screenShake.intensity*=0.85;
    if(screenShake.intensity<0.3)screenShake.intensity=0;
  }else{screenShake.x=0;screenShake.y=0;}

  ship.lightPhase+=0.05;

  // Sim-center x: used by culling throughout update & helpers (module-level)
  _simPX = playerMode==='onfoot'?alien.x:ship.x;

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
  let livingPop=0;
  for(let i=0;i<humans.length;i++){const h=humans[i];if(!h.collected&&!h.hidden&&!(h.ragdoll&&!h.beingBeamed))livingPop++;}
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
    // Raise camera (less ground, more horizon) — both on foot and driving.
    const _yOff = alien.drivingVehicle ? -80 : -60;
    camera.y=alien.y-canvas.height/2+_yOff+screenShake.y;
  }else{
    camera.x=ship.x-canvas.width/2+screenShake.x;
    camera.y=ship.y-canvas.height/2+screenShake.y;
  }
  // Smooth zoom: closeup on foot, normal in ship. Lerps over ~30 frames.
  const _zoomTarget = playerMode==='onfoot' ? (alien.drivingVehicle ? 2.4 : 1.9) : 1;
  worldZoom += (_zoomTarget - worldZoom) * 0.08;
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
  if(ship.beamActive){
    if(!beamSfx._playing){ try{beamSfx.currentTime=0; beamSfx.play().catch(()=>{});}catch(e){} beamSfx._playing=true; }
  } else if(beamSfx._playing){
    try{beamSfx.pause();}catch(e){} beamSfx._playing=false;
  }
  if(ship.beamActive){
    const bX=ship.x,bY=ship.y+15,tY=inCaveForBeam ? shipCaveHit.seg.y + shipCaveHit.seg.h : GROUND_LEVEL;
    for(let i=0;i<3;i++){const t=Math.random();particles.push({x:bX+(Math.random()-0.5)*30*t,y:bY+(tY-bY)*t+(Math.random()-0.5)*30*t,vx:(Math.random()-0.5)*2,vy:-Math.random()*2-1,life:20+Math.random()*10,color:`hsl(${120+Math.random()*40},100%,${60+Math.random()*30}%)`,size:Math.random()*3+1});}
    // Beam suction debris — dust & leaves from the ground fly up into the beam
    if(particles.length<220){
      const suckR=120;
      for(let i=0;i<2;i++){
        const sx=bX+(Math.random()*2-1)*suckR;
        const sy=tY-Math.random()*30;
        const dx=bX-sx, dy=bY-sy;
        const m=Math.max(1,Math.hypot(dx,dy));
        const sp=2.5+Math.random()*2;
        const isLeaf=Math.random()<0.35;
        const palette=isLeaf?['#4a7a2a','#6a9a3a','#8aaa4a','#c08040']:['#9a8a6a','#776655','#a99','#b9a988'];
        particles.push({x:sx,y:sy,vx:dx/m*sp+(Math.random()-0.5)*0.6,vy:dy/m*sp-0.4,life:24+Math.random()*16,color:palette[Math.floor(Math.random()*palette.length)],size:isLeaf?Math.random()*2+1.2:Math.random()*1.4+0.6});
      }
    }
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
          // Witness escalation — count bystanders who saw the abduction and boost wanted level
          let witnesses=0;
          humans.forEach(w=>{
            if(w===h||w.collected||w.hidden||w.ragdoll||w.isDino)return;
            const wd=dist(w.bodyX,w.bodyY,h.bodyX,h.bodyY);
            if(wd<260){
              witnesses++;
              // Phone-call icon above witnesses
              if(Math.random()<0.6){
                speechBubbles.push({x:w.headX,y:w.headY-22,text:"📞 911!",life:80,vy:-0.4});
              }
              w.panicLevel=Math.min((w.panicLevel||0)+2,10);
              w.crying=true;
            }
          });
          if(witnesses>=3){
            // Enough witnesses → escalate wanted level to spawn military
            if(typeof wantedLevel!=='undefined') wantedLevel=Math.min((wantedLevel||0)+1, 5);
            if(witnesses>=5 && typeof provokeMilitary==='function') provokeMilitary(h.bodyX, h.bodyY);
          }
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
        m.life=0;b.health-=8;maybeEvictFromDamage(b);b.cracked=true;if(!b.fixed)b.vx+=m.vx*0.05;checkBuildingDestroyed(b);
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
    blocks.forEach(b=>{if(b.dead)return;if(Math.abs(b.x+b.w/2-ship.x)>flameRange)return;const d=dist(ship.x,ship.y+60,b.x+b.w/2,b.y+b.h/2);if(d<flameRange&&b.y>ship.y){b.health-=flameDmg;maybeEvictFromDamage(b);b.cracked=true;b.onFire=true;if(!b.fixed)b.vx+=(Math.random()-0.5)*0.5;if(Math.random()>0.95)fires.push({x:b.x+Math.random()*b.w,y:b.y+Math.random()*b.h,life:120+Math.random()*100,size:Math.random()*10+5});checkBuildingDestroyed(b);}});
    humans.forEach(h=>{if(h.collected)return;if(Math.abs(h.bodyX-ship.x)>flameRange)return;const d=dist(ship.x,ship.y+60,h.bodyX,h.bodyY);if(d<flameRange-20&&h.bodyY>ship.y){h.crying=true;h.panicLevel=Math.min(h.panicLevel+0.3,10);if(!h.ragdoll){h.walkDir=h.bodyX<ship.x?-1:1;h.walkSpeed=3;}}});
    // Flame kills cows
    cows.forEach(c=>{if(c.collected)return;if(Math.abs(c.x-ship.x)>flameRange)return;const d=dist(ship.x,ship.y+60,c.x,c.bodyY);if(d<flameRange-10&&c.bodyY>ship.y){
      c.collected=true;score+=1;document.getElementById('score').textContent=score;
      showMessage(`${c.label} roasted!`);
      for(let i=0;i<15;i++)particles.push({x:c.x,y:c.bodyY,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,life:25,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*4+2});
    }});
    // Boss damage from flamethrower (per frame)
    if(boss&&boss.alive){const bd=dist(ship.x,ship.y+60,boss.x,boss.y);if(bd<flameRange+30)damageBoss(flameDmg*0.3,'flame');}
  }else if(flameSfx._playing){flameSfx.pause();flameSfx._playing=false;}

  // Lasso physics
  if(ship.lasso) updateLasso();

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
    // Gravity for unstuck flames (falling embers / detached fire)
    if(!f.stuck){
      f.vy=(f.vy||0)+0.25; f.vx=(f.vx||0)*0.98;
      f.y+=f.vy; f.x+=f.vx;
      if(f.y>=GROUND_LEVEL){f.y=GROUND_LEVEL;f.vy=0;f.stuck=true;}
      else{
        for(let bi=0;bi<blocks.length;bi++){const b=blocks[bi];if(b.dead)continue;
          if(f.x>b.x&&f.x<b.x+b.w&&f.y>b.y&&f.y<b.y+b.h+6){
            f.y=b.y;f.vy=0;f.stuck=true;b.onFire=true;maybeEvictFromDamage(b);b.cracked=true;break;}
        }
      }
    }
    if(particles.length<150&&Math.random()>0.7)particles.push({x:f.x+(Math.random()-0.5)*f.size,y:f.y,vx:(Math.random()-0.5)*1,vy:-Math.random()*2-0.5,life:12,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*3+1});
    // Spread to nearby blocks (more aggressive)
    if(Math.random()>0.9)blocks.forEach(b=>{if(!b.dead&&Math.abs(f.x-b.x-b.w/2)<45&&Math.abs(f.y-b.y-b.h/2)<45){b.health-=1.2;maybeEvictFromDamage(b);b.cracked=true;b.onFire=true;}});
  });
  fires=fires.filter(f=>f.life>0);if(fires.length>50)fires.splice(0,fires.length-50);

  // Ash piles fade out
  for(let i=0;i<ashPiles.length;i++)ashPiles[i].life--;
  ashPiles=ashPiles.filter(a=>a.life>0);if(ashPiles.length>60)ashPiles.splice(0,ashPiles.length-60);

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
    // Sim radius: skip AI for idle (non-ragdoll, non-beaming) humans far from player
    if(!h.ragdoll&&!h.beingBeamed&&Math.abs(h.bodyX-_simPX)>3000)return;
    // Plasma melt: drip green goop, shrink bodyScale, burn timer-based collection
    if(h.plasmaMelt&&h.plasmaMelt>0){
      h.plasmaMelt--;
      if(h.plasmaMelt%4===0 && particles.length<250){
        particles.push({x:h.bodyX+(Math.random()-0.5)*14,y:h.bodyY-8+Math.random()*16,vx:(Math.random()-0.5)*0.6,vy:Math.random()*1.5+0.5,life:20,color:['#6f8','#3c4','#9fa'][Math.floor(Math.random()*3)],size:Math.random()*2+1.2});
      }
      if(h.plasmaMelt===1){
        // Leaves behind a green acid puddle
        if(typeof acidPuddles!=='undefined') acidPuddles.push({x:h.bodyX,y:GROUND_LEVEL,r:4,targetR:18,life:600,maxLife:600});
        h.collected=true; return;
      }
    }
    // Stunner twitch: while stunned, tiny electric sparks periodically
    if(h.stunTimer&&h.stunTimer>0){
      h.stunTimer--;
      if(h.stunTimer%8===0 && particles.length<240){
        const a=Math.random()*Math.PI*2;
        particles.push({x:h.bodyX+(Math.random()-0.5)*10,y:h.bodyY-10+(Math.random()-0.5)*18,vx:Math.cos(a)*1.2,vy:Math.sin(a)*1.2,life:8,color:['#8ef','#cff','#fff'][Math.floor(Math.random()*3)],size:Math.random()*1.4+0.6});
      }
    }
    if(h.ragdoll){
      // Being eaten: continuous gore while the predator chews — spawn blood+chunks, then vanish.
      if(h.eatTimer && h.eatTimer>0){
        h.eatTimer--;
        if(h.eatTimer%6===0){ bleedEffect(h, (Math.random()-0.5)*2, -1, 0.6); }
        if(h.eatTimer%18===0){
          gibs.push({x:h.bodyX+(Math.random()-0.5)*14,y:h.bodyY,vx:(Math.random()-0.5)*3,vy:-Math.random()*3,
            rot:Math.random()*Math.PI*2,rotV:(Math.random()-0.5)*0.3,size:4,life:180,
            kind:['torso','leg','arm'][Math.floor(Math.random()*3)],
            color:h.color||'#6a4a20',bloodC:getBleedColor(h),groundY:GROUND_LEVEL,onGround:false});
        }
        if(h.eatTimer<=0){ h.collected=true; return; }
      }
      const parts=['head','body','legL','legR','armL','armR','footL','footR'];
      // Capture incoming vertical velocity before integration — used for splatter fall-damage.
      const _preFallVY = h.bodyVY||0;
      parts.forEach(pt=>{if(!h.beingBeamed)h[pt+'VY']+=GRAVITY*0.8;h[pt+'VX']*=0.99;h[pt+'VY']*=0.99;h[pt+'X']+=h[pt+'VX'];h[pt+'Y']+=h[pt+'VY'];if(h[pt+'Y']>GROUND_LEVEL){h[pt+'Y']=GROUND_LEVEL;h[pt+'VY']*=-0.3;h[pt+'VX']*=0.8;}if(h[pt+'Y']<-2000){h[pt+'Y']=-2000;h[pt+'VY']*=-0.3;}});
      // Splatter: if dropped from high enough (fast impact), the unit dies in a gore burst.
      if(!h.beingBeamed && !h.splatted && !h.collected && _preFallVY > 12 && h.bodyY >= GROUND_LEVEL - 2){
        h.splatted = true;
        try { spawnGibs(h, 0, -2, 2.2 + Math.min(2, (_preFallVY-12)*0.2)); } catch(e){}
        try { bleedEffect(h, 0, 1, 2); } catch(e){}
        playSound && playSound('splat');
        // Collect after a brief moment so the gore is visible.
        h.ragdollTimer = 418; // will flip to collected in the very-near-future check below
      }
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
      if(h.ignitionCD>0)h.ignitionCD--;
      // Stun tick: neural stunner freezes humans (unless on fire — burning overrides)
      if(h.stunTimer>0 && !h.onFire){
        h.stunTimer--;
        h.walkSpeed=0;
        if(h.stunTimer%8===0)particles.push({x:h.headX+(Math.random()-0.5)*8,y:h.headY-6,vx:(Math.random()-0.5)*0.3,vy:-0.5,life:14,color:'rgba(140,220,255,0.7)',size:1.2});
      }
      // Ignition: catch fire from nearby fire entities if not already burning
      if(!h.onFire&&h.ignitionCD<=0){
        for(let fi=0;fi<fires.length;fi++){
          const f=fires[fi];
          if(Math.abs(f.x-h.bodyX)<22&&Math.abs(f.y-h.bodyY)<36){h.onFire=true;h.burnTimer=360+Math.random()*180;h.ignitionCD=45;break;}
        }
      }
      if(h.idleTimer<=0){const dS=dist(ship.x,ship.y,h.bodyX,h.bodyY);
        const terrorBonus=planetTerror*0.3;
        // Only panic when attacked: beam active, flamethrower, explosions nearby, or high terror
        const beamNear=ship.beamActive&&dS<300;
        const flameNear=ship.flameOn&&dS<250;
        const terrorClose=planetTerror>2&&dS<200+planetTerror*20;
        const shouldPanic=beamNear||flameNear||terrorClose;
        if(h.onFire){
          // Burning: zigzag panic-run, emit flame particles, spread to nearby humans, tick down to ash
          h.burnTimer--;
          h.crying=true;
          h.panicLevel=Math.min(h.panicLevel+0.04,10);
          if(h.walkTimer%22===0){h.walkDir=Math.random()>0.5?1:-1;}
          h.walkSpeed=2.2;
          if(particles.length<200&&Math.random()>0.35){
            particles.push({x:h.bodyX+(Math.random()-0.5)*8,y:h.bodyY-12+(Math.random()-0.5)*18,
              vx:(Math.random()-0.5)*0.8,vy:-Math.random()*2-0.5,life:14,
              color:['#f80','#fa0','#f40','#fc0'][Math.floor(Math.random()*4)],size:Math.random()*2.5+1});
          }
          // Contact spread (throttled)
          if(h.ignitionCD<=0&&Math.random()>0.85){
            for(let hi=0;hi<humans.length;hi++){
              const h2=humans[hi];
              if(h2===h||h2.collected||h2.onFire||h2.ragdoll||h2.hidden)continue;
              if(Math.abs(h2.bodyX-h.bodyX)<24&&Math.abs(h2.bodyY-h.bodyY)<32){
                h2.onFire=true;h2.burnTimer=320+Math.random()*180;h2.ignitionCD=60;break;
              }
            }
            h.ignitionCD=18;
          }
          // Ocean extinguishes
          if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(h.bodyX)){h.onFire=false;h.burnTimer=0;}
          // Occasional blood drip while burning
          if(Math.random()<0.04) bleedEffect(h,0,1,0.3);
          // Burned down → ash + charred blood pool + few bone gibs
          if(h.burnTimer<=0){
            ashPiles.push({x:h.bodyX,y:GROUND_LEVEL-1,life:900,maxLife:900});
            for(let i=0;i<12;i++)particles.push({x:h.bodyX+(Math.random()-0.5)*14,y:GROUND_LEVEL-6,vx:(Math.random()-0.5)*1.6,vy:-Math.random()*1.8,life:32,color:'rgba(60,60,60,0.7)',size:Math.random()*2+1});
            bloodPools.push({x:h.bodyX,y:GROUND_LEVEL,r:2,targetR:9+Math.random()*4,life:1400,maxLife:1400,color:'#2a0a06'});
            // Charred bone fragments
            for(let i=0;i<2;i++)gibs.push({x:h.bodyX+(Math.random()-0.5)*6,y:GROUND_LEVEL-4,vx:(Math.random()-0.5)*1.5,vy:-Math.random()*2,rot:Math.random()*Math.PI*2,rotV:(Math.random()-0.5)*0.2,size:3,life:400,kind:'torso',color:'#3a2a20',bloodC:'#1a0402',groundY:GROUND_LEVEL,onGround:false});
            h.collected=true;return;
          }
        }
        else if(shouldPanic){h.panicLevel=Math.min(h.panicLevel+0.05+terrorBonus*0.02,10);h.crying=true;h.walkDir=h.bodyX<ship.x?-1:1;h.walkSpeed=1.5+h.panicLevel*0.3+terrorBonus*0.15;
          const screamChance=0.98-planetTerror*0.01;
          if(h.panicLevel>1.5&&Math.random()>screamChance)speechBubbles.push({x:h.headX,y:h.headY-20,text:ta('planet.'+p.id+'.cryPhrases')[Math.floor(Math.random()*ta('planet.'+p.id+'.cryPhrases').length)],life:70,vy:-0.3});
          // Panic propagation: every ~30 frames, a heavily-panicking human scares one nearby witness (wave effect).
          if(h.panicLevel>4&&(h.walkTimer|0)%30===0){
            for(let pi=0;pi<humans.length;pi++){
              const h2=humans[pi];
              if(h2===h||h2.collected||h2.ragdoll||h2.hidden||h2.onFire||h2.isDino)continue;
              const dx=h2.bodyX-h.bodyX;if(Math.abs(dx)>180)continue;
              const dy=h2.bodyY-h.bodyY;if(Math.abs(dy)>90)continue;
              if((h2.panicLevel||0)>=h.panicLevel-1)continue;
              h2.panicLevel=Math.min((h2.panicLevel||0)+1.5,9);
              h2.crying=true;
              h2.walkDir=h2.bodyX<ship.x?-1:1;
              h2.walkSpeed=Math.max(h2.walkSpeed||0,1.4);
              break;
            }
          }
        }else if(planetTerror>5&&dS<400&&Math.random()>0.995){
          // Very high global terror — nearby inhabitants hear about attacks and flee
          h.panicLevel=Math.min(h.panicLevel+0.3,5);h.crying=true;h.walkDir=Math.random()>0.5?1:-1;h.walkSpeed=1+terrorBonus*0.2;
          speechBubbles.push({x:h.headX,y:h.headY-20,text:["THEY'RE HERE","RUN","HIDE","IT'S OVER"][Math.floor(Math.random()*4)],life:60,vy:-0.3});
        }else{
          h.panicLevel=Math.max(0,h.panicLevel-0.01);if(h.panicLevel<0.5)h.crying=false;
          h.behaviorTimer=(h.behaviorTimer||0)-1;
          // --- CARNIVORE DINO HUNTING ---
          // T-Rex and Raptors (when in prehistoric Earth) hunt the herbivore dinos.
          // On contact: massive gore, prey ragdolled/killed, eat particles.
          const isCarnivore = h.isDino && (h.dinoKind==='trex' || h.dinoKind==='raptor');
          if(isCarnivore){
            const senseR = h.dinoKind==='trex'? 550 : 380;
            const sprintSpeed = h.dinoKind==='trex'? 1.6 : 2.4;
            h.huntCooldown = Math.max(0,(h.huntCooldown||0)-1);
            // Find nearest living prey
            let prey=null, bestD=senseR;
            for(let pi=0;pi<humans.length;pi++){
              const p2=humans[pi];
              if(p2===h||p2.collected||p2.ragdoll||p2.hidden)continue;
              if(!p2.isDino)continue;
              if(p2.dinoKind==='trex'||p2.dinoKind==='raptor')continue; // don't hunt each other
              const d=Math.abs(p2.bodyX-h.bodyX);
              if(d<bestD){bestD=d;prey=p2;}
            }
            if(prey){
              h.walkDir = prey.bodyX < h.bodyX ? -1 : 1;
              h.walkSpeed = sprintSpeed;
              h.crying = false;
              // Occasional roar
              if(h.huntCooldown<=0 && Math.random()<0.005){
                speechBubbles.push({x:h.headX,y:h.headY-24,text:h.dinoKind==='trex'?'ROOAAARR!':'*screech!*',life:60,vy:-0.3});
                h.huntCooldown=120;
              }
              // Bite range — scales with size
              const biteR = (h.scale||1) * 18;
              if(bestD < biteR){
                // KILL: gore, ragdoll prey, eat.
                const killPower = h.dinoKind==='trex' ? 4 : 2.5;
                const fx = h.walkDir * 8, fy = -4;
                prey.ragdoll = true;
                prey.crying = true;
                prey.panicLevel = 10;
                applyForce(prey, fx, fy);
                bleedEffect(prey, fx, fy, killPower);
                spawnGibs(prey, fx, fy, killPower);
                // Extra blood spray bursts for maximum gore
                for(let k=0;k<3;k++) bleedEffect(prey, fx*0.6, fy*0.4, killPower*0.8);
                // Mark prey as eaten after a beat — it lingers as ragdoll so the player sees the carnage
                prey.eatenBy = h;
                prey.eatTimer = 90;
                // Predator speech
                speechBubbles.push({x:h.headX,y:h.headY-24,text:['*CRUNCH*','*RIPS FLESH*','*DEVOURS*'][Math.floor(Math.random()*3)],life:70,vy:-0.3});
                // Cooldown so the T-Rex doesn't instantly chain into another kill
                h.huntCooldown = 300;
              }
            } else {
              // No prey seen — slow wander
              if(h.behaviorTimer<=0){
                h.walkDir = Math.random()>0.5?1:-1;
                h.walkSpeed = 0.5;
                h.behaviorTimer = 150+Math.random()*200;
              }
            }
          } else
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
            // Purposeful commuter: day → head to workX, night → head home
            // dayNightCycle: 0=noon, 0.25=dusk, 0.5=midnight, 0.75=dawn
            const isDay = dayNightCycle < 0.25 || dayNightCycle > 0.75;
            const target = isDay ? h.workX : h.homeX;
            const dx = target - h.bodyX;
            if(Math.abs(dx) < 30){
              // Arrived: linger briefly, switch to a small idle action
              h.walkSpeed = 0;
              if(h.behaviorTimer<=0){ h.behaviorTimer = 120+Math.random()*180; }
            } else {
              h.walkDir = dx>0?1:-1;
              h.walkSpeed = 0.55 + Math.random()*0.1;
              if(h.behaviorTimer<=0){ h.behaviorTimer = 180+Math.random()*220; }
            }
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
        if(debugMode.active){ if(keys['f']){h.walkDir=1;h.walkSpeed=1.2;} else if(keys['b']){h.walkDir=-1;h.walkSpeed=1.2;} else if(keys['x']){h.walkSpeed=0;} }
        const mv=h.walkDir*h.walkSpeed;h.headX+=mv;h.bodyX+=mv;h.legLX+=mv;h.legRX+=mv;h.armLX+=mv;h.armRX+=mv;h.footLX+=mv;h.footRX+=mv;
        // Prevent walking into ocean
        if(currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(h.bodyX)){h.walkDir*=-1;const bk=-mv*2;h.headX+=bk;h.bodyX+=bk;h.legLX+=bk;h.legRX+=bk;h.armLX+=bk;h.armRX+=bk;h.footLX+=bk;h.footRX+=bk;}}
      const s=h.scale||1;
      const panicMul=1+Math.min(h.panicLevel||0,10)*0.12;
      const ph=h.walkTimer*0.1*panicMul;
      const legSwing=Math.sin(ph)*4*s;
      const armSwing=-Math.sin(ph)*3*s;
      const bob=Math.abs(Math.sin(ph))*1.2*s;
      h.headY=GROUND_LEVEL-40*s-bob; h.bodyY=GROUND_LEVEL-28*s-bob*0.6;
      h.legLY=GROUND_LEVEL-10*s; h.legRY=GROUND_LEVEL-10*s;
      h.armLY=GROUND_LEVEL-28*s-bob*0.4; h.armRY=GROUND_LEVEL-28*s-bob*0.4;
      h.footLY=GROUND_LEVEL; h.footRY=GROUND_LEVEL;
      h.legLX=h.bodyX-4*s+legSwing; h.legRX=h.bodyX+4*s-legSwing;
      h.footLX=h.legLX-1+legSwing*1.25; h.footRX=h.legRX+1-legSwing*1.25;
      h.armLX=h.bodyX-8*s+armSwing; h.armRX=h.bodyX+8*s-armSwing;
      h.headX=h.bodyX+(h.panicLevel>3?Math.sin(ph*2)*0.8*s:0);
      if(h.crying&&Math.random()>0.85)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY+3,vx:(Math.random()-0.5)*0.3,vy:0.8,life:30,size:1.5});
    }
  });

  // Cow update
  cows.forEach(c=>{
    if(c.collected)return;
    // Sim radius: skip AI for idle, grounded cows far from player (still renders if on-screen)
    if(!c.beingBeamed && c.y>=GROUND_LEVEL-5 && Math.abs(c.x-_simPX)>3000)return;
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
            // Stay within spawn biome (falls back to jungle bounds for legacy saves without biomeMin/Max)
            const _bMin=c.biomeMin!=null?c.biomeMin:10100, _bMax=c.biomeMax!=null?c.biomeMax:13400;
            if(Math.random()>0.98){c.walkDir*=-1;c._dirCD=40;}
            if(c.x<_bMin){c.walkDir=1;c._dirCD=30;}
            else if(c.x>_bMax){c.walkDir=-1;c._dirCD=30;}
          }
        }else{
          // Normal cow walk
          c.x+=c.walkDir*c.walkSpeed;
          if(Math.random()>0.998){c.walkDir*=-1;c._dirCD=60;}
          // Non-monkey animals also stay within spawn biome if it's tagged
          if(c.biomeMin!=null&&c.x<c.biomeMin){c.walkDir=1;c._dirCD=30;}
          else if(c.biomeMax!=null&&c.x>c.biomeMax){c.walkDir=-1;c._dirCD=30;}
        }
        if(c.x<100){c.x=100;c.walkDir=1;c._dirCD=60;}
        else if(c.x>worldWidth-100){c.x=worldWidth-100;c.walkDir=-1;c._dirCD=60;}
        // Prevent walking into ocean (all wack types)
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
      // Stuck detection: if a grounded cow can't actually move for 3s, poof it (spawn-wedge safety net).
      if(!c._eating && c.y>=GROUND_LEVEL-5){
        if(c._lastX!=null && Math.abs(c.x-c._lastX)<0.3) c._stuckFrames=(c._stuckFrames||0)+1;
        else c._stuckFrames=0;
        c._lastX=c.x;
        if(c._stuckFrames>180){
          c.collected=true;
          for(let i=0;i<10;i++)particles.push({x:c.x+(Math.random()-0.5)*12,y:c.bodyY+(Math.random()-0.5)*8,vx:(Math.random()-0.5)*2,vy:-Math.random()*2,life:25,color:'rgba(200,200,200,0.6)',size:Math.random()*3+1});
        }
      }
    }
  });

  // Cave creatures update
  caveCreatures.forEach(cc => {
    if(cc.collected) return;
    // Sim radius: skip AI for cave creatures far from player (still renders if on-screen)
    if(!cc.beingBeamed && Math.abs(cc.x-_simPX)>3000) return;
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
  stepParticles();
  if(particles.length>150)particles.splice(0,particles.length-150);
  stepBloodDroplets(); stepGibs(); stepBloodPools(); stepSkidMarks();
  if(bloodPools.length>120)bloodPools.splice(0,bloodPools.length-120);
  if(gibs.length>80)gibs.splice(0,gibs.length-80);
  if(skidMarks.length>200)skidMarks.splice(0,skidMarks.length-200);
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
    // Ambient biome life on Earth (cheap atmosphere particles, near camera only)
    if(wp.id==='earth'&&particles.length<140&&typeof getEarthBiome==='function'){
      const ax=camera.x+Math.random()*canvas.width;
      const ab=getEarthBiome(ax);
      if(ab){
        const isNight = dayNightCycle>0.35 && dayNightCycle<0.65;
        if(ab.id==='jungle'&&Math.random()>0.6){
          // Pollen / spores drifting slowly
          particles.push({x:ax,y:GROUND_LEVEL-20-Math.random()*120,vx:(Math.random()-0.5)*0.3,vy:-0.1-Math.random()*0.2,life:80,color:'rgba(220,255,140,0.35)',size:Math.random()*1.5+0.8});
        }else if(ab.id==='desert'&&Math.random()>0.55){
          // Dust motes
          particles.push({x:ax,y:GROUND_LEVEL-Math.random()*80,vx:0.5+Math.random()*0.7,vy:(Math.random()-0.5)*0.2,life:70,color:'rgba(220,180,110,0.28)',size:Math.random()*1.4+0.6});
        }else if((ab.id==='farmland'||ab.id==='suburbs'||ab.id==='suburbs2')&&isNight&&Math.random()>0.5){
          // Fireflies at night
          particles.push({x:ax,y:GROUND_LEVEL-30-Math.random()*80,vx:(Math.random()-0.5)*0.4,vy:(Math.random()-0.5)*0.3,life:60,color:'rgba(210,255,120,0.7)',size:1.2});
        }else if(ab.id==='snow'&&Math.random()>0.5){
          // Light snowflake flakes falling
          particles.push({x:ax,y:camera.y+Math.random()*20,vx:Math.sin(frameT+ax*0.01)*0.3,vy:0.6+Math.random()*0.6,life:130,color:'rgba(255,255,255,0.7)',size:Math.random()*1.2+0.6});
        }
      }
    }
    if(wp.id==='mars'&&Math.random()>0.85){
      // Dust
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:3+Math.random()*2,vy:Math.random()-0.5,life:60,type:'dust'});
    }
    if(wp.id==='ice'&&Math.random()>0.85){
      // Snow
      weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y-10,vx:Math.sin(frameT)*0.5,vy:1+Math.random()*2,life:120,type:'snow'});
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
    if(v.hijacked) return; // player-controlled; updated in updateAlienOnFoot
    // Sim radius: skip AI for vehicles far from player (still renders if on-screen)
    if(Math.abs(v.x-_simPX)>3000)return;
    v.x+=v.vx;
    // Stay in home zone, avoid ocean
    const vMin=v.homeMin||100, vMax=v.homeMax||(worldWidth-100);
    // Detect direction flip → spawn skid marks + tire smoke
    const dirFlip = (v._prevVX!=null) && (Math.sign(v._prevVX)!==Math.sign(v.vx)) && Math.abs(v._prevVX)>0.5;
    if(v.x<vMin||v.x>vMax){v.vx*=-1;}
    if(currentPlanet&&currentPlanet.id==='earth'){
      const leadX = v.vx>0 ? v.x+v.w+20 : v.x-20;
      if(isOverOcean(leadX) || isOverOcean(v.x) || isOverOcean(v.x+v.w)){
        v.vx*=-1;
        while((isOverOcean(v.x) || isOverOcean(v.x+v.w)) && v.x>0 && v.x+v.w<worldWidth){ v.x += v.vx; }
      }
    }
    if(dirFlip){
      const wy=GROUND_LEVEL-2;
      // Skid marks along wheel positions
      const wx1=v.x+v.w*0.2, wx2=v.x+v.w*0.8;
      skidMarks.push({x:wx1,y:wy,w:Math.min(40,Math.abs(v._prevVX)*16),life:600,maxLife:600});
      skidMarks.push({x:wx2,y:wy,w:Math.min(40,Math.abs(v._prevVX)*16),life:600,maxLife:600});
      // Tire smoke
      for(let i=0;i<6;i++)particles.push({x:wx1+(Math.random()-0.5)*18,y:wy-1,vx:(Math.random()-0.5)*0.8,vy:-0.4-Math.random()*0.6,life:30+Math.random()*15,color:'rgba(180,180,180,0.7)',size:2+Math.random()*2});
      for(let i=0;i<6;i++)particles.push({x:wx2+(Math.random()-0.5)*18,y:wy-1,vx:(Math.random()-0.5)*0.8,vy:-0.4-Math.random()*0.6,life:30+Math.random()*15,color:'rgba(180,180,180,0.7)',size:2+Math.random()*2});
    }
    v._prevVX=v.vx;
    // Stuck detection: vehicle pinned between ocean + home-zone walls → explode it.
    if(v._lastX!=null && Math.abs(v.x-v._lastX)<0.3) v._stuckFrames=(v._stuckFrames||0)+1;
    else v._stuckFrames=0;
    v._lastX=v.x;
    if(v._stuckFrames>180){
      v.alive=false; v.exploding=40;
      for(let i=0;i<15;i++)particles.push({x:v.x+v.w/2,y:v.y,vx:(Math.random()-0.5)*4,vy:-Math.random()*3,life:25,color:['#f80','#fa0','#f40'][Math.floor(Math.random()*3)],size:Math.random()*3+1});
      return;
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
    if(planetTerror>2){
      for(let hi=0;hi<humans.length;hi++){const h=humans[hi];
        if(h.collected||h.ragdoll)continue;
        if(Math.abs(h.bodyX-v.x)<100){h.walkDir=h.bodyX<v.x?-1:1;h.walkSpeed=2;}
      }
    }
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
        blocks.forEach(b=>{if(Math.random()<0.1&&!b.dead){b.health-=20;maybeEvictFromDamage(b);b.cracked=true;checkBuildingDestroyed(b);}});
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
        blocks.forEach(b=>{if(!b.dead&&Math.random()<0.15){b.fixed=false;b.vy=-2-Math.random()*3;b.vx=(Math.random()-0.5)*4;b.health-=10;maybeEvictFromDamage(b);b.cracked=true;}});
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

  // --- VEHICLE DRIVING (hijacked) ---
  if(alien.drivingVehicle){
    const v=alien.drivingVehicle;
    if(!v.alive){
      // Vehicle somehow got removed; eject
      alien.drivingVehicle=null;
      alien.x=v.x; alien.y=GROUND_LEVEL-10; alien.onGround=false;
    } else {
      const boosting = !!keys['shift'];
      const maxSpeed = boosting ? 11 : 5.5;
      const accel = boosting ? 0.6 : 0.35;
      if(keys['a']||keys['arrowleft']){ v.vx=Math.max(v.vx-accel,-maxSpeed); alien.facing=-1; }
      else if(keys['d']||keys['arrowright']){ v.vx=Math.min(v.vx+accel,maxSpeed); alien.facing=1; }
      else { v.vx*=0.92; if(Math.abs(v.vx)<0.05) v.vx=0; }
      // Boost FX: thruster burst particles trailing behind
      if(boosting && Math.abs(v.vx)>1.5){
        for(let i=0;i<2;i++){
          particles.push({
            x: v.x + (v.vx>0 ? 0 : v.w) + (Math.random()-0.5)*4,
            y: v.y - v.h*0.35 + (Math.random()-0.5)*6,
            vx: -Math.sign(v.vx)*(3+Math.random()*2),
            vy: (Math.random()-0.5)*1.2,
            life: 14+Math.random()*8,
            color: ['#0ff','#4cf','#8ef','#fff'][Math.floor(Math.random()*4)],
            size: Math.random()*2.5+1.5
          });
        }
      }
      // Block water
      const leadX = v.vx>0 ? v.x+v.w+8 : v.x-8;
      if(currentPlanet&&currentPlanet.id==='earth'&&(isOverOcean(leadX)||isOverOcean(v.x)||isOverOcean(v.x+v.w))){
        // Bounce back out of water
        if(v.vx!==0){ v.vx=-Math.sign(v.vx)*1.5; }
        while((isOverOcean(v.x)||isOverOcean(v.x+v.w)) && v.x>50 && v.x+v.w<worldWidth-50){ v.x+=v.vx; }
        showMessage('Vehicle cannot enter water');
      } else {
        v.x+=v.vx;
      }
      // World clamp
      if(v.x<50){v.x=50; v.vx=0;}
      if(v.x+v.w>worldWidth-50){v.x=worldWidth-50-v.w; v.vx=0;}
      // Drive-over gore — horizontal-overlap based, tolerant of unit scale/floating.
      // Cloaked vehicles pass through units harmlessly.
      if(Math.abs(v.vx)>0.5 && !v.cloaked){
        const vL = v.x - 4, vR = v.x + v.w + 4;
        for(let hi=0;hi<humans.length;hi++){
          const h=humans[hi];
          if(h.collected || !h.alive) continue;
          const s = h.scale || 1;
          const halfW = ((h.bodyWidth||16)/2) * s + 4;
          const hL = h.bodyX - halfW, hR = h.bodyX + halfW;
          if(hR < vL || hL > vR) continue;
          // Vertical: feet/body somewhere in the vehicle's vertical band. Use feet if available.
          const footY = (h.footLY!=null || h.footRY!=null)
            ? Math.max(h.footLY||h.bodyY, h.footRY||h.bodyY) : (h.bodyY + 20*s);
          if(footY < v.y - v.h - 12) continue;      // unit floats above roof
          if(footY > v.y + 40) continue;            // far below ground (shouldn't happen)
          const power=Math.min(5, 1.5+Math.abs(v.vx)*0.5 + s*0.3);
          spawnGibs(h, v.vx*6, -4-Math.random()*3, power);
          h.collected=true;
          triggerShake(Math.min(4, 2.5 + s*0.3));
          planetTerror=Math.min(planetTerror+0.25,10);
          try { if(!window._muted){ vehicleSplatSfx.currentTime=0; vehicleSplatSfx.play().catch(()=>{}); } } catch(e){}
        }
        // Skid marks while moving
        if(Math.abs(v.vx)>3 && Math.random()<0.3){
          skidMarks.push({x:v.x+v.w*0.2,y:GROUND_LEVEL-2,w:Math.abs(v.vx)*4,life:400,maxLife:400});
          skidMarks.push({x:v.x+v.w*0.8,y:GROUND_LEVEL-2,w:Math.abs(v.vx)*4,life:400,maxLife:400});
        }
      }
      // Sync alien into cabin, suppress physics
      alien.x=v.x+v.w*0.3;
      alien.y=v.y-v.h*0.55;
      alien.vx=0; alien.vy=0;
      alien.onGround=true;
      alien.walkTimer+=Math.abs(v.vx)*0.02;
      // Cooldowns still tick
      for(let ci=0;ci<alien.weaponCD.length;ci++) if(alien.weaponCD[ci]>0) alien.weaponCD[ci]--;
      alien.shootCooldown=Math.max(0,alien.shootCooldown-1);
      alien.jetpackFuel=Math.min(100, alien.jetpackFuel+0.5);
      return;
    }
  }

  // --- MIND CONTROL tick ---
  if(mindControl){
    const tgt=mindControl.target;
    if(!tgt||tgt.collected||tgt.hidden||tgt.ragdoll){ mindControl=null; }
    else {
      mindControl.duration--;
      if(mindControl.duration<=0){ tgt.mindControlled=false; mindControl=null; showMessage('Mind link faded'); }
      else {
        // Steer the puppet
        tgt.walkSpeed=0;
        if(keys['a']||keys['arrowleft']){ tgt.walkDir=-1; tgt.walkSpeed=2.5; }
        else if(keys['d']||keys['arrowright']){ tgt.walkDir=1; tgt.walkSpeed=2.5; }
        // Purple mind-control particles above the puppet
        if(((frameNow|0)%3===0)&&particles.length<240){
          particles.push({x:tgt.headX+(Math.random()-0.5)*14,y:tgt.headY-18+(Math.random()-0.5)*6,vx:(Math.random()-0.5)*0.4,vy:-0.6,life:22,color:['#c4f','#a0f','#e8f'][Math.floor(Math.random()*3)],size:Math.random()*1.8+0.8});
        }
        // Alien stays still while concentrating — lock position
        alien.vx*=0.5;
        return; // skip normal alien movement this frame
      }
    }
  }
  // Movement
  const walkSpeed=2.5;
  if(keys['a']||keys['arrowleft']){alien.vx-=0.5;alien.facing=-1;}
  if(keys['d']||keys['arrowright']){alien.vx+=0.5;alien.facing=1;}
  // Jump (space) — or swim up when underwater
  if(keys[' ']&&alien.onGround){alien.vy=-7;alien.onGround=false;}
  else if(keys[' ']&&alien.underwater){
    // Swim stroke upward (stronger with dive suit); spawn bubbles
    const kick = alien.diveSuit ? 0.55 : 0.35;
    alien.vy -= kick;
    if(alien.vy < -4) alien.vy = -4;
    if((frameNow|0)%5===0){
      particles.push({x:alien.x+(Math.random()-0.5)*8, y:alien.y-18, vx:(Math.random()-0.5)*0.4, vy:-1.4-Math.random()*0.6, life:40+Math.random()*20, color:'rgba(200,230,255,0.7)', size:1.2+Math.random()*1.6});
    }
  }
  // Jetpack (shift)
  if(keys['shift']&&alien.jetpackFuel>0){
    alien.vy-=0.5;alien.jetpackFuel-=0.6;
    for(let i=0;i<2;i++)particles.push({x:alien.x+(Math.random()-0.5)*6,y:alien.y+2,vx:(Math.random()-0.5)*3,vy:3+Math.random()*3,life:20,color:['#f80','#fa0','#ff0'][Math.floor(Math.random()*3)],size:Math.random()*4+2});
  }

  // Weapon select (1-5), cycle with Tab
  if(keys['1'])alien.weapon=0;
  else if(keys['2'])alien.weapon=1;
  else if(keys['3'])alien.weapon=2;
  else if(keys['4'])alien.weapon=3;
  else if(keys['5'])alien.weapon=4;
  else if(keys['6'])alien.weapon=5;
  if(keys['tab']&&!alien._tabPrev){alienSwitchWeapon(1);}
  alien._tabPrev=!!keys['tab'];
  // Fire (Q)
  if(keys['q'])alienShoot();
  // Tick cooldowns
  for(let ci=0;ci<alien.weaponCD.length;ci++) if(alien.weaponCD[ci]>0) alien.weaponCD[ci]--;
  alien.shootCooldown=Math.max(0,alien.shootCooldown-1);

  // --- GRAPPLING HOOK (G) ---
  const gNow = !!keys['g'];
  if(gNow && !alien._gPrev){
    if(alien.grapple){
      alien.grapple = null; // release
    } else {
      const dir = alien.facing;
      const sp = 14;
      alien.grapple = {
        phase:'flying',
        x: alien.x + dir*10,
        y: alien.y - 14,
        vx: dir*sp*0.82,
        vy: -sp*0.55,
        anchorX:0, anchorY:0,
        life:70,
      };
    }
  }
  alien._gPrev = gNow;
  if(alien.grapple){
    const g = alien.grapple;
    if(g.phase==='flying'){
      g.x += g.vx; g.y += g.vy;
      g.vy += GRAVITY*0.25;
      g.life--;
      // Hit a block
      let hit=null;
      for(let bi=0;bi<blocks.length;bi++){
        const bl=blocks[bi]; if(bl.dead)continue;
        if(g.x>bl.x&&g.x<bl.x+bl.w&&g.y>bl.y&&g.y<bl.y+bl.h){ hit={x:g.x,y:g.y}; break; }
      }
      // Hit the ground above if we shot up
      if(!hit && g.y <= LEAVE_THRESHOLD+100){ hit={x:g.x,y:g.y}; }
      // Hit ground surface (can't grapple the floor — only useful for ceilings)
      if(!hit && g.y>=GROUND_LEVEL-4){ alien.grapple=null; }
      else if(hit){ g.phase='attached'; g.anchorX=hit.x; g.anchorY=hit.y; g.life=300; triggerShake(1); }
      else if(g.life<=0){ alien.grapple=null; }
    } else if(g.phase==='attached'){
      g.life--;
      const dx = g.anchorX - alien.x;
      const dy = g.anchorY - alien.y + 10;
      const d = Math.hypot(dx,dy)||1;
      // Pull force toward anchor, decays near anchor to avoid overshoot
      const pull = Math.min(0.9, 0.45 + d*0.001);
      alien.vx += (dx/d)*pull;
      alien.vy += (dy/d)*pull - GRAVITY*0.55;
      // Auto-release when very close
      if(d<18) alien.grapple=null;
      // Rope trail sparkles
      if(Math.random()<0.15) particles.push({x:alien.x+dx*Math.random(),y:alien.y-10+dy*Math.random(),vx:0,vy:0,life:6,color:'rgba(255,220,120,0.8)',size:1});
      if(g.life<=0) alien.grapple=null;
    }
  }

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
    // Normal ground collision (surface or seabed if over ocean)
    const overOcean = currentPlanet&&currentPlanet.id==='earth'&&isOverOcean(alien.x);
    const floorY = overOcean ? SEABED_Y - 2 : GROUND_LEVEL - 2;
    // Underwater: drag, buoyancy, auto-equip dive suit, oxygen
    const submerged = overOcean && alien.y > WATER_SURFACE;
    alien.underwater = submerged;
    if(submerged){
      // First-time pickup: snap on dive suit automatically
      if(!alien.diveSuit){
        alien.diveSuit=true;
        alien.diveSuitShownT=180;
        showMessage('Dive suit auto-deployed!');
      }
      // Smoother underwater physics with the suit
      alien.vy *= alien.diveSuit ? 0.88 : 0.92;
      alien.vx *= alien.diveSuit ? 0.92 : 0.95;
      // Bubbles
      alien.bubbleT=(alien.bubbleT||0)+1;
      if(alien.bubbleT%8===0){
        particles.push({x:alien.x+(Math.random()-0.5)*6, y:alien.y-20, vx:(Math.random()-0.5)*0.3, vy:-1.2-Math.random()*0.6, life:50+Math.random()*30, color:'rgba(200,230,255,0.6)', size:1.2+Math.random()*1.8});
      }
      // Oxygen (only matters without suit, but we track for HUD)
      if(alien.diveSuit) alien.oxygen = Math.min(100, (alien.oxygen||100)+0.4);
      else alien.oxygen = Math.max(0, (alien.oxygen||100)-0.25);
    } else {
      // Refill oxygen above water
      alien.oxygen = Math.min(100, (alien.oxygen||100)+1.5);
      alien.underwater=false;
    }
    if(alien.diveSuitShownT>0) alien.diveSuitShownT--;
    if(alien.y>=floorY){alien.y=floorY;alien.vy=0;alien.onGround=true;alien.jetpackFuel=Math.min(100,alien.jetpackFuel+0.3);}
    else{alien.onGround=false;}
  }

  // Keep alien in bounds
  alien.y=Math.max(LEAVE_THRESHOLD+100,alien.y);

  // Block collision (surface only) — land on top of buildings/rubble, but walk through them sideways
  if(!alienCaveHit) {
    blocks.forEach(b=>{
      if(b.dead)return;
      if(alien.x+alien.w/2>b.x&&alien.x-alien.w/2<b.x+b.w&&alien.y>b.y&&alien.y-alien.h<b.y+b.h){
        // Stand on top only (no side pushback so alien can walk past houses)
        if(alien.vy>0&&alien.y-alien.vy<=b.y+2){alien.y=b.y;alien.vy=0;alien.onGround=true;alien.jetpackFuel=Math.min(100,alien.jetpackFuel+0.3);}
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
  camera.y=alien.y-canvas.height/2+(alien.drivingVehicle?-80:100)+screenShake.y;

  // Seabed cave entry (Earth: swim up to a cave mouth underwater + E/Enter, dive suit required)
  if(p.id==='earth' && alien.underwater && alien.diveSuit){
    for(let ui=0; ui<underwaterObjects.length; ui++){
      const uo=underwaterObjects[ui];
      if(uo.type!=='seabedCave') continue;
      const dx=alien.x-uo.x, dy=alien.y-(uo.y - uo.h*0.4);
      if(Math.abs(dx)<uo.w*0.7 && Math.abs(dy)<uo.h*0.9 && (keys['enter']||keys['e'])){
        keys['enter']=false; keys['e']=false;
        pyramidInteriorMode=true;
        pyramidInterior.theme='cave';
        pyramidInterior.exitX=alien.x;
        pyramidInterior.exitY=alien.y;
        pyramidInterior.alien.x=220;
        pyramidInterior.alien.y=canvas.height-72;
        pyramidInterior.alien.vx=0;
        pyramidInterior.alien.vy=0;
        pyramidInterior.alien.facing=1;
        pyramidInterior.enterCD=20;
        initPyramidPuzzle();
        showMessage('You slip into the glowing cave...');
        break;
      }
    }
  }

  // Pyramid tomb entry (Khet + Earth desert: walk to the open pyramid's door + E/Enter)
  if(p.id==='tomb' || p.id==='earth'){
    for(let bi=0;bi<blocks.length;bi++){
      const b=blocks[bi];
      if(b.dead||b.buildingType!=='openPyramid')continue;
      const doorX=b.x+b.w/2;
      const doorY=b.y+b.h; // ground level of pyramid base
      if(Math.abs(alien.x-doorX)<20 && Math.abs(alien.y-doorY)<50 && (keys['enter']||keys['e'])){
        keys['enter']=false; keys['e']=false;
        pyramidInteriorMode=true;
        pyramidInterior.theme='tomb';
        pyramidInterior.exitX=alien.x;
        pyramidInterior.exitY=alien.y;
        pyramidInterior.alien.x=220;
        pyramidInterior.alien.y=canvas.height-72;
        pyramidInterior.alien.vx=0;
        pyramidInterior.alien.vy=0;
        pyramidInterior.alien.facing=1;
        pyramidInterior.enterCD=20;
        initPyramidPuzzle();
        showMessage('You step into the tomb...');
        break;
      }
      // Hint
      if(Math.abs(alien.x-doorX)<50 && Math.abs(alien.y-doorY)<60){
        b._doorHint=1;
      }
    }
  }

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
        ls.life=0;b.health-=15;maybeEvictFromDamage(b);b.cracked=true;
        if(!b.fixed){b.vx+=ls.vx*0.1;}
        for(let i=0;i<4;i++)debris.push({x:ls.x,y:ls.y,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,life:30,size:Math.random()*2+1,color:b.color});
        checkBuildingDestroyed(b);
      }
    });
  });
  laserShots=laserShots.filter(ls=>ls.life>0);

  // On-foot alien weapons (stun waves, plasma, gravity wells, parasites)
  updateAlienWeapons();

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
        if(Math.random()>0.4)weather.push({x:wx,y:camera.y-10,vx:Math.sin(frameT)*1,vy:1.5+Math.random()*2,life:100,type:'snow'});
      }else if(!wb.isOcean){
        // Rain for non-desert, non-ocean biomes
        weather.push({x:wx,y:camera.y-10,vx:0.5,vy:8+Math.random()*4,life:80,type:'rain'});
      }
    }
    if(p.id==='mars'&&Math.random()>0.85)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y+Math.random()*canvas.height,vx:3+Math.random()*2,vy:Math.random()-0.5,life:60,type:'dust'});
    if(p.id==='ice'&&Math.random()>0.6)weather.push({x:camera.x+Math.random()*canvas.width,y:camera.y-10,vx:Math.sin(frameT)*0.5,vy:1+Math.random()*2,life:120,type:'snow'});
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
    if(v.hijacked) return; // player-controlled
    if(Math.abs(v.x-_simPX)>3000)return;
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
  stepParticles();
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

  // Fires (throttled particle creation) + gravity for unstuck flames
  fires.forEach(f=>{f.life--;
    if(!f.stuck){
      f.vy=(f.vy||0)+0.25; f.vx=(f.vx||0)*0.98;
      f.y+=f.vy; f.x+=f.vx;
      if(f.y>=GROUND_LEVEL){f.y=GROUND_LEVEL;f.vy=0;f.stuck=true;}
    }
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
      const _preFallVY2 = h.bodyVY||0;
      parts.forEach(pt=>{if(!h.beingBeamed)h[pt+'VY']+=GRAVITY*0.8;h[pt+'VX']*=0.99;h[pt+'VY']*=0.99;h[pt+'X']+=h[pt+'VX'];h[pt+'Y']+=h[pt+'VY'];if(h[pt+'Y']>GROUND_LEVEL){h[pt+'Y']=GROUND_LEVEL;h[pt+'VY']*=-0.3;h[pt+'VX']*=0.8;}if(h[pt+'Y']<-2000){h[pt+'Y']=-2000;h[pt+'VY']*=-0.3;}});
      if(!h.beingBeamed && !h.splatted && !h.collected && _preFallVY2 > 12 && h.bodyY >= GROUND_LEVEL - 2){
        h.splatted = true;
        try { spawnGibs(h, 0, -2, 2.2 + Math.min(2, (_preFallVY2-12)*0.2)); } catch(e){}
        try { bleedEffect(h, 0, 1, 2); } catch(e){}
        playSound && playSound('splat');
        h.ragdollTimer = 418;
      }
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
        if(debugMode.active){ if(keys['f']){h.walkDir=1;h.walkSpeed=1.2;} else if(keys['b']){h.walkDir=-1;h.walkSpeed=1.2;} else if(keys['x']){h.walkSpeed=0;} }
        const mv=h.walkDir*h.walkSpeed;h.headX+=mv;h.bodyX+=mv;h.legLX+=mv;h.legRX+=mv;h.armLX+=mv;h.armRX+=mv;h.footLX+=mv;h.footRX+=mv;
      }
      const s=h.scale||1;
      const panicMul=1+Math.min(h.panicLevel||0,10)*0.12;
      const ph=h.walkTimer*0.1*panicMul;
      const legSwing=Math.sin(ph)*4*s;
      const armSwing=-Math.sin(ph)*3*s;
      const bob=Math.abs(Math.sin(ph))*1.2*s;
      h.headY=GROUND_LEVEL-40*s-bob; h.bodyY=GROUND_LEVEL-28*s-bob*0.6;
      h.legLY=GROUND_LEVEL-10*s; h.legRY=GROUND_LEVEL-10*s;
      h.armLY=GROUND_LEVEL-28*s-bob*0.4; h.armRY=GROUND_LEVEL-28*s-bob*0.4;
      h.footLY=GROUND_LEVEL; h.footRY=GROUND_LEVEL;
      h.legLX=h.bodyX-4*s+legSwing; h.legRX=h.bodyX+4*s-legSwing;
      h.footLX=h.legLX-1+legSwing*1.25; h.footRX=h.legRX+1-legSwing*1.25;
      h.armLX=h.bodyX-8*s+armSwing; h.armRX=h.bodyX+8*s-armSwing;
      h.headX=h.bodyX+(h.panicLevel>3?Math.sin(ph*2)*0.8*s:0);
      if(h.crying&&Math.random()>0.85)tears.push({x:h.headX+(Math.random()-0.5)*6,y:h.headY+3,vx:(Math.random()-0.5)*0.3,vy:0.8,life:30,size:1.5});
    }
  });

  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
}

// Execute the era swap + reposition ship near Earth. Called at the end of the wormhole intro.
function doWormholeWarp(wh){
  window.prehistoricEra=!window.prehistoricEra; // toggle: through once = past, through again = present
  // Snap the entire solar system back to its starting layout so planets stay reachable.
  const sunP = planets.find(p=>p.isSun);
  const sunSX = sunP ? sunP.spaceX : 0, sunSY = sunP ? sunP.spaceY : 0;
  planets.forEach(p=>{
    if(!p.orbits) return;
    if(p.orbitsEarth) return;
    if(p.initOrbitAngle!=null){
      p.orbitAngle = p.initOrbitAngle;
      p.spaceX = sunSX + Math.cos(p.orbitAngle) * p.orbitRadius;
      p.spaceY = sunSY + Math.sin(p.orbitAngle) * p.orbitRadius;
    }
  });
  const e=planets.find(p=>p.id==='earth');
  planets.forEach(p=>{
    if(!p.orbitsEarth || !e) return;
    if(p.initOrbitAngle!=null){
      p.orbitAngle = p.initOrbitAngle;
      p.spaceX = e.spaceX + Math.cos(p.orbitAngle) * p.orbitRadius;
      p.spaceY = e.spaceY + Math.sin(p.orbitAngle) * p.orbitRadius;
    }
  });
  if(e){
    const dropAng=Math.random()*Math.PI*2;
    ship.x=e.spaceX+Math.cos(dropAng)*(e.radius+300);
    ship.y=e.spaceY+Math.sin(dropAng)*(e.radius+300);
    ship.vx=Math.cos(dropAng)*2; ship.vy=Math.sin(dropAng)*2;
    e.savedState=null;
    const _mn = planets.find(pp=>pp.id==='moon');
    if(_mn) _mn.savedState = null;
  } else if(wh) {
    const ejAng=Math.atan2(ship.y-wh.spaceY,ship.x-wh.spaceX);
    ship.x=wh.spaceX+Math.cos(ejAng)*(wh.radius*2+60);
    ship.y=wh.spaceY+Math.sin(ejAng)*(wh.radius*2+60);
    ship.vx=Math.cos(ejAng)*4; ship.vy=Math.sin(ejAng)*4;
  }
  if(window.prehistoricEra){
    showMessage("68,000,000 YEARS AGO — THE CRETACEOUS. Earth belongs to the dinosaurs now...");
  } else {
    showMessage("Back to the present day. Earth is as you left it.");
  }
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
    }else if(transition.type==='wormholeIn'){
      // Dive into the wormhole: pull ship to its center, zoom in.
      const e=easeInOut(t);
      transition.zoom=1+e*7;
      const pull=0.03+e*0.09;
      ship.x+=(transition.planet.spaceX-ship.x)*pull;
      ship.y+=(transition.planet.spaceY-ship.y)*pull;
      ship.vx*=0.9;ship.vy*=0.9;
      if(t>=1){
        // Execute the era warp and reposition ship near Earth, then play a landing transition.
        doWormholeWarp(transition.planet);
        const _e=planets.find(pp=>pp.id==='earth');
        if(_e){
          transition={active:true,type:'landing',timer:0,duration:100,planet:_e,zoom:1};
        }else{
          transition.active=false;transition.zoom=1;
        }
      }
    }
    camera.x=ship.x-canvas.width/2;camera.y=ship.y-canvas.height/2;
    if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
    return;
  }

  // Advance planetary orbits (Sun stationary; Wormhole stationary).
  {
    const sunP = planets.find(p=>p.isSun);
    const sunX = sunP ? sunP.spaceX : 0, sunY = sunP ? sunP.spaceY : 0;
    // First pass: advance solar-orbit planets around the Sun
    planets.forEach(p=>{
      if(!p.orbits || p.orbitsEarth) return;
      p.orbitAngle += p.orbitSpeed;
      p.spaceX = sunX + Math.cos(p.orbitAngle) * p.orbitRadius;
      p.spaceY = sunY + Math.sin(p.orbitAngle) * p.orbitRadius;
    });
    // Second pass: Earth-orbiting bodies (Moon) — must run AFTER Earth moved.
    const earth = planets.find(p=>p.id==='earth');
    planets.forEach(p=>{
      if(!p.orbitsEarth || !earth) return;
      p.orbitAngle += p.orbitSpeed;
      p.spaceX = earth.spaceX + Math.cos(p.orbitAngle) * p.orbitRadius;
      p.spaceY = earth.spaceY + Math.sin(p.orbitAngle) * p.orbitRadius;
    });
  }

  // Space bounds: wide enough to reach Sun (far -x) and Wormhole (far +x,-y)
  // but not so wide the player gets lost in empty space.
  ship.x=Math.max(-10000,Math.min(spaceWidth+12000,ship.x));
  ship.y=Math.max(-spaceHeight-4000,Math.min(500,ship.y));
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
    if(p.isWormhole) return; // wormhole has special teleport behavior, not landing
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

  // Wormhole - flying through it triggers time travel (68M years back → prehistoric Earth)
  {
    const wh=planets.find(p=>p.isWormhole);
    if(wh && !transition.active){
      const whDist=dist(ship.x,ship.y,wh.spaceX,wh.spaceY);
      if(whDist<wh.radius*0.5){
        // Kick off the cinematic wormhole intro; the warp + era swap happens on completion,
        // then a standard landing transition onto Earth fires to arrive cinematically.
        transition={active:true,type:'wormholeIn',timer:0,duration:80,planet:wh,zoom:1};
        showMessage("Entering the wormhole...");
      }
    }
  }

  // Mothership docking — auto-enter when close (like planet landing)
  if(mothership._exitCool>0) mothership._exitCool--;
  const mDist=dist(ship.x,ship.y,mothershipPos.x,mothershipPos.y);
  if(mDist<80){
    ship.vx*=0.95;ship.vy*=0.95;
    if(mDist<50 && !(mothership._exitCool>0) && !mothershipMode){
      enterMothership();
    }
  }else{mothership._dockMsg=false;}

  stepParticles();
  if(messageTimer>0){messageTimer--;if(messageTimer===0)document.getElementById('message').style.opacity=0;}
  // Debug arena: override camera after normal camera logic has run.
  if(debugMode.active) updateDebug();
}

// ============================================================
// --- DRAW ---
// ============================================================
// Per-frame time cache (updated at start of draw). Replaces repeated Date.now() calls in hot paths.
let frameNow = Date.now();
let frameT = frameNow * 0.001;
// Gradient caches — Y-only linear gradients with constant stops can be created once and reused every frame.
let _oceanWaterGrad=null,_oceanSeabedGrad=null,_mountainFarGrad=null,_mountainMidGrad=null;
const _biomeGroundGradCache={};
function _getOceanWaterGrad(){if(!_oceanWaterGrad){const g=ctx.createLinearGradient(0,GROUND_LEVEL,0,SEABED_Y);g.addColorStop(0,'#0a5090');g.addColorStop(0.15,'#084080');g.addColorStop(0.4,'#063060');g.addColorStop(0.7,'#0a3050');g.addColorStop(1,'#1a3850');_oceanWaterGrad=g;}return _oceanWaterGrad;}
function _getOceanSeabedGrad(){if(!_oceanSeabedGrad){const g=ctx.createLinearGradient(0,SEABED_Y,0,SEABED_Y+120);g.addColorStop(0,'#c8a868');g.addColorStop(0.3,'#a88848');g.addColorStop(1,'#5a4020');_oceanSeabedGrad=g;}return _oceanSeabedGrad;}
function _getMountainFarGrad(){if(!_mountainFarGrad){const g=ctx.createLinearGradient(0,GROUND_LEVEL-200,0,GROUND_LEVEL);g.addColorStop(0,'#8894a4');g.addColorStop(0.5,'#6a7686');g.addColorStop(1,'#4c5868');_mountainFarGrad=g;}return _mountainFarGrad;}
function _getMountainMidGrad(){if(!_mountainMidGrad){const g=ctx.createLinearGradient(0,GROUND_LEVEL-360,0,GROUND_LEVEL);g.addColorStop(0,'#a8aeb4');g.addColorStop(0.12,'#807870');g.addColorStop(0.38,'#5e564c');g.addColorStop(0.7,'#463c30');g.addColorStop(1,'#2c2418');_mountainMidGrad=g;}return _mountainMidGrad;}
function _getBiomeGroundGrad(biome){let g=_biomeGroundGradCache[biome.id];if(!g){g=ctx.createLinearGradient(0,GROUND_LEVEL,0,GROUND_LEVEL+200);g.addColorStop(0,biome.groundColor[0]);g.addColorStop(0.3,biome.groundColor[1]);g.addColorStop(1,biome.groundColor[2]);_biomeGroundGradCache[biome.id]=g;}return g;}
function draw(){
  frameNow = Date.now();
  frameT = frameNow * 0.001;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(mothershipMode){drawMothership();return;}
  if(pyramidInteriorMode){drawPyramidInterior();return;}
  if(gameMode==='space'){drawSpace();return;}
  drawPlanet();
}

function drawSpace(){
  ctx.fillStyle='#020208';ctx.fillRect(0,0,canvas.width,canvas.height);
  // Stars (not affected by zoom)
  const _dsStep = window._perfMode ? 3 : 1;
  for(let _si=0;_si<deepStars.length;_si+=_dsStep){
    const s=deepStars[_si];
    s.twinkle+=s.speed;
    const sx=(s.x-camera.x*0.15)%(canvas.width+400)-200,sy=(s.y-camera.y*0.15)%(canvas.height+400)-200;
    ctx.fillStyle=s.color;ctx.globalAlpha=0.4+Math.sin(s.twinkle)*0.4;ctx.beginPath();ctx.arc(sx,sy,s.size,0,Math.PI*2);ctx.fill();
  }
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
    // Wormhole: render as swirling anomaly instead of normal planet body
    if(p.isWormhole){
      const t2=frameT;
      if(!p._whAng) p._whAng=0; p._whAng+=0.02;
      const ang=p._whAng;
      // Outer swirl rings
      for(let ring=0;ring<6;ring++){
        const r=p.radius*(1.5-ring*0.18);
        const a=0.2-ring*0.025;
        ctx.strokeStyle=`rgba(${120+ring*25},${20+ring*10},${200+ring*8},${a})`;
        ctx.lineWidth=4-ring*0.45;
        ctx.beginPath();ctx.arc(sx,sy,r,ang+ring*0.5,ang+ring*0.5+Math.PI*1.2);ctx.stroke();
        ctx.beginPath();ctx.arc(sx,sy,r,ang+ring*0.5+Math.PI,ang+ring*0.5+Math.PI*2.2);ctx.stroke();
      }
      // Core glow
      const glow=ctx.createRadialGradient(sx,sy,0,sx,sy,p.radius);
      glow.addColorStop(0,`rgba(180,100,255,${0.35+Math.sin(t2*3)*0.1})`);
      glow.addColorStop(0.5,'rgba(100,0,200,0.1)');
      glow.addColorStop(1,'transparent');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sx,sy,p.radius,0,Math.PI*2);ctx.fill();
      // Center bright spot
      ctx.fillStyle=`rgba(220,180,255,${0.5+Math.sin(t2*4)*0.3})`;
      ctx.beginPath();ctx.arc(sx,sy,16+Math.sin(t2*2)*4,0,Math.PI*2);ctx.fill();
      // Particle pull effect
      for(let i=0;i<4;i++){
        const pa=t2*2+i*1.6,pr=p.radius*(0.5+Math.sin(t2+i)*0.3);
        ctx.fillStyle=`rgba(180,100,255,${0.3+Math.sin(t2+i)*0.2})`;
        ctx.beginPath();ctx.arc(sx+Math.cos(pa)*pr,sy+Math.sin(pa)*pr*0.5,3+Math.sin(t2*3+i)*1.5,0,Math.PI*2);ctx.fill();
      }
      // Label
      const dWh=dist(ship.x,ship.y,sx,sy);
      if(dWh<p.radius+800){
        const la=Math.min(1,(p.radius+800-dWh)/400);ctx.globalAlpha=la;
        ctx.fillStyle='#c8f';ctx.font='bold 16px monospace';ctx.textAlign='center';
        ctx.fillText(tr('planet.wormhole.name').toUpperCase(),sx,sy+p.radius+30);
        if(dWh<p.radius+200){ctx.fillStyle='#a6d';ctx.font='11px monospace';ctx.fillText('fly into the anomaly...',sx,sy+p.radius+48);}
        ctx.globalAlpha=1;
      }
      return; // skip the normal planet body/bands/lock logic
    }
    // Atmosphere glow (gradient cached per planet — coords + colors are static)
    if(!p._atmosphereGrad){
      const gr=ctx.createRadialGradient(sx,sy,p.radius*0.8,sx,sy,p.radius*1.4);
      gr.addColorStop(0,p.atmosphere+'40');gr.addColorStop(1,'transparent');
      p._atmosphereGrad=gr;
    }
    ctx.fillStyle=p._atmosphereGrad;ctx.beginPath();ctx.arc(sx,sy,p.radius*1.4,0,Math.PI*2);ctx.fill();
    // Planet body — bright, lit sphere. No black rim; fades to color2 so every planet
    // reads as a light source even from far away.
    if(!p._bodyGrad){
      const pg=ctx.createRadialGradient(sx-p.radius*0.3,sy-p.radius*0.3,p.radius*0.1,sx,sy,p.radius);
      pg.addColorStop(0,p.color);pg.addColorStop(0.75,p.color2);pg.addColorStop(1,p.color2);
      p._bodyGrad=pg;
    }
    ctx.fillStyle=p._bodyGrad;ctx.beginPath();ctx.arc(sx,sy,p.radius,0,Math.PI*2);ctx.fill();
    // Saturn rings
    if(p.hasRings){
      ctx.save();
      ctx.strokeStyle='rgba(240,210,150,0.7)';ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(sx,sy,p.radius*1.6,p.radius*0.35,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='rgba(210,180,120,0.45)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(sx,sy,p.radius*1.85,p.radius*0.42,0,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='rgba(180,150,100,0.35)';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(sx,sy,p.radius*2.05,p.radius*0.48,0,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
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
    }else if(transition.type==='wormholeIn'){
      // Swirling purple/cyan vortex drawn as concentric rotating arcs around screen center.
      const cx=canvas.width/2, cy=canvas.height/2;
      const e=easeIn(t);
      // Darken background
      ctx.fillStyle=`rgba(8,2,22,${0.25+e*0.55})`;ctx.fillRect(0,0,canvas.width,canvas.height);
      const maxR=Math.hypot(cx,cy)*1.1;
      const rings=18;
      const baseAng=transition.timer*0.18;
      ctx.save();
      ctx.translate(cx,cy);
      for(let i=0;i<rings;i++){
        const rt=i/rings;
        const r=maxR*(rt+e*0.6)%maxR;
        const ang=baseAng+i*0.6;
        const hue=260+Math.sin(i*0.8+transition.timer*0.05)*60;
        ctx.strokeStyle=`hsla(${hue},85%,${50+rt*30}%,${0.18+(1-rt)*0.35})`;
        ctx.lineWidth=4+rt*6;
        ctx.beginPath();
        for(let a=0;a<Math.PI*2;a+=0.12){
          const wob=Math.sin(a*4+transition.timer*0.1+i)*12;
          const rx=(r+wob)*Math.cos(a+ang);
          const ry=(r+wob)*Math.sin(a+ang)*0.9;
          if(a===0)ctx.moveTo(rx,ry); else ctx.lineTo(rx,ry);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // Central bright core punches through near the end
      const coreR=40+e*220;
      const coreGrad=ctx.createRadialGradient(0,0,0,0,0,coreR);
      coreGrad.addColorStop(0,`rgba(255,240,255,${0.2+e*0.75})`);
      coreGrad.addColorStop(0.5,`rgba(180,120,255,${0.2+e*0.45})`);
      coreGrad.addColorStop(1,'rgba(20,0,40,0)');
      ctx.fillStyle=coreGrad;
      ctx.beginPath();ctx.arc(0,0,coreR,0,Math.PI*2);ctx.fill();
      // Streaks radiating outward
      ctx.strokeStyle=`rgba(255,255,255,${0.25+e*0.5})`;
      ctx.lineWidth=2;
      for(let i=0;i<24;i++){
        const a=i*(Math.PI*2/24)+baseAng*0.5;
        const inner=30+e*80;
        const outer=inner+80+e*300;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);
        ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);
        ctx.stroke();
      }
      ctx.restore();
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
  minX-=pad;maxX+=pad;minY-=pad;maxY+=pad;
  // Also include ship
  minX=Math.min(minX,ship.x);maxX=Math.max(maxX,ship.x);minY=Math.min(minY,ship.y);maxY=Math.max(maxY,ship.y);
  const rangeX=maxX-minX||1,rangeY=maxY-minY||1;
  const sX=mW/rangeX,sY=mH/rangeY;

  ctx.fillStyle='rgba(0,20,0,0.7)';ctx.strokeStyle='#0f0';ctx.lineWidth=1;ctx.fillRect(mX,mY,mW,mH);ctx.strokeRect(mX,mY,mW,mH);
  // Clip all planet drawing to the minimap rect so nothing leaks outside the frame.
  ctx.save(); ctx.beginPath(); ctx.rect(mX,mY,mW,mH); ctx.clip();
  planets.forEach(p=>{
    if(p.isSun && !p.discovered) return; // hidden until discovered
    const pd=Math.sqrt((p.spaceX-ship.x)**2+(p.spaceY-ship.y)**2);
    // Match the bounds-calculation skip rule exactly — only show visited or nearby planets.
    if(pd>3000&&!p.visited)return;
    const px=mX+(p.spaceX-minX)*sX,py=mY+(p.spaceY-minY)*sY,pr=Math.max(4,p.radius*sX);
    const isLocked=!unlockedPlanets.includes(p.id);
    // Planets always render as bright lights on the minimap — locked or not.
    // A subtle glow halo makes them read as little suns instead of dull dots.
    ctx.fillStyle=p.color+'55';ctx.beginPath();ctx.arc(px,py,pr+2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill();
    // Medal dot
    const comp=planetProgress[p.id]?planetProgress[p.id].completion:'none';
    if(comp!=='none'){ctx.fillStyle=comp==='gold'?'#ffd700':comp==='silver'?'#c0c0c0':'#cd7f32';ctx.beginPath();ctx.arc(px+pr+3,py-pr,2,0,Math.PI*2);ctx.fill();}
    // Tiny label
    ctx.fillStyle='#0f0';ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(tr('planet.'+p.id+'.name'),px,py+pr+8);
  });
  ctx.restore();
  // (Wormhole now lives in the planets array and is rendered there with the 'WH' marker inlined)
  // Mothership on minimap
  const mmx=mX+(mothershipPos.x-minX)*sX,mmy=mY+(mothershipPos.y-minY)*sY;
  ctx.fillStyle='#0f0';ctx.beginPath();ctx.ellipse(mmx,mmy,6,2,0,0,Math.PI*2);ctx.fill();
  ctx.font='7px monospace';ctx.textAlign='center';ctx.fillText(tr('hud.base'),mmx,mmy+9);
  // Ship
  const sx=mX+(ship.x-minX)*sX,sy=mY+(ship.y-minY)*sY;ctx.fillStyle='#0f0';ctx.beginPath();ctx.arc(sx,sy,3,0,Math.PI*2);ctx.fill();
  if(Math.sin(ship.lightPhase*3)>0){ctx.strokeStyle='#0f0';ctx.beginPath();ctx.arc(sx,sy,6,0,Math.PI*2);ctx.stroke();}
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
      const ra=ri*Math.PI/4+frameNow*0.0003;
      const rayLen=50+Math.sin(frameNow*0.002+ri)*10;
      ctx.beginPath();ctx.moveTo(sunX+Math.cos(ra)*30,sunY+Math.sin(ra)*30);
      ctx.lineTo(sunX+Math.cos(ra)*rayLen,sunY+Math.sin(ra)*rayLen);ctx.stroke();
    }
    ctx.globalAlpha=1;
    // Brighten sky when sun is visible
    ctx.fillStyle=`rgba(80,80,40,${sunVis*0.08})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  // Night overlay when sun is not visible
  if(sunVis<0.3){
    ctx.fillStyle=`rgba(0,0,20,${(0.3-sunVis)*0.5})`;ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  ctx.save();
  // Apply zoom around screen center before translating into world space.
  if(Math.abs(worldZoom-1)>0.001){
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.scale(worldZoom,worldZoom);
    ctx.translate(-canvas.width/2,-canvas.height/2);
  }
  ctx.translate(-camera.x,-camera.y);
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
    let minY = Infinity, maxY = -Infinity;
    for(let pi=0; pi<puffs; pi++){
      const tt = pi/(puffs-1);
      const px = c.x - c.width/2 + tt*c.width;
      const py = c.y + Math.sin(pi*1.7+c.x*0.01)*c.height*0.12;
      const shape = Math.sin(tt*Math.PI);
      const pr = c.height*0.48 * (0.6 + shape*0.7 + Math.sin(pi*2.3+c.x*0.02)*0.08);
      puffList.push({px,py,pr});
      if(py-pr<minY) minY=py-pr;
      if(py+pr>maxY) maxY=py+pr;
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
    const _bt = frameT;
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
    const _t = frameT;
    for(let bx=Math.floor(camera.x/30)*30-30;bx<camera.x+canvas.width+30;bx+=30){
      const biome=getEarthBiome(bx);
      if(biome.isOcean){
        // Ocean: draw water body from surface down to seabed
        ctx.fillStyle=_getOceanWaterGrad();ctx.fillRect(bx,GROUND_LEVEL,31,WATER_DEPTH);
        // Sandy seabed (brighter so it's visible)
        ctx.fillStyle=_getOceanSeabedGrad();ctx.fillRect(bx,SEABED_Y,31,canvas.height+Math.abs(camera.y));
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
        ctx.fillStyle=_getBiomeGroundGrad(biome);ctx.fillRect(bx,GROUND_LEVEL,31,canvas.height+Math.abs(camera.y));
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
          ctx.fillStyle=_getMountainFarGrad();
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
          ctx.fillStyle=_getMountainMidGrad();
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

        else if(obj.type === 'mosasaurus') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.dir = 1; }
          obj.y += Math.sin(_t*0.7 + obj.phase) * 0.3;
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.scale(obj.dir, 1);
          const sway = Math.sin(_t*2 + obj.phase) * 6;
          // Tail (long, tapered, sways)
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath();
          ctx.moveTo(-15, -8);
          ctx.quadraticCurveTo(-60, -4 + sway*0.5, -90, sway);
          ctx.quadraticCurveTo(-95, sway+2, -92, sway+4);
          ctx.quadraticCurveTo(-60, 4 + sway*0.5, -15, 8);
          ctx.fill();
          // Tail fluke
          ctx.beginPath();
          ctx.moveTo(-88, sway-2);
          ctx.lineTo(-104, sway-10);
          ctx.lineTo(-100, sway);
          ctx.lineTo(-104, sway+10);
          ctx.lineTo(-88, sway+2);
          ctx.fill();
          // Body
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath();
          ctx.moveTo(-20, -12);
          ctx.quadraticCurveTo(10, -16, 30, -10);
          ctx.quadraticCurveTo(45, -5, 50, 0);
          ctx.quadraticCurveTo(45, 5, 30, 10);
          ctx.quadraticCurveTo(10, 16, -20, 12);
          ctx.fill();
          // Belly
          ctx.fillStyle = obj.bellyColor;
          ctx.beginPath();
          ctx.moveTo(-20, 8); ctx.quadraticCurveTo(10, 13, 35, 6);
          ctx.quadraticCurveTo(10, 10, -20, 8);
          ctx.fill();
          // Jaw (open slightly)
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath();
          ctx.moveTo(40, -8); ctx.lineTo(58, -6); ctx.lineTo(56, -2); ctx.lineTo(42, -4);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(42, 4); ctx.lineTo(58, 6); ctx.lineTo(56, 10); ctx.lineTo(40, 8);
          ctx.fill();
          // Teeth
          ctx.fillStyle = '#f0e8d0';
          for(let i=0; i<5; i++){
            ctx.beginPath(); ctx.moveTo(42+i*3, -3); ctx.lineTo(43+i*3, 0); ctx.lineTo(44+i*3, -3); ctx.fill();
            ctx.beginPath(); ctx.moveTo(42+i*3, 5); ctx.lineTo(43+i*3, 2); ctx.lineTo(44+i*3, 5); ctx.fill();
          }
          // Eye
          ctx.fillStyle = '#ffe040'; ctx.beginPath(); ctx.arc(38, -6, 2.2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(38.5, -6, 1.1, 0, Math.PI*2); ctx.fill();
          // Flippers
          const flap = Math.sin(_t*1.8 + obj.phase) * 0.35;
          ctx.fillStyle = obj.bodyColor;
          ctx.save(); ctx.translate(10, 11); ctx.rotate(0.3 + flap);
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(-5, 12); ctx.rotate(0.4 - flap);
          ctx.beginPath(); ctx.ellipse(0, 0, 12, 3.5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(10, -11); ctx.rotate(-0.3 - flap);
          ctx.beginPath(); ctx.ellipse(0, 0, 12, 3.5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.restore();
        }

        else if(obj.type === 'plesiosaurus') {
          obj.x += obj.dir * obj.speed;
          if(obj.x > oceanBounds.to) { obj.dir = -1; }
          if(obj.x < oceanBounds.from) { obj.dir = 1; }
          obj.y += Math.sin(_t*0.9 + obj.phase) * 0.2;
          ctx.save(); ctx.translate(obj.x, obj.y); ctx.scale(obj.dir, 1);
          // Body (rounded)
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath(); ctx.ellipse(0, 0, 28, 11, 0, 0, Math.PI*2); ctx.fill();
          // Belly
          ctx.fillStyle = obj.bellyColor;
          ctx.beginPath(); ctx.ellipse(0, 4, 22, 5, 0, 0, Math.PI*2); ctx.fill();
          // Long neck (curved, sways)
          const neckS = Math.sin(_t*1.2 + obj.phase) * 4;
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath();
          ctx.moveTo(20, -6);
          ctx.quadraticCurveTo(36, -18 + neckS*0.3, 52, -22 + neckS);
          ctx.quadraticCurveTo(56, -20 + neckS, 54, -18 + neckS);
          ctx.quadraticCurveTo(40, -12 + neckS*0.2, 22, -2);
          ctx.fill();
          // Head
          ctx.fillStyle = obj.bodyColor;
          ctx.beginPath(); ctx.ellipse(55, -22 + neckS, 6, 4, 0, 0, Math.PI*2); ctx.fill();
          // Eye
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(58, -23 + neckS, 0.9, 0, Math.PI*2); ctx.fill();
          // Tail
          ctx.fillStyle = obj.bodyColor;
          const tailS = Math.sin(_t*1.5 + obj.phase) * 3;
          ctx.beginPath();
          ctx.moveTo(-22, -4);
          ctx.quadraticCurveTo(-36, 0 + tailS*0.4, -44, tailS);
          ctx.quadraticCurveTo(-36, 4 + tailS*0.4, -22, 4);
          ctx.fill();
          // Four flippers
          const fl = Math.sin(_t*1.5 + obj.phase) * 0.4;
          ctx.fillStyle = obj.bodyColor;
          ctx.save(); ctx.translate(8, 8); ctx.rotate(0.4 + fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(-10, 8); ctx.rotate(0.5 - fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(8, -7); ctx.rotate(-0.4 - fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 12, 3.5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
          ctx.save(); ctx.translate(-10, -7); ctx.rotate(-0.5 + fl);
          ctx.beginPath(); ctx.ellipse(0, 0, 11, 3, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
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

        else if(obj.type === 'seabedCave') {
          // Organic rock mouth carved into seabed — irregular silhouette + glow inside
          const cx0 = obj.x, cy0 = obj.y, w = obj.w, h = obj.h;
          const glow = 0.55 + Math.sin(_t*2 + obj.glowPhase)*0.15;
          // Outer rocky lip (dark mass around the mouth)
          ctx.fillStyle = '#1a1208';
          ctx.beginPath();
          ctx.moveTo(cx0 - w*0.8, cy0);
          // Jagged rock perimeter above opening
          const lipSteps = 14;
          for(let s=0;s<=lipSteps;s++){
            const tt = s/lipSteps;
            const ang = Math.PI + tt*Math.PI; // sweep top half
            const rx = Math.cos(ang)*w*0.9;
            const wobble = (Math.sin(s*1.7 + obj.glowPhase)*8) + (s%2?4:-4);
            const ry = Math.sin(ang)*h*1.1 + wobble;
            ctx.lineTo(cx0+rx, cy0+ry);
          }
          ctx.lineTo(cx0 + w*0.8, cy0);
          ctx.closePath();
          ctx.fill();
          // Inner black void (the mouth itself)
          const mouthG = ctx.createRadialGradient(cx0, cy0-h*0.35, 4, cx0, cy0-h*0.35, w*0.85);
          mouthG.addColorStop(0, `rgba(40,120,180,${0.6*glow})`);
          mouthG.addColorStop(0.35, `rgba(10,40,80,${0.5*glow})`);
          mouthG.addColorStop(1, 'rgba(0,0,0,0.95)');
          ctx.fillStyle = mouthG;
          ctx.beginPath();
          ctx.ellipse(cx0, cy0-h*0.35, w*0.7, h*0.75, 0, Math.PI, 0);
          ctx.fill();
          // Stalactite teeth hanging from lip
          ctx.fillStyle = '#0a0804';
          for(let ti=0;ti<6;ti++){
            const tx = cx0 - w*0.55 + ti*(w*1.1/5);
            const th = 10 + ((ti*7)%12);
            ctx.beginPath();
            ctx.moveTo(tx-5, cy0-h*0.95);
            ctx.lineTo(tx+5, cy0-h*0.95);
            ctx.lineTo(tx, cy0-h*0.95 + th);
            ctx.closePath(); ctx.fill();
          }
          // Glowing floating motes drifting out
          for(let mi=0;mi<8;mi++){
            const p = ((_t*0.4 + obj.motePhase + mi*0.7)%1);
            const mx = cx0 + Math.sin(mi*1.3 + _t*0.5)*w*0.35;
            const my = cy0 - h*0.3 - p*40;
            ctx.fillStyle = `rgba(120,220,255,${(1-p)*0.8*glow})`;
            ctx.beginPath(); ctx.arc(mx, my, 1.8, 0, Math.PI*2); ctx.fill();
          }
          // Moss/kelp tufts at base
          ctx.strokeStyle = '#0a4a2a'; ctx.lineWidth = 2;
          for(let ki=0;ki<5;ki++){
            const kx = cx0 - w*0.5 + ki*(w/4);
            const sway = Math.sin(_t + ki*1.3)*3;
            ctx.beginPath(); ctx.moveTo(kx, cy0);
            ctx.quadraticCurveTo(kx+sway, cy0-8, kx+sway*1.2, cy0-16);
            ctx.stroke();
          }
          // Interact hint when alien is near and underwater
          if(playerMode==='onfoot' && alien.underwater){
            const dx = alien.x - cx0, dy = alien.y - (cy0 - h*0.4);
            if(Math.abs(dx)<w*0.7 && Math.abs(dy)<h*0.9){
              ctx.fillStyle = `rgba(180,240,255,${0.7+Math.sin(_t*4)*0.2})`;
              ctx.font = 'bold 12px monospace'; ctx.textAlign='center';
              ctx.fillText('[E] enter cave', cx0, cy0-h*1.2);
            }
          }
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
  }else if(p.id==='tomb' || p.isGasGiant){
    // Saturn: gas giant — no solid ground, endless banded cloud decks
    const _sg = ctx.createLinearGradient(0,GROUND_LEVEL-20,0,GROUND_LEVEL+400);
    _sg.addColorStop(0,'#f0dcb0'); _sg.addColorStop(0.15,'#d4a868');
    _sg.addColorStop(0.35,'#e8c890'); _sg.addColorStop(0.55,'#a87840');
    _sg.addColorStop(0.75,'#c89858'); _sg.addColorStop(1,'#6a4820');
    ctx.fillStyle=_sg; ctx.fillRect(camera.x-200,GROUND_LEVEL-20,canvas.width+400,canvas.height+Math.abs(camera.y)+40);
    // Horizontal cloud bands (slow parallax drift)
    const _ct = frameT*0.2;
    for(let by=0; by<9; by++){
      const bandY = GROUND_LEVEL + by*22;
      const bandH = 8+by*0.8;
      const alpha = 0.12 + (by%2)*0.08;
      const tint = by%3===0 ? '240,220,170' : (by%3===1 ? '160,110,60' : '210,170,110');
      for(let bx=Math.floor(camera.x/120)*120-120; bx<camera.x+canvas.width+120; bx+=120){
        const wob = Math.sin(bx*0.008 + by*1.7 + _ct*0.01)*6;
        ctx.fillStyle=`rgba(${tint},${alpha})`;
        ctx.beginPath();
        ctx.ellipse(bx+60 + (_ct*(1+by*0.1)%240 - 120), bandY+wob, 80, bandH, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }
    // Atmospheric wisps near horizon
    for(let wx=Math.floor(camera.x/80)*80-80; wx<camera.x+canvas.width+80; wx+=80){
      const ws=Math.sin(wx*0.023+_ct*0.02)*0.5+0.5;
      if(ws>0.45){
        ctx.fillStyle=`rgba(255,245,210,${0.1+ws*0.15})`;
        ctx.beginPath();
        ctx.ellipse(wx + _ct*0.3%160, GROUND_LEVEL-6 - ws*8, 45, 3+ws*2, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }
    // Faint lightning flicker in deeper bands
    if(Math.random()<0.006){
      const flx = camera.x + Math.random()*canvas.width;
      const fly = GROUND_LEVEL + 80 + Math.random()*120;
      ctx.strokeStyle='rgba(255,250,220,0.7)';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.moveTo(flx,fly);
      for(let k=0;k<5;k++){ ctx.lineTo(flx+(Math.random()-0.5)*14, fly+k*6); }
      ctx.stroke();
    }
  }else if(p.id==='moon'){
    // Moon: dusty grey regolith, craters, no grass, no atmosphere
    const _mg = ctx.createLinearGradient(0,GROUND_LEVEL,0,GROUND_LEVEL+200);
    _mg.addColorStop(0,'#bcbcc0'); _mg.addColorStop(0.3,'#8c8c90'); _mg.addColorStop(1,'#3a3a3e');
    ctx.fillStyle=_mg; ctx.fillRect(camera.x-200,GROUND_LEVEL,canvas.width+400,canvas.height+Math.abs(camera.y));
    // Deterministic craters tiled across worldWidth
    for(let cx=Math.floor(camera.x/140)*140-140; cx<camera.x+canvas.width+140; cx+=140){
      const cs=Math.sin(cx*0.013)*0.5+0.5;
      if(cs>0.25){
        const cr=8+cs*22;
        // Inner shadow bowl
        ctx.fillStyle='rgba(25,25,32,0.55)';
        ctx.beginPath();ctx.ellipse(cx+20,GROUND_LEVEL+cr*0.25,cr,cr*0.35,0,0,Math.PI*2);ctx.fill();
        // Bright upper rim
        ctx.strokeStyle='rgba(235,235,240,0.4)';ctx.lineWidth=2;
        ctx.beginPath();ctx.ellipse(cx+20,GROUND_LEVEL+cr*0.25,cr,cr*0.35,0,Math.PI,Math.PI*2);ctx.stroke();
        // Dark lower lip
        ctx.strokeStyle='rgba(30,30,38,0.5)';ctx.lineWidth=1.3;
        ctx.beginPath();ctx.ellipse(cx+20,GROUND_LEVEL+cr*0.25,cr,cr*0.35,0,0,Math.PI);ctx.stroke();
      }
      // Small scattered rocks
      const rs=Math.sin(cx*0.041+12.3)*0.5+0.5;
      if(rs>0.4){
        ctx.fillStyle='rgba(50,50,58,0.55)';
        ctx.beginPath();ctx.ellipse(cx+70,GROUND_LEVEL-1,2+rs*2,1.2,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='rgba(240,240,245,0.3)';
        ctx.beginPath();ctx.ellipse(cx+69,GROUND_LEVEL-2,1,0.5,0,0,Math.PI*2);ctx.fill();
      }
    }
    // Dust speckles
    for(let dx=Math.floor(camera.x/25)*25-25; dx<camera.x+canvas.width+25; dx+=25){
      const ds=Math.sin(dx*0.17)*0.5+0.5;
      ctx.fillStyle=`rgba(70,70,80,${0.18+ds*0.15})`;
      ctx.fillRect(dx,GROUND_LEVEL+3+ds*10,2,1);
    }
    // --- Flag (fixed world position, rigid — no wind on airless moon) ---
    // Skipped 68M years ago: no humans had landed yet.
    const flagX=worldWidth*0.5;
    if(!window.prehistoricEra && flagX>camera.x-120 && flagX<camera.x+canvas.width+120){
      // Footprint trail leading to flag
      ctx.fillStyle='rgba(40,40,50,0.35)';
      for(let fp=0;fp<8;fp++){
        const fx=flagX-100+fp*14;
        ctx.fillRect(fx,GROUND_LEVEL-1,4,1.5);
        ctx.fillRect(fx+7,GROUND_LEVEL,4,1.5);
      }
      // Pole
      ctx.fillStyle='#d8d8dc';
      ctx.fillRect(flagX,GROUND_LEVEL-70,1.6,70);
      // Pole tip
      ctx.fillStyle='#f0f0f4';
      ctx.beginPath();ctx.arc(flagX+0.8,GROUND_LEVEL-70,1.5,0,Math.PI*2);ctx.fill();
      // Small base mound
      ctx.fillStyle='#5a5a60';
      ctx.beginPath();ctx.ellipse(flagX+1,GROUND_LEVEL,7,2,0,0,Math.PI*2);ctx.fill();
      // Stiff flag (no wind)
      ctx.fillStyle='#fff';ctx.fillRect(flagX+1.6,GROUND_LEVEL-70,22,14);
      ctx.fillStyle='#c02030';
      for(let s=1;s<7;s+=2){ctx.fillRect(flagX+1.6,GROUND_LEVEL-70+s*2,22,2);}
      ctx.fillStyle='#1a3a8a';ctx.fillRect(flagX+1.6,GROUND_LEVEL-70,9,7);
      // Tiny stars on canton
      ctx.fillStyle='#fff';
      for(let sx=0;sx<3;sx++) for(let sy=0;sy<2;sy++){
        ctx.fillRect(flagX+3+sx*3, GROUND_LEVEL-68+sy*3, 0.8, 0.8);
      }
    }
    // --- Lone weird moon creature (wanders slowly) ---
    if(!p._moonCreature){ p._moonCreature={x:worldWidth*0.65, vx:0.25, phase:Math.random()*6, sadT:Math.random()*240}; }
    const mc=p._moonCreature;
    mc.phase+=0.03; mc.x+=mc.vx*0.5; mc.sadT--;
    if(mc.x>worldWidth-250||mc.x<250) mc.vx=-mc.vx;
    if(mc.sadT<=0) mc.sadT=180+Math.random()*300;
    if(mc.x>camera.x-80 && mc.x<camera.x+canvas.width+80){
      const hop=Math.abs(Math.sin(mc.phase))*3;
      const cy=GROUND_LEVEL-14-hop;
      // Ground shadow
      ctx.fillStyle='rgba(15,15,20,0.5)';
      ctx.beginPath();ctx.ellipse(mc.x,GROUND_LEVEL,10,2,0,0,Math.PI*2);ctx.fill();
      // Soft halo
      ctx.fillStyle='rgba(180,200,255,0.18)';
      ctx.beginPath();ctx.ellipse(mc.x,cy,15,12,0,0,Math.PI*2);ctx.fill();
      // Body (pale translucent blob)
      ctx.fillStyle='#d8d4e8';
      ctx.beginPath();ctx.ellipse(mc.x,cy,10,8,0,0,Math.PI*2);ctx.fill();
      // Belly gradient
      ctx.fillStyle='rgba(255,255,255,0.25)';
      ctx.beginPath();ctx.ellipse(mc.x-2,cy-2,5,3,0,0,Math.PI*2);ctx.fill();
      // Drooping tentacles
      ctx.strokeStyle='#b8b4c8';ctx.lineWidth=2;ctx.lineCap='round';
      for(let t=0;t<3;t++){
        const tx=mc.x-6+t*6;
        const ty=cy+5;
        const swing=Math.sin(mc.phase+t*1.3)*1.5;
        ctx.beginPath();ctx.moveTo(tx,ty);
        ctx.quadraticCurveTo(tx+swing,ty+4,tx+swing,ty+8);ctx.stroke();
      }
      // Two big sad eyes
      const blink=Math.sin(mc.phase*0.4)>0.95?0.1:1;
      ctx.fillStyle='#111';
      ctx.beginPath();ctx.ellipse(mc.x-3,cy-1,1.8,1.8*blink,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(mc.x+3,cy-1,1.8,1.8*blink,0,0,Math.PI*2);ctx.fill();
      // Eye glints
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(mc.x-3.4,cy-1.4,0.5,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(mc.x+2.6,cy-1.4,0.5,0,Math.PI*2);ctx.fill();
      // Small antenna with dot
      ctx.strokeStyle='#b8b4c8';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(mc.x,cy-7);ctx.lineTo(mc.x+Math.sin(mc.phase*2)*1.5,cy-12);ctx.stroke();
      ctx.fillStyle='#f0e0ff';
      ctx.beginPath();ctx.arc(mc.x+Math.sin(mc.phase*2)*1.5,cy-12.5,1.2,0,Math.PI*2);ctx.fill();
      // Occasional silent mood
      if(mc.sadT<60){
        ctx.fillStyle='rgba(200,200,255,0.7)';ctx.font='10px monospace';ctx.textAlign='center';
        ctx.fillText('...', mc.x, cy-17);
      }
    }
  }else{
    ctx.fillStyle=_getBiomeGroundGrad({id:'planet_'+p.id,groundColor:p.groundColor});ctx.fillRect(camera.x-200,GROUND_LEVEL,canvas.width+400,canvas.height+Math.abs(camera.y));
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

  // --- GROUND-LEVEL GORE / TIRE MARKS (under humans) ---
  drawSkidMarks();
  drawBloodPools();

  // --- DRAW INHABITANTS (with frustum culling) ---
  humans.forEach(h=>{if(h.collected||h.hidden)return;
    if(h.bodyX<camera.x-60||h.bodyX>camera.x+canvas.width+60||h.bodyY<camera.y-80||h.bodyY>camera.y+canvas.height+40)return;
    renderHuman(h);
  });

  // --- DRAW COWS ---
  cows.forEach(c=>{
    if(c.collected)return;
    if(c.x<camera.x-80||c.x>camera.x+canvas.width+80)return;
    renderCow(c);
  });

  // Gibs (tumbling flesh)
  drawGibs();

  // Tears
  tears.forEach(t=>{ctx.fillStyle=`rgba(100,150,255,${t.life/40})`;ctx.beginPath();ctx.arc(t.x,t.y,t.size,0,Math.PI*2);ctx.fill();});
  // Speech bubbles disabled
  // UFO wrecks — twisted metal hulk with faint glow
  ufoWrecks.forEach(w=>{
    if(w.x<camera.x-60||w.x>camera.x+canvas.width+60)return;
    if(w.scavenged)return;
    w.sparkT+=1;
    const t=frameNow*0.003;
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.beginPath();ctx.ellipse(w.x,w.y+2,26,4,0,0,Math.PI*2);ctx.fill();
    // Broken saucer dish (half buried)
    ctx.fillStyle='#2a2f3a';
    ctx.beginPath();ctx.ellipse(w.x,w.y-4,24,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#404550';
    ctx.beginPath();ctx.ellipse(w.x-2,w.y-6,20,4,0,0,Math.PI*2);ctx.fill();
    // Cracked dome
    ctx.fillStyle='#5a6070';
    ctx.beginPath();ctx.arc(w.x+4,w.y-6,8,Math.PI,0,false);ctx.fill();
    ctx.strokeStyle='#90a0b8';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(w.x+2,w.y-10);ctx.lineTo(w.x+7,w.y-6);ctx.stroke();
    // Glowing core — pulses
    const glow=0.5+Math.sin(t+w.sparkT*0.01)*0.3;
    ctx.fillStyle=`rgba(120,220,255,${glow})`;
    ctx.beginPath();ctx.arc(w.x-6,w.y-6,2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(200,240,255,${glow*0.8})`;
    ctx.beginPath();ctx.arc(w.x-6,w.y-6,1.3,0,Math.PI*2);ctx.fill();
    // Occasional spark
    if(Math.random()>0.97 && particles.length<200){
      particles.push({x:w.x+(Math.random()-0.5)*20,y:w.y-6,vx:(Math.random()-0.5)*1.4,vy:-Math.random()*1.2,life:18,color:'#8cf',size:1.2});
    }
    // Interact prompt
    if(playerMode==='onfoot' && Math.abs(alien.x-w.x)<50 && Math.abs(alien.y-w.y)<60){
      ctx.fillStyle='rgba(150,220,255,0.9)';ctx.font='10px monospace';ctx.textAlign='center';
      ctx.fillText('[E] SCAVENGE',w.x,w.y-24);
    }
  });
  // Hidden bunkers — only show a hatch if revealed (player close enough)
  hiddenBunkers.forEach(bk=>{
    if(bk.x<camera.x-80||bk.x>camera.x+canvas.width+80)return;
    // Reveal when player nearby
    if(playerMode==='onfoot' && Math.abs(alien.x-(bk.x+bk.w/2))<80) bk.revealed=true;
    if(!bk.revealed)return;
    // Hatch: metal rectangle embedded in ground
    const hx=bk.x, hy=GROUND_LEVEL-2, hw=bk.w, hh=bk.h;
    ctx.fillStyle=bk.looted?'#222':'#3a3a3a';
    ctx.fillRect(hx,hy-hh,hw,hh);
    ctx.strokeStyle='#666';ctx.lineWidth=1;
    ctx.strokeRect(hx,hy-hh,hw,hh);
    // Bolts
    ctx.fillStyle='#888';
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(hx+6+i*22,hy-hh+6,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(hx+6+i*22,hy-6,1.5,0,Math.PI*2);ctx.fill();}
    // Warning symbol
    ctx.fillStyle=bk.looted?'rgba(200,100,100,0.5)':'rgba(255,200,60,0.85)';
    ctx.font='bold 12px monospace';ctx.textAlign='center';
    ctx.fillText('☣',hx+hw/2,hy-hh/2+4);
    // Interact prompt
    if(playerMode==='onfoot' && !bk.looted && Math.abs(alien.x-(hx+hw/2))<40){
      ctx.fillStyle='rgba(255,220,100,0.9)';ctx.font='10px monospace';
      ctx.fillText('[E] BREACH BUNKER',hx+hw/2,hy-hh-10);
    }
  });
  // Ash piles (fade out mound)
  ashPiles.forEach(a=>{
    if(a.x<camera.x-20||a.x>camera.x+canvas.width+20)return;
    const af=a.life/a.maxLife;
    ctx.fillStyle=`rgba(40,38,36,${0.75*af})`;
    ctx.beginPath();ctx.ellipse(a.x,a.y,9,3,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(80,70,60,${0.55*af})`;
    ctx.beginPath();ctx.ellipse(a.x-1,a.y-1,6,2,0,0,Math.PI*2);ctx.fill();
    // Occasional smoldering wisp
    if(af>0.4&&Math.random()>0.985){
      particles.push({x:a.x+(Math.random()-0.5)*6,y:a.y-2,vx:(Math.random()-0.5)*0.2,vy:-0.5-Math.random()*0.4,life:30,color:'rgba(140,140,140,0.35)',size:2});
    }
  });
  // Fires
  fires.forEach(f=>{if(f.x<camera.x-30||f.x>camera.x+canvas.width+30)return;
    const fa=Math.min(1,f.life/60);const ft=frameNow*0.005+f.x*0.1;
    // Dynamic lighting glow — big soft orange wash over surroundings
    const dg=ctx.createRadialGradient(f.x,f.y-f.size*0.3,0,f.x,f.y-f.size*0.3,f.size*6);
    dg.addColorStop(0,`rgba(255,140,40,${fa*0.28})`);
    dg.addColorStop(0.4,`rgba(255,90,10,${fa*0.1})`);
    dg.addColorStop(1,'transparent');
    ctx.fillStyle=dg;ctx.beginPath();ctx.arc(f.x,f.y-f.size*0.3,f.size*6,0,Math.PI*2);ctx.fill();
    // Tight outer glow
    ctx.fillStyle=`rgba(255,60,0,${fa*0.15})`;ctx.beginPath();ctx.arc(f.x,f.y,f.size*2,0,Math.PI*2);ctx.fill();
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
    if(v.x+v.w<camera.x-60||v.x>camera.x+canvas.width+60)return;
    if(!v.alive&&v.exploding>0){
      ctx.globalAlpha=v.exploding/40;ctx.fillStyle='#f80';ctx.beginPath();ctx.arc(v.x+v.w/2,v.y,15+Math.random()*10,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;return;
    }
    if(!v.alive)return;
    if(v.hijacked) renderHijackedVehicle(v);
    else renderVehicle(v);
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
    ctx.fillStyle='#f00';ctx.beginPath();ctx.arc(t.x,t.y-3,4+Math.sin(frameNow*0.005)*2,0,Math.PI*2);ctx.fill();
    // Bullets
    t.bullets.forEach(b=>{ctx.fillStyle='#f44';ctx.beginPath();ctx.arc(b.x,b.y,3,0,Math.PI*2);ctx.fill();});
  });

  // --- MILITARY ---
  military.forEach(m=>{
    if(!m.alive&&m.type!=='bullet'&&m.type!=='boulder')return;
    if(m.x<camera.x-80||m.x>camera.x+canvas.width+80||m.y<camera.y-80||m.y>camera.y+canvas.height+80)return;
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
      ctx.fillStyle=Math.sin(frameNow*0.02)>0?'#f00':'#00f';
      ctx.beginPath();ctx.arc(m.x-5,m.y-m.h-8,3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=Math.sin(frameNow*0.02)>0?'#00f':'#f00';
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
        ctx.strokeStyle=`rgba(200,100,255,${0.3+Math.sin(frameNow*0.008)*0.2})`;ctx.lineWidth=2;
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

  // --- ALIEN WEAPONS: stun waves, plasma bolts, gravity wells, parasites ---
  stunWaves.forEach(w=>{
    if(w.x+w.r<camera.x||w.x-w.r>camera.x+canvas.width)return;
    const a=Math.max(0,w.life/w.maxLife);
    const col=w.effect==='stun'?'140,220,255':'255,150,255';
    ctx.strokeStyle=`rgba(${col},${a*0.8})`; ctx.lineWidth=3;
    if(w.kind==='cone'){
      const a0=w.dir>0?-0.6:Math.PI-0.6, a1=w.dir>0?0.6:Math.PI+0.6;
      ctx.beginPath();ctx.arc(w.x,w.y,w.r,a0,a1);ctx.stroke();
      ctx.strokeStyle=`rgba(${col},${a*0.4})`;
      ctx.beginPath();ctx.arc(w.x,w.y,w.r*0.7,a0,a1);ctx.stroke();
    } else {
      ctx.beginPath();ctx.arc(w.x,w.y,w.r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(${col},${a*0.4})`;
      ctx.beginPath();ctx.arc(w.x,w.y,w.r*0.75,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(w.x,w.y,w.r*0.5,0,Math.PI*2);ctx.stroke();
    }
  });

  // Chainsaw slashes — yellow saw arc with teeth
  chainsawSlashes.forEach(s=>{
    if(s.x<camera.x-60||s.x>camera.x+canvas.width+60)return;
    const a=s.life/s.maxLife;
    const range=42;
    const cx=s.x+s.dir*range*0.5, cy=s.y;
    // Slash arc
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate((1-a)*s.dir*1.2);
    ctx.strokeStyle=`rgba(255,220,90,${a*0.9})`; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,0,range*0.8, -0.9, 0.9); ctx.stroke();
    ctx.strokeStyle=`rgba(255,255,255,${a*0.6})`; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,0,range*0.7, -0.9, 0.9); ctx.stroke();
    // Saw teeth dots
    for(let ti=-3;ti<=3;ti++){
      const ta=ti*0.25;
      ctx.fillStyle=`rgba(255,200,40,${a})`;
      ctx.beginPath(); ctx.arc(Math.cos(ta)*range*0.8, Math.sin(ta)*range*0.8, 1.6,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
  // Chainsaw held in hand while revving
  if(chainsawRev>0 && playerMode==='onfoot'){
    ctx.save();
    const hx=alien.x+alien.facing*12, hy=alien.y-12;
    ctx.translate(hx,hy);
    ctx.scale(alien.facing,1);
    // Engine body
    ctx.fillStyle='#c33'; ctx.fillRect(-4,-4,10,8);
    ctx.fillStyle='#333'; ctx.fillRect(-4,2,10,3);
    // Bar
    ctx.fillStyle='#888'; ctx.fillRect(6,-2,20,4);
    // Spinning teeth
    const spin=(frameNow*0.8)%8;
    ctx.fillStyle='#fd4';
    for(let ti=0;ti<5;ti++){
      const tx=8+((ti*4+spin)%18);
      ctx.beginPath(); ctx.moveTo(tx,-2); ctx.lineTo(tx+2,-4); ctx.lineTo(tx+3,-2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx,2); ctx.lineTo(tx+2,4); ctx.lineTo(tx+3,2); ctx.fill();
    }
    ctx.restore();
  }

  plasmaBolts.forEach(b=>{
    if(b.x<camera.x-40||b.x>camera.x+canvas.width+40)return;
    ctx.fillStyle='rgba(100,255,150,0.25)';ctx.beginPath();ctx.arc(b.x,b.y,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#6f8';ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#dfd';ctx.beginPath();ctx.arc(b.x-b.vx*0.2,b.y-b.vy*0.2,2,0,Math.PI*2);ctx.fill();
  });

  gravityWells.forEach(g=>{
    if(g.x<camera.x-200||g.x>camera.x+canvas.width+200)return;
    if(g.phase==='arming'){
      ctx.fillStyle='#a0f';ctx.beginPath();ctx.arc(g.x,g.y,6,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(160,0,255,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(g.x,g.y,12+Math.sin(frameT*10)*3,0,Math.PI*2);ctx.stroke();
    } else if(g.phase==='pulling'){
      const pulse=0.6+Math.sin(frameT*15)*0.4;
      ctx.strokeStyle=`rgba(160,0,255,${pulse*0.5})`;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(200,100,255,${pulse*0.3})`;
      ctx.beginPath();ctx.arc(g.x,g.y,g.r*0.6,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(g.x,g.y,10+Math.sin(frameT*20)*2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a0f';ctx.beginPath();ctx.arc(g.x,g.y,6,0,Math.PI*2);ctx.fill();
    } else if(g.phase==='detonate'){
      const t=g.timer/20;
      ctx.fillStyle=`rgba(220,150,255,${t*0.8})`;ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,255,255,${t})`;ctx.beginPath();ctx.arc(g.x,g.y,g.r*0.4,0,Math.PI*2);ctx.fill();
    }
  });

  // Acid puddles
  acidPuddles.forEach(ap=>{
    if(ap.x<camera.x-ap.r||ap.x>camera.x+canvas.width+ap.r)return;
    const a=Math.min(1,ap.life/80);
    ctx.fillStyle=`rgba(140,220,0,${0.35*a})`;ctx.beginPath();ctx.ellipse(ap.x,ap.y,ap.r,ap.r*0.35,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(200,255,40,${0.55*a})`;ctx.beginPath();ctx.ellipse(ap.x,ap.y-1,ap.r*0.7,ap.r*0.22,0,0,Math.PI*2);ctx.fill();
    // Bubbles
    for(let bi=0;bi<3;bi++){
      const bx=ap.x+Math.sin(frameT*3+bi*2+ap.x*0.1)*ap.r*0.6;
      ctx.fillStyle=`rgba(220,255,80,${a})`;ctx.beginPath();ctx.arc(bx,ap.y-1-Math.abs(Math.sin(frameT*4+bi))*3,1.5,0,Math.PI*2);ctx.fill();
    }
  });
  // Rockets
  rockets.forEach(r=>{
    if(r.x<camera.x-30||r.x>camera.x+canvas.width+30)return;
    ctx.save();ctx.translate(r.x,r.y);ctx.rotate(Math.atan2(r.vy,r.vx));
    ctx.fillStyle='#888';ctx.fillRect(-8,-2,14,4);
    ctx.fillStyle='#f44';ctx.beginPath();ctx.moveTo(6,-2);ctx.lineTo(10,0);ctx.lineTo(6,2);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fa0';ctx.beginPath();ctx.arc(-10,0,3+Math.random()*2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(-12,0,2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  });

  parasites.forEach(pr=>{
    if(pr.x<camera.x-20||pr.x>camera.x+canvas.width+20)return;
    ctx.fillStyle='#fa0';ctx.beginPath();ctx.ellipse(pr.x,pr.y,3.5,2.2,Math.atan2(pr.vy,pr.vx),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f40';ctx.beginPath();ctx.arc(pr.x+Math.sign(pr.vx||1)*2,pr.y-0.5,1,0,Math.PI*2);ctx.fill();
    // Little legs wiggle
    ctx.strokeStyle='#a40';ctx.lineWidth=0.8;
    const ph=frameT*18+pr.x*0.1;
    ctx.beginPath();ctx.moveTo(pr.x-1,pr.y+1);ctx.lineTo(pr.x-2,pr.y+3+Math.sin(ph)*0.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(pr.x+1,pr.y+1);ctx.lineTo(pr.x+2,pr.y+3+Math.sin(ph+1)*0.6);ctx.stroke();
  });

  // --- ALIEN ON FOOT (uses current race/skin) ---
  if(playerMode==='onfoot'){
    const _askin=getAlienSkin();
    const ax=alien.x,ay=alien.y,f=alien.facing;

    // If driving, the alien is inside the vehicle — not rendered separately.
    if(alien.drivingVehicle){
      // intentionally no body render while driving
    } else {

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

    // --- Mind-control tether: a psychic tentacle from the alien to the puppet's head ---
    if(mindControl && mindControl.target){
      const tgt=mindControl.target;
      const sx=ax, sy=ay-28;
      // World coordinates (canvas is already translated for camera at this point).
      // Handle horizontal world wrapping so a target just across the seam still reads as "close".
      let txp=tgt.headX, typ=tgt.headY;
      if(typeof worldWidth==='number'){
        const rawDx=txp-sx;
        if(rawDx> worldWidth/2) txp-=worldWidth;
        else if(rawDx<-worldWidth/2) txp+=worldWidth;
      }
      const now=frameNow*0.012;
      const dx=txp-sx, dy=typ-sy;
      const len=Math.max(1,Math.hypot(dx,dy));
      const segs=Math.max(10, Math.min(28, (len/12)|0));
      // Perpendicular unit vector for wavy offset
      const px=-dy/len, py=dx/len;
      // Build tentacle spine points with organic sine wave
      const pts=[];
      for(let i=0;i<=segs;i++){
        const k=i/segs;
        // Wave amplitude peaks mid-tentacle, tapers at both ends
        const amp=Math.sin(k*Math.PI)*8;
        const w=(Math.sin(now*1.8+k*5)+Math.sin(now*1.1+k*3.3)*0.6)*amp;
        pts.push({x:sx+dx*k+px*w, y:sy+dy*k+py*w, k});
      }
      ctx.save();
      // Tapered tentacle body — draw several overlapping strokes, thickest first
      const layers=[
        {w:8, c:'rgba(120,60,180,0.35)'},   // outer glow
        {w:5, c:'rgba(170,90,220,0.85)'},   // main body
        {w:3, c:'rgba(210,140,240,0.95)'},  // mid highlight
        {w:1.2, c:'rgba(250,220,255,0.9)'}  // crisp core
      ];
      for(const L of layers){
        ctx.strokeStyle=L.c; ctx.lineWidth=L.w; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      // Suckers along the tentacle — small dark ovals, spaced, fade at ends
      for(let i=2;i<pts.length-1;i+=2){
        const p=pts[i], k=p.k;
        const taper=Math.sin(k*Math.PI);
        const r=1.4+taper*1.1;
        ctx.fillStyle='rgba(70,20,100,0.8)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,200,255,0.5)';
        ctx.beginPath(); ctx.arc(p.x-0.4, p.y-0.4, r*0.4, 0, Math.PI*2); ctx.fill();
      }
      // Pulsing grip at the puppet's head (tip)
      const pulse=0.5+Math.sin(now*3)*0.3;
      const eg=ctx.createRadialGradient(txp,typ,0,txp,typ,11);
      eg.addColorStop(0,`rgba(220,160,255,${pulse})`);
      eg.addColorStop(1,'transparent');
      ctx.fillStyle=eg;ctx.beginPath();ctx.arc(txp,typ,11,0,Math.PI*2);ctx.fill();
      // Crown ring orbiting the puppet's head — clear "this one is controlled" marker
      ctx.strokeStyle=`rgba(220,160,255,${0.55+Math.sin(now*4)*0.25})`;ctx.lineWidth=1.3;
      ctx.beginPath();ctx.ellipse(txp,typ-2,10,3.8,Math.sin(now*2)*0.4,0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }

    // Dive suit overlay (drawn on top of body when the suit is on)
    if(alien.diveSuit && alien.underwater){
      drawDiveSuit(ax, ay, f);
    }

    // --- Fuel bar ---
    const barY=ay-33-18;
    ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(ax-10,barY,20,2.5);
    ctx.fillStyle=alien.jetpackFuel>30?'#0af':'#f44';ctx.fillRect(ax-10,barY,20*(alien.jetpackFuel/100),2.5);

    // --- GRAPPLING HOOK rope + hook ---
    if(alien.grapple){
      const g=alien.grapple;
      const handX=ax+f*6, handY=ay-14;
      const tipX = g.phase==='attached' ? g.anchorX : g.x;
      const tipY = g.phase==='attached' ? g.anchorY : g.y;
      // Rope
      ctx.strokeStyle='rgba(220,200,140,0.9)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(tipX,tipY); ctx.stroke();
      ctx.strokeStyle='rgba(80,60,30,0.6)'; ctx.lineWidth=0.6;
      ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(tipX,tipY); ctx.stroke();
      // Hook claw at tip (3 prongs, oriented along rope)
      const rdx=tipX-handX, rdy=tipY-handY, ang=Math.atan2(rdy,rdx);
      ctx.save(); ctx.translate(tipX,tipY); ctx.rotate(ang);
      ctx.strokeStyle='#bbb'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(3,-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(3,3); ctx.stroke();
      ctx.fillStyle='#ddd'; ctx.beginPath(); ctx.arc(0,0,1.8,0,Math.PI*2); ctx.fill();
      // Pulse when anchored
      if(g.phase==='attached'){
        const pr=3+Math.sin(frameNow*0.2)*1.5;
        ctx.strokeStyle='rgba(255,220,120,0.6)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,pr,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }
    } // end non-driving render block
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
    // Ship position in screen space (account for world zoom applied during planet draw)
    const _zw=worldZoom;
    const ssx=(ship.x-camera.x-canvas.width/2)*_zw+canvas.width/2;
    const ssy=(ship.y-camera.y-canvas.height/2)*_zw+canvas.height/2;
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
      const pulse=0.5+Math.sin(frameNow*0.005)*0.3;
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
      const t = frameT;
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
      const flR = inCave ? 220 + Math.sin(frameNow*0.003)*10 : 180 + depthRatio * 120;
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
      ctx.strokeStyle = `rgba(180,220,255,${0.15 + Math.sin(frameNow*0.004)*0.05})`;
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
      ctx.fillStyle = `rgba(100,200,255,${0.3 + Math.sin(frameNow * 0.005) * 0.15})`;
      ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText('[L] FLASHLIGHT', 15, canvas.height - 55);
    } else if(flashlightOn) {
      ctx.fillStyle = 'rgba(200,230,255,0.5)';
      ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText('[L] LIGHT ON', 15, canvas.height - 55);
    }
    // Oxygen warning at extreme depth
    if(depthRatio > 0.8) {
      const warn = 0.4 + Math.sin(frameNow * 0.008) * 0.3;
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

  // Wanted-level stars HUD removed — military only goes hostile when provoked
  if(alarmPulse>0){
    ctx.fillStyle=`rgba(255,0,0,${alarmPulse/60*0.08*Math.abs(Math.sin(frameNow*0.01))})`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  // --- POPULATION COUNTER ---
  let popAlive=0;
  for(let i=0;i<humans.length;i++){const h=humans[i];if(!h.collected&&!h.hidden&&!(h.ragdoll&&!h.beingBeamed))popAlive++;}
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
    ctx.fillStyle=shipCloak.active?`rgba(0,200,255,${0.5+Math.sin(frameNow*0.01)*0.3})`:'#08a';
    ctx.fillRect(cx,cy,ep,6);
    ctx.fillStyle='#8cf';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(shipCloak.active?'CLOAKED':'CLOAK [V]',canvas.width/2,cy-3);
  }

  // --- ALIEN ACTION CHIPS (on foot) — above the weapon row ---
  if(playerMode==='onfoot' && !alien.drivingVehicle && gameMode==='planet' && !mothershipMode && !pyramidInteriorMode){
    // Context-aware: dim chips when their action isn't currently relevant.
    const nearVeh = (typeof vehicles!=='undefined') && vehicles.some(v=>!v.destroyed && Math.abs(v.x-alien.x)<90 && Math.abs((v.y||GROUND_LEVEL)-alien.y)<80);
    const nearWreck = (typeof ufoWrecks!=='undefined') && ufoWrecks.some(w=>!w.looted && Math.abs(w.x-alien.x)<70 && Math.abs((w.y||GROUND_LEVEL)-alien.y)<80);
    const nearBunker = (typeof hiddenBunkers!=='undefined') && hiddenBunkers.some(b=>!b.looted && b.revealed && Math.abs((b.x+(b.w||40)/2)-alien.x)<70);
    const mc = !!(typeof mindControl!=='undefined' && mindControl);
    const aChips = [
      {label:'SHIP',  key:'ENT', active: false,                    col:[120,200,255]},
      {label:'HIJK',  key:'B',   active: nearVeh,                   col:[255,200,80]},
      {label:'INTR',  key:'E',   active: nearWreck||nearBunker,     col:[140,255,160]},
      {label:'MIND',  key:'T',   active: mc,                        col:[200,120,255]},
      {label:'LGHT',  key:'L',   active: !!flashlightOn,            col:[255,240,140]},
      {label:'MUTE',  key:'M',   active: !!window._muted,           col:[200,200,200]},
    ];
    const cw=48, cg=4;
    const ctotal = aChips.length*cw + (aChips.length-1)*cg;
    const chx=(canvas.width-ctotal)/2, chy=canvas.height-80;
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.fillRect(chx-6, chy-6, ctotal+12, 34);
    for(let i=0;i<aChips.length;i++){
      const c = aChips[i];
      const sx = chx + i*(cw+cg);
      const [r,g,b] = c.col;
      const pulse = c.active ? (0.35 + Math.sin(frameNow*0.012)*0.12) : 0.10;
      ctx.fillStyle = `rgba(${r},${g},${b},${pulse})`;
      ctx.fillRect(sx, chy, cw, 22);
      ctx.strokeStyle = c.active ? `rgba(${r},${g},${b},0.95)` : `rgba(${r},${g},${b},0.45)`;
      ctx.lineWidth = c.active ? 2 : 1;
      ctx.strokeRect(sx+0.5, chy+0.5, cw-1, 21);
      ctx.fillStyle = c.active ? '#fff' : `rgb(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)})`;
      ctx.font='bold 9px monospace'; ctx.textAlign='center';
      ctx.fillText(c.label, sx+cw/2, chy+10);
      ctx.font='8px monospace';
      ctx.fillStyle = c.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.50)';
      ctx.fillText('['+c.key+']', sx+cw/2, chy+19);
    }
  }

  // --- ALIEN WEAPON HUD (on foot) — hidden while driving; vehicle controls shown instead ---
  if(playerMode==='onfoot' && !alien.drivingVehicle){
    const _lo=getRaceWeapons();
    const slots=_lo.length;
    const sw=40, gap=4, total=slots*sw+(slots-1)*gap;
    const hx=(canvas.width-total)/2, hy=canvas.height-44;
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(hx-6,hy-6,total+12,40);
    for(let i=0;i<slots;i++){
      const sx=hx+i*(sw+gap), sy=hy;
      const cd=alien.weaponCD[i]||0, maxCD=_lo[i].cd;
      const sel=i===alien.weapon;
      ctx.fillStyle=sel?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.05)';
      ctx.fillRect(sx,sy,sw,28);
      ctx.strokeStyle=sel?_lo[i].color:'rgba(255,255,255,0.25)';
      ctx.lineWidth=sel?2:1;ctx.strokeRect(sx+0.5,sy+0.5,sw-1,27);
      // Cooldown fill bar bottom
      const cdF=cd/maxCD;
      if(cdF>0){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(sx,sy+28-cdF*28,sw,cdF*28);}
      // Label
      ctx.fillStyle=sel?'#fff':'#ccc';ctx.font='bold 9px monospace';ctx.textAlign='center';
      ctx.fillText((i+1)+'',sx+7,sy+11);
      ctx.font='8px monospace';
      ctx.fillText(_lo[i].label,sx+sw/2+3,sy+22);
    }
  }
  // --- VEHICLE CONTROLS HUD (while driving) ---
  if(playerMode==='onfoot' && alien.drivingVehicle){
    const v = alien.drivingVehicle;
    const total=170, hx=(canvas.width-total)/2, hy=canvas.height-40;
    ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(hx-6,hy-6,total+12,34);
    // Cloak indicator
    const cloakBg = v.cloaked ? `rgba(120,220,255,${0.25+Math.sin(frameNow*0.01)*0.1})` : 'rgba(120,180,255,0.12)';
    ctx.fillStyle=cloakBg; ctx.fillRect(hx,hy,78,22);
    ctx.strokeStyle=v.cloaked?'rgba(160,240,255,0.9)':'rgba(120,180,255,0.5)';
    ctx.lineWidth=v.cloaked?2:1; ctx.strokeRect(hx+0.5,hy+0.5,77,21);
    ctx.fillStyle=v.cloaked?'#cff':'#bdf'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
    ctx.fillText(v.cloaked?'CLOAKED [V]':'CLOAK [V]', hx+39, hy+14);
    // Boost indicator
    const boosting = !!keys['shift'];
    const boostBg = boosting ? 'rgba(255,200,80,0.3)' : 'rgba(255,180,80,0.12)';
    ctx.fillStyle=boostBg; ctx.fillRect(hx+84,hy,78,22);
    ctx.strokeStyle=boosting?'rgba(255,220,120,0.9)':'rgba(255,180,80,0.5)';
    ctx.lineWidth=boosting?2:1; ctx.strokeRect(hx+84.5,hy+0.5,77,21);
    ctx.fillStyle=boosting?'#ffd':'#fdb'; ctx.font='bold 10px monospace';
    ctx.fillText(boosting?'BOOSTING':'BOOST [SHIFT]', hx+123, hy+14);
  }

  // --- SHIP CONTROLS HUD (in ship, on a planet) ---
  if(playerMode==='ship' && gameMode==='planet' && !mothershipMode){
    const chips = [
      {label:'BEAM',   key:'SPC', active: !!ship.beamActive,                       col:[0,255,100]},
      {label:'MSL',    key:'Q',   active: missileCooldown>0,                       col:[255,140,40]},
      {label:'FLM',    key:'F',   active: !!ship.flameOn,                          col:[255,80,40]},
      {label:'CLOAK',  key:'V',   active: !!shipCloak.active,                      col:[120,200,255]},
      {label:'LASSO',  key:'C',   active: !!(ship.lasso && ship.lasso.active),     col:[255,220,80]},
      {label:'NUKE',   key:'N',   active: false,                                   col:[255,80,200]},
      {label:'REPLS',  key:'E',   active: !!keys['e'],                             col:[255,80,80]},
      {label:'DEPLOY', key:'B',   active: false,                                   col:[180,255,180]},
    ];
    const chipW=56, gap=4;
    const total = chips.length*chipW + (chips.length-1)*gap;
    const hx=(canvas.width-total)/2, hy=canvas.height-40;
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(hx-6, hy-6, total+12, 34);
    for(let i=0;i<chips.length;i++){
      const c = chips[i];
      const sx = hx + i*(chipW+gap);
      const [r,g,b] = c.col;
      const pulse = c.active ? (0.35 + Math.sin(frameNow*0.012)*0.12) : 0.12;
      ctx.fillStyle = `rgba(${r},${g},${b},${pulse})`;
      ctx.fillRect(sx, hy, chipW, 22);
      ctx.strokeStyle = c.active ? `rgba(${r},${g},${b},0.95)` : `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = c.active ? 2 : 1;
      ctx.strokeRect(sx+0.5, hy+0.5, chipW-1, 21);
      ctx.fillStyle = c.active ? '#fff' : `rgb(${Math.min(255,r+60)},${Math.min(255,g+60)},${Math.min(255,b+60)})`;
      ctx.font='bold 9px monospace'; ctx.textAlign='center';
      ctx.fillText(c.label, sx+chipW/2, hy+10);
      ctx.font='8px monospace';
      ctx.fillStyle = c.active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.fillText('['+c.key+']', sx+chipW/2, hy+19);
    }
  }

  // --- ALIEN HEALTH BAR (on foot) ---
  if(playerMode==='onfoot'&&alien.health<100){
    const hx=canvas.width/2-50,hy=50;
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(hx-1,hy-1,102,8);
    ctx.fillStyle=alien.health>80?'#0f0':alien.health>30?'#fa0':'#f44';
    ctx.fillRect(hx,hy,alien.health,6);
    ctx.fillStyle='#888';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(tr('hud.health'),canvas.width/2,hy-3);
  }

  // --- OXYGEN BAR (underwater, on foot) ---
  if(playerMode==='onfoot' && alien.underwater){
    const ox=canvas.width/2-50, oy=70;
    const o=Math.max(0,Math.min(100,alien.oxygen||0));
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(ox-1,oy-1,102,8);
    const col = alien.diveSuit ? '#4cf' : (o>30?'#8cf':'#f66');
    ctx.fillStyle=col;ctx.fillRect(ox,oy,o,6);
    ctx.fillStyle='#8af';ctx.font='8px monospace';ctx.textAlign='center';
    ctx.fillText(alien.diveSuit?'OXYGEN (SUIT)':'OXYGEN',canvas.width/2,oy-3);
  }

  // --- MISSION HUD --- (bottom-center; minimal, since missions aren't the focus yet)
  if(currentMission && !missionComplete){
    const mx = canvas.width/2;
    const my = canvas.height - 55;
    const label = currentMission.desc;
    const prog = (currentMission.target>0) ? ` [${currentMission.progress}/${currentMission.target}]` : '';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const txt = label + prog;
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(mx - tw/2 - 10, my - 10, tw + 20, 16);
    ctx.fillStyle = 'rgba(255,200,80,0.85)';
    ctx.fillText(txt, mx, my + 2);
  }

  // --- UPGRADE PROMPT --- (removed per user request)
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
    const pulse=0.3+Math.sin(frameNow*0.005)*0.15;
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
  } else if(type==='scout'){
    // Sleek dart — narrow pointed fuselage with slim wings
    ctx.fillStyle=pc;
    ctx.beginPath(); ctx.moveTo(36,0); ctx.lineTo(-20,-4); ctx.lineTo(-24,0); ctx.lineTo(-20,4); ctx.closePath(); ctx.fill();
    // Wings
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(-4,-3); ctx.lineTo(-22,-14); ctx.lineTo(-26,-3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4,3); ctx.lineTo(-22,14); ctx.lineTo(-26,3); ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.fillStyle='#224'; ctx.beginPath(); ctx.ellipse(16,0,5,2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(180,230,255,${0.45+Math.sin(ship.lightPhase)*0.2})`; ctx.beginPath(); ctx.ellipse(16,-0.5,3,1,0,0,Math.PI*2); ctx.fill();
    // Engine glow
    ctx.fillStyle=`rgba(100,220,255,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-24,0,2.5,0,Math.PI*2); ctx.fill();
  } else if(type==='bomber'){
    // Heavy bomber — wide fuselage + two engine pods below
    ctx.fillStyle=pc;
    ctx.beginPath(); ctx.ellipse(0,-2,30,8,0,0,Math.PI*2); ctx.fill();
    // Cockpit bubble
    ctx.fillStyle='#224'; ctx.beginPath(); ctx.ellipse(20,-3,4,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(120,200,255,${0.4+Math.sin(ship.lightPhase)*0.2})`; ctx.beginPath(); ctx.ellipse(20,-3,2.5,2,0,0,Math.PI*2); ctx.fill();
    // Bomb-bay stripes
    ctx.fillStyle=pa;
    for(let i=-2;i<=2;i++){ ctx.fillRect(-14+i*7, -4, 3, 8); }
    // Engine pods
    ctx.fillStyle=pa;
    [-10,10].forEach(y=>{ ctx.beginPath(); ctx.ellipse(-6, y, 18, 5, 0, 0, Math.PI*2); ctx.fill(); });
    // Engine glow
    ctx.fillStyle=`rgba(255,160,60,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    [-10,10].forEach(y=>{ ctx.beginPath(); ctx.arc(-24,y,2.5,0,Math.PI*2); ctx.fill(); });
    // Bomb racks (little circles underneath)
    ctx.fillStyle='#555';
    for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.arc(i*7, 7, 1.8, 0, Math.PI*2); ctx.fill(); }
  } else if(type==='organic'){
    // Bio-ship — blob body with pulsing veins + tendrils
    const pulse=0.5+Math.sin(ship.lightPhase*2)*0.5;
    // Outer membrane
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(30,0);
    for(let a=0;a<Math.PI*2;a+=Math.PI/12){
      const r=18+Math.sin(a*3+ship.lightPhase)*4;
      ctx.lineTo(Math.cos(a)*r*1.4, Math.sin(a)*r*0.75);
    }
    ctx.closePath(); ctx.fill();
    // Inner glowing core
    const bg=ctx.createRadialGradient(0,0,2,0,0,18);
    bg.addColorStop(0, pc);
    bg.addColorStop(0.7, pa);
    bg.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.ellipse(0,0,22,10,0,0,Math.PI*2); ctx.fill();
    // Glowing veins
    ctx.strokeStyle=`rgba(255,200,255,${0.35+pulse*0.4})`;
    ctx.lineWidth=1.2;
    for(let i=0;i<5;i++){
      const ang=i*Math.PI*2/5 + ship.lightPhase*0.2;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.quadraticCurveTo(Math.cos(ang)*10, Math.sin(ang)*4, Math.cos(ang)*22, Math.sin(ang)*8);
      ctx.stroke();
    }
    // Tendril trails
    ctx.strokeStyle=pa; ctx.lineWidth=2;
    [-6,0,6].forEach(y=>{
      ctx.beginPath();
      ctx.moveTo(-22,y);
      ctx.quadraticCurveTo(-30,y+Math.sin(ship.lightPhase*2+y)*3, -36, y+Math.sin(ship.lightPhase*3+y)*4);
      ctx.stroke();
    });
    // Eye-like sensor
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(18,0,2.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(19,0,1.4,0,Math.PI*2); ctx.fill();
  } else if(type==='crystal'){
    // Crystalline faceted ship — angular gem shapes
    const pulse=0.5+Math.sin(ship.lightPhase*2)*0.3;
    // Main body — diamond with side crystals
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(32,0); ctx.lineTo(12,-12); ctx.lineTo(-24,-8); ctx.lineTo(-28,0); ctx.lineTo(-24,8); ctx.lineTo(12,12); ctx.closePath();
    ctx.fill();
    // Highlight facets
    ctx.fillStyle=pc;
    ctx.beginPath(); ctx.moveTo(32,0); ctx.lineTo(12,-12); ctx.lineTo(4,0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-24,-8); ctx.lineTo(-28,0); ctx.lineTo(-10,-4); ctx.closePath(); ctx.fill();
    // Side crystal spikes
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(4,-20); ctx.lineTo(8,-10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(4,20); ctx.lineTo(8,10); ctx.closePath(); ctx.fill();
    // Shine highlight line
    ctx.strokeStyle=`rgba(255,255,255,${0.4+pulse*0.4})`; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(10,-10); ctx.lineTo(28,0); ctx.stroke();
    // Core glow
    ctx.fillStyle=`rgba(200,240,255,${0.4+pulse*0.4})`;
    ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
    // Engine glow
    ctx.fillStyle=`rgba(200,240,255,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-28,0,2.5,0,Math.PI*2); ctx.fill();
  } else if(type==='arrowhead'){
    // Sharp triangular raider — angular and menacing
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(38,0); ctx.lineTo(-22,-16); ctx.lineTo(-14,-4); ctx.lineTo(-14,4); ctx.lineTo(-22,16); ctx.closePath();
    ctx.fill();
    // Dark inlay
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(30,0); ctx.lineTo(-14,-8); ctx.lineTo(-14,8); ctx.closePath();
    ctx.fill();
    // Cockpit slit
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.moveTo(18,-1); ctx.lineTo(28,0); ctx.lineTo(18,1); ctx.closePath(); ctx.fill();
    ctx.fillStyle=`rgba(255,80,80,${0.4+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.ellipse(22,0,3,0.8,0,0,Math.PI*2); ctx.fill();
    // Engine glow (twin)
    ctx.fillStyle=`rgba(180,100,255,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-22,-10,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-22,10,2,0,Math.PI*2); ctx.fill();
    // Wing-tip cannons
    ctx.fillStyle=pa;
    ctx.fillRect(-20,-15,3,2); ctx.fillRect(-20,13,3,2);
  } else if(type==='cargo'){
    // Blocky industrial cargo hauler — rectangular with containers on top
    // Main hull
    ctx.fillStyle=pc;
    ctx.fillRect(-26,-8, 50, 14);
    ctx.fillStyle=pa;
    ctx.fillRect(-26,2,50,4);
    // Bridge / cockpit (front)
    ctx.fillStyle=pa; ctx.fillRect(18,-12,8,8);
    ctx.fillStyle='#224'; ctx.fillRect(19,-11,6,3);
    ctx.fillStyle=`rgba(200,230,255,${0.4+Math.sin(ship.lightPhase)*0.2})`; ctx.fillRect(19,-10,6,1);
    // Cargo containers
    const containerColors=['#c63','#6a9','#aa3','#95c'];
    for(let i=-2;i<=1;i++){
      ctx.fillStyle=containerColors[(i+4)%containerColors.length];
      ctx.fillRect(-20+i*10, -14, 9, 6);
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=0.6;
      ctx.strokeRect(-20+i*10, -14, 9, 6);
    }
    // Panel lines
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6;
    for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*10,-8); ctx.lineTo(i*10,6); ctx.stroke(); }
    // Twin engine nozzles
    ctx.fillStyle=pa;
    ctx.fillRect(-30,-6,4,4); ctx.fillRect(-30,2,4,4);
    ctx.fillStyle=`rgba(255,170,80,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-30,-4,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-30,4,2,0,Math.PI*2); ctx.fill();
  } else if(type==='viper'){
    // Colonial viper — sleek forward-swept fighter with twin ring engines
    // Fuselage
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(32,0); ctx.lineTo(24,-3); ctx.lineTo(-22,-4); ctx.lineTo(-26,0); ctx.lineTo(-22,4); ctx.lineTo(24,3); ctx.closePath();
    ctx.fill();
    // Forward canards
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(14,-3); ctx.lineTo(20,-9); ctx.lineTo(8,-3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14,3); ctx.lineTo(20,9); ctx.lineTo(8,3); ctx.closePath(); ctx.fill();
    // Main swept wings
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(-4,-3); ctx.lineTo(-20,-14); ctx.lineTo(-10,-14); ctx.lineTo(6,-3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4,3); ctx.lineTo(-20,14); ctx.lineTo(-10,14); ctx.lineTo(6,3); ctx.closePath(); ctx.fill();
    // Cockpit
    ctx.fillStyle='#224'; ctx.beginPath(); ctx.ellipse(14,-1,5,2.2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(180,220,255,${0.5+Math.sin(ship.lightPhase)*0.2})`;
    ctx.beginPath(); ctx.ellipse(14,-1.3,3,1,0,0,Math.PI*2); ctx.fill();
    // Ring engines (twin)
    ctx.strokeStyle=pa; ctx.lineWidth=2;
    [-9,9].forEach(y=>{ ctx.beginPath(); ctx.arc(-22,y,4,0,Math.PI*2); ctx.stroke(); });
    ctx.fillStyle=`rgba(255,120,50,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    [-9,9].forEach(y=>{ ctx.beginPath(); ctx.arc(-22,y,2.5,0,Math.PI*2); ctx.fill(); });
  } else if(type==='sphere'){
    // Orb ship — spherical translucent shell with pulsing core + orbital ring
    const pulse=0.5+Math.sin(ship.lightPhase*2)*0.5;
    // Orbital ring (tilted ellipse behind)
    ctx.strokeStyle=pa; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,28,9,0,0,Math.PI*2); ctx.stroke();
    // Ring highlight
    ctx.strokeStyle=`rgba(255,255,255,${0.35+pulse*0.3})`; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.ellipse(0,-0.5,27,8.5,0,Math.PI,Math.PI*2); ctx.stroke();
    // Outer shell (translucent)
    const sg=ctx.createRadialGradient(-4,-4,2,0,0,16);
    sg.addColorStop(0, pc);
    sg.addColorStop(0.6, pa);
    sg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle=sg;
    ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
    // Inner core (pulsing)
    ctx.fillStyle=`rgba(255,240,200,${0.3+pulse*0.5})`;
    ctx.beginPath(); ctx.arc(0,0,7+pulse*2,0,Math.PI*2); ctx.fill();
    // Orbiting satellites
    for(let i=0;i<3;i++){
      const a=ship.lightPhase*1.5 + i*Math.PI*2/3;
      const ox=Math.cos(a)*26, oy=Math.sin(a)*8;
      ctx.fillStyle=pa;
      ctx.beginPath(); ctx.arc(ox,oy,2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=`rgba(255,255,200,${0.5+pulse*0.4})`;
      ctx.beginPath(); ctx.arc(ox,oy,0.8,0,Math.PI*2); ctx.fill();
    }
    // Equator belt
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.ellipse(0,0,15,4,0,0,Math.PI*2); ctx.stroke();
  } else if(type==='needle'){
    // Needle ship — ultra-long pencil fuselage with bulb tip
    // Body
    const ng=ctx.createLinearGradient(0,-3,0,3);
    ng.addColorStop(0,pc); ng.addColorStop(0.5,pa); ng.addColorStop(1,pc);
    ctx.fillStyle=ng;
    ctx.beginPath();
    ctx.moveTo(42,0); ctx.lineTo(28,-2); ctx.lineTo(-28,-3); ctx.lineTo(-34,0); ctx.lineTo(-28,3); ctx.lineTo(28,2); ctx.closePath();
    ctx.fill();
    // Bulb tip (front)
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(40,0,5,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,220,180,${0.4+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.ellipse(40,0,3,2,0,0,Math.PI*2); ctx.fill();
    // Three slim fins near rear
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(-14,-3); ctx.lineTo(-24,-10); ctx.lineTo(-22,-3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14,3); ctx.lineTo(-24,10); ctx.lineTo(-22,3); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.fillRect(-18,-0.5,8,1);
    // Windows along spine
    ctx.fillStyle=`rgba(200,230,255,${0.35+Math.sin(ship.lightPhase)*0.15})`;
    for(let i=-4;i<=4;i++){ ctx.fillRect(i*6, -1, 3, 0.8); }
    // Single rear engine
    ctx.fillStyle=`rgba(100,220,255,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-34,0,3,0,Math.PI*2); ctx.fill();
  } else if(type==='swarm'){
    // Drone swarm — central core with small drones orbiting
    const pulse=0.5+Math.sin(ship.lightPhase*2)*0.5;
    // Central core
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=pc;
    ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,80,255,${0.4+pulse*0.4})`;
    ctx.beginPath(); ctx.arc(0,0,2.5,0,Math.PI*2); ctx.fill();
    // Drones orbiting at varying radii
    const droneCount=7;
    for(let i=0;i<droneCount;i++){
      const a=ship.lightPhase*(i%2===0?1.5:-1.2) + i*Math.PI*2/droneCount;
      const r=14+(i%3)*6;
      const dx=Math.cos(a)*r, dy=Math.sin(a)*r*0.55;
      // Drone body
      ctx.fillStyle=pa;
      ctx.beginPath(); ctx.ellipse(dx,dy,3.5,2,a,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=pc;
      ctx.beginPath(); ctx.ellipse(dx,dy,2,1.2,a,0,Math.PI*2); ctx.fill();
      // Drone glow tail
      ctx.fillStyle=`rgba(255,180,100,${0.4+pulse*0.3})`;
      ctx.beginPath();
      ctx.ellipse(dx-Math.cos(a)*3, dy-Math.sin(a)*1.5, 2, 0.8, a, 0, Math.PI*2);
      ctx.fill();
    }
    // Energy link lines from core to nearest drones
    ctx.strokeStyle=`rgba(255,200,255,${0.2+pulse*0.2})`;
    ctx.lineWidth=0.6;
    for(let i=0;i<3;i++){
      const a=ship.lightPhase*1.5 + i*Math.PI*2/3;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*14, Math.sin(a)*8); ctx.stroke();
    }
  } else if(type==='warbird'){
    // Bird-of-prey style — central body with wings swept downward like a raptor
    // Wings (large, downward-swept)
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(-2,-3); ctx.lineTo(-18,-4); ctx.lineTo(-26,12); ctx.lineTo(-10,4); ctx.lineTo(4,2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2,3); ctx.lineTo(-18,4); ctx.lineTo(-26,-12); ctx.lineTo(-10,-4); ctx.lineTo(4,-2);
    ctx.closePath(); ctx.fill();
    // Body
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(32,0); ctx.lineTo(18,-4); ctx.lineTo(-14,-5); ctx.lineTo(-18,0); ctx.lineTo(-14,5); ctx.lineTo(18,4);
    ctx.closePath(); ctx.fill();
    // Neck/head
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(26,0,8,3,0,0,Math.PI*2); ctx.fill();
    // Cockpit eye
    ctx.fillStyle='#400';
    ctx.beginPath(); ctx.ellipse(26,0,3,1.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(255,80,60,${0.5+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.ellipse(26,0,1.8,0.8,0,0,Math.PI*2); ctx.fill();
    // Wing talons (cannon tips)
    ctx.fillStyle=pc;
    ctx.fillRect(-28,11,4,2); ctx.fillRect(-28,-13,4,2);
    // Twin rear thrusters
    ctx.fillStyle=`rgba(120,255,120,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(-18,-2,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-18,2,2,0,Math.PI*2); ctx.fill();
  } else if(type==='eggufo'){
    // Egg UFO — vertical egg-shape with thin saucer ring (variation on classic saucer)
    // Lower ring
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(0,4,32,4,0,0,Math.PI*2); ctx.fill();
    // Egg body (taller)
    const eg=ctx.createLinearGradient(0,-18,0,6);
    eg.addColorStop(0,pc); eg.addColorStop(0.7,pa); eg.addColorStop(1,pa);
    ctx.fillStyle=eg;
    ctx.beginPath(); ctx.ellipse(0,-5,14,16,0,0,Math.PI*2); ctx.fill();
    // Big panoramic window
    ctx.fillStyle='#113';
    ctx.beginPath(); ctx.ellipse(0,-8,10,5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(120,230,180,${0.35+Math.sin(ship.lightPhase)*0.2})`;
    ctx.beginPath(); ctx.ellipse(0,-8,8,3.5,0,0,Math.PI*2); ctx.fill();
    // Antenna dome
    ctx.fillStyle=pa;
    ctx.fillRect(-0.8,-24,1.6,6);
    ctx.fillStyle=`rgba(255,200,80,${0.6+Math.sin(ship.lightPhase)*0.3})`;
    ctx.beginPath(); ctx.arc(0,-24,1.8,0,Math.PI*2); ctx.fill();
    // Lights ring
    for(let i=0;i<8;i++){
      const a=(i/8)*Math.PI*2+ship.lightPhase;
      ctx.fillStyle=i%2===0?pt:'#fa0';
      ctx.beginPath(); ctx.arc(Math.cos(a)*28,Math.sin(a)*3.5+4,1.5,0,Math.PI*2); ctx.fill();
    }
    // Tripod legs (little extended landers)
    ctx.strokeStyle=pa; ctx.lineWidth=1;
    [-18,0,18].forEach(lx=>{ ctx.beginPath(); ctx.moveTo(lx*0.6, 5); ctx.lineTo(lx, 9); ctx.stroke(); });
  } else if(type==='manta'){
    // Manta Glider — flat diamond wings with a long tail spine
    const tailWave = Math.sin(ship.lightPhase*2)*2;
    // Wings (wide shallow diamond, top+bottom halves for shading)
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(22,0);
    ctx.quadraticCurveTo(8,-5,-4,-20);
    ctx.quadraticCurveTo(-22,-10,-28,-2);
    ctx.lineTo(-28,2);
    ctx.quadraticCurveTo(-22,10,-4,20);
    ctx.quadraticCurveTo(8,5,22,0);
    ctx.closePath(); ctx.fill();
    // Shaded lower half
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(22,0);
    ctx.quadraticCurveTo(8,5,-4,20);
    ctx.quadraticCurveTo(-22,10,-28,2);
    ctx.lineTo(-28,0);
    ctx.closePath(); ctx.fill();
    // Leading edge highlight
    ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(22,0); ctx.quadraticCurveTo(8,-5,-4,-20); ctx.quadraticCurveTo(-22,-10,-28,0); ctx.stroke();
    // Tail spine (undulating)
    ctx.strokeStyle=pa; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-28,0); ctx.quadraticCurveTo(-38,tailWave,-46,tailWave*0.5); ctx.stroke();
    // Barb
    ctx.fillStyle=pt;
    ctx.beginPath(); ctx.moveTo(-46,tailWave*0.5-2); ctx.lineTo(-50,tailWave*0.5); ctx.lineTo(-46,tailWave*0.5+2); ctx.closePath(); ctx.fill();
    // Cockpit bulge (central)
    const mg=ctx.createRadialGradient(4,-2,1,4,0,10);
    mg.addColorStop(0,'rgba(255,255,255,0.4)'); mg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=mg;
    ctx.beginPath(); ctx.ellipse(4,0,10,4,0,0,Math.PI*2); ctx.fill();
    // Eye-like intakes on the wing edges
    ctx.fillStyle=pt;
    ctx.beginPath(); ctx.arc(8,-6,1.6,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, 6,1.6,0,Math.PI*2); ctx.fill();
  } else if(type==='jellybell'){
    // Jelly Probe — translucent dome bell + dangling tendrils
    const puff = 1 + Math.sin(ship.lightPhase*2)*0.07;
    // Outer glow aura
    const ag=ctx.createRadialGradient(0,-4,2,0,-4,30);
    ag.addColorStop(0,`${pt}cc`); ag.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=ag;
    ctx.fillRect(-30,-30,60,50);
    // Bell (translucent dome)
    ctx.fillStyle=pc;
    ctx.globalAlpha=0.78;
    ctx.beginPath();
    ctx.ellipse(0,-2,22*puff,18*puff,0,Math.PI,0);
    ctx.fill();
    ctx.globalAlpha=1;
    // Bell rim (accent)
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(0,-2,22*puff,3,0,0,Math.PI*2); ctx.fill();
    // Inner organs / core (pulsing glow)
    const coreG=ctx.createRadialGradient(0,-6,1,0,-6,10);
    coreG.addColorStop(0,`rgba(255,255,255,0.9)`); coreG.addColorStop(1,`${pt}22`);
    ctx.fillStyle=coreG;
    ctx.beginPath(); ctx.arc(0,-6,6,0,Math.PI*2); ctx.fill();
    // Ribbing on the bell
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=0.8;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(i*5,-18*puff);
      ctx.quadraticCurveTo(i*6,-10, i*7, -2);
      ctx.stroke();
    }
    // Dangling tendrils
    ctx.strokeStyle=pa; ctx.lineWidth=1.2; ctx.lineCap='round';
    for(let i=-3;i<=3;i++){
      const tx = i*5;
      const w = Math.sin(ship.lightPhase*3 + i)*2;
      ctx.beginPath();
      ctx.moveTo(tx,-1);
      ctx.quadraticCurveTo(tx+w, 10, tx+w*1.3, 22+Math.abs(i));
      ctx.stroke();
    }
    // Stinger dots at tendril tips
    ctx.fillStyle=pt;
    for(let i=-3;i<=3;i++){
      const tx = i*5;
      const w = Math.sin(ship.lightPhase*3 + i)*2;
      ctx.beginPath(); ctx.arc(tx+w*1.3, 22+Math.abs(i), 1.1, 0, Math.PI*2); ctx.fill();
    }
  } else if(type==='dagger'){
    // Diamond Dagger — angular rhombus with swept razor fins
    // Main rhombus body
    ctx.fillStyle=pc;
    ctx.beginPath();
    ctx.moveTo(34,0); ctx.lineTo(4,-8); ctx.lineTo(-26,-4);
    ctx.lineTo(-26,4); ctx.lineTo(4,8);
    ctx.closePath(); ctx.fill();
    // Shaded underbelly
    ctx.fillStyle=pa;
    ctx.beginPath();
    ctx.moveTo(34,0); ctx.lineTo(4,8); ctx.lineTo(-26,4); ctx.lineTo(-26,0);
    ctx.closePath(); ctx.fill();
    // Centerline keel (highlight)
    ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(34,0); ctx.lineTo(-26,0); ctx.stroke();
    // Swept razor fins (top + bottom, sharp triangles)
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(-18,-18); ctx.lineTo(-22,-4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-18, 18); ctx.lineTo(-22, 4); ctx.closePath(); ctx.fill();
    // Fin edges
    ctx.strokeStyle=pt; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-4,-6); ctx.lineTo(-18,-18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-18, 18); ctx.stroke();
    // Razor tip gem
    const tipG=ctx.createRadialGradient(30,0,0,30,0,8);
    tipG.addColorStop(0,'rgba(255,255,255,0.9)'); tipG.addColorStop(1,`${pt}`);
    ctx.fillStyle=tipG;
    ctx.beginPath(); ctx.moveTo(34,0); ctx.lineTo(26,-3); ctx.lineTo(26,3); ctx.closePath(); ctx.fill();
    // Twin engine glow on rear
    const gP=0.6+Math.sin(ship.lightPhase*3)*0.3;
    ctx.fillStyle=`${pt}`;
    ctx.globalAlpha=gP;
    ctx.beginPath(); ctx.arc(-26,-2,2.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-26, 2,2.2,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // Cockpit slit
    ctx.fillStyle='rgba(180,220,255,0.7)';
    ctx.fillRect(0,-1.2,12,2.4);
  } else if(type==='wheelship'){
    // Spoked Wheel — rotating outer ring with central pod
    const rot = ship.lightPhase*1.5;
    // Outer ring
    ctx.strokeStyle=pc; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.stroke();
    // Inner ring (darker)
    ctx.strokeStyle=pa; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
    // Spokes
    ctx.strokeStyle=pa; ctx.lineWidth=2; ctx.lineCap='round';
    for(let i=0;i<8;i++){
      const a = rot + i*(Math.PI*2/8);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*8, Math.sin(a)*8);
      ctx.lineTo(Math.cos(a)*22, Math.sin(a)*22);
      ctx.stroke();
    }
    // Running lights embedded in outer ring
    for(let i=0;i<12;i++){
      const a = rot*0.3 + i*(Math.PI*2/12);
      ctx.fillStyle = (i%3===0) ? pt : 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(Math.cos(a)*24, Math.sin(a)*24, 1.1, 0, Math.PI*2); ctx.fill();
    }
    // Central pod
    const ph=ctx.createRadialGradient(-2,-2,1,0,0,9);
    ph.addColorStop(0,pc); ph.addColorStop(1,pa);
    ctx.fillStyle=ph;
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
    // Pod window
    ctx.fillStyle='rgba(120,200,255,0.75)';
    ctx.beginPath(); ctx.ellipse(0,-1,5,3,0,0,Math.PI*2); ctx.fill();
    // Pod highlight
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(-2,-2,1.4,0,Math.PI*2); ctx.fill();
  } else if(type==='beetlepod'){
    // Beetle Pod — segmented domed carapace with six stub legs
    // Belly shadow
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0,6,24,3,0,0,Math.PI*2); ctx.fill();
    // Underbelly plate
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(0,4,22,5,0,0,Math.PI*2); ctx.fill();
    // Main shell (top dome)
    const shG = ctx.createRadialGradient(-4,-6,2,0,0,22);
    shG.addColorStop(0,pc); shG.addColorStop(1,pa);
    ctx.fillStyle=shG;
    ctx.beginPath();
    ctx.ellipse(0,0,24,11,0,Math.PI,0);
    ctx.fill();
    // Central seam (elytra split)
    ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(-18,0); ctx.lineTo(22,0); ctx.stroke();
    // Segment ridges across the shell
    ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.7;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();
      ctx.moveTo(i*6,-10);
      ctx.quadraticCurveTo(i*6+1,-4, i*6, 0);
      ctx.stroke();
    }
    // Head/eye bulb up front
    ctx.fillStyle=pa;
    ctx.beginPath(); ctx.ellipse(20,-2,5,4,0,0,Math.PI*2); ctx.fill();
    // Glowing eye
    const eg=0.6+Math.sin(ship.lightPhase*2)*0.3;
    ctx.fillStyle=pt; ctx.globalAlpha=eg;
    ctx.beginPath(); ctx.arc(22,-2,2,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // Antennae (waving)
    const aw=Math.sin(ship.lightPhase*3)*2;
    ctx.strokeStyle=pa; ctx.lineWidth=1; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(22,-4); ctx.quadraticCurveTo(28,-10+aw,30,-12+aw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.quadraticCurveTo(28,-6-aw,30,-8-aw); ctx.stroke();
    // Six stub legs (3 per side, tiny)
    ctx.strokeStyle=pa; ctx.lineWidth=1.5;
    const legSway = Math.sin(ship.lightPhase*4);
    [-14,-2,10].forEach((lx,i)=>{
      const s = (i%2===0?1:-1)*legSway;
      ctx.beginPath(); ctx.moveTo(lx,4); ctx.lineTo(lx-2,9+s*0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx,4); ctx.lineTo(lx+2,9-s*0.5); ctx.stroke();
    });
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
  // Lasso rope (drawn in world space, before the ship transform)
  if(ship.lasso && ship.lasso.target){
    const l=ship.lasso, tgt=l.target;
    let tx,ty;
    if(l.targetType==='block'){tx=tgt.x+tgt.w/2; ty=tgt.y+tgt.h/2;}
    else if(l.targetType==='vehicle'){tx=tgt.x+(tgt.w||40)/2; ty=tgt.y-(tgt.h||20)/2;}
    else {tx=tgt.bodyX; ty=tgt.bodyY;}
    const sx=ship.x, sy=ship.y+18;
    // Rope with slight sag
    const midX=(sx+tx)/2, midY=(sy+ty)/2 + Math.min(18, Math.hypot(tx-sx,ty-sy)*0.08);
    // Shadow
    ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=3.5;
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(midX,midY,tx,ty);ctx.stroke();
    // Rope
    ctx.strokeStyle='#d8c080';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(midX,midY,tx,ty);ctx.stroke();
    // Rope highlights (dash effect)
    ctx.strokeStyle='rgba(255,240,200,0.5)';ctx.lineWidth=0.8;
    ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(midX,midY,tx,ty);ctx.stroke();
    ctx.setLineDash([]);
    // Hook/claw at the target end
    ctx.fillStyle='#888';
    ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#444';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.stroke();
    // Spool point on ship
    ctx.fillStyle='#444';
    ctx.beginPath();ctx.arc(sx,sy,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.save();ctx.translate(ship.x,ship.y);ctx.rotate(ship.tilt);
  if(shipCloak.active){ctx.globalAlpha=0.15+Math.sin(frameNow*0.005)*0.05;}
  const pc=shipPaint.color,pa=shipPaint.accent,pt=shipPaint.trail;
  const type=shipPaint.ship||'saucer';
  drawShipBody(pc,pa,pt,type);
  if(ship.boosting){for(let i=0;i<3;i++){ctx.fillStyle=`rgba(255,${Math.random()*100+100},0,${Math.random()*0.5+0.3})`;ctx.beginPath();ctx.arc((Math.random()-0.5)*20,10+Math.random()*10,Math.random()*4+2,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
  if(gameMode==='space'&&(Math.abs(ship.vx)>1||Math.abs(ship.vy)>1)){for(let i=0;i<2;i++)particles.push({x:ship.x+(Math.random()-0.5)*10,y:ship.y+12,vx:-ship.vx*0.3+(Math.random()-0.5),vy:-ship.vy*0.3+(Math.random()-0.5),life:15+Math.random()*10,color:pt,size:Math.random()*2+1});}
}

// --- HELPERS ---
function renderDino(h){
  const s=h.scale||1, dir=h.walkDir>=0?1:-1, kind=h.dinoKind;
  const col=h.color, dark=h.skinColor;
  const cx=h.bodyX, cy=h.bodyY;
  // Feet: use physics-driven positions so ragdoll/beam feel right.
  const f1x=h.footLX, f1y=h.footLY, f2x=h.footRX, f2y=h.footRY;
  // Ground shadow
  ctx.fillStyle='rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx,GROUND_LEVEL,14*s,3*s,0,0,Math.PI*2); ctx.fill();

  const walkT = (h.walkTimer||0);
  const bob = h.grounded?Math.sin(walkT*0.18)*1.2*s:0;

  if(kind==='trex'){
    // Tail (long, tapered, behind)
    ctx.strokeStyle=col; ctx.lineCap='round';
    ctx.lineWidth=10*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*2*s,cy+bob);
    ctx.quadraticCurveTo(cx-dir*22*s,cy-6*s+bob,cx-dir*34*s,cy-2*s+bob); ctx.stroke();
    ctx.lineWidth=4*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*30*s,cy-3*s+bob); ctx.lineTo(cx-dir*42*s,cy+2*s+bob); ctx.stroke();
    // Body
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,18*s,11*s,0,0,Math.PI*2); ctx.fill();
    // Legs (2, powerful) — use physics feet
    ctx.strokeStyle=col; ctx.lineWidth=6*s;
    ctx.beginPath(); ctx.moveTo(cx-3*s,cy+8*s+bob); ctx.lineTo(f1x,f1y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+3*s,cy+8*s+bob); ctx.lineTo(f2x,f2y); ctx.stroke();
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.ellipse(f1x+dir*3*s,f1y,5*s,2*s,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(f2x+dir*3*s,f2y,5*s,2*s,0,0,Math.PI*2); ctx.fill();
    // Tiny arms
    ctx.strokeStyle=col; ctx.lineWidth=2*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*10*s,cy+bob); ctx.lineTo(cx+dir*16*s,cy+3*s+bob); ctx.stroke();
    // Head on short thick neck, facing dir
    const hx=cx+dir*22*s, hy=cy-10*s+bob;
    ctx.strokeStyle=col; ctx.lineWidth=9*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*12*s,cy-4*s+bob); ctx.lineTo(hx-dir*3*s,hy+2*s); ctx.stroke();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(hx,hy,12*s,7*s,dir*0.1,0,Math.PI*2); ctx.fill();
    // Jaw
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.moveTo(hx+dir*6*s,hy+3*s); ctx.lineTo(hx+dir*14*s,hy+5*s); ctx.lineTo(hx+dir*3*s,hy+6*s); ctx.closePath(); ctx.fill();
    // Teeth
    ctx.fillStyle='#fff';
    for(let i=0;i<5;i++){ ctx.fillRect(hx+dir*(4+i*2)*s, hy+4*s, 1*s, 2*s); }
    // Eye
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx+dir*4*s,hy-1*s,1.2*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=h.crying?'#f44':'#fc0';
    ctx.beginPath(); ctx.arc(hx+dir*4*s,hy-1*s,0.5*s,0,Math.PI*2); ctx.fill();
  } else if(kind==='raptor'){
    ctx.strokeStyle=col; ctx.lineCap='round';
    // Tail (straight, balance)
    ctx.lineWidth=4*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*2*s,cy+bob); ctx.lineTo(cx-dir*22*s,cy-4*s+bob); ctx.stroke();
    // Body
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,10*s,6*s,0,0,Math.PI*2); ctx.fill();
    // Legs
    ctx.strokeStyle=col; ctx.lineWidth=3*s;
    ctx.beginPath(); ctx.moveTo(cx-2*s,cy+4*s+bob); ctx.lineTo(f1x,f1y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+2*s,cy+4*s+bob); ctx.lineTo(f2x,f2y); ctx.stroke();
    // Sickle claw on leading foot
    ctx.strokeStyle='#eee'; ctx.lineWidth=1.5*s;
    ctx.beginPath(); ctx.moveTo(f2x+dir*3*s,f2y); ctx.quadraticCurveTo(f2x+dir*6*s,f2y-4*s,f2x+dir*4*s,f2y-5*s); ctx.stroke();
    // Arms with claws
    ctx.strokeStyle=col; ctx.lineWidth=1.8*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*5*s,cy-1*s+bob); ctx.lineTo(cx+dir*10*s,cy+4*s+bob); ctx.stroke();
    // Head
    const hx=cx+dir*14*s, hy=cy-6*s+bob;
    ctx.strokeStyle=col; ctx.lineWidth=4*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*6*s,cy-3*s+bob); ctx.lineTo(hx,hy); ctx.stroke();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(hx,hy,7*s,4*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.moveTo(hx+dir*3*s,hy+1*s); ctx.lineTo(hx+dir*9*s,hy+3*s); ctx.lineTo(hx+dir*2*s,hy+3*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx+dir*2*s,hy-1*s,1*s,0,Math.PI*2); ctx.fill();
  } else if(kind==='stego'){
    // Quadruped + back plates
    const footY=GROUND_LEVEL;
    ctx.strokeStyle=col; ctx.lineCap='round';
    // Tail
    ctx.lineWidth=5*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*12*s,cy+bob); ctx.lineTo(cx-dir*26*s,cy+4*s+bob); ctx.stroke();
    // Spikes on tail tip (thagomizer)
    ctx.fillStyle='#eee';
    for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(cx-dir*(22+i*2)*s,cy+2*s+bob); ctx.lineTo(cx-dir*(24+i*2)*s,cy-3*s+bob); ctx.lineTo(cx-dir*(20+i*2)*s,cy+1*s+bob); ctx.closePath(); ctx.fill(); }
    // Body
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,18*s,9*s,0,0,Math.PI*2); ctx.fill();
    // Plates along the back
    ctx.fillStyle=dark;
    for(let i=-2;i<=2;i++){
      const px=cx+i*5*s, py=cy-8*s+bob-Math.abs(i)*1*s;
      ctx.beginPath(); ctx.moveTo(px-3*s,py+4*s); ctx.lineTo(px,py-6*s); ctx.lineTo(px+3*s,py+4*s); ctx.closePath(); ctx.fill();
    }
    // Four legs (use feet + synthesize 2 more at arm positions)
    ctx.strokeStyle=col; ctx.lineWidth=4*s;
    ctx.beginPath(); ctx.moveTo(cx-10*s,cy+7*s+bob); ctx.lineTo(cx-10*s+Math.sin(walkT*0.2)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-3*s,cy+7*s+bob); ctx.lineTo(cx-3*s-Math.sin(walkT*0.2)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+3*s,cy+7*s+bob); ctx.lineTo(cx+3*s+Math.sin(walkT*0.2+1)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+10*s,cy+7*s+bob); ctx.lineTo(cx+10*s-Math.sin(walkT*0.2+1)*2*s,footY); ctx.stroke();
    // Small head
    const hx=cx+dir*16*s, hy=cy+bob;
    ctx.strokeStyle=col; ctx.lineWidth=5*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*10*s,cy-2*s+bob); ctx.lineTo(hx,hy+1*s); ctx.stroke();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(hx,hy,5*s,3.5*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx+dir*2*s,hy-1*s,0.9*s,0,Math.PI*2); ctx.fill();
  } else if(kind==='tricera'){
    const footY=GROUND_LEVEL;
    ctx.strokeStyle=col; ctx.lineCap='round';
    // Tail
    ctx.lineWidth=5*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*12*s,cy+bob); ctx.lineTo(cx-dir*22*s,cy+3*s+bob); ctx.stroke();
    // Body
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,16*s,9*s,0,0,Math.PI*2); ctx.fill();
    // 4 legs
    ctx.strokeStyle=col; ctx.lineWidth=5*s;
    ctx.beginPath(); ctx.moveTo(cx-9*s,cy+7*s+bob); ctx.lineTo(cx-9*s+Math.sin(walkT*0.2)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-3*s,cy+7*s+bob); ctx.lineTo(cx-3*s-Math.sin(walkT*0.2)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+3*s,cy+7*s+bob); ctx.lineTo(cx+3*s+Math.sin(walkT*0.2+1)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+9*s,cy+7*s+bob); ctx.lineTo(cx+9*s-Math.sin(walkT*0.2+1)*2*s,footY); ctx.stroke();
    // Head with big frill + 3 horns
    const hx=cx+dir*16*s, hy=cy+2*s+bob;
    // Frill
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.ellipse(hx-dir*3*s,hy-2*s,8*s,9*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(hx,hy,8*s,5*s,0,0,Math.PI*2); ctx.fill();
    // Horns
    ctx.fillStyle='#f0ead8';
    // Nose horn
    ctx.beginPath(); ctx.moveTo(hx+dir*5*s,hy-1*s); ctx.lineTo(hx+dir*9*s,hy-6*s); ctx.lineTo(hx+dir*5*s,hy-3*s); ctx.closePath(); ctx.fill();
    // Brow horns
    ctx.beginPath(); ctx.moveTo(hx+dir*2*s,hy-4*s); ctx.lineTo(hx+dir*4*s,hy-11*s); ctx.lineTo(hx+dir*1*s,hy-5*s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx+dir*-1*s,hy-4*s); ctx.lineTo(hx+dir*-3*s,hy-11*s); ctx.lineTo(hx+dir*-2*s,hy-5*s); ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx+dir*2*s,hy-1*s,1*s,0,Math.PI*2); ctx.fill();
  } else if(kind==='bronto'){
    const footY=GROUND_LEVEL;
    ctx.strokeStyle=col; ctx.lineCap='round';
    // Long tail
    ctx.lineWidth=6*s;
    ctx.beginPath(); ctx.moveTo(cx-dir*14*s,cy+bob);
    ctx.quadraticCurveTo(cx-dir*30*s,cy-2*s+bob,cx-dir*46*s,cy+6*s+bob); ctx.stroke();
    // Body
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,22*s,11*s,0,0,Math.PI*2); ctx.fill();
    // 4 legs (columnar)
    ctx.strokeStyle=col; ctx.lineWidth=7*s;
    ctx.beginPath(); ctx.moveTo(cx-12*s,cy+8*s+bob); ctx.lineTo(cx-12*s+Math.sin(walkT*0.15)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-4*s,cy+8*s+bob); ctx.lineTo(cx-4*s-Math.sin(walkT*0.15)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+4*s,cy+8*s+bob); ctx.lineTo(cx+4*s+Math.sin(walkT*0.15+1)*2*s,footY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+12*s,cy+8*s+bob); ctx.lineTo(cx+12*s-Math.sin(walkT*0.15+1)*2*s,footY); ctx.stroke();
    // Long neck
    ctx.strokeStyle=col; ctx.lineWidth=6*s;
    ctx.beginPath(); ctx.moveTo(cx+dir*15*s,cy-4*s+bob);
    ctx.quadraticCurveTo(cx+dir*28*s,cy-22*s+bob,cx+dir*38*s,cy-26*s+bob); ctx.stroke();
    // Small head
    const hx=cx+dir*40*s, hy=cy-26*s+bob;
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(hx,hy,5*s,3*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx+dir*2*s,hy-1*s,0.8*s,0,Math.PI*2); ctx.fill();
  } else if(kind==='ptero'){
    // Airborne silhouette (even on ground — hops)
    ctx.fillStyle=col;
    // Body
    ctx.beginPath(); ctx.ellipse(cx,cy+bob,5*s,3*s,0,0,Math.PI*2); ctx.fill();
    // Wings
    const wingPh=Math.sin(walkT*0.4)*6*s;
    ctx.strokeStyle=col; ctx.lineWidth=2*s;
    ctx.beginPath();
    ctx.moveTo(cx-1*s,cy+bob);
    ctx.quadraticCurveTo(cx-12*s,cy-8*s+bob+wingPh,cx-22*s,cy-2*s+bob+wingPh);
    ctx.lineTo(cx-2*s,cy+2*s+bob);
    ctx.closePath(); ctx.fillStyle=dark; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx+1*s,cy+bob);
    ctx.quadraticCurveTo(cx+12*s,cy-8*s+bob+wingPh,cx+22*s,cy-2*s+bob+wingPh);
    ctx.lineTo(cx+2*s,cy+2*s+bob);
    ctx.closePath(); ctx.fill();
    // Long beaked head
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.moveTo(cx+dir*4*s,cy-2*s+bob); ctx.lineTo(cx+dir*14*s,cy-4*s+bob); ctx.lineTo(cx+dir*4*s,cy+1*s+bob); ctx.closePath(); ctx.fill();
    // Crest
    ctx.beginPath(); ctx.moveTo(cx+dir*3*s,cy-3*s+bob); ctx.lineTo(cx-dir*1*s,cy-9*s+bob); ctx.lineTo(cx+dir*1*s,cy-3*s+bob); ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(cx+dir*5*s,cy-3*s+bob,0.7*s,0,Math.PI*2); ctx.fill();
  }

  if(h.beingBeamed){
    ctx.fillStyle='rgba(0,255,0,0.8)'; ctx.font='9px monospace'; ctx.textAlign='center';
    ctx.fillText(h.label,cx,cy-20*s);
  }
  if(h.onFire){
    const bt=frameNow*0.006+cx*0.13;
    for(let fi=0;fi<4;fi++){
      const fx=cx+Math.sin(bt*2+fi*2.1)*10*s;
      const fh=(1+Math.sin(bt*3+fi*1.7)*0.4)*12*s;
      ctx.fillStyle=`hsla(${fi===0?15:fi===1?30:50},100%,${50+fi*10}%,${0.5-fi*0.1})`;
      ctx.beginPath(); ctx.moveTo(fx-3*s,cy+bob);
      ctx.quadraticCurveTo(fx,cy-fh+bob,fx+3*s,cy+bob); ctx.fill();
    }
  }
}

function renderHuman(h){
  ctx.lineCap='round';
  // Dinosaur render path (prehistoric Earth) — totally different silhouette
  if(h.isDino){ renderDino(h); return; }
  // Floating creatures (Saturn gas giant natives): render with gentle vertical bob above ground
  let _floatApplied=false;
  if(h.float && !h.ragdoll && !h.beingBeamed && !h.grabbed){
    h.floatPhase = (h.floatPhase||0) + 0.03;
    const lift = 40 + Math.sin(h.floatPhase)*8;
    ctx.save(); ctx.translate(0,-lift);
    _floatApplied=true;
  }
  // Mirror horizontally when walking left so direction is readable at a glance.
  // Flip around bodyX so the character stays in place. Skip when ragdolled/beamed
  // because limb positions are driven by physics, not walk cycle.
  const flipDir = h.ragdoll||h.beingBeamed ? 0 : (h.walkDir===-1?1:0);
  if(flipDir){ctx.save(); ctx.translate(h.bodyX*2,0); ctx.scale(-1,1);}
  const limb=(x1,y1,x2,y2,col,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  const s=h.scale||1,bw=h.bodyWidth||5;
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
    ctx.beginPath();ctx.ellipse(h.headX,h.headY,h.headR*0.8,h.headR*1.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`hsl(45,70%,50%)`;
    ctx.beginPath();ctx.moveTo(h.headX-h.headR*0.9,h.headY-h.headR*0.3);ctx.lineTo(h.headX-h.headR*1.4,h.headY+h.headR*1.5);ctx.lineTo(h.headX-h.headR*0.5,h.headY+h.headR*0.8);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(h.headX+h.headR*0.9,h.headY-h.headR*0.3);ctx.lineTo(h.headX+h.headR*1.4,h.headY+h.headR*1.5);ctx.lineTo(h.headX+h.headR*0.5,h.headY+h.headR*0.8);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd700';ctx.fillRect(h.headX-h.headR*0.8,h.headY-h.headR*0.6,h.headR*1.6,h.headR*0.3);
    ctx.fillStyle='#ffd700';ctx.beginPath();ctx.moveTo(h.headX,h.headY-h.headR*0.6);ctx.lineTo(h.headX-h.headR*0.2,h.headY-h.headR*1.4);ctx.lineTo(h.headX+h.headR*0.2,h.headY-h.headR*1.4);ctx.closePath();ctx.fill();
    ctx.fillStyle=h.skinColor;
  }
  else if(h.alienHeadShape==='pointy'){ctx.beginPath();ctx.moveTo(h.headX,h.headY-h.headR*1.4);ctx.lineTo(h.headX-h.headR,h.headY+h.headR*0.5);ctx.lineTo(h.headX+h.headR,h.headY+h.headR*0.5);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR*0.7,0,Math.PI*2);ctx.fill();}
  else{ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR,0,Math.PI*2);ctx.fill();}
  if(h.alienExtra==='antennae'){ctx.strokeStyle=h.skinColor;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(h.headX-3,h.headY-h.headR);ctx.quadraticCurveTo(h.headX-8,h.headY-h.headR*2.5,h.headX-5,h.headY-h.headR*2);ctx.stroke();ctx.beginPath();ctx.moveTo(h.headX+3,h.headY-h.headR);ctx.quadraticCurveTo(h.headX+8,h.headY-h.headR*2.5,h.headX+5,h.headY-h.headR*2);ctx.stroke();
    ctx.fillStyle='#ff0';ctx.beginPath();ctx.arc(h.headX-5,h.headY-h.headR*2,2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX+5,h.headY-h.headR*2,2,0,Math.PI*2);ctx.fill();}
  if(h.alienExtra==='horns'){ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(h.headX-h.headR,h.headY-2);ctx.lineTo(h.headX-h.headR-6,h.headY-h.headR*1.5);ctx.lineTo(h.headX-h.headR+4,h.headY-2);ctx.fill();ctx.beginPath();ctx.moveTo(h.headX+h.headR,h.headY-2);ctx.lineTo(h.headX+h.headR+6,h.headY-h.headR*1.5);ctx.lineTo(h.headX+h.headR-4,h.headY-2);ctx.fill();}
  if(h.hat==='collar'){ctx.fillStyle='#fff';ctx.fillRect(h.headX-4,h.headY+h.headR-2,8,3);}
  if(h.hat==='cap'){ctx.fillStyle='#222';ctx.beginPath();ctx.ellipse(h.headX,h.headY-h.headR+2,h.headR+3,4,0,Math.PI,0);ctx.fill();ctx.fillRect(h.headX-h.headR-3,h.headY-h.headR+1,h.headR*2+6,3);}
  if(h.hat==='bun'){ctx.fillStyle='#ccc';ctx.beginPath();ctx.arc(h.headX,h.headY-h.headR+1,5,0,Math.PI*2);ctx.fill();}
  if(h.hat==='headband'){ctx.strokeStyle='#f00';ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.headX,h.headY,h.headR+1,Math.PI+0.3,-0.3);ctx.stroke();}
  if(h.hat==='feather'){
    ctx.fillStyle='#a06020';ctx.fillRect(h.headX-h.headR-1,h.headY-h.headR+2,h.headR*2+2,3);
    const feathers=['#c00','#fc0','#0a0','#c00','#fc0'];
    feathers.forEach((fc,fi)=>{const fx=h.headX-h.headR+fi*(h.headR*2/4);ctx.fillStyle=fc;ctx.beginPath();ctx.moveTo(fx,h.headY-h.headR+2);ctx.lineTo(fx-2,h.headY-h.headR-10-fi%2*4);ctx.lineTo(fx+2,h.headY-h.headR-10-fi%2*4);ctx.closePath();ctx.fill();});
  }
  const er=h.headR/8;
  if(h.isAlien){
    const eyeColor=h.crying?'#f00':'#0ff';
    ctx.fillStyle=eyeColor;ctx.beginPath();ctx.ellipse(h.headX-3*er,h.headY-1*er,2*er,1.5*er,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(h.headX+3*er,h.headY-1*er,2*er,1.5*er,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(h.headX-3*er,h.headY-1*er,0.8*er,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX+3*er,h.headY-1*er,0.8*er,0,Math.PI*2);ctx.fill();
    if(h.crying){ctx.beginPath();ctx.ellipse(h.headX,h.headY+3*er,2*er,(1.5+h.panicLevel*0.2)*er,0,0,Math.PI*2);ctx.fillStyle='#300';ctx.fill();}
  }else{
    if(h.crying||h.panicLevel>1){ctx.fillStyle='#000';ctx.fillRect(h.headX-4*er,h.headY-2*er,3*er,1.5*er);ctx.fillRect(h.headX+1*er,h.headY-2*er,3*er,1.5*er);ctx.beginPath();ctx.ellipse(h.headX,h.headY+4*er,3*er,(2+h.panicLevel*0.3)*er,0,0,Math.PI*2);ctx.fillStyle='#300';ctx.fill();ctx.strokeStyle='#000';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(h.headX-5*er,h.headY-5*er);ctx.lineTo(h.headX-2*er,h.headY-4*er);ctx.moveTo(h.headX+5*er,h.headY-5*er);ctx.lineTo(h.headX+2*er,h.headY-4*er);ctx.stroke();}
    else{ctx.fillStyle='#000';ctx.beginPath();ctx.arc(h.headX-3*er,h.headY-1*er,er,0,Math.PI*2);ctx.arc(h.headX+3*er,h.headY-1*er,er,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(h.headX,h.headY+2*er,2*er,0,Math.PI);ctx.strokeStyle='#000';ctx.lineWidth=0.5;ctx.stroke();}
  }
  if(h.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(h.label,h.headX,h.headY-h.headR-8);}
  // Burning overlay: flame tongues at head + body + legs
  if(h.onFire){
    const bt=frameNow*0.006+h.bodyX*0.13;
    const anchors=[[h.headX,h.headY,h.headR*1.1],[h.bodyX,h.bodyY-2*s,6*s+Math.random()*2],[h.bodyX,h.bodyY+5*s,5*s]];
    anchors.forEach((a,ai)=>{
      const [ax,ay,ar]=a;
      for(let fi=0;fi<3;fi++){
        const fx=ax+Math.sin(bt*2+fi*2.1+ai)*ar*0.35;
        const fh=ar*(1.1+Math.sin(bt*3+fi*1.7+ai)*0.4);
        const fw=ar*(0.35+fi*0.12);
        const hue=fi===0?15:fi===1?30:50;
        ctx.fillStyle=`hsla(${hue},100%,${50+fi*10}%,${0.55-fi*0.12})`;
        ctx.beginPath();ctx.moveTo(fx-fw,ay);
        ctx.quadraticCurveTo(fx-fw*0.5,ay-fh*0.6,fx,ay-fh);
        ctx.quadraticCurveTo(fx+fw*0.5,ay-fh*0.6,fx+fw,ay);ctx.fill();
      }
    });
  }
  // --- COSTUME OVERLAYS (president / ghost / clown) ---
  if(h.costume && !h.isDino){
    const cs=h.scale||1, cw=h.bodyWidth||5;
    if(h.costume==='president'){
      // Dark suit lapels (V-shape), white shirt, red tie
      ctx.fillStyle='#0a0e18';
      ctx.beginPath();
      ctx.moveTo(h.bodyX-cw-1, h.bodyY-3*cs);
      ctx.lineTo(h.bodyX-1, h.bodyY+2*cs);
      ctx.lineTo(h.bodyX-cw*0.3, h.bodyY+6*cs);
      ctx.lineTo(h.bodyX-cw-1, h.bodyY+6*cs);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(h.bodyX+cw+1, h.bodyY-3*cs);
      ctx.lineTo(h.bodyX+1, h.bodyY+2*cs);
      ctx.lineTo(h.bodyX+cw*0.3, h.bodyY+6*cs);
      ctx.lineTo(h.bodyX+cw+1, h.bodyY+6*cs);
      ctx.closePath(); ctx.fill();
      // White collar shirt
      ctx.fillStyle='#f5f5f5';
      ctx.beginPath();
      ctx.moveTo(h.bodyX-1.5, h.bodyY-2*cs);
      ctx.lineTo(h.bodyX+1.5, h.bodyY-2*cs);
      ctx.lineTo(h.bodyX+2, h.bodyY+5*cs);
      ctx.lineTo(h.bodyX-2, h.bodyY+5*cs);
      ctx.closePath(); ctx.fill();
      // Red tie
      ctx.fillStyle='#c01828';
      ctx.beginPath();
      ctx.moveTo(h.bodyX-1, h.bodyY-1*cs);
      ctx.lineTo(h.bodyX+1, h.bodyY-1*cs);
      ctx.lineTo(h.bodyX+1.5, h.bodyY+4*cs);
      ctx.lineTo(h.bodyX, h.bodyY+5.5*cs);
      ctx.lineTo(h.bodyX-1.5, h.bodyY+4*cs);
      ctx.closePath(); ctx.fill();
      // Flag pin on lapel
      ctx.fillStyle='#c33'; ctx.fillRect(h.bodyX-cw*0.7, h.bodyY, 1.2, 1);
      ctx.fillStyle='#33c'; ctx.fillRect(h.bodyX-cw*0.7, h.bodyY+1, 1.2, 0.6);
    } else if(h.costume==='clown'){
      // Polka-dot suit — colored circles all over the body
      const dots=[['#fc0',-cw*0.4,0],['#0c4',cw*0.5,1*cs],['#08f',-cw*0.2,3*cs],['#f4c',cw*0.3,4.5*cs],['#fc0',-cw*0.5,5.5*cs]];
      dots.forEach(([dc,dx,dy])=>{ctx.fillStyle=dc;ctx.beginPath();ctx.arc(h.bodyX+dx,h.bodyY+dy,1.4,0,Math.PI*2);ctx.fill();});
      // Big white ruffled collar
      ctx.fillStyle='#fff';
      for(let ri=0;ri<6;ri++){
        const ra=(ri/6)*Math.PI - Math.PI*0.5;
        ctx.beginPath();ctx.arc(h.bodyX+Math.cos(ra)*4, h.bodyY-2*cs+Math.sin(ra)*1.5, 2, 0, Math.PI*2);ctx.fill();
      }
      // Huge red shoes
      ctx.fillStyle='#c00';
      ctx.beginPath();ctx.ellipse(h.footLX-1, h.footLY, 4, 1.8, 0, 0, Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(h.footRX+1, h.footRY, 4, 1.8, 0, 0, Math.PI*2);ctx.fill();
      // Red nose
      ctx.fillStyle='#f22';
      ctx.beginPath();ctx.arc(h.headX, h.headY+1, 1.8, 0, Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.beginPath();ctx.arc(h.headX-0.5, h.headY+0.5, 0.6, 0, Math.PI*2);ctx.fill();
      // White face paint around mouth
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.ellipse(h.headX, h.headY+3, 3, 1.5, 0, 0, Math.PI*2);ctx.fill();
      // Painted smile
      ctx.strokeStyle='#c00';ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(h.headX, h.headY+2.5, 2, 0.2, Math.PI-0.2);ctx.stroke();
    } else if(h.costume==='ghost'){
      // Drape a white sheet over the entire figure. Sheet hangs from head down to feet.
      const sheetTop=h.headY-h.headR-1;
      const sheetBot=Math.max(h.footLY, h.footRY);
      const sheetW=h.headR+6;
      const flutter=Math.sin((h.walkTimer||0)*1.5)*1.2;
      ctx.fillStyle='rgba(245,245,250,0.95)';
      ctx.beginPath();
      ctx.moveTo(h.headX-sheetW*0.5, sheetTop);
      ctx.quadraticCurveTo(h.headX-sheetW, h.bodyY, h.headX-sheetW-1+flutter, sheetBot);
      // Wavy bottom hem
      for(let wi=-3;wi<=3;wi++){
        const wx=h.headX + wi*(sheetW/3);
        const wy=sheetBot + ((wi%2===0)?1.5:-0.5);
        ctx.lineTo(wx, wy);
      }
      ctx.quadraticCurveTo(h.headX+sheetW, h.bodyY, h.headX+sheetW*0.5, sheetTop);
      ctx.closePath(); ctx.fill();
      // Faint folds
      ctx.strokeStyle='rgba(200,200,210,0.4)';ctx.lineWidth=0.6;
      ctx.beginPath();ctx.moveTo(h.headX-sheetW*0.4, sheetTop+4);ctx.lineTo(h.headX-sheetW*0.7, sheetBot-2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(h.headX+sheetW*0.4, sheetTop+4);ctx.lineTo(h.headX+sheetW*0.7, sheetBot-2);ctx.stroke();
      // Eye holes
      ctx.fillStyle='#000';
      ctx.beginPath();ctx.ellipse(h.headX-h.headR*0.45, h.headY-1, 1.6, 2.2, 0, 0, Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(h.headX+h.headR*0.45, h.headY-1, 1.6, 2.2, 0, 0, Math.PI*2);ctx.fill();
      // Mouth hole
      ctx.beginPath();ctx.ellipse(h.headX, h.headY+h.headR*0.5, 1.4, 2, 0, 0, Math.PI*2);ctx.fill();
      // Pointy wizard hat on top (purple with star)
      const htip=sheetTop-14, hbaseY=sheetTop+1, hbaseW=h.headR+2;
      ctx.fillStyle='#4a2a70';
      ctx.beginPath();
      ctx.moveTo(h.headX, htip);
      ctx.lineTo(h.headX-hbaseW, hbaseY);
      ctx.lineTo(h.headX+hbaseW, hbaseY);
      ctx.closePath(); ctx.fill();
      // Brim
      ctx.fillStyle='#2a1840';
      ctx.beginPath();ctx.ellipse(h.headX, hbaseY, hbaseW+1.5, 1.5, 0, 0, Math.PI*2);ctx.fill();
      // Gold star
      ctx.fillStyle='#fc0';
      const starY=htip+6;
      ctx.beginPath();
      for(let si=0;si<5;si++){
        const sa=si*(Math.PI*2/5)-Math.PI/2;
        ctx.lineTo(h.headX+Math.cos(sa)*1.6, starY+Math.sin(sa)*1.6);
        const sa2=sa+Math.PI/5;
        ctx.lineTo(h.headX+Math.cos(sa2)*0.7, starY+Math.sin(sa2)*0.7);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  // Hair/hat specific to costumes drawn after astronaut block too
  if(h.hat==='president'){
    // Slicked-back dark hair with highlight
    ctx.fillStyle='#2a2418';
    ctx.beginPath();ctx.ellipse(h.headX, h.headY-h.headR*0.7, h.headR*0.95, h.headR*0.55, 0, Math.PI, 0);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.fillRect(h.headX-h.headR*0.4, h.headY-h.headR*0.9, h.headR*0.2, 1);
  }
  if(h.hat==='clownhair'){
    // Wild rainbow puff hair sticking out on sides + bald cap top
    const clr=['#f40','#fc0','#0d4','#06f','#f0c'];
    for(let ci=0;ci<5;ci++){
      const ang=-Math.PI + ci*(Math.PI/4);
      const cx2=h.headX+Math.cos(ang)*(h.headR+1);
      const cy2=h.headY+Math.sin(ang)*(h.headR+1);
      ctx.fillStyle=clr[ci%clr.length];
      ctx.beginPath();ctx.arc(cx2, cy2, 2.2, 0, Math.PI*2);ctx.fill();
    }
    // Little tuft on top
    ctx.fillStyle='#f40';
    ctx.beginPath();ctx.arc(h.headX, h.headY-h.headR-1, 1.8, 0, Math.PI*2);ctx.fill();
  }
  // --- ASTRONAUT SPACESUIT OVERLAY (Moon) ---
  if(h.isAstronaut && !h.isDino){
    const s2=h.scale||1;
    // Suit torso (white with shadow)
    ctx.fillStyle='rgba(240,244,248,0.85)';
    ctx.fillRect(h.bodyX-(h.bodyWidth||5)-1, h.bodyY-3*s2, (h.bodyWidth||5)*2+2, 10*s2);
    // Chest panel (control module)
    ctx.fillStyle='#c0c4c8';ctx.fillRect(h.bodyX-3, h.bodyY+1*s2, 6, 4);
    ctx.fillStyle='#ff0';ctx.fillRect(h.bodyX-2, h.bodyY+2*s2, 1.5, 1);
    ctx.fillStyle='#0f0';ctx.fillRect(h.bodyX+0.5, h.bodyY+2*s2, 1.5, 1);
    // Life-support backpack (behind)
    ctx.fillStyle='#8a8f95';
    ctx.fillRect(h.bodyX-6, h.bodyY-3*s2, 4, 9*s2);
    ctx.strokeStyle='#5a5f65';ctx.lineWidth=0.6;ctx.strokeRect(h.bodyX-6, h.bodyY-3*s2, 4, 9*s2);
    // Boots
    ctx.fillStyle='#d8dce0';
    ctx.fillRect(h.footLX-3, h.footLY-2, 6, 3);
    ctx.fillRect(h.footRX-3, h.footRY-2, 6, 3);
    // Gloves
    ctx.fillStyle='#e8ecf0';
    ctx.beginPath();ctx.arc(h.armLX, h.armLY+(h.beingBeamed?-10*s2:8*s2), 2, 0, Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(h.armRX, h.armRY+(h.beingBeamed?-10*s2:8*s2), 2, 0, Math.PI*2);ctx.fill();
    // Fishbowl helmet
    ctx.fillStyle='rgba(180,210,240,0.25)';
    ctx.beginPath();ctx.arc(h.headX, h.headY, h.headR+2, 0, Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(220,230,240,0.9)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(h.headX, h.headY, h.headR+2, 0, Math.PI*2);ctx.stroke();
    // Visor shine
    ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.beginPath();ctx.ellipse(h.headX-h.headR*0.4, h.headY-h.headR*0.5, h.headR*0.35, h.headR*0.6, -0.3, 0, Math.PI*2);ctx.fill();
    // Gold visor tint (bottom half)
    ctx.fillStyle='rgba(255,200,80,0.15)';
    ctx.beginPath();ctx.arc(h.headX, h.headY, h.headR+1, 0, Math.PI);ctx.fill();
    // Flag patch on shoulder
    ctx.fillStyle='#c0c0c8';ctx.fillRect(h.bodyX+2, h.bodyY-2*s2, 3, 2);
    ctx.fillStyle='#c44';ctx.fillRect(h.bodyX+2, h.bodyY-2*s2, 1.5, 2);
  }
  if(flipDir)ctx.restore();
  if(_floatApplied) ctx.restore();
}

function renderCow(c){
  const s=c.size, cx=c.x, cy=c.wack==='hover'?c.bodyY+15*s:c.y;
  const by=c.bodyY, legY=cy;
  const wt=c.legAnim, tt=c.tailAnim;
  const dir=c.walkDir;

  if(c.wack==='anubis'){
    ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,14*s,3*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(cx,by,16*s,9*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx-8*s,by+5*s);ctx.lineTo(cx-9*s+Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-3*s,by+5*s);ctx.lineTo(cx-3*s-Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+3*s,by+5*s);ctx.lineTo(cx+3*s+Math.sin(wt+1)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+8*s,by+5*s);ctx.lineTo(cx+9*s-Math.sin(wt+1)*2*s,legY);ctx.stroke();
    const hx2=cx+dir*16*s,hy2=by-8*s;
    ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(hx2,hy2,7*s,6*s,dir*0.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+dir*7*s,hy2+2*s,5*s,3*s,dir*0.1,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(hx2-3*s,hy2-5*s);ctx.lineTo(hx2-1*s,hy2-14*s);ctx.lineTo(hx2+1*s,hy2-5*s);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(hx2+1*s,hy2-5*s);ctx.lineTo(hx2+3*s,hy2-14*s);ctx.lineTo(hx2+5*s,hy2-5*s);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd700';ctx.beginPath();ctx.arc(hx2+dir*3*s,hy2-2*s,2.5*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(hx2+dir*3*s,hy2-2*s,1.2*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffd700';ctx.lineWidth=2*s;
    ctx.beginPath();ctx.arc(hx2-dir*5*s,hy2+4*s,6*s,0,Math.PI);ctx.stroke();
    ctx.fillStyle=c.spots;
    ctx.fillRect(cx-2*s,by-6*s,4*s,2*s);ctx.fillRect(cx+5*s,by-3*s,3*s,2*s);
    ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;
    const tailX=cx-dir*15*s,tailY=by-4*s;
    ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.quadraticCurveTo(tailX-dir*6*s,tailY-15*s,tailX-dir*3*s,tailY-12*s);ctx.stroke();
    if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-18*s);}
    return;
  }

  if(c.wack==='monkey'){
    ctx.fillStyle='rgba(0,0,0,0.15)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,10*s,3*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=c.color;ctx.lineWidth=3*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx-4*s,by+5*s);ctx.lineTo(cx-5*s+Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+4*s,by+5*s);ctx.lineTo(cx+5*s-Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.ellipse(cx-5*s+Math.sin(wt)*2*s,legY,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cx+5*s-Math.sin(wt)*2*s,legY,3*s,1.5*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(cx,by,10*s,12*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.ellipse(cx,by+2*s,6*s,8*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=c.color;ctx.lineWidth=3*s;
    const armSwing=Math.sin(tt*2)*5*s;
    ctx.beginPath();ctx.moveTo(cx-9*s,by-4*s);ctx.lineTo(cx-14*s+armSwing,by+4*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+9*s,by-4*s);ctx.lineTo(cx+14*s-armSwing,by+4*s);ctx.stroke();
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.arc(cx-14*s+armSwing,by+4*s,2.5*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(cx+14*s-armSwing,by+4*s,2.5*s,0,Math.PI*2);ctx.fill();
    const hx=cx,hy=by-14*s;
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(hx,hy,9*s,8*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d9a070';
    ctx.beginPath();ctx.ellipse(hx,hy+2*s,6*s,5*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.ellipse(hx-3*s,hy-1*s,2.5*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx+3*s,hy-1*s,2.5*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2a1a0a';
    ctx.beginPath();ctx.arc(hx-3*s,hy-1*s,1.2*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx+3*s,hy-1*s,1.2*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1.5*s;
    ctx.beginPath();ctx.moveTo(hx-5*s,hy-3*s);ctx.lineTo(hx-1*s,hy-3.5*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx+1*s,hy-3.5*s);ctx.lineTo(hx+5*s,hy-3*s);ctx.stroke();
    ctx.fillStyle='#4a3020';
    ctx.beginPath();ctx.arc(hx-1.5*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx+1.5*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#5a3a20';ctx.lineWidth=1*s;
    ctx.beginPath();ctx.arc(hx,hy+4.5*s,2.5*s,0.2,Math.PI-0.2);ctx.stroke();
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.arc(hx-9*s,hy-2*s,4*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx+9*s,hy-2*s,4*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d9a070';
    ctx.beginPath();ctx.arc(hx-9*s,hy-2*s,2.5*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx+9*s,hy-2*s,2.5*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;
    ctx.beginPath();ctx.moveTo(cx-dir*8*s,by+6*s);
    ctx.quadraticCurveTo(cx-dir*18*s,by-5*s+Math.sin(tt)*4*s,cx-dir*15*s,by-15*s+Math.sin(tt*0.8)*3*s);
    ctx.stroke();
    ctx.beginPath();ctx.arc(cx-dir*15*s,by-15*s+Math.sin(tt*0.8)*3*s,2*s,0,Math.PI*2);ctx.fill();
    if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-24*s);}
    return;
  }

  if(c.wack==='camel'){
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.22)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,18*s,4*s,0,0,Math.PI*2);ctx.fill();
    // Long stilty legs
    ctx.strokeStyle=c.color;ctx.lineWidth=2.5*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx-8*s,by+5*s);ctx.lineTo(cx-9*s+Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-3*s,by+5*s);ctx.lineTo(cx-3*s-Math.sin(wt)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+3*s,by+5*s);ctx.lineTo(cx+3*s+Math.sin(wt+1)*2*s,legY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+8*s,by+5*s);ctx.lineTo(cx+9*s-Math.sin(wt+1)*2*s,legY);ctx.stroke();
    // Hoof dust at feet
    ctx.fillStyle='#6a5238';
    [cx-9*s+Math.sin(wt)*2*s,cx-3*s-Math.sin(wt)*2*s,cx+3*s+Math.sin(wt+1)*2*s,cx+9*s-Math.sin(wt+1)*2*s].forEach(fx=>{
      ctx.beginPath();ctx.ellipse(fx,legY,1.8*s,1.1*s,0,0,Math.PI*2);ctx.fill();
    });
    // Body
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(cx,by,16*s,8*s,0,0,Math.PI*2);ctx.fill();
    // Belly tone
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.ellipse(cx,by+3*s,12*s,3*s,0,0,Math.PI*2);ctx.fill();
    // Two humps (dromedary/bactrian)
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(cx-5*s,by-6*s,6*s,6*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cx+5*s,by-6*s,6*s,6*s,0,0,Math.PI*2);ctx.fill();
    // Hump highlights
    ctx.fillStyle='rgba(255,220,170,0.25)';
    ctx.beginPath();ctx.ellipse(cx-5*s,by-8*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cx+5*s,by-8*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();
    // Long curved neck
    ctx.strokeStyle=c.color;ctx.lineWidth=5.5*s;ctx.lineCap='round';
    const neckStartX=cx+dir*10*s, neckStartY=by-4*s;
    const neckEndX=cx+dir*18*s, neckEndY=by-14*s;
    ctx.beginPath();
    ctx.moveTo(neckStartX,neckStartY);
    ctx.quadraticCurveTo(cx+dir*16*s,by-4*s,neckEndX,neckEndY);
    ctx.stroke();
    // Head
    const hx=cx+dir*22*s, hy=by-16*s;
    ctx.fillStyle=c.color;
    ctx.beginPath();ctx.ellipse(hx,hy,5*s,4*s,dir*0.2,0,Math.PI*2);ctx.fill();
    // Snout
    ctx.beginPath();ctx.ellipse(hx+dir*4*s,hy+1.5*s,3*s,2.2*s,0,0,Math.PI*2);ctx.fill();
    // Nostril + mouth line
    ctx.fillStyle='#2a1a0a';
    ctx.beginPath();ctx.arc(hx+dir*5*s,hy+1*s,0.6*s,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#3a2a1a';ctx.lineWidth=0.8*s;
    ctx.beginPath();ctx.moveTo(hx+dir*3*s,hy+2.5*s);ctx.lineTo(hx+dir*5.5*s,hy+2.5*s);ctx.stroke();
    // Eye (half-lidded — sleepy camel)
    ctx.fillStyle='#111';
    ctx.beginPath();ctx.ellipse(hx+dir*1*s,hy-1*s,1.2*s,0.8*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#4a3218';ctx.lineWidth=0.7*s;
    ctx.beginPath();ctx.moveTo(hx+dir*-0.2*s,hy-1.8*s);ctx.lineTo(hx+dir*2.2*s,hy-1.8*s);ctx.stroke();
    // Ears
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.ellipse(hx-dir*1*s,hy-4*s,1.3*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx+dir*1*s,hy-4*s,1.3*s,2*s,0,0,Math.PI*2);ctx.fill();
    // Short tufted tail
    ctx.strokeStyle=c.color;ctx.lineWidth=2*s;
    const tailX=cx-dir*15*s, tailY=by-2*s;
    ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.quadraticCurveTo(tailX-dir*3*s,tailY+4*s+Math.sin(tt)*1.5*s,tailX-dir*2*s,tailY+8*s);ctx.stroke();
    ctx.fillStyle=c.spots;
    ctx.beginPath();ctx.arc(tailX-dir*2*s,tailY+8*s,1.8*s,0,Math.PI*2);ctx.fill();
    if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-24*s);}
    return;
  }

  ctx.fillStyle='rgba(0,0,0,0.2)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,18*s,4*s,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#222';ctx.lineWidth=3*s;ctx.lineCap='round';
  const legSpread=8*s;
  ctx.beginPath();ctx.moveTo(cx-legSpread,by+5*s);ctx.lineTo(cx-legSpread+Math.sin(wt)*3*s,legY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx-legSpread+6*s,by+5*s);ctx.lineTo(cx-legSpread+6*s-Math.sin(wt)*3*s,legY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+legSpread-6*s,by+5*s);ctx.lineTo(cx+legSpread-6*s+Math.sin(wt+1)*3*s,legY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+legSpread,by+5*s);ctx.lineTo(cx+legSpread-Math.sin(wt+1)*3*s,legY);ctx.stroke();
  ctx.fillStyle='#333';
  [cx-legSpread+Math.sin(wt)*3*s,cx-legSpread+6*s-Math.sin(wt)*3*s,cx+legSpread-6*s+Math.sin(wt+1)*3*s,cx+legSpread-Math.sin(wt+1)*3*s].forEach(hx=>{
    ctx.beginPath();ctx.ellipse(hx,legY,2*s,1.5*s,0,0,Math.PI*2);ctx.fill();
  });
  ctx.fillStyle=c.color;
  ctx.beginPath();ctx.ellipse(cx,by,20*s,12*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=c.spots;
  ctx.beginPath();ctx.ellipse(cx-6*s,by-3*s,5*s,4*s,0.3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx+8*s,by+2*s,4*s,3*s,-0.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx+2*s,by-6*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffaaaa';
  ctx.beginPath();ctx.ellipse(cx+3*s,by+10*s,5*s,4*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff8888';
  for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(cx+(i-1.5)*2.5*s,by+13*s,1*s,2*s,0,0,Math.PI*2);ctx.fill();}
  const hx=cx+dir*18*s, hy=by-6*s;
  ctx.fillStyle=c.color;
  ctx.beginPath();ctx.ellipse(hx,hy,8*s,7*s,dir*0.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=c.spots==='#333'?'#ddc0c0':c.spots;
  ctx.beginPath();ctx.ellipse(hx+dir*6*s,hy+2*s,4*s,3*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#333';
  ctx.beginPath();ctx.arc(hx+dir*7*s,hy+1*s,1*s,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(hx+dir*7*s,hy+3*s,1*s,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(hx+dir*3*s,hy-3*s,3*s,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(hx-dir*1*s,hy-3*s,2.5*s,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';
  ctx.beginPath();ctx.arc(hx+dir*3*s+Math.sin(c.walkTimer*0.02)*1.5*s,hy-3*s,1.5*s,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(hx-dir*1*s-Math.sin(c.walkTimer*0.03)*1*s,hy-3.5*s,1.2*s,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=c.color;
  ctx.beginPath();ctx.ellipse(hx-dir*2*s,hy-7*s,3*s,2*s,dir*0.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(hx+dir*2*s,hy-7*s,3*s,2*s,-dir*0.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#aa8';ctx.lineWidth=2*s;
  ctx.beginPath();ctx.moveTo(hx-dir*1*s,hy-6*s);ctx.lineTo(hx-dir*3*s,hy-11*s);ctx.stroke();
  ctx.beginPath();ctx.moveTo(hx+dir*1*s,hy-6*s);ctx.lineTo(hx+dir*3*s,hy-11*s);ctx.stroke();
  ctx.strokeStyle=c.color;ctx.lineWidth=2*s;
  const tailX=cx-dir*18*s, tailY=by-5*s;
  ctx.beginPath();ctx.moveTo(tailX,tailY);
  ctx.quadraticCurveTo(tailX-dir*8*s,tailY-10*s+Math.sin(tt)*8*s,tailX-dir*12*s,tailY-5*s+Math.sin(tt*1.5)*6*s);ctx.stroke();
  ctx.fillStyle=c.spots;ctx.beginPath();ctx.arc(tailX-dir*12*s,tailY-5*s+Math.sin(tt*1.5)*6*s,3*s,0,Math.PI*2);ctx.fill();

  if(c.wack==='twohead'){
    const h2x=cx-dir*10*s, h2y=by-18*s;
    ctx.fillStyle=c.color;ctx.beginPath();ctx.ellipse(h2x,h2y,6*s,5*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(h2x+2*s,h2y-1*s,2*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(h2x-2*s,h2y-1*s,2*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#111';ctx.beginPath();ctx.arc(h2x+2*s,h2y-1*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(h2x-2*s,h2y-1*s,1*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.spots;ctx.beginPath();ctx.ellipse(h2x,h2y+3*s,3*s,2*s,0,0,Math.PI*2);ctx.fill();
  }
  if(c.wack==='hover'){
    ctx.fillStyle='rgba(100,150,255,0.15)';ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL,15*s,3*s,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(100,150,255,0.3)';ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(cx,GROUND_LEVEL-2,12*s,2*s,0,0,Math.PI*2);ctx.stroke();
  }
  if(c.wack==='crystal'){
    ctx.fillStyle='rgba(200,100,255,0.6)';
    for(let i=0;i<4;i++){const sx=cx-8*s+i*5*s;ctx.beginPath();ctx.moveTo(sx,by-10*s);ctx.lineTo(sx-2*s,by-18*s-i*2*s);ctx.lineTo(sx+2*s,by-10*s);ctx.closePath();ctx.fill();}
  }
  if(c.wack==='fire'){
    const t=frameNow*0.005;
    for(let i=0;i<3;i++){
      ctx.fillStyle=`rgba(255,${100+Math.random()*80},0,${0.4+Math.random()*0.3})`;
      ctx.beginPath();ctx.arc(cx-6*s+i*6*s,by-12*s+Math.sin(t+i)*3*s,3*s+Math.random()*2*s,0,Math.PI*2);ctx.fill();
    }
  }
  if(c.wack==='frozen'){
    ctx.strokeStyle='rgba(150,220,255,0.6)';ctx.lineWidth=1;
    for(let i=0;i<3;i++){const ix=cx-5*s+i*5*s,iy=by-12*s;
      ctx.beginPath();ctx.moveTo(ix,iy);ctx.lineTo(ix,iy-6*s);ctx.moveTo(ix-3*s,iy-3*s);ctx.lineTo(ix+3*s,iy-3*s);ctx.stroke();
    }
  }
  if(c.wack==='spacesuit'){
    ctx.strokeStyle='rgba(200,220,255,0.4)';ctx.lineWidth=1.5*s;
    ctx.beginPath();ctx.arc(hx,hy,9*s,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(200,220,255,0.1)';ctx.beginPath();ctx.arc(hx,hy,9*s,0,Math.PI*2);ctx.fill();
  }

  if(c.beingBeamed){ctx.fillStyle='rgba(0,255,0,0.7)';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(c.label,cx,by-16*s);}
}

// Hijacked (alien-converted) vehicle — retrofitted to a sleek hovercraft look:
// - Floats off the ground on a cyan antigrav glow
// - Wheels hidden; replaced by glowing thruster discs
// - Neon-tinted windshield and trim
// - Faint energy trail behind when moving
function renderHijackedVehicle(v){
  const cx=v.x+v.w/2;
  const hover = 5 + Math.sin(frameNow*0.006)*1.2;
  const gy = v.y; // ground line (wheels would sit here)
  // Cloak wraps the whole render in low alpha + a subtle shimmer tint
  if(v.cloaked){
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(frameNow*0.008)*0.05;
  }

  // --- Antigrav underglow on the ground (before lifting the vehicle) ---
  const glowGrad=ctx.createRadialGradient(cx, gy+1, 2, cx, gy+1, v.w*0.75);
  glowGrad.addColorStop(0, 'rgba(120,240,255,0.75)');
  glowGrad.addColorStop(0.4,'rgba(80,180,255,0.35)');
  glowGrad.addColorStop(1, 'rgba(60,120,255,0)');
  ctx.fillStyle=glowGrad;
  ctx.beginPath();ctx.ellipse(cx, gy+2, v.w*0.7, 6, 0, 0, Math.PI*2);ctx.fill();

  // Energy trail when moving
  if(Math.abs(v.vx)>0.5){
    const tailSide = v.vx>0 ? -1 : 1; // trail drags behind
    const tx = v.vx>0 ? v.x : v.x+v.w;
    for(let i=0;i<5;i++){
      const a=(5-i)/5;
      ctx.fillStyle=`rgba(120,240,255,${a*0.25})`;
      ctx.beginPath();ctx.ellipse(tx+tailSide*(i*10+6), gy-v.h*0.35-hover, 6-i, 2, 0, 0, Math.PI*2);ctx.fill();
    }
    // Occasional energy sparks
    if(Math.random()<0.5){
      particles.push({x:tx+tailSide*8, y:gy-v.h*0.35-hover+(Math.random()-0.5)*4,
        vx:tailSide*(1+Math.random()*1.5), vy:(Math.random()-0.5)*0.6,
        life:18+Math.random()*10, color:['#8ff','#4df','#6ef'][Math.floor(Math.random()*3)], size:1+Math.random()*1.5});
    }
  }

  // --- Hovering body (translated up) ---
  ctx.save();
  ctx.translate(0,-hover);
  // We want wheels hidden. Hack: draw a solid band over where the wheels would be after renderVehicle.
  // Easier: call renderVehicle, then mask wheels with a thruster strip.
  renderVehicle(v);
  // Hide wheels with a dark thruster bar at ground level
  ctx.fillStyle='rgba(10,20,40,0.9)';
  ctx.fillRect(v.x-1, gy-2, v.w+2, 4);
  // Thruster discs (two glowing pads under the vehicle)
  const discs = v.type==='truck'?3 : v.type==='bus'?4 : 2;
  const pulseT = frameNow*0.012;
  for(let i=0;i<discs;i++){
    const dx = v.x + v.w*(0.15 + i*(0.7/(discs-1||1)));
    const pulse = 0.6 + Math.sin(pulseT+i)*0.3;
    const dg=ctx.createRadialGradient(dx, gy, 1, dx, gy, 7);
    dg.addColorStop(0,`rgba(180,255,255,${0.85*pulse})`);
    dg.addColorStop(0.5,'rgba(80,200,255,0.55)');
    dg.addColorStop(1,'rgba(40,120,255,0)');
    ctx.fillStyle=dg;
    ctx.beginPath();ctx.ellipse(dx, gy, 7, 3, 0, 0, Math.PI*2);ctx.fill();
    // Core
    ctx.fillStyle=`rgba(220,255,255,${pulse})`;
    ctx.beginPath();ctx.ellipse(dx, gy-0.5, 2.5, 1, 0, 0, Math.PI*2);ctx.fill();
  }

  // Neon trim outline along the body (slim glow)
  const trimCol = `rgba(80,240,255,${0.55+Math.sin(frameNow*0.01)*0.2})`;
  ctx.strokeStyle=trimCol;
  ctx.lineWidth=1;
  ctx.shadowColor='rgba(80,240,255,0.8)';
  ctx.shadowBlur=6;
  // Body outline
  if(v.type==='bus' || v.type==='truck'){
    ctx.strokeRect(v.x+1, v.y-v.h+1, v.w-2, v.h-2);
  } else {
    // Car silhouette outline
    ctx.beginPath();
    ctx.moveTo(v.x, v.y-v.h*0.55);
    ctx.lineTo(v.x+v.w*0.2, v.y-v.h-1);
    ctx.lineTo(v.x+v.w*0.8, v.y-v.h-1);
    ctx.lineTo(v.x+v.w, v.y-v.h*0.55);
    ctx.lineTo(v.x+v.w, v.y-2);
    ctx.lineTo(v.x, v.y-2);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.shadowBlur=0;

  // Tinted windshield (cyan/green sci-fi glass)
  const winTint = 'rgba(60,255,200,0.25)';
  ctx.fillStyle=winTint;
  if(v.type==='bus'){
    ctx.fillRect(v.x+v.w*0.05, v.y-v.h+3, v.w*0.88, v.h*0.45);
  } else if(v.type==='truck'){
    ctx.fillRect(v.x+v.w*0.05, v.y-v.h+3, v.w*0.22, v.h*0.4);
  } else {
    ctx.fillRect(v.x+v.w*0.22, v.y-v.h+2, v.w*0.22, v.h*0.4);
    ctx.fillRect(v.x+v.w*0.56, v.y-v.h+2, v.w*0.22, v.h*0.4);
  }

  // Front headlight: forward-facing cyan cone/dot
  const dir = v.vx<0 ? -1 : 1;
  const hlX = dir>0 ? v.x+v.w-2 : v.x+2;
  ctx.fillStyle='rgba(180,255,255,0.95)';
  ctx.shadowColor='rgba(180,255,255,0.9)';ctx.shadowBlur=8;
  ctx.beginPath();ctx.arc(hlX, v.y-v.h*0.35, 2, 0, Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;

  ctx.restore();
  if(v.cloaked) ctx.restore();
}

function renderVehicle(v){
  ctx.save();
  // Sprites are drawn facing left (cab/front on left side). Flip horizontally when moving right.
  if(v.vx>0){ctx.translate(v.x+v.w/2,0);ctx.scale(-1,1);ctx.translate(-(v.x+v.w/2),0);}
  if(v.type==='car'){
    const wr=v.h*0.35;
    ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h*0.55,v.w,v.h*0.55);
    ctx.fillStyle=v.color;roundRect(ctx,v.x+v.w*0.2,v.y-v.h-2,v.w*0.6,v.h*0.5,4);ctx.fill();
    ctx.fillStyle='rgba(150,200,255,0.55)';
    ctx.fillRect(v.x+v.w*0.22,v.y-v.h+2,v.w*0.22,v.h*0.4);
    ctx.fillRect(v.x+v.w*0.56,v.y-v.h+2,v.w*0.22,v.h*0.4);
    ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(v.x,v.y-v.h*0.15,v.w,1.5);
    ctx.fillStyle='#111';
    ctx.beginPath();ctx.arc(v.x+v.w*0.22,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.78,v.y,wr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#888';
    ctx.beginPath();ctx.arc(v.x+v.w*0.22,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.78,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
    if(typeof dayNightBrightness!=='undefined' && dayNightBrightness<0){ctx.fillStyle='rgba(255,255,150,0.7)';ctx.beginPath();ctx.arc(v.x-2,v.y-v.h*0.35,wr*0.8,0,Math.PI*2);ctx.fill();}
  }else if(v.type==='truck'){
    const wr=v.h*0.3;
    ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w*0.3,v.h);
    roundRect(ctx,v.x+v.w*0.02,v.y-v.h-3,v.w*0.26,5,2);ctx.fill();
    ctx.fillStyle='#888';ctx.fillRect(v.x+v.w*0.32,v.y-v.h*1.15,v.w*0.68,v.h*1.15);
    ctx.strokeStyle='#555';ctx.lineWidth=1.2;ctx.strokeRect(v.x+v.w*0.32,v.y-v.h*1.15,v.w*0.68,v.h*1.15);
    ctx.strokeStyle='#666';ctx.lineWidth=0.6;
    for(let pl=1;pl<4;pl++){const px=v.x+v.w*0.32+v.w*0.68*pl/4;ctx.beginPath();ctx.moveTo(px,v.y-v.h*1.15);ctx.lineTo(px,v.y);ctx.stroke();}
    ctx.fillStyle='rgba(150,200,255,0.55)';ctx.fillRect(v.x+v.w*0.05,v.y-v.h+3,v.w*0.22,v.h*0.4);
    ctx.fillStyle='#111';
    ctx.beginPath();ctx.arc(v.x+v.w*0.15,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.65,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.87,v.y,wr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#999';
    ctx.beginPath();ctx.arc(v.x+v.w*0.15,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.65,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.87,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
  }else if(v.type==='bus'){
    const wr=v.h*0.3;
    ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w,v.h);
    roundRect(ctx,v.x+2,v.y-v.h-3,v.w-4,5,2);ctx.fill();
    ctx.fillStyle='rgba(150,200,255,0.55)';
    const winCount=8;
    for(let wi=0;wi<winCount;wi++){
      const wx=v.x+v.w*0.05+wi*(v.w*0.88/winCount);
      ctx.fillRect(wx,v.y-v.h+4,v.w*0.8/winCount*0.85,v.h*0.45);
    }
    ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(v.x+v.w-v.w*0.12,v.y-v.h+3,v.w*0.08,v.h-5);
    ctx.fillStyle='#111';
    ctx.beginPath();ctx.arc(v.x+v.w*0.12,v.y,wr,0,Math.PI*2);ctx.arc(v.x+v.w*0.85,v.y,wr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#999';
    ctx.beginPath();ctx.arc(v.x+v.w*0.12,v.y,wr*0.45,0,Math.PI*2);ctx.arc(v.x+v.w*0.85,v.y,wr*0.45,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText('42',v.x+v.w/2,v.y-v.h-1);
  }else if(v.type==='rover'){
    ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y-v.h,v.w,v.h*0.5);
    ctx.fillRect(v.x+10,v.y-v.h-8,v.w-20,8);
    ctx.fillStyle='#666';ctx.beginPath();ctx.arc(v.x+12,v.y,6,0,Math.PI*2);ctx.arc(v.x+v.w-12,v.y,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#aaa';ctx.beginPath();ctx.arc(v.x+12,v.y,3,0,Math.PI*2);ctx.arc(v.x+v.w-12,v.y,3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#888';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(v.x+v.w-15,v.y-v.h-8);ctx.lineTo(v.x+v.w-10,v.y-v.h-20);ctx.stroke();
    ctx.fillStyle='#f00';ctx.beginPath();ctx.arc(v.x+v.w-10,v.y-v.h-20,2,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function drawStar(c,cx,cy,r,pts){c.beginPath();for(let i=0;i<pts*2;i++){const a=Math.PI/2*3+i*Math.PI/pts;const rad=i%2===0?r:r*0.4;c.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);}c.closePath();c.fill();}
// Draw a detailed alien preview at given position and scale with a skin
// Dive suit overlay — helmet dome + air tank + fin-like drag — painted on top of the alien
function drawDiveSuit(ax, ay, f){
  const t=performance.now()*0.001;
  // Helmet (glass dome around head)
  const hy = ay - 30;
  const hr = 10;
  // Outer glass dome
  const dg=ctx.createRadialGradient(ax-2, hy-2, 1, ax, hy, hr+2);
  dg.addColorStop(0,'rgba(255,255,255,0.5)');
  dg.addColorStop(0.4,'rgba(180,220,255,0.25)');
  dg.addColorStop(1,'rgba(80,130,180,0.15)');
  ctx.fillStyle=dg;
  ctx.beginPath(); ctx.arc(ax, hy, hr+2, 0, Math.PI*2); ctx.fill();
  // Ring at neck
  ctx.fillStyle='#889';
  ctx.fillRect(ax-hr-1, hy+hr-2, (hr+1)*2, 3);
  ctx.strokeStyle='#556'; ctx.lineWidth=0.5;
  ctx.strokeRect(ax-hr-1, hy+hr-2, (hr+1)*2, 3);
  // Bolts around ring
  ctx.fillStyle='#445';
  for(let bi=0;bi<4;bi++){
    ctx.beginPath(); ctx.arc(ax-hr+2+bi*5, hy+hr-0.5, 0.8, 0, Math.PI*2); ctx.fill();
  }
  // Reflection highlight on dome
  ctx.fillStyle='rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(ax-3, hy-4, 3, 2, -0.4, 0, Math.PI*2); ctx.fill();
  // Dome rim outline
  ctx.strokeStyle='rgba(140,180,220,0.6)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(ax, hy, hr+1.5, 0, Math.PI*2); ctx.stroke();

  // Air tank on back
  const tbX = ax - f*6;
  const tbY = ay - 20;
  ctx.fillStyle='#c93';
  ctx.fillRect(tbX-2.5, tbY-4, 5, 12);
  ctx.fillStyle='#eb4';
  ctx.fillRect(tbX-2.5, tbY-4, 1.5, 12);
  ctx.strokeStyle='#633'; ctx.lineWidth=0.5;
  ctx.strokeRect(tbX-2.5, tbY-4, 5, 12);
  // Hose from tank to helmet
  ctx.strokeStyle='#222'; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(tbX, tbY-4);
  ctx.quadraticCurveTo(ax-f*3, hy+2, ax-f*1, hy+hr-2);
  ctx.stroke();

  // Flipper-like fins on feet (small subtle overlay)
  ctx.fillStyle='rgba(60,100,140,0.75)';
  ctx.beginPath();
  ctx.moveTo(ax-4, ay-1);
  ctx.lineTo(ax-8, ay+3);
  ctx.lineTo(ax-2, ay+2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ax+4, ay-1);
  ctx.lineTo(ax+8, ay+3);
  ctx.lineTo(ax+2, ay+2);
  ctx.closePath(); ctx.fill();

  // Occasional bubbles from helmet top
  const bp=(t*2)%1;
  ctx.fillStyle=`rgba(220,240,255,${0.5*(1-bp)})`;
  ctx.beginPath(); ctx.arc(ax+f*2, hy-hr-2-bp*6, 1.4+bp*0.8, 0, Math.PI*2); ctx.fill();

  // Flash highlight when first-equipped
  if(alien.diveSuitShownT>120){
    const pulse=(alien.diveSuitShownT-120)/60;
    ctx.strokeStyle=`rgba(140,220,255,${pulse})`;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(ax, hy, hr+4+pulse*3, 0, Math.PI*2); ctx.stroke();
  }
}

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

  // Back arm (skip for limbless body types; southpark draws its own mittens; energy draws wispy tendrils)
  if(bt!=='larva' && bt!=='blob' && bt!=='tentacle' && bt!=='mushroom' && bt!=='spider' && bt!=='slug' && bt!=='energy' && !(bt==='humanoid' && skin.outfit==='southpark')){
    ctx.strokeStyle=_sb2(0x8a);ctx.lineWidth=1.8*s;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(ax-f*4*s,ay-16*s);ctx.quadraticCurveTo(ax-f*9*s,ay-10*s,ax-f*11*s,ay-6*s);ctx.stroke();
    ctx.lineWidth=0.8*s;
    for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(ax-f*11*s,ay-6*s);ctx.lineTo(ax-f*(12.5+Math.abs(i)*0.5)*s,ay+(-4+i*2)*s);ctx.stroke();}
  } else if(bt==='energy'){
    // Wispy back-tendril — fades out, drifts with time
    const drift1 = Math.sin(t2*1.5)*2*s;
    const gradArm = ctx.createLinearGradient(ax-f*4*s, ay-16*s, ax-f*14*s, ay-6*s);
    const bc = (skin.body==='rainbow') ? 'rgba(220,200,255,' : `rgba(${skin.glow==='#fff'?'220,210,240':'200,170,240'},`;
    gradArm.addColorStop(0, bc+'0.7)');
    gradArm.addColorStop(1, bc+'0)');
    ctx.strokeStyle = gradArm; ctx.lineWidth = 2.5*s; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(ax-f*3*s, ay-18*s);
    ctx.quadraticCurveTo(ax-f*9*s, ay-12*s+drift1, ax-f*13*s, ay-5*s-drift1);
    ctx.stroke();
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
    // Tank-tread undercarriage with rolling wheels — a killer machine on treads.
    // lo drives locomotion animation; use it to rotate wheels.
    const trackTop = ay - 9*s;
    const trackBot = ay - 1*s;
    const trackL = ax - 9*s;
    const trackR = ax + 9*s;
    // Track skirt (armored side plate)
    ctx.fillStyle=_sa2(0x44);
    ctx.fillRect(trackL, trackTop, trackR-trackL, trackBot-trackTop);
    // Tread outline
    ctx.strokeStyle='#111'; ctx.lineWidth=0.6*s;
    ctx.strokeRect(trackL, trackTop, trackR-trackL, trackBot-trackTop);
    // Tread plate pattern (animated — scrolls with motion)
    const spin = (lo*0.8) % (2*s);
    ctx.fillStyle='rgba(0,0,0,0.5)';
    for(let ti = trackL - 2*s; ti < trackR + 2*s; ti += 2*s){
      const tx = ti + spin;
      if(tx > trackL - 1*s && tx < trackR - 0.5*s){
        ctx.fillRect(tx, trackTop+0.5*s, 0.8*s, 1.2*s);
        ctx.fillRect(tx, trackBot-1.7*s, 0.8*s, 1.2*s);
      }
    }
    // Three drive wheels (rotate via lo)
    const wheelY = (trackTop+trackBot)/2;
    const wheelR = 2.6*s;
    const wheelXs = [ax - 6*s, ax, ax + 6*s];
    const wheelRot = lo * 0.4;
    for(const wx of wheelXs){
      // Wheel body
      ctx.fillStyle=_sa2(0x55);
      ctx.beginPath(); ctx.arc(wx, wheelY, wheelR, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle='#111'; ctx.lineWidth=0.6*s;
      ctx.beginPath(); ctx.arc(wx, wheelY, wheelR, 0, Math.PI*2); ctx.stroke();
      // Hub
      ctx.fillStyle='#222';
      ctx.beginPath(); ctx.arc(wx, wheelY, wheelR*0.35, 0, Math.PI*2); ctx.fill();
      // Spokes (rotate with lo for motion feel)
      ctx.strokeStyle='#777'; ctx.lineWidth=0.5*s;
      for(let sp=0; sp<4; sp++){
        const a = wheelRot + sp*(Math.PI/2);
        ctx.beginPath();
        ctx.moveTo(wx, wheelY);
        ctx.lineTo(wx + Math.cos(a)*wheelR*0.8, wheelY + Math.sin(a)*wheelR*0.8);
        ctx.stroke();
      }
    }
    // Front-most hazard light (flickers red)
    ctx.fillStyle=`rgba(255,40,40,${0.5+Math.sin(t2*9)*0.35})`;
    ctx.beginPath(); ctx.arc(ax+8.5*s, trackTop+1.2*s, 0.7*s, 0, Math.PI*2); ctx.fill();
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
    if(skin.outfit==='southpark'){
      // South Park: stubby legs drawn with the torso; skip default legs here.
    } else {
    // Longer, human-proportioned legs with pants hint
    ctx.strokeStyle=_sa2(0x77);ctx.lineWidth=2.5*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(ax-3*s,ay-7*s);ctx.lineTo(ax-3*s+lo*0.3,ay-3*s);ctx.lineTo(ax-3*s+lo*0.7,ay);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+3*s,ay-7*s);ctx.lineTo(ax+3*s-lo*0.3,ay-3*s);ctx.lineTo(ax+3*s-lo*0.7,ay);ctx.stroke();
    // Shoes
    ctx.fillStyle='#2a2030';
    ctx.beginPath();ctx.ellipse(ax-3*s+lo*0.7,ay,3.5*s,1.6*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+3*s-lo*0.7,ay,3.5*s,1.6*s,0,0,Math.PI*2);ctx.fill();
    }
  } else if(bt==='spider'){
    // 8 legs arching outward (4 per side) with staggered sway — spidery crawl
    ctx.strokeStyle=_sb2(0x88);ctx.lineWidth=1.3*s;ctx.lineCap='round';
    for(let lg=0;lg<4;lg++){
      const sway=Math.sin(t2*4+lg*0.7)*1.8*s;
      const swayR=Math.sin(t2*4+lg*0.7+Math.PI)*1.8*s;
      const baseY=ay-(12-lg*1.2)*s;
      const reach=(10+lg*1.5)*s;
      const liftY=(6-lg*0.5)*s;
      // left leg
      ctx.beginPath();
      ctx.moveTo(ax-2*s,baseY);
      ctx.quadraticCurveTo(ax-reach,baseY-liftY+sway,ax-reach-2*s,ay+sway*0.4);
      ctx.stroke();
      // right leg
      ctx.beginPath();
      ctx.moveTo(ax+2*s,baseY);
      ctx.quadraticCurveTo(ax+reach,baseY-liftY+swayR,ax+reach+2*s,ay+swayR*0.4);
      ctx.stroke();
    }
    // Tiny claw tips
    ctx.strokeStyle='#111';ctx.lineWidth=0.6*s;
    for(let lg=0;lg<4;lg++){
      const sway=Math.sin(t2*4+lg*0.7)*1.8*s;
      const swayR=Math.sin(t2*4+lg*0.7+Math.PI)*1.8*s;
      const reach=(10+lg*1.5)*s;
      ctx.beginPath();ctx.moveTo(ax-reach-2*s,ay+sway*0.4);ctx.lineTo(ax-reach-3*s,ay+sway*0.4+1*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(ax+reach+2*s,ay+swayR*0.4);ctx.lineTo(ax+reach+3*s,ay+swayR*0.4+1*s);ctx.stroke();
    }
  } else if(bt==='slug'){
    // Inching peristaltic locomotion: muscular wave travels tail-to-head.
    // walkPhase drives a traveling sine; idle falls back to breathing pulse.
    const wp=walkPhase||0;
    const wave=(u)=>Math.sin(wp*2 - u*2.4)*1.6*s;    // traveling wave along body
    const idle=Math.sin(t2*2)*0.6*s;                  // slow idle pulse
    // Sample the body at 4 points (tail → head) to build a rippling silhouette.
    const p0x=ax-f*22*s, p0y=ay+1*s+wave(0)+idle;
    const p1x=ax-f*14*s, p1y=ay-2*s+wave(0.4)+idle;
    const p2x=ax-f*6*s,  p2y=ay-4*s+wave(0.8)+idle*0.5;
    const p3x=ax+f*2*s,  p3y=ay-6*s+wave(1.2);
    ctx.fillStyle=_sb2(0x88);
    ctx.beginPath();
    ctx.moveTo(p3x,p3y);
    ctx.quadraticCurveTo(p2x,p2y-1*s,p1x,p1y);
    ctx.quadraticCurveTo(ax-f*19*s,p1y-1*s,p0x,p0y);
    // tail tip
    ctx.quadraticCurveTo(ax-f*25*s,ay+2*s,ax-f*22*s,ay+3*s-wave(0)*0.3);
    // underside (belly sprawls flat)
    ctx.quadraticCurveTo(ax-f*14*s,ay+2.5*s+wave(0.4)*0.3,p3x,ay-3*s);
    ctx.closePath();ctx.fill();
    // Segment creases — highlight the peristaltic wave
    ctx.strokeStyle=`rgba(0,0,0,0.18)`;ctx.lineWidth=0.8*s;
    for(let seg=0;seg<4;seg++){
      const u=0.2+seg*0.25;
      const sx0=ax-f*(22-u*24)*s;
      const sy0=ay-4*s+wave(u)+2*s;
      ctx.beginPath();ctx.moveTo(sx0,sy0-2*s);ctx.lineTo(sx0+f*1*s,sy0+2.5*s);ctx.stroke();
    }
    // Slime trail glisten — drifts with the wave
    ctx.fillStyle='rgba(255,255,255,0.22)';
    ctx.beginPath();ctx.ellipse(ax-f*10*s,ay-1*s+wave(0.6)*0.4,6*s,0.8*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.beginPath();ctx.ellipse(ax-f*18*s,ay-0.5*s+wave(0.2)*0.4,4*s,0.6*s,0,0,Math.PI*2);ctx.fill();
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

  // Jetpack (skip for limbless/floating types + costume outfits that hide it — ghost sheet covers, astronaut/hero have own backpack/cape, clown goes jetpack-less)
  const _hideJetpack = (bt==='humanoid' && skin.outfit && skin.outfit!=='tshirt' && skin.outfit!=='suit');
  if(bt!=='larva' && bt!=='energy' && bt!=='blob' && bt!=='tentacle' && bt!=='mushroom' && bt!=='spider' && bt!=='slug' && !_hideJetpack){
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
    // Armored tank-chassis torso — slanted plating and menacing details.
    // Main hull (trapezoidal armor)
    ctx.fillStyle=_sb2(0xa0);
    ctx.beginPath();
    ctx.moveTo(ax-8*s, ay-9*s);
    ctx.lineTo(ax+8*s, ay-9*s);
    ctx.lineTo(ax+7*s, ay-22*s);
    ctx.lineTo(ax-7*s, ay-22*s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#111'; ctx.lineWidth=0.7*s;
    ctx.stroke();
    // Sloped glacis plate (top)
    ctx.fillStyle=_sb2(0x80);
    ctx.beginPath();
    ctx.moveTo(ax-7*s, ay-22*s);
    ctx.lineTo(ax+7*s, ay-22*s);
    ctx.lineTo(ax+5*s, ay-25*s);
    ctx.lineTo(ax-5*s, ay-25*s);
    ctx.closePath(); ctx.fill();
    ctx.stroke();
    // Armor panel seams (vertical)
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=0.5*s;
    ctx.beginPath(); ctx.moveTo(ax-3*s, ay-22*s); ctx.lineTo(ax-3*s, ay-9*s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax+3*s, ay-22*s); ctx.lineTo(ax+3*s, ay-9*s); ctx.stroke();
    // Rivet bolts around the hull edge
    ctx.fillStyle='#222';
    const rivets = [
      [ax-6.5*s, ay-21*s],[ax+6.5*s, ay-21*s],
      [ax-6.5*s, ay-10*s],[ax+6.5*s, ay-10*s],
      [ax-6.5*s, ay-15*s],[ax+6.5*s, ay-15*s],
      [ax-4*s,  ay-24*s],[ax+4*s,  ay-24*s],
    ];
    for(const [rx,ry] of rivets){ ctx.beginPath(); ctx.arc(rx,ry,0.7*s,0,Math.PI*2); ctx.fill(); }
    // Exhaust vents (twin grilles on the shoulders)
    ctx.fillStyle='#111';
    ctx.fillRect(ax-7*s, ay-19*s, 2*s, 1.2*s);
    ctx.fillRect(ax+5*s, ay-19*s, 2*s, 1.2*s);
    ctx.fillRect(ax-7*s, ay-17*s, 2*s, 1.2*s);
    ctx.fillRect(ax+5*s, ay-17*s, 2*s, 1.2*s);
    // Warning chevrons on the belly plate
    ctx.fillStyle='rgba(255,180,0,0.65)';
    for(let ci=0; ci<3; ci++){
      const cyV = ay-12*s + ci*1.6*s;
      ctx.beginPath();
      ctx.moveTo(ax-2.2*s, cyV);
      ctx.lineTo(ax, cyV+1*s);
      ctx.lineTo(ax+2.2*s, cyV);
      ctx.lineTo(ax+2.2*s, cyV+0.6*s);
      ctx.lineTo(ax, cyV+1.6*s);
      ctx.lineTo(ax-2.2*s, cyV+0.6*s);
      ctx.closePath(); ctx.fill();
    }
    // Central targeting eye / status reactor (pulsing)
    const reactorP = 0.5 + Math.sin(t2*5)*0.4;
    ctx.fillStyle=`rgba(255,40,40,${reactorP})`;
    ctx.beginPath(); ctx.arc(ax, ay-16*s, 1.4*s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#500'; ctx.lineWidth=0.5*s;
    ctx.beginPath(); ctx.arc(ax, ay-16*s, 1.9*s, 0, Math.PI*2); ctx.stroke();
    // Shoulder pauldrons — heavy armor lumps
    ctx.fillStyle=_sa2(0x55);
    ctx.beginPath(); ctx.arc(ax-7.5*s, ay-21*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(ax+7.5*s, ay-21*s, 2*s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#111'; ctx.lineWidth=0.5*s;
    ctx.beginPath(); ctx.arc(ax-7.5*s, ay-21*s, 2*s, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax+7.5*s, ay-21*s, 2*s, 0, Math.PI*2); ctx.stroke();
  } else if(bt==='humanoid'){
    // Taller humanoid torso. If skin has an `outfit`, render clothing; else draw bare-chest fallback.
    const outfit=skin.outfit, oa=skin.outfitA||'#666', ob=skin.outfitB||'#333';
    const torsoPath=()=>{
      ctx.beginPath();
      ctx.moveTo(ax-6*s,ay-20*s);ctx.lineTo(ax+6*s,ay-20*s);
      ctx.quadraticCurveTo(ax+5*s,ay-14*s,ax+4*s,ay-7*s);
      ctx.lineTo(ax-4*s,ay-7*s);
      ctx.quadraticCurveTo(ax-5*s,ay-14*s,ax-6*s,ay-20*s);
    };
    if(outfit==='tshirt'){
      ctx.fillStyle=oa; torsoPath(); ctx.fill();
      // Short-sleeve band + subtle shadow
      ctx.fillStyle='rgba(0,0,0,0.15)';
      ctx.fillRect(ax-6*s,ay-10*s,12*s,1.2*s);
    } else if(outfit==='suit'){
      // Dark suit jacket
      ctx.fillStyle=oa; torsoPath(); ctx.fill();
      // White shirt strip down middle
      ctx.fillStyle='#f8f8f8';
      ctx.beginPath();ctx.moveTo(ax-1.8*s,ay-20*s);ctx.lineTo(ax+1.8*s,ay-20*s);
      ctx.lineTo(ax+1.5*s,ay-7*s);ctx.lineTo(ax-1.5*s,ay-7*s);ctx.closePath();ctx.fill();
      // Tie
      ctx.fillStyle=ob;
      ctx.beginPath();
      ctx.moveTo(ax-1*s,ay-19*s);ctx.lineTo(ax+1*s,ay-19*s);
      ctx.lineTo(ax+1.5*s,ay-10*s);ctx.lineTo(ax,ay-8*s);ctx.lineTo(ax-1.5*s,ay-10*s);
      ctx.closePath();ctx.fill();
      // Flag pin
      ctx.fillStyle='#c33';ctx.fillRect(ax-4*s,ay-17*s,1.4*s,0.9*s);
      ctx.fillStyle='#36c';ctx.fillRect(ax-4*s,ay-16*s,1.4*s,0.5*s);
      // Lapel V-lines
      ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=0.4*s;
      ctx.beginPath();ctx.moveTo(ax-4*s,ay-20*s);ctx.lineTo(ax-1.5*s,ay-14*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(ax+4*s,ay-20*s);ctx.lineTo(ax+1.5*s,ay-14*s);ctx.stroke();
    } else if(outfit==='astronaut'){
      // White spacesuit torso
      ctx.fillStyle=oa; torsoPath(); ctx.fill();
      // Chest control panel
      ctx.fillStyle='#c0c4c8';ctx.fillRect(ax-3*s,ay-14*s,6*s,4*s);
      ctx.fillStyle='#ff0';ctx.fillRect(ax-2.5*s,ay-13*s,1.2*s,1*s);
      ctx.fillStyle='#0f0';ctx.fillRect(ax-0.3*s,ay-13*s,1.2*s,1*s);
      ctx.fillStyle='#f80';ctx.fillRect(ax+1.3*s,ay-13*s,1.2*s,1*s);
      // Flag patch on shoulder
      ctx.fillStyle='#c0c0c8';ctx.fillRect(ax+2*s,ay-19*s,3*s,2*s);
      ctx.fillStyle='#c44';ctx.fillRect(ax+2*s,ay-19*s,1.5*s,2*s);
      // Life-support backpack (peeking behind, offset -f so it's on the back)
      ctx.fillStyle=ob;
      ctx.fillRect(ax-f*7*s,ay-20*s,3*s,13*s);
      ctx.strokeStyle='#5a5f65';ctx.lineWidth=0.5*s;ctx.strokeRect(ax-f*7*s,ay-20*s,3*s,13*s);
      // Suit seams
      ctx.strokeStyle='rgba(180,180,190,0.6)';ctx.lineWidth=0.4*s;
      ctx.beginPath();ctx.moveTo(ax,ay-20*s);ctx.lineTo(ax,ay-14*s);ctx.stroke();
    } else if(outfit==='clown'){
      // Polka-dot body
      ctx.fillStyle=oa; torsoPath(); ctx.fill();
      const dotCols=['#fc0','#0cf','#0c4','#f4c','#fff'];
      for(let pd=0;pd<7;pd++){
        const dcol=dotCols[pd%dotCols.length];
        const dx=(-4+((pd*3.3)%8))*s;
        const dy=(-18+((pd*2.7)%12))*s;
        ctx.fillStyle=dcol;ctx.beginPath();ctx.arc(ax+dx,ay+dy,1.2*s,0,Math.PI*2);ctx.fill();
      }
      // Big white ruffled collar
      ctx.fillStyle='#fff';
      for(let ri=0;ri<6;ri++){
        const ra=(ri/6)*Math.PI - Math.PI*0.5;
        ctx.beginPath();ctx.arc(ax+Math.cos(ra)*5*s, ay-20*s+Math.sin(ra)*2*s, 2.2*s, 0, Math.PI*2);ctx.fill();
      }
      // Pompom buttons
      ctx.fillStyle=ob;
      for(let bn=0;bn<3;bn++){ctx.beginPath();ctx.arc(ax,ay-17*s+bn*4*s,1.3*s,0,Math.PI*2);ctx.fill();}
    } else if(outfit==='hero'){
      // Hero suit torso (primary color)
      ctx.fillStyle=oa; torsoPath(); ctx.fill();
      // Emblem badge on chest (yellow shield)
      ctx.fillStyle='#f8d060';
      ctx.beginPath();
      ctx.moveTo(ax,ay-17*s);
      ctx.lineTo(ax+3*s,ay-15*s);
      ctx.lineTo(ax+2*s,ay-10*s);
      ctx.lineTo(ax,ay-8*s);
      ctx.lineTo(ax-2*s,ay-10*s);
      ctx.lineTo(ax-3*s,ay-15*s);
      ctx.closePath();ctx.fill();
      ctx.strokeStyle='#f0a020';ctx.lineWidth=0.6*s;ctx.stroke();
      // Emblem letter
      ctx.fillStyle='#1e3a8a';ctx.font=`bold ${5*s}px monospace`;ctx.textAlign='center';
      ctx.fillText('H',ax,ay-12*s);
      // Cape flapping behind (trail direction = -f)
      const capeW=Math.sin(t2*3)*2*s;
      ctx.fillStyle=ob;
      ctx.beginPath();
      ctx.moveTo(ax-f*5*s,ay-20*s);
      ctx.quadraticCurveTo(ax-f*(12+capeW)*s,ay-14*s,ax-f*9*s,ay-4*s);
      ctx.lineTo(ax-f*4*s,ay-7*s);
      ctx.closePath();ctx.fill();
      // Belt line
      ctx.fillStyle=ob;ctx.fillRect(ax-6*s,ay-8.5*s,12*s,1.2*s);
      ctx.fillStyle='#f8d060';ctx.fillRect(ax-1*s,ay-8.5*s,2*s,1.2*s);
    } else if(outfit==='southpark'){
      // Bulky winter coat with puffy silhouette. Body sits lower because head is huge.
      // Cartman has a noticeably wider silhouette.
      const fat = skin.id==='sp_cart' ? 1.45 : 1;
      const coatTop=ay-15*s, coatBot=ay-4*s;
      ctx.fillStyle=oa;
      ctx.beginPath();
      ctx.moveTo(ax-8*s*fat, coatTop);
      ctx.quadraticCurveTo(ax-10*s*fat, coatTop+4*s, ax-9*s*fat, coatBot);
      ctx.lineTo(ax+9*s*fat, coatBot);
      ctx.quadraticCurveTo(ax+10*s*fat, coatTop+4*s, ax+8*s*fat, coatTop);
      ctx.closePath(); ctx.fill();
      // Seam down middle
      ctx.strokeStyle='rgba(0,0,0,0.28)'; ctx.lineWidth=0.6*s;
      ctx.beginPath(); ctx.moveTo(ax, coatTop+1*s); ctx.lineTo(ax, coatBot); ctx.stroke();
      // Scarf hint (darker band at collar)
      ctx.fillStyle='rgba(0,0,0,0.22)';
      ctx.fillRect(ax-8*s*fat, coatTop, 16*s*fat, 1.5*s);
      // Mitten hands dangling by sides
      const mittenCol = ob || oa;
      const handSway = Math.sin(walkPhase||0)*1.2*s;
      ctx.fillStyle = mittenCol;
      ctx.beginPath(); ctx.arc(ax-9*s*fat+handSway, coatBot+0.5*s, 2.2*s, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ax+9*s*fat-handSway, coatBot+0.5*s, 2.2*s, 0, Math.PI*2); ctx.fill();
      // Short pants + boots
      const pantsCol = skin.pants || '#3a2a1a';
      ctx.fillStyle = pantsCol;
      ctx.fillRect(ax-6*s*fat, coatBot, 5*s*fat, 4*s);
      ctx.fillRect(ax+1*s*fat, coatBot, 5*s*fat, 4*s);
      // Boots
      ctx.fillStyle='#2a1a10';
      ctx.beginPath(); ctx.ellipse(ax-3.5*s+ (Math.sin(walkPhase||0)*1.5*s), ay+0.5*s, 3.2*s, 1.6*s, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ax+3.5*s- (Math.sin(walkPhase||0)*1.5*s), ay+0.5*s, 3.2*s, 1.6*s, 0, 0, Math.PI*2); ctx.fill();
    } else if(outfit==='ghost'){
      // Flowing sheet covers entire body + hat drawn in head section
      const sheetW=10*s, sheetTop=ay-26*s, sheetBot=ay+1*s;
      const flutter=Math.sin(t2*3)*1.5*s;
      ctx.fillStyle=oa;
      ctx.beginPath();
      ctx.moveTo(ax-sheetW*0.4,sheetTop);
      ctx.quadraticCurveTo(ax-sheetW,ay-14*s,ax-sheetW-flutter,sheetBot);
      // wavy hem
      for(let wi=-4;wi<=4;wi++){
        const wxp=ax+wi*(sheetW*0.5/4);
        const wyp=sheetBot+((wi%2===0)?2*s:-0.5*s);
        ctx.lineTo(wxp,wyp);
      }
      ctx.quadraticCurveTo(ax+sheetW,ay-14*s,ax+sheetW*0.4,sheetTop);
      ctx.closePath();ctx.fill();
      // folds
      ctx.strokeStyle='rgba(160,160,180,0.35)';ctx.lineWidth=0.6*s;
      ctx.beginPath();ctx.moveTo(ax-sheetW*0.3,sheetTop+3*s);ctx.lineTo(ax-sheetW*0.7,sheetBot-1*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(ax+sheetW*0.3,sheetTop+3*s);ctx.lineTo(ax+sheetW*0.7,sheetBot-1*s);ctx.stroke();
    } else {
      // Fallback: plain torso in body color
      const tg2=ctx.createLinearGradient(ax-6*s,ay-22*s,ax+6*s,ay-6*s);
      tg2.addColorStop(0,_sb2(0xb0));tg2.addColorStop(0.5,_sb2(0xbb));tg2.addColorStop(1,_sb2(0xa0));
      ctx.fillStyle=tg2; torsoPath(); ctx.fill();
      ctx.fillStyle=_sb2(0x66);ctx.fillRect(ax-3*s,ay-21*s,6*s,2*s);
    }
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
  } else if(bt==='spider'){
    // Bulbous abdomen (behind, oversized) + smaller cephalothorax (front)
    const abdomPulse=Math.sin(t2*2)*0.6*s;
    // Abdomen
    const abg=ctx.createRadialGradient(ax-f*4*s,ay-12*s,1*s,ax-f*5*s,ay-12*s,12*s);
    abg.addColorStop(0,_sb2(0xbb));abg.addColorStop(1,_sb2(0x77));
    ctx.fillStyle=abg;
    ctx.beginPath();ctx.ellipse(ax-f*5*s,ay-11*s,9*s+abdomPulse,7*s,0,0,Math.PI*2);ctx.fill();
    // Abdomen pattern (dots/stripes)
    ctx.fillStyle=_sa2(0x55);
    for(let dt2=0;dt2<4;dt2++){
      const da=dt2*0.5-0.75;
      ctx.beginPath();ctx.arc(ax-f*5*s+Math.cos(da)*4*s,ay-11*s+Math.sin(da)*3*s,0.8*s,0,Math.PI*2);ctx.fill();
    }
    // Cephalothorax (front segment, smaller)
    const cbg=ctx.createRadialGradient(ax+f*2*s,ay-13*s,1*s,ax+f*3*s,ay-12*s,6*s);
    cbg.addColorStop(0,_sh2(0xcc));cbg.addColorStop(1,_sh2(0x88));
    ctx.fillStyle=cbg;
    ctx.beginPath();ctx.ellipse(ax+f*3*s,ay-12*s,5*s,4.5*s,0,0,Math.PI*2);ctx.fill();
    // Fine hairs on abdomen
    ctx.strokeStyle=_sb2(0x44);ctx.lineWidth=0.4*s;
    for(let hr=0;hr<6;hr++){
      const ha=hr*1.05-2.5;
      ctx.beginPath();
      ctx.moveTo(ax-f*5*s+Math.cos(ha)*8*s,ay-11*s+Math.sin(ha)*6*s);
      ctx.lineTo(ax-f*5*s+Math.cos(ha)*10*s,ay-11*s+Math.sin(ha)*7.5*s);
      ctx.stroke();
    }
  } else if(bt==='slug'){
    // Massive bloated body + smaller head-stalk mound in front
    const bulge=Math.sin(t2*1.5)*0.8*s;
    const sg=ctx.createRadialGradient(ax-2*s,ay-10*s,1*s,ax,ay-8*s,16*s);
    sg.addColorStop(0,_sb2(0xc8));sg.addColorStop(0.6,_sb2(0xa0));sg.addColorStop(1,_sb2(0x70));
    ctx.fillStyle=sg;
    ctx.beginPath();
    ctx.moveTo(ax-10*s,ay-4*s);
    ctx.quadraticCurveTo(ax-12*s-bulge,ay-14*s,ax-4*s,ay-20*s);
    ctx.quadraticCurveTo(ax+6*s,ay-22*s,ax+11*s+bulge,ay-16*s);
    ctx.quadraticCurveTo(ax+14*s,ay-8*s,ax+10*s,ay-3*s);
    ctx.quadraticCurveTo(ax,ay-1*s,ax-10*s,ay-4*s);
    ctx.closePath();ctx.fill();
    // Belly rolls
    ctx.strokeStyle=_sb2(0x55);ctx.lineWidth=0.6*s;
    for(let rl=0;rl<3;rl++){
      ctx.beginPath();
      ctx.moveTo(ax-9*s,ay-(6+rl*3)*s);
      ctx.quadraticCurveTo(ax,ay-(5+rl*3)*s,ax+9*s,ay-(6+rl*3)*s);
      ctx.stroke();
    }
    // Slime highlights
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.beginPath();ctx.ellipse(ax-4*s,ay-16*s,3*s,1.5*s,-0.3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(ax+5*s,ay-13*s,2*s,1*s,0.2,0,Math.PI*2);ctx.fill();
    // Stubby arms (tiny useless forelimbs)
    ctx.strokeStyle=_sb2(0x77);ctx.lineWidth=1.8*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(ax-f*6*s,ay-13*s);ctx.quadraticCurveTo(ax-f*10*s,ay-11*s,ax-f*11*s,ay-8*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ax+f*6*s,ay-13*s);ctx.quadraticCurveTo(ax+f*10*s,ay-11*s,ax+f*11*s,ay-8*s);ctx.stroke();
    // Tiny claws
    ctx.strokeStyle=_sa2(0x33);ctx.lineWidth=0.5*s;
    for(let cl=0;cl<3;cl++){
      ctx.beginPath();ctx.moveTo(ax-f*11*s,ay-8*s);ctx.lineTo(ax-f*(12+cl*0.3)*s,ay-(7-cl)*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(ax+f*11*s,ay-8*s);ctx.lineTo(ax+f*(12+cl*0.3)*s,ay-(7-cl)*s);ctx.stroke();
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
  } else if(bt==='energy'){
    // --- COSMIC GHOST BODY ---
    // Wavy sheet-like torso that fades to a tattered wisp where legs would be.
    const sway = Math.sin(t2*2)*1.5*s;
    const sway2 = Math.cos(t2*2.3)*1.2*s;
    // Core body color — rainbow cosmic uses a soft lavender, otherwise derive from body color.
    const isRainbow = skin.body==='rainbow';
    const rgbPre = isRainbow ? '220,200,255' : (skin.glow==='#fff' ? '230,220,255' : '200,170,240');
    // Outer aura glow (larger, very soft)
    const auraGrad = ctx.createRadialGradient(ax, ay-18*s, 2*s, ax, ay-18*s, 26*s);
    auraGrad.addColorStop(0, `rgba(${rgbPre},0.35)`);
    auraGrad.addColorStop(1, `rgba(${rgbPre},0)`);
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.ellipse(ax, ay-18*s, 22*s, 28*s, 0, 0, Math.PI*2); ctx.fill();
    // Main ghost silhouette — hooded teardrop shape with tattered hem.
    const bodyGrad = ctx.createLinearGradient(ax, ay-32*s, ax, ay+3*s);
    bodyGrad.addColorStop(0, `rgba(${rgbPre},0.85)`);
    bodyGrad.addColorStop(0.55, `rgba(${rgbPre},0.55)`);
    bodyGrad.addColorStop(1, `rgba(${rgbPre},0)`);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    // Top of head-hood
    ctx.moveTo(ax-10*s+sway*0.2, ay-24*s);
    ctx.quadraticCurveTo(ax-12*s+sway, ay-30*s, ax-4*s, ay-33*s);
    ctx.quadraticCurveTo(ax+4*s, ay-34*s, ax+12*s-sway, ay-30*s);
    ctx.quadraticCurveTo(ax+13*s-sway, ay-22*s, ax+11*s, ay-14*s);
    // Right-side drape curve
    ctx.quadraticCurveTo(ax+13*s+sway2, ay-6*s, ax+10*s+sway2, ay-2*s);
    // Tattered hem — 6 little pointy tabs fading into nothing
    for(let tj=0; tj<7; tj++){
      const tx = ax + 10*s - tj*(20*s/6) + Math.sin(t2*3+tj*0.7)*0.6*s;
      const dip = (tj%2===0) ? 2*s : -1*s;
      ctx.lineTo(tx, ay + dip + Math.sin(t2*4+tj)*0.8*s);
    }
    // Left-side drape curve back up
    ctx.quadraticCurveTo(ax-13*s+sway2, ay-6*s, ax-11*s, ay-14*s);
    ctx.quadraticCurveTo(ax-13*s+sway, ay-22*s, ax-10*s+sway*0.2, ay-24*s);
    ctx.closePath();
    ctx.fill();
    // Inner shadow folds (robe creases)
    ctx.strokeStyle = `rgba(${rgbPre.split(',').map(n=>Math.max(0,parseInt(n)-40)).join(',')},0.35)`;
    ctx.lineWidth = 0.7*s;
    ctx.beginPath();
    ctx.moveTo(ax-5*s, ay-24*s);
    ctx.quadraticCurveTo(ax-6*s+sway2, ay-14*s, ax-4*s+sway2, ay-4*s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax+5*s, ay-24*s);
    ctx.quadraticCurveTo(ax+6*s-sway2, ay-14*s, ax+4*s-sway2, ay-4*s);
    ctx.stroke();
    // Central glowing "heart" / soul-orb
    const soulP = 0.45 + Math.sin(t2*2.5)*0.2;
    const soulGrad = ctx.createRadialGradient(ax, ay-16*s, 0, ax, ay-16*s, 4*s);
    soulGrad.addColorStop(0, `rgba(255,255,255,${soulP})`);
    soulGrad.addColorStop(1, `rgba(${rgbPre},0)`);
    ctx.fillStyle = soulGrad;
    ctx.beginPath(); ctx.arc(ax, ay-16*s, 4*s, 0, Math.PI*2); ctx.fill();
    // Floating soul particles around the ghost
    for(let gp=0; gp<5; gp++){
      const ga = t2*1.3 + gp*1.26;
      const gr = 8*s + Math.sin(t2*2+gp)*3*s;
      ctx.fillStyle = `rgba(255,255,255,${0.3+Math.sin(t2*3+gp)*0.2})`;
      ctx.beginPath();
      ctx.arc(ax + Math.cos(ga)*gr, ay-18*s + Math.sin(ga)*gr*0.6, (0.8 + Math.sin(ga*2)*0.4)*s, 0, Math.PI*2);
      ctx.fill();
    }
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
  } else if(bt==='energy' || bt==='blob' || bt==='tentacle' || bt==='mushroom' || bt==='spider' || bt==='slug'){
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
  const _headShift = bt==='larva' ? -2*s : (bt==='blob' || bt==='tentacle') ? 10*s : bt==='mushroom' ? 4*s : bt==='spider' ? 20*s : bt==='slug' ? 15*s : 0;
  const _isHuman = bt==='humanoid' && skin.hair;

  // Head
  const hx2=ax, hy2=ay-33*s+_headShift;
  if(_isHuman && skin.outfit==='southpark'){
    // Oversized round cartoon head, the defining South Park silhouette
    const HR = 12*s;
    const spHy = hy2 + 6*s; // drop head lower so it sits on the tiny torso
    // Head (big flat-shaded oval)
    ctx.fillStyle = skin.head;
    ctx.beginPath(); ctx.ellipse(hx2, spHy, HR, HR, 0, 0, Math.PI*2); ctx.fill();
    // Subtle shading on lower half (no gradient — keep it flat cartoon)
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath(); ctx.ellipse(hx2, spHy+4*s, HR-0.5*s, HR*0.55, 0, 0, Math.PI*2); ctx.fill();
    // Two round white eyes side by side
    const eyeY = spHy - 1*s, eyeR = 4.2*s;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(hx2 - 4.2*s, eyeY, eyeR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx2 + 4.2*s, eyeY, eyeR, 0, Math.PI*2); ctx.fill();
    // Tiny black pupils
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(hx2 - 4*s + f*0.3*s, eyeY, 0.9*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx2 + 4.4*s + f*0.3*s, eyeY, 0.9*s, 0, Math.PI*2); ctx.fill();
    // Small mouth
    ctx.strokeStyle='#1a1208'; ctx.lineWidth=0.9*s;
    ctx.beginPath();
    ctx.moveTo(hx2-1.6*s, spHy+5.5*s);
    ctx.quadraticCurveTo(hx2, spHy+(6.2+breathe)*s, hx2+1.6*s, spHy+5.5*s);
    ctx.stroke();
    // Hat / hair per character
    const hat = skin.hat || 'none';
    if(hat==='beanie_red'){
      // Stan — blue beanie with red pompom
      ctx.fillStyle='#1a3c9a';
      ctx.beginPath();
      ctx.moveTo(hx2-HR, spHy-5*s);
      ctx.quadraticCurveTo(hx2-HR-0.5*s, spHy-13*s, hx2, spHy-14*s);
      ctx.quadraticCurveTo(hx2+HR+0.5*s, spHy-13*s, hx2+HR, spHy-5*s);
      ctx.quadraticCurveTo(hx2, spHy-8*s, hx2-HR, spHy-5*s);
      ctx.closePath(); ctx.fill();
      // Brim
      ctx.fillStyle='#12286a';
      ctx.fillRect(hx2-HR, spHy-6*s, HR*2, 2*s);
      // Red pompom
      ctx.fillStyle='#d42020';
      ctx.beginPath(); ctx.arc(hx2, spHy-15*s, 2.8*s, 0, Math.PI*2); ctx.fill();
    } else if(hat==='ushanka'){
      // Kyle — green ushanka with earflaps
      ctx.fillStyle='#2a8a2a';
      ctx.beginPath();
      ctx.moveTo(hx2-HR-1*s, spHy-4*s);
      ctx.quadraticCurveTo(hx2-HR-2*s, spHy-12*s, hx2, spHy-14*s);
      ctx.quadraticCurveTo(hx2+HR+2*s, spHy-12*s, hx2+HR+1*s, spHy-4*s);
      ctx.quadraticCurveTo(hx2, spHy-7*s, hx2-HR-1*s, spHy-4*s);
      ctx.closePath(); ctx.fill();
      // Earflaps (triangular down the sides)
      ctx.beginPath(); ctx.moveTo(hx2-HR-1*s, spHy-4*s); ctx.lineTo(hx2-HR+1*s, spHy+4*s); ctx.lineTo(hx2-HR+3*s, spHy-3*s); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx2+HR+1*s, spHy-4*s); ctx.lineTo(hx2+HR-1*s, spHy+4*s); ctx.lineTo(hx2+HR-3*s, spHy-3*s); ctx.closePath(); ctx.fill();
      // Hat band
      ctx.fillStyle='#1a5a1a';
      ctx.fillRect(hx2-HR-1*s, spHy-5*s, (HR+1)*2*s/s, 1.6*s);
    } else if(hat==='beanie_yel'){
      // Cartman — light blue beanie with yellow pompom
      ctx.fillStyle='#74c8e8';
      ctx.beginPath();
      ctx.moveTo(hx2-HR, spHy-5*s);
      ctx.quadraticCurveTo(hx2-HR-0.5*s, spHy-13*s, hx2, spHy-14*s);
      ctx.quadraticCurveTo(hx2+HR+0.5*s, spHy-13*s, hx2+HR, spHy-5*s);
      ctx.quadraticCurveTo(hx2, spHy-8*s, hx2-HR, spHy-5*s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#3898c0';
      ctx.fillRect(hx2-HR, spHy-6*s, HR*2, 2*s);
      ctx.fillStyle='#f0d000';
      ctx.beginPath(); ctx.arc(hx2, spHy-15*s, 2.8*s, 0, Math.PI*2); ctx.fill();
    } else if(hat==='parka'){
      // Kenny — orange parka hood covers most of the face
      ctx.fillStyle=skin.outfitA || '#d86a14';
      // Full hood wrap
      ctx.beginPath();
      ctx.arc(hx2, spHy-1*s, HR+2*s, Math.PI*0.95, Math.PI*2.05, false);
      ctx.lineTo(hx2+HR+2*s, spHy+7*s);
      ctx.quadraticCurveTo(hx2, spHy+9*s, hx2-HR-2*s, spHy+7*s);
      ctx.closePath(); ctx.fill();
      // Fur trim around face opening
      ctx.fillStyle='#c08050';
      for(let fi=0; fi<8; fi++){
        const fa = -Math.PI*0.8 + fi*(Math.PI*1.6/7);
        const fx = hx2 + Math.cos(fa)*(HR-0.5*s), fy = spHy + Math.sin(fa)*(HR-0.5*s);
        ctx.beginPath(); ctx.arc(fx, fy, 1.4*s, 0, Math.PI*2); ctx.fill();
      }
      // Dark face slit — only eyes visible
      ctx.fillStyle='#080808';
      ctx.beginPath(); ctx.ellipse(hx2, spHy, HR-3*s, HR-3*s, 0, 0, Math.PI*2); ctx.fill();
      // Re-draw the eyes white-on-black for contrast
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(hx2 - 3*s, eyeY, 1.8*s, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx2 + 3*s, eyeY, 1.8*s, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#000';
      ctx.beginPath(); ctx.arc(hx2 - 2.7*s, eyeY, 0.8*s, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx2 + 3.3*s, eyeY, 0.8*s, 0, Math.PI*2); ctx.fill();
    } else if(hat==='chef'){
      // Chef — tall white chef hat
      ctx.fillStyle='#f0f0f0';
      ctx.fillRect(hx2-HR+1*s, spHy-9*s, (HR-1)*2*s/s, 3*s);
      ctx.beginPath(); ctx.ellipse(hx2, spHy-11*s, HR-1*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle='#b0b0b0'; ctx.lineWidth=0.5*s;
      ctx.beginPath(); ctx.ellipse(hx2, spHy-11*s, HR-1*s, 4*s, 0, 0, Math.PI*2); ctx.stroke();
    } else {
      // Butters — plain combed-over blonde hair
      ctx.fillStyle=skin.hair;
      ctx.beginPath();
      ctx.moveTo(hx2-HR+1*s, spHy-7*s);
      ctx.quadraticCurveTo(hx2-HR-1*s, spHy-11*s, hx2-2*s, spHy-12*s);
      ctx.quadraticCurveTo(hx2+4*s, spHy-13*s, hx2+HR-0.5*s, spHy-9*s);
      ctx.quadraticCurveTo(hx2+HR*0.3, spHy-8*s, hx2-1*s, spHy-9*s);
      ctx.quadraticCurveTo(hx2-HR*0.7, spHy-8*s, hx2-HR+1*s, spHy-7*s);
      ctx.closePath(); ctx.fill();
    }
  } else if(_isHuman){
    // Small human head (round, shorter)
    const hgH=ctx.createRadialGradient(hx2-2*s,hy2-2*s,1*s,hx2,hy2,8*s);
    hgH.addColorStop(0,_sh2(0xe0));hgH.addColorStop(0.6,_sh2(0xbc));hgH.addColorStop(1,_sh2(0x90));
    ctx.fillStyle=hgH;
    ctx.beginPath();ctx.ellipse(hx2,hy2+2*s,6.5*s,7.5*s,0,0,Math.PI*2);ctx.fill();
    // Ears
    ctx.fillStyle=_sh2(0xa0);
    ctx.beginPath();ctx.ellipse(hx2-6*s,hy2+2*s,1.2*s,2*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+6*s,hy2+2*s,1.2*s,2*s,0,0,Math.PI*2);ctx.fill();
    // Hair (top + sides) — suppressed for ghost (under sheet), astronaut (under helmet), southpark (custom head path)
    if(skin.outfit!=='ghost' && skin.outfit!=='astronaut' && skin.outfit!=='southpark'){
      ctx.fillStyle=skin.hair;
      ctx.beginPath();
      ctx.moveTo(hx2-6*s,hy2-2*s);
      ctx.quadraticCurveTo(hx2-7*s,hy2-7*s,hx2-3*s,hy2-6*s);
      ctx.quadraticCurveTo(hx2,hy2-8*s,hx2+3*s,hy2-6*s);
      ctx.quadraticCurveTo(hx2+7*s,hy2-7*s,hx2+6*s,hy2-2*s);
      ctx.quadraticCurveTo(hx2+3*s,hy2-4*s,hx2,hy2-4*s);
      ctx.quadraticCurveTo(hx2-3*s,hy2-4*s,hx2-6*s,hy2-2*s);
      ctx.closePath();ctx.fill();
    }
    // --- COSTUME HEAD OVERLAYS ---
    if(skin.outfit==='clown'){
      // Rainbow puff hair around the sides
      const puffs=['#f40','#fc0','#0d4','#06f','#f0c','#fc0','#f40'];
      for(let ci=0;ci<puffs.length;ci++){
        const ang=-Math.PI - 0.2 + ci*(Math.PI+0.4)/(puffs.length-1);
        const cx3=hx2+Math.cos(ang)*7*s;
        const cy3=hy2+2*s+Math.sin(ang)*7*s;
        ctx.fillStyle=puffs[ci];
        ctx.beginPath();ctx.arc(cx3,cy3,2.4*s,0,Math.PI*2);ctx.fill();
      }
      // Red nose
      ctx.fillStyle='#f22';
      ctx.beginPath();ctx.arc(hx2,hy2+2*s,1.8*s,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.beginPath();ctx.arc(hx2-0.5*s,hy2+1.4*s,0.6*s,0,Math.PI*2);ctx.fill();
      // White mouth paint + painted smile
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.ellipse(hx2,hy2+5*s,3.2*s,1.6*s,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#c00';ctx.lineWidth=0.8*s;
      ctx.beginPath();ctx.arc(hx2,hy2+4.5*s,2*s,0.2,Math.PI-0.2);ctx.stroke();
    } else if(skin.outfit==='ghost'){
      // Sheet drapes over head (white hood)
      ctx.fillStyle=skin.outfitA||'#f5f5fa';
      ctx.beginPath();
      ctx.moveTo(hx2-7*s,hy2+5*s);
      ctx.quadraticCurveTo(hx2-8*s,hy2-8*s,hx2,hy2-10*s);
      ctx.quadraticCurveTo(hx2+8*s,hy2-8*s,hx2+7*s,hy2+5*s);
      ctx.quadraticCurveTo(hx2,hy2+7*s,hx2-7*s,hy2+5*s);
      ctx.closePath();ctx.fill();
      // Pointy wizard hat with gold star
      const htipX=hx2, htipY=hy2-22*s, hbaseY=hy2-8*s;
      ctx.fillStyle=skin.outfitB||'#4a2a70';
      ctx.beginPath();
      ctx.moveTo(htipX,htipY);
      ctx.lineTo(hx2-8*s,hbaseY);
      ctx.lineTo(hx2+8*s,hbaseY);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='#2a1840';
      ctx.beginPath();ctx.ellipse(hx2,hbaseY,9*s,1.8*s,0,0,Math.PI*2);ctx.fill();
      // Gold star on hat
      ctx.fillStyle='#fc0';
      const starY=htipY+7*s;
      ctx.beginPath();
      for(let si=0;si<5;si++){
        const sa=si*(Math.PI*2/5)-Math.PI/2;
        ctx.lineTo(hx2+Math.cos(sa)*2*s, starY+Math.sin(sa)*2*s);
        const sa2=sa+Math.PI/5;
        ctx.lineTo(hx2+Math.cos(sa2)*0.9*s, starY+Math.sin(sa2)*0.9*s);
      }
      ctx.closePath();ctx.fill();
      // Eye holes (black)
      ctx.fillStyle='#000';
      ctx.beginPath();ctx.ellipse(hx2-2.2*s,hy2+1*s,1.4*s,2*s,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(hx2+2.2*s,hy2+1*s,1.4*s,2*s,0,0,Math.PI*2);ctx.fill();
    } else if(skin.outfit==='astronaut'){
      // Fishbowl helmet
      ctx.fillStyle='rgba(180,210,240,0.22)';
      ctx.beginPath();ctx.arc(hx2,hy2+1*s,10*s,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(230,240,250,0.95)';ctx.lineWidth=1.2*s;
      ctx.beginPath();ctx.arc(hx2,hy2+1*s,10*s,0,Math.PI*2);ctx.stroke();
      // Visor shine
      ctx.fillStyle='rgba(255,255,255,0.35)';
      ctx.beginPath();ctx.ellipse(hx2-3*s,hy2-3*s,3*s,5*s,-0.3,0,Math.PI*2);ctx.fill();
      // Gold visor tint (bottom half)
      ctx.fillStyle='rgba(255,200,80,0.18)';
      ctx.beginPath();ctx.arc(hx2,hy2+1*s,10*s,0,Math.PI);ctx.fill();
      // Neck ring
      ctx.fillStyle='#c0c4c8';
      ctx.fillRect(hx2-6*s,hy2+9*s,12*s,1.5*s);
    } else if(skin.outfit==='hero'){
      // Domino mask
      ctx.fillStyle='#111';
      ctx.beginPath();
      ctx.moveTo(hx2-6*s,hy2+1*s);
      ctx.quadraticCurveTo(hx2-6*s,hy2-2*s,hx2-3*s,hy2-2*s);
      ctx.quadraticCurveTo(hx2,hy2-1*s,hx2+3*s,hy2-2*s);
      ctx.quadraticCurveTo(hx2+6*s,hy2-2*s,hx2+6*s,hy2+1*s);
      ctx.quadraticCurveTo(hx2+3*s,hy2+3*s,hx2,hy2+2*s);
      ctx.quadraticCurveTo(hx2-3*s,hy2+3*s,hx2-6*s,hy2+1*s);
      ctx.closePath();ctx.fill();
    } else if(skin.outfit==='suit'){
      // Slicked-back hair highlight already rendered via skin.hair; add shine stripe
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.fillRect(hx2-2*s,hy2-7*s,4*s,0.8*s);
    }
  } else if(bt==='blob'){
    // No separate head — eyes float in top of blob body
  } else if(bt==='tentacle'){
    // No separate head — large eye on mantle
  } else if(bt==='spider'){
    // Spider has no separate head — cephalothorax already drawn in torso section
  } else if(bt==='slug'){
    // Wide Jabba-like head atop body: wide jowls, fat cheeks
    const shg=ctx.createRadialGradient(hx2-3*s,hy2-4*s,1*s,hx2,hy2,12*s);
    shg.addColorStop(0,_sh2(0xcc));shg.addColorStop(0.6,_sh2(0xa8));shg.addColorStop(1,_sh2(0x78));
    ctx.fillStyle=shg;
    ctx.beginPath();
    // Wide jowly skull
    ctx.moveTo(hx2-11*s,hy2+6*s);
    ctx.quadraticCurveTo(hx2-13*s,hy2-4*s,hx2-8*s,hy2-10*s);
    ctx.quadraticCurveTo(hx2,hy2-12*s,hx2+8*s,hy2-10*s);
    ctx.quadraticCurveTo(hx2+13*s,hy2-4*s,hx2+11*s,hy2+6*s);
    ctx.quadraticCurveTo(hx2+5*s,hy2+9*s,hx2,hy2+9*s);
    ctx.quadraticCurveTo(hx2-5*s,hy2+9*s,hx2-11*s,hy2+6*s);
    ctx.closePath();ctx.fill();
    // Double chin wattle
    ctx.strokeStyle=_sh2(0x60);ctx.lineWidth=0.7*s;
    ctx.beginPath();ctx.moveTo(hx2-9*s,hy2+6*s);ctx.quadraticCurveTo(hx2,hy2+(8+breathe)*s,hx2+9*s,hy2+6*s);ctx.stroke();
    // Wart/bump spots
    ctx.fillStyle=_sh2(0x55);
    const warts=[[-5,-5],[4,-6],[-2,0],[6,2],[-8,2]];
    warts.forEach(([wx,wy])=>{ctx.beginPath();ctx.arc(hx2+wx*s,hy2+wy*s,0.9*s,0,Math.PI*2);ctx.fill();});
    // Slime sheen
    ctx.fillStyle='rgba(255,255,255,0.2)';
    ctx.beginPath();ctx.ellipse(hx2-4*s,hy2-6*s,3*s,1.5*s,-0.3,0,Math.PI*2);ctx.fill();
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
  } else if(bt==='energy'){
    // Ghostly hollow skull — translucent, with void eye sockets that glow.
    const isRainbowH = skin.body==='rainbow';
    const rgbH = isRainbowH ? '230,210,255' : (skin.glow==='#fff' ? '235,225,255' : '210,180,245');
    // Hood/skull outline (slightly taller than a normal head)
    const hg3 = ctx.createRadialGradient(hx2-2*s, hy2-3*s, 1*s, hx2, hy2, 13*s);
    hg3.addColorStop(0, `rgba(${rgbH},0.85)`);
    hg3.addColorStop(0.6, `rgba(${rgbH},0.55)`);
    hg3.addColorStop(1, `rgba(${rgbH},0.25)`);
    ctx.fillStyle = hg3;
    ctx.beginPath();
    ctx.moveTo(hx2-9*s, hy2+6*s);
    ctx.quadraticCurveTo(hx2-11*s, hy2-4*s, hx2-8*s, hy2-10*s);
    ctx.quadraticCurveTo(hx2, hy2-14*s, hx2+8*s, hy2-10*s);
    ctx.quadraticCurveTo(hx2+11*s, hy2-4*s, hx2+9*s, hy2+6*s);
    ctx.quadraticCurveTo(hx2+2*s, hy2+8*s, hx2, hy2+8*s);
    ctx.quadraticCurveTo(hx2-2*s, hy2+8*s, hx2-9*s, hy2+6*s);
    ctx.closePath();
    ctx.fill();
    // Hollow void eye sockets
    ctx.fillStyle = 'rgba(8,4,20,0.85)';
    ctx.beginPath(); ctx.ellipse(hx2-3.5*s, hy2-1*s, 2.2*s, 2.8*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx2+3.5*s, hy2-1*s, 2.2*s, 2.8*s, 0, 0, Math.PI*2); ctx.fill();
    // Glowing pinprick eyes deep in the sockets
    const eyeGlow = 0.55 + Math.sin(t2*3)*0.3;
    const eCol = skin.eyes || '#fff';
    ctx.fillStyle = eCol;
    ctx.globalAlpha = eyeGlow;
    ctx.beginPath(); ctx.arc(hx2-3.5*s + f*0.5*s, hy2-0.5*s, 1*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx2+3.5*s + f*0.5*s, hy2-0.5*s, 1*s, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    // Outer eye glow haze
    for(const ex of [-3.5, 3.5]){
      const ggrad = ctx.createRadialGradient(hx2+ex*s + f*0.5*s, hy2-0.5*s, 0, hx2+ex*s + f*0.5*s, hy2-0.5*s, 3.5*s);
      ggrad.addColorStop(0, `rgba(${rgbH},${0.4*eyeGlow})`);
      ggrad.addColorStop(1, `rgba(${rgbH},0)`);
      ctx.fillStyle = ggrad;
      ctx.beginPath(); ctx.arc(hx2+ex*s + f*0.5*s, hy2-0.5*s, 3.5*s, 0, Math.PI*2); ctx.fill();
    }
    // Gaping gasp mouth (small dark oval)
    ctx.fillStyle = 'rgba(8,4,20,0.65)';
    ctx.beginPath(); ctx.ellipse(hx2, hy2+5*s, 1.6*s, (1+Math.sin(t2*2))*1*s + 1*s, 0, 0, Math.PI*2); ctx.fill();
    // Hood brim highlight
    ctx.strokeStyle = `rgba(${rgbH},0.45)`; ctx.lineWidth = 0.7*s;
    ctx.beginPath();
    ctx.moveTo(hx2-8*s, hy2-10*s);
    ctx.quadraticCurveTo(hx2, hy2-14*s, hx2+8*s, hy2-10*s);
    ctx.stroke();
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
  if(_isHuman && skin.outfit==='southpark'){
    // South Park eyes + mouth are drawn in the head block; skip default alien eyes here.
  } else if(_isHuman && skin.outfit!=='ghost' && skin.outfit!=='southpark'){
    // Small human eyes (white with iris)
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.ellipse(hx2-2.2*s,hy2+0.5*s,1.4*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+2.2*s,hy2+0.5*s,1.4*s,1*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    ctx.beginPath();ctx.arc(hx2-2*s,hy2+0.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(hx2+2.4*s,hy2+0.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    // Nose (skip for clown — red nose already drawn)
    if(skin.outfit!=='clown'){
      ctx.strokeStyle=_sh2(0x80);ctx.lineWidth=0.7*s;
      ctx.beginPath();ctx.moveTo(hx2,hy2+2*s);ctx.lineTo(hx2-0.5*s,hy2+4*s);ctx.lineTo(hx2+0.5*s,hy2+4*s);ctx.stroke();
      // Mouth
      ctx.strokeStyle='#a04040';ctx.lineWidth=0.8*s;
      ctx.beginPath();ctx.moveTo(hx2-1.5*s,hy2+6*s);ctx.quadraticCurveTo(hx2,hy2+(6.5+breathe)*s,hx2+1.5*s,hy2+6*s);ctx.stroke();
    }
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
  } else if(bt==='spider'){
    // Cluster of 8 small eyes on cephalothorax (4 large front row, 4 small rear)
    // Cephalothorax position: ax+f*3*s, ay-12*s
    const cx2=ax+f*3*s, cy2=ay-12*s;
    // Front row (4 larger)
    ctx.fillStyle='#fff';
    for(let ey=0;ey<4;ey++){
      const ex=cx2+(ey-1.5)*1.8*s;
      ctx.beginPath();ctx.arc(ex,cy2-0.5*s,1.1*s,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=_eyeCol2;
    for(let ey=0;ey<4;ey++){
      const ex=cx2+(ey-1.5)*1.8*s;
      ctx.beginPath();ctx.arc(ex,cy2-0.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    }
    // Back row (4 smaller)
    ctx.fillStyle='#fff';
    for(let ey=0;ey<4;ey++){
      const ex=cx2+(ey-1.5)*1.4*s;
      ctx.beginPath();ctx.arc(ex,cy2-2.5*s,0.7*s,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle=_eyeCol2;
    for(let ey=0;ey<4;ey++){
      const ex=cx2+(ey-1.5)*1.4*s;
      ctx.beginPath();ctx.arc(ex,cy2-2.5*s,0.4*s,0,Math.PI*2);ctx.fill();
    }
    // Chelicerae (fangs) below cluster
    ctx.strokeStyle=_sh2(0x33);ctx.lineWidth=0.9*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx2-1.5*s,cy2+2.5*s);ctx.lineTo(cx2-1*s,cy2+4.5*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx2+1.5*s,cy2+2.5*s);ctx.lineTo(cx2+1*s,cy2+4.5*s);ctx.stroke();
  } else if(bt==='slug'){
    // Wide bulging eyes with heavy lids + huge slit mouth
    // Eyes
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.ellipse(hx2-4*s,hy2-2*s,2.2*s,1.8*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+4*s,hy2-2*s,2.2*s,1.8*s,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=_eyeCol2;
    const slEyeX=Math.sin(t2*0.8)*0.5*s;
    ctx.beginPath();ctx.ellipse(hx2-4*s+slEyeX,hy2-2*s,1*s,1.3*s,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(hx2+4*s+slEyeX,hy2-2*s,1*s,1.3*s,0,0,Math.PI*2);ctx.fill();
    // Heavy brow/lid (slits from above)
    ctx.strokeStyle=_sh2(0x55);ctx.lineWidth=1.2*s;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(hx2-6.5*s,hy2-4*s);ctx.quadraticCurveTo(hx2-4*s,hy2-3.5*s,hx2-1.5*s,hy2-3.5*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx2+6.5*s,hy2-4*s);ctx.quadraticCurveTo(hx2+4*s,hy2-3.5*s,hx2+1.5*s,hy2-3.5*s);ctx.stroke();
    // Huge slit mouth (wide grin)
    ctx.strokeStyle='#2a0a0a';ctx.lineWidth=1.5*s;
    ctx.beginPath();
    ctx.moveTo(hx2-7*s,hy2+3*s);
    ctx.quadraticCurveTo(hx2,hy2+(5+breathe)*s,hx2+7*s,hy2+3*s);
    ctx.stroke();
    // Drool
    ctx.strokeStyle='rgba(255,240,200,0.5)';ctx.lineWidth=0.6*s;
    ctx.beginPath();ctx.moveTo(hx2+3*s,hy2+4.5*s);ctx.lineTo(hx2+3.3*s,hy2+(7+Math.sin(t2*2))*s);ctx.stroke();
    // Nostril slits
    ctx.strokeStyle=_sh2(0x44);ctx.lineWidth=0.5*s;
    ctx.beginPath();ctx.moveTo(hx2-1*s,hy2+0.5*s);ctx.lineTo(hx2-1*s,hy2+1.8*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx2+1*s,hy2+0.5*s);ctx.lineTo(hx2+1*s,hy2+1.8*s);ctx.stroke();
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
  if(bt!=='blob' && bt!=='tentacle' && bt!=='mushroom' && bt!=='larva' && bt!=='spider' && bt!=='slug'){
    const spOutfit = bt==='humanoid' && skin.outfit==='southpark';
    const isGhost = bt==='energy';
    if(!spOutfit && !isGhost){
      ctx.strokeStyle=_sb2(0xaa);ctx.lineWidth=1.8*s;
      ctx.beginPath();ctx.moveTo(ax+f*4*s,ay-17*s);ctx.quadraticCurveTo(ax+f*9*s,ay-14*s,ax+f*13*s,ay-12*s);ctx.stroke();
      ctx.lineWidth=0.8*s;ctx.strokeStyle=_sb2(0x99);
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(ax+f*13*s,ay-12*s);ctx.lineTo(ax+f*14*s,ay+(-12.5+i*1.5)*s);ctx.stroke();}
    } else if(isGhost){
      // Wispy front tendril leading to the gun hand
      const isRainbowG = skin.body==='rainbow';
      const rgbG = isRainbowG ? '220,200,255' : (skin.glow==='#fff' ? '230,220,255' : '200,170,240');
      const gradArm2 = ctx.createLinearGradient(ax+f*3*s, ay-18*s, ax+f*14*s, ay-12*s);
      gradArm2.addColorStop(0, `rgba(${rgbG},0)`);
      gradArm2.addColorStop(0.4, `rgba(${rgbG},0.55)`);
      gradArm2.addColorStop(1, `rgba(${rgbG},0.9)`);
      ctx.strokeStyle = gradArm2; ctx.lineWidth = 2.2*s; ctx.lineCap='round';
      const wobble = Math.sin(t2*2.5)*1.2*s;
      ctx.beginPath();
      ctx.moveTo(ax+f*3*s, ay-18*s);
      ctx.quadraticCurveTo(ax+f*9*s, ay-15*s+wobble, ax+f*13*s, ay-12*s);
      ctx.stroke();
    }
    // Gun — position above the mitten for southpark, else from the default arm hand
    const gunX = spOutfit ? ax + f*10*s : ax + f*13*s;
    const gunY = spOutfit ? ay - 6*s   : ay - 12*s;
    ctx.save();ctx.translate(gunX,gunY);ctx.scale(f,1);
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
    // Twin sensor antennae + scanning laser on top — killer-machine silhouette
    ctx.strokeStyle='#666';ctx.lineWidth=1.2*s;
    ctx.beginPath();ctx.moveTo(hx2-3*s,hy2-10*s);ctx.lineTo(hx2-4*s,hy2-18*s);ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx2+3*s,hy2-10*s);ctx.lineTo(hx2+4*s,hy2-18*s);ctx.stroke();
    ctx.fillStyle=`rgba(255,50,50,${0.4+Math.sin(t2*8)*0.4})`;
    ctx.beginPath();ctx.arc(hx2-4*s,hy2-19*s,1.2*s,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,180,50,${0.4+Math.cos(t2*8)*0.4})`;
    ctx.beginPath();ctx.arc(hx2+4*s,hy2-19*s,1.2*s,0,Math.PI*2);ctx.fill();
    // Cyclopean visor slit — horizontal band of scanner eyes across the face
    ctx.fillStyle='#0a0a0a';
    ctx.fillRect(hx2-8*s, hy2-2*s, 16*s, 3.5*s);
    const scanX = hx2 + Math.sin(t2*2)*6*s;
    ctx.fillStyle=`rgba(255,40,40,${0.7+Math.sin(t2*10)*0.25})`;
    ctx.beginPath(); ctx.arc(scanX, hy2-0.5*s, 1.3*s, 0, Math.PI*2); ctx.fill();
    // Bolted visor frame
    ctx.strokeStyle='#111'; ctx.lineWidth=0.6*s;
    ctx.strokeRect(hx2-8*s, hy2-2*s, 16*s, 3.5*s);
    ctx.fillStyle='#222';
    ctx.beginPath(); ctx.arc(hx2-7.3*s, hy2-1*s, 0.5*s, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx2+7.3*s, hy2-1*s, 0.5*s, 0, Math.PI*2); ctx.fill();
    // Heavy armored jaw — vented grille (intake)
    ctx.fillStyle='#1a1a1a';
    ctx.fillRect(hx2-5*s, hy2+4*s, 10*s, 3*s);
    ctx.strokeStyle='#444'; ctx.lineWidth=0.4*s;
    for(let gv=0; gv<5; gv++){
      const gx = hx2-4*s + gv*2*s;
      ctx.beginPath(); ctx.moveTo(gx, hy2+4*s); ctx.lineTo(gx, hy2+7*s); ctx.stroke();
    }
    // Side communication speakers (horn-like)
    ctx.fillStyle='#333';
    ctx.beginPath();
    ctx.moveTo(hx2-11*s, hy2-3*s); ctx.lineTo(hx2-13*s, hy2-5*s);
    ctx.lineTo(hx2-13*s, hy2+3*s); ctx.lineTo(hx2-11*s, hy2+1*s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx2+11*s, hy2-3*s); ctx.lineTo(hx2+13*s, hy2-5*s);
    ctx.lineTo(hx2+13*s, hy2+3*s); ctx.lineTo(hx2+11*s, hy2+1*s);
    ctx.closePath(); ctx.fill();
    // Metallic highlight
    ctx.fillStyle='rgba(255,255,255,0.1)';
    ctx.fillRect(hx2-8*s,hy2-10*s,3*s,8*s);
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
const beamSfx=mkAudio('beam-loop.wav',0.005,true);
const planetMusic={earth:mkAudio('earth-music.wav',0,true),asteroid:mkAudio('eerie-music.mp3',0,true)};
// Prehistoric Earth ambient track — swapped in when window.prehistoricEra is true on Earth.
const prehistoricMusic = mkAudio('prehistoric-music.mp3', 0, true);
const mothershipMusic=mkAudio('mothership-music.mp3',0,true);
const alienVoiceSfx=mkAudio('alien-voice.mp3',0.5,false);
const missileSfx=mkAudio('missile-sfx.wav',0.1,false);
const lassoSfx=mkAudio('lasso-whip.wav',0.12,false);
const nukeSfx=mkAudio('nuke-sfx.flac',0.12,false);
// Vehicle run-over splat — quiet so repeated hits aren't overwhelming.
const vehicleSplatSfx=mkAudio('vehicle-splat.wav',0.08,false);
const underwaterSfx=mkAudio('underwater-ambience.wav',0,true);
spaceAmbience.loop=true;spaceAmbience.volume=0;
underwaterSfx.loop=true;underwaterSfx.volume=0;
let ambienceTarget=0,ambiencePlaying=false;
let underwaterTarget=0,underwaterPlaying=false;
function isPlayerUnderwater(){
  if(gameMode!=='planet'||!currentPlanet)return false;
  // Ship underwater: diving in ocean below ground level, or inside an underwater cave
  if(!mothershipMode && ship.y>GROUND_LEVEL && (isOverOcean(ship.x) || isInsideCave(ship.x,ship.y)))return true;
  // On-foot alien underwater (in cave sandbox or cave walk) — approximate
  return false;
}
function updateAmbience(){
  // Space ambience
  ambienceTarget=(gameMode==='space'&&!mothershipMode)?0.03:0;
  const diff=ambienceTarget-spaceAmbience.volume;
  spaceAmbience.volume=Math.max(0,Math.min(1,spaceAmbience.volume+diff*0.02));
  if(ambienceTarget>0&&!ambiencePlaying){spaceAmbience.play().catch(()=>{});ambiencePlaying=true;}
  if(spaceAmbience.volume<0.01&&ambienceTarget===0&&ambiencePlaying){spaceAmbience.pause();ambiencePlaying=false;}
  // Underwater ambience
  underwaterTarget=isPlayerUnderwater()?0.18:0;
  const udiff=underwaterTarget-underwaterSfx.volume;
  underwaterSfx.volume=Math.max(0,Math.min(1,underwaterSfx.volume+udiff*0.03));
  if(underwaterTarget>0&&!underwaterPlaying){underwaterSfx.play().catch(()=>{});underwaterPlaying=true;}
  if(underwaterSfx.volume<0.01&&underwaterTarget===0&&underwaterPlaying){underwaterSfx.pause();underwaterPlaying=false;}
  // Mothership music
  if(mothershipMode){
    if(mothershipMusic.paused)mothershipMusic.play().catch(()=>{});
    mothershipMusic.volume=Math.min(0.02,mothershipMusic.volume+0.002);
  }else{mothershipMusic.volume=Math.max(0,mothershipMusic.volume-0.01);if(mothershipMusic.volume<0.01&&!mothershipMusic.paused)mothershipMusic.pause();}
  // Planet music — on prehistoric Earth, swap in the prehistoric ambient track instead of earth-music.
  const isPrehistoricEarth = gameMode==='planet' && currentPlanet && currentPlanet.id==='earth' && window.prehistoricEra;
  const wantMusic = isPrehistoricEarth ? prehistoricMusic
                  : (gameMode==='planet' && currentPlanet) ? planetMusic[currentPlanet.id]
                  : null;
  // Fade out wrong music (all planet tracks + the prehistoric track)
  const allMusicTracks = [...Object.values(planetMusic), prehistoricMusic];
  allMusicTracks.forEach(audio=>{
    if(audio!==wantMusic){audio.volume=Math.max(0,audio.volume-0.01);if(audio.volume<0.01&&!audio.paused)audio.pause();}
  });
  // Fade in correct music (prehistoric track kept much quieter per user request)
  if(wantMusic){
    if(wantMusic.paused){wantMusic.currentTime=0;wantMusic.play().catch(()=>{});}
    const maxVol = (wantMusic===prehistoricMusic) ? 0.006 : 0.02;
    const step   = (wantMusic===prehistoricMusic) ? 0.0006 : 0.002;
    wantMusic.volume=Math.min(maxVol, wantMusic.volume+step);
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
      const items=['RESUME','SAVE GAME','SAVE & QUIT TO MENU','QUIT WITHOUT SAVING'];
      pauseMenu.sel=((pauseMenu.sel%items.length)+items.length)%items.length;
      if(keys['escape']){keys['escape']=false;pauseMenu.active=false;pauseMenu._cool=10;}
      if(keys['enter']||keys[' ']){
        keys['enter']=false;keys[' ']=false;pauseMenu._cool=15;
        if(pauseMenu.sel===0){pauseMenu.active=false;}
        else if(pauseMenu.sel===1){saveGame();showMessage('Game saved!');pauseMenu.active=false;}
        else if(pauseMenu.sel===2){saveGame();gameStarted=false;mainMenuMode='menu';mainMenuSel=0;pauseMenu.active=false;}
        else if(pauseMenu.sel===3){
          // Quit to menu without saving — drops any unsaved progress
          gameStarted=false; mainMenuMode='menu'; mainMenuSel=0; pauseMenu.active=false;
        }
      }
    }
    // Draw pause overlay
    draw();
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    const cw=canvas.width,ch=canvas.height,t=performance.now()/1000;
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,cw,ch);
    ctx.fillStyle='#0f0';ctx.font='bold 28px monospace';ctx.textAlign='center';
    ctx.fillText('PAUSED',cw/2,ch*0.3);
    const items=['RESUME','SAVE GAME','SAVE & QUIT TO MENU','QUIT WITHOUT SAVING'];
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
  let _t0=performance.now();
  if(hitStopFrames>0){ hitStopFrames--; }
  else { update(); }
  window._tUpd=(performance.now()-_t0)|0;_t0=performance.now();draw();window._tDrw=(performance.now()-_t0)|0;updateAmbience();
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
    const loc = _pendingSavedLocation;
    // Restore prehistoric flag BEFORE loading the planet so Earth picks the right biome set
    window.prehistoricEra = !!(loc && loc.prehistoricEra);
    let targetPlanet = planets[0];
    if(loc && loc.planetId){
      const found = planets.find(p=>p.id===loc.planetId);
      if(found) targetPlanet = found;
    }
    if(loc && loc.mode==='space'){
      // Was in space — stay in space at saved ship position
      gameMode='space';
      currentPlanet=null;
      if(typeof loc.shipX==='number') ship.x=loc.shipX;
      if(typeof loc.shipY==='number') ship.y=loc.shipY;
      ship.vx=0; ship.vy=0;
    } else {
      loadPlanet(targetPlanet);
    }
    _pendingSavedLocation = null;
    document.getElementById('score').textContent=score;
    showMessage('Welcome back, Commander.');
  } else {
    initWorld();
    showMessage(tr('msg.startMsg'));
  }
  initTouchControls();
}

// Build a catalog of unit types that spawn on a given planet, grouped by category.
function getDebugUnitCatalog(planet){
  const groups = [];
  // Earth in the Cretaceous: only dinosaurs, no modern inhabitants/vehicles/cows
  if(planet.id==='earth' && window._debugPrehistoric){
    groups.push({cat:'Cretaceous Era (68M yrs ago)', units:prehistoricHumanTypes});
    return groups;
  }
  if(planet.id==='earth'){
    groups.push({cat:'City',     units:earthHumanTypes});
    groups.push({cat:'Suburbs',  units:suburbHumanTypes});
    groups.push({cat:'Landmarks',units:landmarkHumanTypes});
    groups.push({cat:'Mountains',units:mountainHumanTypes});
    groups.push({cat:'Jungle',   units:jungleHumanTypes});
    groups.push({cat:'Desert',   units:desertHumanTypes});
  } else if(planet.id==='mars'){
    groups.push({cat:'Colonists',units:earthHumanTypes});
  } else if(planet.alienTypes){
    groups.push({cat:'Natives',  units:planet.alienTypes});
  }
  const cows = COW_TYPES[planet.id];
  if(cows && cows.length) groups.push({cat:'Animals',units:cows.map(c=>({label:c.label,type:c.wack,size:c.size,color:c.color,spots:c.spots,isCow:true}))});
  const vehs = VEHICLE_TYPES[planet.id];
  if(vehs && vehs.length) groups.push({cat:'Vehicles',units:vehs.map(v=>({...v,isVehicle:true}))});
  return groups;
}

// Flatten catalog groups into a single list of {label, groupCat, unit} for list navigation.
function flattenUnitCatalog(groups){
  const list=[];
  groups.forEach(g=>{ g.units.forEach(u=>{ list.push({group:g.cat, unit:u}); }); });
  return list;
}

let debugSelectedPlanet = null;

// Menu-only preview state — two puppets (facing left + right) rendered directly into the menu.
let debugPreviewPuppets = null; // { unit, isCow, left, right }

function buildPreviewPuppet(unit, forceDir, planet){
  if(unit.isVehicle){
    return {
      x:-unit.w/2, y:GROUND_LEVEL, w:unit.w, h:unit.h,
      color:unit.color, type:unit.type, label:unit.label,
      vx:forceDir*(unit.speed||1), alive:true, exploding:0
    };
  }
  if(unit.isCow){
    const s=unit.size;
    return {
      x:0, y:GROUND_LEVEL, bodyY:GROUND_LEVEL-15*s,
      size:s, color:unit.color, spots:unit.spots,
      label:unit.label, wack:unit.type,
      walkDir:forceDir, walkTimer:0,
      legAnim:0, tailAnim:0, beingBeamed:false, collected:false
    };
  }
  const isAlien = !!planet.isAlien;
  const s=unit.scale||1;
  const skinColor = isAlien ? (planet.alienSkin&&planet.alienSkin[0]||'#cfc') : `hsl(25,50%,60%)`;
  return {
    headX:0, headY:GROUND_LEVEL-40*s, headR:unit.headR||8,
    bodyX:0, bodyY:GROUND_LEVEL-28*s,
    legLX:-2*s, legLY:GROUND_LEVEL-8*s,
    legRX:2*s,  legRY:GROUND_LEVEL-8*s,
    armLX:-6*s, armLY:GROUND_LEVEL-24*s,
    armRX:6*s,  armRY:GROUND_LEVEL-24*s,
    footLX:-2*s, footLY:GROUND_LEVEL,
    footRX:2*s,  footRY:GROUND_LEVEL,
    type:unit.type, label:unit.label||'Creature', scale:s,
    bodyWidth:unit.bodyWidth||5, hat:unit.hat||null, extra:unit.extra||null,
    isAlien, alienHeadShape:planet.alienHeadShape||'normal', alienExtra:planet.alienExtra||null,
    grounded:true, beingBeamed:false, collected:false, crying:false, panicLevel:0,
    walkDir:forceDir, walkTimer:0,
    color:(unit.colors&&unit.colors[0])||'#c44',
    skinColor:skinColor, ragdoll:false
  };
}

function animatePreviewPuppet(p, isCow, isVehicle){
  if(isVehicle) return; // static preview — sprite direction already set via vx sign
  p.walkTimer++;
  if(isCow){
    p.legAnim += 0.2;
    p.tailAnim += 0.1;
    return;
  }
  const s=p.scale||1;
  const wp=p.walkTimer*0.15;
  const lo=Math.sin(wp)*3*s, ro=Math.sin(wp+Math.PI)*3*s;
  p.legLX = -2*s + lo; p.legLY = p.bodyY + 8*s;
  p.legRX =  2*s + ro; p.legRY = p.bodyY + 8*s;
  p.footLX = p.legLX + lo*0.5; p.footLY = GROUND_LEVEL;
  p.footRX = p.legRX + ro*0.5; p.footRY = GROUND_LEVEL;
  const aw=Math.sin(wp+Math.PI)*2*s, ar=Math.sin(wp)*2*s;
  p.armLX = -6*s + aw; p.armLY = p.bodyY + 4*s;
  p.armRX =  6*s + ar; p.armRY = p.bodyY + 4*s;
}

// Draw a preview puppet anchored at (screenX, screenY) where screenY is the ground line.
function drawPreviewPuppetAt(p, isCow, screenX, screenY, isVehicle){
  ctx.save();
  ctx.translate(screenX, screenY - GROUND_LEVEL);
  if(isVehicle) renderVehicle(p);
  else if(isCow) renderCow(p);
  else renderHuman(p);
  ctx.restore();
}

// Debug arena: load the chosen planet, suppress ship/military, expose walking hotkeys.
function startDebugMode(planet){
  document.getElementById('start-screen').style.display='none';
  gameStarted=true; mainMenuMode=null;
  initWorld();
  const pdef=planets.find(p=>p.id===planet.id)||planet;
  loadPlanet(pdef);
  military=[]; wantedLevel=0; hazards=[];
  ship.x=worldWidth/2; ship.y=-8000; ship.vx=0; ship.vy=0;
  debugMode.active=true;
  debugMode.planetId=planet.id;
  debugMode.panX = planet.id==='earth' ? 1750 : worldWidth/4;
  debugMode.panY = GROUND_LEVEL - canvas.height*0.25;
  showMessage('DEBUG: hold F=walk right, B=walk left, X=stop, arrows=pan, ESC=menu');
  initTouchControls();
}

function updateDebug(){
  // Arrow keys pan camera (WASD still drives the hidden ship — intentional)
  const panSpeed=keys['shift']?30:12;
  if(keys['arrowleft'])debugMode.panX-=panSpeed;
  if(keys['arrowright'])debugMode.panX+=panSpeed;
  if(keys['arrowup'])debugMode.panY-=panSpeed;
  if(keys['arrowdown'])debugMode.panY+=panSpeed;
  // Keep camera inside the world so we only ever view real spawned units
  const halfW=canvas.width/2, halfH=canvas.height/2;
  debugMode.panX=Math.max(halfW,Math.min(worldWidth-halfW,debugMode.panX));
  debugMode.panY=Math.max(GROUND_LEVEL-canvas.height*0.75,Math.min(GROUND_LEVEL+200,debugMode.panY));
  // Camera override happens late in update — set it directly so normal camera logic doesn't win
  camera.x=debugMode.panX-canvas.width/2;
  camera.y=debugMode.panY-canvas.height/2;
  // Exit
  if(keys['escape']){keys['escape']=false;exitDebugMode();}
  // Keep hostiles/missions clear each frame
  military.length=0; wantedLevel=0;
}

function exitDebugMode(){
  debugMode.active=false;
  gameStarted=false;
  mainMenuMode='menu';
  mainMenuSel=0;
  // Reset arrays so a later real game start is clean
  humans=[]; cows=[]; vehicles=[]; military=[]; hazards=[]; particles=[]; speechBubbles=[];
  bloodPools=[]; gibs=[]; skidMarks=[]; bloodDroplets=[];
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
  // Hide logo in debug preview so both puppets are clearly visible.
  const hideLogo = mainMenuMode==='debugPreview' || mainMenuMode==='sandboxCaves' || mainMenuMode==='sandboxCaveWalk';
  // Fade logo out when leaving the main menu (e.g. after pressing NEW GAME); fade back in when returning.
  if(window._logoAlpha===undefined) window._logoAlpha=1;
  const targetAlpha = (mainMenuMode==='menu' && !hideLogo) ? 1 : 0;
  window._logoAlpha += (targetAlpha - window._logoAlpha) * 0.08;
  if(!hideLogo && window._logoAlpha>0.01){
    if(!window._logoImg){window._logoImg=new Image();window._logoImg.src='logo.png';}
    const li=window._logoImg;
    const la=window._logoAlpha;
    // Slight downward drift + scale shrink as it fades
    const driftY=(1-la)*18;
    const scaleF=0.94+la*0.06;
    ctx.save();
    ctx.globalAlpha=la;
    if(li.complete&&li.naturalWidth>0){
      const lh=Math.min(ch*0.42,360)*scaleF;
      const lw=lh*(li.naturalWidth/li.naturalHeight);
      ctx.shadowColor='#0f0';ctx.shadowBlur=(25+Math.sin(t*2)*10)*la;
      ctx.drawImage(li,cw/2-lw/2,titleY-lh+driftY,lw,lh);
    }
    // If the image hasn't loaded yet, show nothing (avoids a flash of placeholder text).
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
    items.push({label:'SETTINGS', action:'settings'});
    items.push({label:'DEBUG', action:'debug'});
    items.push({label:'CREDITS', action:'credits'});
    items.push({label:'EXIT', action:'exit'});
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
    ctx.fillText(window._mmNewGame?'NEW GAME — STEP 1 OF 3: CHOOSE YOUR RACE':'CHOOSE YOUR RACE',cw/2,ch*0.12);

    const cols=5, cardW=175, cardH=195, gap=14;
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
      drawAlienPreview(sx+cardW/2, sy+cardH*0.72, 2.2, previewSkin, 1, t*2+i);
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
    ctx.fillText((window._mmNewGame?'STEP 1b — ':'')+race.name.toUpperCase()+' VARIANTS',cw/2,ch*0.12);
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
    // --- Step 1: SHIP TYPE selector ---
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText(window._mmNewGame?'NEW GAME — STEP 2 OF 3: CHOOSE SHIP TYPE':'CHOOSE SHIP TYPE',cw/2,ch*0.12);

    const cols=5, cardW=Math.min(180, (cw-80)/5), cardH=170, gap=12;
    const rows=Math.ceil(SHIP_TYPES.length/cols);
    const totalW=cols*(cardW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.17;
    mainMenuSel=((mainMenuSel%SHIP_TYPES.length)+SHIP_TYPES.length)%SHIP_TYPES.length;
    SHIP_TYPES.forEach((st,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(cardW+gap), sy=startY+row*(cardH+gap);
      const sel=i===mainMenuSel;
      const variants=SHIP_PAINTS.filter(p=>(p.ship||'saucer')===st.id);
      const preview=variants[0]||SHIP_PAINTS[0];
      const isCur=(shipPaint.ship||'saucer')===st.id;
      ctx.fillStyle=sel?'rgba(0,50,20,0.85)':'rgba(0,15,5,0.6)';
      roundRect(ctx,sx,sy,cardW,cardH,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2.5;roundRect(ctx,sx,sy,cardW,cardH,8);ctx.stroke();}
      if(isCur){ctx.strokeStyle='rgba(255,215,0,0.7)';ctx.lineWidth=1.5;roundRect(ctx,sx+3,sy+3,cardW-6,cardH-6,6);ctx.stroke();}
      // Ship preview
      ctx.save();
      ctx.translate(sx+cardW/2, sy+cardH*0.48);
      ctx.scale(1.9,1.9);
      drawShipBody(preview.color, preview.accent, preview.trail, st.id);
      ctx.restore();
      // Type name
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.65)';
      ctx.font='bold 16px monospace';ctx.textAlign='center';
      ctx.fillText(st.name.toUpperCase(),sx+cardW/2,sy+cardH-32);
      // Description
      ctx.fillStyle='rgba(180,220,180,0.5)';ctx.font='10px monospace';
      ctx.fillText(st.description,sx+cardW/2,sy+cardH-14);
      // Variant count
      ctx.fillStyle='rgba(0,200,0,0.4)';ctx.font='9px monospace';
      ctx.fillText(variants.length+(variants.length===1?' VARIANT':' VARIANTS'),sx+cardW/2,sy+18);
      if(isCur){ctx.fillStyle='#fd0';ctx.font='14px monospace';ctx.fillText('\u2605',sx+cardW-14,sy+18);}
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('WASD/Arrows to browse  |  ENTER/SPACE to view variants  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='shipVariants'){
    // --- Step 2: VARIANT selector for the type drilled into ---
    const typeIdx=window._mmShipTypeIdx||0;
    const type=SHIP_TYPES[typeIdx]||SHIP_TYPES[0];
    const variants=SHIP_PAINTS.filter(p=>(p.ship||'saucer')===type.id);
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText((window._mmNewGame?'STEP 3 OF 3 — ':'')+type.name.toUpperCase()+' VARIANTS',cw/2,ch*0.12);
    ctx.fillStyle='rgba(180,220,180,0.5)';ctx.font='11px monospace';
    ctx.fillText(type.description,cw/2,ch*0.16);

    const cols=Math.min(variants.length,4), cardW=190, cardH=180, gap=16;
    const totalW=cols*(cardW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.22;
    mainMenuSel=((mainMenuSel%variants.length)+variants.length)%variants.length;
    variants.forEach((sp,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(cardW+gap), sy=startY+row*(cardH+gap);
      const sel=i===mainMenuSel;
      const isCur=shipPaint.name===sp.id;
      ctx.fillStyle=sel?'rgba(0,45,15,0.85)':'rgba(0,12,5,0.6)';
      roundRect(ctx,sx,sy,cardW,cardH,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2;roundRect(ctx,sx,sy,cardW,cardH,8);ctx.stroke();}
      if(isCur){ctx.strokeStyle='rgba(255,215,0,0.7)';ctx.lineWidth=1.5;roundRect(ctx,sx+3,sy+3,cardW-6,cardH-6,6);ctx.stroke();}
      ctx.save();
      ctx.translate(sx+cardW/2, sy+cardH*0.48);
      ctx.scale(1.8,1.8);
      drawShipBody(sp.color, sp.accent, sp.trail, sp.ship||'saucer');
      ctx.restore();
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.6)';
      ctx.font=sel?'bold 13px monospace':'12px monospace';ctx.textAlign='center';
      ctx.fillText(sp.name,sx+cardW/2,sy+cardH-24);
      if(sp.cost>0){ctx.fillStyle=sel?'#fd0':'rgba(200,200,0,0.45)';ctx.font='10px monospace';ctx.fillText(sp.cost+' pts',sx+cardW/2,sy+cardH-10);}
      else{ctx.fillStyle='rgba(0,200,0,0.35)';ctx.font='10px monospace';ctx.fillText('FREE',sx+cardW/2,sy+cardH-10);}
      if(isCur){ctx.fillStyle='#fd0';ctx.font='13px monospace';ctx.fillText('\u2605',sx+cardW-12,sy+16);}
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('A/D to browse  |  ENTER/SPACE to equip  |  ESC to back to types',cw/2,ch-20);
  }
  else if(mainMenuMode==='settings'){
    const ctxMode=window._mmSettingsCtx||'all';
    const filtered=KEY_ACTIONS.filter(a=>ctxMode==='all'||a.context==='both'||a.context===ctxMode);
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('SETTINGS — CONTROLS',cw/2,ch*0.07);
    ctx.fillStyle='rgba(180,220,180,0.5)';ctx.font='11px monospace';
    ctx.fillText('A/D: switch tab  |  W/S: select  |  ENTER: rebind  |  ESC: back',cw/2,ch*0.105);

    // Tabs: ALL / SHIP / ON-FOOT
    const tabs=[{id:'all',label:'ALL'},{id:'ship',label:'SHIP'},{id:'foot',label:'ON-FOOT'}];
    const tabW=110, tabH=26, tabGap=8;
    const tabsTotalW=tabs.length*tabW+(tabs.length-1)*tabGap;
    const tabsX0=cw/2-tabsTotalW/2, tabsY=ch*0.135;
    tabs.forEach((tb,ti)=>{
      const tx=tabsX0+ti*(tabW+tabGap);
      const active=tb.id===ctxMode;
      ctx.fillStyle=active?'rgba(0,90,30,0.85)':'rgba(0,20,8,0.6)';
      roundRect(ctx,tx,tabsY,tabW,tabH,6);ctx.fill();
      if(active){ctx.strokeStyle=`rgba(0,255,0,${0.55+Math.sin(t*4)*0.25})`;ctx.lineWidth=2;roundRect(ctx,tx,tabsY,tabW,tabH,6);ctx.stroke();}
      ctx.fillStyle=active?'#0f0':'rgba(0,200,0,0.55)';
      ctx.font='bold 12px monospace';ctx.textAlign='center';
      ctx.fillText(tb.label,tx+tabW/2,tabsY+17);
    });

    const rowH=26;
    const listTop=ch*0.20;
    const rowW=Math.min(520, cw-60);
    const rowX=cw/2-rowW/2;

    filtered.forEach((a,i)=>{
      const y=listTop+i*rowH;
      const sel=i===mainMenuSel;
      const awaiting=window._mmAwaitBind===a.id;
      ctx.fillStyle=sel?'rgba(0,60,20,0.85)':'rgba(0,15,5,0.45)';
      roundRect(ctx,rowX,y,rowW,rowH-4,5); ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.5+Math.sin(t*4)*0.25})`;ctx.lineWidth=1.5;roundRect(ctx,rowX,y,rowW,rowH-4,5);ctx.stroke();}
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.65)';
      ctx.font='13px monospace'; ctx.textAlign='left';
      ctx.fillText(a.label, rowX+14, y+16);
      // Context tag
      if(ctxMode==='all'){
        const tag=a.context==='ship'?'[SHIP]':a.context==='foot'?'[FOOT]':'[BOTH]';
        ctx.fillStyle='rgba(120,200,150,0.45)';ctx.font='10px monospace';
        ctx.fillText(tag, rowX+rowW*0.55, y+16);
      }
      // Current binding
      const bind=keyBindings[a.id]||a.canonical;
      const isDefault=bind===a.canonical;
      let bindLabel=awaiting?'PRESS ANY KEY...':keyLabel(bind);
      ctx.textAlign='right';
      ctx.font='bold 13px monospace';
      ctx.fillStyle=awaiting?`rgba(255,220,60,${0.6+Math.sin(t*8)*0.3})`:(isDefault?'rgba(180,220,180,0.75)':'#fd4');
      ctx.fillText(bindLabel, rowX+rowW-14, y+16);
    });
    // Reset + Back rows
    const resetI=filtered.length, backI=filtered.length+1;
    const resetY=listTop+resetI*rowH+6;
    const backY=listTop+backI*rowH+6;
    [['RESET TO DEFAULTS',resetI,resetY],['BACK',backI,backY]].forEach(([lbl,idx,yy])=>{
      const sel=idx===mainMenuSel;
      ctx.fillStyle=sel?'rgba(0,70,25,0.85)':'rgba(0,15,5,0.45)';
      roundRect(ctx,rowX,yy,rowW,rowH-4,5); ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.5+Math.sin(t*4)*0.25})`;ctx.lineWidth=1.5;roundRect(ctx,rowX,yy,rowW,rowH-4,5);ctx.stroke();}
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.65)';
      ctx.font='bold 13px monospace'; ctx.textAlign='center';
      ctx.fillText(lbl, cw/2, yy+17);
    });
  }
  else if(mainMenuMode==='credits'){
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 22px monospace';ctx.textAlign='center';
    ctx.fillText('CREDITS',cw/2,ch*0.08);

    const scroll=window._mmCreditsScroll||0;
    const y0=ch*0.16 - scroll;
    let y=y0;
    const section=(title)=>{
      ctx.fillStyle='rgba(0,255,0,0.75)';ctx.font='bold 15px monospace';ctx.textAlign='center';
      y+=18; ctx.fillText(title,cw/2,y); y+=6;
      ctx.strokeStyle='rgba(0,200,0,0.3)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cw/2-160,y);ctx.lineTo(cw/2+160,y);ctx.stroke();
      y+=14;
    };
    const line=(txt,opts)=>{
      const color=(opts&&opts.color)||'rgba(180,220,180,0.75)';
      const font=(opts&&opts.font)||'12px monospace';
      ctx.fillStyle=color; ctx.font=font; ctx.textAlign='center';
      ctx.fillText(txt,cw/2,y); y+=16;
    };

    section('GAME');
    line('SpaceShip — an alien abduction game',{color:'rgba(0,255,0,0.8)',font:'bold 13px monospace'});
    line('Code & design: Mikael Quick');
    line('Built with Claude Code');
    y+=8;

    section('SOUND & MUSIC');
    // Edit these entries to match the actual sources/licenses of your audio files.
    const credits=[
      {file:'alien-voice.mp3',         source:'TBD', author:'TBD', license:'TBD'},
      {file:'earth-music.mp3 / .wav',  source:'TBD', author:'TBD', license:'TBD'},
      {file:'eerie-music.mp3',         source:'TBD', author:'TBD', license:'TBD'},
      {file:'flame-sound.mp3',         source:'TBD', author:'TBD', license:'TBD'},
      {file:'missile-sfx.wav',         source:'TBD', author:'TBD', license:'TBD'},
      {file:'mothership-music.mp3',    source:'TBD', author:'TBD', license:'TBD'},
      {file:'nuke-sfx.flac',           source:'TBD', author:'TBD', license:'TBD'},
      {file:'space-ambience.mp3',      source:'TBD', author:'TBD', license:'TBD'},
      {file:'underwater-ambience.wav', source:'TBD', author:'TBD', license:'TBD'},
    ];
    credits.forEach(c=>{
      line(c.file,{color:'rgba(0,220,0,0.7)',font:'bold 12px monospace'});
      line(c.author+'  \u2014  '+c.source+'  ('+c.license+')',{color:'rgba(180,220,180,0.6)',font:'11px monospace'});
      y+=4;
    });

    section('THANKS');
    line('Everyone who panicked, fled, or got abducted along the way.');
    y+=20;

    // Footer hint
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('W/S or \u2191/\u2193 to scroll  |  ESC or ENTER to go back',cw/2,ch-20);
  }
  else if(mainMenuMode==='debug'){
    // Top-level debug menu
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('DEBUG',cw/2,ch*0.18);
    const items=[
      {label:'WORLD', sub:'Jump into any planet with any unit'},
      {label:'SANDBOX', sub:'Preview scenes, caves, and systems'},
      {label:'ALIEN SKINS', sub:'Pick your alien race and appearance'},
      {label:'SHIP SKINS', sub:'Pick your ship type and paint'},
    ];
    mainMenuSel=((mainMenuSel%items.length)+items.length)%items.length;
    const menuY=ch*0.42;
    const itemH=64;
    items.forEach((it,i)=>{
      const iy=menuY+i*itemH;
      const sel=i===mainMenuSel;
      ctx.fillStyle=sel?'rgba(0,60,20,0.85)':'rgba(0,20,8,0.6)';
      roundRect(ctx,cw/2-200,iy-20,400,52,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2.5;roundRect(ctx,cw/2-200,iy-20,400,52,8);ctx.stroke();}
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.6)';
      ctx.font=sel?'bold 20px monospace':'18px monospace';
      ctx.fillText(it.label,cw/2,iy+4);
      ctx.fillStyle=sel?'rgba(180,255,180,0.7)':'rgba(0,200,0,0.35)';
      ctx.font='11px monospace';
      ctx.fillText(it.sub,cw/2,iy+22);
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('W/S to select  |  ENTER/SPACE to open  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='sandbox'){
    // Sandbox submenu — for now just CAVES (room to grow)
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('SANDBOX',cw/2,ch*0.18);
    const items=[
      {label:'CAVES', sub:'Preview the three underwater caves'},
    ];
    mainMenuSel=((mainMenuSel%items.length)+items.length)%items.length;
    const menuY=ch*0.42;
    const itemH=64;
    items.forEach((it,i)=>{
      const iy=menuY+i*itemH;
      const sel=i===mainMenuSel;
      ctx.fillStyle=sel?'rgba(0,60,20,0.85)':'rgba(0,20,8,0.6)';
      roundRect(ctx,cw/2-200,iy-20,400,52,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2.5;roundRect(ctx,cw/2-200,iy-20,400,52,8);ctx.stroke();}
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.6)';
      ctx.font=sel?'bold 20px monospace':'18px monospace';
      ctx.fillText(it.label,cw/2,iy+4);
      ctx.fillStyle=sel?'rgba(180,255,180,0.7)':'rgba(0,200,0,0.35)';
      ctx.font='11px monospace';
      ctx.fillText(it.sub,cw/2,iy+22);
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('W/S to select  |  ENTER/SPACE to open  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='sandboxCaves'){
    // Show 3 cave previews side by side (crystals, bones, ruins)
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('CAVES',cw/2,ch*0.09);
    const caves=[
      {name:'THE CRYSTAL DEPTHS', type:'crystals', glow:'#4080ff', accent:'#60f0ff', desc:'Glowing blue crystal spires'},
      {name:'THE BONE TUNNELS',   type:'bones',    glow:'#ff4040', accent:'#ffaa60', desc:'Skeletal remains in red gloom'},
      {name:'THE SUNKEN KINGDOM', type:'ruins',    glow:'#ffd700', accent:'#80ff40', desc:'Golden ruins of an old people'},
      {name:'THE SUN PYRAMID',    type:'pyramid',  glow:'#ffaa40', accent:'#ffd880', desc:'Open tomb in the desert'},
    ];
    const cardW=Math.min(260,(cw-120)/caves.length), cardH=ch*0.62, gap=14;
    const totalW=caves.length*cardW+(caves.length-1)*gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.16;
    mainMenuSel=((mainMenuSel%caves.length)+caves.length)%caves.length;
    caves.forEach((c,i)=>{
      const sx=startX+i*(cardW+gap), sy=startY;
      const sel=i===mainMenuSel;
      // Card background
      ctx.fillStyle='#000';ctx.fillRect(sx,sy,cardW,cardH);
      ctx.save();
      ctx.beginPath();ctx.rect(sx+1,sy+1,cardW-2,cardH-2);ctx.clip();
      // === CAVE BACKGROUND ===
      // Deep rock gradient
      const bg=ctx.createLinearGradient(sx,sy,sx,sy+cardH);
      bg.addColorStop(0,'#0a0608');bg.addColorStop(0.5,'#1a1214');bg.addColorStop(1,'#080406');
      ctx.fillStyle=bg;ctx.fillRect(sx,sy,cardW,cardH);
      // Glow wash from accent color
      const gwash=ctx.createRadialGradient(sx+cardW/2,sy+cardH*0.6,0,sx+cardW/2,sy+cardH*0.6,cardW*0.9);
      gwash.addColorStop(0,c.glow+'33');gwash.addColorStop(1,'transparent');
      ctx.fillStyle=gwash;ctx.fillRect(sx,sy,cardW,cardH);
      // Ceiling silhouette (jagged)
      ctx.fillStyle='#060404';
      ctx.beginPath();ctx.moveTo(sx,sy);
      for(let px=0;px<=cardW;px+=16){
        const ny=sy+18+Math.abs(Math.sin(px*0.05+i*1.3))*22+Math.sin(px*0.2+i)*6;
        ctx.lineTo(sx+px,ny);
      }
      ctx.lineTo(sx+cardW,sy);ctx.closePath();ctx.fill();
      // Stalactites hanging
      for(let si=0;si<6;si++){
        const stx=sx+10+si*(cardW-20)/5+(i*7%8);
        const stLen=12+((si+i)%3)*8;
        const stBase=sy+20+Math.abs(Math.sin(stx*0.05+i*1.3))*22;
        ctx.fillStyle='#0a0808';
        ctx.beginPath();ctx.moveTo(stx-3,stBase);ctx.lineTo(stx+3,stBase);ctx.lineTo(stx,stBase+stLen);ctx.closePath();ctx.fill();
        // Drip
        if((si+i)%2===0){
          ctx.fillStyle=c.accent+'99';
          ctx.beginPath();ctx.arc(stx,stBase+stLen+2+Math.sin(t*2+si)*1,1.2,0,Math.PI*2);ctx.fill();
        }
      }
      // Floor silhouette
      const floorY=sy+cardH-28;
      ctx.fillStyle='#040202';
      ctx.beginPath();ctx.moveTo(sx,sy+cardH);
      for(let px=0;px<=cardW;px+=14){
        const ny=floorY-Math.abs(Math.sin(px*0.06+i*0.8))*14-Math.sin(px*0.18+i)*4;
        ctx.lineTo(sx+px,ny);
      }
      ctx.lineTo(sx+cardW,sy+cardH);ctx.closePath();ctx.fill();

      // === THEME-SPECIFIC CONTENT ===
      if(c.type==='crystals'){
        // Crystal spires growing up
        for(let ci=0;ci<7;ci++){
          const cx2=sx+20+ci*(cardW-40)/6;
          const cy2=floorY-Math.abs(Math.sin(cx2*0.06+i*0.8))*10;
          const ch2=20+((ci*7)%4)*9;
          const cw2=6+((ci*3)%3)*2;
          const hue=200+ci*8;
          const cg=ctx.createLinearGradient(cx2,cy2,cx2,cy2-ch2);
          cg.addColorStop(0,`hsla(${hue},90%,45%,0.95)`);
          cg.addColorStop(1,`hsla(${hue},95%,75%,0.95)`);
          ctx.fillStyle=cg;
          ctx.beginPath();ctx.moveTo(cx2-cw2,cy2);ctx.lineTo(cx2,cy2-ch2);ctx.lineTo(cx2+cw2,cy2);ctx.closePath();ctx.fill();
          // Facet line
          ctx.strokeStyle=`hsla(${hue},100%,90%,0.7)`;ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(cx2,cy2);ctx.lineTo(cx2,cy2-ch2);ctx.stroke();
          // Glow
          const glow=ctx.createRadialGradient(cx2,cy2-ch2/2,0,cx2,cy2-ch2/2,18);
          glow.addColorStop(0,`hsla(${hue},100%,70%,${0.35+Math.sin(t*3+ci)*0.1})`);
          glow.addColorStop(1,'transparent');
          ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx2,cy2-ch2/2,18,0,Math.PI*2);ctx.fill();
        }
        // Floating sparkles
        for(let pi=0;pi<14;pi++){
          const px=sx+10+((pi*41+t*15)%(cardW-20));
          const py=sy+40+((pi*29)%(cardH-80));
          ctx.fillStyle=`rgba(150,220,255,${0.4+Math.sin(t*3+pi)*0.3})`;
          ctx.fillRect(px,py,1.5,1.5);
        }
      } else if(c.type==='bones'){
        // Scattered bones on the floor
        for(let bi=0;bi<8;bi++){
          const bx=sx+14+bi*(cardW-28)/7;
          const by=floorY-2-Math.abs(Math.sin(bx*0.06+i*0.8))*10;
          const bl=14+((bi*5)%4)*3;
          ctx.strokeStyle='#ddd8c8';ctx.lineWidth=2.5;
          ctx.lineCap='round';
          const ang=(bi%3-1)*0.4;
          ctx.beginPath();
          ctx.moveTo(bx-Math.cos(ang)*bl/2,by-Math.sin(ang)*bl/2);
          ctx.lineTo(bx+Math.cos(ang)*bl/2,by+Math.sin(ang)*bl/2);
          ctx.stroke();
          // Bone ends
          ctx.fillStyle='#e8e2d0';
          ctx.beginPath();ctx.arc(bx-Math.cos(ang)*bl/2,by-Math.sin(ang)*bl/2,2,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(bx+Math.cos(ang)*bl/2,by+Math.sin(ang)*bl/2,2,0,Math.PI*2);ctx.fill();
        }
        // Big skull centerpiece
        const skx=sx+cardW/2, sky=floorY-22;
        ctx.fillStyle='#e8e2d0';
        ctx.beginPath();ctx.arc(skx,sky,14,0,Math.PI*2);ctx.fill();
        ctx.fillRect(skx-8,sky+8,16,10);
        // Eye sockets
        ctx.fillStyle='#000';
        ctx.beginPath();ctx.arc(skx-5,sky-2,3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(skx+5,sky-2,3,0,Math.PI*2);ctx.fill();
        // Red glow inside eyes
        ctx.fillStyle=`rgba(255,60,60,${0.5+Math.sin(t*3)*0.3})`;
        ctx.beginPath();ctx.arc(skx-5,sky-2,1.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(skx+5,sky-2,1.5,0,Math.PI*2);ctx.fill();
        // Nose
        ctx.fillStyle='#000';
        ctx.beginPath();ctx.moveTo(skx,sky+2);ctx.lineTo(skx-2,sky+6);ctx.lineTo(skx+2,sky+6);ctx.closePath();ctx.fill();
        // Teeth
        for(let ti=0;ti<5;ti++){ctx.fillRect(skx-7+ti*3,sky+13,2,4);}
        // Embers drifting
        for(let ei=0;ei<8;ei++){
          const ex=sx+10+((ei*53+t*12)%(cardW-20));
          const ey=sy+cardH-30-((ei*37+t*20)%(cardH-60));
          ctx.fillStyle=`rgba(255,${100+ei*10},60,${0.6+Math.sin(t*4+ei)*0.3})`;
          ctx.fillRect(ex,ey,1.5,1.5);
        }
      } else if(c.type==='ruins'){
        // Ancient columns
        for(let ci=0;ci<4;ci++){
          const cx2=sx+30+ci*(cardW-60)/3;
          const colH=50+((ci*7)%3)*10;
          const baseY=floorY-2;
          // Broken top marker
          const broken=ci%2===0;
          const topY=baseY-(broken?colH*0.7:colH);
          // Column body
          ctx.fillStyle='#b09060';
          ctx.fillRect(cx2-5,topY,10,baseY-topY);
          // Fluting
          ctx.strokeStyle='#8a6838';ctx.lineWidth=0.8;
          for(let fi=-1;fi<=1;fi++){
            ctx.beginPath();ctx.moveTo(cx2+fi*2.5,topY);ctx.lineTo(cx2+fi*2.5,baseY);ctx.stroke();
          }
          // Base
          ctx.fillStyle='#8a6838';ctx.fillRect(cx2-7,baseY-4,14,4);
          // Capital (or broken)
          if(!broken){
            ctx.fillStyle='#c8a070';ctx.fillRect(cx2-7,topY-4,14,4);
            ctx.fillRect(cx2-8,topY-7,16,3);
          } else {
            // Jagged break
            ctx.fillStyle='#6a4828';
            ctx.beginPath();
            ctx.moveTo(cx2-5,topY);
            ctx.lineTo(cx2-3,topY-3);ctx.lineTo(cx2,topY+1);ctx.lineTo(cx2+3,topY-2);ctx.lineTo(cx2+5,topY);
            ctx.closePath();ctx.fill();
          }
        }
        // Gold coins / treasure scatter
        for(let gi=0;gi<10;gi++){
          const gx=sx+14+gi*(cardW-28)/9;
          const gy=floorY-2-Math.abs(Math.sin(gx*0.06+i*0.8))*10;
          ctx.fillStyle='#ffd700';
          ctx.beginPath();ctx.ellipse(gx,gy,3,1.5,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#ffee88';
          ctx.beginPath();ctx.ellipse(gx,gy-0.5,1.5,0.8,0,0,Math.PI*2);ctx.fill();
        }
        // Floating motes
        for(let pi=0;pi<10;pi++){
          const px=sx+10+((pi*41+t*8)%(cardW-20));
          const py=sy+40+((pi*29+t*6)%(cardH-80));
          ctx.fillStyle=`rgba(255,220,120,${0.4+Math.sin(t*2+pi)*0.3})`;
          ctx.fillRect(px,py,1.3,1.3);
        }
        // Fallen statue piece (rubble)
        ctx.fillStyle='#9c7848';
        ctx.fillRect(sx+cardW*0.6, floorY-8, 18, 6);
        ctx.fillRect(sx+cardW*0.62, floorY-13, 10, 5);
      } else if(c.type==='pyramid'){
        // Sky wash repaint (overrides cave bg for exterior feel)
        const sky=ctx.createLinearGradient(sx,sy,sx,floorY);
        sky.addColorStop(0,'#1a2a48');
        sky.addColorStop(0.6,'#6a5038');
        sky.addColorStop(1,'#b08858');
        ctx.fillStyle=sky;ctx.fillRect(sx,sy+2,cardW,floorY-sy);
        // Sun
        const sunX=sx+cardW*0.8, sunY=sy+cardH*0.25;
        const sunG=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,40);
        sunG.addColorStop(0,'rgba(255,230,160,0.9)');sunG.addColorStop(1,'transparent');
        ctx.fillStyle=sunG;ctx.fillRect(sx,sy,cardW,cardH);
        ctx.fillStyle='#ffd880';ctx.beginPath();ctx.arc(sunX,sunY,10,0,Math.PI*2);ctx.fill();
        // Sand floor
        ctx.fillStyle='#d0a868';ctx.fillRect(sx,floorY,cardW,sy+cardH-floorY);
        ctx.fillStyle='rgba(100,70,40,0.35)';
        for(let di=0;di<5;di++){ctx.beginPath();ctx.ellipse(sx+di*cardW/4,floorY+6+(di%2)*3,20,3,0,0,Math.PI*2);ctx.fill();}
        // Pyramid silhouette (stepped)
        const pcx=sx+cardW*0.38, pBase=floorY, pH=cardH*0.58;
        const pW=cardW*0.55;
        // Back shadow pyramid
        ctx.fillStyle='#6a4828';
        ctx.beginPath();ctx.moveTo(pcx-pW/2,pBase);ctx.lineTo(pcx,pBase-pH);ctx.lineTo(pcx+pW/2,pBase);ctx.closePath();ctx.fill();
        // Lit face
        ctx.fillStyle='#d8a858';
        ctx.beginPath();ctx.moveTo(pcx-pW/2,pBase);ctx.lineTo(pcx,pBase-pH);ctx.lineTo(pcx,pBase);ctx.closePath();ctx.fill();
        // Stepped blocks
        ctx.strokeStyle='rgba(50,30,10,0.5)';ctx.lineWidth=0.8;
        const steps=9;
        for(let si=1;si<steps;si++){
          const ty=pBase-(pH*si/steps);
          const hw=pW/2*(1-si/steps);
          ctx.beginPath();ctx.moveTo(pcx-hw,ty);ctx.lineTo(pcx+hw,ty);ctx.stroke();
        }
        // Dark entrance door
        const doorW=pW*0.14, doorH=pH*0.22;
        ctx.fillStyle='#0a0604';
        ctx.fillRect(pcx-doorW/2, pBase-doorH, doorW, doorH);
        // Door frame (sandstone blocks)
        ctx.strokeStyle='#805830';ctx.lineWidth=1.5;
        ctx.strokeRect(pcx-doorW/2, pBase-doorH, doorW, doorH);
        // Glyphs
        ctx.fillStyle='rgba(200,150,80,0.7)';ctx.font='bold 6px monospace';ctx.textAlign='center';
        ctx.fillText('\u2600', pcx, pBase-doorH-4);
        // Palm tree bit
        const pxx=sx+cardW*0.82, pyy=floorY;
        ctx.strokeStyle='#6a4a28';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(pxx,pyy);ctx.lineTo(pxx-2,pyy-24);ctx.stroke();
        ctx.fillStyle='#3a6828';
        for(let fi=0;fi<5;fi++){
          const fa=-Math.PI/2+(fi-2)*0.4;
          ctx.beginPath();ctx.ellipse(pxx-2+Math.cos(fa)*8,pyy-24+Math.sin(fa)*4,9,3,fa,0,Math.PI*2);ctx.fill();
        }
        // Heat shimmer / dust motes
        for(let pi=0;pi<10;pi++){
          const dx=sx+10+((pi*53+t*20)%(cardW-20));
          const dy=floorY-((pi*31+t*15)%(cardH*0.5));
          ctx.fillStyle=`rgba(255,220,160,${0.3+Math.sin(t*3+pi)*0.2})`;
          ctx.fillRect(dx,dy,1.2,1.2);
        }
      }
      // Vignette
      const vg=ctx.createRadialGradient(sx+cardW/2,sy+cardH/2,Math.min(cardW,cardH)*0.3,sx+cardW/2,sy+cardH/2,Math.max(cardW,cardH)*0.7);
      vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.6)');
      ctx.fillStyle=vg;ctx.fillRect(sx,sy,cardW,cardH);
      ctx.restore();
      // Frame
      ctx.strokeStyle=sel?`rgba(0,255,0,${0.75+Math.sin(t*4)*0.2})`:'rgba(0,120,0,0.4)';
      ctx.lineWidth=sel?3:1.5;
      ctx.strokeRect(sx,sy,cardW,cardH);
      // Accent bar (color of cave)
      ctx.fillStyle=c.glow;ctx.fillRect(sx,sy,cardW,3);
      // Name plate
      ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(sx,sy+cardH-42,cardW,42);
      ctx.fillStyle=sel?'#0f0':c.accent;
      ctx.font='bold 13px monospace';ctx.textAlign='center';
      ctx.fillText(c.name,sx+cardW/2,sy+cardH-24);
      ctx.fillStyle='rgba(200,220,200,0.55)';ctx.font='10px monospace';
      ctx.fillText(c.desc,sx+cardW/2,sy+cardH-10);
    });
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('A/D to browse  |  ENTER to walk in  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='sandboxCaveWalk' && caveWalkState){
    const cs=caveWalkState;
    const caves=[
      {name:'THE CRYSTAL DEPTHS', type:'crystals', glow:'#4080ff', accent:'#60f0ff'},
      {name:'THE BONE TUNNELS',   type:'bones',    glow:'#ff4040', accent:'#ffaa60'},
      {name:'THE SUNKEN KINGDOM', type:'ruins',    glow:'#ffd700', accent:'#80ff40'},
      {name:'THE SUN PYRAMID',    type:'pyramid',  glow:'#ffaa40', accent:'#ffd880'},
    ];
    const c=caves[cs.caveIdx]||caves[0];
    const a=cs.alien;
    const floorY=ch*0.78;
    const ceilY=ch*0.18;
    const entryX=280; // world-x of the cave mouth center
    // Camera follows alien
    const camX=Math.max(0,Math.min(cs.worldW-cw, a.x-cw/2));
    const outside = false; // always render interior view — exterior looked weird
    // Mouth geometry (world-space) — organic irregular opening
    const mouthHalfW=78;         // half-width of mouth opening at floor
    const mouthTopY=ceilY+36;    // how high the mouth apex reaches
    const mouthBotY=floorY;
    // Build irregular mouth outline once per frame (deterministic on index)
    // Points go from floor-left, up over the apex, back down to floor-right
    const mouthPtsWorld=[];
    {
      const N=28;
      for(let i=0;i<=N;i++){
        const tt=i/N;
        const ang=Math.PI*(1-tt); // left (PI) -> top (PI/2) -> right (0)
        const rx=Math.cos(ang)*mouthHalfW;
        const ry=-Math.sin(ang)*(mouthBotY-mouthTopY);
        // Deterministic roughness (doesn't shimmer per-frame)
        const s=i*131;
        const noise=Math.sin(s*0.7)*3 + Math.sin(s*1.3+1.1)*2 + ((s*17)%5);
        const nx=Math.cos(ang+1.57)*noise*0.4;
        const ny=Math.sin(ang+1.57)*noise*0.5;
        // Slight asymmetry so it doesn't look like a perfect arch
        const asymX = (tt-0.5)*6*Math.sin(i*0.4);
        mouthPtsWorld.push([entryX+rx+nx+asymX, mouthBotY+ry+ny]);
      }
    }
    // Helper to trace outline in screen space (camera-adjusted)
    function traceMouth(){
      for(let i=0;i<mouthPtsWorld.length;i++){
        const p=mouthPtsWorld[i];
        const sx=p[0]-camX, sy=p[1];
        if(i===0)ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
      }
    }

    const pyramidOutside = (c.type==='pyramid' && !cs.entered);
    if(pyramidOutside){
      // === DESERT SKY ===
      const sky=ctx.createLinearGradient(0,0,0,floorY);
      sky.addColorStop(0,'#1a2a48');
      sky.addColorStop(0.55,'#6a5038');
      sky.addColorStop(1,'#b08858');
      ctx.fillStyle=sky;ctx.fillRect(0,0,cw,floorY);
      // Sun with halo
      const sunX=cw*0.85-camX*0.1, sunY=ch*0.22;
      const halo=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,160);
      halo.addColorStop(0,'rgba(255,230,160,0.5)');halo.addColorStop(1,'transparent');
      ctx.fillStyle=halo;ctx.fillRect(0,0,cw,floorY);
      ctx.fillStyle='#ffe8a0';ctx.beginPath();ctx.arc(sunX,sunY,24,0,Math.PI*2);ctx.fill();
      // Distant dune silhouettes (parallax)
      ctx.fillStyle='#8a6838';
      for(let dn=0;dn<6;dn++){
        const dx0=((dn*400 - camX*0.3)%(cw+400)+cw+400)%(cw+400)-200;
        ctx.beginPath();ctx.moveTo(dx0-60, floorY);
        for(let px=-60;px<=260;px+=10){
          ctx.lineTo(dx0+px, floorY-20-Math.abs(Math.sin(px*0.02+dn))*26);
        }
        ctx.lineTo(dx0+260, floorY);ctx.closePath();ctx.fill();
      }
      ctx.fillStyle='#6a4a28';
      for(let dn=0;dn<5;dn++){
        const dx0=((dn*320+160 - camX*0.5)%(cw+320)+cw+320)%(cw+320)-160;
        ctx.beginPath();ctx.moveTo(dx0-60, floorY);
        for(let px=-60;px<=220;px+=10){
          ctx.lineTo(dx0+px, floorY-10-Math.abs(Math.sin(px*0.03+dn*1.7))*16);
        }
        ctx.lineTo(dx0+220, floorY);ctx.closePath();ctx.fill();
      }

      // === THE PYRAMID (world-space around entryX) ===
      const pBaseY=floorY;
      const pH=ch*0.64;
      const pW=cw*0.9;
      const pcxW=entryX; // center in world coords
      const pcx=pcxW-camX;
      // Back shadow pyramid (darker receding face)
      ctx.fillStyle='#5a3e1e';
      ctx.beginPath();ctx.moveTo(pcx-pW/2,pBaseY);ctx.lineTo(pcx,pBaseY-pH);ctx.lineTo(pcx+pW/2,pBaseY);ctx.closePath();ctx.fill();
      // Lit front-left face
      ctx.fillStyle='#d8a858';
      ctx.beginPath();ctx.moveTo(pcx-pW/2,pBaseY);ctx.lineTo(pcx,pBaseY-pH);ctx.lineTo(pcx,pBaseY);ctx.closePath();ctx.fill();
      // Stepped block tiers across the full pyramid
      const tiers=14;
      for(let ti=1;ti<tiers;ti++){
        const ty=pBaseY-(pH*ti/tiers);
        const hw=(pW/2)*(1-ti/tiers);
        // Horizontal band
        ctx.strokeStyle='rgba(60,36,14,0.55)';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(pcx-hw,ty);ctx.lineTo(pcx+hw,ty);ctx.stroke();
        // Vertical block seams
        ctx.strokeStyle='rgba(60,36,14,0.25)';ctx.lineWidth=0.8;
        const nb=Math.max(3,Math.floor(hw/18));
        for(let bi=-nb;bi<=nb;bi++){
          const bx=pcx+bi*(hw/nb);
          const byTop=ty;
          const byBot=pBaseY-(pH*(ti-1)/tiers);
          ctx.beginPath();ctx.moveTo(bx,byTop);ctx.lineTo(bx,byBot);ctx.stroke();
        }
      }
      // Capstone highlight
      ctx.fillStyle='#ffd880';
      ctx.beginPath();ctx.moveTo(pcx-8,pBaseY-pH+18);ctx.lineTo(pcx,pBaseY-pH);ctx.lineTo(pcx+8,pBaseY-pH+18);ctx.closePath();ctx.fill();

      // === DOOR (open tomb entrance) ===
      const doorW=90, doorH=150;
      const doorLeft=pcx-doorW/2, doorTop=pBaseY-doorH;
      // Dark doorway interior
      ctx.fillStyle='#050302';
      ctx.fillRect(doorLeft, doorTop, doorW, doorH);
      // Inner glow (torchlight peeking out)
      const dg=ctx.createRadialGradient(pcx, pBaseY-doorH*0.4, 2, pcx, pBaseY-doorH*0.4, doorW*1.1);
      dg.addColorStop(0,'rgba(255,170,60,0.55)');
      dg.addColorStop(0.6,'rgba(180,80,20,0.25)');
      dg.addColorStop(1,'transparent');
      ctx.fillStyle=dg;ctx.fillRect(doorLeft-20, doorTop-20, doorW+40, doorH+40);
      // Carved stone frame (sandstone blocks)
      ctx.fillStyle='#b88860';
      ctx.fillRect(doorLeft-10, doorTop-10, 10, doorH+20); // left frame
      ctx.fillRect(doorLeft+doorW, doorTop-10, 10, doorH+20); // right frame
      ctx.fillRect(doorLeft-10, doorTop-10, doorW+20, 12); // lintel
      // Block lines on frame
      ctx.strokeStyle='rgba(60,36,14,0.55)';ctx.lineWidth=1;
      for(let fy=doorTop-10;fy<pBaseY;fy+=18){
        ctx.beginPath();ctx.moveTo(doorLeft-10,fy);ctx.lineTo(doorLeft,fy);ctx.stroke();
        ctx.beginPath();ctx.moveTo(doorLeft+doorW,fy);ctx.lineTo(doorLeft+doorW+10,fy);ctx.stroke();
      }
      // Hieroglyphs above the door
      ctx.fillStyle='#6a4420';ctx.font='bold 16px monospace';ctx.textAlign='center';
      ctx.fillText('\u2600 \u25B2 \u2736 \u25B2 \u2600', pcx, doorTop-18);

      // === SAND FLOOR ===
      ctx.fillStyle='#d0a868';
      ctx.fillRect(0,floorY,cw,ch-floorY);
      ctx.fillStyle='rgba(100,70,40,0.35)';
      for(let ri=0;ri<30;ri++){
        const rx=((ri*73 - camX*0.7)%cw+cw)%cw;
        const ry=floorY+3+(ri%5)*3;
        ctx.fillRect(rx,ry,2,1);
      }
      // Ripple lines
      ctx.strokeStyle='rgba(140,100,60,0.25)';ctx.lineWidth=1;
      for(let ri=0;ri<5;ri++){
        const ry=floorY+6+ri*8;
        ctx.beginPath();
        for(let rx=0;rx<=cw;rx+=10){ctx.lineTo(rx,ry+Math.sin((rx+ri*30)*0.05)*1.5);}
        ctx.stroke();
      }
      // Small rocks scattered
      ctx.fillStyle='#8a6838';
      for(let ri=0;ri<12;ri++){
        const rwx=ri*280+40;
        const rsx=rwx-camX;
        if(rsx<-30||rsx>cw+30)continue;
        if(Math.abs(rwx-entryX)<pW/2)continue;
        ctx.beginPath();ctx.ellipse(rsx,floorY+4+(ri%3)*2,6+(ri%3)*2,2.5,0,0,Math.PI*2);ctx.fill();
      }
      // Bones / skeleton near the door (tomb vibes)
      {
        const bx=pcx+pW*0.32, by=floorY-2;
        if(bx>-40&&bx<cw+40){
          ctx.strokeStyle='#e0d6b8';ctx.lineWidth=2;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(bx-10,by);ctx.lineTo(bx+10,by-1);ctx.stroke();
          ctx.fillStyle='#e8dcb8';
          ctx.beginPath();ctx.arc(bx+14,by-4,4,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#000';
          ctx.beginPath();ctx.arc(bx+13,by-5,0.9,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(bx+15.5,by-5,0.9,0,Math.PI*2);ctx.fill();
        }
      }
      // Heat shimmer motes
      for(let pi=0;pi<18;pi++){
        const dx=((pi*91+t*15)%(cw+60))-30;
        const dy=floorY-((pi*47+t*11)%120);
        ctx.fillStyle=`rgba(255,220,160,${0.25+Math.sin(t*3+pi)*0.15})`;
        ctx.fillRect(dx,dy,1.2,1.2);
      }

      // === PLAYER ALIEN (desert) ===
      const ax=a.x-camX, ay=pBaseY+a.y;
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.beginPath();ctx.ellipse(ax,pBaseY+2,14,3,0,0,Math.PI*2);ctx.fill();
      drawAlienPreview(ax, ay, 1.0, getAlienSkin(), a.facing, a.walkT);

      // Enter prompt when near door
      if(Math.abs(a.x-entryX)<70){
        const px=pcx, py=doorTop-48;
        const pulse=0.75+Math.sin(t*4)*0.25;
        ctx.fillStyle=`rgba(0,0,0,${0.6*pulse})`;
        ctx.fillRect(px-82,py-14,164,22);
        ctx.strokeStyle=`rgba(255,220,140,${pulse})`;ctx.lineWidth=1.5;
        ctx.strokeRect(px-82,py-14,164,22);
        ctx.fillStyle=`rgba(255,230,160,${pulse})`;
        ctx.font='bold 12px monospace';ctx.textAlign='center';
        ctx.fillText('[ENTER] ENTER THE TOMB', px, py+2);
      }

      // HUD
      ctx.fillStyle=c.accent;ctx.font='bold 14px monospace';ctx.textAlign='left';
      ctx.fillText(c.name,20,30);
      ctx.fillStyle='rgba(240,220,180,0.6)';ctx.font='10px monospace';
      ctx.fillText('(outside — desert)', 20,46);
      ctx.fillStyle='rgba(0,200,0,0.5)';ctx.font='11px monospace';ctx.textAlign='center';
      ctx.fillText('A/D: Walk   SPACE/W: Jump   ENTER: Enter tomb   ESC: Back',cw/2,ch-16);
    } else { // === NORMAL CAVE RENDER (non-pyramid or pyramid-entered) ===
    if(outside){
      // === 1. OUTSIDE SCENE — water background (only when alien hasn't entered) ===
      const waterG=ctx.createLinearGradient(0,0,0,floorY);
      waterG.addColorStop(0,'#041020');waterG.addColorStop(1,'#0b2038');
      ctx.fillStyle=waterG;ctx.fillRect(0,0,cw,floorY);
      // Water caustic lines
      for(let i=0;i<10;i++){
        const wy=((i*41+t*20)%(floorY));
        ctx.fillStyle=`rgba(120,180,220,${0.06+Math.sin(t+i)*0.03})`;
        ctx.fillRect(0,wy,cw,1);
      }
      // Bubbles rising outside (only in the outside half of the screen)
      for(let bi=0;bi<10;bi++){
        const bwx=(bi*133)%Math.max(100,entryX-40);
        const bsx=bwx-camX;
        if(bsx<-10||bsx>cw)continue;
        const by=floorY-((t*30+bi*50)%floorY);
        ctx.fillStyle=`rgba(180,220,255,${0.4+Math.sin(t*2+bi)*0.2})`;
        ctx.beginPath();ctx.arc(bsx,by,1.5+bi%2,0,Math.PI*2);ctx.fill();
      }
      // Distant seabed rocks outside
      for(let ri=0;ri<5;ri++){
        const rwx=ri*70-30;
        const rsx=rwx-camX;
        if(rsx<-40||rsx>entryX-camX-10)continue;
        ctx.fillStyle='#1a1612';
        ctx.beginPath();ctx.ellipse(rsx,floorY-3,12+ri*2,5,0,0,Math.PI*2);ctx.fill();
      }
    } else {
      // === 1b. INSIDE SCENE — pitch black cave fills the screen ===
      ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
    }

    // === 2. CAVE INTERIOR ===
    const mx=entryX-camX; // screen-x of cave mouth center
    ctx.save();
    if(outside){
      // Alien hasn't entered — cave interior must be hidden. Clip to mouth area and
      // paint pitch black so the mouth reads as an unknown dark hole.
      ctx.beginPath();
      traceMouth();
      for(let px=mx+mouthHalfW;px<=cw+80;px+=14){
        const wx=px+camX;
        const ny=ceilY+Math.abs(Math.sin(wx*0.04))*30+Math.sin(wx*0.15)*8;
        ctx.lineTo(px,ny);
      }
      ctx.lineTo(cw+80, mouthBotY);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
    } else {
      // Alien is inside — paint cave interior covering the entire canvas (no mouth clip).
      // Interior dark background
      const bg=ctx.createLinearGradient(0,ceilY,0,floorY);
      bg.addColorStop(0,'#0a0608');bg.addColorStop(0.5,'#1a1214');bg.addColorStop(1,'#060406');
      ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);
      // Accent glow deeper inside
      const deepGlowX=Math.max(mx+220,cw*0.55);
      const gw=ctx.createRadialGradient(deepGlowX,ch*0.55,0,deepGlowX,ch*0.55,cw*0.9);
      gw.addColorStop(0,c.glow+'33');gw.addColorStop(1,'transparent');
      ctx.fillStyle=gw;ctx.fillRect(0,0,cw,ch);
      // Cave ceiling rocks (interior only — already clipped)
      ctx.fillStyle='#050303';
      ctx.beginPath();ctx.moveTo(mx-mouthHalfW-2,0);
      for(let px=Math.max(0,mx-mouthHalfW);px<=cw+20;px+=10){
        const wx=px+camX;
        const ny=ceilY+Math.abs(Math.sin(wx*0.04))*30+Math.sin(wx*0.15)*8;
        ctx.lineTo(px,ny);
      }
      ctx.lineTo(cw+20,0);ctx.closePath();ctx.fill();
      // Stalactites inside
      for(let si=0;si<40;si++){
        const swx=entryX+30+si*90+((si*17)%40);
        if(swx<camX-40||swx>camX+cw+40)continue;
        const sx=swx-camX;
        const baseY=ceilY+Math.abs(Math.sin(swx*0.04))*30;
        const len=14+((si*7)%4)*7;
        ctx.fillStyle='#0a0604';
        ctx.beginPath();ctx.moveTo(sx-4,baseY);ctx.lineTo(sx+4,baseY);ctx.lineTo(sx,baseY+len);ctx.closePath();ctx.fill();
        // Drip
        if((si+((t*2)|0))%5===0){
          ctx.fillStyle=c.accent+'aa';
          ctx.beginPath();ctx.arc(sx,baseY+len+3+Math.sin(t*2+si)*1,1.2,0,Math.PI*2);ctx.fill();
        }
      }
      // Interior rocky floor
      ctx.fillStyle='#0a0604';ctx.fillRect(0,floorY,cw,ch-floorY);
      ctx.fillStyle='#1a0f08';
      for(let bx=Math.floor(camX/50)*50;bx<camX+cw+50;bx+=50){
        const sx=bx-camX;
        const bh=4+((bx*13)%8);
        ctx.beginPath();ctx.moveTo(sx,floorY);ctx.lineTo(sx+20,floorY-bh);ctx.lineTo(sx+40,floorY);ctx.closePath();ctx.fill();
      }
      // Dust motes drifting inside
      for(let di=0;di<16;di++){
        const dwx=entryX+80+((di*97+t*12)%(cs.worldW-entryX-100));
        const dsx=dwx-camX;
        if(dsx<-10||dsx>cw+10)continue;
        const dy=ceilY+50+((di*43+t*6)%(floorY-ceilY-80));
        ctx.fillStyle=`rgba(220,200,160,${0.2+Math.sin(t*1.5+di)*0.15})`;
        ctx.fillRect(dsx,dy,1.2,1.2);
      }
    }
    ctx.restore();

    if(outside){
      // === 3. SEABED FLOOR (sand outside the cave) ===
      ctx.save();
      ctx.beginPath();
      ctx.rect(0,floorY,cw,ch-floorY);
      ctx.clip();
      ctx.fillStyle='#2a2018';ctx.fillRect(0,floorY,cw,ch-floorY);
      ctx.fillStyle='rgba(80,70,50,0.4)';
      for(let i=0;i<60;i++){
        const px=((i*37-camX*0.5)%cw+cw)%cw;
        const py=floorY+2+(i%5)*3;
        ctx.fillRect(px,py,2,1);
      }
      ctx.strokeStyle='rgba(120,100,70,0.25)';ctx.lineWidth=1;
      for(let i=0;i<6;i++){
        const ry=floorY+4+i*6;
        ctx.beginPath();
        for(let rx=0;rx<=cw;rx+=10){ctx.lineTo(rx,ry+Math.sin(rx*0.05+i)*1.5);}
        ctx.stroke();
      }
      ctx.restore();
      // Re-paint cave interior floor where it pokes through the mouth
      ctx.save();
      ctx.beginPath();
      traceMouth();
      ctx.lineTo(cw+80, mouthTopY);
      ctx.lineTo(cw+80, ch);
      ctx.lineTo(mx-mouthHalfW, ch);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle='#000';ctx.fillRect(0,floorY,cw,ch-floorY);
      ctx.restore();
    } else {
      // Inside: cave floor fills the whole bottom
      ctx.fillStyle='#0a0604';ctx.fillRect(0,floorY,cw,ch-floorY);
      ctx.fillStyle='#1a0f08';
      for(let bx=Math.floor(camX/50)*50;bx<camX+cw+50;bx+=50){
        const sx=bx-camX;
        const bh=4+((bx*13)%8);
        ctx.beginPath();ctx.moveTo(sx,floorY);ctx.lineTo(sx+20,floorY-bh);ctx.lineTo(sx+40,floorY);ctx.closePath();ctx.fill();
      }
    }

    // === 4. CLIFF ROCK FACE — only render the cliff/mouth from OUTSIDE ===
    // Once the alien walks into the mouth, the outside world (cliff, mouth decorations) is hidden.
    if(outside && mx>-200 && mx<cw+200){
      // --- Deep inner shadow — paint a black pool just inside the mouth so the opening
      //     reads as a dark hole rather than a flat cutout ---
      ctx.save();
      ctx.beginPath();traceMouth();ctx.closePath();ctx.clip();
      const innerShade=ctx.createRadialGradient(mx,mouthBotY-20,2,mx,mouthBotY-20,mouthHalfW*1.6);
      innerShade.addColorStop(0,'rgba(0,0,0,0)');
      innerShade.addColorStop(0.55,'rgba(0,0,0,0.55)');
      innerShade.addColorStop(1,'rgba(0,0,0,0.92)');
      ctx.fillStyle=innerShade;ctx.fillRect(mx-mouthHalfW-4,mouthTopY-10,mouthHalfW*2+8,mouthBotY-mouthTopY+20);
      ctx.restore();

      // --- Main stone mass with carved mouth (evenodd: outer shape minus mouth) ---
      const cliffG=ctx.createLinearGradient(0,0,0,floorY);
      cliffG.addColorStop(0,'#2e2822');
      cliffG.addColorStop(0.5,'#3a3128');
      cliffG.addColorStop(1,'#221b14');
      ctx.fillStyle=cliffG;
      ctx.beginPath();
      // Outer silhouette: jagged mountain top, wraps down the right side to floor
      ctx.moveTo(mx-mouthHalfW-100, mouthBotY);
      // Left face going up
      ctx.lineTo(mx-mouthHalfW-100, 40);
      // Jagged mountain ridge across the top to the right
      for(let px=mx-mouthHalfW-100;px<=cw+80;px+=14){
        const wx=px+camX;
        // Layered noise -> rugged natural ridge
        const base=36;
        const n1=Math.abs(Math.sin(wx*0.018))*26;
        const n2=Math.sin(wx*0.07)*10;
        const n3=Math.sin(wx*0.19)*4;
        ctx.lineTo(px, base - n1 + n2 + n3);
      }
      ctx.lineTo(cw+80, mouthBotY);
      ctx.closePath();
      // Subtract mouth outline (reverse winding via evenodd)
      ctx.moveTo(mouthPtsWorld[mouthPtsWorld.length-1][0]-camX, mouthPtsWorld[mouthPtsWorld.length-1][1]);
      for(let i=mouthPtsWorld.length-2;i>=0;i--){
        ctx.lineTo(mouthPtsWorld[i][0]-camX, mouthPtsWorld[i][1]);
      }
      ctx.closePath();
      ctx.fill('evenodd');

      // --- Darker recessed rock layer (second tone for depth/volume) ---
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mx-mouthHalfW-100, mouthBotY);
      ctx.lineTo(mx-mouthHalfW-100, 40);
      for(let px=mx-mouthHalfW-100;px<=cw+80;px+=14){
        const wx=px+camX;
        const base=36;
        const n1=Math.abs(Math.sin(wx*0.018))*26;
        const n2=Math.sin(wx*0.07)*10;
        const n3=Math.sin(wx*0.19)*4;
        ctx.lineTo(px, base - n1 + n2 + n3);
      }
      ctx.lineTo(cw+80, mouthBotY);
      ctx.closePath();
      // Punch out mouth again
      ctx.moveTo(mouthPtsWorld[mouthPtsWorld.length-1][0]-camX, mouthPtsWorld[mouthPtsWorld.length-1][1]);
      for(let i=mouthPtsWorld.length-2;i>=0;i--){
        ctx.lineTo(mouthPtsWorld[i][0]-camX, mouthPtsWorld[i][1]);
      }
      ctx.closePath();
      ctx.clip('evenodd');

      // Chunky rock tiles (varied brick-like shapes, tinted darker)
      ctx.fillStyle='rgba(0,0,0,0.18)';
      for(let ry=30;ry<floorY;ry+=22){
        const rowSeed=(ry*0.13)|0;
        for(let rx=Math.floor((camX-80)/36)*36;rx<camX+cw+80;rx+=36){
          const sx=rx-camX + ((rowSeed+rx*0.01)%2)*18;
          const wx=rx+camX;
          if(sx<-40||sx>cw+40)continue;
          // Skip if this tile position would be inside/near mouth
          const dx=(sx-mx);
          if(Math.abs(dx)<mouthHalfW+18 && ry>mouthTopY-20 && ry<mouthBotY+10)continue;
          const w=16+((wx*7)%8);
          const h=14+((ry*11)%6);
          ctx.fillRect(sx,ry,w,h);
        }
      }
      // Light edge highlights on top of chunks
      ctx.fillStyle='rgba(255,240,200,0.06)';
      for(let ry=30;ry<floorY;ry+=22){
        const rowSeed=(ry*0.13)|0;
        for(let rx=Math.floor((camX-80)/36)*36;rx<camX+cw+80;rx+=36){
          const sx=rx-camX + ((rowSeed+rx*0.01)%2)*18;
          if(sx<-40||sx>cw+40)continue;
          const dx=(sx-mx);
          if(Math.abs(dx)<mouthHalfW+18 && ry>mouthTopY-20 && ry<mouthBotY+10)continue;
          const w=16+(((rx+camX)*7)%8);
          ctx.fillRect(sx,ry,w,1);
        }
      }
      // Scattered cracks/fissures
      ctx.strokeStyle='rgba(0,0,0,0.45)';ctx.lineWidth=1;
      for(let ci=0;ci<30;ci++){
        const wx=Math.floor(camX/40)*40 + ci*60 + ((ci*37)%30);
        const sx=wx-camX;
        if(sx<-20||sx>cw+20)continue;
        const cy=30+((ci*71)%(floorY-60));
        // Avoid mouth region
        if(Math.abs(sx-mx)<mouthHalfW+16 && cy>mouthTopY-10 && cy<mouthBotY)continue;
        ctx.beginPath();
        ctx.moveTo(sx,cy);
        ctx.lineTo(sx+((ci%3)-1)*3, cy+8);
        ctx.lineTo(sx+((ci%5)-2)*2, cy+16);
        ctx.stroke();
      }
      // Moss patches (green — underwater)
      ctx.fillStyle='rgba(60,120,55,0.55)';
      for(let mi=0;mi<18;mi++){
        const wx=camX-60+mi*90+((mi*13)%30);
        const sx=wx-camX;
        if(sx<-20||sx>cw+20)continue;
        const my=32+((mi*31)%(floorY-80));
        if(Math.abs(sx-mx)<mouthHalfW+10 && my>mouthTopY-10 && my<mouthBotY)continue;
        ctx.beginPath();
        ctx.ellipse(sx,my,6+(mi%3)*2,2.5,0,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();

      // --- Stalactite "teeth" hanging down from the top rim of the mouth ---
      const teethN=9;
      for(let ti=0;ti<teethN;ti++){
        const tt=(ti+0.5)/teethN;
        // Sample a point along the upper half of the mouth outline
        const sampleIdx=Math.floor(tt*(mouthPtsWorld.length-1));
        const p=mouthPtsWorld[sampleIdx];
        // Only use points on the upper arc (above floor)
        if(p[1] > mouthBotY-20) continue;
        const sx=p[0]-camX, sy=p[1];
        const baseW=5+((ti*7)%3);
        const len=10+((ti*13)%4)*6;
        // Tooth body (dark rock)
        const tg=ctx.createLinearGradient(sx,sy,sx,sy+len);
        tg.addColorStop(0,'#3a2e20');
        tg.addColorStop(1,'#0a0604');
        ctx.fillStyle=tg;
        ctx.beginPath();
        ctx.moveTo(sx-baseW,sy-1);
        ctx.lineTo(sx+baseW,sy-1);
        ctx.lineTo(sx+baseW*0.4,sy+len*0.6);
        ctx.lineTo(sx,sy+len);
        ctx.lineTo(sx-baseW*0.4,sy+len*0.6);
        ctx.closePath();ctx.fill();
        // Highlight edge
        ctx.strokeStyle='rgba(180,160,120,0.35)';ctx.lineWidth=0.8;
        ctx.beginPath();ctx.moveTo(sx-baseW+1,sy+1);ctx.lineTo(sx-baseW*0.4+1,sy+len*0.55);ctx.stroke();
        // Drip
        if((ti+((t*2)|0))%4===0){
          ctx.fillStyle=c.accent+'99';
          ctx.beginPath();ctx.arc(sx,sy+len+3+Math.sin(t*2+ti)*1,1.3,0,Math.PI*2);ctx.fill();
        }
      }

      // --- Stalagmites rising from the floor at the mouth base (outside and inside) ---
      const stgN=5;
      for(let si=0;si<stgN;si++){
        const sWorld=entryX - mouthHalfW - 12 + si*(mouthHalfW*2 + 24)/stgN;
        const sx=sWorld-camX;
        if(sx<-10||sx>cw+10)continue;
        const h=12+((si*17)%4)*5;
        const w=4+((si*7)%3);
        const sg=ctx.createLinearGradient(sx,floorY-h,sx,floorY);
        sg.addColorStop(0,'#0a0604');
        sg.addColorStop(1,'#3a2e20');
        ctx.fillStyle=sg;
        ctx.beginPath();
        ctx.moveTo(sx-w,floorY);
        ctx.lineTo(sx,floorY-h);
        ctx.lineTo(sx+w,floorY);
        ctx.closePath();ctx.fill();
      }

      // --- Hanging kelp / seaweed across the mouth (underwater ambience) ---
      ctx.strokeStyle='rgba(50,120,60,0.75)';ctx.lineWidth=2;ctx.lineCap='round';
      for(let ki=0;ki<8;ki++){
        const tt=(ki+0.5)/8;
        const sampleIdx=Math.floor(tt*(mouthPtsWorld.length-1));
        const p=mouthPtsWorld[sampleIdx];
        if(p[1] > mouthBotY-30) continue;
        const sx=p[0]-camX, sy=p[1]+2;
        const len=18+((ki*13)%4)*5;
        const sway=Math.sin(t*1.5+ki*0.7)*5;
        ctx.beginPath();
        ctx.moveTo(sx,sy);
        ctx.quadraticCurveTo(sx+sway*0.5, sy+len*0.5, sx+sway, sy+len);
        ctx.stroke();
        // Leaf blobs
        ctx.fillStyle='rgba(70,150,70,0.6)';
        ctx.beginPath();ctx.ellipse(sx+sway*0.3,sy+len*0.45,1.5,3,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(sx+sway*0.7,sy+len*0.75,1.5,3,0,0,Math.PI*2);ctx.fill();
      }
      ctx.lineCap='butt';

      // --- Rim/edge outline — subtle darker line on the mouth boundary for definition ---
      ctx.strokeStyle='rgba(0,0,0,0.55)';ctx.lineWidth=2;
      ctx.beginPath();traceMouth();ctx.stroke();

      // --- Soft glow from deep inside spilling out (only from upper arc of mouth) ---
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      const rim=ctx.createRadialGradient(mx,(mouthTopY+mouthBotY)*0.6,mouthHalfW*0.3,mx,(mouthTopY+mouthBotY)*0.6,mouthHalfW*2.4);
      rim.addColorStop(0,c.glow+'22');
      rim.addColorStop(0.5,c.glow+'10');
      rim.addColorStop(1,'transparent');
      ctx.fillStyle=rim;
      ctx.fillRect(mx-mouthHalfW*2.4,mouthTopY-60,mouthHalfW*4.8,mouthBotY-mouthTopY+100);
      ctx.restore();

      // --- Light god-rays from the surface passing through water, stopping at the cliff top ---
      // Only draw OUTSIDE (to the left of the mouth) to hint at surface light
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.fillStyle='rgba(120,180,220,0.05)';
      for(let gi=0;gi<4;gi++){
        const gx=40+gi*80 + Math.sin(t*0.5+gi)*20 - camX%200;
        if(gx>mx-mouthHalfW-20 || gx<-30)continue;
        ctx.beginPath();
        ctx.moveTo(gx-4,0);
        ctx.lineTo(gx+4,0);
        ctx.lineTo(gx+20,floorY);
        ctx.lineTo(gx-20,floorY);
        ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }

    // === THEME FEATURES (along the tunnel) ===
    ctx.save();
    for(let wx=Math.max(entryX,camX-100); wx<Math.min(cs.worldW,camX+cw+100); wx+=80){
      const sx=wx-camX;
      const seed=(wx*0.07)|0;
      if(c.type==='crystals'){
        // Crystals on floor
        const stOnCeil=(seed%3===0);
        const cx2=sx+((seed*13)%40);
        const cy2=stOnCeil?ceilY+Math.abs(Math.sin(wx*0.04))*30+5:floorY-2;
        const dir=stOnCeil?1:-1;
        const ch2=20+((seed*7)%4)*6;
        const cw2=5+((seed*3)%3)*2;
        const hue=200+((seed*17)%60);
        const cg=ctx.createLinearGradient(cx2,cy2,cx2,cy2+dir*ch2);
        cg.addColorStop(0,`hsla(${hue},90%,45%,0.9)`);
        cg.addColorStop(1,`hsla(${hue},95%,75%,0.9)`);
        ctx.fillStyle=cg;
        ctx.beginPath();ctx.moveTo(cx2-cw2,cy2);ctx.lineTo(cx2,cy2+dir*ch2);ctx.lineTo(cx2+cw2,cy2);ctx.closePath();ctx.fill();
        // Glow
        const glow=ctx.createRadialGradient(cx2,cy2+dir*ch2/2,0,cx2,cy2+dir*ch2/2,30);
        glow.addColorStop(0,`hsla(${hue},100%,70%,${0.3+Math.sin(t*2+seed)*0.1})`);
        glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx2,cy2+dir*ch2/2,30,0,Math.PI*2);ctx.fill();
      } else if(c.type==='bones'){
        // Bones strewn across the floor
        const bx=sx+((seed*11)%30);
        const by=floorY-3;
        if(seed%4===0){
          // Skull
          ctx.fillStyle='#e8e2d0';
          ctx.beginPath();ctx.arc(bx,by-8,8,0,Math.PI*2);ctx.fill();
          ctx.fillRect(bx-5,by-3,10,6);
          ctx.fillStyle='#000';
          ctx.beginPath();ctx.arc(bx-3,by-9,1.8,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(bx+3,by-9,1.8,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=`rgba(255,60,60,${0.5+Math.sin(t*3+seed)*0.3})`;
          ctx.beginPath();ctx.arc(bx-3,by-9,0.9,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(bx+3,by-9,0.9,0,Math.PI*2);ctx.fill();
          for(let ti=0;ti<4;ti++){ctx.fillStyle='#000';ctx.fillRect(bx-4+ti*2.5,by-1,1.5,3);}
        } else {
          // Rib/femur
          ctx.strokeStyle='#ddd8c8';ctx.lineWidth=3;
          ctx.lineCap='round';
          const ang=((seed%3)-1)*0.4;
          const bl=18;
          ctx.beginPath();
          ctx.moveTo(bx-Math.cos(ang)*bl/2,by-Math.sin(ang)*bl/2);
          ctx.lineTo(bx+Math.cos(ang)*bl/2,by+Math.sin(ang)*bl/2);
          ctx.stroke();
          ctx.fillStyle='#e8e2d0';
          ctx.beginPath();ctx.arc(bx-Math.cos(ang)*bl/2,by-Math.sin(ang)*bl/2,2.5,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.arc(bx+Math.cos(ang)*bl/2,by+Math.sin(ang)*bl/2,2.5,0,Math.PI*2);ctx.fill();
        }
        // Embers
        if(seed%2===0){
          const ex=bx+(((t*20+seed)%20)-10);
          const ey=by-20-((t*15+seed*3)%40);
          ctx.fillStyle=`rgba(255,${120+seed%80},60,${0.5+Math.sin(t*3+seed)*0.3})`;
          ctx.fillRect(ex,ey,1.8,1.8);
        }
      } else if(c.type==='ruins'){
        // Ancient columns at intervals
        if(seed%2===0){
          const cx2=sx+20;
          const baseY=floorY-2;
          const broken=(seed%4===0);
          const colH=broken?60:90;
          const topY=baseY-colH;
          // Column
          ctx.fillStyle='#b09060';
          ctx.fillRect(cx2-7,topY,14,baseY-topY);
          ctx.strokeStyle='#8a6838';ctx.lineWidth=1;
          for(let fi=-1;fi<=1;fi++){
            ctx.beginPath();ctx.moveTo(cx2+fi*3.5,topY);ctx.lineTo(cx2+fi*3.5,baseY);ctx.stroke();
          }
          // Base
          ctx.fillStyle='#8a6838';ctx.fillRect(cx2-10,baseY-5,20,5);
          if(!broken){
            // Capital
            ctx.fillStyle='#c8a070';ctx.fillRect(cx2-10,topY-5,20,5);
            ctx.fillRect(cx2-11,topY-9,22,4);
          } else {
            // Jagged break
            ctx.fillStyle='#6a4828';
            ctx.beginPath();
            ctx.moveTo(cx2-7,topY);
            ctx.lineTo(cx2-4,topY-4);ctx.lineTo(cx2,topY+2);ctx.lineTo(cx2+4,topY-3);ctx.lineTo(cx2+7,topY);
            ctx.closePath();ctx.fill();
          }
        } else {
          // Gold coins
          for(let gi=0;gi<4;gi++){
            const gx=sx+gi*14+10;
            const gy=floorY-3;
            ctx.fillStyle='#ffd700';
            ctx.beginPath();ctx.ellipse(gx,gy,3,1.5,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='#ffee88';
            ctx.beginPath();ctx.ellipse(gx,gy-0.5,1.5,0.8,0,0,Math.PI*2);ctx.fill();
          }
        }
        // Motes
        const px=sx+((seed*31+t*8)%60);
        const py=ceilY+40+((seed*17+t*6)%(floorY-ceilY-80));
        ctx.fillStyle=`rgba(255,220,120,${0.4+Math.sin(t*2+seed)*0.3})`;
        ctx.fillRect(px,py,1.5,1.5);
      }
    }
    ctx.restore();

    // === PLAYER ALIEN ===
    const pax=a.x-camX, pay=floorY+a.y;
    // Shadow on floor
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath();ctx.ellipse(pax,floorY+2,12,3,0,0,Math.PI*2);ctx.fill();
    drawAlienPreview(pax, pay, 1.0, getAlienSkin(), a.facing, a.walkT);

    // === VIGNETTE ===
    const vg=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.3,cw/2,ch/2,Math.max(cw,ch)*0.7);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.6)');
    ctx.fillStyle=vg;ctx.fillRect(0,0,cw,ch);

    // === HUD ===
    ctx.fillStyle=c.accent;ctx.font='bold 14px monospace';ctx.textAlign='left';
    ctx.fillText(c.name,20,30);
    ctx.fillStyle='rgba(200,220,200,0.5)';ctx.font='10px monospace';
    ctx.fillText(outside?'(outside the cave)':'(inside)', 20,46);
    ctx.fillStyle='rgba(0,200,0,0.5)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('A/D: Walk   SPACE/W: Jump   ESC: Back',cw/2,ch-16);
    } // close else { NORMAL CAVE RENDER }
  }
  else if(mainMenuMode==='debugPlanet'){
    // Planet picker for debug mode — grid of planet cards
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('DEBUG — SELECT WORLD',cw/2,ch*0.12);
    const cols=4, cardW=160, cardH=130, gap=16;
    const totalW=cols*(cardW+gap)-gap;
    const startX=cw/2-totalW/2;
    const startY=ch*0.22;
    mainMenuSel=((mainMenuSel%planetDefs.length)+planetDefs.length)%planetDefs.length;
    planetDefs.forEach((p,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const sx=startX+col*(cardW+gap), sy=startY+row*(cardH+gap);
      const sel=i===mainMenuSel;
      ctx.fillStyle=sel?'rgba(0,50,20,0.85)':'rgba(0,15,5,0.6)';
      roundRect(ctx,sx,sy,cardW,cardH,8);ctx.fill();
      if(sel){ctx.strokeStyle=`rgba(0,255,0,${0.65+Math.sin(t*4)*0.2})`;ctx.lineWidth=2.5;roundRect(ctx,sx,sy,cardW,cardH,8);ctx.stroke();}
      // Planet disc preview
      const px=sx+cardW/2, py=sy+cardH*0.45;
      ctx.save();
      ctx.fillStyle=p.color||'#888';
      ctx.beginPath();ctx.arc(px,py,28,0,Math.PI*2);ctx.fill();
      if(p.atmColor){ctx.strokeStyle=p.atmColor;ctx.lineWidth=2;ctx.beginPath();ctx.arc(px,py,31,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
      // Name
      ctx.fillStyle=sel?'#0f0':'rgba(0,220,0,0.65)';
      ctx.font='bold 14px monospace';ctx.textAlign='center';
      ctx.fillText((p.name||p.id).toUpperCase(),sx+cardW/2,sy+cardH-14);
    });
    // Era toggle indicator (only relevant for Earth, but shown always for consistency)
    const era = window._debugPrehistoric ? '68,000,000 YRS AGO — CRETACEOUS' : 'PRESENT DAY';
    const eraCol = window._debugPrehistoric ? 'rgba(255,180,80,0.85)' : 'rgba(120,220,255,0.85)';
    ctx.fillStyle=eraCol;ctx.font='bold 13px monospace';ctx.textAlign='center';
    ctx.fillText('ERA: '+era, cw/2, ch-42);
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('WASD/Arrows browse  |  ENTER view units  |  E toggle era  |  ESC back',cw/2,ch-20);
  }
  else if(mainMenuMode==='debugUnits' && debugSelectedPlanet){
    // Unit list for the chosen planet — grouped by category, scrollable
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    {
      const _eraSuffix = (debugSelectedPlanet.id==='earth' && window._debugPrehistoric) ? '  [CRETACEOUS]' : '';
      ctx.fillText('UNITS ON '+(debugSelectedPlanet.name||debugSelectedPlanet.id).toUpperCase()+_eraSuffix,cw/2,ch*0.08);
    }
    const groups=getDebugUnitCatalog(debugSelectedPlanet);
    const flat=flattenUnitCatalog(groups);
    if(flat.length===0){
      ctx.fillStyle='rgba(0,200,0,0.5)';ctx.font='14px monospace';
      ctx.fillText('(no units defined for this world)',cw/2,ch/2);
    } else {
      mainMenuSel=((mainMenuSel%flat.length)+flat.length)%flat.length;
      // Layout: 2 columns of rows
      const cols=2, rowH=22, topY=ch*0.16, colW=340, gap=20;
      const startX=cw/2-(cols*colW+gap)/2;
      const maxRows=Math.floor((ch*0.78)/rowH);
      // Flatten with headers inserted
      const rows=[]; // {type:'header'|'unit', ...}
      groups.forEach(g=>{ rows.push({type:'header',label:g.cat}); g.units.forEach(u=>{ rows.push({type:'unit',label:u.label,unit:u,group:g.cat}); }); });
      // Find selected row index (matching flatIdx)
      let flatIdx=0, selRow=0;
      for(let i=0;i<rows.length;i++){ if(rows[i].type==='unit'){ if(flatIdx===mainMenuSel) selRow=i; flatIdx++; } }
      // Scroll so selected row is visible
      const rowsPerCol=Math.floor((ch*0.78)/rowH);
      let scrollTop=0;
      const totalRows=rows.length;
      const maxVisible=rowsPerCol*cols;
      if(totalRows>maxVisible){
        // Center around selected
        scrollTop=Math.max(0,Math.min(totalRows-maxVisible,selRow-Math.floor(maxVisible/2)));
      }
      for(let i=0;i<Math.min(maxVisible,totalRows-scrollTop);i++){
        const r=rows[scrollTop+i];
        const col=Math.floor(i/rowsPerCol);
        const row=i%rowsPerCol;
        const x=startX+col*(colW+gap);
        const y=topY+row*rowH;
        if(r.type==='header'){
          ctx.fillStyle='rgba(0,255,150,0.75)';ctx.font='bold 13px monospace';ctx.textAlign='left';
          ctx.fillText('— '+r.label.toUpperCase()+' —',x,y+14);
        } else {
          // Compute flatIdx for this row
          let fi=0; for(let k=0;k<scrollTop+i;k++){ if(rows[k].type==='unit') fi++; }
          const sel=fi===mainMenuSel;
          if(sel){ ctx.fillStyle='rgba(0,80,30,0.7)'; ctx.fillRect(x-6,y,colW,rowH-2); }
          ctx.fillStyle=sel?'#0f0':'rgba(0,210,0,0.75)';
          ctx.font=sel?'bold 13px monospace':'13px monospace';ctx.textAlign='left';
          ctx.fillText(r.label,x,y+15);
        }
      }
    }
    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('W/S or Arrows to browse  |  ENTER/SPACE to preview unit  |  ESC to back',cw/2,ch-20);
  }
  else if(mainMenuMode==='debugPreview' && debugPreviewPuppets){
    const u=debugPreviewPuppets.unit;
    ctx.fillStyle='rgba(0,255,0,0.55)';ctx.font='bold 18px monospace';ctx.textAlign='center';
    ctx.fillText('PREVIEW — '+(u.label||'unit').toUpperCase(),cw/2,ch*0.08);

    // Stage dividers for left/right rows
    const topY    = ch*0.42;
    const bottomY = ch*0.62;
    const isCow = debugPreviewPuppets.isCow;
    const isVehicle = debugPreviewPuppets.isVehicle;

    // Draw two "ground lines" so the viewer sees where the feet are planted
    ctx.strokeStyle='rgba(0,255,0,0.18)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cw*0.2,topY);ctx.lineTo(cw*0.8,topY);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cw*0.2,bottomY);ctx.lineTo(cw*0.8,bottomY);ctx.stroke();

    // Row labels
    ctx.fillStyle='rgba(0,255,150,0.5)';ctx.font='12px monospace';ctx.textAlign='left';
    ctx.fillText(isVehicle?'facing left ←':'walking left ←',  cw*0.2, topY-8);
    ctx.fillText(isVehicle?'facing right →':'walking right →', cw*0.2, bottomY-8);

    // Puppets
    drawPreviewPuppetAt(debugPreviewPuppets.left,  isCow, cw/2, topY,    isVehicle);
    drawPreviewPuppetAt(debugPreviewPuppets.right, isCow, cw/2, bottomY, isVehicle);

    ctx.fillStyle='rgba(0,200,0,0.3)';ctx.font='11px monospace';ctx.textAlign='center';
    ctx.fillText('ESC to back',cw/2,ch-20);
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
    items.push('new','settings','debug','credits','exit');

    if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=10;}
    if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=10;}
    mainMenuSel=((mainMenuSel%items.length)+items.length)%items.length;

    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      const action=items[mainMenuSel];
      if(action==='continue'){startGame(true);}
      else if(action==='new'){
        // New game: funnel through race pick → ship type pick → ship variant pick → start
        window._mmNewGame=true;
        mainMenuMode='skins';
        mainMenuSel=ALIEN_RACES.findIndex(r=>r.id===selectedRace);
        if(mainMenuSel<0) mainMenuSel=0;
      }
      else if(action==='skins'){mainMenuMode='skins';mainMenuSel=ALIEN_SKINS.findIndex(s=>s.id===selectedSkin)||0;}
      else if(action==='shipskins'){mainMenuMode='shipskins';mainMenuSel=SHIP_PAINTS.findIndex(s=>s.id===shipPaint.name)||0;}
      else if(action==='settings'){mainMenuMode='settings';mainMenuSel=0;}
      else if(action==='debug'){mainMenuMode='debug';mainMenuSel=0;}
      else if(action==='credits'){mainMenuMode='credits';mainMenuSel=0;}
      else if(action==='exit'){
        // Show start-screen overlay and stop the game
        const ss=document.getElementById('start-screen'); if(ss) ss.style.display='flex';
        gameStarted=false; mainMenuMode=null;
      }
    }
    // Language hotkeys (1-6)
    const langCodes=['en','de','sv','es','pt','fr'];
    for(let i=0;i<6;i++){if(keys[''+(i+1)]){setLang(langCodes[i]);keys[''+(i+1)]=false;}}
  }
  else if(mainMenuMode==='skins'){
    // Race selection
    const cols=5;
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
    if(keys['escape']){
      keys['escape']=false;
      if(window._mmFromDebug){ window._mmFromDebug=false; mainMenuMode='debug'; mainMenuSel=2; }
      else { mainMenuMode='menu'; mainMenuSel=0; window._mmNewGame=false; }
      window._mmCool=10;
    }
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
      refreshAlienWeapons(); alien.weapon=0;
      // In new-game flow, advance to ship-type picker
      if(window._mmNewGame){
        mainMenuMode='shipskins';
        mainMenuSel=SHIP_TYPES.findIndex(st=>st.id===(shipPaint.ship||'saucer'));
        if(mainMenuSel<0) mainMenuSel=0;
      }
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='skins';mainMenuSel=window._mmRaceIdx||0;window._mmCool=10;}
  }
  else if(mainMenuMode==='shipskins'){
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=5;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=5;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%SHIP_TYPES.length)+SHIP_TYPES.length)%SHIP_TYPES.length;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      window._mmShipTypeIdx=mainMenuSel;
      const typeId=SHIP_TYPES[mainMenuSel].id;
      const variants=SHIP_PAINTS.filter(p=>(p.ship||'saucer')===typeId);
      const curIdx=variants.findIndex(v=>v.id===shipPaint.name);
      mainMenuSel=curIdx>=0?curIdx:0;
      mainMenuMode='shipVariants';
    }
    if(keys['escape']){
      keys['escape']=false;
      if(window._mmNewGame) mainMenuMode='skins';
      else if(window._mmFromDebug){ window._mmFromDebug=false; mainMenuMode='debug'; mainMenuSel=3; }
      else mainMenuMode='menu';
      mainMenuSel=0; window._mmCool=10;
    }
  }
  else if(mainMenuMode==='shipVariants'){
    const typeIdx=window._mmShipTypeIdx||0;
    const typeId=SHIP_TYPES[typeIdx].id;
    const variants=SHIP_PAINTS.filter(p=>(p.ship||'saucer')===typeId);
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=4;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=4;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%variants.length)+variants.length)%variants.length;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      const sp=variants[mainMenuSel];
      shipPaint={color:sp.color,accent:sp.accent,trail:sp.trail,name:sp.id,ship:sp.ship||'saucer'};
      localStorage.setItem('sadabduction_shippaint',JSON.stringify(shipPaint));
      // In new-game flow, finalize and launch the game
      if(window._mmNewGame){
        window._mmNewGame=false;
        startGame(false);
      }
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='shipskins';mainMenuSel=window._mmShipTypeIdx||0;window._mmCool=10;}
  }
  else if(mainMenuMode==='settings'){
    if(!window._mmSettingsCtx) window._mmSettingsCtx='all';
    const tabs=['all','ship','foot'];
    // Tab switch with A/D (only when not awaiting a bind)
    if(!window._mmAwaitBind){
      if(keys['a']||keys['arrowleft']){
        const idx=tabs.indexOf(window._mmSettingsCtx);
        window._mmSettingsCtx=tabs[(idx-1+tabs.length)%tabs.length];
        mainMenuSel=0; window._mmCool=10;
      }
      if(keys['d']||keys['arrowright']){
        const idx=tabs.indexOf(window._mmSettingsCtx);
        window._mmSettingsCtx=tabs[(idx+1)%tabs.length];
        mainMenuSel=0; window._mmCool=10;
      }
    }
    const ctxMode=window._mmSettingsCtx;
    const filtered=KEY_ACTIONS.filter(a=>ctxMode==='all'||a.context==='both'||a.context===ctxMode);
    const n=filtered.length+2; // +2 for "Reset to defaults" and "Back"
    if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%n)+n)%n;
    if((keys['enter']||keys[' ']) && !window._mmAwaitBind){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      if(mainMenuSel<filtered.length){
        // Begin rebinding this action
        window._mmAwaitBind=filtered[mainMenuSel].id;
      } else if(mainMenuSel===filtered.length){
        // Reset all to defaults
        KEY_ACTIONS.forEach(a=>{ keyBindings[a.id]=a.canonical; });
        saveKeyBindings();
        _physToCanon=buildPhysicalToCanonical();
      } else {
        mainMenuMode='menu'; mainMenuSel=0;
      }
    }
    if(keys['escape'] && !window._mmAwaitBind){keys['escape']=false;mainMenuMode='menu';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='debug'){
    const n=4;
    if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%n)+n)%n;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      if(mainMenuSel===0){mainMenuMode='debugPlanet';mainMenuSel=0;}
      else if(mainMenuSel===1){mainMenuMode='sandbox';mainMenuSel=0;}
      else if(mainMenuSel===2){
        window._mmFromDebug=true;
        mainMenuMode='skins';
        mainMenuSel=ALIEN_RACES.findIndex(r=>r.id===selectedRace);
        if(mainMenuSel<0) mainMenuSel=0;
      }
      else if(mainMenuSel===3){
        window._mmFromDebug=true;
        mainMenuMode='shipskins';
        mainMenuSel=SHIP_TYPES.findIndex(st=>st.id===(shipPaint.ship||'saucer'));
        if(mainMenuSel<0) mainMenuSel=0;
      }
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='menu';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='credits'){
    // Scroll with W/S; ESC or ENTER back to main menu
    if(keys['w']||keys['arrowup']){window._mmCreditsScroll=Math.max(0,(window._mmCreditsScroll||0)-14);window._mmCool=2;}
    if(keys['s']||keys['arrowdown']){window._mmCreditsScroll=(window._mmCreditsScroll||0)+14;window._mmCool=2;}
    if(keys['escape']||keys['enter']||keys[' ']){keys['escape']=false;keys['enter']=false;keys[' ']=false;mainMenuMode='menu';mainMenuSel=0;window._mmCool=10;window._mmCreditsScroll=0;}
  }
  else if(mainMenuMode==='sandbox'){
    const n=1;
    if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%n)+n)%n;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      if(mainMenuSel===0){mainMenuMode='sandboxCaves';mainMenuSel=0;}
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='debug';mainMenuSel=1;window._mmCool=10;}
  }
  else if(mainMenuMode==='sandboxCaves'){
    const _NCAVES=4;
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%_NCAVES)+_NCAVES)%_NCAVES;
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      caveWalkState={
        caveIdx: mainMenuSel,
        worldW: 3200,
        entered: false,
        alien: {x: 120, y: 0, vx: 0, vy: 0, facing: 1, walkT: 0, onGround: true},
      };
      mainMenuMode='sandboxCaveWalk';
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='sandbox';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='sandboxCaveWalk'){
    const cs=caveWalkState;
    if(!cs){mainMenuMode='sandboxCaves';return true;}
    const a=cs.alien;
    const walkSpd=2.8, jumpV=-8.5, grav=0.45;
    const left=keys['a']||keys['arrowleft'];
    const right=keys['d']||keys['arrowright'];
    if(left){a.vx=-walkSpd; a.facing=-1;}
    else if(right){a.vx=walkSpd; a.facing=1;}
    else a.vx*=0.75;
    if((keys[' ']||keys['w']||keys['arrowup']) && a.onGround){a.vy=jumpV; a.onGround=false;}
    a.vy+=grav;
    a.x+=a.vx; a.y+=a.vy;
    if(a.y>=0){a.y=0; a.vy=0; a.onGround=true;}
    if(a.x<40)a.x=40;
    if(a.x>cs.worldW-40)a.x=cs.worldW-40;
    if(Math.abs(a.vx)>0.1)a.walkT+=Math.abs(a.vx)*0.15;
    // Pyramid: ENTER to enter the tomb when near the door
    {
      const pyrCaves=['crystals','bones','ruins','pyramid'];
      if(pyrCaves[cs.caveIdx]==='pyramid' && !cs.entered){
        const doorX=280;
        if(Math.abs(a.x-doorX)<70 && (keys['enter']||keys['e'])){
          keys['enter']=false; keys['e']=false;
          cs.entered=true; a.x=doorX+20; a.vx=0;
          window._mmCool=10;
        }
      }
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='sandboxCaves';mainMenuSel=cs.caveIdx;caveWalkState=null;window._mmCool=10;}
  }
  else if(mainMenuMode==='debugPlanet'){
    const cols=4;
    if(keys['a']||keys['arrowleft']){mainMenuSel--;window._mmCool=8;}
    if(keys['d']||keys['arrowright']){mainMenuSel++;window._mmCool=8;}
    if(keys['w']||keys['arrowup']){mainMenuSel-=cols;window._mmCool=8;}
    if(keys['s']||keys['arrowdown']){mainMenuSel+=cols;window._mmCool=8;}
    mainMenuSel=((mainMenuSel%planetDefs.length)+planetDefs.length)%planetDefs.length;
    // Era toggle — only meaningful for Earth; flip between Now and 68M yrs ago (Cretaceous)
    if(keys['e']){ keys['e']=false; window._debugPrehistoric=!window._debugPrehistoric; window._mmCool=10; }
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      debugSelectedPlanet=planetDefs[mainMenuSel];
      mainMenuMode='debugUnits';
      mainMenuSel=0;
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='debug';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='debugUnits'){
    const flat=debugSelectedPlanet?flattenUnitCatalog(getDebugUnitCatalog(debugSelectedPlanet)):[];
    if(flat.length>0){
      if(keys['w']||keys['arrowup']){mainMenuSel--;window._mmCool=6;}
      if(keys['s']||keys['arrowdown']){mainMenuSel++;window._mmCool=6;}
      mainMenuSel=((mainMenuSel%flat.length)+flat.length)%flat.length;
    }
    if(keys['enter']||keys[' ']){
      keys['enter']=false;keys[' ']=false;window._mmCool=15;
      if(flat.length>0){
        const u=flat[mainMenuSel].unit;
        debugPreviewPuppets = {
          unit:u, isCow:!!u.isCow, isVehicle:!!u.isVehicle,
          left:  buildPreviewPuppet(u, -1, debugSelectedPlanet),
          right: buildPreviewPuppet(u,  1, debugSelectedPlanet),
        };
        mainMenuMode='debugPreview';
      }
    }
    if(keys['escape']){keys['escape']=false;mainMenuMode='debugPlanet';mainMenuSel=0;window._mmCool=10;}
  }
  else if(mainMenuMode==='debugPreview'){
    if(debugPreviewPuppets){
      animatePreviewPuppet(debugPreviewPuppets.left,  debugPreviewPuppets.isCow, debugPreviewPuppets.isVehicle);
      animatePreviewPuppet(debugPreviewPuppets.right, debugPreviewPuppets.isCow, debugPreviewPuppets.isVehicle);
    }
    if(keys['escape']||keys['backspace']){keys['escape']=false;keys['backspace']=false;mainMenuMode='debugUnits';debugPreviewPuppets=null;window._mmCool=10;}
  }
  return true;
}

gameLoop();
