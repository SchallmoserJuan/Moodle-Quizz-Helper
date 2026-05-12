# Moodle Study Helper

> [🇪🇸 Español](README.md) | **🇬🇧 English**

Chrome Extension (Manifest V3) that helps you study Moodle quizzes using the **Gemini** or **Groq** API (or any OpenAI-compatible provider). **It only displays the suggested answer; it never auto-fills or clicks anything automatically.**

---

## Installation in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Enable **"Developer mode"** (toggle in the top right).
3. Click **"Load unpacked"**.
4. Select the folder containing these files (`manifest.json`, `content.js`, etc.).
5. Done. The extension should appear in your extensions bar.

> **Tip:** Click the pin icon 📌 next to the extension to keep it fixed in the toolbar for quick access.

---

## Configure your API Key

### Option A: Google Gemini
1. Get a free API Key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In the extension options, select **Gemini** as the provider.
3. Paste your Gemini API Key.
4. Choose the model (default: `gemini-2.5-flash`).

### Option B: Groq (faster, open-source models)
1. Get a free API Key at [Groq Console](https://console.groq.com/keys).
2. In the extension options, select **Groq** as the provider.
3. Paste your Groq API Key.
4. Choose the model (default: `openai/gpt-oss-120b`).

### Option C: OpenAI-Compatible (Custom)
Allows you to use **any OpenAI-compatible API**: ChatGPT, Claude (via OpenRouter), DeepSeek, Perplexity, local Ollama, etc.

1. Get your API Key from the service you choose.
2. In the options, select **OpenAI-Compatible (Custom)**.
3. Fill in:
   - **API Key**: your key
   - **Base URL**: the base URL of the API
     - OpenAI: `https://api.openai.com/v1`
     - OpenRouter: `https://openrouter.ai/api/v1`
     - DeepSeek: `https://api.deepseek.com/v1`
     - Local Ollama: `http://localhost:11434/v1`
   - **Model**: exact model name
     - `gpt-4o`, `claude-3-5-sonnet-20241022`, `deepseek-chat`, etc.

> Keys are stored **locally** in your browser (`chrome.storage.local`). They are never sent to any external server.

---

## Available Models

### Gemini
| Model | Speed | Recommended use |
|--------|--------|----------------|
| `gemini-2.5-flash` | Fast | **Default** — Perfect balance |
| `gemini-2.5-pro` | Slow | Maximum quality, more expensive |
| `gemini-2.0-flash` | Fast | Previous model, still useful |
| `gemini-2.0-flash-lite` | Very fast | More economical |

### Groq (verified in [official documentation](https://console.groq.com/docs/models))

**Recommended for academic quizzes (most accurate):**
| Model | Speed | Recommended use |
|--------|--------|----------------|
| `openai/gpt-oss-120b` | 500 t/s | **Default** — Most accurate, with reasoning. Ideal for any subject. |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 750 t/s | Very accurate, new Meta model (preview). |
| `llama-3.3-70b-versatile` | 280 t/s | Good quality/speed balance. |

**Very fast, less accurate:**
| Model | Speed | Recommended use |
|--------|--------|----------------|
| `openai/gpt-oss-20b` | 1000 t/s | Fastest. For very simple questions. |
| `llama-3.1-8b-instant` | 560 t/s | Ultra fast. Only for basic stuff. |

**Others:**
| Model | Speed | Recommended use |
|--------|--------|----------------|
| `qwen/qwen3-32b` | 400 t/s | Alibaba model (preview). |

> To see the updated list at any time: `curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`

---

## Automatic academic area detection

The extension **automatically detects** the area of the question and adds specialized context to the prompt. This greatly improves accuracy in technical subjects.

### Supported areas

| Area | Detected keywords |
|------|--------------------------|
| **Labor Law** | dismissal, severance, notice, S.A.C., bonus, labor contract, LCT |
| **Civil/Commercial Law** | contract, obligations, property, succession, credit title, mortgage |
| **Programming** | javascript, python, java, algorithm, class, inheritance, API, SQL, framework |
| **Networking** | TCP/IP, router, switch, DNS, DHCP, VLAN, VPN, OSPF, BGP, ethernet |
| **Databases** | MySQL, PostgreSQL, MongoDB, NoSQL, JOIN, index, normalization, trigger |
| **Project Management** | PMBOK, agile, scrum, WBS, Gantt, risk, stakeholder, schedule |
| **Accounting** | asset, liability, balance, journal entry, amortization, ROI, EBITDA |
| **Medicine** | diagnosis, treatment, pathology, anatomy, drug, epidemiology |
| **Engineering/Mathematics** | calculus, derivative, matrix, physics, thermodynamics, circuit, signals |

> If the question doesn't match any known area, the extension responds with general knowledge.

### Which model to choose for academic quizzes?

| Priority | Model | Provider | Why |
|-----------|--------|-----------|---------|
| 1° | `gpt-4o` | OpenAI / OpenRouter | **Maximum precision** in any area. Best for law, medicine, engineering. |
| 2° | `claude-3-5-sonnet` | OpenRouter / Anthropic | Very precise, especially for long texts and law. |
| 3° | `openai/gpt-oss-120b` | Groq | Precise, with reasoning. Free and very fast. |
| 4° | `gemini-2.5-pro` | Gemini | Good quality, free with quota limit. |
| 5° | `deepseek-chat` | DeepSeek | Good price/quality balance. |
| 6° | `llama-3.3-70b-versatile` | Groq | Good quality/speed balance. |
| 7° | `openai/gpt-oss-20b` | Groq | 1000 t/s. Only if speed is more important than precision. |

---

## How to use it in Moodle

### Method 1: Double click
**Double click** on any quiz question. The extension will detect the container, extract the text and options, and display the answer in a floating overlay.

### Method 2: Keyboard shortcut
Press `Ctrl + Shift + X` (or `Cmd + Shift + X` on Mac) to solve the question closest to the center of the screen.

### Overlay
- Appears at the top right.
- You can **drag it** from the header.
- **Regenerate** button to force a new API call.
- **Copy** button to copy the answer.
- **Close** button to close the window.
- If you query the same question again, it uses **local cache** to avoid wasting API tokens.

---

## File structure

```
.
├── manifest.json   # MV3 declaration, permissions and commands
├── background.js   # Service worker listening for Ctrl+Shift+X shortcut
├── content.js      # Main logic: detection, extraction, APIs (Gemini + Groq), overlay
├── styles.css      # Overlay styles (modern, minimalist, dark mode)
├── options.html    # Configuration page (API Key and model)
└── options.js      # Save logic in chrome.storage.local
```

---

## Security and privacy

- **No `eval`** or inline scripts.
- **No analytics** or telemetry.
- **No own backend**: everything runs locally except direct calls to `generativelanguage.googleapis.com` (Gemini) or `api.groq.com` (Groq).
- **Minimal permissions**: only `storage` (config and cache) and `activeTab`.
- The content script loads on any page but **only acts if it detects Moodle by DOM**.

---

## Troubleshooting

| Problem | Solution |
|----------|----------|
| "No API Key found" | Go to the extension options and configure your key for the selected provider. |
| "Error contacting Gemini/Groq" | Verify that the key is valid and not expired. Also check your internet connection. |
| "Error 404" (Gemini) | The selected model doesn't exist. Try `gemini-2.5-flash`. |
| "Error 401/403" (Groq) | Your Groq API Key is incorrect or has no permissions. Check at [Groq Console](https://console.groq.com/keys). |
| "Error 429" | You exhausted your free quota. Wait a few minutes or use another provider. |
| The overlay doesn't appear | Make sure you are on a Moodle page. Open the console (F12) and look for `[Moodle Study Helper]` logs. |
| The shortcut doesn't work | Go to `chrome://extensions/shortcuts` and verify that `Ctrl+Shift+X` is assigned. |

---

## Important Notice (Disclaimer)

### Answer accuracy
**Answer accuracy varies significantly depending on the AI model** you choose:
- Larger and more advanced models (like `gpt-4o`, `claude-3-5-sonnet`, `gemini-2.5-pro`) tend to be more accurate.
- Smaller or faster models may make errors, especially in technical or legal subjects.
- **No model has 100% accuracy.** Always verify answers with your study materials.

### No validity guarantee
- This project **does not guarantee the validity, accuracy, or correctness** of any generated answer.
- Answers are generated by third-party AI models (Google, Groq, OpenAI, etc.) over which we have no control.
- **Do not use answers as the sole source of truth** for exams, assignments, or important academic decisions.

### Educational use
- This tool is designed as a **study aid**, not as a method for cheating.
- The goal is to help you **understand the material**, not replace studying.
- Always comply with your institution's academic integrity policies.

### Liability
The authors and contributors of this project **are not responsible** for:
- Incorrect answers resulting in low grades or failure.
- Disciplinary sanctions for misuse in exams or evaluations.
- Any other direct or indirect damage derived from the use of this extension.

---

## License

[MIT License](LICENSE) — Personal/educational use. Modify as needed.
