'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { attemptSchema, type AttemptFormValues } from '@/types';
import type { Attempt } from '@/types';
import { api } from '@/lib/api';
import { ATTEMPT_FIELD_GUIDANCE, ATTEMPT_FIELD_LIMITS } from '@/lib/core/field-policy';

interface EditProps {
  attempt: Attempt;
  onSave: (values: AttemptFormValues) => Promise<void>;
  onCancel: () => void;
}

function AttemptEditForm({ attempt, onSave, onCancel }: EditProps) {
  const [saving, setSaving] = useState(false);
  const form = useForm<AttemptFormValues>({
    resolver: zodResolver(attemptSchema),
    defaultValues: {
      hypothesis: attempt.hypothesis,
      action: attempt.action,
      result: attempt.result,
      gradient: attempt.gradient,
    },
  });

  const handleSubmit = async (values: AttemptFormValues) => {
    setSaving(true);
    try { await onSave(values); }
    finally { setSaving(false); }
  };

  return (
    <form className="attempt-form" onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="attempt-form-row">
        <div className="field-group">
          <label className="field-label">假设 *</label>
          <input {...form.register('hypothesis')} maxLength={ATTEMPT_FIELD_LIMITS.hypothesis} placeholder={ATTEMPT_FIELD_GUIDANCE.hypothesis} />
          {form.formState.errors.hypothesis && <span className="field-error">{form.formState.errors.hypothesis.message}</span>}
        </div>
        <div className="field-group">
          <label className="field-label">行动 *</label>
          <input {...form.register('action')} maxLength={ATTEMPT_FIELD_LIMITS.action} placeholder={ATTEMPT_FIELD_GUIDANCE.action} />
          {form.formState.errors.action && <span className="field-error">{form.formState.errors.action.message}</span>}
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">结果 *</label>
        <textarea {...form.register('result')} maxLength={ATTEMPT_FIELD_LIMITS.result} placeholder={ATTEMPT_FIELD_GUIDANCE.result} rows={2} />
        {form.formState.errors.result && <span className="field-error">{form.formState.errors.result.message}</span>}
      </div>
      <div className="field-group">
        <label className="field-label">梯度（学习信号，可为负数）</label>
        <input type="number" step="any" defaultValue={attempt.gradient ?? ''} onChange={(e) => form.setValue('gradient', e.target.value === '' ? null : Number(e.target.value))} />
      </div>
      <div className="attempt-form-actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </form>
  );
}

interface Props { goalId: string; attempts: Attempt[]; onAttemptAdded: () => void; }

export function AttemptsTable({ goalId, attempts, onAttemptAdded }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const form = useForm<AttemptFormValues>({ resolver: zodResolver(attemptSchema), defaultValues: { hypothesis: '', action: '', result: '', gradient: null } });

  const handleSubmit = async (values: AttemptFormValues) => {
    setSubmitting(true);
    try { await api.createAttempt(goalId, values); form.reset(); setShowForm(false); onAttemptAdded(); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除该尝试记录？此操作不可撤销。')) return;
    setDeleting(id);
    try { await api.deleteAttempt(id); onAttemptAdded(); }
    catch (e) { console.error('deleteAttempt failed:', e); }
    finally { setDeleting(null); }
  };

  const recentAttempts = attempts.filter((a) => a.goal_id === goalId).slice(-10).reverse();

  return (
    <div className="attempts-section">
      <h2>近期尝试</h2>
      <div className="attempt-list">
        {recentAttempts.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>暂无尝试记录。</p>}
        {recentAttempts.map((attempt) => (
          <div key={attempt.id} className="attempt-card">
            {editingId === attempt.id ? (
              <AttemptEditForm
                attempt={attempt}
                onSave={async (values) => {
                  await api.updateAttempt(attempt.id, values);
                  setEditingId(null);
                  onAttemptAdded();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="attempt-head">
                  <div className="attempt-meta">
                    {attempt.gradient != null && <span className="pill">梯度 {attempt.gradient}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="attempt-date">{(() => { const d = new Date(attempt.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}</span>
                    <button type="button" onClick={() => setEditingId(attempt.id)}>编辑</button>
                    <button type="button" className="danger" disabled={deleting === attempt.id} onClick={() => handleDelete(attempt.id)}>
                      {deleting === attempt.id ? '删除中…' : '删除'}
                    </button>
                  </div>
                </div>
                <p><strong>假设：</strong>{attempt.hypothesis}</p>
                <p><strong>行动：</strong>{attempt.action}</p>
                <p><strong>结果：</strong>{attempt.result}</p>
              </>
            )}
          </div>
        ))}
      </div>
      {!showForm ? (
        <button type="button" className="add-note-btn" style={{ marginTop: 10 }} onClick={() => setShowForm(true)}>+ 记录尝试</button>
      ) : (
        <form className="attempt-form" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="attempt-form-row">
            <div className="field-group">
              <label className="field-label">假设 *</label>
              <input {...form.register('hypothesis')} maxLength={ATTEMPT_FIELD_LIMITS.hypothesis} placeholder={ATTEMPT_FIELD_GUIDANCE.hypothesis} />
              {form.formState.errors.hypothesis && <span className="field-error">{form.formState.errors.hypothesis.message}</span>}
            </div>
            <div className="field-group">
              <label className="field-label">行动 *</label>
              <input {...form.register('action')} maxLength={ATTEMPT_FIELD_LIMITS.action} placeholder={ATTEMPT_FIELD_GUIDANCE.action} />
              {form.formState.errors.action && <span className="field-error">{form.formState.errors.action.message}</span>}
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">结果 *</label>
            <textarea {...form.register('result')} maxLength={ATTEMPT_FIELD_LIMITS.result} placeholder={ATTEMPT_FIELD_GUIDANCE.result} rows={2} />
            {form.formState.errors.result && <span className="field-error">{form.formState.errors.result.message}</span>}
          </div>
          <div className="field-group">
            <label className="field-label">梯度（学习信号，可为负数）</label>
            <input type="number" step="any" placeholder="可选" onChange={(e) => form.setValue('gradient', e.target.value === '' ? null : Number(e.target.value))} />
          </div>
          <div className="attempt-form-actions">
            <button type="button" onClick={() => setShowForm(false)}>取消</button>
            <button type="submit" className="primary" disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
