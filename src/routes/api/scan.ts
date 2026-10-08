import { createFileRoute } from "@tanstack/react-router";
import { handleScan } from "@/lib/scan.server";

export const Route = createFileRoute("/api/scan")({
  server: { handlers: { POST: ({ request }) => handleScan(request) } },
});
