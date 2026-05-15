import { sawaboCopy } from "./copy";

type Props = {
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  busy: boolean;
  allowedActions: string[];
  onChange: (actions: string[]) => void;
};

export function AllowedActionsSection({ open, onToggle, canEdit, busy, allowedActions, onChange }: Props) {
  const allowAll = allowedActions.length === 0;

  function toggleAction(action: string) {
    if (allowAll) {
      const next = sawaboCopy.actionList.filter((a) => a !== action);
      onChange(next);
      return;
    }
    if (allowedActions.includes(action)) {
      const next = allowedActions.filter((a) => a !== action);
      onChange(next);
      return;
    }
    onChange([...allowedActions, action]);
  }

  return (
    <details className="sawaboApiDisclosure" open={open}>
      <summary className="sawaboApiDisclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{sawaboCopy.actionsTitle}</h4>
        <p className="products2Sub muted">{sawaboCopy.actionsSubtitle}</p>
      </summary>
      <div className="sawaboApiDisclosure-body">
        <label className="checkbox" title={sawaboCopy.allowAllTip}>
          <input
            type="checkbox"
            checked={allowAll}
            onChange={(e) => onChange(e.target.checked ? [] : [...sawaboCopy.actionList])}
            disabled={!canEdit || busy}
          />
          Allow all actions (no restriction)
        </label>
        <div className="sawaboApiActionGrid">
          {sawaboCopy.actionList.map((action) => (
            <label key={action} className="checkbox">
              <input
                type="checkbox"
                checked={allowAll || allowedActions.includes(action)}
                onChange={() => toggleAction(action)}
                disabled={!canEdit || busy}
              />
              <code>{action}</code>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
