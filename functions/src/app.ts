// Jan Seva Kendra — shared Express app.
// Firebase Functions (index.ts) aur free hosts (server.ts, Render/Railway)
// dono isi ko use karte hain. Koi Blaze/card ki zaroorat nahi.
import * as admin from 'firebase-admin';
import express, { Response } from 'express';
import cors from 'cors';
import { requireAuth, requireRole, requireCsc, AuthedRequest } from './lib/auth';
import { eligible, canTransition, cscFitsService, validServiceScope } from './lib/validation';
import { haversineKm } from './lib/geo';
import { ApplicationStatus, CscDoc, Region, ServiceDoc } from './lib/types';

if (!admin.apps.length) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    // Free host (Render/Railway): service account JSON env var se
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(sa)),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'jan-seva-kendra-d081e.appspot.com',
    });
  } else {
    admin.initializeApp(); // Firebase Functions environment
  }
}
const db = admin.firestore();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
// ONE-SHOT BOOTSTRAP: seeds geo masters + sample services and creates the first
// TEMPORARY DIAGNOSTIC: tests Google API connectivity step by step.
app.get('/api/v1/diag', async (_req, res: Response) => {
  const out: Record<string, string> = {};
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label + ' TIMEOUT after ' + ms + 'ms')), ms))]);
  try {
    const t0 = Date.now();
    try {
      const cred = (admin.app().options as { credential?: { getAccessToken?: () => Promise<{ access_token?: string }> } }).credential;
      if (cred?.getAccessToken) {
        const tok = await withTimeout(cred.getAccessToken(), 25000, 'oauth2-token');
        out.oauth2 = tok?.access_token ? `OK (${Date.now() - t0}ms)` : 'NO_TOKEN';
      } else out.oauth2 = 'no-getAccessToken';
    } catch (e) { out.oauth2 = 'FAIL: ' + (e instanceof Error ? e.message : String(e)); }
    const t1 = Date.now();
    try {
      const snap = await withTimeout(db.collection('meta').doc('bootstrap').get(), 25000, 'firestore-read');
      out.firestore = `OK exists=${snap.exists} (${Date.now() - t1}ms)`;
    } catch (e) { out.firestore = 'FAIL: ' + (e instanceof Error ? e.message : String(e)); }
    const t2 = Date.now();
    try {
      await withTimeout(fetch('https://www.googleapis.com/', { method: 'HEAD' }), 15000, 'https-googleapis');
      out.https_googleapis = `OK (${Date.now() - t2}ms)`;
    } catch (e) { out.https_googleapis = 'FAIL: ' + (e instanceof Error ? e.message : String(e)); }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e), partial: out }); }
});
// ADMIN user. Runs only once — refuses when meta/bootstrap already exists.
// Call immediately after deploy, then this endpoint becomes inert.
app.post('/api/v1/bootstrap', async (req, res: Response) => {
  try {
    const done = await db.collection('meta').doc('bootstrap').get();
    if (done.exists) return res.status(409).json({ error: 'already bootstrapped' });
    const { adminEmail, adminPassword } = req.body || {};
    if (typeof adminEmail !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail))
      return res.status(400).json({ error: 'valid adminEmail required' });
    if (typeof adminPassword !== 'string' || adminPassword.length < 8)
      return res.status(400).json({ error: 'adminPassword min 8 chars required' });

    const batch = db.batch();
    const STATES: Array<[string, string, string]> = [
      ['AP', 'Andhra Pradesh', 'STATE'], ['AR', 'Arunachal Pradesh', 'STATE'], ['AS', 'Assam', 'STATE'],
      ['BR', 'Bihar', 'STATE'], ['CT', 'Chhattisgarh', 'STATE'], ['GA', 'Goa', 'STATE'],
      ['GJ', 'Gujarat', 'STATE'], ['HR', 'Haryana', 'STATE'], ['HP', 'Himachal Pradesh', 'STATE'],
      ['JH', 'Jharkhand', 'STATE'], ['KA', 'Karnataka', 'STATE'], ['KL', 'Kerala', 'STATE'],
      ['MP', 'Madhya Pradesh', 'STATE'], ['MH', 'Maharashtra', 'STATE'], ['MN', 'Manipur', 'STATE'],
      ['ML', 'Meghalaya', 'STATE'], ['MZ', 'Mizoram', 'STATE'], ['NL', 'Nagaland', 'STATE'],
      ['OD', 'Odisha', 'STATE'], ['PB', 'Punjab', 'STATE'], ['RJ', 'Rajasthan', 'STATE'],
      ['SK', 'Sikkim', 'STATE'], ['TN', 'Tamil Nadu', 'STATE'], ['TS', 'Telangana', 'STATE'],
      ['TR', 'Tripura', 'STATE'], ['UP', 'Uttar Pradesh', 'STATE'], ['UT', 'Uttarakhand', 'STATE'],
      ['WB', 'West Bengal', 'STATE'],
      ['AN', 'Andaman and Nicobar Islands', 'UNION_TERRITORY'], ['CH', 'Chandigarh', 'UNION_TERRITORY'],
      ['DN', 'Dadra and Nagar Haveli and Daman and Diu', 'UNION_TERRITORY'], ['DL', 'Delhi', 'UNION_TERRITORY'],
      ['JK', 'Jammu and Kashmir', 'UNION_TERRITORY'], ['LA', 'Ladakh', 'UNION_TERRITORY'],
      ['LD', 'Lakshadweep', 'UNION_TERRITORY'], ['PY', 'Puducherry', 'UNION_TERRITORY'],
    ];
    for (const [code, name, type] of STATES)
      batch.set(db.collection('states').doc(code), { code, name, type, active: true, createdAt: ts() });
    const districts: Array<[string, string, string]> = [
      ['UP-BAH', 'UP', 'Bahraich'], ['UP-LKO', 'UP', 'Lucknow'], ['UP-VNS', 'UP', 'Varanasi'],
      ['BR-PAT', 'BR', 'Patna'], ['BR-GAY', 'BR', 'Gaya'],
    ];
    for (const [id, stateId, name] of districts)
      batch.set(db.collection('districts').doc(id), { stateId, name, code: id, active: true, createdAt: ts() });
    batch.set(db.collection('blocks').doc('UP-BAH-BLK1'), { districtId: 'UP-BAH', name: 'Bahraich Sadar', type: 'BLOCK', active: true, createdAt: ts() });
    batch.set(db.collection('blocks').doc('UP-LKO-BLK1'), { districtId: 'UP-LKO', name: 'Lucknow Sadar', type: 'BLOCK', active: true, createdAt: ts() });
    batch.set(db.collection('services').doc('svc-pan-card'), {
      name: 'PAN Card', description: 'Naya PAN card ke liye aavedan', category: 'Identity',
      serviceType: 'NATIONAL', requiredDocuments: [
        { name: 'Aadhaar Card', mime: ['application/pdf', 'image/jpeg', 'image/png'], mandatory: true },
        { name: 'Photo', mime: ['image/jpeg', 'image/png'], mandatory: true },
      ],
      applicationFee: 107, estimatedProcessingTimeDays: 15, activeStatus: true, createdAt: ts(), updatedAt: ts(),
    });
    batch.set(db.collection('services').doc('svc-up-income'), {
      name: 'Uttar Pradesh Income Certificate', description: 'UP niwasion ke liye aay praman patra', category: 'Certificate',
      serviceType: 'STATE', stateId: 'UP', requiredDocuments: [
        { name: 'Aadhaar Card', mime: ['application/pdf', 'image/jpeg', 'image/png'], mandatory: true },
      ],
      applicationFee: 30, estimatedProcessingTimeDays: 10, activeStatus: true, createdAt: ts(), updatedAt: ts(),
    });
    batch.set(db.collection('services').doc('svc-bahraich-local'), {
      name: 'Bahraich Local Service', description: 'Bahraich zila vishesh seva', category: 'Local',
      serviceType: 'DISTRICT', stateId: 'UP', districtId: 'UP-BAH', requiredDocuments: [],
      applicationFee: 0, estimatedProcessingTimeDays: 7, activeStatus: true, createdAt: ts(), updatedAt: ts(),
    });

    const user = await admin.auth().createUser({ email: adminEmail, password: adminPassword, emailVerified: true, displayName: 'Jan Seva Admin' });
    batch.set(db.collection('users').doc(user.uid), { role: 'ADMIN', email: adminEmail, createdAt: ts() });
    batch.set(db.collection('meta').doc('bootstrap'), { doneAt: ts(), adminUid: user.uid, adminEmail });
    await batch.commit();
    res.json({ ok: true, adminUid: user.uid, seeded: { states: STATES.length, districts: districts.length, blocks: 2, services: 3 } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'bootstrap failed';
    res.status(500).json({ error: msg });
  }
});

app.use('/api/v1', requireAuth);

const ts = () => admin.firestore.FieldValue.serverTimestamp();
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

function genAppId(): string {
  return `APP-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function notify(recipientUserId: string, title: string, body: string, type: string, referenceId: string) {
  await db.collection('notifications').add({ recipientUserId, title, body, type, referenceId, read: false, createdAt: ts() });
  try {
    const snap = await db.collection('users').doc(recipientUserId).collection('fcmTokens').get();
    const tokens = snap.docs.map(d => d.id).filter(Boolean);
    if (tokens.length) {
      await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, data: { type, referenceId } });
    }
  } catch (e) { console.warn('FCM send failed', e); }
}

async function audit(actorUid: string, actorRole: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await db.collection('audit_logs').add({ actorUid, actorRole, action, entityType, entityId, before: before ?? null, after: after ?? null, createdAt: ts() });
}

async function userRegion(uid: string): Promise<Region & { name?: string }> {
  const u = (await db.collection('users').doc(uid).get()).data() || {};
  return { stateId: u.stateId, districtId: u.districtId, blockId: u.blockId, name: u.name };
}

// ---------------- Auth ----------------
// POST /api/v1/auth/session {phone?, name?}
app.post('/api/v1/auth/session', async (req: AuthedRequest, res: Response) => {
  const ref = db.collection('users').doc(req.uid!);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ role: 'PUBLIC_USER', phone: req.body.phone || null, name: req.body.name || null, status: 'ACTIVE', createdAt: ts(), updatedAt: ts() });
  }
  const u = (await ref.get()).data()!;
  await admin.auth().setCustomUserClaims(req.uid!, { role: u.role, cscId: u.cscId || null });
  res.json({ uid: req.uid, role: u.role, cscId: u.cscId || null, cscVerified: !!req.ctx?.cscOk });
});

// ---------------- Geo masters ----------------
app.get('/api/v1/geo/states', async (_req, res: Response) => {
  const s = await db.collection('states').where('active', '==', true).orderBy('name').get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});
app.get('/api/v1/geo/districts', async (req, res: Response) => {
  const s = await db.collection('districts').where('stateId', '==', String(req.query.stateId)).where('active', '==', true).orderBy('name').get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});
app.get('/api/v1/geo/blocks', async (req, res: Response) => {
  const s = await db.collection('blocks').where('districtId', '==', String(req.query.districtId)).where('active', '==', true).orderBy('name').get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});
app.get('/api/v1/geo/villages', async (req, res: Response) => {
  const s = await db.collection('villages').where('blockId', '==', String(req.query.blockId)).where('active', '==', true).orderBy('name').get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Save user's region (public profile)
app.patch('/api/v1/users/me/region', async (req: AuthedRequest, res: Response) => {
  const { stateId, districtId, blockId, villageId, pinCode } = req.body;
  if (!stateId) return res.status(400).json({ error: 'stateId required' });
  await db.collection('users').doc(req.uid!).update({ stateId, districtId: districtId || null, blockId: blockId || null, villageId: villageId || null, pinCode: pinCode || null, updatedAt: ts() });
  res.json({ ok: true });
});

// ---------------- Services (eligibility enforced) ----------------
app.get('/api/v1/services', async (req: AuthedRequest, res: Response) => {
  const region = await userRegion(req.uid!);
  if (!region.stateId) return res.status(400).json({ error: 'set your state first' });
  const [nat, st] = await Promise.all([
    db.collection('services').where('activeStatus', '==', true).where('serviceType', '==', 'NATIONAL').get(),
    db.collection('services').where('activeStatus', '==', true).where('stateId', '==', region.stateId).get(),
  ]);
  const seen = new Set<string>();
  const out = [...nat.docs, ...st.docs]
    .filter(d => !seen.has(d.id) && (seen.add(d.id), true))
    .map(d => ({ id: d.id, ...(d.data() as object) }) as unknown as ServiceDoc & { id: string })
    .filter(s => eligible(s, region));
  res.json(out);
});

app.get('/api/v1/services/:id', async (req: AuthedRequest, res: Response) => {
  const region = await userRegion(req.uid!);
  const d = await db.collection('services').doc(req.params.id).get();
  if (!d.exists) return res.status(404).json({ error: 'not found' });
  const s = { id: d.id, ...(d.data() as object) } as unknown as ServiceDoc & { id: string };
  if (!eligible(s, region)) return res.status(403).json({ error: 'service not eligible for your region' });
  res.json(s);
});

// ---------------- Nearby eligible CSCs ----------------
// GET /api/v1/csc/nearby?serviceId=&lat=&lng=&radiusKm=25
// Order: eligibility -> verified/active -> authorized -> distance sort.
app.get('/api/v1/csc/nearby', async (req: AuthedRequest, res: Response) => {
  const serviceId = String(req.query.serviceId || '');
  const sDoc = await db.collection('services').doc(serviceId).get();
  if (!sDoc.exists) return res.status(404).json({ error: 'service not found' });
  const s = sDoc.data() as ServiceDoc;

  let q: FirebaseFirestore.Query = db.collection('csc_centers')
    .where('verificationStatus', '==', 'VERIFIED')
    .where('accountStatus', '==', 'ACTIVE');
  if (s.serviceType !== 'NATIONAL' && s.stateId) q = q.where('stateId', '==', s.stateId);
  if ((s.serviceType === 'DISTRICT_SPECIFIC' || s.serviceType === 'BLOCK_SPECIFIC') && s.districtId) q = q.where('districtId', '==', s.districtId);
  if (s.serviceType === 'BLOCK_SPECIFIC' && s.blockId) q = q.where('blockId', '==', s.blockId);

  const snap = await q.limit(200).get();
  let list = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as object) }) as unknown as CscDoc & { id: string })
    .filter(c => cscFitsService(c, s))
    .filter(c => !c.authorizedServiceIds || c.authorizedServiceIds.length === 0 || c.authorizedServiceIds.includes(serviceId));

  const lat = parseFloat(String(req.query.lat || ''));
  const lng = parseFloat(String(req.query.lng || ''));
  const radiusKm = parseFloat(String(req.query.radiusKm || '25'));
  if (!isNaN(lat) && !isNaN(lng)) {
    list = list
      .map(c => ({ ...c, distanceKm: Math.round(haversineKm(lat, lng, c.lat, c.lng) * 10) / 10 }))
      .filter(c => (c.distanceKm as number) <= radiusKm)
      .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number));
  }
  // Public card fields only — no internal data leaks.
  res.json(list.map(c => ({
    id: c.id, centerName: c.centerName, vleName: c.vleName,
    distanceKm: (c as unknown as { distanceKm?: number }).distanceKm ?? null,
    address: c.address, stateId: c.stateId, districtId: c.districtId,
    mobile: c.mobile, openHours: c.openHours || null, rating: c.rating || null,
  })));
});

// ---------------- CSC registration (public -> pending) ----------------
// POST /api/v1/csc/register {centerName, mobile, ...region, lat, lng}
app.post('/api/v1/csc/register', async (req: AuthedRequest, res: Response) => {
  const b = req.body;
  const required = ['centerName', 'vleName', 'mobile', 'address', 'stateId', 'districtId', 'pinCode', 'lat', 'lng'];
  for (const f of required) if (b[f] === undefined || b[f] === '') return res.status(400).json({ error: `missing ${f}` });
  const ref = db.collection('csc_centers').doc();
  await ref.set({
    ownerUserId: req.uid, centerName: b.centerName, vleName: b.vleName, mobile: b.mobile,
    email: b.email || null, cscIdNumber: b.cscIdNumber || null, address: b.address,
    stateId: b.stateId, districtId: b.districtId, blockId: b.blockId || null, villageId: b.villageId || null,
    pinCode: b.pinCode, lat: Number(b.lat), lng: Number(b.lng),
    geohash: '', photoUrl: b.photoUrl || null, documents: [],
    verificationStatus: 'PENDING', accountStatus: 'ACTIVE',
    createdAt: ts(), updatedAt: ts(),
  });
  // geohash computed server-side to avoid client tampering
  const { geohash } = await import('./lib/geo');
  await ref.update({ geohash: geohash(Number(b.lat), Number(b.lng)), updatedAt: ts() });
  await db.collection('users').doc(req.uid!).update({ role: 'CSC_SANCHALAK', cscId: ref.id, updatedAt: ts() });
  await admin.auth().setCustomUserClaims(req.uid!, { role: 'CSC_SANCHALAK', cscId: ref.id });
  // notify admins
  const admins = await db.collection('admin_users').where('active', '==', true).get();
  await Promise.all(admins.docs.map(a => notify(a.id, 'Naya CSC registration', `${b.centerName} verification ke liye pending hai`, 'CSC_REGISTERED', ref.id)));
  res.json({ cscId: ref.id, verificationStatus: 'PENDING' });
});

// ---------------- Applications ----------------
// POST /api/v1/applications {serviceId, cscId, applicationData} — transactional
app.post('/api/v1/applications', async (req: AuthedRequest, res: Response) => {
  const { serviceId, cscId, applicationData } = req.body;
  if (!serviceId || !cscId) return res.status(400).json({ error: 'serviceId and cscId required' });
  try {
    const appId = await db.runTransaction(async tx => {
      const uS = await tx.get(db.collection('users').doc(req.uid!));
      const sS = await tx.get(db.collection('services').doc(String(serviceId)));
      const cS = await tx.get(db.collection('csc_centers').doc(String(cscId)));
      if (!sS.exists) throw new Error('service not found');
      if (!cS.exists) throw new Error('csc not found');
      const u = uS.data()!, s = sS.data() as ServiceDoc, c = cS.data() as CscDoc;
      if (!eligible(s, { stateId: u.stateId, districtId: u.districtId, blockId: u.blockId })) throw new Error('service not eligible for your region');
      if (c.verificationStatus !== 'VERIFIED' || c.accountStatus !== 'ACTIVE') throw new Error('csc not verified/active');
      if (!cscFitsService(c, s)) throw new Error('csc region does not match service scope');
      if (c.authorizedServiceIds?.length && !c.authorizedServiceIds.includes(String(serviceId))) throw new Error('csc not authorized for this service');
      const id = genAppId();
      tx.set(db.collection('applications').doc(id), {
        applicantId: req.uid, applicantName: u.name || '', serviceId: String(serviceId),
        serviceName: s.name, serviceType: s.serviceType,
        applicantStateId: u.stateId, applicantDistrictId: u.districtId, applicantBlockId: u.blockId || null,
        selectedCscId: String(cscId), selectedCscStateId: c.stateId, selectedCscDistrictId: c.districtId,
        applicationData: applicationData || {}, status: 'NEW', createdAt: ts(), updatedAt: ts(),
      });
      tx.set(db.collection('application_status_history').doc(), {
        applicationId: id, fromStatus: null, toStatus: 'NEW', changedByUid: req.uid, note: 'Application submitted', createdAt: ts(),
      });
      return id;
    });
    const csc = (await db.collection('csc_centers').doc(String(cscId)).get()).data() as CscDoc;
    await notify(csc.ownerUserId, 'Nayi application aayi hai', `Application ${appId} aapke kendra par submit hui`, 'NEW_APPLICATION', appId);
    await notify(req.uid!, 'Application submit ho gayi', `Application ID: ${appId}`, 'APPLICATION_SUBMITTED', appId);
    res.json({ applicationId: appId, status: 'NEW' });
  } catch (e: unknown) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Public: my applications
app.get('/api/v1/applications/mine', async (req: AuthedRequest, res: Response) => {
  const s = await db.collection('applications').where('applicantId', '==', req.uid!).orderBy('createdAt', 'desc').limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Public: application detail + timeline (ownership enforced by rules + check)
app.get('/api/v1/applications/:id', async (req: AuthedRequest, res: Response) => {
  const d = await db.collection('applications').doc(req.params.id).get();
  if (!d.exists) return res.status(404).json({ error: 'not found' });
  const a = d.data()!;
  const own = a.applicantId === req.uid || a.selectedCscId === req.ctx?.cscId || req.ctx?.role === 'ADMIN';
  if (!own) return res.status(403).json({ error: 'forbidden' });
  const h = await db.collection('application_status_history').where('applicationId', '==', req.params.id).orderBy('createdAt', 'asc').get();
  res.json({ id: d.id, ...a, timeline: h.docs.map(x => x.data()) });
});

// ---------------- Sanchalak ----------------
app.get('/api/v1/sanchalak/applications', requireCsc, async (req: AuthedRequest, res: Response) => {
  let q: FirebaseFirestore.Query = db.collection('applications').where('selectedCscId', '==', req.ctx!.cscId!).orderBy('createdAt', 'desc');
  if (req.query.status) q = db.collection('applications').where('selectedCscId', '==', req.ctx!.cscId!).where('status', '==', String(req.query.status)).orderBy('createdAt', 'desc');
  const s = await q.limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.patch('/api/v1/sanchalak/applications/:id/status', requireCsc, async (req: AuthedRequest, res: Response) => {
  const { status, note } = req.body as { status: ApplicationStatus; note?: string };
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    await db.runTransaction(async tx => {
      const ref = db.collection('applications').doc(req.params.id);
      const d = await tx.get(ref);
      if (!d.exists) throw new Error('not found');
      const a = d.data()!;
      if (a.selectedCscId !== req.ctx!.cscId) throw new Error('not your application');
      if (!canTransition(a.status, status)) throw new Error(`invalid transition ${a.status} -> ${status}`);
      tx.update(ref, { status, updatedAt: ts() });
      tx.set(db.collection('application_status_history').doc(), {
        applicationId: req.params.id, fromStatus: a.status, toStatus: status, changedByUid: req.uid, note: note || '', createdAt: ts(),
      });
    });
    const a = (await db.collection('applications').doc(req.params.id).get()).data()!;
    await notify(a.applicantId, 'Application status update', `Aapki application ${req.params.id} ab: ${status}`, 'STATUS_CHANGED', req.params.id);
    res.json({ ok: true, status });
  } catch (e: unknown) { res.status(400).json({ error: (e as Error).message }); }
});

// ---------------- Documents (signed URLs) ----------------
app.post('/api/v1/applications/:id/documents/upload-url', async (req: AuthedRequest, res: Response) => {
  const { fileName, mimeType, sizeBytes, docType } = req.body;
  if (!fileName || !mimeType || !docType) return res.status(400).json({ error: 'fileName, mimeType, docType required' });
  if (!ALLOWED_MIME.includes(mimeType)) return res.status(400).json({ error: 'file type not allowed (pdf/jpg/jpeg/png only)' });
  if (Number(sizeBytes) > MAX_DOC_BYTES) return res.status(400).json({ error: 'file too large (max 10MB)' });
  const d = await db.collection('applications').doc(req.params.id).get();
  if (!d.exists) return res.status(404).json({ error: 'not found' });
  const a = d.data()!;
  const canUpload = a.applicantId === req.uid || a.selectedCscId === req.ctx?.cscId;
  if (!canUpload) return res.status(403).json({ error: 'forbidden' });
  const docId = db.collection('application_documents').doc().id;
  const storagePath = `applications/${req.params.id}/${docId}-${fileName}`;
  const [url] = await admin.storage().bucket().file(storagePath).getSignedUrl({ action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: mimeType });
  await db.collection('application_documents').doc(docId).set({
    applicationId: req.params.id, docType, fileName, mimeType, sizeBytes: Number(sizeBytes) || 0,
    storagePath, uploadedBy: req.uid, createdAt: ts(),
  });
  if (a.selectedCscId && req.uid === a.applicantId) {
    const csc = (await db.collection('csc_centers').doc(a.selectedCscId).get()).data() as CscDoc;
    await notify(csc.ownerUserId, 'Naya document upload hua', `Application ${req.params.id} me document joda gaya`, 'DOC_UPLOADED', req.params.id);
  }
  res.json({ uploadUrl: url, docId, storagePath });
});

app.get('/api/v1/applications/:id/documents/:docId/download', async (req: AuthedRequest, res: Response) => {
  const d = await db.collection('applications').doc(req.params.id).get();
  const doc = await db.collection('application_documents').doc(req.params.docId).get();
  if (!d.exists || !doc.exists) return res.status(404).json({ error: 'not found' });
  const a = d.data()!;
  const own = a.applicantId === req.uid || a.selectedCscId === req.ctx?.cscId || req.ctx?.role === 'ADMIN';
  if (!own || doc.data()!.applicationId !== req.params.id) return res.status(403).json({ error: 'forbidden' });
  const [url] = await admin.storage().bucket().file(doc.data()!.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
  res.json({ downloadUrl: url });
});

// ---------------- Admin ----------------
const adminOnly = requireRole('ADMIN');

// CSC verification queue + decisions
app.get('/api/v1/admin/csc', adminOnly, async (req, res: Response) => {
  let q: FirebaseFirestore.Query = db.collection('csc_centers').orderBy('createdAt', 'desc');
  if (req.query.verificationStatus) q = db.collection('csc_centers').where('verificationStatus', '==', String(req.query.verificationStatus)).orderBy('createdAt', 'desc');
  const s = await q.limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

app.patch('/api/v1/admin/csc/:id/verify', adminOnly, async (req: AuthedRequest, res: Response) => {
  const { decision, note } = req.body as { decision: 'VERIFIED' | 'REJECTED' | 'SUSPENDED'; note?: string };
  if (!['VERIFIED', 'REJECTED', 'SUSPENDED'].includes(decision)) return res.status(400).json({ error: 'bad decision' });
  const ref = db.collection('csc_centers').doc(req.params.id);
  const before = (await ref.get()).data();
  if (!before) return res.status(404).json({ error: 'not found' });
  await ref.update({ verificationStatus: decision, updatedAt: ts() });
  await audit(req.uid!, 'ADMIN', `CSC_${decision}`, 'csc_centers', req.params.id, { verificationStatus: before.verificationStatus }, { verificationStatus: decision, note: note || '' });
  await notify((before as CscDoc).ownerUserId,
    decision === 'VERIFIED' ? 'Aapka Kendra verify ho gaya' : `CSC status: ${decision}`,
    decision === 'VERIFIED' ? 'Ab aap public app me dikhenge' : (note || ''), 'CSC_VERIFICATION', req.params.id);
  res.json({ ok: true, verificationStatus: decision });
});

app.patch('/api/v1/admin/csc/:id/account', adminOnly, async (req: AuthedRequest, res: Response) => {
  const { accountStatus } = req.body as { accountStatus: 'ACTIVE' | 'INACTIVE' };
  if (!['ACTIVE', 'INACTIVE'].includes(accountStatus)) return res.status(400).json({ error: 'bad status' });
  const ref = db.collection('csc_centers').doc(req.params.id);
  const before = (await ref.get()).data();
  if (!before) return res.status(404).json({ error: 'not found' });
  await ref.update({ accountStatus, updatedAt: ts() });
  await audit(req.uid!, 'ADMIN', `CSC_ACCOUNT_${accountStatus}`, 'csc_centers', req.params.id, { accountStatus: before.accountStatus }, { accountStatus });
  res.json({ ok: true, accountStatus });
});

// Service CRUD (no code changes needed, ever)
app.post('/api/v1/admin/services', adminOnly, async (req: AuthedRequest, res: Response) => {
  const s = req.body as ServiceDoc;
  const err = validServiceScope(s);
  if (err) return res.status(400).json({ error: err });
  if (!s.name) return res.status(400).json({ error: 'name required' });
  const ref = db.collection('services').doc();
  await ref.set({ ...s, activeStatus: s.activeStatus !== false, createdAt: ts(), updatedAt: ts() });
  await audit(req.uid!, 'ADMIN', 'SERVICE_CREATE', 'services', ref.id, null, s);
  res.json({ id: ref.id });
});

app.patch('/api/v1/admin/services/:id', adminOnly, async (req: AuthedRequest, res: Response) => {
  const ref = db.collection('services').doc(req.params.id);
  const before = (await ref.get()).data();
  if (!before) return res.status(404).json({ error: 'not found' });
  const merged = { ...before, ...req.body } as ServiceDoc;
  const err = validServiceScope(merged);
  if (err) return res.status(400).json({ error: err });
  await ref.update({ ...req.body, updatedAt: ts() });
  await audit(req.uid!, 'ADMIN', 'SERVICE_UPDATE', 'services', req.params.id, before, req.body);
  res.json({ ok: true });
});

// All applications: search/filter/monitor
app.get('/api/v1/admin/applications', adminOnly, async (req, res: Response) => {
  let q: FirebaseFirestore.Query = db.collection('applications').orderBy('createdAt', 'desc');
  if (req.query.status) q = db.collection('applications').where('status', '==', String(req.query.status)).orderBy('createdAt', 'desc');
  const s = await q.limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Reassign application to another CSC (admin only, audited)
app.post('/api/v1/admin/applications/:id/reassign', adminOnly, async (req: AuthedRequest, res: Response) => {
  const { newCscId, note } = req.body;
  if (!newCscId) return res.status(400).json({ error: 'newCscId required' });
  const ref = db.collection('applications').doc(req.params.id);
  const before = (await ref.get()).data();
  if (!before) return res.status(404).json({ error: 'not found' });
  const nc = (await db.collection('csc_centers').doc(String(newCscId)).get()).data() as CscDoc | undefined;
  if (!nc || nc.verificationStatus !== 'VERIFIED' || nc.accountStatus !== 'ACTIVE') return res.status(400).json({ error: 'target csc not eligible' });
  await ref.update({ selectedCscId: String(newCscId), selectedCscStateId: nc.stateId, selectedCscDistrictId: nc.districtId, updatedAt: ts() });
  await db.collection('application_status_history').add({ applicationId: req.params.id, fromStatus: before.status, toStatus: before.status, changedByUid: req.uid, note: `Reassigned to ${nc.centerName}. ${note || ''}`, createdAt: ts() });
  await audit(req.uid!, 'ADMIN', 'APPLICATION_REASSIGN', 'applications', req.params.id, { selectedCscId: before.selectedCscId }, { selectedCscId: newCscId });
  await notify(nc.ownerUserId, 'Application reassign hui hai', `Application ${req.params.id} ab aapke kendra par hai`, 'REASSIGNED', req.params.id);
  res.json({ ok: true });
});

app.get('/api/v1/admin/audit-logs', adminOnly, async (_req, res: Response) => {
  const s = await db.collection('audit_logs').orderBy('createdAt', 'desc').limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Admin: list services (Service Management page)
app.get('/api/v1/admin/services', adminOnly, async (req, res: Response) => {
  let q: FirebaseFirestore.Query = db.collection('services').orderBy('createdAt', 'desc');
  if (req.query.serviceType) q = db.collection('services').where('serviceType', '==', String(req.query.serviceType)).orderBy('createdAt', 'desc');
  const s = await q.limit(200).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Admin: list users (role filter: PUBLIC_USER / CSC_SANCHALAK)
app.get('/api/v1/admin/users', adminOnly, async (req, res: Response) => {
  let q: FirebaseFirestore.Query = db.collection('users').orderBy('createdAt', 'desc');
  if (req.query.role) q = db.collection('users').where('role', '==', String(req.query.role)).orderBy('createdAt', 'desc');
  const s = await q.limit(100).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Admin: geo master writes (states/districts/blocks/villages) — audited
const GEO_COLLECTIONS = ['states', 'districts', 'blocks', 'villages'];
app.post('/api/v1/admin/geo/:collection', adminOnly, async (req: AuthedRequest, res: Response) => {
  const col = req.params.collection;
  if (!GEO_COLLECTIONS.includes(col)) return res.status(400).json({ error: 'bad collection' });
  if (!req.body.name) return res.status(400).json({ error: 'name required' });
  const ref = db.collection(col).doc();
  await ref.set({ ...req.body, active: req.body.active !== false, createdAt: ts() });
  await audit(req.uid!, 'ADMIN', 'GEO_CREATE', col, ref.id, null, req.body);
  res.json({ id: ref.id });
});

app.patch('/api/v1/admin/geo/:collection/:id', adminOnly, async (req: AuthedRequest, res: Response) => {
  const col = req.params.collection;
  if (!GEO_COLLECTIONS.includes(col)) return res.status(400).json({ error: 'bad collection' });
  const ref = db.collection(col).doc(req.params.id);
  const before = (await ref.get()).data();
  if (!before) return res.status(404).json({ error: 'not found' });
  await ref.update({ ...req.body, updatedAt: ts() });
  await audit(req.uid!, 'ADMIN', 'GEO_UPDATE', col, req.params.id, before, req.body);
  res.json({ ok: true });
});

// Sanchalak: apne center ki application ka detail (documents + applicant info ke saath)
app.get('/api/v1/sanchalak/applications/:id', requireCsc, async (req: AuthedRequest, res: Response) => {
  const d = await db.collection('applications').doc(req.params.id).get();
  if (!d.exists) return res.status(404).json({ error: 'not found' });
  const a = d.data()!;
  if (a.selectedCscId !== req.ctx!.cscId) return res.status(403).json({ error: 'not your application' });
  const docs = await db.collection('application_documents').where('applicationId', '==', req.params.id).get();
  const applicant = (await db.collection('users').doc(a.applicantId).get()).data() || {};
  const state = (await db.collection('states').doc(a.applicantStateId).get()).data() || {};
  const district = (await db.collection('districts').doc(a.applicantDistrictId).get()).data() || {};
  res.json({
    id: d.id,
    applicant: { name: a.applicantName, phone: applicant.phone || '', state: state.name || a.applicantStateId, district: district.name || a.applicantDistrictId },
    serviceName: a.serviceName, status: a.status, applicationData: a.applicationData || {},
    documents: docs.docs.map(x => ({ id: x.id, docType: x.data().docType, fileName: x.data().fileName, mimeType: x.data().mimeType })),
    updatedAt: a.updatedAt,
  });
});

// Notifications inbox — sirf apne notifications
app.get('/api/v1/notifications', async (req: AuthedRequest, res: Response) => {
  const s = await db.collection('notifications').where('recipientUserId', '==', req.uid!).orderBy('createdAt', 'desc').limit(50).get();
  res.json(s.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Sanchalak: apne center ka profile (photoUrl ke saath)
app.get('/api/v1/csc/me', async (req: AuthedRequest, res: Response) => {
  const u = (await db.collection('users').doc(req.uid!).get()).data() || {};
  if (u.role !== 'CSC_SANCHALAK' || !u.cscId) return res.status(403).json({ error: 'not a csc owner' });
  const c = await db.collection('csc_centers').doc(u.cscId).get();
  if (!c.exists) return res.status(404).json({ error: 'not found' });
  res.json({ id: c.id, ...c.data() });
});

// Sanchalak: signed URL for center photo / registration documents (owner only; allowed while PENDING)
app.post('/api/v1/csc/me/documents/upload-url', async (req: AuthedRequest, res: Response) => {
  const u = (await db.collection('users').doc(req.uid!).get()).data() || {};
  if (u.role !== 'CSC_SANCHALAK' || !u.cscId) return res.status(403).json({ error: 'not a csc owner' });
  const { fileName, mimeType, sizeBytes } = req.body;
  if (!fileName || !mimeType) return res.status(400).json({ error: 'fileName, mimeType required' });
  if (!ALLOWED_MIME.includes(mimeType)) return res.status(400).json({ error: 'file type not allowed (pdf/jpg/jpeg/png only)' });
  if (Number(sizeBytes) > MAX_DOC_BYTES) return res.status(400).json({ error: 'file too large (max 10MB)' });
  const storagePath = `csc/${u.cscId}/${Date.now()}-${String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const [url] = await admin.storage().bucket().file(storagePath).getSignedUrl({ action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType: mimeType });
  res.json({ uploadUrl: url, storagePath });
});

// Sanchalak: update own center profile (photoUrl, contact etc.) — verificationStatus cannot be touched here
app.patch('/api/v1/csc/me', async (req: AuthedRequest, res: Response) => {
  const u = (await db.collection('users').doc(req.uid!).get()).data() || {};
  if (u.role !== 'CSC_SANCHALAK' || !u.cscId) return res.status(403).json({ error: 'not a csc owner' });
  const allowed = ['centerName', 'vleName', 'mobile', 'email', 'address', 'pinCode', 'photoUrl', 'openHours'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
  await db.collection('csc_centers').doc(u.cscId).update({ ...patch, updatedAt: ts() });
  res.json({ ok: true });
});

// Sanchalak: signed read URL for own center photo
app.get('/api/v1/csc/me/photo', async (req: AuthedRequest, res: Response) => {
  const u = (await db.collection('users').doc(req.uid!).get()).data() || {};
  if (u.role !== 'CSC_SANCHALAK' || !u.cscId) return res.status(403).json({ error: 'not a csc owner' });
  const c = (await db.collection('csc_centers').doc(u.cscId).get()).data() || {};
  if (!c.photoUrl) return res.status(404).json({ error: 'no photo' });
  const [url] = await admin.storage().bucket().file(c.photoUrl).getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 });
  res.json({ downloadUrl: url });
});



export default app;
