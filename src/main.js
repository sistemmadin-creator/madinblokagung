import { createClient } from '@supabase/supabase-js';

// =========================================================
// 1. INISIALISASI CLIENT SUPABASE DARI ENVIRONMENT VARIABLES
// =========================================================
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// =========================================================
// 2. STATE GLOBAL & KONFIGURASI KOLOM
// =========================================================
let dataTable = null;
let dataTableAsatidz = null; // >>> BARU: instance DataTable untuk Asatidz
const API_WILAYAH = 'https://www.emsifa.com/api-wilayah-indonesia/api';
let tree1Data = {}, tree2Data = {}, tree3Data = {};
let isEditMode = false;
let isEditModeAsatidz = false; // >>> BARU
let selectedRowData = []; // Menyimpan 35 elemen baris santri yang sedang dibuka di #detailModal
let selectedRowDataAsatidz = null; // >>> BARU: object row asatidz terpilih
let globalDataSantri = []; // Menyimpan array 2D [35 kolom] seluruh santri di memori
let globalDataAsatidz = []; // >>> BARU: array object row Asatidz dari Supabase
let hiddenColumnsGlobal = [];
let hiddenColumnsGlobalAsatidz = []; // >>> BARU
let globalDataFormasi = []; // Menyimpan state master Formasi Kelas

// >>> BARU: Urutan field tabel `asatidz` di Supabase
const ASATIDZ_DB_FIELDS = [
  'nis', 'nia', 'nama_asatidz', 'pa_pi',
  'tempat_lahir', 'tgl_lahir', 'bln_lahir', 'thn_lahir',
  'dusun', 'desa', 'kecamatan', 'kabupaten', 'provinsi',
  'blok', 'asrama', 'kode', 'kamar',
  'tingkat_asatidz', 'din_kls_asatidz', 'din_bag_asatidz',
  'jah_asatidz', 'lokasi_diniyyah', 'lokasi_takror', 'foto_asatidz'
];

// >>> BARU: Kategori Filter Lanjutan Asatidz
const filterCategoriesAsatidz = [
  { name: 'PA/PI', col: 5, field: 'pa_pi' },
  { name: 'Kelas Diniyyah', col: 6, field: null },
  { name: 'Blok', col: 7, field: 'blok' },
  { name: 'Jah', col: 9, field: 'jah_asatidz' }
];
let appSettingsGlobal = {
  tree1: '',
  tree2: ''
};

let currentUser = {
  username: 'admin',
  nama: 'Master Administrator',
  role: 'Master Admin'
};

// 16 Kategori Filter Lanjutan sesuai indeks kolom DataTables
const filterCategories = [
  { name: 'PA/PI', col: 5 },
  { name: 'Tempat Lahir', col: 7 },
  { name: 'Dusun', col: 11 },
  { name: 'Desa', col: 12 },
  { name: 'Kecamatan', col: 13 },
  { name: 'Kabupaten', col: 14 },
  { name: 'Provinsi', col: 15 },
  { name: 'Blok', col: 16 },
  { name: 'Asrama', col: 17 },
  { name: 'Kode', col: 18 },
  { name: 'Unit', col: 24 },
  { name: 'Jurusan', col: 23 },
  { name: 'Semester', col: 22 },
  { name: 'Tingkat', col: 27 },
  { name: 'Din.Bag', col: 26 },
  { name: 'ORDA', col: 28 }
];

// Urutan 34 field database tabel `santri` (indeks 1..34 pada array baris)
const SANTRI_DB_FIELDS = [
  'no_induk',     // [1]
  'no_biro',      // [2]
  'nisn',         // [3]
  'pa_pi',        // [4]
  'nama',         // [5]
  'tempat_lahir', // [6]
  'tgl_lahir',    // [7]
  'bln_lahir',    // [8]
  'thn_lahir',    // [9]
  'dusun',        // [10]
  'desa',         // [11]
  'kecamatan',    // [12]
  'kabupaten',    // [13]
  'provinsi',     // [14]
  'blok',         // [15]
  'asrama',       // [16]
  'kode',         // [17]
  'kamar',        // [18]
  'kelas',        // [19]
  'bag',          // [20]
  'semester',     // [21]
  'jurusan',      // [22]
  'unit',         // [23]
  'din_kls',      // [24]
  'din_bag',      // [25]
  'tingkat',      // [26]
  'orda',         // [27]
  'nik',          // [28]
  'no_kk',        // [29]
'nama_ayah',    // [30]
  'nik_ayah',     // [31]
  'nama_ibu',     // [32]
  'nik_ibu',      // [33]
  'telepon',      // [34]
  'foto'          // [35]
];

// Konversi row object dari Supabase menjadi array 36 elemen (indeks 0 kosong, 1..35 data)
function dbRowToArray(obj) {
  return [
    '',
    obj.no_induk || '',
    obj.no_biro || '',
    obj.nisn || '',
    obj.pa_pi || '',
    obj.nama || '',
    obj.tempat_lahir || '',
    obj.tgl_lahir || '',
    obj.bln_lahir || '',
    obj.thn_lahir || '',
    obj.dusun || '',
    obj.desa || '',
    obj.kecamatan || '',
    obj.kabupaten || '',
    obj.provinsi || '',
    obj.blok || '',
    obj.asrama || '',
    obj.kode || '',
    obj.kamar || '',
    obj.kelas || '',
    obj.bag || '',
    obj.semester || '',
    obj.jurusan || '',
    obj.unit || '',
    obj.din_kls || '',
    obj.din_bag || '',
    obj.tingkat || '',
    obj.orda || '',
    obj.nik || '',
    obj.no_kk || '',
    obj.nama_ayah || '',
    obj.nik_ayah || '',
    obj.nama_ibu || '',
    obj.nik_ibu || '',
    obj.telepon || '',
    obj.foto || ''
  ];
}

// =========================================================
// FITUR BARU: STRUCTURED UI BUILDER ACCORDION (V4 - COLLAPSIBLE)
// =========================================================

// 1. Fungsi Utama Penambah Baris (Accordion) - UKURAN LEBIH RAMPING & DEFAULT MENUTUP
window.addRuleRow = function(treeId, data = null) {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;

  const row = document.createElement('div');
  // Margin dikurangi menjadi mb-2
  row.className = 'card border border-secondary border-opacity-25 shadow-sm rule-row bg-white mb-2 overflow-hidden';
  const rowId = 'collapse_' + Date.now() + Math.floor(Math.random() * 1000);

  if (treeId === 'tree1') {
    let parentPath = (data && data.parentPath) ? data.parentPath : '';
    let type = (data && data.type) ? data.type : 'numeric';

    row.innerHTML = `
       <!-- Header Ramping (py-2 px-3) - Default Menutup (collapsed & aria-expanded="false") -->
       <div class="card-header bg-white py-2 px-3 rule-header-cursor d-flex justify-content-between align-items-center collapsed" data-bs-toggle="collapse" data-bs-target="#${rowId}" aria-expanded="false">
          <div class="text-truncate pe-3 fw-medium text-secondary rule-preview-text">
              <i class="bi bi-folder2-open me-2 text-success"></i> <span class="preview-content">Memuat aturan...</span>
          </div>
          <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="event.stopPropagation(); this.closest('.rule-row').remove()" title="Hapus Aturan"><i class="bi bi-trash"></i></button>
              <i class="bi bi-chevron-down rule-chevron text-muted ms-1"></i>
          </div>
       </div>
       <div id="${rowId}" class="collapse">
           <!-- Body Ramping (p-2) -->
           <div class="card-body bg-light border-top p-2">
               <div class="row g-2 align-items-center">
                  <div class="col-md-12 mb-1">
                     <label class="form-label small fw-bold text-primary mb-0">Rute Induk Pengelompokan</label>
                     <input type="text" class="form-control form-control-sm rule-parent font-monospace" placeholder="Contoh: Putra > Darussalam > A" value="${parentPath}" oninput="window.updateRulePreview(this)">
                  </div>
                  <div class="col-md-4">
                     <label class="form-label small text-muted mb-0">Tipe Hasil Ujung</label>
                     <select class="form-select form-select-sm rule-type border-secondary" onchange="window.toggleRuleType(this)">
                        <option value="numeric" ${type === 'numeric' ? 'selected' : ''}>Rentang Angka</option>
                        <option value="alpha" ${type === 'alpha' ? 'selected' : ''}>Rentang Abjad</option>
                        <option value="manual" ${type === 'manual' ? 'selected' : ''}>Teks Manual</option>
                     </select>
                  </div>
                  <div class="col-md-8 rule-inputs-container mt-auto"></div>
               </div>
           </div>
       </div>
    `;
    container.appendChild(row);
    window.toggleRuleType(row.querySelector('.rule-type'), data);

  } else if (treeId === 'tree2') {
    let unit = data?.unit || '';
    let jurusan = data?.jurusan || '';
    let semType = data?.semesterType || 'numeric';
    let kelType = data?.kelasType || 'roman';
    let bagType = data?.bagType || 'alpha';

    row.innerHTML = `
       <!-- Header Ramping (py-2 px-3) - Default Menutup (collapsed & aria-expanded="false") -->
       <div class="card-header bg-white py-2 px-3 rule-header-cursor d-flex justify-content-between align-items-center collapsed" data-bs-toggle="collapse" data-bs-target="#${rowId}" aria-expanded="false">
          <div class="text-truncate pe-3 fw-medium text-secondary rule-preview-text">
              <i class="bi bi-diagram-3 me-2 text-success"></i> <span class="preview-content">Memuat aturan...</span>
          </div>
          <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="event.stopPropagation(); this.closest('.rule-row').remove()" title="Hapus Aturan"><i class="bi bi-trash"></i></button>
              <i class="bi bi-chevron-down rule-chevron text-muted ms-1"></i>
          </div>
       </div>
       <div id="${rowId}" class="collapse">
           <!-- Body Ramping (p-2) -->
           <div class="card-body bg-light border-top p-2">
               <div class="row g-2 mb-2">
                   <div class="col-sm-4">
                       <label class="form-label small fw-bold text-primary mb-0">Unit</label>
                       <input type="text" class="form-control form-control-sm t2-unit font-monospace fw-bold" placeholder="Contoh: SMP" value="${unit}" oninput="window.updateRulePreview(this)">
                   </div>
                   <div class="col-sm-8">
                       <label class="form-label small fw-bold text-primary mb-0">Jurusan (Koma jika banyak)</label>
                       <input type="text" class="form-control form-control-sm t2-jurusan font-monospace" placeholder="MIPA, IPS (atau -)" value="${jurusan}" oninput="window.updateRulePreview(this)">
                   </div>
               </div>
               <div class="row g-2 mb-1 align-items-center bg-white p-1 rounded border shadow-sm mx-0">
                   <div class="col-sm-3"><label class="form-label small text-muted mb-0">Semester</label></div>
                   <div class="col-sm-4"><select class="form-select form-select-sm t2-sem-type" onchange="window.toggleT2(this, 'sem')"><option value="numeric" ${semType === 'numeric' ? 'selected' : ''}>Angka</option><option value="manual" ${semType === 'manual' ? 'selected' : ''}>Manual</option></select></div>
                   <div class="col-sm-5 t2-sem-container"></div>
               </div>
               <div class="row g-2 mb-1 align-items-center bg-white p-1 rounded border shadow-sm mx-0">
                   <div class="col-sm-3"><label class="form-label small text-muted mb-0">Kelas</label></div>
                   <div class="col-sm-4"><select class="form-select form-select-sm t2-kel-type" onchange="window.toggleT2(this, 'kel')"><option value="roman" ${kelType === 'roman' ? 'selected' : ''}>Romawi</option><option value="manual" ${kelType === 'manual' ? 'selected' : ''}>Manual</option></select></div>
                   <div class="col-sm-5 t2-kel-container"></div>
               </div>
               <div class="row g-2 align-items-center bg-white p-1 rounded border shadow-sm mx-0">
                   <div class="col-sm-3"><label class="form-label small text-muted mb-0">Bagian</label></div>
                   <div class="col-sm-4"><select class="form-select form-select-sm t2-bag-type" onchange="window.toggleT2(this, 'bag')"><option value="numeric" ${bagType === 'numeric' ? 'selected' : ''}>Angka</option><option value="alpha" ${bagType === 'alpha' ? 'selected' : ''}>Abjad</option><option value="manual" ${bagType === 'manual' ? 'selected' : ''}>Manual</option></select></div>
                   <div class="col-sm-5 t2-bag-container"></div>
               </div>
           </div>
       </div>
    `;
    container.appendChild(row);
    window.toggleT2(row.querySelector('.t2-sem-type'), 'sem', data);
    window.toggleT2(row.querySelector('.t2-kel-type'), 'kel', data);
    window.toggleT2(row.querySelector('.t2-bag-type'), 'bag', data);
  }
};

// FITUR BARU: FUNGSI PENCARIAN/FILTER REAL-TIME
window.filterRules = function(treeId, keyword) {
    const container = document.getElementById(`builder-${treeId}`);
    if (!container) return;
    
    const term = keyword.toLowerCase().trim();
    const rows = container.querySelectorAll('.rule-row');
    
    rows.forEach(row => {
        // Ambil teks dari preview content yang ada di header accordion
        const previewText = row.querySelector('.preview-content')?.innerText || '';
        
        // Cek apakah teks mengandung keyword yang diketik
        if (previewText.toLowerCase().includes(term)) {
            row.style.display = ''; // Tampilkan
        } else {
            row.style.display = 'none'; // Sembunyikan
        }
    });
};

