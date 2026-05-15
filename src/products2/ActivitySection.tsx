import { copy } from "./copy";
import { Tooltip } from "./Tooltip";
import type { Products2ActivityRow } from "./types";

type Props = {
  open: boolean;
  onToggle: () => void;
  activity: Products2ActivityRow[];
};

export function ActivitySection({ open, onToggle, activity }: Props) {
  return (
    <details className="products2Disclosure" open={open}>
      <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{copy.activityTitle}</h4>
        <p className="products2Sub muted">{copy.activitySubtitle}</p>
      </summary>
      <div className="products2Disclosure-body">
        {activity.length === 0 ? <p className="muted">No recent activity.</p> : null}
        <ul className="products2ActivityList">
          {activity.map((row) => (
            <li key={row.id} className="products2ActivityRow">
              {row.imageUrl ? (
                <img src={row.imageUrl} alt="" className="products2ActivityThumb" loading="lazy" />
              ) : (
                <div className="products2ActivityThumb products2ActivityThumb-placeholder" />
              )}
              <div>
                <div className="products2ActivityTitle">{row.nameFr}</div>
                <div className="smallId muted">
                  {row.groupId} · {row.postedAt ?? "—"}
                  {row.changedSincePost ? " · changed" : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
