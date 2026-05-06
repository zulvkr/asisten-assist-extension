export type AssistTokenSource =
  | "manual"
  | "localStorage"
  | "sessionStorage"
  | "cookie"
  | "extension-storage"
  | "content-script";

export interface AssistTokenProbeResult {
  token: string;
  source: AssistTokenSource;
  warnings: string[];
}

interface TokenMessageResponse {
  ok?: boolean;
  token?: string;
  source?: "localStorage" | "sessionStorage" | "cookie";
  debugSteps?: string[];
}

const ASSIST_TAB_PATTERNS = ["*://clinica.assist.id/*"];

function normalizeCandidateToken(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const token = input.trim();
  if (!token) {
    return "";
  }

  if (token.toLowerCase().startsWith("bearer ")) {
    return token.slice(7).trim();
  }

  return token;
}

async function probeAssistTokenFromTab(tabId: number): Promise<{
  result: AssistTokenProbeResult | null;
  debugSteps: string[];
  errorMessage?: string;
}> {
  try {
    console.debug("[AssistTokenManager] Sending token probe to tab", tabId);

    const response = (await browser.tabs.sendMessage(tabId, {
      type: "GET_ASSIST_TOKEN",
    })) as TokenMessageResponse | undefined;

    console.debug("[AssistTokenManager] Probe response", {
      tabId,
      ok: response?.ok,
      source: response?.source,
      tokenLength: String(response?.token ?? "").trim().length,
      debugSteps: response?.debugSteps ?? [],
    });

    const debugSteps = response?.debugSteps ?? [];
    const token = normalizeCandidateToken(response?.token);
    if (!token) {
      return {
        result: null,
        debugSteps,
      };
    }

    return {
      result: {
        token,
        source: response?.source ?? "content-script",
        warnings: [],
      },
      debugSteps,
    };
  } catch (error) {
    console.warn("[AssistTokenManager] Probe failed for tab", tabId, error);
    return {
      result: null,
      debugSteps: [],
      errorMessage: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export async function requestAssistTokenFromOpenTabs(): Promise<AssistTokenProbeResult> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tabs = await browser.tabs.query({
    url: ASSIST_TAB_PATTERNS,
  });

  const orderedTabs = [
    ...(activeTab?.id ? [activeTab] : []),
    ...tabs.filter((tab) => tab.id && tab.id !== activeTab?.id),
  ];

  const probeWarnings: string[] = [];

  for (const tab of orderedTabs) {
    if (!tab.id) {
      continue;
    }

    const { result, debugSteps, errorMessage } = await probeAssistTokenFromTab(
      tab.id,
    );
    if (result?.token) {
      return result;
    }

    if (errorMessage) {
      probeWarnings.push(`Tab ${tab.id}: sendMessage error (${errorMessage})`);
      continue;
    }

    if (debugSteps.length) {
      probeWarnings.push(`Tab ${tab.id}: ${debugSteps.join(" | ")}`);
    } else {
      probeWarnings.push(
        `Tab ${tab.id}: no debugSteps returned; content script may not be injected on this tab yet.`,
      );
    }
  }

  try {
    const storageLocal = browser?.storage?.local;
    if (storageLocal) {
      const stored = await storageLocal.get("assistToken");
      const token = normalizeCandidateToken(stored.assistToken);
      if (token) {
        return {
          token,
          source: "extension-storage",
          warnings: probeWarnings,
        };
      }
    }
  } catch (error) {
    probeWarnings.push(
      `storage.local fallback failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return {
    token: "",
    source: "content-script",
    warnings: [
      "Token Assist tidak ditemukan dari tab clinica.assist.id. Buka dan login ke clinica.assist.id lalu coba lagi.",
      ...probeWarnings,
    ],
  };
}

export async function resolveAssistToken(options?: {
  manualToken?: string;
}): Promise<AssistTokenProbeResult> {
  const manualToken = normalizeCandidateToken(options?.manualToken);
  if (manualToken) {
    return {
      token: manualToken,
      source: "manual",
      warnings: [],
    };
  }

  return requestAssistTokenFromOpenTabs();
}
