import React, { useState } from 'react';
import type { DocumentExtractionResult, ScanResult } from '../types';
import {
  FileText,
  HardDrive,
  Layers,
  AlertCircle,
  ShieldCheck,
  FileCode,
  BookOpen,
  Eye,
  Lock,
  Image,
  AlertTriangle,
} from 'lucide-react';
import { DocumentExtractionModal } from './DocumentExtractionModal';

interface ClutterInspectorProps {
  scanResult: ScanResult | null;
}

export const ClutterInspector: React.FC<ClutterInspectorProps> = ({ scanResult }) => {
  const [showSkipped, setShowSkipped] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentExtractionResult | null>(null);

  if (!scanResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <HardDrive className="empty-icon" size={42} />
          <h3 className="empty-title">Folder Not Scanned Yet</h3>
          <p className="empty-desc">
            Choose a folder or click Browse... above, then click <strong>Scan Folder</strong> to see category distributions, relative paths, and largest files.
          </p>
        </div>
      </div>
    );
  }

  const skipped = scanResult.skipped_files || [];
  const extractedDocs = scanResult.extracted_documents || [];
  const extractionSummary = scanResult.extraction_summary || {};

  return (
    <div>
      {/* Stat Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Total Files</span>
            <FileText size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{scanResult.total_files.toLocaleString()}</div>
          <div className="stat-subtitle">Indexed in workspace</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Storage Footprint</span>
            <HardDrive size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{scanResult.total_size_formatted}</div>
          <div className="stat-subtitle">Total disk space</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Extracted Documents</span>
            <BookOpen size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{extractedDocs.length}</div>
          <div className="stat-subtitle">
            {extractionSummary['success'] || 0} successful text parses
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Skipped / Protected</span>
            <ShieldCheck
              size={18}
              className="stat-icon"
              style={{ color: skipped.length > 0 ? '#b45309' : 'var(--forest-600)' }}
            />
          </div>
          <div className="stat-value">{skipped.length}</div>
          <div className="stat-subtitle">External symlinks &amp; errors</div>
        </div>
      </div>

      {/* Categories Breakdown Table */}
      <div className="panel-card">
        <div className="panel-header">
          <h3 className="panel-title">
            <Layers size={18} style={{ color: 'var(--forest-600)' }} />
            File Category Breakdown
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Workspace: <code style={{ fontFamily: 'var(--font-mono)' }}>{scanResult.root_path}</code>
          </span>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          <table className="file-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>File Count</th>
                <th>Total Size</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {scanResult.categories.map((c) => {
                const percentage =
                  scanResult.total_size_bytes > 0
                    ? ((c.total_size_bytes / scanResult.total_size_bytes) * 100).toFixed(1)
                    : '0';

                return (
                  <tr key={c.category}>
                    <td className="file-name-cell">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor:
                            c.category === 'Documents'
                              ? 'var(--forest-700)'
                              : c.category === 'Code'
                              ? '#2563eb'
                              : c.category === 'Images'
                              ? '#7c3aed'
                              : c.category === 'Archives'
                              ? '#d97706'
                              : 'var(--sage-500)',
                          display: 'inline-block',
                        }}
                      />
                      {c.category}
                    </td>
                    <td>{c.count.toLocaleString()}</td>
                    <td>{c.total_size_formatted}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            flex: 1,
                            maxWidth: 100,
                            height: 6,
                            backgroundColor: 'var(--bg-muted)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: '100%',
                              backgroundColor: 'var(--forest-600)',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {percentage}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Local Document Extraction Section */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              <BookOpen size={18} style={{ color: 'var(--forest-600)' }} />
              Safe Document Extraction ({extractedDocs.length})
            </h3>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              TXT, Markdown, PDF, DOCX, CSV, JSON bounded text parsing (100% on-device)
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {extractionSummary['success'] ? (
              <span className="badge badge-low">{extractionSummary['success']} Extracted</span>
            ) : null}
            {extractionSummary['password_protected'] ? (
              <span className="badge badge-medium">
                <Lock size={10} style={{ display: 'inline', marginRight: 2 }} />
                {extractionSummary['password_protected']} Locked
              </span>
            ) : null}
            {extractionSummary['image_only_or_empty'] ? (
              <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                <Image size={10} style={{ display: 'inline', marginRight: 2 }} />
                {extractionSummary['image_only_or_empty']} Image-Only
              </span>
            ) : null}
            {extractionSummary['malformed'] ? (
              <span className="badge badge-high">
                <AlertTriangle size={10} style={{ display: 'inline', marginRight: 2 }} />
                {extractionSummary['malformed']} Malformed
              </span>
            ) : null}
          </div>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          {extractedDocs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No extractable text documents found in current workspace scan.
            </div>
          ) : (
            <table className="file-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Format</th>
                  <th>Status</th>
                  <th>Yield</th>
                  <th>Details &amp; Action</th>
                </tr>
              </thead>
              <tbody>
                {extractedDocs.map((doc) => {
                  const statusColor =
                    doc.status === 'success'
                      ? 'var(--forest-100)'
                      : doc.status === 'password_protected'
                      ? '#fef3c7'
                      : doc.status === 'image_only_or_empty'
                      ? '#fef9c3'
                      : '#fee2e2';

                  const textColor =
                    doc.status === 'success'
                      ? 'var(--forest-800)'
                      : doc.status === 'password_protected'
                      ? '#92400e'
                      : doc.status === 'image_only_or_empty'
                      ? '#854d0e'
                      : '#991b1b';

                  return (
                    <tr key={doc.file_id}>
                      <td className="file-name-cell">
                        <FileText size={15} style={{ color: 'var(--forest-600)' }} />
                        <span style={{ fontWeight: 500 }} title={doc.path}>
                          {doc.relative_path}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.5rem',
                            backgroundColor: 'var(--bg-subtle)',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {doc.extension.replace('.', '')}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.55rem',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: statusColor,
                            color: textColor,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {doc.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {doc.status === 'success' ? (
                          <span>
                            <strong>{doc.total_chunks}</strong> chunks ({doc.total_chars.toLocaleString()} chars)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>0 chars</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {doc.error_message ? (
                            <span
                              style={{
                                fontSize: '0.76rem',
                                color: textColor,
                                maxWidth: '240px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={doc.error_message}
                            >
                              {doc.error_message}
                            </span>
                          ) : null}

                          <button
                            className="btn-secondary"
                            onClick={() => setSelectedDoc(doc)}
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            title="Inspect text chunks and source references"
                          >
                            <Eye size={12} />
                            View Chunks
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Largest Files Table with Relative Paths */}
      <div className="panel-card">
        <div className="panel-header">
          <h3 className="panel-title">
            <HardDrive size={18} style={{ color: 'var(--forest-600)' }} />
            Largest Files in Workspace
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Workspace-relative paths &amp; formats
          </span>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          <table className="file-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Relative Path</th>
                <th>Size</th>
                <th>Format</th>
                <th>Modified</th>
                <th>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {scanResult.largest_files.map((file) => (
                <tr key={file.path}>
                  <td className="file-name-cell">
                    <FileCode size={15} style={{ color: 'var(--forest-600)' }} />
                    {file.name}
                  </td>
                  <td className="file-path" title={file.relative_path}>
                    {file.relative_path}
                  </td>
                  <td>
                    <strong>{file.size_formatted}</strong>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {file.content_format}
                    </span>
                  </td>
                  <td>{file.days_inactive}d ago</td>
                  <td>
                    {file.sha256 ? (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                        }}
                        title={file.sha256}
                      >
                        {file.sha256.substring(0, 10)}...
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Skipped Files & Traversal Safety Section */}
      {skipped.length > 0 && (
        <div className="panel-card">
          <div
            className="panel-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowSkipped(!showSkipped)}
          >
            <h3 className="panel-title" style={{ color: '#92400e' }}>
              <AlertCircle size={18} style={{ color: '#d97706' }} />
              Skipped Files &amp; Security Protections ({skipped.length})
            </h3>
            <button
              className="btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
            >
              {showSkipped ? 'Hide Details' : 'View Skipped Items'}
            </button>
          </div>

          {showSkipped && (
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="file-table">
                <thead>
                  <tr>
                    <th>Item / Path</th>
                    <th>Type</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {skipped.map((s, idx) => (
                    <tr key={idx}>
                      <td className="file-path" title={s.path}>
                        {s.relative_path || s.path}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.72rem',
                            backgroundColor:
                              s.error_type === 'symlink_external' ? '#fee2e2' : 'var(--bg-muted)',
                            color: s.error_type === 'symlink_external' ? '#991b1b' : 'inherit',
                            fontWeight: 600,
                          }}
                        >
                          {s.error_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {s.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Document Extraction Reader Modal */}
      <DocumentExtractionModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />
    </div>
  );
};
