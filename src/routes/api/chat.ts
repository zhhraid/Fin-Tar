import { createFileRoute } from "@tanstack/react-router";
import { handleFinixChat } from "@/lib/finix.server";

export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: ({ request }) => handleFinixChat(request) } },
});
