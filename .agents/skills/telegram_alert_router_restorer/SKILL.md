---
name: telegram_alert_router_restorer
description: Skill to recover and isolate Telegram media processing and alert routing crashes
---

# Telegram Alert Router Restorer

## 1. Trigger Matches
- Fetching or sending Telegram media files using n8n Telegram node.
- Troubleshooting "Bad Request: file_id not specified" or API 400 routing crashes on Telegram Router.

## 2. Core Instructions
- **Input Integrity Check**: Always pre-check message payload properties (like `message.photo`) before executing downstream file operations (`Get a file` node).
- **Direct HTTP Fallback**: Avoid n8n credential dependency crashes by routing crucial alert messages directly via HTTPS POST requests to `https://api.telegram.org/bot<token>/sendMessage`.
- **Error Propagation Isolation**: Isolate media workflows from text-only pipelines. Never block blog post body transmission due to image generation or image watermark/aggregation node exceptions.
