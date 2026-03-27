@preconcurrency import AVFoundation
import Dispatch
import Foundation

enum MicrophoneCaptureError: Error, LocalizedError {
	case inputNodeUnavailable
	case invalidInputFormat
	case permissionDenied
	case tapFormatUnavailable
	case unableToCreateEngine

	var errorDescription: String? {
		switch self {
		case .inputNodeUnavailable:
			return "Microphone input node is unavailable."
		case .invalidInputFormat:
			return "Microphone input format is invalid."
		case .permissionDenied:
			return "Microphone access was denied."
		case .tapFormatUnavailable:
			return "Failed to create a microphone tap format."
		case .unableToCreateEngine:
			return "Failed to create the microphone audio engine."
		}
	}
}

final class StdoutEmitter: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.opengran.microphone.stdout")
	private let fileHandle = FileHandle.standardOutput

	func send(event: [String: Any]) {
		queue.async {
			guard JSONSerialization.isValidJSONObject(event),
				let data = try? JSONSerialization.data(withJSONObject: event)
			else {
				return
			}

			self.fileHandle.write(data)
			self.fileHandle.write(Data([0x0A]))
		}
	}
}

final class StderrLogger: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.opengran.microphone.stderr")
	private let fileHandle = FileHandle.standardError

	func log(_ message: String) {
		queue.async {
			guard let data = "\(message)\n".data(using: .utf8) else {
				return
			}

			self.fileHandle.write(data)
		}
	}
}

final class PcmChunkEncoder: @unchecked Sendable {
	private let emitter: StdoutEmitter
	private let flushIntervalNanoseconds: UInt64
	private let queue = DispatchQueue(label: "com.opengran.microphone.encoder")
	private var pendingBytes = Data()
	private var timer: DispatchSourceTimer?

	init(emitter: StdoutEmitter, flushIntervalMilliseconds: UInt64 = 100) {
		self.emitter = emitter
		self.flushIntervalNanoseconds = flushIntervalMilliseconds * 1_000_000
	}

	func start() {
		queue.sync {
			guard timer == nil else {
				return
			}

			let nextTimer = DispatchSource.makeTimerSource(queue: queue)
			nextTimer.schedule(
				deadline: .now() + .nanoseconds(Int(flushIntervalNanoseconds)),
				repeating: .nanoseconds(Int(flushIntervalNanoseconds))
			)
			nextTimer.setEventHandler { [weak self] in
				self?.flushLocked()
			}
			nextTimer.resume()
			timer = nextTimer
		}
	}

	func stop() {
		queue.sync {
			timer?.cancel()
			timer = nil
			flushLocked()
		}
	}

	func append(buffer: AVAudioPCMBuffer) {
		guard let floatChannel = buffer.floatChannelData?[0] else {
			return
		}

		let frameCount = Int(buffer.frameLength)
		guard frameCount > 0 else {
			return
		}

		queue.async {
			var encoded = Data(capacity: frameCount * MemoryLayout<Int16>.size)

			for frameIndex in 0..<frameCount {
				let sample = max(-1.0, min(1.0, floatChannel[frameIndex]))
				let scaled = sample >= 0
					? sample * Float(Int16.max)
					: sample * 32768
				var int16Sample = Int16(scaled.rounded())

				withUnsafeBytes(of: &int16Sample) { bytes in
					encoded.append(contentsOf: bytes)
				}
			}

			self.pendingBytes.append(encoded)
		}
	}

	private func flushLocked() {
		guard !pendingBytes.isEmpty else {
			return
		}

		let base64 = pendingBytes.base64EncodedString()
		pendingBytes.removeAll(keepingCapacity: true)
		emitter.send(event: [
			"type": "chunk",
			"pcm16": base64,
		])
	}
}

final class MicrophoneCapture: @unchecked Sendable {
	private let encoder: PcmChunkEncoder
	private let logger: StderrLogger
	private let routeChangeHandler: @Sendable () -> Void
	private var engine: AVAudioEngine?
	private var hasInstalledTap = false
	private var engineConfigurationObserver: NSObjectProtocol?
	private var hasHandledRouteChange = false

