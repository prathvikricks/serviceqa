import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ActivityPage } from './features/dashboard/ActivityPage'
import { RequestsListPage } from './features/requests/RequestsListPage'
import { NewRequestChooser } from './features/requests/NewRequestChooser'
import { NewRequestPage } from './features/requests/NewRequestPage'
import { NewRepoRequestPage } from './features/requests/NewRepoRequestPage'
import { ChatPage } from './features/chat/ChatPage'
import { TicketsPage } from './features/tickets/TicketsPage'
import { TicketDetailPage } from './features/tickets/TicketDetailPage'
import { RequestDetailPage } from './features/requests/RequestDetailPage'
import { ApprovalsPage } from './features/approvals/ApprovalsPage'
import { SecretsPage } from './features/secrets/SecretsPage'
import { ProjectsPage } from './features/admin/ProjectsPage'
import { ProjectFormPage } from './features/admin/ProjectFormPage'
import { ProjectDetailPage } from './features/admin/ProjectDetailPage'
import { CostsPage } from './features/admin/CostsPage'
import { UsersPage } from './features/admin/UsersPage'
import { SettingsPage } from './features/admin/SettingsPage'
import { AuditLogPage } from './features/admin/AuditLogPage'
import { NotFound } from './components/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/activity" element={<ActivityPage />} />

                <Route path="/requests" element={<RequestsListPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/requests/new" element={<NewRequestChooser />} />
                <Route path="/requests/new/service" element={<NewRequestPage />} />
                <Route path="/requests/new/repo" element={<NewRepoRequestPage />} />
                <Route path="/requests/:id" element={<RequestDetailPage />} />

                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/tickets" element={<TicketsPage />} />
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
                <Route path="/secrets" element={<SecretsPage />} />

                <Route path="/admin/projects" element={<ProjectsPage />} />
                <Route path="/admin/projects/new" element={<ProjectFormPage />} />
                <Route path="/admin/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/admin/projects/:id/edit" element={<ProjectFormPage />} />
                <Route path="/admin/projects/:id/costs" element={<CostsPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/audit" element={<AuditLogPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />
                <Route path="/admin" element={<Navigate to="/admin/projects" replace />} />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
