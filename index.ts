// Firebase Functions entry — shared Express app ka thin wrapper.
// (Blaze plan chahiye; free route ke liye server.ts + Render use karo.)
import { onRequest } from 'firebase-functions/v2/https';
import app from './app';

export const api = onRequest({ region: 'asia-south1', timeoutSeconds: 60, maxInstances: 20 }, app);