	init(
		encoder: PcmChunkEncoder,
		logger: StderrLogger,
		routeChangeHandler: @escaping @Sendable () -> Void
	) {
		self.encoder = encoder
		self.logger = logger
		self.routeChangeHandler = routeChangeHandler
	}

	func start() throws -> AVAudioFormat {
		try stop()
		logger.log("[helper] microphone start() entered")
		hasHandledRouteChange = false

		let authorizationStatus = AVCaptureDevice.authorizationStatus(for: .audio)
		guard authorizationStatus == .authorized else {
			throw MicrophoneCaptureError.permissionDenied
		}

		let nextEngine = AVAudioEngine()
		let inputNode = nextEngine.inputNode
		let inputFormat = inputNode.outputFormat(forBus: 0)

		guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
			throw MicrophoneCaptureError.invalidInputFormat
		}

		guard let tapFormat = AVAudioFormat(
			standardFormatWithSampleRate: inputFormat.sampleRate,
			channels: 1
		) else {
			throw MicrophoneCaptureError.tapFormatUnavailable
		}

		inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) {
			[weak self] buffer, _ in
			self?.encoder.append(buffer: buffer)
		}
		hasInstalledTap = true

		do {
			try nextEngine.start()
		} catch {
			inputNode.removeTap(onBus: 0)
			hasInstalledTap = false
			throw error
		}

		engine = nextEngine
		engineConfigurationObserver = NotificationCenter.default.addObserver(
			forName: .AVAudioEngineConfigurationChange,
			object: nextEngine,
			queue: nil
		) { [weak self] _ in
			self?.handleEngineConfigurationChange()
		}
		return tapFormat
	}

	func stop() throws {
		guard let engine else {
			return
		}

		if hasInstalledTap {
			engine.inputNode.removeTap(onBus: 0)
			hasInstalledTap = false
		}

		if let engineConfigurationObserver {
			NotificationCenter.default.removeObserver(engineConfigurationObserver)
			self.engineConfigurationObserver = nil
		}

		engine.stop()
		self.engine = nil
		hasHandledRouteChange = false
	}

	private func handleEngineConfigurationChange() {
		guard !hasHandledRouteChange else {
			return
		}

		hasHandledRouteChange = true
		logger.log("[helper] microphone engine configuration changed")
		routeChangeHandler()
	}
}

@main
enum MicrophoneCaptureCLI {
	static func main() {
		setbuf(stdout, nil)

		let emitter = StdoutEmitter()
		let logger = StderrLogger()
		let encoder = PcmChunkEncoder(emitter: emitter)
		let capture = MicrophoneCapture(
			encoder: encoder,
			logger: logger,
			routeChangeHandler: {
				logger.log("[helper] microphone route changed, restarting capture")
				emitter.send(event: [
					"type": "error",
					"message": "Microphone device changed. Restarting capture.",
				])
				exit(EXIT_FAILURE)
			}
		)
		var signalSources: [DispatchSourceSignal] = []

		func stopCaptureAndExit(_ signal: Int32) -> Never {
			logger.log("[helper] received signal \(signal)")
			encoder.stop()
			try? capture.stop()
			emitter.send(event: [
				"type": "stopped",
				"signal": signal,
			])
			exit(signal == SIGTERM || signal == SIGINT ? 0 : 1)
		}

		for handledSignal in [SIGINT, SIGTERM] {
			signal(handledSignal, SIG_IGN)
			let source = DispatchSource.makeSignalSource(signal: handledSignal)
			source.setEventHandler {
				stopCaptureAndExit(handledSignal)
			}
			source.resume()
			signalSources.append(source)
		}

		do {
			let format = try capture.start()
			encoder.start()
			emitter.send(event: [
				"type": "ready",
				"channels": Int(format.channelCount),
				"sampleRate": Int(format.sampleRate.rounded()),
			])
			withExtendedLifetime(signalSources) {
				dispatchMain()
			}
		} catch {
			logger.log("[helper] microphone failed: \(error.localizedDescription)")
			emitter.send(event: [
				"type": "error",
				"message": error.localizedDescription,
			])
			exit(EXIT_FAILURE)
		}
	}
}
