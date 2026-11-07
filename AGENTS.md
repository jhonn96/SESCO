# Contexto del Proyecto SESCO

## Descripción
SESCO es una plataforma web para gestionar la asistencia escolar mediante códigos QR dinámicos.

## Stack Tecnológico
- Backend: Python 3.12, FastAPI, SQLAlchemy (PostgreSQL 16).
- Frontend: React (Vite + TypeScript), Tailwind CSS, Shadcn UI, TanStack Query/Table, Recharts, Sonner.
- Base de Datos: El esquema completo está en sesco_db.sql (20 tablas, 3FN).

## Reglas de Negocio Clave
1. QR Dinámico (TOTP): Se genera con pyotp (RFC 6238), ventana de 30 segundos.
2. Clasificación de Asistencia: Presente (0-10 min), Tardanza (11-30 min), Falta (>30 min o no asiste).
3. Roles: Director, Profesor, Estudiante, Padre/Tutor.
4. Seguridad: Autenticación JWT, contraseñas hasheadas, bitácora de auditoría.

## Instrucciones para la IA
- Usa el archivo sesco_db.sql como la única fuente de verdad para los modelos de SQLAlchemy.
- Mantén una arquitectura multicapa: Presentación -> Negocio -> Datos.
- Prioriza la seguridad y validación de roles en cada endpoint.
