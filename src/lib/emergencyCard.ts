import type {
  ElderProfile,
  EmergencyContact,
  Medication,
  RiskCheck
} from "../types";

export interface EmergencyCardMedication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  relation: string;
}

export interface EmergencyCardAttention {
  medicationId: string;
  name: string;
  reason: string;
}

export interface EmergencyCardData {
  name: string;
  age: string;
  medications: EmergencyCardMedication[];
  allergies: string[];
  conditions: string[];
  contacts: EmergencyContact[];
  specialAttention: EmergencyCardAttention[];
}

const attentionPattern =
  /华法林|胰岛素|抗凝|氯吡格雷|替格瑞洛|利伐沙班|阿哌沙班|达比加群|地高辛|胺碘酮|甲氨蝶呤|碳酸锂|阿片|吗啡|芬太尼|苯二氮|地西泮|格列|降糖/i;

export function buildEmergencyCardData({
  profile,
  medications,
  emergencyContacts,
  riskChecks
}: {
  profile: ElderProfile;
  medications: Medication[];
  emergencyContacts: EmergencyContact[];
  riskChecks: RiskCheck[];
}): EmergencyCardData {
  const activeMedications = medications.filter(
    (medication) => medication.status === "active"
  );
  const highRiskChecks = riskChecks.filter(
    (riskCheck) =>
      riskCheck.level === "high" || riskCheck.level === "emergency"
  );
  const riskByMedicationId = new Map<string, RiskCheck>();

  for (const riskCheck of highRiskChecks) {
    for (const medicationId of riskCheck.involvedMedicationIds) {
      if (!riskByMedicationId.has(medicationId)) {
        riskByMedicationId.set(medicationId, riskCheck);
      }
    }
  }

  const specialAttention = activeMedications.flatMap((medication) => {
    const riskCheck = riskByMedicationId.get(medication.id);
    if (riskCheck) {
      return [
        {
          medicationId: medication.id,
          name: medication.name,
          reason: `系统曾提示：${riskCheck.title}`
        }
      ];
    }

    if (attentionPattern.test(`${medication.name} ${medication.ingredients.join(" ")}`)) {
      return [
        {
          medicationId: medication.id,
          name: medication.name,
          reason: "属于需要医生重点复核剂量、相互作用或停药风险的药物"
        }
      ];
    }

    return [];
  });

  return {
    name: profile.name.trim() || "姓名未填写",
    age: profile.age > 0 ? `${profile.age} 岁` : "年龄未填写",
    medications: activeMedications.map((medication) => ({
      id: medication.id,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      relation: medication.relation
    })),
    allergies: profile.allergies.filter(Boolean),
    conditions: profile.conditions.filter(Boolean),
    contacts: [...emergencyContacts].sort((left, right) => {
      const order: Record<EmergencyContact["kind"], number> = {
        family: 0,
        caregiver: 1,
        emergency: 2
      };
      return order[left.kind] - order[right.kind];
    }),
    specialAttention
  };
}
