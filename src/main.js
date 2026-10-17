import { supabase } from './lib/supabase.js';
import { store } from './state/store.js';
import {
  initLayoutObservers,
  toggleSidebar,
  showPage,
  actionLogout,
  handleClickMenuJadwal,
  toggleSubmenuJadwal,
  handleClickMenuFan,
  toggleSubmenuFan,
  handleClickMenuFormasi,
  toggleSubmenuFormasi
} from './utils/dom.js';
import { loadInitialProvinces, setupWilayahListeners, setupWilayahListenersAsatidz } from './utils/wilayah.js';
import * as camera from './utils/camera.js';
import * as audit from './modules/audit/audit.js';
import * as hierarchy from './modules/settings/hierarchy.js';
import * as santri from './modules/santri/santri.js';
import * as asatidz from './modules/asatidz/asatidz.js';
import * as formasi from './modules/formasi/formasi.js';
import * as fan from './modules/fan/fan.js';
import * as jadwalKbm from './modules/jadwal-kbm/jadwal-kbm.js';
import * as hariKbm from './modules/hari-kbm/hari-kbm.js';
import * as daftarPendidik from './modules/daftar-pendidik/daftar-pendidik.js';
import * as absensi from './modules/absensi/absensi.js';
import * as rekapAbsensi from './modules/rekap-absensi/rekap-absensi.js';

// Import Komponen Navigasi dari folder src/partials/
import navbarHtml from './partials/navbar.html?raw';
import sidebarHtml from './partials/sidebar.html?raw';

// Import Halaman dari folder src/pages/
import pageSantri from './pages/santri.html?raw';
import pageFormasi from './pages/formasi.html?raw';
import pageAsatidz from './pages/asatidz.html?raw';
import pageAbsensi from './pages/absensi.html?raw';
import pageRekapAbsensi from './pages/rekap-absensi.html?raw';
import pageFan from './pages/fan.html?raw';
import pageJadwalKbm from './pages/jadwal-kbm.html?raw';
import pageHariKbm from './pages/hari-kbm.html?raw';
import pageDaftarPendidik from './pages/daftar-pendidik.html?raw';

// Import Komponen HTML Modal dari folder src/partials/
import modalsSantri from './partials/modals-santri.html?raw';
import modalsSystem from './partials/modals-system.html?raw';
import modalsFormasi from './partials/modals-formasi.html?raw';
import modalsAsatidz from './partials/modals-asatidz.html?raw';
import modalsFan from './partials/modals-fan.html?raw';
import modalsJadwalKbm from './partials/modals-jadwal-kbm.html?raw';
import modalsAbsensi from './partials/modals-absensi.html?raw';

export { supabase };

// =========================================================
// 1. EKSPOR SELURUH FUNGSI KE GLOBAL WINDOW (UNTUK HTML ONCLICK)
// =========================================================
Object.assign(window, {
  toggleSidebar,
  showPage: (page, onShowFormasi, keepSidebarOpen) =>
    showPage(page, onShowFormasi || formasi.loadFormasiData, keepSidebarOpen),
  actionLogout,
  handleClickMenuJadwal,
  toggleSubmenuJadwal,
  handleClickMenuFan,
  toggleSubmenuFan,
  handleClickMenuFormasi,
  toggleSubmenuFormasi,
  ...camera,
  ...audit,
  ...hierarchy,
  ...santri,
  ...asatidz,
  ...formasi,
  ...fan,
  ...jadwalKbm,
  ...hariKbm,
  ...daftarPendidik,
  ...absensi,
  ...rekapAbsensi
});

// =========================================================
// 2. INISIALISASI APLIKASI SAAT DOM SELESAI DIMUAT
// =========================================================
document.addEventListener('DOMContentLoaded', async function () {
  // 0A. Render Navbar & Sidebar dari src/partials/
  const navbarContainer = document.getElementById('navbar-container');
  if (navbarContainer) navbarContainer.innerHTML = navbarHtml;

  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) sidebarContainer.innerHTML = sidebarHtml;

  // 0B. Render seluruh halaman dari src/pages/ ke dalam #pages-container
  const pagesContainer = document.getElementById('pages-container');
  if (pagesContainer) {
    pagesContainer.innerHTML =
      pageSantri +
      pageFormasi +
      pageAsatidz +
      pageAbsensi +
      pageRekapAbsensi +
      pageFan +
      pageJadwalKbm +
      pageHariKbm +
      pageDaftarPendidik;
  }

  // 0C. Render seluruh komponen modal dari src/partials/ ke dalam #modals-container
  const modalsContainer = document.getElementById('modals-container');
  if (modalsContainer) {
    modalsContainer.innerHTML =
      modalsSantri +
      modalsSystem +
      modalsFormasi +
      modalsAsatidz +
      modalsFan +
      modalsJadwalKbm +
      modalsAbsensi;
  }

  // Pasang Observer Layout, Resize Tabel & Hover Sidebar
  initLayoutObservers();

  // Inisialisasi UI masing-masing modul
  santri.initSantriUI();
  formasi.initHideFilterFormasi();
  asatidz.initAsatidzUI();
  fan.initFanUI();
  jadwalKbm.initJadwalKbmUI();

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

  // Muat konfigurasi Fan Pelajaran (Item Fan, Detail Jam/MS/MB, & Grup Asal) dari `app_settings`
  try {
    await fan.loadFanSettingsFromSupabase();
  } catch (err) {
    console.error('Gagal memuat pengaturan Fan Pelajaran:', err.message);
  }

  // Muat data Jadwal Mengajar Asatidz (untuk Jadwal KBM Per Kelas) dari `app_settings`
  try {
    await jadwalKbm.loadJadwalKbmFromSupabase();
  } catch (err) {
    console.error('Gagal memuat Jadwal KBM dari Supabase:', err.message);
  }

  // Muat data Riwayat Absensi Asatidz & Pengaturan Libur dari `app_settings`
  try {
    await absensi.loadAbsensiFromSupabase();
  } catch (err) {
    console.error('Gagal memuat data Absensi dari Supabase:', err.message);
  }

  // Background Fetch Data Santri, Asatidz & Formasi Kelas
  try {
    store.globalDataSantri = await santri.fetchAllSantriFromSupabase();
    santri.populateFilterDatalists();
  } catch (err) {
    console.error('Background fetch santri gagal:', err.message);
  }

  try {
    store.globalDataAsatidz = await asatidz.fetchAllAsatidzFromSupabase();
    asatidz.populateFilterDatalistsAsatidz();
  } catch (err) {
    console.error('Background fetch asatidz gagal:', err.message);
  }

  // Muat tabel Formasi Kelas setelah data Santri & Asatidz siap untuk disinkronkan
  try {
    await formasi.loadFormasiData();
  } catch (err) {
    console.error('Background fetch formasi gagal:', err.message);
  }
});
