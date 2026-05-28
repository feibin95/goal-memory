'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useForm, Controller, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { goalDetailSchema, type GoalDetailFormValues } from '@/types';
import type { GoalDetail, GoalSummary } from '@/types';
import { GOAL_STATUS_LABELS } from '@/lib/constants';
import { api } from '@/lib/api';
import { GOAL_FIELD_GUIDANCE, GOAL_FIELD_LIMITS } from '@/lib/core/field-policy';
import { NotesEditor } from './NotesEditor';
import { AttemptsTable } from './AttemptsTable';

interface Props {
  goal: GoalDetail; goals: Record<string, GoalSummary>;
  onSaved: () => void; onDeleted: () => void; onAddChild: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const statusLabels = GOAL_STATUS_LABELS;

function mapGoalToForm(goal: GoalDetail): GoalDetailFormValues {
  return { title: goal.title, background: goal.background, success_criteria: goal.success_criteria, status: goal.status, cost: goal.cost, ddl: goal.ddl, notes: goal.notes ?? [] };
}

function goalLabel(g: GoalSummary, allGoals: Record<string, GoalSummary>): string {
  const hasDup = Object.values(allGoals).some(o => o.id !== g.id && o.title === g.title);
  const label = g.title.length > 25 ? g.title.slice(0, 25) + '…' : g.title;
  const suffix = hasDup ? `・${g.id.slice(0, 4)}` : '';
  return `${label}${suffix}`;
}

// 递归收集所有后代 id，防止选父节点时成环
function collectDescendants(goalId: string, goals: Record<string, GoalSummary>): Set<string> {
  const result = new Set<string>();
  const queue = [goalId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const g of Object.values(goals)) {
      if (g.parent_ids?.includes(id) && !result.has(g.id)) {
        result.add(g.id);
        queue.push(g.id);
      }
    }
  }
  return result;
}

