# Jan Seva Kendra — Complete Dual-App System Design (v1)

Date: 2026-10-06 | Status: design ready, tech-stack choice pending | Language note: field names in English, explanations in Hindi.

---

## 1. System Architecture

```
┌─────────────────────┐
│     ADMIN PANEL     │  Web (React + TypeScript recommended)
│   Web Dashboard     │
└──────────┬──────────┘
           │  HTTPS + token auth, har action audit-logged
           ▼
┌─────────────────────┐
│   CENTRAL BACKEND   │  Ek hi API layer dono apps + admin ke liye
│ Authentication/API  │  - Firebase Auth (phone OTP) identity
│ Business Logic      │  - Cloud Functions (Node 20, TypeScript) ya REST API
│ Security Rules      │  - Har request par role + ownership re-check (DB se fresh)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  CENTRAL DATABASE   │  Firestore (MVP) — schema neeche
│ users, csc_centers, │  Scale par: PostgreSQL + PostGIS (migration path §12)
│ states, districts,  │
│ blocks, villages,   │
│ services,           │
│ applications,       │
│ application_        │
│ documents,          │
│ status_history,     │
│ notifications,      │
│ admin_users,        │
│ audit_logs          │
└─────────┬───────────┘
          │
   ┌──────┴──────┐
   ▼             ▼
 Public App   Sanchalak App
 (Kotlin,     (Kotlin, alag appId —
  Compose)     sirf apne applications)
```

Dono mobile apps + admin panel — teeno ek hi backend/database se baat karte hain. Koi app seedha database rule bypass karke write nahi karta; critical writes (application create, status change) backend transaction se hote hain.

---

## 2. Tech Stack — 2 options

**Option A — Firebase-first (MVP ke liye recommended, tez):**
- Android: Kotlin, Jetpack Compose, Material 3, Navigation, MVVM/Clean
- Auth: Firebase Authentication (phone OTP); role custom claims me (`role`, `cscId`)
- DB: Cloud Firestore; Storage: Cloud Storage (signed URLs); Logic: Cloud Functions (TypeScript)
- Push: Firebase Cloud Messaging; Safety: App Check; Crash: Crashlytics; Analytics: Firebase Analytics
- Geo: har CSC par `geohash` field + radius query (geohash neighbours); zyada scale par PostGIS

**Option B — PostgreSQL + PostGIS (scale/control ke liye):**
- Wahi Android apps; backend: Node/NestJS (ya Kotlin/Spring) REST API
- Identity ke liye Firebase Auth (ID token verify), data PostgreSQL + PostGIS (`ST_DWithin` geo queries, Row-Level Security)
- Storage: S3-compatible; Push: FCM; Admin: React

**Recommendation:** Option A se MVP shuru karo; repository layer ko interface-based rakho taaki DB baad me Postgres par shift ho sake bina apps rewrite kiye.

---

## 3. Database Schema (Firestore collections)

### `users`
| field | type | note |
|---|---|---|
| id | string (uid) | Firebase Auth UID |
| role | enum | PUBLIC_USER / CSC_SANCHALAK / ADMIN |
| name, phone, email? | | |
| stateId, districtId, blockId?, villageId?, pinCode | refs | public user ka region |
| status | enum | ACTIVE / INACTIVE |
| createdAt, updatedAt | timestamp | |

### `csc_centers`
`id, ownerUserId → users.id, centerName, vleName, mobile, email, cscIdNumber, address, stateId, districtId, blockId, villageId, pinCode, lat, lng, geohash, photoUrl, documents[], verificationStatus (PENDING/VERIFIED/REJECTED/SUSPENDED), accountStatus (ACTIVE/INACTIVE), authorizedServiceIds[] (optional), rating, openHours, createdAt, updatedAt`
- Index: `(stateId, districtId, verificationStatus, accountStatus)`, `geohash`

### `states` / `districts` / `blocks` / `villages`
- `states`: id, code (`UP`, `BR`, `RJ`, `DL`, `MH`…), name, type (STATE/UNION_TERRITORY), active
- `districts`: id, stateId, name, code, active
- `blocks`: id, districtId, name, type (BLOCK/TEHSIL), active
- `villages`: id, blockId, name, active

### `services`
`id, name, description, category, serviceType (NATIONAL/STATE_SPECIFIC/DISTRICT_SPECIFIC/BLOCK_SPECIFIC), stateId?, districtId?, blockId?, requiredDocuments[{name, mime[], mandatory}], applicationFee, estimatedProcessingTimeDays, activeStatus, createdAt, updatedAt`
- Constraint: NATIONAL → koi region id nahi; STATE_SPECIFIC → stateId required; DISTRICT_SPECIFIC → stateId+districtId; BLOCK_SPECIFIC → teeno.

### `applications`
`id (APP-2026-XXXXXX), applicantId → users.id, applicantName, serviceId → services.id, serviceName (denormalized), serviceType, applicantStateId, applicantDistrictId, applicantBlockId?, selectedCscId → csc_centers.id, selectedCscStateId, selectedCscDistrictId, applicationData (JSON), status (NEW/PROCESSING/COMPLETED/REJECTED), createdAt, updatedAt`
- Index: `(selectedCscId, status, createdAt desc)`, `(applicantId, createdAt desc)`

