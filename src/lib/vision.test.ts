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
    expect(drafts[2].dosage).toBe("100mg/片");
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
});
