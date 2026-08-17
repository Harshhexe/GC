const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Strips the `aps-environment` entitlement unless GC_PUSH_ENTITLEMENT=1.
 *
 * Why this exists: the expo-notifications config plugin unconditionally writes
 * `aps-environment` into GC.entitlements (see its withNotificationsIOS.js).
 * Push Notifications is a paid-only capability — a free "Personal Team"
 * provisioning profile cannot contain that entitlement, and Xcode hard-fails
 * signing with:
 *
 *   Provisioning profile "iOS Team Provisioning Profile: com.harsh.GC"
 *   doesn't include the aps-environment entitlement.
 *
 * So simply adding expo-notifications breaks an otherwise working free-account
 * build the moment you `expo prebuild`. Removing the plugin instead would also
 * drop the Android notification icon/colour, which has nothing to do with
 * Apple — hence a surgical strip rather than dropping the plugin.
 *
 * Registered *before* expo-notifications in app.json, which looks backwards
 * and is not: entitlement mods run in REVERSE registration order (the
 * last-registered mod runs first), so registering earlier is what makes this
 * run last and get the final write. Registered after expo-notifications it
 * runs first, finds no `aps-environment` to remove, and silently does
 * nothing — verified, not assumed.
 *
 * ── Turning push on ──────────────────────────────────────────────────────
 * Once the Apple Developer Program membership is active and the App ID has
 * Push Notifications enabled:
 *
 *   GC_PUSH_ENTITLEMENT=1 npx expo prebuild --clean
 *
 * Then upload the APNs key to EAS (`eas credentials`) so Expo's push service
 * can talk to APNs on your behalf. Android needs none of this and works
 * without the flag.
 */
module.exports = function withPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    if (process.env.GC_PUSH_ENTITLEMENT === '1') return cfg;

    if (cfg.modResults['aps-environment']) {
      delete cfg.modResults['aps-environment'];
      console.warn(
        '[gc] Removed aps-environment — free Apple teams cannot sign it. ' +
          'iOS push is inert until you have a paid account; rebuild with ' +
          'GC_PUSH_ENTITLEMENT=1 to enable it.'
      );
    }
    return cfg;
  });
};
