import { requireOptionalNativeModule } from 'expo'

/* Native hissa sirf naye APK me hota hai. Purani app me ye null rehta hai —
   tab website ko "app update karein" ka sandesh jata hai, crash nahi. */
const KsPrinter = requireOptionalNativeModule('KsPrinter')

export const lanAvailable = !!KsPrinter

/* bytes (base64) → printer ka IP:port. Jawab tabhi aata hai jab poora
   data printer tak chala gaya ho, warna error (IP galat / printer band). */
export function sendToPrinter(host, port, base64, timeoutMs = 6000) {
  if (!KsPrinter) return Promise.reject(new Error('APP_OLD'))
  return KsPrinter.send(String(host), Number(port) || 9100, base64, timeoutMs)
}