// 2. Toggler Tree 1 (dengan penambahan oninput untuk Preview)
window.toggleRuleType = function(selectEl, data = null) {
  const container = selectEl.closest('.rule-row').querySelector('.rule-inputs-container');
  const type = selectEl.value;
  let numStart = (data && data.numStart !== undefined) ? data.numStart : 1; let numEnd = (data && data.numEnd !== undefined) ? data.numEnd : 10;
  let alphaStart = (data && data.alphaStart) ? data.alphaStart : 'A'; let alphaEnd = (data && data.alphaEnd) ? data.alphaEnd : 'E';
  let manualList = (data && data.manualList) ? data.manualList : '';

  if (type === 'numeric') {
      container.innerHTML = `<div class="row g-2"><div class="col-6"><label class="form-label small text-muted mb-1">Awal</label><input type="number" class="form-control form-control-sm rule-num-start" value="${numStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><label class="form-label small text-muted mb-1">Akhir</label><input type="number" class="form-control form-control-sm rule-num-end" value="${numEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
  } else if (type === 'alpha') {
      container.innerHTML = `<div class="row g-2"><div class="col-6"><label class="form-label small text-muted mb-1">Awal</label><input type="text" maxlength="1" class="form-control form-control-sm rule-alpha-start text-uppercase" value="${alphaStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><label class="form-label small text-muted mb-1">Akhir</label><input type="text" maxlength="1" class="form-control form-control-sm rule-alpha-end text-uppercase" value="${alphaEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
  } else {
      let safeManualList = String(manualList).replace(/"/g, '&quot;');
      container.innerHTML = `<div><label class="form-label small text-muted mb-1">Ketik Daftar Teks</label><input type="text" class="form-control form-control-sm rule-manual font-monospace" placeholder="Kamar Mandi, Gudang" value="${safeManualList}" oninput="window.updateRulePreview(this)"></div>`;
  }
  window.updateRulePreview(selectEl);
};

// 3. Toggler Tree 2 (dengan penambahan oninput untuk Preview)
window.toggleT2 = function(selectEl, level, data = null) {
  const container = selectEl.closest('.row').querySelector(`.t2-${level}-container`);
  const type = selectEl.value;
  
  if (level === 'sem') {
      let sStart = data?.semesterNumStart ?? 1; let sEnd = data?.semesterNumEnd ?? 2; let sMan = data?.semesterManual ?? '';
      if (type === 'numeric') {
          container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="number" class="form-control form-control-sm t2-sem-start" value="${sStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="number" class="form-control form-control-sm t2-sem-end" value="${sEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
      } else {
          container.innerHTML = `<input type="text" class="form-control form-control-sm t2-sem-manual" placeholder="Ganjil, Genap" value="${sMan}" oninput="window.updateRulePreview(this)">`;
      }
  } else if (level === 'kel') {
      let kStart = data?.kelasRomanStart ?? 'VII'; let kEnd = data?.kelasRomanEnd ?? 'IX'; let kMan = data?.kelasManual ?? '';
      const roms = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
      if (type === 'roman') {
          let optStart = roms.map(r => `<option value="${r}" ${r===kStart?'selected':''}>${r}</option>`).join('');
          let optEnd = roms.map(r => `<option value="${r}" ${r===kEnd?'selected':''}>${r}</option>`).join('');
          container.innerHTML = `<div class="row g-1"><div class="col-6"><select class="form-select form-select-sm t2-kel-start" onchange="window.updateRulePreview(this)">${optStart}</select></div><div class="col-6"><select class="form-select form-select-sm t2-kel-end" onchange="window.updateRulePreview(this)">${optEnd}</select></div></div>`;
      } else {
          container.innerHTML = `<input type="text" class="form-control form-control-sm t2-kel-manual" placeholder="Amtsilati, Takhasus" value="${kMan}" oninput="window.updateRulePreview(this)">`;
      }
  } else if (level === 'bag') {
      let bNumStart = data?.bagNumStart ?? 1; let bNumEnd = data?.bagNumEnd ?? 10;
      let bAlphaStart = data?.bagAlphaStart ?? 'A'; let bAlphaEnd = data?.bagAlphaEnd ?? 'E'; let bMan = data?.bagManual ?? '';
      if (type === 'numeric') {
          container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="number" class="form-control form-control-sm t2-bag-num-start" value="${bNumStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="number" class="form-control form-control-sm t2-bag-num-end" value="${bNumEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
      } else if (type === 'alpha') {
          container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="text" maxlength="1" class="form-control form-control-sm t2-bag-alpha-start text-uppercase" value="${bAlphaStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="text" maxlength="1" class="form-control form-control-sm t2-bag-alpha-end text-uppercase" value="${bAlphaEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
      } else {
          container.innerHTML = `<input type="text" class="form-control form-control-sm t2-bag-manual" placeholder="Khusus, Pagi" value="${bMan}" oninput="window.updateRulePreview(this)">`;
      }
  }
  window.updateRulePreview(selectEl);
};

// 4. Real-time Preview Updater
window.updateRulePreview = function(element) {
  const row = element.closest('.rule-row');
  if (!row) return;

  const previewEl = row.querySelector('.preview-content');
  const isTree2 = row.querySelector('.t2-unit') !== null;

  if (!isTree2) {
      // Logic Ekstrak Ringkasan Tree 1
      let parent = row.querySelector('.rule-parent')?.value || '<em class="text-danger">Rute Kosong</em>';
      let type = row.querySelector('.rule-type')?.value;
      let rangeTxt = '';

      if (type === 'numeric') {
          rangeTxt = `${row.querySelector('.rule-num-start')?.value || '?'} - ${row.querySelector('.rule-num-end')?.value || '?'}`;
      } else if (type === 'alpha') {
          rangeTxt = `${(row.querySelector('.rule-alpha-start')?.value || '?').toUpperCase()} - ${(row.querySelector('.rule-alpha-end')?.value || '?').toUpperCase()}`;
      } else {
          rangeTxt = 'Manual';
      }
      previewEl.innerHTML = `<span class="fw-bold text-dark">${parent}</span> <span class="badge bg-light text-dark border ms-1">[ ${rangeTxt} ]</span>`;
      
  } else {
      // Logic Ekstrak Ringkasan Tree 2
      let unit = row.querySelector('.t2-unit')?.value || '<em class="text-danger">Unit?</em>';
      
      let sType = row.querySelector('.t2-sem-type')?.value;
      let sTxt = sType === 'numeric' ? `${row.querySelector('.t2-sem-start')?.value || '?'} s/d ${row.querySelector('.t2-sem-end')?.value || '?'}` : 'Manual';
      
      let kType = row.querySelector('.t2-kel-type')?.value;
      let kTxt = kType === 'roman' ? `${row.querySelector('.t2-kel-start')?.value || '?'} s/d ${row.querySelector('.t2-kel-end')?.value || '?'}` : 'Manual';
      
      previewEl.innerHTML = `<span class="fw-bold text-dark">${unit}</span> <span class="badge bg-light text-dark border ms-1">Sem: ${sTxt}</span> <span class="badge bg-light text-dark border ms-1">Kls: ${kTxt}</span>`;
  }
};

window.extractRulesFromUI = function(treeId) {
  let rules = [];
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return JSON.stringify(rules);

  const rows = container.querySelectorAll('.rule-row');
  rows.forEach(row => {
      if (treeId === 'tree1') {
          rules.push({
              tree: 'tree1',
              parentPath: row.querySelector('.rule-parent')?.value || '', type: row.querySelector('.rule-type')?.value || 'numeric',
              numStart: row.querySelector('.rule-num-start')?.value || 1, numEnd: row.querySelector('.rule-num-end')?.value || 10,
              alphaStart: row.querySelector('.rule-alpha-start')?.value || 'A', alphaEnd: row.querySelector('.rule-alpha-end')?.value || 'E',
              manualList: row.querySelector('.rule-manual')?.value || ''
          });
      } else if (treeId === 'tree2') {
          rules.push({
              tree: 'tree2',
              unit: row.querySelector('.t2-unit')?.value || '', jurusan: row.querySelector('.t2-jurusan')?.value || '',
              semesterType: row.querySelector('.t2-sem-type')?.value || 'numeric', semesterNumStart: row.querySelector('.t2-sem-start')?.value || 1, semesterNumEnd: row.querySelector('.t2-sem-end')?.value || 2, semesterManual: row.querySelector('.t2-sem-manual')?.value || '',
              kelasType: row.querySelector('.t2-kel-type')?.value || 'roman', kelasRomanStart: row.querySelector('.t2-kel-start')?.value || 'VII', kelasRomanEnd: row.querySelector('.t2-kel-end')?.value || 'IX', kelasManual: row.querySelector('.t2-kel-manual')?.value || '',
              bagType: row.querySelector('.t2-bag-type')?.value || 'alpha', bagNumStart: row.querySelector('.t2-bag-num-start')?.value || 1, bagNumEnd: row.querySelector('.t2-bag-num-end')?.value || 10,
              bagAlphaStart: row.querySelector('.t2-bag-alpha-start')?.value || 'A', bagAlphaEnd: row.querySelector('.t2-bag-alpha-end')?.value || 'E', bagManual: row.querySelector('.t2-bag-manual')?.value || ''
          });
      }
  });
  return JSON.stringify(rules);
};

window.renderBuilderUI = function(treeId, jsonString) {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;
  container.innerHTML = ''; 
  try {
      if (!jsonString) { window.addRuleRow(treeId); return; }
      let rules = JSON.parse(jsonString);
      if (!Array.isArray(rules)) throw new Error();
      if (rules.length === 0) window.addRuleRow(treeId);
      else rules.forEach(rule => window.addRuleRow(treeId, rule));
  } catch(e) {
      if (jsonString && String(jsonString).trim() !== '' && treeId === 'tree1') {
          window.addRuleRow(treeId, { parentPath: '', type: 'manual', manualList: String(jsonString).split('\n').join(', ') });
      } else { window.addRuleRow(treeId); }
  }
};

// =========================================================
// 3. FUNGSI BACKEND SUPABASE (DATA, SETTINGS & AUDIT LOG)
// =========================================================
async function logActivity(aktivitas, detail) {
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

// Mengambil seluruh data santri dari Supabase (mendukung > 1.000 baris dengan paginasi otomatis)
async function fetchAllSantriFromSupabase() {
  if (!supabase) {
    console.warn('Supabase belum dikonfigurasi. Periksa VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY.');
    return [];
  }
  const pageSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('santri')
      .select('*')
      .order('no_induk', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows.map(dbRowToArray);
}

async function fetchSettingsFromSupabase() {
  if (!supabase) return appSettingsGlobal;
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'APP_SETTINGS')
    .maybeSingle();

  if (!error && data && data.value) {
return {
      tree1: data.value.tree1 || '',
      tree2: data.value.tree2 || ''
    };
  }
  return appSettingsGlobal;
}

// >>> BARU: Mengambil seluruh data Asatidz dari Supabase (paginasi otomatis)
async function fetchAllAsatidzFromSupabase() {
  if (!supabase) {
    console.warn('Supabase belum dikonfigurasi.');
    return [];
  }
  const pageSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('asatidz')
      .select('*')
      .order('nama_asatidz', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

// =========================================================
// 4. NAVIGASI, SIDEBAR HOVER & LOGOUT
// =========================================================
// Fungsi terpusat untuk meluruskan SEMUA tabel di aplikasi
function selaraskanSemuaTabel() {
  if (dataTable && $('#page-santri').is(':visible')) {
    dataTable.columns.adjust();
  }
  if (typeof dtFormasi !== 'undefined' && dtFormasi && $('#page-formasi').is(':visible')) {
    dtFormasi.columns.adjust();
  }
}

// A. Auto-adjust saat jendela browser di-resize
$(window).on('resize', function () {
  selaraskanSemuaTabel();
});

// B. Auto-adjust mendeteksi perubahan lebar layar (buka/tutup/hover sidebar)
if (window.ResizeObserver) {
  const observerKonten = new ResizeObserver(() => {
    selaraskanSemuaTabel();
  });
  const mainEl = document.querySelector('.main-content');
  if (mainEl) observerKonten.observe(mainEl);
}

// C. Pastikan penyesuaian sempurna setelah animasi transisi sidebar selesai
document.addEventListener('transitionend', function (e) {
  if (e.target && (e.target.classList.contains('main-content') || e.target.classList.contains('sidebar-overlay'))) {
    selaraskanSemuaTabel();
  }
});

// D. Sidebar Toggle Tanpa setTimeout karena sudah dihandle Observer
function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
  document.getElementById('desktopSidebar').classList.toggle('close');
}

function showPage(page) {
  const pageSantri = document.getElementById('page-santri');
  const pageFormasi = document.getElementById('page-formasi');
  const pageAsatidz = document.getElementById('page-asatidz'); // >>> BARU
  if (pageSantri) pageSantri.style.display = (page === 'santri') ? 'block' : 
'none';
  if (pageFormasi) pageFormasi.style.display = (page === 'formasi') ? 'block' : 
'none';
  if (pageAsatidz) pageAsatidz.style.display = (page === 'asatidz') ? 'block' : 
'none'; // >>> BARU
  
// Update efek menu aktif
  document.querySelectorAll('.sidebar-overlay .nav-link, .bottom-nav .nav-link').forEach(el => el.classList.remove('active'));
  const deskActive = document.getElementById('nav-desk-' + page);
  const mobActive = document.getElementById('nav-mob-' + page);
  if (deskActive) deskActive.classList.add('active');
  if (mobActive) mobActive.classList.add('active');

  if (page === 'formasi') loadFormasiData();

  if (window.innerWidth >= 768) {
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('desktopSidebar').classList.add('close');
  }

// Sinkronisasi ukuran tabel (Beri jeda agar DOM ter-render sempurna & menyelaraskan kolom)
  setTimeout(() => {  
    if (page === 'santri' && dataTable) {
      dataTable.columns.adjust().draw(false);
    }
    if (page === 'formasi' && dtFormasi) {
      dtFormasi.columns.adjust().draw(false);
    }
    if (page === 'asatidz' && dataTableAsatidz) { // >>> BARU
      dataTableAsatidz.columns.adjust().draw(false);
    }
  }, 250);
}

function actionLogout() {
  Swal.fire({
    title: 'Keluar dari Aplikasi?',
    text: 'Sesi Anda akan diakhiri. Anda harus login kembali untuk masuk.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#ef4444',
    confirmButtonText: '<i class="bi bi-box-arrow-right me-1"></i> Ya, Keluar',
    cancelButtonText: 'Batal',
    background: '#ffffff',
    borderRadius: '16px',
    backdrop: 'rgba(11, 87, 81, 0.4)'
  }).then((result) => {
    if (result.isConfirmed) {
      sessionStorage.removeItem('MUHAFADZOH_USER');
      Swal.fire({
        title: 'Berhasil Keluar!',
        icon: 'success',
        showConfirmButton: false,
        timer: 1000
      }).then(() => {
        window.location.reload();
      });
    }
  });
}

// =========================================================
// 5. INISIALISASI AWAL APLIKASI & BACKGROUND FETCH
// =========================================================
document.addEventListener('DOMContentLoaded', async function () {
  // Efek Hover Auto-Open & Auto-Close Sidebar Desktop
  const sidebarEl = document.getElementById('desktopSidebar');
  if (sidebarEl) {
    sidebarEl.addEventListener('mouseenter', function () {
      document.body.classList.remove('sidebar-collapsed');
      sidebarEl.classList.remove('close');
    });
    sidebarEl.addEventListener('mouseleave', function () {
      document.body.classList.add('sidebar-collapsed');
      sidebarEl.classList.add('close');
    });
  }

  // Render Kategori Filter Lanjutan (16 Kategori)
  let filterHtml = '<div class="row g-3">';
  filterCategories.forEach(cat => {
    filterHtml += `
      <div class="col-md-4">
        <div class="token-wrapper">
          <input class="btn-check filter-cb" type="checkbox" id="cb_${cat.col}" value="${cat.col}">
          <label class="btn text-truncate" for="cb_${cat.col}" title="${cat.name}">${cat.name}</label>
        </div>
        <input list="dl_${cat.col}" type="text" class="form-control form-control-sm filter-input mt-2" id="in_${cat.col}" disabled placeholder="Pilih...">
        <datalist id="dl_${cat.col}"></datalist>
      </div>`;
  });
  document.getElementById('filterFormCategories').innerHTML = filterHtml + '</div>';

  // Render Modal Sembunyikan Kolom (34 Kolom, "Nama" dikunci)
  initHideModal();
  initHideFilterFormasi(); // Inisialisasi fitur Formasi
  initAsatidzUI(); // >>> BARU: Inisialisasi filter, hide-kolom, tanggal, provinsi, hierarki Asatidz

  // Toggle aktif/nonaktif input filter saat kapsul kategori dicentang
  $(document).on('change', '.filter-cb', function () {
    let inputId = '#in_' + $(this).val();
    $(inputId).prop('disabled', !this.checked);
    if (!this.checked) $(inputId).val('');
  });

  // Inisialisasi Dropdown Tanggal (01-31) & Tahun Lahir (1990 - Sekarang)
  const tglSelect = document.getElementById('tgl_lahir');
  tglSelect.options.add(new Option('Pilih', ''));
  for (let i = 1; i <= 31; i++) {
    let val = i < 10 ? '0' + i : String(i);
    tglSelect.options.add(new Option(val, val));
  }

  const thnSelect = document.getElementById('thn_lahir');
  thnSelect.options.add(new Option('Pilih', ''));
  for (let i = new Date().getFullYear(); i >= 1990; i--) {
    thnSelect.options.add(new Option(i, i));
  }

  // Muat Daftar Provinsi dari REST API Wilayah Emsifa
  fetch(`${API_WILAYAH}/provinces.json`)
    .then(r => r.json())
    .then(provs => {
      let provSelect = document.getElementById('provinsi');
      provSelect.innerHTML = '<option value="">Pilih Provinsi</option>';
      provs.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.name;
        opt.dataset.id = p.id;
        opt.textContent = p.name;
        provSelect.appendChild(opt);
      });
    })
    .catch(err => console.error('Gagal memuat provinsi:', err));

  // Pasang Event Listeners Wilayah & Hierarki
  setupWilayahListeners();
  setupHierarchyListeners();
  setupDetailModalButtons();

  // Muat Konfigurasi Hierarki Dropdown dari Tabel `app_settings`
  try {
    const settings = await fetchSettingsFromSupabase();
    appSettingsGlobal = settings;
// Render JSON rules dari database ke Visual UI Builder
    window.renderBuilderUI('tree1', appSettingsGlobal.tree1);
    window.renderBuilderUI('tree2', appSettingsGlobal.tree2);
    applyTreeData(appSettingsGlobal);
  } catch (err) {
    console.error('Gagal memuat app_settings:', err.message);
  }

// Background Fetch Data Santri & Formasi
  try {
    globalDataSantri = await fetchAllSantriFromSupabase();
    populateFilterDatalists();
    await loadFormasiData(); // Awalan window dihapus
  } catch (err) {
    console.error('Background fetch santri gagal:', err.message);
  }

  // >>> BARU: Background Fetch Data Asatidz (senyap, tidak merender tabel)
  try {
    globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    populateFilterDatalistsAsatidz();
  } catch (err) {
    console.error('Background fetch asatidz gagal:', err.message);
  }
});

// >>> BARU: Inisialisasi UI Asatidz (dipanggil sekali di DOMContentLoaded)
function initAsatidzUI() {
  // 1. Render kategori Filter Lanjutan
  let filterHtmlAsatidz = '<div class="row g-3">';
  filterCategoriesAsatidz.forEach(cat => {
    filterHtmlAsatidz += `
      <div class="col-md-4">
        <div class="token-wrapper">
          <input class="btn-check filter-cb-asatidz" type="checkbox" id="cba_${cat.col}" value="${cat.col}">
          <label class="btn text-truncate" for="cba_${cat.col}" title="${cat.name}">${cat.name}</label>
        </div>
        <input list="dla_${cat.col}" type="text" class="form-control form-control-sm filter-input-asatidz mt-2" id="ina_${cat.col}" disabled placeholder="Pilih...">
        <datalist id="dla_${cat.col}"></datalist>
      </div>`;
  });
  const filterContainerA = document.getElementById('filterFormCategoriesAsatidz');
  if (filterContainerA) filterContainerA.innerHTML = filterHtmlAsatidz + '</div>';

  $(document).on('change', '.filter-cb-asatidz', function () {
    let inputId = '#ina_' + $(this).val();
    $(inputId).prop('disabled', !this.checked);
    if (!this.checked) $(inputId).val('');
  });

  // 2. Render Modal Sembunyikan Kolom
  initHideModalAsatidz();

  // 3. Dropdown Tanggal & Tahun Lahir
  const tglSelectA = document.getElementById('tgl_lahir_asatidz');
  if (tglSelectA && tglSelectA.options.length === 0) {
    tglSelectA.options.add(new Option('Pilih', ''));
    for (let i = 1; i <= 31; i++) {
      let val = i < 10 ? '0' + i : String(i);
      tglSelectA.options.add(new Option(val, val));
    }
  }
  const thnSelectA = document.getElementById('thn_lahir_asatidz');
  if (thnSelectA && thnSelectA.options.length === 0) {
    thnSelectA.options.add(new Option('Pilih', ''));
    for (let i = new Date().getFullYear(); i >= 1950; i--) {
      thnSelectA.options.add(new Option(i, i));
    }
  }

  // 4. Muat Provinsi untuk Form Asatidz
  fetch(`${API_WILAYAH}/provinces.json`)
    .then(r => r.json())
    .then(provs => {
      let provSelect = document.getElementById('provinsi_asatidz');
      if (!provSelect) return;
      provSelect.innerHTML = '<option value="">Pilih Provinsi</option>';
      provs.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.name;
        opt.dataset.id = p.id;
        opt.textContent = p.name;
        provSelect.appendChild(opt);
      });
    })
    .catch(err => console.error('Gagal memuat provinsi asatidz:', err));

  // 5. Pasang Listener Wilayah & Hierarki khusus Asatidz
  setupWilayahListenersAsatidz();
  setupHierarchyListenersAsatidz();
  setupDetailModalButtonsAsatidz();
}

function populateFilterDatalistsAsatidz() {
  filterCategoriesAsatidz.forEach(cat => {
    let uniqueValues;
    if (cat.field) {
      uniqueValues = [...new Set(globalDataAsatidz.map(r => r[cat.field]))]
        .filter(v => v && String(v).trim() !== '');
    } else {
      uniqueValues = [...new Set(globalDataAsatidz.map(r =>
        `${r.din_kls_asatidz || ''} ${r.din_bag_asatidz || ''} ${r.tingkat_asatidz || ''}`.trim()
      ))].filter(Boolean);
    }
    let dataList = document.getElementById('dla_' + cat.col);
    if (dataList) {
      dataList.innerHTML = uniqueValues.sort().map(v => `<option value="${v}">`).join('');
    }
  });
}

function populateFilterDatalists() {
  filterCategories.forEach(cat => {
    let uniqueValues = [...new Set(globalDataSantri.map(r => r[cat.col - 1]))]
      .filter(v => v && v.toString().trim() !== '');
    let dataList = document.getElementById('dl_' + cat.col);
    if (dataList) {
      dataList.innerHTML = uniqueValues.sort().map(val => `<option value="${val}">`).join('');
    }
  });
}

// =========================================================
// 6. LAZY LOADING & RENDER TABEL DATATABLES (#dataTable)
// =========================================================
async function actionLoadSantri() {
  const btn = document.getElementById('btnLoadSantri');
  btn.classList.add('btn-loading-state');

  btn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    <span>Menyiapkan Database Santri...</span>
  `;

  setTimeout(async () => {
    try {
      if (!globalDataSantri || globalDataSantri.length === 0) {
        globalDataSantri = await fetchAllSantriFromSupabase();
      }
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Memuat ${globalDataSantri.length.toLocaleString('id-ID')} Data Santri...</span>
      `;
      setTimeout(() => {
        renderTable(globalDataSantri);
      }, 80);
    } catch (err) {
      Swal.fire('Gagal Memuat Data', err.message, 'error');
      btn.classList.remove('btn-loading-state');
      btn.innerHTML = '<i class="bi bi-table me-2"></i> Memuat Halaman (Tabel Data)';
    }
  }, 60);
}

