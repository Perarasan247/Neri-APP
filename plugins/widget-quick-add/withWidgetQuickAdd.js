/**
 * Config plugin: the widget's quick-add popup (Android).
 *
 * Adds QuickAddActivity, a small bottom sheet that opens over the home screen
 * when the widget's "+" is tapped (neri-widget://add?...). It runs in its own
 * task with a translucent theme, so creating a habit or task from the widget
 * never brings the app forward. See QuickAddActivity.kt for the flow.
 *
 * android/ is generated (`expo prebuild`), so everything native lives here.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withAndroidStyles, withDangerousMod } = require('expo/config-plugins');

const ACTIVITY = '.widget.QuickAddActivity';
const THEME = 'Theme.Neri.QuickAdd';
const SCHEME = 'neri-widget';

function withActivitySource(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error('widget-quick-add: expo.android.package is required');
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'), 'widget');
      const source = fs.readFileSync(path.join(__dirname, 'QuickAddActivity.kt'), 'utf8').replace('__PACKAGE__', pkg);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'QuickAddActivity.kt'), source);
      return cfg;
    },
  ]);
}

function withActivityManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const pkg = cfg.android?.package ?? 'app';
    app.activity = (app.activity ?? []).filter((a) => a.$['android:name'] !== ACTIVITY);
    app.activity.push({
      $: {
        'android:name': ACTIVITY,
        // Must be exported: Android 14+ only delivers implicit (deep link) intents to exported activities.
        // It only shows a form; nothing is created until the user presses Add.
        'android:exported': 'true',
        'android:theme': `@style/${THEME}`,
        // Own task, gone from Recents once closed: the app's task is never brought forward
        'android:taskAffinity': `${pkg}.quickadd`,
        'android:excludeFromRecents': 'true',
        'android:noHistory': 'true',
        'android:windowSoftInputMode': 'stateAlwaysVisible|adjustResize',
        'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|smallestScreenSize',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:scheme': SCHEME, 'android:host': 'add' } }],
        },
      ],
    });
    return cfg;
  });
}

function withActivityTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    const items = {
      'android:windowIsTranslucent': 'true',
      'android:windowBackground': '@android:color/transparent',
      'android:windowNoTitle': 'true',
      'android:backgroundDimEnabled': 'false', // the activity draws and animates its own scrim
      'android:windowAnimationStyle': '@null', // ...and slides its sheet in itself
      'android:statusBarColor': '@android:color/transparent',
      'android:navigationBarColor': '@android:color/transparent',
      'android:colorAccent': '#635bff',
      colorAccent: '#635bff',
    };
    const styles = cfg.modResults.resources.style ?? [];
    cfg.modResults.resources.style = [
      ...styles.filter((s) => s.$.name !== THEME),
      {
        $: { name: THEME, parent: 'Theme.AppCompat.DayNight.NoActionBar' },
        item: Object.entries(items).map(([name, value]) => ({ $: { name }, _: value })),
      },
    ];
    return cfg;
  });
}

module.exports = function withWidgetQuickAdd(config) {
  return withActivityTheme(withActivityManifest(withActivitySource(config)));
};
