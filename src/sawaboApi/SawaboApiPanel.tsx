import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "../api";
import { sawaboCopy } from "./copy";
import { AllowedActionsSection } from "./AllowedActionsSection";
import { ConnectionSection } from "./ConnectionSection";
import { DefaultGroupsSection } from "./DefaultGroupsSection";
import { RequestLogSection } from "./RequestLogSection";
import type { SawaboApiRequestRow, SawaboApiWebhookConfig } from "./types";

type ToastTone = "success" | "info" | "warning" | "danger";

export type SawaboApiClient = {
  getConfig: (sessionId: string) => Promise<SawaboApiWebhookConfig & { secret?: string }>;
  saveConfig: (
    sessionId: string,
    patch: {
      enabled?: boolean;
      callbackUrl?: string | null;
      callbackSecret?: string | null;
      allowedActions?: string[];
      defaultGroupIds?: string[];
      maxRequestsPerHour?: number;
    },
  ) => Promise<SawaboApiWebhookConfig & { secret?: string }>;
  rotateSecret: (sessionId: string) => Promise<SawaboApiWebhookConfig & { secret: string }>;
  getRequests: (
    sessionId: string,
    params?: { limit?: number; offset?: number; status?: string; action?: string },
  ) => Promise<{ rows: SawaboApiRequestRow[]; total: number }>;
  deleteRequest: (sessionId: string, reqId: string) => Promise<{ deleted: true }>;
  retryRequest: (sessionId: string, reqId: string) => Promise<unknown>;
};

type Props = {
  session: { id: string; displayName?: string } | null;
  baseUrl: string;
  groups: Array<{ id: string; name?: string | null; isGroup?: boolean }>;
  canEdit: boolean;
  sawaboAssigned: boolean;
  sawaboApi: SawaboApiClient | null;
  toast: (msg: string, tone?: ToastTone) => void;
};