function renderTable(data) {
  let btnContainer = document.getElementById('btnLoadSantriContainer');
  let tableWrapper = document.getElementById('tableSantriWrapper');
  if (btnContainer) btnContainer.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  if (dataTable) {
    dataTable.destroy();
    $('#dataTable').empty();
  }

  // Bangun Struktur Header 36 Kolom
  $('#dataTable').html(`
    <thead class="table-light">
      <tr>
        <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAll" class="form-check-input"></th>
        <th class="text-center">No</th>
        <th>No. Induk</th>
        <th>No. Biro</th>
        <th>NISN</th>
        <th class="text-center">Gender</th>
        <th>Nama Lengkap</th>
        <th>Tempat Lahir</th>
        <th class="text-center">Tgl</th>
        <th class="text-center">Bln</th>
        <th class="text-center">Thn</th>
        <th>Dusun</th>
        <th>Desa</th>
        <th>Kecamatan</th>
        <th>Kabupaten</th>
        <th>Provinsi</th>
        <th>Blok</th>
        <th>Asrama</th>
        <th>Kode</th>
        <th>Kamar</th>
        <th>Kelas</th>
        <th>Bag</th>
        <th>Semester</th>
        <th>Jurusan</th>
        <th>Unit</th>
        <th>Din. Kls</th>
        <th>Din. Bag</th>
        <th>Tingkat</th>
        <th>ORDA</th>
        <th>NIK Santri</th>
        <th>No. KK</th>
        <th>Nama Ayah</th>
        <th>NIK Ayah</th>
        <th>Nama Ibu</th>
        <th>NIK Ibu</th>
        <th>Telepon</th>
      </tr>
    </thead>
    <tbody id="tableBody"></tbody>
  `);

  globalDataSantri = Array.isArray(data) ? data : JSON.parse(data || '[]');

  const tableDataArray = [];
  for (let r = 0; r < globalDataSantri.length; r++) {
    const row = globalDataSantri[r];
    const genderBadge = row[4] === 'PA'
      ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">PA</span>'
      : (row[4] === 'PI'
        ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2">PI</span>'
        : (row[4] || ''));

    tableDataArray.push([
      `<input type="checkbox" class="row-check form-check-input" value="${row[1]}">`,
      '', // [1] Nomor urut otomatis
      `<span class="fw-bold text-dark font-monospace">${row[1] || ''}</span>`,
      row[2] || '',
      row[3] || '',
      genderBadge,
      `<span class="fw-bold text-dark">${row[5] || ''}</span>`,
      row[6] || '',
      row[7] || '',
      row[8] || '',
      row[9] || '',
      row[10] || '',
      row[11] || '',
      row[12] || '',
      row[13] || '',
      row[14] || '',
      row[15] || '',
      row[16] || '',
      row[17] || '',
      row[18] || '',
      row[19] || '',
      row[20] || '',
      row[21] || '',
      row[22] || '',
      row[23] || '',
      row[24] || '',
      row[25] || '',
      row[26] || '',
      row[27] || '',
      `<span class="font-monospace text-secondary">${row[28] || ''}</span>`,
      `<span class="font-monospace text-secondary">${row[29] || ''}</span>`,
      row[30] || '',
      `<span class="font-monospace text-muted">${row[31] || ''}</span>`,
      row[32] || '',
      `<span class="font-monospace text-muted">${row[33] || ''}</span>`,
      row[34] || ''
    ]);
  }

dataTable = $('#dataTable').DataTable({
    data: tableDataArray,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: true, /* PERBAIKAN: Harus true agar DataTable menghitung colgroup presisi */
    processing: true,
    deferRender: true,
    pageLength: 25,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    language: {
      search: 'Pencarian:',
      lengthMenu: 'Tampilkan _MENU_ data',
      info: 'Menampilkan _START_ - _END_ dari total _TOTAL_ santri',
      emptyTable: 'Data santri tidak ditemukan.'
    },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 1], className: 'text-center' },
      { className: 'text-center', targets: [5, 8, 9, 10] }
    ],
    order: [[2, 'asc']],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);

      if ($('#actionGroup').length === 0) {
        $('#dataTable_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap');
        $('#dataTable_filter label').addClass('mb-0 d-flex align-items-center gap-2');

        let actionBtns = $(`
          <div class="d-flex gap-2 flex-nowrap" id="actionGroup">
            <div class="dropdown">
              <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
                <i class="bi bi-trash"></i> Hapus
              </button>
              <ul class="dropdown-menu shadow-sm border-0">
                <li><a class="dropdown-item" href="#" onclick="window.hapusTerpilih(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item fw-bold text-danger" href="#" onclick="window.hapusSemuaData(); return false;"><i class="bi bi-exclamation-triangle-fill me-2"></i> Hapus Semua</a></li>
              </ul>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideModal"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
            <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterModal"><i class="bi bi-funnel"></i> Filter</button>
          </div>
        `);
        $('#dataTable_filter').prepend(actionBtns);
      }
    }
  });

  // Penomoran otomatis mengikuti sorting dan pencarian
  dataTable.on('order.dt search.dt', function () {
    let i = 1;
    dataTable.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  setTimeout(() => {
    if (dataTable) dataTable.columns.adjust().draw(false);
  }, 300);

  applyHideColumns();
  populateFilterDatalists();
}

// =========================================================
// 7. FITUR SEMBUNYIKAN KOLOM & FILTER LANJUTAN
// =========================================================
function initHideModal() {
  let html = '';
  const colNames = [
    'No.Induk', 'No.Biro', 'NISN', 'PA/PI', 'Nama',
    'Tempat Lahir', 'Tgl Lahir', 'Bln Lahir', 'Thn Lahir',
    'Dusun', 'Desa', 'Kecamatan', 'Kabupaten', 'Provinsi',
    'Blok', 'Asrama', 'Kode', 'Kamar',
    'Kelas', 'Bag', 'Semester', 'Jurusan', 'Unit',
    'Din.Kls', 'Din.Bag', 'Tingkat', 'ORDA',
    'NIK', 'NO.KK', 'Nama Ayah', 'NIK Ayah', 'Nama Ibu', 'NIK Ibu', 'Telepon'
  ];

  colNames.forEach((name, i) => {
    let colIdx = i + 2;
    let isLockedName = (name === 'Nama');

    html += `
      <div class="col-md-3 col-sm-4 col-6 mb-2">
        <div class="token-wrapper">
          <input type="checkbox" class="btn-check hide-cb" id="hide_${colIdx}" value="${colIdx}" ${isLockedName ? 'disabled' : ''}>
          <label class="btn text-truncate" for="hide_${colIdx}" title="${name}">
            ${name}
          </label>
        </div>
      </div>`;
  });
  document.getElementById('hideCheckboxes').innerHTML = html;
}

function checkAllHide(status) {
  $('.hide-cb:not(:disabled)').prop('checked', status);
}

function applyHideColumns() {
  hiddenColumnsGlobal = [];
  if (!dataTable) return;

  for (let i = 2; i <= 35; i++) {
    dataTable.column(i).visible(true, false);
  }

  $('.hide-cb:checked').each(function () {
    let colIdx = parseInt($(this).val(), 10);
    hiddenColumnsGlobal.push(colIdx);
    dataTable.column(colIdx).visible(false, false);
  });

  dataTable.columns.adjust().draw(false);
}

function applyFilters() {
  if (!dataTable) return;
  dataTable.columns().search('');
  $('.filter-cb:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#in_' + colIdx).val();
    dataTable.column(colIdx).search(val);
  });
  dataTable.draw();
}

function resetFilters() {
  $('.filter-cb').prop('checked', false);$('.filter-input').val('').prop('disabled', true);
  if (dataTable) dataTable.columns().search('').draw();
}

// =========================================================
// FITUR SEMBUNYIKAN KOLOM & FILTER FORMASI
// =========================================================
function initHideFilterFormasi() {
    const formasiColNames = [
        { name: 'Tingkat', col: 1 }, { name: 'Kelas', col: 2 }, { name: 'Bagian', col: 3 },
        { name: 'Gender', col: 4 }, { name: 'Kapasitas', col: 5 }, { name: 'Wali Kelas', col: 6 },
        { name: 'Domisili', col: 7 }, { name: 'Lokal Takror', col: 8 }, { name: 'Lokasi Diniyyah', col: 9 }
    ];
    let hideHtml = '';
    formasiColNames.forEach(c => {
        hideHtml += `
          <div class="col-md-4 col-sm-6 col-6 mb-2">
            <div class="token-wrapper">
              <input type="checkbox" class="btn-check hide-cb-formasi" id="hide_f_${c.col}" value="${c.col}">
              <label class="btn text-truncate w-100" for="hide_f_${c.col}" title="${c.name}">${c.name}</label>
            </div>
          </div>`;
    });
    const hideContainer = document.getElementById('hideCheckboxesFormasi');
    if (hideContainer) hideContainer.innerHTML = hideHtml;

    let filterHtml = '';
    const filterCats = [
        { name: 'Tingkat', col: 1 }, { name: 'Gender', col: 4 },
        { name: 'Wali Kelas', col: 6 }, { name: 'Domisili', col: 7 }
    ];
    filterCats.forEach(cat => {
        filterHtml += `
          <div class="col-md-6">
            <div class="token-wrapper">
              <input class="btn-check filter-cb-formasi" type="checkbox" id="cb_f_${cat.col}" value="${cat.col}">
              <label class="btn text-truncate w-100" for="cb_f_${cat.col}">${cat.name}</label>
            </div>
            <input type="text" class="form-control form-control-sm mt-2 filter-input-formasi" id="in_f_${cat.col}" disabled placeholder="Ketik pencarian...">
          </div>`;
    });
    const filterContainer = document.getElementById('filterFormCategoriesFormasi');
    if (filterContainer) filterContainer.innerHTML = filterHtml;

    $(document).on('change', '.filter-cb-formasi', function () {
        $('#in_f_' + $(this).val()).prop('disabled', !this.checked).val('');
    });
}

function checkAllHideFormasi(status) { $('.hide-cb-formasi').prop('checked', status); }

function applyHideColumnsFormasi() {
    if (!dtFormasi) return;
    for (let i = 1; i <= 9; i++) dtFormasi.column(i).visible(true, false);
    $('.hide-cb-formasi:checked').each(function () {
        dtFormasi.column(parseInt($(this).val(), 10)).visible(false, false);
    });
    dtFormasi.columns.adjust().draw(false);
}

function applyFiltersFormasi() {
    if (!dtFormasi) return;
    dtFormasi.columns().search('');
    $('.filter-cb-formasi:checked').each(function () {
        let colIdx = $(this).val();
        let val = $('#in_f_' + colIdx).val();
        dtFormasi.column(colIdx).search(val);
    });
    dtFormasi.draw();
}

function resetFiltersFormasi() {
    $('.filter-cb-formasi').prop('checked', false);$('.filter-input-formasi').val('').prop('disabled', true);
    if (dtFormasi) dtFormasi.columns().search('').draw();
}

// =========================================================
// >>> BARU: MODUL DATA ASATIDZ (LAZY LOAD, RENDER, HIDE, FILTER)
// =========================================================
async function actionLoadAsatidz() {
  const btn = document.getElementById('btnLoadAsatidz');
  btn.classList.add('btn-loading-state');
  btn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    <span>Menyiapkan Database Asatidz...</span>
  `;

  setTimeout(async () => {
    try {
      if (!globalDataAsatidz || globalDataAsatidz.length === 0) {
        globalDataAsatidz = await fetchAllAsatidzFromSupabase();
      }
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Memuat ${globalDataAsatidz.length.toLocaleString('id-ID')} Data Asatidz...</span>
      `;
      setTimeout(() => {
        renderTableAsatidz(globalDataAsatidz);
      }, 80);
    } catch (err) {
      Swal.fire('Gagal Memuat Data', err.message, 'error');
      btn.classList.remove('btn-loading-state');
      btn.innerHTML = '<i class="bi bi-table me-2"></i> Memuat Halaman (Tabel Data)';
    }
  }, 60);
}

