// Shared domain types for Jan Seva Kendra backend.
export type Role = 'PUBLIC_USER' | 'CSC_SANCHALAK' | 'ADMIN';
export type ServiceType = 'NATIONAL' | 'STATE_SPECIFIC' | 'DISTRICT_SPECIFIC' | 'BLOCK_SPECIFIC';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type AccountStatus = 'ACTIVE' | 'INACTIVE';
export type ApplicationStatus = 'NEW' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface Region {
  stateId: string;
  districtId?: string;
  blockId?: string;
}

export interface ServiceDoc {
  name: string;
  description: string;
  category: string;
  serviceType: ServiceType;
  stateId?: string;
  districtId?: string;
  blockId?: string;
  requiredDocuments: { name: string; mime: string[]; mandatory: boolean }[];
  applicationFee: number;
  estimatedProcessingTimeDays: number;
  activeStatus: boolean;
}

export interface CscDoc extends Region {
  ownerUserId: string;
  centerName: string;
  vleName: string;
  mobile: string;
  address: string;
  pinCode: string;
  lat: number;
  lng: number;
  geohash: string;
  verificationStatus: VerificationStatus;
  accountStatus: AccountStatus;
  authorizedServiceIds?: string[];
  rating?: number;
  openHours?: string;
}

export interface ApplicationDoc {
  applicantId: string;
  applicantName: string;
  serviceId: string;
  serviceName: string;
  serviceType: ServiceType;
  applicantStateId: string;
  applicantDistrictId: string;
  applicantBlockId?: string | null;
  selectedCscId: string;
  selectedCscStateId: string;
  selectedCscDistrictId: string;
  applicationData: Record<string, unknown>;
  status: ApplicationStatus;
}
