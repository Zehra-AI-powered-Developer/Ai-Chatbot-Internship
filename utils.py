"""
Utilities for Validation, Rate Limiting, and Memory Window Management
XICTEK Systems Internship - Day 2 & Day 3 Production Architecture
"""

import time
import html
import threading
from collections import defaultdict, deque

# Configuration Constants
MAX_MESSAGE_LENGTH = 4000
RATE_LIMIT_REQUESTS = 35       # max requests
RATE_LIMIT_WINDOW_SECONDS = 60 # per 60 seconds
DEFAULT_HISTORY_TURNS = 10     # last 10 messages kept in active LLM context window


class RateLimiter:
    """Thread-safe sliding-window in-memory rate limiter per IP address."""

    def __init__(self, max_requests: int = RATE_LIMIT_REQUESTS, window_seconds: int = RATE_LIMIT_WINDOW_SECONDS):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(deque)
        self.lock = threading.Lock()

    def is_allowed(self, client_ip: str) -> tuple[bool, int]:
        """
        Check if request from client_ip is permitted.
        Returns: (is_allowed: bool, retry_after_seconds: int)
        """
        now = time.time()
        with self.lock:
            queue = self.requests[client_ip]

            # Remove requests outside the active sliding window
            while queue and queue[0] <= now - self.window_seconds:
                queue.popleft()

            if len(queue) >= self.max_requests:
                oldest = queue[0]
                retry_after = max(1, int(self.window_seconds - (now - oldest)))
                return False, retry_after

            queue.append(now)
            return True, 0

    def reset(self):
        """Clear rate limiter state (useful for test suites)."""
        with self.lock:
            self.requests.clear()


# Global rate limiter instance
rate_limiter = RateLimiter()


def validate_chat_request(data: dict) -> tuple[bool, str, dict]:
    """
    Validate and sanitize chat incoming JSON payload.
    Returns: (is_valid, error_message, cleaned_data)
    """
    if not isinstance(data, dict):
        return False, "Invalid request body: Expected JSON object.", {}

    message = data.get("message")
    if message is None:
        return False, "Missing 'message' field in payload.", {}

    if not isinstance(message, str):
        return False, "'message' field must be a string.", {}

    stripped_message = message.strip()
    if not stripped_message:
        return False, "Message content cannot be empty or only whitespace.", {}

    if len(stripped_message) > MAX_MESSAGE_LENGTH:
        return False, f"Message exceeds maximum allowed length of {MAX_MESSAGE_LENGTH} characters (current: {len(stripped_message)}).", {}

    cleaned = {
        "message": stripped_message,
        "session_id": str(data.get("session_id", "")).strip(),
        "persona": str(data.get("persona", "helpful")).strip(),
        "custom_prompt": str(data.get("custom_prompt", "")).strip(),
        "provider": str(data.get("provider", "auto")).strip(),
        "history": data.get("history", [])
    }

    return True, "", cleaned


def build_sliding_window_context(history: list, max_turns: int = DEFAULT_HISTORY_TURNS) -> list:
    """
    Production Sliding Window Memory Manager.
    Keeps only the most recent `max_turns` valid turns to prevent context window overflow
    and optimize token usage while retaining immediate conversational context.
    """
    if not isinstance(history, list):
        return []

    valid_turns = []
    for turn in history:
        if isinstance(turn, dict) and "role" in turn and "content" in turn:
            role = turn["role"]
            content = str(turn["content"]).strip()
            if role in ("user", "assistant") and content:
                valid_turns.append({"role": role, "content": content})

    # Return only the most recent N turns
    return valid_turns[-max_turns:]


def estimate_tokens(text: str) -> int:
    """Rough token count estimation (~4 characters per token)."""
    if not text:
        return 0
    return max(1, len(text) // 4)