function renderTableAsatidz(data) {
  let btnContainer = document.getElementById('btnLoadAsatidzContainer');
  let tableWrapper = document.getElementById('tableAsatidzWrapper');
  if (btnContainer) btnContainer.style.display = 'none';
  if (tableWrapper) tableWrapper.style.display = 'block';

  if (dataTableAsatidz) {
    dataTableAsatidz.destroy();
    $('#dataTableAsatidz').empty();
  }

  $('#dataTableAsatidz').html(`
    <thead class="table-light">
      <tr>
        <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAllAsatidz" class="form-check-input"></th>
        <th class="text-center">NO</th>
        <th class="text-center">FOTO</th>
        <th class="text-center">NIS</th>
        <th class="text-center">NIA</th>
        <th class="text-center">PA/PI</th>
        <th>KELAS DINIYYAH</th>
        <th>BLOK</th>
        <th>NAMA ASATIDZ</th>
        <th class="text-center">JAH</th>
        <th>LOKASI DINIYYAH</th>
        <th>LOKASI TAKROR</th>
        <th>TTL</th>
        <th>PENEMPATAN KAMAR</th>
      </tr>
    </thead>
    <tbody id="tableBodyAsatidz"></tbody>
  `);

  globalDataAsatidz = Array.isArray(data) ? data : [];

  const tableDataArray = globalDataAsatidz.map(row => {
    const genderBadge = row.pa_pi === 'PA'
      ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2">PA</span>'
      : (row.pa_pi === 'PI'
        ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2">PI</span>'
        : (row.pa_pi || ''));

    const isMustahiq = /mustahiq/i.test(row.jah_asatidz || '');
    const jahBadge = row.jah_asatidz
      ? `<span class="badge ${isMustahiq ? 'bg-success' : 'bg-secondary'} bg-opacity-10 text-${isMustahiq ? 'success' : 'dark'} border px-2 py-1">${row.jah_asatidz}</span>`
      : '-';

    const kelasGabung = `${row.din_kls_asatidz || ''} ${row.din_bag_asatidz || ''} ${row.tingkat_asatidz || ''}`.trim();
    const ttlGabung = `${row.tempat_lahir || '-'}, ${row.tgl_lahir || ''} ${row.bln_lahir || ''} ${row.thn_lahir || ''}`.trim();
    const kamarGabung = `${row.blok || '-'} - ${row.asrama || '-'} - ${row.kode || '-'} - ${row.kamar || '-'}`;

    const fotoHtml = row.foto_asatidz
      ? `<img src="${row.foto_asatidz}" style="width:34px;height:34px;object-fit:cover;border-radius:50%;cursor:zoom-in;" class="border shadow-sm" title="Klik untuk memperbesar foto" onclick="event.stopPropagation(); window.lihatFotoAsatidz('${row.foto_asatidz}')" onerror="this.style.display='none';">`
      : '<i class="bi bi-person-circle text-muted fs-4"></i>';

    return [
      `<input type="checkbox" class="row-check-asatidz form-check-input" value="${row.id}">`,
      '',
      fotoHtml,
      `<span class="fw-bold text-secondary font-monospace">${row.nis || '-'}</span>`,
      `<span class="fw-bold text-secondary font-monospace">${row.nia || '-'}</span>`,
      genderBadge,
      `<span class="badge bg-success rounded-pill fw-normal px-2 py-1">${kelasGabung || '-'}</span>`,
      row.blok || '-',
      `<span class="fw-bold text-dark">${row.nama_asatidz || ''}</span>`,
      jahBadge,
      row.lokasi_diniyyah || '-',
      row.lokasi_takror || '-',
      ttlGabung,
      kamarGabung
    ];
  });

  dataTableAsatidz = $('#dataTableAsatidz').DataTable({
    data: tableDataArray,
    scrollX: true,
    scrollCollapse: true,
    autoWidth: true,
    processing: true,
    deferRender: true,
    pageLength: 25,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    language: {
      search: 'Pencarian:',
      lengthMenu: 'Tampilkan _MENU_ data',
      info: 'Menampilkan _START_ - _END_ dari _TOTAL_ Asatidz',
      emptyTable: 'Data Asatidz tidak ditemukan.'
    },
    columnDefs: [
      { searchable: false, orderable: false, targets: [0, 1, 2], className: 'text-center' },
      { className: 'text-center', targets: [3, 4, 5, 9] }
    ],
    order: [[8, 'asc']],
    initComplete: function () {
      const api = this.api();
      setTimeout(() => api.columns.adjust(), 150);
      if ($('#actionGroupAsatidz').length === 0) {
        $('#dataTableAsatidz_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap');
        $('#dataTableAsatidz_filter label').addClass('mb-0 d-flex align-items-center gap-2');
        let actionBtns = $(`
          <div class="d-flex gap-2 flex-nowrap" id="actionGroupAsatidz">
            <div class="dropdown">
              <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
                <i class="bi bi-trash"></i> Hapus
              </button>
              <ul class="dropdown-menu shadow-sm border-0">
                <li><a class="dropdown-item" href="#" onclick="window.hapusTerpilihAsatidz(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
              </ul>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideModalAsatidz"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
            <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterModalAsatidz"><i class="bi bi-funnel"></i> Filter</button>
          </div>
        `);
        $('#dataTableAsatidz_filter').prepend(actionBtns);
      }
    }
  });

  dataTableAsatidz.on('order.dt search.dt', function () {
    let i = 1;
    dataTableAsatidz.cells(null, 1, { search: 'applied', order: 'applied' }).every(function () {
      this.data(i++);
    });
  }).draw();

  setTimeout(() => {
    if (dataTableAsatidz) dataTableAsatidz.columns.adjust().draw(false);
  }, 300);

  populateFilterDatalistsAsatidz();
}

function initHideModalAsatidz() {
  let html = '';
  const colNames = ['NO', 'FOTO', 'NIS', 'NIA', 'PA/PI', 'KELAS DINIYYAH', 'BLOK', 'NAMA ASATIDZ', 'JAH', 'LOKASI DINIYYAH', 'LOKASI TAKROR', 'TTL', 'PENEMPATAN KAMAR'];
  colNames.forEach((name, i) => {
    let colIdx = i + 1;
    let isLocked = (name === 'NAMA ASATIDZ');
    html += `
      <div class="col-md-3 col-sm-4 col-6 mb-2">
        <div class="token-wrapper">
          <input type="checkbox" class="btn-check hide-cb-asatidz" id="hidea_${colIdx}" value="${colIdx}" ${isLocked ? 'disabled' : ''}>
          <label class="btn text-truncate" for="hidea_${colIdx}" title="${name}">${name}</label>
        </div>
      </div>`;
  });
  const container = document.getElementById('hideCheckboxesAsatidz');
  if (container) container.innerHTML = html;
}

function checkAllHideAsatidz(status) {
  $('.hide-cb-asatidz:not(:disabled)').prop('checked', status);
}

function applyHideColumnsAsatidz() {
  hiddenColumnsGlobalAsatidz = [];
  if (!dataTableAsatidz) return;
  for (let i = 1; i <= 13; i++) {
    dataTableAsatidz.column(i).visible(true, false);
  }
  $('.hide-cb-asatidz:checked').each(function () {
    let colIdx = parseInt($(this).val(), 10);
    hiddenColumnsGlobalAsatidz.push(colIdx);
    dataTableAsatidz.column(colIdx).visible(false, false);
  });
  dataTableAsatidz.columns.adjust().draw(false);
}

function applyFiltersAsatidz() {
  if (!dataTableAsatidz) return;
  dataTableAsatidz.columns().search('');
  $('.filter-cb-asatidz:checked').each(function () {
    let colIdx = $(this).val();
    let val = $('#ina_' + colIdx).val();
    dataTableAsatidz.column(colIdx).search(val);
  });
  dataTableAsatidz.draw();
}

function resetFiltersAsatidz() {
  $('.filter-cb-asatidz').prop('checked', false);
  $('.filter-input-asatidz').val('').prop('disabled', true);
  if (dataTableAsatidz) dataTableAsatidz.columns().search('').draw();
}

$(document).on('change', '#checkAllAsatidz', function () {
  $('.row-check-asatidz').prop('checked', this.checked);
});

// Klik baris -> buka Modal Detail Asatidz + render Santri Binaan
$(document).off('click', '#dataTableAsatidz tbody tr').on('click', '#dataTableAsatidz tbody tr', function (e) {
  if ($(e.target).hasClass('row-check-asatidz') || $(e.target).is(':checkbox') || $(this).find('.dataTables_empty').length > 0) {
    return;
  }
  let id = $(this).find('.row-check-asatidz').val();
  if (!id) return;

  let asatidz = globalDataAsatidz.find(r => String(r.id) === String(id));
  if (!asatidz) return;

  selectedRowDataAsatidz = asatidz;
  renderDetailAsatidz(asatidz);
  $('#detailModalAsatidz').modal('show');
});

function renderDetailAsatidz(a) {
  let ttl = `${a.tempat_lahir || '-'}, ${a.tgl_lahir || ''} ${a.bln_lahir || ''} ${a.thn_lahir || ''}`.trim();
  let alamat = `Dusun ${a.dusun || '-'}, Desa ${a.desa || '-'}, Kec. ${a.kecamatan || '-'}, Kab. ${a.kabupaten || '-'}, Prov. ${a.provinsi || '-'}`;
  let penempatan = `Blok ${a.blok || '-'} - Asrama ${a.asrama || '-'} - Kode ${a.kode || '-'} - Kamar ${a.kamar || '-'}`;
  let kelasDetail = `${a.din_kls_asatidz || ''} ${a.din_bag_asatidz || ''} ${a.tingkat_asatidz || ''}`.trim();

  function buildRow(label, value, extraClass = '') {
    return `<div class="row mb-2">
      <div class="col-sm-3 text-muted small">${label}</div>
      <div class="col-sm-9 text-dark small"><span class="d-none d-sm-inline me-2">:</span> <span class="${extraClass}">${value || '-'}</span></div>
    </div>`;
  }

  let fotoHtml = a.foto_asatidz
    ? `<img src="${a.foto_asatidz}" style="width:90px;height:110px;object-fit:cover;border-radius:12px;cursor:zoom-in;" class="border shadow-sm" title="Klik untuk memperbesar" onclick="window.lihatFotoAsatidz('${a.foto_asatidz}')">`
    : `<div class="d-flex flex-column align-items-center justify-content-center border rounded-3 bg-light text-muted shadow-sm" style="width:90px;height:110px;"><i class="bi bi-person-circle" style="font-size:2.5rem;"></i></div>`;

  let html = `
    <div class="bg-white p-3 rounded border shadow-sm mb-4">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3"><i class="bi bi-person-badge me-2"></i> Profil Asatidz</h6>
      <div class="row align-items-center">
        <div class="col-sm-3 text-center mb-3 mb-sm-0 d-flex justify-content-center">${fotoHtml}</div>
        <div class="col-sm-9">
          ${buildRow('NIS', a.nis)}
          ${buildRow('NIA', a.nia, 'fw-bold font-monospace')}
          ${buildRow('Nama Lengkap', a.nama_asatidz, 'fw-bold text-success fs-6')}
          ${buildRow('Jah', a.jah_asatidz)}
          ${buildRow('Gender', a.pa_pi === 'PA' ? 'PA (Putra)' : (a.pa_pi === 'PI' ? 'PI (Putri)' : '-'))}
          ${buildRow('Tempat, Tgl Lahir', ttl)}
        </div>
      </div>
    </div>
    <div class="bg-white p-3 rounded border shadow-sm mb-4">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3">Kelas Madin & Lokasi</h6>
      ${buildRow('Kelas Madin', kelasDetail, 'fw-bold')}
      ${buildRow('Lokasi Diniyyah', a.lokasi_diniyyah)}
      ${buildRow('Lokasi Takror', a.lokasi_takror)}
      ${buildRow('Penempatan Kamar', penempatan)}
      ${buildRow('Alamat Domisili Asal', alamat)}
    </div>
  `;

  // Filter Santri Binaan: tingkat, din_kls, din_bag, pa_pi sama persis
  let matchTingkat = (a.tingkat_asatidz || '').trim().toUpperCase();
  let matchDinKls = (a.din_kls_asatidz || '').trim().toUpperCase();
  let matchDinBag = (a.din_bag_asatidz || '').trim().toUpperCase();
  let matchPaPi = (a.pa_pi || '').trim().toUpperCase();

  let santriBinaan = (globalDataSantri || []).filter(s => {
    return (s[26] || '').trim().toUpperCase() === matchTingkat &&
      (s[24] || '').trim().toUpperCase() === matchDinKls &&
      (s[25] || '').trim().toUpperCase() === matchDinBag &&
      (s[4] || '').trim().toUpperCase() === matchPaPi;
  });

  html += `
    <h6 class="text-success fw-bold mb-3 mt-2"><i class="bi bi-people-fill me-1"></i> Daftar Santri Binaan (${santriBinaan.length} Santri)</h6>
    <div class="table-responsive bg-white rounded border shadow-sm" style="max-height: 320px; overflow-y: auto;">
      <table class="table table-hover table-sm mb-0 align-middle">
        <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
          <tr>
            <th style="width: 40px;" class="text-center">No</th>
            <th style="width: 100px;">Kamar</th>
            <th>Nama Santri</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (santriBinaan.length > 0) {
    santriBinaan.forEach((s, idx) => {
      let kode = s[17] || '', kamar = s[18] || '';
      let kamarGabung = (kode && kamar) ? `${kode} - ${kamar}` : (kode || kamar || '-');
      html += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td><span class="badge bg-secondary rounded-pill px-2 py-1">${kamarGabung}</span></td>
          <td class="fw-bold text-dark">${s[5] || '-'}</td>
        </tr>`;
    });
  } else {
    html += `<tr><td colspan="3" class="text-center text-muted py-4">Tidak ada data santri untuk kelas binaan ini.</td></tr>`;
  }

  html += `</tbody></table></div>`;
  document.getElementById('detailContentAsatidz').innerHTML = html;
}

function setupDetailModalButtonsAsatidz() {
  const btnEdit = document.getElementById('btnEditDetailAsatidz');
  const btnHapus = document.getElementById('btnHapusDetailAsatidz');
  if (!btnEdit || !btnHapus) return;

  btnEdit.addEventListener('click', function () {
    if (!selectedRowDataAsatidz) return;
    isEditModeAsatidz = true;
    $('#detailModalAsatidz').modal('hide');
    document.querySelector('#inputModalAsatidz .modal-title').innerHTML = "<i class='bi bi-pencil-square me-2'></i> Edit Data Asatidz";
    document.getElementById('btnSubmitAsatidz').innerText = 'Update Data';

    const a = selectedRowDataAsatidz;
    const form = document.getElementById('inputFormAsatidz');
    form.reset();
    document.getElementById('id_asatidz_lama').value = a.id;
    form.nis.value = a.nis || '';

    let matchPrefix = String(a.nia || '').match(/^([A-Za-z])(\d*)$/);
    document.getElementById('nia_prefix').value = matchPrefix ? matchPrefix[1].toUpperCase() : '';
    form.nia.value = a.nia || '';
    form.nama_asatidz.value = a.nama_asatidz || '';
    form.pa_pi.value = a.pa_pi || '';
    form.tempat_lahir.value = a.tempat_lahir || '';
    forceSetSelect(document.getElementById('tgl_lahir_asatidz'), a.tgl_lahir);
    forceSetSelect(document.getElementById('bln_lahir_asatidz'), a.bln_lahir);
    forceSetSelect(document.getElementById('thn_lahir_asatidz'), a.thn_lahir);

    updateJahOptions(a.pa_pi);
    forceSetSelect(document.getElementById('jah_asatidz'), a.jah_asatidz);

    let gender = a.pa_pi;
    if (gender) {
      let tOpts = [...new Set(globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat_asatidz', tOpts);
    }
    forceSetSelect(document.getElementById('tingkat_asatidz'), a.tingkat_asatidz);

    if (a.tingkat_asatidz && gender) {
      let dkOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === a.tingkat_asatidz && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls_asatidz', dkOpts);
    }
    forceSetSelect(document.getElementById('din_kls_asatidz'), a.din_kls_asatidz);

    if (a.tingkat_asatidz && a.din_kls_asatidz && gender) {
      let dbOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === a.tingkat_asatidz && f.pa_pi === gender && f.din_kls === a.din_kls_asatidz).map(f => f.din_bag))];
      populateSelect('din_bag_asatidz', dbOpts);
    }
    forceSetSelect(document.getElementById('din_bag_asatidz'), a.din_bag_asatidz);

    form.lokasi_diniyyah.value = a.lokasi_diniyyah || '';
    form.lokasi_takror.value = a.lokasi_takror || '';

    forceSetSelect(document.getElementById('provinsi_asatidz'), a.provinsi);
    forceSetSelect(document.getElementById('kabupaten_asatidz'), a.kabupaten);
    forceSetSelect(document.getElementById('kecamatan_asatidz'), a.kecamatan);
    forceSetSelect(document.getElementById('desa_asatidz'), a.desa);
    form.dusun.value = a.dusun || '';

    const bVal = a.blok, aVal = a.asrama, kdVal = a.kode, kmVal = a.kamar;
    forceSetSelect(document.getElementById('blok_asatidz'), bVal);
    if (bVal && tree1Data[bVal]) populateSelect('asrama_asatidz', Object.keys(tree1Data[bVal]));
    forceSetSelect(document.getElementById('asrama_asatidz'), aVal);
    if (bVal && aVal && tree1Data[bVal]?.[aVal]) populateSelect('kode_asatidz', Object.keys(tree1Data[bVal][aVal]));
    forceSetSelect(document.getElementById('kode_asatidz'), kdVal);
    if (bVal && aVal && kdVal && tree1Data[bVal]?.[aVal]?.[kdVal]) populateSelect('kamar_asatidz', Object.keys(tree1Data[bVal][aVal][kdVal]));
    forceSetSelect(document.getElementById('kamar_asatidz'), kmVal);

    if (a.foto_asatidz) {
      setPreviewFotoAsatidz(a.foto_asatidz);
    } else {
      hapusFotoAsatidz();
    }

    $('#inputModalAsatidz').modal('show');
    $('#inputModalAsatidz .modal-body').scrollTop(0);
  });

  btnHapus.addEventListener('click', hapusAsatidz);
}

