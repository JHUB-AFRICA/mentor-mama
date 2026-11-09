import { StrictMode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import "./styles/index.css";
// These shared workspace surfaces are also used by Student, Mentor, and
// Coordinator routes; keep their library and settings styling available
// independently of the Programme Admin route.
import "./features/programme-admin/programme-admin.css";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { PortalErrorBoundary } from "./components/PortalErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <PortalErrorBoundary>
            <App />
          </PortalErrorBoundary>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
