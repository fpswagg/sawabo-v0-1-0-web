import { sawaboCopy } from "./copy";

type Props = {
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  busy: boolean;
  groups: Array<{ id: string; name?: string | null; isGroup?: boolean }>;
  selectedGroupIds: string[];
  onChange: (groupIds: string[]) => void;
};

export function DefaultGroupsSection({
  open,
  onToggle,
  canEdit,
  busy,
  groups,
  selectedGroupIds,
  onChange,
}: Props) {
  const groupOptions = groups.filter((g) => g.isGroup);

  function toggleGroup(id: string) {
    if (selectedGroupIds.includes(id)) {
      onChange(selectedGroupIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedGroupIds, id]);
  }

  return (
    <details className="sawaboApiDisclosure" open={open}>
      <summary className="sawaboApiDisclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{sawaboCopy.defaultsTitle}</h4>
        <p className="products2Sub muted">{sawaboCopy.defaultsSubtitle}</p>
      </summary>
      <div className="sawaboApiDisclosure-body">
        {groupOptions.length === 0 ? <p className="muted">No groups available for this session.</p> : null}
        <div className="sawaboApiGroupGrid">
          {groupOptions.map((group) => (
            <label key={group.id} className="checkbox">
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(group.id)}
                onChange={() => toggleGroup(group.id)}
                disabled={!canEdit || busy}
              />
              <span>{group.name || group.id}</span>
              <code className="smallId">{group.id}</code>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
