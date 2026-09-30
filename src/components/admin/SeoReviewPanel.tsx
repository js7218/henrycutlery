'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, CheckCircle, XCircle, RotateCcw, Save, Loader2 } from 'lucide-react';
import { products } from '@/data/products';
import { cn } from '@/lib/utils';
import type { SeoDraft, SeoStatus } from '@/lib/seo/types';

type Filter = SeoStatus | 'all';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const EMPTY_COUNTS: Record<SeoStatus, number> = { draft: 0, approved: 0, rejected: 0 };

const statusStyles: Record<SeoStatus, string> = {
  draft: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/10 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const statusLabels: Record<SeoStatus, string> = {
  draft: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const inputClass =
  'w-full px-3 py-2 bg-surfaceLight border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-gold';

interface FormState {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  summary: string;
  longDescription: string;
  keywords: string;
  altTexts: string;
}

function toForm(draft: SeoDraft): FormState {
  return {
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    slug: draft.slug,
    summary: draft.summary,
    longDescription: draft.longDescription,
    keywords: draft.keywords.join(', '),
    altTexts: draft.altTexts.join('\n'),
  };
}

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseAltTexts(value: string): string[] {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

const productNames = new Map(products.map((p) => [p.id, p.name]));

function productLabel(id: string): string {
  return productNames.get(id) || id;
}

export default function SeoReviewPanel() {
  const [filter, setFilter] = useState<Filter>('all');
  const [drafts, setDrafts] = useState<SeoDraft[]>([]);
  const [counts, setCounts] = useState<Record<SeoStatus, number>>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selected = useMemo(
    () => drafts.find((d) => d.id === selectedId) || null,
    [drafts, selectedId],
  );

  const load = useCallback(async (nextFilter: Filter) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/seo/drafts?status=${nextFilter}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to load SEO drafts.');
        return;
      }
      const list: SeoDraft[] = data.drafts || [];
      setDrafts(list);
      setCounts({ ...EMPTY_COUNTS, ...(data.counts || {}) });
      const first = list[0] || null;
      setSelectedId(first?.id || null);
      setForm(first ? toForm(first) : null);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const selectDraft = (draft: SeoDraft) => {
    setSelectedId(draft.id);
    setForm(toForm(draft));
    setBanner('');
  };

  /** 只提交非空字段；patch 会被 API 校验（空串非法），且任何编辑都会让状态回到 draft。 */
  const buildPatch = (): Record<string, unknown> => {
    if (!form) return {};
    const patch: Record<string, unknown> = {};
    if (form.seoTitle.trim()) patch.seoTitle = form.seoTitle.trim().slice(0, 200);
    if (form.metaDescription.trim())
      patch.metaDescription = form.metaDescription.trim().slice(0, 400);
    if (form.slug.trim()) patch.slug = form.slug.trim().slice(0, 80);
    if (form.summary.trim()) patch.summary = form.summary.trim().slice(0, 600);
    if (form.longDescription.trim())
      patch.longDescription = form.longDescription.trim().slice(0, 8000);
    const keywords = parseKeywords(form.keywords);
    if (keywords.length) patch.keywords = keywords;
    const altTexts = parseAltTexts(form.altTexts);
    if (altTexts.length) patch.altTexts = altTexts;
    return patch;
  };

  const submitAction = async (
    action: 'approve' | 'reject' | 'reset',
    includePatch: boolean,
  ) => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setBanner('');
    try {
      const body: Record<string, unknown> = { id: selected.id, action };
      if (includePatch) {
        const patch = buildPatch();
        if (Object.keys(patch).length) body.patch = patch;
      }
      const res = await fetch('/api/admin/seo/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to update draft.');
        return;
      }
      setBanner(
        action === 'approve'
          ? 'Approved. It will be published on the next scheduled run (daily 07:00 UTC).'
          : action === 'reject'
            ? 'Rejected.'
            : 'Saved as draft.',
      );
      await load(filter);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setBanner('');
    try {
      const res = await fetch('/api/admin/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(
          data.code === 'LLM_NOT_CONFIGURED'
            ? 'DEEPSEEK_API_KEY is not configured on the server, so AI generation is unavailable.'
            : data.error || 'Generation failed.',
        );
        return;
      }
      setBanner(
        `Generated ${data.generatedCount} draft(s) using ${data.model}` +
          (data.failedCount ? `, ${data.failedCount} failed` : '') +
          (data.remainingAfterBatch
            ? `. ${data.remainingAfterBatch} product(s) remain — click again to continue.`
            : '.'),
      );
      await load(filter);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          className="text-2xl font-bold text-foreground"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          SEO Content Review
        </h1>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-gold text-background rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-goldLight transition-colors disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {generating ? 'Generating...' : 'Generate drafts'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {banner && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
          {banner}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Draft list */}
        <aside className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count =
                f.id === 'all' ? counts.draft + counts.approved + counts.rejected : counts[f.id];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    filter === f.id
                      ? 'bg-gold text-background border-gold'
                      : 'border-border text-gray-400 hover:text-foreground',
                  )}
                >
                  {f.label}
                  <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
            ) : drafts.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No drafts here. Click &ldquo;Generate drafts&rdquo; to create some.
              </div>
            ) : (
              drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDraft(d)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    selectedId === d.id ? 'bg-gold/10' : 'hover:bg-surfaceLight',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-gray-500 font-mono truncate">{d.productId}</span>
                    <span
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border shrink-0',
                        statusStyles[d.status],
                      )}
                    >
                      {statusLabels[d.status]}
                    </span>
                  </div>
                  <p className="text-sm text-foreground truncate">
                    {d.seoTitle || productLabel(d.productId)}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {new Date(d.updatedAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className="bg-surface border border-border rounded-xl p-6">
          {!selected || !form ? (
            <p className="text-gray-400 text-sm">Select a draft to review.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {productLabel(selected.productId)}
                  </h2>
                  <p className="text-xs text-gray-500 font-mono mt-1">{selected.productId}</p>
                </div>
                <div className="text-right text-xs text-gray-500 space-y-1">
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded-full border',
                      statusStyles[selected.status],
                    )}
                  >
                    {statusLabels[selected.status]}
                  </span>
                  <p>model: {selected.model || 'template'}</p>
                  {selected.reviewedAt && (
                    <p>reviewed: {new Date(selected.reviewedAt).toLocaleString()}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  SEO title <span className="text-gray-600">({form.seoTitle.length}/200)</span>
                </label>
                <input
                  className={inputClass}
                  maxLength={200}
                  value={form.seoTitle}
                  onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Meta description{' '}
                  <span className="text-gray-600">({form.metaDescription.length}/400)</span>
                </label>
                <textarea
                  className={cn(inputClass, 'resize-y')}
                  rows={2}
                  maxLength={400}
                  value={form.metaDescription}
                  onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">URL slug</label>
                <input
                  className={inputClass}
                  maxLength={80}
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Summary <span className="text-gray-600">({form.summary.length}/600)</span>
                </label>
                <textarea
                  className={cn(inputClass, 'resize-y')}
                  rows={3}
                  maxLength={600}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Long description{' '}
                  <span className="text-gray-600">({form.longDescription.length}/8000)</span>
                </label>
                <textarea
                  className={cn(inputClass, 'resize-y leading-relaxed')}
                  rows={10}
                  maxLength={8000}
                  value={form.longDescription}
                  onChange={(e) => setForm({ ...form, longDescription: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Keywords <span className="text-gray-600">(comma separated)</span>
                </label>
                <input
                  className={inputClass}
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Image alt texts <span className="text-gray-600">(one per line)</span>
                </label>
                <textarea
                  className={cn(inputClass, 'resize-y')}
                  rows={4}
                  value={form.altTexts}
                  onChange={(e) => setForm({ ...form, altTexts: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                <button
                  onClick={() => submitAction('approve', true)}
                  disabled={saving}
                  className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => submitAction('reset', true)}
                  disabled={saving}
                  className="px-5 py-2 bg-gold text-background rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-goldLight transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Save draft
                </button>
                <button
                  onClick={() => submitAction('reject', false)}
                  disabled={saving}
                  className="px-5 py-2 border border-border text-gray-400 hover:text-foreground rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                {selected.status !== 'draft' && (
                  <button
                    onClick={() => submitAction('reset', false)}
                    disabled={saving}
                    className="px-5 py-2 border border-border text-gray-400 hover:text-foreground rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Back to draft
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-600">
                Approved items are written to <code>src/data/seo-content.json</code> by the daily
                publish workflow (07:00 UTC), then picked up by product pages, JSON-LD and llms.txt.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}