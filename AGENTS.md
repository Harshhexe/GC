# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Keyword: `PUSHFIX`
If an iOS build fails with `doesn't include the aps-environment entitlement`,
the `./plugins/withPushEntitlement` plugin is missing from `app.json` or is
registered in the wrong place.

Push Notifications is a **paid**-Apple-Developer-only capability. The
`expo-notifications` config plugin adds `aps-environment` unconditionally, so
a free "Personal Team" build fails to sign the moment you prebuild.
`withPushEntitlement` strips it unless `GC_PUSH_ENTITLEMENT=1`.

It must be registered **before** `expo-notifications` in the `plugins` array:
entitlement mods run in **reverse** registration order, so registering earlier
is what makes it run last and win. Registered after, it runs first, finds
nothing to strip, and silently does nothing.

Once the paid membership is active:
`GC_PUSH_ENTITLEMENT=1 npx expo prebuild --clean`, then `eas credentials` to
upload the APNs key. Android is unaffected either way.

## Keyword: `SCENEFIX`
If the app faces iOS 27 / Xcode 26 `UIScene life cycle is required` or `Cannot find keyWindow` crash on launch, ensure `./plugins/withSceneDelegate` is registered in `app.json`.
It handles both:
1. `UIApplicationSceneManifest` in `Info.plist` & `SceneDelegate` window binding.
2. Keeping `appDelegate.window` initialized during `didFinishLaunchingWithOptions` for `expo-dev-launcher`.

## Keyword: `CHANGELOG_UPDATE`
Every time you make a big feature change or ship a major update:
Always refresh `CHANGELOG_ITEMS` in `src/components/AppUpdateModal.tsx` with the new changes and remove older, stale entries so the update modal always highlights what is actually new.


