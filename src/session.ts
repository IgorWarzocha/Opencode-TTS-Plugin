/**
 * Resolves whether a session is a child of another session.
 * Caches results to avoid repeated API requests.
 */

export type SessionClient = {
  session: {
    get: (options: { path: { id: string } }) => Promise<unknown>
  }
}

type SessionInfo = {
  parentID?: string
}

const resolveSessionInfo = (response: unknown): SessionInfo | null => {
  if (!response || typeof response !== "object") return null
  if ("data" in response && response.data && typeof response.data === "object") {
    return response.data as SessionInfo
  }
  return response as SessionInfo
}

export const createSessionGuard = (client: SessionClient) => {
  const cache = new Map<string, boolean>()

  return async (sessionID: string): Promise<boolean> => {
    const cached = cache.get(sessionID)
    if (cached !== undefined) return cached

    const response = await client.session.get({ path: { id: sessionID } })
    const info = resolveSessionInfo(response)
    const isChild = Boolean(info && info.parentID)
    cache.set(sessionID, isChild)
    return isChild
  }
}
