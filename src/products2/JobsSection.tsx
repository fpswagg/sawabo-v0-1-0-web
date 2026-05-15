import { copy } from "./copy";
import { Tooltip } from "./Tooltip";
import type { Products2JobRow } from "./types";

type Props = {
  open: boolean;
  onToggle: () => void;
  jobs: Products2JobRow[];
  busy: boolean;
  canEdit: boolean;
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onRunNow: (jobId: string) => void;
  onEditSchedule: (jobId: string) => void;
};

function jobLabel(j: Products2JobRow): string {
  return (j.title && j.title.trim()) || j.kind;
}

export function JobsSection({
  open,
  onToggle,
  jobs,
  busy,
  canEdit,
  onPause,
  onResume,
  onCancel,
  onRunNow,
  onEditSchedule,
}: Props) {
  return (
    <details className="products2Disclosure" open={open}>
      <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{copy.queueTitle}</h4>
        <p className="products2Sub muted">{copy.queueSubtitle}</p>
      </summary>
      <div className="products2Disclosure-body">
        {jobs.length === 0 ? <p className="muted">No jobs yet.</p> : null}
        <ul className="products2JobList">
          {jobs.map((j) => {
            const st = j.status;
            const canPause = st === "PENDING" || st === "RUNNING";
            const canResume = st === "PAUSED";
            const canCancel = st !== "CANCELLED" && st !== "DONE";
            const d = busy || !canEdit;
            return (
              <li key={j.id} className="products2JobRow">
                <div>
                  <strong>{jobLabel(j)}</strong>{" "}
                  <span className="smallId muted">
                    {j.kind} · {st}
                  </span>
                  <div className="smallId muted">
                    next: {j.nextRunAt ?? "—"} · products: {j.productIds?.length ?? 0}
                  </div>
                  {j.lastError ? <div className="danger smallId">{j.lastError}</div> : null}
                </div>
                <div className="row wrap products2JobActions">
                  <Tooltip label="run" tip={copy.jobRunNowTip}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={d} onClick={() => onRunNow(j.id)}>
                      {copy.jobRunNow}
                    </button>
                  </Tooltip>
                  {canPause ? (
                    <Tooltip label="pause" tip={copy.jobPauseTip}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={d} onClick={() => onPause(j.id)}>
                        {copy.jobPause}
                      </button>
                    </Tooltip>
                  ) : null}
                  {canResume ? (
                    <Tooltip label="resume" tip={copy.jobResumeTip}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={d} onClick={() => onResume(j.id)}>
                        {copy.jobResume}
                      </button>
                    </Tooltip>
                  ) : null}
                  {canCancel ? (
                    <Tooltip label="cancel" tip={copy.jobCancelTip}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={d} onClick={() => onCancel(j.id)}>
                        {copy.jobCancel}
                      </button>
                    </Tooltip>
                  ) : null}
                  <Tooltip label="edit" tip={copy.jobEditTip}>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={d} onClick={() => onEditSchedule(j.id)}>
                      {copy.jobEditSchedule}
                    </button>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
