# Jan Seva Kendra — FREE Backend Setup (bina card, bina terminal)

Kul kharcha: ₹0. Sab browser me clicks se hoga, koi command nahi.

> Note: Render ka free server 15 min idle rehne par "so jata hai" — pehli request me 30-60 second lag sakta hai. Jab earning shuru ho jaye to Firebase Blaze par shift kar lena (tab bhi free limit me ₹0).

## PART A — Firebase console (free Spark plan, card nahi chahiye) — 10 min

1. console.firebase.google.com → project **jan-seva-kendra-d081e** kholo
2. **Build → Firestore Database** → **Create database** → **Production mode** → location **asia-south1** → Enable
3. **Build → Storage** → **Get started** → **Production mode** → Done
4. **Build → Authentication → Sign-in method** → **Phone** → Enable → Save (pehle se hai to chhodo)
5. **Firestore rules lagao:** Firestore Database → **Rules** tab → wahan ka saara text delete karke is ZIP ki `firestore.rules` file ka poora content paste karo → **Publish**
6. **Storage rules lagao:** Storage → **Rules** tab → `storage.rules` file ka content paste karo → **Publish**
7. **5 indexes banao:** Firestore Database → **Indexes** tab → **Add index** (har ek ke liye):
   - Collection `csc_centers`: `stateId` Ascending, `districtId` Ascending, `verificationStatus` Ascending, `accountStatus` Ascending → Create
   - Collection `csc_centers`: `geohash` Ascending, `verificationStatus` Ascending, `accountStatus` Ascending → Create
   - Collection `applications`: `selectedCscId` Ascending, `status` Ascending, `createdAt` Descending → Create
   - Collection `applications`: `applicantId` Ascending, `createdAt` Descending → Create
   - Collection `services`: `activeStatus` Ascending, `serviceType` Ascending, `stateId` Ascending → Create
8. **Service account key download karo:** Project **Settings** (⚙️) → **Service accounts** → **Generate new private key** → JSON file download ho jayegi (sambhal kar rakho, kisi ko mat bhejo)

## PART B — GitHub par code dalo (browser se, 5 min)

1. github.com → Sign up / Login → **New repository** → naam `jan-seva-kendra-backend` → **Public** → Create
2. **"uploading an existing file"** link par click karo → is ZIP ko extract karke uske **andar ki saari files/folders** drag-drop karo → **Commit changes**
   (firebase.json, render.yaml, functions/, tools/ sab root me hone chahiye)

## PART C — Render par free server (5 min + 5 min deploy)

1. render.com → Sign up (GitHub se login sabse aasaan)
2. Dashboard → **New +** → **Web Service** → apna `jan-seva-kendra-backend` repo **Connect** karo
3. Settings:
   - **Name:** `jan-seva-kendra-api` (exact yehi — isi se URL banega)
   - **Runtime:** Node (render.yaml se auto-detect ho jayega)
   - **Plan:** **Free** select karo
   - Build/Start command render.yaml se aa jayenge
4. **Environment variables** me add karo:
   - Key `FIREBASE_SERVICE_ACCOUNT`, Value = PART A step 8 wali JSON file ka **poora text** (Notepad me kholo → Ctrl+A → Ctrl+C → yahan paste)
   - Key `FIREBASE_STORAGE_BUCKET`, Value `jan-seva-kendra-d081e.appspot.com`
5. **Deploy Web Service** dabao → 4-5 min me **Live** ho jayega
6. URL milega: `https://jan-seva-kendra-api.onrender.com` — ise **Muse ko bhej do**, APKs isi URL ke saath rebuild honge

## PART D — Pehla admin + sample data (Muse kar dega / admin panel se)

Deploy Live hote hi Muse ko URL bhejo. Uske baad:
- Admin panel se states/services add honge
- Pehla admin user console se banega (Muse bata dega)
