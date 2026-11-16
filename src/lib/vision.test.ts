import { describe, expect, it } from "vitest";
import { createManualDraft } from "./ocr";
import {
  buildDraftsFromVision,
  getVisionMedicines,
  type VisionIdentification
} from "./vision";

describe("multi-medicine vision results", () => {
  const vision: VisionIdentification = {
    isMedicine: true,
    medicines: [
      {
        position: "上",
        name: "维生素B6片",
        activeIngredient: "维生素B6",
        dosage: "10mg/片",
        confidence: 0.94
      },
      {
        position: "中",
        name: "维生素B2片",
        activeIngredient: "维生素B2",
        dosage: "5mg/片",
        confidence: 0.91
      },
      {
        position: "下",
        name: "维生素C片",
        activeIngredient: "维生素C",
        dosage: "100mg/片",
        confidence: 0.89
      }
    ]
  };

  it("keeps every distinct medicine returned by the vision model", () => {
    expect(getVisionMedicines(vision).map((item) => item.name)).toEqual([
      "维生素B6片",
      "维生素B2片",
      "维生素C片"
    ]);
  });

  it("creates one editable intake draft per medicine", () => {
    const drafts = buildDraftsFromVision(
      "data:image/jpeg;base64,test",
      createManualDraft("data:image/jpeg;base64,test"),
      vision
    );

    expect(drafts).toHaveLength(3);
    expect(drafts.map((draft) => draft.name)).toEqual([
      "维生素B6片",
      "维生素B2片",
      "维生素C片"
    ]);
    expect(drafts[1].ingredientsText).toBe("维生素B2");
    expect(drafts[2].dosage).toBe("");
    expect(drafts[2].strength).toBe("100mg/片");
    expect(drafts[0].relation).toBe("按说明书");
  });

  it("deduplicates the same package appearing twice", () => {
    expect(
      getVisionMedicines({
        medicines: [
          { name: "维生素C片" },
          { name: "维生素 C 片" }
        ]
      })
    ).toHaveLength(1);
  });

  it("fills a catalog dose instead of treating package quantity as a single dose", () => {
    const drafts = buildDraftsFromVision(
      "data:image/jpeg;base64,test",
      createManualDraft("data:image/jpeg;base64,test"),
      {
        medicines: [
          {
            name: "硝酸甘油片",
            activeIngredient: "硝酸甘油",
            dosage: "0.5mg/片；100片/盒"
          }
        ]
      }
    );
    expect(drafts[0].dosage).toBe("0.5mg");
    expect(drafts[0].dosageSource).toBe("catalog");
    expect(drafts[0].strength).toBe("0.5mg/片");
    expect(drafts[0].packageSpec).toBe("100片/盒");
  });
});