// =========================================================
// 8. KLIK BARIS -> MODAL DETAIL SANTRI (#detailModal)
// =========================================================
$(document).on('change', '#checkAll', function () {
  $('.row-check').prop('checked', this.checked);
});

$(document).off('click', '#dataTable tbody tr').on('click', '#dataTable tbody tr', function (e) {
  if ($(e.target).hasClass('row-check') || $(e.target).is(':checkbox') || $(this).find('.dataTables_empty').length > 0) {
    return;
  }

  let noInduk = $(this).find('.row-check').val();
  if (!noInduk) return;

  let santri = globalDataSantri.find(r => String(r[1]) === String(noInduk));
  if (!santri) return;

  // Simpan baris santri terpilih
  selectedRowData = [...santri];

  let ttl = `${santri[6] || '-'}, ${santri[7] || ''} ${santri[8] || ''} ${santri[9] || ''}`.trim();
  let alamat = `Dusun ${santri[10] || '-'}, Desa ${santri[11] || '-'}, Kec. ${santri[12] || '-'}, Kab. ${santri[13] || '-'}, Prov. ${santri[14] || '-'}`;
  let penempatan = `Blok ${santri[15] || '-'} - Asrama ${santri[16] || '-'} - Kode ${santri[17] || '-'} - Kamar ${santri[18] || '-'}`;

  let formalParts = [santri[23], santri[22], santri[21], santri[19], santri[20]]
    .map(s => (s || '').trim())
    .filter(s => s && s !== '-');
  let formal = formalParts.length > 0 ? formalParts.join(' - ') : '-';

  let diniyyahParts = [santri[24], santri[25], santri[26]]
    .map(s => (s || '').trim())
    .filter(s => s && s !== '-');
  let diniyyah = diniyyahParts.length > 0 ? diniyyahParts.join(' ') : '-';

  function buildDetailRow(label, value) {
    return `<div class="row mb-2">
      <div class="col-sm-4 text-muted">${label}</div>
      <div class="col-sm-8 text-dark"><span class="d-none d-sm-inline me-2">:</span> <span class="fw-bold">${value || '-'}</span></div>
    </div>`;
  }

let fotoSantriUrl = santri[35] || '';
  let fotoDetailHtml = fotoSantriUrl
    ? `<img src="${fotoSantriUrl}" alt="Foto ${santri[5] || 'Santri'}"
            style="width: 110px; height: 140px; object-fit: cover; border-radius: 12px; cursor: zoom-in;"
            class="border shadow-sm"
            title="Klik untuk memperbesar foto"
            onclick="window.lihatFotoSantri('${fotoSantriUrl.replace(/'/g, "\\'")}', '${(santri[5] || '').replace(/'/g, "\\'")}')">`
    : `<div class="d-flex flex-column align-items-center justify-content-center border rounded-3 bg-light text-muted shadow-sm"
            style="width: 110px; height: 140px;">
         <i class="bi bi-person-circle" style="font-size: 3rem;"></i>
         <span style="font-size: 11px;">Belum ada foto</span>
       </div>`;

  let html = `
    <div class="bg-white p-3 rounded border shadow-sm mb-3">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3">Identitas Santri</h6>
      <div class="row align-items-center">
        <div class="col-sm-3 text-center mb-3 mb-sm-0 d-flex justify-content-center">
          ${fotoDetailHtml}
        </div>
        <div class="col-sm-9">
          ${buildDetailRow('No. Induk / NISN', (santri[1] || '-') + ' / ' + (santri[3] || '-'))}
          ${buildDetailRow('Nama Lengkap', santri[5])}${buildDetailRow('Jenis Kelamin', santri[4] === 'PA' ? 'PA (Putra)' : (santri[4] === 'PI' ? 'PI (Putri)' : '-'))}
          ${buildDetailRow('Tempat, Tgl Lahir', ttl)}${buildDetailRow('NIK / No. KK', (santri[28] || '-') + ' / ' + (santri[29] || '-'))}
        </div>
      </div>
    </div>
    <div class="bg-white p-3 rounded border shadow-sm mb-3">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Alamat & Penempatan</h6>
      ${buildDetailRow('Penempatan Kamar', penempatan)}
      ${buildDetailRow('Alamat Lengkap', alamat)}
    </div>
    <div class="bg-white p-3 rounded border shadow-sm mb-3">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Pendidikan</h6>
      ${buildDetailRow('Sekolah Formal', formal)}
      ${buildDetailRow('Madrasah Diniyyah', diniyyah)}
      ${buildDetailRow('ORDA', santri[27])}
    </div>
    <div class="bg-white p-3 rounded border shadow-sm">
      <h6 class="text-success fw-bold border-bottom pb-2 mb-3 mt-2">Data Orang Tua / Wali</h6>
      ${buildDetailRow('Nama Ayah (BIN)', santri[30])}
      ${buildDetailRow('Nama Ibu (BINTI)', santri[32])}
      ${buildDetailRow('No. Telepon / HP', santri[34])}
    </div>
  `;

  document.getElementById('detailContent').innerHTML = html;
  $('#detailModal').modal('show');
});

function setupDetailModalButtons() {
  // Tombol Hapus di Modal Detail
  document.getElementById('btnHapusDetail').addEventListener('click', async function () {
    const noInduk = selectedRowData[1];
    const namaSantri = selectedRowData[5] || '';
    if (!noInduk) return;

    const confirmRes = await Swal.fire({
      title: 'Hapus Data Santri?',
      text: `Yakin ingin menghapus santri ${namaSantri} (No. Induk: ${noInduk})?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal'
    });

    if (!confirmRes.isConfirmed) return;

    const btn = this;
    const prevHtml = btn.innerHTML;
    btn.innerHTML = 'Menghapus...';
    btn.disabled = true;

    try {
      const { error } = await supabase.from('santri').delete().eq('no_induk', String(noInduk));
      if (error) throw error;

      await logActivity('HAPUS SANTRI', `Menghapus santri: ${namaSantri} (No. Induk: ${noInduk})`);
      const freshData = await fetchAllSantriFromSupabase();
      renderTable(freshData);
      $('#detailModal').modal('hide');
      Swal.fire('Terhapus!', 'Data santri berhasil dihapus.', 'success');
    } catch (err) {
      Swal.fire('Gagal Menghapus', err.message, 'error');
    } finally {
      btn.innerHTML = prevHtml;
      btn.disabled = false;
    }
  });

  // Tombol Edit Data di Modal Detail
  document.getElementById('btnEditDetail').addEventListener('click', function () {
    if (!selectedRowData || !selectedRowData[1]) return;
    isEditMode = true;
    $('#detailModal').modal('hide');

    document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-pencil-square me-2'></i> Edit Data Santri";
    document.getElementById('btnSubmit').innerText = 'Update Data';

    const form = document.getElementById('inputForm');
    form.reset();

    form.no_induk_lama.value = selectedRowData[1] || '';
    form.no_induk.value = selectedRowData[1] || '';
    form.no_biro.value = selectedRowData[2] || '';
    form.nisn.value = selectedRowData[3] || '';
    form.pa_pi.value = selectedRowData[4] || '';
    form.nama.value = selectedRowData[5] || '';
    form.tempat_lahir.value = selectedRowData[6] || '';
    forceSetSelect(form.tgl_lahir, selectedRowData[7]);
    forceSetSelect(form.bln_lahir, selectedRowData[8]);
    forceSetSelect(form.thn_lahir, selectedRowData[9]);

    form.dusun.value = selectedRowData[10] || '';
    forceSetSelect(form.provinsi, selectedRowData[14]);
    forceSetSelect(form.kabupaten, selectedRowData[13]);
    forceSetSelect(form.kecamatan, selectedRowData[12]);
    forceSetSelect(form.desa, selectedRowData[11]);

    // Populate opsi pohon hierarki jika tersedia lalu paksa pilih dengan forceSetSelect
    const bVal = selectedRowData[15], aVal = selectedRowData[16], kdVal = selectedRowData[17], kmVal = selectedRowData[18];
    forceSetSelect(form.blok, bVal);
    if (bVal && tree1Data[bVal]) populateSelect('asrama', Object.keys(tree1Data[bVal]));
    forceSetSelect(form.asrama, aVal);
    if (bVal && aVal && tree1Data[bVal]?.[aVal]) populateSelect('kode', Object.keys(tree1Data[bVal][aVal]));
    forceSetSelect(form.kode, kdVal);
    if (bVal && aVal && kdVal && tree1Data[bVal]?.[aVal]?.[kdVal]) populateSelect('kamar', Object.keys(tree1Data[bVal][aVal][kdVal]));
    forceSetSelect(form.kamar, kmVal);

    const uVal = selectedRowData[23], jVal = selectedRowData[22], sVal = selectedRowData[21], klVal = selectedRowData[19], bgVal = selectedRowData[20];
    forceSetSelect(form.unit, uVal);
    if (uVal && tree2Data[uVal]) populateSelect('jurusan', Object.keys(tree2Data[uVal]));
    forceSetSelect(form.jurusan, jVal);
    if (uVal && jVal && tree2Data[uVal]?.[jVal]) populateSelect('semester', Object.keys(tree2Data[uVal][jVal]));
    forceSetSelect(form.semester, sVal);
    if (uVal && jVal && sVal && tree2Data[uVal]?.[jVal]?.[sVal]) populateSelect('kelas', Object.keys(tree2Data[uVal][jVal][sVal]));
    forceSetSelect(form.kelas, klVal);
    if (uVal && jVal && sVal && klVal && tree2Data[uVal]?.[jVal]?.[sVal]?.[klVal]) populateSelect('bag', Object.keys(tree2Data[uVal][jVal][sVal][klVal]));
    forceSetSelect(form.bag, bgVal);

const tkVal = selectedRowData[26], dkVal = selectedRowData[24], dbVal = selectedRowData[25];
    let gender = form.pa_pi.value;
    if(gender) {
        let tOpts = [...new Set(globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
        populateSelect('tingkat', tOpts);
    }
    forceSetSelect(form.tingkat, tkVal);

    if (tkVal && gender) {
        let dkOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === tkVal && f.pa_pi === gender).map(f => f.din_kls))];
        populateSelect('din_kls', dkOpts);
    }
    forceSetSelect(form.din_kls, dkVal);

    if (tkVal && dkVal && gender) {
        let dbOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === tkVal && f.pa_pi === gender && f.din_kls === dkVal).map(f => f.din_bag))];
        populateSelect('din_bag', dbOpts);
    }
    forceSetSelect(form.din_bag, dbVal);

    form.orda.value = selectedRowData[27] || '';
    form.nik.value = selectedRowData[28] || '';
    form.no_kk.value = selectedRowData[29] || '';
    form.nama_ayah.value = selectedRowData[30] || '';
    form.nik_ayah.value = selectedRowData[31] || '';
    form.nama_ibu.value = selectedRowData[32] || '';
    form.nik_ibu.value = selectedRowData[33] || '';
    form.telepon.value = selectedRowData[34] || '';

    // Tampilkan foto santri yang tersimpan saat mode Edit
    setPreviewFotoSantri(selectedRowData[35] || '');

    $('#inputModal').modal('show');
  });
}

// =========================================================
// 9. CRUD FORM SANTRI, HAPUS MASSAL & IMPOR EXCEL
// =========================================================
function openAddModal() {
  isEditMode = false;
  document.getElementById('inputForm').reset();
  document.getElementById('no_induk_lama').value = '';
  hapusFotoSantri();
  resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
  document.querySelector('#inputModal .modal-title').innerHTML = "<i class='bi bi-person-plus-fill me-2'></i> Form Data Santri";
  document.getElementById('btnSubmit').innerText = 'Simpan Data';
  $('#inputModal').modal('show');
}

async function submitData(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnSubmit');
  const prevText = btnSubmit.innerText;
  btnSubmit.innerHTML = 'Menyimpan...';
  btnSubmit.disabled = true;

  const form = document.getElementById('inputForm');
  const payload = {};
  SANTRI_DB_FIELDS.forEach(field => {
    payload[field] = form[field] ? String(form[field].value || '').trim() : '';
  });
  payload.nama = payload.nama.toUpperCase();

  try {
    if (isEditMode) {
      const noIndukAcuan = String(form.no_induk_lama.value || payload.no_induk).trim();
      const { error } = await supabase
        .from('santri')
        .update(payload)
        .eq('no_induk', noIndukAcuan);

      if (error) throw error;
      await logActivity('UPDATE SANTRI', `Memperbarui data santri: ${payload.nama} (No. Induk: ${payload.no_induk})`);
    } else {
      const { error } = await supabase
        .from('santri')
        .insert([payload]);

      if (error) throw error;
      await logActivity('TAMBAH SANTRI', `Menambahkan santri: ${payload.nama} (No. Induk: ${payload.no_induk})`);
    }

    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    $('#inputModal').modal('hide');

    if (!isEditMode) {
      form.reset();
      resetSelects(['kabupaten', 'kecamatan', 'desa', 'asrama', 'kode', 'kamar', 'jurusan', 'semester', 'bag', 'kelas', 'din_bag', 'din_kls']);
    }

    Swal.fire({
      title: isEditMode ? 'Data Diperbarui!' : 'Data Tersimpan!',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menyimpan Data', err.message, 'error');
  } finally {
    btnSubmit.innerHTML = prevText;
    btnSubmit.disabled = false;
  }
}

async function hapusTerpilih() {
  let selected = [];
  $('.row-check:checked').each(function () {
    selected.push(String($(this).val()));
  });
  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data santri!', 'info');
  }

  const confirmRes = await Swal.fire({
    title: `Hapus ${selected.length} Santri?`,
    text: 'Data santri yang dicentang akan dihapus permanen dari database.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih',
    cancelButtonText: 'Batal'
  });

  if (!confirmRes.isConfirmed) return;

  $('#actionGroup button').prop('disabled', true);
  try {
    const { error } = await supabase.from('santri').delete().in('no_induk', selected);
    if (error) throw error;

    await logActivity('HAPUS BANYAK SANTRI', `Menghapus ${selected.length} santri terpilih`);
    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    $('#checkAll').prop('checked', false);
    Swal.fire('Berhasil!', `${selected.length} data santri berhasil dihapus.`, 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  } finally {
    $('#actionGroup button').prop('disabled', false);
  }
}

async function hapusSemuaData() {
  const firstConfirm = await Swal.fire({
    title: 'AWAS! Hapus SELURUH Data Santri?',
    text: 'Tindakan ini akan mengosongkan seluruh isi tabel santri di Supabase!',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Lanjutkan Konfirmasi Kedua',
    cancelButtonText: 'Batal'
  });
  if (!firstConfirm.isConfirmed) return;

  const secondConfirm = await Swal.fire({
    title: 'Konfirmasi Terakhir!',
    text: 'Ketik "HAPUS SEMUA" untuk mengonfirmasi pengosongan database santri:',
    input: 'text',
    inputPlaceholder: 'HAPUS SEMUA',
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    confirmButtonText: 'Kosongkan Database',
    cancelButtonText: 'Batal'
  });

  if (!secondConfirm.isConfirmed || secondConfirm.value !== 'HAPUS SEMUA') {
    return Swal.fire('Dibatalkan', 'Pengosongan database santri dibatalkan.', 'info');
  }

  $('#actionGroup button').prop('disabled', true);
  try {
    const { error } = await supabase.from('santri').delete().neq('no_induk', '');
    if (error) throw error;

    await logActivity('KOSONGKAN SANTRI', 'Menghapus SELURUH data santri di Database');
    const freshData = await fetchAllSantriFromSupabase();
    renderTable(freshData);
    Swal.fire('Database Dikosongkan', 'Seluruh data santri telah dihapus.', 'success');
  } catch (err) {
    Swal.fire('Gagal Mengosongkan Data', err.message, 'error');
  } finally {
    $('#actionGroup button').prop('disabled', false);
  }
}

function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const jsonArray = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

    // Buang baris header pertama
    let headerRow = [];
    if (jsonArray.length > 0) {
      headerRow = jsonArray.shift();
    }
    if (jsonArray.length === 0) {
      return Swal.fire('File Kosong', 'File Excel kosong atau tidak terbaca.', 'warning');
    }

    const importBtn = document.getElementById('btnImportExcelSantri');
    const originalText = importBtn.innerHTML;
    importBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Mengimpor...';
    importBtn.disabled = true;

    try {
      // Deteksi otomatis apakah kolom 0 di Excel adalah kolom "No" (35 kolom) atau langsung "No.Induk" (34 kolom)
      const firstHeaderCell = String(headerRow[0] || '').trim().toLowerCase();
      const hasLeadingNoColumn = (firstHeaderCell === 'no' || firstHeaderCell === 'no.' || firstHeaderCell === '' || (jsonArray[0] && jsonArray[0].length >= 35));
      const offset = hasLeadingNoColumn ? 1 : 0;

      const recordsMap = new Map();
      jsonArray.forEach(row => {
        if (!row || row.join('').trim() === '') return;
        const noInduk = String(row[offset] ?? '').trim();
        if (!noInduk) return;

        const record = {};
        SANTRI_DB_FIELDS.forEach((fieldName, idx) => {
          let val = row[idx + offset];
          record[fieldName] = val !== undefined && val !== null ? String(val).trim() : '';
        });
        record.nama = (record.nama || '').toUpperCase();
        recordsMap.set(noInduk, record);
      });

      const recordsToInsert = Array.from(recordsMap.values());
      if (recordsToInsert.length === 0) {
        throw new Error('Tidak ditemukan baris dengan No. Induk yang valid pada file Excel.');
      }

      // Bulk Upsert per 500 baris agar lancar untuk ribuan data
      const chunkSize = 500;
      for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
        const chunk = recordsToInsert.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('santri')
          .upsert(chunk, { onConflict: 'no_induk' });
        if (error) throw error;
      }

      await logActivity('IMPOR EXCEL SANTRI', `Mengimpor ${recordsToInsert.length} santri melalui file Excel`);
      const freshData = await fetchAllSantriFromSupabase();
      renderTable(freshData);
      Swal.fire('Impor Berhasil!', `${recordsToInsert.length} data santri berhasil diimpor ke Supabase.`, 'success');
    } catch (err) {
      Swal.fire('Gagal Impor Excel', err.message, 'error');
    } finally {
      importBtn.innerHTML = originalText;
      importBtn.disabled = false;
      document.getElementById('excelFileInput').value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// =========================================================
// 10. CASCADING WILAYAH (EMSIFA) & POHON HIERARKI DROPDOWN
// =========================================================
function forceSetSelect(selectElement, value) {
  if (!selectElement) return;
  if (!value || value === '-') {
    selectElement.value = '';
    return;
  }
  if (!Array.from(selectElement.options).some(opt => opt.value == value)) {
    selectElement.add(new Option(value, value, true, true));
  }
  selectElement.value = value;
  selectElement.disabled = false;
}

function populateSelect(id, optionsArray) {
  let sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">Pilih...</option>';
  if (optionsArray && optionsArray.length > 0) {
    sel.disabled = false;
    optionsArray.forEach(opt => sel.add(new Option(opt, opt)));
  } else {
    sel.disabled = true;
  }
}

function resetSelects(ids) {
  ids.forEach(id => {
    let sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = '<option value="">Pilih...</option>';
      sel.disabled = true;
    }
  });
}

function setupWilayahListeners() {
  document.getElementById('provinsi').addEventListener('change', function () {
    let kabSelect = document.getElementById('kabupaten');
    kabSelect.innerHTML = '<option value="">Memuat...</option>';
    kabSelect.disabled = true;
    resetSelects(['kecamatan', 'desa']);
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/regencies/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kabSelect.innerHTML = '<option value="">Pilih Kabupaten / Kota</option>';
        kabSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          kabSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kabupaten').addEventListener('change', function () {
    let kecSelect = document.getElementById('kecamatan');
    resetSelects(['kecamatan', 'desa']);
    kecSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/districts/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kecSelect.innerHTML = '<option value="">Pilih Kecamatan</option>';
        kecSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          kecSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kecamatan').addEventListener('change', function () {
    let desaSelect = document.getElementById('desa');
    resetSelects(['desa']);
    desaSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/villages/${id}.json`)
      .then(r => r.json())
      .then(data => {
        desaSelect.innerHTML = '<option value="">Pilih Desa / Kelurahan</option>';
        desaSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name;
          opt.dataset.id = x.id;
          opt.textContent = x.name;
          desaSelect.appendChild(opt);
        });
      });
  });
}

