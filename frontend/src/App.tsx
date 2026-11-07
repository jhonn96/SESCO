import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useAuth } from '@/hooks/use-auth'
import { nombreRol, rutaPorRol } from '@/lib/roles'
import { Alertas } from '@/pages/Alertas'
import { Asistencia } from '@/pages/Asistencia'
import { Auditoria } from '@/pages/Auditoria'
import { Comunicados } from '@/pages/Comunicados'
import { Configuracion } from '@/pages/Configuracion'
import { Cursos } from '@/pages/Cursos'
import { Dashboard } from '@/pages/Dashboard'
import { DirectorDashboard } from '@/pages/DirectorDashboard'
import { EstudianteDashboard } from '@/pages/EstudianteDashboard'
import { Estudiantes } from '@/pages/Estudiantes'
import { Horarios } from '@/pages/Horarios'
import { Justificaciones } from '@/pages/Justificaciones'
import { Login } from '@/pages/Login'
import { ProfesorAlertas } from '@/pages/ProfesorAlertas'
import { ProfesorDashboard } from '@/pages/ProfesorDashboard'
import { ProfesorHorario } from '@/pages/ProfesorHorario'
import { ProfesorListaAsistencia } from '@/pages/ProfesorListaAsistencia'
import { ProfesorMisEstudiantes } from '@/pages/ProfesorMisEstudiantes'
import { Profesores } from '@/pages/Profesores'
import { Reportes } from '@/pages/Reportes'
import { TutorAsistencia } from '@/pages/TutorAsistencia'
import { TutorDashboard } from '@/pages/TutorDashboard'
import { TutorNotificaciones } from '@/pages/TutorNotificaciones'
import { TutorReportes } from '@/pages/TutorReportes'
import { Tutores } from '@/pages/Tutores'

/** Lleva al inicio del rol autenticado (o al login si no hay sesión). */
function RedireccionPorRol() {
  const { isAuthenticated, usuario } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const rol = nombreRol(usuario)
  return <Navigate to={rol ? rutaPorRol(rol) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute rol="director" />}>
        <Route path="/director" element={<DirectorDashboard />} />
        <Route path="/director/alertas" element={<Alertas />} />
        <Route path="/director/asistencia" element={<Asistencia />} />
        <Route path="/director/estudiantes" element={<Estudiantes />} />
        <Route path="/director/profesores" element={<Profesores />} />
        <Route path="/director/tutores" element={<Tutores />} />
        <Route path="/director/cursos" element={<Cursos />} />
        <Route path="/director/horarios" element={<Horarios />} />
        <Route path="/director/comunicados" element={<Comunicados />} />
        <Route
          path="/director/justificaciones"
          element={<Justificaciones />}
        />
        <Route path="/director/reportes" element={<Reportes />} />
        <Route path="/director/auditoria" element={<Auditoria />} />
        <Route path="/director/configuracion" element={<Configuracion />} />
      </Route>
      <Route element={<ProtectedRoute rol="profesor" />}>
        <Route path="/profesor" element={<ProfesorDashboard />} />
        <Route path="/profesor/alertas" element={<ProfesorAlertas />} />
        <Route
          path="/profesor/estudiantes"
          element={<ProfesorMisEstudiantes />}
        />
        <Route path="/profesor/horario" element={<ProfesorHorario />} />
        <Route
          path="/profesor/lista-asistencia"
          element={<ProfesorListaAsistencia />}
        />
      </Route>
      <Route element={<ProtectedRoute rol="estudiante" />}>
        <Route path="/estudiante" element={<EstudianteDashboard />} />
      </Route>
      <Route element={<ProtectedRoute rol="tutor" />}>
        <Route path="/tutor" element={<TutorDashboard />} />
        <Route path="/tutor/asistencia" element={<TutorAsistencia />} />
        <Route path="/tutor/notificaciones" element={<TutorNotificaciones />} />
        <Route path="/tutor/reportes" element={<TutorReportes />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>

      <Route path="/" element={<RedireccionPorRol />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
