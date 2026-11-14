'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const E=require('../public/engine');

async function withServer(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'line-arena-test-'));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const controllers=[];
 try {
  const base=await new Promise((resolve,reject)=>{
   let buffer='';const timer=setTimeout(()=>reject(Error('Server startup timed out')),5000);
   child.stdout.on('data',chunk=>{buffer+=chunk;const m=/http:\/\/127\.0\.0\.1:(\d+)/.exec(buffer);if(m){clearTimeout(timer);resolve(m[0]);}});
   child.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  async function api(route,body,cookie,method='POST'){
   const res=await fetch(base+route,{method,headers:{Connection:'close',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
   return {status:res.status,cookie:res.headers.get('set-cookie')?.split(';')[0],data:await res.json()};
  }
  async function stream(code,cookie){
   const controller=new AbortController();controllers.push(controller);
   const res=await fetch(base+`/api/rooms/${code}/events`,{headers:{Cookie:cookie,Connection:'close'},signal:controller.signal});assert.equal(res.status,200);
   const readFinal=async({until}={})=>{
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',count=0,sawWallDamage=false,sawCooldown=false,sawPartDamage=false;
    try{while(true){const{value,done}=await reader.read();if(done)throw Error('Stream closed before final state');buffer+=decoder.decode(value,{stream:true});let cut;
     while((cut=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const line=part.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;
      const msg=JSON.parse(line.slice(6));if(msg.type==='state'){
       count++;sawWallDamage ||= msg.state.walls.some(w=>w.health<w.maxHealth);sawCooldown ||= msg.state.robots.some(r=>r.tools.some(t=>t.cooldown>0));
       sawPartDamage ||= msg.state.robots.some(r=>r.parts.some(p=>p.health<p.maxHealth));
       if(msg.state.status==='finished'||until?.(msg.state))return{state:msg.state,count,sawWallDamage,sawCooldown,sawPartDamage};
      }
     }
    }}finally{controller.abort();try{await reader.cancel();}catch(_){}reader.releaseLock();}
   };
   return {readFinal,close:()=>controller.abort()};
  }
  await fn({api,stream,dir});
 }finally{
  controllers.forEach(c=>c.abort());child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,2000))]);fs.rmSync(dir,{recursive:true,force:true});
 }
}
const attack={motor:1,armor:1,tools:[{type:'drill',power:3,x:20,y:-4,angle:0},{type:'drill',power:3,x:20,y:4,angle:0}],rules:[{when:'always',do:'weapon'}]};
const defense={motor:1,armor:1,tools:[{type:'plow',power:1,x:-19,y:8,angle:167}],rules:[{when:'always',do:'brake'}]};

test('Two independent pilots receive identical authoritative component damage and cooldowns', {timeout:120000},async()=>{
 await withServer(async({api,stream,dir})=>{
  const a=await api('/api/session',{alias:'Pilot A',robot:{...attack,name:'TEST A'}});
  const b=await api('/api/session',{alias:'Pilot B',robot:{...defense,name:'TEST B'}});
  assert.equal(a.status,200);assert.notEqual(a.data.pilot.id,b.data.pilot.id);
  const a2=await api('/api/session',{alias:'Pilot A',robot:{...attack,name:'TEST A2'}},a.cookie);
  assert.equal(a2.data.pilot.id,a.data.pilot.id);assert.equal(a2.data.pilot.robot.tools.length,2);
  assert.equal(b.data.pilot.robot.tools[0].angle,167,'Arbitrary mounting angle is retained by the server');
  const created=await api('/api/rooms',{},a.cookie),code=created.data.room.code;
  assert.equal(created.status,201);assert.equal((await api('/api/rooms',{},a.cookie)).status,409);
  assert.equal((await api(`/api/rooms/${code}/join`,{},b.cookie)).status,200);
  assert.equal((await api('/api/session',{robot:{}},a.cookie)).status,409);
  assert.equal((await api(`/api/rooms/${code}/start`,{},b.cookie)).status,403);
  const sa=await stream(code,a.cookie),sb=await stream(code,b.cookie),pa=sa.readFinal(),pb=sb.readFinal();
  assert.equal((await api(`/api/rooms/${code}/start`,{},a.cookie)).status,200);
  const[ra,rb]=await Promise.all([pa,pb]);assert.ok(ra.count>3);assert.deepEqual(ra.state,rb.state);
  assert.equal(ra.state.result.standings.length,2);assert.deepEqual(ra.state.result,rb.state.result);
  assert.deepEqual(ra.state.robots.map(r=>r.controller),['player','player']);
  assert.deepEqual(ra.state.robots[0].config,E.normalizeConfig({...attack,name:'TEST A2'}));
  assert.deepEqual(ra.state.robots[1].config,E.normalizeConfig({...defense,name:'TEST B'}));
  assert.ok(ra.sawCooldown&&rb.sawCooldown);assert.ok(ra.sawPartDamage&&rb.sawPartDamage);
  assert.equal(ra.state.robots[1].reason,'Robot destroyed');assert.ok(ra.state.robots[1].parts.some(p=>p.broken));
  assert.ok(ra.state.walls.every(w=>w.maxHealth===E.WALL_HP));sa.close();sb.close();
  assert.equal((await api(`/api/rooms/${code}/leave`,{},a.cookie)).status,200);
  assert.equal((await api(`/api/rooms/${code}/leave`,{},b.cookie)).status,200);
  assert.equal((await api('/api/me',null,a.cookie,'GET')).data.room,null);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'pilots.json'),'utf8'));assert.equal(saved.length,2);
  assert.equal(saved.find(p=>p.id===a.data.pilot.id).robot.name,'TEST A2');
 });
});
test('Online wall HP accumulates across snapshots and both pilots see the same breach', {timeout:40000},async()=>{
 await withServer(async({api,stream})=>{
  const breacher={motor:1,armor:1,tools:[-12,-8,8,12].map(y=>({type:'ram',power:1,x:-20,y,angle:180})),rules:[{when:'always',do:'wall'}]};
  const a=await api('/api/session',{alias:'Breacher',robot:breacher}),b=await api('/api/session',{alias:'Observer',robot:defense});
  const room=await api('/api/rooms',{},a.cookie),code=room.data.room.code;await api(`/api/rooms/${code}/join`,{},b.cookie);
  const sa=await stream(code,a.cookie),sb=await stream(code,b.cookie),pa=sa.readFinal(),pb=sb.readFinal();await api(`/api/rooms/${code}/start`,{},a.cookie);
  const[ra,rb]=await Promise.all([pa,pb]);assert.ok(ra.sawWallDamage&&rb.sawWallDamage);assert.deepEqual(ra.state,rb.state);
  assert.ok(ra.state.walls.some(w=>w.broken&&w.health===0&&w.hits>=2));assert.equal(ra.state.robots[0].reason,'Out of the arena');sa.close();sb.close();
 });
});
test('The server ignores forged runtime HP, damage and cooldowns and bounds the blueprint', {timeout:10000},async()=>{
 await withServer(async({api})=>{
  const forged={motor:999,armor:999,health:99999,energy:Infinity,tools:Array(9).fill({type:'hammer',power:99,x:999,y:-999,angle:999,health:99999,cooldown:-50,stats:{damage:99999}})};
  const a=await api('/api/session',{alias:'Validation',robot:forged});assert.equal(a.status,200);
  const c=a.data.pilot.robot;assert.ok(c.tools.length<=E.MAX_TOOLS);assert.ok(E.cost(c)<=E.BUDGET);assert.ok(!('health'in c));assert.ok(c.tools.every(t=>!('stats'in t)&&!('health'in t)&&!('cooldown'in t)));
 });
});


