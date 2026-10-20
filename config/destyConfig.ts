export const DEFAULT_DESTY_MASTER_WAREHOUSE_ID = "2025866980121741952"; // Apotek Aldila (Main)

export interface DestyWarehouseOption {
  id: string;
  name: string;
  isDefault: boolean;
  tag?: string;
}

export const DESTY_MASTER_WAREHOUSES: DestyWarehouseOption[] = [
  {
    id: "2025866980121741952",
    name: "Apotek Aldila",
    isDefault: true,
    tag: "Main",
  },
  {
    id: "2042620805094077644",
    name: "Apotek Isa Pd Betung",
    isDefault: false,
  },
];
