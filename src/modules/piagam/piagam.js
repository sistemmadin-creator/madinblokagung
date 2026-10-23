import { supabase } from '../../lib/supabase.js';
import { store } from '../../state/store.js';
import { logActivity } from '../audit/audit.js';

// ============================================================================
// KONSTANTA & KONFIGURASI MODUL PIAGAM
// ============================================================================
const KEY_DB_PIAGAM_TEMPLATES = 'PIAGAM_TEMPLATES_CONFIG';
const LS_PIAGAM_TEMPLATES = 'MADIN_PIAGAM_TEMPLATES';

// Daftar font pilihan yang aman dan cocok untuk Piagam & Syahadah
export const PIAGAM_FONT_OPTIONS = [
  { label: 'Playfair Display (Serif Elegan)', value: "'Playfair Display', serif" },
  { label: 'Cinzel (Serif Klasik Formal)', value: "'Cinzel', serif" },
  { label: 'Times New Roman (Serif Standar)', value: "'Times New Roman', serif" },
  { label: 'Merriweather (Serif Hangat)', value: "'Merriweather', serif" },
  { label: 'Amiri (Gaya Kaligrafi Naskh)', value: "'Amiri', serif" },
  { label: 'Scheherazade New (Arab Tradisional)', value: "'Scheherazade New', serif" },
  { label: 'Inter (Sans Modern Bersih)', value: "'Inter', sans-serif" },
  { label: 'Montserrat (Sans Tegas)', value: "'Montserrat', sans-serif" }
];

// Daftar Tag Penggabungan Data (Mail-Merge Fields)
export const MERGE_FIELDS = {
  '<<NAMA>>': { desc: 'Nama Santri Lengkap', short: 'Nama', get: (d) => d[5] || '' },
  '<<NO_INDUK>>': { desc: 'Nomor Induk', short: 'No. Induk', get: (d) => d[1] || '' },
  '<<NISN>>': { desc: 'NISN Santri', short: 'NISN', get: (d) => d[3] || '' },
  '<<TTL>>': { desc: 'Tempat, Tgl Lahir', short: 'TTL', get: (d) => `${d[6] || '-'}, ${d[7] || ''} ${d[8] || ''} ${d[9] || ''}`.trim() },
  '<<GENDER>>': { desc: 'Gender (Putra/Putri)', short: 'Gender', get: (d) => (d[4] === 'PA' ? 'Putra' : d[4] === 'PI' ? 'Putri' : '') },
  '<<ALAMAT>>': { desc: 'Alamat (Desa, Kec, Kab)', short: 'Alamat', get: (d) => `Ds. ${d[11] || '-'}, Kec. ${d[12] || '-'}, Kab. ${d[13] || '-'}` },
  '<<KELAS>>': { desc: 'Kelas Diniyyah', short: 'Kelas', get: (d) => `${d[24] || ''} ${d[25] || ''} ${d[26] || ''}`.trim() },
  '<<KAMAR>>': { desc: 'Penempatan Kamar', short: 'Kamar', get: (d) => `${d[16] || ''}-${d[17] || ''} ${d[18] || ''}`.trim() },
  '<<NAMA_AYAH>>': { desc: 'Nama Ayah Santri', short: 'Nama Ayah', get: (d) => d[30] || '' },
  '<<NO_TELEPON>>': { desc: 'Nomor Telepon/WA', short: 'No. HP', get: (d) => d[34] || '' },
  '<<HAFALAN_GABUNG>>': { desc: 'Seluruh Hafalan Lulus', short: 'Hafalan Semua', get: (d) => getHafalanSantri(d[1]) },
  '<<HAFALAN_TERAKHIR>>': { desc: 'Hafalan Terakhir Disetor', short: 'Hafalan Terakhir', get: (d) => getHafalanTerakhirSantri(d[1]) },
  '<<TANGGAL_SEKARANG>>': { desc: 'Tanggal Hari Ini (Masehi)', short: 'Tgl Sekarang', get: () => formatTanggalSekarang() },
  '<<TAHUN_AJARAN>>': { desc: 'Tahun Ajaran', short: 'Thn Ajaran', get: () => '2026/2027' }
};

// ============================================================================
// HELPER FORMAT & DATA HAFALAN SANTRI
// ============================================================================
export function getHafalanSantri(noInduk) {
  if (!noInduk || !store.globalDataMuhafadzoh) return '-';
  const riwayat = store.globalDataMuhafadzoh.filter(m => String(m[1]) === String(noInduk));
  if (riwayat.length === 0) return '-';
  const unik = [...new Set(riwayat.map(m => m[17]))].filter(Boolean);
  return unik.join(', ');
}

export function getHafalanTerakhirSantri(noInduk) {
  if (!noInduk || !store.globalDataMuhafadzoh) return '-';
  const riwayat = store.globalDataMuhafadzoh.filter(m => String(m[1]) === String(noInduk));
  if (riwayat.length === 0) return '-';
  const terakhir = riwayat[riwayat.length - 1];
  return terakhir ? (terakhir[17] || '-') : '-';
}

