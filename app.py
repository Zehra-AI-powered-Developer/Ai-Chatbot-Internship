"""
AI Chatbot - Full Stack Application Server
XICTEK Systems Internship - Day 2 & Day 3 Production Architecture

Features:
- Multi-provider AI Integration: Google Gemini (2026 google-genai), Groq, OpenAI
- Real-time Server-Sent Events (SSE) Token Streaming & Synchronous Fallback
- Persistent Multi-Session Conversation Storage (SQLite WAL Mode)
- Sliding-Window Context & Memory Management
- Strict Input Validation, Sanitization, and IP Rate Limiting
- Custom Personas & System Prompt Engineering
- Full Markdown Rendering & Syntax Highlighting
- Voice Input (STT) & Voice Output (TTS) Support
- Conversation Export (Markdown & JSON)
"""

import os
import io
import json
import logging
from datetime import datetime, timezone
from flask import Flask, request, jsonify, Response, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv

import database as db
from ai_service import AIService, PERSONAS, get_active_provider_config
from utils import (
    validate_chat_request,
    build_sliding_window_context,
    rate_limiter,
    MAX_MESSAGE_LENGTH
)

# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ChatbotApp")

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

app = Flask(__name__, static_folder="static")
CORS(app)


# -------------------------------------------------------------
# Static Web UI Routes
# -------------------------------------------------------------

