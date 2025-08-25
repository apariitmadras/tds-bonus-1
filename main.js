// ====== Minimal Browser LLM Agent (OpenAI tool-calling) ======

// UI helpers
const el = (id) => document.getElementById(id);
const chatBody = el('chatBody');
const alerts = el('alerts');

function alertBox(kind, msg) {
  const div = document.createElement('div');
  div.className = `alert alert-${kind} alert-dismissible fade show`;
  div.role = 'alert';
  div.innerHTML = `${msg}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  alerts.appendChild(div);
  // Auto-dismiss after 6s
  setTimeout(() => div.remove(), 6000);
}

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function addToolBubble(name, obj) {
  const pre = document.createElement('pre');
  pre.className = 'bubble tool';
  pre.textContent = `${name} →\n` + JSON.stringify(obj, null, 2);
  chatBody.appendChild(pre);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// ====== Tool schemas (OpenAI-style) ======
const toolSchemas = [
  {
    type: "function",
    function: {
      name: "google_search",
      description: "Search Google (CSE) and return a list of {title, link, snippet}",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query text" },
          top_k: { type: "number", description: "Max results to return (1-10)", default: 5 }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ai_pipe",
      description: "Call an AI Pipe proxy endpoint with JSON input; returns JSON output",
      parameters: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "Endpoint path, e.g., /v1/run" },
          payload: { type: "object", description: "JSON payload to send" },
          method: { type: "string", enum: ["GET", "POST"], default: "POST" }
        },
        required: ["endpoint"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "js_eval",
      description: "Securely run JavaScript code in a sandbox and return console output + result",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code to execute" },
          timeout_ms: { type: "number", description: "Max execution time", default: 2000 }
        },
        required: ["code"]
      }
    }
  }
];

// ====== Tool implementations ======
async function doGoogleSearch({ query, top_k = 5 }) {
  const key = el('googleKey').value.trim();
  const cx = el('googleCx').value.trim();
  if (!key || !cx) {
    throw new Error("Google API Key and CSE ID required for google_search");
  }
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('q', query);
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('num', Math.min(10, Math.max(1, Number(top_k) || 5)));
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error(`Google CSE error: ${resp.status}`);
  const data = await resp.json();
  const items = (data.items || []).map(it => ({
    title: it.title, link: it.link, snippet: it.snippet
  }));
  return items;
}

async function doAIPipe({ endpoint, payload = {}, method = "POST" }) {
  const base = el('aipipeBase').value.trim();
  if (!base) throw new Error("AI Pipe base URL not set");
  const token = el('aipipeToken').value.trim();
  const url = base.replace(/\/$/, '') + endpoint;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = token;
  const resp = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(payload) : undefined
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) throw new Error(`AI Pipe error ${resp.status}: ${text}`);
  return json;
}

async function doJsEval({ code, timeout_ms = 2000 }) {
  return await new Promise((resolve, reject) => {
    const worker = new Worker('worker.js');
    const t = setTimeout(() => {
      worker.terminate();
      reject(new Error('js_eval timeout'));
    }, timeout_ms);
    worker.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data);
    };
    worker.onerror = (e) => {
      clearTimeout(t);
      reject(new Error(e.message || 'js_eval error'));
    };
    worker.postMessage({ code });
  });
}

const toolImpl = {
  google_search: doGoogleSearch,
  ai_pipe: doAIPipe,
  js_eval: doJsEval
};

// ====== Agent loop ======
const systemPrompt = `You are a helpful browser agent. Think step-by-step, and when external info or computation helps,
use the available tools via function calls. Prefer short, clear messages. When done, provide a concise answer.`;

let messages = [{ role: "system", content: systemPrompt }];

const MAX_TOOL_LOOPS = () => Number(el('maxLoops').value || 6);

async function callOpenAI() {
  const model = el('model').value;
  const key = el('openaiKey').value.trim();
  if (!key) throw new Error("OpenAI API key is required");
  const body = {
    model,
    messages,
    tools: toolSchemas,
    tool_choice: "auto",
    temperature: 0.2
  };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const choice = data.choices[0];
  return choice;
}

async function agentTurn(userText) {
  // Add user input
  messages.push({ role: "user", content: userText });
  addBubble('user', userText);

  let loops = 0;
  while (true) {
    const choice = await callOpenAI();
    const msg = choice.message;

    if (msg.content) {
      addBubble('assistant', msg.content);
    }

    if (!msg.tool_calls || !msg.tool_calls.length) {
      messages.push({ role: "assistant", content: msg.content || "" });
      break;
    }

    // Execute tool calls
    for (const tc of msg.tool_calls) {
      const { id, function: fn } = tc;
      const name = fn.name;
      let args = {};
      try { args = JSON.parse(fn.arguments || "{}"); } catch { args = {}; }
      try {
        const result = await toolImpl[name](args);
        addToolBubble(name, result);
        messages.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        const errorPayload = { error: String(err.message || err) };
        addToolBubble(name, errorPayload);
        messages.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify(errorPayload)
        });
      }
    }

    loops += 1;
    if (loops >= MAX_TOOL_LOOPS()) {
      alertBox('warning', 'Reached max tool loops; stopping.');
      messages.push({ role: "assistant", content: "[Stopped after max tool loops]" });
      break;
    }
  }
}

// ====== Form handling ======
document.getElementById('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el('userInput').value.trim();
  el('userInput').value = '';
  try {
    await agentTurn(text);
  } catch (err) {
    alertBox('danger', String(err.message || err));
  }
});