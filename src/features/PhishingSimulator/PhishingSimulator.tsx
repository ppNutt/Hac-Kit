import { useEffect, useMemo, useRef, useState } from "react";
import FeatureLayout from "../../components/ui/FeatureLayout";
import StateBlock from "../../components/ui/StateBlock";
import "./PhishingSimulator.css";

type TemplateKind = "credential-alert" | "invoice-followup" | "it-reset";
type DeliveryMode = "local-simulation" | "smtp-training";

interface CampaignTemplate {
  id: TemplateKind;
  name: string;
  subject: string;
  body: string;
  cta: string;
}

interface Campaign {
  id: string;
  name: string;
  recipient: string;
  templateId: TemplateKind;
  sentAt: number;
  status: "sent" | "opened" | "clicked" | "reported";
}

interface CampaignEvent {
  id: string;
  campaignId: string;
  type: "sent" | "opened" | "clicked" | "landing-viewed" | "reported";
  timestamp: number;
  note: string;
}

const AUTHORIZED_DOMAINS = ["example.com", "training.local", "hac-kit.local"];
const STORAGE_KEY = "hac-kit-phishing-sim-data-v1";

const baseTemplates: CampaignTemplate[] = [
  {
    id: "credential-alert",
    name: "Credential Alert",
    subject: "Security alert: unusual sign-in activity",
    body:
      "Hello {{recipient}},\n\nWe detected unusual sign-in behavior and need you to confirm your account activity.\nPlease review security details using the button below.\n\nSecurity Team",
    cta: "Review activity",
  },
  {
    id: "invoice-followup",
    name: "Invoice Follow-up",
    subject: "Outstanding invoice requires review",
    body:
      "Hello {{recipient}},\n\nFinance is waiting for your review of an invoice attachment flagged by policy checks.\nOpen the secure review page to continue.\n\nFinance Operations",
    cta: "Open invoice review",
  },
  {
    id: "it-reset",
    name: "IT Password Reset",
    subject: "Action required: password reset confirmation",
    body:
      "Hello {{recipient}},\n\nIT requested a password reset verification for your account.\nVisit the secure portal to confirm this was expected.\n\nIT Service Desk",
    cta: "Verify reset request",
  },
];

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isAuthorizedRecipient(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return AUTHORIZED_DOMAINS.includes(domain);
}

