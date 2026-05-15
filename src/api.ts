import { io, type Socket } from "socket.io-client";

export type ApiError = { message: string; code?: string };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export class ApiClientError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

export type UserRole = "ADMIN" | "CLIENT";
export type SessionState =
  | "idle"
  | "initializing"
  | "qr"
  | "authenticated"
  | "ready"
  | "auth_failure"
  | "disconnected"
  | "destroyed";

export type User = {
  id: string;
  username: string;
  role: UserRole;
  forcePasswordChange: boolean;
};

export type AuthState = {
  accessToken: string;
  user: User;
  /** Epoch ms when access JWT expires (server may omit for older clients). */
  accessExpiresAt?: number;
};

export type SessionStatus =
  | { state: "qr"; qr: string; qrDataUrl: string }
  | { state: Exclude<SessionState, "qr">; reason?: string };

export type Session = {
  id: string;
  displayName?: string;
  owner?: { userId: string; username: string };
  status: SessionStatus;
  behaviour?: { templateId: string; enabled: boolean };
};

export type Chat = { id: string; name: string; isGroup: boolean; unreadCount?: number };
export type GroupParticipant = { id: string; isAdmin?: boolean; isSuperAdmin?: boolean };
export type BehaviourTemplate = {
  id: string;
  name: string;
  description: string;
  hasCustomPage: boolean;
  uiSchema: unknown;
  version: string;
};
export type BehaviourAssignment = {
  templateId: string;
  enabled: boolean;
  priority?: number;
  templateConfig: unknown;
};
export type AdminUser = {
  id: string;
  username: string;
  email?: string | null;
  role: UserRole;
  isActive: boolean;
  forcePasswordChange: boolean;
};

export type RealtimeEvents = {
  onStatus?: (event: { sessionId: string; status: SessionStatus }) => void;
  onMessage?: (event: { sessionId: string; id: string; from: string; to: string; body: string }) => void;
  onError?: (event: { sessionId: string; error: { message: string; code?: string } }) => void;
};

type AuthHooks = {
  getToken: () => string | null;
  onAuth: (auth: AuthState) => void;
  onUnauthorized: () => void;
};

type ChatAction = "archive" | "unarchive" | "pin" | "unpin" | "mute" | "unmute" | "mark_unread";
type GroupAction = "remove" | "promote" | "demote";

