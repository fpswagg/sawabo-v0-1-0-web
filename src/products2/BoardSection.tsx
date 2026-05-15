import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { copy } from "./copy";
import { Tooltip } from "./Tooltip";
import type { Products2BoardRow } from "./types";

type Props = {
  open: boolean;
  onToggle: () => void;
  viewMode: "grid" | "list";
  onViewMode: (m: "grid" | "list") => void;
  search: string;
  onSearch: (s: string) => void;
  filterOutOfStock: boolean;
  filterChanged: boolean;
  onFilterOutOfStock: (v: boolean) => void;
  onFilterChanged: (v: boolean) => void;
  orderedProductIds: string[];
  boardById: Map<string, Products2BoardRow>;
  visibleRows: Products2BoardRow[];
  selectedIds: string[];
  onToggleSelect: (productId: string, additive: boolean) => void;
  onToggleRange: (fromId: string, toId: string) => void;
  dragAnchor: string | null;
  onSetDragAnchor: (id: string | null) => void;
  onReorder: (nextOrder: string[]) => void;
  attachProductUrl: boolean;
  onAttachChange: (v: boolean) => void;
};

function SortableCard({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes}>
      <button type="button" className="products2DndHandle" {...listeners} aria-label="Drag to reorder">
        ⠿
      </button>
      {children}
    </div>
  );
}

function pillsFor(row: Products2BoardRow): { key: string; label: string; tip: string; tone: string }[] {
  const out: { key: string; label: string; tip: string; tone: string }[] = [];
  if (row.live && !row.missingFromApi) out.push({ key: "live", label: "Live", tip: copy.pillLive, tone: "ok" });
  if (row.apiStatus === "out_of_stock")
    out.push({ key: "oos", label: "Out of stock", tip: copy.pillOutOfStock, tone: "warn" });
  if (row.changedSinceLastPost) out.push({ key: "chg", label: "Changed", tip: copy.pillChanged, tone: "warn" });
  if (row.posted) out.push({ key: "posted", label: `Posted (${row.postedCount ?? 0})`, tip: copy.pillPosted, tone: "muted" });
  if (row.missingFromApi) out.push({ key: "miss", label: "Missing", tip: copy.pillMissing, tone: "danger" });
  const sj = row.scheduledJobCount ?? 0;
  if (sj > 0) out.push({ key: "sch", label: `Queued (${sj})`, tip: copy.pillScheduled, tone: "muted" });
  return out;
}

export function BoardSection({
  open,
  onToggle,
  viewMode,
  onViewMode,
  search,
  onSearch,
  filterOutOfStock,
  filterChanged,
  onFilterOutOfStock,
  onFilterChanged,
  orderedProductIds,
  boardById,
  visibleRows,
  selectedIds,
  onToggleSelect,
  onToggleRange,
  dragAnchor,
  onSetDragAnchor,
  onReorder,
  attachProductUrl,
  onAttachChange,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleSet = new Set(visibleRows.map((r) => r.productId));
  const visibleOrder = orderedProductIds.filter((id) => visibleSet.has(id));
  const sortableIds = visibleOrder.length > 0 ? visibleOrder : orderedProductIds;

  function applySubsetReorder(master: string[], subset: string[], activeId: string, overId: string): string[] {
    const oldI = subset.indexOf(activeId);
    const newI = subset.indexOf(overId);
    if (oldI < 0 || newI < 0) return master;
    const moved = arrayMove(subset, oldI, newI);
    const first = master.findIndex((id) => subset.includes(id));
    if (first < 0) return master;
    const tail = master.slice(first).filter((id) => !subset.includes(id));
    return [...master.slice(0, first), ...moved, ...tail];
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const b = String(over.id);
    if (visibleOrder.length > 0) {
      onReorder(applySubsetReorder(orderedProductIds, visibleOrder, a, b));
      return;
    }
    const oldIndex = orderedProductIds.indexOf(a);
    const newIndex = orderedProductIds.indexOf(b);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(orderedProductIds, oldIndex, newIndex));
  }

  return (
    <details className="products2Disclosure" open={open}>
      <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{copy.boardTitle}</h4>
        <p className="products2Sub muted">{copy.boardSubtitle}</p>
      </summary>
      <div className="products2Disclosure-body">
        <div className="row wrap products2BoardToolbar">
          <input
            className="input products2Search"
            placeholder={copy.searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <label className="checkbox">
            <input type="checkbox" checked={filterOutOfStock} onChange={(e) => onFilterOutOfStock(e.target.checked)} />
            {copy.filterOutOfStock}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={filterChanged} onChange={(e) => onFilterChanged(e.target.checked)} />
            {copy.filterChanged}
          </label>
          <label htmlFor="products2ViewMode2" className="label">
            View
          </label>
          <select
            id="products2ViewMode2"
            className="input"
            value={viewMode}
            onChange={(e) => onViewMode(e.target.value as "grid" | "list")}
          >
            <option value="grid">grid</option>
            <option value="list">list</option>
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={attachProductUrl} onChange={(e) => onAttachChange(e.target.checked)} />
            Attach product URL (for jobs)
          </label>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <div className={viewMode === "grid" ? "products2BoardGrid" : "products2BoardList"}>
              {sortableIds.map((id) => {
                const row = boardById.get(id);
                if (!row) return null;
                const selected = selectedIds.includes(id);
                const pills = pillsFor(row);
                return (
                  <SortableCard
                    key={id}
                    id={id}
                    className={[
                      "products2Card",
                      selected ? "products2Card-selected" : "",
                      row.missingFromApi ? "products2Card-missing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="products2Card-main"
                      onClick={(e) => {
                        const additive = e.ctrlKey || e.metaKey;
                        if (e.shiftKey && dragAnchor) {
                          onToggleRange(dragAnchor, id);
                        } else {
                          onSetDragAnchor(id);
                          onToggleSelect(id, additive);
                        }
                      }}
                    >
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="products2CardImg" loading="lazy" />
                      ) : (
                        <div className="products2CardImg products2CardImg-placeholder" />
                      )}
                      <div className="products2CardBody">
                        <div className="products2CardTitle">{row.nameFr}</div>
                        <div className="smallId muted">{row.categoryFr}</div>
                        <div className="products2CardPrice">{row.priceText ?? ""}</div>
                        <div className="products2Pills">
                          {pills.map((p) => (
                            <Tooltip key={p.key} label={p.key} tip={p.tip}>
                              <span className={`products2Pill products2Pill-${p.tone}`}>{p.label}</span>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    </button>
                  </SortableCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </details>
  );
}
