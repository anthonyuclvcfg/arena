"""Focused local rematch/layout QA. Instrumentation exists only in memory."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('ARENA_HTML',str(ROOT/'cspire-arena.html')))
OUT=ROOT/'artifacts/rematch-browser';OUT.mkdir(parents=True,exist_ok=True)
marker='  initRoster();renderCatalog();newPreview();save();'
hook=r'''
  window.__rq={
    state:()=>state,
    program:()=>({config:JSON.parse(JSON.stringify(config)),human:JSON.parse(JSON.stringify(state.robots[0].config)),preset:$('preset').value,saved:JSON.parse(localStorage.getItem(KEY)),rules:[...document.querySelectorAll('#rules .rule')].map(c=>({when:c.querySelector('[id$="-when"]').value,do:c.querySelector('[id$="-do"]').value,disabled:c.querySelector('[id$="-do"]').disabled}))}),
    measure:()=>{const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y+scrollY,width:b.width,height:b.height,right:b.right,bottom:b.bottom+scrollY};};return{canvas:rect(arena),wrap:rect(document.querySelector('.arena-wrap')),stage:rect($('arena-stage')),panel:rect($('arena-panel')),heading:rect(document.querySelector('.arena-heading')),controls:rect(document.querySelector('.battle-controls')),result:rect($('results-panel')),world:arenaView(),side:$('arena-stage').classList.contains('results-side'),hidden:$('results-panel').hidden,overflow:document.documentElement.scrollWidth>innerWidth,gate:finishPresentation&&{...finishPresentation,elapsed:performance.now()-finishPresentation.at}};},
    finish:()=>{paused=true;countdown=0;state.projectiles=[];state.flames=[];state.time=120;state.robots.slice(1).forEach(r=>r.health=100);E.finishIfNeeded(state);if(state.status!=='finished')throw Error('Fixture did not finish');finish();},
    stop:()=>{room=null;mode='idle';paused=false;countdown=0;newPreview();applyLock();leaveBattleView();},
  };
'''
source=SOURCE.read_text();assert source.count(marker)==1
html=source.replace(marker,hook+marker,1)
checks=[];errors=[];details=[];failures=[]
def check(name,condition):
    if not condition:failures.append(name);print('FAIL '+name,flush=True)
    else:checks.append(name)
def setup(browser,w,h):
    page=browser.new_page(viewport={'width':w,'height':h},reduced_motion='reduce')
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('http://arena.test/**',lambda route:route.fulfill(body=html,content_type='text/html'))
    page.goto('http://arena.test/');page.wait_for_function('typeof __rq==="object"')
    return page
def stable(a,b,label):
    for field in ['x','y','width','height']:
        check(label+' unchanged canvas '+field,abs(a['canvas'][field]-b['canvas'][field])<.6)
    check(label+' unchanged 800-unit world',a['world']==b['world'])
    for name in ['heading','controls']:
        check(label+' unchanged '+name+' height',abs(a[name]['height']-b[name]['height'])<.6)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for w,h,label in [(2160,1045,'wide-desktop'),(1560,1100,'desktop'),(900,1050,'tablet'),(390,844,'mobile')]:
        page=setup(browser,w,h)
        page.locator('#start').click();page.wait_for_timeout(700)
        before=page.evaluate('__rq.measure()')
        page.evaluate('__rq.finish()');page.wait_for_timeout(200)
        during=page.evaluate('__rq.measure()');stable(before,during,label+' during final animation')
        check(label+' result gate still three seconds',during['hidden'] and during['gate']['elapsed']<3000)
        page.wait_for_function('!document.getElementById("results-panel").hidden',timeout=5000);page.wait_for_timeout(150)
        shown=page.evaluate('__rq.measure()');stable(before,shown,label+' visible standings')
        available=shown['stage']['right']-shown['canvas']['right']
        check(label+' results use existing gutter or next row',shown['side']==(available>=292))
        check(label+' standings do not cover canvas',shown['result']['x']>=shown['canvas']['right']+11 if shown['side'] else shown['result']['y']>=shown['wrap']['bottom']-.5)
        check(label+' no horizontal overflow',not shown['overflow'])
        for n in range(2):
            page.locator('[data-results-close]').first.evaluate('(e)=>e.click()');page.wait_for_timeout(80)
            stable(before,page.evaluate('__rq.measure()'),label+' hide '+str(n))
            page.locator('#results-open').evaluate('(e)=>e.click()');page.wait_for_timeout(80)
            stable(before,page.evaluate('__rq.measure()'),label+' reopen '+str(n))
        page.evaluate('scrollTo({top:Math.max(0,document.getElementById("results-panel").getBoundingClientRect().top+scrollY-document.querySelector(".match-hud").getBoundingClientRect().height-20),behavior:"instant"})')
        check(label+' visible standings painted above field',page.evaluate('(()=>{const e=document.getElementById("results-title"),b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})()'))
        page.screenshot(path=str(OUT/(label+'-standings.png')),full_page=True)
        details.append({'viewport':label,'before':before,'shown':shown});page.close()
    page=setup(browser,1560,1100)
    for name in ([] if os.environ.get('LAYOUT_ONLY') else ['balanced','aggressive','careful','scavenger','custom','void']):
        if name in ['custom','void']:
            page.locator('#preset').select_option('aggressive')
            page.locator('#rule-0-do').select_option('charge')
            page.locator('#rule-0-when').select_option('void' if name=='void' else 'edge')
        else:page.locator('#preset').select_option(name)
        initial=page.evaluate('__rq.program()')
        page.locator('#start').click();page.wait_for_timeout(650)
        page.evaluate('__rq.finish()');page.wait_for_function('!document.getElementById("results-panel").hidden',timeout=5000)
        finished=page.evaluate('__rq.program()')
        check(name+' kept config and saved program at result',finished['config']==initial['config'] and finished['saved']==initial['saved'])
        page.locator('#results-next').evaluate('(e)=>e.click()');page.wait_for_timeout(100)
        after=page.evaluate('__rq.program()')
        check(name+' Another battle keeps exact human config and saved config',after['config']==initial['config']==after['human']==after['saved'])
        check(name+' Another battle keeps preset label',after['preset']==initial['preset'])
        check(name+' Another battle keeps IF/DO editor',[(r['when'],r['do']) for r in after['rules']]==[(r['when'],r['do']) for r in initial['rules']])
        check(name+' new match clears old winner and waits five seconds',page.evaluate('document.getElementById("results-panel").hidden&&__rq.state().time===0&&__rq.state().tick===0&&document.getElementById("arena-banner").innerText.includes("BATTLE STARTING")'))
        page.evaluate('__rq.stop()');page.wait_for_timeout(100)
        page.reload();page.wait_for_function('typeof __rq==="object"')
        reloaded=page.evaluate('__rq.program()')
        check(name+' reload preserves program and correct preset label',reloaded['config']==initial['config'] and reloaded['preset']==initial['preset'])
        if name=='void':check('VOID retains DO and disabled state after reload',reloaded['rules'][0]=={'when':'void','do':'charge','disabled':True})
    browser.close()
check('No JavaScript errors',not errors)
report={'ok':not failures,'checks':checks,'count':len(checks),'details':details,'errors':errors,'failures':failures,'source':str(SOURCE)}
(OUT/('layout-result.json' if os.environ.get('LAYOUT_ONLY') else 'local-result.json')).write_text(json.dumps(report,indent=2))
print(json.dumps({'ok':not failures,'count':len(checks),'failures':failures,'report':str(OUT/('layout-result.json' if os.environ.get('LAYOUT_ONLY') else 'local-result.json')),'errors':errors}),flush=True)
assert not failures, failures
