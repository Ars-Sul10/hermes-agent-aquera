---
name: aquera
description: Operate Aquera shrimp farm ponds, logs, harvests, team, and WhatsApp bot integration.
version: 1.1.0
author: Tony + Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [aquera, shrimp-farming, aquaculture, openapi, farm-management, whatsapp-bot]
    category: operations
    config:
      aquera_base_url:
        description: Base URL of the Aquera API
        default: https://aquera.id/api/v1
      aquera_api_secret:
        description: Secret token for Aquera API authentication (AQUERA_API_SECRET or AQUERA_API_SECRET_KEY)
        secret: true
      aquera_cid:
        description: Default tenant organization CID (auto-resolved per user/group via WhatsApp integration)
---

# Aquera Shrimp Farming Skill

Manage and operate the Aquera smart shrimp farming platform via its OpenAPI 3.1.0 REST API. This skill allows Hermes to read, record, update, and manage shrimp farm data including ponds, farming cycles, seedling stocking, daily feeding logs, water and growth samplings, harvests, sales invoices, team member contacts (including WhatsApp phone numbers), and WhatsApp group integration.

## When to Use

Use this skill when:
- **WhatsApp Inbound Messaging:** Resolving user identity, permissions, and tenant CID automatically from a WhatsApp sender phone number (`GET /user-context?phone=...`).
- **WhatsApp Group Management:** Verifying whether a WhatsApp group is registered to a farm (`GET /whatsapp-groups?group_jid=...`), or linking a group via pairing codes (`POST /whatsapp/link`).
- **Team Management:** Viewing team members with their registered phone numbers (`GET /team`), or updating a member's phone number, role, or designation (`PUT /team` or `PUT /user-context`).
- **Farm Operations & Logging:** Recording daily pond operations: feed distribution (`feed-log`), water quality/growth measurements (`sampling`), or seedling stocking (`stocking`).
- **Farm Setup & Metrics:** Viewing KPI metrics (`summary`), farm sites (`farm-sites`), ponds (`ponds`), feed brands (`feed-brands`), or cycles (`cycles`).
- **Harvest & Invoicing:** Recording harvest batches (`harvest`) or generating buyer invoices (`invoice`).

Do not use this skill for unrelated farm analytics or direct database access without the API layer.

## Prerequisites

- Aquera REST API specification: `./openapi.json`.
- Environment variables or configuration keys:
  - `AQUERA_BASE_URL`: Base API URL (e.g., `https://aquera.id/api/v1`).
  - `AQUERA_API_SECRET` (or `AQUERA_API_SECRET_KEY`): API Secret token sent via `Authorization: Bearer <SECRET>` or `x-api-key`.
  - `AQUERA_CID`: Target organization tenant ID (sent via `x-cid: <CID>`). When handling WhatsApp messages, this can be automatically resolved via phone or group JID lookup.
- Network access from Hermes to the Aquera API host.

## Quick Reference

