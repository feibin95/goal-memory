'use client';
import { useFormContext, useWatch } from 'react-hook-form';
import type { GoalDetailFormValues } from '@/lib/schema';

export function NotesEditor() {
  const { register, setValue } = useFormContext<GoalDetailFormValues>();
  const notes = (useWatch<GoalDetailFormValues>({ name: 'notes' }) as string[]) ?? [];

  const append = () => setValue('notes', [...notes, '']);
  const remove = (index: number) => setValue('notes', notes.filter((_, i) => i !== index));

  return (
    <div>
      <div className="notes-list">
        {notes.map((_note, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className="note-row">
            <input {...register(`notes.${index}`)} type="text" placeholder="备注内容" />
            <button type="button" className="note-delete-btn" onClick={() => remove(index)} title="删除">×</button>
          </div>
        ))}
      </div>
      <button type="button" className="add-note-btn" onClick={append}>+ 添加备注</button>
    </div>
  );
}
