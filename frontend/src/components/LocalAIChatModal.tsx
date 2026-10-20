import React, { useState } from 'react';
import { Bot, Send, X, Sparkles } from 'lucide-react';
import { sendChatMessage } from '../api/client';

interface LocalAIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  defaultModel: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const LocalAIChatModal: React.FC<LocalAIChatModalProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
  defaultModel,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your local ProcrastinateOS assistant running on local Ollama. Ask me how to organize any messy folder, archive old projects, or overcome digital hoarding.",
    },
  ]);
  const [input, setInput] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    try {
      const res = await sendChatMessage(userText);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Local model error: ${err.message || 'Make sure Ollama is running with qwen2.5:1.5b'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(16, 36, 20, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 640,
          height: '75vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border-light)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fafcf9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--forest-100)',
                color: 'var(--forest-800)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={18} />
            </div>
            <div>
              <h4 style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--forest-900)' }}>
                ProcrastinateOS Local Assistant
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Zero data leaves your machine • {defaultModel}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '0.35rem',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
            }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            backgroundColor: 'var(--bg-canvas)',
          }}
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  padding: '0.85rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.92rem',
                  lineHeight: 1.5,
                  backgroundColor: m.role === 'user' ? 'var(--forest-800)' : '#ffffff',
                  color: m.role === 'user' ? '#ffffff' : 'var(--text-main)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border-light)',
                  boxShadow: 'var(--shadow-sm)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Sparkles size={15} className="animate-spin" style={{ color: 'var(--forest-600)' }} />
                Thinking locally with {defaultModel}...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            gap: '0.65rem',
            backgroundColor: '#ffffff',
          }}
        >
          <input
            type="text"
            className="text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask advice about organizing folders or reclaiming disk space..."
            style={{ padding: '0.65rem 1rem' }}
            disabled={loading}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !input.trim()}
            style={{ padding: '0.65rem 1.25rem' }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
