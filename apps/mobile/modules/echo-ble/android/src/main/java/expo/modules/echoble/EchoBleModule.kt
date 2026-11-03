package expo.modules.echoble

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE
import android.bluetooth.le.AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * Slash proximity (Phase 3.5). Runners advertise a short server-issued id as service data; a hunter scans for a moment
 * and reports every id it heard with its strongest RSSI. The server decides who (if anyone) was slashed.
 *
 * All advertiser state lives on the main thread. The wanted id is remembered natively, so advertising comes back by
 * itself when Bluetooth is switched off and on again (JS timers don't run while the phone is locked).
 */
class EchoBleModule : Module() {
  private val service = ParcelUuid(UUID.fromString("6a4e5c00-ec40-4b1e-9d2a-5c4a5e000001"))
  private val main = Handler(Looper.getMainLooper())
  private var wantedId: String? = null // main thread only
  private var advertiser: AdvertiseCallback? = null // main thread only
  private val scanStarts = ArrayDeque<Long>() // main thread only; Android blocks a 6th scan start within 30 s
  private var ctx: Context? = null
  private var receiver: BroadcastReceiver? = null

  private val adapter: BluetoothAdapter? get() = (ctx?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private fun granted(vararg perms: String) = ctx?.let { c -> perms.all { c.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED } } ?: false
  private fun permsOk() = granted(Manifest.permission.ACCESS_FINE_LOCATION) && // scans without neverForLocation need location too
    (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || granted(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE))

  private fun hexToBytes(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  private fun bytesToHex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

  /** Main thread. Stops any current advertisement and starts the wanted one (if Bluetooth allows). */
  private fun applyAdvertising(promise: Promise?) {
    val a = adapter
    try { advertiser?.let { a?.bluetoothLeAdvertiser?.stopAdvertising(it) } } catch (_: Exception) {}
    advertiser = null
    val id = wantedId ?: return run { promise?.resolve(null) }
    val adv = a?.takeIf { it.isEnabled }?.bluetoothLeAdvertiser
      ?: return run { promise?.reject("E_OFF", "Bluetooth is off or this phone can't broadcast", null) }
    try {
      val settings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM) // nominal only: real RSSI varies by phone/pocket; SLASH.minRssi is the calibration knob
        .setConnectable(false).build()
      val data = AdvertiseData.Builder().setIncludeDeviceName(false).setIncludeTxPowerLevel(false)
        .addServiceData(service, hexToBytes(id)).build()
      val cb = object : AdvertiseCallback() {
        override fun onStartSuccess(s: AdvertiseSettings) { promise?.resolve(null) }
        override fun onStartFailure(code: Int) {
          if (advertiser === this) advertiser = null
          promise?.reject("E_ADV", "Broadcast failed ($code)", null)
          // transient (e.g. stack still restarting after Bluetooth came back): keep trying while a broadcast is wanted
          if (code != ADVERTISE_FAILED_DATA_TOO_LARGE && code != ADVERTISE_FAILED_FEATURE_UNSUPPORTED)
            main.postDelayed({ if (wantedId != null && advertiser == null) applyAdvertising(null) }, 3000)
        }
      }
      advertiser = cb
      adv.startAdvertising(settings, data, cb)
    } catch (e: Exception) { // SecurityException, or IllegalStateException if Bluetooth just went off
      advertiser = null
      promise?.reject("E_ADV", e.message ?: "Couldn't broadcast", e)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("EchoBle")

    OnCreate {
      val c = appContext.reactContext?.applicationContext ?: return@OnCreate
      ctx = c
      val r = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          when (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
            BluetoothAdapter.STATE_ON -> main.post { if (wantedId != null) applyAdvertising(null) }
            BluetoothAdapter.STATE_OFF -> main.post { advertiser = null } // the stack dropped it
          }
        }
      }
      val f = IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) c.registerReceiver(r, f, Context.RECEIVER_EXPORTED) else c.registerReceiver(r, f)
      receiver = r
    }

    OnDestroy {
      receiver?.let { r -> try { ctx?.unregisterReceiver(r) } catch (_: Exception) {} }
      receiver = null
      main.post { wantedId = null; applyAdvertising(null) }
    }

    /** 'unsupported' (no BLE) · 'location' (precise location missing) · 'unauthorized' · 'off' · 'on'. Scanning works when 'on'. */
    Function("state") {
      val a = adapter
      when {
        a == null -> "unsupported"
        !granted(Manifest.permission.ACCESS_FINE_LOCATION) -> "location"
        !permsOk() -> "unauthorized"
        !a.isEnabled -> "off"
        else -> "on"
      }
    }

    /** Some phones can scan but not broadcast: those runners can only be caught by code. */
    Function("canAdvertise") {
      val a = adapter ?: return@Function false
      a.isMultipleAdvertisementSupported
    }

    AsyncFunction("startAdvertising") { id: String, promise: Promise ->
      if (!Regex("^[0-9a-f]{8}$").matches(id)) return@AsyncFunction promise.reject("E_ID", "id must be 8 hex chars", null)
      if (!permsOk()) return@AsyncFunction promise.reject("E_PERM", "Bluetooth permission missing", null)
      main.post { wantedId = id; applyAdvertising(promise) }
    }

    /** Async like start: both go through the module queue in order, then the main handler, so a stop never overtakes a start. */
    AsyncFunction("stopAdvertising") {
      main.post { wantedId = null; applyAdvertising(null) }
      Unit
    }

    /** Scan for `ms` and return [{ id, rssi }] with each id's strongest reading. */
    AsyncFunction("scan") { ms: Int, promise: Promise ->
      if (!permsOk()) return@AsyncFunction promise.reject("E_PERM", "Bluetooth permission missing", null)
      main.post {
        val now = SystemClock.elapsedRealtime()
        while (scanStarts.isNotEmpty() && now - scanStarts.first() > 30_000) scanStarts.removeFirst()
        if (scanStarts.size >= 5) return@post promise.reject("E_BUSY", "Bluetooth needs a moment — try again in ${(30_000 - (now - scanStarts.first())) / 1000 + 1} s", null)
        val sc = adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
          ?: return@post promise.reject("E_OFF", "Bluetooth is off", null)
        val seen = HashMap<String, Int>()
        var done = false
        lateinit var cb: ScanCallback
        val finish = Runnable {
          if (done) return@Runnable
          done = true
          try { sc.stopScan(cb) } catch (_: Exception) {}
          promise.resolve(seen.map { (id, rssi) -> mapOf("id" to id, "rssi" to rssi) })
        }
        cb = object : ScanCallback() {
          override fun onScanResult(type: Int, r: ScanResult) {
            val d = r.scanRecord?.getServiceData(service) ?: return
            if (d.size != 4) return
            val id = bytesToHex(d)
            seen[id] = maxOf(seen[id] ?: Int.MIN_VALUE, r.rssi)
          }
          override fun onBatchScanResults(rs: MutableList<ScanResult>) = rs.forEach { onScanResult(0, it) }
          override fun onScanFailed(code: Int) {
            if (done) return
            done = true
            main.removeCallbacks(finish)
            promise.reject("E_SCAN", "Bluetooth scan failed ($code)", null)
          }
        }
        try {
          val filter = ScanFilter.Builder().setServiceData(service, ByteArray(0), ByteArray(0)).build()
          sc.startScan(listOf(filter), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
          scanStarts.addLast(now)
        } catch (e: Exception) { done = true; return@post promise.reject("E_SCAN", e.message ?: "Couldn't scan", e) }
        main.postDelayed(finish, ms.coerceIn(500, 5000).toLong())
      }
    }
  }
}
