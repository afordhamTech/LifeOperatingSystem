import { Routes, Route } from "react-router";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import SleepPage from "@/pages/SleepPage";
import AcademicsPage from "@/pages/AcademicsPage";
import McatFoundationPage from "@/pages/McatFoundationPage";
import WorkoutPage from "@/pages/WorkoutPage";
import NutritionPage from "@/pages/NutritionPage";
import CareerPage from "@/pages/CareerPage";
import HealthPage from "@/pages/HealthPage";
import MoneyPage from "@/pages/MoneyPage";
import FaithPage from "@/pages/FaithPage";
import RelationshipsPage from "@/pages/RelationshipsPage";
import SubstancePage from "@/pages/SubstancePage";
import WeeklyReviewPage from "@/pages/WeeklyReviewPage";
import ArchivePage from "@/pages/ArchivePage";
import TaskCommandPage from "@/pages/TaskCommandPage";
import CalendarPage from "@/pages/CalendarPage";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <LayoutWrapper>
            <Dashboard />
          </LayoutWrapper>
        }
      />
      <Route
        path="/sleep"
        element={
          <LayoutWrapper>
            <SleepPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/academics"
        element={
          <LayoutWrapper>
            <AcademicsPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/mcat"
        element={
          <LayoutWrapper>
            <McatFoundationPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/workout"
        element={
          <LayoutWrapper>
            <WorkoutPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/nutrition"
        element={
          <LayoutWrapper>
            <NutritionPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/health"
        element={
          <LayoutWrapper>
            <HealthPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/career"
        element={
          <LayoutWrapper>
            <CareerPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/money"
        element={
          <LayoutWrapper>
            <MoneyPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/faith"
        element={
          <LayoutWrapper>
            <FaithPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/relationships"
        element={
          <LayoutWrapper>
            <RelationshipsPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/substance"
        element={
          <LayoutWrapper>
            <SubstancePage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/tasks"
        element={
          <LayoutWrapper>
            <TaskCommandPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/calendar"
        element={
          <LayoutWrapper>
            <CalendarPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/weekly-review"
        element={
          <LayoutWrapper>
            <WeeklyReviewPage />
          </LayoutWrapper>
        }
      />
      <Route
        path="/archive"
        element={
          <LayoutWrapper>
            <ArchivePage />
          </LayoutWrapper>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
