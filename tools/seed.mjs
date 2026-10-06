// Seed script: states/UTs, sample districts/blocks, sample services.
// Run:  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node tools/seed.mjs
// Uses Firebase Admin SDK with full privileges — run once per environment.
import admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON first.');
  process.exit(1);
}
admin.initializeApp();
const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

const STATES = [
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

async function main() {
  const batch = db.batch();
  for (const [code, name, type] of STATES) {
    batch.set(db.collection('states').doc(code), { code, name, type, active: true, createdAt: ts() });
  }
  // Sample districts (UP + Bihar) — full district lists admin panel se add honge
  const districts = [
    ['UP-BAH', 'UP', 'Bahraich'], ['UP-LKO', 'UP', 'Lucknow'], ['UP-VNS', 'UP', 'Varanasi'],
    ['BR-PAT', 'BR', 'Patna'], ['BR-GAY', 'BR', 'Gaya'],
  ];
  for (const [id, stateId, name] of districts) {
    batch.set(db.collection('districts').doc(id), { stateId, name, code: id, active: true, createdAt: ts() });
  }
  const blocks = [
    ['UP-BAH-BLK1', 'UP-BAH', 'Bahraich Sadar', 'BLOCK'], ['UP-LKO-BLK1', 'UP-LKO', 'Lucknow Sadar', 'BLOCK'],
  ];
  for (const [id, districtId, name, type] of blocks) {
    batch.set(db.collection('blocks').doc(id), { districtId, name, type, active: true, createdAt: ts() });
  }
  // Sample services: 1 national, 1 state-specific, 1 district-specific
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
    serviceType: 'STATE_SPECIFIC', stateId: 'UP', requiredDocuments: [
      { name: 'Aadhaar Card', mime: ['application/pdf', 'image/jpeg', 'image/png'], mandatory: true },
      { name: 'Ration Card', mime: ['application/pdf', 'image/jpeg', 'image/png'], mandatory: false },
    ],
    applicationFee: 30, estimatedProcessingTimeDays: 10, activeStatus: true, createdAt: ts(), updatedAt: ts(),
  });
  batch.set(db.collection('services').doc('svc-bahraich-local'), {
    name: 'Bahraich Zila Seva', description: 'Sirf Bahraich zila ke liye sthaniya seva', category: 'Local',
    serviceType: 'DISTRICT_SPECIFIC', stateId: 'UP', districtId: 'UP-BAH', requiredDocuments: [
      { name: 'Aadhaar Card', mime: ['application/pdf', 'image/jpeg', 'image/png'], mandatory: true },
    ],
    applicationFee: 0, estimatedProcessingTimeDays: 7, activeStatus: true, createdAt: ts(), updatedAt: ts(),
  });
  await batch.commit();
  console.log(`Seeded ${STATES.length} states/UTs, ${districts.length} districts, ${blocks.length} blocks, 3 services.`);
}

main().catch(e => { console.error(e); process.exit(1); });
