export type SawaboApiWebhookConfig = {
  id: string | null;
  sessionId: string;
  sessionKey?: string;
  enabled: boolean;
  secretHint: string;
  callbackUrl: string | null;
  callbackSecret: string | null;
  allowedActions: string[];
  defaultGroupIds: string[];
  maxRequestsPerHour: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SawaboApiRequestRow = {
  id: string;
  requestId: string | null;
  action: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  result: unknown;
  error: string | null;
  callbackSent: boolean;
  callbackError: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
