import React, { useRef, useState } from 'react';

export default function FileUpload({ onUpload, loading }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    if (files && files[0]) onUpload(files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-colors"
      style={{
        borderColor: dragOver ? 'var(--brand)' : 'var(--border-color-strong)',
        background: dragOver ? 'var(--bg-app-alt)' : 'var(--card-bg)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="text-4xl mb-3">📂</div>
      <p className="font-semibold text-[var(--text-primary)] mb-1">
        {loading ? 'Uploading…' : 'Drop a CSV/TSV file here, or click to browse'}
      </p>
      <p className="text-sm text-[var(--text-secondary)]">
        Excel files aren't supported yet — export to CSV first. Max 25MB, 200,000 rows.
      </p>
    </div>
  );
}
