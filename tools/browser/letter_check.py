"""Новий лист: сторінки на різних екранах, три анімації в потрібний момент, скло на фото."""
import asyncio
from playwright.async_api import async_playwright
from PIL import Image

URL = "http://localhost:8765/index.html#debug"
GA = "() => document.querySelector('#app').dataset.gameState"
STATE = """() => ({ chart: !!document.querySelector('.gr-chart.is-live'), discount: !!document.querySelector('.gr-discount.is-live'),
  sig: document.querySelector('#greeting-signature').classList.contains('is-on'),
  particles: window.__game.particles.items.length,
  next: !document.querySelector('#greeting-next').hidden, ok: !document.querySelector('#greeting-close').hidden })"""
FIT = """() => { const g = document.querySelector('#greeting').getBoundingClientRect(), s = document.querySelector('#room-stage').getBoundingClientRect();
  return { bottomInside: g.bottom <= s.bottom + 1, used: Math.round((g.bottom - s.top) / s.height * 100) }; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        shots = []
        for name, w, h in [("320", 320, 568), ("se", 375, 548), ("390", 390, 664), ("430", 430, 800)]:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            page = await ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto(URL); await page.wait_for_function(GA + "==='START'", timeout=12000)
            await page.evaluate("() => window.__game.debugSecret('greeting')")
            await page.wait_for_function(GA + "==='SECRET_GREETING'", timeout=10000)
            await page.wait_for_timeout(600)
            log = []; peak = 0; pages = 1
            for _ in range(140):   # ~14 с друку
                s = await page.evaluate(STATE); peak = max(peak, s['particles'])
                key = (s['chart'], s['discount'], s['sig'])
                if not log or log[-1][0] != key: log.append((key, s['particles']))
                if s['next']:
                    fit = await page.evaluate(FIT)
                    if name == "390": f = f"/home/claude/shots/letter-{name}-p{pages}.png"; await page.screenshot(path=f); shots.append(f)
                    print(f"  {name} стор.{pages}: {fit}")
                    await page.click('#greeting-next'); pages += 1
                if s['ok']: break
                await page.wait_for_timeout(100)
            await page.wait_for_timeout(450)
            fit = await page.evaluate(FIT)
            f = f"/home/claude/shots/letter-{name}-end.png"; await page.screenshot(path=f); shots.append(f)
            print(f"{name}: сторінок {pages}, остання {fit}; черговість (графік, 100%, підпис): {[k for k, _ in log]}; пік частинок {peak}; errors: {errs or 'none'}")
            if name == "390":
                await page.click('#greeting-close'); await page.wait_for_timeout(2500)
                await page.screenshot(path="/home/claude/shots/glass-a.png"); await page.wait_for_timeout(1100)
                await page.screenshot(path="/home/claude/shots/glass-b.png")
                fr = await page.evaluate("() => { const r = document.querySelector('#room-photo').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }")
            await ctx.close()
        await b.close()
    # склеїти лист 390 (усі сторінки) + 320/SE фінал; скло — зум рамки двох кадрів
    ims = [Image.open(f) for f in shots]
    H = max(i.height for i in ims); S = Image.new("RGB", (sum(i.width for i in ims) + 10 * len(ims), H), (40, 40, 40)); x = 0
    for i in ims: S.paste(i, (x, 0)); x += i.width + 10
    S.thumbnail((2400, 2400)); S.save("/home/claude/shots/letter-sheet.png")
    x, y, w, h = [v * 2 for v in fr]; pad = 40
    g = [Image.open(f"/home/claude/shots/glass-{k}.png").crop((int(x - pad), int(y - pad), int(x + w + pad), int(y + h + pad))) for k in "ab"]
    G = Image.new("RGB", (g[0].width * 2 + 10, g[0].height), (40, 40, 40)); G.paste(g[0], (0, 0)); G.paste(g[1], (g[0].width + 10, 0)); G.save("/home/claude/shots/glass-sheet.png")

asyncio.run(main())