### `application_documents`
`id, applicationId, docType, fileName, mimeType, sizeBytes, storagePath, uploadedBy, createdAt`
- Storage path: `applications/{appId}/{docId}-{fileName}`; sirf signed URL se access.

### `application_status_history`
`id, applicationId, fromStatus, toStatus, changedByUid, note, createdAt` — har status change yahin likha jata hai.

### `notifications`
`id, recipientUserId, title, body, type, referenceId, read, createdAt`

### `admin_users`
`id, uid, name, email, role (SUPER_ADMIN/OPERATOR), active`

### `audit_logs`
`id, actorUid, actorRole, action, entityType, entityId, before, after, ip, createdAt` — admin ke har write par entry.

---

## 4. Relationships

```
STATE 1──* DISTRICT 1──* BLOCK 1──* VILLAGE
  │           │
  │           └── (CSC_CENTER, SERVICE region scope)
  │
  ├──* SERVICE (NATIONAL ya region-scoped)
  └──* CSC_CENTER 1──* APPLICATION
USER 1──* APPLICATION *──1 SERVICE
APPLICATION 1──* APPLICATION_DOCUMENT
APPLICATION 1──* STATUS_HISTORY
APPLICATION 1──* NOTIFICATION (applicant + CSC dono ko)
```

---

## 5. Authentication Architecture

- **Public + Sanchalak:** Firebase phone OTP. Login ke baad backend `custom claims` set karta hai: `{role, cscId?}`.
- **CSC PENDING guard:** claim me role CSC_SANCHALAK ho sakta hai, lekin dashboard data backend **har request par DB se fresh** `verificationStatus` + `accountStatus` check karke deta hai. Sirf claim par bharosa nahi.
- **Admin:** email/password + MFA (authenticator app), `admin_users` table, short-lived session, har action audit-logged. SUPER_ADMIN vs OPERATOR (operator sensitive actions nahi kar sakta).
- Har client har request me Firebase ID token bhejta hai; backend signature verify karta hai, phir role + CSC status DB se load karta hai.

---

## 6. API Structure (`/api/v1`)

```
POST /auth/session                 # token verify, user upsert, role+CSC status return
GET  /geo/states | /districts?stateId= | /blocks?districtId= | /villages?blockId=
GET  /services?stateId=&districtId=&blockId=      # backend eligibility filter (client par bharosa nahi)
GET  /services/:id                                # eligibility dobara check
GET  /csc/nearby?serviceId=&lat=&lng=&radiusKm=    # eligibility → verified/active → authorized → distance sort
POST /applications                                # transaction: validation + create + history + notify CSC
GET  /applications/mine                           # public: sirf apne
GET  /sanchalak/applications?status=               # sirf apne center ke
PATCH /sanchalak/applications/:id/status           # state-machine validated
POST /applications/:id/documents/upload-url        # signed URL (type/size validated)
GET  /applications/:id/documents/:docId/download   # ownership check ke baad signed URL
# Admin (admin_users only, sab audit-logged)
GET|POST /admin/csc  ·  PATCH /admin/csc/:id/verify|reject|suspend|activate
GET|POST|PATCH /admin/services  ·  /admin/applications (search/filter/reassign/reports)
GET|PATCH /admin/users  ·  /admin/geo/...  ·  /admin/audit-logs
```

---

## 7. Security Rules (RBAC + backend enforcement)

| Role | Kar sakta hai | Nahi kar sakta |
|---|---|---|
| PUBLIC_USER | apna profile, apni applications/docs/status; eligible service+CSC par apply | doosre user ka data; ineligible serviceId manually bhejna (backend reject) |
| CSC_SANCHALAK | sirf `selectedCscId == apna verified+active center` wali applications + assigned docs + status update | doosre CSC ki application ID dalna (backend reject); service marketplace (app me hai hi nahi) |
| ADMIN | sab kuchh (writes audit-logged) | OPERATOR: suspend/delete jaise sensitive actions nahi |

**Enforcement points (sab backend par, frontend hide kaafi nahi):**
1. `GET /services` — user region ke hisab se filter (NATIONAL + matching STATE/DISTRICT/BLOCK).
2. `GET /services/:id` — wahi check dobara; mismatch → 403.
3. `POST /applications` — service eligibility + CSC (VERIFIED + ACTIVE + region match + authorized) transaction me re-validate.
4. `GET/PATCH .../sanchalak/...` — `selectedCscId == caller.cscId` check.
5. Documents — download se pehle ownership check, phir 15-min signed URL; kabhi public URL nahi.
6. Firestore rules (Option A): client direct write `applications` par **deny** — writes sirf Cloud Functions se. Postgres (Option B): Row-Level Security + `SECURITY DEFINER` function for application creation.

---

## 8. Location / Geospatial Logic

