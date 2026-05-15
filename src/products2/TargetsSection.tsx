import { copy } from "./copy";

type Group = { id: string; name?: string | null };

type Props = {
  open: boolean;
  onToggle: () => void;
  groups: Group[];
  groupIds: string[];
  onToggleGroup: (id: string, checked: boolean) => void;
};

export function TargetsSection({ open, onToggle, groups, groupIds, onToggleGroup }: Props) {
  return (
    <details className="products2Disclosure" open={open}>
      <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{copy.targetsTitle}</h4>
        <p className="products2Sub muted">{copy.targetsSubtitle}</p>
      </summary>
      <div className="products2Disclosure-body">
        {groups.length === 0 ? <p className="muted">No groups in chat cache yet.</p> : null}
        <div className="products2GroupGrid">
          {groups.map((g) => {
            const checked = groupIds.includes(g.id);
            return (
              <label key={`p2-group-${g.id}`} className="checkbox products2GroupCheck">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleGroup(g.id, e.target.checked)}
                />
                <span>{g.name ?? g.id}</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
