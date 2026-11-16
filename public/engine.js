/* CSPIRE//ARENA 0.5.6 — deterministic, dependency-free simulation.
 * Shared without modification by the browser and authoritative Node server.
 * Configurations contain data only: no player-supplied code is executed.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.CSpireArena = api; root.LineArena = api; } // Legacy API alias for saved integrations.
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = '0.5.6';
  const CHASSIS_HP=300, MAX_BOTS=8;
  // Retire a missed shot only after its head and exhaust leave the fixed 0..800 view.
  const PROJECTILE_BOUNDS=Object.freeze({min:-32,max:832});
  const SPAWNS=Object.freeze([{x:190,y:400,angle:0},{x:610,y:400,angle:Math.PI},
    {x:400,y:190,angle:Math.PI/2},{x:400,y:610,angle:-Math.PI/2}]);
  const BOUNDS = Object.freeze({min:84,max:716,size:632});
  const WALL_HEIGHT=42, WALL_HP=150, MAX_IMPACT_DAMAGE=72, SEGMENTS=12;
  const EXIT_CLEARANCE=8, EXIT_DURATION=.65, STUCK_WINDOW=.65, RECOVERY_SECONDS=1.0;
  const DESTRUCTION_FADE_SECONDS=3, WRECK_SCATTER_SECONDS=.9;
  const STEP=1/60, MAX_SECONDS=120, START_COUNTDOWN_SECONDS=5, MAX_RULES=12, MAX_TOOLS=6, BUDGET=200;
  // Chassis HP is identical for every build. Armor still strengthens individual panels.
  // Component durability retains the v0.4 balance. Walls are slightly softer in 0.5.6.
  const CHASSIS_HP_MULTIPLIER=1.5, COMPONENT_HP_MULTIPLIER=1.35, DURABILITY_MULTIPLIER=2;
  const TOOL_ENERGY_MULTIPLIER=.855;
  // Longer streams distribute less total damage; cooldowns and range are unchanged.
  const MACHINEGUN_ROUNDS=12, MACHINEGUN_INTERVAL=.1, FLIPPER_LIFT_MULTIPLIER=.6375;
  const MAX_BONUS_TOOLS=2, REPAIR_FRACTION=.30, PART_REPAIR_FRACTION=.25, SUPPLY_INTERVAL=30, PICKUP_COOLDOWN=10;
  const HAZARDS=Object.freeze({
    fire:{label:'Fire vent',damage:30,partDamage:13,height:48,period:6,duty:.52,color:'#e79a74'},
    grinder:{label:'Grinder',damage:58,partDamage:40,height:14,period:5,duty:.4,drag:1.6,color:'#ae9bd5'},
    spikes:{label:'Spikes',damage:64,partDamage:48,height:18,period:5,duty:.28,color:'#dd8794'},
    electric:{label:'Tesla pad',damage:22,partDamage:18,height:30,period:7,duty:.38,drain:24,drag:.8,color:'#82b8f2'},
    acid:{label:'Acid pool',damage:18,partDamage:25,height:8,period:0,duty:1,color:'#c0d37c'}
  });
  const BODIES=Object.freeze({
    wedge:{label:'Wedge',cost:22,mass:14,radius:24,turn:1.12},
    box:{label:'Rectangle',cost:26,mass:18,radius:25,turn:1},
    hex:{label:'Hexagon',cost:30,mass:21,radius:26,turn:.9},
    circle:{label:'Circle',cost:24,mass:15,radius:23,turn:1.2},
    diamond:{label:'Manta',cost:24,mass:15,radius:24,turn:1.16},
    octagon:{label:'Bastion',cost:32,mass:23,radius:27,turn:.86},
    capsule:{label:'Twin Hull',cost:28,mass:19,radius:26,turn:1.04},
    cross:{label:'Cross',cost:30,mass:21,radius:26,turn:.94}
  });
  // Retain the v0.5.5 chassis IDs and balance so saved robots remain compatible.
  // Melee contact follows these outlines; movement still uses the chassis radius.
  const BODY_GEOMETRY=Object.freeze({
    diamond:{outline:[[1,0],[.44,-.26],[.12,-.72],[-.5,-.96],[-.34,-.46],[-.86,-.58],[-.66,-.22],[-1,-.12],[-.75,0],[-1,.12],[-.66,.22],[-.86,.58],[-.34,.46],[-.5,.96],[.12,.72],[.44,.26]],
      ribs:[[[.64,0],[-.12,-.28],[-.5,-.78]],[[.64,0],[-.12,.28],[-.5,.78]],[[-.68,-.18],[-.3,0],[-.68,.18]]]},
    octagon:{outline:[[1,-.28],[1,.28],[.78,.28],[.78,.68],[.52,.94],[.2,.94],[.2,.72],[-.2,.72],[-.2,.94],[-.6,.94],[-.94,.6],[-.94,.22],[-.76,.22],[-.76,-.22],[-.94,-.22],[-.94,-.6],[-.6,-.94],[-.2,-.94],[-.2,-.72],[.2,-.72],[.2,-.94],[.52,-.94],[.78,-.68],[.78,-.28]],
      ribs:[[[-.65,-.43],[-.44,-.64],[.48,-.64],[.6,-.44]],[[-.65,.43],[-.44,.64],[.48,.64],[.6,.44]],[[.57,-.27],[.73,0],[.57,.27]]]},
    capsule:{outline:[[-.96,-.68],[-.72,-.9],[.68,-.9],[.98,-.62],[.82,-.36],[.35,-.36],[.35,-.16],[.55,0],[.35,.16],[.35,.36],[.82,.36],[.98,.62],[.68,.9],[-.72,.9],[-.96,.68],[-.96,.46],[-.45,.36],[-.45,-.36],[-.96,-.46]],
      ribs:[[[-.72,-.62],[.59,-.62],[.76,-.56]],[[-.72,.62],[.59,.62],[.76,.56]],[[-.24,-.34],[-.24,.34]],[[.12,-.34],[.12,.34]]]}
  });
  const BATTLE_MODES=Object.freeze({
    ffa:{label:'Free-for-all',teams:0,teamSize:1,count:0},
    '2v2':{label:'2 vs 2',teams:2,teamSize:2,count:4},
    '3v3':{label:'3 vs 3',teams:2,teamSize:3,count:6},
    '4v4':{label:'4 vs 4',teams:2,teamSize:4,count:8},
    '2v2v2':{label:'2 vs 2 vs 2',teams:3,teamSize:2,count:6},
    '2v2v2v2':{label:'2 vs 2 vs 2 vs 2',teams:4,teamSize:2,count:8}
  });
  function modeInfo(mode='ffa'){
    if(typeof mode!=='string'||!Object.prototype.hasOwnProperty.call(BATTLE_MODES,mode))throw new RangeError('Unknown battle mode.');
    return BATTLE_MODES[mode];
  }
  function teamForSlot(index,mode='ffa'){const m=modeInfo(mode);return m.teams?index%m.teams:null;}
  function teamName(id){return 'Team '+String.fromCharCode(65+id);}
  function areAllies(a,b){return !!a&&!!b&&a.team!=null&&b.team===a.team;}
  function isEnemy(a,b){return !!a&&!!b&&a.id!==b.id&&!areAllies(a,b);}
  // Damage is the nominal per-use budget; sustained tools spend it only in contact.
  const WEAPONS=Object.freeze({
    ram:{label:'Ram',cost:16,mass:4,cooldown:2.7,damage:16,wallDamage:34,hp:42,energy:20,reach:30,width:9,kick:300,penetration:.1,partFactor:1,description:'Heavy horizontal push. Good against walls.'},
    flipper:{label:'Flipper',cost:24,mass:5,cooldown:3.7,damage:7,wallDamage:8,hp:38,energy:25,reach:30,width:12,kick:123.75,penetration:0,partFactor:.8,description:'Lifts and pushes opponents. Low structural damage.'},
    plow:{label:'Plow',cost:12,mass:3,cooldown:1.4,damage:8,wallDamage:12,hp:56,energy:12,reach:25,width:16,kick:140,penetration:0,partFactor:.75,description:'Wide, durable blade. Frequent low-cost pushes.'},
    hammer:{label:'Hammer',cost:22,mass:5.5,cooldown:4.4,damage:30,wallDamage:46,hp:36,energy:28,reach:34,width:10,kick:95,penetration:.32,partFactor:1.25,description:'High damage to armor and walls. Long recovery.'},
    saw:{label:'Saw',cost:18,mass:3.5,cooldown:.85,damage:12,wallDamage:7,hp:29,energy:9,reach:24,width:10,kick:42,penetration:.1,partFactor:1.6,description:'Sustained contact cutting. Damage shown for full contact through one cooldown.'},
    drill:{label:'Drill',cost:20,mass:4,cooldown:1.8,damage:18,wallDamage:26,hp:32,energy:15,reach:36,width:5,kick:90,penetration:.55,partFactor:1.25,description:'Sustained narrow contact with armor penetration. Damage shown for full contact through one cooldown.'},
    flamethrower:{label:'Flamethrower',cost:26,mass:5,cooldown:3.2,damage:22,wallDamage:8.5,hp:34,energy:24,reach:135,width:14,kick:12,penetration:.25,partFactor:1.1,mode:'cone',description:'Sustained yellow flame stream. Damage shown for full exposure to one emission.'},
    machinegun:{label:'Machine gun',cost:28,mass:5,cooldown:1.25,damage:15,wallDamage:7.5,hp:30,energy:16,reach:300,width:2,kick:22,penetration:.15,partFactor:1,mode:'burst',description:'Twelve-round stream over 1.1 s. Damage shown for the complete burst. Repeats when ready if the active rule allows firing.'},
    rocket:{label:'Rocket launcher',cost:34,mass:7,cooldown:6,damage:48,wallDamage:58,hp:32,energy:38,reach:380,width:4,kick:145,penetration:.3,partFactor:1.2,mode:'rocket',description:'Explosive projectile. Damage shown for a direct hit; splash falls off with distance.'}
  });
  // Internal matchup balance. Deliberately absent from public tool cards and stats.
  // Tool targets use their exact type; armor, drives and exposed core use chassis.
  const MATCHUPS=Object.freeze({
    ram:{chassis:1.08,hammer:1.25,plow:.72,rocket:1.15},
    flipper:{chassis:.9,ram:1.25,drill:.8},
    plow:{chassis:1.1,drill:1.2,hammer:.75},
    hammer:{chassis:1.2,plow:1.35,saw:.85},
    saw:{chassis:.9,flipper:1.4,machinegun:1.25,plow:.65},
    drill:{chassis:1.25,ram:1.3,saw:.8},
    flamethrower:{chassis:.85,machinegun:1.4,rocket:1.25,hammer:.7},
    machinegun:{chassis:.8,flamethrower:1.35,saw:1.3,plow:.6},
    rocket:{chassis:1.2,hammer:1.3,ram:.8}
  });
  function matchup(type,component){const key=component?.kind==='tool'?component.type:'chassis';return MATCHUPS[type]?.[key]??1;}
  const CONDITIONS=Object.freeze({
    hazard:'An active hazard is nearby',range:'Opponent is in tool range',near:'Opponent is nearby',front:'Opponent is in front',
    edge:'I am near the edge',low:'My integrity is low',charged:'I have enough energy',
    ready:'A tool is ready',damaged:'A component is broken',repair:'Repair kit nearby',pickup:'Useful bonus nearby',bonus:'I have a bonus tool',far:'Opponent is far away',always:'Always',void:'VOID · Skip this rule'
  });
  const ACTIONS=Object.freeze({
    avoid:'Avoid the active hazard',weapon:'Activate all tools',tool1:'Use tool 1',tool2:'Use tool 2',
    tool3:'Use tool 3',tool4:'Use tool 4',tool5:'Use tool 5',tool6:'Use tool 6',wall:'Attack nearest wall',push:'Chase and push',
    charge:'Charge',orbit:'Circle the opponent',center:'Return to center',retreat:'Retreat from opponent',brake:'Brake',
    collect:'Collect nearest bonus',repair:'Find a repair kit',bonus:'Activate bonus tools'
  });
  const MOUNTS=Object.freeze({front:0,right:Math.PI/2,back:Math.PI,left:-Math.PI/2});
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const num=(n,d)=>typeof n==='number'&&Number.isFinite(n)?n:d;
  const has=(o,k)=>typeof k==='string'&&Object.prototype.hasOwnProperty.call(o,k);
  const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const degrees=n=>((n%360)+360)%360;
  const defaultRules=()=>[{when:'hazard',do:'avoid'},{when:'repair',do:'repair'},
    {when:'range',do:'weapon'},{when:'near',do:'weapon'},{when:'edge',do:'center'},{when:'pickup',do:'collect'},
    {when:'far',do:'charge'},{when:'always',do:'push'}];

  function toolStats(t) {
    const d=WEAPONS[t.type]||WEAPONS.ram,p=clamp(Math.round(num(t.power,1)),1,3)-1;
    return {cost:d.cost+6*p,mass:d.mass+.8*p,damage:d.damage*(1+.5*p),
      wallDamage:d.wallDamage*(1+.5*p),cooldown:+(d.cooldown*(1+.4*p)).toFixed(2),
      hp:Math.round((d.hp+8*p)*COMPONENT_HP_MULTIPLIER)*DURABILITY_MULTIPLIER,energy:Math.round(d.energy*(1+.25*p)*TOOL_ENERGY_MULTIPLIER*100)/100,kick:d.kick*(1+.22*p),
      reach:+(d.reach*(1+.25*p)).toFixed(2),width:d.width,penetration:d.penetration,partFactor:d.partFactor,
      duration:t.type==='flamethrower'?+(1.6+.2*p).toFixed(2):0};
  }
  const toolGeometryCache=new Map(),bodyGeometryCache=new Map();
  function toolScale(){return 1;}
  // Shared with drawing/selection. Coordinates are in the rotated tool's local
  // frame. Power changes performance, never the visible size or contact shape.
  function toolGeometry(t,active=(t.firing||0)>0,contact=false){
    const scale=toolScale(t),key=t.type+':'+scale+':'+!!active;
    let geometry=toolGeometryCache.get(key);
    if(!geometry){
      const ext=active?5:0,rect=(a,b,c,d)=>({polygon:[[a,b],[c,b],[c,d],[a,d]]});
      let head=[],parts=[];
      switch(t.type){
        case 'saw':head=[{circle:[16,0,10]}];parts=[rect(0,-2,16,2),...head];break;
        case 'drill':head=[{polygon:[[7,-6],[32+ext,0],[7,6]]}];parts=[rect(0,-4,7,4),...head];break;
        case 'ram':head=[rect(23+ext,-9,26+ext,9)];parts=[rect(1,-4,11,4),rect(11,-1,23+ext,1),...head];break;
        case 'hammer':head=[rect(22+ext,-9,31+ext,9)];parts=[rect(2,-1,22+ext,2),...head];break;
        case 'flipper':head=[{polygon:[[24+ext,-5],[27+ext,-2],[27+ext,2],[24+ext,5]]}];
          parts=[rect(0,-6,24+ext,-4),rect(0,4,24+ext,6),rect(3,-7,5,7),...head];break;
        case 'plow':head=[{polygon:[[22+ext,-15],[18+ext,0],[22+ext,15]]}];
          parts=[{polygon:[[0,-5],[19+ext,-13],[22+ext,-15],[18+ext,0],[22+ext,15],[19+ext,13],[0,5]]}];break;
        case 'flamethrower':parts=[rect(0,-6,10,6),rect(10,-3,24,3),{polygon:[[24,-5],[30,-4],[30,4],[24,5]]}];break;
        case 'machinegun':parts=[rect(0,-6,13,6),rect(13,-3,32+ext,3),rect(4,6,11,12)];break;
        case 'rocket':parts=[rect(0,-6,24,6),{polygon:[[24,-6],[33,0],[24,6]]},
          {polygon:[[1,-11],[5,-6],[1,-6]]},{polygon:[[1,11],[5,6],[1,6]]}];break;
      }
      const scaled=shapes=>Object.freeze(shapes.map(shape=>Object.freeze(shape.circle?
        {circle:Object.freeze(shape.circle.map(n=>n*scale))}:
        {polygon:Object.freeze(shape.polygon.map(p=>Object.freeze(p.map(n=>n*scale))))})));
      geometry={head:scaled(head),parts:scaled([{circle:[0,0,2.4]},...parts])};toolGeometryCache.set(key,geometry);
    }
    return contact?geometry.head:geometry.parts;
  }
  function normalizeTool(raw,index,body) {
    raw=raw&&typeof raw==='object'?raw:{};
    const radius=BODIES[body].radius;
    return {id:'t'+(index+1),type:has(WEAPONS,raw.type)?raw.type:'ram',
      x:Math.round(clamp(num(raw.x,radius*.65),-radius,radius)*10)/10||0,
      y:Math.round(clamp(num(raw.y,0),-radius,radius)*10)/10||0,
      angle:degrees(Math.round(degrees(num(raw.angle,0))*10)/10),
      power:clamp(Math.round(num(raw.power,1)),1,3)};
  }
  function cost(c) {return BODIES[c.body].cost+c.motor*7+c.armor*6+c.tools.reduce((sum,t)=>sum+toolStats(t).cost,0);}
  function normalizeConfig(raw) {
    raw=raw&&typeof raw==='object'?raw:{};
    const body=has(BODIES,raw.body)?raw.body:'wedge';
    const c={name:String(raw.name||'VECTOR-01').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'VECTOR-01',
      body,motor:clamp(Math.round(num(raw.motor,4)),1,5),armor:clamp(Math.round(num(raw.armor,3)),1,5),tools:[],lines:[],rules:[]};
    if(Array.isArray(raw.tools))c.tools=raw.tools.slice(0,MAX_TOOLS).map((t,i)=>normalizeTool(t,i,body));
    else { // Migrate v1 robots without changing user names, rules, or decorative lines.
      const mount=has(MOUNTS,raw.mount)?raw.mount:'front',angle=MOUNTS[mount];
      c.tools=[normalizeTool({type:has(WEAPONS,raw.weapon)?raw.weapon:'flipper',
        x:Math.cos(angle)*BODIES[body].radius*.65,y:Math.sin(angle)*BODIES[body].radius*.65,
        angle:angle*180/Math.PI,power:1},0,body)];
    }
    // Untrusted imports/server payloads are bounded. The UI rejects over-budget edits
    // instead, so a normal edit never silently removes another mounted tool.
    while(cost(c)>BUDGET){
      if(c.armor>1)c.armor--;else if(c.motor>1)c.motor--;
      else {const heavy=[...c.tools].reverse().find(t=>t.power>1);if(heavy)heavy.power--;else c.tools.pop();}
    }
    if(Array.isArray(raw.lines))c.lines=raw.lines.slice(0,28).filter(l=>Array.isArray(l)&&l.length===4&&l.every(n=>typeof n==='number'&&Number.isFinite(n)))
      .map(l=>l.map(n=>Math.round(clamp(n,-32,32)/2)*2));
    c.rules=Array.isArray(raw.rules)?raw.rules.slice(0,MAX_RULES).filter(r=>r&&has(CONDITIONS,r.when)&&has(ACTIONS,r.do)).map(r=>({when:r.when,do:r.do})):defaultRules();
    if(!c.rules.length)c.rules=defaultRules();
    return c;
  }
  function stats(c) {
    const b=BODIES[c.body],toolMass=c.tools.reduce((sum,t)=>sum+toolStats(t).mass,0);
    return {mass:b.mass+toolMass+c.armor*2.4,radius:b.radius,hp:CHASSIS_HP,
      speed:Math.round(98+c.motor*22-c.armor*3-Math.max(0,toolMass-5)*1.5),
      acceleration:170+c.motor*36,turn:(2.1+c.motor*.24-c.armor*.06)*b.turn,cost:cost(c)};
  }
  const ROBOT_NAMES=Object.freeze(['NOVA','COBALT','TITAN','VIPER','QUARTZ','COMET','RAVEN','PULSE','VORTEX','SPARK','ECHO','BOLT']);
  const robotNameKey=name=>String(name).replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18).toLowerCase();
  function robotName(seed,occupied=[],number=1) {
    seed=Number(seed)>>>0;
    const used=new Set(Array.from(occupied,robotNameKey)),start=seed%ROBOT_NAMES.length,code=seed.toString(36).toUpperCase();
    for(let suffix=clamp(Math.floor(num(number,1)),1,MAX_BOTS);;suffix++)for(let i=0;i<ROBOT_NAMES.length;i++){
      const name=ROBOT_NAMES[(start+i)%ROBOT_NAMES.length]+'-'+code+'-'+String(suffix).padStart(2,'0');
      if(!used.has(robotNameKey(name)))return name;
    }
  }
  function uniqueRobotConfigs(configs) {
    const result=configs.map(normalizeConfig),reserved=new Set(result.map(c=>robotNameKey(c.name))),seen=new Set();
    for(let i=0;i<result.length;i++){
      const c=result[i],key=robotNameKey(c.name);
      if(seen.has(key)){
        // Stable across rounds/reconnects without consuming gameplay randomness.
        let hash=2166136261;for(const ch of key+'#'+i)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
        c.name=robotName(hash,reserved,i+1);reserved.add(robotNameKey(c.name));
      }
      seen.add(key);
    }
    return result;
  }
  function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  // Practice-only generation. Never called by createBattle or the online server:
  // a human blueprint is only normalized, never replaced with a random design.
  function generatePracticeBots(seed,count=3){
    if(!Number.isInteger(count)||count<1||count>=MAX_BOTS)throw new RangeError('Practice requires one to seven AI robots.');
    seed=num(seed,28471)>>>0;
    const random=rng(seed^0xA17B03D5),pick=a=>a[Math.floor(random()*a.length)];
    const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    const names=shuffle(ROBOT_NAMES);
    const ruleSets=[
      defaultRules(),
      [{when:'hazard',do:'avoid'},{when:'range',do:'weapon'},{when:'edge',do:'center'},{when:'repair',do:'repair'},{when:'far',do:'charge'},{when:'always',do:'push'}],
      [{when:'hazard',do:'avoid'},{when:'low',do:'repair'},{when:'range',do:'weapon'},{when:'pickup',do:'collect'},{when:'edge',do:'center'},{when:'always',do:'push'}]
    ];
    return Array.from({length:count},(_,index)=>{
      const body=pick(Object.keys(BODIES)),r=BODIES[body].radius;
      const c={name:names[index]+'-'+seed.toString(36).toUpperCase()+'-'+String(index+1).padStart(2,'0'),body,
        motor:2+Math.floor(random()*4),armor:1+Math.floor(random()*5),tools:[],lines:[],rules:pick(ruleSets).map(x=>({...x}))};
      const targetBudget=150+Math.floor(random()*(BUDGET-149)),desired=2+Math.floor(random()*5);
      const types=shuffle(Object.keys(WEAPONS)),mountRotation=pick([0,0,0,90,180,270]),a=mountRotation*Math.PI/180;
      const mounts=[[.65,0],[.3,-.65],[.3,.65],[-.35,-.65],[-.35,.65],[-.65,0]];
      for(const type of types){
        if(c.tools.length>=desired)break;
        let power=1+Math.floor(random()*3);
        while(power>1&&cost(c)+toolStats({type,power}).cost>targetBudget)power--;
        if(cost(c)+toolStats({type,power}).cost>targetBudget)continue;
        const [mx,my]=mounts[c.tools.length];
        c.tools.push({type,power,x:r*(mx*Math.cos(a)-my*Math.sin(a)),y:r*(mx*Math.sin(a)+my*Math.cos(a)),angle:mountRotation});
      }
      // Spend remaining points on randomly chosen power/motor/armor upgrades,
      // rather than giving AI hidden stats or letting normalization trim builds.
      for(let attempt=0;attempt<18;attempt++){
        const choices=[];
        if(c.motor<5&&cost(c)+7<=targetBudget)choices.push(()=>c.motor++);
        if(c.armor<5&&cost(c)+6<=targetBudget)choices.push(()=>c.armor++);
        for(const t of c.tools)if(t.power<3&&cost(c)+6<=targetBudget)choices.push(()=>t.power++);
        if(!choices.length)break;pick(choices)();
      }
      const motif=pick([0,1,2]);
      c.lines=motif===0?[[-12,-8,0,8],[0,8,12,-8]]:motif===1?[[-12,0,0,-12],[0,-12,12,0],[12,0,0,12],[0,12,-12,0]]:[[-10,-10,10,10],[-10,10,10,-10]];
      return normalizeConfig(c);
    });
  }
  function createPracticeBattle(player,count=4,seed=28471,battleMode='ffa'){
    if(!Number.isInteger(count)||count<2||count>MAX_BOTS)throw new RangeError('A battle requires two to eight robots.');
    const state=createBattle(uniqueRobotConfigs([player,...generatePracticeBots(seed,count-1)]),seed,battleMode);
    state.robots.forEach((r,i)=>r.controller=i===0?'player':'bot');
    return state;
  }
  // Keep established duel/4-player seats; larger rosters use equally spaced
  // points at the same distance from center, all facing inward. These positions
  // are also used by field generation, so no start can overlap a hazard.
  function spawnsFor(count,battleMode='ffa'){
    if(!Number.isInteger(count)||count<2||count>MAX_BOTS)throw new RangeError('A battle requires two to eight robots.');
    const m=modeInfo(battleMode);
    if(m.count&&count!==m.count)throw new RangeError(m.label+' requires exactly '+m.count+' robots.');
    if(m.teams){
      return Array.from({length:count},(_,i)=>{
        const team=teamForSlot(i,battleMode),member=Math.floor(i/m.teams);
        let x,y;
        if(m.teams===2){x=team===0?190:610;y=400+(member-(m.teamSize-1)/2)*(m.teamSize===4?112:150);}
        else {const a=Math.PI+Math.PI*2*team/m.teams,offset=(member-.5)*140;
          x=400+215*Math.cos(a)-offset*Math.sin(a);y=400+215*Math.sin(a)+offset*Math.cos(a);}
        return {x,y,angle:Math.atan2(400-y,400-x)};
      });
    }
    if(count<=4)return SPAWNS.slice(0,count).map(p=>({...p}));
    return Array.from({length:count},(_,i)=>{
      const a=Math.PI+Math.PI*2*i/count,x=400+225*Math.cos(a),y=400+225*Math.sin(a);
      return {x,y,angle:Math.atan2(400-y,400-x)};
    });
  }
  function createRobot(config,i,spawn=SPAWNS[i]) {
    const c=normalizeConfig(config),s=stats(c),parts=[];
    ['Front armor','Right armor','Rear armor','Left armor'].forEach((label,j)=>{
      const a=j*Math.PI/2,hp=Math.round((22+c.armor*10)*COMPONENT_HP_MULTIPLIER)*DURABILITY_MULTIPLIER;
      parts.push({id:'armor'+j,kind:'armor',label,x:Math.cos(a)*s.radius*.78,y:Math.sin(a)*s.radius*.78,radius:10,health:hp,maxHealth:hp,broken:false,flash:0});
    });
    for(const side of [-1,1]){
      const hp=Math.round((32+c.motor*4)*COMPONENT_HP_MULTIPLIER)*DURABILITY_MULTIPLIER;
      parts.push({id:side<0?'driveL':'driveR',kind:'drive',label:side<0?'Left drive':'Right drive',x:-1,y:side*(s.radius*.76+6),radius:9,health:hp,maxHealth:hp,broken:false,flash:0});
    }
    const tools=c.tools.map(t=>{const st=toolStats(t);return {...t,kind:'tool',label:WEAPONS[t.type].label,
      stats:st,radius:8,health:st.hp,maxHealth:st.hp,cooldown:0,broken:false,flash:0,firing:0};});
    return {id:i,controller:'player',config:c,stats:s,...spawn,vx:0,vy:0,z:0,vz:0,
      health:s.hp,energy:100,energyCursor:0,parts,tools,dashCooldown:0,dash:0,action:'push',ruleIndex:-1,
      alive:true,reason:null,eliminatedAt:null,flash:0,lastHazard:-10,peakZ:0,repairsCollected:0,bonusCollected:0,pickupCooldown:0,exit:null,recoveryUntil:0,recoveries:0,driveIntent:0,
      motionProbe:{x:spawn.x,y:spawn.y,time:0}};
  }
  // Randomness is consumed only at creation. Identical seeds replay exactly,
  // including pulse timing, hazard placement, supply waves and tool drops.
  function createField(seed,count=2,battleMode='ffa') {
    const rand=rng(seed),hazards=[],pickups=[];
    const m=modeInfo(battleMode),starts=m.teams?spawnsFor(count,battleMode):count>4?spawnsFor(count):SPAWNS.slice(0,count>2?4:2),quarterTurns=(count>2&&count<=4)||m.teams===4;
    const types=Object.keys(HAZARDS);
    for(let i=types.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[types[i],types[j]]=[types[j],types[i]];}
    function pairPosition(radius,occupied,clearance,spawnClear,fourWay=quarterTurns) {
      const valid=(x,y)=>{
        const pair=fourWay?[{x,y,r:radius},{x:800-y,y:x,r:radius},{x:800-x,y:800-y,r:radius},{x:y,y:800-x,r:radius}]
          :[{x,y,r:radius},{x:800-x,y:800-y,r:radius}];
        for(let i=0;i<pair.length;i++)for(let j=i+1;j<pair.length;j++)
          if(Math.hypot(pair[i].x-pair[j].x,pair[i].y-pair[j].y)<radius*2+clearance)return null;
        for(const a of pair){
          if(starts.some(b=>Math.hypot(a.x-b.x,a.y-b.y)<spawnClear+radius))return null;
          if(occupied.some(b=>Math.hypot(a.x-b.x,a.y-b.y)<radius+b.r+clearance))return null;
        }
        return pair;
      };
      const lo=BOUNDS.min+radius+32,hi=BOUNDS.max-radius-32;
      for(let n=0;n<2500;n++){
        const pair=valid(Math.round(lo+rand()*(hi-lo)),Math.round(lo+rand()*(hi-lo)));
        if(pair)return pair;
      }
      // A bounded deterministic fallback, never an overlapping or unsafe spawn.
      for(let y=lo;y<=hi;y+=12)for(let x=lo;x<=hi;x+=12){const pair=valid(x,y);if(pair)return pair;}
      return null;
    }
    // Leave more open fighting space: 4–6 hazards in duels, 4 in larger fields.
    // Preserve the mode's symmetry and the initial roster's fixed density.
    const pairCount=quarterTurns?1:count>2?2:2+Math.floor(rand()*2);
    for(let i=0;i<pairCount;i++){
      const type=types[i],d=HAZARDS[type],r=24+Math.floor(rand()*11),phase=rand()*8;
      // Grinder timing is fixed at 2 s cutting / 3 s cooling; keep its seeded
      // phase and layout without adding a random draw to the former static trap.
      const period=type==='grinder'?d.period:d.period?+(d.period*(.85+rand()*.3)).toFixed(2):0;
      const pair=pairPosition(r,hazards,count>2?26:38,count>2?82:118);
      if(!pair)continue;
      for(const at of pair)hazards.push({id:hazards.length,type,...at,phase,period,duty:d.duty});
    }
    // Every mode gets only four supplies per wave: one mirrored pair of each
    // kind. Waves stay at 0, 30, 60 and 90 seconds; old unclaimed items expire.
    const weaponTypes=Object.keys(WEAPONS);
    for(let wave=0;wave*SUPPLY_INTERVAL<MAX_SECONDS;wave++){
      const placed=[...hazards],spawnAt=wave*SUPPLY_INTERVAL;
      for(const kind of ['repair','tool']){
        const pair=pairPosition(12,placed,count>2?35:78,count>2?35:58,false);
        if(!pair)continue;
        const toolType=weaponTypes[Math.floor(rand()*weaponTypes.length)],power=1+(wave>0&&rand()>.55?1:0);
        for(const at of pair){
          pickups.push({id:pickups.length,kind,...at,toolType:kind==='tool'?toolType:null,power:kind==='tool'?power:0,
            spawnAt,expiresAt:spawnAt+SUPPLY_INTERVAL,collectedBy:null,collectedAt:null,announced:spawnAt===0});
          placed.push(at);
        }
      }
    }
    return {hazards,pickups};
  }
  // Backward-compatible duel helper; new games use createBattle with 2–8 configs.
  function createMatch(a,b,seed=28471){return createBattle([a,b],seed);}
  function createBattle(configs,seed=28471,battleMode='ffa') {
    if(!Array.isArray(configs)||configs.length<2||configs.length>MAX_BOTS)
      throw new RangeError('A battle requires two to eight robots.');
    const m=modeInfo(battleMode),starts=spawnsFor(configs.length,battleMode);
    seed=num(seed,28471)>>>0;const walls=[];
    for(let side=0;side<4;side++)for(let i=0;i<SEGMENTS;i++)walls.push({side,i,health:WALL_HP,maxHealth:WALL_HP,broken:false,hits:0,flash:0});
    return {version:VERSION,mode:battleMode,teamCount:m.teams,seed,tick:0,time:0,status:'running',result:null,walls,...createField(seed,configs.length,battleMode),
      robots:configs.map((c,i)=>({...createRobot(c,i,starts[i]),team:teamForSlot(i,battleMode)})),events:[],eventCounter:0,debris:[],projectiles:[],flames:[],effects:[],projectileCounter:0,flameCounter:0};
  }
  function nearestEnemy(s,r){
    let result=null,best=Infinity;
    for(const e of s.robots){if(!isEnemy(r,e)||!e.alive||e.health<=0)continue;
      const d=Math.hypot(e.x-r.x,e.y-r.y);if(d<best){best=d;result=e;}}
    return result;
  }
  // Rank survivors by exact chassis health. Ring-outs and forfeits always rank
  // below survivors, even when they still have more HP. Eliminated bots rank by
  // survival time, then HP for eliminations in the same simulation instant.
  // Never round health or use an epsilon to decide a tie; IDs only stabilize
  // the display order of tied rows and cannot select a winner.
  function buildTeamStandings(s){
    if(!s.teamCount)return [];
    const rows=Array.from({length:s.teamCount},(_,id)=>{
      const members=s.robots.filter(r=>r.team===id),alive=members.filter(r=>r.alive);
      return {id,name:teamName(id),alive:alive.length>0,aliveCount:alive.length,size:members.length,
        health:alive.reduce((sum,r)=>sum+clamp(num(r.health,0),0,r.stats.hp),0),
        maxHealth:members.reduce((sum,r)=>sum+r.stats.hp,0),members:members.map(r=>r.id),
        survived:Math.min(MAX_SECONDS,Math.max(0,...members.map(r=>r.alive?s.time:num(r.eliminatedAt,s.time))))};
    });
    const cmp=(a,b)=>Number(b.alive)-Number(a.alive)||b.health-a.health||(!a.alive&&!b.alive?b.survived-a.survived:0);
    rows.sort((a,b)=>cmp(a,b)||a.id-b.id);
    rows.forEach((r,i)=>{r.rank=i&&cmp(r,rows[i-1])===0?rows[i-1].rank:i+1;r.winner=r.rank===1;});
    rows.forEach(r=>r.tied=rows.some(o=>o!==r&&o.rank===r.rank));
    return rows;
  }
  function buildStandings(s){
    const rows=s.robots.map(r=>({id:r.id,team:r.team??null,name:r.config.name,alive:r.alive,
      health:clamp(num(r.health,0),0,r.stats.hp),maxHealth:r.stats.hp,
      survived:Math.min(MAX_SECONDS,r.alive?s.time:num(r.eliminatedAt,s.time)),
      reason:r.reason||'Survivor'}));
    const compare=(a,b)=>Number(b.alive)-Number(a.alive)||
      (!a.alive&&!b.alive?b.survived-a.survived:0)||b.health-a.health;
    rows.sort((a,b)=>compare(a,b)||a.id-b.id);
    rows.forEach((row,i)=>{row.rank=i&&compare(row,rows[i-1])===0?rows[i-1].rank:i+1;row.winner=row.rank===1;});
    for(const row of rows)row.tied=rows.some(other=>other!==row&&other.rank===row.rank);
    if(s.teamCount){
      const teams=buildTeamStandings(s),byId=new Map(teams.map(t=>[t.id,t]));
      rows.forEach(r=>{const t=byId.get(r.team);r.individualRank=r.rank;r.rank=t.rank;r.winner=t.winner;r.tied=t.tied;});
      rows.sort((a,b)=>a.rank-b.rank||a.team-b.team||compare(a,b)||a.id-b.id);
    }
    return rows;
  }
  function finishIfNeeded(s){
    if(s.status==='finished')return;
    const alive=s.robots.filter(r=>r.alive);
    const remaining=s.teamCount?new Set(alive.map(r=>r.team)).size:alive.length;
    if(remaining>1&&s.time<MAX_SECONDS)return;
    const standings=buildStandings(s),winners=standings.filter(r=>r.winner).map(r=>r.id);
    const teamStandings=buildTeamStandings(s),winnerTeams=teamStandings.filter(t=>t.winner).map(t=>t.id);
    const trigger=remaining===1?'survivor':remaining===0?'elimination':'time';
    const draw=s.teamCount?winnerTeams.length>1:winners.length>1;
    const subject=s.teamCount?'team':'robot';
    const reason=trigger==='survivor'?'Last '+subject+' standing':trigger==='time'
      ?(draw?'Time expired · exact HP tie':s.teamCount?'Time expired · highest surviving team HP':'Time expired · highest remaining HP')
      :(draw?'Final elimination · exact HP tie':'Final elimination · last '+subject+' eliminated');
    const result={winner:draw?null:winners[0],winners,draw,reason,trigger,
      winnerTeam:s.teamCount&&!draw?winnerTeams[0]:null,winnerTeams,teamStandings,
      elapsed:Math.min(s.time,MAX_SECONDS),standings};
    // Stop new emissions at the end signal, but never erase a shot already in
    // flight. Its impact can still affect the final ranking. Freeze the match
    // clock and AI while those shots and committed ring-out animations settle.
    s.projectiles=(s.projectiles||[]).filter(p=>!p.queued&&!(p.delay>0));
    s.flames=[];
    for(const r of s.robots)for(const t of r.tools){t.firing=0;if(t.contactTime)t.contactTime=0;}
    if(s.projectiles.length||s.robots.some(r=>r.exit&&!r.exit.done)){
      s.pendingResult=result;s.settleElapsed=s.settleElapsed||0;return;
    }
    s.status='finished';s.result=result;s.pendingResult=null;
  }
  function footprint(r){
    // Conservative visible extents, including mounted tools and decorative lines.
    // Used for presentation ONLY: it never enlarges the collision body.
    let minX=-r.stats.radius,maxX=r.stats.radius,minY=-r.stats.radius,maxY=r.stats.radius;
    const include=(x,y)=>{const p=worldPoint({...r,x:0,y:0},x,y);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);};
    for(const x of [-r.stats.radius,r.stats.radius])for(const y of [-r.stats.radius,r.stats.radius])include(x,y);
    for(const side of [-1,1])for(const x of [-11,8])for(const dy of [-4,4])include(x,side*(r.stats.radius*.76+6)+dy);
    for(const line of r.config.lines){include(line[0],line[1]);include(line[2],line[3]);}
    for(const t of r.tools){
      const a=t.angle*Math.PI/180,co=Math.cos(a),si=Math.sin(a),scale=toolScale(t);
      for(const x of [-6,44])for(const y of [-18,18])include(t.x+(x*co-y*si)*scale,t.y+(x*si+y*co)*scale);
    }
    return {minX,maxX,minY,maxY};
  }
  function beginRingOut(s,r){
    if(!r.alive||r.exit)return false;
    const distances=[BOUNDS.min-r.y,r.x-BOUNDS.max,r.y-BOUNDS.max,BOUNDS.min-r.x];
    const side=distances.indexOf(Math.max(...distances));if(distances[side]<=0)return false;
    const f=footprint(r),x=r.x,y=r.y;
    let endX=x,endY=y;
    if(side===0)endY=Math.min(y,BOUNDS.min-f.maxY-EXIT_CLEARANCE);
    if(side===1)endX=Math.max(x,BOUNDS.max-f.minX+EXIT_CLEARANCE);
    if(side===2)endY=Math.max(y,BOUNDS.max-f.minY+EXIT_CLEARANCE);
    if(side===3)endX=Math.min(x,BOUNDS.min-f.maxX-EXIT_CLEARANCE);
    r.alive=false;r.eliminatedAt=s.time;r.reason=r.z>WALL_HEIGHT?'Aerial ring-out':'Out of the arena';
    r.exit={side,startX:x,startY:y,startZ:r.z,endX,endY,elapsed:0,duration:EXIT_DURATION,done:false};
    r.dash=0;r.recoveryUntil=0;r.driveIntent=0;
    event(s,'out',`${r.config.name}: ${r.reason.toLowerCase()}`,x,y,{owner:r.id});return true;
  }
  function advanceExits(s,dt){
    for(const r of s.robots){
      const ex=r.exit;if(!ex||ex.done)continue;
      ex.elapsed=Math.min(ex.duration,ex.elapsed+dt);const u=ex.elapsed/ex.duration;
      // A short decelerating coast makes even a very slow ring-out unambiguous.
      const progress=1-(1-u)*(1-u);
      r.x=ex.startX+(ex.endX-ex.startX)*progress;r.y=ex.startY+(ex.endY-ex.startY)*progress;
      r.z=ex.startZ*(1-u);r.vz=0;
      r.vx=(ex.endX-ex.startX)*2*(1-u)/ex.duration;r.vy=(ex.endY-ex.startY)*2*(1-u)/ex.duration;
      for(const t of r.tools)t.firing=0;
      if(u>=1){ex.done=true;r.vx=r.vy=0;}
    }
  }
  function event(s,type,text,x=400,y=400,extra={}){s.events.push({id:++s.eventCounter,t:s.time,type,text,x,y,...extra});if(s.events.length>65)s.events.shift();}
  function worldPoint(r,x,y){const co=Math.cos(r.angle),si=Math.sin(r.angle);return {x:r.x+x*co-y*si,y:r.y+x*si+y*co};}
  function toolPose(r,t){const p=worldPoint(r,t.x,t.y);return {...p,angle:r.angle+t.angle*Math.PI/180};}
  // A wreck freezes its original pose and inventory. Its scatter is analytic:
  // checkpoints need only a birth time, not particles or per-frame updates.
  function wreckToolPose(r,t,index,age){
    const pose=toolPose(r,t),u=clamp(num(age,0)/WRECK_SCATTER_SECONDS,0,1);
    const travel=WRECK_SCATTER_SECONDS*(u-u*u*.5),a=r.angle+r.id*.73+index*2.399963229728653;
    const speed=110+(index%3)*22,spin=(index%2?-1:1)*(3.4+(index%3)*.6);
    return {x:pose.x+(r.vx*.15+Math.cos(a)*speed)*travel,
      y:pose.y+(r.vy*.15+Math.sin(a)*speed)*travel,
      z:r.z*(1-u)+(22+(index%3)*5)*4*u*(1-u),angle:pose.angle+spin*travel};
  }
  function wreckToolVisible(r,t){return !!r.destruction&&!r.alive&&r.health<=0&&!t.broken&&t.health>0&&t.salvagedBy==null;}
  function wreckToolAvailable(s,r,t,index){
    if(!wreckToolVisible(r,t)||s.time+(s.settleElapsed||0)-r.destruction.born<WRECK_SCATTER_SECONDS-1e-9)return false;
    const p=wreckToolPose(r,t,index,WRECK_SCATTER_SECONDS);
    return p.x>=BOUNDS.min&&p.x<=BOUNDS.max&&p.y>=BOUNDS.min&&p.y<=BOUNDS.max;
  }
  function wreckPickup(r,t,index){
    const at=wreckToolPose(r,t,index,WRECK_SCATTER_SECONDS);
    return {id:1000+r.id*(MAX_TOOLS+MAX_BONUS_TOOLS)+index,kind:'tool',toolType:t.type,power:t.power,
      x:at.x,y:at.y,r:12,health:t.health,maxHealth:t.maxHealth,salvaged:true};
  }
  function componentPosition(r,p){
    if(p.kind==='tool'){const a=p.angle*Math.PI/180;return worldPoint(r,p.x+Math.cos(a)*9,p.y+Math.sin(a)*9);}
    return worldPoint(r,p.x,p.y);
  }
  function hazardActive(h,t){const d=HAZARDS[h.type]||HAZARDS.fire,period=h.period??d.period;
    return !period||((t+(h.phase||0))%period)<period*(h.duty??d.duty);}
  function hazardWarning(h,t){const d=HAZARDS[h.type]||HAZARDS.fire,period=h.period??d.period;
    return !!period&&!hazardActive(h,t)&&period-((t+(h.phase||0))%period)<.8;}
  function hazardExposure(h,start,dt){
    const d=HAZARDS[h.type]||HAZARDS.fire,period=h.period??d.period;
    if(!period)return dt;
    const on=clamp(period*(h.duty??d.duty),0,period),phase=h.phase||0;
    // Integrate only the active part of this tick, including partial phase
    // boundaries. No accumulated damage is deferred to the next active period.
    const from=start+phase,to=from+dt,a=Math.floor(from/period),b=Math.floor(to/period);
    return clamp((b-a)*on+Math.min(to-b*period,on)-Math.min(from-a*period,on),0,dt);
  }
  function pickupAvailable(s,p){return p.collectedBy===null&&s.time>=p.spawnAt&&s.time<p.expiresAt;}
  function canCollect(r,p){
    if(!r.alive||r.health<=0||(r.pickupCooldown||0)>0)return false;
    if(p.kind==='repair')return r.health<r.stats.hp-.01||[...r.parts,...r.tools].some(x=>!x.broken&&x.health<x.maxHealth-.01);
    const bonus=r.tools.filter(t=>t.bonus);return bonus.length<MAX_BONUS_TOOLS||bonus.some(t=>t.broken);
  }
  function nearestPickup(s,r,kind=null){
    let pickup=null,distance=Infinity;
    for(const p of s.pickups||[]){if(!pickupAvailable(s,p)||(kind&&p.kind!==kind)||!canCollect(r,p))continue;
      const d=Math.hypot(r.x-p.x,r.y-p.y);if(d<distance){distance=d;pickup=p;}}
    if(kind!=='repair'&&canCollect(r,{kind:'tool'}))for(const owner of s.robots){
      if(!owner.destruction)continue;
      for(const [index,t] of owner.tools.entries()){
        if(!wreckToolAvailable(s,owner,t,index))continue;
        const p=wreckPickup(owner,t,index),d=Math.hypot(r.x-p.x,r.y-p.y);if(d<distance){distance=d;pickup=p;}
      }
    }
    return {pickup,distance};
  }
  function refreshBonusMass(r){
    const base=stats(r.config),mass=r.tools.filter(t=>t.bonus&&!t.broken).reduce((n,t)=>n+t.stats.mass,0);
    r.stats={...base,mass:base.mass+mass,speed:Math.max(45,Math.round(base.speed-mass*1.5))};
  }
  function attachBonusTool(r,p){
    const old=r.tools.find(t=>t.bonus&&t.broken),bonus=r.tools.filter(t=>t.bonus);
    if(!old&&bonus.length>=MAX_BONUS_TOOLS)return null;
    const others=r.tools.filter(t=>t!==old&&!t.broken),rad=r.stats.radius*.86;
    let best=null;
    for(let j=0;j<24;j++){
      const a=j*Math.PI/12,x=Math.cos(a)*rad,y=Math.sin(a)*rad;
      const spacing=others.length?Math.min(...others.map(t=>Math.hypot(x-t.x,y-t.y))):50;
      // Prefer a forward-facing free mount when separation is otherwise equal.
      const score=spacing+Math.cos(a)*.15;
      if(!best||score>best.score)best={x,y,angle:j*15,score};
    }
    const normalized=normalizeTool({type:p.toolType,power:p.power,...best},0,r.config.body),st=toolStats(normalized);
    const t={...normalized,id:old?old.id:'b'+(bonus.length+1),bonus:true,kind:'tool',label:WEAPONS[normalized.type].label,
      stats:st,radius:8,health:st.hp,maxHealth:st.hp,cooldown:.6,broken:false,flash:.5,firing:0};
    if(p.salvaged){t.health=p.health;t.maxHealth=p.maxHealth;t.salvaged=true;}
    if(old)r.tools[r.tools.indexOf(old)]=t;else r.tools.push(t);
    r.bonusCollected++;refreshBonusMass(r);return t;
  }
  function collectPickups(s){
    for(const p of s.pickups||[]){
      if(!pickupAvailable(s,p))continue;
      const candidates=s.robots.filter(r=>canCollect(r,p)&&r.z<=6&&Math.hypot(r.x-p.x,r.y-p.y)<=r.stats.radius*.7+p.r)
        .map(r=>({r,d:Math.hypot(r.x-p.x,r.y-p.y)}));
      // Closest center wins; exact ties alternate deterministically, never by
      // client request order. A pickup is consumed at most once.
      const priority=(s.seed+s.tick+p.id)%s.robots.length;
      candidates.sort((a,b)=>a.d-b.d||((a.r.id-priority+s.robots.length)%s.robots.length)-((b.r.id-priority+s.robots.length)%s.robots.length));
      if(!candidates.length)continue;
      const r=candidates[0].r;
      if(p.kind==='repair'){
        const before=r.health;r.health=Math.min(r.stats.hp,r.health+r.stats.hp*REPAIR_FRACTION);
        for(const part of [...r.parts,...r.tools])if(!part.broken)part.health=Math.min(part.maxHealth,part.health+part.maxHealth*PART_REPAIR_FRACTION);
        r.repairsCollected++;r.flash=.3;
        event(s,'repair',`${r.config.name}: repair +${Math.round(r.health-before)} HP`,p.x,p.y,{owner:r.id,pickup:p.id,healed:r.health-before});
      }else{
        const t=attachBonusTool(r,p);if(!t)continue;
        event(s,'pickup',`${r.config.name}: bonus ${t.label.toLowerCase()} attached`,p.x,p.y,{owner:r.id,pickup:p.id,tool:t.id});
      }
      // The lock is shared by repairs and bonus tools, but belongs to this
      // robot only. Commit it immediately so overlapping items cannot both be
      // collected in the same simulation tick. Rejected pickups never lock it.
      r.pickupCooldown=PICKUP_COOLDOWN;
      p.collectedBy=r.id;p.collectedAt=s.time;
    }
    // At most eight inventories of eight tools. No extra world-item list or
    // mutation of the original tool's HP; the claim is its sole ownership flag.
    if(s.status!=='running'||s.pendingResult)return;
    for(const owner of s.robots){
      if(!owner.destruction)continue;
      for(const [index,t] of owner.tools.entries()){
        if(!wreckToolAvailable(s,owner,t,index))continue;
        const p=wreckPickup(owner,t,index);
        const candidates=s.robots.filter(r=>canCollect(r,p)&&r.z<=6&&Math.hypot(r.x-p.x,r.y-p.y)<=r.stats.radius*.7+p.r)
          .map(r=>({r,d:Math.hypot(r.x-p.x,r.y-p.y)}));
        const priority=(s.seed+s.tick+p.id)%s.robots.length;
        candidates.sort((a,b)=>a.d-b.d||((a.r.id-priority+s.robots.length)%s.robots.length)-((b.r.id-priority+s.robots.length)%s.robots.length));
        if(!candidates.length)continue;
        const r=candidates[0].r,attached=attachBonusTool(r,p);if(!attached)continue;
        t.salvagedBy=r.id;r.pickupCooldown=PICKUP_COOLDOWN;
        event(s,'pickup',`${r.config.name}: salvaged ${attached.label.toLowerCase()} attached`,p.x,p.y,{owner:r.id,wreck:owner.id,tool:attached.id});
      }
    }
  }
  function nearestHazard(s,r){
    let hazard=null,distance=Infinity;
    for(const h of s.hazards){
      // Warning lights are visual only. Inactive traps never influence the brain
      // or the avoidance target, including an inactive trap closer than a live one.
      if(!hazardActive(h,s.time))continue;
      const d=Math.hypot(r.x-h.x,r.y-h.y)-h.r;
      if(d<distance){hazard=h;distance=d;}
    }
    return {hazard,distance};
  }
  function driveFactor(r){return 1-r.parts.filter(p=>p.kind==='drive'&&p.broken).length*.35;}
  function sensors(s,r,e){
    e=e||r;const d=e===r?Infinity:Math.hypot(e.x-r.x,e.y-r.y),heading=Math.atan2(e.y-r.y,e.x-r.x),h=nearestHazard(s,r);
    const reach=Math.max(60,...r.tools.filter(t=>!t.broken).map(t=>t.stats.reach+38));
    return {hazard:h.distance<r.stats.radius+65,range:d<reach,near:d<Math.max(112,reach),far:d>Math.max(215,reach),
      front:Math.abs(angleDiff(heading,r.angle))<.38&&d<250,
      edge:Math.min(r.x-BOUNDS.min,BOUNDS.max-r.x,r.y-BOUNDS.min,BOUNDS.max-r.y)<83,
      low:r.health<r.stats.hp*.35,charged:r.energy>=65,
      ready:r.tools.some(t=>!t.broken&&t.cooldown<=0&&r.energy>=t.stats.energy),
      damaged:[...r.parts,...r.tools].some(p=>p.broken),
      repair:nearestPickup(s,r,'repair').distance<210,pickup:nearestPickup(s,r).distance<175,
      bonus:r.tools.some(t=>t.bonus&&!t.broken),always:true,void:false};
  }
  function chooseAction(s,r,e){
    const sense=sensors(s,r,e),hasActiveHazard=nearestHazard(s,r).hazard!==null;
    // An unconditional avoidance action also falls through when no trap is on.
    r.ruleIndex=r.config.rules.findIndex(rule=>sense[rule.when]&&(rule.do!=='avoid'||hasActiveHazard));
    r.action=r.ruleIndex<0?'brake':r.config.rules[r.ruleIndex].do;
  }
  function nearestWall(s,r){
    let result=null,dist=Infinity;
    for(const w of s.walls){if(w.broken)continue;const [x1,y1,x2,y2]=wallEndpoints(w);
      const x=clamp(r.x,Math.min(x1,x2),Math.max(x1,x2)),y=clamp(r.y,Math.min(y1,y2),Math.max(y1,y2)),d=Math.hypot(r.x-x,r.y-y);
      if(d<dist){dist=d;result={wall:w,x,y,distance:d};}}
    return result;
  }
  function eligibleTools(r){
    if(r.action==='bonus')return r.tools.filter(t=>t.bonus&&!t.broken);
    if(/^tool[1-6]$/.test(r.action)){const t=r.tools.find(t=>t.id==='t'+r.action.slice(4));return t&&!t.broken?[t]:[];}
    return r.tools.filter(t=>!t.broken);
  }
  function isToolAction(action){return action==='weapon'||action==='wall'||action==='bonus'||/^tool[1-6]$/.test(action);}
  function aimingTool(r,tx,ty){
    const heading=Math.atan2(ty-r.y,tx-r.x);
    return eligibleTools(r).map(t=>({t,score:Math.abs(angleDiff(heading,r.angle+t.angle*Math.PI/180))+.35*t.cooldown+(r.energy<t.stats.energy?2:0)}))
      .sort((a,b)=>a.score-b.score)[0]?.t;
  }
  function steer(s,r,e,dt){
    r.driveIntent=0;
    if(r.z>6)return;if(!e){r.vx*=Math.exp(-9*dt);r.vy*=Math.exp(-9*dt);return;}
    const mobility=driveFactor(r);let tx=e.x,ty=e.y,speed=r.stats.speed*mobility,headingOffset=0;
    switch(r.action){
      case 'brake':r.vx*=Math.exp(-9*dt);r.vy*=Math.exp(-9*dt);return;
      case 'center':tx=400;ty=400;if(Math.hypot(tx-r.x,ty-r.y)<28)speed=0;break;
      case 'retreat':tx=r.x+(r.x-e.x)+(400-r.x)*.35;ty=r.y+(r.y-e.y)+(400-r.y)*.35;break;
      case 'orbit':{const a=Math.atan2(r.y-e.y,r.x-e.x)+.8;tx=e.x+Math.cos(a)*115;ty=e.y+Math.sin(a)*115;break;}
      case 'avoid':{const h=nearestHazard(s,r).hazard;if(h){tx=r.x+(r.x-h.x)*2+(400-r.x)*.28;ty=r.y+(r.y-h.y)*2+(400-r.y)*.28;}break;}
      case 'collect':case 'repair':{const p=nearestPickup(s,r,r.action==='repair'?'repair':null).pickup;if(p){tx=p.x;ty=p.y;}break;}
      case 'wall':{const w=nearestWall(s,r);if(w){tx=w.x;ty=w.y;}else {tx=400;ty=400;}break;}
    }
    // Movement targets produced by retreat/orbit/hazard avoidance must remain
    // inside the arena. Wall attacks deliberately retain their actual target.
    if(['retreat','orbit','avoid'].includes(r.action)){
      const inset=r.stats.radius+24;
      tx=clamp(tx,BOUNDS.min+inset,BOUNDS.max-inset);ty=clamp(ty,BOUNDS.min+inset,BOUNDS.max-inset);
    }
    if(isToolAction(r.action)){
      const aimed=aimingTool(r,tx,ty);headingOffset=(aimed?.angle||0)*Math.PI/180;
      if(aimed&&aimed.stats.reach>100&&r.action!=='wall'){
        const distance=Math.hypot(tx-r.x,ty-r.y);
        if(distance<aimed.stats.reach*.65)speed=distance<70?-speed*.35:0;
      }
    }
    const near=nearestWall(s,r),probe=r.motionProbe||(r.motionProbe={x:r.x,y:r.y,time:s.time});
    if(s.time-probe.time>=STUCK_WINDOW){
      const moved=Math.hypot(r.x-probe.x,r.y-probe.y);
      if(moved<7&&(Math.abs(speed)>15||isToolAction(r.action))&&near&&near.distance<r.stats.radius+22&&r.action!=='wall'&&r.recoveryUntil<=s.time){
        r.recoveryUntil=s.time+RECOVERY_SECONDS;r.recoveries=(r.recoveries||0)+1;r.dash=0;
        event(s,'unstuck',`${r.config.name}: reversing away from the wall`,r.x,r.y,{owner:r.id});
      }
      r.motionProbe={x:r.x,y:r.y,time:s.time};
    }
    const recovering=r.recoveryUntil>s.time;
    if(recovering){
      tx=400;ty=400;headingOffset=0;speed=r.stats.speed*mobility*.8;
      // Reverse when the nose faces the wall; turn along the shortest route.
      const inward=Math.atan2(ty-r.y,tx-r.x);
      if(Math.cos(angleDiff(inward,r.angle))<-.25){headingOffset=Math.PI;}
    }
    const desired=Math.atan2(ty-r.y,tx-r.x)-headingOffset,delta=angleDiff(desired,r.angle);
    const turn=r.stats.turn*(.6+.4*mobility);r.angle+=clamp(delta,-turn*dt,turn*dt);
    const travelAngle=r.angle+headingOffset,alignment=Math.max(0,Math.cos(delta));let factor=1;
    if(!recovering&&r.action==='charge'&&r.dashCooldown<=0&&r.energy>=36&&alignment>.92){r.dash=.7;r.dashCooldown=3.5;r.energy-=36;}
    if(r.dash>0)factor=1.75;
    speed*=factor*(.18+.82*alignment);r.driveIntent=Math.abs(speed);
    let desiredVX=Math.cos(travelAngle)*speed,desiredVY=Math.sin(travelAngle)*speed;
    // Clip only the motor's desired motion into solid barriers, not the existing
    // velocity. Enemy knockback can still drive a robot through a broken wall.
    if(r.action!=='wall')for(const w of s.walls){
      if(w.broken)continue;
      const [x1,y1,x2,y2]=wallEndpoints(w),px=clamp(r.x,Math.min(x1,x2),Math.max(x1,x2)),py=clamp(r.y,Math.min(y1,y2),Math.max(y1,y2));
      const dx=r.x-px,dy=r.y-py,d=Math.hypot(dx,dy);if(d<.001||d>r.stats.radius+12)continue;
      const nx=dx/d,ny=dy/d,into=desiredVX*nx+desiredVY*ny;
      if(into<0){desiredVX-=into*nx;desiredVY-=into*ny;}
    }
    const ax=desiredVX-r.vx,ay=desiredVY-r.vy,mag=Math.hypot(ax,ay),impulse=Math.min(mag,r.stats.acceleration*factor*mobility*dt);
    if(mag>.0001){r.vx+=ax/mag*impulse;r.vy+=ay/mag*impulse;}
  }
  function destroyComponent(s,r,p,source){
    if(p.broken)return;p.health=0;p.broken=true;if(p.bonus)refreshBonusMass(r);
    const at=componentPosition(r,p),a=r.angle+(p.kind==='tool'?p.angle*Math.PI/180:Math.atan2(p.y,p.x));
    s.debris.push({x:at.x,y:at.y,z:r.z,vx:r.vx*.35+Math.cos(a)*70,vy:r.vy*.35+Math.sin(a)*70,angle:a,born:s.time,kind:p.kind,type:p.type||'',owner:r.id});
    if(s.debris.length>40)s.debris.shift();
    event(s,'part',`${r.config.name}: ${p.label.toLowerCase()} destroyed`,at.x,at.y,{part:p.id,owner:r.id,source});
  }
  function destroyRobot(s,r){
    if(!r.alive||r.health>0)return;
    r.health=0;r.alive=false;r.eliminatedAt=s.time;r.reason='Robot destroyed';
    r.destruction={born:s.time+(s.settleElapsed||0)};
    r.dash=0;r.driveIntent=0;r.recoveryUntil=0;
    for(const t of r.tools){t.firing=0;if(t.contactTime)t.contactTime=0;}
    event(s,'destroy',`${r.config.name} destroyed`,r.x,r.y);
  }
  function damageComponent(s,r,p,amount,source='impact'){
    if(!p||p.broken||amount<=0)return;
    p.health=Math.max(0,p.health-amount);p.flash=.2;
    if(p.health<=0)destroyComponent(s,r,p,source);
  }
  function armorAt(r,x,y){const a=degrees((Math.atan2(y-r.y,x-r.x)-r.angle)*180/Math.PI);return r.parts[Math.floor((a+45)/90)%4];}
  function damageRobot(s,r,component,amount,penetration=0,partFactor=1,source='impact',x=r.x,y=r.y){
    if(amount<=0||!r.alive)return;
    let p=component;
    if(!p){const plate=armorAt(r,x,y);if(!plate.broken)p=plate;}
    let core=amount;
    if(p&&!p.broken){
      core=amount*(p.kind==='armor'?.22+.5*penetration:p.kind==='tool'?.30:.35);
      damageComponent(s,r,p,amount*(p.kind==='armor'?1:partFactor),source);
    }
    r.health=Math.max(0,r.health-core);r.flash=.18;
  }
  // Ranged casts retain their simple circular hit zones. Melee uses the shared
  // visible silhouettes below; movement and projectile balance stay separate.
  function rayCircle(ox,oy,dx,dy,cx,cy,radius,reach){
    const vx=cx-ox,vy=cy-oy,proj=vx*dx+vy*dy,perp=vx*vx+vy*vy-proj*proj;
    if(perp>radius*radius)return null;
    const half=Math.sqrt(Math.max(0,radius*radius-perp));
    if(proj+half<0||proj-half>reach)return null;
    return Math.max(0,proj-half);
  }
  function traceRobot(r,t,e,origin=null){
    if(!e.alive||Math.abs(r.z-e.z)>23)return null;
    const p=origin||toolPose(r,t),dx=Math.cos(p.angle),dy=Math.sin(p.angle),reach=t.stats.reach;
    let best=null;
    for(const part of [...e.tools,...e.parts]){
      if(part.broken)continue;const pos=componentPosition(e,part);
      const d=rayCircle(p.x,p.y,dx,dy,pos.x,pos.y,part.radius+t.stats.width*.4,reach);
      if(d!==null&&(!best||d<best.distance))best={kind:'robot',target:e,component:part,distance:d,x:p.x+dx*d,y:p.y+dy*d,dx,dy};
    }
    const core=rayCircle(p.x,p.y,dx,dy,e.x,e.y,e.stats.radius*.67+t.stats.width*.35,reach);
    if(core!==null&&(!best||core<best.distance))best={kind:'robot',target:e,component:null,distance:core,x:p.x+dx*core,y:p.y+dy*core,dx,dy};
    return best;
  }
  function wallEndpoints(w){const lo=BOUNDS.min,hi=BOUNDS.max,l=BOUNDS.size/SEGMENTS,a=lo+w.i*l,b=a+l;
    if(w.side===0)return[a,lo,b,lo,0,-1];if(w.side===1)return[hi,a,hi,b,1,0];if(w.side===2)return[a,hi,b,hi,0,1];return[lo,a,lo,b,-1,0];}
  function traceWallRay(s,p,dx,dy,reach,width=0,z=0){
    if(z>WALL_HEIGHT)return null;let best=null;
    for(const w of s.walls){
      if(w.broken)continue;
      const [x1,y1,x2,y2,ox,oy]=wallEndpoints(w),normal=dx*ox+dy*oy;
      // Walls block projectiles from either side, including an aerial shot
      // arriving from outside. Parallel trajectories do not cross the segment.
      if(Math.abs(normal)<=.0000001)continue;
      const dist=((x1-p.x)*ox+(y1-p.y)*oy)/normal;
      if(dist<-.000001||dist>reach+.000001)continue;
      const distance=Math.max(0,dist),x=p.x+dx*distance,y=p.y+dy*distance,pad=width*.4;
      if(x<Math.min(x1,x2)-pad||x>Math.max(x1,x2)+pad||y<Math.min(y1,y2)-pad||y>Math.max(y1,y2)+pad)continue;
      if(!best||distance<best.distance)best={kind:'wall',wall:w,distance,x,y,dx,dy};
    }return best;
  }
  function firingPose(s,r,t){
    const p=toolPose(r,t),offset=({flamethrower:30,machinegun:32,rocket:33})[t.type]||0;
    p.x+=Math.cos(p.angle)*offset;p.y+=Math.sin(p.angle)*offset;
    const dx=p.x-r.x,dy=p.y-r.y,d=Math.hypot(dx,dy);
    if(d>.00001){
      const block=traceWallRay(s,r,dx/d,dy/d,d,0,r.z);
      // Diagonal mounts can protrude beyond a circular chassis. Never spawn a
      // bullet/rocket beyond an intact barrier, even at point-blank range.
      if(block){p.x=block.x-dx/d*.01;p.y=block.y-dy/d*.01;}
    }
    return p;
  }
  function traceWall(s,r,t){
    const p=firingPose(s,r,t);
    return traceWallRay(s,p,Math.cos(p.angle),Math.sin(p.angle),t.stats.reach,t.stats.width,r.z);
  }
  function damageWall(s,w,amount,x,y,source='impact',recordHit=true){
    if(w.broken||amount<=0)return 0;
    const applied=Math.min(w.health,amount);w.health=Math.max(0,w.health-amount);w.hits++;w.flash=.25;
    if(w.health<=0){w.broken=true;event(s,'wall','Wall breached! The gap stays open.',x,y,{wall:w.side*SEGMENTS+w.i,damage:applied,source});}
    else if(recordHit)event(s,'wall-hit',`Wall ${String(w.side*SEGMENTS+w.i+1).padStart(2,'0')}: ${Math.ceil(w.health)} / ${WALL_HP} HP`,x,y,{wall:w.side*SEGMENTS+w.i,damage:applied,source});
    return applied;
  }
  function coneTargets(s,r,t){
    const pose=firingPose(s,r,t),targets=[];
    for(const e of s.robots){
      if(!isEnemy(r,e)||!e.alive||Math.abs(r.z-e.z)>23)continue;
      const dx=e.x-pose.x,dy=e.y-pose.y,d=Math.hypot(dx,dy);
      if(d>t.stats.reach+e.stats.radius+32)continue;
      // A hull or mounted tool may touch the flame even when its center is
      // outside the cone. The edge ray still has to intersect its real hit zone.
      const angle=pose.angle+clamp(angleDiff(Math.atan2(dy,dx),pose.angle),-.38,.38),aimed={...pose,angle};
      const hit=traceRobot(r,t,e,aimed),wall=traceWallRay(s,pose,Math.cos(angle),Math.sin(angle),t.stats.reach,t.stats.width,r.z);
      if(hit&&(!wall||wall.distance>=hit.distance))targets.push(hit);
    }
    return targets;
  }
  function canEmit(r,t){
    return !!r&&r.alive&&r.health>0&&r.z<=8&&!!t&&!t.broken&&isToolAction(r.action)&&eligibleTools(r).includes(t);
  }
  function bodyGeometry(r){
    const radius=r.stats.radius,key=r.config.body+':'+radius;
    if(bodyGeometryCache.has(key))return bodyGeometryCache.get(key);
    let points;
    switch(r.config.body){
      case 'circle':{const shape=[{circle:[0,0,radius*.9]}];bodyGeometryCache.set(key,shape);return shape;}
      case 'wedge':points=[[-1,-.72],[1,0],[-1,.72]];break;
      case 'box':points=[[-.9,-.72],[.9,-.72],[.9,.72],[-.9,.72]];break;
      case 'hex':points=Array.from({length:6},(_,i)=>[Math.cos(i*Math.PI/3),Math.sin(i*Math.PI/3)]);break;
      case 'cross':points=[[-.4,-.94],[.4,-.94],[.4,-.4],[.94,-.4],[.94,.4],[.4,.4],[.4,.94],[-.4,.94],[-.4,.4],[-.94,.4],[-.94,-.4],[-.4,-.4]];break;
      default:points=BODY_GEOMETRY[r.config.body].outline;
    }
    const shape=[{polygon:points.map(p=>p.map(n=>n*radius))}];bodyGeometryCache.set(key,shape);return shape;
  }
  function worldGeometry(pose,geometry){
    const co=Math.cos(pose.angle),si=Math.sin(pose.angle),point=([x,y])=>[pose.x+x*co-y*si,pose.y+x*si+y*co];
    return geometry.map(shape=>{
      if(shape.circle){const [x,y]=point(shape.circle),radius=shape.circle[2];return {circle:[x,y,radius],minX:x-radius,maxX:x+radius,minY:y-radius,maxY:y+radius};}
      const polygon=shape.polygon.map(point);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const [x,y] of polygon){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      return {polygon,minX,maxX,minY,maxY};
    });
  }
  function closestOnSegment(x,y,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const u=length?clamp(((x-a[0])*dx+(y-a[1])*dy)/length,0,1):0;
    return [a[0]+dx*u,a[1]+dy*u];
  }
  function insidePolygon(point,polygon){
    let inside=false;const [x,y]=point;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[j],b=polygon[i],p=closestOnSegment(x,y,a,b);
      if((p[0]-x)**2+(p[1]-y)**2<1e-16)return true;
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function segmentCross(a,b,c,d){
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1],cross=ux*vy-uy*vx;
    if(Math.abs(cross)<1e-10){
      for(const p of [c,d,a,b]){
        const q=closestOnSegment(p[0],p[1],a,b),r=closestOnSegment(p[0],p[1],c,d);
        if((p[0]-q[0])**2+(p[1]-q[1])**2<1e-16&&(p[0]-r[0])**2+(p[1]-r[1])**2<1e-16)return p;
      }return null;
    }
    const x=c[0]-a[0],y=c[1]-a[1],u=(x*vy-y*vx)/cross,v=(x*uy-y*ux)/cross;
    return u>=-1e-9&&u<=1+1e-9&&v>=-1e-9&&v<=1+1e-9?[a[0]+u*ux,a[1]+u*uy]:null;
  }
  function geometryContact(a,b){
    if(a.maxX<b.minX-1e-9||a.minX>b.maxX+1e-9||a.maxY<b.minY-1e-9||a.minY>b.maxY+1e-9)return null;
    if(a.circle&&b.circle){
      const [ax,ay,ar]=a.circle,[bx,by,br]=b.circle,dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy);
      if(d>ar+br+1e-9)return null;
      const offset=Math.max(0,d-br);return d?[ax+dx/d*offset,ay+dy/d*offset]:[ax,ay];
    }
    if(a.circle||b.circle){
      const circle=a.circle||b.circle,polygon=(a.circle?b:a).polygon;
      if(insidePolygon(circle,polygon))return circle.slice(0,2);
      let nearest=null,distance=Infinity;
      for(let i=0;i<polygon.length;i++){
        const p=closestOnSegment(circle[0],circle[1],polygon[i],polygon[(i+1)%polygon.length]);
        const d=(p[0]-circle[0])**2+(p[1]-circle[1])**2;if(d<distance){nearest=p;distance=d;}
      }
      return distance<=circle[2]**2+1e-9?nearest:null;
    }
    for(let i=0;i<a.polygon.length;i++)for(let j=0;j<b.polygon.length;j++){
      const point=segmentCross(a.polygon[i],a.polygon[(i+1)%a.polygon.length],b.polygon[j],b.polygon[(j+1)%b.polygon.length]);
      if(point)return point;
    }
    if(insidePolygon(a.polygon[0],b.polygon))return a.polygon[0];
    if(insidePolygon(b.polygon[0],a.polygon))return b.polygon[0];return null;
  }
  function robotContactGeometry(r,cache){
    if(cache.has(r))return cache.get(r);
    const result=[],add=(component,pose,geometry)=>{for(const shape of worldGeometry(pose,geometry))result.push({component,shape});};
    for(const t of r.tools)if(!t.broken)add(t,toolPose(r,t),toolGeometry(t));
    for(const p of r.parts)if(!p.broken){
      if(p.kind==='drive')add(p,r,[{polygon:[[-11,p.y-3.8],[8,p.y-3.8],[8,p.y+3.8],[-11,p.y+3.8]]}]);
      else add(p,{...worldPoint(r,p.x,p.y),angle:r.angle+Math.atan2(p.y,p.x)},[{polygon:[[-1.1,-7],[1.1,-7],[1.1,7],[-1.1,7]]}]);
    }
    add(null,r,bodyGeometry(r));cache.set(r,result);return result;
  }
  function meleeContact(s,r,t,cache){
    const pose=toolPose(r,t),head=worldGeometry(pose,toolGeometry(t,true,true));
    const dx=Math.cos(pose.angle),dy=Math.sin(pose.angle);let best=null;
    const accept=(point,extra)=>{
      const distance=Math.hypot(point[0]-pose.x,point[1]-pose.y);
      if(!best||distance<best.distance-1e-9)best={...extra,distance,x:point[0],y:point[1],dx,dy};
    };
    for(const e of s.robots){
      if(!isEnemy(r,e)||!e.alive||Math.abs(r.z-e.z)>23)continue;
      // A conservative rejection only; exact visible shapes decide contact.
      if(Math.hypot(e.x-pose.x,e.y-pose.y)>64*toolScale(t)+e.stats.radius*Math.SQRT2+64)continue;
      for(const {component,shape} of robotContactGeometry(e,cache))for(const source of head){
        const point=geometryContact(source,shape);if(point)accept(point,{kind:'robot',target:e,component});
      }
    }
    if(r.z<=WALL_HEIGHT){
      const surface=worldGeometry(pose,toolGeometry(t,true));
      for(const wall of s.walls){
        if(wall.broken)continue;const [x1,y1,x2,y2]=wallEndpoints(wall);
        const shape={polygon:[[x1,y1],[x2,y2]],minX:Math.min(x1,x2),maxX:Math.max(x1,x2),minY:Math.min(y1,y2),maxY:Math.max(y1,y2)};
        for(const source of surface){const point=geometryContact(source,shape);if(point)accept(point,{kind:'wall',wall});}
      }
      // An outward-mounted head cannot reach a robot through an intact wall.
      if(best?.kind==='robot'){
        const x=best.x-r.x,y=best.y-r.y,length=Math.hypot(x,y);
        const wall=length?traceWallRay(s,r,x/length,y/length,length,0,r.z):null;
        if(wall)return {...wall,dx,dy};
      }
    }
    return best;
  }
  function contactHit(s,r,t,cache=new Map()){
    if(!WEAPONS[t.type].mode)return meleeContact(s,r,t,cache);
    let hit=null;const origin=firingPose(s,r,t);
    for(const e of s.robots){if(!isEnemy(r,e))continue;const h=traceRobot(r,t,e,origin);if(h&&(!hit||h.distance<hit.distance))hit=h;}
    const wall=traceWall(s,r,t);return wall&&(!hit||wall.distance<hit.distance)?wall:hit;
  }
  // Saw/drill damage is a bounded per-use budget, spent only during actual
  // contact. Unused slices are lost; reacquiring contact never repays them.
  function stepContact(s,dt){
    const hits=[],geometryCache=new Map();
    for(const r of s.robots)for(const t of r.tools){
      if(!(t.contactTime>0))continue;
      if(!canEmit(r,t)){t.contactTime=0;t.firing=0;continue;}
      const slice=Math.min(dt,t.contactTime),hit=contactHit(s,r,t,geometryCache);
      t.contactTime=Math.max(0,t.contactTime-slice);if(t.contactTime<1e-9)t.contactTime=0;
      t.firing=t.contactTime;
      if(hit&&slice>0)hits.push({r,t,hit,scale:slice/t.stats.cooldown});
    }
    // Collect first so simultaneous contact ticks still land if a tool breaks.
    for(const {r,t,hit,scale} of hits){
      const first=!t.contactNoted;t.contactNoted=true;
      if(hit.kind==='wall')damageWall(s,hit.wall,t.stats.wallDamage*scale,hit.x,hit.y,t.type,first);
      else{
        const damage=strike(s,r,hit.target,t,hit,scale);
        if(first)event(s,'hit',`${r.config.name}: ${t.label.toLowerCase()} makes contact`,hit.x,hit.y,{tool:t.id,damage});
      }
    }
  }
  // A live stream applies a fraction of nominal per-use damage each simulation
  // tick. It follows the real nozzle; changing the active rule stops emission.
  function stepFlames(s,dt){
    const remaining=[];
    for(const f of s.flames||[]){
      const r=s.robots[f.owner],t=r?.tools.find(t=>t.id===f.toolId);
      if(!canEmit(r,t)||t.type!=='flamethrower'||t.power!==f.power)continue;
      const slice=Math.min(dt,Math.max(0,f.duration-f.elapsed));if(slice<=0)continue;
      const pose=firingPose(s,r,t),scale=slice/f.duration;
      Object.assign(f,pose,{z:r.z});
      for(const hit of coneTargets(s,r,t))strike(s,r,hit.target,t,hit,scale);
      const wall=traceWall(s,r,t);
      if(wall)damageWall(s,wall.wall,t.stats.wallDamage*scale,wall.x,wall.y,t.type);
      // Clip each visual lane to the same solid walls as the damage rays.
      f.rays=Array.from({length:9},(_,i)=>{const a=pose.angle+(i/8-.5)*.76;
        const hit=traceWallRay(s,pose,Math.cos(a),Math.sin(a),t.stats.reach,0,r.z);
        return hit?hit.distance:t.stats.reach;});
      f.elapsed=Math.min(f.duration,f.elapsed+slice);t.firing=Math.max(t.firing,.06);
      if(f.elapsed<f.duration-1e-12)remaining.push(f);
    }
    s.flames=remaining;
  }
  function collectAttacks(s,r,_legacyEnemy,geometryCache=new Map()){
    const attacks=[];if(!r.alive||r.health<=0||r.z>8||!isToolAction(r.action))return attacks;
    let energy=r.energy;const count=r.tools.length;
    const eligible=eligibleTools(r).filter(t=>t.cooldown<=1e-9&&!(t.contactTime>1e-9)&&!(s.flames||[]).some(f=>f.owner===r.id&&f.toolId===t.id));
    // Empty batteries need no collision queries; no tool could activate yet.
    if(!eligible.some(t=>energy+1e-9>=t.stats.energy))return attacks;
    const cursor=count?Math.max(0,Math.floor(num(r.energyCursor,0)))%count:0;
    for(let offset=0;offset<count;offset++){
      const t=r.tools[(cursor+offset)%count];
      if(!eligible.includes(t))continue;
      const targets=t.type==='flamethrower'?coneTargets(s,r,t):[];
      let hit=contactHit(s,r,t,geometryCache);
      if(!hit&&targets.length)hit=targets[0];
      if(!hit)continue;
      // Save for the next real, ready contact instead of letting cheap tools
      // consume every regeneration tick. Unavailable tools never block others.
      if(energy+1e-9<t.stats.energy)break;
      attacks.push({attacker:r,tool:t,hit,targets});energy-=t.stats.energy;
    }return attacks;
  }
  function strike(s,r,e,t,hit,scale=1,impulse=true){
    if(areAllies(r,e))return 0; // Includes self-splash in team modes; FFA keeps its existing self-damage.
    const amount=t.stats.damage*scale*matchup(t.type,hit.component);
    damageRobot(s,e,hit.component,amount,t.stats.penetration,t.stats.partFactor,t.type,hit.x,hit.y);
    if(impulse){const ratio=clamp(r.stats.mass/e.stats.mass,.65,1.5),kick=t.stats.kick*ratio*scale;
      e.vx+=hit.dx*kick;e.vy+=hit.dy*kick;
      if(t.type!=='rocket'&&t.type!=='machinegun'){r.vx-=hit.dx*kick*.13;r.vy-=hit.dy*kick*.13;}
    }
    return amount;
  }
  function gunSpread(index){return [0,-.016,.016][index%3];}
  function spawnProjectile(s,r,t,index=0){
    const pose=firingPose(s,r,t),burst=t.type==='machinegun',angle=pose.angle+(burst?gunSpread(index):0),speed=burst?630:270;
    s.projectiles.push({id:++s.projectileCounter,owner:r.id,type:t.type,toolId:t.id,x:pose.x,y:pose.y,z:r.z,
      angle,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,delay:burst?+(index*MACHINEGUN_INTERVAL).toFixed(2):0,queued:burst&&index>0,round:index,power:t.power,travel:0,
      width:burst?2:4,stats:{...t.stats,damage:t.stats.damage/(burst?MACHINEGUN_ROUNDS:1),wallDamage:t.stats.wallDamage/(burst?MACHINEGUN_ROUNDS:1),kick:t.stats.kick/(burst?MACHINEGUN_ROUNDS:1)}});
  }
  function resolveAttacks(s,attacks){
    // Sample all intents first so simultaneous close-range attacks still land.
    for(const {attacker:r,tool:t,hit,targets=[]} of attacks){
      // Commit priority only when a tool actually activates. One small cursor
      // survives exact checkpoints; render frames need no scheduling state.
      r.energyCursor=(r.tools.indexOf(t)+1)%r.tools.length;
      r.energy=Math.max(0,r.energy-t.stats.energy);t.cooldown=t.stats.cooldown;t.firing=t.type==='flamethrower'?t.stats.duration:t.type==='machinegun'?MACHINEGUN_ROUNDS*MACHINEGUN_INTERVAL:.23;
      if(t.type==='machinegun'||t.type==='rocket'){
        for(let i=0;i<(t.type==='machinegun'?MACHINEGUN_ROUNDS:1);i++)spawnProjectile(s,r,t,i);
        continue;
      }
      if(t.type==='flamethrower'){
        const pose=firingPose(s,r,t);
        (s.flames||(s.flames=[])).push({id:s.flameCounter=(s.flameCounter||0)+1,owner:r.id,toolId:t.id,power:t.power,
          ...pose,z:r.z,born:s.time,elapsed:0,duration:t.stats.duration,reach:t.stats.reach,rays:Array(9).fill(t.stats.reach)});
        event(s,'flame',`${r.config.name}: flame stream`,pose.x,pose.y,{owner:r.id,tool:t.id});
        continue;
      }
      if(t.type==='saw'||t.type==='drill'){
        t.contactTime=t.stats.cooldown;t.contactNoted=false;t.firing=t.contactTime;continue;
      }
      if(hit.kind==='wall'){damageWall(s,hit.wall,t.stats.wallDamage,hit.x,hit.y,t.type);continue;}
      const e=hit.target;if(areAllies(r,e))continue;
      const ratio=clamp(r.stats.mass/e.stats.mass,.65,1.5),damage=strike(s,r,e,t,hit);
      if(t.type==='flipper'){
        e.vz=Math.max(e.vz,(340+(t.power-1)*30)*FLIPPER_LIFT_MULTIPLIER*Math.sqrt(ratio));e.z=Math.max(e.z,2);e.peakZ=0;
        event(s,'launch',`${r.config.name} launches ${e.config.name}`,e.x,e.y,{tool:t.id});
      }else event(s,'hit',`${r.config.name}: ${t.label.toLowerCase()} hits ${hit.component?hit.component.label.toLowerCase():'chassis'}`,hit.x,hit.y,{tool:t.id,damage});
    }
  }
  function explode(s,p,hit){
    const owner=s.robots[p.owner],t={type:p.type,stats:p.stats};
    s.effects.push({kind:'explosion',x:hit.x,y:hit.y,owner:p.owner,born:s.time+(s.settleElapsed||0),radius:65});
    for(const e of s.robots){
      if(!e.alive||areAllies(owner,e)||e===hit.target||Math.abs(e.z-p.z)>25)continue;
      const d=Math.hypot(e.x-hit.x,e.y-hit.y);if(d>=65)continue;
      const angle=Math.atan2(e.y-hit.y,e.x-hit.x);
      strike(s,owner,e,t,{component:null,x:hit.x,y:hit.y,dx:Math.cos(angle),dy:Math.sin(angle)},.6*(1-d/65));
    }
  }
  function stepProjectiles(s,dt){
    const remaining=[];
    for(const p of s.projectiles){
      if(p.queued||p.delay>0){
        const r=s.robots[p.owner],t=r?.tools.find(t=>t.id===p.toolId);
        if(!canEmit(r,t)||t.type!==p.type||t.power!==p.power)continue;
        p.delay=Math.max(0,p.delay-dt);
        if(p.delay>1e-9){remaining.push(p);continue;}
        const pose=firingPose(s,r,t),angle=pose.angle+gunSpread(p.round||0);
        Object.assign(p,{x:pose.x,y:pose.y,z:r.z,angle,vx:Math.cos(angle)*630,vy:Math.sin(angle)*630,queued:false,delay:0});
        t.firing=Math.max(t.firing,.1);
      }
      const speed=Math.hypot(p.vx,p.vy),distance=speed*dt;
      if(distance<=0)continue;
      const caster={x:p.x,y:p.y,z:p.z,angle:p.angle},tool={x:0,y:0,angle:0,stats:{reach:distance,width:p.width}};
      let hit=traceWall(s,caster,tool);
      for(const e of s.robots){if(!isEnemy(s.robots[p.owner],e))continue;const h=traceRobot(caster,tool,e);if(h&&(!hit||h.distance<hit.distance))hit=h;}
      if(hit){
        if(hit.kind==='wall')damageWall(s,hit.wall,p.stats.wallDamage,hit.x,hit.y,p.type);
        else strike(s,s.robots[p.owner],hit.target,{type:p.type,stats:p.stats},hit);
        if(p.type==='rocket')explode(s,p,hit);
        event(s,'hit',`${s.robots[p.owner].config.name}: ${p.type==='rocket'?'rocket impact':'bullet impact'}`,hit.x,hit.y,{owner:p.owner,tool:p.toolId});
      }else{
        p.x+=Math.cos(p.angle)*distance;p.y+=Math.sin(p.angle)*distance;p.travel+=distance;
        // Weapon reach decides when to fire, not when an airborne shot vanishes.
        // Clear only a missed shot that has fully left the visible world/apron.
        if(p.x>=PROJECTILE_BOUNDS.min&&p.x<=PROJECTILE_BOUNDS.max&&p.y>=PROJECTILE_BOUNDS.min&&p.y<=PROJECTILE_BOUNDS.max)remaining.push(p);
      }
    }
    s.projectiles=remaining;
  }
  function collidePair(s,a,b){
    if(!a.alive||!b.alive||Math.abs(a.z-b.z)>26)return;
    let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.stats.radius+b.stats.radius;if(d>=min)return;
    if(d<.001){dx=1;dy=0;d=1;}
    const nx=dx/d,ny=dy/d,ia=1/a.stats.mass,ib=1/b.stats.mass,overlap=min-d;
    a.x-=nx*overlap*ia/(ia+ib);a.y-=ny*overlap*ia/(ia+ib);b.x+=nx*overlap*ib/(ia+ib);b.y+=ny*overlap*ib/(ia+ib);
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(rel<0){
      const j=-1.12*rel/(ia+ib);a.vx-=j*ia*nx;a.vy-=j*ia*ny;b.vx+=j*ib*nx;b.vy+=j*ib*ny;
      if(rel<-130&&!areAllies(a,b)){const damage=clamp((-rel-130)*.04,0,18),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        damageRobot(s,a,null,damage,0,1,'collision',x,y);damageRobot(s,b,null,damage,0,1,'collision',x,y);
        event(s,'collision','Chassis collision',x,y,{damage});}
    }
  }
  function collideRobots(s){
    // Alternate deterministic pair ordering to avoid always resolving seat 0 first.
    const pairs=[];for(let i=0;i<s.robots.length;i++)for(let j=i+1;j<s.robots.length;j++)pairs.push([s.robots[i],s.robots[j]]);
    if(s.tick%2)pairs.reverse();for(const [a,b] of pairs)collidePair(s,a,b);
  }
  function impactDamage(mass,speed){if(speed<105)return 0;return clamp((.5*mass*speed*speed/225000)*10,0,MAX_IMPACT_DAMAGE);}
  function collideWalls(s,r){
    if(r.z>WALL_HEIGHT||!r.alive)return;const radius=r.stats.radius+2,hitThisStep=new Set();
    // A few position-only iterations resolve adjacent segments and corners;
    // each segment may receive impact damage at most once in this call.
    for(let pass=0;pass<4;pass++){
      let corrected=false;
      for(const w of s.walls){
        if(w.broken)continue;
        const [x1,y1,x2,y2,ox,oy]=wallEndpoints(w),px=clamp(r.x,Math.min(x1,x2),Math.max(x1,x2)),py=clamp(r.y,Math.min(y1,y2),Math.max(y1,y2));
        const dx=r.x-px,dy=r.y-py,d=Math.hypot(dx,dy);if(d>=radius-.00001)continue;
        const outward=r.vx*ox+r.vy*oy,damage=hitThisStep.has(w)?0:impactDamage(r.stats.mass,outward);
        if(damage>0){
          hitThisStep.add(w);damageWall(s,w,damage,px,py,'collision');damageRobot(s,r,null,damage*.12,0,1,'wall',px,py);
          if(w.broken){r.vx*=.8;r.vy*=.8;continue;}
        }
        let nx=d>.00001?dx/d:-ox,ny=d>.00001?dy/d:-oy,penetration=radius-d;
        // A center slightly beyond a solid face must be put fully inside it.
        // Interior endpoint contacts keep radial normals to slide along a gap.
        const signed=(r.x-x1)*ox+(r.y-y1)*oy;
        if(signed>0){nx=-ox;ny=-oy;penetration=radius+signed;}
        r.x+=nx*(penetration+.00001);r.y+=ny*(penetration+.00001);corrected=true;
        const velocity=r.vx*nx+r.vy*ny;
        if(velocity<0){r.vx-=velocity*1.18*nx;r.vy-=velocity*1.18*ny;}
      }
      if(!corrected)break;
    }
  }
  function applyHazards(s,r,dt,start=s.time){
    if(!r.alive||r.health<=0||!Number.isFinite(dt)||dt<=0)return;
    for(const h of s.hazards){
      const d=HAZARDS[h.type]||HAZARDS.fire;if(r.z>d.height)continue;
      const exposure=hazardExposure(h,start,dt);if(exposure<=0)continue;
      const coreHit=Math.hypot(r.x-h.x,r.y-h.y)<h.r+r.stats.radius*.65;
      if(coreHit){r.health=Math.max(0,r.health-d.damage*exposure);r.flash=.12;
        if(d.drag){r.vx*=Math.exp(-d.drag*exposure);r.vy*=Math.exp(-d.drag*exposure);}
        if(d.drain)r.energy=Math.max(0,r.energy-d.drain*exposure);}
      let partHit=false;
      for(const p of [...r.tools,...r.parts]){
        if(p.broken)continue;const pos=componentPosition(r,p);
        if(Math.hypot(pos.x-h.x,pos.y-h.y)<h.r+p.radius){damageComponent(s,r,p,d.partDamage*exposure,h.type);partHit=true;}
      }
      if((coreHit||partHit)&&s.time-r.lastHazard>1.5){r.lastHazard=s.time;event(s,'hazard',`${r.config.name}: damage from ${d.label.toLowerCase()}`,r.x,r.y);}
    }
  }
  function step(s,dt=STEP){
    if(s.status!=='running')return s;dt=clamp(num(dt,STEP),0,STEP);if(dt===0)return s;
    advanceExits(s,dt);
    if(s.pendingResult){
      s.tick++;s.settleElapsed=(s.settleElapsed||0)+dt;
      stepProjectiles(s,dt);
      s.effects=s.effects.filter(f=>s.time+s.settleElapsed-f.born<.65);
      for(const r of s.robots)if(r.alive&&r.health<=0)destroyRobot(s,r);
      finishIfNeeded(s);return s;
    }
    if(s.time>=MAX_SECONDS){finishIfNeeded(s);return s;}
    dt=Math.min(dt,MAX_SECONDS-s.time);s.time+=dt;
    // Snap only the clock's accumulated floating-point drift, never health.
    if(MAX_SECONDS-s.time<1e-9)s.time=MAX_SECONDS;
    s.tick++;
    const hazardSignature=s.hazards.map(h=>hazardActive(h,s.time)?'1':'0').join('');
    const hazardsChanged=s.hazardSignature!==hazardSignature;s.hazardSignature=hazardSignature;
    for(const p of s.pickups||[])if(!p.announced&&s.time>=p.spawnAt){p.announced=true;if(pickupAvailable(s,p))event(s,'supply',p.kind==='repair'?'Repair kit deployed':'Extra tool deployed',p.x,p.y);}
    for(const w of s.walls)w.flash=Math.max(0,w.flash-dt);
    for(const r of s.robots){
      if(!r.alive)continue;
      // Count simulation seconds, not wall time: pause, replay and online
      // snapshots therefore share the same pickup eligibility.
      r.pickupCooldown=Math.max(0,num(r.pickupCooldown,0)-dt);
      if(r.pickupCooldown<1e-9)r.pickupCooldown=0; // Floating-point drift only.
      r.dashCooldown=Math.max(0,r.dashCooldown-dt);r.dash=Math.max(0,r.dash-dt);r.flash=Math.max(0,r.flash-dt);r.energy=Math.min(100,r.energy+12*dt);
      for(const t of r.tools){t.cooldown=Math.max(0,t.cooldown-dt);t.firing=Math.max(0,t.firing-dt);t.flash=Math.max(0,t.flash-dt);}
      for(const p of r.parts)p.flash=Math.max(0,p.flash-dt);
      const e=nearestEnemy(s,r);r.targetId=e?.id??null;if(s.tick%6===1||hazardsChanged)chooseAction(s,r,e);steer(s,r,e,dt);
    }
    const geometryCache=new Map();
    resolveAttacks(s,s.robots.flatMap(r=>collectAttacks(s,r,undefined,geometryCache)));
    for(const r of s.robots){
      if(!r.alive)continue;r.vx=clamp(r.vx,-650,650);r.vy=clamp(r.vy,-650,650);r.x+=r.vx*dt;r.y+=r.vy*dt;
      if(r.z>0||r.vz>0){
        r.vz-=520*dt;r.z+=r.vz*dt;r.peakZ=Math.max(r.peakZ,r.z);r.vx*=Math.exp(-.15*dt);r.vy*=Math.exp(-.15*dt);
        if(r.z<=0){r.z=0;r.vz=0;
          if(r.peakZ>60){const damage=Math.min(22,r.peakZ*.08);r.health=Math.max(0,r.health-damage);r.flash=.2;
            for(const p of r.parts.filter(p=>p.kind==='drive'))damageComponent(s,r,p,damage*.45,'landing');
            event(s,'land',`${r.config.name} lands`,r.x,r.y);}
          r.peakZ=0;
        }
      }
    }
    collideRobots(s);stepProjectiles(s,dt);stepFlames(s,dt);stepContact(s,dt);
    s.effects=s.effects.filter(f=>s.time-f.born<.65);
    for(const r of s.robots){
      if(!r.alive)continue;
      if(r.health<=0){destroyRobot(s,r);continue;}
      collideWalls(s,r);
      if(r.health<=0){destroyRobot(s,r);continue;}
      if(beginRingOut(s,r))continue;
      applyHazards(s,r,dt,s.time-dt);r.health=Math.max(0,r.health);
      if(r.health<=0)destroyRobot(s,r);
    }
    s.flames=s.flames.filter(f=>s.robots[f.owner].alive);
    collectPickups(s);
    for(const d of s.debris){d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=Math.exp(-2*dt);d.vy*=Math.exp(-2*dt);d.angle+=dt*1.8;}
    s.debris=s.debris.filter(d=>s.time-d.born<10);
    finishIfNeeded(s);
    return s;
  }
  const loadouts=Object.freeze({
    dual:{body:'wedge',motor:3,armor:2,tools:[{type:'ram',x:19,y:-11,angle:0,power:1},{type:'saw',x:19,y:11,angle:0,power:1}]},
    breacher:{body:'box',motor:2,armor:2,tools:[{type:'hammer',x:20,y:-10,angle:0,power:3},{type:'plow',x:20,y:12,angle:0,power:1}]},
    sidewinder:{body:'circle',motor:3,armor:2,tools:[{type:'drill',x:0,y:-21,angle:270,power:2},{type:'ram',x:0,y:21,angle:90,power:1}]},
    ranged:{body:'box',motor:3,armor:3,tools:[
      {type:'machinegun',x:21,y:-12,angle:0,power:1},{type:'rocket',x:21,y:12,angle:0,power:1},
      {type:'flamethrower',x:0,y:0,angle:0,power:1}]},
    arsenal:{body:'wedge',motor:2,armor:2,tools:[
      {type:'ram',x:18,y:-12,angle:0,power:1},{type:'drill',x:18,y:12,angle:0,power:1},
      {type:'saw',x:0,y:-22,angle:270,power:1},{type:'hammer',x:0,y:22,angle:90,power:1},
      {type:'flipper',x:-18,y:-12,angle:180,power:1},{type:'plow',x:-18,y:12,angle:180,power:1}]}
  });
  const rivals=[
    normalizeConfig({name:'BLOCK-09',...loadouts.breacher,rules:[{when:'near',do:'weapon'},{when:'hazard',do:'avoid'},{when:'far',do:'charge'},{when:'always',do:'push'}]}),
    normalizeConfig({name:'MANTIS-02',body:'wedge',weapon:'flipper',motor:5,armor:2,rules:[{when:'near',do:'weapon'},{when:'edge',do:'center'},{when:'hazard',do:'avoid'},{when:'always',do:'push'}]}),
    normalizeConfig({name:'ORBIT-07',...loadouts.sidewinder,rules:[{when:'near',do:'weapon'},{when:'hazard',do:'avoid'},{when:'edge',do:'center'},{when:'far',do:'charge'},{when:'always',do:'orbit'}]})
  ];
  rivals.push(normalizeConfig({name:'EMBER-04',...loadouts.ranged,rules:defaultRules()}));
  return {VERSION,BODY_GEOMETRY,BATTLE_MODES,modeInfo,teamForSlot,teamName,areAllies,isEnemy,buildTeamStandings,spawnsFor,FLIPPER_LIFT_MULTIPLIER,generatePracticeBots,createPracticeBattle,MACHINEGUN_ROUNDS,MACHINEGUN_INTERVAL,EXIT_CLEARANCE,EXIT_DURATION,DESTRUCTION_FADE_SECONDS,WRECK_SCATTER_SECONDS,STUCK_WINDOW,RECOVERY_SECONDS,footprint,CHASSIS_HP,MAX_BOTS,SPAWNS,createBattle,nearestEnemy,buildStandings,finishIfNeeded,stepProjectiles,stepFlames,stepContact,PROJECTILE_BOUNDS,firingPose,traceWallRay,collideRobots,BOUNDS,WALL_HEIGHT,WALL_HP,MAX_IMPACT_DAMAGE,SEGMENTS,STEP,MAX_SECONDS,START_COUNTDOWN_SECONDS,MAX_RULES,MAX_TOOLS,BUDGET,CHASSIS_HP_MULTIPLIER,COMPONENT_HP_MULTIPLIER,DURABILITY_MULTIPLIER,MAX_BONUS_TOOLS,REPAIR_FRACTION,PART_REPAIR_FRACTION,SUPPLY_INTERVAL,PICKUP_COOLDOWN,HAZARDS,
    BODIES,WEAPONS,CONDITIONS,ACTIONS,MOUNTS,ROBOT_NAMES,robotName,uniqueRobotConfigs,clamp,angleDiff,toolStats,toolScale,toolGeometry,normalizeConfig,cost,stats,rng,
    createMatch,createField,step,wallEndpoints,hazardActive,hazardWarning,pickupAvailable,nearestPickup,canCollect,collectPickups,applyHazards,nearestHazard,sensors,rivals,defaultRules,loadouts,worldPoint,toolPose,
    componentPosition,wreckToolPose,wreckToolVisible,wreckToolAvailable,driveFactor,damageRobot,damageComponent,damageWall,impactDamage,collectAttacks,resolveAttacks,collideWalls};
});
