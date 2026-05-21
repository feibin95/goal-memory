'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { attemptSchema, type AttemptFormValues } from '@/lib/schema';
import type { Attempt } from '@/types';
import { api } from '@/lib/api';

interface Props { goalId: string; attempts: Attempt[]; onAttemptAdded: () => void; }

export function AttemptsTable({ goalId, attempts, onAttemptAdded }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<AttemptFormValues>({ resolver: zodResolver(attemptSchema), defaultValues: { hypothesis: '', action: '', result: '', gradient: null } });

  const handleSubmit = async (values: AttemptFormValues) => {
    setSubmitting(true);
    try { await api.createAttempt(goalId, values); form.reset(); setShowForm(false); onAttemptAdded(); }
    finally { setSubmitting(false); }
  };

  const recentAttempts = attempts.filter((a) => a.goal_id === goalId).slice(-10).reverse();

  return (
    <div className="attempts-section">
      <h2>近期尝试</h2>
      <div className="attempt-list">
        {recentAttempts.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>暂无尝试记录。</p>}
        {recentAttempts.map((attempt) => (
          <div key={attempt.id} className="attempt-card">
            <div className="attempt-head">
              <div className="attempt-meta">
                {attempt.gradient != null && <span className="pill">梯度 {attempt.gradient}</span>}
              </div>
              <span className="attempt-date">{attempt.created_at.slice(0, 10)}</span>
            </div>
            <p><strong>假设：</strong>{attempt.hypothesis}</p>
            <p><strong>行动：</strong>{attempt.action}</p>
            <p><strong>结果：</strong>{attempt.result}</p>
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
              <input {...form.register('hypothesis')} placeholder="本次尝试预期会怎样" />
              {form.formState.errors.hypothesis && <span className="field-error">{form.formState.errors.hypothesis.message}</span>}
            </div>
            <div className="field-group">
              <label className="field-label">行动 *</label>
              <input {...form.register('action')} placeholder="实际做了什么" />
              {form.formState.errors.action && <span className="field-error">{form.formState.errors.action.message}</span>}
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">结果 *</label>
            <textarea {...form.register('result')} placeholder="发生了什么" rows={2} />
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
