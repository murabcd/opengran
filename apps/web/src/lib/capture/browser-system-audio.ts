export const createBrowserSystemAudioStream = async () => {
	const displayStream = await navigator.mediaDevices.getDisplayMedia({
		video: true,
		audio: true,
	});

	for (const track of displayStream.getVideoTracks()) {
		track.stop();
	}

	const audioTracks = displayStream.getAudioTracks();
	if (audioTracks.length === 0) {
		for (const track of displayStream.getTracks()) {
			track.stop();
		}
		return null;
	}

	return new MediaStream(audioTracks);
};