| Action | Method | Path | Required Headers | Key Parameters |
|---|---|---|---|---|
| Health Check | `GET` | `/health` | (none) | None |
| Identify User by Phone | `GET` | `/user-context?phone={phone}` | `Authorization` | `phone` (format: `628xxx` or `08xxx`) |
| Get User Context | `GET` | `/user-context` | `Authorization`, `x-cid` | `user_id` (optional) |
| Update User Phone / Profile | `PUT` | `/user-context` | `Authorization` | `phone`, `user_id` (optional), `full_name` |
| List Team & Contacts | `GET` | `/team` | `Authorization`, `x-cid` | None (returns `phone`, `full_name`, `role`) |
| Update Team Member Phone | `PUT` | `/team` | `Authorization`, `x-cid` | `id` or `user_id`, `phone`, `designation` |
| Lookup WhatsApp Group | `GET` | `/whatsapp-groups?group_jid={jid}` | `Authorization` | `group_jid` (e.g. `120363xxx@g.us`) |
| List WhatsApp Groups | `GET` | `/whatsapp-groups` | `Authorization`, `x-cid` | `is_active` (optional) |
| Register WhatsApp Group | `POST` | `/whatsapp-groups` | `Authorization`, `x-cid` | `group_jid`, `group_name`, `paired_by` |
| Update WhatsApp Group | `PUT` | `/whatsapp-groups` | `Authorization` | `id` or `group_jid`, `is_active`, `group_name` |
| Disconnect WhatsApp Group | `DELETE` | `/whatsapp-groups?group_jid={jid}` | `Authorization` | `group_jid` or `id` |
| Link Group via Pairing Code | `POST` | `/whatsapp/link` | `Authorization` | `code`, `group_jid`, `sender_phone` |
| Dashboard KPI | `GET` | `/summary` | `Authorization`, `x-cid` | None |
| List Ponds | `GET` | `/ponds` | `Authorization`, `x-cid` | None |
| Create Pond | `POST` | `/ponds` | `Authorization`, `x-cid` | `farm_site_id`, `name`, `area_m2` |
| Log Feed | `POST` | `/feed-log` | `Authorization`, `x-cid` | `cycle_id`, `pond_id`, `qty_kg`, `fed_at` |
| Log Sampling | `POST` | `/sampling` | `Authorization`, `x-cid` | `cycle_id`, `pond_id`, `sampled_at`, `abw_g` |
| Record Harvest | `POST` | `/harvest` | `Authorization`, `x-cid` | `pond_id`, `cycle_id`, `harvest_type`, `details` |
| Create Invoice | `POST` | `/invoice` | `Authorization`, `x-cid` | `buyer_name`, `invoice_date`, `items` |

---

## WhatsApp Bot Integration Workflow

Hermes operates as an autonomous WhatsApp Agent for Aquera shrimp farms. Follow these standard procedures when receiving messages:

### 1. Inbound Direct Message (Personal Chat)
When receiving a message from an individual WhatsApp number:
1. Extract the sender's phone number (format internationally, e.g. `6285882955873` or `085882955873`).
2. Call `GET /api/v1/user-context?phone=<SENDER_PHONE>` with `Authorization: Bearer <AQUERA_API_SECRET>`.
3. If the user is found (`success: true`):
   - Extract `user_context.organization_id` (this is the `CID`), `user_context.full_name`, and `user_context.role`.
   - Set the `x-cid` header to this `organization_id` for all subsequent operations during the conversation.
   - Greet the user by their `full_name` and confirm their organization context.
4. If the user is not found (`404 USER_PHONE_NOT_FOUND`):
   - Reply courteously:
     > *"Halo! Nomor WhatsApp Anda (`<SENDER_PHONE>`) belum terhubung ke akun Aquera. Silakan login ke Dashboard Aquera > Settings > User Profile & WhatsApp Contact, masukkan nomor Anda, lalu klik Simpan."*

### 2. Inbound Group Chat Message
When receiving a message inside a WhatsApp group:
1. Extract the group JID (e.g. `120363012345678901@g.us`).
2. Call `GET /api/v1/whatsapp-groups?group_jid=<GROUP_JID>`.
3. If the group is registered and active (`is_active: true`):
   - Extract `data.cid` and `data.organization_name`.
   - Use this `CID` as the `x-cid` header.
   - Also identify the individual sender within the group via `GET /api/v1/user-context?phone=<SENDER_PHONE>` to verify their role and permissions before executing sensitive operations (e.g. logging feed, deleting ponds).
4. If the group is not registered (`404 GROUP_NOT_FOUND`):
   - If the user sent a pairing command like `/link AQ-XXXX` or `AQ-XXXX`:
     - Call `POST /api/v1/whatsapp/link` with:
       ```json
       {
         "code": "AQ-XXXX",
         "group_jid": "<GROUP_JID>",
         "group_name": "<GROUP_NAME>",
         "sender_phone": "<SENDER_PHONE>"
       }
       ```
     - If successful, reply: *"Grup WhatsApp ini berhasil dihubungkan ke <organization_name>!"*
   - Otherwise, explain:
     > *"Grup ini belum terhubung ke tambak Aquera. Untuk menghubungkan, minta pemilik tambak membuat kode pairing di Dashboard Aquera (Settings > WhatsApp Bot Integration), lalu ketik: `/link <KODE>` di grup ini."*

