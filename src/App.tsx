import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/context/SessionContext";
import { StudioLayout } from "@/components/StudioLayout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { armSenseiBootTone } from "@/lib/sensei-tone";
import Dashboard from "./pages/Dashboard";
import ChatPage from "./pages/ChatPage";
import QuickFixPage from "./pages/QuickFixPage";
import ProblemsPage from "./pages/ProblemsPage";
import GenrePage from "./pages/GenrePage";
import ProductionCoachPage from "./pages/ProductionCoachPage";
import MixingCoachPage from "./pages/MixingCoachPage";
import MasteringCoachPage from "./pages/MasteringCoachPage";
import ChainBuilderPage from "./pages/ChainBuilderPage";
import KeyDetectionPage from "./pages/KeyDetectionPage";
import ChecklistPage from "./pages/ChecklistPage";
import UploadPage from "./pages/UploadPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    armSenseiBootTone();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" richColors position="top-right" />
        <SessionProvider>
          <BrowserRouter>
            <ScrollToTop />
            <StudioLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/quick" element={<QuickFixPage />} />
                <Route path="/problems" element={<ProblemsPage />} />
                <Route path="/genre" element={<GenrePage />} />
                <Route path="/production" element={<ProductionCoachPage />} />
                <Route path="/mixing" element={<MixingCoachPage />} />
                <Route path="/mastering" element={<MasteringCoachPage />} />
                <Route path="/chains" element={<ChainBuilderPage />} />
                <Route path="/key" element={<KeyDetectionPage />} />
                <Route path="/checklist" element={<ChecklistPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </StudioLayout>
          </BrowserRouter>
        </SessionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
