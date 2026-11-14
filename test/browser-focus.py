"""Optional layout/focus regression checks (Playwright + Chromium, not game dependencies).
Observation hooks exist only in this in-memory test page, never in the deliverable.
"""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
checks, errors = [], []
def check(name, value):
    checks.append({'check': name, 'passed': bool(value)})
    if not value: raise AssertionError(name)
html = (ROOT / 'cspire-arena.html').read_text()
hook = """
  window.__focusQA={
    robot:()=>JSON.stringify(config), state:()=>state, panels:()=>({...closedPanels}),
    connect:(info,id)=>{pilotId=id;connectRoom(info);},
    finishFixture:()=>{
      mode='local';room=null;paused=true;countdown=0;finishing=false;history=[];
      const passive={tools:[],rules:[{when:'always',do:'brake'}]};
      state=E.createBattle(['VECTOR-01','EMBER-04','MANTIS-02','ORBIT-07'].map(name=>({...passive,name})),54);
      state.hazards=[];state.pickups=[];state.time=E.MAX_SECONDS;
      [210,192,118,76].forEach((hp,i)=>state.robots[i].health=hp);
      E.finishIfNeeded(state);enterBattleView();finish();
    }
  };
"""
html = html.replace('  initRoster();renderCatalog();newPreview();save();', hook + '  initRoster();renderCatalog();newPreview();save();', 1)
with sync_playwright() as p:
    opts = {'headless': True, 'args': ['--no-sandbox']}
    if os.environ.get('CHROMIUM_PATH'): opts['executable_path'] = os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists(): opts['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**opts)
    page = browser.new_page(viewport={'width':1500,'height':1000})
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html); page.wait_for_timeout(200)
    baseline = page.evaluate('__focusQA.robot()')
    width = page.locator('#arena-panel').bounding_box()['width']
    square = page.locator('#arena').bounding_box()['width']
    check('New brand and two-minute timer are visible', page.title().startswith('CSPIRE//ARENA') and page.locator('#clock').inner_text() == '02:00')
    check('Both side panels start expanded', page.locator('.side-dock.collapsed').count() == 0)
    page.locator('#collapse-builder').click(); page.wait_for_timeout(130)
    check('Left dock visibly translates left while its width shrinks', page.evaluate("(()=>{const d=document.getElementById('builder-dock'),x=d.firstElementChild;return d.getBoundingClientRect().width>0&&d.getBoundingClientRect().width<328&&new DOMMatrix(getComputedStyle(x).transform).m41<0})()"))
    page.wait_for_timeout(500)
    check('Manual left collapse frees width and leaves right open', page.locator('#arena-panel').bounding_box()['width']>width and not page.locator('#logic-dock').evaluate("el=>el.classList.contains('collapsed')"))
    check('Collapsed builder is zero-height and inaccessible to keyboard', page.evaluate("document.getElementById('builder-dock').getBoundingClientRect().height<1&&document.querySelector('#builder-dock>.side-content').inert"))
    check('Focus transfers to a visible restore button', page.evaluate("document.activeElement.id==='restore-builder'&&document.getElementById('collapse-builder').getAttribute('aria-expanded')==='false'"))
    page.locator('#restore-builder').press('Enter'); page.wait_for_timeout(650)
    check('Keyboard restore reopens the original robot unchanged', page.evaluate('__focusQA.robot()')==baseline and page.locator('#workshop').is_visible())
    page.locator('#collapse-logic').click(); page.wait_for_timeout(130)
    check('Right dock visibly translates right', page.evaluate("new DOMMatrix(getComputedStyle(document.querySelector('#logic-dock>.side-content')).transform).m41>0"))
    page.wait_for_timeout(500)
    check('Right collapse does not hide the builder', page.locator('#workshop').is_visible() and page.locator('#logic-dock').bounding_box()['width']<1)
    page.locator('#restore-logic').click(); page.wait_for_timeout(650)
    page.locator('#arena-size-toggle').click(); page.wait_for_timeout(1150)
    check('Manual maximize collapses both sides and uses the released width', page.evaluate("document.body.classList.contains('arena-focused')&&document.querySelectorAll('.side-dock.collapsed').length===2") and page.locator('#arena-panel').bounding_box()['width']>width+500)
    check('Maximized battlefield is actually larger and remains square', page.locator('#arena').bounding_box()['width']>square and page.evaluate("Math.abs(arena.getBoundingClientRect().width-arena.getBoundingClientRect().height)<1"))
    check('Maximized battlefield fits below the sticky HUD', page.evaluate("arena.getBoundingClientRect().top>=document.querySelector('.match-hud').getBoundingClientRect().bottom&&arena.getBoundingClientRect().bottom<=innerHeight+2"))
    check('Maximized view adds no modal or dimming layer', page.evaluate("document.querySelectorAll('dialog[open]').length===0"))
    page.locator('#arena-size-toggle').click(); page.wait_for_timeout(650)
    check('One click restores both panels', page.locator('.side-dock.collapsed').count()==0)
    page.locator('#collapse-builder').click(); page.wait_for_timeout(650)
    page.locator('#start').click(); page.wait_for_timeout(150)
    check('Battle expands the arena during the countdown, before physics starts', page.evaluate("__focusQA.state().time===0&&__focusQA.panels().builder&&__focusQA.panels().logic"))
    page.wait_for_timeout(2500)
    check('Countdown does not reset or extend the two-minute simulation', page.evaluate('__focusQA.state().time>0&&__focusQA.state().time<2'))
    page.locator('#restore-logic').click(); page.wait_for_timeout(650)
    check('Panels can reopen during battle but editing remains locked', page.locator('#brain').is_visible() and page.locator('#preset').is_disabled() and page.locator('#collapse-logic').is_enabled())
    page.locator('#collapse-logic').click(); page.wait_for_timeout(650)
    check('Viewing controls do not mutate the human design', page.evaluate('__focusQA.robot()')==baseline)
    page.locator('#start').click(); page.wait_for_timeout(650)
    check('Stopping restores the pre-battle manual panel preference', page.evaluate('__focusQA.panels().builder&&!__focusQA.panels().logic'))
    page.locator('#restore-builder').click(); page.wait_for_timeout(650)
    page.evaluate('__focusQA.finishFixture()'); page.wait_for_timeout(1150)
    check('Finish keeps the arena expanded instead of reopening panels', page.evaluate("document.body.classList.contains('arena-focused')"))
    check('Final standings sit to the right while the winner is visible over the board', page.evaluate("!document.getElementById('results-panel').hidden&&document.getElementById('results-panel').getBoundingClientRect().left>=arena.getBoundingClientRect().right&&!document.getElementById('arena-banner').classList.contains('hidden')&&document.querySelector('#arena-banner strong').textContent.includes('VECTOR-01')"))
    check('Every robot remains in the final standings', page.locator('#results-rows tr').count()==4)
    page.locator('[data-scroll="workshop"]').click(); page.wait_for_timeout(1200)
    check('Build navigation restores a hidden panel', page.locator('#workshop').is_visible() and page.evaluate('__focusQA.panels().logic'))
    # Changing viewport never produces overflow or leaves a collapsed panel occupying height.
    for width,height in [(320,720),(390,844),(740,1000),(900,900),(1190,900),(1280,720),(1920,1080)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
        if not page.evaluate("document.body.classList.contains('arena-focused')"):
            page.locator('#arena-size-toggle').click()
        page.wait_for_timeout(750)
        check(f'{width}px focus view has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check(f'{width}px focused docks occupy zero vertical space',page.evaluate("['builder-dock','logic-dock'].every(id=>document.getElementById(id).getBoundingClientRect().height<1)"))
        check(f'{width}px battlefield retains a square aspect ratio',page.evaluate('Math.abs(arena.getBoundingClientRect().width-arena.getBoundingClientRect().height)<1'))
        page.locator('#restore-builder').click();page.wait_for_timeout(650)
        check(f'{width}px builder can be restored manually',page.locator('#workshop').is_visible() and page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        page.locator('#collapse-builder').click();page.wait_for_timeout(650)
    page.emulate_media(reduced_motion='reduce')
    page.locator('#arena-size-toggle').click();page.wait_for_timeout(60)
    page.locator('#collapse-builder').click();page.wait_for_timeout(60)
    check('Reduced motion disables the panel animation',page.evaluate("getComputedStyle(document.getElementById('builder-dock')).transitionDuration==='0s'&&document.getElementById('builder-dock').getBoundingClientRect().height<1"))
    page.close()
    # Exercise the actual online handlers with synthetic SSE payloads. Browser
    # navigation is blocked by the host sandbox; Node tests cover real HTTP/SSE.
    clients=[]
    for identity in ['host','guest']:
        pg=browser.new_page(viewport={'width':1440,'height':1000});clients.append(pg)
        pg.on('pageerror',lambda e:errors.append(str(e)));pg.set_content(html)
        pg.evaluate("""id=>{
          window.EventSource=class {constructor(url){this.url=url;window.__source=this;}close(){}};
          const robot=name=>LineArena.normalizeConfig({name,tools:[],rules:[{when:'always',do:'brake'}]});
          window.__room={code:'ABCD23',seed:54,status:'ready',host:'host',players:[{id:'host',alias:'Host',robot:robot('HUMAN-A')},{id:'guest',alias:'Guest',robot:robot('HUMAN-B')}]};
          __focusQA.connect(__room,id);
          window.__onlineState=LineArena.createBattle(__room.players.map(p=>p.robot),54);__onlineState.hazards=[];__onlineState.pickups=[];
          __room.status='running';__source.onmessage({data:JSON.stringify({type:'state',state:__onlineState,room:__room})});
        }""",identity)
        pg.wait_for_timeout(700)
    pa,pb=clients
    check('Online start snapshots auto-expand both independent client views',all(pg.locator('.side-dock.collapsed').count()==2 for pg in clients))
    pb.locator('#restore-logic').click();pb.wait_for_timeout(650)
    for pg in clients:
        pg.evaluate("for(let i=0;i<10;i++){LineArena.step(__onlineState);__source.onmessage({data:JSON.stringify({type:'state',state:__onlineState,room:__room})});}")
    check('Subsequent online snapshots respect a manually reopened panel',pb.locator('#brain').is_visible() and pb.locator('#preset').is_disabled())
    check('Human online opponents are not labelled random AI',pa.locator('#seat-b').inner_text()=='P2' and pb.locator('#seat-a').inner_text()=='P1')
    for pg in clients:
        pg.evaluate("__onlineState.time=120;__onlineState.robots[1].health=100;LineArena.finishIfNeeded(__onlineState);__room.status='finished';__source.onmessage({data:JSON.stringify({type:'state',state:__onlineState,room:__room})});")
    check('Online results keep the field visible and preserve manual panel choices',pa.locator('#results-panel').is_visible() and pa.evaluate("document.body.classList.contains('arena-focused')") and pb.locator('#brain').is_visible())
    for pg in clients:pg.close()
    check('No browser JavaScript errors',not errors)
    browser.close()
report={'passed':sum(x['passed'] for x in checks),'total':len(checks),'checks':checks,'errors':errors}
(ROOT/'browser-focus-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['passed','total','errors']}))
