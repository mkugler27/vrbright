import { API_BASE_URL, BUBBLE_TOKEN } from '../config/api';


/**
 * Função utilitária para atualizar o status da WO via webhook no Bubble
 */
export async function patchWOInBubble(bubbleId: string, data: Record<string, any>) {
  try {
    const webhookUrl = 'https://vrbcrmsystem.bubbleapps.io/version-test/api/1.1/wf/wo_update';
    
    // Prepara o payload conforme as chaves esperadas pelo webhook
    const payload: Record<string, any> = {
      wo: bubbleId,
      status: data.status,
    };

    if (data.notes_extra !== undefined) {
      payload.extra_notes = data.notes_extra;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BUBBLE_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[WO Sync] Erro ao chamar webhook no Bubble (${bubbleId}):`, response.statusText);
      return false;
    }
    
    console.log(`[WO Sync] Webhook do Bubble disparado com sucesso (${bubbleId})!`, payload);
    return true;
  } catch (err) {
    console.error(`[WO Sync] Erro de rede ao chamar webhook no Bubble (${bubbleId}):`, err);
    return false;
  }
}
