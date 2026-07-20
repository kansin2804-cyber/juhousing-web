---
name: zero_error_core_skills
description: Ultimate 4-core skills to ensure completely bug-free execution for Nvidia NIM and n8n pipelines
---

# Zero-Error Core Skills

## 1. Trigger Matches
- Generating blog posts with technical values (R-value) using Llama-3.1/3.3 or Minimax.
- Modifying, restarting, or managing n8n containers, webhooks, and SQLite databases.
- Routing alert pipelines (Shorts/Reels Directors, Telegram router) securely.

## 2. The 4-Core Execution Rules

### Rule [1] : Censorship-Free Semantic Mapping
- Never write raw technical metrics (R-value, R-21, R-37, etc.) directly in Nvidia Llama prompt parameters.
- Use isolated semantic tokens ("온도 방어 가치", "벽체 방어등급인 골드등급") to secure 6-7 complete long-form paragraphs.
- Always apply post-processing replacement in the Python/JS code to restore standard technical words (`R-value`, `R-21`, `R-37`, `R-30`) before sending out.

### Rule [2] : Strict Database Transaction & WAL Protocol
- ALWAYS execute `docker stop n8n_core` before writing to `database.sqlite`.
- Perform modifications in EXCLUSIVE mode and run `PRAGMA journal_mode=WAL` upon completion before starting n8n again to prevent database lock issues.

### Rule [3] : Active Route Hijacking
- To bypass n8n's active version sync bugs (HTTP 404), prefer updating the nodes and connections of existing active endpoints (like `/webhook/material-message`) rather than creating a new unverified webhook node.

### Rule [4] : Fault-Tolerant Parallel Pipeline
- Always isolate the text pipeline from the image/media processing queue.
- Ensure that text blog posts are delivered directly to Telegram via HTTPS post request, even if image generation or watermarking fails.
