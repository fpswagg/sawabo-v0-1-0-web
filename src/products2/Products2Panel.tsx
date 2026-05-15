import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../api";
import { ActionBar } from "./ActionBar";
import { ActivitySection } from "./ActivitySection";
import { BoardSection } from "./BoardSection";
import { ConnectionSection } from "./ConnectionSection";
import { copy } from "./copy";
import { JobsSection } from "./JobsSection";
import { TargetsSection } from "./TargetsSection";
import type { Products2ActivityRow, Products2BoardRow, Products2JobRow } from "./types";

type ToastTone = "success" | "info" | "warning" | "danger";

export type Products2Api = {
  state: (sessionId: string) => Promise<{
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
    jobs: Products2JobRow[];
    board: Products2BoardRow[];
    activity: Products2ActivityRow[];
  }>;
  getBoardOrder: (sessionId: string) => Promise<{
    orderedProductIds: string[];
    viewMode: "grid" | "list";
    groupIds: string[];
    lastFilter: unknown;
    updatedAt?: string | null;
  }>;
  putBoardOrder: (
    sessionId: string,
    body: {
      orderedProductIds?: string[];
      viewMode?: "grid" | "list";
      groupIds?: string[];
      lastFilter?: Record<string, unknown> | null;
    },
  ) => Promise<unknown>;
  createJob: (body: {
    sessionId: string;
    kind: "POST_NOW" | "POST_LATER" | "REPEAT";
    title?: string;
    productIds: string[];
    groupIds: string[];
    attachProductUrl?: boolean;
    skipAlreadyPostedHere?: boolean;
    runAt?: string;
    repeat?: { frequency: "daily" | "weekly"; interval: number; weekdays?: number[] };
  }) => Promise<{ jobId: string; posted?: number; stale?: number }>;
  patchJob: (
    jobId: string,
    body: {
      sessionId: string;
      status?: "active" | "paused" | "cancelled";
      runAt?: string;
      repeat?: { frequency: "daily" | "weekly"; interval: number; weekdays?: number[] } | null;
    },
  ) => Promise<{ updated: true }>;
  runJobNow: (jobId: string, body: { sessionId: string }) => Promise<{ posted: number; stale: number }>;
};

type Props = {
  session: { id: string } | null;
  groups: Array<{ id: string; name?: string | null; isGroup?: boolean }>;
  products2Assigned: boolean;
  products2Enabled: boolean;
  ready: boolean;
  canEdit: boolean;
  products2Api: Products2Api | null;
  getProducts2Config: () => {
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
  };
  updateProducts2Config: (patch: Record<string, unknown>) => void;
  toast: (msg: string, tone?: ToastTone) => void;
};

function readErr(error: unknown): string | null {
  if (error instanceof ApiClientError) {
    return `${error.message}${error.code ? ` (${error.code})` : ""}`;
  }
  if (error instanceof Error) return error.message;
  return null;
}

function parseWeekdays(raw: string): number[] {
  const values = raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return values.length > 0 ? [...new Set(values)] : [0, 1, 2, 3, 4, 5, 6];
}

