# 🤖 AI Chatbot — Day 1 Practical Task

> **XICTEK Systems — AI Internship**  
> An end-to-end full-stack AI chatbot featuring multi-turn conversation history, dynamic system personas, modern responsive Web UI, markdown formatting, syntax highlighting, and multi-provider LLM support.

---

## 📌 1. What You Built

This project is a full-stack, responsive AI Chatbot application designed to satisfy and exceed all Day 1 Practical Task requirements:

1. **User Message Handling**: Clean single-page chat interface accepting user prompts via input box or quick-suggestion chips.
2. **AI Model / API Integration**: Universal integration supporting **OpenAI** (`gpt-4o-mini`), **Groq** (`llama-3.3-70b`), and **Google Gemini** (`gemini-1.5-flash`), with a built-in zero-config **Demo Mode** fallback.
3. **Multi-Turn Conversation History**: Persists and transmits prior turns of conversation context (`user` and `assistant` messages) so the model maintains coherent conversational memory.
4. **Custom System Personas**: Dynamic system prompts allowing the user to switch chatbot roles on-the-fly (e.g., *Helpful Assistant*, *Expert Coder*, *Concise*, *Creative*, or *Custom Prompt*).
5. **Modern Web UI & UX**:
   - Clean dark-theme interface with smooth chat bubbles.
   - Real-time animated typing / loading state indicator.
   - Markdown rendering with code syntax highlighting via `marked.js` and `highlight.js`.
   - Clear/New chat functionality and responsive mobile layout.
   - Comprehensive error handling displaying user-friendly alerts instead of silent failures.

---

## 🛠️ 2. Technology Used

- **Backend**:
  - **Python 3** (Flask REST API)
  - **`openai` Python SDK**: Client library for standardized interaction with OpenAI, Groq, and Gemini endpoints.
  - **`python-dotenv`**: Safe loading of API secrets and configurations from `.env`.
  - **`flask-cors`**: Cross-Origin Resource Sharing enablement for API endpoints.
- **Frontend**:
  - **HTML5 & Modern CSS3**: Responsive flexbox layout, CSS variables, dark-mode design system.
  - **Vanilla JavaScript (ES6+)**: State management for conversation history, asynchronous `fetch` API, dynamic DOM updates.
  - **`marked.js`**: Markdown parsing for rich text rendering.
  - **`highlight.js`**: Code block syntax highlighting.
- **Testing & Tooling**:
  - Python `unittest` suite for endpoint and history verification.
  - Git version control with `.gitignore` protection.

---

## 🚀 3. How to Run It

### Step 1: Clone or Navigate to the Repository
```bash
cd "z:\Internship\XICTEK Systems -  HISABDO Internship\Day 1\Ai-Chatbot"
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables
Copy the template file to `.env`:
```bash
cp .env.example .env
```
Open `.env` in any text editor and supply your preferred API key:

```env
# For OpenAI:
OPENAI_API_KEY=sk-your-openai-api-key-here
AI_MODEL=gpt-4o-mini

# OR For Groq (Free & Fast):
# GROQ_API_KEY=gsk_your-groq-api-key-here
# AI_MODEL=llama-3.3-70b-versatile

# OR For Google Gemini:
# GEMINI_API_KEY=AIzaSy_your-gemini-key-here
# AI_MODEL=gemini-1.5-flash
```

*(Note: If you run the app without an API key, it will automatically run in **Demo Mode**, allowing you to test the UI, conversation history, and controls immediately!)*

### Step 4: Run the Application
```bash
python app.py
```

### Step 5: Open in Your Browser
Navigate to:
```
http://127.0.0.1:5000
```

### Running Tests
To run the automated test suite:
```bash
python test_app.py
```

---

## 🔌 4. API Integration Approach

1. **Standardized Client Protocol**:
   The backend leverages the universal OpenAI-compatible client interface. Because Groq, Google Gemini, and OpenAI all support this structure, the chatbot can effortlessly switch providers by pointing to different `base_url` values without rewriting integration logic.

2. **Conversation Context Orchestration**:
   ```
   [System Prompt] ──┐
   [History Turn 1] ─┼──> [Compiled Payload] ──> [LLM Completion API] ──> [Structured Response]
   [History Turn 2] ─┤
   [Current Prompt] ─┘
   ```
   - On each submission, the frontend packages the current `message`, current `system_prompt`, and previous `history` array:
     ```json
     {
       "message": "What is my name?",
       "history": [
         {"role": "user", "content": "My name is Alex."},
         {"role": "assistant", "content": "Hello Alex! How can I assist you today?"}
       ],
       "system_prompt": "You are a helpful AI assistant."
     }
     ```
   - The backend validates the payload, constructs the message thread array with the system prompt at index 0, and sends it to `client.chat.completions.create(...)`.
   - The LLM maintains context across multiple turns without needing server-side database storage.

3. **Graceful Error Handling & Fallbacks**:
   - Catches rate limits, invalid keys, and network timeouts.
   - Returns structured JSON `{ "error": "...", "details": "..." }` with appropriate HTTP status codes.

---

## 💡 5. What You Learned

1. **End-to-End LLM Lifecycle**: Understanding the journey of a prompt from UI capture to HTTP payload construction, API token processing, and client-side rendering.
2. **Context Window Management**: How LLMs are stateless by nature, and how multi-turn conversation memory is implemented by passing structured dialogue arrays.
3. **Security Best Practices**: Ensuring API keys are never hardcoded or exposed in client-side code, keeping secrets strictly within `.env` and enforcing `.gitignore`.
4. **Designing User-Centric AI Interfaces**: The importance of visual feedback (loading dots, disabled button states, markdown syntax rendering) to create responsive, intuitive AI experiences.

---

## 🔮 6. What You Would Improve Next

- **Streaming Responses (SSE)**: Implement Server-Sent Events to stream tokens word-by-word like ChatGPT for lower perceived latency.
- **Persistent Storage**: Save conversation sessions in SQLite or PostgreSQL so chats persist across browser reloads.
- **RAG (Retrieval-Augmented Generation)**: Allow users to upload PDFs or documents for document Q&A.
- **Voice Input & Output**: Integrate Web Speech API (`SpeechRecognition` and `speechSynthesis`) for hands-free voice interaction.
- **Token Counter & Cost Tracker**: Display estimated token consumption and cost per request.

---

## 👥 Presentation & Submission Details

- **Internship**: XICTEK Systems — AI Internship
- **Task**: Day 1 Assessment — Basic AI Chatbot
- **Date**: October 1, 2026
