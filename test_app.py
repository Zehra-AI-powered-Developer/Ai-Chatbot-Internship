"""
Test suite to verify backend endpoints and conversation history
"""
import unittest
import json
from app import app

class ChatbotBackendTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_status_endpoint(self):
        """Test GET /api/status returns online status and provider info"""
        response = self.app.get("/api/status")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "online")
        self.assertIn("provider", data)
        self.assertIn("model", data)

    def test_empty_message_validation(self):
        """Test POST /api/chat rejects empty message with 400"""
        response = self.app.post(
            "/api/chat",
            data=json.dumps({"message": "   "}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_chat_interaction(self):
        """Test sending a message to /api/chat"""
        response = self.app.post(
            "/api/chat",
            data=json.dumps({
                "message": "Hello, my name is Alex.",
                "history": []
            }),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("reply", data)
        self.assertTrue(len(data["reply"]) > 0)

    def test_conversation_history(self):
        """Test sending conversation history preserves context"""
        history = [
            {"role": "user", "content": "My name is Alex."},
            {"role": "assistant", "content": "Nice to meet you Alex!"}
        ]
        response = self.app.post(
            "/api/chat",
            data=json.dumps({
                "message": "What is my name?",
                "history": history
            }),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("Alex", data["reply"])

if __name__ == "__main__":
    unittest.main()