export function Products2Panel({
  session,
  groups,
  products2Assigned,
  products2Enabled,
  ready,
  canEdit,
  products2Api,
  getProducts2Config,
  updateProducts2Config,
  toast,
}: Props) {
  const [busy, setBusy] = useState<"refresh" | "publish" | "schedule" | "board" | "job" | null>(null);
  const [status, setStatus] = useState<{
    enabled: boolean;
    configured: boolean;
    running: boolean;
    lastRunAt?: string;
    lastError?: string;
    nextRunAt?: string;
  } | null>(null);
  const [boardOrder, setBoardOrder] = useState({
    groupIds: [] as string[],
    viewMode: "grid" as "grid" | "list",
    orderedProductIds: [] as string[],
    lastFilter: null as Record<string, unknown> | null,
  });
  const [board, setBoard] = useState<Products2BoardRow[]>([]);
  const [jobs, setJobs] = useState<Products2JobRow[]>([]);
  const [activity, setActivity] = useState<Products2ActivityRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterOutOfStock, setFilterOutOfStock] = useState(false);
  const [filterChanged, setFilterChanged] = useState(false);
  const [skipAlreadyPostedHere, setSkipAlreadyPostedHere] = useState(false);
  const [attachJobUrl, setAttachJobUrl] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [runAtLocal, setRunAtLocal] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly">("weekly");
  const [recurringInterval, setRecurringInterval] = useState("1");
  const [recurringWeekdays, setRecurringWeekdays] = useState("1,3,5");

  const [openConnection, setOpenConnection] = useState(false);
  const [openTargets, setOpenTargets] = useState(true);
  const [openBoard, setOpenBoard] = useState(true);
  const [openQueue, setOpenQueue] = useState(true);
  const [openActivity, setOpenActivity] = useState(false);
  const [openAdvanced, setOpenAdvanced] = useState(false);

  const cfg = getProducts2Config();

  const refresh = useCallback(async () => {
    if (!session || !products2Api) return;
    setBusy("refresh");
    try {
      const state = await products2Api.state(session.id);
      setStatus(state.status);
      setBoardOrder({
        groupIds: state.boardOrder.groupIds ?? [],
        viewMode: state.boardOrder.viewMode === "list" ? "list" : "grid",
        orderedProductIds: state.boardOrder.orderedProductIds ?? [],
        lastFilter: (state.boardOrder.lastFilter as Record<string, unknown> | null) ?? null,
      });
      const lf = (state.boardOrder.lastFilter as Record<string, unknown> | null) ?? null;
      if (lf && typeof lf.search === "string") setSearch(lf.search);
      if (lf && typeof lf.filterOutOfStock === "boolean") setFilterOutOfStock(lf.filterOutOfStock);
      if (lf && typeof lf.filterChanged === "boolean") setFilterChanged(lf.filterChanged);
      setBoard(state.board ?? []);
      setJobs((state.jobs ?? []) as Products2JobRow[]);
      setActivity(state.activity ?? []);
      const c = getProducts2Config();
      setAttachJobUrl(Boolean(c.attachProductUrl));
    } catch (err) {
      toast(readErr(err) ?? "Failed to refresh Products 2", "danger");
    } finally {
      setBusy(null);
    }
  }, [session, products2Api, toast, getProducts2Config]);

  useEffect(() => {
    if (!session || !products2Api || !products2Assigned) return;
    void refresh();
  }, [session?.id, products2Assigned, products2Api, refresh]);

  const boardById = useMemo(() => new Map(board.map((r) => [r.productId, r])), [board]);

  const mergedOrder = useMemo(() => {
    const have = new Set(board.map((b) => b.productId));
    const base = boardOrder.orderedProductIds.filter((id) => have.has(id));
    for (const b of board) {
      if (!base.includes(b.productId)) base.push(b.productId);
    }
    return base;
  }, [board, boardOrder.orderedProductIds]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return board.filter((row) => {
      if (q) {
        const blob = `${row.nameFr} ${row.categoryFr}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filterOutOfStock && row.apiStatus !== "out_of_stock") return false;
      if (filterChanged && !row.changedSinceLastPost) return false;
      return true;
    });
  }, [board, search, filterOutOfStock, filterChanged]);

  async function persistBoardOrder(patch: Partial<typeof boardOrder>) {
    if (!session || !products2Api) return;
    setBusy("board");
    try {
      const orderedProductIds = patch.orderedProductIds ?? mergedOrder;
      const viewMode = patch.viewMode ?? boardOrder.viewMode;
      const groupIds = patch.groupIds ?? boardOrder.groupIds;
      const body = {
        orderedProductIds,
        viewMode,
        groupIds,
        lastFilter: {
          search,
          filterOutOfStock,
          filterChanged,
        },
      };
      const res = (await products2Api.putBoardOrder(session.id, body)) as {
        orderedProductIds?: string[];
        viewMode?: "grid" | "list";
        groupIds?: string[];
        lastFilter?: unknown;
      };
      setBoardOrder({
        groupIds: (res.groupIds as string[] | undefined) ?? groupIds,
        viewMode: res.viewMode === "list" ? "list" : "grid",
        orderedProductIds: (res.orderedProductIds as string[] | undefined) ?? orderedProductIds,
        lastFilter: (res.lastFilter as Record<string, unknown> | null | undefined) ?? boardOrder.lastFilter,
      });
    } catch (err) {
      toast(readErr(err) ?? "Failed to save board order", "danger");
    } finally {
      setBusy(null);
    }
  }

  function toggleSelect(productId: string, additive: boolean) {
    setSelectedIds((prev) => {
      if (additive) {
        return prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId];
      }
      return prev.includes(productId) ? [] : [productId];
    });
  }

  function toggleRange(fromId: string, toId: string) {
    const ids = mergedOrder.filter((id) => visibleRows.some((r) => r.productId === id));
    const a = ids.indexOf(fromId);
    const b = ids.indexOf(toId);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const range = ids.slice(lo, hi + 1);
    setSelectedIds((prev) => [...new Set([...prev, ...range])]);
  }

  async function handlePostNow() {
    if (!session || !products2Api) return;
    if (selectedIds.length === 0) {
      toast(copy.noSelectionPostTip, "warning");
      return;
    }
    if (boardOrder.groupIds.length === 0) {
      toast(copy.noGroupsTip, "warning");
      return;
    }
    setBusy("publish");
    try {
      const c = getProducts2Config();
      const r = await products2Api.createJob({
        sessionId: session.id,
        kind: "POST_NOW",
        title: jobTitle.trim() || undefined,
        productIds: selectedIds,
        groupIds: boardOrder.groupIds,
        attachProductUrl: attachJobUrl || c.attachProductUrl,
        skipAlreadyPostedHere,
      });
      toast(`Posted (${r.posted ?? 0}, stale ${r.stale ?? 0})`, "success");
      await refresh();
    } catch (err) {
      toast(readErr(err) ?? "Post failed", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function handleSchedule(kind: "POST_LATER" | "REPEAT") {
    if (!session || !products2Api) return;
    if (selectedIds.length === 0) {
      toast(copy.noSelectionPostTip, "warning");
      return;
    }
    if (boardOrder.groupIds.length === 0) {
      toast(copy.noGroupsTip, "warning");
      return;
    }
    if (!runAtLocal.trim()) {
      toast("Choose date/time (local) for scheduling", "warning");
      return;
    }
    const runAt = new Date(runAtLocal).toISOString();
    setBusy("schedule");
    try {
      const c = getProducts2Config();
      await products2Api.createJob({
        sessionId: session.id,
        kind,
        title: jobTitle.trim() || undefined,
        productIds: selectedIds,
        groupIds: boardOrder.groupIds,
        attachProductUrl: attachJobUrl || c.attachProductUrl,
        skipAlreadyPostedHere,
        runAt,
        repeat:
          kind === "REPEAT"
            ? {
                frequency: recurringFrequency,
                interval: Math.max(1, Math.floor(Number(recurringInterval) || 1)),
                weekdays: recurringFrequency === "weekly" ? parseWeekdays(recurringWeekdays) : undefined,
              }
            : undefined,
      });
      toast("Job created", "success");
      await refresh();
    } catch (err) {
      toast(readErr(err) ?? "Schedule failed", "danger");
    } finally {
      setBusy(null);
    }
  }

  const groupList = groups.filter((g) => g.isGroup !== false);

  if (!products2Assigned) return null;

  return (
    <div className="panel behavioursProducts2Panel" id="behaviours-products2-panel">
      <h3>Products 2</h3>
      {!products2Enabled ? (
        <p className="muted">Turn on the <code>products2</code> assignment above to enable this panel.</p>
      ) : (
        <>
          <ConnectionSection
            open={openConnection}
            onToggle={() => setOpenConnection((o) => !o)}
            apiUrl={cfg.apiUrl}
            authType={cfg.authType}
            authToken={cfg.authToken}
            authUsername={cfg.authUsername}
            authPassword={cfg.authPassword}
            cycleIntervalSeconds={cfg.cycleIntervalSeconds}
            maxJobsPerCycle={cfg.maxJobsPerCycle}
            sendDelayMs={cfg.sendDelayMs}
            currencyCode={cfg.currencyCode}
            includeImageUrls={cfg.includeImageUrls}
            onPatch={updateProducts2Config}
            advancedOpen={openAdvanced}
            onAdvancedToggle={() => setOpenAdvanced((o) => !o)}
          />
          <TargetsSection
            open={openTargets}
            onToggle={() => setOpenTargets((o) => !o)}
            groups={groupList}
            groupIds={boardOrder.groupIds}
            onToggleGroup={(id, checked) => {
              const next = checked ? [...boardOrder.groupIds, id] : boardOrder.groupIds.filter((x) => x !== id);
              setBoardOrder((b) => ({ ...b, groupIds: next }));
              void persistBoardOrder({ groupIds: next });
            }}
          />
          <div className="products2ScheduleFields">
            <h4 className="products2H4">{copy.actionsTitle}</h4>
            <p className="products2Sub muted">{copy.actionsSubtitle}</p>
            <label htmlFor="p2JobTitle" className="label">
              Job title (optional)
            </label>
            <input id="p2JobTitle" className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            <label htmlFor="p2RunAt" className="label">
              Run at (for schedule / repeat)
            </label>
            <input id="p2RunAt" className="input" type="datetime-local" value={runAtLocal} onChange={(e) => setRunAtLocal(e.target.value)} />
            <div className="row wrap">
              <label htmlFor="p2Rf" className="label">
                Repeat frequency
              </label>
              <select
                id="p2Rf"
                className="input"
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value as "daily" | "weekly")}
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
              <label htmlFor="p2Ri" className="label">
                Interval
              </label>
              <input
                id="p2Ri"
                className="input"
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(e.target.value)}
              />
              {recurringFrequency === "weekly" ? (
                <>
                  <label htmlFor="p2Rw" className="label">
                    Weekdays (0–6)
                  </label>
                  <input id="p2Rw" className="input" value={recurringWeekdays} onChange={(e) => setRecurringWeekdays(e.target.value)} />
                </>
              ) : null}
            </div>
          </div>
          <BoardSection
            open={openBoard}
            onToggle={() => setOpenBoard((o) => !o)}
            viewMode={boardOrder.viewMode}
            onViewMode={(viewMode) => {
              setBoardOrder((b) => ({ ...b, viewMode }));
              void persistBoardOrder({ viewMode });
            }}
            search={search}
            onSearch={(s) => setSearch(s)}
            filterOutOfStock={filterOutOfStock}
            filterChanged={filterChanged}
            onFilterOutOfStock={(v) => {
              setFilterOutOfStock(v);
              void persistBoardOrder({});
            }}
            onFilterChanged={(v) => {
              setFilterChanged(v);
              void persistBoardOrder({});
            }}
            orderedProductIds={mergedOrder}
            boardById={boardById}
            visibleRows={visibleRows}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleRange={toggleRange}
            dragAnchor={dragAnchor}
            onSetDragAnchor={setDragAnchor}
            onReorder={(orderedProductIds) => {
              setBoardOrder((b) => ({ ...b, orderedProductIds }));
              void persistBoardOrder({ orderedProductIds });
            }}
            attachProductUrl={attachJobUrl}
            onAttachChange={setAttachJobUrl}
          />
          <ActionBar
            selectedCount={selectedIds.length}
            groupCount={boardOrder.groupIds.length}
            skipAlreadyPostedHere={skipAlreadyPostedHere}
            onSkipChange={setSkipAlreadyPostedHere}
            onPostNow={() => void handlePostNow()}
            onSchedule={() => void handleSchedule("POST_LATER")}
            onRepeat={() => void handleSchedule("REPEAT")}
            onSaveOrder={() => void persistBoardOrder({ orderedProductIds: mergedOrder })}
            onMoveToTop={() => {
              const sel = new Set(selectedIds);
              const next = [...mergedOrder.filter((id) => sel.has(id)), ...mergedOrder.filter((id) => !sel.has(id))];
              setBoardOrder((b) => ({ ...b, orderedProductIds: next }));
              void persistBoardOrder({ orderedProductIds: next });
            }}
            onSelectAllVisible={() => setSelectedIds(visibleRows.map((r) => r.productId))}
            onClearSelection={() => setSelectedIds([])}
            busy={busy !== null}
            canEdit={canEdit}
            postDisabled={selectedIds.length === 0}
          />
          <div className="row wrap products2Toolbar">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!products2Api || !session || busy !== null}
              onClick={() => void refresh()}
            >
              {copy.refresh}
            </button>
            {busy === "refresh" ? <span className="spinner spinner-sm" role="status" /> : null}
          </div>
          {status ? (
            <div className="muted smallId">
              runtime: enabled={String(status.enabled)} configured={String(status.configured)} running={String(status.running)}
              {status.lastError ? <span className="danger"> — {status.lastError}</span> : null}
            </div>
          ) : null}
          <JobsSection
            open={openQueue}
            onToggle={() => setOpenQueue((o) => !o)}
            jobs={jobs}
            busy={busy === "job"}
            canEdit={canEdit}
            onPause={(jobId) => {
              if (!session || !products2Api) return;
              setBusy("job");
              void products2Api
                .patchJob(jobId, { sessionId: session.id, status: "paused" })
                .then(() => refresh())
                .catch((e) => toast(readErr(e) ?? "Pause failed", "danger"))
                .finally(() => setBusy(null));
            }}
            onResume={(jobId) => {
              if (!session || !products2Api) return;
              setBusy("job");
              void products2Api
                .patchJob(jobId, { sessionId: session.id, status: "active" })
                .then(() => refresh())
                .catch((e) => toast(readErr(e) ?? "Resume failed", "danger"))
                .finally(() => setBusy(null));
            }}
            onCancel={(jobId) => {
              if (!session || !products2Api) return;
              setBusy("job");
              void products2Api
                .patchJob(jobId, { sessionId: session.id, status: "cancelled" })
                .then(() => refresh())
                .catch((e) => toast(readErr(e) ?? "Cancel failed", "danger"))
                .finally(() => setBusy(null));
            }}
            onRunNow={(jobId) => {
              if (!session || !products2Api) return;
              setBusy("job");
              void products2Api
                .runJobNow(jobId, { sessionId: session.id })
                .then(() => {
                  toast("Job run complete", "success");
                  return refresh();
                })
                .catch((e) => toast(readErr(e) ?? "Run failed", "danger"))
                .finally(() => setBusy(null));
            }}
            onEditSchedule={(jobId) => {
              const next = window.prompt("New run time (ISO 8601)", new Date().toISOString());
              if (!next || !session || !products2Api) return;
              setBusy("job");
              void products2Api
                .patchJob(jobId, { sessionId: session.id, runAt: next })
                .then(() => refresh())
                .catch((e) => toast(readErr(e) ?? "Update failed", "danger"))
                .finally(() => setBusy(null));
            }}
          />
          <ActivitySection open={openActivity} onToggle={() => setOpenActivity((o) => !o)} activity={activity} />
        </>
      )}
    </div>
  );
}
