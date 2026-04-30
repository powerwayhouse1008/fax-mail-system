import asyncio
import random
from datetime import datetime
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ===== CẤU HÌNH =====
# Có thể dùng selector hoặc text (ưu tiên selector nếu có)
TASKS = [
    {
      "url": "https://www.athome.co.jp/estate/tokyo/list/?pref=13&cities=sumida&basic=&tsubo=0&tanka=0&q=1&sort=41&limit=50",
        "selector": "a.js-search-result-item-link",  # ví dụ, cần kiểm tra lại selector thật
        "text": None,
    }
]

HEADLESS = False           # True nếu muốn chạy ẩn
TIMEOUT_MS = 15000         # timeout chờ phần tử
DELAY_MIN = 1.0            # delay ngẫu nhiên tối thiểu (giây)
DELAY_MAX = 2.5            # delay ngẫu nhiên tối đa (giây)
MAX_CLICKS_PER_TASK = 50   # click tối đa mỗi trang
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


async def click_listing_in_new_tab(context, listing_locator, index: int, task_url: str):
    try:
        async with context.expect_page() as new_page_event:
            await listing_locator.click(timeout=TIMEOUT_MS, button="left")
        detail_page = await new_page_event.value

        await detail_page.wait_for_load_state("domcontentloaded", timeout=TIMEOUT_MS)
        detail_url = detail_page.url
        log_line(f"✅ SUCCESS | {task_url} | item #{index} | opened: {detail_url}")

        await random_delay()
        await detail_page.close()
        return True

    except PlaywrightTimeoutError:
        log_line(f"❌ FAIL    | {task_url} | item #{index} | timeout khi mở tab mới")
    except Exception as e:
        log_line(f"❌ FAIL    | {task_url} | item #{index} | lỗi: {type(e).__name__}: {e}")

    return False


async def process_task(page, context, task):
    url = task["url"]
    selector = task.get("selector")
    text = task.get("text")

    try:
        # 1) Mở URL theo thứ tự
        await page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)

        # 2) Chờ link xuất hiện + click
        if selector:
            await page.wait_for_selector(selector, timeout=TIMEOUT_MS, state="visible")
            listings = page.locator(selector)
        elif text:
            listings = page.get_by_text(text, exact=False)
            await listings.first.wait_for(state="visible", timeout=TIMEOUT_MS)
        else:
            log_line(f"⚠️ SKIP    | {url} | thiếu selector và text")
            return

        total = await listings.count()
        if total == 0:
            log_line(f"⚠️ SKIP    | {url} | không tìm thấy listing nào")
            return

        target = min(total, MAX_CLICKS_PER_TASK)
        log_line(f"ℹ️ INFO    | {url} | tìm thấy {total} listing, sẽ click {target}")

        success = 0
        for i in range(target):
            listing = listings.nth(i)
            ok = await click_listing_in_new_tab(context, listing, i + 1, url)
            if ok:
                success += 1

        log_line(f"📊 DONE    | {url} | success {success}/{target}")

    except PlaywrightTimeoutError:
       log_line(f"❌ FAIL    | {url} | timeout khi tải trang/chờ listing")
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
            await process_task(page, context, task)

        await browser.close()
        log_line("🎉 Hoàn tất tất cả URL.")


if __name__ == "__main__":
    asyncio.run(main())
