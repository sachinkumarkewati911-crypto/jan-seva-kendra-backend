// Auth middleware: verifies Firebase ID token, then loads role + CSC
// verification status FRESH from Firestore on every request.
// Custom claims are hints; the database is the authority.
import { NextFunction, Request, Response } from 'express';
import * as admin from 'firebase-admin';

export interface RequestContext {
  role: string;
  cscId?: string;
  cscOk: boolean; // VERIFIED + ACTIVE + owned by caller
}

export interface AuthedRequest extends Request {
  uid?: string;
  ctx?: RequestContext;
}

const db = () => admin.firestore();

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    req.uid = decoded.uid;
    const snap = await db().collection('users').doc(decoded.uid).get();
    const u = snap.data() || {};
    let cscOk = false;
    const cscId: string | undefined = u.cscId;
    if (u.role === 'CSC_SANCHALAK' && cscId) {
      const c = await db().collection('csc_centers').doc(cscId).get();
      const cd = c.data() || {};
      cscOk =
        cd.ownerUserId === decoded.uid &&
        cd.verificationStatus === 'VERIFIED' &&
        cd.accountStatus === 'ACTIVE';
    }
    req.ctx = { role: u.role || 'PUBLIC_USER', cscId, cscOk };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.ctx || !roles.includes(req.ctx.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// Sanchalak endpoints: caller must own a VERIFIED + ACTIVE center.
export function requireCsc(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.ctx?.cscOk) return res.status(403).json({ error: 'csc not verified/active' });
  next();
}
