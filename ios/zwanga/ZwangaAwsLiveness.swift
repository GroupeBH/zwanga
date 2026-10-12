import Foundation
import UIKit
import SwiftUI
import React
import AWSPluginsCore
import FaceLiveness

private struct TemporaryCredentials: AWSTemporaryCredentials {
  let accessKeyId: String
  let secretAccessKey: String
  let sessionToken: String
  let expiration: Date
}
private struct CaptureCredentialsProvider: AWSCredentialsProvider {
  let credentials: TemporaryCredentials
  func fetchAWSCredentials() async throws -> AWSCredentials { credentials }
}
private struct CaptureView: View {
  let sessionId: String
  let region: String
  let provider: CaptureCredentialsProvider
  let completion: (Bool) -> Void
  @State private var presented = true
  var body: some View {
    FaceLivenessDetectorView(sessionID: sessionId, credentialsProvider: provider, region: region,
      isPresented: $presented, onCompletion: { result in
        switch result {
        case .success: completion(true)
        case .failure: completion(false)
        }
      })
      .onChange(of: presented) { visible in if !visible { completion(false) } }
  }
}

@objc(ZwangaAwsLiveness)
final class ZwangaAwsLiveness: NSObject {
  private var resolve: RCTPromiseResolveBlock?
  private var host: UIViewController?
  private var timeout: DispatchWorkItem?
  private var backgroundObserver: NSObjectProtocol?
  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc func cancel() { DispatchQueue.main.async { [weak self] in self?.finish("cancelled") } }
  @objc(start:resolver:rejecter:)
  func start(_ input: NSDictionary, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [self] in
      guard resolve == nil else { rejecter("BUSY", "Une capture est déjà en cours.", nil); return }
      let parser = ISO8601DateFormatter()
      parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      guard let session = input["sessionId"] as? String, let region = input["region"] as? String,
        let expires = input["expiresAt"] as? String, let sessionExpiry = parser.date(from: expires), sessionExpiry > Date(),
        let c = input["credentials"] as? [String: String],
        let key = c["accessKeyId"], let secret = c["secretAccessKey"], let token = c["sessionToken"],
        let expiration = c["expiration"].flatMap({ parser.date(from: $0) }), expiration > Date(),
        let presenter = RCTPresentedViewController() else {
          rejecter("INVALID_SESSION", "Session expirée ou caméra indisponible.", nil); return
        }
      let provider = CaptureCredentialsProvider(credentials: TemporaryCredentials(accessKeyId: key, secretAccessKey: secret, sessionToken: token, expiration: expiration))
      let controller = UIHostingController(rootView: CaptureView(sessionId: session, region: region, provider: provider, completion: { [weak self] ok in
        DispatchQueue.main.async { self?.finish(ok ? "completed" : "cancelled") }
      }))
      controller.modalPresentationStyle = .fullScreen
      controller.isModalInPresentation = true
      resolve = resolver; host = controller
      backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.finish("cancelled") }
      let work = DispatchWorkItem { [weak self] in self?.finish("cancelled") }
      timeout = work; DispatchQueue.main.asyncAfter(deadline: .now() + 180, execute: work)
      presenter.present(controller, animated: true)
    }
  }
  private func finish(_ result: String) {
    guard let done = resolve else { return }
    resolve = nil; timeout?.cancel(); timeout = nil
    if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
    backgroundObserver = nil
    let old = host; host = nil
    old?.dismiss(animated: true) { done(result) }
  }
  @objc func invalidate() { DispatchQueue.main.async { [weak self] in self?.finish("cancelled") } }
}
