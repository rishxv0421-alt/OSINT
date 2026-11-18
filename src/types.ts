export interface AdvTelecomRecord {
  mobile: string;
  name: string;
  fatherOrGuardian: string;
  address: string;
  alternateNumber: string;
  circle: string;
  documentId: string;
  email: string;
}

export interface DorkEntry {
  platform: string;
  label: string;
  query: string;
  url: string;
}

export interface CyberNumberDossier {
  brand: string;
  engine: string;
  query: string;
  clean10Digit: string;
  internationalFormat: string;
  nationalFormat: string;
  countryCode: string;
  carrierMeta: {
    valid: boolean;
    type: string;
    country: string;
  };
  advRecords: AdvTelecomRecord[];
  uniqueNames: string[];
  uniqueCircles: string[];
  uniqueEmails: string[];
  uniqueAddresses: string[];
  socialPresence: {
    whatsapp: {
      reachable: boolean | null;
      chatUrl: string;
      apiUrl: string;
    };
    truecallerWeb: {
      found: boolean;
      name: string | null;
      searchUrl: string;
      description: string | null;
    };
    telegramUrl: string;
    viberDeepLink: string;
    skypeSearchUrl: string;
  };
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
  apiSourceStatus: 'live' | 'empty' | 'error';
  errorMessage?: string;
  plainTextReport?: string;
}

export interface UpiVpaCandidate {
  vpa: string;
  prefix: string;
  handle: string;
  psp: string;
  bank: string;
  tier: number;
  verifiedStatus: 'verified_active' | 'verified_inactive' | 'candidate';
  holderName: string | null;
  deepPayUri: string;
}

export interface UpiOsintDossier {
  brand: string;
  query: string;
  inputType: 'vpa' | 'phone';
  normalizedPhone: string | null;
  subscriberCorrelatedName: string | null;
  subscriberCircle: string | null;
  liveGatewayConfigured: boolean;
  primaryPsp: string | null;
  vpaCandidates: UpiVpaCandidate[];
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
}

export interface AadhaarOcrResult {
  brand: string;
  ok: boolean;
  extractedName: string | null;
  extractedDob: string | null;
  extractedGender: string | null;
  extractedMobile: string | null;
  extractedAadhaar: string | null;
  aadhaarChecksumValid: boolean;
  extractedAddress: string | null;
  rawText: string;
  confidence: number;
  durationMs: number;
  error?: string;
}

export interface UsernameReconDossier {
  brand: string;
  handle: string;
  profileUrl: string;
  liveTelegramProfile: {
    exists: boolean;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    membersOrSubscribers: string | null;
  };
  extractedPhonesFromBio: string[];
  extractedLinksFromBio: string[];
  prefixGeneratorMatrix: Array<{
    country: string;
    dialCode: string;
    operator: string;
    prefixes: string[];
    sampleGenerated: string[];
  }>;
  crossPlatformLinks: Array<{ platform: string; url: string }>;
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
}

export interface BotOverviewResponse {
  botStatus: {
    running: boolean;
    bot: {
      id: number;
      first_name: string;
      username: string;
    } | null;
    lastPollTimestamp: number;
    processedUpdatesCount: number;
    lastError: string | null;
    tokenMasked: string;
    welcomeVideos?: string[];
  };
  stats: {
    totalUsers: number;
    bannedUsers: number;
    totalTokens: number;
    totalQueries: number;
    advQueries: number;
  };
  settings: Record<string, string>;
  previewIntro: string;
}

export interface BotUserRow {
  user_id: number;
  username: string;
  first_name: string;
  tokens: number;
  referral_count: number;
  joined_at: number;
  banned: number;
  total_queries: number;
}

export interface QueryLogRow {
  id: number;
  source: string;
  user_id: number;
  username: string;
  service: string;
  query: string;
  status: string;
  records_found: number;
  duration_ms: number;
  created_at: number;
}