export function formatTanggalSekarang() {
  const d = new Date();
  const blnIndo = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${d.getDate()} ${blnIndo[d.getMonth()]} ${d.getFullYear()}`;
}

export function parseMergeTags(text, santriObj, transform = 'none') {
  if (!text) return '';
  let parsed = text;

  // 1. Substitusi tag default
  for (const tag in MERGE_FIELDS) {
    if (parsed.includes(tag)) {
      const val = santriObj ? MERGE_FIELDS[tag].get(santriObj) : tag;
      parsed = parsed.split(tag).join(val || '');
    }
  }

  // 2. Substitusi tag dinamis hafalan spesifik: <<HAFALAN:NamaHafalan>>
  if (santriObj && store.globalDataMuhafadzoh) {
    const regex = /<<HAFALAN:(.*?)>>/g;
    parsed = parsed.replace(regex, (match, hafalanTarget) => {
      const targetClean = String(hafalanTarget || '').trim().toLowerCase();
      const riwayat = store.globalDataMuhafadzoh.filter(m => String(m[1]) === String(santriObj[1]));
      const isLulus = riwayat.some(m => String(m[17] || '').trim().toLowerCase() === targetClean);
      return isLulus ? hafalanTarget.trim() : '';
    });
  }

  // 3. Penerapan Text Transform
  if (transform === 'uppercase') {
    return parsed.toUpperCase();
  } else if (transform === 'lowercase') {
    return parsed.toLowerCase();
  } else if (transform === 'capitalize') {
    return parsed.replace(/\b\w/g, c => c.toUpperCase());
  }
  return parsed;
}

// ============================================================================
// 1. INISIALISASI UI MODUL PIAGAM
// ============================================================================
export function initPiagamUI() {
  renderQuickTagChips();
  renderTemplateDropdown();
  renderPiagamSettings();
  updatePiagamBackground();
  updateZoomPiagam();
  updateDatalistModalPiagam();
}

function renderQuickTagChips() {
  const container = document.getElementById('quickTagChipsContainer');
  if (!container) return;
  let html = '';
  for (const tag in MERGE_FIELDS) {
    const item = MERGE_FIELDS[tag];
    html += `
      <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-2 fw-semibold quick-tag-chip"
              style="font-size: 10px; border-radius: 20px;"
              onclick="window.insertQuickTag('${tag}')"
              title="${item.desc}">
        + ${item.short}
      </button>
    `;
  }
  container.innerHTML = html;
}

export function insertQuickTag(tag) {
  const activeId = store.piagamState.activeElementId || (store.piagamState.columns[0] ? store.piagamState.columns[0].id : null);
  if (!activeId) return;

  const textarea = document.getElementById(`text_${activeId}`);
  if (!textarea) return;

  const start = textarea.selectionStart || textarea.value.length;
  const end = textarea.selectionEnd || textarea.value.length;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  textarea.value = before + tag + after;
  updateColData(activeId, 'text', textarea.value);
  textarea.focus();
  const nextPos = start + tag.length;
  textarea.setSelectionRange(nextPos, nextPos);
}

// ============================================================================
// 2. KONTROL ORIENTASI KERTAS (LANDSCAPE VS PORTRAIT)
// ============================================================================
export function setPiagamOrientation(orientation) {
  store.piagamState.orientation = orientation;
  const canvas = document.getElementById('piagam-print-area');
  const badge = document.getElementById('badge_piagam_orientasi');
  const dimBadge = document.getElementById('canvas_dimensions_badge');

  if (canvas) {
    if (orientation === 'portrait') {
      canvas.classList.remove('piagam-landscape');
      canvas.classList.add('piagam-portrait');
    } else {
      canvas.classList.remove('piagam-portrait');
      canvas.classList.add('piagam-landscape');
    }
  }

  if (badge) {
    badge.innerText = orientation === 'portrait' ? 'A4 Portrait' : 'A4 Landscape';
  }
  if (dimBadge) {
    dimBadge.innerText = orientation === 'portrait' ? '210 × 297 mm' : '297 × 210 mm';
  }

  updateZoomPiagam();
  renderPiagamCanvas();
}

// ============================================================================
// 3. PENGATURAN GAMBAR LATAR BELAKANG (G-DRIVE / FILE UPLOAD)
// ============================================================================
export function toggleLockGDrive() {
  const input = document.getElementById('pgm_drive_link');
  const icon = document.getElementById('icon_lock_gdrive');
  const btn = document.getElementById('btn_lock_gdrive');
  if (!input || !icon || !btn) return;

  if (input.hasAttribute('readonly')) {
    input.removeAttribute('readonly');
    input.focus();
    icon.className = 'bi bi-unlock-fill text-danger';
    btn.classList.replace('btn-outline-secondary', 'btn-outline-danger');
  } else {
    input.setAttribute('readonly', 'true');
    icon.className = 'bi bi-lock-fill text-secondary';
    btn.classList.replace('btn-outline-danger', 'btn-outline-secondary');
  }
}

export function updatePiagamBackground() {
  const link = (document.getElementById('pgm_drive_link')?.value || store.piagamState.driveLink || '').trim();
  store.piagamState.driveLink = link;

  let bgUrl = '';
  if (store.piagamState.customBgUrl) {
    bgUrl = store.piagamState.customBgUrl;
  } else if (link.includes('drive.google.com')) {
    const fileIdMatch = link.match(/[-\w]{25,}/);
    if (fileIdMatch && fileIdMatch[0]) {
      bgUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[0]}&sz=w3000`;
    }
  } else if (link.startsWith('http') || link.startsWith('data:image')) {
    bgUrl = link;
  }

  renderBackgroundOnCanvas(bgUrl);
}

export function handleUploadPiagamBackground(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('File yang dipilih harus berupa gambar!');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    store.piagamState.customBgUrl = e.target.result;
    store.piagamState.bgType = 'custom';
    renderBackgroundOnCanvas(e.target.result);
  };
  reader.readAsDataURL(file);
}

export function clearPiagamBackground() {
  store.piagamState.customBgUrl = '';
  store.piagamState.driveLink = '';
  const inputLink = document.getElementById('pgm_drive_link');
  if (inputLink) inputLink.value = '';
  const inputUpload = document.getElementById('pgm_upload_input');
  if (inputUpload) inputUpload.value = '';

  renderBackgroundOnCanvas('');
}

function renderBackgroundOnCanvas(bgUrl) {
  const canvas = document.getElementById('piagam-print-area');
  if (!canvas) return;

  // Hapus img print background lama bila ada
  const oldImg = canvas.querySelector('.piagam-bg-print');
  if (oldImg) oldImg.remove();

  if (bgUrl) {
    canvas.style.backgroundImage = `url('${bgUrl}')`;
    // Sisipkan tag img untuk print
    const imgTag = document.createElement('img');
    imgTag.className = 'piagam-bg-print';
    imgTag.src = bgUrl;
    canvas.prepend(imgTag);
  } else {
    canvas.style.backgroundImage = 'none';
  }
}

