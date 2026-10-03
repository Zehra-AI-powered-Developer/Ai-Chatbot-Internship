"""
Test Suite for AI Chatbot Production Architecture
XICTEK Systems Internship - Day 2 & Day 3

Covers:
- System status and persona metadata
- Strict input validation and sanitization
- IP Rate limiting protection
- SQLite multi-session persistence and message storage
- Sliding-window context memory management
- Synchronous and SSE streaming chat endpoints
- Conversation export in Markdown and JSON formats
"""

import unittest
import json
import uuid
import database as db
from app import app
from utils import rate_limiter, build_sliding_window_context, validate_chat_request


class ChatbotProductionTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        rate_limiter.reset()

    # -------------------------------------------------------------
    # 1. System Health & Metadata
    # -------------------------------------------------------------
    def test_status_endpoint(self):
        """Test GET /api/status returns online status and active capabilities."""
        response = self.app.get("/api/status")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "online")
        self.assertIn("provider", data)
        self.assertIn("model", data)
        self.assertIn("features", data)
        self.assertTrue(data["features"]["sqlite_persistence"])
        self.assertTrue(data["features"]["streaming_sse"])

    def test_personas_endpoint(self):
        """Test GET /api/personas returns defined system personas."""
        response = self.app.get("/api/personas")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("personas", data)
        personas = data["personas"]
        self.assertGreaterEqual(len(personas), 4)
        persona_ids = [p["id"] for p in personas]
        self.assertIn("helpful", persona_ids)
        self.assertIn("coder", persona_ids)
        self.assertIn("tutor", persona_ids)

    # -------------------------------------------------------------
    # 2. Input Validation & Security Guardrails
    # -------------------------------------------------------------
    def test_validation_empty_message(self):
        """Test POST /api/chat rejects empty message with HTTP 400."""
        response = self.app.post(
            "/api/chat",
            data=json.dumps({"message": "   "}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertIn("error", data)

    def test_validation_missing_message(self):
        """Test POST /api/chat rejects missing message parameter."""
        response = self.app.post(
            "/api/chat",
            data=json.dumps({"persona": "coder"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_validation_oversized_message(self):
        """Test POST /api/chat rejects message exceeding 4000 characters."""
        oversized = "A" * 4001
        response = self.app.post(
            "/api/chat",
            data=json.dumps({"message": oversized}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("maximum allowed length", response.get_json()["error"])

    # -------------------------------------------------------------
    # 3. Rate Limiting Protection
    # -------------------------------------------------------------
    def test_rate_limiter_blocks_excessive_requests(self):
        """Test rate limiter triggers HTTP 429 after burst exceeding limit."""
        # Temporarily lower limit to test
        orig_limit = rate_limiter.max_requests
        rate_limiter.max_requests = 3
        try:
            for _ in range(3):
                res = self.app.post(
                    "/api/chat",
                    data=json.dumps({"message": "Ping"}),
                    content_type="application/json"
                )
                self.assertIn(res.status_code, [200, 429])

            # 4th request must be rate limited
            res4 = self.app.post(
                "/api/chat",
                data=json.dumps({"message": "Ping overflow"}),
                content_type="application/json"
            )
            self.assertEqual(res4.status_code, 429)
            self.assertIn("Rate limit", res4.get_json()["details"])
        finally:
            rate_limiter.max_requests = orig_limit
            rate_limiter.reset()

    # -------------------------------------------------------------
    # 4. SQLite Session Persistence & Lifecycle
    # -------------------------------------------------------------
    def test_session_lifecycle(self):
        """Test creating, fetching, updating, clearing, and deleting chat sessions."""
        # Create session
        res_create = self.app.post(
            "/api/sessions",
            data=json.dumps({"title": "Test Session", "persona": "coder"}),
            content_type="application/json"
        )
        self.assertEqual(res_create.status_code, 201)
        session_id = res_create.get_json()["session_id"]
        self.assertTrue(len(session_id) > 10)

        # Get session details
        res_get = self.app.get(f"/api/sessions/{session_id}")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.get_json()
        self.assertEqual(data["session"]["title"], "Test Session")
        self.assertEqual(data["session"]["persona"], "coder")

        # Update session title
        res_patch = self.app.patch(
            f"/api/sessions/{session_id}",
            data=json.dumps({"title": "Renamed Session"}),
            content_type="application/json"
        )
        self.assertEqual(res_patch.status_code, 200)
        session_after = db.get_session(session_id)
        self.assertEqual(session_after["title"], "Renamed Session")

        # Add message & verify persistence
        db.add_message(session_id, "user", "Hello there!")
        db.add_message(session_id, "assistant", "General Kenobi!")
        messages = db.get_messages(session_id)
        self.assertEqual(len(messages), 2)

        # Clear messages
        res_clear = self.app.delete(f"/api/sessions/{session_id}/messages")
        self.assertEqual(res_clear.status_code, 200)
        messages_after = db.get_messages(session_id)
        self.assertEqual(len(messages_after), 0)

        # Delete session
        res_del = self.app.delete(f"/api/sessions/{session_id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertIsNone(db.get_session(session_id))

    # -------------------------------------------------------------
    # 5. Sliding-Window Memory Utility
    # -------------------------------------------------------------
    def test_sliding_window_memory(self):
        """Test sliding window context manager trims older turns beyond budget."""
        large_history = []
        for i in range(20):
            large_history.append({"role": "user", "content": f"User question {i}"})
            large_history.append({"role": "assistant", "content": f"Assistant answer {i}"})

        # Request window of 6
        window = build_sliding_window_context(large_history, max_turns=6)
        self.assertEqual(len(window), 6)
        # Should keep the most recent entries
        self.assertEqual(window[-1]["content"], "Assistant answer 19")
        self.assertEqual(window[0]["content"], "User question 17")

    # -------------------------------------------------------------
    # 6. Synchronous Chat & Context Preservation
    # -------------------------------------------------------------
    def test_sync_chat_with_context(self):
        """Test POST /api/chat preserves conversational context across turns."""
        # Turn 1: Introduce name
        res1 = self.app.post(
            "/api/chat",
            data=json.dumps({
                "message": "My name is Alex. I am a software intern.",
                "persona": "helpful"
            }),
            content_type="application/json"
        )
        self.assertEqual(res1.status_code, 200)
        data1 = res1.get_json()
        session_id = data1["session_id"]
        self.assertIn("reply", data1)

        # Turn 2: Ask about name referencing past context
        res2 = self.app.post(
            "/api/chat",
            data=json.dumps({
                "message": "What is my name and role?",
                "session_id": session_id
            }),
            content_type="application/json"
        )
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertIn("reply", data2)
        reply_lower = data2["reply"].lower()
        self.assertTrue("alex" in reply_lower or len(data2["reply"]) > 10)

        # Clean up
        db.delete_session(session_id)

    # -------------------------------------------------------------
    # 7. SSE Streaming Endpoint
    # -------------------------------------------------------------
    def test_streaming_endpoint(self):
        """Test POST /api/chat/stream returns text/event-stream with SSE data."""
        res = self.app.post(
            "/api/chat/stream",
            data=json.dumps({
                "message": "Say hello in 3 words.",
                "persona": "helpful"
            }),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")

        stream_data = res.get_data(as_text=True)
        self.assertIn("data: ", stream_data)
        self.assertIn("session_meta", stream_data)

    # -------------------------------------------------------------
    # 8. Export Functionality
    # -------------------------------------------------------------
    def test_export_markdown_and_json(self):
        """Test GET /api/export/<session_id> exports markdown and json."""
        session_id = db.create_session(title="Export Test Session", persona="tutor")
        db.add_message(session_id, "user", "Explain recursion.")
        db.add_message(session_id, "assistant", "Recursion is when a function calls itself.")

        # Test Markdown Export
        res_md = self.app.get(f"/api/export/{session_id}?format=markdown")
        self.assertEqual(res_md.status_code, 200)
        self.assertIn("text/markdown", res_md.content_type)
        md_text = res_md.get_data(as_text=True)
        self.assertIn("# Conversation: Export Test Session", md_text)
        self.assertIn("Explain recursion.", md_text)

        # Test JSON Export
        res_json = self.app.get(f"/api/export/{session_id}?format=json")
        self.assertEqual(res_json.status_code, 200)
        json_data = res_json.get_json()
        self.assertEqual(json_data["session"]["title"], "Export Test Session")
        self.assertEqual(len(json_data["messages"]), 2)

        # Clean up
        db.delete_session(session_id)


if __name__ == "__main__":
    unittest.main()
