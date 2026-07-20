---
name: n8n_database_integrity_keeper
description: n8n SQLite Database lock prevention and active version mapping auto-alignment skill
---

# n8n Database Integrity Keeper

## 1. Trigger Matches
- Modifying, updating, activating, or retrieving n8n workflows directly via sqlite3.
- Resolving HTTP 404 "Active version not found" or HTTP 500 "Database locked" errors.

## 2. Core Instructions
- **Container Control**: ALWAYS stop `n8n_core` container before modifying the database. Modify query in EXCLUSIVE transaction state, then start the container.
- **Active Version Alignment**: When updating `workflow_entity` directly, ensure `activeVersionId` column matches the newly generated `versionId` (UUID) exactly to prevent n8n from throwing 404 active version errors.
- **Journal Mode Restoration**: Set `PRAGMA journal_mode=DELETE` during exclusive writes, and restore to `PRAGMA journal_mode=WAL` upon completion to guarantee database read/write concurrency.
