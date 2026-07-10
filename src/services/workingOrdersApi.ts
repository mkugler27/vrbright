import { supabase } from './supabase';
export interface WorkOrderRow {
  _id: string;
  codigo_id?: string | number;
  tipo_JOB?: string;
  apt?: string;
  data?: string;
  data_inicio?: string;
  status?: string;
  prioridade?: boolean | string;
  liberado_para_pintor?: boolean;
  deletado?: boolean;
  esconder_complain_calendario?: boolean;
  qual_condo?: string; // property bubble _id
  qual_pintor?: string; // user bubble _id
  qual_condo_txt?: string;
  qual_condo_txt_nick?: string;
  qual_pintor_txt?: string;
  qual_pintor_nick_txt?: string;
  worker_email?: string; // email do worker (link com Supabase users.email)
  sincronizar?: boolean; // flag para sincronização Supabase -> Bubble
  invoice_code?: string;
}

export interface FetchTodayWOOptions {
  workerEmail: string;
}


export async function fetchTodayWO(opts: FetchTodayWOOptions): Promise<WorkOrderRow[]> {
  const { workerEmail } = opts;

  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .eq('worker_email', workerEmail)
    .neq('status', 'COMPLETED');

  if (error) {
    throw new Error(`Fetch WO failed from Supabase: ${error.message}`);
  }

  // Mapeia do formato do Supabase para WorkOrderRow
  return data.map((d: any) => {
    // raw_data pode ser string ou objeto, dependendo de como é salvo
    const raw = typeof d.raw_data === 'string' ? JSON.parse(d.raw_data) : (d.raw_data || {});
    
    return {
      _id: d.bubble_id || raw._id || d.id,
      codigo_id: d.codigo_id || raw.codigo_id,
      tipo_JOB: raw.tipo_JOB,
      apt: raw.apt,
      data: raw.data,
      data_inicio: raw.data_inicio,
      status: d.status || raw.status,
      prioridade: raw.prioridade,
      liberado_para_pintor: raw.liberado_para_pintor,
      deletado: raw.deletado,
      esconder_complain_calendario: raw.esconder_complain_calendario,
      qual_condo: raw.qual_condo,
      qual_pintor: raw.qual_pintor,
      qual_condo_txt: raw.qual_condo_txt,
      qual_condo_txt_nick: raw.qual_condo_txt_nick,
      qual_pintor_txt: raw.qual_pintor_txt,
      qual_pintor_nick_txt: raw.qual_pintor_nick_txt,
      worker_email: d.worker_email || raw.worker_email,
      sincronizar: raw.sincronizar,
      invoice_code: d.invoice_code || raw.invoice_code,
    };
  });
}