function parseHierarchyFromRules(rulesString) {
  let tree = {};
  try {
      if (!rulesString) return tree;
      let rules = JSON.parse(rulesString);
      if (!Array.isArray(rules)) throw new Error();

      const ROMANS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

      rules.forEach(rule => {
          // --- LOGIKA GENERATOR UNTUK TREE 2 (MULTI-LEVEL) ---
          if (rule.tree === 'tree2') {
              let unit = (rule.unit || '').trim();
              if (!unit) return; // Unit wajib diisi
              let jurusanRaw = (rule.jurusan || '').trim();
              let jurusans = jurusanRaw ? jurusanRaw.split(',').map(s=>s.trim()).filter(Boolean) : ['-'];

              // 1. Ekstrak Array Semester
              let semesters = [];
              if (rule.semesterType === 'numeric') {
                  let s1 = parseInt(rule.semesterNumStart) || 1; let s2 = parseInt(rule.semesterNumEnd) || 1;
                  if (s1 > s2) { let t = s1; s1 = s2; s2 = t; }
                  for(let i=s1; i<=s2; i++) semesters.push(String(i));
              } else { semesters = (rule.semesterManual || '').split(',').map(s=>s.trim()).filter(Boolean); }
              if (semesters.length === 0) semesters.push('-');

              // 2. Ekstrak Array Kelas Romawi
              let kelasArr = [];
              if (rule.kelasType === 'roman') {
                  let idx1 = ROMANS.indexOf(rule.kelasRomanStart || 'VII'); let idx2 = ROMANS.indexOf(rule.kelasRomanEnd || 'IX');
                  if(idx1 === -1) idx1 = 6; if(idx2 === -1) idx2 = 8;
                  if (idx1 > idx2) { let t = idx1; idx1 = idx2; idx2 = t; }
                  for(let i=idx1; i<=idx2; i++) kelasArr.push(ROMANS[i]);
              } else { kelasArr = (rule.kelasManual || '').split(',').map(s=>s.trim()).filter(Boolean); }
              if (kelasArr.length === 0) kelasArr.push('-');

              // 3. Ekstrak Array Bagian
              let bagArr = [];
              if (rule.bagType === 'numeric') {
                  let b1 = parseInt(rule.bagNumStart) || 1; let b2 = parseInt(rule.bagNumEnd) || 1;
                  if (b1 > b2) { let t = b1; b1 = b2; b2 = t; }
                  for(let i=b1; i<=b2; i++) bagArr.push(i < 10 ? '0'+i : String(i));
              } else if (rule.bagType === 'alpha') {
                  let b1 = String(rule.bagAlphaStart || 'A').toUpperCase().charCodeAt(0);
                  let b2 = String(rule.bagAlphaEnd || 'E').toUpperCase().charCodeAt(0);
                  if(b1 > b2) { let t = b1; b1 = b2; b2 = t; }
                  for(let i=b1; i<=b2; i++) bagArr.push(String.fromCharCode(i));
              } else { bagArr = (rule.bagManual || '').split(',').map(s=>s.trim()).filter(Boolean); }

              // 4. Rakit Nested Object / Hierarchy Loop
              if (!tree[unit]) tree[unit] = {};
              jurusans.forEach(jur => {
                  if (!tree[unit][jur]) tree[unit][jur] = {};
                  semesters.forEach(sem => {
                      if (!tree[unit][jur][sem]) tree[unit][jur][sem] = {};
                      kelasArr.forEach(kel => {
                          if (!tree[unit][jur][sem][kel]) tree[unit][jur][sem][kel] = {};
                          bagArr.forEach(bag => {
                              if (!tree[unit][jur][sem][kel][bag]) tree[unit][jur][sem][kel][bag] = {};
                          });
                      });
                  });
              });
          } 
          // --- LOGIKA GENERATOR UNTUK TREE 1 (TUNGGAL) ---
          else {
              let parentParts = (rule.parentPath || '').split('>').map(s => s.trim()).filter(s => s);
              let children = [];

              if (rule.type === 'numeric') {
                  let start = parseInt(rule.numStart) || 1; let end = parseInt(rule.numEnd) || 1;
                  if(start > end) { let temp = start; start = end; end = temp; }
                  for (let i = start; i <= end; i++) children.push(i < 10 ? '0' + i : String(i));
              } else if (rule.type === 'alpha') {
                  let start = String(rule.alphaStart || 'A').toUpperCase().charCodeAt(0);
                  let end = String(rule.alphaEnd || 'E').toUpperCase().charCodeAt(0);
                  if(start > end) { let temp = start; start = end; end = temp; }
                  for (let i = start; i <= end; i++) children.push(String.fromCharCode(i));
              } else { children = String(rule.manualList || '').split(',').map(s => s.trim()).filter(s => s); }

              if (parentParts.length === 0) {
                  children.forEach(c => { if (!tree[c]) tree[c] = {}; });
                  return;
              }
              let current = tree;
              for (let i = 0; i < parentParts.length; i++) {
                  let part = parentParts[i];
                  if (!current[part]) current[part] = {};
                  current = current[part];
              }
              children.forEach(c => { if (!current[c]) current[c] = {}; });
          }
      });
  } catch (e) {
      if (rulesString && typeof rulesString === 'string') {
          rulesString.split('\n').forEach(line => {
              let parts = line.split('>').map(s => s.trim()).filter(s => s);
              if (parts.length === 0) return;
              let current = tree;
              for (let i = 0; i < parts.length; i++) {
                  let part = parts[i];
                  if (!current[part]) current[part] = {};
                  current = current[part];
              }
          });
      }
  }
  return tree;
}

function applyTreeData(settings) {
  tree1Data = parseHierarchyFromRules(settings.tree1);
  tree2Data = parseHierarchyFromRules(settings.tree2);

  populateSelect('blok', Object.keys(tree1Data));
  populateSelect('blok_asatidz', Object.keys(tree1Data));
  populateSelect('unit', Object.keys(tree2Data));
}

function setupHierarchyListeners() {
  // Tree 1: Blok > Asrama > Kode > Kamar
  document.getElementById('blok').addEventListener('change', function () {
    resetSelects(['asrama', 'kode', 'kamar']);
    if (this.value && tree1Data[this.value]) populateSelect('asrama', Object.keys(tree1Data[this.value]));
  });
  document.getElementById('asrama').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value;
    resetSelects(['kode', 'kamar']);
    if (this.value && tree1Data[v1]?.[this.value]) populateSelect('kode', Object.keys(tree1Data[v1][this.value]));
  });
  document.getElementById('kode').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value, v2 = document.getElementById('asrama').value;
    resetSelects(['kamar']);
    if (this.value && tree1Data[v1]?.[v2]?.[this.value]) populateSelect('kamar', Object.keys(tree1Data[v1][v2][this.value]));
  });

  // Tree 2: Unit > Jurusan > Semester > Kelas > Bag
  document.getElementById('unit').addEventListener('change', function () {
    resetSelects(['jurusan', 'semester', 'kelas', 'bag']);
    if (this.value && tree2Data[this.value]) populateSelect('jurusan', Object.keys(tree2Data[this.value]));
  });
  document.getElementById('jurusan').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value;
    resetSelects(['semester', 'kelas', 'bag']);
    if (this.value && tree2Data[v1]?.[this.value]) populateSelect('semester', Object.keys(tree2Data[v1][this.value]));
  });
  document.getElementById('semester').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value;
    resetSelects(['kelas', 'bag']);
    if (this.value && tree2Data[v1]?.[v2]?.[this.value]) populateSelect('kelas', Object.keys(tree2Data[v1][v2][this.value]));
  });
  document.getElementById('kelas').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value, v3 = document.getElementById('semester').value;
    resetSelects(['bag']);
    if (this.value && tree2Data[v1]?.[v2]?.[v3]?.[this.value]) populateSelect('bag', Object.keys(tree2Data[v1][v2][v3][this.value]));
  });

// Tree 3: Formasi Kelas dari Database Supabase & Filter PA/PI
  const ppiSelect = document.querySelector('select[name="pa_pi"]');
  const tktSelect = document.getElementById('tingkat');
  const dkSelect = document.getElementById('din_kls');
  
  ppiSelect.addEventListener('change', function () {
    let gender = this.value;
    resetSelects(['tingkat', 'din_kls', 'din_bag']);
    if (gender) {
        let tOpts = [...new Set(globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
        populateSelect('tingkat', tOpts);
    }
  });

  tktSelect.addEventListener('change', function () {
    let gender = ppiSelect.value;
    resetSelects(['din_kls', 'din_bag']);
    if (this.value && gender) {
        let dkOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === this.value && f.pa_pi === gender).map(f => f.din_kls))];
        populateSelect('din_kls', dkOpts);
    }
  });

  dkSelect.addEventListener('change', function () {
    let gender = ppiSelect.value;
    let tk = tktSelect.value;
    resetSelects(['din_bag']);
    if (this.value && tk && gender) {
        let dbOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === tk && f.pa_pi === gender && f.din_kls === this.value).map(f => f.din_bag))];
        populateSelect('din_bag', dbOpts);
    }
  });
}

