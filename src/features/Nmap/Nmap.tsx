import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import FeatureLayout from "../../components/ui/FeatureLayout";
import StateBlock from "../../components/ui/StateBlock";
import "./Nmap.css";

type ScanPreset = "quick" | "service" | "intense";

interface NmapAvailability {
  available: boolean;
  version: string;
  message: string;
}

interface NmapScanStatus {
  running: boolean;
  phase: "idle" | "running" | "completed" | "cancelled" | "error";
  target: string;
  preset: string;
  progressPercent: number;
  message: string;
}

interface NmapPortResult {
  port: number;
  protocol: string;
  state: string;
  service: string;
}

interface NmapHostResult {
  host: string;
  status: string;
  ports: NmapPortResult[];
}

interface NmapScanResult {
  target: string;
  preset: string;
  finishedAtUnix: number;
  hosts: NmapHostResult[];
  openPortCount: number;
  summary: string;
}

const STATUS_EVENT = "nmap://status";

const presetInfo: Record<ScanPreset, { label: string; detail: string }> = {
  quick: {
    label: "Quick scan",
    detail: "Fast top-port scan. Best for first visibility checks.",
  },
  service: {
    label: "Service scan",
    detail: "Includes service version detection on common ports.",
  },
  intense: {
    label: "Intense scan",
    detail: "More aggressive detection. Can take longer and may require extra privileges.",
  },
};

function phaseLabel(phase: NmapScanStatus["phase"]): string {
  switch (phase) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function getBeginnerInterpretation(result: NmapScanResult | null): string[] {
  if (!result || result.hosts.length === 0) {
    return [
      "No hosts were parsed from the scan output. This can mean the target is offline, firewalled, or filtering probes.",
      "Confirm you are scanning an authorized and reachable target.",
    ];
  }

  if (result.openPortCount === 0) {
    return [
      "No open ports were detected in this scan preset.",
      "This is usually good from a security perspective, but different presets can still reveal more details.",
    ];
  }

  return [
    `Open ports (${result.openPortCount}) mean services are reachable over the network.`,
    "Each open service should be reviewed for patch level, authentication, and exposure necessity.",
    "Keep only required ports open and restrict admin services by firewall rules or network segmentation.",
  ];
}

export default function Nmap() {
  const [target, setTarget] = useState("");
  const [preset, setPreset] = useState<ScanPreset>("quick");
  const [availability, setAvailability] = useState<NmapAvailability | null>(null);
  const [status, setStatus] = useState<NmapScanStatus>({
    running: false,
    phase: "idle",
    target: "",
    preset: "quick",
    progressPercent: 0,
    message: "Ready to scan an authorized target.",
  });
  const [result, setResult] = useState<NmapScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<NmapScanStatus>(STATUS_EVENT, (event) => {
      setStatus(event.payload);
      if (event.payload.phase === "completed") {
        invoke<NmapScanResult | null>("get_last_nmap_result")
          .then((nextResult) => setResult(nextResult))
          .catch(() => {
            /* best-effort refresh */
          });
      }
    });

    invoke<NmapAvailability>("check_nmap_availability")
      .then(setAvailability)
      .catch((err) => setError(String(err)));

    invoke<NmapScanStatus>("get_nmap_status")
      .then(setStatus)
      .catch(() => {
        /* no-op */
      });

    invoke<NmapScanResult | null>("get_last_nmap_result")
      .then((initialResult) => setResult(initialResult))
      .catch(() => {
        /* no-op */
      });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const insights = useMemo(() => getBeginnerInterpretation(result), [result]);

  const handleStart = async () => {
    setError(null);
    try {
      await invoke("start_nmap_scan", {
        request: {
          target,
          preset,
        },
      });
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCancel = async () => {
    setError(null);
    try {
      await invoke("cancel_nmap_scan");
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <FeatureLayout
      title="Nmap Scanner"
      description="Run authorized host and port scans with simplified presets and plain-English explanations."
    >
      {!availability?.available ? (
        <section className="panel">
          <StateBlock
            title="Nmap is not installed"
            description={
              availability?.message ??
              "Install Nmap and make sure the nmap command is available in your system PATH."
            }
            action={
              <p className="nmap-hint">
                On Windows, install from the official Nmap website, then restart Hac-Kit.
              </p>
            }
          />
        </section>
      ) : (
        <div className="nmap-layout">
          <section className="panel">
            <h2 className="panel-title">Scan configuration</h2>
            <form
              className="nmap-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleStart();
              }}
            >
              <div className="nmap-field">
                <label htmlFor="nmap-target">Authorized target (IP or domain)</label>
                <input
                  id="nmap-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="example.com or 192.168.1.10"
                  disabled={status.running}
                />
                <p className="nmap-hint">Single host only. CIDR ranges are disabled in beginner mode.</p>
              </div>

              <div className="nmap-field">
                <label htmlFor="nmap-preset">Scan preset</label>
                <select
                  id="nmap-preset"
                  value={preset}
                  onChange={(event) => setPreset(event.target.value as ScanPreset)}
                  disabled={status.running}
                >
                  {Object.entries(presetInfo).map(([value, info]) => (
                    <option key={value} value={value}>
                      {info.label}
                    </option>
                  ))}
                </select>
                <p className="nmap-hint">{presetInfo[preset].detail}</p>
              </div>

              <div className="nmap-actions">
                {!status.running ? (
                  <button type="submit" className="primary-button">
                    Start scan
                  </button>
                ) : (
                  <button type="button" className="danger-button" onClick={handleCancel}>
                    Cancel scan
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <h2 className="panel-title">Status</h2>
            <div className="nmap-status-stack">
              <div className={`status-pill${status.running ? " status-pill-running" : ""}`}>
                {phaseLabel(status.phase)}
              </div>
              <div className="nmap-progress-track" aria-hidden="true">
                <div className="nmap-progress-fill" style={{ width: `${status.progressPercent}%` }} />
              </div>
              <p className="nmap-status-copy">{status.message}</p>
              <p className="nmap-hint">{availability.version}</p>
              {status.target && (
                <p className="nmap-hint">
                  Current target: {status.target} ({status.preset} preset)
                </p>
              )}
              {error && <p className="error-text">{error}</p>}
            </div>
          </section>

          <section className="panel nmap-panel-full">
            <h2 className="panel-title">Beginner interpretation</h2>
            <ul className="nmap-explainer-list">
              {insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="panel nmap-panel-full">
            <h2 className="panel-title">Scan results</h2>
            {!result ? (
              <StateBlock
                title="No scan results yet"
                description="Run a scan to view hosts, ports, services, and summary output here."
              />
            ) : result.hosts.length === 0 ? (
              <StateBlock title="Scan completed" description={result.summary} />
            ) : (
              <div className="nmap-host-stack">
                {result.hosts.map((host) => (
                  <article className="nmap-host-card" key={host.host}>
                    <h3 className="nmap-host-title">
                      Host: {host.host} ({host.status})
                    </h3>
                    {host.ports.length === 0 ? (
                      <p className="nmap-hint">No parsed ports for this host.</p>
                    ) : (
                      <div className="nmap-table-wrap">
                        <table className="nmap-table">
                          <thead>
                            <tr>
                              <th>Port</th>
                              <th>Protocol</th>
                              <th>State</th>
                              <th>Service</th>
                            </tr>
                          </thead>
                          <tbody>
                            {host.ports.map((port) => (
                              <tr key={`${host.host}-${port.port}-${port.protocol}`}>
                                <td>{port.port}</td>
                                <td>{port.protocol}</td>
                                <td>{port.state}</td>
                                <td>{port.service || "unknown"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </FeatureLayout>
  );
}
