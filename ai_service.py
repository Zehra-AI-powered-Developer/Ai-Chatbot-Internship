"""
AI Provider Service Layer
XICTEK Systems Internship - Day 2 & Day 3 Production Architecture

Supports:
- Google Gemini (using modern 2026 `google-genai` SDK)
- Groq (Llama-3 models via OpenAI SDK)
- OpenAI (GPT-4o-mini / GPT-4o)
- Demo Mode (Zero-config intelligent mock assistant)
- Synchronous & Server-Sent Events (SSE) Streaming
- Automatic Retry with Exponential Backoff
- Structured Persona Engineering
"""

import os
import time
import json
import logging
from typing import Generator, Dict, Any, List
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Predefined System Personas
PERSONAS: Dict[str, Dict[str, str]] = {
    "helpful": {
        "name": "Helpful Assistant",
        "description": "General-purpose AI assistant providing structured, polite, and helpful guidance.",
        "prompt": (
            "You are a helpful, knowledgeable, and polite AI assistant. "
            "Provide clear, accurate, and concise answers. Format responses with clean markdown, "
            "bullet points, and bold text where appropriate to maximize readability."
        )
    },
    "coder": {
        "name": "Senior Software Architect",
        "description": "Principal engineer specialized in clean architecture, bug fixing, and best practices.",
        "prompt": (
            "You are a Principal Full-Stack Software Engineer and System Architect. "
            "Provide concise, modular, production-ready code with explanatory comments. "
            "Always wrap code in fenced markdown blocks with the correct language tag. "
            "Highlight potential edge cases, time/space complexity, and architecture tradeoffs."
        )
    },
    "tutor": {
        "name": "AI Technical Mentor",
        "description": "Patient computer science mentor who breaks down complex topics step-by-step.",
        "prompt": (
            "You are an inspiring and supportive Technical Educator and CS Mentor. "
            "Break down difficult computer science, programming, or AI concepts into intuitive, "
            "step-by-step explanations using relatable real-world analogies. "
            "Conclude with a brief check for understanding or an interactive question."
        )
    },
    "analyst": {
        "name": "Executive Research Analyst",
        "description": "Data-oriented analyst delivering structured summaries and actionable insights.",
        "prompt": (
            "You are a Senior Strategic Research Analyst. "
            "Deliver structured executive summaries, key bulleted findings, risks, and actionable recommendations. "
            "Avoid conversational fluff. Use clear headers and concise metric-driven assessments."
        )
    },
    "creative": {
        "name": "Creative Thinker & Writer",
        "description": "Imaginative collaborator for storytelling, copywriting, and ideation.",
        "prompt": (
            "You are an imaginative creative director and writer. "
            "Provide engaging, expressive, and vivid ideas, stories, and copy with original perspective "
            "and emotional resonance."
        )
    }
}