- CSC registration me `lat, lng` + `geohash` save. Admin map par location verify kar sakta hai.
- **Nearby flow (hamesha isi order me):**
  1. Service load karo → uska region scope nikalo (NATIONAL/STATE/DISTRICT/BLOCK).
  2. CSC query: `verificationStatus=VERIFIED`, `accountStatus=ACTIVE`, region service scope se match, (optional) `authorizedServiceIds` me service ho.
  3. Geo bound: geohash neighbours (ya PostGIS `ST_DWithin`), Haversine se exact distance.
  4. Distance ascending sort, paginate.
- **GPS deny hone par fallback:** state/district/block/PIN se search (district match pehle, phir PIN proximity). GPS kabhi mandatory nahi.
- **Sunehra niyam:** pehle eligibility filter, phir distance — kabhi `nearest → filter` nahi (warna Bihar ka CSC UP service ke liye dikhega).

---

## 9. State/UT Service Filtering (backend, §7 ka point 1–2)

```
eligible(service, user):
  if not service.activeStatus: return false
  NATIONAL:          return true
  STATE_SPECIFIC:    return service.stateId == user.stateId
  DISTRICT_SPECIFIC: return service.stateId == user.stateId
                     and service.districtId == user.districtId
  BLOCK_SPECIFIC:    return upar wale
                     and service.blockId == user.blockId
```

Yahi function list, detail, apply aur CSC-matching — chaaro jagah lagta hai. Example: user (UP, Bahraich) ko NATIONAL + UP services + Bahraich district services + uske block ki services dikhengi; Bihar/Rajasthan/Delhi-only services nahi.

---

## 10. Application Assignment Logic

`POST /applications {serviceId, cscId, applicationData, documents[]}` — **ek transaction me:**
1. Service eligibility re-check (user region vs service scope).
2. CSC re-check: VERIFIED + ACTIVE + region service scope se match (+ authorized list).
3. `applications` row banao (`status=NEW`, IDs generate: `APP-2026-XXXXXX`).
4. `application_status_history` me `NULL → NEW` entry.
5. CSC owner ke liye notification (push + inbox).
6. `applicationId` return.

- Sanchalak query hamesha `where selectedCscId == myCscId` — doosre CSC ki application kabhi nahi dikhti.
- Status state machine: `NEW → PROCESSING → COMPLETED`, ya `NEW → REJECTED`. Galat transition (jaise NEW → COMPLETED seedha) backend reject karta hai; har change history + applicant notification ke saath.
- Admin reassign: sirf admin endpoint, history + audit + dono CSCs ko notification.

---

## 11. Documents

- Upload: backend se signed URL (15-min expiry), allowlist `pdf/jpg/jpeg/png`, max 10MB/file; path `applications/{appId}/{docId}-{fileName}`.
- Download: ownership check (applicant apna, CSC sirf assigned, admin sab) → fresh signed URL.
- Storage kabhi public nahi; file list me sirf metadata, bytes nahi.

---

## 12. Scalability & Migration Path

- Indexes: §3 me diye gaye; Firestore me `stateId`-prefixed collection-group queries se shard.
- Postgres par: `applications` ko month-wise partition, read replicas, `ST_DWithin` + GiST index on geography.
- Rate limits: `/applications` POST (per user/day), upload endpoints; App Check har client par; FCM batching.
- Admin web CDN par; audit_logs append-only.

---

## 13. Notifications

FCM tokens per user/device. Triggers:
- Public: application submitted, CSC ne receive kiya, status changed, completed, rejected.
- Sanchalak: nayi application, naya document, admin ka important message.
- Admin: naya CSC registration, important application events, system alerts.
Har push ke saath in-app inbox entry bhi (taaki push miss ho to bhi dikhe).

---

## 14. Admin Panel — Pages

1. **Dashboard:** KPIs (applications/day, pending verifications, CSC count by state, status funnel).
2. **CSC Management:** naye registrations (PENDING queue), verify/reject/suspend/activate, profile + map location, state/district/block filter.
3. **Service Management:** add/edit/disable/archive; type set karo (National/State/District/Block) + region mapping + required documents — bina code change.
4. **Application Management:** sab applications, search/filter, status monitor, assigned CSC, reassign (audit ke saath), reports export.
5. **User Management:** public + CSC users, account ACTIVE/INACTIVE.
6. **Location Master:** states/UTs, districts, blocks/tehsils, villages ka CRUD.
7. **Audit Logs & Broadcasts.**

---

## 15. Build Phases (stack choice ke baad, step-by-step code)

- **Phase 0:** monorepo + CI + environments (dev/staging/prod), env config, App Check.
- **Phase 1:** Auth (OTP) + geo masters + admin login + audit log plumbing.
- **Phase 2:** Service CRUD (admin) + public service browse (eligibility filter ke saath).
- **Phase 3:** CSC registration flow + admin verification queue.
- **Phase 4:** Nearby eligible CSC + application submit + document upload (signed URLs).
- **Phase 5:** Sanchalak dashboard (New/Pending/Processing/Completed/Rejected) + status state machine.
- **Phase 6:** Tracking timeline + FCM notifications (dono apps + admin).
- **Phase 7:** Reports, admin reassign, load test, security review, hardening.

Har phase ke end me chalne layak increment — mockup nahi, working software.