test('Both online clients see identical randomized terrain and an actual bonus-tool collection', {timeout:15000},async()=>{
 await withServer(async({api,stream})=>{
  const scavenger={body:'circle',motor:5,armor:5,tools:[],rules:[{when:'always',do:'collect'}]};
  const a=await api('/api/session',{alias:'Scavenger',robot:scavenger});
  const b=await api('/api/session',{alias:'Observer',robot:{tools:[],rules:[{when:'always',do:'brake'}]}});
  const created=await api('/api/rooms',{},a.cookie),code=created.data.room.code;await api(`/api/rooms/${code}/join`,{},b.cookie);
  const sa=await stream(code,a.cookie),sb=await stream(code,b.cookie);
  const until=s=>s.robots[0].tools.some(t=>t.bonus),pa=sa.readFinal({until}),pb=sb.readFinal({until});
  await api(`/api/rooms/${code}/start`,{},a.cookie);
  const[ra,rb]=await Promise.all([pa,pb]);assert.deepEqual(ra.state,rb.state);
  assert.ok(ra.state.robots[0].tools.some(t=>t.bonus),'An actual server-simulated pickup was attached');
  assert.ok(ra.state.pickups.some(p=>p.collectedBy===0));assert.equal(ra.state.pickups.length,16);
  assert.deepEqual(ra.state.hazards,E.createField(ra.state.seed).hazards);
  const me=await api('/api/me',null,a.cookie,'GET');assert.equal(me.data.pilot.robot.tools.length,0,'Match loot is not persisted to the pilot blueprint');
  sa.close();sb.close();
 });
});

