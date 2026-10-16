# Database Santri & Asatidz - Madrasah Diniyyah Al Amiriyyah Blokagung

Aplikasi web manajemen database terpadu untuk **Data Santri**, **Data Asatidz**, **Formasi Kelas Madin**, **Hierarki Dropdown**, dan **Audit Log Aktivitas** menggunakan **Vite** dan **Supabase**.

## Struktur Direktori
- `src/css/style.css` : Stylesheet utama dan tema UI/UX aplikasi.
- `src/main.js` : Logika utama aplikasi, koneksi Supabase, dan manajemen tabel.
- `index.html` : Halaman utama aplikasi.
- `.env.example` : Contoh konfigurasi variabel environment Supabase.

## Cara Menjalankan di Lokal
1. Instal dependensi:
   ```bash
   npm install


## list progres akan datang
```bash
diperbarui
- menjadikan satu tombol hierarki dropdown dan log aktivitas menjadi satu dalam menu pengaturan
- fitur import pada input data asatidz

diperbaiki
- klik menu utama tidak akan menutup, kalau ingin melihat menu dibawahnya cukup klik panahnya
- layout HP

menu baru:
- absensi bermasalah / kasus absensi
  - penanganan absen asatidz apakah sudah sowan apa belum serta bikin suratnya juga
- muhafadzoh bermasalah / kasus hafalan
  - Rekap bermasalah berdasarkan kelas

menu baru selanjutnya
- fan pelajaran (diberi garis batas bahwa ini Kurkulum)
- Pengajar Fan
- Jadwal KBM
- Hari KBM
- Daftar Pendidik
- Absensi Asatidz (diberi garis batas bahwa ini TOP)
- Rekap Absensi
- Absen Cepat
- Setoran (diberi garis batas bahwa ini Muhafadzoh)
- Rekap Hafalan
- Cetak Piagam
- Dasboard (ditaruh atas sendiridiberi garis batas bahwa ini Dashboard)
isinya yakni
- Kurikulum
- Muhafadzoh
- TOP

Ide:
- Halaman Absensi Asatidz Tabelnya diganti dengan buku absen berikut
NO | Kelas | Jam | Hari & Tanggal | Total Hadir | Tempat

- Absensi Talamidz disamakan dengan absen cepat dan sesuai dengan buku absen

- Absen cepat diberi fitur pagejing dan dibatasi dengan 3 kolom supaya muat banyak didekstop
