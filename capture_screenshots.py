"""
Automated UI Screenshot Capture Script for Deliverables
Captures high-resolution screenshots of Dark Mode, Light Mode, and Code Execution.
"""

import time
import threading
from playwright.sync_api import sync_playwright
from app import app
import database as db

PORT = 5056

def run_server():
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)

def capture_screenshots():
    # Start Flask server in background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(2) # Give server time to bind

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 820})
        page = context.new_page()

        print(f"Navigating to http://127.0.0.1:{PORT}...")
        page.goto(f"http://127.0.0.1:{PORT}")
        page.wait_for_selector("#welcomeScreen")
        page.wait_for_timeout(1000)

        # 1. Capture Welcome Screen in Dark Mode
        print("Capturing 01_welcome_dark.png...")
        page.screenshot(path="screenshots/01_welcome_dark.png")

        # 2. Click suggestion chip for first interaction
        print("Clicking suggestion chip for first interaction...")
        chips = page.query_selector_all(".chip")
        if chips:
            chips[0].click()
            # Wait for streaming to complete (send button re-enabled)
            page.wait_for_selector("#sendBtn:not([disabled])", timeout=20000)
            page.wait_for_timeout(2500)

        print("Capturing 02_chat_response_dark.png...")
        page.screenshot(path="screenshots/02_chat_response_dark.png")

        # 3. Toggle to Light Mode
        print("Switching to Light Mode...")
        page.click("#themeToggleBtn")
        page.wait_for_timeout(1000)

        print("Capturing 03_chat_light_mode.png...")
        page.screenshot(path="screenshots/03_chat_light_mode.png")

        # 4. Toggle back to Dark Mode & send code prompt
        page.click("#themeToggleBtn")
        page.wait_for_timeout(500)

        print("Sending coding prompt to Senior Software Architect persona...")
        page.select_option("#personaSelect", "coder")
        page.fill("#messageInput", "Write a clean Python function to check for a palindrome with type hints, docstring, and unit test.")
        page.click("#sendBtn")
        page.wait_for_selector("#sendBtn:not([disabled])", timeout=20000)
        page.wait_for_timeout(2500)

        print("Capturing 04_code_generation_dark.png...")
        page.screenshot(path="screenshots/04_code_generation_dark.png")

        browser.close()
        print("All screenshots successfully captured!")

if __name__ == "__main__":
    capture_screenshots()