test('Eight independent pilots share one authoritative match; a ninth is refused and forfeits do not end it early', {timeout:15000},async()=>{
 await withServer(async({api,stream})=>{
  const users=[];for(let i=0;i<9;i++)users.push(await api('/api/session',{alias:'Seat '+i,robot:{name:'PLAYER '+i,body:['diamond','octagon','capsule','cross','hex','circle'][i%6],tools:[],rules:[{when:'always',do:'brake'}]}}));
  const created=await api('/api/rooms',{},users[0].cookie),code=created.data.room.code;
  for(let i=1;i<8;i++){const d=await api(`/api/rooms/${code}/join`,{},users[i].cookie);assert.equal(d.status,200);assert.equal(d.data.room.players.length,i+1);}
  assert.equal((await api(`/api/rooms/${code}/join`,{},users[8].cookie)).status,409);
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[2].cookie)).status,403);
  const streams=[];for(let i=0;i<8;i++)streams.push(await stream(code,users[i].cookie));
  const readings=streams.map(st=>st.readFinal({until:s=>s.tick>=8}));
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[0].cookie)).status,200);
  const snapshots=await Promise.all(readings);for(const d of snapshots){assert.deepEqual(d.state,snapshots[0].state);assert.equal(d.state.robots.length,8);assert.ok(d.state.robots.every(r=>r.health===250));
   assert.deepEqual(d.state.robots.map(r=>r.config),users.slice(0,8).map(u=>u.data.pilot.robot));}
  for(let i=0;i<6;i++){
   await api(`/api/rooms/${code}/leave`,{},users[i].cookie);
   assert.equal((await api('/api/me',null,users[7].cookie,'GET')).data.room.status,'running');
  }
  await api(`/api/rooms/${code}/leave`,{},users[6].cookie);
  const last=await stream(code,users[7].cookie);const result=await last.readFinal();assert.equal(result.state.result.winner,7);assert.equal(result.state.status,'finished');
  assert.equal(result.state.robots.filter(r=>r.alive).length,1);
  assert.equal(result.state.result.standings.length,8);assert.equal(result.state.result.standings[0].id,7);
  assert.ok(result.state.robots.slice(0,7).every(r=>Number.isFinite(r.eliminatedAt)));
  assert.ok(result.state.result.standings.slice(1).every(r=>r.reason==='Forfeit'));
 });
});