// >>> BARU: Cascading Wilayah Emsifa khusus Form Asatidz
function setupWilayahListenersAsatidz() {
  const provEl = document.getElementById('provinsi_asatidz');
  if (!provEl) return;

  provEl.addEventListener('change', function () {
    let kabSelect = document.getElementById('kabupaten_asatidz');
    kabSelect.innerHTML = '<option value="">Memuat...</option>';
    kabSelect.disabled = true;
    resetSelects(['kecamatan_asatidz', 'desa_asatidz']);
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/regencies/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kabSelect.innerHTML = '<option value="">Pilih Kabupaten / Kota</option>';
        kabSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name; opt.dataset.id = x.id; opt.textContent = x.name;
          kabSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kabupaten_asatidz').addEventListener('change', function () {
    let kecSelect = document.getElementById('kecamatan_asatidz');
    resetSelects(['kecamatan_asatidz', 'desa_asatidz']);
    kecSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/districts/${id}.json`)
      .then(r => r.json())
      .then(data => {
        kecSelect.innerHTML = '<option value="">Pilih Kecamatan</option>';
        kecSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name; opt.dataset.id = x.id; opt.textContent = x.name;
          kecSelect.appendChild(opt);
        });
      });
  });

  document.getElementById('kecamatan_asatidz').addEventListener('change', function () {
    let desaSelect = document.getElementById('desa_asatidz');
    resetSelects(['desa_asatidz']);
    desaSelect.innerHTML = '<option value="">Memuat...</option>';
    let id = this.options[this.selectedIndex]?.dataset?.id;
    if (!id) return;
    fetch(`${API_WILAYAH}/villages/${id}.json`)
      .then(r => r.json())
      .then(data => {
        desaSelect.innerHTML = '<option value="">Pilih Desa / Kelurahan</option>';
        desaSelect.disabled = false;
        data.forEach(x => {
          let opt = document.createElement('option');
          opt.value = x.name; opt.dataset.id = x.id; opt.textContent = x.name;
          desaSelect.appendChild(opt);
        });
      });
  });
}

// >>> BARU: Cascading Blok>Asrama>Kode>Kamar (reuse tree1Data) & Tingkat>DinKls>DinBag (reuse globalDataFormasi)
function setupHierarchyListenersAsatidz() {
  const blokEl = document.getElementById('blok_asatidz');
  if (!blokEl) return;

  blokEl.addEventListener('change', function () {
    resetSelects(['asrama_asatidz', 'kode_asatidz', 'kamar_asatidz']);
    if (this.value && tree1Data[this.value]) populateSelect('asrama_asatidz', Object.keys(tree1Data[this.value]));
  });
  document.getElementById('asrama_asatidz').addEventListener('change', function () {
    let v1 = document.getElementById('blok_asatidz').value;
    resetSelects(['kode_asatidz', 'kamar_asatidz']);
    if (this.value && tree1Data[v1]?.[this.value]) populateSelect('kode_asatidz', Object.keys(tree1Data[v1][this.value]));
  });
  document.getElementById('kode_asatidz').addEventListener('change', function () {
    let v1 = document.getElementById('blok_asatidz').value, v2 = document.getElementById('asrama_asatidz').value;
    resetSelects(['kamar_asatidz']);
    if (this.value && tree1Data[v1]?.[v2]?.[this.value]) populateSelect('kamar_asatidz', Object.keys(tree1Data[v1][v2][this.value]));
  });

  const ppiSelectA = document.getElementById('pa_pi_asatidz');
  const tktSelectA = document.getElementById('tingkat_asatidz');
  const dkSelectA = document.getElementById('din_kls_asatidz');

  ppiSelectA.addEventListener('change', function () {
    let gender = this.value;
    resetSelects(['tingkat_asatidz', 'din_kls_asatidz', 'din_bag_asatidz']);
    if (gender) {
      let tOpts = [...new Set(globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat_asatidz', tOpts);
    }
    updateJahOptions(gender);
  });
  tktSelectA.addEventListener('change', function () {
    let gender = ppiSelectA.value;
    resetSelects(['din_kls_asatidz', 'din_bag_asatidz']);
    if (this.value && gender) {
      let dkOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === this.value && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls_asatidz', dkOpts);
    }
  });
  dkSelectA.addEventListener('change', function () {
    let gender = ppiSelectA.value;
    let tk = tktSelectA.value;
    resetSelects(['din_bag_asatidz']);
    if (this.value && tk && gender) {
      let dbOpts = [...new Set(globalDataFormasi.filter(f => f.tingkat === tk && f.pa_pi === gender && f.din_kls === this.value).map(f => f.din_bag))];
      populateSelect('din_bag_asatidz', dbOpts);
    }
  });
}

// >>> BARU: Dropdown JAH dinamis berdasarkan PA/PI
function updateJahOptions(gender) {
  const jahSelect = document.getElementById('jah_asatidz');
  if (!jahSelect) return;
  jahSelect.innerHTML = '<option value="">Pilih Jah...</option>';
  if (gender === 'PA') {
    ['Mustahiq', 'Munawib', 'TU', 'TOP', 'KS', 'TOP & Koor', 'MS & Koor', 'MB & TOP', 'TU & MB', 'MB & Media', 'KA.KES', 'BT', "ISTI'DAD"]
      .forEach(opt => jahSelect.add(new Option(opt, opt)));
    jahSelect.disabled = false;
  } else if (gender === 'PI') {
    ['Mustahiqoh', 'Munawibah', 'TU', 'TOP', 'KS', 'TM & MB', 'BT', "ISTI'DAD"]
      .forEach(opt => jahSelect.add(new Option(opt, opt)));
    jahSelect.disabled = false;
  } else {
    jahSelect.innerHTML = '<option value="">Pilih PA/PI Dahulu...</option>';
    jahSelect.disabled = true;
  }
}

// >>> BARU: NIA Otomatis (cari nomor tertinggi per prefix huruf)
function getNextNiaNumber(prefix) {
  prefix = String(prefix || '').trim().toUpperCase();
  if (!prefix) return '';
  let maxNum = 0;
  globalDataAsatidz.forEach(row => {
    let nia = String(row.nia || '').trim().toUpperCase();
    if (nia.length > prefix.length && nia.substring(0, prefix.length) === prefix) {
      let num = parseInt(nia.substring(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return prefix + (maxNum + 1);
}

function generateNIA() {
  const prefix = document.getElementById('nia_prefix').value;
  const niaInput = document.getElementById('nia_asatidz');
  if (!prefix) { niaInput.value = ''; return; }
  niaInput.value = getNextNiaNumber(prefix);
}

async function saveSettingsData() {
  const btn = document.getElementById('btnSaveSettings');
  btn.innerHTML = 'Menyimpan...';
  btn.disabled = true;

  try {
    // EKSTRAKSI DIMASUKKAN KE DALAM TRY-CATCH agar tidak freeze jika ada data yang crash
    appSettingsGlobal.tree1 = window.extractRulesFromUI('tree1');
    appSettingsGlobal.tree2 = window.extractRulesFromUI('tree2');

    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: 'APP_SETTINGS', value: appSettingsGlobal }], { onConflict: 'key' });

    if (error) throw error;

    await logActivity('SIMPAN PENGATURAN', 'Memperbarui konfigurasi sistem atau hierarki dropdown');
    applyTreeData(appSettingsGlobal);
    $('#settingsModal').modal('hide');
    Swal.fire('Berhasil!', 'Pengaturan Hierarki Dropdown Berhasil Disimpan!', 'success');
  } catch (err) {
    Swal.fire('Gagal Menyimpan Pengaturan', err.message || 'Terjadi kesalahan pada data input.', 'error');
  } finally {
    btn.innerHTML = 'Simpan Pengaturan';
    btn.disabled = false;
  }
}

// =========================================================
// 11. AUDIT LOG VIEWER (TABEL `activity_logs`)
// =========================================================
async function loadAuditLogs() {
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
          <td class="text-nowrap text-secondary">${waktuWIB}</td>
          <td class="fw-bold">${item.username || '-'}</td>
          <td>${item.nama || '-'}</td>
          <td><span class="badge bg-secondary">${item.aktivitas || '-'}</span></td>
          <td><small>${item.detail || '-'}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Gagal memuat log: ${err.message}</td></tr>`;
  }
}

// --- [PATOKAN ATAS: Akhir fungsi loadAuditLogs() - JANGAN DIHAPUS] ---
// } catch (err) {
//   tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-danger">Gagal memuat log: ${err.message}</td></tr>`;
// }
// }

// =========================================================
// 12. MODUL INPUT, KOMPRESI & PREVIEW FOTO (SANTRI & ASATIDZ)
// =========================================================
function compressImageFileSantri(file, maxDim = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getCameraStreamSafe() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
  } catch (e) {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function restoreBootstrapModalScroll() {
  setTimeout(() => {
    const modalSantri = document.getElementById('inputModal');
    const modalAsatidz = document.getElementById('inputModalAsatidz');
    if (modalSantri && modalSantri.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
    if (modalAsatidz && modalAsatidz.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
  }, 100);
}

// --- A. FOTO SANTRI ---
function setPreviewFotoSantri(dataUrl) {
  const inputHidden = document.getElementById('foto_santri');
  const previewImg = document.getElementById('preview_foto_santri');
  const placeholder = document.getElementById('placeholder_foto_santri');
  const btnHapus = document.getElementById('btnHapusFotoSantri');
  const statusEl = document.getElementById('statusFotoSantri');

  if (!inputHidden || !previewImg || !placeholder) return;

  if (dataUrl && String(dataUrl).trim() !== '') {
    inputHidden.value = dataUrl;
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
    if (btnHapus) btnHapus.classList.remove('d-none');
    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Foto siap disimpan.</span>';
  } else {
    hapusFotoSantri();
  }
}

async function handleFotoSantriSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    event.target.value = '';
    return;
  }

  const statusEl = document.getElementById('statusFotoSantri');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-1"></span> Mengompres & menyiapkan foto...';
  }

  try {
    const compressedBase64 = await compressImageFileSantri(file, 600, 0.75);
    setPreviewFotoSantri(compressedBase64);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses foto.</span>';
  }

  event.target.value = '';
}

function hapusFotoSantri() {
  const inputHidden = document.getElementById('foto_santri');
  const previewImg = document.getElementById('preview_foto_santri');
  const placeholder = document.getElementById('placeholder_foto_santri');
  const btnHapus = document.getElementById('btnHapusFotoSantri');
  const statusEl = document.getElementById('statusFotoSantri');

  if (inputHidden) inputHidden.value = '';
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnHapus) btnHapus.classList.add('d-none');
  if (statusEl) statusEl.innerText = 'Belum ada foto dipilih (Otomatis dikompresi agar ringan).';
}

async function bukaKameraSantri() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('inputCameraFotoSantri').click();
    return;
  }

  let stream = null;
  try {
    stream = await getCameraStreamSafe();
  } catch (err) {
    document.getElementById('inputCameraFotoSantri').click();
    return;
  }

  try {
    const result = await Swal.fire({
      title: 'Ambil Foto Santri',
      html: `
        <div class="d-flex flex-column align-items-center">
          <video id="webcamVideoSantri" autoplay playsinline muted style="width: 100%; max-width: 360px; border-radius: 12px; background: #000;"></video>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-camera-fill me-1"></i> Ambil Foto',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0f766e',
      didOpen: () => {
        const videoEl = document.getElementById('webcamVideoSantri');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
      },
      preConfirm: () => {
        const videoEl = document.getElementById('webcamVideoSantri');
        if (!videoEl) return null;
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = videoEl.videoWidth || 640;
        let h = videoEl.videoHeight || 480;
        if (w > h && w > maxDim) {
          h = Math.round(h * (maxDim / w));
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round(w * (maxDim / h));
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.75);
      },
      willClose: () => {
        if (stream) stream.getTracks().forEach(track => track.stop());
        restoreBootstrapModalScroll();
      }
    });

    if (result.isConfirmed && result.value) {
      setPreviewFotoSantri(result.value);
    }
  } catch (err) {
    if (stream) stream.getTracks().forEach(track => track.stop());
    restoreBootstrapModalScroll();
  }
}

window.bukaKameraSantri = bukaKameraSantri;

function lihatFotoSantri(url, namaSantri) {
  if (!url) return;
  Swal.fire({
    title: namaSantri || 'Foto Santri',
    imageUrl: url,
    imageAlt: namaSantri || 'Foto Santri',
    showConfirmButton: true,
    confirmButtonText: 'Tutup',
    confirmButtonColor: '#0f766e'
  });
}

// --- B. FOTO ASATIDZ (KOMPRESI BASE64 LANGSUNG TANPA BUCKET STORAGE) ---
function setPreviewFotoAsatidz(dataUrl) {
  const hidden = document.getElementById('foto_asatidz');
  const preview = document.getElementById('preview_foto_asatidz');
  const placeholder = document.getElementById('placeholder_foto_asatidz');
  const btnHapus = document.getElementById('btnHapusFotoAsatidz');
  const statusEl = document.getElementById('statusFotoAsatidz');

  if (!hidden || !preview || !placeholder) return;

  if (dataUrl && String(dataUrl).trim() !== '') {
    hidden.value = dataUrl;
    preview.src = dataUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    if (btnHapus) btnHapus.classList.remove('d-none');
    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Foto siap disimpan.</span>';
  } else {
    hapusFotoAsatidz();
  }
}

async function handleFotoAsatidzSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire('Format Tidak Didukung', 'Pilih file berupa gambar (JPG/PNG/WEBP).', 'warning');
    event.target.value = '';
    return;
  }

  const statusEl = document.getElementById('statusFotoAsatidz');
  if (statusEl) {
    statusEl.innerHTML = '<span class="spinner-border spinner-border-sm text-success me-1"></span> Mengompres & menyiapkan foto...';
  }

  try {
    const compressedBase64 = await compressImageFileSantri(file, 600, 0.75);
    setPreviewFotoAsatidz(compressedBase64);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses foto.</span>';
  }

  event.target.value = '';
}

function hapusFotoAsatidz() {
  const hidden = document.getElementById('foto_asatidz');
  const preview = document.getElementById('preview_foto_asatidz');
  const placeholder = document.getElementById('placeholder_foto_asatidz');
  const btnHapus = document.getElementById('btnHapusFotoAsatidz');
  const statusEl = document.getElementById('statusFotoAsatidz');

  if (hidden) hidden.value = '';
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnHapus) btnHapus.classList.add('d-none');
  if (statusEl) statusEl.innerText = 'Belum ada foto dipilih (Otomatis dikompresi agar ringan).';
}

async function bukaKameraAsatidz() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('inputCameraFotoAsatidz').click();
    return;
  }

  let stream = null;
  try {
    stream = await getCameraStreamSafe();
  } catch (err) {
    document.getElementById('inputCameraFotoAsatidz').click();
    return;
  }

  try {
    const result = await Swal.fire({
      title: 'Ambil Foto Asatidz',
      html: `
        <div class="d-flex flex-column align-items-center">
          <video id="webcamVideoAsatidz" autoplay playsinline muted style="width:100%;max-width:360px;border-radius:12px;background:#000;"></video>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="bi bi-camera-fill me-1"></i> Ambil Foto',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0f766e',
      didOpen: () => {
        const videoEl = document.getElementById('webcamVideoAsatidz');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
      },
      preConfirm: () => {
        const videoEl = document.getElementById('webcamVideoAsatidz');
        if (!videoEl) return null;
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = videoEl.videoWidth || 640;
        let h = videoEl.videoHeight || 480;
        if (w > h && w > maxDim) {
          h = Math.round(h * (maxDim / w));
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round(w * (maxDim / h));
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.75);
      },
      willClose: () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        restoreBootstrapModalScroll();
      }
    });

    if (result.isConfirmed && result.value) {
      setPreviewFotoAsatidz(result.value);
    }
  } catch (err) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    restoreBootstrapModalScroll();
  }
}

window.bukaKameraAsatidz = bukaKameraAsatidz;

function lihatFotoAsatidz(url) {
  if (!url) return;
  Swal.fire({
    imageUrl: url,
    imageAlt: 'Foto Asatidz',
    showConfirmButton: true,
    confirmButtonText: 'Tutup',
    confirmButtonColor: '#0f766e'
  });
}

// --- [PATOKAN BAWAH: Awal CRUD Data Asatidz - JANGAN DIHAPUS] ---
// =========================================================
// >>> BARU: CRUD DATA ASATIDZ (TAMBAH, UPDATE, HAPUS)
// =========================================================
// function openAddModalAsatidz() {

// Pastikan seluruh fungsi foto terekspos ke window
Object.assign(window, {
  bukaKameraSantri,
  handleFotoSantriSelected,
  hapusFotoSantri,
  lihatFotoSantri,
  bukaKameraAsatidz,
  handleFotoAsatidzSelected,
  hapusFotoAsatidz,
  lihatFotoAsatidz
});

// =========================================================
// >>> BARU: CRUD DATA ASATIDZ (TAMBAH, UPDATE, HAPUS)
// =========================================================
function openAddModalAsatidz() {
  isEditModeAsatidz = false;
  selectedRowDataAsatidz = null;
  const form = document.getElementById('inputFormAsatidz');
  form.reset();
  document.getElementById('id_asatidz_lama').value = '';
  document.getElementById('nia_prefix').value = '';
  hapusFotoAsatidz();
  resetSelects(['din_kls_asatidz', 'din_bag_asatidz', 'tingkat_asatidz',
    'kabupaten_asatidz', 'kecamatan_asatidz', 'desa_asatidz',
    'asrama_asatidz', 'kode_asatidz', 'kamar_asatidz']);
  document.getElementById('jah_asatidz').innerHTML = '<option value="">Pilih PA/PI Dahulu...</option>';
  document.getElementById('jah_asatidz').disabled = true;
  document.querySelector('#inputModalAsatidz .modal-title').innerHTML = "<i class='bi bi-person-plus-fill me-2'></i> Form Data Asatidz";
  document.getElementById('btnSubmitAsatidz').innerText = 'Simpan Data';
  $('#inputModalAsatidz').modal('show');
}

async function submitAsatidzData(e) {
  e.preventDefault();
  const btnSubmit = document.getElementById('btnSubmitAsatidz');
  const prevText = btnSubmit.innerText;
  btnSubmit.innerHTML = 'Menyimpan...';
  btnSubmit.disabled = true;

  const form = document.getElementById('inputFormAsatidz');
  const payload = {};
  ASATIDZ_DB_FIELDS.forEach(field => {
    payload[field] = form[field] ? String(form[field].value || '').trim() : '';
  });
  payload.nama_asatidz = payload.nama_asatidz.toUpperCase();

  try {
    if (isEditModeAsatidz && selectedRowDataAsatidz) {
      const { error } = await supabase
        .from('asatidz')
        .update(payload)
        .eq('id', selectedRowDataAsatidz.id);
      if (error) throw error;
      await logActivity('UPDATE ASATIDZ', `Memperbarui data Asatidz: ${payload.nama_asatidz}`);
    } else {
      const { error } = await supabase.from('asatidz').insert([payload]);
      if (error) throw error;
      await logActivity('TAMBAH ASATIDZ', `Menambahkan Asatidz: ${payload.nama_asatidz}`);
    }

    globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(globalDataAsatidz);
    $('#inputModalAsatidz').modal('hide');

    Swal.fire({
      title: isEditModeAsatidz ? 'Data Diperbarui!' : 'Data Tersimpan!',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false
    });
  } catch (err) {
    Swal.fire('Gagal Menyimpan Data', err.message, 'error');
  } finally {
    btnSubmit.innerHTML = prevText;
    btnSubmit.disabled = false;
  }
}

