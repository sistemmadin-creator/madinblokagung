export async function simpanJadwalDariKelas() {
  if (!_cacheModalJik || !_cacheModalJik.kelasKey) {
    return Swal.fire({
      icon: 'warning',
      title: 'Kelas Tidak Ditemukan',
      text: 'Silakan tutup dan buka kembali jendela Isi Jadwal Kelas.'
    });
  }

  const k = (store.masterStrukturKelasKBM || []).find(item => item.key === _cacheModalJik.kelasKey);
  if (!k) return;

  const HARI_LIST = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];
  const JAM_ARR = [1, 2];

  const genderTag = k.papi ? `(${k.papi})` : '';
  const namaKelasLengkap = `${k.kls} ${k.bag} ${k.tingkat} ${genderTag}`.replace(/\s+/g, ' ').trim();
  const klsTanpaGender = `${k.kls} ${k.bag} ${k.tingkat}`.replace(/\s+/g, ' ').trim();
  const lokasiGabungan = `${namaKelasLengkap} (${k.lokal || '-'})`;

  // ---------- 1. BACA INPUT JAM 1 & JAM 2 (SABTU S/D KAMIS) ----------
  const assignmentBaru = { 1: {}, 2: {} };
  let adaInputTerblokir = false;
  const namaTakDikenal = [];
  const daftarBentrok = [];

  JAM_ARR.forEach(jam => {
    HARI_LIST.forEach(hari => {
      const elAsatidz = document.getElementById(`jik_asatidz_${jam}_${hari}`);
      const elFan = document.getElementById(`jik_fan_${jam}_${hari}`);

      let rawAsatidz = (elAsatidz ? elAsatidz.value : '').trim();
      const fanVal = (elFan ? elFan.value : '').trim();

      // Bersihkan jika ada prefix [TERPAKAI di ...] atau ⭐ [MUSTAHIQ KELAS]
      if (/^\[TERPAKAI di /i.test(rawAsatidz)) {
        adaInputTerblokir = true;
        rawAsatidz = '';
        if (elAsatidz) elAsatidz.value = '';
      }
      rawAsatidz = rawAsatidz.replace(/^⭐\s*[MUSTAHIQ KELAS]\s*/i, '').trim();

      let namaFinal = rawAsatidz;
      if (rawAsatidz) {
        const rowMaster = (store.globalDataAsatidz || []).find(r => {
          const namaDb = String(r.nama_asatidz || r[4] || '').trim().toUpperCase();
          return namaDb === rawAsatidz.toUpperCase();
        });

        if (rowMaster) {
          namaFinal = String(rowMaster.nama_asatidz || rowMaster[4]).trim();
        } else {
          namaTakDikenal.push(`${hari} Jam ${jam}: ${rawAsatidz}`);
        }

        // Cek bentrok fisik di kelas lain pada hari & jam yang sama
        const busyMap = (_cacheModalJik.mapBusyAll && _cacheModalJik.mapBusyAll[`${hari}_${jam}`]) || {};
        const klsBentrok = busyMap[namaFinal.toUpperCase()];
        if (klsBentrok) {
          daftarBentrok.push(`${hari} Jam ${jam}: ${namaFinal} sudah mengajar di ${klsBentrok}`);
        }
      }

      assignmentBaru[jam][hari] = {
        asatidz: namaFinal,
        fan: fanVal
      };
    });
  });

  if (adaInputTerblokir) {
    return Swal.fire({
      icon: 'warning',
      title: 'Ada Asatidz Bentrok',
      text: 'Kolom yang berisi Asatidz berstatus [TERPAKAI] telah dikosongkan. Silakan periksa kembali.',
      confirmButtonColor: '#0f766e'
    });
  }

  if (namaTakDikenal.length > 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'Nama Asatidz Tidak Dikenal',
      html: `<div class="text-start small">Nama berikut tidak ditemukan di Data Asatidz:<br><br>${namaTakDikenal.map(n => '• <b>' + n + '</b>').join('<br>')}</div>`,
      confirmButtonColor: '#0f766e'
    });
  }

  if (daftarBentrok.length > 0) {
    return Swal.fire({
      icon: 'error',
      title: 'Jadwal Bentrok',
      html: `<div class="text-start small">${daftarBentrok.map(b => '• ' + b).join('<br>')}</div>`,
      confirmButtonColor: '#0f766e'
    });
  }

  // ---------- 2. KUMPULKAN DAFTAR ASATIDZ YANG TERDAMPAK (LAMA & BARU) ----------
  const affectedGuruSet = new Set();

  // Guru lama yang sebelumnya mengajar di kelas ini pada Jam 1 atau Jam 2
  Object.keys(store.jadwalMengajarMap || {}).forEach(namaKey => {
    const jObj = store.jadwalMengajarMap[namaKey];
    if (!jObj) return;
    HARI_LIST.forEach(hari => {
      const hKey = hari.toLowerCase();
      const slots = parseJadwalCell_Client(jObj[hKey] || '');
      if (slots.some(s => (s.jam === 1 || s.jam === 2) && isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender))) {
        affectedGuruSet.add(namaKey.trim().toUpperCase());
      }
    });
  });

  // Guru baru yang diinput di form modal
  JAM_ARR.forEach(jam => {
    HARI_LIST.forEach(hari => {
      const g = assignmentBaru[jam][hari].asatidz;
      if (g) affectedGuruSet.add(g.trim().toUpperCase());
    });
  });

  // ---------- 3. SUSUN PERUBAHAN JADWAL PER ASATIDZ ----------
  const mapPerubahan = {};

  affectedGuruSet.forEach(namaUpper => {
    const existing = getJadwalGuru(namaUpper);
    const updated = {
      nama_asatidz: existing.nama_asatidz || namaUpper,
      mengajar: existing.mengajar || '',
      sabtu: existing.sabtu || '',
      ahad: existing.ahad || '',
      senin: existing.senin || '',
      selasa: existing.selasa || '',
      rabu: existing.rabu || '',
      kamis: existing.kamis || '',
      totalJam: existing.totalJam || '0'
    };

    let totalJamCount = 0;
    const fanSet = new Set();

    HARI_LIST.forEach(hari => {
      const hKey = hari.toLowerCase();
      // Hapus slot lama milik kelas ini pada Jam 1 & Jam 2 (Jam 3 & 4 tetap utuh)
      let slots = parseJadwalCell_Client(updated[hKey] || '').filter(s => {
        if (s.jam !== 1 && s.jam !== 2) return true;
        return !isSlotMilikKelas(s.lokasi, namaKelasLengkap, klsTanpaGender);
      });

      // Tambahkan slot baru jika guru ini ditugaskan pada hari & jam tersebut
      JAM_ARR.forEach(jam => {
        const assign = assignmentBaru[jam][hari];
        if (assign && assign.asatidz && assign.asatidz.trim().toUpperCase() === namaUpper) {
          slots.push({
            jam: jam,
            fan: assign.fan || '-',
            lokasi: lokasiGabungan
          });
        }
      });

      slots.sort((a, b) => a.jam - b.jam);
      slots.forEach(s => {
        totalJamCount++;
        if (s.fan && s.fan !== '-') fanSet.add(s.fan);
      });

      updated[hKey] = stringifyJadwalCell_Client(slots);
    });

    updated.totalJam = String(totalJamCount);
    updated.mengajar = Array.from(fanSet).join(', ');
    mapPerubahan[namaUpper] = updated;
  });

  // ---------- 4. SIMPAN KE SUPABASE & PERBARUI UI ----------
  const btn = document.getElementById('btnSimpanJadwalKelas');
  const oriText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
    btn.disabled = true;
  }

  try {
    await simpanBatchJadwalAsatidzKeServer(mapPerubahan);

    if (btn) {
      btn.innerHTML = oriText;
      btn.disabled = false;
    }

    jQuery('#modalInputJadwalKelas').modal('hide');
    renderJadwalKBM();

    Swal.fire({
      icon: 'success',
      title: 'Tersimpan!',
      text: `Jadwal Jam 1 & 2 kelas ${namaKelasLengkap} berhasil diperbarui.`,
      timer: 1500,
      showConfirmButton: false
    });
  } catch (err) {
    if (btn) {
      btn.innerHTML = oriText;
      btn.disabled = false;
    }
    Swal.fire({
      icon: 'error',
      title: 'Gagal Menyimpan',
      text: err && err.message ? err.message : 'Terjadi kesalahan saat menyimpan jadwal.'
    });
  }
}
