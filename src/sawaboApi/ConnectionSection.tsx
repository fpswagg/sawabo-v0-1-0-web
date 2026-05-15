import { sawaboCopy } from "./copy";
import type { SawaboApiWebhookConfig } from "./types";

type Props = {
  open: boolean;
  onToggle: () => void;
  canEdit: boolean;
  busy: boolean;
  webhookUrl: string;
  cfg: SawaboApiWebhookConfig;
  revealedSecret: string;
  showSecret: boolean;
  onToggleSecret: () => void;
  onCopy: (value: string, label: string) => void;
  onChange: (patch: Partial<SawaboApiWebhookConfig>) => void;
  onSave: () => void;
  onRotateSecret: () => void;
};

export function ConnectionSection({
  open,
  onToggle,
  canEdit,
  busy,
  webhookUrl,
  cfg,
  revealedSecret,
  showSecret,
  onToggleSecret,
  onCopy,
  onChange,
  onSave,
  onRotateSecret,
}: Props) {
  const secretDisplay = revealedSecret || (cfg.secretHint ? `••••••••••••••••••••••••${cfg.secretHint}` : "");
  return (
    <details className="sawaboApiDisclosure" open={open}>
      <summary className="sawaboApiDisclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{sawaboCopy.connectionTitle}</h4>
        <p className="products2Sub muted">{sawaboCopy.connectionSubtitle}</p>
      </summary>
      <div className="sawaboApiDisclosure-body">
        <div className="fieldRow">
          <label className="label">Inbound webhook URL</label>
          <div className="row wrap">
            <input className="input mono" readOnly value={webhookUrl} title={sawaboCopy.endpointTip} />
            <button type="button" className="btn btn-secondary" onClick={() => onCopy(webhookUrl, "Webhook URL")}>
              {sawaboCopy.copy}
            </button>
          </div>
        </div>

        <div className="fieldRow">
          <label className="label">Webhook secret</label>
          <div className="row wrap">
            <input
              className="input mono"
              readOnly
              value={showSecret ? secretDisplay : secretDisplay ? "••••••••••••••••••••••••" : ""}
              placeholder="No secret yet. Save config or rotate secret."
              title={sawaboCopy.secretTip}
            />
            <button type="button" className="btn btn-secondary" onClick={onToggleSecret}>
              {showSecret ? sawaboCopy.hide : sawaboCopy.reveal}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCopy(secretDisplay, "Webhook secret")}
              disabled={!secretDisplay}
            >
              {sawaboCopy.copy}
            </button>
            <button type="button" className="btn btn-danger" disabled={!canEdit || busy} onClick={onRotateSecret}>
              {sawaboCopy.rotateSecret}
            </button>
          </div>
        </div>

        <div className="row wrap">
          <div className="fieldRow">
            <label className="label" htmlFor="sawaboEnabled">Enabled</label>
            <label className="checkbox">
              <input
                id="sawaboEnabled"
                type="checkbox"
                checked={cfg.enabled}
                onChange={(e) => onChange({ enabled: e.target.checked })}
                disabled={!canEdit || busy}
              />
              accept inbound webhook requests
            </label>
          </div>

          <div className="fieldRow">
            <label className="label" htmlFor="sawaboMaxRate">Max requests / hour</label>
            <input
              id="sawaboMaxRate"
              className="input tiny mono"
              type="number"
              min={1}
              max={10000}
              value={cfg.maxRequestsPerHour}
              onChange={(e) =>
                onChange({
                  maxRequestsPerHour: Math.min(10000, Math.max(1, Math.floor(Number(e.target.value) || 60))),
                })
              }
              disabled={!canEdit || busy}
              title={sawaboCopy.maxRateTip}
            />
          </div>
        </div>

        <div className="fieldRow">
          <label className="label" htmlFor="sawaboCallbackUrl">Callback URL</label>
          <input
            id="sawaboCallbackUrl"
            className="input mono"
            value={cfg.callbackUrl ?? ""}
            onChange={(e) => onChange({ callbackUrl: e.target.value.trim() || null })}
            disabled={!canEdit || busy}
            placeholder="https://your-api.example.com/sawabo-callback"
            title={sawaboCopy.callbackTip}
          />
        </div>

        <div className="fieldRow">
          <label className="label" htmlFor="sawaboCallbackSecret">Callback signing secret</label>
          <input
            id="sawaboCallbackSecret"
            className="input mono"
            type="password"
            value={cfg.callbackSecret ?? ""}
            onChange={(e) => onChange({ callbackSecret: e.target.value || null })}
            disabled={!canEdit || busy}
            placeholder="Optional"
            title={sawaboCopy.callbackSecretTip}
          />
        </div>

        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={!canEdit || busy}>
            {sawaboCopy.save}
          </button>
        </div>
      </div>
    </details>
  );
}
