import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  resolveUserPermissions,
  type AppRole,
} from "@/types/userRole";

describe("UserRole and RBAC Permissions", () => {
  it("gives owner full permissions", () => {
    const ownerPerms = DEFAULT_ROLE_PERMISSIONS.owner;
    expect(ownerPerms.canCreateOpname).toBe(true);
    expect(ownerPerms.canCountOpname).toBe(true);
    expect(ownerPerms.canFinalizeOpname).toBe(true);
    expect(ownerPerms.canCancelOpname).toBe(true);
    expect(ownerPerms.canViewSystemQty).toBe(true);
  });

  it("gives auditor create, count, finalize, cancel permissions", () => {
    const auditorPerms = DEFAULT_ROLE_PERMISSIONS.auditor;
    expect(auditorPerms.canCreateOpname).toBe(true);
    expect(auditorPerms.canCountOpname).toBe(true);
    expect(auditorPerms.canFinalizeOpname).toBe(true);
    expect(auditorPerms.canCancelOpname).toBe(true);
    expect(auditorPerms.canViewSystemQty).toBe(true);
  });

  it("allows kasir to create and count opname, but forbids finalize and cancel", () => {
    const kasirPerms = DEFAULT_ROLE_PERMISSIONS.kasir;
    expect(kasirPerms.canCreateOpname).toBe(true); // Kasir BISA buat sesi baru
    expect(kasirPerms.canCountOpname).toBe(true); // Kasir BISA hitung fisik
    expect(kasirPerms.canFinalizeOpname).toBe(false); // Kasir DILARANG posting ke Assist
    expect(kasirPerms.canCancelOpname).toBe(false); // Kasir DILARANG membatalkan
    expect(kasirPerms.canViewSystemQty).toBe(true);
  });

  it("allows overriding canViewSystemQty for blind opname", () => {
    const blindKasir = resolveUserPermissions("kasir", { canViewSystemQty: false });
    expect(blindKasir.canViewSystemQty).toBe(false);
    expect(blindKasir.canCreateOpname).toBe(true);
    expect(blindKasir.canFinalizeOpname).toBe(false);
  });

  it("falls back to kasir permissions for unknown role", () => {
    const fallback = resolveUserPermissions("unknown" as AppRole);
    expect(fallback.canCreateOpname).toBe(true);
    expect(fallback.canFinalizeOpname).toBe(false);
  });
});
