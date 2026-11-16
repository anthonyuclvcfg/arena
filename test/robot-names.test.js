'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine');
const robot=name=>E.normalizeConfig({...E.loadouts.dual,name,rules:[{when:'near',do:'tool1'},{when:'always',do:'push'},{when:'void',do:'brake'}],lines:[[-4,2,8,9]]});
const key=name=>name.trim().toUpperCase();
const names=state=>state.robots.map(r=>r.config.name);
const formatted=name=>/^[A-Z]+-[0-9A-Z]+-(?:0[1-9]|[1-9][0-9]+)$/.test(name)&&E.ROBOT_NAMES.includes(name.split('-')[0])&&name.length<=18;
const battle=(configs,seed,mode='ffa')=>E.createBattle(E.uniqueRobotConfigs(configs),seed,mode);
function unique(state){const n=names(state);assert.equal(new Set(n.map(key)).size,n.length);for(const name of n)assert.ok(name.trim()&&name.length<=18&&!/[<>\x00-\x1f]/.test(name));}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
function withoutName(config){const {name,...rest}=config;return rest;}

test('Match entry replaces duplicate robot names and preserves the first owner and all unique custom names',()=>{
 const input=['Custom Pilot','Custom Pilot','CUSTOM PILOT','Unique Robot'].map(robot);
 const state=battle(input,773,'ffa');unique(state);
 assert.equal(state.robots[0].config.name,'Custom Pilot');
 assert.equal(state.robots[3].config.name,'Unique Robot');
 assert.ok(state.robots.slice(1,3).every(r=>key(r.config.name)!==key('Custom Pilot')));
});

test('Collision matching covers case, surrounding whitespace and sanitization/truncation',()=>{
 for(const pair of [[' Robot ','robot'],['<RAVEN>','RAVEN'],['abcdefghijklmnopqr-A','abcdefghijklmnopqr-B']]){
  const input=pair.map(robot),state=battle(input,458);unique(state);
  assert.equal(state.robots[0].config.name,input[0].name);
 }
});

test('Eight colliding human names resolve independently of free-for-all or team grouping',()=>{
 const input=Array.from({length:8},()=>robot('Same Name'));
 const expected=names(battle(input,884,'ffa'));
 for(const mode of ['ffa','2v2v2v2']){
  const state=battle(input,884,mode);unique(state);assert.deepEqual(names(state),expected);
  assert.equal(state.robots.length,8);assert.ok(state.robots.every(r=>r.controller==='player'));
  state.robots.slice(1).forEach((r,i)=>{assert.ok(formatted(r.config.name));assert.ok(r.config.name.endsWith('-'+String(i+2).padStart(2,'0')));});
 }
});

test('A replacement never takes a distinct original name belonging to a later seat',()=>{
 const first=battle([robot('SAME'),robot('SAME')],823);
 const replacement=first.robots[1].config.name;
 assert.notEqual(key(replacement),key('SAME'));
 const state=battle([robot('SAME'),robot('SAME'),robot(replacement)],823);unique(state);
 assert.equal(state.robots[2].config.name,replacement);
});

test('Naming changes neither supplied blueprints nor tools, programming, health or drawing',()=>{
 const input=freeze(Array.from({length:8},(_,i)=>robot(i<6?'COLLISION':'Unique '+i)));
 const before=JSON.stringify(input),state=battle(input,468,'2v2v2v2');unique(state);
 assert.equal(JSON.stringify(input),before);
 state.robots.forEach((r,i)=>{
  assert.deepEqual(withoutName(r.config),withoutName(input[i]));assert.notEqual(r.config,input[i]);
  assert.equal(r.health,300);assert.equal(r.stats.hp,300);
 });
});

test('Resolved match names are deterministic and remain stable when authoritative configs are replayed',()=>{
 const input=Array.from({length:8},()=>robot('SHARED ROBOT'));
 const first=battle(input,2048),second=battle(input,2048);unique(first);assert.deepEqual(first,second);
 const restored=battle(first.robots.map(r=>r.config),2048);
 assert.deepEqual(restored,first);
 assert.deepEqual(names(battle(input,2099)),names(first),'new-seed rematch retains resolved identities');
 for(let i=0;i<420;i++){E.step(first);E.step(second);E.step(restored);}
 assert.deepEqual(first,second);assert.deepEqual(first,restored);
 const snapshot=JSON.parse(JSON.stringify(first));
 for(let i=0;i<60;i++){E.step(first);E.step(snapshot);}
 assert.deepEqual(snapshot,first);
});

