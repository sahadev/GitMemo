package dev.gitmemo.desktop

import android.os.Bundle
import android.provider.Settings
import android.view.View
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
    applySystemBarPadding()
  }

  private fun applySystemBarPadding() {
    val container = findViewById<View>(android.R.id.content) ?: return
    val basePadding = ViewPadding.from(container)

    ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
      val safeInsets = resolveSafeContainerInsets(insets)
      view.setPadding(
        basePadding.left + safeInsets.left,
        basePadding.top + safeInsets.top,
        basePadding.right + safeInsets.right,
        basePadding.bottom + safeInsets.bottom
      )

      insets
    }

    ViewCompat.requestApplyInsets(container)
    container.post { ViewCompat.requestApplyInsets(container) }
  }

  private fun resolveSafeContainerInsets(insets: WindowInsetsCompat): ViewPadding {
    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
    val displayCutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
    val rawInsets = ViewPadding(
      left = maxOf(systemBars.left, displayCutout.left),
      top = maxOf(systemBars.top, displayCutout.top),
      right = maxOf(systemBars.right, displayCutout.right),
      bottom = maxOf(systemBars.bottom, displayCutout.bottom)
    )

    return ViewPadding(
      left = rawInsets.left,
      top = resolveTopSafeInset(rawInsets, insets),
      right = rawInsets.right,
      bottom = resolveBottomSafeInset(rawInsets, insets)
    )
  }

  private fun resolveTopSafeInset(rawInsets: ViewPadding, insets: WindowInsetsCompat): Int {
    if (rawInsets.top > 0) return rawInsets.top
    if (!insets.isVisible(WindowInsetsCompat.Type.statusBars())) return 0
    return getAndroidSystemDimension("status_bar_height")
  }

  private fun resolveBottomSafeInset(rawInsets: ViewPadding, insets: WindowInsetsCompat): Int {
    if (rawInsets.bottom > 0) return rawInsets.bottom
    if (!insets.isVisible(WindowInsetsCompat.Type.navigationBars())) return 0
    if (isGestureNavigationMode()) return 0
    return getAndroidSystemDimension("navigation_bar_height")
  }

  private fun isGestureNavigationMode(): Boolean {
    return try {
      Settings.Secure.getInt(contentResolver, "navigation_mode") == 2
    } catch (_: Exception) {
      false
    }
  }

  private fun getAndroidSystemDimension(name: String): Int {
    val resourceId = resources.getIdentifier(name, "dimen", "android")
    if (resourceId <= 0) return 0
    return resources.getDimensionPixelSize(resourceId)
  }

  private data class ViewPadding(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
  ) {
    companion object {
      fun from(view: View) = ViewPadding(
        left = view.paddingLeft,
        top = view.paddingTop,
        right = view.paddingRight,
        bottom = view.paddingBottom
      )
    }
  }
}
