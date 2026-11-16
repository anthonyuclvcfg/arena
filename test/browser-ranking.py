"""Focused live player HUD/ranking QA; no shipped hooks."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/construction-browser';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=Path(os.environ.get('ARENA_HTML',str(ROOT/'cspire-arena.html')))
marker='  initRoster();renderCatalog();newPreview();save();'
source=SOURCE.read_text();assert source.count(marker)==1
hook=r'''
  // Observation and deterministic state fixtures in test HTML only.
  const qaCardRefs=TAGS.map(tag=>$('fighter-'+tag));
  const qaApronRefs=[$('battle-mode-note'),document.querySelector('.field-strip'),$('team-strip'),document.querySelector('.arena-legend')],qaApronParents=qaApronRefs.map(e=>e.parentElement);
  const qaControlBar=document.querySelector('.battle-controls'),qaButtonRefs=['start','pause','speed','replay'].map(id=>$(id)),qaHandlers=qaButtonRefs.map(e=>e.onclick);
  const qaRect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y+scrollY,width:b.width,height:b.height,right:b.right,bottom:b.bottom+scrollY};};
  const qaScrollCalls=[];
  const qaCanvasSignature=canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261,count=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;for(let i=0;i<d.length;i++){hash=Math.imul(hash^d[i],16777619);if(i%4===3&&d[i]){const p=(i-3)/4,x=p%canvas.width,y=Math.floor(p/canvas.width);count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}return{hash:hash>>>0,count,bounds:[minX,minY,maxX,maxY]};};
  const qaScrollTo=window.scrollTo.bind(window),qaScrollIntoView=Element.prototype.scrollIntoView;
  window.scrollTo=(...args)=>{qaScrollCalls.push({kind:'scrollTo',at:performance.now()});return qaScrollTo(...args);};
  Element.prototype.scrollIntoView=function(...args){qaScrollCalls.push({kind:'scrollIntoView',at:performance.now()});return qaScrollIntoView.apply(this,args);};
  window.__kqa={
    apron:()=>{const canvas=qaRect(arena),top=$('arena-apron-top'),bottom=$('arena-apron-bottom');return{canvas,interior:{top:canvas.y+canvas.height*84/800,bottom:canvas.y+canvas.height*716/800,left:canvas.x+canvas.width*84/800,right:canvas.x+canvas.width*716/800},nodes:qaApronRefs.map((e,i)=>({same:e===[ $('battle-mode-note'),document.querySelector('.field-strip'),$('team-strip'),document.querySelector('.arena-legend')][i],home:e.parentElement===qaApronParents[i],id:e.id,hidden:e.hidden,text:e.textContent,rect:qaRect(e),top:top?.contains(e)||false,bottom:bottom?.contains(e)||false,overflow:(['hidden','clip','scroll','auto'].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1)||(['hidden','clip','scroll','auto'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1)})),teams:[...$('team-strip').children].map(e=>({rect:qaRect(e),text:e.textContent,accessible:e.getAttribute('aria-label')||e.title||e.textContent})),legend:[...document.querySelectorAll('.arena-legend>span')].map(e=>({rect:qaRect(e),text:e.textContent})),ids:['battle-mode-note','field-summary','next-supply','team-strip'].map(id=>({id,count:document.querySelectorAll('#'+id).length})),top:top?qaRect(top):null,bottom:bottom?qaRect(bottom):null};},
    controls:()=>{const slot=$('battle-controls-slot'),side=$('battle-sidebar'),rail=$('battle-roster');return{same:document.querySelector('.battle-controls')===qaControlBar,docked:slot.contains(qaControlBar),inSidebar:side.contains(qaControlBar),inRail:rail.contains(qaControlBar),bar:qaRect(qaControlBar),rail:qaRect(rail),active:document.activeElement?.id,buttons:qaButtonRefs.map((e,i)=>({id:e.id,same:$(e.id)===e,handler:e.onclick===qaHandlers[i],disabled:e.disabled,rect:qaRect(e)}))};},
    cardLayout:()=>qaCardRefs.filter(e=>!e.hidden).map(e=>({card:qaRect(e),name:qaRect(e.querySelector('.fighter-heading')),vitals:qaRect(e.querySelector('.fighter-vitals')),hp:qaRect(e.querySelector('.health-track')),energy:qaRect(e.querySelector('.energy-track'))})),
    toolProbe:(index,x,y)=>{const t=config.tools[index],k=E.toolScale(t),a=t.angle*Math.PI/180,wx=t.x+k*(x*Math.cos(a)-y*Math.sin(a)),wy=t.y+k*(x*Math.sin(a)+y*Math.cos(a)),b=builder.getBoundingClientRect(),scale=builderScale();return{x:b.x+(builder.width/2+wx*scale)*b.width/builder.width,y:b.y+(builder.height/2-12+wy*scale)*b.height/builder.height,hit:toolAt([wx,wy]),selected:selectedTool,power:t.power,scale:k,inside:Math.abs(wx)*scale<builder.width/2-8&&Math.abs(wy)*scale<builder.height/2-20};},
    builderImage:()=>({...qaCanvasSignature(builder),scale:builderScale()}),
    toolImage:(type,power,active,preview,angle)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const c=canvas.getContext('2d');c.translate(128,160);c.scale(3,3);c.strokeStyle='#ffffff';c.lineWidth=1.5;drawTool(c,{type,power,x:0,y:0,angle,firing:active?.2:0},.37,preview);return qaCanvasSignature(canvas);},
    runtime:()=>({mode,paused,speed,countdown}),
    scrolling:()=>({y:scrollY,calls:qaScrollCalls.slice()}),
    clearScroll:()=>{qaScrollCalls.length=0;},
    animations:()=>qaCardRefs.flatMap(e=>e.getAnimations()).map(a=>({state:a.playState,duration:a.effect.getTiming().duration,target:a.effect.target.id})),
    visual:()=>qaCardRefs.filter(e=>!e.hidden).map(e=>({id:Number(e.dataset.robotId),y:e.getBoundingClientRect().y,x:e.getBoundingClientRect().x,transform:getComputedStyle(e).transform})),
    pageFit:()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{topbar:rect(document.querySelector('.topbar')),legend:rect(document.querySelector('.arena-legend')),canvas:rect(arena),rail:rect($('battle-roster')),cards:qaCardRefs.filter(e=>!e.hidden).map(rect),viewport:{width:innerWidth,height:innerHeight}};},
    state:()=>state,
    cfg:()=>JSON.parse(JSON.stringify(config)),
    gate:()=>finishPresentation&&({...finishPresentation,elapsed:performance.now()-finishPresentation.at}),
    pause:()=>{paused=true;countdown=0;updateUI();},
    refresh:()=>updateUI(),
    name:()=>document.getElementById('arena-title')?.textContent,
    set:(s,kind='local',slot=0,info=null)=>{clearResults();room=info;battleMembers=null;mode=kind;state=s;onlineSlot=slot;paused=true;countdown=0;accumulator=0;history=[];lastEventId=-1;trails=Array.from({length:E.MAX_BOTS},()=>[]);$('arena-banner').classList.add('hidden');$('start').innerHTML='<span>□</span> Stop';enterBattleView();applyLock();updateUI();},
    members:(members,info)=>{battleMembers=members;room=info;updateUI();},
    finish:()=>{paused=true;countdown=0;state.projectiles=[];state.flames=[];state.time=120;state.robots.forEach(r=>{if(r.exit)r.exit.done=true;});E.finishIfNeeded(state);if(state.status!=='finished')throw Error('Fixture failed to finish');finish();},
    history:()=>{const base=JSON.parse(JSON.stringify(state)),end=JSON.parse(JSON.stringify(state));base.status='running';base.result=null;base.time=119.9;base.tick=7194;history=[base,base,base,end];},
    compare:()=>({expected:(state.result?.standings||E.buildStandings(state)).map(r=>({id:r.id,rank:r.rank,tied:r.tied,winner:r.winner,team:r.team})),cards:TAGS.map((tag,id)=>{const e=$('fighter-'+tag),b=e.getBoundingClientRect();return{id,nodeSame:e===qaCardRefs[id],hidden:e.hidden,robotId:e.dataset.robotId,color:e.style.getPropertyValue('--fighter-color'),name:$('name-'+tag).textContent,seat:$('seat-'+tag).textContent,seatTitle:$('seat-'+tag).title,seatElements:$('seat-'+tag).childElementCount,seatRect:qaRect($('seat-'+tag)),vitalsRect:qaRect(e.querySelector('.fighter-vitals')),seatOverflow:getComputedStyle($('seat-'+tag)).overflowX,healthLabel:$('health-meter-'+tag).getAttribute('aria-label'),rank:e.querySelector('.fighter-rank')?.textContent,standing:e.querySelector('.fighter-standing')?.textContent,winner:e.classList.contains('is-winner'),x:b.x,y:b.y,width:b.width,height:b.height};}).filter(c=>!c.hidden)}),
    measure:()=>{const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y+scrollY,width:b.width,height:b.height,right:b.right,bottom:b.bottom+scrollY};},rail=$('battle-roster');return{canvas:rect(arena),rail:rect(rail),railHidden:rail.hidden,railScroll:rail.scrollTop,railClient:rail.clientHeight,railHeight:rail.scrollHeight,hudInRail:rail.contains(document.querySelector('.match-hud')),clockDocked:$('battle-clock-slot').contains($('clock')),bodyBattle:document.body.classList.contains('battle-view'),world:arenaView(),overflow:document.documentElement.scrollWidth>innerWidth};},
    legacyVisible:()=>[...document.querySelectorAll('#results-panel,#results-shortcut,.results-table')].filter(e=>!e.hidden&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0).map(e=>e.id||e.className),
    reset:()=>{room=null;battleMembers=null;mode='idle';paused=false;countdown=0;newPreview();applyLock();leaveBattleView();updateUI();}
  };
'''
html=source.replace(marker,hook+marker,1)
checks=[];errors=[];details=[]
def check(name,ok):
 assert ok,name
 checks.append(name)
def formatted_name(page,name):
 return bool(re.fullmatch(r'[A-Z]+-[0-9A-Z]+-(?:0[1-9]|[1-9][0-9]+)',name)) and len(name)<=18 and name.split('-')[0] in page.evaluate('CSpireArena.ROBOT_NAMES')
def setup(browser,w=1560,h=900,motion='reduce',stored=None):
 page=browser.new_page(viewport={'width':w,'height':h},reduced_motion=motion)
 if stored is not None:page.add_init_script('if(!sessionStorage.getItem("identity-fixture")){localStorage.setItem("line-arena.robot.v1",'+json.dumps(json.dumps(stored))+');sessionStorage.setItem("identity-fixture","1");}')
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('http://arena.test/**',lambda r:r.fulfill(body=html,content_type='text/html'))
 page.goto('http://arena.test/');page.wait_for_function('typeof __kqa==="object"');return page
def compare(page,label,final=False):
 data=page.evaluate('__kqa.compare()');cards=data['cards'];expected=data['expected']
 visual=sorted(cards,key=lambda c:(c['y'],c['x']))
 check(label+' visual order equals exact engine standings',[c['id'] for c in visual]==[r['id'] for r in expected])
 check(label+' preserves original card nodes and robot identities',all(c['nodeSame'] and c['robotId']==str(c['id']) for c in cards))
 byid={c['id']:c for c in cards}
 check(label+' displays engine rank including exact ties',all(re.search(r'\d+',byid[r['id']]['rank'] or '') and int(re.search(r'\d+',byid[r['id']]['rank'])[0])==r['rank'] for r in expected))
 check(label+' winner markers wait until result reveal',all(c['winner']==(final and next(r['winner'] for r in expected if r['id']==c['id'])) for c in cards))
 return data
def stable(before,after,label):
 check(label+' keeps canvas position and dimensions',all(abs(before['canvas'][k]-after['canvas'][k])<.75 for k in ['x','y','width','height']))
 check(label+' retains fixed800-unit world',before['world']==after['world']=={'min':0,'size':800})
def apron(page,label,teams=0):
 a=page.evaluate('__kqa.apron()');c=a['canvas'];i=a['interior'];nodes=[n for n in a['nodes'] if not n['hidden']]
 check(label+' apron retains original nodes and unique IDs',all(n['same'] for n in a['nodes']) and all(n['count']==1 for n in a['ids']))
 check(label+' information is docked in exterior top and bottom margins',all(n['top'] for n in a['nodes'][:3]) and a['nodes'][3]['bottom'])
 check(label+' upper information never covers the playable square',all(n['rect']['y']>=c['y']-1 and n['rect']['bottom']<=i['top']+1 for n in nodes if n['top']))
 check(label+' legend remains below walls inside canvas',a['nodes'][3]['rect']['y']>=i['bottom']-1 and a['nodes'][3]['rect']['bottom']<=c['bottom']+1)
 check(label+' apron content fits without clipping',all(not n['overflow'] and n['rect']['x']>=c['x']-1 and n['rect']['right']<=c['right']+1 for n in nodes))
 check(label+' mode supply and field counts remain present',bool(a['nodes'][0]['text'].strip()) and all(w in a['nodes'][1]['text'] for w in ['ALIVE','HAZARDS','BONUSES','SUPPLY']))
 check(label+' all eight legend entries remain visible',len(a['legend'])==8 and all(e['rect']['height']>0 and e['rect']['x']>=c['x']-1 and e['rect']['right']<=c['right']+1 and e['rect']['y']>=i['bottom']-1 and e['rect']['bottom']<=c['bottom']+1 for e in a['legend']))
 check(label+' team health and member counts remain available',len(a['teams'])==teams if teams else a['nodes'][2]['hidden'])
 if teams:check(label+' every team chip stays outside upper wall',all(t['rect']['bottom']<=i['top']+1 and 'HP' in t['accessible'].upper() and 'ALIVE' in t['accessible'].upper() for t in a['teams']))
 details.append({'apron':label,'geometry':a})
def finish(page,label,before):
 page.evaluate('__kqa.finish();__kqa.history()');page.wait_for_timeout(180)
 check(label+' no winner banner/card during final3s',page.evaluate('__kqa.gate().elapsed<3000&&!__kqa.gate().shown&&document.getElementById("arena-banner").classList.contains("hidden")') and not any(c['winner'] or re.search(r'WINNER|VICTORY|SHARED',c['standing'] or '',re.I) for c in page.evaluate('__kqa.compare().cards')))
 stable(before,page.evaluate('__kqa.measure()'),label+' finishing')
 page.wait_for_function('__kqa.gate()?.shown',timeout=5000);page.wait_for_timeout(120)
 check(label+' reveals winner only after3s',page.evaluate('__kqa.gate().elapsed>=3000'))
 compare(page,label+' final',True);stable(before,page.evaluate('__kqa.measure()'),label+' finished')
 check(label+' final result keeps original action bar above ranking',page.evaluate('__kqa.controls().docked&&!__kqa.controls().inRail&&__kqa.controls().buttons.every(b=>b.same&&b.handler)'))
 check(label+' local result retains correct enabled actions',page.evaluate('__kqa.controls().buttons.every(b=>b.disabled===(b.id==="pause"))'))
 check(label+' old results table and Battle decided panel stay absent',page.evaluate('__kqa.legacyVisible().length===0') and page.get_by_text('Battle decided.',exact=True).is_hidden())
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 for count in [2,4,8]:
  page=setup(browser,1560,900)
  page.locator('#bot-count').select_option(str(count));page.locator('#preset').select_option('careful');cfg=page.evaluate('__kqa.cfg()')
  page.evaluate('scrollTo({top:0,behavior:"instant"});__kqa.clearScroll()')
  before_top=page.evaluate('__kqa.measure()')
  check(str(count)+' players begin in original top HUD',not before_top['hudInRail'] and not before_top['clockDocked'] and not before_top['bodyBattle'])
  check(str(count)+' workshop keeps original information nodes at home',page.evaluate('__kqa.apron().nodes.every(n=>n.same&&n.home)'))
  check(str(count)+' workshop keeps original controls outside sidebar',page.evaluate('__kqa.controls().same&&!__kqa.controls().docked&&__kqa.controls().buttons.every(b=>b.same&&b.handler)'))
  if count==2:
   page.locator('#start').evaluate('(e)=>e.focus({preventScroll:true})');page.keyboard.press('Enter')
  else:page.locator('#start').evaluate('(e)=>e.click()')
  page.wait_for_timeout(700);page.evaluate('__kqa.pause()')
  if count==2:check('Keyboard Enter preserves focus while Start moves into sidebar',page.evaluate('__kqa.controls().active==="start"'))
  check(str(count)+' start does not scroll the page',page.evaluate('__kqa.scrolling().y===0&&__kqa.scrolling().calls.length===0'))
  fit=page.evaluate('__kqa.pageFit()')
  check(str(count)+' desktop keeps CSPIRE bar and legend visible',fit['topbar']['y']>=0 and fit['topbar']['bottom']<=900 and fit['legend']['y']>=0 and fit['legend']['bottom']<=900)
  check(str(count)+' rail has12–16px gap and wider cards',12<=fit['rail']['x']-fit['canvas']['right']<=16 and fit['rail']['width']>=276)
  check(str(count)+' player cards fit the65–75px target',all(c['height']<=76 for c in fit['cards']))
  check(str(count)+' moving controls frees at least49px of field height',fit['canvas']['height']>=660)
  apron(page,str(count)+' players')
  check(str(count)+' apron frees additional field height',fit['canvas']['height']>667)
  card_layout=page.evaluate('__kqa.cardLayout()')
  check(str(count)+' names stay left of life energy and both bars',all(c['vitals']['x']>=c['name']['right']-1 and c['hp']['x']>=c['vitals']['x']-1 and c['energy']['x']>=c['vitals']['x']-1 for c in card_layout))
  check(str(count)+' names and vitals share the same vertical row',all(min(c['name']['bottom'],c['vitals']['bottom'])>max(c['name']['y'],c['vitals']['y']) for c in card_layout))
  controls=page.evaluate('__kqa.controls()')
  check(str(count)+' original bar and four handlers move above ranking',controls['same'] and controls['docked'] and controls['inSidebar'] and not controls['inRail'] and controls['bar']['bottom']<=controls['rail']['y']+1 and all(b['same'] and b['handler'] for b in controls['buttons']))
  check(str(count)+' local battle enables stop pause and speed but no replay yet',all(not b['disabled'] for b in controls['buttons'] if b['id']!='replay') and next(b['disabled'] for b in controls['buttons'] if b['id']=='replay'))
  battle=page.evaluate('__kqa.measure()');details.append({'players':count,'battle':battle})
  check(str(count)+' battle moves same HUD and clock into arena',battle['hudInRail'] and battle['clockDocked'] and battle['bodyBattle'])
  check(str(count)+' desktop HUD is right column without overflow',battle['rail']['x']>=battle['canvas']['right'] and not battle['overflow'])
  compare(page,str(count)+' initial')
  if count==2:
   page.locator('#pause').evaluate('(e)=>e.focus({preventScroll:true})');page.keyboard.press('Enter')
   check('Moved Pause button resumes via keyboard',page.evaluate('__kqa.runtime().paused===false'))
   page.keyboard.press('Enter');check('Moved Pause button pauses again',page.evaluate('__kqa.runtime().paused===true'))
   page.locator('#speed').evaluate('(e)=>e.click()');check('Moved Speed button cycles to2×',page.evaluate('__kqa.runtime().speed===2'))
   page.locator('#speed').evaluate('(e)=>e.click()');page.locator('#speed').evaluate('(e)=>e.click()')
   check('Moved Speed button retains complete cycle',page.evaluate('__kqa.runtime().speed===1'))
  colors=page.evaluate('__kqa.compare().cards.map(c=>c.color)')
  page.evaluate('''()=>{const s=__kqa.state();s.time=50;s.robots.forEach((r,i)=>r.health=200-i*10);s.robots[0].health=100.001;s.robots[1].health=100.002;if(s.robots.length>2){s.robots[2].alive=false;s.robots[2].health=290;s.robots[2].eliminatedAt=10;s.robots[2].reason='Ring out';s.robots[3].alive=false;s.robots[3].health=300;s.robots[3].eliminatedAt=20;s.robots[3].reason='Ring out';}__kqa.refresh();}''')
  compare(page,str(count)+' live damage/elimination')
  if count==4:check('Reduced motion reorders immediately without card animations',page.evaluate('__kqa.animations().length===0'))
  check(str(count)+' reorder preserves per-robot colors and own seat',page.evaluate('__kqa.compare().cards.map(c=>c.color)')==colors and 'YOU' in page.locator('#seat-a').inner_text())
  if count==8:
   page.evaluate('__kqa.state().robots[0].alive=false;__kqa.state().robots[0].health=0;__kqa.state().robots[0].eliminatedAt=32;__kqa.state().robots[0].reason="Robot destroyed";__kqa.refresh()')
   compare(page,'Own robot eliminated')
   check('Own eliminated card keeps YOU identity',page.locator('#fighter-a').evaluate('(e)=>e.classList.contains("is-own")') and 'YOU' in page.locator('#seat-a').inner_text() and 'OUT' in page.locator('#seat-a').inner_text())
   scroll=page.evaluate('''()=>{const r=document.getElementById('battle-roster'),h=r.querySelector('.match-hud'),target=[r,h].find(e=>e.scrollHeight>e.clientHeight+1);if(!target)return null;const y=scrollY,before=__kqa.controls().bar;target.scrollTop=150;return{top:target.scrollTop,pageBefore:y,pageAfter:scrollY,canvas:__kqa.measure().canvas,controlsBefore:before,controlsAfter:__kqa.controls().bar};}''')
   check('Eight-player rail scrolls independently',scroll and scroll['top']>0 and scroll['pageBefore']==scroll['pageAfter'])
   check('Roster scrolling does not move or hide the action bar',scroll['controlsBefore']==scroll['controlsAfter'] and page.evaluate('__kqa.controls().buttons.every(b=>b.same&&b.handler)'))
   page.evaluate('document.getElementById("battle-roster").scrollTop=0;document.querySelector(".match-hud").scrollTop=0')
  before=page.evaluate('__kqa.measure()');name=page.evaluate('__kqa.name()')
  check(str(count)+' arena has English seed name',bool(name) and name!='Arena 01' and bool(re.fullmatch(r"[A-Za-z][A-Za-z '\-]+",name)))
  finish(page,str(count)+' players',before)
  check(str(count)+' result preserves player programming',page.evaluate('__kqa.cfg()')==cfg)
  if count==2:
   page.locator('#restore-logic').click();page.wait_for_timeout(180)
   check('Restoring a program panel keeps battle HUD docked',page.evaluate('__kqa.measure().hudInRail&&__kqa.measure().bodyBattle&&!__kqa.measure().overflow'))
   check('Intro stays inert and aria-hidden when a battle dock reopens',page.evaluate('document.querySelector(".intro").inert&&document.querySelector(".intro").getAttribute("aria-hidden")==="true"'))
   page.locator('#collapse-logic').click();page.wait_for_timeout(180)
  if count==4:
   page.evaluate('scrollTo({top:0,behavior:"instant"});__kqa.clearScroll()')
   page.screenshot(path=str(ROOT/'previews/construction-ranking-desktop.png'),full_page=False)
   page.locator('#replay').evaluate('(e)=>e.focus({preventScroll:true})');page.keyboard.press('Enter');page.wait_for_timeout(40)
   check('Keyboard replay retains its original button and focus in sidebar',page.evaluate('__kqa.runtime().mode==="replay"&&__kqa.controls().active==="replay"&&__kqa.controls().docked&&__kqa.controls().buttons.every(b=>b.same&&b.handler)'))
   page.wait_for_timeout(660)
   check('Replay does not scroll away from CSPIRE bar',page.evaluate('__kqa.scrolling().y===0&&__kqa.scrolling().calls.length===0'))
   check('Replay retains same rail and arena seed name',page.evaluate('__kqa.measure().hudInRail&&document.body.classList.contains("battle-view")') and page.evaluate('__kqa.name()')==name)
  else:
   page.locator('#start').evaluate('(e)=>e.focus({preventScroll:true})');page.keyboard.press('Enter');page.wait_for_timeout(80)
   check(str(count)+' Another battle keeps rail and programming',page.evaluate('__kqa.measure().hudInRail&&__kqa.state().status==="running"&&__kqa.gate()===null') and page.evaluate('__kqa.cfg()')==cfg)
   page.keyboard.press('Enter');page.wait_for_timeout(180)
   check(str(count)+' keyboard Stop restores same controls and focus',page.evaluate('!__kqa.controls().docked&&__kqa.controls().active==="start"&&__kqa.controls().buttons.every(b=>b.same&&b.handler)'))
   check(str(count)+' stopping restores original full information layout',page.evaluate('__kqa.apron().nodes.every(n=>n.same&&n.home&&!n.top&&!n.bottom)'))
   check(str(count)+' stopping restores top HUD and clock',page.evaluate('!__kqa.measure().hudInRail&&!__kqa.measure().clockDocked&&!__kqa.measure().bodyBattle'))
  page.close()
 # New identities persist while explicitly saved custom designs/programs remain unchanged.
 page=setup(browser)
 initial=page.evaluate('__kqa.cfg()')
 check('Fresh player receives original prefix code and two-digit participant number',formatted_name(page,initial['name']) and initial['name'].endswith('-01'))
 check('Fresh random identifier is displayed and stored immediately',page.locator('#robot-name').input_value()==initial['name'] and page.evaluate('JSON.parse(localStorage.getItem("line-arena.robot.v1"))')==initial)
 page.reload();page.wait_for_function('typeof __kqa==="object"')
 check('Reload preserves the generated identifier and complete saved blueprint',page.evaluate('__kqa.cfg()')==initial)
 page.locator('#robot-name').fill('NOVA Custom');page.locator('#robot-name').dispatch_event('change')
 custom=page.evaluate('__kqa.cfg()')
 page.reload();page.wait_for_function('typeof __kqa==="object"')
 check('Reload preserves an explicitly chosen custom robot name',page.evaluate('__kqa.cfg()')==custom and custom['name']=='NOVA Custom')
 page.locator('#loadout').select_option('dual')
 check('Switching a loadout preserves the player-selected robot identifier',page.evaluate('__kqa.cfg().name')=='NOVA Custom')
 page.close()
 legacy={**initial,'name':'VECTOR-01','rules':[{'when':'hazard','do':'avoid'},{'when':'near','do':'tool1'},{'when':'always','do':'push'}],'lines':[[-6,2,8,12]]}
 page=setup(browser,stored=legacy)
 migrated=page.evaluate('__kqa.cfg()')
 check('Legacy VECTOR-01 defaults migrate once to the restored identifier format',formatted_name(page,migrated['name']) and migrated['name'].endswith('-01'))
 check('Legacy identity migration preserves tools drawing and programming',{k:v for k,v in migrated.items() if k!='name'}=={k:v for k,v in legacy.items() if k!='name'})
 page.reload();page.wait_for_function('typeof __kqa==="object"')
 check('Migrated identity persists unchanged after re-entry',page.evaluate('__kqa.cfg()')==migrated)
 page.close()
 custom_saved={**legacy,'name':'My Røbot'}
 page=setup(browser,stored=custom_saved)
 check('Existing custom saved identifiers and complete designs are kept exactly',page.evaluate('__kqa.cfg()')==custom_saved)
 page.close()
 # Restore the previous prefix/code/number style without replacing the user's prefix or design.
 for short_name in ['NOVA','RAVEN','BOLT']:
  short_saved={**legacy,'name':short_name}
  page=setup(browser,stored=short_saved);expanded=page.evaluate('__kqa.cfg()')
  check(short_name+' short identifier expands its original prefix with code and 01',formatted_name(page,expanded['name']) and expanded['name'].startswith(short_name+'-') and expanded['name'].endswith('-01'))
  check(short_name+' format migration preserves all other saved robot data',{k:v for k,v in expanded.items() if k!='name'}=={k:v for k,v in short_saved.items() if k!='name'})
  page.reload();page.wait_for_function('typeof __kqa==="object"')
  check(short_name+' expanded identifier persists without re-randomizing',page.evaluate('__kqa.cfg()')==expanded)
  page.close()
 for previous,expected in [('RAVEN-6UBO-1','RAVEN-6UBO-01'),('BOLT-6UBO-2','BOLT-6UBO-02'),('RAVEN-6UBO-01','RAVEN-6UBO-01'),('Custom-9','Custom-9')]:
  formatted_saved={**legacy,'name':previous}
  page=setup(browser,stored=formatted_saved);formatted=page.evaluate('__kqa.cfg()')
  check(previous+' keeps prefix code and design while only padding known generated numbers',formatted=={**formatted_saved,'name':expected})
  page.reload();page.wait_for_function('typeof __kqa==="object"')
  check(previous+' identifier remains stable after reload',page.evaluate('__kqa.cfg()')==formatted)
  page.close()
 # Human controller identity uses room metadata; layouts and privacy placeholders remain stable.
 page=setup(browser)
 long_name='Zoë <img src=x onerror=alert(1)> & José Long Controller Name'
 embedded_members=[{'n':'Alex Rivera','bot':False},{'n':long_name,'bot':False},{'n':'Unused bot account','bot':True},{'n':'Viewer Account','bot':False}]
 for kind,members_key,name_key in [('Embedded','members','n'),('Node','players','alias')]:
  members=[({name_key:m['n'],'bot':m['bot']}) for m in embedded_members]
  page.evaluate('''({key,members})=>{const E=CSpireArena,s=E.createBattle(['NOVA-01','COBALT-01','RAVEN-01','PULSE-01'].map(name=>({...__kqa.cfg(),name})),456,'2v2');s.robots[2].controller='bot';__kqa.set(s,'online',3,{[key]:members,mode:'2v2'});}''',{'key':members_key,'members':members})
  page.wait_for_timeout(180);cards=page.evaluate('__kqa.compare().cards')
  expected=['A · Alex Rivera','B · '+long_name,'A · BOT 3','B · YOU']
  check(kind+' human labels show controller names and retain YOU/BOT #',[c['seat'] for c in cards]==expected)
  check(kind+' long Unicode/controller text remains plain text with full title',all(c['seatTitle']==e and c['seatElements']==0 for c,e in zip(cards,expected)))
  check(kind+' health labels identify each controller and robot',all(c['name'] in c['healthLabel'] and c['seat'] in c['healthLabel'] for c in cards))
  check(kind+' controller identity never substitutes numbered player labels',not any(re.search(r'\bP[1-8]\b',c['seat']) for c in cards))
  check(kind+' long names preserve compact cards without horizontal overflow',not page.evaluate('__kqa.measure().overflow') and all(c['height']<=76 for c in cards))
  check(kind+' long controller labels fit their heading without overlapping vitals',all(c['seatRect']['right']<=c['vitalsRect']['x']+1 and c['seatOverflow']=='hidden' for c in cards))
  page.evaluate('''()=>{const s=__kqa.state();s.time=50;s.robots[0].health=20;s.robots[1].health=290;s.robots[2].alive=false;s.robots[2].health=0;s.robots[2].eliminatedAt=30;s.robots[2].reason='Robot destroyed';__kqa.refresh();}''')
  compare(page,kind+' identity after reorder')
  after=page.evaluate('__kqa.compare().cards')
  check(kind+' rank changes retain human/BOT/YOU labels on original robot cards',[c['seat'] for c in after]==expected[:2]+['A · BOT 3 · OUT',expected[3]])
  page.evaluate('([members,key])=>__kqa.members(members,{[key]:[members[3]],mode:"2v2",status:"finished"})',[members,members_key])
  compact=page.evaluate('__kqa.compare().cards')
  check(kind+' finished room compaction preserves original controller identities',[c['seat'] for c in compact]==[c['seat'] for c in after])
  check(kind+' finished room compaction preserves full titles and accessible identities',all(a['seatTitle']==b['seatTitle'] and a['healthLabel']==b['healthLabel'] and a['robotId']==b['robotId'] for a,b in zip(compact,after)))
  page.evaluate('([members,key])=>__kqa.members(null,{[key]:members,mode:"2v2",status:"running"})',[members,members_key])
  check(kind+' clearing match identity cache restores live room identity lookup',[c['seat'] for c in page.evaluate('__kqa.compare().cards')]==[c['seat'] for c in after])
 page.screenshot(path=str(ROOT/'previews/construction-ranking-controllers.png'),full_page=False)
 # Public robot names and controller identities remain visible independently of concealed blueprints.
 page.evaluate('''()=>{const E=CSpireArena,s=E.createBattle(['OWN','PUBLIC-HUMAN','PUBLIC-BOT','OPEN SLOT'].map(name=>({...__kqa.cfg(),name})),987,'ffa');s.robots.slice(1).forEach(r=>{r.placeholder=true;});__kqa.set(s,'online',0,{members:[{n:'Owner'},{n:'Invited Person'},{n:'Bot seat',bot:true}],mode:'ffa'});}''')
 cards=page.evaluate('__kqa.compare().cards')
 check('Invited concealed human and bot show identity while truly empty seat stays OPEN',[c['seat'] for c in cards]==['YOU','Invited Person','BOT 3','OPEN'])
 check('Occupied concealed blueprints retain public robot names',[c['name'] for c in cards[1:3]]==['PUBLIC-HUMAN','PUBLIC-BOT'])
 page.evaluate('''()=>{const E=CSpireArena,s=E.createBattle(['ONE','TWO'].map(name=>({...__kqa.cfg(),name})),88);__kqa.set(s,'online',1,{members:[{n:'  '},{n:'Viewer'}],mode:'ffa'});}''')
 check('Missing human profile name uses PLAYER and own identity stays YOU',[c['seat'] for c in page.evaluate('__kqa.compare().cards')]==['PLAYER','YOU'])
 page.close()
 # Engine team order including eliminated member of the leading team and tied teams.
 page=setup(browser)
 for mode,count in [('2v2',4),('2v2v2v2',8)]:
  page.evaluate('''({mode,count})=>{const E=CSpireArena,s=E.createPracticeBattle(__kqa.cfg(),count,424242,mode);s.time=60;s.robots.forEach(r=>r.health=r.team===0?250:100);s.robots[count-2].alive=false;s.robots[count-2].health=0;s.robots[count-2].eliminatedAt=40;s.robots[count-2].reason='Robot destroyed';__kqa.set(s);}''',{'mode':mode,'count':count});page.wait_for_timeout(180)
  apron(page,mode,2 if mode=='2v2' else 4)
  compare(page,mode+' live grouped teams')
  check(mode+' teammates retain shared colors',page.evaluate('(()=>{const s=__kqa.state(),c=__kqa.compare().cards;return s.robots.every(r=>s.robots.filter(t=>t.team===r.team).every(t=>c.find(x=>x.id===t.id).color===c.find(x=>x.id===r.id).color))})()'))
  finish(page,mode,page.evaluate('__kqa.measure()'))
 page.close()
 # Changing the mode after results must replace the compact note, then restore it correctly.
 page=setup(browser);page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(180);page.evaluate('__kqa.pause();__kqa.finish()');page.wait_for_function('__kqa.gate()?.shown',timeout=5000)
 page.locator('#battle-mode').evaluate('(e)=>{e.value="2v2";e.dispatchEvent(new Event("change"));}')
 check('Mode change after final restores new team description instead of stale FFA text','2 teams of 2' in page.locator('#battle-mode-note').inner_text() and page.evaluate('__kqa.apron().nodes.every(n=>n.home)'))
 page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(180);page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(180)
 check('Stopping team battle restores full team description','2 teams of 2' in page.locator('#battle-mode-note').inner_text() and 'no weapon friendly fire' in page.locator('#battle-mode-note').inner_text())
 page.locator('#battle-mode').select_option('ffa')
 check('Mode change after stop restores full free-for-all description',page.locator('#battle-mode-note').inner_text()=='Every robot for itself. Choose 2–8 participants.')
 page.close()
 # Same seed means the same English title in another client and after state restoration.
 p1=setup(browser);p2=setup(browser)
 for p in [p1,p2]:p.evaluate("__kqa.set(CSpireArena.createPracticeBattle(__kqa.cfg(),4,424242,'ffa'))")
 check('Same seed gives same arena name on independent clients',p1.evaluate('__kqa.name()')==p2.evaluate('__kqa.name()'))
 p2.evaluate("__kqa.set(CSpireArena.createPracticeBattle(__kqa.cfg(),4,77,'ffa'))")
 check('A different seed selects another arena name',p1.evaluate('__kqa.name()')!=p2.evaluate('__kqa.name()'))
 p1.close();p2.close()
 # Phone fallback and result-size stability with all eight players.
 page=setup(browser,390,1300);page.locator('#bot-count').select_option('8');page.evaluate('scrollTo({top:0,behavior:"instant"});__kqa.clearScroll()');page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(650);page.evaluate('__kqa.pause()')
 check('Phone start also avoids automatic scrolling',page.evaluate('__kqa.scrolling().y===0&&__kqa.scrolling().calls.length===0'))
 mobile=page.evaluate('__kqa.measure()')
 check('Phone places live HUD below the canvas without horizontal overflow',mobile['rail']['y']>=mobile['canvas']['bottom'] and not mobile['overflow'])
 apron(page,'phone FFA')
 compare(page,'phone initial')
 mobile_controls=page.evaluate('__kqa.controls()')
 check('Phone controls remain above roster outside scrolling',mobile_controls['docked'] and not mobile_controls['inRail'] and mobile_controls['bar']['bottom']<=mobile_controls['rail']['y']+1)
 check('Phone actions fit the screen with usable targets',all(b['rect']['x']>=0 and b['rect']['right']<=390 and b['rect']['height']>=36 and b['rect']['width']>=32 for b in mobile_controls['buttons']))
 page.locator('#pause').click();check('Phone Pause button still resumes the match',page.evaluate('__kqa.runtime().paused===false'));page.locator('#pause').click()
 page.evaluate('__kqa.state().robots.slice(1).forEach(r=>r.health=250);__kqa.refresh()')
 finish(page,'phone',mobile)
 page.screenshot(path=str(ROOT/'previews/construction-ranking-mobile.png'),full_page=False)
 page.evaluate("__kqa.set(CSpireArena.createPracticeBattle(__kqa.cfg(),8,424242,'2v2v2v2'))");page.wait_for_timeout(180)
 apron(page,'phone four teams',4)
 page.screenshot(path=str(ROOT/'previews/construction-ranking-mobile-teams.png'),full_page=False);page.close()
 # Small-phone four-team information also fits the exterior apron.
 page=setup(browser,320,1100)
 page.evaluate("__kqa.set(CSpireArena.createPracticeBattle(__kqa.cfg(),8,424242,'2v2v2v2'))");page.wait_for_timeout(180)
 apron(page,'320px four teams',4)
 check('320px phone keeps field and sidebar without horizontal overflow',not page.evaluate('__kqa.measure().overflow'))
 page.close()
 # An ordinary laptop height also keeps the brand and legend in the viewport.
 page=setup(browser,1280,800)
 page.evaluate('scrollTo({top:0,behavior:"instant"});__kqa.clearScroll()')
 page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(700)
 fit=page.evaluate('__kqa.pageFit()')
 check('1280×800 keeps the whole topbar and legend visible',fit['topbar']['y']>=0 and fit['topbar']['bottom']<=800 and fit['legend']['y']>=0 and fit['legend']['bottom']<=800)
 apron(page,'1280×800 laptop')
 check('1280×800 start preserves page position',page.evaluate('__kqa.scrolling().y===0&&__kqa.scrolling().calls.length===0'))
 page.close()

 # Observe native animation frames, including interrupted changes of rank.
 page=setup(browser,1560,900,motion='no-preference')
 page.evaluate('scrollTo({top:0,behavior:"instant"});__kqa.clearScroll()')
 page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(700);page.evaluate('__kqa.pause()')
 check('Normal-motion battle start does not schedule a delayed scroll',page.evaluate('__kqa.scrolling().y===0&&__kqa.scrolling().calls.length===0'))
 original_config=page.evaluate('__kqa.cfg()')
 motion=page.evaluate('''async()=>{
   const before=__kqa.visual();
   __kqa.state().robots.forEach((r,i)=>r.health=[120,220,160,280][i]);__kqa.refresh();
   const immediate=__kqa.visual(),animations=__kqa.animations();
   await new Promise(r=>setTimeout(r,100));const middle=__kqa.visual();
   await new Promise(r=>setTimeout(r,240));
   return{before,immediate,middle,after:__kqa.visual(),animations,remaining:__kqa.animations()};
 }''')
 check('Changed ranks use bounded260ms native card animations',0<len(motion['animations'])<=4 and all(a['duration']==260 for a in motion['animations']))
 check('Rank changes begin at the current visual position',all(abs(a['y']-b['y'])<1 for a,b in zip(motion['before'],motion['immediate'])))
 moving=[i for i,(a,b) in enumerate(zip(motion['before'],motion['after'])) if abs(a['y']-b['y'])>5]
 check('Intermediate animation frames move smoothly between old and new ranks',bool(moving) and all(min(motion['before'][i]['y'],motion['after'][i]['y'])<motion['middle'][i]['y']<max(motion['before'][i]['y'],motion['after'][i]['y']) for i in moving))
 check('Completed rank animations remove their transforms',not motion['remaining'] and all(c['transform']=='none' for c in motion['after']))
 compare(page,'Animated final rank')
 rapid=page.evaluate('''async()=>{
   const samples=[];
   for(const hp of [[280,120,260,150],[200,300,100,250],[100,160,290,220]]){
     const before=__kqa.visual();__kqa.state().robots.forEach((r,i)=>r.health=hp[i]);__kqa.refresh();
     samples.push({before,after:__kqa.visual(),animations:__kqa.animations()});
     await new Promise(r=>setTimeout(r,40));
   }
   await new Promise(r=>setTimeout(r,300));return{samples,end:__kqa.visual(),remaining:__kqa.animations()};
 }''')
 check('Rapid rank changes continue from current positions without snapping',all(all(abs(a['y']-b['y'])<1 for a,b in zip(s['before'],s['after'])) for s in rapid['samples']))
 check('Rapid rank changes replace animations instead of accumulating them',all(len(s['animations'])<=4 for s in rapid['samples']) and not rapid['remaining'])
 compare(page,'Rapid reorder settled')
 page.evaluate('__kqa.state().robots.forEach((r,i)=>r.health=300-i*20);__kqa.refresh()')
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80)
 check('Changing to reduced motion cancels in-flight rank animation',page.evaluate('__kqa.animations().length===0&&__kqa.visual().every(c=>c.transform==="none")'))
 page.evaluate('__kqa.state().robots.forEach((r,i)=>r.health=200+i*20);__kqa.refresh()')
 check('Reduced motion applies later ranks with no animation',page.evaluate('__kqa.animations().length===0'))
 compare(page,'Reduced-motion reordered')
 page.emulate_media(reduced_motion='no-preference')
 page.evaluate('__kqa.state().robots.forEach((r,i)=>r.health=300-i*20);__kqa.refresh()')
 page.locator('#start').evaluate('(e)=>e.click()');page.wait_for_timeout(80)
 check('Stopping cancels rank animations and restores untransformed top cards',page.evaluate('!__kqa.measure().bodyBattle&&__kqa.animations().length===0&&__kqa.visual().every(c=>c.transform==="none")'))
 check('Rank animations never alter saved programming',page.evaluate('__kqa.cfg()')==original_config)
 details.append({'animation':motion,'rapidReorder':rapid})
 page.close()

 # The editor displays the effective reduced per-use energy, including decimals.
 page=setup(browser)
 page.locator('#loadout').select_option('dual')
 page.locator('#builder').scroll_into_view_if_needed();tier_images=[];tier_probes=[];tier_pngs=[]
 for power,expected in [('1','17.1'),('2','21.38'),('3','25.65')]:
  page.locator('#tool-slots [data-tool-index="0"]').click()
  page.locator('#tool-power').select_option(power)
  actual=page.locator('#tool-specs span').filter(has_text='ENERGY').locator('b').inner_text()
  check('Ram power'+power+' displays the newly reduced energy',actual==expected)
  # Keep the same Saw selected: the selected Ram's dashed acquisition guide
  # legitimately follows nominal range, independently of its fixed silhouette.
  page.locator('#tool-slots [data-tool-index="1"]').click()
  tier_images.append(page.evaluate('__kqa.builderImage()'));tier_probes.append(page.evaluate('__kqa.toolProbe(0,26,0)'))
  tier_pngs.append(page.locator('#builder').screenshot(path=str(ROOT/('previews/construction-ranking-ram-'+power+'.png'))))
 check('Changing Light Standard Heavy preserves every robot pixel and builder zoom with a fixed selection guide',tier_images[0]==tier_images[1]==tier_images[2])
 check('Real builder screenshots are byte-identical across the three power levels',tier_pngs[0]==tier_pngs[1]==tier_pngs[2])
 check('Changing power keeps the visible Ram tip at the same selectable position',all(p['x']==tier_probes[0]['x'] and p['y']==tier_probes[0]['y'] and p['hit']==0 and p['scale']==1 and p['inside'] for p in tier_probes))
 for type in ['ram','flipper','plow','hammer','saw','drill','flamethrower','machinegun','rocket']:
  for active in [False,True]:
   for preview in [False,True]:
    for angle in [0,37]:
     samples=[page.evaluate('([type,power,active,preview,angle])=>__kqa.toolImage(type,power,active,preview,angle)',[type,power,active,preview,angle]) for power in [1,2,3]]
     check(type+' fixed pixels at all powers active='+str(active)+' preview='+str(preview)+' angle='+str(angle),samples[0]==samples[1]==samples[2] and samples[0]['count']>20)
 page.locator('#tool-slots [data-tool-index="1"]').click();page.locator('#builder').scroll_into_view_if_needed()
 probe=page.evaluate('__kqa.toolProbe(0,26,0)')
 check('Heavy melee geometry retains the light silhouette size',probe['power']==3 and probe['scale']==1 and probe['inside'])
 check('Heavy Ram tip remains selectable at its unchanged position',probe['hit']==0 and probe['selected']==1)
 page.mouse.click(probe['x'],probe['y'])
 check('Pointer at Heavy Ram tip selects its original tool',page.locator('#tool-slots [data-tool-index="0"]').get_attribute('aria-pressed')=='true')
 page.close()
 browser.close()
check('No JavaScript errors',not errors)
report={'ok':True,'count':len(checks),'checks':checks,'details':details,'errors':errors,'source':str(SOURCE)}
(OUT/'local-result.json').write_text(json.dumps(report,indent=2));print(json.dumps({'ok':True,'count':len(checks),'errors':errors}),flush=True)
