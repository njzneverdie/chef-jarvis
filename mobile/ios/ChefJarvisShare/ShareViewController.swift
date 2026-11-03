import UIKit
import UniformTypeIdentifiers

// Share sheet entry: takes a YouTube or Instagram link shared from another app
// and opens Chef Jarvis on its import screen (chefjarvis://import?url=<link>).
@objc(ShareViewController)
class ShareViewController: UIViewController {
  private var handled = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !handled else { return }
    handled = true
    Task { @MainActor in
      let text = await sharedText()
      if let link = Self.findVideoLink(in: text), let url = Self.importURL(for: link), openApp(url) {
        extensionContext?.completeRequest(returningItems: nil)
      } else {
        showUnsupported()
      }
    }
  }

  // Shared URLs and plain text, joined; Instagram and YouTube send either.
  private func sharedText() async -> String {
    var parts: [String] = []
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    for item in items {
      if let text = item.attributedContentText?.string { parts.append(text) }
      for provider in item.attachments ?? [] {
        for type in [UTType.url, UTType.plainText] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
          if let value = try? await provider.loadItem(forTypeIdentifier: type.identifier) {
            if let url = value as? URL { parts.append(url.absoluteString) }
            else if let string = value as? String { parts.append(string) }
            else if let data = value as? Data, let string = String(data: data, encoding: .utf8) { parts.append(string) }
          }
        }
      }
    }
    return parts.joined(separator: " ")
  }

  // Same rule as findVideoLink in mobile/src/mobile-domain.mjs.
  static func findVideoLink(in text: String) -> String? {
    let pattern = #"(?:https?://)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|instagram\.com)/[^\s"'<>]+"#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
          let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let range = Range(match.range, in: text) else { return nil }
    let found = String(text[range])
    return found.lowercased().hasPrefix("http") ? found : "https://\(found)"
  }

  static func importURL(for link: String) -> URL? {
    var components = URLComponents()
    components.scheme = "chefjarvis"
    components.host = "import"
    // Encode everything but letters and digits: queryItems would leave "&",
    // "=" and "?" from the link unescaped.
    components.percentEncodedQuery = "url=" + (link.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? link)
    return components.url
  }

  // Extensions cannot use UIApplication.shared; the app object is reachable
  // through the responder chain once this view is on screen.
  private func openApp(_ url: URL) -> Bool {
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        application.open(url, options: [:], completionHandler: nil)
        return true
      }
      responder = current.next
    }
    return false
  }

  private func showUnsupported() {
    let chinese = Locale.preferredLanguages.first?.hasPrefix("zh") == true
    let alert = UIAlertController(
      title: "Chef Jarvis",
      message: chinese ? "只支援 YouTube 與 Instagram 影片連結。" : "Only YouTube and Instagram video links are supported.",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: chinese ? "好" : "OK", style: .default) { [weak self] _ in
      self?.extensionContext?.completeRequest(returningItems: nil)
    })
    present(alert, animated: true)
  }
}
