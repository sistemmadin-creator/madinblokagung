import { supabase } from '../../lib/supabase.js';

let currentUser = {
  username: 'admin',
  nama: 'Master Administrator',
  role: 'Master Admin'
};

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getCurrentUser() {
  return currentUser;
}

export async function logActivity(aktivitas, detail) {
  if (!supabase) return;
  try {
    await supabase.from('activity_logs').insert([{
      username: currentUser?.username || 'System',
      nama: currentUser?.nama || 'Administrator',
      aktivitas,
      detail: detail || '-'
    }]);
  } catch (err) {
    console.error('Gagal mencatat activity_logs:', err.message);
  }
}

export async function loadAuditLogs() {
  const tbody = document.getElementById('tbodyAuditLogs');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3"><span class="spinner-border spinner-border-sm me-1"></span> Mengambil riwayat aktivitas dari Supabase...</td></tr>';

  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-danger">Supabase belum terhubung.</td></tr>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">Belum ada aktivitas tercatat.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => {
      const waktuWIB = item.created_at
        ? new Date(item.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        : '-';
      return `
        <tr>
          <td class="text-nowrap text-secondary">${escHtml(waktuWIB)}</td>
          <td class="fw-bold">${escHtml(item.username || '-')}</td>
          <td>${escHtml(item.nama || '-')}</td>
          <td><span class="badge bg-secondary">${escHtml(item.aktivitas || '-')}</span></td>
          <td><small>${escHtml(item.detail || '-')}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Gagal memuat log: ${err.message}</td></tr>`;
  }
}
