import { createFileRoute } from "@tanstack/react-router";
import { agentMode, handleAgent } from "@/lib/agent.server";

export const Route = createFileRoute("/api/agent")({
  server: { handlers: { GET: () => agentMode(), POST: ({ request }) => handleAgent(request) } },
});
