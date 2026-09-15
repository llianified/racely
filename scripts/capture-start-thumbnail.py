import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 800, 'height': 450}, device_scale_factor=1)
    page.on('pageerror', lambda err: print('PAGE ERROR:', err))
    page.goto('http://localhost:3000/preview/start-thumbnail', wait_until='networkidle')
    page.wait_for_selector('canvas[data-ready="true"]', timeout=60000)
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(1000)
    total = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    for i in range(total):
        page.evaluate('(phase) => window.dispatchEvent(new CustomEvent("thumbnail-frame", {detail: phase}))', i / total)
        page.locator('main').screenshot(path=f'/tmp/agent-browser/racely-frame-{i:03d}.png', animations='disabled')
        if i % 12 == 0: print(f'Rendered {i + 1}/{total}', flush=True)
    browser.close()
