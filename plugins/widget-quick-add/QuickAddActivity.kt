package __PACKAGE__.widget

// Generated from plugins/widget-quick-add/QuickAddActivity.kt by the widget-quick-add config plugin.
// Edit that file, not the copy under android/.

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * Quick-add popup for the home-screen widget's "+" button. It opens as a bottom
 * sheet over the home screen, in its own task, so the app never comes forward.
 *
 * It only collects what the user types. On "Add" it hands the result to the
 * widget's headless JS task (the same path as a widget tap, action QUICK_ADD),
 * which queues it, redraws the widget straight away and syncs to the server
 * (see src/widget/taskHandler.tsx). Then it closes.
 *
 * Opened by neri-widget://add?kind=task|habit&widget=<id>&today=&tomorrow=&date=today|none&accent=&accentDark=
 */
class QuickAddActivity : Activity() {
    private lateinit var input: EditText
    private lateinit var addButton: TextView
    private lateinit var subtitle: TextView
    private lateinit var scrim: View
    private lateinit var sheet: LinearLayout
    private val chips = mutableListOf<Pair<TextView, String>>()

    private var kind = "task"
    private var widgetId = 0
    private var today = ""
    private var tomorrow = ""
    private var date = "none" // task: today | tomorrow | none
    private var counted = false // habit: count habit (N times a day) instead of yes/no
    private var target = 2
    private var closing = false

