import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock firebase
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockOnSnapshot = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => mockDoc(...args),
  collection: (...args: any[]) => mockCollection(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
}));

vi.mock("@/config/firebase", () => ({
  db: { _mockDb: true },
}));

import {
  sanitizeReturnCheckDocId,
  getReturnCheckRecordsFromLocal,
  saveReturnCheckRecord,
  toggleReturnCheckOrder,
  updateOrderNotes,
  getReturnCheckRecords,
  subscribeReturnChecks,
} from "@/services/destySync/destyReturnCheckStorage";
import type { DestyReturnCheckRecord } from "@/types/destyCancelledReturn";

let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
  vi.clearAllMocks();

  mockDoc.mockReturnValue({ path: "desty_return_checks/ORD-1" });
  mockCollection.mockReturnValue({ path: "desty_return_checks" });
  mockGetDocs.mockResolvedValue({
    forEach: (_fn: any) => {},
  });
  mockSetDoc.mockResolvedValue(undefined);

  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (value: Record<string, unknown>) => Object.assign(storage, value)),
      },
    },
  });
});

describe("Desty Return Check Storage", () => {
  it("sanitizes Firestore document IDs properly", () => {
    expect(sanitizeReturnCheckDocId("ORD/2026/01#99.1 [TEST]")).toBe("ORD_2026_01_99_1__TEST_");
    expect(sanitizeReturnCheckDocId("SHOPEE-12345")).toBe("SHOPEE-12345");
  });

  it("toggles return check to received (checked) with user attribution", async () => {
    const result = await toggleReturnCheckOrder({
      orderId: "PKG-001",
      orderSn: "ORD-SHOPEE-001",
      displayedOrderSn: "ORD-SHOPEE-001",
      platformName: "Shopee",
      checkedByEmail: "staf@apotek.com",
      checkedByName: "Apoteker Ivan",
      checkedByUid: "uid-123",
      processedAt: "2026-10-28T09:30:00.000Z",
    });

    expect(result.received).toBe(true);
    expect(result.checkedByEmail).toBe("staf@apotek.com");
    expect(result.checkedByName).toBe("Apoteker Ivan");
    expect(result.checkedByUid).toBe("uid-123");
    expect(result.checkedAt).toBeDefined();
    expect(result.processedAt).toBe("2026-10-28T09:30:00.000Z");

    const localMap = await getReturnCheckRecordsFromLocal();
    expect(localMap["ORD-SHOPEE-001"].received).toBe(true);
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it("toggles return check back to pending (uncheck)", async () => {
    // First check it
    await toggleReturnCheckOrder({
      orderId: "PKG-002",
      orderSn: "ORD-TOKOPEDIA-002",
      platformName: "Tokopedia",
      checkedByEmail: "staf@apotek.com",
      checkedByName: "Ivan",
      forceReceived: true,
    });

    // Then toggle it
    const toggled = await toggleReturnCheckOrder({
      orderId: "PKG-002",
      orderSn: "ORD-TOKOPEDIA-002",
    });

    expect(toggled.received).toBe(false);
    expect(toggled.checkedByEmail).toBeUndefined();
    expect(toggled.checkedByName).toBeUndefined();
    expect(toggled.checkedAt).toBeUndefined();
  });

  it("updates order notes correctly", async () => {
    await toggleReturnCheckOrder({
      orderId: "PKG-003",
      orderSn: "ORD-TIKTOK-003",
      platformName: "TikTok Shop",
      checkedByEmail: "staf@apotek.com",
      forceReceived: true,
    });

    const updated = await updateOrderNotes("ORD-TIKTOK-003", "Kemasan luar sedikit penyok, botol sirup aman.");
    expect(updated).not.toBeNull();
    expect(updated?.notes).toBe("Kemasan luar sedikit penyok, botol sirup aman.");

    const localMap = await getReturnCheckRecordsFromLocal();
    expect(localMap["ORD-TIKTOK-003"].notes).toBe("Kemasan luar sedikit penyok, botol sirup aman.");
  });

  it("loads and saves individual return check records", async () => {
    const record: DestyReturnCheckRecord = {
      orderId: "PKG-004",
      orderSn: "ORD-LAZADA-004",
      displayedOrderSn: "ORD-LAZADA-004",
      platformName: "Lazada",
      received: true,
      checkedByEmail: "admin@apotek.com",
      checkedByName: "Admin",
      checkedAt: "2026-10-30T10:00:00.000Z",
      processedAt: "2026-10-29T08:00:00.000Z",
      updatedAt: "2026-10-30T10:00:00.000Z",
    };

    await saveReturnCheckRecord(record);

    const merged = await getReturnCheckRecords();
    expect(merged["ORD-LAZADA-004"]).toBeDefined();
    expect(merged["ORD-LAZADA-004"].platformName).toBe("Lazada");
    expect(merged["ORD-LAZADA-004"].received).toBe(true);
  });

  it("subscribes to Firestore snapshot updates", () => {
    const callback = vi.fn();
    mockOnSnapshot.mockImplementation((_coll: any, onNext: any) => {
      onNext({
        forEach: (fn: any) => {
          fn({
            id: "ORD-REALTIME",
            data: () => ({
              orderId: "ORD-REALTIME",
              orderSn: "ORD-REALTIME",
              received: true,
              checkedByName: "Realtime User",
            }),
          });
        },
      });
      return vi.fn();
    });

    const unsubscribe = subscribeReturnChecks(callback);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        "ORD-REALTIME": expect.objectContaining({
          received: true,
          checkedByName: "Realtime User",
        }),
      })
    );
    expect(typeof unsubscribe).toBe("function");
  });
});

