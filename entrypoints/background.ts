import type { PemasukanData } from "@/types/PemasukanData";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "FETCH_PEMASUKAN_DATA") {
      return;
    }

    const url = message.payload?.url;
    const token = message.payload?.token ?? "";

    if (typeof url !== "string") {
      sendResponse({
        ok: false,
        error: "Permintaan pemasukan tidak valid.",
      });
      return false;
    }

    (async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            Authorization: token,
            Priority: "u=1, i",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const errorMessage = errorBody?.trim()
            ? errorBody.slice(0, 200)
            : `Gagal mengambil data pemasukan: ${response.status}`;
          sendResponse({
            ok: false,
            status: response.status,
            error: errorMessage,
          });
          return;
        }

        const payload = (await response.json()) as {
          result?: PemasukanData[];
        };

        sendResponse({
          ok: true,
          status: response.status,
          data: payload?.result ?? [],
        });
      } catch (error) {
        console.error("Gagal melakukan fetch pemasukan di worker", error);
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan tidak diketahui.",
        });
      }
    })();

    return true;
  });
});
