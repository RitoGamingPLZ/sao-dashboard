// JSON calls to the dashboard's own server API, plus toasts for feedback.

export class ApiError extends Error {
  constructor(message: string, public result: Record<string, unknown>) { super(message) }
}

export async function callApi<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.error) throw new ApiError(result.error || result.message || `HTTP ${response.status}`, result)
  return result as T
}

export interface Toast { id: number, message: string, tone: 'info' | 'error' }
const toasts = ref<Toast[]>([])
let nextToastId = 0

export function useToasts() { return toasts }

export function showToast(message: string, tone: Toast['tone'] = 'info') {
  const id = ++nextToastId
  toasts.value.push({ id, message, tone })
  setTimeout(() => { toasts.value = toasts.value.filter((toast) => toast.id !== id) }, 4200)
}

// Run an API call; toast its error (and optional success message). Returns null on failure.
export async function runAndReport<T>(action: () => Promise<T>, successMessage?: string): Promise<T | null> {
  try {
    const result = await action()
    if (successMessage) showToast(successMessage)
    return result
  } catch (error) {
    showToast((error as Error).message, 'error')
    return null
  }
}