---

## Phone Number Management in API v1

Aquera stores contact phone numbers in two tables:
1. `public.user_public.phone`: User's primary contact number across the platform.
2. `public.organization_user.phone`: Member contact number specific to an organization/tenant.
3. `public.v_whatsapp_users`: Database view combining both columns with organization context for fast AI agent lookups.

### Reading Phone Numbers
- Call `GET /api/v1/team` to retrieve all organization members with their `phone` and `full_name`.
- Call `GET /api/v1/user-context` to retrieve current authenticated user's `phone`.

### Updating Phone Numbers
- **Update current user:**
  ```http
  PUT /api/v1/user-context
  Content-Type: application/json
  Authorization: Bearer <SECRET>

  {
    "user_id": "<USER_UUID>",
    "phone": "6285882955873"
  }
  ```
- **Update team member contact:**
  ```http
  PUT /api/v1/team
  Content-Type: application/json
  Authorization: Bearer <SECRET>
  x-cid: <CID>

  {
    "id": "<ORGANIZATION_USER_UUID>",
    "phone": "6285882955873",
    "designation": "Teknisi Tambak"
  }
  ```

---

## Procedure for Farm Mutations

### 1. Context Resolution & ID Lookup
Most update (`PUT`) and delete (`DELETE`) operations require an explicit entity UUID (`id`). When a user mentions an entity by human name (e.g. *"Kolam A1"* or *"Grobest No. 1"*):
- First call the corresponding `GET` endpoint (e.g., `GET /api/v1/ponds`).
- Search the returned array for the matching name to extract its UUID `id`.
- Proceed with the mutation using the discovered UUID.

### 2. Executing Mutations (POST, PUT, DELETE)
- Always pass both `Authorization: Bearer <SECRET>` and `x-cid: <CID>`.
- For `POST` and `PUT`, format the body as JSON matching the schema in `openapi.json`.
- For `DELETE`, supply the UUID in the query string (e.g., `DELETE /api/v1/ponds?id=<UUID>` or `DELETE /api/v1/whatsapp-groups?group_jid=<JID>`).

### 3. Error Handling
- **401 Unauthorized:** Secret key is missing or invalid. Check `AQUERA_API_SECRET`.
- **403 Forbidden:** Organization CID is missing or inactive. Check `x-cid` value.
- **404 Not Found:** User phone or group JID not found in Aquera database. Prompt user to register in Dashboard Settings.
- **400 Bad Request:** Missing required fields or schema validation failed. Re-check `openapi.json`.
- **500 Server Error:** Database connectivity issue. Call `GET /api/v1/health` to diagnose.

## Pitfalls

- **Missing `x-cid` Header:** Aquera is strictly multi-tenant. Requests to farm operations without `x-cid` return 401/403. Auto-resolve it first using `/user-context?phone=...` or `/whatsapp-groups?group_jid=...`.
- **Phone Number Normalization:** Indonesian numbers starting with `08xxx` or `+628xxx` are automatically normalized by the API, but passing `628xxx` directly is recommended.
- **Direct Deletions without Confirmation:** Always confirm with the user before executing destructive `DELETE` actions.
- **Harvest Batching:** Harvest details expect an array of size and quantity entries: `[{ size: 50, qty_kg: 500, price_per_kg: 73000 }]`.
- **Date Format:** All date fields must follow ISO 8601 `YYYY-MM-DD` or full ISO timestamp `YYYY-MM-DDTHH:mm:ssZ`.

## Verification

1. Run `GET /api/v1/health` and verify `status: "healthy"`.
2. Test user identification via phone: `GET /api/v1/user-context?phone=6285882955873`.
3. Test WhatsApp group lookup: `GET /api/v1/whatsapp-groups` with `x-cid`.
4. Test team member listing with phone numbers: `GET /api/v1/team` with `x-cid`.
