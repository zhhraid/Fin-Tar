import { createFileRoute } from "@tanstack/react-router";
import { finixMode, handleFinixChat } from "@/lib/finix.server";

export const Route = createFileRoute("/api/chat")({
  server: { handlers: { GET: () => finixMode(), POST: ({ request }) => handleFinixChat(request) } },
});
