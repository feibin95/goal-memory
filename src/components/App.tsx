'use client';
import { useEffect, useRef, useState } from 'react';
import { GraphPane } from './GraphPane';
import { DetailPane } from './DetailPane';
import { ToastProvider } from './Toast';
import { api } from '@/lib/api';
import { GOAL_FIELD_GUIDANCE, GOAL_FIELD_LIMITS } from '@/lib/core/field-policy';
import type { AppState, GoalDetail } from '@/types';

interface NewRootForm {
  title: string; background: string; success_criteria: string; cost: number; ddl: string;
}

export default function App() {
  const [state, setState] = useState<AppState>({ goals: {} });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newRootModal, setNewRootModal] = useState(false);
  const [newRootForm, setNewRootForm] = useState<NewRootForm>({ title: '', background: '', success_criteria: '', cost: 3, ddl: '' });
  const [newRootError, setNewRootError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('goal-collapsed-ids');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const formDirtyRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('goal-collapsed-ids', JSON.stringify([...collapsedIds]));
  }, [collapsedIds]);

  const handleToggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const loadSelectedGoal = async (id: string) => {
    try {
      const goal = await api.getGoal(id);
      setSelectedGoal(goal);
    } catch (e) {
      console.error('loadSelectedGoal failed:', e);
      setSelectedId(null);
      setSelectedGoal(null);
      loadState();
    }
  };

  const closeDetail = () => {
    if (formDirtyRef.current && !window.confirm('表单有未保存的修改，关闭将丢失这些内容，确认继续？')) return;
    formDirtyRef.current = false;
    setSelectedId(null);
    setSelectedGoal(null);
  };

  const handleSelectGoal = (id: string) => {
    if (formDirtyRef.current && !window.confirm('表单有未保存的修改，切换目标将丢失这些内容，确认继续？')) return;
    formDirtyRef.current = false;
    setSelectedId(id);
    loadSelectedGoal(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasNewRootContent = newRootForm.title !== '' || newRootForm.background !== '' || newRootForm.success_criteria !== '';
  const closeNewRootModal = () => {
    if (hasNewRootContent && !window.confirm('已填写的内容将丢失，确认关闭？')) return;
    setNewRootModal(false);
    setNewRootForm({ title: '', background: '', success_criteria: '', cost: 3, ddl: '' });
  };

  const loadState = async () => {
    try {
      const data = await api.getState();
      setState({ goals: data.goals });
      if (selectedId && data.goals[selectedId]) {
        loadSelectedGoal(selectedId);
      } else if (selectedId && !data.goals[selectedId]) {
        setSelectedId(null);
        setSelectedGoal(null);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadState(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewRoot = async () => {
    if (!newRootForm.title || !newRootForm.background) return;
    setSubmitting(true); setNewRootError(null);
    try {
      const goal = await api.createGoal({ title: newRootForm.title, background: newRootForm.background, success_criteria: newRootForm.success_criteria, cost: newRootForm.cost, ddl: newRootForm.ddl || null });
      setNewRootModal(false);
      setNewRootForm({ title: '', background: '', success_criteria: '', cost: 3, ddl: '' });
      await loadState();
      setSelectedId(goal.id);
      await loadSelectedGoal(goal.id);
    } catch (e) { setNewRootError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <strong>Goal Memory</strong>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={loadState} disabled={loading}>刷新</button>
          <button type="button" className="primary" onClick={() => setNewRootModal(true)}>新建根目标</button>
        </div>
      </header>
      <main className="workspace">
        <GraphPane goals={state.goals} selectedId={selectedId} collapsedIds={collapsedIds} onSelect={handleSelectGoal} onToggleCollapse={handleToggleCollapse} onClickBackground={closeDetail} />
        {selectedGoal && (
          <DetailPane goal={selectedGoal} goals={state.goals} onRefresh={loadState}
            onClose={closeDetail}
            onGoalDeleted={() => { closeDetail(); loadState(); }}
            onDirtyChange={(dirty) => { formDirtyRef.current = dirty; }} />
        )}
      </main>
      {newRootModal && (
        <div className="modal-overlay" onClick={closeNewRootModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">新建根目标</h2>
            <div className="modal-body">
              <label>标题 *<input type="text" maxLength={GOAL_FIELD_LIMITS.title} value={newRootForm.title} onChange={(e) => setNewRootForm({ ...newRootForm, title: e.target.value })} required /></label>
              <label>背景问题 *<textarea rows={3} maxLength={GOAL_FIELD_LIMITS.background} placeholder={GOAL_FIELD_GUIDANCE.background} value={newRootForm.background} onChange={(e) => setNewRootForm({ ...newRootForm, background: e.target.value })} required /></label>
              <label>成功标准<input type="text" maxLength={GOAL_FIELD_LIMITS.successCriteria} placeholder={GOAL_FIELD_GUIDANCE.successCriteria} value={newRootForm.success_criteria} onChange={(e) => setNewRootForm({ ...newRootForm, success_criteria: e.target.value })} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>成本<input type="number" min={1} max={10} value={newRootForm.cost} onChange={(e) => setNewRootForm({ ...newRootForm, cost: Number(e.target.value) })} /></label>
                <label>截止日期<input type="date" value={newRootForm.ddl} onChange={(e) => setNewRootForm({ ...newRootForm, ddl: e.target.value })} /></label>
              </div>
              {newRootError && <span className="field-error">{newRootError}</span>}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeNewRootModal}>取消</button>
              <button type="button" className="primary" disabled={submitting || !newRootForm.title || !newRootForm.background} onClick={handleNewRoot}>
                {submitting ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastProvider />
    </>
  );
}
