const suppressedStderrPatterns = [
	/NSSpellServer dataFromCheckingString timed out/u,
	/NSSpellServer dataFromCheckingString succeeded/u,
	/ssl_client_socket_impl\.cc:\d+\] handshake failed; returned -1, SSL error code 1, net_error -100/u,
];

const shouldSuppressStderrLine = (line) =>
	suppressedStderrPatterns.some((pattern) => pattern.test(line));

const forwardStream = (stream, target, shouldSuppressLine) => {
	let pending = "";

	stream.setEncoding("utf8");
	stream.on("data", (chunk) => {
		pending += chunk;
		const lines = pending.split(/\r?\n/u);
		pending = lines.pop() ?? "";

		for (const line of lines) {
			if (shouldSuppressLine?.(line)) {
				continue;
			}

			target.write(`${line}\n`);
		}
	});

	stream.on("end", () => {
		if (!pending || shouldSuppressLine?.(pending)) {
			return;
		}

		target.write(pending);
	});
};

export const forwardElectronOutput = (child) => {
	if (child.stdout) {
		forwardStream(child.stdout, process.stdout);
	}

	if (child.stderr) {
		forwardStream(child.stderr, process.stderr, shouldSuppressStderrLine);
	}
};
