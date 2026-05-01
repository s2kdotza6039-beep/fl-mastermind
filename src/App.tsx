import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/context/SessionContext";
import { AuthProvider } from "@/context/AuthContext";
import { StudioLayout } from "@/components/StudioLayout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminPage from "./pages/AdminPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import UpgradePage from "./pages/UpgradePage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

// Pages rendered outside the studio layout (full-screen)
const BARE_ROUTES = ["/auth", "/reset-password"];

function AppShell() {
  const loc = useLocation();
  const bare = BARE_ROUTES.includes(loc.pathname);

  const routes = (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Authed */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/quick" element={<ProtectedRoute><QuickFixPage /></ProtectedRoute>} />
      <Route path="/problems" element={<ProtectedRoute><ProblemsPage /></ProtectedRoute>} />
      <Route path="/genre" element={<ProtectedRoute><GenrePage /></ProtectedRoute>} />
      <Route path="/production" element={<ProtectedRoute><ProductionCoachPage /></ProtectedRoute>} />
      <Route path="/mixing" element={<ProtectedRoute><MixingCoachPage /></ProtectedRoute>} />
      <Route path="/mastering" element={<ProtectedRoute><MasteringCoachPage /></ProtectedRoute>} />
      <Route path="/key" element={<ProtectedRoute><KeyDetectionPage /></ProtectedRoute>} />
      <Route path="/checklist" element={<ProtectedRoute><ChecklistPage /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
      <Route path="/upgrade" element={<ProtectedRoute><UpgradePage /></ProtectedRoute>} />

      {/* Paid only */}
      <Route path="/chains" element={<ProtectedRoute requirePaid><ChainBuilderPage /></ProtectedRoute>} />

      {/* Admin only */}
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  return bare ? routes : <StudioLayout>{routes}</StudioLayout>;
}

const App = () => {
  useEffect(() => {
    armSenseiBootTone();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" richColors position="top-right" />
        <BrowserRouter>
          <AuthProvider>
            <SessionProvider>
              <ScrollToTop />
              <AppShell />
            </SessionProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