// ============================================================================
// 4. RENDERING PENGATURAN ACCORDION & KANVAS PRATINJAU
// ============================================================================
export function renderPiagamSettings() {
  const accordion = document.getElementById('accordionPiagam');
  if (!accordion) return;

  let html = '';
  const columns = store.piagamState.columns || [];

  columns.forEach((col, index) => {
    const isActive = store.piagamState.activeElementId === col.id;
    const fontOptionsHtml = PIAGAM_FONT_OPTIONS.map(f =>
      `<option value="${f.value}" ${(col.fontFamily || '').includes(f.value.split(',')[0].replace(/'/g, '')) ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    html += `
      <div class="accordion-item bg-white mb-2 border rounded shadow-sm ${isActive ? 'border-success ring-1' : ''}" id="card_acc_${col.id}">
        <h2 class="accordion-header">
          <button class="accordion-button ${isActive ? '' : 'collapsed'} bg-transparent rounded fw-bold text-dark py-2 px-3"
                  type="button" data-bs-toggle="collapse" data-bs-target="#acc_${col.id}"
                  onclick="window.selectActiveElement('${col.id}', false)">
            <span class="badge bg-secondary-subtle text-secondary me-2">${index + 1}</span>
            <span class="text-truncate flex-grow-1">${col.title}</span>
            ${col.show ? '' : '<span class="badge bg-light text-muted border ms-2">Disembunyikan</span>'}
          </button>
        </h2>

        <div id="acc_${col.id}" class="accordion-collapse collapse ${isActive ? 'show' : ''}" data-bs-parent="#accordionPiagam">
          <div class="accordion-body px-3 py-3 border-top">
            <!-- Judul Blok -->
            <div class="mb-2">
              <label class="form-label text-muted fw-bold mb-1" style="font-size: 11px;">Nama Blok Elemen</label>
              <input type="text" class="form-control form-control-sm border-secondary"
                     value="${col.title}" oninput="window.updateColData('${col.id}', 'title', this.value)">
            </div>

            <!-- Teks & Tag -->
            <div class="mb-2">
              <label class="form-label text-muted fw-bold mb-1" style="font-size: 11px;">Isi Teks / Tag Mail-Merge</label>
              <textarea id="text_${col.id}" class="form-control form-control-sm border-secondary font-monospace"
                        rows="3" style="font-size: 12px;"
                        onfocus="window.selectActiveElement('${col.id}', false)"
                        oninput="window.updateColData('${col.id}', 'text', this.value)">${col.text || ''}</textarea>
            </div>

            <!-- Toggle Tampilkan & Hapus -->
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div class="form-check form-switch m-0">
                <input class="form-check-input" type="checkbox" id="chk_show_${col.id}" ${col.show ? 'checked' : ''}
                       onchange="window.updateColData('${col.id}', 'show', this.checked)">
                <label class="form-check-label text-muted fw-bold small" for="chk_show_${col.id}">Tampilkan</label>
              </div>
              <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 border-0 fw-bold"
                      onclick="window.hapusKolomPiagam('${col.id}')">
                <i class="bi bi-trash me-1"></i> Hapus Blok
              </button>
            </div>

            <!-- Slider Posisi X (0 - 100%) -->
            <div class="d-flex justify-content-between align-items-center">
              <label class="text-muted fw-bold mb-0" style="font-size: 11px;">
                Posisi X (Kiri-Kanan): <span id="valX_${col.id}" class="text-dark font-monospace">${col.x}</span>%
              </label>
              <i id="icon_lockX_${col.id}" class="bi bi-${col.lockX ? 'lock-fill text-danger' : 'unlock text-secondary'}"
                 style="cursor: pointer;" onclick="window.toggleColData('${col.id}', 'lockX')" title="Kunci posisi X"></i>
            </div>
            <input type="range" id="range_x_${col.id}" class="form-range" min="0" max="100" value="${col.x}"
                   oninput="window.updateColData('${col.id}', 'x', this.value)" ${col.lockX ? 'disabled' : ''}>

            <!-- Slider Posisi Y (0 - 100%) -->
            <div class="d-flex justify-content-between align-items-center mt-2">
              <label class="text-muted fw-bold mb-0" style="font-size: 11px;">
                Posisi Y (Atas-Bawah): <span id="valY_${col.id}" class="text-dark font-monospace">${col.y}</span>%
              </label>
              <i id="icon_lockY_${col.id}" class="bi bi-${col.lockY ? 'lock-fill text-danger' : 'unlock text-secondary'}"
                 style="cursor: pointer;" onclick="window.toggleColData('${col.id}', 'lockY')" title="Kunci posisi Y"></i>
            </div>
            <input type="range" id="range_y_${col.id}" class="form-range" min="0" max="100" value="${col.y}"
                   oninput="window.updateColData('${col.id}', 'y', this.value)" ${col.lockY ? 'disabled' : ''}>

            <!-- Slider Ukuran Font (8 - 120 px) -->
            <div class="d-flex justify-content-between align-items-center mt-2">
              <label class="text-muted fw-bold mb-0" style="font-size: 11px;">
                Ukuran Font: <span id="valS_${col.id}" class="text-dark font-monospace">${col.size}</span>px
              </label>
              <i id="icon_lockSize_${col.id}" class="bi bi-${col.lockSize ? 'lock-fill text-danger' : 'unlock text-secondary'}"
                 style="cursor: pointer;" onclick="window.toggleColData('${col.id}', 'lockSize')" title="Kunci ukuran font"></i>
            </div>
            <input type="range" id="range_size_${col.id}" class="form-range" min="8" max="120" value="${col.size}"
                   oninput="window.updateColData('${col.id}', 'size', this.value)" ${col.lockSize ? 'disabled' : ''}>

            <!-- Jenis Font, Warna, Format Teks & Perataan -->
            <div class="row g-2 mt-2">
              <div class="col-12">
                <label class="text-muted fw-bold mb-1" style="font-size: 11px;">Jenis Font</label>
                <select class="form-select form-select-sm border-secondary"
                        onchange="window.updateColData('${col.id}', 'fontFamily', this.value)">
                  ${fontOptionsHtml}
                </select>
              </div>

              <div class="col-4">
                <label class="text-muted fw-bold mb-1" style="font-size: 11px;">Warna</label>
                <input type="color" class="form-control form-control-color form-control-sm w-100"
                       value="${col.color || '#000000'}"
                       oninput="window.updateColData('${col.id}', 'color', this.value)">
              </div>

              <div class="col-4">
                <label class="text-muted fw-bold mb-1 d-block text-center" style="font-size: 11px;">Tebal</label>
                <button type="button" id="btn_bold_${col.id}"
                        class="btn btn-sm w-100 ${col.isBold ? 'btn-dark' : 'btn-outline-secondary'} fw-bold"
                        onclick="window.toggleColData('${col.id}', 'isBold')">
                  B
                </button>
              </div>

              <div class="col-4">
                <label class="text-muted fw-bold mb-1 d-block text-center" style="font-size: 11px;">Kapital</label>
                <select class="form-select form-select-sm border-secondary text-center"
                        onchange="window.updateColData('${col.id}', 'textTransform', this.value)">
                  <option value="none" ${col.textTransform === 'none' ? 'selected' : ''}>Asli</option>
                  <option value="uppercase" ${col.textTransform === 'uppercase' ? 'selected' : ''}>KAPITAL</option>
                  <option value="capitalize" ${col.textTransform === 'capitalize' ? 'selected' : ''}>Awal Kata</option>
                </select>
              </div>

              <div class="col-12 mt-2">
                <label class="text-muted fw-bold mb-1 d-block" style="font-size: 11px;">Perataan Paragraf</label>
                <div class="btn-group btn-group-sm w-100" role="group">
                  <button type="button" class="btn ${col.align === 'left' ? 'btn-dark' : 'btn-outline-secondary'}"
                          onclick="window.updateColData('${col.id}', 'align', 'left')" title="Rata Kiri">
                    <i class="bi bi-text-left"></i> Kiri
                  </button>
                  <button type="button" class="btn ${(col.align || 'center') === 'center' ? 'btn-dark' : 'btn-outline-secondary'}"
                          onclick="window.updateColData('${col.id}', 'align', 'center')" title="Rata Tengah">
                    <i class="bi bi-text-center"></i> Tengah
                  </button>
                  <button type="button" class="btn ${col.align === 'right' ? 'btn-dark' : 'btn-outline-secondary'}"
                          onclick="window.updateColData('${col.id}', 'align', 'right')" title="Rata Kanan">
                    <i class="bi bi-text-right"></i> Kanan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  accordion.innerHTML = html;
  renderPiagamCanvas();
}

export function selectActiveElement(id, scrollToCard = true) {
  store.piagamState.activeElementId = id;

  // Berikan highlight visual pada kanvas
  document.querySelectorAll('.piagam-element').forEach(el => {
    if (el.dataset.colId === id) {
      el.classList.add('piagam-element-active');
    } else {
      el.classList.remove('piagam-element-active');
    }
  });

  // Buka accordion jika dipanggil dari klik kanvas
  if (scrollToCard) {
    const targetAcc = document.getElementById(`acc_${id}`);
    if (targetAcc && !targetAcc.classList.contains('show')) {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(targetAcc, { toggle: false });
      bsCollapse.show();
    }
    const cardAcc = document.getElementById(`card_acc_${id}`);
    if (cardAcc) {
      cardAcc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

export function handleCanvasBackgroundClick(e) {
  if (e.target.id === 'piagam-print-area' || e.target.classList.contains('piagam-bg-print')) {
    store.piagamState.activeElementId = null;
    document.querySelectorAll('.piagam-element').forEach(el => el.classList.remove('piagam-element-active'));
  }
}

export function tambahKolomPiagam() {
  const newId = 'col_' + Date.now();
  const nextNum = (store.piagamState.columns || []).length + 1;
  const newCol = {
    id: newId,
    title: `Blok Teks ${nextNum}`,
    text: 'Teks Baru...\n<<NAMA>>',
    x: 50,
    y: Math.min(85, 30 + nextNum * 10),
    size: 20,
    color: '#0f172a',
    fontFamily: "'Inter', sans-serif",
    isBold: false,
    align: 'center',
    textTransform: 'none',
    show: true,
    lockX: false,
    lockY: false,
    lockSize: false
  };

  store.piagamState.columns.push(newCol);
  store.piagamState.activeElementId = newId;
  renderPiagamSettings();
  selectActiveElement(newId, true);
}

export function hapusKolomPiagam(id) {
  if (!confirm('Hapus blok elemen teks ini?')) return;
  store.piagamState.columns = (store.piagamState.columns || []).filter(c => c.id !== id);
  if (store.piagamState.activeElementId === id) {
    store.piagamState.activeElementId = null;
  }
  renderPiagamSettings();
}

export function updateColData(id, key, value) {
  const col = (store.piagamState.columns || []).find(c => c.id === id);
  if (!col) return;

  col[key] = value;
  if (key === 'x') {
    const el = document.getElementById(`valX_${id}`);
    if (el) el.innerText = value;
  }
  if (key === 'y') {
    const el = document.getElementById(`valY_${id}`);
    if (el) el.innerText = value;
  }
  if (key === 'size') {
    const el = document.getElementById(`valS_${id}`);
    if (el) el.innerText = value;
  }

  renderPiagamCanvas();
}

export function toggleColData(id, key) {
  const col = (store.piagamState.columns || []).find(c => c.id === id);
  if (!col) return;

  col[key] = !col[key];
  const val = col[key];

  if (key === 'lockX') {
    const icon = document.getElementById(`icon_lockX_${id}`);
    if (icon) icon.className = val ? 'bi bi-lock-fill text-danger' : 'bi bi-unlock text-secondary';
    const range = document.getElementById(`range_x_${id}`);
    if (range) range.disabled = val;
  }
  if (key === 'lockY') {
    const icon = document.getElementById(`icon_lockY_${id}`);
    if (icon) icon.className = val ? 'bi bi-lock-fill text-danger' : 'bi bi-unlock text-secondary';
    const range = document.getElementById(`range_y_${id}`);
    if (range) range.disabled = val;
  }
  if (key === 'lockSize') {
    const icon = document.getElementById(`icon_lockSize_${id}`);
    if (icon) icon.className = val ? 'bi bi-lock-fill text-danger' : 'bi bi-unlock text-secondary';
    const range = document.getElementById(`range_size_${id}`);
    if (range) range.disabled = val;
  }
  if (key === 'isBold') {
    const btn = document.getElementById(`btn_bold_${id}`);
    if (btn) btn.className = val ? 'btn btn-sm w-100 btn-dark fw-bold' : 'btn btn-sm w-100 btn-outline-secondary fw-bold';
  }

  renderPiagamCanvas();
}

export function resetPiagamCanvasToDefault() {
  if (!confirm('Kembalikan tata letak kanvas ke pengaturan awal?')) return;
  store.piagamState.columns = [
    {
      id: 'col_1',
      title: 'Nama Penerima',
      text: '<<NAMA>>',
      x: 50,
      y: 42,
      size: 38,
      color: '#0f172a',
      fontFamily: "'Playfair Display', serif",
      isBold: true,
      align: 'center',
      textTransform: 'uppercase',
      show: true,
      lockX: false,
      lockY: false,
      lockSize: false
    },
    {
      id: 'col_2',
      title: 'Keterangan Kelulusan',
      text: 'Telah Menyelesaikan Setoran Hafalan:\n<<HAFALAN_GABUNG>>',
      x: 50,
      y: 56,
      size: 18,
      color: '#334155',
      fontFamily: "'Inter', sans-serif",
      isBold: false,
      align: 'center',
      textTransform: 'none',
      show: true,
      lockX: false,
      lockY: false,
      lockSize: false
    }
  ];
  store.piagamState.activeElementId = 'col_1';
  renderPiagamSettings();
}

// ============================================================================
// 5. RENDERING KANVAS PRATINJAU DENGAN DATA SANTRI
// ============================================================================
export function renderPiagamCanvas() {
  const canvas = document.getElementById('piagam-print-area');
  if (!canvas) return;

  // Hapus semua elemen teks lama tanpa menghapus img latar belakang
  canvas.querySelectorAll('.piagam-element').forEach(el => el.remove());

  // Tentukan santri yang sedang di-preview
  const selectedIndukList = store.piagamState.selectedPiagamSantri || [];
  const currentIndex = store.piagamState.currentPreviewIndex || 0;
  const targetInduk = selectedIndukList.length > 0 ? selectedIndukList[currentIndex] : null;
  const currentSantri = targetInduk && store.globalDataSantri
    ? store.globalDataSantri.find(r => String(r[1]) === String(targetInduk))
    : (store.globalDataSantri && store.globalDataSantri.length > 0 ? store.globalDataSantri[0] : null);

  const columns = store.piagamState.columns || [];

  columns.forEach(col => {
    if (!col.show) return;

    const el = document.createElement('div');
    el.className = 'piagam-element';
    el.dataset.colId = col.id;
    if (store.piagamState.activeElementId === col.id) {
      el.classList.add('piagam-element-active');
    }

    el.style.fontFamily = col.fontFamily || "'Times New Roman', serif";
    el.style.left = `${col.x}%`;
    el.style.top = `${col.y}%`;
    el.style.fontSize = `${col.size}px`;
    el.style.color = col.color || '#000000';
    el.style.fontWeight = col.isBold ? 'bold' : 'normal';

    const align = col.align || 'center';
    el.style.textAlign = align;

    // Kunci titik jangkar (anchor point) sesuai perataan
    if (align === 'left') {
      el.style.transform = 'translate(0, -50%)';
    } else if (align === 'right') {
      el.style.transform = 'translate(-100%, -50%)';
    } else {
      el.style.transform = 'translate(-50%, -50%)';
    }

    const displayText = parseMergeTags(col.text, currentSantri, col.textTransform);
    el.innerText = displayText;

    // Klik pada kanvas langsung memilih elemen untuk diedit
    el.onclick = function (e) {
      e.stopPropagation();
      selectActiveElement(col.id, true);
    };

    canvas.appendChild(el);
  });
}

export function updateZoomPiagam() {
  const slider = document.getElementById('zoom_piagam');
  const badge = document.getElementById('badge_zoom_val');
  const canvas = document.getElementById('piagam-print-area');
  const wrapper = document.getElementById('piagamCanvasScrollWrapper');
  if (!slider || !canvas || !wrapper) return;

  const scale = Number(slider.value) / 100;
  store.piagamState.zoomScale = scale;
  if (badge) badge.innerText = `${slider.value}%`;

  canvas.style.transform = `scale(${scale})`;

  const isPortrait = store.piagamState.orientation === 'portrait';
  const naturalHeightMm = isPortrait ? 297 : 210;
  // 1mm = ~3.78px
  const calculatedHeightPx = naturalHeightMm * 3.78 * scale + 60;
  wrapper.style.height = `${calculatedHeightPx}px`;
}

// ============================================================================
// 6. NAVIGASI PRATINJAU ANTAR SANTRI TERPILIH
// ============================================================================
export function navPiagam(action) {
  const list = store.piagamState.selectedPiagamSantri || [];
  if (list.length === 0) return;
  const max = list.length - 1;
  let idx = store.piagamState.currentPreviewIndex || 0;

  if (action === 'first') idx = 0;
  else if (action === 'prev') idx = Math.max(0, idx - 1);
  else if (action === 'next') idx = Math.min(max, idx + 1);
  else if (action === 'last') idx = max;

  store.piagamState.currentPreviewIndex = idx;
  updateNavPiagamUI();
  renderPiagamCanvas();
}

export function updateNavPiagamUI() {
  const container = document.getElementById('piagam_nav_container');
  const text = document.getElementById('piagam_nav_text');
  const list = store.piagamState.selectedPiagamSantri || [];

  if (list.length > 0) {
    if (container) container.style.setProperty('display', 'flex', 'important');
    if (text) text.innerText = `${(store.piagamState.currentPreviewIndex || 0) + 1} / ${list.length}`;
  } else {
    if (container) container.style.setProperty('display', 'none', 'important');
  }
}

// ============================================================================
// 7. MODAL PEMILIHAN SANTRI (MAILING & FILTER TERPADU)
// ============================================================================
export function updateDatalistModalPiagam() {
  if (!store.globalDataAsatidz) return;

  // Datalist Asatidz
  const uniqueMustahiq = [...new Set(store.globalDataAsatidz.map(r => r[4]))].filter(Boolean);
  const dlMus = document.getElementById('dl_pgm_mustahiq');
  if (dlMus) dlMus.innerHTML = uniqueMustahiq.sort().map(v => `<option value="${v}">`).join('');

  // Datalist Blok, Tingkat, Kls, Bag dari Asatidz / Santri
  const uniqueBlok = [...new Set(store.globalDataAsatidz.map(r => r[5]))].filter(Boolean);
  const dlBlok = document.getElementById('dl_pgm_blok');
  if (dlBlok) dlBlok.innerHTML = uniqueBlok.sort().map(v => `<option value="${v}">`).join('');

  const uniqueKls = [...new Set(store.globalDataAsatidz.map(r => r[2]))].filter(Boolean);
  const dlKls = document.getElementById('dl_pgm_kls');
  if (dlKls) dlKls.innerHTML = uniqueKls.sort().map(v => `<option value="${v}">`).join('');

  const uniqueBag = [...new Set(store.globalDataAsatidz.map(r => r[1]))].filter(Boolean);
  const dlBag = document.getElementById('dl_pgm_bag');
  if (dlBag) dlBag.innerHTML = uniqueBag.sort().map(v => `<option value="${v}">`).join('');

  const uniqueTkt = [...new Set(store.globalDataAsatidz.map(r => r[0]))].filter(Boolean);
  const dlTkt = document.getElementById('dl_pgm_tingkat');
  if (dlTkt) dlTkt.innerHTML = uniqueTkt.sort().map(v => `<option value="${v}">`).join('');

  // Datalist Hafalan Lulus Unik dari Riwayat Setoran
  if (store.globalDataMuhafadzoh) {
    const uniqueHafalan = [...new Set(store.globalDataMuhafadzoh.map(m => m[17]))].filter(Boolean);
    const dlHaf = document.getElementById('dl_pgm_hafalan_lulus');
    if (dlHaf) dlHaf.innerHTML = uniqueHafalan.sort().map(v => `<option value="${v}">`).join('');
  }

  // Listener input otomatis dari Mustahiq
  const inMustahiq = document.getElementById('pgm_flt_mustahiq');
  if (inMustahiq) {
    inMustahiq.addEventListener('input', function () {
      const val = this.value.trim().toUpperCase();
      const match = (store.globalDataAsatidz || []).find(r => (r[4] || '').trim().toUpperCase() === val);
      if (match) {
        if (match[5]) document.getElementById('pgm_flt_blok').value = match[5];
        if (match[2]) document.getElementById('pgm_flt_kls').value = match[2];
        if (match[1]) document.getElementById('pgm_flt_bag').value = match[1];
        if (match[0]) document.getElementById('pgm_flt_tingkat').value = match[0];
        if (match[3]) document.getElementById('pgm_flt_papi').value = match[3];
      }
      renderTableSantriPiagam();
    });
  }

  ['pgm_flt_blok', 'pgm_flt_kls', 'pgm_flt_bag', 'pgm_flt_tingkat', 'pgm_flt_papi', 'pgm_flt_hafalan_lulus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderTableSantriPiagam);
  });
}

export function openModalSantriPiagam() {
  updateDatalistModalPiagam();
  renderTableSantriPiagam();
  const modalEl = document.getElementById('modalSantriPiagam');
  if (modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

export function renderTableSantriPiagam() {
  if (!store.globalDataSantri || store.globalDataSantri.length === 0) return;

  const mus = (document.getElementById('pgm_flt_mustahiq')?.value || '').trim().toUpperCase();
  const bl = (document.getElementById('pgm_flt_blok')?.value || '').trim().toUpperCase();
  const kl = (document.getElementById('pgm_flt_kls')?.value || '').trim().toUpperCase();
  const bg = (document.getElementById('pgm_flt_bag')?.value || '').trim().toUpperCase();
  const tk = (document.getElementById('pgm_flt_tingkat')?.value || '').trim().toUpperCase();
  const pp = (document.getElementById('pgm_flt_papi')?.value || '').trim().toUpperCase();
  const hafLulus = (document.getElementById('pgm_flt_hafalan_lulus')?.value || '').trim().toUpperCase();

  // Validasi kelas binaan mustahiq
  let validKls = [];
  if (mus && store.globalDataAsatidz) {
    store.globalDataAsatidz.filter(a => (a[4] || '').toUpperCase() === mus).forEach(a => {
      validKls.push({ t: a[0], b: a[1], k: a[2], p: a[3], bl: a[5] });
    });
  }

  // Set No. Induk santri yang lulus hafalan target jika filter diisi
  let santriLulusHafalanSet = null;
  if (hafLulus && store.globalDataMuhafadzoh) {
    santriLulusHafalanSet = new Set();
    store.globalDataMuhafadzoh.forEach(m => {
      if ((m[17] || '').trim().toUpperCase() === hafLulus) {
        santriLulusHafalanSet.add(String(m[1]));
      }
    });
  }

  const selectedSet = new Set((store.piagamState.selectedPiagamSantri || []).map(String));

  const filteredSantri = store.globalDataSantri.filter(row => {
    const sInduk = String(row[1] || '').trim();
    const sTk = String(row[26] || '').trim().toUpperCase();
    const sBg = String(row[25] || '').trim().toUpperCase();
    const sKl = String(row[24] || '').trim().toUpperCase();
    const sPp = String(row[4] || '').trim().toUpperCase();
    const sBl = String(row[15] || '').trim().toUpperCase();

    const matchFlt = (!bl || sBl === bl) && (!kl || sKl === kl) && (!bg || sBg === bg) && (!tk || sTk === tk) && (!pp || sPp === pp);
    let matchMus = true;
    if (mus && validKls.length > 0) {
      matchMus = validKls.some(vk =>
        (!vk.t || vk.t.toUpperCase() === sTk) &&
        (!vk.b || vk.b.toUpperCase() === sBg) &&
        (!vk.k || vk.k.toUpperCase() === sKl) &&
        (!vk.p || vk.p.toUpperCase() === sPp)
      );
    } else if (mus) {
      matchMus = false;
    }

    const matchHaf = !santriLulusHafalanSet || santriLulusHafalanSet.has(sInduk);

    return matchFlt && matchMus && matchHaf;
  });

  const tbody = document.getElementById('tbodySantriPiagam');
  if (!tbody) return;

  if (store.piagamState.dtSantriPiagam) {
    store.piagamState.dtSantriPiagam.destroy();
    store.piagamState.dtSantriPiagam = null;
  }

  tbody.innerHTML = '';

  filteredSantri.forEach(row => {
    const noInduk = String(row[1]);
    const isChecked = selectedSet.has(noInduk) ? 'checked' : '';
    const kamar = `${row[17] || ''} - ${row[18] || ''}`.trim() || '-';
    const kelas = `${row[24] || ''} ${row[25] || ''} ${row[26] || ''}`.trim();
    const hafalanRingkas = getHafalanSantri(noInduk);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">
        <input type="checkbox" class="cb-piagam form-check-input" value="${noInduk}" ${isChecked} onchange="window.handlePiagamCheckboxChange()">
      </td>
      <td class="font-monospace fw-bold text-secondary">${noInduk}</td>
      <td><span class="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-1">${kamar}</span></td>
      <td class="fw-bold text-dark">${row[5] || ''}</td>
      <td><span class="badge bg-light text-dark border">${kelas}</span></td>
      <td><div class="text-truncate text-muted small" style="max-width: 320px;" title="${hafalanRingkas}">${hafalanRingkas}</div></td>
    `;
    tbody.appendChild(tr);
  });

  store.piagamState.dtSantriPiagam = $('#tableSantriPiagam').DataTable({
    scrollY: '340px',
    scrollCollapse: true,
    paging: false,
    autoWidth: false,
    language: {
      search: 'Cari Santri di Tabel:',
      emptyTable: 'Tidak ada santri yang sesuai kriteria filter.'
    },
    columnDefs: [{ orderable: false, targets: 0 }]
  });

  updateSelectedCountModal();
}

export function handlePiagamCheckboxChange() {
  updateSelectedCountModal();
}

function updateSelectedCountModal() {
  const checkedBoxes = document.querySelectorAll('.cb-piagam:checked');
  const totalBoxes = document.querySelectorAll('.cb-piagam');
  const badge = document.getElementById('badge_selected_santri_modal');
  const summary = document.getElementById('piagam_table_summary_text');

  if (badge) badge.innerText = `${checkedBoxes.length} Santri Dipilih`;
  if (summary) summary.innerText = `Menampilkan ${totalBoxes.length} santri (${checkedBoxes.length} dicentang saat ini)`;
}

export function checkAllPiagamInView(status) {
  document.querySelectorAll('.cb-piagam').forEach(cb => {
    cb.checked = status;
  });
  const checkAllHead = document.getElementById('checkAllPiagam');
  if (checkAllHead) checkAllHead.checked = status;
  updateSelectedCountModal();
}

export function toggleAllPiagam(el) {
  checkAllPiagamInView(el.checked);
}

export function resetFilterPiagam() {
  ['pgm_flt_mustahiq', 'pgm_flt_blok', 'pgm_flt_kls', 'pgm_flt_bag', 'pgm_flt_tingkat', 'pgm_flt_hafalan_lulus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const selPaPi = document.getElementById('pgm_flt_papi');
  if (selPaPi) selPaPi.value = '';

  renderTableSantriPiagam();
}

export function terapkanSantriPiagam() {
  const selected = [];
  document.querySelectorAll('.cb-piagam:checked').forEach(cb => {
    selected.push(cb.value);
  });

  store.piagamState.selectedPiagamSantri = selected;
  store.piagamState.currentPreviewIndex = 0;

  const btnText = document.getElementById('btn_text_santri_piagam');
  if (btnText) {
    if (selected.length > 0) {
      btnText.innerHTML = `
        <span class="badge bg-success me-2">${selected.length}</span> Santri Terpilih Siap Dicetak
      `;
      btnText.className = 'text-dark fw-bold small';
    } else {
      btnText.innerHTML = '<i class="bi bi-people me-1"></i> -- Klik untuk Memilih Santri --';
      btnText.className = 'text-muted fw-bold small';
    }
  }

  updateNavPiagamUI();
  renderPiagamCanvas();

  const modalEl = document.getElementById('modalSantriPiagam');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }
}

// ============================================================================
// 8. MANAJEMEN TEMPLATE PIAGAM (DATABASE SUPABASE & LOCALSTORAGE)
// ============================================================================
export async function loadPiagamTemplatesFromSupabase() {
  // 1. Muat dari localStorage instan
  try {
    const raw = localStorage.getItem(LS_PIAGAM_TEMPLATES);
    if (raw) {
      store.piagamState.templates = JSON.parse(raw);
      renderTemplateDropdown();
    }
  } catch (e) {}

  // 2. Sinkronkan dari Supabase `app_settings`
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', KEY_DB_PIAGAM_TEMPLATES)
      .maybeSingle();

    if (!error && data && data.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      store.piagamState.templates = {
        ...store.piagamState.templates,
        ...parsed
      };
      localStorage.setItem(LS_PIAGAM_TEMPLATES, JSON.stringify(store.piagamState.templates));
      renderTemplateDropdown();
    }
  } catch (err) {
    console.error('Gagal memuat template piagam dari Supabase:', err.message);
  }
}

function renderTemplateDropdown() {
  const select = document.getElementById('pgm_template_select');
  if (!select) return;
  select.innerHTML = '<option value="">-- Pilih Template --</option>';

  const tpls = store.piagamState.templates || {};
  Object.keys(tpls).forEach(name => {
    select.innerHTML += `<option value="${name}">${name}</option>`;
  });
}

export async function savePiagamTemplate(e) {
  const name = prompt('Masukkan nama untuk menyimpan konfigurasi Template Piagam ini:');
  if (!name || !name.trim()) return;

  const cleanName = name.trim();
  if (!store.piagamState.templates) store.piagamState.templates = {};

  const payload = {
    driveLink: store.piagamState.driveLink || '',
    customBgUrl: store.piagamState.customBgUrl || '',
    orientation: store.piagamState.orientation || 'landscape',
    columns: JSON.parse(JSON.stringify(store.piagamState.columns || []))
  };

  store.piagamState.templates[cleanName] = payload;
  localStorage.setItem(LS_PIAGAM_TEMPLATES, JSON.stringify(store.piagamState.templates));
  renderTemplateDropdown();
  const select = document.getElementById('pgm_template_select');
  if (select) select.value = cleanName;

  // Simpan ke Supabase `app_settings`
  if (supabase) {
    try {
      await supabase
        .from('app_settings')
        .upsert(
          { key: KEY_DB_PIAGAM_TEMPLATES, value: JSON.stringify(store.piagamState.templates) },
          { onConflict: 'key' }
        );
      logActivity(store.currentUser, 'SIMPAN TEMPLATE PIAGAM', `Menyimpan template piagam: "${cleanName}"`);
    } catch (err) {
      console.warn('Gagal sinkron template ke Supabase:', err.message);
    }
  }

  Swal.fire({
    icon: 'success',
    title: 'Template Tersimpan!',
    text: `Konfigurasi template "${cleanName}" berhasil disimpan.`,
    timer: 1500,
    showConfirmButton: false
  });
}

export function loadPiagamTemplate() {
  const select = document.getElementById('pgm_template_select');
  const name = select ? select.value : '';
  if (!name || !store.piagamState.templates || !store.piagamState.templates[name]) return;

  const tpl = store.piagamState.templates[name];
  store.piagamState.driveLink = tpl.driveLink || '';
  store.piagamState.customBgUrl = tpl.customBgUrl || '';
  store.piagamState.orientation = tpl.orientation || 'landscape';
  store.piagamState.columns = JSON.parse(JSON.stringify(tpl.columns || []));

  const inputLink = document.getElementById('pgm_drive_link');
  if (inputLink) inputLink.value = tpl.driveLink || '';

  const rLandscape = document.getElementById('pgm_orient_landscape');
  const rPortrait = document.getElementById('pgm_orient_portrait');
  if (tpl.orientation === 'portrait') {
    if (rPortrait) rPortrait.checked = true;
  } else {
    if (rLandscape) rLandscape.checked = true;
  }

  setPiagamOrientation(tpl.orientation || 'landscape');
  updatePiagamBackground();
  renderPiagamSettings();
}

export async function deletePiagamTemplate(e) {
  const select = document.getElementById('pgm_template_select');
  const name = select ? select.value : '';
  if (!name) {
    alert('Pilih template yang ingin dihapus terlebih dahulu!');
    return;
  }

  const result = await Swal.fire({
    title: 'Hapus Template?',
    text: `Template "${name}" akan dihapus permanen.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Ya, Hapus'
  });

  if (!result.isConfirmed) return;

  delete store.piagamState.templates[name];
  localStorage.setItem(LS_PIAGAM_TEMPLATES, JSON.stringify(store.piagamState.templates));
  renderTemplateDropdown();

  if (supabase) {
    try {
      await supabase
        .from('app_settings')
        .upsert(
          { key: KEY_DB_PIAGAM_TEMPLATES, value: JSON.stringify(store.piagamState.templates) },
          { onConflict: 'key' }
        );
      logActivity(store.currentUser, 'HAPUS TEMPLATE PIAGAM', `Menghapus template piagam: "${name}"`);
    } catch (err) {
      console.warn('Gagal menghapus template dari Supabase:', err.message);
    }
  }

  Swal.fire({
    icon: 'success',
    title: 'Template Dihapus',
    timer: 1200,
    showConfirmButton: false
  });
}

// ============================================================================
// 9. MESIN CETAK MASSAL (BATCH PRINT ENGINE A4)
// ============================================================================
export function printPiagam() {
  const selectedIndukList = store.piagamState.selectedPiagamSantri || [];

  if (selectedIndukList.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'Pilih Santri Terlebih Dahulu',
      text: 'Silakan klik tombol "Pilih Santri" untuk menentukan santri yang akan dicetak piagamnya.',
      confirmButtonColor: '#0f766e'
    });
    return;
  }

  const orientation = store.piagamState.orientation || 'landscape';
  const columns = store.piagamState.columns || [];

  // Terapkan class khusus pada body untuk print
  document.body.classList.add('printing-piagam');
  if (orientation === 'portrait') {
    document.body.classList.add('print-portrait');
    document.body.classList.remove('print-landscape');
  } else {
    document.body.classList.add('print-landscape');
    document.body.classList.remove('print-portrait');
  }

  const wrapper = document.getElementById('piagamCanvasScrollWrapper');
  if (!wrapper) return;

  const originalContent = wrapper.innerHTML;
  wrapper.innerHTML = '';

  // Dapatkan URL Background
  let bgUrl = '';
  if (store.piagamState.customBgUrl) {
    bgUrl = store.piagamState.customBgUrl;
  } else if (store.piagamState.driveLink && store.piagamState.driveLink.includes('drive.google.com')) {
    const fileIdMatch = store.piagamState.driveLink.match(/[-\w]{25,}/);
    if (fileIdMatch && fileIdMatch[0]) {
      bgUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[0]}&sz=w3000`;
    }
  } else if (store.piagamState.driveLink) {
    bgUrl = store.piagamState.driveLink;
  }

  // Buat kanvas cetak untuk setiap santri terpilih
  selectedIndukList.forEach(noInduk => {
    const santri = (store.globalDataSantri || []).find(r => String(r[1]) === String(noInduk));
    if (!santri) return;

    const page = document.createElement('div');
    page.className = `piagam-canvas ${orientation === 'portrait' ? 'piagam-portrait' : 'piagam-landscape'} border-0 shadow-none`;
    page.style.transform = 'scale(1)';

    if (bgUrl) {
      page.style.backgroundImage = `url('${bgUrl}')`;
      const imgTag = document.createElement('img');
      imgTag.className = 'piagam-bg-print';
      imgTag.src = bgUrl;
      page.appendChild(imgTag);
    }

    columns.forEach(col => {
      if (!col.show) return;

      const el = document.createElement('div');
      el.className = 'piagam-element';
      el.style.fontFamily = col.fontFamily || "'Times New Roman', serif";
      el.style.left = `${col.x}%`;
      el.style.top = `${col.y}%`;
      el.style.fontSize = `${col.size}px`;
      el.style.color = col.color || '#000000';
      el.style.fontWeight = col.isBold ? 'bold' : 'normal';

      const align = col.align || 'center';
      el.style.textAlign = align;

      if (align === 'left') {
        el.style.transform = 'translate(0, -50%)';
      } else if (align === 'right') {
        el.style.transform = 'translate(-100%, -50%)';
      } else {
        el.style.transform = 'translate(-50%, -50%)';
      }

      const displayText = parseMergeTags(col.text, santri, col.textTransform);
      el.innerText = displayText;
      page.appendChild(el);
    });

    wrapper.appendChild(page);
  });

  logActivity(store.currentUser, 'CETAK PIAGAM MASSAL', `Mencetak ${selectedIndukList.length} lembar piagam (${orientation})`);

  // Jeda kecil agar browser menyelesaikan rendering gambar sebelum dialog cetak terbuka
  setTimeout(() => {
    window.print();
  }, 400);

  // Kembalikan tampilan kanvas normal setelah dialog cetak ditutup
  setTimeout(() => {
    document.body.classList.remove('printing-piagam', 'print-landscape', 'print-portrait');
    wrapper.innerHTML = originalContent;
    renderPiagamCanvas();
    updateZoomPiagam();
  }, 1500);
}
