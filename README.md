# LLM Agent POC (Browser-based, Multi-Tool Reasoning)

A tiny **browser-only** JavaScript agent that chats with an LLM **and** can call tools:
- **Google Search** via Google Custom Search JSON API (requires your `GOOGLE_API_KEY` & `CSE_ID`)
- **AI Pipe proxy API** (configurable base URL & optional token)
- **Sandboxed JS execution** via a Web Worker

The agent uses **OpenAI-style tool calling**: the model asks for tools by name with JSON args; the app executes the tool, returns the result as a `tool` message, and loops until the model stops asking for more tools.

> Built to the assignment brief: browser-based agent, model picker, OpenAI tool calls, graceful errors (Bootstrap alerts), minimal & hackable code. fileciteturn5file0

---

## Run locally
1. Download/clone this repo.
2. Start a simple static server (to avoid browser CORS quirks):
   ```bash
   python -m http.server 8000
   ```
3. Open http://127.0.0.1:8000 in your browser and load `index.html`.

> No backend server is required. All calls happen from your browser using the keys you provide in the config panel.

## Required keys (you paste them in the page)
- **OpenAI API Key** (for LLM chat/tool-calls)
- **Google Search**: `GOOGLE_API_KEY` and `CSE_ID` (for snippets)
- **AI Pipe** (optional): base URL and token

## Notes
- This is a **POC**. Keys are held only in memory in your browser/tab. Do not deploy with hard-coded keys.
- Tool loop is capped to avoid infinite cycles. See `MAX_TOOL_LOOPS` in `main.js`.
- If you don’t have Google CSE keys, you can disable the tool or let the model proceed without it.

## Files
- `index.html` – UI (Bootstrap), config, chat window.
- `main.js` – Agent loop, tool schemas, OpenAI call, tool handlers.
- `worker.js` – Sandboxed JS evaluation (Web Worker).
- `styles.css` – Small CSS overrides.
