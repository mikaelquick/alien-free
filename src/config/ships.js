// --- SHIP TYPES & PAINTS ---
// Organized by ship type. Each type has multiple paint/color variants.
export const SHIP_TYPES = [
  {id:'saucer',  name:'Saucer',       description:'Classic disc-shaped UFO'},
  {id:'xwing',   name:'X-Fighter',    description:'Four-winged starfighter'},
  {id:'tie',     name:'Twin-Ion',     description:'Imperial interceptor'},
  {id:'falcon',  name:'Freighter',    description:'Modified smuggler ship'},
  {id:'wedge',   name:'Wedge',        description:'Triangular capital ship'},
  {id:'rocket',  name:'Rocket',       description:'Retro finned rocket'},
  {id:'shuttle', name:'Shuttle',      description:'Orbital shuttle'},
  {id:'scout',   name:'Scout Dart',   description:'Agile interceptor'},
  {id:'bomber',  name:'Bomber',       description:'Heavy twin-pod'},
  {id:'organic', name:'Bio-Ship',     description:'Living organic vessel'},
  {id:'crystal', name:'Crystal Ship', description:'Faceted crystalline hull'},
  {id:'arrowhead',name:'Arrowhead',   description:'Sharp triangular raider'},
  {id:'cargo',   name:'Cargo Hauler', description:'Blocky industrial transport'},
];

export const SHIP_PAINTS = [
  {id:'default',name:'Classic Saucer',color:'#bbb',accent:'#888',trail:'#0f0',cost:0,ship:'saucer'},
  {id:'stealth',name:'Shadow Saucer',color:'#333',accent:'#111',trail:'#060',cost:0,ship:'saucer'},
  {id:'crimson',name:'Crimson Saucer',color:'#c33',accent:'#811',trail:'#f44',cost:0,ship:'saucer'},
  {id:'ice',name:'Frost Saucer',color:'#8cf',accent:'#469',trail:'#4df',cost:0,ship:'saucer'},
  {id:'gold',name:'Golden Saucer',color:'#da0',accent:'#a80',trail:'#ff0',cost:0,ship:'saucer'},
  {id:'plasma',name:'Plasma Saucer',color:'#c4f',accent:'#82c',trail:'#f0f',cost:0,ship:'saucer'},
  {id:'lava',name:'Magma Saucer',color:'#f64',accent:'#a30',trail:'#f80',cost:0,ship:'saucer'},
  // Star Wars-inspired variants
  {id:'xwing',name:'X-Fighter',color:'#d8d0b0',accent:'#8a2020',trail:'#f44',cost:0,ship:'xwing'},
  {id:'tie',name:'Twin-Ion',color:'#444',accent:'#222',trail:'#4af',cost:0,ship:'tie'},
  {id:'falcon',name:'Smuggler Freighter',color:'#cac0a0',accent:'#6a6050',trail:'#4df',cost:0,ship:'falcon'},
  {id:'star_destroyer',name:'Imperial Wedge',color:'#8a8f95',accent:'#4a5055',trail:'#aaf',cost:0,ship:'wedge'},
  // Other sci-fi
  {id:'rocket',name:'Retro Rocket',color:'#e8e8e8',accent:'#c00',trail:'#fa0',cost:0,ship:'rocket'},
  {id:'shuttle',name:'Orbital Shuttle',color:'#f0f0f0',accent:'#224',trail:'#ff8',cost:0,ship:'shuttle'},
  // Scout
  {id:'scout_std',name:'Scout Dart',color:'#9ef',accent:'#258',trail:'#0ff',cost:0,ship:'scout'},
  {id:'scout_red',name:'Red Dart',color:'#f88',accent:'#622',trail:'#f44',cost:0,ship:'scout'},
  // Bomber
  {id:'bomber_std',name:'Heavy Bomber',color:'#776',accent:'#332',trail:'#f80',cost:0,ship:'bomber'},
  {id:'bomber_toxic',name:'Toxic Bomber',color:'#8c4',accent:'#251',trail:'#cf0',cost:0,ship:'bomber'},
  // Bio-ship
  {id:'organic_green',name:'Living Hive',color:'#6a4',accent:'#341',trail:'#afa',cost:0,ship:'organic'},
  {id:'organic_purple',name:'Pulsing Womb',color:'#a4c',accent:'#418',trail:'#f0f',cost:0,ship:'organic'},
  // Crystal
  {id:'crystal_cyan',name:'Cyan Prism',color:'#9ff',accent:'#36a',trail:'#6ff',cost:0,ship:'crystal'},
  {id:'crystal_pink',name:'Rose Prism',color:'#f9c',accent:'#a48',trail:'#f8f',cost:0,ship:'crystal'},
  // Arrowhead
  {id:'arrow_black',name:'Void Arrowhead',color:'#222',accent:'#666',trail:'#a0f',cost:0,ship:'arrowhead'},
  {id:'arrow_white',name:'Pale Arrowhead',color:'#eee',accent:'#bbb',trail:'#8cf',cost:0,ship:'arrowhead'},
  // Cargo
  {id:'cargo_rust',name:'Rusty Hauler',color:'#a62',accent:'#531',trail:'#fa0',cost:0,ship:'cargo'},
  {id:'cargo_blue',name:'Navy Hauler',color:'#468',accent:'#235',trail:'#6af',cost:0,ship:'cargo'},
];
