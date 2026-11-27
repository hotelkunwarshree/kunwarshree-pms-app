package expo.modules.ksprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket
import java.util.Timer
import java.util.UUID
import kotlin.concurrent.schedule

/* 🖨 Thermal printer — bina print dialog, bina RawBT:
   • send(host, port, …)   → 📡 Wi-Fi / LAN printer (IP:9100)
   • sendBt(address, …)    → 🔵 Bluetooth printer (classic SPP, Petpooja Captain jaisa)
   • btList()              → phone se paired Bluetooth devices
   Har print par printer se pal bhar ke liye judte hain, chhaapte hain,
   phir chhod dete hain — isliye kai phone baari-baari ek hi printer
   par chhaap sakte hain. */
internal class PrinterError(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class KsPrinterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun adapter(): BluetoothAdapter {
    if (Build.VERSION.SDK_INT >= 31 &&
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
    ) {
      throw PrinterError("ERR_BT_PERMISSION", "Bluetooth (Nearby devices) permission nahi mili")
    }
    val ad = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
      ?: throw PrinterError("ERR_BT_NONE", "Is phone me Bluetooth nahi hai")
    if (!ad.isEnabled) throw PrinterError("ERR_BT_OFF", "Phone ka Bluetooth band hai")
    return ad
  }

  @SuppressLint("MissingPermission")
  private fun bonded(ad: BluetoothAdapter): List<Map<String, String>> =
    (ad.bondedDevices ?: emptySet()).map {
      mapOf("name" to (it.name ?: it.address), "address" to it.address)
    }

  @SuppressLint("MissingPermission")
  private fun stopDiscovery(ad: BluetoothAdapter) {
    try { ad.cancelDiscovery() } catch (_: Exception) {}
  }

  /* timeout ke saath connect — sasta printer kabhi-kabhi jawab hi nahi deta */
  @SuppressLint("MissingPermission")
  private fun connectWithTimeout(sock: BluetoothSocket, timeoutMs: Int) {
    var done = false
    val timer = Timer(true)
    timer.schedule(timeoutMs.toLong()) { if (!done) try { sock.close() } catch (_: Exception) {} }
    try {
      sock.connect()
      done = true
    } finally {
      timer.cancel()
    }
  }

  /* teen tareeke se try: secure → insecure → channel 1 (purane chhote printer) */
  @SuppressLint("MissingPermission")
  private fun openSocket(dev: BluetoothDevice, timeoutMs: Int): BluetoothSocket {
    val makers = listOf<() -> BluetoothSocket>(
      { dev.createRfcommSocketToServiceRecord(SPP) },
      { dev.createInsecureRfcommSocketToServiceRecord(SPP) },
      {
        dev.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(dev, 1) as BluetoothSocket
      },
    )
    var last: Exception? = null
    for (make in makers) {
      var s: BluetoothSocket? = null
      try {
        s = make()
        connectWithTimeout(s, timeoutMs)
        return s
      } catch (e: Exception) {
        last = e
        try { s?.close() } catch (_: Exception) {}
      }
    }
    throw PrinterError("ERR_BT_CONNECT", "Printer se Bluetooth connect nahi hua — ${last?.message ?: "no answer"}", last)
  }

  override fun definition() = ModuleDefinition {
    Name("KsPrinter")

    /* 📡 Wi-Fi / LAN */
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
          throw PrinterError("ERR_PRINTER", "Printer $host:$port se connect nahi hua — ${e.message}", e)
        }
      }
      return@Coroutine bytes.size
    }

    /* 🔵 paired Bluetooth devices: [{ name, address }] */
    AsyncFunction("btList") Coroutine { ->
      val ad = adapter()
      return@Coroutine withContext(Dispatchers.IO) { bonded(ad) }
    }

    /* 🔵 Bluetooth printer ko bytes */
    AsyncFunction("sendBt") Coroutine { address: String, base64: String, timeoutMs: Int ->
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      val mac = address.trim().uppercase()
      if (!BluetoothAdapter.checkBluetoothAddress(mac)) {
        throw PrinterError("ERR_BT_ADDRESS", "Printer ka Bluetooth address galat hai: $address")
      }
      val ad = adapter()
      withContext(Dispatchers.IO) {
        val dev = ad.getRemoteDevice(mac)
        stopDiscovery(ad)

        /* doosra phone usi waqt chhaap raha ho to printer busy hota hai —
           thoda ruk kar ek baar aur */
        val sock = try {
          openSocket(dev, timeoutMs)
        } catch (e: PrinterError) {
          delay(1500)
          openSocket(dev, timeoutMs)
        }
        try {
          val out = sock.outputStream
          out.write(bytes)
          out.flush()
          /* Bluetooth se data dheere jata hai — jaldi band kiya to parchi adhoori */
          delay(minOf(5000L, 700L + bytes.size / 6))
        } catch (e: Exception) {
          throw PrinterError("ERR_BT_WRITE", "Printer ko data nahi gaya — ${e.message}", e)
        } finally {
          try { sock.close() } catch (_: Exception) {}
        }
      }
      return@Coroutine bytes.size
    }
  }
}
