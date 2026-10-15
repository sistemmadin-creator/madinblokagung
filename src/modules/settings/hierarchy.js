import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { populateSelect, resetSelects } from '../../utils/dom.js';
import { logActivity } from '../audit/audit.js';

// =========================================================
// STRUCTURED UI BUILDER ACCORDION (V4 - COLLAPSIBLE) & HIERARKI
// =========================================================
export function addRuleRow(treeId, data = null) {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'card border border-secondary border-opacity-25 shadow-sm rule-row bg-white mb-2 overflow-hidden';
  const rowId = 'collapse_' + Date.now() + Math.floor(Math.random() * 1000);

  if (treeId === 'tree1') {
    let parentPath = (data && data.parentPath) ? data.parentPath : '';
    let type = (data && data.type) ? data.type : 'numeric';

    row.innerHTML = `
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
    toggleRuleType(row.querySelector('.rule-type'), data);

  } else if (treeId === 'tree2') {
    let unit = data?.unit || '';
    let jurusan = data?.jurusan || '';
    let semType = data?.semesterType || 'numeric';
    let kelType = data?.kelasType || 'roman';
    let bagType = data?.bagType || 'alpha';

    row.innerHTML = `
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
    toggleT2(row.querySelector('.t2-sem-type'), 'sem', data);
    toggleT2(row.querySelector('.t2-kel-type'), 'kel', data);
    toggleT2(row.querySelector('.t2-bag-type'), 'bag', data);
  }
}

// Helper untuk membaca Blok & Asrama (tree1) atau Unit & Jurusan (tree2)
function extractRuleFields(rowEl, treeId) {
  const previewText = (rowEl.querySelector('.preview-content')?.innerText || '').trim();

  if (treeId === 'tree1') {
    const parentVal = (rowEl.querySelector('.rule-parent')?.value || '').trim();
    const parts = parentVal.split('>').map(s => s.trim()).filter(Boolean);
    const blok = parts[0] || '';
    const asrama = parts[1] || '';
    return {
      blok,
      asrama,
      fullText: `${parentVal} ${previewText}`.toLowerCase()
    };
  } else {
    const unit = (rowEl.querySelector('.t2-unit')?.value || '').trim();
    const jurusanRaw = (rowEl.querySelector('.t2-jurusan')?.value || '').trim();
    const jurusanList = jurusanRaw
      ? jurusanRaw.split(',').map(j => j.trim()).filter(Boolean)
      : [];
    return {
      unit,
      jurusanRaw,
      jurusanList,
      fullText: `${unit} ${jurusanRaw} ${previewText}`.toLowerCase()
    };
  }
}

export function populateTreeFilterDropdown(treeId) {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;
  const rows = container.querySelectorAll('.rule-row');

  if (treeId === 'tree1') {
    const selBlok = document.getElementById('filter_tree1_blok');
    const selAsrama = document.getElementById('filter_tree1_asrama');
    if (!selBlok || !selAsrama) return;

    const currentBlok = selBlok.value;
    const currentAsrama = selAsrama.value;
    const blokSet = new Set();
    const asramaSet = new Set();

    rows.forEach(r => {
      const { blok, asrama } = extractRuleFields(r, 'tree1');
      if (blok) blokSet.add(blok);
      if (asrama && (!currentBlok || blok === currentBlok)) {
        asramaSet.add(asrama);
      }
    });

    selBlok.innerHTML = '<option value="">Semua Blok</option>';
    Array.from(blokSet).sort().forEach(b => selBlok.add(new Option(b, b, false, b === currentBlok)));

    selAsrama.innerHTML = '<option value="">Semua Asrama</option>';
    Array.from(asramaSet).sort().forEach(a => selAsrama.add(new Option(a, a, false, a === currentAsrama)));
  } else if (treeId === 'tree2') {
    const selUnit = document.getElementById('filter_tree2_unit');
    const selJurusan = document.getElementById('filter_tree2_jurusan');
    if (!selUnit || !selJurusan) return;

    const currentUnit = selUnit.value;
    const currentJurusan = selJurusan.value;
    const unitSet = new Set();
    const jurusanSet = new Set();

    rows.forEach(r => {
      const { unit, jurusanList } = extractRuleFields(r, 'tree2');
      if (unit) unitSet.add(unit);
      if (!currentUnit || unit === currentUnit) {
        jurusanList.forEach(j => {
          if (j && j !== '-') jurusanSet.add(j);
        });
      }
    });

    selUnit.innerHTML = '<option value="">Semua Unit</option>';
    Array.from(unitSet).sort().forEach(u => selUnit.add(new Option(u, u, false, u === currentUnit)));

    selJurusan.innerHTML = '<option value="">Semua Jurusan</option>';
    Array.from(jurusanSet).sort().forEach(j => selJurusan.add(new Option(j, j, false, j === currentJurusan)));
  }
}

