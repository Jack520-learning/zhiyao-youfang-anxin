export type HealthContext =
  | "older"
  | "pregnancy"
  | "kidney"
  | "liver"
  | "alcohol"
  | "surgery"
  | "allergy";

export type SpecialGroups = {
  older: string;
  pregnancy: string;
  kidney: string;
  liver: string;
};

export type Medicine = {
  slug: string;
  displayName: string;
  aliases: string[];
  activeIngredient: string;
  dosageForm: string;
  strength: string;
  category: string;
  accent: "teal" | "orange" | "blue" | "rose";
  howToTake: string;
  maxDaily: string;
  timing: string;
  food: string;
  keyWarnings: string[];
  sideEffects: string[];
  specialGroups: SpecialGroups;
  sourceTitle: string;
  sourceNote: string;
  sourceUrl: string | null;
  sourceAccessedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  knowledgeVersion: string;
  reviewStatus: "pending_review" | "verified";
};

export type InteractionSeverity = "high" | "caution" | "info";

export type Interaction = {
  a: string;
  b: string;
  severity: InteractionSeverity;
  title: string;
  explanation: string;
  action: string;
};

export type InteractionResult = Omit<Interaction, "a" | "b"> & {
  medicineNames: [string, string];
};

export type IdentificationResult = {
  recognizedName: string;
  detectedDosageForm: string | null;
  medicineSlug: string | null;
  medicineName: string | null;
  confidence: number;
  evidenceText: string;
  labelSummary?: VisibleInstructionSummary | null;
  mode: "live" | "demo";
  message: string;
  errorCode?: IdentificationErrorCode;
};

export type VisibleInstructionSummary = {
  dosage: string;
  timing: string;
  contraindications: string[];
  warnings: string[];
  emergencySigns: string[];
  sourceText: string;
};

export type IdentificationErrorCode =
  | "INVALID_IMAGE"
  | "AUTH_FAILED"
  | "ENDPOINT_UNREACHABLE"
  | "MODEL_UNAVAILABLE"
  | "FORM_UNCERTAIN"
  | "FORM_UNSUPPORTED"
  | "UNRECOGNIZED"
  | "IDENTIFICATION_FAILED";

export type Guidance = {
  headline: string;
  plainSummary: string;
  questionAnswer?: string;
  doseSteps: string[];
  safetyPoints: string[];
  interactions: InteractionResult[];
  personalWarnings: string[];
  redFlags: string[];
  sourceLabels: string[];
  mode: "live" | "demo";
};

export type AdviseRequest = {
  medicineSlug: string;
  companionSlugs: string[];
  healthContext: HealthContext[];
  question?: string;
  enhance?: boolean;
};
