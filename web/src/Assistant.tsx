import { useState } from "react";
import { ArrowUpRight, Bot, Check, Info, Send, Sparkles } from "lucide-react";
import { demo, post } from "./api";
import { useWorkspace } from "./context";
import type { AssistantReply } from "./types";
import { Button, ErrorBox, Modal } from "./ui";
import { ServerSelect } from "./operations";
import { useTranslation } from "./i18n";

export function Assistant({
  initialServer,
  configured,
  onClose,
}: {
  initialServer: string;
  configured: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { servers, runAction, can } = useWorkspace();
  const [id, setId] = useState(initialServer || servers[0]?.id || "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<
    {
      role: "user" | "assistant";
      text: string;
      serverId: string;
      reply?: AssistantReply;
    }[]
  >([]);
  const [applied, setApplied] = useState<string[]>([]);
  return (
    <Modal
      title="Meet Ember."
      subtitle={t("A little help, right where you need it.")}
      onClose={onClose}
      wide
    >
      <div className="assistant-body">
        <ServerSelect selected={id} onChange={setId} />
        {!messages.length && (
          <div className="assistant-intro">
            <span className="ember-avatar">
              <Sparkles size={22} />
            </span>
            <h3>{t("What are we building today?")}</h3>
            <p>
              {t(
                "I can read your server's logs, find compatible packages, and propose a next step. Every change stays in your hands.",
              )}
            </p>
            <div className="assistant-prompts">
              {[
                "Help me understand the latest errors",
                "Find a permissions plugin for this server",
                "What should I check if the server lags?",
              ].map((text) => (
                <button key={text} onClick={() => setPrompt(t(text))}>
                  {t(text)}
                  <ArrowUpRight size={11} />
                </button>
              ))}
            </div>
          </div>
        )}
        {!configured && (
          <div className="notice">
            <Info size={17} />
            <span>
              {t(
                demo
                  ? "This is the demo assistant preview. Connect an OpenAI-compatible provider in your own workspace to ask questions."
                  : "Add your provider to /etc/emberdeck/panel.toml: ai_base_url, ai_model and ai_api_key (or EMBER_AI_API_KEY). Restart emberdeck-panel to connect.",
              )}
              <br />
              {t(
                "Only the selected server's context and redacted recent logs are sent to your provider.",
              )}
            </span>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index}>
            <div className={`chat-message ${message.role}`}>
              <span className="chat-label">
                {message.role === "assistant" ? (
                  <Sparkles size={13} />
                ) : (
                  <Bot size={13} />
                )}
                {message.role === "assistant" ? "EMBER" : t("YOU")}
              </span>
              {message.text}
            </div>
            {message.reply?.actions.map((proposal, actionIndex) => {
              const key = `${index}-${actionIndex}`;
              return (
                <div className="assistant-proposal" key={key}>
                  <h3>{proposal.label}</h3>
                  <p>{proposal.reason}</p>
                  <code>{JSON.stringify(proposal.request)}</code>
                  <Button
                    disabled={applied.includes(key)}
                    onClick={async () => {
                      const result = await runAction(
                        message.serverId,
                        proposal.request,
                      );
                      if (result) setApplied((old) => [...old, key]);
                    }}
                  >
                    {applied.includes(key) ? (
                      <>
                        <Check size={13} />
                        {t("Confirmed")}
                      </>
                    ) : (
                      t("Confirm this change")
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        ))}
        <ErrorBox error={error} />
        <form
          className="assistant-compose"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const question = prompt;
            const targetId = id;
            setMessages((old) => [
              ...old,
              { role: "user", text: question, serverId: targetId },
            ]);
            setPrompt("");
            try {
              const reply = await post<AssistantReply>("/api/assistant", {
                server_id: targetId,
                prompt: question,
              });
              setMessages((old) => [
                ...old,
                {
                  role: "assistant",
                  text: reply.content,
                  serverId: targetId,
                  reply,
                },
              ]);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error
                  : new Error("Assistant request failed"),
              );
              setPrompt(question);
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            aria-label={t("Message to Ember")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("Ask about this server…")}
            maxLength={4000}
          />
          <Button
            variant="primary"
            aria-label={t("Ask Ember")}
            busy={busy}
            disabled={
              !configured || !id || !prompt.trim() || !can("assistant.use", id)
            }
            type="submit"
          >
            <Send size={14} />
            <span>{t("Ask Ember")}</span>
          </Button>
        </form>
      </div>
    </Modal>
  );
}
