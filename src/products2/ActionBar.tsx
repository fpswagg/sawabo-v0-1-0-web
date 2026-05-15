import { copy } from "./copy";
import { Tooltip } from "./Tooltip";

type Props = {
  selectedCount: number;
  groupCount: number;
  skipAlreadyPostedHere: boolean;
  onSkipChange: (v: boolean) => void;
  onPostNow: () => void;
  onSchedule: () => void;
  onRepeat: () => void;
  onSaveOrder: () => void;
  onMoveToTop: () => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  busy: boolean;
  canEdit: boolean;
  postDisabled: boolean;
};

export function ActionBar({
  selectedCount,
  groupCount,
  skipAlreadyPostedHere,
  onSkipChange,
  onPostNow,
  onSchedule,
  onRepeat,
  onSaveOrder,
  onMoveToTop,
  onSelectAllVisible,
  onClearSelection,
  busy,
  canEdit,
  postDisabled,
}: Props) {
  const noGroups = groupCount === 0;
  const disabled = busy || !canEdit || noGroups;
  return (
    <div className="products2ActionBar">
      <div className="products2ActionBar-inner row wrap">
        <p className="products2ActionBar-count muted">
          {selectedCount} product{selectedCount === 1 ? "" : "s"} selected · {groupCount} group
          {groupCount === 1 ? "" : "s"} selected
        </p>
        <label className="checkbox products2SkipRow">
          <input type="checkbox" checked={skipAlreadyPostedHere} onChange={(e) => onSkipChange(e.target.checked)} />
          <Tooltip label="skip" tip={copy.skipPostedTip}>
            <span>Skip already posted here</span>
          </Tooltip>
        </label>
        <div className="row wrap products2ActionBar-actions">
          <Tooltip label="all" tip={copy.selectAllVisibleTip}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onSelectAllVisible}>
              {copy.selectAllVisible}
            </button>
          </Tooltip>
          <Tooltip label="clear" tip={copy.clearSelectionTip}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onClearSelection}>
              {copy.clearSelection}
            </button>
          </Tooltip>
          <Tooltip label="movetop" tip={copy.moveToTopTip}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onMoveToTop}>
              {copy.moveToTop}
            </button>
          </Tooltip>
          <Tooltip label="saveorder" tip={copy.saveOrderTip}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={onSaveOrder}>
              {copy.saveOrder}
            </button>
          </Tooltip>
        </div>
        <div className="row wrap products2ActionBar-primary">
          <Tooltip label="pn" tip={postDisabled ? copy.noSelectionPostTip : copy.postNowTip}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || postDisabled}
              onClick={onPostNow}
            >
              {copy.postNow}
            </button>
          </Tooltip>
          <Tooltip label="sch" tip={postDisabled ? copy.noSelectionPostTip : copy.scheduleTip}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || postDisabled}
              onClick={onSchedule}
            >
              {copy.schedule}
            </button>
          </Tooltip>
          <Tooltip label="rep" tip={postDisabled ? copy.noSelectionPostTip : copy.repeatTip}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || postDisabled}
              onClick={onRepeat}
            >
              {copy.repeat}
            </button>
          </Tooltip>
        </div>
      </div>
      {noGroups ? <p className="smallId danger">{copy.noGroupsTip}</p> : null}
    </div>
  );
}
