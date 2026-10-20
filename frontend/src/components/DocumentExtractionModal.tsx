import React from 'react';
import { X, ShieldAlert, FileText, Bookmark, Hash } from 'lucide-react';
import type { DocumentExtractionResult } from '../types';

interface DocumentExtractionModalProps {
  document: DocumentExtractionResult | null;
  onClose: () => void;
}

export const DocumentExtractionModal: React.FC<DocumentExtractionModalProps> = ({
  document,
  onClose,
}) => {
  if (!document) return null;

  const isSuccess = document.status === 'success';

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
        zIndex: 110,
        padding: '1.5rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 780,
          maxHeight: '82vh',
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
            padding: '1.15rem 1.5rem',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fafcf9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                backgroundColor: isSuccess ? 'var(--forest-100)' : '#fef2f2',
                color: isSuccess ? 'var(--forest-800)' : '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--forest-900)' }}>
                  {document.relative_path}
                </h4>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor:
                      document.status === 'success'
                        ? 'var(--forest-100)'
                        : document.status === 'password_protected'
                        ? '#fef3c7'
                        : '#fee2e2',
                    color:
                      document.status === 'success'
                        ? 'var(--forest-800)'
                        : document.status === 'password_protected'
                        ? '#92400e'
                        : '#991b1b',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {document.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                ID: <code>{document.file_id}</code> &nbsp;•&nbsp; {document.total_chars.toLocaleString()} chars &nbsp;•&nbsp; {document.total_chunks} chunks
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '0.4rem',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
            }}
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>

        {/* Untrusted Data Notice */}
        <div
          style={{
            padding: '0.65rem 1.5rem',
            backgroundColor: '#fbfdfa',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          <ShieldAlert size={14} style={{ color: 'var(--forest-600)' }} />
          <span>
            <strong>Isolated Untrusted Data:</strong> Document contents are quarantined as inert text. Malicious prompt instructions cannot modify application rules.
          </span>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            backgroundColor: 'var(--bg-canvas)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {document.error_message && (
            <div
              style={{
                padding: '0.9rem 1.15rem',
                backgroundColor: document.status === 'password_protected' ? '#fef3c7' : '#fee2e2',
                border: `1px solid ${document.status === 'password_protected' ? '#fde047' : '#f87171'}`,
                borderRadius: 'var(--radius-md)',
                color: document.status === 'password_protected' ? '#92400e' : '#991b1b',
                fontSize: '0.88rem',
              }}
            >
              <strong>Extraction Status: </strong>
              {document.error_message}
            </div>
          )}

          {document.chunks.length === 0 && !document.error_message && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No text chunks extracted.
            </div>
          )}

          {document.chunks.map((chk, idx) => (
            <div
              key={chk.chunk_id || idx}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  padding: '0.55rem 1rem',
                  backgroundColor: '#f8faf7',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--forest-900)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Bookmark size={13} style={{ color: 'var(--forest-600)' }} />
                  {chk.reference}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Hash size={12} />
                    {chk.char_count} chars
                  </span>
                  <span>~{chk.token_estimate} tokens</span>
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  lineHeight: 1.6,
                  color: 'var(--text-main)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                {chk.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
