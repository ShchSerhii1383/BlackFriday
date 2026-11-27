"""Звук: нічого до жесту, музика за станами гри, стирання, кнопка звуку, пауза у фоні,
збереження вибору, відсутні файли, фото в кімнаті. Політика автоплею як на телефоні."""
import asyncio, sys
sys.path.insert(0, '/home/claude/tools')
from regression import scratch, play_until_match, GA, PLAY, READY_REWARD, ROOM_READY, check, results
from playwright.async_api import async_playwright

URL = "http://localhost:8765/index.html#debug"
AS = "async () => (await import('./js/audio.js')).AudioManager.debugState()"

async def st(page):
    return await page.evaluate(AS)

async def music_is(page, name, wait=6000):
    """Опитує стан, поки трек name реально грає (час іде, гучність > 0). Повертає True/False."""
    for _ in range(wait // 200):
        s = await st(page)
        if s['src'] == name and not s['paused'] and s['time'] > 0.15 and (s['gain'] or 0) > 0.05:
            return True
        await page.wait_for_timeout(200)
    return False

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                    args=["--no-sandbox", "--autoplay-policy=user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 664})
        page = await ctx.new_page(); errs, audio_reqs = [], []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("request", lambda r: audio_reqs.append(r.url.split('/')[-1]) if '/audio/' in r.url else None)
        await page.goto(URL); await page.evaluate("() => localStorage.clear()"); await page.reload()
        await page.wait_for_function(GA + "==='START'", timeout=12000)
        s = await st(page)
        check("A1 до першого дотику: жодного запиту до аудіо, нічого не грає", not audio_reqs and not s['unlocked'] and s['desired'] == 'background', (audio_reqs, s))
        check("A2 кнопка звуку показує «увімкнено» за замовчуванням", 'sound-on' in await page.get_attribute('#sound-btn img', 'src'))

        await page.click('#start-btn')
        ok = await music_is(page, 'background.mp3')
        check("A3 START → грає Wii Shop", ok, await st(page))
        check("A4 інтро-джингл заграв із першим дотиком (у межах 6 с)", 'intro.mp3' in audio_reqs, audio_reqs)
        await page.wait_for_function(PLAY, timeout=8000)
        # стирання: звук іде лише поки палець рухається
        box = await page.locator('.card').nth(0).bounding_box()
        await page.mouse.move(box['x'] + 10, box['y'] + 10); await page.mouse.down()
        await page.mouse.move(box['x'] + 60, box['y'] + 30, steps=6); await page.wait_for_timeout(250)
        during = (await st(page))['scratching']
        await page.mouse.up(); await page.wait_for_timeout(150)
        after = (await st(page))['scratching']
        check("A5 звук стирання: грає під пальцем, зупиняється після відпускання", during and not after, (during, after))

        for v, f in [(0, 'reward-0.mp3'), (33, 'reward-33.mp3'), (66, 'reward-66.mp3'), (100, 'reward-100.mp3')]:
            await page.evaluate(f"() => window.__game.debugForceMatch({v})")
            await page.wait_for_function(READY_REWARD, timeout=12000)
            okr = await music_is(page, f)
            check(f"A6 {v}% → {f} (без нового дотику)", okr, await st(page))
            await page.click('#reward-btn'); await page.wait_for_timeout(800); await page.click('#reward-btn')
            await page.wait_for_function(PLAY, timeout=10000)
        check("A7 PLAY AGAIN → знову Wii Shop", await music_is(page, 'background.mp3'), await st(page))

        # кнопка звуку: вимкнути → тиша; увімкнути → той самий трек з того ж місця
        t1 = (await st(page))['time']
        await page.click('#sound-btn'); await page.wait_for_timeout(300)
        off = await st(page)
        await page.wait_for_timeout(700)
        await page.click('#sound-btn'); await page.wait_for_timeout(400)
        on = await st(page)
        check("A8 звук вимк → пауза; увімк → продовжує з місця", off['paused'] and not on['paused'] and on['src'] == 'background.mp3' and abs(on['time'] - off['time']) < 0.8, (t1, off, on))
        # інша вкладка
        await page.evaluate("() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_timeout(300); hid = await st(page)
        await page.evaluate("() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }")
        await page.wait_for_timeout(500); back = await st(page)
        check("A9 інша вкладка → пауза, повернення → грає далі", hid['paused'] and not back['paused'], (hid, back))

        # секретний сценарій
        await page.evaluate("() => window.__game.debugSetCompletedGames(4)")
        await play_until_match(page); await page.wait_for_function(READY_REWARD, timeout=12000)
        await page.click('#reward-btn'); await page.wait_for_timeout(600)
        s = await st(page)
        check("A10 розблокування: музика стихла, глітч завантажено", s['desired'] is None and 'system-glitch.mp3' in audio_reqs, s)
        await page.wait_for_function(GA + "==='SECRET_PORTAL' && !document.querySelector('#secret-enter-btn').disabled", timeout=15000)
        await page.click('#secret-enter-btn'); await page.wait_for_function(ROOM_READY, timeout=12000)
        check("A11 кімната → Snowdin Town", await music_is(page, 'secret-room-ambient.mp3'), await st(page))
        photo = await page.evaluate("() => { const i = document.querySelector('#room-photo-img'); return [i.getAttribute('src'), i.naturalWidth]; }")
        check("A12 у рамці справжнє фото", 'secret-photo.webp' in photo[0] and photo[1] == 600, photo)
        await page.screenshot(path='/home/claude/shots/room-photo.png')
        await page.click('#gift-btn')
        check("A13 подарунок → Home (Undertale)", await music_is(page, 'greeting-music.mp3'), await st(page))
        await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=15000)
        for _ in range(14):
            if await page.evaluate(GA) != 'SECRET_GREETING': break
            for sel in ('#greeting-close', '#greeting-next', '#greeting-panel'):
                if await page.locator(sel).is_visible():
                    await page.click(sel, timeout=2000); break
            await page.wait_for_timeout(300)
        await page.wait_for_function(ROOM_READY, timeout=8000)
        check("A14 після привітання → знову Snowdin", await music_is(page, 'secret-room-ambient.mp3'), await st(page))
        await page.wait_for_timeout(1200)
        await page.screenshot(path='/home/claude/shots/room-photo-glow.png')
        await page.click('#room-back'); await page.wait_for_function(GA + "==='START'", timeout=8000)
        check("A15 з кімнати на старт → Wii Shop", await music_is(page, 'background.mp3'), await st(page))

        # вибір зберігається
        await page.click('#sound-btn'); await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=12000)
        s = await st(page)
        check("A16 вимкнений звук пам'ятається після перезавантаження", not s['enabled'] and 'sound-off' in await page.get_attribute('#sound-btn img', 'src'), s)
        await page.click('#start-btn'); await page.wait_for_timeout(1200)
        check("A17 зі звуком вимк: гра йде, музика не грає", (await st(page))['paused'], await st(page))
        check("A18 помилок немає", not errs, errs[:3])
        await ctx.close()

        # відсутні аудіофайли (напр. прев'ю без звуку) — гра працює без помилок JS
        ctx = await b.new_context(viewport={"width": 390, "height": 664})
        page = await ctx.new_page(); errs2 = []
        page.on("pageerror", lambda e: errs2.append(str(e)))
        await page.route("**/audio/**", lambda r: r.fulfill(status=404, body=""))
        await page.goto(URL); await page.wait_for_function(GA + "==='START'", timeout=12000)
        await page.click('#start-btn'); await page.wait_for_function(PLAY, timeout=8000)
        await scratch(page, 0)
        await page.evaluate("() => window.__game.debugForceMatch(33)"); await page.wait_for_function(READY_REWARD, timeout=12000)
        check("A19 без аудіофайлів: гра проходить, без помилок JS", not errs2, errs2[:3])
        await b.close()
    bad = [n for n, ok in results if not ok]
    print(f"\nПІДСУМОК: {len(results) - len(bad)}/{len(results)} OK", bad)

asyncio.run(main())
