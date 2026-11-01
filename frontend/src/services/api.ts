/**
 * Cliente HTTP base de SESCO.
 *
 * Todas las llamadas usan el prefijo `/api`, que en desarrollo Vite redirige
 * al backend FastAPI (ver `vite.config.ts`), por lo que no hay problemas de
 * CORS. El token JWT se toma de `localStorage` y se envía automáticamente.
 */

const API_PREFIX = '/api'
const TOKEN_KEY = 'access_token'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>

export interface RequestOptions {
  query?: QueryParams
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
}

/** Respuesta de un listado paginado: elementos + total de la cabecera. */
export interface PeticionPaginada<T> {
  data: T
  total: number
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(mensajeDeError(status, detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function mensajeDeError(status: number, detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    const interno = (detail as { detail?: unknown }).detail
    if (typeof interno === 'string') return interno
    if (Array.isArray(interno)) {
      return interno
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : String(item),
        )
        .join('. ')
    }
  }
  return status === 0
    ? 'No se pudo conectar con el servidor'
    : `La API respondió con el código ${status}`
}

function construirUrl(path: string, query?: QueryParams): string {
  const ruta = path.startsWith('/') ? path : `/${path}`
  const url = `${API_PREFIX}${ruta}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== null) {
      params.append(clave, String(valor))
    }
  }
  const cadena = params.toString()
  return cadena ? `${url}?${cadena}` : url
}

async function leerCuerpo(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  const texto = await response.text()
  if (!texto) return undefined

  const tipo = response.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) {
    try {
      return JSON.parse(texto) as unknown
    } catch {
      return texto
    }
  }
  return texto
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // almacenamiento no disponible (modo privado, SSR, etc.)
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // almacenamiento no disponible
  }
}

export async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await ejecutar<T>(method, path, options)
  return data
}

/**
 * Igual que `request`, pero devuelve también el total de la cabecera
 * `X-Total-Count` que exponen los listados paginados del backend.
 */
export async function requestPaginado<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<PeticionPaginada<T>> {
  const { data, response } = await ejecutar<T>(method, path, options)
  const cabecera = response.headers.get('X-Total-Count')
  const total = cabecera === null ? Number.NaN : Number(cabecera)

  return {
    data,
    total: Number.isFinite(total)
      ? total
      : Array.isArray(data)
        ? data.length
        : 0,
  }
}

async function ejecutar<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions,
): Promise<{ data: T; response: Response }> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(construirUrl(path, options.query), {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError(0, 'No se pudo conectar con el servidor')
  }

  const payload = await leerCuerpo(response)
  if (!response.ok) {
    throw new ApiError(response.status, payload)
  }
  return { data: payload as T, response }
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),
  getPaginado: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    requestPaginado<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T = void>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),
}
