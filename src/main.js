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

// Import Komponen Navigasi dari folder src/partials/
import navbarHtml from './partials/navbar.html?raw';
import sidebarHtml from './partials/sidebar.html?raw';

// Import Halaman dari folder src/pages/
import pageSantri from './pages/santri.html?raw';
import pageFormasi from './pages/formasi.html?raw';
import pageAsatidz from './pages/asatidz.html?raw';
import './css/style.css';
import { supabase } from './lib/supabase.js';
import { store } from './state/store.js';
import {
  initLayoutObservers,
  toggleSidebar,
  showPage,
  actionLogout,
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
import * as daftarPendidik from './modules/daftar-pendidik/daftar-pendidik.js';

// Import Komponen Navigasi dari folder src/partials/
import navbarHtml from './partials/navbar.html?raw';
import sidebarHtml from './partials/sidebar.html?raw';

// Import Halaman dari folder src/pages/
import pageSantri from './pages/santri.html?raw';
import pageFormasi from './pages/formasi.html?raw';
import pageAsatidz from './pages/asatidz.html?raw';
import pageFan from './pages/fan.html?raw';
import pageDaftarPendidik from './pages/daftar-pendidik.html?raw';

// Import Komponen HTML Modal dari folder src/partials/
import modalsSantri from './partials/modals-santri.html?raw';
import modalsSystem from './partials/modals-system.html?raw';
import modalsFormasi from './partials/modals-formasi.html?raw';
import modalsAsatidz from './partials/modals-asatidz.html?raw';
import modalsFan from './partials/modals-fan.html?raw';

export { supabase };

// =========================================================
// 1. EKSPOR SELURUH FUNGSI KE GLOBAL WINDOW (UNTUK HTML ONCLICK)
// =========================================================
Object.assign(window, {
  toggleSidebar,
  showPage: (page, onShowFormasi, keepSidebarOpen) =>
    showPage(page, onShowFormasi || formasi.loadFormasiData, keepSidebarOpen),
  actionLogout,
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
  ...daftarPendidik
});

// =========================================================
// 2. INISIALISASI APLIKASI SAAT DOM SELESAI DIMUAT
// =========================================================
document.addEventListener('DOMContentLoaded', async function () {
  const navbarContainer = document.getElementById('navbar-container');
  if (navbarContainer) navbarContainer.innerHTML = navbarHtml;

  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) sidebarContainer.innerHTML = sidebarHtml;

  const pagesContainer = document.getElementById('pages-container');
  if (pagesContainer) {
    pagesContainer.innerHTML = pageSantri + pageFormasi + pageAsatidz + pageFan + pageDaftarPendidik;
  }

  const modalsContainer = document.getElementById('modals-container');
  if (modalsContainer) {
    modalsContainer.innerHTML = modalsSantri + modalsSystem + modalsFormasi + modalsAsatidz + modalsFan;
  }

  initLayoutObservers();

  santri.initSantriUI();
  formasi.initHideFilterFormasi();
  asatidz.initAsatidzUI();
  fan.initFanUI();

  loadInitialProvinces();
  setupWilayahListeners();
  setupWilayahListenersAsatidz();

  hierarchy.setupHierarchyListeners();
  hierarchy.setupHierarchyListenersAsatidz();

  try {
    store.appSettingsGlobal = await hierarchy.fetchSettingsFromSupabase();
    hierarchy.renderBuilderUI('tree1', store.appSettingsGlobal.tree1);
    hierarchy.renderBuilderUI('tree2', store.appSettingsGlobal.tree2);
    hierarchy.applyTreeData(store.appSettingsGlobal);
  } catch (err) {
    console.error('Gagal memuat app_settings:', err.message);
  }

  try {
    await fan.loadFanSettingsFromSupabase();
  } catch (err) {
    console.error('Gagal memuat pengaturan Fan Pelajaran:', err.message);
  }

  try {
    store.globalDataSantri = await santri.fetchAllSantriFromSupabase();
    santri.populateFilterDatalists();
    await formasi.loadFormasiData();
  } catch (err) {
    console.error('Background fetch santri/formasi gagal:', err.message);
  }

  try {
    store.globalDataAsatidz = await asatidz.fetchAllAsatidzFromSupabase();
    asatidz.populateFilterDatalistsAsatidz();
  } catch (err) {
    console.error('Background fetch asatidz gagal:', err.message);
  }
});