export function onTreeFilterChange(treeId, changedLevel) {
  if (treeId === 'tree1' && changedLevel === 'blok') {
    const selAsrama = document.getElementById('filter_tree1_asrama');
    if (selAsrama) selAsrama.value = '';
    populateTreeFilterDropdown('tree1');
  } else if (treeId === 'tree2' && changedLevel === 'unit') {
    const selJurusan = document.getElementById('filter_tree2_jurusan');
    if (selJurusan) selJurusan.value = '';
    populateTreeFilterDropdown('tree2');
  }
  const searchVal = document.getElementById(`search_${treeId}`)?.value || '';
  filterRules(treeId, searchVal);
}

export function resetTreeFilter(treeId) {
  if (treeId === 'tree1') {
    const selBlok = document.getElementById('filter_tree1_blok');
    const selAsrama = document.getElementById('filter_tree1_asrama');
    if (selBlok) selBlok.value = '';
    if (selAsrama) selAsrama.value = '';
  } else if (treeId === 'tree2') {
    const selUnit = document.getElementById('filter_tree2_unit');
    const selJurusan = document.getElementById('filter_tree2_jurusan');
    if (selUnit) selUnit.value = '';
    if (selJurusan) selJurusan.value = '';
  }
  const searchInput = document.getElementById(`search_${treeId}`);
  if (searchInput) searchInput.value = '';
  filterRules(treeId, '');
}

export function filterRules(treeId, keyword = '') {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;

  const term = (keyword || document.getElementById(`search_${treeId}`)?.value || '').toLowerCase().trim();
  const rows = container.querySelectorAll('.rule-row');

  if (treeId === 'tree1') {
    const fBlok = (document.getElementById('filter_tree1_blok')?.value || '').trim();
    const fAsrama = (document.getElementById('filter_tree1_asrama')?.value || '').trim();

    rows.forEach(row => {
      const { blok, asrama, fullText } = extractRuleFields(row, 'tree1');
      const matchBlok = !fBlok || blok === fBlok;
      const matchAsrama = !fAsrama || asrama === fAsrama;
      const matchTerm = !term || fullText.includes(term);
      row.style.display = (matchBlok && matchAsrama && matchTerm) ? '' : 'none';
    });
  } else if (treeId === 'tree2') {
    const fUnit = (document.getElementById('filter_tree2_unit')?.value || '').trim();
    const fJurusan = (document.getElementById('filter_tree2_jurusan')?.value || '').trim();

    rows.forEach(row => {
      const { unit, jurusanList, fullText } = extractRuleFields(row, 'tree2');
      const matchUnit = !fUnit || unit === fUnit;
      const matchJurusan = !fJurusan || jurusanList.includes(fJurusan);
      const matchTerm = !term || fullText.includes(term);
      row.style.display = (matchUnit && matchJurusan && matchTerm) ? '' : 'none';
    });
  }
}

