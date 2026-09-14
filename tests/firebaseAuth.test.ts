import { describe, it, expect } from "vitest";
import { PRESET_USERS } from "../composables/useFirebaseAuth";
import { firebaseConfig } from "../config/firebase";

describe("Firebase Setup and Auth Presets", () => {
  it("has valid Firebase config properties", () => {
    expect(firebaseConfig.apiKey).toBeDefined();
    expect(firebaseConfig.projectId).toBe("asisten-assist");
    expect(firebaseConfig.authDomain).toContain("asisten-assist");
  });

  it("includes atk1.apotekaldila@gmail.com in preset users", () => {
    expect(PRESET_USERS).toContain("atk1.apotekaldila@gmail.com");
  });
});
