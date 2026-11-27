package expo.modules.ksprinter

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket

/* 📡 Wi-Fi / LAN thermal printer — jaise Petpooja Captain karta hai:
   printer ke IP par port 9100 (RAW / JetDirect) se ESC/POS bytes seedhe
   bhej do. Na koi print dialog, na RawBT, na Bluetooth jodi. */
internal class PrinterUnreachable(host: String, port: Int, cause: Throwable) :
  CodedException("ERR_PRINTER", "Printer $host:$port se connect nahi hua — ${cause.message}", cause)

class KsPrinterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KsPrinter")

    AsyncFunction("send") Coroutine { host: String, port: Int, base64: String, timeoutMs: Int ->
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      withContext(Dispatchers.IO) {
        try {
          Socket().use { s ->
            s.connect(InetSocketAddress(host, port), timeoutMs)
            s.soTimeout = timeoutMs
            s.tcpNoDelay = true
            val out = s.getOutputStream()
            out.write(bytes)
            out.flush()
            /* printer buffer khaali kar le, phir connection band */
            s.shutdownOutput()
          }
        } catch (e: Exception) {
          throw PrinterUnreachable(host, port, e)
        }
      }
      return@Coroutine bytes.size
    }
  }
}
