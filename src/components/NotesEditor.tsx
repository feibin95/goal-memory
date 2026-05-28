'use client';
import { useFormContext, useWatch } from 'react-hook-form';
import { GOAL_FIELD_GUIDANCE, GOAL_FIELD_LIMITS } from '@/lib/core/field-policy';
import type { GoalDetailFormValues } from '@/types';

export function NotesEditor() {
  const { formState, register, setValue } = useFormContext<GoalDetailFormValues>();
  const notes = (useWatch<GoalDetailFormValues>({ name: 'notes' }) as string[]) ?? [];

  const append = () => setValue('notes', [...notes, '']);
  const remove = (index: number) => setValue('notes', notes.filter((_, i) => i !== index));

  return (
    <div>
      <div className="notes-list">
        {notes.map((_note, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="note-row">
            <input {...register(`notes.${index}`)} type="text" maxLength={GOAL_FIELD_LIMITS.note} placeholder={GOAL_FIELD_GUIDANCE.note} />
            <button type="button" className="note-delete-btn" onClick={() => remove(index)} title="删除">×</button>
            {formState.errors.notes?.[index] && <span className="field-error">{formState.errors.notes[index]?.message}</span>}
          </div>
        ))}
      </div>
      <button type="button" className="add-note-btn" onClick={append}>+ 添加备注</button>
    </div>
  );
}
