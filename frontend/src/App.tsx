// src/App.tsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import ScoreOrder from "@/pages/ScoreOrder";
import BatchUpload from "@/pages/BatchUpload";
import ReviewQueue from "@/pages/ReviewQueue";
import AbuseGraph from "@/pages/AbuseGraph";
import FraudSpikes from "@/pages/FraudSpikes";
import Evidence from "@/pages/Evidence";
import NotFound from "@/pages/NotFound";
import SecureAccessTransition from "@/components/ui/secure-access-transition";

/**
 * The console-entry transition overlay lives HERE — a sibling of
 * <Routes>, not nested inside Landing's own component tree. That
 * matters: when the overlay eventually calls navigate("/app"), React
 * Router unmounts whatever's inside the OLD route's element (Landing
 * and everything inside it) and mounts the new route's element
 * (AppShell/Dashboard) in its place. If the overlay were a child of
 * Landing, it would get unmounted in that same instant — it can't
 * "survive" a route change while living inside the route being
 * replaced. Living at this level means it persists across the swap.
 */
function AppContent() {
  const [showTransition, setShowTransition] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing onEnterConsole={() => setShowTransition(true)} />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="score" element={<ScoreOrder />} />
          <Route path="batch" element={<BatchUpload />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="graph" element={<AbuseGraph />} />
          <Route path="spikes" element={<FraudSpikes />} />
          <Route path="evidence" element={<Evidence />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>

      {showTransition && (
        <SecureAccessTransition
          onReveal={() => navigate("/app")}
          onComplete={() => setShowTransition(false)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
