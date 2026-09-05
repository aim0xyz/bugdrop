import UIKit
import os
@main class App: UIResponder, UIApplicationDelegate {
 var window: UIWindow?
 var timer: Timer?
 let logger = Logger(subsystem: "xyz.aimo.bugdrop.demo", category: "checkout")
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  let controller = UIViewController()
  controller.view.backgroundColor = UIColor(red: 0.96, green: 0.95, blue: 0.92, alpha: 1)
  let label = UILabel(frame: CGRect(x: 28, y: 140, width: 340, height: 170))
  label.numberOfLines = 0
  label.text = "BugDrop\nNative capture playground\n\nCheckout failed · HTTP 503"
  label.font = .systemFont(ofSize: 25, weight: .semibold)
  controller.view.addSubview(label)
  window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = controller; window?.makeKeyAndVisible()
  timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
   self.logger.error("BugDropDemo checkout failed HTTP 503 token=synthetic-secret customer=sample@example.com")
  }
  return true
 }
}