export function GoalDetailForm({ goal, goals, onSaved, onDeleted, onAddChild, onDirtyChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [contextText, setContextText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 父节点编辑状态
  const [parentIds, setParentIds] = useState<string[]>(goal.parent_ids ?? []);
  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 依赖项编辑状态
  const [depIds, setDepIds] = useState<string[]>(goal.dependencies ?? []);
  const [depSearch, setDepSearch] = useState('');
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);
  const depDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setParentIds(goal.parent_ids ?? []);
    setParentSearch('');
    setParentDropdownOpen(false);
    setDepIds(goal.dependencies ?? []);
    setDepSearch('');
    setDepDropdownOpen(false);
  }, [goal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击下拉框外部关闭
  useEffect(() => {
    if (!parentDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setParentDropdownOpen(false);
        setParentSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [parentDropdownOpen]);

  useEffect(() => {
    if (!depDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (depDropdownRef.current && !depDropdownRef.current.contains(e.target as Node)) {
        setDepDropdownOpen(false);
        setDepSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [depDropdownOpen]);

  const descendants = collectDescendants(goal.id, goals);

  // 候选父节点：排除自身、已选、后代
  const parentCandidates = Object.values(goals).filter(g =>
    g.id !== goal.id && !parentIds.includes(g.id) && !descendants.has(g.id)
  );

  const filteredCandidates = parentSearch.trim()
    ? parentCandidates.filter(g => g.title.toLowerCase().includes(parentSearch.trim().toLowerCase()))
    : parentCandidates;

  const handleAddParent = (id: string) => {
    setParentIds(prev => [...prev, id]);
    setParentSearch('');
    setParentDropdownOpen(false);
  };

  const handleRemoveParent = (id: string) => setParentIds(prev => prev.filter(p => p !== id));

  const depCandidates = Object.values(goals).filter(g =>
    g.id !== goal.id && !depIds.includes(g.id) && !descendants.has(g.id)
  );
  const filteredDepCandidates = depSearch.trim()
    ? depCandidates.filter(g => g.title.toLowerCase().includes(depSearch.trim().toLowerCase()))
    : depCandidates;

  const handleAddDep = (id: string) => {
    setDepIds(prev => [...prev, id]);
    setDepSearch('');
    setDepDropdownOpen(false);
  };

  const handleRemoveDep = (id: string) => setDepIds(prev => prev.filter(d => d !== id));

  const form = useForm<GoalDetailFormValues>({ resolver: zodResolver(goalDetailSchema), defaultValues: mapGoalToForm(goal) });

  useEffect(() => { form.reset(mapGoalToForm(goal)); }, [goal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const bgValue = form.watch('background');
  const scValue = form.watch('success_criteria');
  const bgRef = useRef<HTMLTextAreaElement | null>(null);
  const scRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [bgValue]);

  useEffect(() => {
    const el = scRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [scValue]);

  const { isDirty } = form.formState;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const isExtrasDirty =
    depIds.length !== (goal.dependencies ?? []).length ||
    depIds.some((id, i) => id !== (goal.dependencies ?? [])[i]) ||
    parentIds.length !== (goal.parent_ids ?? []).length ||
    parentIds.some((id, i) => id !== (goal.parent_ids ?? [])[i]);

  const onSubmit = async (values: GoalDetailFormValues) => {
    setSaving(true);
    try {
      await api.updateGoal(goal.id, { ...values, parent_ids: parentIds, dependencies: depIds });
      form.reset(values);
      onSaved();
    }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const childCount = Object.values(goals).filter((g) => g.parent_ids?.includes(goal.id)).length;
    const msg = childCount > 0 ? `删除"${goal.title}"及其 ${childCount} 个子目标？此操作不可撤销。` : `删除"${goal.title}"？此操作不可撤销。`;
    if (!window.confirm(msg)) return;
    await api.deleteGoal(goal.id); onDeleted();
  };
  const handleContext = async () => { const data = await api.getContext(goal.id); setContextText(data.markdown); };

  const { errors } = form.formState;
  const { ref: bgFormRef, ...bgRest } = form.register('background');
  const { ref: scFormRef, ...scRest } = form.register('success_criteria');

  return (
    <>
      <FormProvider {...form}>
        <form className="detail-form" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
            <div className="field-group">
              <label className="field-label">
                标题
                <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--color-text-muted, #888)', fontSize: '0.85em' }}>#{goal.id}</span>
              </label>
              <input {...form.register('title')} type="text" />
              {errors.title && <span className="field-error">{errors.title.message}</span>}
            </div>
          </div>
          <div className="form-section">
            <h2>背景问题</h2>
            <textarea {...bgRest} ref={(el) => { bgFormRef(el); bgRef.current = el; }} maxLength={GOAL_FIELD_LIMITS.background} placeholder={GOAL_FIELD_GUIDANCE.background} style={{ resize: 'none', overflow: 'hidden', minHeight: '72px' }} />
            <div className="field-hint">{GOAL_FIELD_GUIDANCE.background}</div>
            {errors.background && <span className="field-error">{errors.background.message}</span>}
          </div>
          <div className="form-section">
            <h2>成功标准</h2>
            <textarea {...scRest} ref={(el) => { scFormRef(el); scRef.current = el; }} maxLength={GOAL_FIELD_LIMITS.successCriteria} placeholder={GOAL_FIELD_GUIDANCE.successCriteria} style={{ resize: 'none', overflow: 'hidden', minHeight: '72px' }} />
            <div className="field-hint">{GOAL_FIELD_GUIDANCE.successCriteria}</div>
            {errors.success_criteria && <span className="field-error">{errors.success_criteria.message}</span>}
          </div>
          <div className="form-section">
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">状态</label>
                <select {...form.register('status')}>
                  {Object.entries(statusLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">成本（1–10）</label>
                <Controller control={form.control} name="cost" render={({ field }) => (
                  <input type="number" min={1} max={10} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                )} />
                {errors.cost && <span className="field-error">{errors.cost.message}</span>}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="field-group">
                <label className="field-label">截止日期</label>
                <Controller control={form.control} name="ddl" render={({ field }) => (
                  <input type="date" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} />
                )} />
              </div>
            </div>
          </div>
          <div className="form-section">
            <h2>依赖项</h2>
            {depIds.length > 0 && (
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {depIds.map((id) => {
                  const dep = goals[id];
                  return (
                    <span key={id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {dep ? dep.title : id}
                      <button type="button" onClick={() => handleRemoveDep(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', lineHeight: 1 }} title="移除">×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div ref={depDropdownRef} style={{ position: 'relative', width: 'fit-content' }}>
              <button type="button" onClick={() => { setDepDropdownOpen(o => !o); setDepSearch(''); }}>
                关联依赖目标
              </button>
              {depDropdownOpen && (
                <div className="parent-dropdown">
                  <input
                    autoFocus
                    type="text"
                    placeholder="搜索目标标题…"
                    value={depSearch}
                    onChange={(e) => setDepSearch(e.target.value)}
                    className="parent-dropdown-search"
                  />
                  <ul className="parent-dropdown-list">
                    {filteredDepCandidates.length === 0 ? (
                      <li className="parent-dropdown-empty">无匹配目标</li>
                    ) : (
                      filteredDepCandidates.map(g => (
                        <li key={g.id} className="parent-dropdown-item" onClick={() => handleAddDep(g.id)}>
                          {goalLabel(g, goals)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="form-section">
            <h2>父节点</h2>
            {parentIds.length > 0 && (
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {parentIds.map((id) => {
                  const p = goals[id];
                  return (
                    <span key={id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {p ? goalLabel(p, goals) : id}
                      <button type="button" onClick={() => handleRemoveParent(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', lineHeight: 1 }} title="移除">×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div ref={dropdownRef} style={{ position: 'relative', width: 'fit-content' }}>
              <button type="button" onClick={() => { setParentDropdownOpen(o => !o); setParentSearch(''); }}>
                关联父目标
              </button>
              {parentDropdownOpen && (
                <div className="parent-dropdown">
                  <input
                    autoFocus
                    type="text"
                    placeholder="搜索目标标题…"
                    value={parentSearch}
                    onChange={(e) => setParentSearch(e.target.value)}
                    className="parent-dropdown-search"
                  />
                  <ul className="parent-dropdown-list">
                    {filteredCandidates.length === 0 ? (
                      <li className="parent-dropdown-empty">无匹配目标</li>
                    ) : (
                      filteredCandidates.map(g => (
                        <li key={g.id} className="parent-dropdown-item" onClick={() => handleAddParent(g.id)}>
                          {goalLabel(g, goals)}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="form-section">
            <h2>备注</h2>
            <NotesEditor />
          </div>
          <div className="action-bar">
            <div className="btn-group">
              <button type="button" onClick={handleContext}>上下文包</button>
              <button type="button" onClick={onAddChild}>添加子目标</button>
            </div>
            <div className="btn-group" style={{ marginLeft: 'auto' }}>
              <button type="button" className="danger" onClick={handleDelete}>删除</button>
              <button type="submit" className="primary" disabled={saving || (!isDirty && !isExtrasDirty)}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
        <div style={{ padding: '0 18px 24px' }}>
          <AttemptsTable goalId={goal.id} attempts={goal.attempts} onAttemptAdded={onSaved} />
        </div>
      </FormProvider>
      {contextText !== null && (
        <div className="modal-overlay" onClick={() => { setContextText(null); setCopied(false); }}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0, fontSize: 15 }}>上下文包</h2>
              <button type="button" onClick={() => {
                navigator.clipboard.writeText(contextText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}>{copied ? '已复制 ✓' : '复制'}</button>
            </div>
            <div className="md-body">
              <ReactMarkdown>{contextText}</ReactMarkdown>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => { setContextText(null); setCopied(false); }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
