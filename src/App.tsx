/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { LanguageProvider } from './i18n/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ProjectBoard from './components/ProjectBoard';
import ProjectDashboard from './components/ProjectDashboard';
import Quadro from './components/Quadro';
import CalendarTool from './components/Calendar';
import Inventory from './components/Inventory';
import Assets from './components/Assets';
import RACIMatrix from './components/RACIMatrix';
import GanttChart from './components/GanttChart';
import ProjectFinance from './components/ProjectFinance';
import ProjectMembers from './components/ProjectMembers';
import ProjectTags from './components/ProjectTags';
import PublicAudit from './components/PublicAudit';
import Stakeholders from './components/Stakeholders';
import RiskManagement from './components/RiskManagement';
import KpiManagement from './components/KpiManagement';
import StatusReports from './components/StatusReports';
import ChangeHistory from './components/ChangeHistory';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/" />;
}

export default function App() {
  return (
    <LanguageProvider>
    <AuthProvider>
      <SidebarProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />
            {/* Public Route - NO authentication required */}
            <Route path="/audit/:token" element={<PublicAudit />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route 
              path="/project/:projectId" 
              element={
                <PrivateRoute>
                  <ProjectDashboard />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/kanban" 
              element={
                <PrivateRoute>
                  <ProjectBoard />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/quadro" 
              element={
                <PrivateRoute>
                  <Quadro />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/calendar" 
              element={
                <PrivateRoute>
                  <CalendarTool />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/inventory" 
              element={
                <PrivateRoute>
                  <Inventory />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/assets" 
              element={
                <PrivateRoute>
                  <Assets />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/raci" 
              element={
                <PrivateRoute>
                  <RACIMatrix />
                </PrivateRoute>
              } 
            />
            <Route 
              path="/project/:projectId/gantt" 
              element={
                <PrivateRoute>
                  <GanttChart />
                </PrivateRoute>
              } 
            />
            <Route
              path="/project/:projectId/finance"
              element={
                <PrivateRoute>
                  <ProjectFinance />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/membros"
              element={
                <PrivateRoute>
                  <ProjectMembers />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/stakeholders"
              element={
                <PrivateRoute>
                  <Stakeholders />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/risks"
              element={
                <PrivateRoute>
                  <RiskManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/kpis"
              element={
                <PrivateRoute>
                  <KpiManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/status-reports"
              element={
                <PrivateRoute>
                  <StatusReports />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/gestao-de-mudancas"
              element={
                <PrivateRoute>
                  <ChangeHistory />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/tags"
              element={
                <PrivateRoute>
                  <ProjectTags />
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </SidebarProvider>
    </AuthProvider>
    </LanguageProvider>
  );
}
