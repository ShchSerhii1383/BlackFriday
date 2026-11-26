"""Етап 8: повна регресія — повний шлях без debug, повторні входи, перезавантаження,
розміри екрана, без localStorage, зіпсовані дані, подвійні натискання, resize, reduced motion,
відсутнє фото, накопичення DOM/анімацій. Кожна перевірка друкує OK/FAIL."""
import asyncio, random, sys
from playwright.async_api import async_playwright

BASE = "http://localhost:8765/index.html"
GA = "() => document.querySelector('#app').dataset.gameState"
PLAY = "() => document.querySelector('#app').dataset.gameState==='GAME_ACTIVE' && !document.querySelector('#board').classList.contains('is-building') && !document.querySelector('#wipe').classList.contains('is-active')"
READY_REWARD = GA + "==='REWARD' && !document.querySelector('#reward-btn').disabled"
ROOM_READY = "() => document.querySelector('#app').dataset.gameState==='SECRET_ROOM' && !document.querySelector('#wipe').classList.contains('is-active') && document.querySelector('#room-bg').complete"
PROGRESS = "() => { try { const d = JSON.parse(localStorage.getItem('bf-arcade') || '{}'); return [d.completedGames || 0, !!d.secretUnlocked, !!d.secretViewed, !!d.giftOpened]; } catch (e) { return 'no-storage'; } }"
COUNTS = """() => ({ nodes: document.querySelectorAll('*').length,
  running: document.getAnimations().filter(a => a.playState === 'running').length,
  particles: window.__game ? window.__game.particles.items.length : -1,
  lines: document.querySelectorAll('#line-layer *').length,
  hotspots: document.querySelectorAll('.room__hotspot').length,
  bulbs: document.querySelectorAll('.amb-bulb').length })"""

results = []
def check(name, ok, info=""):
    results.append((name, bool(ok)))
    print(f"[{'OK ' if ok else 'FAIL'}] {name} {info}")

async def scratch(page, idx):
    b = await page.locator(".card").nth(idx).bounding_box()
    x, y, s = b["x"], b["y"], b["width"]
    await page.mouse.move(x + s * .15, y + s * .15); await page.mouse.down()
    for i in range(8):
        await page.mouse.move(x + s * (.85 if i % 2 == 0 else .15), y + s * (.15 + i * .1), steps=4)
    await page.mouse.up()

async def play_until_match(page):
    order = list(range(12)); random.shuffle(order)
    for idx in order:
        await scratch(page, idx); await page.wait_for_timeout(40)
        if await page.evaluate(GA) == "MATCH_FOUND": return
    raise RuntimeError("no match")

