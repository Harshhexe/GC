# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Keyword: `SCENEFIX`
If the app faces iOS 27 / Xcode 26 `UIScene life cycle is required` or `Cannot find keyWindow` crash on launch, ensure `./plugins/withSceneDelegate` is registered in `app.json`.
It handles both:
1. `UIApplicationSceneManifest` in `Info.plist` & `SceneDelegate` window binding.
2. Keeping `appDelegate.window` initialized during `didFinishLaunchingWithOptions` for `expo-dev-launcher`.

