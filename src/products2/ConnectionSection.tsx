import { copy } from "./copy";
import { Tooltip } from "./Tooltip";

type Props = {
  open: boolean;
  onToggle: () => void;
  apiUrl: string;
  authType: "none" | "bearer" | "basic";
  authToken: string;
  authUsername: string;
  authPassword: string;
  cycleIntervalSeconds: string;
  maxJobsPerCycle: string;
  sendDelayMs: string;
  currencyCode: string;
  includeImageUrls: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  advancedOpen: boolean;
  onAdvancedToggle: () => void;
};

export function ConnectionSection({
  open,
  onToggle,
  apiUrl,
  authType,
  authToken,
  authUsername,
  authPassword,
  cycleIntervalSeconds,
  maxJobsPerCycle,
  sendDelayMs,
  currencyCode,
  includeImageUrls,
  onPatch,
  advancedOpen,
  onAdvancedToggle,
}: Props) {
  return (
    <details className="products2Disclosure" open={open}>
      <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onToggle(); }}>
        <h4 className="products2H4">{copy.connectionTitle}</h4>
        <p className="products2Sub muted">{copy.connectionSubtitle}</p>
      </summary>
      <div className="products2Disclosure-body">
        <label htmlFor="products2ApiUrl" className="label">
          API URL
        </label>
        <input
          id="products2ApiUrl"
          className="input"
          value={apiUrl}
          onChange={(e) => onPatch({ apiUrl: e.target.value })}
        />
        <label htmlFor="products2AuthType" className="label">
          Auth
        </label>
        <select
          id="products2AuthType"
          className="input"
          value={authType}
          onChange={(e) => onPatch({ authType: e.target.value })}
        >
          <option value="none">none</option>
          <option value="bearer">bearer</option>
          <option value="basic">basic</option>
        </select>
        {authType === "bearer" ? (
          <label htmlFor="products2AuthToken" className="label">
            Bearer token
            <input
              id="products2AuthToken"
              className="input"
              value={authToken}
              onChange={(e) => onPatch({ authToken: e.target.value })}
            />
          </label>
        ) : null}
        {authType === "basic" ? (
          <>
            <label htmlFor="products2AuthUser" className="label">
              Username
              <input
                id="products2AuthUser"
                className="input"
                value={authUsername}
                onChange={(e) => onPatch({ authUsername: e.target.value })}
              />
            </label>
            <label htmlFor="products2AuthPass" className="label">
              Password
              <input
                id="products2AuthPass"
                className="input"
                type="password"
                value={authPassword}
                onChange={(e) => onPatch({ authPassword: e.target.value })}
              />
            </label>
          </>
        ) : null}
        <label htmlFor="products2Currency" className="label">
          Currency code
        </label>
        <input
          id="products2Currency"
          className="input"
          value={currencyCode}
          onChange={(e) => onPatch({ currencyCode: e.target.value })}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeImageUrls}
            onChange={(e) => onPatch({ includeImageUrls: e.target.checked })}
          />
          Include image URLs in caption
        </label>
        <details className="products2Disclosure products2Disclosure-nested" open={advancedOpen}>
          <summary className="products2Disclosure-summary" onClick={(e) => { e.preventDefault(); onAdvancedToggle(); }}>
            <Tooltip label="adv" tip={copy.advancedTip}>
              <span className="linkish">{copy.advancedToggle}</span>
            </Tooltip>
          </summary>
          <div className="products2Disclosure-body">
            <label htmlFor="products2CycleSec" className="label">
              Cycle interval (seconds)
            </label>
            <input
              id="products2CycleSec"
              className="input"
              value={cycleIntervalSeconds}
              onChange={(e) => onPatch({ cycleIntervalSeconds: Number(e.target.value) || 300 })}
            />
            <label htmlFor="products2MaxJobs" className="label">
              Max jobs per cycle
            </label>
            <input
              id="products2MaxJobs"
              className="input"
              value={maxJobsPerCycle}
              onChange={(e) => onPatch({ maxJobsPerCycle: Number(e.target.value) || 25 })}
            />
            <label htmlFor="products2SendDelay" className="label">
              Send delay (ms)
            </label>
            <input
              id="products2SendDelay"
              className="input"
              value={sendDelayMs}
              onChange={(e) => onPatch({ sendDelayMs: Number(e.target.value) || 0 })}
            />
          </div>
        </details>
      </div>
    </details>
  );
}
