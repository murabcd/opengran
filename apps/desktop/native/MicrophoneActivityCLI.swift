import AudioToolbox
import CoreAudio
import Dispatch
import Foundation

final class StdoutEmitter: @unchecked Sendable {
	private let queue = DispatchQueue(label: "com.opengran.microphone-activity.stdout")
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
	private let queue = DispatchQueue(label: "com.opengran.microphone-activity.stderr")
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

final class MicrophoneActivityMonitor: @unchecked Sendable {
	private let emitter: StdoutEmitter
	private let logger: StderrLogger
	private let queue = DispatchQueue(label: "com.opengran.microphone-activity.listener")
	private var deviceIDs: [AudioDeviceID] = []
	private var lastActive = false

	init(emitter: StdoutEmitter, logger: StderrLogger) {
		self.emitter = emitter
		self.logger = logger
	}

	func start() {
		queue.sync {
			deviceIDs = Self.physicalInputDeviceIDs()

			for deviceID in deviceIDs {
				var address = AudioObjectPropertyAddress(
					mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
					mScope: kAudioObjectPropertyScopeGlobal,
					mElement: kAudioObjectPropertyElementMain
				)

				let selfPtr = Unmanaged.passUnretained(self).toOpaque()
				AudioObjectAddPropertyListener(deviceID, &address, Self.listenerCallback, selfPtr)
			}

			lastActive = deviceIDs.contains { Self.isDeviceRunning($0) }
			emitter.send(event: [
				"type": "ready",
				"active": lastActive,
			])
		}
	}

	func stop() {
		queue.sync {
			for deviceID in deviceIDs {
				var address = AudioObjectPropertyAddress(
					mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
					mScope: kAudioObjectPropertyScopeGlobal,
					mElement: kAudioObjectPropertyElementMain
				)

				let selfPtr = Unmanaged.passUnretained(self).toOpaque()
				AudioObjectRemovePropertyListener(deviceID, &address, Self.listenerCallback, selfPtr)
			}

			deviceIDs.removeAll()
		}
	}

	deinit {
		stop()
	}

	private static let listenerCallback: AudioObjectPropertyListenerProc = {
		_, _, _, clientData in
		guard let clientData else {
			return kAudioHardwareNoError
		}

		let monitor = Unmanaged<MicrophoneActivityMonitor>.fromOpaque(clientData)
			.takeUnretainedValue()
		monitor.emitIfNeeded()
		return kAudioHardwareNoError
	}

	private func emitIfNeeded() {
		queue.async { [weak self] in
			guard let self else {
				return
			}

			let nextActive = self.deviceIDs.contains { Self.isDeviceRunning($0) }
			guard nextActive != self.lastActive else {
				return
			}

			self.lastActive = nextActive
			self.emitter.send(event: [
				"type": "active-changed",
				"active": nextActive,
			])
		}
	}

	private static func physicalInputDeviceIDs() -> [AudioDeviceID] {
		var address = AudioObjectPropertyAddress(
			mSelector: kAudioHardwarePropertyDevices,
			mScope: kAudioObjectPropertyScopeGlobal,
			mElement: kAudioObjectPropertyElementMain
		)

		var dataSize: UInt32 = 0
		guard AudioObjectGetPropertyDataSize(
			AudioObjectID(kAudioObjectSystemObject),
			&address,
			0,
			nil,
			&dataSize
		) == kAudioHardwareNoError else {
			return []
		}

		let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
		var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
		guard AudioObjectGetPropertyData(
			AudioObjectID(kAudioObjectSystemObject),
			&address,
			0,
			nil,
			&dataSize,
			&deviceIDs
		) == kAudioHardwareNoError else {
			return []
		}

		return deviceIDs.filter { deviceID in
			var inputAddress = AudioObjectPropertyAddress(
				mSelector: kAudioDevicePropertyStreams,
				mScope: kAudioDevicePropertyScopeInput,
				mElement: kAudioObjectPropertyElementMain
			)
			var inputSize: UInt32 = 0
			let status = AudioObjectGetPropertyDataSize(
				deviceID,
				&inputAddress,
				0,
				nil,
				&inputSize
			)
			return status == kAudioHardwareNoError && inputSize > 0
		}
	}

	private static func isDeviceRunning(_ deviceID: AudioDeviceID) -> Bool {
		var address = AudioObjectPropertyAddress(
			mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
			mScope: kAudioObjectPropertyScopeGlobal,
			mElement: kAudioObjectPropertyElementMain
		)
		var isRunning: UInt32 = 0
		var size = UInt32(MemoryLayout<UInt32>.size)
		let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &isRunning)
		return status == kAudioHardwareNoError && isRunning != 0
	}
}

@main
enum MicrophoneActivityCLI {
	static func main() {
		setbuf(stdout, nil)

		let emitter = StdoutEmitter()
		let logger = StderrLogger()
		let monitor = MicrophoneActivityMonitor(emitter: emitter, logger: logger)

		logger.log("[helper] microphone activity monitor starting")
		monitor.start()

		signal(SIGINT) { _ in
			exit(EXIT_SUCCESS)
		}

		signal(SIGTERM) { _ in
			exit(EXIT_SUCCESS)
		}

		RunLoop.main.run()
	}
}
