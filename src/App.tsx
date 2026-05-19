import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

// Code-split heavy route pages so the initial bundle only carries the
// shell + Login. Each route loads on first navigation and is then cached.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const SleepPage = lazy(() => import("@/pages/SleepPage"));
const AcademicsPage = lazy(() => import("@/pages/AcademicsPage"));
const McatFoundationPage = lazy(() => import("@/pages/McatFoundationPage"));
const WorkoutPage = lazy(() => import("@/pages/WorkoutPage"));
const NutritionPage = lazy(() => import("@/pages/NutritionPage"));
const CareerPage = lazy(() => import("@/pages/CareerPage"));
const HealthPage = lazy(() => import("@/pages/HealthPage"));
const MoneyPage = lazy(() => import("@/pages/MoneyPage"));
const FaithPage = lazy(() => import("@/pages/FaithPage"));
const RelationshipsPage = lazy(() => import("@/pages/RelationshipsPage"));
const SubstancePage = lazy(() => import("@/pages/SubstancePage"));
const WeeklyReviewPage = lazy(() => import("@/pages/WeeklyReviewPage"));
const ArchivePage = lazy(() => import("@/pages/ArchivePage"));
const TaskCommandPage = lazy(() => import("@/pages/TaskCommandPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));

function RouteFallback() {
  return (
    <div className="p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<LayoutWrapper><Dashboard /></LayoutWrapper>} />
      <Route path="/sleep" element={<LayoutWrapper><SleepPage /></LayoutWrapper>} />
      <Route path="/academics" element={<LayoutWrapper><AcademicsPage /></LayoutWrapper>} />
      <Route path="/mcat" element={<LayoutWrapper><McatFoundationPage /></LayoutWrapper>} />
      <Route path="/workout" element={<LayoutWrapper><WorkoutPage /></LayoutWrapper>} />
      <Route path="/nutrition" element={<LayoutWrapper><NutritionPage /></LayoutWrapper>} />
      <Route path="/health" element={<LayoutWrapper><HealthPage /></LayoutWrapper>} />
      <Route path="/career" element={<LayoutWrapper><CareerPage /></LayoutWrapper>} />
      <Route path="/money" element={<LayoutWrapper><MoneyPage /></LayoutWrapper>} />
      <Route path="/faith" element={<LayoutWrapper><FaithPage /></LayoutWrapper>} />
      <Route path="/relationships" element={<LayoutWrapper><RelationshipsPage /></LayoutWrapper>} />
      <Route path="/substance" element={<LayoutWrapper><SubstancePage /></LayoutWrapper>} />
      <Route path="/tasks" element={<LayoutWrapper><TaskCommandPage /></LayoutWrapper>} />
      <Route path="/calendar" element={<LayoutWrapper><CalendarPage /></LayoutWrapper>} />
      <Route path="/weekly-review" element={<LayoutWrapper><WeeklyReviewPage /></LayoutWrapper>} />
      <Route path="/archive" element={<LayoutWrapper><ArchivePage /></LayoutWrapper>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
