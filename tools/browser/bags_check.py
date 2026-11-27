"""Мішечки в браузері: кожні 4 результати однієї знижки — 4 різні персонажі, 5 — 5 різних фраз;
коло переживає перезавантаження; між колами немає повтору; без localStorage теж працює."""
import asyncio
from playwright.async_api import async_playwright

URL = "http://localhost:8765/index.html#debug"
READY = "() => document.querySelector('#app').dataset.gameState==='START'"
SHOWN = "() => document.querySelector('#app').dataset.gameState==='REWARD' && !document.querySelector('#reward-btn').disabled"
CUR = "() => [document.querySelector('.scene--reward').dataset.meme, document.querySelector('#reward-text').textContent]"

async def show(page, v):
    await page.evaluate(f"() => window.__game.debugShowReward({v})")
    await page.wait_for_function(SHOWN, timeout=10000)
    return await page.evaluate(CUR)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, reduced_motion="reduce")
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL); await page.evaluate("() => localStorage.clear()"); await page.reload()
        await page.wait_for_function(READY, timeout=10000)

        # 0%: 12 результатів, перезавантаження посеред другого кола (після 6-го)
        memes, texts = [], []
        for i in range(12):
            if i == 6:
                await page.reload(); await page.wait_for_function(READY, timeout=10000)
            m, t = await show(page, 0); memes.append(m); texts.append(t)
        cycles = [memes[i:i + 4] for i in range(0, 12, 4)]
        print("0% персонажі по колах:", cycles)
        print("   кожне коло з 4 різних:", all(len(set(c)) == 4 for c in cycles))
        print("   повторів поспіль:", sum(memes[i] == memes[i - 1] for i in range(1, 12)))
        print("   фрази: перші 5 різні:", len(set(texts[:5])) == 5, "| наступні 5 різні:", len(set(texts[5:10])) == 5)
        # інші знижки — власні незалежні мішечки
        for v in (33, 66, 100):
            ms = [(await show(page, v))[0] for _ in range(4)]
            print(f"{v}%:", ms, "— усі 4 різні:", len(set(ms)) == 4)
        await ctx.close()

        # без localStorage: коло живе в пам'яті сесії
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, reduced_motion="reduce")
        await ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_function(READY, timeout=10000)
        ms = [(await show(page, 66))[0] for _ in range(4)]
        print("без localStorage, 66%:", ms, "— усі 4 різні:", len(set(ms)) == 4)
        print("errors:", [e for e in errs if 'blocked' not in e] or "none")
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
