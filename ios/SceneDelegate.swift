import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    // The AppDelegate already sets up the React Native window; just adopt it.
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      window = appDelegate.window
      window?.windowScene = windowScene
    }
  }
}
