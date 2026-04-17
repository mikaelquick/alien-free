export const CREW_BONUSES = {
  commander:{name:'Tactical Command',desc:'+10% score per level',apply:(lv)=>{/*applied at score gain*/}},
  scientist:{name:'Specimen Analysis',desc:'+1 beam width per level',apply:(lv)=>{/*applied in beam calc*/}},
  pilot:{name:'Evasive Maneuvers',desc:'+5% speed per level',apply:(lv)=>{/*applied in movement*/}},
  engineer:{name:'Hull Reinforcement',desc:'+10 max hull per level',apply:(lv)=>{/*applied in damage calc*/}},
};