test('Three-person rooms can start, and leaving a waiting lobby transfers hosting without closing it', {timeout:10000},async()=>{
 await withServer(async({api,stream})=>{
  const users=[];for(let i=0;i<4;i++)users.push(await api('/api/session',{alias:'Lobby '+i,robot:{tools:[],rules:[{when:'always',do:'brake'}]}}));
  const created=await api('/api/rooms',{},users[0].cookie),code=created.data.room.code;
  for(let i=1;i<4;i++)assert.equal((await api(`/api/rooms/${code}/join`,{},users[i].cookie)).status,200);
  await api(`/api/rooms/${code}/leave`,{},users[0].cookie);
  const me=await api('/api/me',null,users[1].cookie,'GET');assert.equal(me.data.room.players.length,3);assert.equal(me.data.room.host,users[1].data.pilot.id);
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[1].cookie)).status,200);
  const st=await stream(code,users[3].cookie);const result=await st.readFinal({until:s=>s.tick>=4});assert.equal(result.state.robots.length,3);
 });
});


test('Server accepts the complete 200-point budget and bounds an oversized update', {timeout:10000},async()=>{
 await withServer(async({api})=>{
  const robot={name:'BUDGET 200',body:'hex',motor:4,armor:3,tools:[
   {type:'machinegun',power:3,x:18,y:-10,angle:0},
   {type:'rocket',power:3,x:18,y:10,angle:0},
   {type:'flamethrower',power:3,x:0,y:0,angle:0}]};
  const session=await api('/api/session',{alias:'Budget test',robot});assert.equal(session.status,200);
  const saved=session.data.pilot.robot;assert.equal(E.cost(saved),200);
  assert.equal(saved.armor,3);assert.equal(saved.motor,4);assert.ok(saved.tools.every(t=>t.power===3));
  const read=await api('/api/me',null,session.cookie,'GET');assert.deepEqual(read.data.pilot.robot,saved);
  const excess=await api('/api/session',{robot:{...robot,armor:4}},session.cookie);
  assert.equal(excess.status,200);assert.ok(E.cost(excess.data.pilot.robot)<=200);
 });
});