export function toggleRuleType(selectEl, data = null) {
  const container = selectEl.closest('.rule-row').querySelector('.rule-inputs-container');
  const type = selectEl.value;
  let numStart = (data && data.numStart !== undefined) ? data.numStart : 1;
  let numEnd = (data && data.numEnd !== undefined) ? data.numEnd : 10;
  let alphaStart = (data && data.alphaStart) ? data.alphaStart : 'A';
  let alphaEnd = (data && data.alphaEnd) ? data.alphaEnd : 'E';
  let manualList = (data && data.manualList) ? data.manualList : '';

  if (type === 'numeric') {
    container.innerHTML = `<div class="row g-2"><div class="col-6"><label class="form-label small text-muted mb-1">Awal</label><input type="number" class="form-control form-control-sm rule-num-start" value="${numStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><label class="form-label small text-muted mb-1">Akhir</label><input type="number" class="form-control form-control-sm rule-num-end" value="${numEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
  } else if (type === 'alpha') {
    container.innerHTML = `<div class="row g-2"><div class="col-6"><label class="form-label small text-muted mb-1">Awal</label><input type="text" maxlength="1" class="form-control form-control-sm rule-alpha-start text-uppercase" value="${alphaStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><label class="form-label small text-muted mb-1">Akhir</label><input type="text" maxlength="1" class="form-control form-control-sm rule-alpha-end text-uppercase" value="${alphaEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
  } else {
    let safeManualList = String(manualList).replace(/"/g, '&quot;');
    container.innerHTML = `<div><label class="form-label small text-muted mb-1">Ketik Daftar Teks</label><input type="text" class="form-control form-control-sm rule-manual font-monospace" placeholder="Kamar Mandi, Gudang" value="${safeManualList}" oninput="window.updateRulePreview(this)"></div>`;
  }
  updateRulePreview(selectEl);
}

export function toggleT2(selectEl, level, data = null) {
  const container = selectEl.closest('.row').querySelector(`.t2-${level}-container`);
  const type = selectEl.value;

  if (level === 'sem') {
    let sStart = data?.semesterNumStart ?? 1;
    let sEnd = data?.semesterNumEnd ?? 2;
    let sMan = data?.semesterManual ?? '';
    if (type === 'numeric') {
      container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="number" class="form-control form-control-sm t2-sem-start" value="${sStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="number" class="form-control form-control-sm t2-sem-end" value="${sEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
    } else {
      container.innerHTML = `<input type="text" class="form-control form-control-sm t2-sem-manual" placeholder="Ganjil, Genap" value="${sMan}" oninput="window.updateRulePreview(this)">`;
    }
  } else if (level === 'kel') {
    let kStart = data?.kelasRomanStart ?? 'VII';
    let kEnd = data?.kelasRomanEnd ?? 'IX';
    let kMan = data?.kelasManual ?? '';
    const roms = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    if (type === 'roman') {
      let optStart = roms.map(r => `<option value="${r}" ${r===kStart?'selected':''}>${r}</option>`).join('');
      let optEnd = roms.map(r => `<option value="${r}" ${r===kEnd?'selected':''}>${r}</option>`).join('');
      container.innerHTML = `<div class="row g-1"><div class="col-6"><select class="form-select form-select-sm t2-kel-start" onchange="window.updateRulePreview(this)">${optStart}</select></div><div class="col-6"><select class="form-select form-select-sm t2-kel-end" onchange="window.updateRulePreview(this)">${optEnd}</select></div></div>`;
    } else {
      container.innerHTML = `<input type="text" class="form-control form-control-sm t2-kel-manual" placeholder="Amtsilati, Takhasus" value="${kMan}" oninput="window.updateRulePreview(this)">`;
    }
  } else if (level === 'bag') {
    let bNumStart = data?.bagNumStart ?? 1;
    let bNumEnd = data?.bagNumEnd ?? 10;
    let bAlphaStart = data?.bagAlphaStart ?? 'A';
    let bAlphaEnd = data?.bagAlphaEnd ?? 'E';
    let bMan = data?.bagManual ?? '';
    if (type === 'numeric') {
      container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="number" class="form-control form-control-sm t2-bag-num-start" value="${bNumStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="number" class="form-control form-control-sm t2-bag-num-end" value="${bNumEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
    } else if (type === 'alpha') {
      container.innerHTML = `<div class="row g-1"><div class="col-6"><input type="text" maxlength="1" class="form-control form-control-sm t2-bag-alpha-start text-uppercase" value="${bAlphaStart}" oninput="window.updateRulePreview(this)"></div><div class="col-6"><input type="text" maxlength="1" class="form-control form-control-sm t2-bag-alpha-end text-uppercase" value="${bAlphaEnd}" oninput="window.updateRulePreview(this)"></div></div>`;
    } else {
      container.innerHTML = `<input type="text" class="form-control form-control-sm t2-bag-manual" placeholder="Khusus, Pagi" value="${bMan}" oninput="window.updateRulePreview(this)">`;
    }
  }
  updateRulePreview(selectEl);
}

export function updateRulePreview(element) {
  const row = element.closest('.rule-row');
  if (!row) return;

  const previewEl = row.querySelector('.preview-content');
  const isTree2 = row.querySelector('.t2-unit') !== null;

  if (!isTree2) {
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
    let unit = row.querySelector('.t2-unit')?.value || '<em class="text-danger">Unit?</em>';
    let jurRaw = (row.querySelector('.t2-jurusan')?.value || '').trim();
    let jurTxt = (jurRaw && jurRaw !== '-') ? jurRaw : '-';
    let kType = row.querySelector('.t2-kel-type')?.value;
    let kTxt = kType === 'roman' ? `${row.querySelector('.t2-kel-start')?.value || '?'} s/d ${row.querySelector('.t2-kel-end')?.value || '?'}` : 'Manual';
    previewEl.innerHTML = `<span class="fw-bold text-dark">${unit}</span> <span class="badge bg-light text-dark border ms-1">Jurusan: ${jurTxt}</span> <span class="badge bg-light text-dark border ms-1">Kls: ${kTxt}</span>`;
  }
}

export function extractRulesFromUI(treeId) {
  let rules = [];
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return JSON.stringify(rules);

  const rows = container.querySelectorAll('.rule-row');
  rows.forEach(row => {
    if (treeId === 'tree1') {
      rules.push({
        tree: 'tree1',
        parentPath: row.querySelector('.rule-parent')?.value || '',
        type: row.querySelector('.rule-type')?.value || 'numeric',
        numStart: row.querySelector('.rule-num-start')?.value || 1,
        numEnd: row.querySelector('.rule-num-end')?.value || 10,
        alphaStart: row.querySelector('.rule-alpha-start')?.value || 'A',
        alphaEnd: row.querySelector('.rule-alpha-end')?.value || 'E',
        manualList: row.querySelector('.rule-manual')?.value || ''
      });
    } else if (treeId === 'tree2') {
      rules.push({
        tree: 'tree2',
        unit: row.querySelector('.t2-unit')?.value || '',
        jurusan: row.querySelector('.t2-jurusan')?.value || '',
        semesterType: row.querySelector('.t2-sem-type')?.value || 'numeric',
        semesterNumStart: row.querySelector('.t2-sem-start')?.value || 1,
        semesterNumEnd: row.querySelector('.t2-sem-end')?.value || 2,
        semesterManual: row.querySelector('.t2-sem-manual')?.value || '',
        kelasType: row.querySelector('.t2-kel-type')?.value || 'roman',
        kelasRomanStart: row.querySelector('.t2-kel-start')?.value || 'VII',
        kelasRomanEnd: row.querySelector('.t2-kel-end')?.value || 'IX',
        kelasManual: row.querySelector('.t2-kel-manual')?.value || '',
        bagType: row.querySelector('.t2-bag-type')?.value || 'alpha',
        bagNumStart: row.querySelector('.t2-bag-num-start')?.value || 1,
        bagNumEnd: row.querySelector('.t2-bag-num-end')?.value || 10,
        bagAlphaStart: row.querySelector('.t2-bag-alpha-start')?.value || 'A',
        bagAlphaEnd: row.querySelector('.t2-bag-alpha-end')?.value || 'E',
        bagManual: row.querySelector('.t2-bag-manual')?.value || ''
      });
    }
  });
  return JSON.stringify(rules);
}

export function renderBuilderUI(treeId, jsonString) {
  const container = document.getElementById(`builder-${treeId}`);
  if (!container) return;
  container.innerHTML = '';
  try {
    if (!jsonString) { addRuleRow(treeId); return; }
    let rules = JSON.parse(jsonString);
    if (!Array.isArray(rules)) throw new Error();
    if (rules.length === 0) addRuleRow(treeId);
    else rules.forEach(rule => addRuleRow(treeId, rule));
  } catch (e) {
    if (jsonString && String(jsonString).trim() !== '' && treeId === 'tree1') {
      addRuleRow(treeId, { parentPath: '', type: 'manual', manualList: String(jsonString).split('\n').join(', ') });
    } else {
      addRuleRow(treeId);
    }
  }
}

export async function fetchSettingsFromSupabase() {
  if (!supabase) return store.appSettingsGlobal;
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
  return store.appSettingsGlobal;
}

export function parseHierarchyFromRules(rulesString) {
  let tree = {};
  try {
    if (!rulesString) return tree;
    let rules = JSON.parse(rulesString);
    if (!Array.isArray(rules)) throw new Error();

    const ROMANS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

    rules.forEach(rule => {
      if (rule.tree === 'tree2') {
        let unit = (rule.unit || '').trim();
        if (!unit) return;
        let jurusanRaw = (rule.jurusan || '').trim();
        let jurusans = jurusanRaw ? jurusanRaw.split(',').map(s => s.trim()).filter(Boolean) : ['-'];

        let semesters = [];
        if (rule.semesterType === 'numeric') {
          let s1 = parseInt(rule.semesterNumStart) || 1;
          let s2 = parseInt(rule.semesterNumEnd) || 1;
          if (s1 > s2) { let t = s1; s1 = s2; s2 = t; }
          for (let i = s1; i <= s2; i++) semesters.push(String(i));
        } else {
          semesters = (rule.semesterManual || '').split(',').map(s => s.trim()).filter(Boolean);
        }
        if (semesters.length === 0) semesters.push('-');

        let kelasArr = [];
        if (rule.kelasType === 'roman') {
          let idx1 = ROMANS.indexOf(rule.kelasRomanStart || 'VII');
          let idx2 = ROMANS.indexOf(rule.kelasRomanEnd || 'IX');
          if (idx1 === -1) idx1 = 6;
          if (idx2 === -1) idx2 = 8;
          if (idx1 > idx2) { let t = idx1; idx1 = idx2; idx2 = t; }
          for (let i = idx1; i <= idx2; i++) kelasArr.push(ROMANS[i]);
        } else {
          kelasArr = (rule.kelasManual || '').split(',').map(s => s.trim()).filter(Boolean);
        }
        if (kelasArr.length === 0) kelasArr.push('-');

        let bagArr = [];
        if (rule.bagType === 'numeric') {
          let b1 = parseInt(rule.bagNumStart) || 1;
          let b2 = parseInt(rule.bagNumEnd) || 1;
          if (b1 > b2) { let t = b1; b1 = b2; b2 = t; }
          for (let i = b1; i <= b2; i++) bagArr.push(i < 10 ? '0' + i : String(i));
        } else if (rule.bagType === 'alpha') {
          let b1 = String(rule.bagAlphaStart || 'A').toUpperCase().charCodeAt(0);
          let b2 = String(rule.bagAlphaEnd || 'E').toUpperCase().charCodeAt(0);
          if (b1 > b2) { let t = b1; b1 = b2; b2 = t; }
          for (let i = b1; i <= b2; i++) bagArr.push(String.fromCharCode(i));
        } else {
          bagArr = (rule.bagManual || '').split(',').map(s => s.trim()).filter(Boolean);
        }

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
      } else {
        let parentParts = (rule.parentPath || '').split('>').map(s => s.trim()).filter(s => s);
        let children = [];

        if (rule.type === 'numeric') {
          let start = parseInt(rule.numStart) || 1;
          let end = parseInt(rule.numEnd) || 1;
          if (start > end) { let temp = start; start = end; end = temp; }
          for (let i = start; i <= end; i++) children.push(i < 10 ? '0' + i : String(i));
        } else if (rule.type === 'alpha') {
          let start = String(rule.alphaStart || 'A').toUpperCase().charCodeAt(0);
          let end = String(rule.alphaEnd || 'E').toUpperCase().charCodeAt(0);
          if (start > end) { let temp = start; start = end; end = temp; }
          for (let i = start; i <= end; i++) children.push(String.fromCharCode(i));
        } else {
          children = String(rule.manualList || '').split(',').map(s => s.trim()).filter(s => s);
        }

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

export function applyTreeData(settings) {
  store.tree1Data = parseHierarchyFromRules(settings.tree1);
  store.tree2Data = parseHierarchyFromRules(settings.tree2);

  populateSelect('blok', Object.keys(store.tree1Data));
  populateSelect('blok_asatidz', Object.keys(store.tree1Data));
  populateSelect('unit', Object.keys(store.tree2Data));
}

export function updateJahOptions(gender) {
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

export function setupHierarchyListeners() {
  document.getElementById('blok').addEventListener('change', function () {
    resetSelects(['asrama', 'kode', 'kamar']);
    if (this.value && store.tree1Data[this.value]) populateSelect('asrama', Object.keys(store.tree1Data[this.value]));
  });
  document.getElementById('asrama').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value;
    resetSelects(['kode', 'kamar']);
    if (this.value && store.tree1Data[v1]?.[this.value]) populateSelect('kode', Object.keys(store.tree1Data[v1][this.value]));
  });
  document.getElementById('kode').addEventListener('change', function () {
    let v1 = document.getElementById('blok').value, v2 = document.getElementById('asrama').value;
    resetSelects(['kamar']);
    if (this.value && store.tree1Data[v1]?.[v2]?.[this.value]) populateSelect('kamar', Object.keys(store.tree1Data[v1][v2][this.value]));
  });

  document.getElementById('unit').addEventListener('change', function () {
    resetSelects(['jurusan', 'semester', 'kelas', 'bag']);
    if (this.value && store.tree2Data[this.value]) populateSelect('jurusan', Object.keys(store.tree2Data[this.value]));
  });
  document.getElementById('jurusan').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value;
    resetSelects(['semester', 'kelas', 'bag']);
    if (this.value && store.tree2Data[v1]?.[this.value]) populateSelect('semester', Object.keys(store.tree2Data[v1][this.value]));
  });
  document.getElementById('semester').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value;
    resetSelects(['kelas', 'bag']);
    if (this.value && store.tree2Data[v1]?.[v2]?.[this.value]) populateSelect('kelas', Object.keys(store.tree2Data[v1][v2][this.value]));
  });
  document.getElementById('kelas').addEventListener('change', function () {
    let v1 = document.getElementById('unit').value, v2 = document.getElementById('jurusan').value, v3 = document.getElementById('semester').value;
    resetSelects(['bag']);
    if (this.value && store.tree2Data[v1]?.[v2]?.[v3]?.[this.value]) populateSelect('bag', Object.keys(store.tree2Data[v1][v2][v3][this.value]));
  });

  const ppiSelect = document.querySelector('select[name="pa_pi"]');
  const tktSelect = document.getElementById('tingkat');
  const dkSelect = document.getElementById('din_kls');

  ppiSelect.addEventListener('change', function () {
    let gender = this.value;
    resetSelects(['tingkat', 'din_kls', 'din_bag']);
    if (gender) {
      let tOpts = [...new Set(store.globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat', tOpts);
    }
  });

  tktSelect.addEventListener('change', function () {
    let gender = ppiSelect.value;
    resetSelects(['din_kls', 'din_bag']);
    if (this.value && gender) {
      let dkOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === this.value && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls', dkOpts);
    }
  });

  dkSelect.addEventListener('change', function () {
    let gender = ppiSelect.value;
    let tk = tktSelect.value;
    resetSelects(['din_bag']);
    if (this.value && tk && gender) {
      let dbOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === tk && f.pa_pi === gender && f.din_kls === this.value).map(f => f.din_bag))];
      populateSelect('din_bag', dbOpts);
    }
  });
}

export function setupHierarchyListenersAsatidz() {
  const blokEl = document.getElementById('blok_asatidz');
  if (!blokEl) return;

  blokEl.addEventListener('change', function () {
    resetSelects(['asrama_asatidz', 'kode_asatidz', 'kamar_asatidz']);
    if (this.value && store.tree1Data[this.value]) populateSelect('asrama_asatidz', Object.keys(store.tree1Data[this.value]));
  });
  document.getElementById('asrama_asatidz').addEventListener('change', function () {
    let v1 = document.getElementById('blok_asatidz').value;
    resetSelects(['kode_asatidz', 'kamar_asatidz']);
    if (this.value && store.tree1Data[v1]?.[this.value]) populateSelect('kode_asatidz', Object.keys(store.tree1Data[v1][this.value]));
  });
  document.getElementById('kode_asatidz').addEventListener('change', function () {
    let v1 = document.getElementById('blok_asatidz').value, v2 = document.getElementById('asrama_asatidz').value;
    resetSelects(['kamar_asatidz']);
    if (this.value && store.tree1Data[v1]?.[v2]?.[this.value]) populateSelect('kamar_asatidz', Object.keys(store.tree1Data[v1][v2][this.value]));
  });

  const ppiSelectA = document.getElementById('pa_pi_asatidz');
  const tktSelectA = document.getElementById('tingkat_asatidz');
  const dkSelectA = document.getElementById('din_kls_asatidz');

  ppiSelectA.addEventListener('change', function () {
    let gender = this.value;
    resetSelects(['tingkat_asatidz', 'din_kls_asatidz', 'din_bag_asatidz']);
    if (gender) {
      let tOpts = [...new Set(store.globalDataFormasi.filter(f => f.pa_pi === gender).map(f => f.tingkat))];
      populateSelect('tingkat_asatidz', tOpts);
    }
    updateJahOptions(gender);
  });
  tktSelectA.addEventListener('change', function () {
    let gender = ppiSelectA.value;
    resetSelects(['din_kls_asatidz', 'din_bag_asatidz']);
    if (this.value && gender) {
      let dkOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === this.value && f.pa_pi === gender).map(f => f.din_kls))];
      populateSelect('din_kls_asatidz', dkOpts);
    }
  });
  dkSelectA.addEventListener('change', function () {
    let gender = ppiSelectA.value;
    let tk = tktSelectA.value;
    resetSelects(['din_bag_asatidz']);
    if (this.value && tk && gender) {
      let dbOpts = [...new Set(store.globalDataFormasi.filter(f => f.tingkat === tk && f.pa_pi === gender && f.din_kls === this.value).map(f => f.din_bag))];
      populateSelect('din_bag_asatidz', dbOpts);
    }
  });
}

export async function saveSettingsData() {
  const btn = document.getElementById('btnSaveSettings');
  btn.innerHTML = 'Menyimpan...';
  btn.disabled = true;

  try {
    store.appSettingsGlobal.tree1 = extractRulesFromUI('tree1');
    store.appSettingsGlobal.tree2 = extractRulesFromUI('tree2');

    const { error } = await supabase
      .from('app_settings')
      .upsert([{ key: 'APP_SETTINGS', value: store.appSettingsGlobal }], { onConflict: 'key' });

    if (error) throw error;

    await logActivity('SIMPAN PENGATURAN', 'Memperbarui konfigurasi sistem atau hierarki dropdown');
    applyTreeData(store.appSettingsGlobal);
    $('#settingsModal').modal('hide');
    Swal.fire('Berhasil!', 'Pengaturan Hierarki Dropdown Berhasil Disimpan!', 'success');
  } catch (err) {
    Swal.fire('Gagal Menyimpan Pengaturan', err.message || 'Terjadi kesalahan pada data input.', 'error');
  } finally {
    btn.innerHTML = 'Simpan Pengaturan';
    btn.disabled = false;
  }
}
