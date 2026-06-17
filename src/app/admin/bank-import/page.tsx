'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Download } from 'lucide-react';

interface MatchResult {
  orderNumber: string;
  amount: number;
}

interface ReviewItem {
  amount: number;
  reason: string;
}

interface ImportSummary {
  totalTransactions: number;
  matched: number;
  needsReview: number;
}

export default function BankImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<{
    summary: ImportSummary;
    processed: MatchResult[];
    ambiguous: ReviewItem[];
    unmatched: ReviewItem[];
  } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected);
      setError('');
    } else {
      setError('Please select a CSV file');
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/bank-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Upload failed');
        setIsUploading(false);
        return;
      }

      setResult({
        summary: data.summary,
        processed: data.processed || [],
        ambiguous: data.ambiguous || [],
        unmatched: data.unmatched || [],
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith('.csv')) {
      setFile(dropped);
      setError('');
    } else {
      setError('Please drop a CSV file');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-gray-400 hover:text-gold transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
                Bank Statement Import
              </h1>
            </div>
            <Link href="/" className="text-sm text-gray-400 hover:text-gold transition-colors">
              Back to Site
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Instructions */}
        <div className="bg-surface border border-border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">How to Use</h2>
          <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
            <li>Log in to HSBC online banking</li>
            <li>Go to Account Management and export yesterday&apos;s transactions as CSV</li>
            <li>Upload the CSV file here - the system will auto-match orders and mark them as paid</li>
            <li>Check the results - green means auto-confirmed, yellow/red means manual review needed</li>
          </ol>
          <div className="mt-4 p-3 bg-gold/5 border border-gold/20 rounded-lg">
            <p className="text-sm text-gold">
              <strong>Tip:</strong> Ask customers to include their order number (e.g., AC-20260617-001) in the transfer reference for 100% accurate matching.
            </p>
          </div>
        </div>

        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="bg-surface border-2 border-dashed border-border rounded-lg p-12 text-center mb-8 hover:border-gold/50 transition-colors"
        >
          <Upload className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Drag and drop your CSV file here</p>
          <p className="text-sm text-gray-500 mb-4">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors"
          >
            Select File
          </button>
          {file && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
              <FileText className="w-4 h-4" />
              <span>{file.name}</span>
              <span className="text-gray-600">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {file && !result && (
          <div className="text-center">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-8 py-3 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
            >
              {isUploading ? (
                <>
                  <span className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Process Bank Statement
                </>
              )}
            </button>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-surface border border-border rounded-lg p-6 text-center">
                <p className="text-sm text-gray-400 mb-1">Total Transactions</p>
                <p className="text-3xl font-bold text-foreground">{result.summary.totalTransactions}</p>
              </div>
              <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-6 text-center">
                <p className="text-sm text-green-400 mb-1">Auto-Matched</p>
                <p className="text-3xl font-bold text-green-400">{result.summary.matched}</p>
              </div>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-6 text-center">
                <p className="text-sm text-yellow-400 mb-1">Needs Review</p>
                <p className="text-3xl font-bold text-yellow-400">{result.summary.needsReview}</p>
              </div>
            </div>

            {/* Matched Orders */}
            {result.processed.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <h3 className="text-lg font-semibold text-foreground">Auto-Confirmed Orders</h3>
                </div>
                <div className="space-y-2">
                  {result.processed.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-green-500/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="font-mono text-sm text-foreground">{item.orderNumber}</span>
                      </div>
                      <span className="text-green-400 font-medium">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ambiguous */}
            {result.ambiguous.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-lg font-semibold text-foreground">Needs Manual Review</h3>
                </div>
                <div className="space-y-2">
                  {result.ambiguous.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-yellow-500/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm text-gray-400">{item.reason}</span>
                      </div>
                      <span className="text-yellow-400 font-medium">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched */}
            {result.unmatched.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-5 h-5 text-red-400" />
                  <h3 className="text-lg font-semibold text-foreground">Unmatched</h3>
                </div>
                <div className="space-y-2">
                  {result.unmatched.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-red-500/5 rounded-lg">
                      <div className="flex items-center gap-3">
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-gray-400">{item.reason}</span>
                      </div>
                      <span className="text-red-400 font-medium">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary email sent notice */}
            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-center">
              <p className="text-sm text-blue-400">
                A summary email has been sent to the admin inbox.
              </p>
            </div>

            <div className="text-center">
              <button
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-6 py-2 border border-border text-gray-400 rounded-lg hover:text-foreground transition-colors"
              >
                Upload Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
