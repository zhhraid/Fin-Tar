import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";
import { exportTransactionsCsv } from "@/lib/export";

vi.mock("@/lib/env", () => ({ cloudEnabled: false, supabaseUrl: "", supabaseAnonKey: "" }));
vi.mock("@/components/FinixChat", () => ({ FinixChat: () => null }));
// The files themselves are covered elsewhere; here only whether they are allowed out matters.
vi.mock("@/lib/export", () => ({ exportTransactionsCsv: vi.fn(), exportReportPdf: vi.fn(), exportActivityJson: vi.fn(), exportProposalPdf: vi.fn() }));

const App = Route.options.component!;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const dialog = () => screen.getByRole("dialog", { name: /PIN/ });
const typePin = (pin: string) => {
  for (const d of pin) fireEvent.click(within(dialog()).getByRole("button", { name: d }));
};

describe("PIN sebelum data keuangan keluar dari aplikasi", () => {
  it("meminta PIN dibuat dulu, menolak PIN lemah, lalu mengunci setelah 5 kali salah", async () => {
    render(<App />);
    press("Laporan");

    // First export: create a PIN.
    press(/Excel\/CSV/);
    expect(within(dialog()).getByText("Buat PIN 6 angka")).toBeInTheDocument();
    typePin("123456");
    expect(await within(dialog()).findByText("Jangan pakai angka berurutan seperti 123456.")).toBeInTheDocument();
    typePin("482915");
    expect(await within(dialog()).findByText("Ulangi PIN")).toBeInTheDocument();
    typePin("482915");
    await waitFor(() => expect(exportTransactionsCsv).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: /PIN/ })).not.toBeInTheDocument();

    // Closing the sheet cancels the export.
    press(/Excel\/CSV/);
    expect(within(dialog()).getByText("Masukkan PIN")).toBeInTheDocument();
    press("Tutup");
    expect(exportTransactionsCsv).toHaveBeenCalledTimes(1);

    // Wrong PIN five times locks it.
    press(/Excel\/CSV/);
    for (let left = 4; left >= 1; left--) {
      typePin("000000");
      expect(await within(dialog()).findByText(`PIN salah. Sisa ${left} kesempatan.`)).toBeInTheDocument();
    }
    typePin("000000");
    expect(await within(dialog()).findByText(/Terlalu banyak salah/)).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "5" })).toBeDisabled();
    expect(exportTransactionsCsv).toHaveBeenCalledTimes(1);

    // Both the export and the lockout are in the activity log.
    press("Tutup");
    press("Profil");
    fireEvent.click(screen.getByText("Log aktivitas & hapus data"));
    expect(screen.getByText(/transaksi .* diunduh \(CSV\)/)).toBeInTheDocument();
    expect(screen.getByText(/PIN salah 5 kali/)).toBeInTheDocument();
    // PBKDF2 is slow on purpose; eight checks need more than the default 5 s under a parallel run.
  }, 30_000);
});
