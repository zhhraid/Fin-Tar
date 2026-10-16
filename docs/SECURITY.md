# FinTar: Keamanan, Kepatuhan & Mitigasi Risiko

Dokumen ini menjelaskan bagaimana FinTar melindungi data keuangan pelaku UMKM, aturan apa yang diikuti, risiko yang tersisa, dan batasan yang perlu diketahui juri maupun pengguna. Setiap kontrol menyebut berkasnya dan test yang membuktikannya, supaya bisa diperiksa langsung.

## 1. Data yang dilindungi

| Data | Disimpan di | Siapa yang bisa membaca |
|---|---|---|
| Transaksi, profil usaha, utang, belanja terjadwal | Mode perangkat: browser pengguna. Mode akun: Supabase (PostgreSQL) | Hanya pemilik akun (Row Level Security) |
| Riwayat izin AI dan log aktivitas | Sama seperti di atas | Hanya pemilik akun; tidak bisa diubah atau dihapus |
| Foto struk | Tidak disimpan. Dikirim sekali ke AI untuk dibaca | Penyedia AI (Claude atau Gemini) saat diproses |
| Kunci API AI | Variabel environment server | Tidak pernah sampai ke browser |
| PIN | Hash PBKDF2 per akun di perangkat; PIN aslinya tidak disimpan | Tidak ada |

## 2. Ancaman yang diperhitungkan

1. **Orang lain memakai HP pemilik yang sedang terbuka** lalu mengunduh atau menghapus laporan keuangan.
2. **Pengguna lain mencoba membaca data usaha lain** lewat API Supabase.
3. **Pihak luar menghabiskan kuota atau tagihan AI** dengan memanggil endpoint AI berulang kali.
4. **Situs lain menyisipkan FinTar** dalam iframe (clickjacking) atau **menyusupkan skrip** (XSS).
5. **Asisten AI disuruh bertindak berbahaya**, misalnya memindahkan uang, atau disusupi perintah lewat teks struk (prompt injection).
6. **Riwayat aktivitas dipalsukan** untuk menutupi tindakan.
7. **File ekspor yang berbahaya**: keterangan transaksi yang menjadi rumus saat dibuka di Excel.
8. **Pengguna salah paham** dan mengira pengajuan modal atau asuransi simulasi adalah layanan sungguhan.

## 3. Kontrol yang diterapkan

### 3.1 Akses data

| Kontrol | Penjelasan | Berkas | Bukti |
|---|---|---|---|
| Row Level Security di semua tabel | Database sendiri yang membatasi baris per pemilik, bukan kode aplikasi. Kunci `anon` tanpa login tidak bisa membaca apa pun. | `supabase/migrations/20261009000000_fintar.sql` | Diuji di PostgreSQL 16: pengguna B tidak melihat satu pun baris log milik A |
| Kata sandi kuat | Akun baru wajib minimal 8 karakter, berisi huruf dan angka, dan bukan kata sandi umum. Dicek di aplikasi dan sebaiknya juga disetel di Supabase (lihat README). | `src/lib/cloud.ts`, `src/components/AuthScreen.tsx` | `src/test/cloud.test.tsx` |
| PIN 6 angka (gaya m-banking) | Diminta sebelum data keluar dari aplikasi (laporan PDF, Excel/CSV, proposal modal, log) dan sebelum "Hapus semua data". PIN lemah (111111, 123456) ditolak. Lima kali salah, terkunci 5 menit, dan kejadiannya masuk log. PIN disimpan sebagai hash PBKDF2-SHA256 150.000 iterasi dengan salt acak. | `src/lib/pin.ts`, `src/components/PinSheet.tsx` | `src/test/pin.test.tsx` |
| Lupa PIN | Mode akun: verifikasi ulang kata sandi akun. Mode perangkat: tidak ada akun untuk memulihkan, jadi satu-satunya jalan adalah menghapus data perangkat. Dengan begitu, orang yang tidak tahu PIN tidak bisa membaca datanya. | `src/components/PinSheet.tsx` | Diperiksa manual |
| Hak hapus data | `delete_my_data()` menghapus semua baris milik pemanggil, tanpa parameter, jadi tidak bisa dipakai untuk menghapus data orang lain. | migrasi `20261016000000_audit_chain.sql` | `src/test/cloud.test.tsx`, uji PostgreSQL |

