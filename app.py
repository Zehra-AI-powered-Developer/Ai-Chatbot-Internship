"""
AI Chatbot - Day 1 Practical Task
XICTEK Systems Internship

Features:
- Multi-turn conversation history
- Support for Google Gemini (gemini-3.8-flash), OpenAI, and Groq
- Dynamic reload of .env configuration
- System prompt customization
- Robust error handling & fallback
- Clean Flask REST API serving a modern Web UI
"""

import os
import json
import time
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

app = Flask(__name__, static_folder="static")
CORS(app)


def get_active_provider():
    """Detect and return which AI provider is configured."""
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    custom_model = os.getenv("AI_MODEL", "").strip()

    # Priority 1: Gemini (verified active key)
    if gemini_key and not gemini_key.startswith("your_") and not gemini_key.startswith("AIzaSy_your"):
        return "gemini", gemini_key, custom_model or "gemini-3.5-flash-lite"

    # Priority 2: Groq
    if groq_key and not groq_key.startswith("gsk_your"):
        return "groq", groq_key, custom_model or "llama-3.3-70b-versatile"

    # Priority 3: OpenAI
    if openai_key and not openai_key.startswith("your_"):
        return "openai", openai_key, custom_model or "gpt-4o-mini"

    return "demo", None, "demo-agent"


@app.route("/")
def index():
    """Serve the single-page chat interface."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    """Serve static assets (CSS, JS, images)."""
    return send_from_directory(app.static_folder, filename)


@app.route("/api/status", methods=["GET"])
def status():
    """Return backend status, detected provider, and active model."""
    provider_type, key, model = get_active_provider()
    provider_names = {
        "gemini": "Google Gemini",
        "groq": "Groq (Llama-3)",
        "openai": "OpenAI",
        "demo": "Demo Mode"
    }
    return jsonify({
        "status": "online",
        "provider": provider_names.get(provider_type, "Unknown"),
        "model": model,
        "is_live_key_configured": provider_type != "demo",
        "message": "AI Chatbot backend is up and running."
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat endpoint.
    Accepts:
      - message (string, required): current user input
      - history (list of {role, content}, optional): conversation history
      - system_prompt (string, optional): custom instructions for chatbot
    Returns:
      - reply (string): the AI assistant's response
      - provider (string): active provider name
      - model (string): model name used
    """
    try:
        data = request.get_json(silent=True) or {}
        user_message = data.get("message", "").strip()

        if not user_message:
            return jsonify({"error": "Message content cannot be empty."}), 400

        history = data.get("history", [])
        system_prompt = data.get("system_prompt", "").strip()
        if not system_prompt:
            system_prompt = os.getenv(
                "SYSTEM_PROMPT",
                "You are a helpful, knowledgeable, and polite AI assistant. Provide clear, accurate, and concise answers using markdown when appropriate."
            )

        provider_type, key, model = get_active_provider()

        # 1. Handle Google Gemini
        if provider_type == "gemini":
            try:
                import google.generativeai as genai
                genai.configure(api_key=key)

                # Convert history format to Gemini format
                gemini_history = []
                for turn in history:
                    r = turn.get("role")
                    c = turn.get("content")
                    if c and isinstance(c, str):
                        mapped_role = "user" if r == "user" else "model"
                        gemini_history.append({"role": mapped_role, "parts": [c]})

                gemini_model = genai.GenerativeModel(
                    model_name=model,
                    system_instruction=system_prompt
                )

                reply_text = None
                for attempt in range(2):
                    try:
                        chat_session = gemini_model.start_chat(history=gemini_history)
                        response = chat_session.send_message(user_message)
                        reply_text = response.text
                        break
                    except Exception as err:
                        if ("429" in str(err) or "ResourceExhausted" in str(err)) and attempt == 0:
                            logging.warning("Gemini free quota momentary limit reached. Auto-waiting 2.5s and retrying...")
                            time.sleep(2.5)
                            continue
                        raise err

                return jsonify({
                    "reply": reply_text,
                    "provider": "Google Gemini",
                    "model": model,
                    "is_demo": False
                })
            except Exception as e:
                logging.error(f"Gemini API error: {str(e)}", exc_info=True)
                raise e

        # 2. Handle Groq or OpenAI via OpenAI SDK
        elif provider_type in ("groq", "openai"):
            from openai import OpenAI
            if provider_type == "groq":
                client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
                provider_display = "Groq"
            else:
                client = OpenAI(api_key=key)
                provider_display = "OpenAI"

            messages = [{"role": "system", "content": system_prompt}]
            for msg in history:
                r = msg.get("role")
                c = msg.get("content")
                if r in ("user", "assistant") and isinstance(c, str) and c.strip():
                    messages.append({"role": r, "content": c})
            messages.append({"role": "user", "content": user_message})

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=1000
            )
            reply_text = response.choices[0].message.content

            return jsonify({
                "reply": reply_text,
                "provider": provider_display,
                "model": model,
                "is_demo": False
            })

        # 3. Handle Demo Mode (no key configured)
        else:
            logging.info("Generating response in Demo Mode (no API key configured).")
            lower_msg = user_message.lower()
            if "hello" in lower_msg or "hi" in lower_msg:
                mock_reply = "Hello! 👋 I am your AI Chatbot running for the **XICTEK Systems Internship Day 1 Task**.\n\nAsk me anything! Conversation history and markdown rendering are fully enabled."
            elif "who are you" in lower_msg or "what are you" in lower_msg:
                mock_reply = "I am a basic AI chatbot built for the **XICTEK Systems AI Internship Day 1 Task**! I support conversation history, markdown rendering, system personas, and multi-model backends."
            elif "name" in lower_msg and any("name is" in item.get("content", "").lower() for item in history):
                found_name = "Alex"
                for item in history:
                    c = item.get("content", "")
                    if "name is" in c.lower():
                        found_name = c.split("name is")[-1].strip().rstrip(".")
                mock_reply = f"Based on our conversation history, your name is **{found_name}**! 🧠 Multi-turn conversation history is functioning properly."
            else:
                mock_reply = (
                    f"✨ **[Demo Mode Response]**\n\n"
                    f"Received: *\"{user_message}\"*\n\n"
                    f"Current conversation context has **{len(history)} previous turn(s)**.\n\n"
                    f"> **Tip**: To switch to live LLM generation, set your API key in `.env`!"
                )

            return jsonify({
                "reply": mock_reply,
                "provider": "Demo Mode",
                "model": model,
                "is_demo": True
            })

    except Exception as e:
        err_msg = str(e)
        logging.error(f"Error processing chat request: {err_msg}", exc_info=True)
        provider_type, _, _ = get_active_provider()
        
        if "429" in err_msg or "ResourceExhausted" in err_msg:
            if provider_type == "gemini":
                return jsonify({
                    "error": "Gemini Rate Limit (429)",
                    "details": "Gemini free tier has a limit of 5 requests per minute. Please wait 10 seconds and try again!"
                }), 429
            else:
                return jsonify({
                    "error": "OpenAI API Quota Exceeded (429)",
                    "details": "Your OpenAI account has no credits remaining. Please check your OpenAI billing or use Google Gemini or Groq."
                }), 429
                
        return jsonify({
            "error": "Failed to generate AI response.",
            "details": err_msg
        }), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print("=" * 60)
    print(f"[*] AI Chatbot server running at: http://127.0.0.1:{port}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=True)