import {
  fetchDestyCancelledOrdersFast,
  fetchDestyOrderDetail,
} from "@/composables/destyOmniOrderApi";

describe("Desty Cancelled & Return Orders API parsing", () => {
  it("fetches cancelled orders with Cancellations status and fast pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          records: [
            {
              orderId: "2115696895292706817",
              displayedOrderSn: "261029USYDUN5U",
              status: "Cancellations",
              labelPrinted: true,
              courier: "SPX Hemat",
              shipmentNo: "SPXID06895133364A",
              orderCreateTime: 1793256411000,
              items: [
                {
                  productName: "DEXTRAL TAB",
                  skuCode: "OBT-DXA-DEXTRAL-TAB",
                  quantity: 1,
                  unitPrice: 11039,
                },
              ],
            },
          ],
          pages: 1,
          total: 1,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const records = await fetchDestyCancelledOrdersFast({
      token: "test-token",
      status: "Cancellations",
      maxPages: 1,
    });

    expect(fetchMock).toHaveBeenCalled();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.status).toBe("Cancellations");

    expect(records).toHaveLength(1);
    expect(records[0].displayedOrderSn).toBe("261029USYDUN5U");
    expect(records[0].labelPrinted).toBe(true);
    expect(records[0].items[0].productName).toBe("DEXTRAL TAB");
  });

  it("extracts Processed time, cancelReason, and history from order detail", async () => {
    const detailPayload = {
      code: 0,
      data: {
        id: "2115696895292706817",
        displayedOrderSn: "261029USYDUN5U",
        packages: [
          {
            status: "Cancellations",
            cancelReason: "Others / change of mind",
            cancelBy: "buyer",
            labelPrinted: true,
            packageStatusHistory: [
              { status: "To_Process", statusUpdateTime: 1793256413000 },
              { status: "Processed", statusUpdateTime: 1793275558000 },
              { status: "Cancellations", statusUpdateTime: 1793276367000 },
            ],
          },
        ],
      },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => detailPayload,
    }));

    const detail = await fetchDestyOrderDetail({
      token: "test-token",
      orderId: "2115696895292706817",
    });

    expect(detail.orderId).toBe("2115696895292706817");
    expect(detail.cancelReason).toBe("Others / change of mind");
    expect(detail.cancelBy).toBe("buyer");
    expect(detail.labelPrinted).toBe(true);
    expect(detail.processedTime).toBe(1793275558000);
    expect(detail.packageStatusHistory).toHaveLength(3);
  });
});
