import { useEffect, useState } from "react";

type Citation = { source: string; quote: string; verified: boolean };
type Decision = { text: string; owner: string; deadline: string; citations: Citation[] };
type Risk = { title: string; detail: string; severity: string; citations: Citation[] };
type Action = {
  id: string;
  title: string;
  to: string;
  subject: string;
  body: string;
  why: string;
  citations: Citation[];
};
type Answer = {
  brief: string;
  missing: string;
  decisions: Decision[];
  risks: Risk[];
  actions: Action[];
  read: { id: string; title: string; kind: string }[];
};
type Source = { id: string; title: string; kind: string; text: string };
type LogEntry = {
  id: string;
  decision: string;
  title: string;
  by: string;
  subject?: string;
};
type Workspace = {
  company: string;
  person: string;
  role: string;
  sources: Source[];
  notConnected: { id: string; title: string; reason: string }[];
  log: LogEntry[];
};

const PROMPTS = [
  "What did we decide, what is at risk, and what should go out today?",
  "What is in the Helios contract?",
  "What did we already approve?",
];

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function Quotes({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <>
      {citations.map((citation) => (
        <p className="quote" key={`${citation.source}-${citation.quote}`}>
          <em>{citation.quote}</em>
          {" · "}
          {citation.source}
          {citation.verified ? "" : <span className="unverified"> · not found in the source</span>}
        </p>
      ))}
    </>
  );
}

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState<Record<string, string>>({});

  async function loadWorkspace() {
    const next = await readJson<Workspace>(await fetch("/api/workspace"));
    setWorkspace(next);
  }

  useEffect(() => {
    loadWorkspace().catch((reason: Error) => setError(reason.message));
  }, []);

  async function onAsk(nextQuestion = question) {
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const result = await readJson<Answer>(
        await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: nextQuestion }),
        }),
      );
      setAnswer(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "John could not answer.");
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(id: string, decision: "approved" | "held") {
    setBusy(true);
    setError("");
    try {
      await readJson(
        await fetch("/api/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, decision }),
        }),
      );
      setDecided((current) => ({ ...current, [id]: decision }));
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    await fetch("/api/reset", { method: "POST" });
    setDecided({});
    setAnswer(null);
    await loadWorkspace();
  }

  const open = workspace?.sources.find((source) => source.id === openId);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">John</span>
          <span className="for">for</span>
          <span className="company">{workspace?.company || "Northwind Facilities"}</span>
        </div>
        <div className="pill">Private workspace</div>
      </header>

      <div className="layout">
        <aside className="side">
          <p className="eyebrow">In this workspace</p>
          {workspace?.sources.map((source) => (
            <button
              key={source.id}
              className={openId === source.id ? "source open" : "source"}
              onClick={() => setOpenId(openId === source.id ? null : source.id)}
              type="button"
            >
              <span className="kind">{source.kind}</span>
              <strong>{source.title}</strong>
            </button>
          ))}

          <p className="eyebrow">Not connected</p>
          {workspace?.notConnected.map((item) => (
            <div className="locked" key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.reason}</span>
            </div>
          ))}

          <p className="eyebrow">Action log</p>
          {workspace?.log.length ? (
            workspace.log.map((entry) => (
              <div className="log-item" key={entry.id}>
                <b>{entry.decision}</b>
                <span className="hint">
                  {entry.title}
                  {entry.subject ? ` · ${entry.subject}` : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="empty">Nothing has left this workspace.</p>
          )}
          {workspace?.log.length ? (
            <button className="reset" type="button" onClick={onReset}>
              Clear log
            </button>
          ) : null}
        </aside>

        <main className="main">
          <h1>What should go out today?</h1>
          <p className="lede">
            {workspace
              ? `${workspace.person}, ${workspace.role}. The meeting, the mail, the contract, and the sheet are in this workspace. John drafts. You decide what leaves.`
              : "Loading the workspace."}
          </p>

          <form
            className="ask"
            onSubmit={(event) => {
              event.preventDefault();
              void onAsk();
            }}
          >
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              aria-label="Ask John"
            />
            <button type="submit" disabled={busy || !question.trim()}>
              {busy ? "Reading…" : "Ask John"}
            </button>
          </form>

          <div className="chips">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className="chip"
                type="button"
                onClick={() => {
                  setQuestion(prompt);
                  void onAsk(prompt);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <p className="status">
            {busy ? "John is reading only this workspace." : answer ? `Read ${answer.read.map((item) => item.title).join(", ")}.` : ""}
          </p>
          {error ? <div className="error">{error}</div> : null}

          {answer ? (
            <div className="stack">
              <section className="card block">
                {answer.brief ? <p className="brief">{answer.brief}</p> : null}
                {answer.missing ? <p className="missing">{answer.missing}</p> : null}
              </section>

              {answer.decisions.length ? (
                <section className="card block">
                  <h2>Decisions</h2>
                  {answer.decisions.map((decision) => (
                    <article className="item" key={decision.text}>
                      <strong>{decision.text}</strong>
                      <p className="meta">
                        {[decision.owner, decision.deadline].filter(Boolean).join(" · ")}
                      </p>
                      <Quotes citations={decision.citations} />
                    </article>
                  ))}
                </section>
              ) : null}

              {answer.risks.length ? (
                <section className="card block">
                  <h2>Risks</h2>
                  {answer.risks.map((risk) => (
                    <article className="risk" key={risk.title}>
                      <div className="tag">{risk.severity}</div>
                      <strong>{risk.title}</strong>
                      <p>{risk.detail}</p>
                      <Quotes citations={risk.citations} />
                    </article>
                  ))}
                </section>
              ) : null}

              {answer.actions.length ? (
                <section className="card block">
                  <h2>Waiting for your yes</h2>
                  {answer.actions.map((action) => (
                    <article className="item mail" key={action.id}>
                      <strong>{action.title}</strong>
                      <p className="meta">{action.why}</p>
                      <p>To: {action.to}</p>
                      <p>Subject: {action.subject}</p>
                      <p className="body">{action.body}</p>
                      <Quotes citations={action.citations} />
                      {decided[action.id] ? (
                        <p className="done">
                          {decided[action.id] === "approved" ? "Approved. Written to the action log." : "Held. Nothing was sent."}
                        </p>
                      ) : (
                        <div className="row">
                          <button type="button" disabled={busy} onClick={() => void onDecide(action.id, "approved")}>
                            Approve
                          </button>
                          <button className="hold" type="button" disabled={busy} onClick={() => void onDecide(action.id, "held")}>
                            Hold
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              ) : null}
            </div>
          ) : null}

          {open ? (
            <section className="card drawer">
              <header>
                <h2>{open.title}</h2>
                <button className="close" type="button" onClick={() => setOpenId(null)}>
                  Close
                </button>
              </header>
              <pre>{open.text}</pre>
            </section>
          ) : null}

          <p className="foot">
            Synthetic company. Approving writes the draft to this workspace’s action log. No live mailbox is connected, and other companies’ files are not readable from here.
          </p>
        </main>
      </div>
    </div>
  );
}
