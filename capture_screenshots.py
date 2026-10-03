"""
Automated UI Screenshot Capture Script for Deliverables
Captures high-resolution screenshots of the revamped modern professional UI.
"""

import time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5000"

def capture_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 820})
        page = context.new_page()

        print(f"Navigating to {URL}...")
        page.goto(URL)
        page.wait_for_selector("#welcomeScreen")
        page.wait_for_timeout(1000)

        # 1. Capture Welcome Screen in Dark Mode
        print("Capturing 01_welcome_dark.png...")
        page.screenshot(path="screenshots/01_welcome_dark.png")

        # 2. Click suggestion prompt card
        print("Clicking prompt card for first interaction...")
        cards = page.query_selector_all(".prompt-card")
        if cards:
            cards[0].click()
            page.wait_for_selector(".bot-actions-row", timeout=25000)
            page.wait_for_timeout(1500)

        print("Capturing 02_chat_response_dark.png...")
        page.screenshot(path="screenshots/02_chat_response_dark.png")

        # 3. Toggle to Light Mode
        print("Switching to Light Mode...")
        page.click("#themeToggleBtn")
        page.wait_for_timeout(800)

        print("Capturing 03_chat_light_mode.png...")
        page.screenshot(path="screenshots/03_chat_light_mode.png")

        # 4. Toggle back to Dark Mode & send code prompt
        page.click("#themeToggleBtn")
        page.wait_for_timeout(500)

        print("Sending coding prompt to Software Architect persona...")
        page.select_option("#personaSelect", "coder")
        page.fill("#messageInput", "Write a clean Python function to check for a palindrome with type hints and docstring.")
        page.click("#sendBtn")
        page.wait_for_selector(".code-wrapper", timeout=25000)
        page.wait_for_timeout(1500)

        print("Capturing 04_code_generation_dark.png...")
        page.screenshot(path="screenshots/04_code_generation_dark.png")

        browser.close()
        print("All screenshots successfully captured!")

if __name__ == "__main__":
    capture_screenshots()
