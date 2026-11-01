# SESCO · Frontend

Interfaz web de SESCO (gestión de asistencia escolar con QR dinámico).
Construida con **Vite + React 19 + TypeScript**, **Tailwind CSS v4** y
**Shadcn UI**.

## Requisitos

- Node.js 22 o superior (el preset de Shadcn usa el paquete `cn`, que requiere Node 22+).
- Backend de SESCO escuchando en `http://127.0.0.1:8000`.

## Puesta en marcha

```powershell
npm install
npm run dev      # http://localhost:5173
```

El servidor de desarrollo redirige `/api/*` a `http://127.0.0.1:8000`
(configurado en `vite.config.ts`), por lo que no hay problemas de CORS y el
cliente puede usar rutas relativas (`/api/auth/login`, `/api/avisos`, ...).

## Scripts

| Script            | Descripción                                  |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo con HMR.              |
| `npm run build`   | Verificación de tipos + build de producción. |
| `npm run preview` | Sirve el build de producción.                |
| `npm run lint`    | Linter (oxlint).                             |

## Sesión y rutas

- `AuthProvider` (`src/contexts/AuthProvider.tsx`) guarda el JWT en
  `access_token` y el usuario en `sesco_usuario` (ambos en `localStorage`).
- `useAuth()` expone `usuario`, `isAuthenticated`, `iniciarSesion` y
  `cerrarSesion`.
- `ProtectedRoute` exige sesión y, opcionalmente, un rol concreto.
- Tras el login cada rol entra a su ruta: `/director`, `/profesor`,
  `/estudiante` o `/tutor`. El director ve `DirectorDashboard` conectado a la
  API; los demás roles ven `Dashboard`, un panel informativo temporal.
  `/` y `/dashboard` redirigen según el rol.
- El módulo del director añade `/director/alertas`, `/director/estudiantes`,
  `/director/comunicados` y `/director/justificaciones`, todas bajo
  `ProtectedRoute rol="director"`.

## Panel del director

`src/pages/DirectorDashboard.tsx` consume `GET /api/reportes/panel` con
TanStack Query y el cliente `src/services/api.ts` (que añade el JWT).

- La consulta es `['reportes', 'panel', fecha]`; al cambiar la fecha se
  refresca automáticamente y se conservan los datos anteriores mientras llega
  la respuesta (`keepPreviousData`).
- Los KPIs se calculan con `totales_hoy` y `total_estudiantes`: presentes,
  tardanzas y faltas muestran su porcentaje sobre los registros del día.
- El gráfico usa `serie_semana` (un punto por día, de lunes a la fecha
  consultada) y dibuja presentes, tardanzas y faltas como porcentajes.
- Mientras carga se muestran skeletons de Shadcn; si falla se notifica con
  Sonner, se muestra el detalle en pantalla y se ofrece reintentar.
- El filtro de fecha usa un `Input type="date"` limitado a hoy; el botón
  «Hoy» vuelve a la jornada actual.

## Módulos del director

Todas las tablas usan **paginación en el servidor**: envían `skip` y `limit`,
y leen el total de la cabecera `X-Total-Count` (expuesta por CORS en el
backend). El cliente la devuelve con `api.getPaginado`, que responde
`{ data, total }`. Los componentes compartidos `TablaPaginacion` (pie con
rango, páginas y elipsis) y `TablaEstado` (carga, error con reintento y vacío)
mantienen el mismo comportamiento en todas las vistas.

| Ruta | Vista | Endpoints |
| --- | --- | --- |
| `/director/alertas` | `pages/Alertas.tsx` | `GET /api/alertas`, `PATCH /api/alertas/{id}/atender` |
| `/director/estudiantes` | `pages/Estudiantes.tsx` | `GET /api/estudiantes`, `GET /api/cursos` |
| `/director/comunicados` | `pages/Comunicados.tsx` | `GET/POST /api/avisos` |
| `/director/justificaciones` | `pages/Justificaciones.tsx` | `GET /api/justificaciones`, `PATCH /api/justificaciones/{id}/resolver` |

- **Alertas**: filtros por tipo (faltas, tardanzas, inasistencia) y estado
  (pendientes, todas, atendidas); los iconos y badges distinguen faltas (rojo)
  de tardanzas (amarillo). «Marcar como atendida» invalida la consulta.
- **Estudiantes**: TanStack Table v9 (`useTable` + `rowPaginationFeature`) con
  búsqueda por nombre/CI con retardo de 350 ms, filtro por curso y badges de
  estado derivados de `usuario.activo` y `bloqueado_hasta`.
