import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { type Conversation } from '../../services/chatApi';
import { patchWOInBubble } from '../../services/woSync';

type WizardStep = 'PHOTOS_REPAIR' | 'PHOTOS_DAMAGED' | 'PHOTOS_SPRINKLER' | 'EXTRA_AND_NOTES' | 'COMPLETED';

interface WOWizardProps {
  conversation: Conversation;
  onAttachPhoto: (tag: string) => void;
  onClose: () => void;
}

export function WOWizard({ conversation, onAttachPhoto, onClose }: WOWizardProps) {
  const [step, setStep] = useState<WizardStep>('PHOTOS_REPAIR');
  const [notes, setNotes] = useState('');
  const [woData, setWoData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Load the current WO status from DB
  useEffect(() => {
    async function load() {
      if (!conversation.wo_id) return;
      const { data } = await supabase
        .from('work_orders')
        .select('*')
        .eq('id', conversation.wo_id)
        .single();
        
      if (data) {
        setWoData(data);
        setNotes(data.notes_extra || '');
        if (data.status === 'COMPLETED') {
          setStep('COMPLETED');
        }
      }
    }
    load();
  }, [conversation.wo_id]);

  async function updateStatus(newStatus: string) {
    if (!woData) return;
    await supabase.from('work_orders').update({ status: newStatus }).eq('id', woData.id);
    setWoData({ ...woData, status: newStatus });
  }

  async function handleNextStep(next: WizardStep) {
    // If it's the first interaction, move to IN PROGRESS
    if (woData?.status === 'PENDING') {
      await updateStatus('IN PROGRESS');
    }
    setStep(next);
  }

  async function handleSave() {
    if (!woData) return;
    setSaving(true);
    try {
      // 1. Atualizar Supabase
      await supabase
        .from('work_orders')
        .update({ 
          status: 'COMPLETED',
          notes_extra: notes 
        })
        .eq('id', woData.id);

      // 2. Disparar PATCH para o Bubble
      await patchWOInBubble(woData.bubble_id, {
        status: 'COMPLETED',
        notes_extra: notes,
      });

      setStep('COMPLETED');
    } catch (err) {
      console.error('Erro ao salvar WO:', err);
    } finally {
      setSaving(false);
      onClose(); // Retorna para a lista se preferir, ou apenas esconde
    }
  }

  if (step === 'COMPLETED' || woData?.status === 'COMPLETED') {
    return (
      <div className="bg-green-50 p-4 border-t border-green-200 text-center text-green-800 font-medium">
        🎉 This Work Order is Completed.
      </div>
    );
  }

  return (
    <div className="bg-white border-t border-gray-200 p-4 flex flex-col gap-3 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
      
      {/* HEADER INDICATOR */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          WO Steps
        </span>
        <div className="flex gap-1">
          <div className={`h-1.5 w-6 rounded-full ${step === 'PHOTOS_REPAIR' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1.5 w-6 rounded-full ${step === 'PHOTOS_DAMAGED' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1.5 w-6 rounded-full ${step === 'PHOTOS_SPRINKLER' ? 'bg-blue-600' : 'bg-gray-200'}`} />
          <div className={`h-1.5 w-6 rounded-full ${step === 'EXTRA_AND_NOTES' ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>

      {/* STEP 1: REPAIR */}
      {step === 'PHOTOS_REPAIR' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-800">1. Repair Photos</p>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                if (woData?.status === 'PENDING') updateStatus('IN PROGRESS');
                onAttachPhoto('[REPAIR]');
              }}
              className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Add Photo
            </button>
            <button 
              onClick={() => handleNextStep('PHOTOS_DAMAGED')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Next / No Repair
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DAMAGED */}
      {step === 'PHOTOS_DAMAGED' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-800">2. Damaged Photos</p>
          <div className="flex gap-2">
            <button 
              onClick={() => onAttachPhoto('[DAMAGED]')}
              className="flex-1 bg-orange-100 hover:bg-orange-200 text-orange-700 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Add Photo
            </button>
            <button 
              onClick={() => handleNextStep('PHOTOS_SPRINKLER')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Next / No Damaged
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: SPRINKLER */}
      {step === 'PHOTOS_SPRINKLER' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-800">3. Sprinkler Photos</p>
          <div className="flex gap-2">
            <button 
              onClick={() => onAttachPhoto('[SPRINKLER]')}
              className="flex-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-700 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Add Photo
            </button>
            <button 
              onClick={() => handleNextStep('EXTRA_AND_NOTES')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Next / No Sprinkler
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: EXTRA AND NOTES */}
      {step === 'EXTRA_AND_NOTES' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-800">4. Extra & Finish</p>
          
          <button 
            onClick={() => onAttachPhoto('[EXTRA]')}
            className="w-full bg-purple-100 hover:bg-purple-200 text-purple-700 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Add Extra Photo
          </button>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alguma anotação extra? (opcional)"
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
          />

          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'SAVE & COMPLETE WO'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
