import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";

// Device mode (no Supabase configured). The chat screen talks to the server; these flows never open it.
vi.mock("@/components/FinixChat", () => ({ FinixChat: ({ prompt }: { prompt?: string | null }) => <p>Finix: {prompt}</p> }));

const App = Route.options.component!;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const now = new Date();
const today = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

describe("alur utama FinTar", () => {
  it("mencatat pemasukan, menebak kategori, lalu mengubah dan menghapusnya", () => {
    render(<App />);
    expect(screen.getByText("Saldo kas saat ini")).toBeInTheDocument();

    press(/Pengeluaran$/);
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Ongkir kurir pesanan" } });
    press("Simpan transaksi");

    expect(screen.getByText("-Rp45.000")).toBeInTheDocument();
    expect(screen.getByText(/^Pengiriman •/)).toBeInTheDocument();

    press("Ubah Ongkir kurir pesanan");
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "50000" } });
    press("Simpan perubahan");
    expect(screen.getByText("-Rp50.000")).toBeInTheDocument();

    press("Ubah Ongkir kurir pesanan");
    press("Hapus transaksi");
    expect(screen.queryByText("Ongkir kurir pesanan")).not.toBeInTheDocument();
  });

  it("mengimpor CSV dan melaporkan baris yang salah", () => {
    render(<App />);
    press("Laporan");
    press("Impor");
    fireEvent.change(screen.getByLabelText("Isi CSV"), { target: { value: ["tanggal;jenis;jumlah;kategori;keterangan", `${today};pemasukan;1.500.000;Penjualan;Borongan kue arisan`, `${today};pengeluaran;abc;Lainnya;salah`].join("\n") } });

    expect(screen.getByText(/1 transaksi siap diimpor, total Rp1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Baris 3:/)).toBeInTheDocument();
    press("Impor 1 transaksi");
    press("Tahun ini");

    expect(screen.getByText("Borongan kue arisan")).toBeInTheDocument();
  });

  it("meminta izin AI sebelum Finix, lalu meneruskan pertanyaan dari laporan", () => {
    render(<App />);
    press("Laporan");
    fireEvent.click(screen.getByText("Tanya Finix soal laporan ini"));

    expect(screen.getByText("Izinkan AI untuk menjawab pertanyaanmu?")).toBeInTheDocument();
    expect(screen.queryByText(/Finix: /)).not.toBeInTheDocument();
    press("Saya setuju");

    expect(screen.getByText(/Finix: Jelaskan laporan keuanganku/)).toBeInTheDocument();
  });

  it("menampilkan proyeksi kas dan menandai kewajiban lunas sebagai pengeluaran", () => {
    render(<App />);
    press("Peringatan kas");

    expect(screen.getByText("Proyeksi kas 30 hari")).toBeInTheDocument();
    expect(screen.getByText("Restok bahan pesanan besar")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Sudah dibayar" })[0]!);
    press("Kembali");

    expect(screen.getByText("Bayar Utang tepung ke pemasok")).toBeInTheDocument();
  });

  it("memberi alasan skor, mengirim proposal, dan mencatatnya di log aktivitas", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Ajukan Modal"));
    expect(screen.getAllByText("Alasan skor").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kemampuan bayar\./).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Buat proposal" })[0]!);

    const send = screen.getByRole("button", { name: "Kirim proposal" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(send);

    expect(screen.getByText("STATUS PENGAJUAN")).toBeInTheDocument();
    expect(within(screen.getAllByRole("list")[0]!).getByText("Proposal terkirim")).toBeInTheDocument();

    press("Profil");
    fireEvent.click(screen.getByText("Log aktivitas & hapus data"));
    expect(screen.getByText(/Proposal Rp5\.000\.000 dikirim ke/)).toBeInTheDocument();
    expect(screen.getByText(/Draf proposal Rp5\.000\.000 untuk/)).toBeInTheDocument();
  });

  it("memakai saldo awal dari profil untuk saldo kas", () => {
    render(<App />);
    press("Profil");
    fireEvent.change(screen.getByLabelText("Nama usaha"), { target: { value: "Toko Uji" } });
    fireEvent.change(screen.getByLabelText("Kas awal sebelum mencatat"), { target: { value: "100000000" } });
    press("Beranda");

    expect(screen.getByText(/Asisten keuangan • Toko Uji/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /^Rp10\d\.\d{3}\.\d{3}$/ })).toBeInTheDocument();
  });
});