- **Comunicados**: formulario validado (título, contenido, tipo e
  «importante»). Las citaciones piden `fecha_cita` y se envía en ISO; la tabla
  muestra lecturas y confirmaciones sobre el total de destinatarios.
- **Justificaciones**: por defecto lista las pendientes; Aprobar resuelve
  directamente y Rechazar abre un diálogo que exige el comentario. Al resolver
  se invalidan también `alertas` y `reportes`, porque aprobar cambia la
  asistencia del día.
- Las alertas y justificaciones solo traen identificadores de estudiante; el
  hook `useDirectorioEstudiantes` descarga y cachea el directorio una vez.
  `useDirectorioTutores` hace lo mismo con los tutores de las justificaciones.

## Tema y paleta

- La paleta institucional vive en `src/index.css` como variables CSS
  (`--primary` azul `hsl(221.2 83.2% 53.3%)`, fondo `hsl(210 40% 98%)`,
  texto `hsl(222.2 84% 4.9%)`). El modo oscuro redefine las mismas variables
  bajo `.dark`.
- `ThemeProvider` (`src/contexts/ThemeProvider.tsx`) aplica la clase `dark` en
  `<html>`, respeta `prefers-color-scheme` y recuerda la elección en
  `sesco_tema`. El script de `index.html` evita el destello claro al recargar.
- `ThemeToggle` aparece en el login y en la barra superior del dashboard.
- Sonner usa verde para éxito, rojo para error y azul para información; sus
  variables se ajustan en `src/index.css` para ambos temas.
- Los gráficos de Recharts toman sus colores con `useChartTheme`, que resuelve
  `--chart-1..5`, grilla, ejes y tooltip desde el tema activo.

## Estructura

```
src/
├── components/     # Componentes reutilizables
│   ├── AppSidebar.tsx          # Menú lateral por rol, con rutas reales
│   ├── AppToaster.tsx
│   ├── AsistenciaSemanalChart.tsx
│   ├── DashboardShell.tsx      # Sidebar + header + contenido
│   ├── PageHeader.tsx          # Encabezado de las vistas administrativas
│   ├── ProtectedRoute.tsx
│   ├── TablaEstado.tsx         # Carga, error con reintento y estado vacío
│   ├── TablaPaginacion.tsx     # Pie de paginación compartido
│   ├── ThemeToggle.tsx
│   └── ui/         # Shadcn UI (table, badge, select, textarea, checkbox, dialog, ...)
├── contexts/       # AuthProvider y ThemeProvider
├── hooks/          # useAuth, useTheme, useChartTheme, useIsMobile,
│                   # useDirectorioEstudiantes y useDirectorioTutores
├── lib/            # Utilidades (cn, roles, fechas, cursos, personas, directorio, errores)
├── pages/          # Login, DirectorDashboard, Dashboard, Alertas,
│                   # Estudiantes, Comunicados y Justificaciones
├── services/       # Cliente HTTP y llamadas a la API
│   ├── api.ts      # fetch tipado + JWT + getPaginado (X-Total-Count)
│   ├── auth.ts     # POST /auth/login y GET /auth/me
│   ├── reportes.ts # GET /reportes/panel
│   ├── cursos.ts   # GET /cursos
│   ├── estudiantes.ts # GET /estudiantes y directorio cacheado
│   ├── alertas.ts  # GET /alertas y PATCH /alertas/{id}/atender
│   ├── avisos.ts   # GET/POST /avisos
│   ├── justificaciones.ts # GET /justificaciones y PATCH .../resolver
│   └── usuarios.ts # GET /usuarios y directorio de tutores
├── App.tsx         # Rutas y redirección por rol
├── index.css       # Tailwind, paleta institucional y modo oscuro
└── main.tsx        # Providers, Router y Toaster
```

## Stack

- **Tailwind CSS v4** con `@tailwindcss/vite` (configuración CSS-first).
- **Shadcn UI** (preset `radix-nova`, paleta institucional azul, variables CSS,
  iconos Lucide).
- **TanStack Query v5** para estado del servidor.
- **TanStack Table** para tablas.
- **Recharts** para gráficos (carga diferida desde el dashboard).
- **Sonner** para notificaciones (`<Toaster />` global, con tema claro/oscuro).
- **React Router** para el enrutamiento con guardias por rol.

## Alias de importación

`@/` apunta a `src/` tanto en TypeScript (`tsconfig.app.json`) como en Vite
(`vite.config.ts`):

```ts
import { Button } from '@/components/ui/button'
```
