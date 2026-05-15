import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiClientError,
  type ApiResponse,
  type AuthState,
  type AdminUser,
  type BehaviourAssignment,
  type BehaviourTemplate,
  type Chat,
  type GroupParticipant,
  type Session,
  type SessionStatus,
  type User,
  createApiClient,
} from "./api";
import { Products2Panel, type Products2Api } from "./products2/Products2Panel";
import { SawaboApiPanel, type SawaboApiClient } from "./sawaboApi/SawaboApiPanel";

type Theme = "dark" | "light";
type ToastTone = "success" | "info" | "warning" | "danger";
type Toast = { id: string; tone: ToastTone; message: string };
type TabId = "sessions" | "chats" | "behaviours" | "admin";

function getStoredTheme(): Theme {
  const v = localStorage.getItem("sawabo.web.theme");
  return v === "light" ? "light" : "dark";
}

function getStatusLabel(status: SessionStatus): string {
  return status.state;
}

function isSessionReady(session: Session | null): boolean {
  return session?.status.state === "ready";
}

/** E.164-style digits only for `to` when sending to a phone (API adds `@c.us`). */
function parsePhoneToTarget(input: string): { ok: true; to: string } | { ok: false; message: string } {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "Use digits with country code, e.g. 14155550100." };
  }
  return { ok: true, to: digits };
}

/** Parse legacy Products "Active weekdays" field (0=Sun … 6=Sat) into sorted unique ints for templateConfig. */
function parseAllowedWeekdays(input: string): number[] {
  const parts = input
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const days = new Set<number>();
  for (const p of parts) {
    const n = Math.floor(Number(p));
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 6) days.add(n);
  }
  const arr = Array.from(days).sort((a, b) => a - b);
  return arr.length > 0 ? arr : [0, 1, 2, 3, 4, 5, 6];
}

