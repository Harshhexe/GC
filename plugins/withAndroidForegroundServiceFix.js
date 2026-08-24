const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Fix for Google Play Android 15 "Restricted foreground service types" warning:
 *
 * `expo-audio` unconditionally declares `AudioRecordingService` with
 * `android:foregroundServiceType="microphone"` in its library AndroidManifest.xml.
 * When combined with BOOT_COMPLETED receivers from notifications, Google Play
 * Console's Android 15 static analyzer flags:
 *
 *   "Apps targeting Android 15 or later cannot use BOOT_COMPLETED broadcast receivers
 *   to launch certain foreground service types... expo.modules.audio.service.AudioRecordingService"
 *
 * Since GC only records short voice notes in the foreground (using standard MediaRecorder)
 * and does not record audio in the background after device boot, removing
 * `AudioRecordingService` via `tools:node="remove"` eliminates the warning
 * while keeping in-app voice messaging 100% functional.
 */
module.exports = function withAndroidForegroundServiceFix(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!manifest.$) {
      manifest.$ = {};
    }
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (application) {
      if (!application.service) {
        application.service = [];
      }

      // Filter out any existing matching entry then add tools:node="remove"
      application.service = application.service.filter(
        (s) => s.$?.['android:name'] !== 'expo.modules.audio.service.AudioRecordingService'
      );

      application.service.push({
        $: {
          'android:name': 'expo.modules.audio.service.AudioRecordingService',
          'tools:node': 'remove',
        },
      });
    }

    return cfg;
  });
};
