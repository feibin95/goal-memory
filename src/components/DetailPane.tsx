'use client';
import { useState } from 'react';
import type { Goal, Attempt } from '@/types';
import { GoalDetailForm } from './GoalDetailForm';
import { api } from '@/lib/api';

interface Props {
  goal: Goal | null; goals: Record<string, Goal>; attempts: Attempt[];
  onRefresh: () => void; onGoalDeleted: () => void; onDirtyChange?: (dirty: boolean) => void;
}

interface NewGoalForm { title: string; background: string; successCriteria: string; cost: number; ddl: string; }

export function DetailPane({ goal, goals, attempts, onRefresh, onGoalDeleted, onDirtyChange }: Props) {
  const [addChildModal, setAddChildModal] = useState(false);
  const [addChildForm, setAddChildForm] = useState<NewGoalForm>({ title: '', background: '', successCriteria: '', cost: 3, ddl: '' });
  const [addChildDeps, setAddChildDeps] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAddChildContent = addChildForm.title !== '' || addChildForm.background !== '' || addChildForm.successCriteria !== '' || addChildDeps !== '';
  const closeAddChildModal = () => {
    if (hasAddChildContent && !window.confirm('已填写的内容将丢失，确认关闭？')) return;
    setAddChildModal(false);
    setAddChildForm({ title: '', background: '', successCriteria: '', cost: 3, ddl: '' });
    setAddChildDeps('');
  };

  const handleAddChild = async () => {
    if (!goal) return;
    setSubmitting(true); setError(null);
    try {
      await api.createGoal({ title: addChildForm.title, background: addChildForm.background, parentIds: [goal.id], successCriteria: addChildForm.successCriteria, cost: addChildForm.cost, ddl: addChildForm.ddl || null, dependencies: addChildDeps.split(',').map((s) => s.trim()).filter(Boolean) });
      setAddChildModal(false);
      setAddChildForm({ title: '', background: '', successCriteria: '', cost: 3, ddl: '' });
      setAddChildDeps('');
      onRefresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="detail-pane">
      <div className="pane-title"><span>已选目标</span></div>
      {!goal ? (
        <div className="empty">请选择一个目标查看详情。</div>
      ) : (
        <GoalDetailForm key={goal.id} goal={goal} goals={goals} attempts={attempts} onSaved={onRefresh} onDeleted={onGoalDeleted} onAddChild={() => setAddChildModal(true)} onDirtyChange={onDirtyChange} />
      )}
      {addChildModal && goal && (
        <div className="modal-overlay" onClick={closeAddChildModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">添加子目标 · {goal.title}</h2>
            <div className="modal-body">
              <label>标题 *<input type="text" value={addChildForm.title} onChange={(e) => setAddChildForm({ ...addChildForm, title: e.target.value })} required /></label>
              <label>背景问题 *<textarea rows={3} value={addChildForm.background} onChange={(e) => setAddChildForm({ ...addChildForm, background: e.target.value })} required /></label>
              <label>成功标准<input type="text" value={addChildForm.successCriteria} onChange={(e) => setAddChildForm({ ...addChildForm, successCriteria: e.target.value })} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>成本<input type="number" min={1} max={10} value={addChildForm.cost} onChange={(e) => setAddChildForm({ ...addChildForm, cost: Number(e.target.value) })} /></label>
                <label>截止日期<input type="date" value={addChildForm.ddl} onChange={(e) => setAddChildForm({ ...addChildForm, ddl: e.target.value })} /></label>
              </div>
              <label>依赖项（逗号分隔 ID）<input type="text" value={addChildDeps} onChange={(e) => setAddChildDeps(e.target.value)} placeholder="id1, id2, ..." /></label>
              {error && <span className="field-error">{error}</span>}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeAddChildModal}>取消</button>
              <button type="button" className="primary" disabled={submitting || !addChildForm.title || !addChildForm.background} onClick={handleAddChild}>
                {submitting ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
