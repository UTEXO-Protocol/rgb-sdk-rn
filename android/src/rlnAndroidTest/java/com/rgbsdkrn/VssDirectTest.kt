package com.rgbsdkrn

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith
import org.utexo.rgblightningnode.SdkInitRequest
import org.utexo.rgblightningnode.SdkNode
import java.io.File
import kotlin.random.Random

private const val TAG = "VssDirectTest"

@RunWith(AndroidJUnit4::class)
class VssDirectTest {

    private fun tempDir(label: String): File {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        return File(ctx.cacheDir, "vss_test_${label}_${System.currentTimeMillis()}").also { it.mkdirs() }
    }

    private fun randomPort() = (20000 + Random.nextInt(20000)).toUShort()

    private fun tryCreate(label: String, vssUrl: String?): Boolean {
        val dir = tempDir(label)
        val port = randomPort()
        Log.i(TAG, "[$label] vssUrl=$vssUrl  storagePath=${dir.absolutePath}")
        return try {
            val req = SdkInitRequest(
                storageDirPath = dir.absolutePath,
                daemonListeningPort = port,
                ldkPeerListeningPort = (port + 1u).toUShort(),
                network = "regtest",
                maxMediaUploadSizeMb = 20u,
                enableVirtualChannelsV0 = false,
                virtualPeerPubkeys = null,
                lspBaseUrl = null,
                lspBearerToken = null,
                vssUrl = vssUrl,
                vssAllowHttp = true,
                vssAllowEmptyRestore = true
            )
            val node = SdkNode.create(req)
            Log.i(TAG, "[$label] SUCCESS  node=$node")
            try { node.shutdown() } catch (_: Throwable) {}
            try { node.close() } catch (_: Throwable) {}
            true
        } catch (e: Exception) {
            Log.e(TAG, "[$label] FAILED  ${e.javaClass.name}: ${e.message}")
            false
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun vssUrlNull_shouldSucceed() {
        val ok = tryCreate("null", vssUrl = null)
        Log.i(TAG, "=== vssUrl=null result: ${if (ok) "PASS" else "FAIL"} ===")
        // Assert last — so logs are always emitted even on failure.
        assert(ok) { "SdkNode.create with vssUrl=null must succeed" }
    }

    @Test
    fun vssUrlLoopbackHttp_shouldSucceed() {
        val args = InstrumentationRegistry.getArguments()
        val url = args.getString("vssUrl") ?: "http://127.0.0.1:8081/vss"
        val ok = tryCreate("http-loopback", vssUrl = url)
        Log.i(TAG, "=== vssUrl=$url result: ${if (ok) "PASS" else "FAIL"} ===")
        assert(ok) { "SdkNode.create with vssUrl=$url must succeed" }
    }

    @Test
    fun vssUrlHttps_shouldSucceed() {
        val args = InstrumentationRegistry.getArguments()
        val url = args.getString("vssUrlHttps") ?: "https://127.0.0.1:8081/vss"
        val ok = tryCreate("https", vssUrl = url)
        Log.i(TAG, "=== vssUrl=$url result: ${if (ok) "PASS" else "FAIL"} ===")
        assert(ok) { "SdkNode.create with vssUrl=$url must succeed" }
    }
}
