# Jan Seva Kendra — Firebase Backend (Phase 0 + 1)

Central API + database + security rules. Dono Android apps aur Admin Panel isi se judenge.

## Repo layout

```
jan-seva-kendra/
  firebase.json, .firebaserc      # Firebase project config (project id badlo)
  firestore.rules                 # read rules — writes sirf Functions se
  firestore.indexes.json          # composite indexes
  storage.rules                   # documents: sirf signed URLs, koi direct access nahi
  functions/                      # Cloud Functions (Node 20, TypeScript, Express)
    src/index.ts                  # saare /api/v1 endpoints
    src/lib/auth.ts               # token verify + fresh role/CSC-status load
    src/lib/validation.ts         # eligible(), state machine (single source of truth)
    src/lib/geo.ts                # haversine + geohash
    src/lib/types.ts
  tools/seed.mjs                  # 28 states + 8 UTs + sample districts/services
  android-public/                 # (next step) Jan Seva Kendra app
  android-sanchalak/              # (next step) Sanchalak app
  admin-panel/                    # (next step) React admin
```

## Setup (ek baar)

1. `npm i -g firebase-tools`
2. Firebase console me project banao (suggested region: asia-south1), phir `.firebaserc` me project id dalo.
3. Enable karo: Authentication (Phone provider), Firestore, Storage, Functions, App Check, Cloud Messaging.
4. `cd functions && npm install && npm run build`
5. `firebase deploy --only firestore:rules,firestore:indexes,storage`
6. `firebase deploy --only functions` → API base URL milega: `https://asia-south1-<project>.cloudfunctions.net/api`
7. Service account JSON download karo (Project settings → Service accounts), phir:
   `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node tools/seed.mjs`
8. Admin user: Firestore me `admin_users/{uid}` doc banao `{active: true, role: 'SUPER_ADMIN'}` aur `users/{uid}` me `role: 'ADMIN'` set karo (pehli baar console se).

## API quick reference

Sab requests me header: `Authorization: Bearer <Firebase ID token>`

| Method | Endpoint | Kaun |
|---|---|---|
| POST | /api/v1/auth/session | sab (pehli baar user doc + claims) |
| GET | /api/v1/geo/states, /districts?stateId=, /blocks?districtId=, /villages?blockId= | signed-in |
| PATCH | /api/v1/users/me/region | public (apna region save) |
| GET | /api/v1/services, /services/:id | public (backend eligibility filter) |
| GET | /api/v1/csc/nearby?serviceId=&lat=&lng=&radiusKm= | public |
| POST | /api/v1/csc/register | public (PENDING me jata hai) |
| POST | /api/v1/csc/me/documents/upload-url | CSC owner (photo/docs, PENDING me bhi) |
| PATCH | /api/v1/csc/me | CSC owner (apna profile; verificationStatus nahi) |
| GET | /api/v1/csc/me/photo | CSC owner (photo ka signed URL) |
| POST | /api/v1/applications | public (transaction: eligibility re-check) |
| GET | /api/v1/applications/mine, /applications/:id | public (apna) |
| GET | /api/v1/sanchalak/applications?status= | verified CSC |
| PATCH | /api/v1/sanchalak/applications/:id/status | verified CSC (state machine) |
| POST | /api/v1/applications/:id/documents/upload-url | applicant / assigned CSC |
| GET | /api/v1/applications/:id/documents/:docId/download | owner check ke baad signed URL |
| GET/PATCH | /api/v1/admin/csc, /admin/csc/:id/verify, /admin/csc/:id/account | ADMIN (audited) |
| GET/POST/PATCH | /api/v1/admin/services, /admin/services/:id | ADMIN (audited) |
| GET/POST | /api/v1/admin/applications, /admin/applications/:id/reassign | ADMIN (audited) |
| GET | /api/v1/admin/users?role= | ADMIN |
| POST/PATCH | /api/v1/admin/geo/:collection, /admin/geo/:collection/:id | ADMIN (audited) |
| GET | /api/v1/admin/audit-logs | ADMIN |

## Key guarantees (design §7–10 se)

- Service list/detail/apply — teeno par `eligible()` backend me lagta hai.
- Nearby: pehle eligibility (service scope → VERIFIED+ACTIVE → authorized), phir distance sort. Kabhi nearest-first nahi.
- Application create ek Firestore transaction me: validation + row + history + CSC ko notification.
- Status machine: NEW→PROCESSING→COMPLETED ya NEW→REJECTED; galat transition reject.
- Documents: 15-min signed URLs, pdf/jpg/jpeg/png, max 10MB; kabhi public URL nahi.
- Sanchalak ko sirf `selectedCscId == apna center` wali applications dikhti hain.

## Next steps

- Phase 2: `android-public/` aur `android-sanchalak/` Kotlin/Compose skeletons (API client + screens).
- Phase 3: `admin-panel/` React app (CSC verify queue, service CRUD, applications, audit).
- Emulator me test: `cd functions && npm run serve`
