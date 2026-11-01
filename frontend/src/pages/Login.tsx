import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  User,
} from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { nombreRol, rutaPorRol } from '@/lib/roles'
import { ApiError } from '@/services/api'
import { login } from '@/services/auth'

export function Login() {
  const { iniciarSesion, isAuthenticated, usuario } = useAuth()
  const navigate = useNavigate()

  const [ci, setCi] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (sesion) => {
      iniciarSesion(sesion)
      toast.success(`Bienvenido, ${sesion.usuario.nombres}`, {
        description: 'Sesión iniciada correctamente.',
      })

      const rol = nombreRol(sesion.usuario)
      navigate(rol ? rutaPorRol(rol) : '/login', { replace: true })
    },
    onError: (err) => {
      const mensaje =
        err instanceof ApiError
          ? err.message
          : 'Ocurrió un error inesperado. Intente nuevamente.'

      setError(mensaje)
      toast.error('No se pudo iniciar sesión', { description: mensaje })
    },
  })

  // Si ya hay sesión, no tiene sentido volver al formulario.
  if (isAuthenticated) {
    const rol = nombreRol(usuario)
    if (rol) return <Navigate to={rutaPorRol(rol)} replace />
  }

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)
    toast.dismiss()

    const identificador = ci.trim()
    if (!identificador || !password) {
      const mensaje = 'Ingrese su CI y su contraseña.'
      setError(mensaje)
      toast.error(mensaje)
      return
    }

    mutation.mutate({ ci: identificador, password })
  }

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-32 size-80 rounded-full bg-success/5 blur-3xl"
      />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
            <GraduationCap className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">SESCO</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de asistencia escolar
          </p>
        </header>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>
              Acceda con su cédula de identidad y su contraseña.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={manejarEnvio} noValidate>
              <div className="space-y-2">
                <Label htmlFor="ci">CI</Label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="ci"
                    name="ci"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    autoFocus
                    required
                    maxLength={15}
                    placeholder="Ej. 11630815 PT"
                    className="pl-8"
                    value={ci}
                    onChange={(evento) => {
                      setCi(evento.target.value)
                      if (error) setError(null)
                    }}
                    disabled={mutation.isPending}
                    aria-invalid={error ? true : undefined}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    name="password"
                    type={mostrarPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    maxLength={72}
                    placeholder="••••••••"
                    className="px-8"
                    value={password}
                    onChange={(evento) => {
                      setPassword(evento.target.value)
                      if (error) setError(null)
                    }}
                    disabled={mutation.isPending}
                    aria-invalid={error ? true : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setMostrarPassword((visible) => !visible)}
                    aria-label={
                      mostrarPassword
                        ? 'Ocultar contraseña'
                        : 'Mostrar contraseña'
                    }
                    tabIndex={-1}
                  >
                    {mostrarPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>

              {error ? (
                <p
                  id="login-error"
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn aria-hidden="true" />
                )}
                {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          SESCO · Sistema de control de asistencia
        </p>
      </div>
    </main>
  )
}
