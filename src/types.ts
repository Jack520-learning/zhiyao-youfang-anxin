export type UserRole = "elder" | "family";

export type RiskLevel = "low" | "medium" | "high" | "unknown" | "emergency";

export type MedicationStatus = "active" | "stopped" | "pending";

export type DoseStatus = "taken" | "later" | "skipped" | "unsure" | "pending";

export type SourceType =
  | "prescription"
  | "medicine-label"
  | "risk-rule"
  | "safety-policy"
  | "professional-note";

export interface KnowledgeSource {
  id: string;
  title: string;
  type: SourceType;
  excerpt: string;
  reviewed: boolean;
}

export interface MedicationSource {
  type: SourceType;
  title: string;
  capturedAt: string;
  imageDataUrl?: string;
  confirmed: boolean;
}

export interface Medication {
  id: string;
  name: string;
  genericName: string;
  ingredients: string[];
  dosage: string;
  frequency: string;
  times: string[];
  relation: string;
  instructions: string;
  price?: string;
  startDate: string;
  endDate?: string;
  status: MedicationStatus;
  reminderEnabled: boolean;
  source: MedicationSource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface DoseEvent {
  id: string;
  medicationId: string;
  scheduledAt: string;
  status: DoseStatus;
  updatedAt: string;
  note?: string;
}

export interface RiskCheck {
  id: string;
  level: RiskLevel;
  title: string;
  summary: string;
  nextStep: string;
  reasons: string[];
  sourceIds: string[];
  involvedMedicationIds: string[];
  medicationSnapshot: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  imageDataUrls?: string[];
  riskCheck?: RiskCheck;
  pending?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  medicineContext?: IntakeDraft;
}

export interface LocalAccount {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  familyCode: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

export interface ElderProfile {
  name: string;
  age: number;
  conditions: string[];
  allergies: string[];
  timeZone: string;
  visionPreference: "standard" | "large" | "extra-large";
  voiceEnabled: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  kind: "family" | "caregiver" | "emergency";
}

export interface ConsentSettings {
  shareMedicationSummary: boolean;
  shareMissedDose: boolean;
  shareHighRisk: boolean;
  shareEmergency: boolean;
  allowSosContact: boolean;
}

export interface AuditEvent {
  id: string;
  type:
    | "medication-added"
    | "medication-updated"
    | "dose-updated"
    | "risk-checked"
    | "settings-updated"
    | "data-exported"
    | "data-deleted"
    | "sos-opened";
  summary: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface IntakeDraft {
  imageDataUrl?: string;
  rawText: string;
  name: string;
  genericName: string;
  ingredientsText: string;
  dosage: string;
  frequency: string;
  times: string[];
  relation: string;
  instructions: string;
  price?: string;
  confidence: number;
  lowConfidenceFields: string[];
  createdAt: string;
}

export interface AppPreferences {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  highContrast: boolean;
  fontScale: "standard" | "large" | "extra-large";
}

export interface FamilyAlert {
  id: string;
  type: "concern" | "sos";
  title: string;
  message: string;
  createdAt: string;
  handledAt?: string;
  handledBy?: string;
}

export interface AppState {
  schemaVersion: number;
  role: UserRole;
  accounts: LocalAccount[];
  sessionAccountId?: string;
  familyCode: string;
  profile: ElderProfile;
  emergencyContacts: EmergencyContact[];
  consent: ConsentSettings;
  medications: Medication[];
  doseEvents: DoseEvent[];
  riskChecks: RiskCheck[];
  conversations: Conversation[];
  activeConversationId: string;
  intakeDraft?: IntakeDraft;
  auditEvents: AuditEvent[];
  familyAlerts: FamilyAlert[];
  preferences: AppPreferences;
  lastLocalSaveAt?: string;
  lastSyncedAt?: string;
  cloudRevision?: number;
}

export interface CloudSnapshot {
  version: 1;
  familyCode: string;
  updatedAt: string;
  elderName: string;
  profile: Pick<
    ElderProfile,
    "age" | "conditions" | "allergies" | "timeZone"
  >;
  consent: ConsentSettings;
  medications: Medication[];
  doseEvents: DoseEvent[];
  riskChecks: RiskCheck[];
  emergencyContacts: EmergencyContact[];
  familyAlerts?: FamilyAlert[];
}

export interface SharedKnowledgeBase {
  version: string;
  reviewStatus: string;
  sources: KnowledgeSource[];
  articles: Array<{
    id: string;
    terms: string[];
    title: string;
    plainText: string;
    riskLevel: RiskLevel;
    sourceIds: string[];
  }>;
  interactionRules: Array<{
    id: string;
    terms: string[];
    riskLevel: RiskLevel;
    title: string;
    summary: string;
    nextStep: string;
    sourceIds: string[];
  }>;
  highRiskMedications: Array<{
    name: string;
    aliases: string[];
    sourceIds: string[];
  }>;
  emergencyKeywords: string[];
}

export interface AssistantStage {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

export interface AssistantResponse {
  message: string;
  riskCheck: RiskCheck;
  stages: AssistantStage[];
  mode: "rules" | "llm";
}
