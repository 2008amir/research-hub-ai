import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/")({
  component: AuthScreen,
  head: () => ({
    meta: [
      { title: "Sign in or Create Account — Ecomedic Squad" },
      { name: "description", content: "Sign in to Ecomedic Squad or create your free researcher account." },
    ],
  }),
});