function readErr(err: unknown) {
  if (err instanceof ApiClientError) return `${err.message}${err.code ? ` (${err.code})` : ""}`;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

const defaultCfg: SawaboApiWebhookConfig = {
  id: null,
  sessionId: "",
  enabled: false,
  secretHint: "",
  callbackUrl: null,
  callbackSecret: null,
  allowedActions: [],
  defaultGroupIds: [],
  maxRequestsPerHour: 60,
};

export function SawaboApiPanel({ session, baseUrl, groups, canEdit, sawaboAssigned, sawaboApi, toast }: Props) {
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<SawaboApiWebhookConfig>(defaultCfg);
  const [revealedSecret, setRevealedSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [rows, setRows] = useState<SawaboApiRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filterStatus, setFilterStatus] = useState<"" | "PENDING" | "RUNNING" | "DONE" | "FAILED">("");
  const [filterAction, setFilterAction] = useState("");

  const [openConnection, setOpenConnection] = useState(true);
  const [openActions, setOpenActions] = useState(true);
  const [openDefaults, setOpenDefaults] = useState(true);
  const [openLog, setOpenLog] = useState(true);

  const webhookUrl = useMemo(() => {
    const base = baseUrl.replace(/\/+$/, "");
    const key = cfg.sessionKey?.trim() || "<sessionKey>";
    return `${base}/api/webhook/sawabo/${encodeURIComponent(key)}`;
  }, [baseUrl, cfg.sessionKey]);

  async function refreshConfig() {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      const res = await sawaboApi.getConfig(session.id);
      setCfg({ ...defaultCfg, ...res, sessionId: session.id });
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function refreshLog(nextOffset = 0, append = false) {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      const res = await sawaboApi.getRequests(session.id, {
        limit: 50,
        offset: nextOffset,
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(filterAction.trim() ? { action: filterAction.trim() } : {}),
      });
      setRows((prev) => (append ? [...prev, ...res.rows] : res.rows));
      setTotal(res.total);
      setOffset(nextOffset);
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session || !sawaboApi || !sawaboAssigned) return;
    void refreshConfig();
    void refreshLog(0, false);
  }, [session?.id, sawaboApi, sawaboAssigned]);

  useEffect(() => {
    if (!session || !sawaboApi || !sawaboAssigned) return;
    const t = setInterval(() => {
      void refreshLog(0, false);
    }, 10_000);
    return () => clearInterval(t);
  }, [session?.id, sawaboApi, sawaboAssigned, filterStatus, filterAction]);

  useEffect(() => {
    if (!session || !sawaboApi || !sawaboAssigned) return;
    void refreshLog(0, false);
  }, [filterStatus, filterAction, session?.id, sawaboApi, sawaboAssigned]);

  async function saveConfig() {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      const saved = await sawaboApi.saveConfig(session.id, {
        enabled: cfg.enabled,
        callbackUrl: cfg.callbackUrl,
        callbackSecret: cfg.callbackSecret,
        allowedActions: cfg.allowedActions,
        defaultGroupIds: cfg.defaultGroupIds,
        maxRequestsPerHour: cfg.maxRequestsPerHour,
      });
      setCfg({ ...cfg, ...saved });
      if (saved.secret) setRevealedSecret(saved.secret);
      toast("Sawabo API config saved", "success");
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function rotateSecret() {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      const saved = await sawaboApi.rotateSecret(session.id);
      setCfg({ ...cfg, ...saved });
      setRevealedSecret(saved.secret);
      setShowSecret(true);
      toast("Webhook secret rotated", "warning");
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function deleteReq(reqId: string) {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      await sawaboApi.deleteRequest(session.id, reqId);
      setRows((prev) => prev.filter((r) => r.id !== reqId));
      setTotal((n) => Math.max(0, n - 1));
      toast("Request deleted", "info");
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  async function retryReq(reqId: string) {
    if (!session || !sawaboApi) return;
    setBusy(true);
    try {
      await sawaboApi.retryRequest(session.id, reqId);
      toast("Request retried", "success");
      await refreshLog(offset, false);
    } catch (err) {
      toast(readErr(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  function copyToClipboard(value: string, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => toast(`${label} copied`, "success"),
      () => toast(`Could not copy ${label}`, "warning"),
    );
  }

  if (!sawaboAssigned) return null;

  return (
    <div className="panel sawaboApiPanel">
      <h3>{sawaboCopy.title}</h3>
      <p className="muted">{sawaboCopy.subtitle}</p>
      {!sawaboApi ? <p className="muted">Only admins can configure Sawabo API webhooks.</p> : null}

      <ConnectionSection
        open={openConnection}
        onToggle={() => setOpenConnection((v) => !v)}
        canEdit={canEdit}
        busy={busy || !Boolean(sawaboApi)}
        webhookUrl={webhookUrl}
        cfg={cfg}
        revealedSecret={revealedSecret}
        showSecret={showSecret}
        onToggleSecret={() => setShowSecret((v) => !v)}
        onCopy={copyToClipboard}
        onChange={(patch) => setCfg((prev) => ({ ...prev, ...patch }))}
        onSave={() => void saveConfig()}
        onRotateSecret={() => void rotateSecret()}
      />

      <AllowedActionsSection
        open={openActions}
        onToggle={() => setOpenActions((v) => !v)}
        canEdit={canEdit}
        busy={busy || !Boolean(sawaboApi)}
        allowedActions={cfg.allowedActions}
        onChange={(actions) => setCfg((prev) => ({ ...prev, allowedActions: actions }))}
      />

      <DefaultGroupsSection
        open={openDefaults}
        onToggle={() => setOpenDefaults((v) => !v)}
        canEdit={canEdit}
        busy={busy || !Boolean(sawaboApi)}
        groups={groups}
        selectedGroupIds={cfg.defaultGroupIds}
        onChange={(groupIds) => setCfg((prev) => ({ ...prev, defaultGroupIds: groupIds }))}
      />

      <RequestLogSection
        open={openLog}
        onToggle={() => setOpenLog((v) => !v)}
        canEdit={canEdit}
        busy={busy || !Boolean(sawaboApi)}
        rows={rows}
        total={total}
        filterStatus={filterStatus}
        filterAction={filterAction}
        onFilterStatus={setFilterStatus}
        onFilterAction={setFilterAction}
        onRefresh={() => void refreshLog(0, false)}
        onLoadMore={() => void refreshLog(offset + 50, true)}
        onRetry={(reqId) => void retryReq(reqId)}
        onDelete={(reqId) => void deleteReq(reqId)}
      />
    </div>
  );
}
