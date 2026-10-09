# FinTar

Aplikasi keuangan untuk UMKM (PWA, mobile-first): catat pemasukan dan pengeluaran, pindai struk, lihat laporan keuangan otomatis, tanya Finix, lalu ajukan modal dari catatan yang sama.

Repositori ini adalah gabungan dua versi FinTar. Spesifikasi produk ada di [docs/PRD.md](docs/PRD.md). Antarmuka masih berbahasa Indonesia; PRD meminta bahasa Inggris, dan itu belum dikerjakan.

| Fitur | Keterangan |
|---|---|
| Catat transaksi | Manual dengan kategori otomatis, pindai struk lalu koreksi hasil bacaan, atau impor CSV |
| Laporan | Laba rugi, arus kas, dan neraca dari transaksi, dengan penjelasan bahasa sehari-hari; ekspor PDF dan CSV |
| Peringatan & proyeksi | Proyeksi kas 30 hari termasuk utang pemasok dan belanja terjadwal |
| Finix | Asisten yang membaca catatan: kondisi keuangan, biaya yang bisa dihemat, rencana mencapai target omzet |
| Ajukan Modal | Skor kecocokan dengan alasannya, proposal PDF terisi otomatis, status pengajuan (simulasi) |
| Asuransi Toko | Rekomendasi perlindungan usaha (simulasi) |
| Privasi | Izin sebelum data dikirim ke AI, log aktivitas, dan hapus semua data |

Lembaga pembiayaan dan asuransi adalah contoh. Belum ada sambungan ke lembaga sungguhan dan tidak ada uang yang berpindah.

## Menjalankan di komputer

Butuh Node.js 20 atau lebih baru.

```sh
npm i
cp .env.example .env
npm run dev
```

Tanpa mengisi `.env`, aplikasi berjalan dalam **mode perangkat**: data tersimpan di browser dan AI berjalan dalam mode demo. Dua bagian berikut mengaktifkan akun dan AI sungguhan.

## Supabase: akun dan penyimpanan data

Supabase adalah layanan database (PostgreSQL) yang sekaligus menyediakan login. FinTar memakainya untuk tiga hal: mendaftarkan dan memasukkan pengguna, menyimpan data tiap usaha di server, dan menjaga agar tiap pengguna hanya bisa membaca datanya sendiri.

Penjagaan itu dilakukan di database lewat Row Level Security (RLS), bukan di aplikasi. Karena itu kunci `anon` boleh berada di browser: tanpa login, kunci itu tidak bisa membaca apa pun.

Langkah penyiapan (sekali saja):

1. Buat proyek di [supabase.com](https://supabase.com/dashboard). Paket gratis cukup.
2. Buka **SQL Editor > New query**, tempel seluruh isi [supabase/migrations/20261009000000_fintar.sql](supabase/migrations/20261009000000_fintar.sql), lalu klik **Run**. Ini membuat 7 tabel beserta aturan keamanannya.
3. Buka **Project Settings > API**. Salin **Project URL** ke `VITE_SUPABASE_URL` dan kunci **anon public** ke `VITE_SUPABASE_ANON_KEY` di `.env`. Jangan pakai kunci `service_role`.
4. Untuk demo, buka **Authentication > Sign In / Providers > Email** dan matikan **Confirm email** supaya pendaftar langsung masuk. Jika dibiarkan aktif, pendaftar harus membuka tautan di email dulu.
5. Jalankan ulang `npm run dev`. Layar pertama sekarang adalah halaman masuk.

Di hosting (Lovable atau lainnya), isi variabel yang sama di pengaturan environment, lalu build ulang.

| Tabel | Isi |
|---|---|
| `businesses` | Profil usaha dan saldo awal, satu baris per akun |
| `transactions` | Pemasukan dan pengeluaran |
| `debts`, `scheduled_expenses` | Kewajiban mendatang untuk proyeksi kas |
| `proposals` | Proposal modal (simulasi) |
| `consents` | Riwayat izin AI; hanya bisa ditambah |
| `agent_actions` | Log aktivitas; hanya bisa ditambah |

Catatan:

- "Hapus semua data saya" menghapus seluruh baris milik akun lewat fungsi `delete_my_data()`. Akun login-nya sendiri tetap ada; menghapusnya dilakukan dari dashboard Supabase.
- Log aktivitas tidak bisa diubah atau dihapus oleh pengguna, tetapi barisnya ditulis oleh aplikasi di browser, jadi ia bukti jejak, bukan bukti yang tahan pemalsuan.
- Dalam mode akun, endpoint AI menolak permintaan tanpa login dan tanpa izin AI.

## AI: Claude atau Gemini

Finix dan pemindai struk memanggil AI dari server ([src/lib/ai.server.ts](src/lib/ai.server.ts)), jadi kunci API tidak pernah sampai ke browser.

| Variabel | Keterangan |
|---|---|
| `ANTHROPIC_API_KEY` | Kunci Claude dari [platform.claude.com](https://platform.claude.com). Model bawaan `claude-opus-5-5`, bisa diganti dengan `ANTHROPIC_MODEL`. |
| `GEMINI_API_KEY` | Kunci Gemini dari [aistudio.google.com](https://aistudio.google.com). Model bawaan `gemini-flash-latest`, bisa diganti dengan `GEMINI_MODEL`. |
| `AI_PROVIDER` | `claude` atau `gemini`. Hanya perlu jika kedua kunci diisi; tanpa ini Claude yang dipakai. |

Tanpa kunci, aplikasi berjalan dalam mode demo: Finix menjawab dengan rumus dari catatan transaksi dan pemindai struk menampilkan contoh hasil bacaan. Keduanya diberi label "mode demo" di layar.

Paket gratis Gemini dapat memakai data yang dikirim untuk pengembangan layanannya. Pakai data contoh saat demo dengan kunci gratis.

## Pemeriksaan

```sh
npm test         # logika keuangan, alur layar, dan sinkron akun (dengan Supabase tiruan)
npx tsc --noEmit
npm run build
```

## Lovable

Proyek ini terhubung ke [Lovable](https://lovable.dev/projects/5ff2a793-85b8-4659-879c-9d4121c3c75e). Commit ke `main` ikut tersinkron ke sana, jadi jangan menulis ulang riwayat git yang sudah di-push.
