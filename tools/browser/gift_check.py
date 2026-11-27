"""Етап 6: подарунок (9 кроків), панель привітання (9-slice, друк, пропуск, сторінки), навігація, збереження."""
import asyncio
from playwright.async_api import async_playwright
from PIL import Image

URL = "http://localhost:8765/index.html#debug"
GA = "() => document.querySelector('#app').dataset.gameState"
ROOM = "() => document.querySelector('#app').dataset.gameState==='SECRET_ROOM' && document.querySelector('#app').dataset.state==='room' && !document.querySelector('#wipe').classList.contains('is-active') && document.querySelector('#gift-closed').complete && document.querySelector('#gift-open').complete"
PANEL = """() => { const st = document.querySelector('#room-stage').getBoundingClientRect();
  const g = document.querySelector('#greeting').getBoundingClientRect();
  const p = document.querySelector('#greeting-panel').getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(document.querySelector('#greeting-body p') || document.body).fontSize);
  return { inside: g.top >= st.top - 1 && g.bottom <= st.bottom + 1 && g.left >= st.left - 1 && g.right <= st.right + 1,
           panel: [Math.round(p.width), Math.round(p.height)], greetingBottom: Math.round(g.bottom - st.top), stageH: Math.round(st.height), fontPx: fs }; }"""

