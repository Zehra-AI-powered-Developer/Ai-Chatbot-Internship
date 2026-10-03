# 🎙️ Day 2 & Day 3 Assessment: Technical Presentation & Viva Cheat-Sheet

Use this guide to walk through your codebase, demonstrate live features, and answer technical architecture questions during your XICTEK Systems internship review.

---

## 1. High-Level Elevator Pitch (45-second summary)

> *"For the Day 2 and Day 3 tasks, I elevated our basic chatbot into a **production-oriented conversational AI platform**. Beyond user input and markdown rendering, I implemented **SQLite session persistence with Write-Ahead Logging (WAL)** so chat histories survive browser refreshes and server reboots. To solve token limits and high inference costs, I built a **sliding-window context manager**. I introduced **real-time Server-Sent Events (SSE) streaming** for instant token generation, defensive guardrails including **sliding-window IP rate limiting** and strict input validation, multimodal **voice speech-to-text (STT) and text-to-speech (TTS)** via the Web Speech API, and upgraded the backend to the modern **2026 Google GenAI SDK** with automated exponential backoff retries."*

---

## 2. Step-by-Step Architecture Walkthrough

### 1. Persistent Storage Layer (`database.py`)
- **Design:** Uses SQLite with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`) and foreign key constraints.
- **Tables:**
  - `sessions`: Stores `id`, `title`, `persona`, `model`, `created_at`, `updated_at`.
  - `messages`: Stores `id`, `session_id`, `role`, `content`, `provider`, `model`, `created_at`.
- **Why this is production-ready:** Unlike naive in-memory arrays or browser `localStorage`, SQLite is server-persisted, ACID-compliant, supports concurrent reads and writes, and enables complete session management (create, switch, rename, clear, delete, export).

### 2. Context Window & Memory Management (`utils.py`)
- **Challenge:** LLM context windows have hard token caps (e.g., 4K - 1M tokens), and passing hundreds of past messages balloons latency and API costs.
- **Solution:** `build_sliding_window_context(history, max_turns=10)`:
  - Keeps the primary **System Prompt** anchored at turn 0.
  - Dynamically retains only the most recent N conversational turns ($N=10$ by default).
  - Sanitizes each turn to ensure alternating `user` and `assistant` dialogue coherence.

### 3. Real-Time Token Streaming (`ai_service.py` & `app.py`)
- **Endpoint:** `POST /api/chat/stream`.
- **Protocol:** Server-Sent Events (SSE) returning `text/event-stream`.
- **Mechanism:**
  - When the user sends a prompt, the server yields `data: {"type": "session_meta", "session_id": "..."}`.
  - As Google Gemini or OpenAI generates tokens, the server streams `data: {"chunk": "token", "done": false}` chunks.
  - When finished, it yields `data: {"done": true, "full_reply": "...", "model": "..."}`.
  - The frontend reads the stream using `ReadableStream` and `TextDecoder`, rendering tokens incrementally with an active typing cursor.
  - Once the stream finishes, the complete reply is saved into the SQLite database.

### 4. Security & Defensive Guardrails (`utils.py`)
- **Sliding-Window Rate Limiter:**
  - `RateLimiter` class tracks timestamps in an in-memory deque per IP address.
  - Rejects rapid bursts ($>35$ requests/minute) with `HTTP 429 Too Many Requests` and a helpful `retry_after` countdown.
- **Input Validation:**
  - Rejects empty, whitespace-only, or missing payloads with `HTTP 400 Bad Request`.
  - Enforces a hard character ceiling ($\le 4000$ characters) to prevent memory exhaustion.

### 5. Multimodal Voice Interaction (`static/script.js`)
- **Voice Input (STT):**
  - Uses the browser's native `SpeechRecognition` / `webkitSpeechRecognition` API.
  - Clicking the microphone button triggers audio capture, displays a pulsing red ripple animation, and inserts transcribed speech directly into the input textarea in real time.
- **Voice Output (TTS):**
  - Integrated with `window.speechSynthesis`.
  - Every AI message bubble features a **"Speak"** action button.
  - Strips code blocks and markdown punctuation to ensure smooth, natural vocal delivery. Clicking again pauses/stops playback.

---

## 3. Live Demo Script (What to Show the Reviewer)

1. **Open the Web UI**: Point out the clean dark interface, the active Google Gemini provider badge, and the session list in the sidebar.
2. **Send a Query & Show Streaming**: Type a question or click a suggestion chip (*"Explain how sliding-window context memory prevents token overflow in LLMs"*). Point out the instantaneous token streaming.
3. **Show Code Block & Markdown Features**: Select the **Senior Software Architect** persona. Ask for a Python script. Show the syntax-highlighted code block, language label, and click **"Copy Code"** to demonstrate clipboard feedback.
4. **Demonstrate Conversation History & Persistence**:
   - Tell the bot: *"My name is Alex and I am testing conversation memory."*
   - In the next message, ask: *"What is my name?"* Show that it remembers.
   - Refresh the browser (`F5`): Point out that the conversation is still present in the sidebar and fully reloaded from SQLite!
5. **Demonstrate Voice I/O**:
   - Click the microphone button and speak a prompt into your headset/mic.
   - Click the **"Speak"** button on the AI response to hear the speech synthesis read the answer.
6. **Show Light Mode & Export**:
   - Toggle to Light Mode using the Sun/Moon icon.
   - Click **Export $\rightarrow$ Markdown** and show the downloaded `.md` transcript file.
7. **Run the Test Suite**: Run `python test_app.py` in the terminal to show all 11 automated unit tests passing with `OK`.

---

## 4. Anticipated Technical Questions & Strong Answers

### Q1: *"What makes this implementation production-oriented rather than just a basic UI?"*
> **Answer:** *"A basic UI simply takes text, passes it to an API, and prints it on screen with no persistence or protection. A production-oriented architecture handles real-world constraints:
> 1. **Persistence:** Data is saved in a server-side SQLite database with WAL mode and multi-session CRUD.
> 2. **Token Economy & Stability:** Sliding-window context pruning prevents hard model token limits from crashing requests.
> 3. **Latency:** SSE token streaming lowers Time-to-First-Byte from several seconds down to milliseconds.
> 4. **Reliability & Resilience:** Exponential backoff retry logic recovers from rate limits (429) and demand spikes (503).
> 5. **Defensive Security:** IP rate limiting and input size validation guard against API abuse."*

### Q2: *"Why did you use SQLite instead of localStorage or PostgreSQL?"*
> **Answer:** *"Client-side `localStorage` is insecure for sensitive session data, cannot be queried or indexed, and is lost if the user clears their cache or switches browsers. PostgreSQL is great for distributed teams, but for an embedded, lightweight, and zero-configuration service, SQLite with Write-Ahead Logging (`WAL`) provides ACID guarantees, blazing fast concurrent reads, zero extra server infrastructure, and persistent relational data."*

### Q3: *"Why did you choose Server-Sent Events (SSE) over WebSockets?"*
> **Answer:** *"WebSockets are bidirectional, which is necessary for multiplayer chat where multiple users talk to each other simultaneously. However, generative AI is inherently unidirectional: the client sends a single prompt, and the server streams back tokens. Server-Sent Events (SSE) operate over standard HTTP, natively support automatic reconnection, work effortlessly through corporate firewalls and HTTP/2 multiplexing, and require significantly less server overhead than maintaining full-duplex WebSocket connections."*

### Q4: *"How did you handle the Gemini SDK deprecation?"*
> **Answer:** *"Google deprecated the older `google.generativeai` package. In this project, I adopted the modern `google-genai` SDK (`from google import genai`), using `client.chats.create()` with `types.GenerateContentConfig(system_instruction=...)` and `chat.send_message_stream()`. I also included model fallback logic so that if a model experiences momentary high demand (503), it automatically recovers without user disruption."*

### Q5: *"How do you protect against API key exposure?"*
> **Answer:** *"API keys are kept strictly on the backend inside `.env` and loaded using `python-dotenv`. The keys are never sent to the browser or embedded in client JS. Furthermore, `.env` and SQLite database files (`*.db`) are explicitly listed in `.gitignore` so secrets are never pushed to the GitHub repository."*
