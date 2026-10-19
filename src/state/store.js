// =========================================================
// PENYIMPANAN STATE GLOBAL TERPUSAT & KONFIGURASI KOLOM
// =========================================================
export const store = {
  dataTable: null,
  dataTableAsatidz: null,
  dtFormasi: null,
  tree1Data: {},
  tree2Data: {},
  tree3Data: {},
  isEditMode: false,
  isEditModeAsatidz: false,
  selectedRowData: [],
  selectedRowDataAsatidz: null,
  globalDataSantri: [],
  globalDataAsatidz: [],
  globalDataFormasi: [],
  hiddenColumnsGlobal: [],
  hiddenColumnsGlobalAsatidz: [],
  appSettingsGlobal: {
    tree1: '',
    tree2: '',
    tree3: '',
    hafWajib: {},
    hafSunnah: {},
    hafKitab: {},
    penjagaBebas: ''
  },
  // State Khusus Modul Setoran (Muhafadzoh Madin)
  dataTableMuhafadzoh: null,
  globalDataMuhafadzoh: [],
  muhafadzohIndexMap: new Map(),
  editMuhDataOld: null,
  selectedPenjagaBebasArray: [],
  // State Khusus Modul Rekap Hafalan Pertingkatan
  currentRekapData: null,
  currentRekapTahfidzData: null,
  rekapActiveMode: 'wajib',
  // State Khusus Modul Fan Pelajaran & Pengajar Fan
  fanConfig: {},
  fanPelajaranDetail: {
    kelas: {},
    item: {}
  },
  masterGrupAsal: [],
  // State Khusus Modul Jadwal KBM Per Kelas
  jadwalMengajarMap: {},
  masterStrukturKelasKBM: [],
// State Khusus Modul Hari KBM (Jadwal Harian Asatidz)
  activeHariKBM: 'Sabtu',
  allHariKBMData: [],
  dataHariKBMFiltered: [],
  hariKBMViewMode: 'table',
  // State Khusus Modul Daftar Pendidik (Daftar Tenaga Pendidik)
  keywordCariPendidik: '',
  barisTampilDaftarPendidik: [],
  // State Khusus Modul Absensi Asatidz & Riwayat Presensi
  dataTableRiwayatAbsensi: null,
  absensiMapByDate: {},
  liburMapByDate: {},
  rawRiwayatAbsensi: [],
  lastRiwayatRowsFiltered: null,
  riwayatViewMode: 'table',
absensiState: {
    tanggal: '',
    hari: '',
    isLibur: false,
    infoLibur: null,
    sesiHariIni: { 1: [], 2: [], 3: [], 4: [] },
    savedRecords: {},
    pendingStatus: {},
    unlockedJams: { 1: true, 2: false, 3: false, 4: false },
    savedJams: { 1: false, 2: false, 3: false, 4: false }
  },
  // State Khusus Modul Rekap Absensi Asatidz
  dataTableRekapAbsensi: null,
  rekapAbsensiInitialized: false,
  rekapAbsensiState: {
    dataPerAsatidz: [],
    dataPerAsatidzFiltered: []
  },
  // State Khusus Modul Absen Cepat
  absenCepatState: {
    jamAktif: 1,
    selectedKeys: new Set(),
    search: '',
    filterBlok: '',
    sortBy: 'kelas_asc',
    arahSwipe: null,
    initializedForDate: null,
    acModalStatus: 'Hadir'
  },
  currentUser: {
    username: 'admin',
    nama: 'Master Administrator',
    role: 'Master Admin',
    canEdit: true
  }
};

// Urutan field tabel `santri` di Supabase (indeks 1..35 pada array baris)
export const SANTRI_DB_FIELDS = [
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

// Urutan field tabel `asatidz` di Supabase
export const ASATIDZ_DB_FIELDS = [
  'nis', 'nia', 'nama_asatidz', 'pa_pi',
  'tempat_lahir', 'tgl_lahir', 'bln_lahir', 'thn_lahir',
  'dusun', 'desa', 'kecamatan', 'kabupaten', 'provinsi',
  'blok', 'asrama', 'kode', 'kamar',
  'tingkat_asatidz', 'din_kls_asatidz', 'din_bag_asatidz',
  'jah_asatidz', 'lokasi_diniyyah', 'lokasi_takror', 'foto_asatidz'
];

// 16 Kategori Filter Lanjutan Santri sesuai indeks kolom DataTables
export const filterCategories = [
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

// Kategori Filter Lanjutan Asatidz
export const filterCategoriesAsatidz = [
  { name: 'PA/PI', col: 5, field: 'pa_pi' },
  { name: 'Kelas Diniyyah', col: 6, field: null },
  { name: 'Blok', col: 7, field: 'blok' },
  { name: 'Jah', col: 9, field: 'jah_asatidz' }
];

// Konversi row object dari Supabase menjadi array 36 elemen (indeks 0 kosong, 1..35 data)
export function dbRowToArray(obj) {
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
