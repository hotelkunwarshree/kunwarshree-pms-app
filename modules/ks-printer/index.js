import { PermissionsAndroid, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

/* Native hissa sirf naye APK me hota hai. Purani app me ye null rehta hai —
   tab website ko "app update karein" ka sandesh jata hai, crash nahi. */
const KsPrinter = requireOptionalNativeModule('KsPrinter')

export const lanAvailable = !!KsPrinter?.send
export const btAvailable = !!KsPrinter?.sendBt && !!KsPrinter?.btList

/* 📡 bytes (base64) → printer ka IP:port. Jawab tabhi aata hai jab poora
   data printer tak chala gaya ho, warna error (IP galat / printer band). */
export function sendToPrinter(host, port, base64, timeoutMs = 6000) {
  if (!lanAvailable) return Promise.reject(new Error('APP_OLD'))
  return KsPrinter.send(String(host), Number(port) || 9100, base64, timeoutMs)
}

/* Android 12+ par Bluetooth ke liye "Nearby devices" permission */
export async function btPermission() {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true
  const P = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
  if (await PermissionsAndroid.check(P)) return true
  return (await PermissionsAndroid.request(P)) === PermissionsAndroid.RESULTS.GRANTED
}

const noPerm = () => Object.assign(new Error('Bluetooth (Nearby devices) permission nahi mili'), { code: 'ERR_BT_PERMISSION' })

/* 🔵 phone se paired devices [{ name, address }] */
export async function btList() {
  if (!btAvailable) throw Object.assign(new Error('APP_OLD'), { code: 'APP_OLD' })
  if (!(await btPermission())) throw noPerm()
  return KsPrinter.btList()
}

/* 🔵 bytes → Bluetooth printer */
export async function sendToBtPrinter(address, base64, timeoutMs = 8000) {
  if (!btAvailable) throw Object.assign(new Error('APP_OLD'), { code: 'APP_OLD' })
  if (!(await btPermission())) throw noPerm()
  return KsPrinter.sendBt(String(address), base64, timeoutMs)
}