async def dbg(page, key):
    await page.evaluate(f"() => window.__game.debugSecret('{key}')")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, device_scale_factor=2)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        page.on("response", lambda r: errs.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        await page.goto(URL); await page.evaluate("() => localStorage.clear()"); await page.reload()
        await page.wait_for_function(GA + "==='START'", timeout=10000)
        await dbg(page, 'gift-closed'); await page.wait_for_function(ROOM, timeout=10000); await page.wait_for_timeout(500)
        print("1) перший візит: подарунок закритий, кнопка повернення прихована:",
              await page.evaluate("() => [!document.querySelector('#gift-btn').classList.contains('is-opened'), !document.querySelector('.scene--room').classList.contains('is-nav-visible')]"))
        await page.screenshot(path="/home/claude/shots/gift-0-closed.png")
        gb = await page.locator('#gift-btn').bounding_box()
        print("   зона натискання подарунка:", round(gb['width']), "×", round(gb['height']), "px")
        # подвійне натискання
        await page.evaluate("() => { const b = document.querySelector('#gift-btn'); b.click(); b.click(); }")
        for i, t in enumerate([140, 330, 230, 400]):
            await page.wait_for_timeout(t); await page.screenshot(path=f"/home/claude/shots/gift-{i+1}.png")
        await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=8000)
        print("2) після відкриття:", await page.evaluate("() => ({opened: document.querySelector('#gift-btn').classList.contains('is-opened'), glow: document.querySelector('#room-photo').classList.contains('is-glowing'), saved: JSON.parse(localStorage.getItem('bf-arcade')).giftOpened})"))
        await page.wait_for_timeout(1800); await page.screenshot(path="/home/claude/shots/gift-5-typing.png")
        print("   під час друку:", await page.evaluate(PANEL))
        h1 = await page.evaluate("() => document.querySelector('#greeting-panel').getBoundingClientRect().height")
        await page.click('#greeting-panel'); await page.wait_for_timeout(200)  # пропустити друк
        h2 = await page.evaluate("() => document.querySelector('#greeting-panel').getBoundingClientRect().height")
        st = await page.evaluate("() => ({next: !document.querySelector('#greeting-next').hidden, ok: !document.querySelector('#greeting-close').hidden, sign: document.querySelector('#greeting-signature').classList.contains('is-on'), smile: !!document.querySelector('#greeting-body .px-smile:not(.greeting__pending .px-smile)')})")
        print(f"   пропуск дотиком: висота панелі {h1:.0f} → {h2:.0f} (без стрибків), стан {st}")
        while await page.evaluate("() => !document.querySelector('#greeting-next').hidden"):
            await page.click('#greeting-next'); await page.wait_for_timeout(100); await page.click('#greeting-panel'); await page.wait_for_timeout(150)
        await page.screenshot(path="/home/claude/shots/gift-6-greeting.png")
        await page.click('#greeting-close')
        await page.wait_for_function(GA + "==='SECRET_ROOM'", timeout=5000); await page.wait_for_timeout(500)
        print("3) OK → кімната:", await page.evaluate("() => [document.querySelector('.scene--room').classList.contains('is-nav-visible'), document.querySelector('#greeting').hidden]"))
        await page.screenshot(path="/home/claude/shots/gift-7-room.png")
        await page.click('#gift-btn'); await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=5000)
        print("4) відкритий подарунок → привітання ще раз:", await page.evaluate(GA))
        await page.click('#greeting-panel'); await page.wait_for_timeout(100)
        while await page.evaluate("() => !document.querySelector('#greeting-next').hidden"):
            await page.click('#greeting-next'); await page.wait_for_timeout(80); await page.click('#greeting-panel'); await page.wait_for_timeout(80)
        await page.click('#greeting-close'); await page.wait_for_function(GA + "==='SECRET_ROOM'", timeout=5000)
        await page.click('#room-back'); await page.wait_for_function(GA + "==='START' && !document.querySelector('#wipe').classList.contains('is-active')", timeout=8000)
        await page.wait_for_timeout(400)
        crown_same_visit = await page.locator('#start-crown').is_visible()
        await page.click('#start-crown'); await page.wait_for_function(ROOM, timeout=10000)
        print("5) у тому ж вході, через корону:", await page.evaluate("() => ({opened: document.querySelector('#gift-btn').classList.contains('is-opened'), glow: document.querySelector('#room-photo').classList.contains('is-glowing'), nav: document.querySelector('.scene--room').classList.contains('is-nav-visible')})"), "| корона була:", crown_same_visit)
        await page.reload(); await page.wait_for_function(GA + "==='START'", timeout=10000); await page.wait_for_timeout(400)
        print("6) новий вхід після дочитаного привітання — з нуля:", await page.evaluate("() => { const d = JSON.parse(localStorage.getItem('bf-arcade')); return [d.completedGames, d.secretViewed, d.giftOpened]; }"), "| корони немає:", not await page.locator('#start-crown').is_visible())
        print("errors:", errs or "none")
        await ctx.close()

        # сторінки привітання на різних екранах
        for name, w, h in [("320", 320, 568), ("se", 375, 548), ("390", 390, 664), ("430", 430, 740)]:
            pg = await (await b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce")).new_page()
            await pg.goto(URL); await pg.wait_for_function(GA + "==='START'", timeout=10000)
            await dbg(pg, 'greeting'); await pg.wait_for_function(GA + "==='SECRET_GREETING'", timeout=8000); await pg.wait_for_timeout(300)
            pages, worst = 1, await pg.evaluate(PANEL)
            while await pg.evaluate("() => !document.querySelector('#greeting-next').hidden"):
                await pg.click('#greeting-next'); await pg.wait_for_timeout(150); pages += 1
                g = await pg.evaluate(PANEL)
                if not g["inside"]: worst = g
            if name == "se": await pg.screenshot(path="/home/claude/shots/gift-se-last.png")
            print(f"   {name:4s} сторінок: {pages}, панель у межах кімнати: {worst['inside']}, шрифт {worst['fontPx']} px, панель {worst['panel']}")
            await pg.context.close()
        await b.close()

    ims = [Image.open(f"/home/claude/shots/gift-{n}.png") for n in ("0-closed", "1", "2", "3", "4", "5-typing", "6-greeting", "7-room")]
    w, hh = ims[0].size
    S = Image.new("RGB", (4 * (w + 8), 2 * (hh + 8)), (50, 50, 50))
    for i, im in enumerate(ims):
        S.paste(im, ((i % 4) * (w + 8), (i // 4) * (hh + 8)))
    S.thumbnail((2400, 2400)); S.save("/home/claude/shots/gift-sheet.png")

asyncio.run(main())