function formatDateTime(unixMs: number): string {
  const date = new Date(unixMs);
  return date.toLocaleString();
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PhishingSimulator() {
  const [campaignName, setCampaignName] = useState("Awareness Campaign");
  const [recipient, setRecipient] = useState("training.user@example.com");
  const [templateId, setTemplateId] = useState<TemplateKind>(baseTemplates[0].id);
  const [subject, setSubject] = useState(baseTemplates[0].subject);
  const [body, setBody] = useState(baseTemplates[0].body);
  const [cta, setCta] = useState(baseTemplates[0].cta);
  const [authorizedUseConfirmed, setAuthorizedUseConfirmed] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("local-simulation");
  const [smtpHost, setSmtpHost] = useState("smtp.training.local");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSender, setSmtpSender] = useState("security-team@example.com");
  const [smtpTls, setSmtpTls] = useState(true);
  const [showLandingPreview, setShowLandingPreview] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready for an authorized awareness simulation.");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { campaigns?: Campaign[]; events?: CampaignEvent[] };
      if (Array.isArray(parsed.campaigns)) {
        setCampaigns(parsed.campaigns);
        if (parsed.campaigns[0]) {
          setSelectedCampaignId(parsed.campaigns[0].id);
        }
      }
      if (Array.isArray(parsed.events)) {
        setEvents(parsed.events);
      }
    } catch {
      /* ignore corrupt local data */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        campaigns,
        events,
      }),
    );
  }, [campaigns, events]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const selectedCampaignTemplate = useMemo(() => {
    if (!selectedCampaign) {
      return null;
    }
    return (
      baseTemplates.find((template) => template.id === selectedCampaign.templateId) ?? null
    );
  }, [selectedCampaign]);

  const selectedEvents = useMemo(() => {
    if (!selectedCampaignId) {
      return [];
    }
    return events
      .filter((event) => event.campaignId === selectedCampaignId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events, selectedCampaignId]);

  const kpis = useMemo(() => {
    const sent = campaigns.length;
    const opened = new Set(events.filter((event) => event.type === "opened").map((event) => event.campaignId)).size;
    const reported = new Set(events.filter((event) => event.type === "reported").map((event) => event.campaignId)).size;
    return { sent, opened, reported };
  }, [campaigns, events]);

  const renderedBody = useMemo(
    () => body.split("{{recipient}}").join(recipient || "recipient"),
    [body, recipient],
  );

  const handleTemplatePreset = (nextTemplateId: TemplateKind) => {
    setTemplateId(nextTemplateId);
    const template = baseTemplates.find((item) => item.id === nextTemplateId);
    if (!template) {
      return;
    }
    setSubject(template.subject);
    setBody(template.body);
    setCta(template.cta);
  };

  const scheduleEvent = (
    campaignId: string,
    type: CampaignEvent["type"],
    note: string,
    delayMs: number,
    nextStatus?: Campaign["status"],
  ) => {
    const timeoutId = window.setTimeout(() => {
      const event: CampaignEvent = {
        id: uid("evt"),
        campaignId,
        type,
        timestamp: Date.now(),
        note,
      };
      setEvents((prev) => [...prev, event]);
      if (nextStatus) {
        setCampaigns((prev) =>
          prev.map((item) => (item.id === campaignId ? { ...item, status: nextStatus } : item)),
        );
      }
    }, delayMs);
    timeoutsRef.current.push(timeoutId);
  };

  const handleSendSimulation = () => {
    setError(null);

    const trimmedName = campaignName.trim();
    const trimmedRecipient = recipient.trim().toLowerCase();
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    const trimmedCta = cta.trim();

    if (!trimmedName) {
      setError("Campaign name is required.");
      return;
    }
    if (!isValidEmail(trimmedRecipient)) {
      setError("Enter a valid recipient email.");
      return;
    }
    if (!isAuthorizedRecipient(trimmedRecipient)) {
      setError(
        `Recipient must use an authorized domain: ${AUTHORIZED_DOMAINS.join(", ")}.`,
      );
      return;
    }
    if (!trimmedSubject || !trimmedBody || !trimmedCta) {
      setError("Subject, body, and CTA label are required.");
      return;
    }
    if (!authorizedUseConfirmed) {
      setError("Confirm authorized simulation use before sending.");
      return;
    }

    if (deliveryMode === "smtp-training") {
      if (!smtpHost.trim()) {
        setError("SMTP host is required in SMTP training mode.");
        return;
      }
      if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        setError("SMTP port must be an integer between 1 and 65535.");
        return;
      }
      if (!isValidEmail(smtpSender.trim())) {
        setError("SMTP sender address must be a valid email.");
        return;
      }
    }

    setSending(true);

    const campaignId = uid("campaign");
    const now = Date.now();
    const campaign: Campaign = {
      id: campaignId,
      name: trimmedName,
      recipient: trimmedRecipient,
      templateId,
      sentAt: now,
      status: "sent",
    };

    setCampaigns((prev) => [campaign, ...prev]);
    setSelectedCampaignId(campaignId);
    setEvents((prev) => [
      ...prev,
      {
        id: uid("evt"),
        campaignId,
        type: "sent",
        timestamp: now,
        note:
          deliveryMode === "smtp-training"
            ? `Simulation delivered using SMTP training mode (${smtpHost}:${smtpPort}, TLS ${smtpTls ? "on" : "off"}).`
            : "Simulation email sent via controlled local training flow.",
      },
    ]);

    scheduleEvent(campaignId, "opened", "Recipient opened the simulation email.", 2000, "opened");
    scheduleEvent(
      campaignId,
      "clicked",
      "Recipient clicked the training CTA link.",
      4200,
      "clicked",
    );
    scheduleEvent(
      campaignId,
      "landing-viewed",
      "Recipient viewed the controlled training landing page.",
      6200,
    );
    scheduleEvent(
      campaignId,
      "reported",
      "Recipient reported the email as suspicious (positive behavior).",
      8200,
      "reported",
    );

    setStatusMessage(
      deliveryMode === "smtp-training"
        ? "Simulation sent in SMTP training mode. Tracking events in timeline. No credentials are collected or stored."
        : "Simulation sent. Tracking events in the timeline. No real credentials are collected or stored.",
    );

    const doneTimer = window.setTimeout(() => {
      setSending(false);
    }, 1000);
    timeoutsRef.current.push(doneTimer);
  };

  return (
    <FeatureLayout
      title="Phishing Simulator"
      description="Create authorized phishing-awareness campaigns with controlled landing flow and event tracking."
    >
      <div className="phish-layout">
        <section className="panel phish-panel-full">
          <div className="phish-warning">
            This module is for authorized cybersecurity awareness training only. It does not collect
            or permanently store real credentials.
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">1) Campaign setup</h2>
          <div className="phish-stack">
            <div className="phish-field">
              <label htmlFor="campaign-name">Campaign name</label>
              <input
                id="campaign-name"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                disabled={sending}
              />
            </div>

            <div className="phish-field">
              <label htmlFor="recipient-email">Authorized test recipient</label>
              <input
                id="recipient-email"
                type="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                disabled={sending}
              />
              <p className="phish-muted">
                Allowed domains: {AUTHORIZED_DOMAINS.join(", ")}
              </p>
            </div>

            <label className="phish-consent">
              <input
                type="checkbox"
                checked={authorizedUseConfirmed}
                onChange={(event) => setAuthorizedUseConfirmed(event.target.checked)}
                disabled={sending}
              />
              <span>
                I confirm this is an authorized awareness simulation and not credential theft.
              </span>
            </label>

            <div className="phish-field">
              <label htmlFor="delivery-mode">Delivery mode</label>
              <select
                id="delivery-mode"
                value={deliveryMode}
                onChange={(event) => setDeliveryMode(event.target.value as DeliveryMode)}
                disabled={sending}
              >
                <option value="local-simulation">Local simulation mode</option>
                <option value="smtp-training">SMTP training mode</option>
              </select>
              <p className="phish-muted">
                Local simulation is safest for demos. SMTP mode is for authorized training mail flow.
              </p>
            </div>

            {deliveryMode === "smtp-training" && (
              <div className="phish-smtp-box">
                <div className="phish-field">
                  <label htmlFor="smtp-host">SMTP host</label>
                  <input
                    id="smtp-host"
                    value={smtpHost}
                    onChange={(event) => setSmtpHost(event.target.value)}
                    disabled={sending}
                  />
                </div>

                <div className="phish-field">
                  <label htmlFor="smtp-port">SMTP port</label>
                  <input
                    id="smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={smtpPort}
                    onChange={(event) => setSmtpPort(Number(event.target.value) || 0)}
                    disabled={sending}
                  />
                </div>

                <div className="phish-field">
                  <label htmlFor="smtp-sender">Sender address</label>
                  <input
                    id="smtp-sender"
                    type="email"
                    value={smtpSender}
                    onChange={(event) => setSmtpSender(event.target.value)}
                    disabled={sending}
                  />
                </div>

                <label className="phish-consent">
                  <input
                    type="checkbox"
                    checked={smtpTls}
                    onChange={(event) => setSmtpTls(event.target.checked)}
                    disabled={sending}
                  />
                  <span>Use TLS for SMTP transport</span>
                </label>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">2) Template and preview</h2>
          <div className="phish-stack">
            <div className="phish-field">
              <label htmlFor="template-preset">Template preset</label>
              <select
                id="template-preset"
                value={templateId}
                onChange={(event) => handleTemplatePreset(event.target.value as TemplateKind)}
                disabled={sending}
              >
                {baseTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="phish-field">
              <label htmlFor="template-subject">Subject</label>
              <input
                id="template-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                disabled={sending}
              />
            </div>

            <div className="phish-field">
              <label htmlFor="template-body">Body</label>
              <textarea
                id="template-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={sending}
              />
              <p className="phish-muted">Use {"{{recipient}}"} placeholder for personalization.</p>
            </div>

            <div className="phish-field">
              <label htmlFor="template-cta">CTA label</label>
              <input
                id="template-cta"
                value={cta}
                onChange={(event) => setCta(event.target.value)}
                disabled={sending}
              />
            </div>

            <div className="phish-preview">
              <p className="phish-preview-subject">Subject: {subject}</p>
              <p className="phish-preview-body">{renderedBody}</p>
              <span className="phish-cta">{cta}</span>
            </div>
          </div>
        </section>

        <section className="panel phish-panel-full">
          <h2 className="panel-title">3) Controlled training landing page</h2>
          <div className="phish-stack">
            <div className="phish-actions">
              <button
                type="button"
                className="link-button"
                onClick={() => setShowLandingPreview((prev) => !prev)}
              >
                {showLandingPreview ? "Hide landing preview" : "Show landing preview"}
              </button>
            </div>

            {showLandingPreview && (
              <div className="phish-landing">
                <p>
                  Training page message: "This was a phishing awareness simulation. Never enter
                  passwords from unexpected emails. Verify sender identity and report suspicious
                  requests."
                </p>
                <p className="phish-muted">
                  No credential fields are persisted. Event tracking records only simulation actions.
                </p>
              </div>
            )}

            <div className="phish-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleSendSimulation}
                disabled={sending}
              >
                {sending ? "Sending simulation..." : "Send simulation"}
              </button>
            </div>

            {error && <p className="error-text">{error}</p>}
            <p className="phish-muted">{statusMessage}</p>
          </div>
        </section>

        <section className="panel phish-panel-full">
          <h2 className="panel-title">4) Simulation results</h2>
          {campaigns.length === 0 ? (
            <StateBlock
              title="No campaigns yet"
              description="Send an authorized simulation to populate campaign metrics and event timeline."
            />
          ) : (
            <div className="phish-stack">
              <div className="phish-kpi-grid">
                <div className="phish-kpi">
                  <h3>{kpis.sent}</h3>
                  <p>Campaigns sent</p>
                </div>
                <div className="phish-kpi">
                  <h3>{kpis.opened}</h3>
                  <p>Opened</p>
                </div>
                <div className="phish-kpi">
                  <h3>{kpis.reported}</h3>
                  <p>Reported suspicious</p>
                </div>
              </div>

              <div className="phish-field">
                <label htmlFor="campaign-history">Campaign history</label>
                <select
                  id="campaign-history"
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name} · {campaign.recipient} · {campaign.status}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCampaign && (
                <p className="phish-muted">
                  Sent: {formatDateTime(selectedCampaign.sentAt)} | Template: {selectedCampaignTemplate?.name ?? "Custom"}
                </p>
              )}

              <div className="phish-events-table-wrap">
                <table className="phish-events-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.timestamp)}</td>
                        <td>{event.type}</td>
                        <td>{event.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </FeatureLayout>
  );
}