    private var dark = false
    private var accent = Color.parseColor("#635bff")
    private val bg get() = if (dark) Color.parseColor("#17171d") else Color.WHITE
    private val fg get() = if (dark) Color.parseColor("#ededf2") else Color.parseColor("#121218")
    private val muted get() = if (dark) Color.parseColor("#9696a6") else Color.parseColor("#6a6a7a")
    private val subtle get() = if (dark) Color.parseColor("#6b6b7b") else Color.parseColor("#93939f")
    private val chip get() = if (dark) Color.parseColor("#23232b") else Color.parseColor("#f1f1f4")
    private val onAccent get() = if (luminance(accent) > 0.6) Color.parseColor("#121218") else Color.WHITE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        readIntent(intent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) window.setDecorFitsSystemWindows(false)
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE,
        )
        setContentView(buildContent())
        animateIn()
    }

    private fun readIntent(intent: Intent) {
        val uri: Uri? = intent.data
        kind = if (uri?.getQueryParameter("kind") == "habit") "habit" else "task"
        widgetId = uri?.getQueryParameter("widget")?.toIntOrNull() ?: 0
        today = uri?.getQueryParameter("today").orEmpty()
        tomorrow = uri?.getQueryParameter("tomorrow").orEmpty()
        date = if (uri?.getQueryParameter("date") == "today" && today.isNotEmpty()) "today" else "none"
        dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val hex = uri?.getQueryParameter(if (dark) "accentDark" else "accent")
        accent = try {
            if (hex != null) Color.parseColor(hex) else accent
        } catch (_: IllegalArgumentException) {
            accent
        }
    }

    /* ---------- Layout ---------- */

    private fun buildContent(): View {
        val root = FrameLayout(this)
        scrim = View(this).apply {
            setBackgroundColor(Color.argb(if (dark) 150 else 110, 0, 0, 0))
            alpha = 0f
            setOnClickListener { dismiss() }
        }
        root.addView(scrim, FrameLayout.LayoutParams(MATCH, MATCH))

        sheet = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            isClickable = true // taps on the sheet must not reach the scrim
            background = GradientDrawable().apply {
                setColor(bg)
                val r = dp(28).toFloat()
                cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            }
            setPadding(dp(20), dp(10), dp(20), dp(16))
        }
        root.addView(sheet, FrameLayout.LayoutParams(MATCH, WRAP, Gravity.BOTTOM))

        // Grab handle
        sheet.addView(
            View(this).apply { background = rounded(chip, 2) },
            LinearLayout.LayoutParams(dp(36), dp(4)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(14)
            },
        )

        sheet.addView(text(if (kind == "habit") "New habit" else "New task", 18f, fg, bold = true))
        subtitle = text("", 13f, muted).also {
            sheet.addView(it, LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(2) })
        }

        input = EditText(this).apply {
            hint = if (kind == "habit") "e.g. Drink water" else "What do you need to do?"
            setHintTextColor(subtle)
            setTextColor(fg)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            background = rounded(chip, 14)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_DONE
            filters = arrayOf(InputFilter.LengthFilter(if (kind == "habit") 100 else 300))
            highlightColor = Color.argb(70, Color.red(accent), Color.green(accent), Color.blue(accent))
            setOnEditorActionListener { _, action, _ ->
                if (action == EditorInfo.IME_ACTION_DONE) {
                    submit()
                    true
                } else false
            }
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) = refresh()
            })
        }
        sheet.addView(input, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(14) })

        val chipRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        sheet.addView(chipRow, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(12) })

        var stepper: View? = null
        if (kind == "habit") {
            chipRow.addView(chip("Yes / No", "yesno") { counted = false })
            chipRow.addView(chip("Count", "count") { counted = true })
            stepper = buildStepper().also {
                sheet.addView(it, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(10) })
            }
        } else {
            if (today.isNotEmpty()) chipRow.addView(chip("Today", "today") { date = "today" })
            if (tomorrow.isNotEmpty()) chipRow.addView(chip("Tomorrow", "tomorrow") { date = "tomorrow" })
            chipRow.addView(chip("No date", "none") { date = "none" })
        }
        this.stepper = stepper

        // Footer: full form in the app (optional) · Add
        val footer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        sheet.addView(footer, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(16) })
        footer.addView(
            text("More options", 14f, muted, bold = true).apply {
                setPadding(dp(4), dp(10), dp(12), dp(10))
                setOnClickListener { openFullForm() }
            },
        )
        footer.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        addButton = text(if (kind == "habit") "Add habit" else "Add task", 15f, onAccent, bold = true).apply {
            background = rounded(accent, 22)
            gravity = Gravity.CENTER
            setPadding(dp(22), dp(11), dp(22), dp(11))
            setOnClickListener { submit() }
        }
        footer.addView(addButton)

        applyInsets(root)
        refresh()
        input.requestFocus()
        return root
    }

    private var stepper: View? = null
    private lateinit var targetLabel: TextView

    private fun buildStepper(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        row.addView(text("Times a day", 14f, fg), LinearLayout.LayoutParams(0, WRAP, 1f))
        row.addView(roundButton("−") { setTarget(target - 1) })
        targetLabel = text("", 16f, fg, bold = true).apply { gravity = Gravity.CENTER }
        row.addView(targetLabel, LinearLayout.LayoutParams(dp(48), WRAP))
        row.addView(roundButton("+") { setTarget(target + 1) })
        return row
    }

    private fun setTarget(n: Int) {
        target = n.coerceIn(2, 99)
        refresh()
    }

    /** Re-style chips, stepper, subtitle and the Add button from the current state. */
    private fun refresh() {
        val selected = if (kind == "habit") (if (counted) "count" else "yesno") else date
        for ((view, value) in chips) {
            val on = value == selected
            view.setTextColor(if (on) accent else muted)
            view.background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setColor(if (on) Color.argb(if (dark) 60 else 28, Color.red(accent), Color.green(accent), Color.blue(accent)) else chip)
                setStroke(dp(1), if (on) accent else chip)
            }
        }
        stepper?.visibility = if (counted) View.VISIBLE else View.GONE
        if (::targetLabel.isInitialized) targetLabel.text = target.toString()

        subtitle.text = when {
            kind == "habit" && counted -> "Every day · $target times a day"
            kind == "habit" -> "Every day, starting today"
            date == "today" -> "Due today"
            date == "tomorrow" -> "Due tomorrow"
            else -> "Goes to your inbox"
        }

        val ready = input.text.toString().isNotBlank()
        addButton.alpha = if (ready) 1f else 0.4f
        addButton.isEnabled = ready
    }

    /* ---------- Actions ---------- */

    private fun submit() {
        val title = input.text.toString().trim()
        if (title.isEmpty() || closing) return
        input.performHapticFeedback(HapticFeedbackConstants.CONFIRM.takeIf { Build.VERSION.SDK_INT >= 30 } ?: HapticFeedbackConstants.VIRTUAL_KEY)

        val data = Bundle().apply {
            putString("kind", kind)
            putString("title", title)
            if (kind == "habit") {
                putString("target", if (counted) target.toString() else "1")
            } else {
                putString("date", if (date == "today") today else if (date == "tomorrow") tomorrow else "")
            }
        }
        // Same broadcast a widget tap sends; the provider starts the headless JS task with it.
        // No sizing extras, so the library's tap calibration leaves it alone.
        val broadcast = Intent("$packageName.WIDGET_CLICK").apply {
            setClass(this@QuickAddActivity, Neri::class.java)
            putExtra("widgetId", widgetId)
            putExtra("clickAction", "QUICK_ADD")
            putExtra("clickActionData", data)
        }
        sendBroadcast(broadcast)
        Toast.makeText(applicationContext, if (kind == "habit") "Habit added" else "Task added", Toast.LENGTH_SHORT).show()
        dismiss()
    }

    private fun openFullForm() {
        val uri = when {
            kind == "habit" -> "neri://habit/new"
            date == "today" -> "neri://task/new?date=$today"
            date == "tomorrow" -> "neri://task/new?date=$tomorrow"
            else -> "neri://task/new"
        }
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
        }
        hideKeyboard()
        finishAndRemoveTask()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }

    private fun dismiss() {
        if (closing) return
        closing = true
        hideKeyboard()
        scrim.animate().alpha(0f).setDuration(180).start()
        sheet.animate().translationY(sheet.height.toFloat() + dp(40)).setDuration(180).withEndAction {
            finishAndRemoveTask()
            @Suppress("DEPRECATION")
            overridePendingTransition(0, 0)
        }.start()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = dismiss()

    private fun animateIn() {
        sheet.translationY = dp(400).toFloat()
        sheet.post {
            sheet.translationY = sheet.height.toFloat()
            sheet.animate().translationY(0f).setDuration(220)
                .setInterpolator(android.view.animation.DecelerateInterpolator(2f)).start()
            scrim.animate().alpha(1f).setDuration(220).start()
            showKeyboard()
        }
    }

    /* ---------- Keyboard & insets ---------- */

    private fun showKeyboard() {
        input.requestFocus()
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun hideKeyboard() {
        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(input.windowToken, 0)
    }

    /** Keep the sheet above the keyboard and the navigation bar (edge-to-edge on Android 11+). */
    private fun applyInsets(root: View) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val base = dp(16)
        root.setOnApplyWindowInsetsListener { _, insets ->
            val ime = insets.getInsets(WindowInsets.Type.ime()).bottom
            val nav = insets.getInsets(WindowInsets.Type.systemBars()).bottom
            sheet.setPadding(sheet.paddingLeft, sheet.paddingTop, sheet.paddingRight, base + maxOf(ime, nav))
            insets
        }
    }

    /* ---------- View helpers ---------- */

    private fun chip(label: String, value: String, onPick: () -> Unit): TextView =
        text(label, 14f, muted, bold = true).apply {
            setPadding(dp(14), dp(7), dp(14), dp(7))
            layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).apply { marginEnd = dp(8) }
            setOnClickListener {
                onPick()
                refresh()
            }
            chips.add(this to value)
        }

    private fun roundButton(label: String, onTap: () -> Unit): TextView =
        text(label, 18f, fg, bold = true).apply {
            gravity = Gravity.CENTER
            background = rounded(chip, 18)
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36))
            setOnClickListener { onTap() }
        }

    private fun text(value: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color)
        if (bold) typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }

    private fun rounded(color: Int, radiusDp: Int) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun luminance(c: Int) = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255

    private companion object {
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    }
}
