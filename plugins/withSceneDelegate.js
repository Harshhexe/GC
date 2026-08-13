const { withInfoPlist, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * iOS 27 / Xcode 26 requires UIScene lifecycle adoption.
 * This plugin:
 * 1. Adds UIApplicationSceneManifest to Info.plist
 * 2. Adds SceneDelegate handling to AppDelegate.swift without breaking expo-dev-launcher's keyWindow check
 */
module.exports = function withSceneDelegate(config) {
  // Step 1: Add UIApplicationSceneManifest to Info.plist
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

  // Step 2: Patch AppDelegate.swift
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projRoot = cfg.modRequest.platformProjectRoot;
      const appName = cfg.modRequest.projectName || 'GC';
      const appDelegatePath = path.join(projRoot, appName, 'AppDelegate.swift');

      if (!fs.existsSync(appDelegatePath)) {
        return cfg;
      }

      let content = fs.readFileSync(appDelegatePath, 'utf8');

      // 1. Add configurationForConnecting to AppDelegate if not present
      if (!content.includes('configurationForConnecting connectingSceneSession')) {
        const delegateExtension = `
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    config.delegateClass = SceneDelegate.self
    return config
  }
}
`;
        content = content.replace(/}\n\nclass ReactNativeDelegate/g, delegateExtension + '\nclass ReactNativeDelegate');
      }

      // 2. Append SceneDelegate class at the bottom if not present
      if (!content.includes('class SceneDelegate')) {
        content += `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let appDelegate = UIApplication.shared.delegate as! AppDelegate
    if let window = appDelegate.window {
      window.windowScene = windowScene
      window.makeKeyAndVisible()
      self.window = window
    } else {
      let window = UIWindow(windowScene: windowScene)
      appDelegate.window = window
      if let factory = appDelegate.reactNativeFactory as? ExpoReactNativeFactory {
        factory.startReactNative(
          withModuleName: "main",
          in: window,
          launchOptions: nil
        )
      }
      window.makeKeyAndVisible()
      self.window = window
    }
  }
}
`;
      }

      fs.writeFileSync(appDelegatePath, content);

      // If we previously created SceneDelegate.swift, delete it so it doesn't cause build errors
      const sceneDelegatePath = path.join(projRoot, appName, 'SceneDelegate.swift');
      if (fs.existsSync(sceneDelegatePath)) {
        fs.unlinkSync(sceneDelegatePath);
      }

      return cfg;
    },
  ]);

  return config;
};