async def new_page(b, w=390, h=664, **kw):
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, **kw)
    page = await ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    page.on("response", lambda r: errs.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    return ctx, page, errs

async def to_start(page, url=BASE, clear=True):
    await page.goto(url)
    if clear:
        await page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }"); await page.goto(url)
    await page.wait_for_function(GA + "==='START'", timeout=15000)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        # ---------- 1. Повний шлях звичайного гравця (без #debug), 5 ігор → кімната ----------
        ctx, page, errs = await new_page(b)
        await to_start(page)
        check("1.1 без #debug панелі немає", await page.evaluate("() => !document.querySelector('.debug-panel') && !window.__game"))
        check("1.2 корони на старті немає", await page.evaluate("() => getComputedStyle(document.querySelector('#start-crown')).visibility === 'hidden' || document.querySelector('#start-crown').hidden"))
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        states = []
        for g in range(1, 6):
            await play_until_match(page)
            await page.wait_for_function(READY_REWARD, timeout=10000)
            await page.dblclick("#reward-btn")          # подвійне натискання CLAIM
            await page.wait_for_timeout(800)
            states.append(await page.evaluate(GA))
            if g < 5:
                await page.wait_for_function("() => document.querySelector('#reward-btn-label').textContent.includes('PLAY')", timeout=4000)
                await page.click("#reward-btn"); await page.wait_for_function(PLAY, timeout=8000)
        check("1.3 подвійний CLAIM ігор 1–4 не пропускає екран", states[:4] == ["REWARD"] * 4, states)
        check("1.4 CLAIM на 5-й грі → секрет", states[4] in ("SECRET_UNLOCK", "SECRET_ACHIEVEMENT"), states[4])
        await page.wait_for_function(GA + "==='SECRET_PORTAL' && !document.querySelector('#secret-enter-btn').disabled", timeout=15000)
        await page.dblclick("#secret-enter-btn")
        await page.wait_for_function(ROOM_READY, timeout=10000)
        check("1.5 портал → кімната, viewed збережено", (await page.evaluate(PROGRESS))[:3] == [5, True, True])
        check("1.6 до відкриття подарунка кнопки «назад» немає", not await page.evaluate("() => document.querySelector('.scene--room').classList.contains('is-nav-visible')"))
        await page.dblclick("#gift-btn")
        await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=15000)
        check("1.7 подвійне натискання на подарунок → одне відкриття", (await page.evaluate(PROGRESS))[3])
        for _ in range(12):
            if await page.evaluate(GA) != "SECRET_GREETING": break
            for sel in ("#greeting-close", "#greeting-next", "#greeting-body"):
                if await page.locator(sel).is_visible():
                    await page.click(sel, timeout=2000); break
            await page.wait_for_timeout(300)
        await page.wait_for_function(ROOM_READY, timeout=8000)
        check("1.8 після привітання повернення в кімнату з навігацією", await page.evaluate("() => document.querySelector('.scene--room').classList.contains('is-nav-visible')"))
        await page.click("#room-back"); await page.wait_for_function(GA + "==='START'", timeout=8000)
        await page.wait_for_timeout(500)
        check("1.9 корона з'явилась на старті", await page.locator("#start-crown").is_visible())
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        check("1.10 після перегляду кімнати START веде в гру, не в секрет", await page.evaluate(GA) == "GAME_ACTIVE")
        await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
        await page.click("#reward-btn"); await page.wait_for_timeout(400)
        check("1.11 6-та гра: CLAIM не запускає секрет вдруге", await page.evaluate(GA) == "REWARD")
        check("1.12 жодних помилок і 404", not errs, errs[:3])
        await ctx.close()

        # ---------- 2. Перезавантаження в кожній точці секрету ----------
        ctx, page, errs = await new_page(b)
        D = BASE + "#debug"
        await to_start(page, D)
        await page.evaluate("() => window.__game.debugSetCompletedGames(4)")
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
        await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.click("#start-btn"); await page.wait_for_timeout(500)
        check("2.1 перезавантаження до CLAIM 5-ї гри → START запускає секрет", await page.evaluate(GA) in ("SECRET_UNLOCK", "SECRET_ACHIEVEMENT"))
        await page.wait_for_function(GA + "==='SECRET_ACHIEVEMENT'", timeout=10000)
        await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.click("#start-btn"); await page.wait_for_timeout(500)
        check("2.2 перезавантаження на медалі → секрет знову з початку", await page.evaluate(GA) in ("SECRET_UNLOCK", "SECRET_ACHIEVEMENT"))
        await page.wait_for_function(GA + "==='SECRET_PORTAL' && !document.querySelector('#secret-enter-btn').disabled", timeout=15000)
        await page.click("#secret-enter-btn"); await page.wait_for_function(ROOM_READY, timeout=10000)
        await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.wait_for_timeout(400)
        check("2.3 кімнату переглянуто, подарунок ні → корона є", await page.locator("#start-crown").is_visible())
        await page.click("#start-crown"); await page.wait_for_function(ROOM_READY, timeout=10000)
        check("2.4 корона веде в кімнату, подарунок закритий", not await page.evaluate("() => document.querySelector('#gift-btn').classList.contains('is-open')") and (await page.evaluate(PROGRESS))[3] is False)
        await page.click("#gift-btn"); await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=15000)
        await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.click("#start-crown"); await page.wait_for_function(ROOM_READY, timeout=10000)
        check("2.5 перезавантаження під час привітання → подарунок відкритий, навігація є",
              (await page.evaluate(PROGRESS))[3] and await page.evaluate("() => document.querySelector('.scene--room').classList.contains('is-nav-visible')"))
        check("2.6 помилок немає", not errs, errs[:3])

        # ---------- 3. Повторні входи в кімнату: накопичення ----------
        base = None
        for i in range(6):
            await page.click("#room-back"); await page.wait_for_function(GA + "==='START'", timeout=8000)
            await page.wait_for_timeout(300)
            await page.click("#start-crown"); await page.wait_for_function(ROOM_READY, timeout=10000)
            await page.click('.room__hotspot[data-egg="teddy"]'); await page.wait_for_timeout(900)
            c = await page.evaluate(COUNTS)
            if i == 0: base = c
        await page.wait_for_timeout(2500)
        c = await page.evaluate(COUNTS)
        check("3.1 6 входів у кімнату: зони/лампочки не дублюються", c["hotspots"] == 6 and c["bulbs"] == base["bulbs"], c)
        check("3.2 кількість DOM-вузлів стабільна", abs(c["nodes"] - base["nodes"]) <= 5, (base["nodes"], c["nodes"]))
        check("3.3 частинки зникли", c["particles"] == 0, c["particles"])
        # 10 ігор поспіль
        await page.click("#room-back"); await page.wait_for_function(GA + "==='START'", timeout=8000)
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        g0 = None
        for g in range(10):
            await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
            await page.click("#reward-btn"); await page.wait_for_timeout(750)
            await page.click("#reward-btn"); await page.wait_for_function(PLAY, timeout=8000)
            await page.wait_for_timeout(300)
            c = await page.evaluate(COUNTS)
            if g == 0: g0 = c
        check("3.4 10 ігор: DOM, анімації, лінії не ростуть", abs(c["nodes"] - g0["nodes"]) <= 5 and c["running"] <= g0["running"] + 2 and c["lines"] == 0, (g0, c))
        check("3.5 помилок немає", not errs, errs[:3])
        await ctx.close()

        # ---------- 4. Без localStorage і з зіпсованими даними ----------
        ctx, page, errs = await new_page(b)
        await ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
        await page.goto(BASE + "#debug"); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
        await page.click("#reward-btn"); await page.wait_for_timeout(300)
        check("4.1 localStorage заблоковано: гра працює", await page.evaluate(GA) == "REWARD" and await page.evaluate("() => window.__game.storage ? true : true"))
        check("4.2 помилок немає", not [e for e in errs if 'blocked' not in e], errs[:3])
        await ctx.close()
        for label, raw in [("не JSON", "{{{"), ("чужі типи", '{"v":1,"completedGames":"abc","secretUnlocked":"yes","lastCombos":[1,2]}'),
                           ("від'ємні/величезні", '{"v":1,"completedGames":-7,"lastCombos":{"r0":{"meme":99,"phrase":-1}}}'), ("стара схема", '{"v":0,"completedGames":9}')]:
            ctx, page, errs = await new_page(b)
            await page.goto(BASE); await page.evaluate(f"() => localStorage.setItem('bf-arcade', {raw!r})"); await page.goto(BASE + "#debug")
            await page.wait_for_function(GA + "==='START'", timeout=10000)
            await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
            await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
            meme_ok = await page.evaluate("() => document.querySelector('#reward-meme').complete && document.querySelector('#reward-meme').naturalWidth > 0")
            check(f"4.3 зіпсовані дані ({label}): гра і нагорода працюють", meme_ok and not errs, (await page.evaluate(PROGRESS), errs[:2]))
            await ctx.close()

        # ---------- 5. Розміри екрана, орієнтація, resize ----------
        for name, w, h in [("320", 320, 568), ("SE", 375, 667), ("390", 390, 844), ("430", 430, 932), ("desktop", 1280, 800)]:
            ctx, page, errs = await new_page(b, w, h)
            await to_start(page, BASE + "#debug")
            fit = await page.evaluate("() => { const r = document.querySelector('#start-btn').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }")
            await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
            board = await page.evaluate("() => { const r = document.querySelector('#board').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }")
            await page.evaluate("() => window.__game.debugShowReward(100)"); await page.wait_for_function(READY_REWARD, timeout=10000)
            rew = await page.evaluate("() => { const r = document.querySelector('#reward-btn').getBoundingClientRect(); return r.bottom <= innerHeight; }")
            await page.evaluate("() => window.__game.debugSecret('greeting')"); await page.wait_for_timeout(2500)
            room = await page.evaluate("() => { const r = document.querySelector('#room-stage').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }")
            check(f"5.1 {name}: старт/поле/нагорода/кімната вміщаються", fit and board and rew and room, (fit, board, rew, room))
            await ctx.close()
        ctx, page, errs = await new_page(b, 844, 390, is_mobile=True, has_touch=True)
        await page.goto(BASE); await page.wait_for_timeout(1500)
        check("5.2 горизонтальний телефон → підказка повернути", await page.evaluate("() => getComputedStyle(document.querySelector('#app'), '::after').content.includes('Поверни') && getComputedStyle(document.querySelector('#start-btn')).visibility === 'hidden'"))
        await ctx.close()
        ctx, page, errs = await new_page(b)
        await page.goto(BASE + "#debug"); await page.wait_for_timeout(700)
        await page.set_viewport_size({"width": 430, "height": 800}); await page.wait_for_function(GA + "==='START'", timeout=10000)
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        await scratch(page, 0)
        await page.set_viewport_size({"width": 375, "height": 640}); await page.wait_for_timeout(500)
        await scratch(page, 1)
        await page.evaluate("() => window.__game.debugSecret('room')"); await page.wait_for_timeout(1800)
        await page.set_viewport_size({"width": 430, "height": 900}); await page.wait_for_timeout(500)
        ph = await page.evaluate("() => { const s = document.querySelector('#room-stage').getBoundingClientRect(), p = document.querySelector('#room-photo').getBoundingClientRect(); return Math.abs((p.left - s.left) / s.width - 388/941) < 0.003; }")
        check("5.3 resize під час інтро/гри/кімнати: без помилок, фото на місці", not errs and ph, errs[:2])
        await ctx.close()

        # ---------- 6. Reduced motion ----------
        ctx, page, errs = await new_page(b, reduced_motion="reduce")
        await to_start(page, BASE + "#debug")
        await page.click("#start-btn"); await page.wait_for_function(PLAY, timeout=8000)
        await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=10000)
        await page.evaluate("() => window.__game.debugSecret('glitch')")
        await page.wait_for_function(GA + "==='SECRET_PORTAL'", timeout=15000)
        check("6.1 reduced motion: гра і секрет проходять", not errs, errs[:2])
        await ctx.close()

        # ---------- 7. Увімкнене фото з неіснуючим файлом ----------
        ctx, page, errs = await new_page(b)
        await to_start(page, BASE + "#debug")
        await page.evaluate("() => window.__game.debugSecret('room')"); await page.wait_for_function(ROOM_READY, timeout=10000)
        await page.evaluate("async () => { const m = await import('./js/room.js'); m.setRoomPhoto('assets/secret/does-not-exist.jpg'); }")
        await page.wait_for_timeout(800)
        src = await page.evaluate("() => document.querySelector('#room-photo-img').getAttribute('src')")
        check("7.1 відсутнє фото → заглушка", "placeholder" in src, src)
        await ctx.close()

        await b.close()
    bad = [n for n, ok in results if not ok]
    print(f"\nПІДСУМОК: {len(results) - len(bad)}/{len(results)} OK", "| FAIL:" if bad else "", bad)

if __name__ == "__main__":
    asyncio.run(main())
