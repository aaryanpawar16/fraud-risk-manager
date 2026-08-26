// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
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
    </BrowserRouter>
  );
}
