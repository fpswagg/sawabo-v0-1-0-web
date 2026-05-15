/** Centralised Products 2 UI copy and tooltip strings (plain language). */

export const copy = {
  connectionTitle: "Source catalog",
  connectionSubtitle: "Connect to your Sawabo-style product JSON endpoint.",
  targetsTitle: "Where to post",
  targetsSubtitle: "Pick one or more WhatsApp groups as destinations.",
  boardTitle: "Products",
  boardSubtitle: "Search, filter, reorder, and select what to include in jobs.",
  actionsTitle: "Selection actions",
  actionsSubtitle: "Posting uses only the highlighted products — nothing is sent unless you pick items or use Select all visible.",
  queueTitle: "Queue",
  queueSubtitle: "Scheduled and repeating jobs for this session.",
  activityTitle: "Activity",
  activitySubtitle: "Recent posts with thumbnails for quick scanning.",

  postNow: "Post now",
  postNowTip:
    "Sends each selected product, in the current board order, to every selected group right now. Skips cells already posted in a group only when the toggle is on.",
  schedule: "Schedule",
  scheduleTip:
    "Creates a one-off job that runs at the chosen date and time. The product and group list is frozen at creation, even if the board changes later.",
  repeat: "Repeat",
  repeatTip:
    "Creates a recurring job that re-posts the frozen selection on the chosen daily or weekly schedule until you cancel it.",
  saveOrder: "Save order",
  saveOrderTip: "Stores the current visual order on the server so future jobs sort posts the same way.",
  moveToTop: "Move to top",
  moveToTopTip: "Moves the highlighted products to the top of the board order. Does not post anything.",
  refresh: "Refresh",
  refreshTip: "Reloads board rows, jobs, and activity from the server and catalog API.",
  selectAllVisible: "Select all visible",
  selectAllVisibleTip: "Selects every product currently shown after search and filter chips (opt-in bulk select).",
  clearSelection: "Clear selection",
  clearSelectionTip: "Clears the product selection. Post buttons stay disabled until you pick again.",
  skipPostedTip:
    "When on, skips posting to a (product, group) pair if we already recorded a successful post there. Does not change the board.",
  noSelectionPostTip: "Pick at least one product on the board first.",
  noGroupsTip: "Select at least one target group above before posting.",

  pillLive: "Live — product is present in the source catalog.",
  pillOutOfStock: "Out of stock — the source API marks this product unavailable.",
  pillChanged: "Changed — catalog updatedAt differs from the snapshot taken at last post.",
  pillPosted: "Posted — at least one successful send exists for this product.",
  pillMissing: "Missing from API — tracker exists but the product is not in the current catalog response.",
  pillScheduled: "Scheduled — counted from active or pending jobs that include this product.",

  filterOutOfStock: "Out of stock",
  filterChanged: "Changed since post",
  searchPlaceholder: "Search name or category…",

  jobPause: "Pause",
  jobResume: "Resume",
  jobCancel: "Cancel",
  jobRunNow: "Run now",
  jobEditSchedule: "Edit schedule",
  jobPauseTip: "Pauses the job until you resume. Due runs are skipped while paused.",
  jobResumeTip: "Allows the scheduler to pick up this job again on its next run time.",
  jobCancelTip: "Stops the job permanently. It will not run again.",
  jobRunNowTip: "Runs this job immediately using its frozen product and group lists.",
  jobEditTip: "Prompts for a new ISO-like date/time and PATCHes the job (simple editor).",

  advancedToggle: "Advanced (scheduler)",
  advancedTip: "Cycle interval, max jobs per cycle, and delay between sends.",
} as const;
