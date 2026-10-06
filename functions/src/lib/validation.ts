// Eligibility + state-machine validation. Single source of truth used by
// every endpoint: service list, service detail, application create,
// CSC nearby matching. Frontend filtering is cosmetic only.
import { Region, ServiceDoc } from './types';

export function eligible(service: ServiceDoc, user: Region): boolean {
  if (!service.activeStatus) return false;
  switch (service.serviceType) {
    case 'NATIONAL':
      return true;
    case 'STATE_SPECIFIC':
      return service.stateId === user.stateId;
    case 'DISTRICT_SPECIFIC':
      return service.stateId === user.stateId && service.districtId === user.districtId;
    case 'BLOCK_SPECIFIC':
      return (
        service.stateId === user.stateId &&
        service.districtId === user.districtId &&
        service.blockId === user.blockId
      );
    default:
      return false;
  }
}

// CSC must sit inside the service's region scope (never nearest-first).
export function cscFitsService(csc: Region, service: ServiceDoc): boolean {
  switch (service.serviceType) {
    case 'NATIONAL':
      return true;
    case 'STATE_SPECIFIC':
      return csc.stateId === service.stateId;
    case 'DISTRICT_SPECIFIC':
      return csc.stateId === service.stateId && csc.districtId === service.districtId;
    case 'BLOCK_SPECIFIC':
      return (
        csc.stateId === service.stateId &&
        csc.districtId === service.districtId &&
        csc.blockId === service.blockId
      );
    default:
      return false;
  }
}

const TRANSITIONS: Record<string, string[]> = {
  NEW: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

// Service region-scope sanity check for admin CRUD.
export function validServiceScope(s: ServiceDoc): string | null {
  switch (s.serviceType) {
    case 'NATIONAL':
      return s.stateId || s.districtId || s.blockId ? 'NATIONAL service must not carry region ids' : null;
    case 'STATE_SPECIFIC':
      return !s.stateId ? 'STATE_SPECIFIC needs stateId' : null;
    case 'DISTRICT_SPECIFIC':
      return !s.stateId || !s.districtId ? 'DISTRICT_SPECIFIC needs stateId + districtId' : null;
    case 'BLOCK_SPECIFIC':
      return !s.stateId || !s.districtId || !s.blockId ? 'BLOCK_SPECIFIC needs stateId + districtId + blockId' : null;
    default:
      return 'unknown serviceType';
  }
}
