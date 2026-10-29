import { describe, it, expect } from "vitest";
import { firebaseConfig } from "../config/firebase";

describe("Firebase Setup and Config", () => {
  it("has valid Firebase config properties", () => {
    expect(firebaseConfig.apiKey).toBeDefined();
    expect(firebaseConfig.projectId).toBe("asisten-assist");
    expect(firebaseConfig.authDomain).toContain("asisten-assist");
  });
});