test('4v4 online: eight human blueprints, identical snapshots, full-team victory and no ninth seat', {timeout:20000},async()=>{
 await withServer(async({api,stream})=>{
  const users=[];for(let i=0;i<9;i++)users.push(await api('/api/session',{alias:'Team pilot '+i,robot:{name:'REAL PLAYER '+i,body:Object.keys(E.BODIES)[i%8],tools:[],rules:[{when:'always',do:'brake'}]}}));
  const created=await api('/api/rooms',{mode:'4v4'},users[0].cookie);assert.equal(created.status,201);const code=created.data.room.code;
  assert.equal(created.data.room.capacity,8);assert.equal(created.data.room.mode,'4v4');
  for(let i=1;i<7;i++){const d=await api(`/api/rooms/${code}/join`,{},users[i].cookie);assert.equal(d.status,200);assert.equal(d.data.room.status,'waiting');}
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[0].cookie)).status,409);
  const joined=await api(`/api/rooms/${code}/join`,{},users[7].cookie);assert.equal(joined.status,200);assert.equal(joined.data.room.status,'ready');assert.deepEqual(joined.data.room.players.map(p=>p.team),[0,1,0,1,0,1,0,1]);
  assert.equal((await api(`/api/rooms/${code}/join`,{},users[8].cookie)).status,409);
  assert.equal((await api(`/api/rooms/${code}/settings`,{mode:'ffa'},users[1].cookie)).status,403);
  assert.equal((await api(`/api/rooms/${code}/settings`,{mode:'2v2'},users[0].cookie)).status,409);
  const streams=await Promise.all(users.slice(0,8).map(u=>stream(code,u.cookie))),readings=streams.map(x=>x.readFinal({until:s=>s.tick>=4}));
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[0].cookie)).status,200);
  const states=await Promise.all(readings);for(const {state} of states){assert.deepEqual(state,states[0].state);assert.equal(state.mode,'4v4');assert.equal(state.teamCount,2);assert.equal(state.robots.length,8);assert.deepEqual(state.robots.map(r=>r.config),users.slice(0,8).map(u=>u.data.pilot.robot));}
  assert.equal((await api(`/api/rooms/${code}/settings`,{mode:'ffa'},users[0].cookie)).status,409);
  for(const i of [1,3,5]){await api(`/api/rooms/${code}/leave`,{},users[i].cookie);assert.equal((await api('/api/me',null,users[0].cookie,'GET')).data.room.status,'running');}
  await api(`/api/rooms/${code}/leave`,{},users[7].cookie);
  const last=await stream(code,users[0].cookie),final=await last.readFinal();assert.equal(final.state.result.winnerTeam,0);assert.equal(final.state.result.draw,false);assert.deepEqual(final.state.result.winners,[0,2,4,6]);assert.equal(final.state.result.teamStandings[0].health,1000);
 });
});
test('Host can change waiting-room modes; invalid modes reject and balanced capacity is enforced', {timeout:10000},async()=>{
 await withServer(async({api})=>{
  const users=[];for(let i=0;i<4;i++)users.push(await api('/api/session',{alias:'Mode '+i,robot:{tools:[],rules:[{when:'always',do:'brake'}]}}));
  assert.equal((await api('/api/rooms',{mode:'__proto__'},users[0].cookie)).status,400);
  const created=await api('/api/rooms',{mode:'2v2'},users[0].cookie),code=created.data.room.code;
  await api(`/api/rooms/${code}/join`,{},users[1].cookie);
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[0].cookie)).status,409);
  assert.equal((await api(`/api/rooms/${code}/settings`,{mode:'bogus'},users[0].cookie)).status,400);
  const free=await api(`/api/rooms/${code}/settings`,{mode:'ffa'},users[0].cookie);assert.equal(free.data.room.status,'ready');assert.equal(free.data.room.capacity,8);
  assert.ok(free.data.room.players.every(p=>p.team===null));
  const teams=await api(`/api/rooms/${code}/settings`,{mode:'2v2'},users[0].cookie);assert.equal(teams.data.room.status,'waiting');
  for(const i of [2,3])await api(`/api/rooms/${code}/join`,{},users[i].cookie);
  const me=await api('/api/me',null,users[0].cookie,'GET');assert.equal(me.data.room.status,'ready');assert.deepEqual(me.data.room.players.map(p=>p.team),[0,1,0,1]);
  assert.equal((await api(`/api/rooms/${code}/start`,{},users[0].cookie)).status,200);
 });
});
test('Three and four teams are supported by the authoritative server without replacing human robots', {timeout:15000},async()=>{
 for(const mode of ['2v2v2','2v2v2v2'])await withServer(async({api,stream})=>{
  const m=E.BATTLE_MODES[mode],users=[];for(let i=0;i<m.count;i++)users.push(await api('/api/session',{alias:'Human '+i,robot:{name:'FIXED '+i,tools:[],rules:[{when:'always',do:'brake'}]}}));
  const created=await api('/api/rooms',{mode},users[0].cookie),code=created.data.room.code;
  for(let i=1;i<m.count;i++)await api(`/api/rooms/${code}/join`,{},users[i].cookie);
  const a=await stream(code,users[0].cookie),promise=a.readFinal({until:s=>s.tick>=4});await api(`/api/rooms/${code}/start`,{},users[0].cookie);const {state}=await promise;
  assert.equal(state.mode,mode);assert.equal(state.teamCount,m.teams);assert.deepEqual(state.robots.map(r=>r.config),users.map(u=>u.data.pilot.robot));
  for(let id=0;id<m.teams;id++)assert.equal(state.robots.filter(r=>r.team===id).length,2);
 });
});
