import { supabase } from './supabase';
import { API_BASE_URL, BUBBLE_TOKEN } from '../config/api';

export interface SyncWOOptions {
  workerEmail: string;
}

/**
 * 1. Puxa do Bubble apenas WOs com `sincronizar = true`.
 * 2. Salva na tabela `work_orders` do Supabase.
 * 3. Cria um `chat` exclusivo para essa WO se não existir.
 * 4. Faz o PATCH pro Bubble alterando `sincronizar = false`.
 */
export async function syncWorkingOrders({ workerEmail }: SyncWOOptions) {
  try {
    const constraints = JSON.stringify([
      { key: 'worker_email', constraint_type: 'equals', value: workerEmail },
      { key: 'sincronizar', constraint_type: 'equals', value: true },
      { key: 'deletado', constraint_type: 'equals', value: false },
      { key: 'status', constraint_type: 'not equal', value: 'COMPLETED' },
    ]);

    const params = new URLSearchParams({
      constraints,
      limit: '50',
    });

    // 1. PULL DO BUBBLE
    const url = `${API_BASE_URL}/obj/workingorders?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BUBBLE_TOKEN}`,
      },
    });

    if (!res.ok) {
      console.error('[WO Sync] Bubble GET failed:', res.statusText);
      return;
    }

    const json = await res.json();
    const results = json.response?.results || [];

    if (results.length === 0) {
      console.log('[WO Sync] Nenhuma WO nova para sincronizar.');
      return;
    }

    console.log(`[WO Sync] Encontradas ${results.length} WOs para sincronizar.`);

    for (const r of results) {
      // 2. SALVAR NO SUPABASE
      const bubbleId = r._id;
      const { data: woData, error: woError } = await supabase
        .from('work_orders')
        .upsert({
          bubble_id: bubbleId,
          worker_email: workerEmail,
          status: r.status || 'PENDING',
          codigo_id: r.codigo_id?.toString() || '',
          raw_data: r,
        }, { onConflict: 'bubble_id' })
        .select()
        .single();

      if (woError || !woData) {
        console.error('[WO Sync] Erro ao salvar WO no Supabase:', woError);
        continue;
      }

      // 3. CRIAR CONVERSA (CHAT DA WO)
      // Checar se já existe a conversa pra essa WO
      const { data: convData } = await supabase
        .from('conversations')
        .select('id')
        .eq('wo_id', woData.id)
        .single();

      if (!convData) {
        // Criar nova conversa
        const { error: convError } = await supabase
          .from('conversations')
          .insert({
            tipo: 'wo',
            nome: `WO ${woData.codigo_id}`,
            wo_id: woData.id
          });

        if (convError) {
          console.error('[WO Sync] Erro ao criar conversa da WO:', convError);
        }
      }

      // 4. AVISAR O BUBBLE QUE FOI SINCRONIZADO (PATCH)
      await patchWOInBubble(bubbleId, { sincronizar: false });
    }

  } catch (error) {
    console.error('[WO Sync] Erro fatal na sincronização:', error);
  }
}

/**
 * Função utilitária para fazer PATCH em uma WO no Bubble
 */
export async function patchWOInBubble(bubbleId: string, data: Record<string, any>) {
  try {
    const patchUrl = `${API_BASE_URL}/obj/workingorders/${bubbleId}`;
    const response = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BUBBLE_TOKEN}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[WO Sync] Erro ao fazer PATCH no Bubble (${bubbleId}):`, response.statusText);
      return false;
    }
    
    console.log(`[WO Sync] Bubble atualizado com sucesso (${bubbleId})!`, data);
    return true;
  } catch (err) {
    console.error(`[WO Sync] Erro de rede ao fazer PATCH no Bubble (${bubbleId}):`, err);
    return false;
  }
}
