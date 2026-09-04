import "server-only";

type AgentRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

const PLACEHOLDER_KEYS = new Set([
  "replace_with_the_same_long_random_secret_used_by_next",
  "replace_with_a_long_random_shared_secret",
  "changeme",
]);

export class AgentUnavailableError extends Error {}
export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function agentConfig() {
  const baseUrl = process.env.AGENT_SERVICE_URL;
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!baseUrl || !internalKey) {
    throw new AgentUnavailableError(
      "AGENT_SERVICE_URL and INTERNAL_API_KEY must be configured.",
    );
  }

  // A shipped placeholder is the same as no secret: it is published in
  // .env.example, so anyone can read it out of the repository.
  if (PLACEHOLDER_KEYS.has(internalKey.trim().toLowerCase())) {
    throw new AgentUnavailableError(
      "INTERNAL_API_KEY is still the placeholder from .env.example. Generate a real shared secret.",
    );
  }

  return { baseUrl, internalKey };
}

export function isAgentConfigured() {
  try {
    agentConfig();
    return true;
  } catch {
    return false;
  }
}

async function agentFetch(path: string, options: AgentRequestOptions) {
  const { baseUrl, internalKey } = agentConfig();

  return fetch(new URL(path, baseUrl), {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": internalKey,
      ...options.headers,
    },
    cache: "no-store",
  });
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { detail?: string };
    return typeof payload.detail === "string" ? payload.detail : fallback;
  } catch {
    return fallback;
  }
}

export async function callAgent<T>(
  path: string,
  options: AgentRequestOptions = {},
): Promise<T> {
  const response = await agentFetch(path, { method: "POST", ...options });

  if (!response.ok) {
    throw new AgentRequestError(
      await readError(response, `Agent service returned ${response.status}.`),
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Streaming passthrough for the RAG chat.
 *
 * The body is piped straight to the browser rather than buffered, so tokens
 * render as they arrive. Buffering here would silently undo the entire point
 * of streaming from the agent service.
 */
export async function streamAgent(
  path: string,
  body: unknown,
): Promise<ReadableStream<Uint8Array>> {
  const response = await agentFetch(path, { method: "POST", body });

  if (!response.ok || !response.body) {
    throw new AgentRequestError(
      await readError(response, `Agent service returned ${response.status}.`),
      response.status,
    );
  }

  return response.body;
}