def get_active_provider_config() -> tuple[str, str | None, str]:
    """
    Detect configured AI provider and appropriate model from environment.
    Priority:
      1. Google Gemini (GEMINI_API_KEY)
      2. Groq (GROQ_API_KEY)
      3. OpenAI (OPENAI_API_KEY)
      4. Demo Mode (no key configured)
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    custom_model = os.getenv("AI_MODEL", "").strip()

    # Priority 1: Google Gemini
    if gemini_key and not gemini_key.startswith("your_") and not gemini_key.startswith("AIzaSy_your"):
        # gemini-3.5-flash-lite provides high speed and reliability on free/dev tier
        return "gemini", gemini_key, custom_model or "gemini-3.5-flash-lite"

    # Priority 2: Groq
    if groq_key and not groq_key.startswith("gsk_your"):
        return "groq", groq_key, custom_model or "llama-3.3-70b-versatile"

    # Priority 3: OpenAI
    if openai_key and not openai_key.startswith("your_"):
        return "openai", openai_key, custom_model or "gpt-4o-mini"

    # Priority 4: Demo Mode
    return "demo", None, "demo-assistant"


def resolve_system_prompt(persona_key: str, custom_prompt: str = "") -> str:
    """Resolve active system prompt incorporating selected persona and custom instructions."""
    if custom_prompt and custom_prompt.strip():
        base_prompt = custom_prompt.strip()
    else:
        persona_info = PERSONAS.get(persona_key, PERSONAS["helpful"])
        base_prompt = persona_info["prompt"]

    # Append formatting instructions
    instructions = (
        f"{base_prompt}\n\n"
        "Guidelines:\n"
        "- Format technical code in fenced markdown blocks with the appropriate language identifier.\n"
        "- Keep answers clear, well-structured, and helpful.\n"
        "- When referencing past discussion points, maintain coherent context."
    )
    return instructions


class AIService:
    """Production AI Service managing LLM completions and streaming."""

    @staticmethod
    def generate_chat_reply(
        history: List[Dict[str, str]],
        message: str,
        persona: str = "helpful",
        custom_prompt: str = ""
    ) -> Dict[str, Any]:
        """
        Generate complete AI reply synchronously.
        Includes automated retry with backoff on rate limits.
        """
        provider, api_key, model = get_active_provider_config()
        system_prompt = resolve_system_prompt(persona, custom_prompt)
        start_time = time.time()

        # 1. Google Gemini
        if provider == "gemini":
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)

                # Build Gemini format history
                gemini_history = []
                for turn in history:
                    r = "user" if turn.get("role") == "user" else "model"
                    c = turn.get("content", "")
                    if c:
                        gemini_history.append({"role": r, "parts": [{"text": c}]})

                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.7,
                )

                reply_text = None
                last_err = None

                # Retry loop for rate limits or transient errors
                for attempt in range(3):
                    try:
                        chat_session = client.chats.create(
                            model=model,
                            history=gemini_history,
                            config=config
                        )
                        res = chat_session.send_message(message)
                        reply_text = res.text
                        break
                    except Exception as err:
                        last_err = err
                        err_str = str(err)
                        if "503" in err_str or "UNAVAILABLE" in err_str:
                            # Try fallback model if gemini model is experiencing high demand
                            if model != "gemini-3.5-flash-lite":
                                logger.warning(f"Gemini {model} unavailable, falling back to gemini-3.5-flash-lite...")
                                model = "gemini-3.5-flash-lite"
                                continue
                        if "429" in err_str or "ResourceExhausted" in err_str:
                            backoff = (attempt + 1) * 2
                            logger.warning(f"Gemini rate limit reached (429). Retrying in {backoff}s...")
                            time.sleep(backoff)
                            continue
                        raise err

                if reply_text is None:
                    raise last_err or Exception("Failed to generate response after retries.")

                latency_ms = int((time.time() - start_time) * 1000)
                return {
                    "reply": reply_text,
                    "provider": "Google Gemini",
                    "model": model,
                    "is_demo": False,
                    "latency_ms": latency_ms
                }

            except Exception as e:
                logger.error(f"Gemini error: {e}", exc_info=True)
                raise e

        # 2. OpenAI or Groq
        elif provider in ("openai", "groq"):
            from openai import OpenAI
            base_url = "https://api.groq.com/openai/v1" if provider == "groq" else None
            provider_label = "Groq" if provider == "groq" else "OpenAI"

            client = OpenAI(api_key=api_key, base_url=base_url)

            messages = [{"role": "system", "content": system_prompt}]
            for turn in history:
                r = turn.get("role")
                c = turn.get("content", "")
                if r in ("user", "assistant") and c:
                    messages.append({"role": r, "content": c})
            messages.append({"role": "user", "content": message})

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=1500
            )
            reply_text = response.choices[0].message.content
            latency_ms = int((time.time() - start_time) * 1000)

            return {
                "reply": reply_text,
                "provider": provider_label,
                "model": model,
                "is_demo": False,
                "latency_ms": latency_ms
            }

        # 3. Demo Mode Fallback
        else:
            time.sleep(0.3) # Simulate realistic network latency
            reply_text = AIService._generate_demo_reply(message, history, persona)
            latency_ms = int((time.time() - start_time) * 1000)

            return {
                "reply": reply_text,
                "provider": "Demo Assistant",
                "model": "demo-v1",
                "is_demo": True,
                "latency_ms": latency_ms
            }

    @staticmethod
    def generate_chat_stream(
        history: List[Dict[str, str]],
        message: str,
        persona: str = "helpful",
        custom_prompt: str = ""
    ) -> Generator[str, None, None]:
        """
        Generate streaming tokens via Server-Sent Events (SSE).
        Yields lines formatted as `data: {JSON}\n\n`.
        """
        provider, api_key, model = get_active_provider_config()
        system_prompt = resolve_system_prompt(persona, custom_prompt)

        # 1. Google Gemini Streaming
        if provider == "gemini":
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)

                gemini_history = []
                for turn in history:
                    r = "user" if turn.get("role") == "user" else "model"
                    c = turn.get("content", "")
                    if c:
                        gemini_history.append({"role": r, "parts": [{"text": c}]})

                config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.7
                )

                chat_session = client.chats.create(
                    model=model,
                    history=gemini_history,
                    config=config
                )

                full_reply = []
                for chunk in chat_session.send_message_stream(message):
                    chunk_text = chunk.text
                    if chunk_text:
                        full_reply.append(chunk_text)
                        payload = json.dumps({"chunk": chunk_text, "done": False})
                        yield f"data: {payload}\n\n"

                complete_text = "".join(full_reply)
                final_payload = json.dumps({
                    "done": True,
                    "provider": "Google Gemini",
                    "model": model,
                    "full_reply": complete_text,
                    "is_demo": False
                })
                yield f"data: {final_payload}\n\n"
                return

            except Exception as e:
                logger.error(f"Gemini streaming error: {e}", exc_info=True)
                err_payload = json.dumps({"error": str(e), "done": True})
                yield f"data: {err_payload}\n\n"
                return

        # 2. OpenAI / Groq Streaming
        elif provider in ("openai", "groq"):
            try:
                from openai import OpenAI
                base_url = "https://api.groq.com/openai/v1" if provider == "groq" else None
                provider_label = "Groq" if provider == "groq" else "OpenAI"

                client = OpenAI(api_key=api_key, base_url=base_url)

                messages = [{"role": "system", "content": system_prompt}]
                for turn in history:
                    r = turn.get("role")
                    c = turn.get("content", "")
                    if r in ("user", "assistant") and c:
                        messages.append({"role": r, "content": c})
                messages.append({"role": "user", "content": message})

                stream = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=1500,
                    stream=True
                )

                full_reply = []
                for chunk in stream:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        full_reply.append(delta)
                        payload = json.dumps({"chunk": delta, "done": False})
                        yield f"data: {payload}\n\n"

                final_payload = json.dumps({
                    "done": True,
                    "provider": provider_label,
                    "model": model,
                    "full_reply": "".join(full_reply),
                    "is_demo": False
                })
                yield f"data: {final_payload}\n\n"
                return

            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                err_payload = json.dumps({"error": str(e), "done": True})
                yield f"data: {err_payload}\n\n"
                return

        # 3. Demo Mode Streaming
        else:
            demo_text = AIService._generate_demo_reply(message, history, persona)
            words = demo_text.split(" ")
            for i, word in enumerate(words):
                time.sleep(0.02)
                chunk_piece = word + (" " if i < len(words) - 1 else "")
                payload = json.dumps({"chunk": chunk_piece, "done": False})
                yield f"data: {payload}\n\n"

            final_payload = json.dumps({
                "done": True,
                "provider": "Demo Assistant",
                "model": "demo-v1",
                "full_reply": demo_text,
                "is_demo": True
            })
            yield f"data: {final_payload}\n\n"

    @staticmethod
    def _generate_demo_reply(user_message: str, history: List[Dict[str, str]], persona: str) -> str:
        """Intelligent contextual mock responder for demo & testing without API keys."""
        lower_msg = user_message.lower().strip()

        # Check name memory in history
        found_name = None
        for item in history:
            c = item.get("content", "")
            if "name is " in c.lower():
                found_name = c.split("name is ")[-1].strip().split()[0].rstrip(".,!")

        if found_name and any(kw in lower_msg for kw in ("my name", "who am i", "remember me")):
            return (
                f"Based on our previous messages in this conversation, your name is **{found_name}**! 🧠\n\n"
                f"Multi-turn conversational memory and context sliding window are functioning properly."
            )

        if any(kw in lower_msg for kw in ("hello", "hi", "hey")):
            return (
                f"Hello! 👋 I am your AI Chatbot configured as **{PERSONAS.get(persona, {}).get('name', 'Assistant')}**.\n\n"
                f"I am ready to assist you. All Day 2 & Day 3 features including **SQLite persistence**, "
                f"**Markdown formatting**, **Sliding-window context**, and **Voice I/O** are active!"
            )

        if "python" in lower_msg or "code" in lower_msg or "function" in lower_msg:
            return (
                "Here is an example Python implementation demonstrating clean, modular design:\n\n"
                "```python\ndef is_palindrome(text: str) -> bool:\n"
                "    \"\"\"Check if a string reads the same forwards and backwards.\"\"\"\n"
                "    clean = ''.join(c.lower() for c in text if c.isalnum())\n"
                "    return clean == clean[::-1]\n\n"
                "# Example Usage:\n"
                "assert is_palindrome('A man, a plan, a canal: Panama') == True\n"
                "print('Palindrome test passed!')\n```\n\n"
                "Features demonstrated: Type annotations, docstring documentation, and case-insensitive normalization."
            )

        return (
            f"✨ **[Demo Mode Response]**\n\n"
            f"Received: *\"{user_message}\"*\n\n"
            f"- **Active Persona:** `{PERSONAS.get(persona, {}).get('name', 'Helpful Assistant')}`\n"
            f"- **Context Depth:** `{len(history)}` past message turn(s) preserved in memory.\n\n"
            f"> **Production Note:** To connect live LLM backends (Google Gemini, Groq, or OpenAI), "
            f"configure your API key in the `.env` file."
        )
