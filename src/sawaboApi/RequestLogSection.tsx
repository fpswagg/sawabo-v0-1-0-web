import { sawaboCopy } from "./copy";
import type { SawaboApiRequestRow } from "./types";

type Props = {
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  busy: boolean;
  rows: SawaboApiRequestRow[];
  total: number;
  filterStatus: "" | "PENDING" | "RUNNING" | "DONE" | "FAILED";
  filterAction: string;
  onFilterStatus: (status: "" | "PENDING" | "RUNNING" | "DONE" | "FAILED") => void;
  onFilterAction: (action: string) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onRetry: (reqId: string) => void;
  onDelete: (reqId: string) => void;
};

function statusClass(status: SawaboApiRequestRow["status"]) {
  if (status === "DONE") return "products2Pill products2Pill-ok";
  if (status === "FAILED") return "products2Pill products2Pill-danger";
  if (status === "RUNNING") return "products2Pill products2Pill-warn";
  return "products2Pill products2Pill-muted";
}

export function RequestLogSection({
  open,
  onToggle,
  canEdit,
  busy,
  rows,
  total,
  filterStatus,
  filterAction,
  onFilterStatus,
  onFilterAction,
  onRefresh,
  onLoadMore,
  onRetry,
  onDelete,
}: Props) {
  return (
    <details className="sawaboApiDisclosure" open={open}>
      <summary className="sawaboApiDisclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{sawaboCopy.requestLogTitle}</h4>
        <p className="products2Sub muted">{sawaboCopy.requestLogSubtitle}</p>
      </summary>
      <div className="sawaboApiDisclosure-body">
        <div className="row wrap">
          <div className="fieldRow">
            <label className="label" htmlFor="sawaboFilterStatus">Status</label>
            <select
              id="sawaboFilterStatus"
              className="input tiny"
              value={filterStatus}
              onChange={(e) => onFilterStatus((e.target.value || "") as Props["filterStatus"])}
            >
              <option value="">All</option>
              <option value="PENDING">PENDING</option>
              <option value="RUNNING">RUNNING</option>
              <option value="DONE">DONE</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>
          <div className="fieldRow">
            <label className="label" htmlFor="sawaboFilterAction">Action</label>
            <input
              id="sawaboFilterAction"
              className="input tiny mono"
              value={filterAction}
              onChange={(e) => onFilterAction(e.target.value)}
              placeholder="e.g. post_product"
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={busy}>
            {sawaboCopy.refresh}
          </button>
        </div>

        {rows.length === 0 ? <p className="muted">No request rows for this filter.</p> : null}
        <div className="sawaboApiLogTable">
          {rows.map((row) => (
            <div key={row.id} className="sawaboApiLogRow">
              <div className="sawaboApiLogMain">
                <div className="row wrap">
                  <span className={statusClass(row.status)}>{row.status}</span>
                  <code>{row.action}</code>
                  <span className="smallId muted">{row.createdAt ?? "—"}</span>
                </div>
                <div className="smallId muted">requestId: {row.requestId || "—"}</div>
                {row.error ? <div className="danger smallId">{row.error}</div> : null}
                {row.callbackError ? <div className="danger smallId">callback: {row.callbackError}</div> : null}
              </div>
              <div className="row wrap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRetry(row.id)}
                  disabled={busy || !canEdit || row.status !== "FAILED"}
                  title={sawaboCopy.retryTip}
                >
                  {sawaboCopy.retry}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => onDelete(row.id)}
                  disabled={busy || !canEdit}
                  title={sawaboCopy.deleteTip}
                >
                  {sawaboCopy.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
        {rows.length < total ? (
          <button type="button" className="btn btn-secondary" onClick={onLoadMore} disabled={busy}>
            Load more ({rows.length}/{total})
          </button>
        ) : null}
      </div>
    </details>
  );
}
