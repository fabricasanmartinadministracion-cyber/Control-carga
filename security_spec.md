# Security Specification: Logistics and Dispatch Board

This document lays down the Attribute-Based Access Control (ABAC) invariants, security test payloads, and validation constraints for the logistics management platform.

## 1. Data Invariants

1. **Authentication Requirement**: Any client writing or reading database items must be successfully signed in. Anonymous or unauthenticated clients are denied all access.
2. **Planilla Structure**:
   - `nombre` must be a string up to 256 characters.
   - `fechaExcel` must be a string up to 64 characters.
   - `creadoPor` must match the authenticated user UID (`request.auth.uid`).
   - `locales` must be a list of shop names, sizes must be bounded.
3. **Despacho Structure**:
   - `nombreDespacho` must be a string up to 256 characters.
   - `planillaId` must be a valid ID referencing an imported sheet.
   - `creadoPor` must match the authenticated user UID (`request.auth.uid`).
   - `totales` map must contain valid positive integers for cars, pies, etc.

---

## 2. The "Dirty Dozen" Threat Vectors

Below are 12 specific payloads representing critical threat scenarios that will be strictly rejected by our Firestore Security Rules.

### T1: Writing Planilla Unauthenticated
- **Operation**: `create` on `/planillas/sheet-123`
- **Identity**: `request.auth = null`
- **Payload**:
  ```json
  { "nombre": "Plano Hacker", "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "attacker_uid", "locales": ["Local A"], "productos": {} }
  ```
- **Expectation**: `PERMISSION_DENIED` (No auth)

### T2: Identity Spoofing (Owner Forgery)
- **Operation**: `create` on `/planillas/sheet-456`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "nombre": "Plantilla Forjada", "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "attacker_uid", "locales": [], "productos": {} }
  ```
- **Expectation**: `PERMISSION_DENIED` (`creadoPor` does not match active UID)

### T3: Resource Poisoning (Giant Field Attack)
- **Operation**: `create` on `/planillas/sheet-heavy`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "nombre": "A".repeat(10000), "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "legit_user", "locales": [], "productos": {} }
  ```
- **Expectation**: `PERMISSION_DENIED` (Name size overflows boundary of 256)

### T4: Path Variable Exploit (Malformed Document ID)
- **Operation**: `create` on `/planillas/sheet_%%invalid$$$`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "nombre": "Correct", "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "legit_user", "locales": [], "productos": {} }
  ```
- **Expectation**: `PERMISSION_DENIED` (ID contains special invalid characters in path regex)

### T5: Deleting historical audits by unauthorized users
- **Operation**: `delete` on `/despachos/despacho-123`
- **Identity**: `request.auth.uid = "attacker_user"` (Original creator was "legit_user")
- **Expectation**: `PERMISSION_DENIED` (Only original creator can delete or update their compiled report metadata)

### T6: Injection of Arbitrary Extra Fields (Shadow Fields)
- **Operation**: `create` on `/planillas/sheet-789`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "nombre": "Correct", "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "legit_user", "locales": [], "productos": {}, "shadow_field_is_admin": true }
  ```
- **Expectation**: `PERMISSION_DENIED` (Keys length exceeds strictly allowed layout)

### T7: Tampering with `createdAt` or Creation Details (Time Forgery)
- **Operation**: `update` on `/planillas/sheet-123`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload (diff)**: Modifying `fechaCreacion` or `creadoPor`.
- **Expectation**: `PERMISSION_DENIED` (Immortal field constraints violated)

### T8: Negative Counts in Dispatch Totales (Value Poisoning)
- **Operation**: `create` on `/despachos/desp-fail`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "planillaId": "sh-1", "nombreDespacho": "Ok", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "legit_user", "creadoPorEmail": "legit@email.com", "localesSeleccionados": ["LocalA"], "totales": { "totalCarros": -10 } }
  ```
- **Expectation**: `PERMISSION_DENIED` (Total count must be positive integer)

### T9: Overriding Completed Audit Terminal State
- **Operation**: `update` on `/despachos/desp-done`
- **Identity**: `request.auth.uid = "legit_user"`
- **State on DB**: `status: "completed"` or `finalized: true`
- **Payload (diff)**: Re-writing calculations after final signoff.
- **Expectation**: `PERMISSION_DENIED` (Report locking is in place)

### T10: Corrupting List Objects with Bad Nested Elements
- **Operation**: `create` on `/planillas/sheet-bad-locales`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload**:
  ```json
  { "nombre": "Correct", "fechaExcel": "2026-05-28", "fechaCreacion": "2026-05-28T00:00:00Z", "creadoPor": "legit_user", "locales": [12345, false], "productos": {} }
  ```
- **Expectation**: `PERMISSION_DENIED` (`locales` array must contain string characters strictly)

### T11: Modifying Immutable Planilla IDs on Ref
- **Operation**: `update` on `/despachos/despacho-123`
- **Identity**: `request.auth.uid = "legit_user"`
- **Payload (diff)**: Changing `planillaId` of a computed checkout.
- **Expectation**: `PERMISSION_DENIED` (Planilla link is immutable)

### T12: Anonymous Query Sniffing (Security Rule bypassing)
- **Operation**: `list` on `/despachos`
- **Identity**: `request.auth = null`
- **Expectation**: `PERMISSION_DENIED` (Must be signed in to see the historical catalog of despachos)
