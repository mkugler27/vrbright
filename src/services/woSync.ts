import { supabase } from './supabase';
import { API_BASE_URL, BUBBLE_TOKEN } from '../config/api';


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
