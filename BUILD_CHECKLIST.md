# Jan Seva Kendra — Build Checklist (aapki machine par)

Code 100% taiyaar hai (`~/workspace/jan-seva-kendra/`). Chalne wala app aapki machine par banega — neeche exact steps hain.

## A. Firebase project (ek baar, ~30-45 min, browser me)

1. console.firebase.google.com → Add project (naam: jan-seva-kendra) → region: asia-south1
2. Authentication → Sign-in method → Phone → Enable
3. Firestore Database → Create → Production mode → region asia-south1
4. Storage → Get started → Production mode
5. Functions → (billing: Blaze plan chahiye hota hai Functions deploy ke liye — pay-as-you-go, free tier ke andar rahega)
6. Project Overview → Android app add karo (package: `in.jansevakendra.public`) → `google-services.json` download
7. Phir doosri Android app add karo (package: `in.jansevakendra.sanchalak`) → uska `google-services.json` download
8. Project settings → Service accounts → Generate new private key → JSON save karo

## B. Backend deploy (~15 min, terminal me)

```bash
cd ~/workspace/jan-seva-kendra
npm i -g firebase-tools
firebase login
# .firebaserc me apna project id dalo
cd functions && npm install && npm run build
cd ..
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
# API URL note karo: https://asia-south1-<project>.cloudfunctions.net/api
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node tools/seed.mjs
```

## C. Pehla admin banao (Firebase console me, 5 min)

1. Authentication me apna email user banao (ya phone se login karke UID copy karo)
2. Firestore → `users/{uid}` → `role: "ADMIN"` set karo
3. Firestore → `admin_users/{uid}` doc banao: `{active: true, role: "SUPER_ADMIN"}`
4. Admin panel: `cd admin-panel && npm install`, `.env` me `VITE_API_BASE_URL` + Firebase config, `npm run dev`

## D. Android apps (~20 min, Android Studio me)

1. `android-public/` kholo → `app/google-services.json` rakho (public wala)
2. `local.properties` me: `API_BASE_URL="https://asia-south1-<project>.cloudfunctions.net/api/api/v1/"` (trailing slash zaroori)
3. Sync → Run/Build APK
4. `android-sanchalak/` ke liye same (sanchalak wala google-services.json)

## E. End-to-end test flow

1. Sanchalak app → Register center → Admin panel me Verify
2. Public app → OTP login → state select → service chuno → nearby CSC → apply → document upload
3. Sanchalak app me application aayegi → PROCESSING → COMPLETED; public app me timeline update

## Time estimate (imaandaar)

- Code: aaj taiyaar (ho chuka)
- Aapke steps (B+C+D): pehli baar kar rahe ho to 1.5–2.5 ghante; dobara 30 min
- APK: Android Studio me Build → APK me 5–15 min (pehli build slow)
- Is beech agar koi error aaye to message bhejo — yahin se fix kar dunga
