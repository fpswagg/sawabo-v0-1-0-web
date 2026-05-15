export type Products2JobRow = {
  id: string;
  title?: string | null;
  kind: "POST_NOW" | "POST_LATER" | "REPEAT";
  status: string;
  runAt?: string | null;
  nextRunAt?: string | null;
  repeat?: unknown;
  productIds: string[];
  groupIds: string[];
  attachProductUrl: boolean;
  skipAlreadyPostedHere: boolean;
  postedCount: number;
  staleCount: number;
  updatedAt?: string | null;
  lastRunAt?: string | null;
  lastError?: string | null;
};

export type Products2BoardRow = {
  productId: string;
  live: boolean;
  missingFromApi: boolean;
  posted: boolean;
  postedCount?: number;
  scheduledJobCount?: number;
  nameFr: string;
  categoryFr: string;
  updatedAt?: string | null;
  status?: string;
  apiStatus?: string;
  priceText?: string;
  imageUrl?: string | null;
  changedSinceLastPost?: boolean;
  lastPostedAt?: string | null;
};

export type Products2ActivityRow = {
  id: string;
  productId: string;
  groupId: string;
  postedAt?: string | null;
  lastMessageId?: string | null;
  imageUrl?: string | null;
  nameFr: string;
  changedSincePost: boolean;
};
