/**
 * Request and response types for every /api endpoint, derived from the
 * backend route handlers, services and SQL column aliases. Nullable columns
 * are typed `| null`; integer flags from SQL (e.g. `wantToPractice`) stay
 * numbers (0/1) because that is what the API returns.
 */

// ---------------------------------------------------------------- shared

export type WordStatus = "unknown" | "learning" | "known";

/** A study language the user is enrolled in. */
export interface Language {
  id: number;
  name: string;
}

/** Signed-in user as returned by /api/auth/me, login and register. */
export interface User {
  id: number;
  email: string;
  displayName: string;
  createdAt: string;
  nativeLanguage: string;
  practiceWordsPerSession: number;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
}

/** PATCH /api/settings returns the user without the admin flags; merge it into the session user. */
export type SettingsUser = Omit<User, "isAdmin" | "isSuperadmin">;

export interface AuthProviders {
  google?: boolean;
}

/** A dictionary sense offered to disambiguate a word's translation. */
export interface DisambiguationCandidate {
  source: string;
  translation: string;
  pos: string;
}

export interface Collection {
  id: number;
  name: string;
  languageId: number;
  languageName: string;
}

// ---------------------------------------------------------------- auth

export interface SessionResponse {
  csrfToken: string | null;
  user: User | null;
  languages: Language[];
  /** Present for signed-in users: true when no study language is enrolled. */
  needsOnboarding?: boolean;
  studyLanguageOptions: string[];
  nativeLanguageOptions: string[];
  authProviders: AuthProviders;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface RegisterRequest extends Credentials {
  confirmPassword: string;
}

export interface AuthResponse {
  csrfToken: string;
  user: User;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

// ---------------------------------------------------------------- languages

export interface LanguagesResponse {
  languages: Language[];
  studyLanguageOptions: string[];
}

export interface AddLanguageResponse extends LanguagesResponse {
  language: Language & { userId?: number };
}

// ---------------------------------------------------------------- dashboard

export interface CollectionStats extends Collection {
  totalWords: number;
  knownWords: number;
  learningWords: number;
  unknownWords: number;
}

export interface DashboardResponse {
  languages: Language[];
  studyLanguageOptions: string[];
  selectedLanguageId: number | null;
  totalWords: number;
  knownWords: number;
  learningWords: number;
  wantToPracticeWords: number;
  unknownWords: number;
  /** Collections of the selected language. */
  collections: CollectionStats[];
  /** Collections of every language. */
  allCollections: CollectionStats[];
}

export type ImportStatus = "processing" | "ready" | "failed";

export interface DashboardDocument {
  id: number;
  title: string;
  fileName: string;
  fileType: string;
  importedWordCount: number;
  readerStart: number;
  createdAt: string;
  importStatus: ImportStatus;
  languageName: string;
  totalTokens: number;
  readTokens: number;
  totalWords: number;
  knownWords: number;
  learningWords: number;
  unknownWords: number;
}

export interface DashboardDocumentsParams {
  languageId?: number | null;
  search?: string;
  /** 1–50, default 24. */
  limit?: number;
  offset?: number;
}

export interface DashboardDocumentsResponse {
  documents: DashboardDocument[];
  pageSize: number;
  offset: number;
}

// ---------------------------------------------------------------- materials

export interface TranslationStatus {
  targetLanguage: string;
  ready: boolean;
  totalWords: number;
  completedWords: number;
  missingWords: number;
}

export interface Material {
  id: number;
  title: string;
  fileName: string;
  fileType: string;
  wordCount: number;
  readerStart: number;
  createdAt: string;
  importStatus: ImportStatus;
  importTotal: number | null;
  importProcessed: number | null;
  importError: string | null;
}

/** Row of GET /api/materials. */
export interface MaterialListItem extends Material {
  translationStatus: TranslationStatus;
}

/** Material as returned by the single-material endpoints. */
export interface MaterialDetail extends Material {
  userId: number;
  languageId: number;
  languageName: string;
}

export interface MaterialsParams {
  languageId: number;
  offset?: number;
  search?: string;
}

export interface MaterialsResponse {
  materials: MaterialListItem[];
  /** Always 50. */
  pageSize: number;
}

export interface UploadMaterialRequest {
  languageId: number;
  file: File;
}

export interface UploadMaterialResponse {
  material: MaterialDetail;
}

export interface MaterialReaderParams {
  /** Token offset; omitted = the stored reading position. */
  start?: number;
  /** 50–1000, default 250. */
  limit?: number;
}

export interface ReaderToken {
  id: number;
  position: number;
  surface: string;
  lemma: string;
  pos: string | null;
  conjugationForm: string | null;
  wordId: number;
  blockIndex: number | null;
  blockType: string | null;
  leadingText: string | null;
  trailingText: string | null;
  dictionaryForm: string;
  wordPos: string | null;
  posSubcategory: string | null;
  reading: string | null;
  pinyin: string | null;
  traditional: string | null;
  canonicalTranslation: string | null;
  translationOverride: string | null;
  translation: string;
  status: WordStatus;
  wantToPractice: number;
  disambiguationCandidates?: DisambiguationCandidate[];
}

export interface MaterialReaderResponse {
  material: MaterialDetail;
  /** Empty while the material is importing or its translations are not ready. */
  tokens: ReaderToken[];
  start: number;
  limit: number;
  nativeLanguage: string;
  translationStatus: TranslationStatus;
}

export interface UpdateMaterialRequest {
  title?: string;
  readerStart?: number;
}

export interface MaterialResponse {
  material: MaterialDetail;
}

export interface DeletedResponse {
  deleted: true;
  id: number;
}

// ---------------------------------------------------------------- words

/** Row of the vocab word lists. */
export interface Word {
  id: number;
  collectionId: number;
  collectionName: string;
  languageName: string;
  word: string;
  lemma: string;
  translation: string;
  canonicalTranslation: string | null;
  translationOverride: string | null;
  pos: string | null;
  posSubcategory: string | null;
  reading: string | null;
  pinyin: string | null;
  traditional: string | null;
  status: WordStatus;
  disambiguationCandidates?: DisambiguationCandidate[];
}

/** Single word as returned by PATCH /api/words/:id, want-to-practice and translation-override. */
export interface WordDetail {
  id: number;
  collectionId: number;
  word: string;
  translation: string;
  canonicalTranslation: string | null;
  translationOverride: string | null;
  lemma: string;
  pos: string | null;
  posSubcategory: string | null;
  reading: string | null;
  pinyin: string | null;
  traditional: string | null;
  status: WordStatus;
  wantToPractice: number;
}

export interface WordListParams {
  search?: string;
}

export interface LanguageWordsResponse {
  language: Language & { userId: number };
  words: Word[];
}

export interface CollectionWordsResponse {
  collection: Collection;
  words: Word[];
}

export interface DeleteWordsResponse {
  deleted: number;
  skipped: number;
}

export interface SetWordsStatusResponse {
  updated: number;
  skipped: number;
  status: WordStatus;
}

export interface MoveWordsResponse {
  collection: Collection;
  moved: number;
  skipped: number;
}

// ---------------------------------------------------------------- imports

export interface ImportWordRow {
  word: string;
  translation: string;
}

/** Pass `collectionId` to add to an existing collection, or `collectionName` to create one. */
export interface ImportWordsRequest {
  languageId: number;
  collectionId?: number;
  collectionName?: string;
  words: ImportWordRow[];
}

export interface ImportWordsResponse {
  collection: Collection;
  parsed: number;
  inserted: number;
  skipped: number;
}

// ---------------------------------------------------------------- practice

export type PracticeMode = "marked";

export interface PracticeCard {
  wordId: number;
  word: string;
  translation: string;
  reading: string;
  pinyin: string;
  clickCount: number;
}

export interface PracticeSessionParams {
  languageId: number;
  /** "marked" = only words flagged want-to-practice; omit for the standard session. */
  mode?: PracticeMode;
}

export interface PracticeSession {
  languageId: number;
  languageName: string;
  requested: number;
  validCount: number;
  insufficient: boolean;
  words: PracticeCard[];
  mode?: PracticeMode;
}

// ---------------------------------------------------------------- settings

export interface UpdateSettingsRequest {
  nativeLanguage?: string;
  practiceWordsPerSession?: number;
  /** Sent by the legacy client; ignored by the server. */
  activeStudyLanguage?: string;
}

export interface UpdateSettingsResponse {
  user: SettingsUser;
  nativeLanguageOptions: string[];
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ---------------------------------------------------------------- admin

export interface AdminUser {
  id: number;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  isSuperadmin: boolean;
  materialCount: number;
  maxMaterials: number;
  maxUploadBytes: number;
  maxMaterialsOverride: number | null;
  maxUploadBytesOverride: number | null;
}

export interface AdminUsersCursor {
  value: string;
  id: number;
}

export interface AdminUsersParams {
  sort?: "email" | "created_at";
  search?: string;
  /** ISO date. */
  createdAfter?: string;
  cursorValue?: string;
  cursorId?: number;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  nextCursor: AdminUsersCursor | null;
}

/** Null clears an override (back to the global default). */
export interface SetUserLimitsRequest {
  maxMaterials: number | null;
  maxUploadBytes: number | null;
}

export interface SetUserLimitsResponse {
  user: Omit<AdminUser, "createdAt" | "materialCount">;
}

export interface AdminWordLanguagesResponse {
  languages: Language[];
  nativeLanguageOptions: string[];
}

export interface AdminWord {
  id: number;
  word: string;
  lemma: string;
  canonicalTranslation: string;
}

export interface AdminWordsParams {
  languageId: number;
  /** Native language of the translation column; default English. */
  native?: string;
  search?: string;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
  limit?: number;
}

export interface AdminWordsResponse {
  words: AdminWord[];
  nextCursor: string | null;
  nativeLanguage: string;
}

export interface SetCanonicalTranslationRequest {
  native?: string;
  translation: string;
}

export interface SuperadminTargetResponse {
  user: { id: number; email: string; isAdmin: boolean };
}

export interface AuditEntry {
  id: number;
  actorId: number;
  actorEmail: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
