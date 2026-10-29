export type AppRole = "owner" | "auditor" | "kasir";

export interface RolePermissions {
  canCreateOpname: boolean;
  canCountOpname: boolean;
  canFinalizeOpname: boolean;
  canCancelOpname: boolean;
  canViewSystemQty: boolean;
}

export interface UserRoleRecord {
  email: string;
  role: AppRole;
  name?: string;
  canViewSystemQty?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  owner: {
    canCreateOpname: true,
    canCountOpname: true,
    canFinalizeOpname: true,
    canCancelOpname: true,
    canViewSystemQty: true,
  },
  auditor: {
    canCreateOpname: true,
    canCountOpname: true,
    canFinalizeOpname: true,
    canCancelOpname: true,
    canViewSystemQty: true,
  },
  kasir: {
    canCreateOpname: true, // Sesuai keputusan: Kasir BISA membuat sesi baru
    canCountOpname: true,
    canFinalizeOpname: false, // Dilarang posting ke Assist
    canCancelOpname: false, // Dilarang membatalkan sesi
    canViewSystemQty: true, // Default true, tapi dapat di-override di user_roles Firestore
  },
};

export function resolveUserPermissions(role: AppRole, customSettings?: Partial<RolePermissions>): RolePermissions {
  const base = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.kasir;
  return {
    ...base,
    ...customSettings,
  };
}