@app.route("/")
def index():
    """Serve the single-page application."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    """Serve static CSS, JS, fonts, and assets."""
    return send_from_directory(app.static_folder, filename)


# -------------------------------------------------------------
# System Status & Metadata Endpoints
# -------------------------------------------------------------

@app.route("/api/status", methods=["GET"])
def get_status():
    """Return backend health, active AI provider, model, and system capabilities."""
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    provider_type, key, model = get_active_provider_config()

    provider_names = {
        "gemini": "Google Gemini",
        "groq": "Groq Cloud (Llama-3)",
        "openai": "OpenAI",
        "demo": "Demo Assistant (Zero-Config)"
    }

    return jsonify({
        "status": "online",
        "provider": provider_names.get(provider_type, "Unknown"),
        "model": model,
        "is_live_key_configured": provider_type != "demo",
        "features": {
            "streaming_sse": True,
            "sqlite_persistence": True,
            "sliding_window_memory": True,
            "voice_io": True,
            "rate_limiting": True,
            "export_formats": ["markdown", "json"]
        },
        "max_message_length": MAX_MESSAGE_LENGTH,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


@app.route("/api/personas", methods=["GET"])
def get_personas():
    """Return available system personas and prompt presets."""
    return jsonify({
        "personas": [
            {
                "id": key,
                "name": data["name"],
                "description": data["description"],
                "prompt": data["prompt"]
            }
            for key, data in PERSONAS.items()
        ]
    })


# -------------------------------------------------------------
# Chat Sessions & History Management (SQLite Persistence)
# -------------------------------------------------------------

@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    """List all stored conversation sessions."""
    sessions = db.get_sessions()
    return jsonify({"sessions": sessions})


@app.route("/api/sessions", methods=["POST"])
def create_session():
    """Create a new chat session."""
    data = request.get_json(silent=True) or {}
    title = data.get("title", "New Conversation").strip() or "New Conversation"
    persona = data.get("persona", "helpful").strip() or "helpful"
    _, _, model = get_active_provider_config()

    session_id = db.create_session(title=title, persona=persona, model=model)
    return jsonify({
        "session_id": session_id,
        "title": title,
        "persona": persona,
        "model": model
    }), 201


@app.route("/api/sessions/<session_id>", methods=["GET"])
def get_session_details(session_id):
    """Retrieve details and full message history for a specific session."""
    session = db.get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    messages = db.get_messages(session_id)
    return jsonify({
        "session": session,
        "messages": messages
    })


@app.route("/api/sessions/<session_id>", methods=["PATCH"])
def update_session_info(session_id):
    """Update title or persona for an existing session."""
    session = db.get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    data = request.get_json(silent=True) or {}
    title = data.get("title")
    persona = data.get("persona")

    db.update_session(session_id, title=title, persona=persona)
    return jsonify({"success": True, "session_id": session_id})


@app.route("/api/sessions/<session_id>", methods=["DELETE"])
def delete_session(session_id):
    """Delete a conversation session and all its messages."""
    deleted = db.delete_session(session_id)
    if not deleted:
        return jsonify({"error": "Session not found."}), 404
    return jsonify({"success": True, "deleted_session_id": session_id})


@app.route("/api/sessions/<session_id>/messages", methods=["DELETE"])
def clear_session_messages(session_id):
    """Clear all messages inside a session while preserving session metadata."""
    session = db.get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    db.clear_session_messages(session_id)
    return jsonify({"success": True, "message": "Chat history cleared."})


# -------------------------------------------------------------
# Main Chat Endpoints (Synchronous & Streaming)
# -------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def chat_sync():
    """
    Standard synchronous chat endpoint.
    Processes request, applies sliding-window memory, persists messages to SQLite,
    and returns full AI response JSON.
    """
    # 1. Rate Limiting Check
    client_ip = request.remote_addr or "127.0.0.1"
    allowed, retry_after = rate_limiter.is_allowed(client_ip)
    if not allowed:
        return jsonify({
            "error": "Too Many Requests",
            "details": f"Rate limit exceeded. Please wait {retry_after} seconds before sending another message."
        }), 429

    # 2. Input Validation
    data = request.get_json(silent=True) or {}
    is_valid, err_msg, cleaned = validate_chat_request(data)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    user_message = cleaned["message"]
    session_id = cleaned["session_id"]
    persona = cleaned["persona"]
    custom_prompt = cleaned["custom_prompt"]

    # 3. Resolve or Create Session
    session = db.get_session(session_id) if session_id else None
    if not session:
        _, _, model_name = get_active_provider_config()
        # Generate initial title from first 6 words of user message
        title_words = user_message.split()[:6]
        title = " ".join(title_words)
        session_id = db.create_session(title=title, persona=persona, model=model_name)

    # 4. Context Window & Persistence
    # Fetch recent history from DB or use client-provided turns
    stored_messages = db.get_messages(session_id, limit=20)
    history_turns = []
    for msg in stored_messages:
        history_turns.append({"role": msg["role"], "content": msg["content"]})

    # If client also passed in-memory history that is not yet in DB, merge safely
    if cleaned["history"] and not history_turns:
        history_turns = cleaned["history"]

    # Apply Sliding Window Memory (Context Limiter)
    context_turns = build_sliding_window_context(history_turns)

    # Save User Message to Database
    db.add_message(session_id=session_id, role="user", content=user_message)

    # 5. Call AI Service
    try:
        response_data = AIService.generate_chat_reply(
            history=context_turns,
            message=user_message,
            persona=persona,
            custom_prompt=custom_prompt
        )

        reply = response_data["reply"]
        provider = response_data["provider"]
        model = response_data["model"]

        # Save Assistant Reply to Database
        db.add_message(
            session_id=session_id,
            role="assistant",
            content=reply,
            provider=provider,
            model=model
        )

        response_data["session_id"] = session_id
        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Chat generation error: {str(e)}", exc_info=True)
        err_str = str(e)
        if "429" in err_str or "ResourceExhausted" in err_str:
            return jsonify({
                "error": "Upstream AI Quota Limit",
                "details": "The AI provider rate limit was reached. Please pause for 10 seconds and retry."
            }), 429
        return jsonify({
            "error": "AI Generation Failed",
            "details": err_str
        }), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """
    Real-time Server-Sent Events (SSE) token streaming endpoint.
    Yields tokens word-by-word / chunk-by-chunk for low latency ChatGPT-style UX.
    """
    client_ip = request.remote_addr or "127.0.0.1"
    allowed, retry_after = rate_limiter.is_allowed(client_ip)
    if not allowed:
        return jsonify({
            "error": "Too Many Requests",
            "details": f"Rate limit exceeded. Please wait {retry_after} seconds before streaming."
        }), 429

    data = request.get_json(silent=True) or {}
    is_valid, err_msg, cleaned = validate_chat_request(data)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    user_message = cleaned["message"]
    session_id = cleaned["session_id"]
    persona = cleaned["persona"]
    custom_prompt = cleaned["custom_prompt"]

    session = db.get_session(session_id) if session_id else None
    if not session:
        _, _, model_name = get_active_provider_config()
        title_words = user_message.split()[:6]
        title = " ".join(title_words)
        session_id = db.create_session(title=title, persona=persona, model=model_name)

    stored_messages = db.get_messages(session_id, limit=20)
    history_turns = [{"role": m["role"], "content": m["content"]} for m in stored_messages]
    if cleaned["history"] and not history_turns:
        history_turns = cleaned["history"]

    context_turns = build_sliding_window_context(history_turns)

    # Save User Message to Database
    db.add_message(session_id=session_id, role="user", content=user_message)

    def event_stream():
        # First send session metadata event
        yield f"data: {json.dumps({'type': 'session_meta', 'session_id': session_id})}\n\n"

        accumulated = []
        final_provider = ""
        final_model = ""

        try:
            for sse_chunk in AIService.generate_chat_stream(
                history=context_turns,
                message=user_message,
                persona=persona,
                custom_prompt=custom_prompt
            ):
                # Inspect final payload to extract complete reply for persistence
                if sse_chunk.startswith("data: "):
                    try:
                        chunk_obj = json.loads(sse_chunk[6:].strip())
                        if chunk_obj.get("chunk"):
                            accumulated.append(chunk_obj["chunk"])
                        if chunk_obj.get("done"):
                            final_provider = chunk_obj.get("provider", "")
                            final_model = chunk_obj.get("model", "")
                    except Exception:
                        pass
                yield sse_chunk

            # Save full assistant reply into DB
            full_text = "".join(accumulated)
            if full_text:
                db.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=full_text,
                    provider=final_provider,
                    model=final_model
                )

        except Exception as err:
            logger.error(f"Streaming generator exception: {err}", exc_info=True)
            yield f"data: {json.dumps({'error': str(err), 'done': True})}\n\n"

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


# -------------------------------------------------------------
# Conversation Export (Markdown & JSON)
# -------------------------------------------------------------

@app.route("/api/export/<session_id>", methods=["GET"])
def export_conversation(session_id):
    """
    Export conversation transcript as either Markdown (.md) or JSON (.json).
    Query parameter: ?format=markdown (default) or ?format=json
    """
    session = db.get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found."}), 404

    messages = db.get_messages(session_id)
    export_format = request.args.get("format", "markdown").lower()

    if export_format == "json":
        export_payload = {
            "session": session,
            "messages": messages,
            "exported_at": datetime.now(timezone.utc).isoformat()
        }
        return jsonify(export_payload)

    # Default: Markdown format
    md_lines = [
        f"# Conversation: {session['title']}",
        f"- **Session ID:** `{session['id']}`",
        f"- **Persona:** {session.get('persona', 'helpful')}",
        f"- **Created At:** {session['created_at']}",
        f"- **Exported At:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "\n---\n"
    ]

    for m in messages:
        sender = "👤 **User**" if m["role"] == "user" else "🤖 **AI Assistant**"
        time_tag = f" *({m.get('created_at', '')})*"
        md_lines.append(f"### {sender}{time_tag}\n\n{m['content']}\n\n---\n")

    md_content = "\n".join(md_lines)
    buffer = io.BytesIO(md_content.encode("utf-8"))
    filename = f"chat_export_{session_id[:8]}.md"

    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="text/markdown"
    )


# -------------------------------------------------------------
# Error Handlers
# -------------------------------------------------------------

@app.errorhandler(404)
def handle_404(e):
    return jsonify({"error": "Resource not found"}), 404


@app.errorhandler(500)
def handle_500(e):
    return jsonify({"error": "Internal Server Error"}), 500


# -------------------------------------------------------------
# Main Application Entry Point
# -------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print("=" * 65)
    print(f"[*] AI Chatbot Production Server: http://127.0.0.1:{port}")
    print("[*] SQLite Database & WAL Persistence: Active")
    print("[*] SSE Real-time Streaming & Voice I/O: Ready")
    print("=" * 65)
    app.run(host="0.0.0.0", port=port, debug=True)
