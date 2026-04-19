// --- ALIEN RACES & SKINS ---
// Organized by race. Each race has multiple skin variants (different color schemes within the race).
export const ALIEN_RACES = [
  { id:'grey',      name:'Grey',      description:'The classic abductors',       bodyType:'grey',     skins:[
      {id:'classic',    name:'Classic Green',  body:'#0c0',     head:'#0e0',     eyes:'#000', glow:'#0f0', accent:'#0a0'},
      {id:'dark',       name:'Shadow',         body:'#1a1a2a',  head:'#2a2a3a',  eyes:'#f00', glow:'#404', accent:'#111'},
      {id:'grey_ash',   name:'Ashen',          body:'#8090a0',  head:'#a0b0c0',  eyes:'#0ff', glow:'#6af', accent:'#607080'},
      {id:'grey_albino',name:'Albino',         body:'#e4e4dc',  head:'#f2f2ea',  eyes:'#f44', glow:'#fff', accent:'#a8a8a0'},
  ]},
  { id:'larva',     name:'Larvae',    description:'Crawling worm-like hatchlings', bodyType:'larva',  skins:[
      {id:'larva_pink', name:'Fleshborn',      body:'#e09090',  head:'#f0a0a0',  eyes:'#300', glow:'#f88', accent:'#c07070'},
      {id:'larva_glow', name:'Bioluminescent', body:'#60d090',  head:'#80e0a0',  eyes:'#fff', glow:'#4f8', accent:'#408060'},
      {id:'larva_white',name:'Maggot Prince',  body:'#e8e0c0',  head:'#f8f0d0',  eyes:'#000', glow:'#ffe', accent:'#c0b898'},
      {id:'larva_black',name:'Tar Grub',       body:'#2a1a1a',  head:'#3a2a2a',  eyes:'#f40', glow:'#f60', accent:'#1a0a0a'},
  ]},
  { id:'reptilian', name:'Reptilian', description:'Tailed scaled warriors & ancient saurians', bodyType:'reptile',skins:[
      {id:'red',        name:'Inferno',        body:'#c03020',  head:'#e04030',  eyes:'#ff0', glow:'#f40', accent:'#a02010'},
      {id:'rept_swamp', name:'Swamp Lord',     body:'#468538',  head:'#58a542',  eyes:'#ff0', glow:'#8f4', accent:'#2e5e22'},
      {id:'rept_sand',  name:'Desert Serpent', body:'#b08830',  head:'#d0a040',  eyes:'#000', glow:'#fd0', accent:'#907020'},
      {id:'rept_emer',  name:'Emerald',        body:'#2a8860',  head:'#30a070',  eyes:'#000', glow:'#4fc', accent:'#1a6040'},
      // Saurian (formerly dinosaur race) — ancient reptile-kin of prehistoric Earth
      {id:'dino_rex',   name:'Tyrant King',     body:'#5a4030',  head:'#704a30',  eyes:'#ff0', glow:'#fa4', accent:'#3a2818'},
      {id:'dino_rapt',  name:'Raptor',          body:'#408050',  head:'#50a060',  eyes:'#fa0', glow:'#8f4', accent:'#205030'},
      {id:'dino_tric',  name:'Horned Bulwark',  body:'#5a7058',  head:'#708868',  eyes:'#000', glow:'#dfa', accent:'#384030'},
      {id:'dino_spino', name:'Sail Stalker',    body:'#304860',  head:'#385878',  eyes:'#f40', glow:'#8cf', accent:'#182838'},
      {id:'dino_anky',  name:'Armor Club',      body:'#6a5a30',  head:'#807040',  eyes:'#220', glow:'#fd8', accent:'#403820'},
      {id:'dino_steg',  name:'Plate Back',      body:'#3a5838',  head:'#4a7048',  eyes:'#fc0', glow:'#cf4', accent:'#1a3018'},
      {id:'dino_ptero', name:'Sky Rider',       body:'#a04040',  head:'#c05050',  eyes:'#ff0', glow:'#f66', accent:'#701818'},
      {id:'dino_compy', name:'Tiny Swift',      body:'#a08040',  head:'#c0a050',  eyes:'#040', glow:'#fe8', accent:'#604818'},
  ]},
  { id:'insectoid', name:'Insectoid', description:'Multi-legged chitin warriors',  bodyType:'insect', skins:[
      {id:'purple',     name:'Void Walker',    body:'#8040c0',  head:'#a060e0',  eyes:'#ff0', glow:'#a0f', accent:'#6030a0'},
      {id:'pink',       name:'Bubblegum',      body:'#e060a0',  head:'#ff80c0',  eyes:'#f0f', glow:'#f8f', accent:'#c04080'},
      {id:'ins_mantis', name:'Mantis',         body:'#2a2030',  head:'#3a3040',  eyes:'#f0f', glow:'#a0f', accent:'#1a1020'},
      {id:'ins_amber',  name:'Amber Drone',    body:'#a06030',  head:'#c08040',  eyes:'#0f0', glow:'#fa4', accent:'#704020'},
      {id:'cry_clear',  name:'Diamond Shard',  body:'#e8f4ff',  head:'#f8fcff',  eyes:'#08f', glow:'#cff', accent:'#a0c8e0'},
      {id:'cry_ruby',   name:'Ruby Matron',    body:'#c02040',  head:'#e04060',  eyes:'#fff', glow:'#f68', accent:'#801020'},
      {id:'cry_sapph',  name:'Sapphire Seer',  body:'#2040a0',  head:'#3060d0',  eyes:'#ff0', glow:'#8cf', accent:'#102078'},
      {id:'cry_opal',   name:'Opal Dancer',    body:'#f0e0ff',  head:'#ffc0f0',  eyes:'#0ff', glow:'#fcf', accent:'#c0a0e0'},
  ]},
  { id:'human',     name:'Human',     description:'Infiltrators wearing human skin', bodyType:'humanoid',skins:[
      // Casual clothed variants (skin tone drives face/arms; outfit drives torso)
      {id:'pale_casual',name:'Pale Casual',    body:'#f2d4b4',  head:'#f8dcbe',  eyes:'#224', glow:'#fff', accent:'#d4a878', hair:'#8b5a2b', outfit:'tshirt', outfitA:'#c0392b', outfitB:'#2c3e50'},
      {id:'gold_casual',name:'Sunny Casual',   body:'#e8c48a',  head:'#f0cc94',  eyes:'#460', glow:'#fd0', accent:'#c09860', hair:'#f0c040', outfit:'tshirt', outfitA:'#27ae60', outfitB:'#8e44ad'},
      {id:'tan_casual', name:'Tanned Casual',  body:'#c49868',  head:'#d0a474',  eyes:'#148', glow:'#a6d', accent:'#a07848', hair:'#2a1810', outfit:'tshirt', outfitA:'#3498db', outfitB:'#34495e'},
      {id:'dark_casual',name:'Dark Casual',    body:'#6a4832',  head:'#744e36',  eyes:'#000', glow:'#fc8', accent:'#4a3424', hair:'#0a0606', outfit:'tshirt', outfitA:'#f39c12', outfitB:'#7f8c8d'},
      // Costumes
      {id:'president',  name:'President',      body:'#f2d4b4',  head:'#f8dcbe',  eyes:'#224', glow:'#fff', accent:'#d4a878', hair:'#5a3a20', outfit:'suit',      outfitA:'#141824', outfitB:'#c01828'},
      {id:'astronaut',  name:'Astronaut',      body:'#f0d8b8',  head:'#f0d8b8',  eyes:'#148', glow:'#fff', accent:'#c0c4c8', hair:'#8b5a2b', outfit:'astronaut', outfitA:'#e8ecf0', outfitB:'#8a8f95'},
      {id:'ghost_wiz',  name:'Ghost Wizard',   body:'#f2d4b4',  head:'#f2d4b4',  eyes:'#000', glow:'#fff', accent:'#8a8ac0', hair:'#4a2a70', outfit:'ghost',     outfitA:'#f5f5fa', outfitB:'#4a2a70'},
      {id:'clown',      name:'Giggles',        body:'#f2d4b4',  head:'#ffe8e0',  eyes:'#22a', glow:'#fff', accent:'#c44488', hair:'#f0404a', outfit:'clown',     outfitA:'#e33', outfitB:'#fc0'},
      {id:'superhero',  name:'Super Hero',     body:'#e8c48a',  head:'#f0cc94',  eyes:'#060', glow:'#fd4', accent:'#f8d060', hair:'#221810', outfit:'hero',      outfitA:'#1e3a8a', outfitB:'#dc2626'},
  ]},
  { id:'blob',      name:'Blob',      description:'Gelatinous quivering masses',    bodyType:'blob',    skins:[
      {id:'blob_green', name:'Slime',          body:'#50d060',  head:'#70f080',  eyes:'#000', glow:'#8f8', accent:'#30a040'},
      {id:'blob_pink', name:'Bubblegum Ooze', body:'#f080c0',  head:'#ffa0e0',  eyes:'#fff', glow:'#fcf', accent:'#c06090'},
      {id:'blob_blue', name:'Jelly',          body:'#60c0f0',  head:'#80e0ff',  eyes:'#04a', glow:'#acf', accent:'#40a0d0'},
      {id:'blob_toxic',name:'Toxic Pudding',  body:'#c0f040',  head:'#d8ff60',  eyes:'#420', glow:'#ef4', accent:'#a0c020'},
  ]},
  { id:'tentacle',  name:'Octopoid',  description:'Boneless tentacled swimmers',   bodyType:'tentacle',skins:[
      {id:'tent_purple',name:'Abyssal',        body:'#6030a0',  head:'#8050c0',  eyes:'#ff0', glow:'#a4f', accent:'#401880'},
      {id:'tent_red',   name:'Kraken',         body:'#a04030',  head:'#c06040',  eyes:'#fff', glow:'#f86', accent:'#702010'},
      {id:'tent_teal',  name:'Reef Dweller',   body:'#20a098',  head:'#30c0b4',  eyes:'#f40', glow:'#4fc', accent:'#107068'},
      {id:'tent_pale',  name:'Ghost Squid',    body:'#e8e0f0',  head:'#f8f0ff',  eyes:'#808', glow:'#fcf', accent:'#b8b0c8'},
  ]},
  { id:'mushroom',  name:'Myconid',   description:'Sentient fungal colonies',      bodyType:'mushroom',skins:[
      {id:'mush_red',   name:'Fly Agaric',     body:'#e4d4a8',  head:'#c04028',  eyes:'#000', glow:'#fa4', accent:'#a03020'},
      {id:'mush_brown', name:'Porcini',        body:'#e0d0b0',  head:'#8a5a30',  eyes:'#220', glow:'#fd8', accent:'#6a4020'},
      {id:'mush_blue',  name:'Indigo Cap',     body:'#d8d0e0',  head:'#4040a0',  eyes:'#fff', glow:'#88f', accent:'#303080'},
      {id:'mush_glow',  name:'Spore Prince',   body:'#c0e0c0',  head:'#40d080',  eyes:'#ff0', glow:'#8fc', accent:'#208050'},
  ]},
  { id:'cyborg',    name:'Cyborg',    description:'Tracked killer-machines with rolling armor', bodyType:'robot',  skins:[
      {id:'cyber',      name:'Cyborg',          body:'#2a3a2a',  head:'#3a4a3a',  eyes:'#0f0', glow:'#0f0', accent:'#1a2a1a', cyber:true},
      {id:'cyb_orange', name:'Industrial',      body:'#6a4a2a',  head:'#8a6a4a',  eyes:'#f80', glow:'#f80', accent:'#4a3a1a', cyber:true},
      {id:'cyb_chrome', name:'Chrome Unit',     body:'#9090a0',  head:'#b0b0c0',  eyes:'#0ff', glow:'#4cf', accent:'#707080', cyber:true},
      {id:'cyb_red',    name:'Blood Protocol',  body:'#6a2020',  head:'#8a3030',  eyes:'#f00', glow:'#f44', accent:'#4a1010', cyber:true},
      // Titan (formerly separate titan race) — heavy armored variants
      {id:'titan_iron',   name:'Iron Guardian',    body:'#606068',  head:'#78787e',  eyes:'#f80', glow:'#fc8', accent:'#40404a', cyber:true},
      {id:'titan_bronze', name:'Bronze Sentinel',  body:'#8a5a2a',  head:'#a87040',  eyes:'#0f0', glow:'#ff8', accent:'#603a1a', cyber:true},
      {id:'titan_gold',   name:'Gilded Colossus',  body:'#c8a040',  head:'#e8c060',  eyes:'#f0f', glow:'#ff4', accent:'#806828', cyber:true},
      {id:'titan_obsd',   name:'Obsidian Wall',    body:'#181820',  head:'#2a2a32',  eyes:'#f00', glow:'#f44', accent:'#0a0a0e', cyber:true},
  ]},
  { id:'cosmic',    name:'Cosmic',    description:'Floating beings of energy & phantom spirits', bodyType:'energy', skins:[
      {id:'rainbow',    name:'Prismatic',      body:'rainbow',  head:'rainbow',  eyes:'#fff', glow:'#fff', accent:'rainbow'},
      {id:'cos_nebula', name:'Nebula',         body:'#6030a0',  head:'#8040d0',  eyes:'#fff', glow:'#a0f', accent:'#4020a0'},
      {id:'cos_stars',  name:'Stardust',       body:'#e0d0ff',  head:'#fff0ff',  eyes:'#fff', glow:'#fff', accent:'#c0b0e0'},
      {id:'cos_void',   name:'Void Born',      body:'#101030',  head:'#202050',  eyes:'#f0f', glow:'#80f', accent:'#080820'},
      {id:'wraith_pale', name:'Pale Haunt',    body:'#a8a8c0',  head:'#c0c0d8',  eyes:'#400', glow:'#cce', accent:'#808098'},
      {id:'wraith_bone', name:'Bone Shade',    body:'#ebe4c8',  head:'#f4ecd0',  eyes:'#0f0', glow:'#fe8', accent:'#a89860'},
      {id:'wraith_ash',  name:'Ash Revenant',  body:'#403a48',  head:'#5a5260',  eyes:'#f40', glow:'#f86', accent:'#2a2430'},
      {id:'wraith_vngnc',name:'Vengeful',      body:'#1a0818',  head:'#3a1838',  eyes:'#0ff', glow:'#f0f', accent:'#0a000a'},
  ]},
  { id:'sluggoth',  name:'Sluggoth',  description:'Enormous slimy slug-crimelords', bodyType:'slug',   skins:[
      {id:'slug_green', name:'Swamp Baron',    body:'#7a8040',  head:'#a0a860',  eyes:'#fc0', glow:'#cd4', accent:'#4a5028'},
      {id:'slug_ochre', name:'Bloated Boss',   body:'#c0a060',  head:'#d8b878',  eyes:'#800', glow:'#fc8', accent:'#806838'},
      {id:'slug_purple',name:'Velvet Despot',  body:'#6a4870',  head:'#8a68a0',  eyes:'#ff0', glow:'#f8f', accent:'#3a2840'},
      {id:'slug_pale',  name:'Maggot Tyrant',  body:'#d0c8a0',  head:'#e8e0c0',  eyes:'#400', glow:'#fea', accent:'#887858'},
  ]},
  { id:'southpark', name:'South Park', description:'Chunky round-headed cartoon visitors', bodyType:'humanoid', skins:[
      {id:'sp_cart',    name:'Cartman',     body:'#f2d4b4', head:'#fce0c0', eyes:'#224', glow:'#fff', accent:'#d4a878', hair:'#5a3a1a', outfit:'southpark', outfitA:'#c02020', outfitB:'#f0d000', hat:'beanie_yel', pants:'#4a2a18'},
      {id:'sp_stan',    name:'Stan',        body:'#f2d4b4', head:'#f8dcbe', eyes:'#224', glow:'#fff', accent:'#d4a878', hair:'#3a1e0e', outfit:'southpark', outfitA:'#1e4db3', outfitB:'#5a3a1a', hat:'beanie_red', pants:'#2a1a88'},
      {id:'sp_kyle',    name:'Kyle',        body:'#f2d4b4', head:'#f8dcbe', eyes:'#148', glow:'#fff', accent:'#d4a878', hair:'#c03020', outfit:'southpark', outfitA:'#e06020', outfitB:'#4a6a1a', hat:'ushanka',    pants:'#185018'},
      {id:'sp_kenny',   name:'Kenny',       body:'#f2d4b4', head:'#f8dcbe', eyes:'#224', glow:'#fa0', accent:'#d4a878', hair:'#d08040', outfit:'southpark', outfitA:'#d86a14', outfitB:'#2a2a2a', hat:'parka',     pants:'#2a2a2a'},
      {id:'sp_butters', name:'Butters',     body:'#f2d4b4', head:'#f8dcbe', eyes:'#148', glow:'#fff', accent:'#d4a878', hair:'#f0d060', outfit:'southpark', outfitA:'#8ac8e0', outfitB:'#e0c880', hat:'none',      pants:'#c0a040'},
      {id:'sp_chef',    name:'Chef',        body:'#6a4832', head:'#744e36', eyes:'#000', glow:'#fc8', accent:'#4a3424', hair:'#1a0a06', outfit:'southpark', outfitA:'#c02020', outfitB:'#2040a0', hat:'chef',      pants:'#1a3870'},
  ]},
  { id:'arachnid',  name:'Arachnid',  description:'Eight-legged stalkers from web-worlds', bodyType:'spider', skins:[
      {id:'arach_black', name:'Widow',        body:'#1a1018',  head:'#2a1828',  eyes:'#f00', glow:'#f44', accent:'#0a0408'},
      {id:'arach_wolf',  name:'Wolf Spider',  body:'#6a5030',  head:'#806040',  eyes:'#ff0', glow:'#fa4', accent:'#402818'},
      {id:'arach_jump',  name:'Jumping Hunter',body:'#4a3860', head:'#6048a0',  eyes:'#0ff', glow:'#a8f', accent:'#2a1830'},
      {id:'arach_venom', name:'Venomweaver',  body:'#2a6040',  head:'#40a060',  eyes:'#ff8', glow:'#8f8', accent:'#184028'},
  ]},
];
// Mutate each skin in-place so race.skins[i] also has bodyType + race (used by preview rendering).
ALIEN_RACES.forEach(r => { r.skins.forEach(s => { s.bodyType = r.bodyType; s.race = r.id; }); });
// Flatten for save/load compatibility and lookup
export const ALIEN_SKINS = ALIEN_RACES.flatMap(r => r.skins);