async function hapusAsatidz() {
  if (!selectedRowDataAsatidz) return;
  const namaAsatidz = selectedRowDataAsatidz.nama_asatidz || '';

  const confirmRes = await Swal.fire({
    title: 'Hapus Data Asatidz?',
    text: `Yakin ingin menghapus Asatidz ${namaAsatidz}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });
  if (!confirmRes.isConfirmed) return;

  try {
    const { error } = await supabase.from('asatidz').delete().eq('id', selectedRowDataAsatidz.id);
    if (error) throw error;
    await logActivity('HAPUS ASATIDZ', `Menghapus Asatidz: ${namaAsatidz}`);
    globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(globalDataAsatidz);
    $('#detailModalAsatidz').modal('hide');
    Swal.fire('Terhapus!', 'Data Asatidz berhasil dihapus.', 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  }
}

async function hapusTerpilihAsatidz() {
  let selected = [];
  $('.row-check-asatidz:checked').each(function () {
    selected.push($(this).val());
  });
  if (selected.length === 0) {
    return Swal.fire('Perhatian', 'Centang minimal satu data Asatidz!', 'info');
  }

  const confirmRes = await Swal.fire({
    title: `Hapus ${selected.length} Asatidz?`,
    text: 'Data yang dicentang akan dihapus permanen dari database.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus Terpilih',
    cancelButtonText: 'Batal'
  });
  if (!confirmRes.isConfirmed) return;

  try {
    const { error } = await supabase.from('asatidz').delete().in('id', selected);
    if (error) throw error;
    await logActivity('HAPUS BANYAK ASATIDZ', `Menghapus ${selected.length} data Asatidz terpilih`);
    globalDataAsatidz = await fetchAllAsatidzFromSupabase();
    renderTableAsatidz(globalDataAsatidz);
    $('#checkAllAsatidz').prop('checked', false);
    Swal.fire('Berhasil!', `${selected.length} data Asatidz berhasil dihapus.`, 'success');
  } catch (err) {
    Swal.fire('Gagal Menghapus', err.message, 'error');
  }
}

// Ekspos fungsi ke global `window` agar dapat dipanggil dari atribut onclick HTML
Object.assign(window, {
  toggleSidebar,
  showPage,
  actionLogout,
  actionLoadSantri,
  openAddModal,
  submitData,
  hapusTerpilih,
  hapusSemuaData,
  handleExcelImport,
  checkAllHide,
  applyHideColumns,
  applyFilters,
  resetFilters,
  saveSettingsData,
  loadAuditLogs,
  handleFotoSantriSelected,
  hapusFotoSantri,
  lihatFotoSantri,
  loadFormasiData,
  openAddFormasiModal,
  submitFormasiData,
  hapusFormasi,
  showDetailFormasi,
  editFormasi,
  hapusFormasiTerpilih,
  // >>> BARU: Ekspos fungsi Data Asatidz
  actionLoadAsatidz,
  openAddModalAsatidz,
  submitAsatidzData,
  hapusAsatidz,
  hapusTerpilihAsatidz,
  checkAllHideAsatidz,
  applyHideColumnsAsatidz,
  applyFiltersAsatidz,
  resetFiltersAsatidz,
  generateNIA,
  handleFotoAsatidzSelected,
  hapusFotoAsatidz,
  bukaKameraAsatidz,
  lihatFotoAsatidz
});

// =========================================================
// 13. CRUD FORMASI KELAS (DINAMIS DARI DATABASE)
// =========================================================
let dtFormasi = null;

async function loadFormasiData() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
          .from('formasi_kelas')
          .select('*')
          .order('tingkat').order('din_kls').order('din_bag');
        if (error) throw error;
        globalDataFormasi = data || [];
        
        if(document.getElementById('tableBodyFormasi')){
            renderTableFormasi(globalDataFormasi);
        }
    } catch (err) {
        console.error("Gagal memuat Formasi Kelas:", err.message);
    }
}

function renderTableFormasi(data) {
    if (dtFormasi) {
        dtFormasi.destroy();
        $('#dataTableFormasi').empty();
    }

    // Pastikan header tabel digambar ulang dengan 11 kolom
    $('#dataTableFormasi').html(`
        <thead class="table-light">
          <tr>
            <th class="text-center" style="width: 40px;"><input type="checkbox" id="checkAllFormasi" class="form-check-input"></th>
            <th>Tingkat</th>
            <th>Kelas</th>
            <th>Bagian</th>
            <th>Gender</th>
            <th>Kapasitas</th>
            <th>Wali Kelas</th>
            <th>Domisili</th>
            <th>Lokal Takror</th>
            <th>Lokasi Diniyyah</th>
            <th class="text-center">Aksi</th>
          </tr>
        </thead>
        <tbody id="tableBodyFormasi"></tbody>
    `);

    let html = '';
    data.forEach(f => {
        let badgeUg = f.is_unggulan ? '<span class="badge bg-warning text-dark border ms-2 shadow-sm"><i class="bi bi-star-fill"></i> Unggulan</span>' : '';
        let genderB = f.pa_pi === 'PA' ? '<span class="text-primary fw-bold">PA</span>' : '<span class="text-danger fw-bold">PI</span>';
        
        html += `
        <tr style="cursor: pointer;">
            <td class="text-center" onclick="event.stopPropagation();"><input type="checkbox" class="row-check-formasi form-check-input" value="${f.id}"></td>
            <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.tingkat}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.din_kls}</td>
            <td class="fw-bold row-klik-formasi" data-id="${f.id}">${f.din_bag} ${badgeUg}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${genderB}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.kapasitas_maksimal}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.id_mustahiq || '-'}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.domisili || '-'}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.lokasi_takror || '-'}</td>
            <td class="row-klik-formasi" data-id="${f.id}">${f.lokasi_diniyyah || '-'}</td>
            <td class="text-center" onclick="event.stopPropagation();">
                <button class="btn btn-sm btn-outline-warning border-0" onclick="window.editFormasi('${f.id}')" title="Edit"><i class="bi bi-pencil-square"></i></button>
                <button class="btn btn-sm btn-outline-danger border-0" onclick="window.hapusFormasi('${f.id}')" title="Hapus"><i class="bi bi-trash"></i></button>
            </td>
        </tr>`;
    });
    
    $('#tableBodyFormasi').html(html);

// Inisialisasi DataTables dengan Toolbar (Filter, Sembunyikan, Hapus)
    dtFormasi = $('#dataTableFormasi').DataTable({
         scrollX: true,
         pageLength: 25,
         autoWidth: true, /* PERBAIKAN: Harus ditambahkan agar lurus dengan Header */
         language: { search: 'Cari Kelas:' },
         columnDefs: [
             { searchable: false, orderable: false, targets: [0, 10] }
         ],
initComplete: function () {
            if ($('#actionGroupFormasi').length === 0) {
                $('#dataTableFormasi_filter').addClass('d-flex justify-content-end align-items-center gap-2 flex-wrap');
                $('#dataTableFormasi_filter label').addClass('mb-0 d-flex align-items-center gap-2');

                let actionBtns = $(`
                <div class="d-flex gap-2 flex-nowrap" id="actionGroupFormasi">
                    <div class="dropdown">
                    <button class="btn btn-outline-danger btn-sm dropdown-toggle text-nowrap border-0" type="button" data-bs-toggle="dropdown">
                        <i class="bi bi-trash"></i> Hapus
                    </button>
                    <ul class="dropdown-menu shadow-sm border-0">
                        <li><a class="dropdown-item" href="#" onclick="window.hapusFormasiTerpilih(); return false;"><i class="bi bi-check2-square text-danger me-2"></i> Hapus Terpilih</a></li>
                    </ul>
                    </div>
                    <button type="button" class="btn btn-outline-secondary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#hideFormasiModal"><i class="bi bi-eye-slash"></i> Sembunyikan</button>
                    <button type="button" class="btn btn-outline-primary btn-sm text-nowrap border-0" data-bs-toggle="modal" data-bs-target="#filterFormasiModal"><i class="bi bi-funnel"></i> Filter</button>
                </div>
                `);
                $('#dataTableFormasi_filter').prepend(actionBtns);
            }
         }
    });

    // Mencegah masalah misalignment (menyelaraskan header dan body setelah render selesai)
    setTimeout(() => {
        if (dtFormasi) dtFormasi.columns.adjust().draw(false);
    }, 300);

    // Menangani Event Klik pada baris untuk menampilkan Detail
    $('.row-klik-formasi').on('click', function() {
        window.showDetailFormasi($(this).data('id'));
    });

    // Menangani Event Checkbox All
    $('#checkAllFormasi').on('change', function() {
        $('.row-check-formasi').prop('checked', this.checked);
    });
}

function openAddFormasiModal() {
    document.getElementById('formasiForm').reset();
    document.getElementById('f_id').value = '';
    document.querySelector('#formasiModal .modal-title').innerHTML = '<i class="bi bi-building-add me-2"></i> Formasi Kelas Baru';
    $('#formasiModal').modal('show');
}

async function submitFormasiData(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitFormasi');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
    
    const form = e.target;
    const payload = {
        tingkat: form.f_tingkat.value,
        din_kls: form.f_din_kls.value,
        din_bag: form.f_din_bag.value,
        pa_pi: form.f_pa_pi.value,
        is_unggulan: form.f_is_unggulan.checked,
        kapasitas_maksimal: parseInt(form.f_kapasitas_maksimal.value) || 40,
        id_mustahiq: form.f_id_mustahiq.value,
        domisili: form.f_domisili.value,
        lokasi_takror: form.f_lokasi_takror.value,
        lokasi_diniyyah: form.f_lokasi_diniyyah.value
    };
    
    try {
        const f_id = form.f_id.value;
        if (f_id) {
             const { error } = await supabase.from('formasi_kelas').update(payload).eq('id', f_id);
             if (error) { if(error.code === '23505') throw new Error("Kombinasi Tingkat, Kelas, Bagian, dan Gender duplikat!"); throw error; }
             await logActivity('UPDATE FORMASI', `Memperbarui formasi kelas: ${payload.tingkat} ${payload.din_kls} - ${payload.din_bag}`);
             Swal.fire('Diperbarui!', 'Formasi Kelas Berhasil Diperbarui', 'success');
        } else {
             const { error } = await supabase.from('formasi_kelas').insert([payload]);
             if (error) { if(error.code === '23505') throw new Error("Kombinasi Tingkat, Kelas, Bagian, dan Gender duplikat!"); throw error; }
             await logActivity('TAMBAH FORMASI', `Membuat kelas baru: ${payload.tingkat} ${payload.din_kls} - ${payload.din_bag}`);
             Swal.fire('Berhasil!', 'Formasi Blueprint Kelas Berhasil Dibuat', 'success');
        }
        $('#formasiModal').modal('hide');
        await loadFormasiData();
    } catch (err) {
        Swal.fire('Gagal Menyimpan', err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerText = "Simpan Formasi";
    }
}

function showDetailFormasi(id) {
    let f = globalDataFormasi.find(x => x.id === id);
    if (!f) return;
    
    let html = `
    <div class="row mb-2"><div class="col-sm-4 text-muted">Tingkat</div><div class="col-sm-8 fw-bold">: ${f.tingkat}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Kelas / Bagian</div><div class="col-sm-8 fw-bold">: ${f.din_kls} - ${f.din_bag} ${f.is_unggulan ? '<span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i> Unggulan</span>' : ''}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Gender</div><div class="col-sm-8 fw-bold">: ${f.pa_pi}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Kapasitas Maksimal</div><div class="col-sm-8 fw-bold">: ${f.kapasitas_maksimal} Santri</div></div>
    <div class="row mb-2 mt-3"><div class="col-sm-4 text-muted">Wali Kelas</div><div class="col-sm-8 fw-bold">: ${f.id_mustahiq || '-'}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Domisili</div><div class="col-sm-8 fw-bold">: ${f.domisili || '-'}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Lokal Takror</div><div class="col-sm-8 fw-bold">: ${f.lokasi_takror || '-'}</div></div>
    <div class="row mb-2"><div class="col-sm-4 text-muted">Lokasi Diniyyah</div><div class="col-sm-8 fw-bold">: ${f.lokasi_diniyyah || '-'}</div></div>
    `;
    
    document.getElementById('detailFormasiContent').innerHTML = html;
    
    // Setel ulang fungsi tombol pada Modal Detail
    document.getElementById('btnHapusDetailFormasi').onclick = function() {
        $('#detailFormasiModal').modal('hide');
        window.hapusFormasi(id);
    };
    document.getElementById('btnEditDetailFormasi').onclick = function() {
        $('#detailFormasiModal').modal('hide');
        window.editFormasi(id);
    };
    
    $('#detailFormasiModal').modal('show');
}

function editFormasi(id) {
    let f = globalDataFormasi.find(x => x.id === id);
    if (!f) return;
    
    const form = document.getElementById('formasiForm');
    form.f_id.value = f.id;
    form.f_tingkat.value = f.tingkat;
    form.f_din_kls.value = f.din_kls;
    form.f_din_bag.value = f.din_bag;
    form.f_pa_pi.value = f.pa_pi;
    form.f_is_unggulan.checked = f.is_unggulan;
    form.f_kapasitas_maksimal.value = f.kapasitas_maksimal;
    form.f_id_mustahiq.value = f.id_mustahiq || '';
    form.f_domisili.value = f.domisili || '';
    form.f_lokasi_takror.value = f.lokasi_takror || '';
    form.f_lokasi_diniyyah.value = f.lokasi_diniyyah || '';
    
    document.querySelector('#formasiModal .modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i> Edit Formasi Kelas';
    $('#formasiModal').modal('show');
}

async function hapusFormasi(id) {
     const res = await Swal.fire({
        title: 'Hapus Blueprint Kelas?',
        text: 'Menghapus formasi tidak akan menghapus data santri di dalamnya.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya, Hapus Kelas!'
      });
      if (!res.isConfirmed) return;

      try {
          const { error } = await supabase.from('formasi_kelas').delete().eq('id', id);
          if (error) throw error;
          await logActivity('HAPUS FORMASI', `Menghapus blueprint kelas (ID: ${id})`);
          Swal.fire('Terhapus', 'Formasi kelas telah dihapus.', 'success');
          await loadFormasiData();
      } catch (err) {
          Swal.fire('Error', err.message, 'error');
      }
}

async function hapusFormasiTerpilih() {
    let selected = [];
    $('.row-check-formasi:checked').each(function () {
        selected.push($(this).val());
    });
    if (selected.length === 0) {
        return Swal.fire('Perhatian', 'Centang minimal satu data formasi!', 'info');
    }

    const res = await Swal.fire({
        title: `Hapus ${selected.length} Formasi?`,
        text: 'Data yang dicentang akan dihapus permanen.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya, Hapus Terpilih'
    });
    if (!res.isConfirmed) return;

    try {
        const { error } = await supabase.from('formasi_kelas').delete().in('id', selected);
        if (error) throw error;
        await logActivity('HAPUS BANYAK FORMASI', `Menghapus ${selected.length} formasi kelas`);
        Swal.fire('Berhasil!', `${selected.length} formasi berhasil dihapus.`, 'success');
        await loadFormasiData();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
}

// =========================================================
// EKSPOR SEMUA FUNGSI KE GLOBAL WINDOW
// =========================================================
Object.assign(window, {
  toggleSidebar,
  showPage,
  actionLogout,
  actionLoadSantri,
  openAddModal,
  submitData,
  hapusTerpilih,
  hapusSemuaData,
  handleExcelImport,
  checkAllHide,
  applyHideColumns,
  applyFilters,
  resetFilters,
  saveSettingsData,
  loadAuditLogs,
  handleFotoSantriSelected,
  hapusFotoSantri,
  lihatFotoSantri,
  loadFormasiData,
  openAddFormasiModal,
  submitFormasiData,
  hapusFormasi,
  showDetailFormasi,
  editFormasi,
  hapusFormasiTerpilih,
  checkAllHideFormasi,
  applyHideColumnsFormasi,
  applyFiltersFormasi,
  resetFiltersFormasi,
  // >>> BARU: Ekspos fungsi Data Asatidz (duplikasi aman karena Object.assign idempotent)
  actionLoadAsatidz,
  openAddModalAsatidz,
  submitAsatidzData,
  hapusAsatidz,
  hapusTerpilihAsatidz,
  checkAllHideAsatidz,
  applyHideColumnsAsatidz,
  applyFiltersAsatidz,
  resetFiltersAsatidz,
  generateNIA,
  handleFotoAsatidzSelected,
  hapusFotoAsatidz,
  bukaKameraAsatidz,
  lihatFotoAsatidz
});
