import { describe, expect, it } from "vitest";
import { createPasswordRecord, verifyPassword } from "./auth";

describe("local account password records", () => {
  it("stores a salted digest and accepts only the original password", async () => {
    const record = await createPasswordRecord("safe-password");
    expect(record.passwordHash).not.toContain("safe-password");
    expect(record.passwordSalt.length).toBe(32);
    await expect(
      verifyPassword(
        "safe-password",
        record.passwordHash,
        record.passwordSalt
      )
    ).resolves.toBe(true);
    await expect(
      verifyPassword(
        "wrong-password",
        record.passwordHash,
        record.passwordSalt
      )
    ).resolves.toBe(false);
  });
});
