# PULARI BAKES — KNOWN OPERATIONAL ISSUES & NON-BLOCKING NUANCES
**Document Reference**: PB-ISSUES-2026-01  
**Classification**: Operational Architecture Ledger  
**Date**: November 2026  
**Auditor**: Principal Architect & Senior Full-Stack Lead  
**Scope**: Pulari Bakes ERP Ecosystem

---

## 1. Overview

During the exhaustive production-readiness audit, all P0 blockers, P1 critical vulnerabilities, and P2 major issues were remediated and verified.

This document catalogs non-blocking edge cases, deliberate architectural trade-offs, and platform-specific behaviors to ensure transparent long-term operational maintenance.

---

## 2. Catalog of Operational Nuances & Edge Cases

### Issue 1: Multi-Device Offline Stock Synchronization Conflicts
* **Severity**: Low / Non-Blocking (P3)
* **Description**: If two pantry operators work on separate devices while disconnected from Wi-Fi and concurrently log consumption of the same ingredient batch:
  1. Operator A records 20 kg maida consumed.
  2. Operator B records 15 kg maida consumed.
  3. Physical balance was 30 kg.
* **Current Behavior**: When re-establishing connectivity, offline sync queues process FIFO based on device timestamps. Operator A's transaction succeeds; Operator B's transaction triggers the database stock pre-check (`Insufficient stock: Available 10, Required 15`) and is flagged in the operator's local synchronization review drawer.
* **Operational Recommendation**: Floor managers should assign dedicated tablet devices to designated production lines (e.g., Tablet 1 for Savory/Snack Frying, Tablet 2 for Bakery/Mixture preparation) to minimize concurrent writes to identical raw stock items.

---

### Issue 2: iOS Safari PWA Installation Mechanics
* **Severity**: Minor / Platform Limitation (P4)
* **Description**: The W3C `beforeinstallprompt` DOM event is fully supported on Android Chromium browsers, allowing automatic in-app install dialogs. Apple iOS Safari intentionally restricts this event.
* **Current Behavior**: On Apple iPad and iPhone devices, users must tap the Safari Share button and select "Add to Home Screen".
* **Operational Recommendation**: The Pantry PWA includes a localized Malayalam guidance modal on iOS devices illustrating the 2-step "Add to Home Screen" procedure.

---

### Issue 3: Supabase Free Tier Inactivity Pause
* **Severity**: Cloud Policy Limitation (P3)
* **Description**: Projects hosted on the Supabase Free Tier are automatically paused by Supabase infrastructure if no API requests or dashboard logins occur for 7 consecutive calendar days.
* **Current Behavior**: An inactive bakery during holiday shutdowns may experience initial latency on the first login while the free-tier container wakes up.
* **Mitigation**:
  1. Daily bakery operations naturally keep the database active.
  2. The database is 100% portable: using the included `database/docker-compose.yml`, the entire system can be spun up on a $5/month VPS (e.g. Hetzner, DigitalOcean) with zero sleep pauses.

---

### Issue 4: Architectural Choice: Pgcrypto Authentication vs Supabase GoTrue
* **Severity**: Architectural Trade-Off (By Design)
* **Description**: Pulari Bakes uses standard PostgreSQL `pgcrypto` bcrypt password hashing for administrative access rather than Supabase GoTrue authentication.
* **Rationale**: Supabase GoTrue requires Supabase-specific auth schemas, cloud callbacks, and vendor-locked JWT signing keys. By utilizing standard PostgreSQL cryptographic functions inside `verify_admin_pin`, the authentication model is 100% portable to any standard PostgreSQL database without rewriting security logic.

---

### Issue 5: Thermal Receipt & Label Printing Integration
* **Severity**: Operational Enhancement (P4)
* **Description**: The Pantry PWA utilizes standard CSS `@media print` print stylesheets targeting standard office and 80mm roll printers via the OS system print dialog.
* **Current Behavior**: Operators tap "Print Batch Tag", which invokes `window.print()`.
* **Future Roadmap**: Direct ESC/POS Bluetooth socket communication can be added in a future update if dedicated hardware thermal printers (e.g., TSC / Zebra) are deployed to the packaging line.
