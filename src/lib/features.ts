/**
 * Kontrol tampilan fitur "Funding Match" (Ajukan Modal) dan "Shop Insurance" (Asuransi Toko) di Beranda.
 * Set `false` untuk menyembunyikan dari UI pengguna (default saat ini).
 * Ubah menjadi `true` jika suatu saat ingin memunculkan kembali kedua menu tersebut.
 *
 * Disimpan di file sendiri, bukan di routes/index.tsx: build memecah komponen route ke file
 * terpisah, dan nilai hasil import tidak boleh diubah dari file lain (build Vercel gagal).
 */
export let SHOW_HOME_FINANCING_CARDS = false;

export function setHomeFinancingCardsVisible(visible: boolean) {
  SHOW_HOME_FINANCING_CARDS = visible;
}
