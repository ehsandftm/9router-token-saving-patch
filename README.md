# ⚡ 9Router Token Saving Patch (v1.1.0)

> **A zero-dependency, 1-line self-healing patch for [9Router](https://github.com/decolua/9router) that eliminates ~2,800+ phantom token overhead per request, fixes Claude Code / Claude Desktop payload crashes, and prevents HTTP 500 syntax errors.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Zero Config](https://img.shields.io/badge/Credentials-100%25%20Clean%20%26%20Safe-success.svg)](https://github.com/ehsandftm/9router-token-saving-patch)

---

## 📖 Plain English Summary (What Does This Do?)

If you use **9Router** as a local AI proxy with Claude Desktop, Claude Code, or Cursor, you may have noticed three critical issues:

1. **Massive Token Inflation**: Even a 1-word message like `"Hi"` burns **~2,800 to 3,200+ input tokens** on every single turn.
2. **Claude Desktop / Claude Code Errors**: Fallback models often fail with:
   `API Error: API returned an empty or malformed response (HTTP 200)`
3. **Random HTTP 500 Crashes**: Corrupted minified JS syntax in 9Router's internal chunks causes unexpected startup and request crashes.

This repository provides a **1-line, credential-free patch** that modifies only 9Router's local engine chunks. It fixes the bugs at the source, drops prompt token usage by up to **99.7%**, and ensures 100% wire compatibility with the official Anthropic API.

---

## 📊 Token Savings Benchmark

### 1. Live Measurement (Before vs. After Fix)

We sent the single word prompt `"Hi"` to each endpoint and measured the reported usage:

| Model / Endpoint Category | Input Tokens Before Fix | Input Tokens After Fix | Token Reduction |
| :--- | :--- | :--- | :--- |
| `Claude Opus 4.6 / 5` | **3,233 tokens** | **9 tokens** | **-99.7%** (saved 3,224 tokens) |
| `Gemini Flash 2.5 / 3.x` | **2,839 tokens** | **130 tokens** | **-95.4%** (saved 2,709 tokens) |
| `Local Qwen / Llama (27B/70B)` | **2,874 tokens** | **137 tokens** | **-95.2%** (saved 2,737 tokens) |

---

### 2. Representative Context Token Breakdown (Agentic Workspace Harness)

The following table illustrates a representative real-world test harness context breakdown for an agentic workspace (e.g., active MCP servers, persistent memory rules, skills, and subagent tools):

| Context Layer / Component | Reserved Tokens | % of 1M Window | Details / Item Count |
| :--- | :--- | :--- | :--- |
| **System tools** | **20.9k** | 2.1% | Core agent execution tools |
| **Memory files** | **11.6k** | 1.2% | 10 persistent memory / rule files |
| **MCP tools** | **8k** | 0.8% | 45 MCP tools across active servers |
| **System prompt** | **7.5k** | 0.8% | Core agent operating instructions |
| **Skills** | **5.4k** | 0.5% | Domain expertise & customization skills |
| **Custom agents** | **346** | <0.1% | 4 subagent configurations |
| **Autocompact buffer** | **33k** | 3.3% | Context sliding & compression safety buffer |
| **Total Used Context** | **~86.7k** | **8.7%** | Active context footprint |
| **Free Remaining Context** | **~913.3k** | **91.3%** | Available conversation headspace |
| **Total Context Window** | **1,000,000 (1M)** | **100%** | Full agentic workspace window |

---

## 🚀 Quick Start (1-Line Installation)

Run any of the following one-liners in your terminal. The script automatically detects your global 9Router installation, displays the detected version, backs up original files, and applies all fixes.

### Option A: NPX (Universal — Windows, macOS, Linux)
```bash
npx 9router-token-saving-patch
```

### Option B: PowerShell (Windows)
```powershell
irm https://raw.githubusercontent.com/ehsandftm/9router-token-saving-patch/main/patch.ps1 | iex
```

### Option C: Bash / Curl (macOS & Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/ehsandftm/9router-token-saving-patch/main/patch.sh | bash
```

---

## ⚙️ Advanced Configuration (Local Model Regex Customization)

By default, the patch matches standard local engines and common open-weight model architectures:
`/(?:ollama|unsloth|vllm|lmstudio|llama\.?cpp|qwen|llama|mistral|deepseek|gemma|phi|local-|openai-compatible-)/i`

For power users who run custom local model endpoints or naming schemes, set the `NINEROUTER_LOCAL_MODELS` environment variable prior to starting 9Router or running the patch:

```bash
# Example: Add custom local model identifier patterns
export NINEROUTER_LOCAL_MODELS="my-custom-model|ollama|qwen|local"
```

---

## 🔬 Technical Deep-Dive: What Caused the Bugs?

For developers, contributors, and auditors, here is the exact breakdown of the 5 root causes in 9Router and how this patch resolves them:

### 1. Hardcoded `+2000` Fake Token Inflation (`318.js` — Module 73483)
- **The Bug**: 9Router's usage serializer contained an explicit modifier function `function g(a)` that artificially added `+2000` to `input_tokens`, `prompt_tokens`, and `total_tokens` on every non-streaming response.
- **The Fix**: Neutralized the function to `function g(a) { return a; }`, eliminating the 2,000 phantom token markup.

### 2. Stripping 40+ Injected Dummy Tool Schemas (`8499.js` — Modules 39536 & 55399)
- **The Bug**: Whenever an incoming request declared tools, 9Router merged **21 fake Antigravity tools** (`browser_subagent`, `replace_file_content`, etc.) and **20 fake Claude tools** (`Task`, `TaskOutput`, `Bash`, `Glob`, etc.) into the outbound payload, burning ~1,500–2,500 extra tokens per request.
- **The Fix**: Emptied dummy arrays (`let x = []` and `let h = []`). Outbound requests now strictly transmit only the real tools requested by your client.

### 3. Universal Anthropic Message Format & Prompt Cache Adapter (`8895.js` — Module 5016)
- **The Bug**: When `/v1/messages` routed requests to non-Anthropic fallback providers (Gemini, Antigravity, OpenCode, Kimi), 9Router returned raw OpenAI completion objects (`{"object":"chat.completion", "choices":[...]}`). Claude Desktop and Claude Code threw `HTTP 200: empty or malformed response` because they expected Anthropic schema (`{"type":"message", "content":[...]}`). Furthermore, upstream prompt cache read tokens (`cache_read_input_tokens`, `cached_tokens`, `prompt_tokens_details.cached_tokens`) were dropped during conversion, registering cached tokens as 100% full input costs.
- **The Fix**: Injected an automatic schema adapter in module `5016` that translates OpenAI completion payloads into valid Anthropic Message objects (`type: "message"`, `role: "assistant"`, `content: [...]`, `stop_reason: "end_turn"`), accurately calculating `input_tokens = Math.max(0, m - k - l)` and preserving `cache_read_input_tokens` and `cache_creation_input_tokens`.

### 4. Transparent Local Model Prompt Stripper (`318.js` & `8895.js` — Modules 32447, 96179, & /v1/messages)
- **The Bug**: Heavy desktop manager instructions, rules, and `<system-reminder>` blocks were transmitted verbatim to local models (Ollama / Unsloth Qwen), imposing massive prompt evaluation compute delays (up to 15,000+ unnecessary tokens per local turn). Empty string or array contents produced after stripping caused downstream schema validation failures or local server errors.
- **The Fix**: Automatically strips `<system-reminder>` blocks from both string and array message contents dispatched to local model endpoints matching standard engines (`ollama`, `unsloth`, `vllm`, `lmstudio`, `llama.cpp`) or open-weight models (`qwen`, `llama`, `mistral`, `deepseek`, `gemma`, `phi`), or custom regex set via `NINEROUTER_LOCAL_MODELS`. Sanitizes empty user contents to `" "` (single space) and prevents empty array content payloads.

### 5. Automatic System Persona Disabling (`data.sqlite`)
- **The Bug**: 9Router's internal database had `cavemanEnabled: true` and `ponytailEnabled: true` active by default, prepending ~780 tokens of unsolicited persona rules into every prompt.
- **The Fix**: Creates a backup (`data.sqlite.bak`) and sets `cavemanEnabled: false` and `ponytailEnabled: false` in the `settings` table using `node:sqlite` or system `sqlite3` CLI.

---

## 🛠️ CLI Flags & Usage Commands

```bash
# Apply optimizations & backups
node patch.js

# Check patch & SQLite status without modifying files
node patch.js --status  # (or -s)

# Revert all chunk files and data.sqlite to original backups
node patch.js --revert  # (or -r)
```

---

## 🛡️ Safety, Privacy & Reversibility Guarantees

- **100% Credential-Free**: This patch does **not** read, store, or transmit your API keys, OAuth tokens, account credentials, or chat prompts.
- **Version Verification**: Reads 9Router's `package.json` to log installation details and verify chunk compatibility.
- **Automatic Backups & Safe Rollback**: Creates `.bak` copies of original chunk files and `data.sqlite` before applying modifications. Upstream unpatched files automatically update `.bak` if 9Router is reinstalled or updated.
- **Full Rollback Support**: Revert to vanilla 9Router at any time by running:
  ```bash
  node patch.js --revert
  ```
- **Strict Error Validation**: If a required chunk or signature is missing or unsupported, `patch.js` aborts with detailed diagnostics and exit code 1, preventing false success reports.

---

## ❓ Frequently Asked Questions (FAQ)

#### Do I need to restart 9Router after patching?
Yes. After running `patch.js` (or `npx 9router-token-saving-patch`), you must restart the 9Router process for the updated chunks and SQLite settings to take effect.

#### Do I need to re-run the patch after updating 9Router?
Yes. Running `npm update -g 9router` replaces the chunk files with fresh upstream builds. Simply re-run `npx 9router-token-saving-patch` after updating to re-apply the optimizations.

#### Does this change my model combos or routing rules?
No. Your combos, API keys, and custom routes remain untouched.


---

## ☕ Support the Project / حمایت از پروژه

If you find this project useful, you can support its development:

اگر این پروژه برات مفید بوده، می‌تونی برای حمایت از توسعه اون کمک کنی:

### 💰 TRON (TRC20)
**TFJ6ucBpZ6KghntTq9W3eadnN8gPCqgF3T**


- **Network:** TRON (TRC20)  
- **Supported:** TRX / USDT (TRC20)

🙏 Your support helps keep this project active and continuously improving.  
🙏 حمایت شما باعث ادامه و پیشرفت پروژه خواهد شد.

---

*Developed with ❤️ for a free and stable internet.*
حقوق معنوی این نرم افزار برای من محفوظ می باشد.


---

## 📄 License
MIT License. Created for the AI developer and agentic coding community by [ehsandftm](https://github.com/ehsandftm).
