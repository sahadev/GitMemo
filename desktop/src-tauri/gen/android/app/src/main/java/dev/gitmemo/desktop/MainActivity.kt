package dev.gitmemo.desktop

import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

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
    applySystemBarMargins(webView)
  }

  private fun applySystemBarMargins(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val systemInsets = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val layoutParams = view.layoutParams

      if (layoutParams is ViewGroup.MarginLayoutParams) {
        layoutParams.setMargins(
          systemInsets.left,
          systemInsets.top,
          systemInsets.right,
          systemInsets.bottom
        )
        view.layoutParams = layoutParams
      }

      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }
}
