import { supabase } from './lib/supabase.js';
import { store } from './state/store.js';
import { initLayoutObservers, toggleSidebar, showPage, actionLogout } from './utils/dom.js';
import { loadInitialProvinces, setupWilayahListeners, setupWilayahListenersAsatidz } from './utils/wilayah.js';
import * as camera from './utils/camera.js';
import * as audit from './modules/audit/audit.js';
import * as hierarchy from './modules/settings/hierarchy.js';
import * as santri from './modules/santri/santri.js';
import * as asatidz from './modules/asatidz/asatidz.js';
import * as formasi from './modules/formasi/formasi.js';

export { supabase };

// =========================================================
// 1. EKSPOR SELURUH FUNGSI KE GLOBAL WINDOW (UNTUK HTML ONCLICK)
// =========================================================
Object.assign(window, {
  toggleSidebar,
  showPage: (page) => showPage(page, formasi.loadFormasiData),
  actionLogout,
  ...camera,
  ...audit,
  ...hierarchy,
  ...santri,
  ...asatidz,
  ...formasi
});

// =========================================================
// 2. INISIALISASI APLIKASI SAAT DOM SELESAI DIMUAT
// =========================================================
document.addEventListener('DOMContentLoaded', async function () {
  // Pasang Observer Layout, Resize Tabel & Hover Sidebar
  initLayoutObservers();

  // Inisialisasi UI masing-masing modul
  santri.initSantriUI();
  formasi.initHideFilterFormasi();
  asatidz.initAsatidzUI();

  // Muat daftar Provinsi dari API Emsifa & pasang listener cascading wilayah
  loadInitialProvinces();
  setupWilayahListeners();
  setupWilayahListenersAsatidz();

  // Pasang listener cascading Hierarki Dropdown (Santri & Asatidz)
  hierarchy.setupHierarchyListeners();
  hierarchy.setupHierarchyListenersAsatidz();

  // Muat konfigurasi Hierarki Dropdown dari tabel `app_settings`
  try {
    store.appSettingsGlobal = await hierarchy.fetchSettingsFromSupabase();
    hierarchy.renderBuilderUI('tree1', store.appSettingsGlobal.tree1);
    hierarchy.renderBuilderUI('tree2', store.appSettingsGlobal.tree2);
    hierarchy.applyTreeData(store.appSettingsGlobal);
  } catch (err) {
    console.error('Gagal memuat app_settings:', err.message);
  }

  // Background Fetch Data Santri & Formasi Kelas
  try {
    store.globalDataSantri = await santri.fetchAllSantriFromSupabase();
    santri.populateFilterDatalists();
    await formasi.loadFormasiData();
  } catch (err) {
    console.error('Background fetch santri/formasi gagal:', err.message);
  }

  // Background Fetch Data Asatidz
  try {
    store.globalDataAsatidz = await asatidz.fetchAllAsatidzFromSupabase();
    asatidz.populateFilterDatalistsAsatidz();
  } catch (err) {
    console.error('Background fetch asatidz gagal:', err.message);
  }
});