test('Bot/human collisions preserve the human design and rename only conflicting bot identities',()=>{
 const seed=6677,bots=E.generatePracticeBots(seed,7),human=robot(bots[0].name),state=E.createPracticeBattle(human,8,seed);
 unique(state);assert.deepEqual(state.robots[0].config,human);
 state.robots.slice(1).forEach((r,i)=>{
  assert.equal(r.controller,'bot');assert.deepEqual(withoutName(r.config),withoutName(bots[i]));
  if(i>0)assert.equal(r.config.name,bots[i].name);
 });
});

test('Unique player-selected names remain exact across creation and a new-seed rematch',()=>{
 const input=['My Røbot','NOVA Custom','RAVEN-01','Two  Spaces'].map(robot);
 for(const seed of [1,55,67009]){
  const state=battle(input,seed,'2v2');unique(state);
  assert.deepEqual(state.robots.map(r=>r.config),input);
 }
});


test('Fresh identifiers preserve every original prefix and use the expanded name-code-number format',()=>{
 assert.deepEqual(E.ROBOT_NAMES,['NOVA','COBALT','TITAN','VIPER','QUARTZ','COMET','RAVEN','PULSE','VORTEX','SPARK','ECHO','BOLT']);
 const seen=new Set(),prefixes=new Set();
 for(const seed of [-1,0,1,28471,6677,4294967295,4294967296,...Array.from({length:256},(_,i)=>i+100)])for(const number of [1,4,8]){
  const name=E.robotName(seed,[],number);assert.ok(formatted(name));
  const [prefix,code,slot]=name.split('-');
  assert.equal(code,(seed>>>0).toString(36).toUpperCase());assert.equal(slot,String(number).padStart(2,'0'));
  assert.equal(name,E.robotName(seed,[],number));seen.add(name);prefixes.add(prefix);
 }
 assert.ok(seen.size>768);assert.equal(prefixes.size,E.ROBOT_NAMES.length);
});

test('Available-name selection ignores case and surrounding whitespace without mutating reservations',()=>{
 const chosen=E.robotName(91),occupied=freeze(['  '+chosen.toLowerCase()+'  ','Custom User']);
 const before=JSON.stringify(occupied),replacement=E.robotName(91,occupied);
 assert.ok(formatted(replacement));assert.notEqual(key(replacement),key(chosen));
 assert.equal(JSON.stringify(occupied),before);
});

test('Exhausting all prefixes advances the number while keeping the original name-code-number format',()=>{
 const seed=730,code=seed.toString(36).toUpperCase();
 const occupied=E.ROBOT_NAMES.flatMap(n=>[n+'-'+code+'-01',n+'-'+code+'-02']);
 for(let i=0;i<24;i++){
  const next=E.robotName(seed,occupied);
  assert.ok(formatted(next)&&!occupied.some(n=>key(n)===key(next)));
  const [,actualCode,number]=next.split('-');assert.equal(actualCode,code);assert.ok(Number(number)>=3);
  occupied.push(next);
 }
});

test('Original seeded practice prefixes and codes remain exact with two-digit participant numbers',()=>{
 const fixtures=[
  [0,['COMET-0-01','NOVA-0-02','RAVEN-0-03','PULSE-0-04','SPARK-0-05','ECHO-0-06','VIPER-0-07']],
  [28471,['SPARK-LYV-01','RAVEN-LYV-02','TITAN-LYV-03','VORTEX-LYV-04','COBALT-LYV-05','ECHO-LYV-06','NOVA-LYV-07']],
  [4294967295,['NOVA-1Z141Z3-01','COBALT-1Z141Z3-02','TITAN-1Z141Z3-03','RAVEN-1Z141Z3-04','ECHO-1Z141Z3-05','VIPER-1Z141Z3-06','SPARK-1Z141Z3-07']]
 ];
 for(const [seed,expected] of fixtures){const bots=E.generatePracticeBots(seed,7);assert.deepEqual(bots.map(r=>r.name),expected);assert.ok(bots.every(r=>formatted(r.name)));}
});

test('Name resolution normalizes and clones raw blueprints without mutating caller data',()=>{
 const raw=freeze([{name:'   <DUPLICATE>  ',body:'hex',motor:3,tools:[{type:'saw',power:2,x:15,y:0,angle:0}],rules:[{when:'near',do:'tool1'}]},
  {name:'duplicate',body:'square',motor:2,tools:[],rules:[]}]);
 const before=JSON.stringify(raw),resolved=E.uniqueRobotConfigs(raw);
 assert.equal(JSON.stringify(raw),before);assert.equal(resolved.length,2);
 assert.equal(resolved[0].name,'DUPLICATE');assert.notEqual(key(resolved[1].name),key(resolved[0].name));
 resolved.forEach((config,i)=>assert.deepEqual(withoutName(config),withoutName(E.normalizeConfig(raw[i]))));
 assert.deepEqual(E.uniqueRobotConfigs(resolved),resolved);
});
