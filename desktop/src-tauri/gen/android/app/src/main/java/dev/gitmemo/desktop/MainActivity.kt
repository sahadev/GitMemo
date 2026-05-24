package dev.gitmemo.desktop

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var gitmemoWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = gitmemoWebView
        if (webView == null) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
          return
        }

        webView.evaluateJavascript(
          """
            (() => {
              try {
                if (typeof window.__gitmemoMobileBack === 'function') {
                  return Boolean(window.__gitmemoMobileBack());
                }
              } catch (_) {}
              return false;
            })();
          """.trimIndent()
        ) { handled ->
          if (handled != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    gitmemoWebView = webView
  }
}
