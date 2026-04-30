import asyncio
import random
from datetime import datetime
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ===== CẤU HÌNH =====
# Có thể dùng selector hoặc text (ưu tiên selector nếu có)
TASKS = [
    {
        "url": "https://example-realestate-1.com",
        "selector": "a.listing-link",   # CSS selector
        "text": None                     # hoặc "Xem chi tiết"
    },
    {
        "url": "https://example-realestate-2.com",
        "selector": None,
        "text": "Xem tin đăng"
    },
    {
        "url": "https://example-realestate-3.com",
        "selector": ".property-card a",
        "text": None
    },
]

HEADLESS = False           # True nếu muốn chạy ẩn
TIMEOUT_MS = 15000         # timeout chờ phần tử
DELAY_MIN = 2.0            # delay ngẫu nhiên tối thiểu (giây)
DELAY_MAX = 5.0            # delay ngẫu nhiên tối đa (giây)
LOG_FILE = "click_log.txt"


def log_line(message: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {message}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


async def random_delay():
    s = random.uniform(DELAY_MIN, DELAY_MAX)
    await asyncio.sleep(s)


async def process_task(page, task):
    url = task["url"]
    selector = task.get("selector")
    text = task.get("text")

    try:
        # 1) Mở URL theo thứ tự
        await page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)

        # 2) Chờ link xuất hiện + click
        if selector:
            await page.wait_for_selector(selector, timeout=TIMEOUT_MS, state="visible")
            await page.click(selector, timeout=TIMEOUT_MS)
            log_line(f"✅ SUCCESS | {url} | click selector: {selector}")
        elif text:
            locator = page.get_by_text(text, exact=False).first
            await locator.wait_for(state="visible", timeout=TIMEOUT_MS)
            await locator.click(timeout=TIMEOUT_MS)
            log_line(f"✅ SUCCESS | {url} | click text: {text}")
        else:
            log_line(f"⚠️ SKIP    | {url} | thiếu selector và text")
            return

        # 3) Delay ngẫu nhiên chống chặn bot
        await random_delay()

    except PlaywrightTimeoutError:
        log_line(f"❌ FAIL    | {url} | timeout khi chờ/click")
    except Exception as e:
        log_line(f"❌ FAIL    | {url} | lỗi: {type(e).__name__}: {e}")


async def main():
    # reset log mỗi lần chạy
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write("=== AUTO CLICK LOG ===\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()
        page = await context.new_page()

        for task in TASKS:
            await process_task(page, task)

        await browser.close()
        log_line("🎉 Hoàn tất tất cả URL.")


if __name__ == "__main__":
    asyncio.run(main())
