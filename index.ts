/**
 * App entry. Expo Router's entry first, then the Android home-screen widget's
 * headless task handler, which runs even when the app is closed.
 */
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widget/taskHandler';

registerWidgetTaskHandler(widgetTaskHandler);