function getJwtExpMs(token: string): number | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function createApiClient(baseUrl: string, hooks: AuthHooks) {
  const base = baseUrl.replace(/\/+$/, "");
  let socket: Socket | null = null;
  let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

  function clearProactiveTimer() {
    if (proactiveTimer) {
      clearTimeout(proactiveTimer);
      proactiveTimer = null;
    }
  }

  function disconnectSocket() {
    if (!socket) return;
    socket.disconnect();
    socket = null;
  }

  function scheduleProactiveRefresh(auth: AuthState) {
    clearProactiveTimer();
    const expMs = auth.accessExpiresAt ?? getJwtExpMs(auth.accessToken);
    if (!expMs) return;
    const skewMs = 60_000;
    const delay = Math.max(15_000, expMs - Date.now() - skewMs);
    proactiveTimer = setTimeout(() => {
      proactiveTimer = null;
      void (async () => {
        const ok = await callAuthRefresh();
        if (!ok) hooks.onUnauthorized();
      })();
    }, delay);
  }

  function afterAuth(auth: AuthState) {
    hooks.onAuth(auth);
    disconnectSocket();
    scheduleProactiveRefresh(auth);
  }

  async function callAuthRefresh(): Promise<boolean> {
    try {
      const headers = new Headers();
      headers.set("content-type", "application/json");
      const res = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      const json = (await res.json()) as ApiResponse<AuthState>;
      if (!res.ok || !json.ok) return false;
      afterAuth(json.data);
      return true;
    } catch {
      return false;
    }
  }

  async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
    const token = hooks.getToken();
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
    const json = (await res.json()) as ApiResponse<T>;

    if (res.status === 401 && !retried && path !== "/api/auth/login" && path !== "/api/auth/refresh") {
      const ok = await callAuthRefresh();
      if (ok) return request<T>(path, init, true);
    }

    if (!json.ok) {
      if (res.status === 401) hooks.onUnauthorized();
      throw new ApiClientError(json.error.message || `Request failed ${path}`, json.error.code);
    }
    return json.data;
  }

  function ensureSocket() {
    if (socket) return socket;
    const token = hooks.getToken();
    if (!token) throw new ApiClientError("Missing access token", "AUTH_REQUIRED");
    socket = io(`${base}/whatsapp`, { auth: { token }, transports: ["websocket"] });
    return socket;
  }

  return {
    /** Apply auth from hydrate/login without an extra HTTP round trip; refreshes realtime + proactive refresh. */
    applySession(auth: AuthState) {
      afterAuth(auth);
    },

    clearAuthTimers() {
      clearProactiveTimer();
    },

    login: async (body: { usernameOrEmail: string; password: string }) => {
      const data = await request<AuthState>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      afterAuth(data);
      return data;
    },

    refresh: async () => {
      const data = await request<AuthState>("/api/auth/refresh", { method: "POST" });
      afterAuth(data);
      return data;
    },
    logout: () => request<{ loggedOut: true }>("/api/auth/logout", { method: "POST" }),
    me: () => request<User>("/api/auth/me"),
    changePassword: (body: { currentPassword: string; nextPassword: string }) =>
      request<{ changed: true }>("/api/auth/change-password", { method: "POST", body: JSON.stringify(body) }),

    listSessions: () => request<Session[]>("/api/sessions"),
    startSession: (id: string) => request<Session>(`/api/sessions/${id}/start`, { method: "POST" }),
    restartSession: (id: string) => request<Session>(`/api/sessions/${id}/restart`, { method: "POST" }),

    listChats: (sessionId: string) => request<Chat[]>(`/api/chats/${sessionId}`),
    sendText: (sessionId: string, body: { to: string; body: string }) =>
      request<{ sent: true }>(`/api/chats/${sessionId}/send-text`, { method: "POST", body: JSON.stringify(body) }),
    sendMedia: (
      sessionId: string,
      body: { to: string; body?: string; mediaBase64: string; mimetype: string; filename?: string },
    ) => request<{ sent: true }>(`/api/chats/${sessionId}/send-media`, { method: "POST", body: JSON.stringify(body) }),
    chatAction: (sessionId: string, body: { chatId: string; action: ChatAction; muteMinutes?: number }) =>
      request<{ ok: true }>(`/api/chats/${sessionId}/actions/chat`, { method: "POST", body: JSON.stringify(body) }),
    groupAction: (
      sessionId: string,
      body: { groupId: string; participantId: string; action: GroupAction },
    ) => request<{ ok: true }>(`/api/chats/${sessionId}/actions/group`, { method: "POST", body: JSON.stringify(body) }),
    listGroupParticipants: (sessionId: string, groupId: string) =>
      request<GroupParticipant[]>(`/api/chats/${sessionId}/groups/${encodeURIComponent(groupId)}/participants`),

    listTemplates: () => request<BehaviourTemplate[]>("/api/behaviours/templates"),
    getBehaviours: (sessionId: string) => request<BehaviourAssignment[]>(`/api/sessions/${sessionId}/behaviour`),
    setBehaviours: (sessionId: string, assignments: BehaviourAssignment[]) =>
      request<BehaviourAssignment[]>(`/api/sessions/${sessionId}/behaviour`, {
        method: "PUT",
        body: JSON.stringify({ assignments }),
      }),
    bannerBan: (body: { sessionId: string; groupId: string; participantId: string }) =>
      request<{ banned: true }>("/api/behaviours/banner/ban", { method: "POST", body: JSON.stringify(body) }),

    repeaterStart: (body: {
      sessionId: string;
      chatId: string;
      message: string;
      count: number;
      intervalSeconds: number;
    }) => request<{ started: true }>("/api/behaviours/repeater/start", { method: "POST", body: JSON.stringify(body) }),

    repeaterStop: (sessionId: string) =>
      request<{ stopped: true }>("/api/behaviours/repeater/stop", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      }),

    productsSyncNow: (sessionId: string) =>
      request<{ synced: true }>("/api/behaviours/products/sync-now", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      }),
    productsClearPostedMemory: (sessionId: string) =>
      request<{ deletedTrackers: number; deletedHandledRequests: number }>(
        "/api/behaviours/products/clear-posted-memory",
        { method: "POST", body: JSON.stringify({ sessionId }) },
      ),
    productsPostAllNow: (sessionId: string) =>
      request<{ posted: true }>("/api/behaviours/products/post-all-now", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      }),
    productsStatus: (sessionId: string) =>
      request<{
        enabled: boolean;
        configured: boolean;
        running: boolean;
        lastRunAt?: string;
        lastError?: string;
        nextRunAt?: string;
        lastPostEvalSummary?: string;
      }>(`/api/behaviours/products/${encodeURIComponent(sessionId)}/status`),
    productsTracker: (sessionId: string) =>
      request<
        Array<{
          id: string;
          productId: string;
          groupId: string;
          lastPostedAt?: string | null;
          lastMessageId?: string | null;
          lastKnownStatus: string;
          meta?: unknown;
          updatedAt: string;
        }>
      >(`/api/behaviours/products/${encodeURIComponent(sessionId)}/tracker`),
    productsTrackerAction: (
      sessionId: string,
      trackerId: string,
      body: {
        action: "toggle_unavailable" | "mark_available" | "set_redirect_url" | "clear_redirect_url" | "repost_now";
        redirectUrl?: string;
        cooldownSeconds?: number;
      },
    ) =>
      request<{ action: string; tracker: unknown }>(
        `/api/behaviours/products/${encodeURIComponent(sessionId)}/tracker/${encodeURIComponent(trackerId)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),
    products2State: (sessionId: string) =>
      request<{
        status: {
          enabled: boolean;
          configured: boolean;
          running: boolean;
          lastRunAt?: string;
          lastError?: string;
          nextRunAt?: string;
        };
        boardOrder: {
          orderedProductIds: string[];
          viewMode: "grid" | "list";
          groupIds: string[];
          lastFilter: unknown;
          updatedAt?: string | null;
        };
        jobs: Array<{
          id: string;
          title?: string | null;
          kind: "POST_NOW" | "POST_LATER" | "REPEAT";
          status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED" | "PAUSED" | "ACTIVE";
          runAt?: string | null;
          nextRunAt?: string | null;
          repeat?: unknown;
          productIds: string[];
          groupIds: string[];
          attachProductUrl: boolean;
          skipAlreadyPostedHere: boolean;
          postedCount: number;
          staleCount: number;
          updatedAt?: string | null;
          lastRunAt?: string | null;
          lastError?: string | null;
        }>;
        board: Array<{
          productId: string;
          live: boolean;
          missingFromApi: boolean;
          posted: boolean;
          postedCount: number;
          scheduledJobCount: number;
          nameFr: string;
          categoryFr: string;
          updatedAt?: string | null;
          status?: string;
          apiStatus: string;
          priceText: string;
          imageUrl?: string | null;
          changedSinceLastPost: boolean;
          lastPostedAt?: string | null;
        }>;
        activity: Array<{
          id: string;
          productId: string;
          groupId: string;
          postedAt?: string | null;
          lastMessageId?: string | null;
          imageUrl?: string | null;
          nameFr: string;
          changedSincePost: boolean;
        }>;
      }>(`/api/behaviours/products2/${encodeURIComponent(sessionId)}/state`),
    products2GetBoardOrder: (sessionId: string) =>
      request<{
        orderedProductIds: string[];
        viewMode: "grid" | "list";
        groupIds: string[];
        lastFilter: unknown;
        updatedAt?: string | null;
      }>(`/api/behaviours/products2/${encodeURIComponent(sessionId)}/board-order`),
    products2PutBoardOrder: (
      sessionId: string,
      body: {
        orderedProductIds?: string[];
        viewMode?: "grid" | "list";
        groupIds?: string[];
        lastFilter?: Record<string, unknown> | null;
      },
    ) =>
      request<{
        orderedProductIds: string[];
        viewMode: "grid" | "list";
        groupIds: string[];
        lastFilter: unknown;
        updatedAt?: string | null;
      }>(`/api/behaviours/products2/${encodeURIComponent(sessionId)}/board-order`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    products2CreateJob: (body: {
      sessionId: string;
      kind: "POST_NOW" | "POST_LATER" | "REPEAT";
      title?: string;
      productIds: string[];
      groupIds: string[];
      attachProductUrl?: boolean;
      skipAlreadyPostedHere?: boolean;
      runAt?: string;
      repeat?: { frequency: "daily" | "weekly"; interval: number; weekdays?: number[] };
    }) =>
      request<{ jobId: string; posted?: number; stale?: number }>("/api/behaviours/products2/jobs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    products2PatchJob: (
      jobId: string,
      body: {
        sessionId: string;
        status?: "active" | "paused" | "cancelled";
        runAt?: string;
        repeat?: { frequency: "daily" | "weekly"; interval: number; weekdays?: number[] } | null;
      },
    ) =>
      request<{ updated: true }>(`/api/behaviours/products2/jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    products2RunJobNow: (jobId: string, body: { sessionId: string }) =>
      request<{ posted: number; stale: number }>(
        `/api/behaviours/products2/jobs/${encodeURIComponent(jobId)}/run-now`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    sawaboApiGetConfig: (sessionId: string) =>
      request<{
        id: string | null;
        sessionId: string;
        sessionKey?: string;
        enabled: boolean;
        callbackUrl: string | null;
        callbackSecret: string | null;
        secretHint: string;
        secret?: string;
        allowedActions: string[];
        defaultGroupIds: string[];
        maxRequestsPerHour: number;
        createdAt?: string | null;
        updatedAt?: string | null;
      }>(`/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/config`),
    sawaboApiSaveConfig: (
      sessionId: string,
      body: {
        enabled?: boolean;
        callbackUrl?: string | null;
        callbackSecret?: string | null;
        allowedActions?: string[];
        defaultGroupIds?: string[];
        maxRequestsPerHour?: number;
      },
    ) =>
      request<{
        id: string | null;
        sessionId: string;
        sessionKey?: string;
        enabled: boolean;
        callbackUrl: string | null;
        callbackSecret: string | null;
        secretHint: string;
        secret?: string;
        allowedActions: string[];
        defaultGroupIds: string[];
        maxRequestsPerHour: number;
        createdAt?: string | null;
        updatedAt?: string | null;
      }>(`/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/config`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    sawaboApiRotateSecret: (sessionId: string) =>
      request<{
        id: string | null;
        sessionId: string;
        sessionKey?: string;
        enabled: boolean;
        callbackUrl: string | null;
        callbackSecret: string | null;
        secretHint: string;
        secret: string;
        allowedActions: string[];
        defaultGroupIds: string[];
        maxRequestsPerHour: number;
        createdAt?: string | null;
        updatedAt?: string | null;
      }>(`/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/config/rotate-secret`, {
        method: "POST",
      }),
    sawaboApiGetRequests: (
      sessionId: string,
      params?: { limit?: number; offset?: number; status?: string; action?: string },
    ) => {
      const qs = new URLSearchParams();
      if (params?.limit !== undefined) qs.set("limit", String(params.limit));
      if (params?.offset !== undefined) qs.set("offset", String(params.offset));
      if (params?.status) qs.set("status", params.status);
      if (params?.action) qs.set("action", params.action);
      return request<{
        rows: Array<{
          id: string;
          requestId: string | null;
          action: string;
          status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
          result: unknown;
          error: string | null;
          callbackSent: boolean;
          callbackError: string | null;
          createdAt?: string | null;
          updatedAt?: string | null;
        }>;
        total: number;
      }>(
        `/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/requests${qs.toString() ? `?${qs.toString()}` : ""}`,
      );
    },
    sawaboApiDeleteRequest: (sessionId: string, reqId: string) =>
      request<{ deleted: true }>(
        `/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/requests/${encodeURIComponent(reqId)}`,
        { method: "DELETE" },
      ),
    sawaboApiRetryRequest: (sessionId: string, reqId: string) =>
      request<Record<string, unknown>>(
        `/api/behaviours/sawabo-api/${encodeURIComponent(sessionId)}/requests/${encodeURIComponent(reqId)}/retry`,
        { method: "POST" },
      ),

    adminUsers: () => request<AdminUser[]>("/api/admin/users"),
    adminCreateUser: (body: { username: string; email?: string; password: string; role: UserRole }) =>
      request<{ created: true }>("/api/admin/users", { method: "POST", body: JSON.stringify(body) }),
    adminUpdateUser: (
      id: string,
      body: { email?: string | null; role?: UserRole; isActive?: boolean; forcePasswordChange?: boolean },
    ) => request<{ updated: true }>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    adminResetUserPassword: (id: string, password: string) =>
      request<{ updated: true }>(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    adminCreateSession: (body: {
      ownerUserId: string;
      displayName: string;
      behaviours?: Array<{ templateId: string; enabled?: boolean; priority?: number; templateConfig?: unknown }>;
    }) => request<Session>("/api/admin/sessions", { method: "POST", body: JSON.stringify(body) }),
    adminTransferSession: (sessionId: string, toUserId: string) =>
      request<{ transferred: true }>(`/api/admin/sessions/${sessionId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ toUserId }),
      }),
    adminDeleteSession: (sessionId: string) =>
      request<{ deleted: true }>(`/api/admin/sessions/${sessionId}`, { method: "DELETE" }),

    subscribeSessionRealtime(sessionId: string, listeners: RealtimeEvents) {
      const s = ensureSocket();
      const onStatus = listeners.onStatus ?? (() => {});
      const onMessage = listeners.onMessage ?? (() => {});
      const onError = listeners.onError ?? (() => {});
      s.on("session:status", onStatus);
      s.on("session:message", onMessage);
      s.on("session:error", onError);
      s.emit("session:subscribe", sessionId);
      return () => {
        s.emit("session:unsubscribe", sessionId);
        s.off("session:status", onStatus);
        s.off("session:message", onMessage);
        s.off("session:error", onError);
      };
    },

    disconnectRealtime() {
      disconnectSocket();
    },
  };
}
