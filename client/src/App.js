import "./App.css";
import Landing from "./pages/Landing/";
import Sidebar from "./modules/Sidebar";
import Dashboard from "./pages/Dashboard";
import { Route, Routes, Navigate, useLocation } from "react-router";
import Deck from "./pages/Deck";
import SignIn from "./pages/SignIn";
import LoadingScreen from "./common/components/LoadingScreen";
import DeckPracticeDue from "./pages/Deck/DeckPracticeDue";
import DeckQuiz from "./pages/Deck/DeckQuiz";
import DeckStudy from "./pages/Deck/DeckStudy";
import PracticeDue from "./pages/PracticeDue";
import LearnNew from "./pages/LearnNew";
import DeckLearnNew from "./pages/Deck/DeckLearnNew";
import SignUp from "./pages/SignUp";
import { useState } from "react";
import Navbar from "./modules/Navbar";
import { useAuth } from "./contexts/AuthContext";
import StudentsPage from "./pages/Teacher/StudentsPage";
import StudentDetailPage from "./pages/Teacher/StudentDetailPage";
import TeacherCardBrowser from "./pages/Teacher/TeacherCardBrowser";
import GroupsPage from "./pages/Teacher/GroupsPage";
import GroupDetailPage from "./pages/Teacher/GroupDetailPage";
import StudentDashboard from "./pages/Student/StudentDashboard";
import StudentDeckBrowse from "./pages/Student/StudentDeckBrowse";
import { StudentLearnNew, StudentPracticeDue, StudentStudyMixed, StudentStudyMode } from "./pages/Student/StudentStudy";
import { CrossDeckLearnNew, CrossDeckPracticeDue } from "./pages/Student/CrossDeckStudy";
import StudentLaunchPage from "./pages/Student/StudentLaunchPage";
import Settings from "./pages/Settings";
import SharedDeckPage from "./pages/SharedDeck";
import ProgressPage from "./pages/Progress";
import NotFoundPage from "./common/components/NotFoundPage";
export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, loading, isTeacher, isStudent } = useAuth();

  const location = useLocation();

  if (location.pathname === "/launch/student-app") {
    return (
      <Routes>
        <Route path="/launch/student-app" element={<StudentLaunchPage />} />
        <Route path="*" element={<Navigate to="/launch/student-app" replace />} />
      </Routes>
    );
  }
  if (loading) return <LoadingScreen fullscreen={true} />;

  return (
    <div>
      {isAuthenticated ? (
        <div className="layout">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <Navbar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="main">
            <Routes>
              <Route path="/launch/student-app" element={<StudentLaunchPage />} />
              <Route path="/shared/:token" element={<SharedDeckPage />} />

              {/* Shared routes */}
              <Route
                index
                path="/"
                element={isStudent ? <StudentDashboard /> : <Dashboard />}
              />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/settings" element={<Settings />} />

              {/* Deck routes — shared for teachers and students (own decks) */}
              <Route path="/deck/:id" element={<Deck />} />
              <Route path="/deck/:id/new" element={<DeckLearnNew />} />
              <Route path="/deck/:id/due" element={<DeckPracticeDue />} />
              <Route path="/deck/:id/quiz" element={<DeckQuiz />} />
              <Route path="/deck/:id/study" element={<DeckStudy />} />

              {/* Teacher-only routes */}
              {isTeacher && (
                <>
                  <Route path="/new" element={<LearnNew />} />
                  <Route path="/due" element={<PracticeDue />} />
                  <Route path="/students" element={<StudentsPage />} />
                  <Route path="/students/:studentId" element={<StudentDetailPage />} />
                  <Route path="/students/:studentId/cards/:assignmentId" element={<TeacherCardBrowser />} />
                  <Route path="/groups" element={<GroupsPage />} />
                  <Route path="/groups/:id" element={<GroupDetailPage />} />
                </>
              )}

              {/* Student routes */}
              {isStudent && (
                <>
                  <Route path="/study/:assignmentId/new" element={<StudentLearnNew />} />
                  <Route path="/study/:assignmentId/due" element={<StudentPracticeDue />} />
                  <Route path="/study/:assignmentId/mixed" element={<StudentStudyMixed />} />
                  <Route path="/study/:assignmentId/mode/:mode" element={<StudentStudyMode />} />
                  <Route path="/deck/:assignmentId/browse" element={<StudentDeckBrowse />} />
                  <Route path="/study/all/new" element={<CrossDeckLearnNew />} />
                  <Route path="/study/all/due" element={<CrossDeckPracticeDue />} />
                </>
              )}

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<Navigate to="/signin" replace />} />
          <Route path="/launch/student-app" element={<StudentLaunchPage />} />
          <Route path="/shared/:token" element={<SharedDeckPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
    </div>
  );
}