### 3.2 Endpoint AI (`/api/chat`, `/api/scan`)

| Kontrol | Penjelasan | Berkas | Bukti |
|---|---|---|---|
| Kunci hanya di server | Semua panggilan AI lewat satu modul server. | `src/lib/ai.server.ts` | — |
| Wajib login dan izin AI | Dalam mode akun, token login diperiksa ke Supabase dan izin AI terakhir harus "diberikan". | `src/lib/auth.server.ts` | — |
| Tolak permintaan lintas situs | Permintaan dengan `Origin` dari situs lain atau `Sec-Fetch-Site: cross-site` ditolak (403). | `src/lib/guard.server.ts` | `src/test/security.test.ts` |
| Batas ukuran kiriman | Chat maksimal ±2 MB, foto struk ±6 MB (413). | `src/lib/guard.server.ts`, `src/lib/scan.server.ts` | `src/test/security.test.ts` |
| Batas jumlah permintaan | Bawaan 20 per menit dan 300 per hari per IP untuk chat. Pindai struk 40% dari angka itu karena lebih mahal. Lewat batas: 429 dengan `Retry-After`. | `src/lib/guard.server.ts` | `src/test/security.test.ts` |

### 3.3 Browser

| Kontrol | Penjelasan | Berkas |
|---|---|---|
| Content-Security-Policy | Skrip hanya dari FinTar sendiri, tanpa `eval`. Koneksi hanya ke FinTar dan proyek Supabase. Tidak bisa dimuat di iframe situs lain (`frame-ancestors 'none'`). | `src/lib/security-headers.ts` |
| Header lain | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` (kamera hanya untuk FinTar; mikrofon, lokasi, dan pembayaran dimatikan). | `src/lib/security-headers.ts`, `netlify.toml` |
| Proteksi CSRF untuk server function | Bawaan TanStack Start, dipasang ulang secara eksplisit. | `src/start.ts` |

Diuji pada build produksi (`npm run build && npm start`) dengan Chromium: semua header terkirim, permintaan lintas situs ke `/api/chat` mendapat 403, dan alur utama (laporan, unduh PDF dengan PIN, Finix, pindai) berjalan tanpa diblokir CSP. Satu-satunya laporan CSP berasal dari pustaka validasi `zod`, yang mengecek apakah `eval` diizinkan lalu otomatis memakai jalur tanpa `eval`.

### 3.4 Asisten AI (Finix) dan izin bertingkat

| Tier | Contoh | Aturan di FinTar |
|---|---|---|
| T0 Baca | Bertanya ke Finix, melihat ringkasan | Otomatis, dicatat |
| T1 Saran | Skor pembiayaan, target omzet | Otomatis, selalu dengan alasan |
| T2 Bertindak | Impor CSV, kirim proposal, ekspor data | Hanya setelah persetujuan pengguna. Ekspor data juga wajib PIN |
| T3 Terlarang | Memindahkan uang, membaca/mengubah data orang lain, mengirim data ke luar | Selalu ditolak dengan jawaban tetap **tanpa memanggil AI**, lalu dicatat sebagai "Diblokir" |

Pendeteksi T3 (`src/lib/guardrails.ts`) mencari *permintaan untuk bertindak*, bukan sekadar topik. "Tolong transfer 2 juta ke supplier" diblokir, sedangkan "Apakah kas cukup untuk bayar supplier?" tetap dijawab. Daftar contohnya diuji di `src/test/security.test.ts`.

Pertahanan terhadap prompt injection: instruksi sistem Finix menegaskan bahwa nama transaksi dan isi struk adalah data, bukan perintah. Hasil bacaan struk divalidasi dengan skema JSON lalu dibersihkan (panjang teks, angka tidak negatif, kategori dari daftar tetap) sebelum ditampilkan. Tidak ada yang tersimpan sebelum pengguna menekan konfirmasi.

### 3.5 Log aktivitas berantai hash

- Setiap baris menyimpan `hash = SHA-256(isi baris + hash baris sebelumnya)`. Baris pertama menyambung ke `GENESIS`.
- Hash, urutan, dan waktu diisi oleh **database**. Waktu dari aplikasi ditimpa waktu server, jadi tidak bisa dimundurkan.
- Baris tidak bisa diubah atau dihapus, termasuk lewat kunci `service_role`, kecuali oleh `delete_my_data()` dan penghapusan akun.
- `verify_my_activity_log()` menghitung ulang seluruh rantai. Layar Log Aktivitas menampilkan "Rantai log utuh" atau peringatan beserta posisi baris pertama yang rusak.
- File log yang diunduh menyertakan hash terakhir sebagai patokan untuk pemeriksaan di kemudian hari.

Diuji di PostgreSQL 16 (`supabase/migrations/20261016000000_audit_chain.sql`): data lama ikut tersambung, perubahan dan penghapusan ditolak, perubahan yang mengakali trigger terdeteksi di baris yang tepat, pengguna lain tidak terpengaruh, dan migrasi aman dijalankan ulang.

### 3.6 Ekspor file

- CSV: sel yang diawali `=`, `+`, `-`, `@`, tab, atau CR diberi tanda petik di depannya supaya Excel/Sheets tidak menjalankannya sebagai rumus. Saat diimpor kembali, tanda itu dibuang (`src/lib/csv.ts`, diuji di `src/test/financials.test.ts`).
- Semua ekspor wajib PIN dan tercatat di log aktivitas sebagai T2.

## 4. Kepatuhan

### UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (PDP)

| Prinsip / hak | Penerapan di FinTar | Status |
|---|---|---|
| Dasar pemrosesan: persetujuan | Izin pemrosesan AI wajib sebelum fitur AI aktif, dicek juga di server, dan bisa dicabut kapan saja. Riwayat izin hanya bisa ditambah. | Ada |
| Hak menghapus | "Hapus semua data saya" | Ada |
| Keamanan pemrosesan | RLS, PIN, header keamanan, batas permintaan, log berantai hash | Ada |
| Akuntabilitas | Log aktivitas dengan tier, status, dan rantai hash | Ada |
| Minimalisasi data | Foto struk tidak disimpan. Chat hanya mengirim 20 giliran terakhir. | Sebagian: nama usaha dan keterangan transaksi masih dikirim apa adanya ke AI |
| Transparansi | Label "mode demo" dan "simulasi" di layar | Sebagian: belum ada halaman Kebijakan Privasi |
| Transfer ke luar negeri | Claude dan Gemini diproses di luar Indonesia | Perlu dinyatakan di Kebijakan Privasi |
| Hak akses dan portabilitas | Ekspor CSV transaksi dan JSON log | Sebagian: belum ada satu tombol "unduh semua data" |

### OJK dan layanan keuangan

- FinTar adalah alat pencatatan dan edukasi keuangan, **bukan** pemberi pinjaman, penyelenggara P2P lending, atau perusahaan asuransi. FinTar tidak menyalurkan dana, tidak menerbitkan polis, dan tidak memutuskan kelayakan kredit.
- Semua lembaga, bunga, dan paket asuransi adalah **data simulasi**. Setiap layar pembiayaan dan asuransi menampilkan banner "Simulasi • bukan layanan keuangan sungguhan" dan arahan untuk mengecek legalitas lembaga di ojk.go.id atau Kontak OJK 157.
- Tahap status pengajuan diberi label "(simulasi)". Tahap terakhir ditulis sebagai contoh hasil, tanpa dana yang cair.

## 5. Matriks risiko

Skala: R = rendah, S = sedang, T = tinggi. Risiko sisa adalah tingkat risiko setelah mitigasi diterapkan.

| # | Risiko | Kemungkinan | Dampak | Mitigasi | Risiko sisa |
|---|---|---|---|---|---|
| 1 | Pengguna lain membaca data usaha | S | T | RLS di semua tabel, kunci `anon` tanpa akses | R |
| 2 | HP dipinjam lalu laporan diunduh atau dihapus | T | S | PIN untuk ekspor dan hapus, penguncian setelah 5 kali salah, log | R–S (layar biasa tetap terlihat; lihat batasan) |
| 3 | Kuota atau tagihan AI dihabiskan pihak luar | T | S | Tolak lintas situs, batas ukuran, batas per menit/hari | S (batasnya per instance server) |
| 4 | Clickjacking atau XSS | S | T | CSP, `frame-ancestors 'none'`, React meng-escape teks | R |
| 5 | Finix disuruh memindahkan uang | S | T | Finix memang tidak punya kemampuan itu; permintaan T3 ditolak tanpa AI dan dicatat | R |
| 6 | Prompt injection lewat struk | S | S | Struk diperlakukan sebagai data, hasilnya divalidasi skema, wajib dikonfirmasi pengguna | R |
| 7 | Riwayat aktivitas dipalsukan | R | S | Rantai hash, waktu dari server, tidak bisa diubah atau dihapus | R–S (lihat batasan) |
| 8 | Rumus berbahaya di file CSV | R | S | Netralisasi rumus saat ekspor | R |
| 9 | Pengguna mengira simulasi adalah pinjaman sungguhan | S | T | Banner simulasi dan disclaimer OJK di setiap layar terkait | R |
| 10 | Kata sandi lemah atau bocor | T | T | Minimal 8 karakter dengan huruf dan angka, tolak kata sandi umum, perlindungan kata sandi bocor di Supabase | S (perlindungan kata sandi bocor perlu paket Pro) |
| 11 | Data dikirim ke penyedia AI | Pasti, saat AI dipakai | S | Persetujuan eksplisit, bisa dicabut, foto tidak disimpan | S (belum ada penyamaran data pribadi) |

## 6. Batasan yang diketahui

Batasan ini dinyatakan terus terang sesuai permintaan PRD untuk *self-assessment*:

1. **PIN adalah gerbang di aplikasi, bukan enkripsi.** Data yang sudah tampil di layar tetap ada di browser. PIN mencegah ekspor dan penghapusan oleh orang yang meminjam HP, bukan orang yang membuka alat pengembang browser.
2. **PIN disimpan per perangkat.** Di HP lain, pengguna diminta membuat PIN baru.
3. **Batas permintaan AI disimpan di memori server.** Di hosting serverless, tiap instance menghitung sendiri, jadi batas totalnya bisa lebih longgar dari angka yang disetel. Untuk skala produksi, gunakan penyimpanan bersama seperti Redis atau Upstash, atau rate limiting bawaan platform.
4. **Isi log tetap ditulis oleh aplikasi.** Rantai hash membuktikan bahwa log tidak diubah setelah tercatat, tetapi pemilik akun yang memanggil API sendiri tetap bisa menambahkan baris palsu di ujung rantai. Pemilik database yang mematikan trigger lalu menghitung ulang semua hash juga bisa menulis ulang riwayat. Hash terakhir di file ekspor menjadi patokan untuk membuktikannya.
5. **CSP masih mengizinkan skrip inline**, karena halaman yang dirender server membawa data hidrasinya secara inline. Langkah berikutnya adalah nonce per permintaan.
6. **Pendeteksi T3 berbasis pola kata.** Kalimat yang sangat tidak biasa bisa lolos ke AI. Itu tidak berbahaya, karena Finix memang tidak bisa memindahkan uang dan instruksi sistemnya menolak permintaan seperti itu, tetapi percobaannya tidak tercatat sebagai T3.
7. **Mode perangkat** menyimpan data tanpa enkripsi di `localStorage` browser.
8. **Akurasi pembacaan struk** belum diukur pada himpunan uji sendiri (PRD meminta minimal 20 foto).

## 7. Belum dikerjakan (saran berikutnya)

- Menyamarkan data pribadi (nomor HP, email, NIK, nomor rekening) sebelum dikirim ke AI.
- Halaman Kebijakan Privasi dan Syarat Penggunaan, termasuk pernyataan transfer data ke luar negeri, serta versi kebijakan yang dicatat bersama persetujuan.
- Tombol "Unduh semua data saya" (portabilitas) dan penghapusan akun login dari aplikasi.
- Rate limiting dengan penyimpanan bersama dan nonce CSP.
- Keluar otomatis setelah tidak dipakai beberapa lama.

## 8. Cara memeriksa sendiri

```sh
npm test                 # termasuk security.test.ts, pin.test.ts, cloud.test.tsx
npx tsc --noEmit
npm run build && npm start
curl -sI localhost:3000/ | grep -iE "content-security|x-frame|strict-transport"
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/chat -H "origin: https://situs-lain.test" -d '{}'   # 403
```

Untuk rantai log: jalankan kedua migrasi di Supabase, catat beberapa aktivitas, buka **Profil > Log aktivitas & hapus data**, lalu pastikan muncul "Rantai log utuh".