function getJwtExpMs(token: string): number | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem("sawabo.web.baseUrl") ?? "http://localhost:3010");
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [token, setToken] = useState<string | null>(localStorage.getItem("sawabo.web.token"));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("sawabo.web.user");
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [activeTab, setActiveTab] = useState<TabId>("sessions");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [textDialog, setTextDialog] = useState<"closed" | "chat" | "phone">("closed");
  const [mediaDialog, setMediaDialog] = useState<"closed" | "chat" | "phone">("closed");
  const [showBannerDialog, setShowBannerDialog] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [authHydrating, setAuthHydrating] = useState(true);

  const clearAuth = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("sawabo.web.token");
    localStorage.removeItem("sawabo.web.user");
  };

  const applyAuth = (auth: { accessToken: string; user: User }) => {
    setToken(auth.accessToken);
    setUser(auth.user);
    localStorage.setItem("sawabo.web.token", auth.accessToken);
    localStorage.setItem("sawabo.web.user", JSON.stringify(auth.user));
  };

  const api = useMemo(
    () =>
      createApiClient(baseUrl, {
        getToken: () => token,
        onAuth: applyAuth,
        onUnauthorized: clearAuth,
      }),
    [baseUrl, token],
  );

  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    return () => {
      api.clearAuthTimers();
    };
  }, [api]);

  function pushToast(message: string, tone: ToastTone = "info") {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function hydrateAuth() {
      setAuthHydrating(true);
      const base = baseUrl.replace(/\/+$/, "");
      const storedToken = localStorage.getItem("sawabo.web.token");

      if (storedToken) {
        const me = await fetchAuthedUser(base, storedToken);
        if (!active) return;
        if (me) {
          apiRef.current.applySession({
            accessToken: storedToken,
            user: me,
            accessExpiresAt: getJwtExpMs(storedToken),
          });
          setAuthHydrating(false);
          return;
        }
      }

      const refreshed = await refreshAuthState(base);
      if (!active) return;
      if (refreshed) {
        apiRef.current.applySession(refreshed);
      } else {
        clearAuth();
      }
      setAuthHydrating(false);
    }

    void hydrateAuth();
    return () => {
      active = false;
    };
  }, [baseUrl]);

  const loginMutation = useMutation({
    mutationFn: (body: { usernameOrEmail: string; password: string }) => api.login(body),
    onSuccess: () => pushToast("Connected", "success"),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", token],
    queryFn: () => api.listSessions(),
    enabled: Boolean(token),
    refetchInterval: 15000,
  });

  const selectedSession = sessionsQuery.data?.find((s) => s.id === selectedSessionId) ?? null;
  const canUseChatActions = isSessionReady(selectedSession);

  const chatsQuery = useQuery({
    queryKey: ["chats", selectedSessionId, token],
    queryFn: () => api.listChats(selectedSessionId),
    enabled: Boolean(token && selectedSessionId && canUseChatActions),
    refetchInterval: canUseChatActions ? 12000 : false,
  });

  const selectedChat = chatsQuery.data?.find((c) => c.id === selectedChatId) ?? null;

  const usersQuery = useQuery({
    queryKey: ["admin-users", token],
    queryFn: () => api.adminUsers(),
    enabled: Boolean(token && user?.role === "ADMIN" && activeTab === "admin"),
  });

  const templatesQuery = useQuery({
    queryKey: ["templates", token],
    queryFn: () => api.listTemplates(),
    enabled: Boolean(token && (activeTab === "behaviours" || activeTab === "admin")),
  });

  const behaviourQuery = useQuery({
    queryKey: ["behaviours", selectedSessionId],
    queryFn: () => api.getBehaviours(selectedSessionId),
    enabled: Boolean(selectedSessionId && activeTab === "behaviours"),
  });

  useEffect(() => {
    if (!token || !selectedSessionId) return;
    const unsubscribe = api.subscribeSessionRealtime(selectedSessionId, {
      onStatus: (event) => {
        queryClient.setQueryData<Session[] | undefined>(["sessions", token], (prev) =>
          (prev ?? []).map((s) => (s.id === event.sessionId ? { ...s, status: event.status } : s)),
        );
      },
      onError: (event) => {
        pushToast(event.error.message, "warning");
      },
    });
    return () => unsubscribe();
  }, [api, queryClient, selectedSessionId, token]);

  useEffect(() => {
    return () => api.disconnectRealtime();
  }, [api]);

  function persistTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("sawabo.web.theme", next);
  }

  function persistBaseUrl(next: string) {
    setBaseUrl(next);
    localStorage.setItem("sawabo.web.baseUrl", next);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // best effort
    }
    clearAuth();
  }

  const tabItems: Array<{ id: TabId; label: string; hidden?: boolean }> = [
    { id: "sessions", label: "Sessions" },
    { id: "chats", label: "Chats" },
    { id: "behaviours", label: "Behaviours" },
    { id: "admin", label: "Admin", hidden: user?.role !== "ADMIN" },
  ];

  return (
    <div className="appRoot">
      <header className="topBar">
        <div>
          <h1 className="brand">
            sawab<span className="brandPixel">o</span>
          </h1>
          <p className="muted">Operations control plane</p>
        </div>
        <div className="topBarActions">
          <div className="fieldRow">
            <label htmlFor="apiBase" className="label">API URL</label>
            <input
              id="apiBase"
              className="input mono"
              value={baseUrl}
              onChange={(e) => persistBaseUrl(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => persistTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          {token ? (
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          ) : null}
        </div>
      </header>

      {authHydrating ? (
        <AuthRestoreView />
      ) : !token ? (
        <LoginView
          loading={loginMutation.isPending}
          onSubmit={(values) => loginMutation.mutate(values)}
          error={readError(loginMutation.error)}
        />
      ) : user?.forcePasswordChange ? (
        <PasswordRotationView
          onSubmit={async (payload) => {
            await api.changePassword(payload);
            const me = await api.me();
            if (token) applyAuth({ accessToken: token, user: me });
            pushToast("Password updated", "success");
          }}
          onLogout={logout}
        />
      ) : (
        <main className="workspace">
          <aside className="tabsRail">
            {tabItems.filter((t) => !t.hidden).map((item) => (
              <button
                key={item.id}
                className={`tabBtn ${activeTab === item.id ? "tabBtn-active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <section className="tabPanel">
            {activeTab === "sessions" ? (
              <SessionsTab
                sessions={sessionsQuery.data ?? []}
                sessionsLoading={sessionsQuery.isPending || sessionsQuery.isFetching}
                selectedSessionId={selectedSessionId}
                selectedSession={selectedSession}
                onSelectSession={(id) => {
                  setSelectedSessionId(id);
                  setSelectedChatId("");
                }}
                onRefresh={async () => {
                  await sessionsQuery.refetch();
                  pushToast("Sessions refreshed");
                }}
                onConnect={async () => {
                  if (!selectedSessionId) return;
                  await api.startSession(selectedSessionId);
                  await sessionsQuery.refetch();
                  pushToast("Session start requested", "success");
                }}
                onRestart={async () => {
                  if (!selectedSessionId) return;
                  await api.restartSession(selectedSessionId);
                  await sessionsQuery.refetch();
                  pushToast("Session restart requested", "warning");
                }}
              />
            ) : null}

            {activeTab === "chats" ? (
              <ChatsTab
                session={selectedSession}
                chats={chatsQuery.data ?? []}
                chatsLoading={chatsQuery.isPending || chatsQuery.isFetching}
                selectedChatId={selectedChatId}
                onSelectChat={setSelectedChatId}
                chatActionApis={
                  selectedSessionId && selectedSession?.status.state === "ready"
                    ? {
                        runChatAction: async (chatId, action, muteMinutes) => {
                          await api.chatAction(selectedSessionId, {
                            chatId,
                            action,
                            muteMinutes,
                          });
                          pushToast("Chat operation applied", "success");
                        },
                        loadGroupParticipants: (groupId) => api.listGroupParticipants(selectedSessionId, groupId),
                        runGroupAction: async (payload) => {
                          await api.groupAction(selectedSessionId, payload);
                          pushToast("Group operation applied", "success");
                        },
                      }
                    : null
                }
                onOpenTextToChat={() => {
                  if (!selectedChatId) {
                    pushToast("Select a chat first", "warning");
                    return;
                  }
                  setTextDialog("chat");
                }}
                onOpenMediaToChat={() => {
                  if (!selectedChatId) {
                    pushToast("Select a chat first", "warning");
                    return;
                  }
                  setMediaDialog("chat");
                }}
                onOpenTextToPhone={() => setTextDialog("phone")}
                onOpenMediaToPhone={() => setMediaDialog("phone")}
              />
            ) : null}

            {activeTab === "behaviours" ? (
              <BehavioursTab
                session={selectedSession}
                baseUrl={baseUrl}
                assignments={behaviourQuery.data ?? []}
                templates={templatesQuery.data ?? []}
                chats={chatsQuery.data ?? []}
                canEdit={user?.role === "ADMIN"}
                repeaterApi={
                  user?.role === "ADMIN" && selectedSessionId
                    ? {
                        start: (body) => api.repeaterStart(body),
                        stop: (sessionId) => api.repeaterStop(sessionId),
                      }
                    : null
                }
                productsApi={
                  user?.role === "ADMIN" && selectedSessionId
                    ? {
                        syncNow: (sessionId) => api.productsSyncNow(sessionId),
                        clearPostedMemory: (sessionId) => api.productsClearPostedMemory(sessionId),
                        postAllNow: (sessionId) => api.productsPostAllNow(sessionId),
                        status: (sessionId) => api.productsStatus(sessionId),
                        tracker: (sessionId) => api.productsTracker(sessionId),
                        trackerAction: (sessionId, trackerId, body) =>
                          api.productsTrackerAction(sessionId, trackerId, body),
                      }
                    : null
                }
                products2Api={
                  user?.role === "ADMIN" && selectedSessionId
                    ? {
                        state: (sessionId) => api.products2State(sessionId),
                        getBoardOrder: (sessionId) => api.products2GetBoardOrder(sessionId),
                        putBoardOrder: (sessionId, body) => api.products2PutBoardOrder(sessionId, body),
                        createJob: (body) => api.products2CreateJob(body),
                        patchJob: (jobId, body) => api.products2PatchJob(jobId, body),
                        runJobNow: (jobId, body) => api.products2RunJobNow(jobId, body),
                      }
                    : null
                }
                sawaboApi={
                  user?.role === "ADMIN" && selectedSessionId
                    ? {
                        getConfig: (sessionId) => api.sawaboApiGetConfig(sessionId),
                        saveConfig: (sessionId, patch) => api.sawaboApiSaveConfig(sessionId, patch),
                        rotateSecret: (sessionId) => api.sawaboApiRotateSecret(sessionId),
                        getRequests: (sessionId, params) => api.sawaboApiGetRequests(sessionId, params),
                        deleteRequest: (sessionId, reqId) => api.sawaboApiDeleteRequest(sessionId, reqId),
                        retryRequest: (sessionId, reqId) => api.sawaboApiRetryRequest(sessionId, reqId),
                      }
                    : null
                }
                onRefreshAssignments={() => behaviourQuery.refetch()}
                onSaveAssignments={async (assignments) => {
                  if (!selectedSessionId) return;
                  await api.setBehaviours(selectedSessionId, assignments);
                  await behaviourQuery.refetch();
                  pushToast("Behaviours updated", "success");
                }}
                onOpenBannerDialog={() => setShowBannerDialog(true)}
                toast={pushToast}
              />
            ) : null}

            {activeTab === "admin" && user?.role === "ADMIN" ? (
              <AdminTab
                api={api}
                users={usersQuery.data ?? []}
                sessions={sessionsQuery.data ?? []}
                onRefresh={async () => {
                  await usersQuery.refetch();
                  await sessionsQuery.refetch();
                }}
                onToast={pushToast}
              />
            ) : null}
          </section>
        </main>
      )}

      {textDialog !== "closed" && selectedSessionId && selectedSession?.status.state === "ready" ? (
        <SendTextDialog
          mode={textDialog === "chat" ? "selected_chat" : "phone"}
          lockedChat={textDialog === "chat" && selectedChat ? { id: selectedChat.id, name: selectedChat.name } : undefined}
          onClose={() => setTextDialog("closed")}
          onSend={async (payload) => {
            await api.sendText(selectedSessionId, payload);
            setTextDialog("closed");
            pushToast("Message sent", "success");
          }}
        />
      ) : null}

      {mediaDialog !== "closed" && selectedSessionId && selectedSession?.status.state === "ready" ? (
        <SendMediaDialog
          mode={mediaDialog === "chat" ? "selected_chat" : "phone"}
          lockedChat={mediaDialog === "chat" && selectedChat ? { id: selectedChat.id, name: selectedChat.name } : undefined}
          onClose={() => setMediaDialog("closed")}
          onSend={async (payload) => {
            await api.sendMedia(selectedSessionId, payload);
            setMediaDialog("closed");
            pushToast("Media sent", "success");
          }}
        />
      ) : null}

      {showBannerDialog && selectedSessionId && selectedSession?.status.state === "ready" ? (
        <BannerBanDialog
          sessionId={selectedSessionId}
          chats={(chatsQuery.data ?? []).filter((c) => c.isGroup)}
          api={api}
          onClose={() => setShowBannerDialog(false)}
          onDone={() => {
            setShowBannerDialog(false);
            pushToast("Participant removed", "warning");
          }}
        />
      ) : null}

      <ToastStack items={toasts} />
    </div>
  );
}

function readError(error: unknown): string | null {
  if (error instanceof ApiClientError) {
    return `${error.message}${error.code ? ` (${error.code})` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return null;
}

function Spinner({ small, ariaLabel }: { small?: boolean; ariaLabel?: string }) {
  return (
    <span
      className={small ? "spinner spinner-sm" : "spinner"}
      role="status"
      aria-label={ariaLabel ?? "Loading"}
    />
  );
}

function LoginView({
  onSubmit,
  loading,
  error,
}: {
  onSubmit: (v: { usernameOrEmail: string; password: string }) => void;
  loading: boolean;
  error: string | null;
}) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="loginWrap">
      <section className="card loginCard">
        <h2>Sign in</h2>
        <label htmlFor="loginName" className="label">Username or email</label>
        <input id="loginName" className="input" value={usernameOrEmail} onChange={(e) => setUsernameOrEmail(e.target.value)} />
        <label htmlFor="loginPassword" className="label">Password</label>
        <input id="loginPassword" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="danger mono">{error}</p> : null}
        <button className="btn btn-primary" type="button" disabled={loading} onClick={() => onSubmit({ usernameOrEmail, password })}>
          {loading ? (
            <>
              <Spinner small ariaLabel="Signing in" /> Sign in
            </>
          ) : (
            "Connect"
          )}
        </button>
      </section>
    </main>
  );
}

function PasswordRotationView({
  onSubmit,
  onLogout,
}: {
  onSubmit: (v: { currentPassword: string; nextPassword: string }) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="loginWrap">
      <section className="card loginCard">
        <h2>Password rotation required</h2>
        <p className="muted">Update your password before using the workspace.</p>
        <label htmlFor="currentPwd" className="label">Current password</label>
        <input id="currentPwd" className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <label htmlFor="nextPwd" className="label">New password</label>
        <input id="nextPwd" className="input" type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} />
        {error ? <p className="danger mono">{error}</p> : null}
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={working}
            onClick={async () => {
              try {
                setWorking(true);
                setError(null);
                await onSubmit({ currentPassword, nextPassword });
              } catch (err) {
                setError(readError(err) ?? "Password update failed");
              } finally {
                setWorking(false);
              }
            }}
          >
            {working ? <Spinner small ariaLabel="Updating password" /> : null}
            Apply password
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}

function SessionsTab({
  sessions,
  sessionsLoading,
  selectedSessionId,
  selectedSession,
  onSelectSession,
  onRefresh,
  onConnect,
  onRestart,
}: {
  sessions: Session[];
  sessionsLoading: boolean;
  selectedSessionId: string;
  selectedSession: Session | null;
  onSelectSession: (sessionId: string) => void;
  onRefresh: () => Promise<void>;
  onConnect: () => Promise<void>;
  onRestart: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sessionOpBusy, setSessionOpBusy] = useState<"connect" | "restart" | null>(null);
  const filtered = sessions.filter((s) => {
    const key = `${s.displayName ?? ""} ${s.id} ${s.owner?.username ?? ""}`.toLowerCase();
    return key.includes(search.toLowerCase());
  });

  return (
    <section className="card">
      <h2>Sessions</h2>
      <div className="row">
        <input
          className="input"
          placeholder="Search sessions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-secondary" type="button" onClick={() => void onRefresh()}>
          {sessionsLoading ? <Spinner small ariaLabel="Refreshing sessions" /> : null}
          Refresh
        </button>
      </div>
      <ul className="list">
        {filtered.map((s) => (
          <li key={s.id}>
            <button className={`listBtn ${selectedSessionId === s.id ? "listBtn-active" : ""}`} onClick={() => onSelectSession(s.id)}>
              <span>
                <strong>{s.displayName ?? s.id}</strong>
                <br />
                <code>{s.id}</code>
              </span>
              <span className={`pill state-${s.status.state}`}>{getStatusLabel(s.status)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!selectedSession ? <p className="muted">No session selected. Pick one to begin.</p> : null}
      {selectedSession ? (
        <div className="panel">
          <div className="row">
            <span className={`pill state-${selectedSession.status.state}`}>{selectedSession.status.state}</span>
            <span className="pill">{selectedSession.behaviour?.templateId ?? "default"}</span>
            {selectedSession.owner ? <span className="pill">owner {selectedSession.owner.username}</span> : null}
          </div>
          {selectedSession.status.state === "qr" && selectedSession.status.qrDataUrl ? (
            <div className="qrWrap">
              <img className="qr" src={selectedSession.status.qrDataUrl} alt="Session QR" />
              <p className="muted">Scan to authenticate.</p>
            </div>
          ) : null}
          <div className="row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={sessionOpBusy !== null}
              onClick={async () => {
                setSessionOpBusy("connect");
                try {
                  await onConnect();
                } finally {
                  setSessionOpBusy(null);
                }
              }}
            >
              {sessionOpBusy === "connect" ? <Spinner small ariaLabel="Connecting" /> : null}
              Connect
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={sessionOpBusy !== null}
              onClick={async () => {
                setSessionOpBusy("restart");
                try {
                  await onRestart();
                } finally {
                  setSessionOpBusy(null);
                }
              }}
            >
              {sessionOpBusy === "restart" ? <Spinner small ariaLabel="Restarting" /> : null}
              Restart
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ChatsTab({
  session,
  chats,
  chatsLoading,
  selectedChatId,
  onSelectChat,
  chatActionApis,
  onOpenTextToChat,
  onOpenMediaToChat,
  onOpenTextToPhone,
  onOpenMediaToPhone,
}: {
  session: Session | null;
  chats: Chat[];
  chatsLoading: boolean;
  selectedChatId: string;
  onSelectChat: (id: string) => void;
  chatActionApis: {
    runChatAction: (
      chatId: string,
      action: "archive" | "unarchive" | "pin" | "unpin" | "mute" | "unmute" | "mark_unread",
      muteMinutes?: number,
    ) => Promise<void>;
    loadGroupParticipants: (groupId: string) => Promise<GroupParticipant[]>;
    runGroupAction: (payload: { groupId: string; participantId: string; action: "remove" | "promote" | "demote" }) => Promise<void>;
  } | null;
  onOpenTextToChat: () => void;
  onOpenMediaToChat: () => void;
  onOpenTextToPhone: () => void;
  onOpenMediaToPhone: () => void;
}) {
  const [search, setSearch] = useState("");
  const ready = isSessionReady(session);

  const filtered = chats.filter((c) => `${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()));
  const groups = filtered.filter((c) => c.isGroup);

  return (
    <section className="card">
      <h2>Chats</h2>
      {!session ? <p className="muted">Select a session first.</p> : null}
      {session && !ready ? <p className="muted">Chat actions unlock when session is ready.</p> : null}
      {ready ? (
        <div className="panel">
          <h3>Message a number</h3>
          <p className="muted">Opens send dialogs for E.164-style numbers (digits with country code) when the chat is not in your list.</p>
          <div className="row wrap">
            <button className="btn btn-secondary" type="button" onClick={onOpenTextToPhone}>
              Send text to number
            </button>
            <button className="btn btn-secondary" type="button" onClick={onOpenMediaToPhone}>
              Send media to number
            </button>
          </div>
        </div>
      ) : null}
      <div className="row">
        <input
          className="input"
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!ready}
        />
        {chatsLoading ? <Spinner ariaLabel="Loading chats" /> : null}
      </div>
      <ul className="list">
        {filtered.map((chat) => (
          <li key={chat.id}>
            <div style={{ width: "100%" }}>
              <button
                className={`listBtn ${selectedChatId === chat.id ? "listBtn-active" : ""}`}
                onClick={() => onSelectChat(chat.id)}
                disabled={!ready}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="chatListTitle">{chat.name}</span>
                  <p className="chatListMeta">
                    <code>{chat.id}</code>
                  </p>
                </span>
                {chat.isGroup ? (
                  <span className="pill" style={{ flexShrink: 0 }}>
                    group
                  </span>
                ) : null}
              </button>
              {ready && selectedChatId === chat.id ? (
                <div className="chatActionsUnderItem">
                  <div className="chatSendUnderItem">
                    <h4 className="chatUnderItemHeading">Send</h4>
                    <div className="row wrap">
                      <button className="btn btn-primary" type="button" onClick={onOpenTextToChat}>
                        Send text to chat
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={onOpenMediaToChat}>
                        Send media to chat
                      </button>
                    </div>
                  </div>
                  {chatActionApis ? (
                    <ChatActionsInline
                      key={chat.id}
                      chat={chat}
                      onChatAction={(action, muteMinutes) =>
                        chatActionApis.runChatAction(chat.id, action, muteMinutes)
                      }
                      onLoadGroupParticipants={chatActionApis.loadGroupParticipants}
                      onGroupAction={chatActionApis.runGroupAction}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {ready && groups.length === 0 && !chatsLoading ? (
        <p className="muted">No chats yet. Refresh in Sessions after connection is ready.</p>
      ) : null}
    </section>
  );
}

/** Inline toolbox under Selected chat (replaces modal for reliability in embedded layouts). */
function ChatActionsInline({
  chat,
  onChatAction,
  onLoadGroupParticipants,
  onGroupAction,
}: {
  chat: Chat;
  onChatAction: (
    action: "archive" | "unarchive" | "pin" | "unpin" | "mute" | "unmute" | "mark_unread",
    muteMinutes?: number,
  ) => Promise<void>;
  onLoadGroupParticipants: (groupId: string) => Promise<GroupParticipant[]>;
  onGroupAction: (payload: { groupId: string; participantId: string; action: "remove" | "promote" | "demote" }) => Promise<void>;
}) {
  const muteInputId = useId();
  const [muteMinutes, setMuteMinutes] = useState("60");
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [participantId, setParticipantId] = useState("");
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setActionBusy(label);
    try {
      await fn();
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="chatActionsInline">
      <h3>Chat actions</h3>
      <p className="muted">
        Target: <strong>{chat.name}</strong>
      </p>

      <div className="panel">
        <h4>Mailbox</h4>
        <div className="row wrap">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("unread", () => onChatAction("mark_unread"))}
          >
            {actionBusy === "unread" ? <Spinner small ariaLabel="Working" /> : null}
            Mark unread
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("archive", () => onChatAction("archive"))}
          >
            {actionBusy === "archive" ? <Spinner small ariaLabel="Working" /> : null}
            Archive
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("unarchive", () => onChatAction("unarchive"))}
          >
            Unarchive
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("pin", () => onChatAction("pin"))}
          >
            Pin
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("unpin", () => onChatAction("unpin"))}
          >
            Unpin
          </button>
        </div>
      </div>

      <div className="panel">
        <h4>Mute</h4>
        <div className="row wrap">
          <label htmlFor={muteInputId} className="label">
            Minutes
          </label>
          <input id={muteInputId} className="input tiny" value={muteMinutes} onChange={(e) => setMuteMinutes(e.target.value)} />
          <button
            className="btn btn-secondary"
            type="button"
            disabled={actionBusy !== null}
            onClick={() =>
              void run("mute", () => onChatAction("mute", Number(muteMinutes || "60")))
            }
          >
            {actionBusy === "mute" ? <Spinner small ariaLabel="Working" /> : null}
            Mute
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={actionBusy !== null}
            onClick={() => void run("unmute", () => onChatAction("unmute"))}
          >
            Unmute
          </button>
        </div>
      </div>

      {chat.isGroup ? (
        <div className="panel">
          <h4>Group admin</h4>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={loadingParticipants}
            onClick={async () => {
              setLoadingParticipants(true);
              try {
                const list = await onLoadGroupParticipants(chat.id);
                setParticipants(list);
                setParticipantId(list[0]?.id ?? "");
              } finally {
                setLoadingParticipants(false);
              }
            }}
          >
            {loadingParticipants ? <Spinner small ariaLabel="Loading participants" /> : null}
            Load participants
          </button>
          {participants.length > 0 ? (
            <>
              <label className="label">Participant</label>
              <ul className="list compactList">
                {participants.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`listBtn ${participantId === p.id ? "listBtn-active" : ""}`}
                      onClick={() => setParticipantId(p.id)}
                    >
                      <span className="mono">{p.id}</span>
                      {p.isAdmin ? <span className="pill">admin</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="row wrap">
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={actionBusy !== null || !participantId}
                  onClick={() =>
                    void run("remove", () =>
                      onGroupAction({ groupId: chat.id, participantId, action: "remove" }),
                    )
                  }
                >
                  {actionBusy === "remove" ? <Spinner small ariaLabel="Working" /> : null}
                  Remove
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={actionBusy !== null || !participantId}
                  onClick={() =>
                    void run("promote", () =>
                      onGroupAction({ groupId: chat.id, participantId, action: "promote" }),
                    )
                  }
                >
                  Promote
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={actionBusy !== null || !participantId}
                  onClick={() =>
                    void run("demote", () =>
                      onGroupAction({ groupId: chat.id, participantId, action: "demote" }),
                    )
                  }
                >
                  Demote
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Load participants to enable moderation.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Drop deprecated `postStrategy` from stored assignment config (server maps it via Zod). */
function pruneLegacyPostStrategy(cfg: Record<string, unknown>): Record<string, unknown> {
  const next = { ...cfg };
  delete next.postStrategy;
  return next;
}

function BehavioursTab({
  session,
  baseUrl,
  assignments,
  templates,
  chats,
  canEdit,
  repeaterApi,
  productsApi,
  products2Api,
  sawaboApi,
  onRefreshAssignments,
  onSaveAssignments,
  onOpenBannerDialog,
  toast,
}: {
  session: Session | null;
  baseUrl: string;
  assignments: BehaviourAssignment[];
  templates: BehaviourTemplate[];
  chats: Chat[];
  canEdit: boolean;
  repeaterApi: {
    start: (body: {
      sessionId: string;
      chatId: string;
      message: string;
      count: number;
      intervalSeconds: number;
    }) => Promise<{ started: true }>;
    stop: (sessionId: string) => Promise<{ stopped: true }>;
  } | null;
  productsApi: {
    syncNow: (sessionId: string) => Promise<{ synced: true }>;
    clearPostedMemory: (
      sessionId: string,
    ) => Promise<{ deletedTrackers: number; deletedHandledRequests: number }>;
    postAllNow: (sessionId: string) => Promise<{ posted: true }>;
    status: (sessionId: string) => Promise<{
      enabled: boolean;
      configured: boolean;
      running: boolean;
      lastRunAt?: string;
      lastError?: string;
      nextRunAt?: string;
      lastPostEvalSummary?: string;
    }>;
    tracker: (sessionId: string) => Promise<
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
    >;
    trackerAction: (
      sessionId: string,
      trackerId: string,
      body: {
        action: "toggle_unavailable" | "mark_available" | "set_redirect_url" | "clear_redirect_url" | "repost_now";
        redirectUrl?: string;
        cooldownSeconds?: number;
      },
    ) => Promise<{ action: string; tracker: unknown }>;
  } | null;
  products2Api: Products2Api | null;
  sawaboApi: SawaboApiClient | null;
  onRefreshAssignments: () => void;
  onSaveAssignments: (assignments: BehaviourAssignment[]) => Promise<void>;
  onOpenBannerDialog: () => void;
  toast: (msg: string, tone?: ToastTone) => void;
}) {
  const [draft, setDraft] = useState<BehaviourAssignment[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [repeaterChatId, setRepeaterChatId] = useState("");
  const [repeaterMessage, setRepeaterMessage] = useState("");
  const [repeaterCount, setRepeaterCount] = useState("10");
  const [repeaterIntervalSec, setRepeaterIntervalSec] = useState("5");
  const [repeaterBusy, setRepeaterBusy] = useState<"start" | "stop" | null>(null);
  const [productsBusy, setProductsBusy] = useState<"sync" | "refresh" | "clear" | "postall" | null>(null);
  const [productsStatus, setProductsStatus] = useState<{
    enabled: boolean;
    configured: boolean;
    running: boolean;
    lastRunAt?: string;
    lastError?: string;
    nextRunAt?: string;
    lastPostEvalSummary?: string;
  } | null>(null);
  const [productsTracker, setProductsTracker] = useState<
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
  >([]);
  useEffect(() => {
    setDraft(
      assignments.map((item) => ({
        ...item,
        templateId: typeof item.templateId === "string" ? item.templateId.trim() : item.templateId,
      })),
    );
  }, [assignments]);

  useEffect(() => {
    setRepeaterChatId("");
    setRepeaterMessage("");
    setRepeaterCount("10");
    setRepeaterIntervalSec("5");
    setProductsStatus(null);
    setProductsTracker([]);
  }, [session?.id]);

  const bannerAssigned = draft.some((a) => a.templateId === "banner");
  const bannerEnabled = draft.some((a) => a.templateId === "banner" && a.enabled);
  const repeaterAssigned = draft.some((a) => a.templateId === "repeater");
  const repeaterEnabled = draft.some((a) => a.templateId === "repeater" && a.enabled);
  const productsAssigned = draft.some((a) => a.templateId === "products");
  const productsEnabled = draft.some((a) => a.templateId === "products" && a.enabled);
  const products2Assigned = draft.some((a) => a.templateId === "products2");
  const products2Enabled = draft.some((a) => a.templateId === "products2" && a.enabled);
  const sawaboAssigned = draft.some((a) => a.templateId === "sawabo-api");
  const groupCount = chats.filter((c) => c.isGroup).length;
  const groups = chats.filter((c) => c.isGroup);
  const ready = isSessionReady(session);
  const productsConfig = getProductsConfig();

  async function handleSaveAssignments() {
    setSavingAssignments(true);
    try {
      await onSaveAssignments(draft);
    } finally {
      setSavingAssignments(false);
    }
  }

  function handleDeleteAssignment(index: number) {
    setDraft((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, idx) => ({
          ...item,
          priority: idx + 1,
        })),
    );
  }

  function getProductsConfig(): {
    apiUrl: string;
    authType: "none" | "bearer" | "basic";
    authToken: string;
    authUsername: string;
    authPassword: string;
    groupId: string;
    cycleIntervalSeconds: string;
    currencyCode: string;
    includeImageUrls: boolean;
    maxProductsPerCycle: string;
    maxUnavailableRequestsPerCycle: string;
    unavailableRequestCooldownSeconds: string;
    forceRepostEveryCycle: boolean;
    sendDelayMs: string;
    allowedWeekdays: string;
    activeHoursStart: string;
    activeHoursEnd: string;
  } {
    const row = draft.find((a) => a.templateId === "products");
    const raw = (row?.templateConfig ?? {}) as Record<string, unknown>;
    const authTypeRaw = typeof raw.authType === "string" ? raw.authType : "none";
    return {
      apiUrl:
        typeof raw.apiUrl === "string" && raw.apiUrl.trim()
          ? raw.apiUrl
          : "https://la-boutique-by-bnm.vercel.app/sawabo",
      authType:
        authTypeRaw === "bearer" || authTypeRaw === "basic" || authTypeRaw === "none"
          ? authTypeRaw
          : "none",
      authToken: typeof raw.authToken === "string" ? raw.authToken : "",
      authUsername: typeof raw.authUsername === "string" ? raw.authUsername : "",
      authPassword: typeof raw.authPassword === "string" ? raw.authPassword : "",
      groupId: typeof raw.groupId === "string" ? raw.groupId : "",
      cycleIntervalSeconds:
        typeof raw.cycleIntervalSeconds === "number"
          ? String(raw.cycleIntervalSeconds)
          : typeof raw.cycleIntervalSeconds === "string"
            ? raw.cycleIntervalSeconds
            : "300",
      currencyCode:
        typeof raw.currencyCode === "string" && raw.currencyCode.trim() ? raw.currencyCode : "FCFA",
      includeImageUrls: Boolean(raw.includeImageUrls),
      maxProductsPerCycle:
        typeof raw.maxProductsPerCycle === "number"
          ? String(raw.maxProductsPerCycle)
          : typeof raw.maxProductsPerCycle === "string"
            ? raw.maxProductsPerCycle
            : "30",
      maxUnavailableRequestsPerCycle:
        typeof raw.maxUnavailableRequestsPerCycle === "number"
          ? String(raw.maxUnavailableRequestsPerCycle)
          : typeof raw.maxUnavailableRequestsPerCycle === "string"
            ? raw.maxUnavailableRequestsPerCycle
            : "40",
      unavailableRequestCooldownSeconds:
        typeof raw.unavailableRequestCooldownSeconds === "number"
          ? String(raw.unavailableRequestCooldownSeconds)
          : typeof raw.unavailableRequestCooldownSeconds === "string"
            ? raw.unavailableRequestCooldownSeconds
            : "86400",
      forceRepostEveryCycle: Boolean(raw.forceRepostEveryCycle) || raw.postStrategy === "always",
      sendDelayMs:
        typeof raw.sendDelayMs === "number"
          ? String(raw.sendDelayMs)
          : typeof raw.sendDelayMs === "string"
            ? raw.sendDelayMs
            : "0",
      allowedWeekdays: Array.isArray(raw.allowedWeekdays) ? raw.allowedWeekdays.join(",") : "0,1,2,3,4,5,6",
      activeHoursStart:
        typeof raw.activeHoursStart === "number"
          ? String(raw.activeHoursStart)
          : typeof raw.activeHoursStart === "string"
            ? raw.activeHoursStart
            : "0",
      activeHoursEnd:
        typeof raw.activeHoursEnd === "number"
          ? String(raw.activeHoursEnd)
          : typeof raw.activeHoursEnd === "string"
            ? raw.activeHoursEnd
            : "23",
    };
  }

  function updateProductsConfig(patch: Record<string, unknown>) {
    setDraft((prev) =>
      prev.map((item) =>
        item.templateId !== "products"
          ? item
          : {
              ...item,
              templateConfig: pruneLegacyPostStrategy({
                ...((item.templateConfig as Record<string, unknown>) ?? {}),
                ...patch,
              }),
            },
      ),
    );
  }

  function getProducts2Config(): {
    apiUrl: string;
    authType: "none" | "bearer" | "basic";
    authToken: string;
    authUsername: string;
    authPassword: string;
    defaultGroupIds: string[];
    attachProductUrl: boolean;
    cycleIntervalSeconds: string;
    maxJobsPerCycle: string;
    sendDelayMs: string;
    currencyCode: string;
    includeImageUrls: boolean;
  } {
    const row = draft.find((a) => a.templateId === "products2");
    const raw = (row?.templateConfig ?? {}) as Record<string, unknown>;
    const authTypeRaw = typeof raw.authType === "string" ? raw.authType : "none";
    return {
      apiUrl:
        typeof raw.apiUrl === "string" && raw.apiUrl.trim()
          ? raw.apiUrl
          : "https://la-boutique-by-bnm.vercel.app/sawabo",
      authType:
        authTypeRaw === "bearer" || authTypeRaw === "basic" || authTypeRaw === "none"
          ? authTypeRaw
          : "none",
      authToken: typeof raw.authToken === "string" ? raw.authToken : "",
      authUsername: typeof raw.authUsername === "string" ? raw.authUsername : "",
      authPassword: typeof raw.authPassword === "string" ? raw.authPassword : "",
      defaultGroupIds: Array.isArray(raw.defaultGroupIds)
        ? raw.defaultGroupIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [],
      attachProductUrl: Boolean(raw.attachProductUrl),
      cycleIntervalSeconds:
        typeof raw.cycleIntervalSeconds === "number"
          ? String(raw.cycleIntervalSeconds)
          : typeof raw.cycleIntervalSeconds === "string"
            ? raw.cycleIntervalSeconds
            : "300",
      maxJobsPerCycle:
        typeof raw.maxJobsPerCycle === "number"
          ? String(raw.maxJobsPerCycle)
          : typeof raw.maxJobsPerCycle === "string"
            ? raw.maxJobsPerCycle
            : "25",
      sendDelayMs:
        typeof raw.sendDelayMs === "number"
          ? String(raw.sendDelayMs)
          : typeof raw.sendDelayMs === "string"
            ? raw.sendDelayMs
            : "0",
      currencyCode:
        typeof raw.currencyCode === "string" && raw.currencyCode.trim() ? raw.currencyCode : "FCFA",
      includeImageUrls: Boolean(raw.includeImageUrls),
    };
  }

  function updateProducts2Config(patch: Record<string, unknown>) {
    setDraft((prev) =>
      prev.map((item) =>
        item.templateId !== "products2"
          ? item
          : {
              ...item,
              templateConfig: {
                ...((item.templateConfig as Record<string, unknown>) ?? {}),
                ...patch,
              },
            },
      ),
    );
  }

  async function refreshProductsPanelState() {
    if (!session || !productsApi) return;
    setProductsBusy("refresh");
    try {
      const [status, tracker] = await Promise.all([
        productsApi.status(session.id),
        productsApi.tracker(session.id),
      ]);
      setProductsStatus(status);
      setProductsTracker(tracker);
    } catch (err) {
      toast(readError(err) ?? "Failed to refresh products state", "danger");
    } finally {
      setProductsBusy(null);
    }
  }

  async function runTrackerAction(
    trackerId: string,
    action: "toggle_unavailable" | "mark_available" | "set_redirect_url" | "clear_redirect_url" | "repost_now",
    options?: { redirectUrl?: string; cooldownSeconds?: number },
  ) {
    if (!session || !productsApi) return;
    setProductsBusy("sync");
    try {
      await productsApi.trackerAction(session.id, trackerId, {
        action,
        ...(options?.redirectUrl ? { redirectUrl: options.redirectUrl } : {}),
        ...(typeof options?.cooldownSeconds === "number" ? { cooldownSeconds: options.cooldownSeconds } : {}),
      });
      await refreshProductsPanelState();
      toast("Product action applied", "success");
    } catch (err) {
      toast(readError(err) ?? "Product action failed", "danger");
    } finally {
      setProductsBusy(null);
    }
  }

  useEffect(() => {
    if (!session || !productsApi || !productsAssigned) return;
    void refreshProductsPanelState();
    // Intentionally scoped to panel visibility + selected session.
  }, [session?.id, productsAssigned]);

  return (
    <section className="card">
      <h2>Behaviours</h2>
      {!session ? <p className="muted">Select a session first.</p> : null}
      {session ? (
        <div className="behavioursStack">
          <div className="behavioursToolbar row wrap">
            <button className="btn btn-secondary" type="button" onClick={() => void onRefreshAssignments()}>
              Refresh assignments
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canEdit || draft.length === 0 || savingAssignments}
              onClick={() => void handleSaveAssignments()}
            >
              {savingAssignments ? <Spinner small ariaLabel="Saving assignments" /> : null}
              Save assignments
            </button>
          </div>
          <p className="muted behavioursIntro">
            Lower priority numbers run first. Template-specific JSON (topic id, wording, webhook URL) stays in backend config —
            assignments here toggle which templates participate and their order only.
          </p>
          <ul className="list behavioursAssignList">
            {draft.map((item, idx) => (
              <li key={`${item.templateId}-${idx}`} className="behaviourAssignItem">
                <div className="behaviourAssignTitle">
                  <code className="behaviourTemplateId">{item.templateId.trim() || "(unnamed)"}</code>
                </div>
                <div className="behaviourAssignControls">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => setDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: e.target.checked } : x)))}
                    />
                    enabled
                  </label>
                  <div className="behaviourPriorityField">
                    <label htmlFor={`beh-priority-${idx}`} className="label behaviourPriorityLabel">
                      Priority
                    </label>
                    <input
                      id={`beh-priority-${idx}`}
                      className="input tiny mono"
                      aria-label={`Priority for ${item.templateId}`}
                      title="Lower runs first"
                      value={item.priority ?? idx + 1}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, priority: Number(e.target.value || idx + 1) } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  {canEdit ? (
                    <button
                      className="btn btn-danger behaviourDeleteBtn"
                      type="button"
                      onClick={() => handleDeleteAssignment(idx)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="fieldRow behavioursAddBlock">
              <label htmlFor="addBehaviourTpl" className="label">
                Add behaviour
              </label>
              <select
                id="addBehaviourTpl"
                className="input"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value.trim();
                  if (!id) return;
                  setDraft((prev) => [
                    ...prev,
                    { templateId: id, enabled: true, priority: prev.length + 1, templateConfig: {} },
                  ]);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Choose template
                </option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {bannerAssigned ? (
            <div className="panel behavioursBannerPanel">
              <h3>Banner tools</h3>
              {!ready ? <p className="muted">Banner actions unlock when session is ready.</p> : null}
              {!bannerEnabled ? <p className="muted">Turn on the banner assignment above to expose live moderation tooling.</p> : null}
              {groupCount === 0 ? <p className="muted">No group chats found for this session.</p> : null}
              <button
                className="btn btn-danger"
                type="button"
                disabled={!ready || !bannerEnabled || groupCount === 0 || !canEdit}
                onClick={onOpenBannerDialog}
              >
                Open banner action
              </button>
            </div>
          ) : null}

          {repeaterAssigned ? (
            <div className="panel behavioursRepeaterPanel">
              <h3>Repeater</h3>
              <p className="muted">
                Sends the same text to one chat repeatedly: choose the chat, message, how many times, and seconds between sends
                (0 = back-to-back). Runs in the background after you start.
              </p>
              {!ready ? <p className="muted">Repeater unlocks when the session is ready.</p> : null}
              {!repeaterEnabled ? (
                <p className="muted">Turn on the <code>repeater</code> assignment above to enable this panel.</p>
              ) : null}
              {!repeaterApi ? <p className="muted">Only admins can start or stop a repeater run.</p> : null}

              <div className="fieldRow">
                <label htmlFor="repeaterChatSel" className="label">
                  Target chat
                </label>
                <select
                  id="repeaterChatSel"
                  className="input"
                  value={repeaterChatId}
                  onChange={(e) => setRepeaterChatId(e.target.value)}
                  disabled={!ready}
                >
                  <option value="">Select chat</option>
                  {chats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.id}
                    </option>
                  ))}
                </select>
              </div>

              <label htmlFor="repeaterMsgBody" className="label">
                Message
              </label>
              <textarea
                id="repeaterMsgBody"
                className="input"
                rows={3}
                value={repeaterMessage}
                onChange={(e) => setRepeaterMessage(e.target.value)}
                disabled={!ready}
                placeholder="Text to send each time"
              />

              <div className="row wrap behavioursRepeaterNums">
                <div className="fieldRow">
                  <label htmlFor="repeaterCountInp" className="label">
                    Count
                  </label>
                  <input
                    id="repeaterCountInp"
                    className="input tiny mono"
                    type="number"
                    min={1}
                    max={500}
                    value={repeaterCount}
                    onChange={(e) => setRepeaterCount(e.target.value)}
                    disabled={!ready}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="repeaterIntervalInp" className="label">
                    Interval (seconds)
                  </label>
                  <input
                    id="repeaterIntervalInp"
                    className="input tiny mono"
                    type="number"
                    min={0}
                    max={3600}
                    step="any"
                    value={repeaterIntervalSec}
                    onChange={(e) => setRepeaterIntervalSec(e.target.value)}
                    disabled={!ready}
                  />
                </div>
              </div>

              <div className="row wrap">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    !ready ||
                    !repeaterEnabled ||
                    !repeaterApi ||
                    !canEdit ||
                    repeaterBusy !== null ||
                    !repeaterChatId.trim() ||
                    !repeaterMessage.trim()
                  }
                  onClick={async () => {
                    if (!session || !repeaterApi) return;
                    setRepeaterBusy("start");
                    try {
                      const count = Math.min(500, Math.max(1, Math.floor(Number(repeaterCount) || 1)));
                      const intervalSeconds = Math.min(3600, Math.max(0, Number(repeaterIntervalSec) || 0));
                      await repeaterApi.start({
                        sessionId: session.id,
                        chatId: repeaterChatId.trim(),
                        message: repeaterMessage.trim(),
                        count,
                        intervalSeconds,
                      });
                      toast("Repeater started (runs in background)", "success");
                    } catch (err) {
                      toast(readError(err) ?? "Repeater failed to start", "danger");
                    } finally {
                      setRepeaterBusy(null);
                    }
                  }}
                >
                  {repeaterBusy === "start" ? <Spinner small ariaLabel="Starting" /> : null}
                  Start repeater
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!repeaterApi || !canEdit || repeaterBusy !== null}
                  onClick={async () => {
                    if (!session || !repeaterApi) return;
                    setRepeaterBusy("stop");
                    try {
                      await repeaterApi.stop(session.id);
                      toast("Repeater stop signaled", "warning");
                    } catch (err) {
                      toast(readError(err) ?? "Stop failed", "danger");
                    } finally {
                      setRepeaterBusy(null);
                    }
                  }}
                >
                  {repeaterBusy === "stop" ? <Spinner small ariaLabel="Stopping" /> : null}
                  Stop repeater
                </button>
              </div>
            </div>
          ) : null}

          {products2Assigned ? (
            <Products2Panel
              session={session}
              groups={groups}
              products2Assigned={products2Assigned}
              products2Enabled={products2Enabled}
              ready={ready}
              canEdit={canEdit}
              products2Api={products2Api}
              getProducts2Config={getProducts2Config}
              updateProducts2Config={updateProducts2Config}
              toast={toast}
            />
          ) : null}
          {sawaboAssigned ? (
            <SawaboApiPanel
              session={session ? { id: session.id, displayName: session.displayName } : null}
              baseUrl={baseUrl}
              groups={groups}
              canEdit={canEdit}
              sawaboAssigned={sawaboAssigned}
              sawaboApi={sawaboApi}
              toast={toast}
            />
          ) : null}
          {productsAssigned ? (
            <div className="panel behavioursProductsPanel">
              <h3>Products</h3>
              <p className="muted">
                Configure Sawabo API sync for this bot. You can fully tune cycle behavior, request handling, posting limits,
                and manage tracked products directly.
              </p>
              <p className="danger smallId">WIP: this legacy Products panel may still contain errors.</p>
              {!ready ? <p className="muted">Products cycle unlocks when the session is ready.</p> : null}
              {!productsEnabled ? (
                <p className="muted">Turn on the <code>products</code> assignment above to enable this panel.</p>
              ) : null}

              <div className="fieldRow">
                <label htmlFor="productsApiUrl" className="label">
                  API URL
                </label>
                <input
                  id="productsApiUrl"
                  className="input mono"
                  value={productsConfig.apiUrl}
                  onChange={(e) => updateProductsConfig({ apiUrl: e.target.value })}
                  disabled={!canEdit}
                />
              </div>

              <div className="fieldRow">
                <label htmlFor="productsAuthType" className="label">
                  Auth type
                </label>
                <select
                  id="productsAuthType"
                  className="input"
                  value={productsConfig.authType}
                  onChange={(e) => updateProductsConfig({ authType: e.target.value })}
                  disabled={!canEdit}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer token</option>
                  <option value="basic">Basic (username/password)</option>
                </select>
              </div>

              {productsConfig.authType === "bearer" ? (
                <div className="fieldRow">
                  <label htmlFor="productsAuthToken" className="label">
                    Bearer token
                  </label>
                  <input
                    id="productsAuthToken"
                    className="input mono"
                    value={productsConfig.authToken}
                    onChange={(e) => updateProductsConfig({ authToken: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Optional for now"
                  />
                </div>
              ) : null}

              {productsConfig.authType === "basic" ? (
                <div className="row wrap">
                  <div className="fieldRow">
                    <label htmlFor="productsAuthUser" className="label">
                      Username
                    </label>
                    <input
                      id="productsAuthUser"
                      className="input"
                      value={productsConfig.authUsername}
                      onChange={(e) => updateProductsConfig({ authUsername: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="fieldRow">
                    <label htmlFor="productsAuthPass" className="label">
                      Password
                    </label>
                    <input
                      id="productsAuthPass"
                      type="password"
                      className="input"
                      value={productsConfig.authPassword}
                      onChange={(e) => updateProductsConfig({ authPassword: e.target.value })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              ) : null}

              <div className="row wrap">
                <div className="fieldRow">
                  <label htmlFor="productsGroup" className="label">
                    Group
                  </label>
                  <select
                    id="productsGroup"
                    className="input"
                    value={productsConfig.groupId}
                    onChange={(e) => updateProductsConfig({ groupId: e.target.value })}
                    disabled={!canEdit}
                  >
                    <option value="">Select group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} — {g.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsCycleSec" className="label">
                    Cycle interval (s)
                  </label>
                  <input
                    id="productsCycleSec"
                    className="input tiny mono"
                    type="number"
                    min={5}
                    max={86400}
                    value={productsConfig.cycleIntervalSeconds}
                    onChange={(e) =>
                      updateProductsConfig({
                        cycleIntervalSeconds: Math.min(86400, Math.max(5, Math.floor(Number(e.target.value) || 300))),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsCurrency" className="label">
                    Currency
                  </label>
                  <input
                    id="productsCurrency"
                    className="input tiny mono"
                    value={productsConfig.currencyCode}
                    onChange={(e) => updateProductsConfig({ currencyCode: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="row wrap">
                <div className="fieldRow">
                  <label htmlFor="productsMaxCycle" className="label">
                    Max products / cycle
                  </label>
                  <input
                    id="productsMaxCycle"
                    className="input tiny mono"
                    type="number"
                    min={1}
                    max={500}
                    value={productsConfig.maxProductsPerCycle}
                    onChange={(e) =>
                      updateProductsConfig({
                        maxProductsPerCycle: Math.min(500, Math.max(1, Math.floor(Number(e.target.value) || 30))),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsMaxRequests" className="label">
                    Max requests / cycle
                  </label>
                  <input
                    id="productsMaxRequests"
                    className="input tiny mono"
                    type="number"
                    min={1}
                    max={500}
                    value={productsConfig.maxUnavailableRequestsPerCycle}
                    onChange={(e) =>
                      updateProductsConfig({
                        maxUnavailableRequestsPerCycle: Math.min(
                          500,
                          Math.max(1, Math.floor(Number(e.target.value) || 40)),
                        ),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsCooldown" className="label">
                    Unavailable cooldown (s)
                  </label>
                  <input
                    id="productsCooldown"
                    className="input tiny mono"
                    type="number"
                    min={0}
                    max={604800}
                    value={productsConfig.unavailableRequestCooldownSeconds}
                    onChange={(e) =>
                      updateProductsConfig({
                        unavailableRequestCooldownSeconds: Math.min(
                          604800,
                          Math.max(0, Math.floor(Number(e.target.value) || 86400)),
                        ),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsSendDelay" className="label">
                    Delay between posts (ms)
                  </label>
                  <input
                    id="productsSendDelay"
                    className="input tiny mono"
                    type="number"
                    min={0}
                    max={30000}
                    value={productsConfig.sendDelayMs}
                    onChange={(e) =>
                      updateProductsConfig({
                        sendDelayMs: Math.min(30000, Math.max(0, Math.floor(Number(e.target.value) || 0))),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="row wrap">
                <div className="fieldRow">
                  <label htmlFor="productsWeekdays" className="label">
                    Active weekdays (0-6)
                  </label>
                  <input
                    id="productsWeekdays"
                    className="input mono"
                    value={productsConfig.allowedWeekdays}
                    onChange={(e) =>
                      updateProductsConfig({
                        allowedWeekdays: parseAllowedWeekdays(e.target.value),
                      })
                    }
                    disabled={!canEdit}
                    placeholder="0,1,2,3,4,5,6"
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsHourStart" className="label">
                    Active hour start
                  </label>
                  <input
                    id="productsHourStart"
                    className="input tiny mono"
                    type="number"
                    min={0}
                    max={23}
                    value={productsConfig.activeHoursStart}
                    onChange={(e) =>
                      updateProductsConfig({
                        activeHoursStart: Math.min(23, Math.max(0, Math.floor(Number(e.target.value) || 0))),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="fieldRow">
                  <label htmlFor="productsHourEnd" className="label">
                    Active hour end
                  </label>
                  <input
                    id="productsHourEnd"
                    className="input tiny mono"
                    type="number"
                    min={0}
                    max={23}
                    value={productsConfig.activeHoursEnd}
                    onChange={(e) =>
                      updateProductsConfig({
                        activeHoursEnd: Math.min(23, Math.max(0, Math.floor(Number(e.target.value) || 23))),
                      })
                    }
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={productsConfig.includeImageUrls}
                  onChange={(e) => updateProductsConfig({ includeImageUrls: e.target.checked })}
                  disabled={!canEdit}
                />
                include image URLs in post text
              </label>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={productsConfig.forceRepostEveryCycle}
                  onChange={(e) => updateProductsConfig({ forceRepostEveryCycle: e.target.checked })}
                  disabled={!canEdit}
                />
                Force repost every cycle (otherwise post only when the catalog changes)
              </label>

              {productsStatus ? (
                <div className="panel">
                  <h4>Cycle status</h4>
                  <p className="smallId">
                    enabled={String(productsStatus.enabled)} configured={String(productsStatus.configured)} running=
                    {String(productsStatus.running)}
                  </p>
                  {productsStatus.lastRunAt ? <p className="smallId">last run: {productsStatus.lastRunAt}</p> : null}
                  {productsStatus.nextRunAt ? <p className="smallId">next run: {productsStatus.nextRunAt}</p> : null}
                  {productsStatus.lastPostEvalSummary ? (
                    <p className="smallId muted">first skip: {productsStatus.lastPostEvalSummary}</p>
                  ) : null}
                  {productsStatus.lastError ? <p className="danger smallId">{productsStatus.lastError}</p> : null}
                </div>
              ) : null}

              <div className="row wrap">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!productsApi || !session || productsBusy !== null}
                  onClick={() => void refreshProductsPanelState()}
                >
                  {productsBusy === "refresh" ? <Spinner small ariaLabel="Refreshing products state" /> : null}
                  Refresh products status
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!productsApi || !session || !ready || !productsEnabled || productsBusy !== null || !canEdit}
                  onClick={async () => {
                    if (!productsApi || !session) return;
                    setProductsBusy("sync");
                    try {
                      await productsApi.syncNow(session.id);
                      toast("Products sync triggered", "success");
                      await refreshProductsPanelState();
                    } catch (err) {
                      toast(readError(err) ?? "Products sync failed", "danger");
                    } finally {
                      setProductsBusy(null);
                    }
                  }}
                >
                  {productsBusy === "sync" ? <Spinner small ariaLabel="Syncing now" /> : null}
                  Run sync now
                </button>
                <button
                  className="btn btn-warning"
                  type="button"
                  disabled={!productsApi || !session || !ready || !productsEnabled || productsBusy !== null || !canEdit}
                  onClick={async () => {
                    if (!productsApi || !session) return;
                    setProductsBusy("clear");
                    try {
                      const r = await productsApi.clearPostedMemory(session.id);
                      toast(
                        `Cleared trackers (${r.deletedTrackers}) and handled requests (${r.deletedHandledRequests})`,
                        "success",
                      );
                      await refreshProductsPanelState();
                    } catch (err) {
                      toast(readError(err) ?? "Clear posted memory failed", "danger");
                    } finally {
                      setProductsBusy(null);
                    }
                  }}
                >
                  {productsBusy === "clear" ? <Spinner small ariaLabel="Clearing" /> : null}
                  Clear posted memory
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!productsApi || !session || !ready || !productsEnabled || productsBusy !== null || !canEdit}
                  onClick={async () => {
                    if (!productsApi || !session) return;
                    setProductsBusy("postall");
                    try {
                      await productsApi.postAllNow(session.id);
                      toast("Post-all cycle completed", "success");
                      await refreshProductsPanelState();
                    } catch (err) {
                      toast(readError(err) ?? "Post all now failed", "danger");
                    } finally {
                      setProductsBusy(null);
                    }
                  }}
                >
                  {productsBusy === "postall" ? <Spinner small ariaLabel="Posting all" /> : null}
                  Post all now
                </button>
              </div>

              {productsTracker.length > 0 ? (
                <div className="panel">
                  <h4>Tracked posts</h4>
                  <p className="muted behavioursIntro">
                    Availability actions send a short reply in the group threaded under the last posted product message.
                    If there is no message id yet, use <strong>Repost now</strong> once, then toggle availability.
                  </p>
                  <ul className="list compactList">
                    {productsTracker.map((row) => {
                      const canReply = Boolean(row.lastMessageId?.trim());
                      return (
                        <li key={row.id}>
                          <span>
                            <strong>{row.productId}</strong>
                            <br />
                            <code>{row.groupId}</code>
                            <br />
                            <span className="smallId">status={row.lastKnownStatus}</span>
                            {!canReply ? (
                              <p className="muted smallId" style={{ margin: "0.35rem 0 0" }}>
                                No message to reply to — repost first.
                              </p>
                            ) : null}
                            <div className="row wrap">
                              <button
                                className="btn btn-primary"
                                type="button"
                                disabled={
                                  !canEdit || !productsApi || productsBusy !== null || !ready || !productsEnabled
                                }
                                onClick={() => void runTrackerAction(row.id, "repost_now")}
                              >
                                Repost now
                              </button>
                              <button
                                className="btn btn-warning"
                                type="button"
                                disabled={
                                  !canEdit || !productsApi || productsBusy !== null || !canReply || !ready || !productsEnabled
                                }
                                onClick={() =>
                                  void runTrackerAction(row.id, "toggle_unavailable", {
                                    cooldownSeconds: Number(productsConfig.unavailableRequestCooldownSeconds) || 86400,
                                  })
                                }
                              >
                                Toggle unavailable
                              </button>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                disabled={
                                  !canEdit || !productsApi || productsBusy !== null || !canReply || !ready || !productsEnabled
                                }
                                onClick={() => void runTrackerAction(row.id, "mark_available")}
                              >
                                Mark available
                              </button>
                            </div>
                          </span>
                          <span className="smallId">{row.lastPostedAt ?? "never posted"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

        </div>
      ) : null}
    </section>
  );
}

function AdminTab({
  api,
  users,
  sessions,
  onRefresh,
  onToast,
}: {
  api: ReturnType<typeof createApiClient>;
  users: AdminUser[];
  sessions: Session[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, tone?: ToastTone) => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "CLIENT">("CLIENT");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [transferSessionId, setTransferSessionId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [search, setSearch] = useState("");
  const [adminBusy, setAdminBusy] = useState<"createUser" | "createSession" | "transfer" | "delete" | null>(null);

  useEffect(() => {
    if (users.length > 0 && !ownerUserId) setOwnerUserId(users[0].id);
  }, [users, ownerUserId]);

  useEffect(() => {
    if (sessions.length > 0 && !transferSessionId) setTransferSessionId(sessions[0].id);
  }, [sessions, transferSessionId]);

  useEffect(() => {
    if (users.length > 0 && !transferToUserId) setTransferToUserId(users[0].id);
  }, [users, transferToUserId]);

  const filteredUsers = users.filter((u) =>
    `${u.username} ${u.id} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="card">
      <h2>Admin</h2>
      <div className="grid adminGrid">
        <div className="panel">
          <h3>Create user</h3>
          <input className="input" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" placeholder="email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="fieldRow">
            <label htmlFor="createUserRole" className="label">
              Role
            </label>
            <select id="createUserRole" className="input" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "CLIENT")}>
              <option value="CLIENT">Client</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={adminBusy !== null}
            onClick={async () => {
              setAdminBusy("createUser");
              try {
                await api.adminCreateUser({ username, email: email || undefined, password, role });
                setUsername("");
                setEmail("");
                setPassword("");
                await onRefresh();
                onToast("User created", "success");
              } finally {
                setAdminBusy(null);
              }
            }}
          >
            {adminBusy === "createUser" ? <Spinner small ariaLabel="Creating user" /> : null}
            Create user
          </button>
        </div>

        <div className="panel">
          <h3>Create session</h3>
          <div className="fieldRow">
            <label htmlFor="sessionOwner" className="label">
              Owner
            </label>
            <select id="sessionOwner" className="input" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
          {users.length === 0 ? <p className="muted">Create a user first.</p> : null}
          <input className="input" placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <button
            className="btn btn-primary"
            type="button"
            disabled={users.length === 0 || !displayName.trim() || adminBusy !== null}
            onClick={async () => {
              setAdminBusy("createSession");
              try {
                await api.adminCreateSession({ ownerUserId, displayName });
                setDisplayName("");
                await onRefresh();
                onToast("Session created", "success");
              } finally {
                setAdminBusy(null);
              }
            }}
          >
            {adminBusy === "createSession" ? <Spinner small ariaLabel="Creating session" /> : null}
            Create session
          </button>
        </div>

        <div className="panel">
          <h3>Transfer session</h3>
          <div className="fieldRow">
            <label htmlFor="xferSession" className="label">
              Session
            </label>
            <select id="xferSession" className="input" value={transferSessionId} onChange={(e) => setTransferSessionId(e.target.value)}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName ?? s.id}
                </option>
              ))}
            </select>
          </div>
          <div className="fieldRow">
            <label htmlFor="xferOwner" className="label">
              New owner
            </label>
            <select id="xferOwner" className="input" value={transferToUserId} onChange={(e) => setTransferToUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
          {sessions.length === 0 ? <p className="muted">No sessions yet.</p> : null}
          <div className="row">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={sessions.length === 0 || adminBusy !== null}
              onClick={async () => {
                setAdminBusy("transfer");
                try {
                  await api.adminTransferSession(transferSessionId, transferToUserId);
                  await onRefresh();
                  onToast("Session transferred", "warning");
                } finally {
                  setAdminBusy(null);
                }
              }}
            >
              {adminBusy === "transfer" ? <Spinner small ariaLabel="Transferring session" /> : null}
              Transfer
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={sessions.length === 0 || adminBusy !== null}
              onClick={async () => {
                setAdminBusy("delete");
                try {
                  await api.adminDeleteSession(transferSessionId);
                  await onRefresh();
                  onToast("Session deleted", "danger");
                } finally {
                  setAdminBusy(null);
                }
              }}
            >
              {adminBusy === "delete" ? <Spinner small ariaLabel="Deleting session" /> : null}
              Delete session
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>User list</h3>
        <input className="input" placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ul className="list">
          {filteredUsers.map((u) => (
            <li key={u.id}>
              <span>
                <strong>{u.username}</strong>
                <br />
                <code>{u.id}</code>
              </span>
              <span className="pill">{u.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SendTextDialog({
  mode,
  lockedChat,
  onClose,
  onSend,
}: {
  mode: "selected_chat" | "phone";
  lockedChat?: { id: string; name: string };
  onClose: () => void;
  onSend: (payload: { to: string; body: string }) => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const title = mode === "selected_chat" ? "Send text to chat" : "Send text to number";

  return (
    <DialogFrame title={title} onClose={onClose}>
      {mode === "selected_chat" && lockedChat ? (
        <>
          <label className="label">Chat</label>
          <div className="fieldReadonly">{lockedChat.name}</div>
          <p className="muted mono smallId">{lockedChat.id}</p>
        </>
      ) : (
        <>
          <label htmlFor="phoneTarget" className="label">Phone number</label>
          <input
            id="phoneTarget"
            className="input"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError(null);
            }}
            placeholder="Country code and national number, digits only"
            inputMode="tel"
            autoComplete="tel"
          />
          {phone.trim() ? (
            <p className="muted mono">
              Sends as:{" "}
              {(() => {
                const p = parsePhoneToTarget(phone);
                return p.ok ? `${p.to}@c.us` : "invalid length or format";
              })()}
            </p>
          ) : null}
          {phoneError ? <p className="danger">{phoneError}</p> : null}
        </>
      )}
      <label htmlFor="msgBody" className="label">Message</label>
      <textarea id="msgBody" className="input" value={body} onChange={(e) => setBody(e.target.value)} />
      <button
        className="btn btn-primary"
        type="button"
        disabled={
          working ||
          !body.trim() ||
          (mode === "selected_chat" && !lockedChat) ||
          (mode === "phone" && !phone.trim())
        }
        onClick={async () => {
          setWorking(true);
          setPhoneError(null);
          try {
            if (mode === "selected_chat" && lockedChat) {
              await onSend({ to: lockedChat.id, body });
            } else {
              const parsed = parsePhoneToTarget(phone);
              if (!parsed.ok) {
                setPhoneError(parsed.message);
                return;
              }
              await onSend({ to: parsed.to, body });
            }
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? (
          <>
            <Spinner small ariaLabel="Sending" /> Sending
          </>
        ) : (
          "Send"
        )}
      </button>
    </DialogFrame>
  );
}

function SendMediaDialog({
  mode,
  lockedChat,
  onClose,
  onSend,
}: {
  mode: "selected_chat" | "phone";
  lockedChat?: { id: string; name: string };
  onClose: () => void;
  onSend: (payload: { to: string; body?: string; mediaBase64: string; mimetype: string; filename?: string }) => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [filename, setFilename] = useState("");
  const [mimetype, setMimetype] = useState("application/octet-stream");
  const [mediaBase64, setMediaBase64] = useState("");
  const [useUrlSource, setUseUrlSource] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [sourceSummary, setSourceSummary] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [working, setWorking] = useState(false);

  const title = mode === "selected_chat" ? "Send media to chat" : "Send media to number";

  function resolveTo(): { ok: true; to: string } | { ok: false; message: string } {
    if (mode === "selected_chat" && lockedChat) return { ok: true, to: lockedChat.id };
    return parsePhoneToTarget(phone);
  }

  return (
    <DialogFrame title={title} onClose={onClose}>
      {mode === "selected_chat" && lockedChat ? (
        <>
          <label className="label">Chat</label>
          <div className="fieldReadonly">{lockedChat.name}</div>
          <p className="muted mono smallId">{lockedChat.id}</p>
        </>
      ) : (
        <>
          <label htmlFor="mediaPhone" className="label">Phone number</label>
          <input
            id="mediaPhone"
            className="input"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError(null);
            }}
            placeholder="Country code and national number, digits only"
            inputMode="tel"
            autoComplete="tel"
          />
          {phone.trim() ? (
            <p className="muted mono">
              Sends as:{" "}
              {(() => {
                const p = parsePhoneToTarget(phone);
                return p.ok ? `${p.to}@c.us` : "invalid length or format";
              })()}
            </p>
          ) : null}
          {phoneError ? <p className="danger">{phoneError}</p> : null}
        </>
      )}

      <div className="panel">
        <div className="row between">
          <h4>Media source</h4>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useUrlSource}
              onChange={(e) => {
                const next = e.target.checked;
                setUseUrlSource(next);
                setSourceError(null);
                setSourceSummary("");
                setMediaBase64("");
                setFilename("");
                setMimetype("application/octet-stream");
                if (!next) setMediaUrl("");
              }}
            />
            Use URL instead of file
          </label>
        </div>

        {!useUrlSource ? (
          <>
            <label htmlFor="mediaFile" className="label">File</label>
            <input
              id="mediaFile"
              className="srOnly"
              type="file"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                setSourceError(null);
                setLoadingSource(true);
                try {
                  const encoded = await fileToBase64(file);
                  setMediaBase64(encoded.base64);
                  setMimetype(file.type || encoded.mimetype || "application/octet-stream");
                  setFilename(file.name);
                  setSourceSummary(`Loaded file: ${file.name}`);
                } catch {
                  setSourceError("Could not read selected file.");
                } finally {
                  setLoadingSource(false);
                }
              }}
            />
            <div className="sourcePicker">
              <label htmlFor="mediaFile" className="btn btn-secondary">
                Choose file
              </label>
              {loadingSource ? <Spinner small ariaLabel="Reading file" /> : null}
              <span className="muted mono">{filename || "No file selected."}</span>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="mediaUrl" className="label">Media URL</label>
            <input
              id="mediaUrl"
              className="input mono"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://example.com/file.png"
            />
            <button
              className="btn btn-secondary"
              type="button"
              disabled={loadingSource || !mediaUrl.trim()}
              onClick={async () => {
                setSourceError(null);
                setLoadingSource(true);
                try {
                  const loaded = await loadMediaFromUrl(mediaUrl);
                  setMediaBase64(loaded.base64);
                  setMimetype(loaded.mimetype);
                  setFilename(loaded.filename);
                  setSourceSummary(`Loaded URL: ${loaded.filename}`);
                } catch {
                  setSourceError("Could not load this URL. Some hosts block browser requests (CORS).");
                } finally {
                  setLoadingSource(false);
                }
              }}
            >
              {loadingSource ? (
                <>
                  <Spinner small ariaLabel="Loading" /> Load
                </>
              ) : (
                "Load URL"
              )}
            </button>
          </>
        )}
        {sourceSummary ? <p className="muted mono">{sourceSummary}</p> : null}
        {sourceError ? <p className="danger">{sourceError}</p> : null}
      </div>

      <label htmlFor="mediaType" className="label">File type</label>
      <input id="mediaType" className="input mono" value={mimetype} onChange={(e) => setMimetype(e.target.value)} />
      <label htmlFor="mediaFilename" className="label">File name</label>
      <input id="mediaFilename" className="input mono" value={filename} onChange={(e) => setFilename(e.target.value)} />
      <label htmlFor="mediaCaption" className="label">Caption</label>
      <input id="mediaCaption" className="input" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <button
        className="btn btn-primary"
        type="button"
        disabled={
          working ||
          loadingSource ||
          !mediaBase64.trim() ||
          (mode === "selected_chat" && !lockedChat) ||
          (mode === "phone" && !phone.trim())
        }
        onClick={async () => {
          setWorking(true);
          setPhoneError(null);
          try {
            const target = resolveTo();
            if (!target.ok) {
              setPhoneError(target.message);
              return;
            }
            await onSend({
              to: target.to,
              body: caption || undefined,
              mediaBase64,
              mimetype,
              filename: filename || undefined,
            });
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? (
          <>
            <Spinner small ariaLabel="Sending" /> Send media
          </>
        ) : (
          "Send media"
        )}
      </button>
    </DialogFrame>
  );
}

function BannerBanDialog({
  sessionId,
  chats,
  api,
  onClose,
  onDone,
}: {
  sessionId: string;
  chats: Chat[];
  api: ReturnType<typeof createApiClient>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState("");
  const [working, setWorking] = useState(false);

  const filteredGroups = chats.filter((g) => `${g.name} ${g.id}`.toLowerCase().includes(groupSearch.toLowerCase()));
  const filteredParticipants = participants.filter((p) =>
    p.id.toLowerCase().includes(participantSearch.toLowerCase()),
  );

  return (
    <DialogFrame title="Banner action" onClose={onClose}>
      <p className="muted">Pick a group, then pick a participant.</p>
      <label htmlFor="groupSearch" className="label">Group search</label>
      <input id="groupSearch" className="input" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
      <ul className="list compactList">
        {filteredGroups.map((g) => (
          <li key={g.id}>
            <button
              className={`listBtn ${selectedGroupId === g.id ? "listBtn-active" : ""}`}
              onClick={async () => {
                setSelectedGroupId(g.id);
                const data = await api.listGroupParticipants(sessionId, g.id);
                setParticipants(data);
                setSelectedParticipant("");
              }}
            >
              <span>{g.name}</span>
              <code>{g.id}</code>
            </button>
          </li>
        ))}
      </ul>
      {selectedGroupId ? (
        <>
          <label htmlFor="participantSearch" className="label">Participant search</label>
          <input
            id="participantSearch"
            className="input"
            value={participantSearch}
            onChange={(e) => setParticipantSearch(e.target.value)}
          />
          <ul className="list compactList">
            {filteredParticipants.map((p) => (
              <li key={p.id}>
                <button
                  className={`listBtn ${selectedParticipant === p.id ? "listBtn-active" : ""}`}
                  onClick={() => setSelectedParticipant(p.id)}
                >
                  <span>{p.id}</span>
                  {p.isAdmin ? <span className="pill">admin</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <button
        type="button"
        className="btn btn-danger"
        disabled={!selectedGroupId || !selectedParticipant || working}
        onClick={async () => {
          setWorking(true);
          try {
            await api.bannerBan({ sessionId, groupId: selectedGroupId, participantId: selectedParticipant });
            onDone();
          } finally {
            setWorking(false);
          }
        }}
      >
        {working ? (
          <>
            <Spinner small ariaLabel="Applying" /> Ban selected participant
          </>
        ) : (
          "Ban selected participant"
        )}
      </button>
    </DialogFrame>
  );
}

function DialogFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div
        className="dialog dialogShell"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialogHeader row between">
          <h3>{title}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialogBody">{children}</div>
      </div>
    </div>
  );
}

function ToastStack({ items }: { items: Toast[] }) {
  return (
    <div className="toastStack" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.tone}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}

function AuthRestoreView() {
  return (
    <section className="loginWrap">
      <div className="card loginCard">
        <h2>Authenticating</h2>
        <p className="muted">Restoring your session.</p>
        <div className="row">
          <Spinner ariaLabel="Authenticating" />
          <span className="muted mono crtBlink">Working</span>
        </div>
      </div>
    </section>
  );
}

async function fetchAuthedUser(base: string, token: string): Promise<User | null> {
  try {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      credentials: "include",
    });
    const json = (await res.json()) as ApiResponse<User>;
    if (!res.ok || !json.ok) return null;
    return json.data;
  } catch {
    return null;
  }
}

async function refreshAuthState(base: string): Promise<AuthState | null> {
  try {
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
    });
    const json = (await res.json()) as ApiResponse<AuthState>;
    if (!res.ok || !json.ok) return null;
    return json.data;
  } catch {
    return null;
  }
}

async function fileToBase64(file: Blob): Promise<{ base64: string; mimetype: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
  const [, mime = "application/octet-stream", base64 = ""] = dataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];
  if (!base64) throw new Error("INVALID_MEDIA_DATA");
  return { base64, mimetype: mime };
}

async function loadMediaFromUrl(input: string): Promise<{ base64: string; mimetype: string; filename: string }> {
  const url = new URL(input.trim());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("URL_FETCH_FAILED");
  const blob = await res.blob();
  const filename = getFilenameFromUrl(url.pathname);
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const encoded = await fileToBase64(file);
  return { ...encoded, filename };
}

function getFilenameFromUrl(pathname: string): string {
  const raw = pathname.split("/").filter(Boolean).pop();
  if (!raw) return "remote-file";
  const clean = decodeURIComponent(raw).trim();
  return clean || "remote-file";
}
