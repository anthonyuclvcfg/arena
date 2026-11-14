"""Team/chassis/eight-seat/fixed-camera Chromium checks. Hooks are test-only."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
checks=[];errors=[]
def check(label,ok):
    checks.append({'check':label,'passed':bool(ok)})
    if not ok: raise AssertionError(label)
html=(R/'cspire-arena.html').read_text()
needle='  initRoster();renderCatalog();newPreview();save();'
assert html.count(needle)==1
hook='''
 window.__qa={
  state:()=>state, cfg:()=>JSON.parse(JSON.stringify(config)),view:()=>arenaView(state),
  reset:()=>{room=null;mode='idle';paused=true;finishing=false;clearResults();newPreview();applyLock();},
  show:(s,end=false,slot=0)=>{room=null;mode='online';state=s;onlineSlot=slot;paused=true;countdown=0;finishing=false;trails=Array.from({length:E.MAX_BOTS},()=>[]);lastEventId=-1;clearResults();$('arena-banner').classList.add('hidden');applyLock();updateUI();drawArena(state,0);if(end)finish();},
  advance:(n)=>{for(let i=0;i<n;i++)E.step(state);updateUI();drawArena(state,0);},
  focus:()=>setPanels({builder:true,logic:true}),
  refresh:()=>{updateUI();drawArena(state,0);},
  connect:(info,id)=>{pilotId=id;connectRoom(info);},
  restore:()=>setPanels({builder:false,logic:false})
 };
 const oldFill=CanvasRenderingContext2D.prototype.fillRect;
 CanvasRenderingContext2D.prototype.fillRect=function(...args){
  if(this.canvas.id==='arena'&&args[0]===84&&args[1]===84&&args[2]===632){const t=this.getTransform();window.__groundMatrix=[t.a,t.b,t.c,t.d,t.e,t.f];}
  return oldFill.apply(this,args);
 };
'''
html=html.replace(needle,hook+needle)
with sync_playwright() as pw:
    opts = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):
        opts['executable_path'] = os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').is_file():
        opts['executable_path'] = '/usr/bin/chromium'
    # Otherwise use Playwright's managed browser (portable to macOS/Windows).
    browser = pw.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1560,'height':1100})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html);page.wait_for_timeout(180)
    check('Standalone starts in English as CSPIRE//ARENA 0.5.6',page.title().startswith('CSPIRE//ARENA') and page.evaluate('CSpireArena.VERSION')=='0.5.6')
    baseline=page.evaluate('__qa.cfg()')
    labels={'diamond':'Manta','octagon':'Bastion','capsule':'Twin Hull','cross':'Cross'}
    for key,label in labels.items():
        page.locator('[data-body="'+key+'"]').click()
        check(label+' is selectable under its compatible chassis ID',page.evaluate('__qa.cfg().body')==key)
        check(label+' has its new label and outline icon',label in page.locator('[data-body="'+key+'"]').inner_text() and page.locator('[data-body="'+key+'"] svg').count()==1)
        if key!='cross':
            check(label+' icon uses the complete complex contour',page.locator('[data-body="'+key+'"] path').get_attribute('d').count('L')>=15)
    check('Cross icon is unchanged',page.locator('[data-body="cross"] path').get_attribute('d')=='M11 2h10v9h9v10h-9v9H11v-9H2V11h9Z')
    check('Exactly eight chassis options, no redundant old shape names',page.locator('[data-body]').count()==8 and not any(x in page.locator('#body-options').inner_text() for x in ['Diamond','Octagon','Capsule']))
    page.locator('[data-body="wedge"]').click();baseline=page.evaluate('__qa.cfg()')
    modes={'2v2':(4,2),'3v3':(6,2),'4v4':(8,2),'2v2v2':(6,3),'2v2v2v2':(8,4)}
    for mode,(count,teams) in modes.items():
        page.locator('#battle-mode').select_option(mode);page.wait_for_timeout(160)
        check(mode+' locks a balanced participant count',page.locator('#bot-count').is_disabled() and int(page.locator('#bot-count').input_value())==count)
        check(mode+' creates the correct teams and live HP chips',page.evaluate('({n,t})=>__qa.state().robots.length===n&&__qa.state().teamCount===t',{'n':count,'t':teams}) and page.locator('.team-chip').count()==teams)
        check(mode+' keeps the human design exactly and randomizes only AI',page.evaluate('__qa.cfg()')==baseline and page.evaluate('__qa.state().robots.filter(r=>r.controller==="player").length')==1)
        check(mode+' shares colors between teammates',page.evaluate("(()=>{const s=__qa.state();return s.robots.every(r=>s.robots.filter(a=>a.team===r.team).every(a=>getComputedStyle(document.getElementById('health-'+String.fromCharCode(97+a.id))).color===getComputedStyle(document.getElementById('health-'+String.fromCharCode(97+r.id))).color))})()"))
        check(mode+' shows team names and numbers in HUD role labels',page.evaluate("__qa.state().robots.every(r=>document.getElementById('seat-'+String.fromCharCode(97+r.id)).textContent.startsWith(String.fromCharCode(65+r.team)+' · '))"))
    page.locator('#battle-mode').select_option('ffa');page.locator('#bot-count').select_option('8');page.wait_for_timeout(150)
    check('Eight free-for-all robots are supported with seven AI opponents',page.evaluate('__qa.state().robots.length===8&&__qa.state().robots.filter(r=>r.controller==="bot").length===7'))
    check('Eight distinct identity colors appear in free-for-all',page.evaluate("new Set('abcdefgh'.split('').map(t=>getComputedStyle(document.getElementById('health-'+t)).color)).size===8"))
    check('Seven and eight robots keep four traps, while 250 HP and 200 points stay unchanged',page.evaluate('__qa.state().hazards.length===4&&__qa.state().robots.every(r=>r.stats.hp===250&&r.stats.cost<=200)'))
    check('All HUD IDs remain unique',page.evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.length===new Set(ids).size})()"))
    page.locator('#battle-mode').select_option('4v4')
    page.locator('#start').click();page.wait_for_timeout(750)
    check('Starting 4v4 auto-collapses side panels and retains mode',page.locator('.side-dock.collapsed').count()==2 and page.evaluate('__qa.state().mode')=='4v4')
    check('Mode changes are locked while a battle runs',page.locator('#battle-mode').is_disabled() and page.locator('#bot-count').is_disabled())
    page.wait_for_timeout(1900)
    check('A natural 4v4 match advances with eight robots',page.evaluate('__qa.state().time>0&&__qa.state().robots.length===8'))
    page.locator('#start').click();page.wait_for_timeout(650)
    check('Stopping a team battle preserves the human design',page.evaluate('__qa.cfg()')==baseline)
    # The 800-unit view and its actual Canvas transform cannot vary during any exit.
    for side in ['right','left','top','bottom','aerial']:
        page.evaluate('''side=>{
          const E=CSpireArena,p={tools:[],rules:[{when:'always',do:'brake'}]};
          const s=E.createBattle(Array(4).fill(p),67);s.hazards=[];s.pickups=[];
          s.walls.forEach(w=>{w.broken=true;w.health=0});
          __qa.show(s);window.__before=s;window.__exitSide=side;
        }''',side)
        before=page.evaluate('({view:__qa.view(),matrix:__groundMatrix})')
        page.evaluate('''side=>{const r=__qa.state().robots[1];r.x=400;r.y=400;
         if(side==='right'||side==='aerial')r.x=716.1;if(side==='left')r.x=83.9;if(side==='top')r.y=83.9;if(side==='bottom')r.y=716.1;
         if(side==='aerial')r.z=60;__qa.advance(1);
        }''',side)
        check(side+' exit commits elimination without zoom or pan',page.evaluate('__qa.state().robots[1].alive===false') and page.evaluate('({view:__qa.view(),matrix:__groundMatrix})')==before)
        page.evaluate('__qa.advance(45)')
        check(side+' completed exit has the exact original Canvas transform',page.evaluate('__qa.state().robots[1].exit.done') and page.evaluate('({view:__qa.view(),matrix:__groundMatrix})')==before)
        check(side+' ring-out does not stop the remaining battle',page.evaluate('__qa.state().status==="running"&&__qa.state().robots.filter(r=>r.alive).length===3'))
    page.evaluate("__qa.state().robots[1].x=100000;__qa.state().robots[1].y=-100000;__qa.refresh()")
    check('Even far-out objects cannot expand the camera',page.evaluate('__qa.view()')=={'min':0,'size':800} and page.evaluate('__groundMatrix')==before['matrix'])
    page.evaluate('__qa.focus()');page.wait_for_timeout(700)
    for width,height in [(320,800),(390,844),(740,1000),(1100,980),(1560,1100)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate("__qa.show(CSpireArena.createPracticeBattle(__qa.cfg(),8,42,'4v4'))")
        page.wait_for_timeout(350)
        check(str(width)+'px eight-seat view has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(str(width)+'px eight cards do not overlap',page.evaluate("(()=>{const a='abcdefgh'.split('').map(t=>document.getElementById('fighter-'+t).getBoundingClientRect());return a.every((r,i)=>a.every((q,j)=>i===j||r.right<=q.left+.1||q.right<=r.left+.1||r.bottom<=q.top+.1||q.bottom<=r.top+.1))})()"))
        check(str(width)+'px health remains more prominent than energy',page.evaluate("'abcdefgh'.split('').every(t=>parseFloat(getComputedStyle(document.getElementById('energy-'+t)).fontSize)<.5*parseFloat(getComputedStyle(document.getElementById('health-'+t)).fontSize))"))
        check(str(width)+'px arena stays square and camera remains fixed',page.evaluate('Math.abs(arena.getBoundingClientRect().width-arena.getBoundingClientRect().height)<1&&__qa.view().size===800'))
    # Controlled complete team result including one eliminated member of the winners.
    page.evaluate('''()=>{const E=CSpireArena,s=E.createPracticeBattle(__qa.cfg(),8,600,'4v4');s.time=120;
      s.robots.forEach((r,i)=>r.health=i%2?40:190);s.robots[2].alive=false;s.robots[2].reason='Out of the arena';s.robots[2].eliminatedAt=110;
      E.finishIfNeeded(s);__qa.show(s,true);}''')
    page.wait_for_timeout(350)
    check('Team winner name is over the field',page.locator('#arena-banner strong').inner_text()=='Team A wins.')
    check('All eight robots and both aggregate team rows are in the standings',page.locator('#results-rows tr').count()==8 and page.locator('.team-result').count()==2)
    check('Eliminated winner teammates also share their team victory',page.locator('#results-rows tr.winner-row').count()==4 and 'WINNER' in page.locator('#results-rows tr[data-robot-id="2"]').inner_text())
    check('Team ranking excludes eliminated HP',page.locator('.team-result').first.locator('strong').inner_text()=='570 HP')
    check('Desktop final scoreboard is to the right, with no dialog or dimming',page.evaluate("document.getElementById('results-panel').getBoundingClientRect().left>=arena.getBoundingClientRect().right-1&&document.querySelectorAll('dialog[open]').length===0"))
    page.locator('#arena-panel').scroll_into_view_if_needed();page.wait_for_timeout(120)
    page.screenshot(path=str(R/'previews/teams-results.png'))
    for width in [320,390,740]:
        page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(350)
        check(str(width)+'px standings move below without horizontal overflow',page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.getElementById('results-panel').getBoundingClientRect().top>=arena.getBoundingClientRect().bottom-1"))
    page.set_viewport_size({'width':390,'height':1000});page.evaluate('''()=>{const s=CSpireArena.createPracticeBattle(__qa.cfg(),8,600,'4v4');for(let i=0;i<280;i++)CSpireArena.step(s);__qa.show(s);}''');page.wait_for_timeout(350)
    page.evaluate("window.scrollTo(0,document.getElementById('arena-panel').offsetTop-10)");page.screenshot(path=str(R/'previews/eight-mobile.png'))
    # Exercise real room handlers using deterministic SSE fixtures. Server tests use real HTTP/SSE.
    page.set_viewport_size({'width':1560,'height':1100});page.evaluate('__qa.reset()')
    page.evaluate('''()=>{window.EventSource=class{constructor(){window.__source=this;}close(){}};
      const E=CSpireArena;window.__info={code:'ABC234',host:'p0',mode:'4v4',capacity:8,status:'waiting',seed:11,
       players:Array.from({length:7},(_,i)=>({id:'p'+i,alias:'Pilot '+i,team:i%2,robot:E.normalizeConfig({name:'PLAYER-'+i,tools:[]})}))};
      __qa.connect(__info,'p0');document.getElementById('online-dialog').showModal();}''')
    check('Online 4v4 lobby shows seven real players, one open seat, and no AI substitutions',page.locator('.room-player').count()==7 and page.evaluate('__qa.state().robots.length===8&&__qa.state().robots[7].placeholder&&__qa.state().robots.every(r=>r.controller==="player")'))
    check('Team lobby cannot start incomplete and host can change mode',page.locator('#launch-online').is_hidden() and not page.locator('#room-mode').is_disabled())
    page.evaluate('''()=>{const E=CSpireArena;__info.players.push({id:'p7',alias:'Pilot 7',team:1,robot:E.normalizeConfig({name:'PLAYER-7',tools:[]})});__info.status='ready';__source.onmessage({data:JSON.stringify({type:'room',room:__info})});}''')
    check('Eighth player unlocks the host start button and balanced lobby teams',not page.locator('#launch-online').is_hidden() and page.locator('.room-player').count()==8 and page.locator('.room-player b').all_inner_texts()==['Team A','Team B']*4)
    page.evaluate("__qa.connect(__info,'p7')")
    check('Non-host team player cannot change mode or start',page.locator('#room-mode').is_disabled() and page.locator('#launch-online').is_hidden())
    page.evaluate('''()=>{const E=CSpireArena;__info.status='running';window.__net=E.createBattle(__info.players.map(p=>p.robot),55,'4v4');__source.onmessage({data:JSON.stringify({type:'state',state:__net,room:__info})});}''')
    page.wait_for_timeout(650)
    check('Eight-player online snapshot uses team labels and locks the editor',page.evaluate('__qa.state().robots.length===8') and page.locator('#seat-h').inner_text()=='B · YOU' and page.locator('#motor').is_disabled())
    page.evaluate("__net.time=120;__net.robots.forEach((r,i)=>r.health=i%2?210:50);CSpireArena.finishIfNeeded(__net);__info.status='finished';__source.onmessage({data:JSON.stringify({type:'state',state:__net,room:__info})})")
    check('Guest receives team victory rather than defeat because the representative is another teammate',page.locator('#arena-banner span').inner_text()=='VICTORY' and page.locator('#arena-banner strong').inner_text()=='Team B wins.')
    check('Online standings also contain all eight human designs',page.locator('#results-rows tr').count()==8 and all('PLAYER-'+str(i) in page.locator('#results-rows').inner_text() for i in range(8)))
    check('No JavaScript errors in the new browser tests',not errors)
    browser.close()
report={'passed':sum(c['passed'] for c in checks),'total':len(checks),'checks':checks,'errors':errors}
(R/'browser-teams-camera-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['passed','total','errors']}))
