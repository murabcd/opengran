const stripMarkdownDecoration = (text) =>
	text
		.trim()
		.replace(/^#{1,6}\s+/, "")
		.replace(/^[*-]\s+/, "")
		.replace(/^\d+\.\s+/, "")
		.trim();

const getTemplateSectionTitles = (template) =>
	template.sections
		.map((section) => section.title?.trim() ?? "")
		.filter(Boolean);

export const parseTemplateStreamToStructuredNote = ({
	text,
	template,
	isFinal,
}) => {
	const normalizedText = text.replace(/\r/g, "");
	const rawLines = normalizedText.split("\n");
	const lines =
		isFinal || normalizedText.endsWith("\n") ? rawLines : rawLines.slice(0, -1);
	const sectionTitles = getTemplateSectionTitles(template);
	const sections = sectionTitles.map((title) => ({
		title,
		items: [],
	}));
	const overview = [];
	const headingOrder = [];
	const extraHeadings = [];
	let currentTarget = {
		type: "overview",
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (!line || line === "---") {
			continue;
		}

		const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
		if (headingMatch) {
			const headingTitle = stripMarkdownDecoration(headingMatch[1]);
			const sectionIndex = headingOrder.length;

			if (sectionIndex >= sections.length) {
				extraHeadings.push(headingTitle);
				currentTarget = {
					type: "ignore",
				};
				continue;
			}

			sections[sectionIndex] = {
				...sections[sectionIndex],
				title: headingTitle,
			};
			headingOrder.push(headingTitle);
			currentTarget = {
				type: "section",
				index: sectionIndex,
			};
			continue;
		}

		const itemText = stripMarkdownDecoration(line);
		if (!itemText) {
			continue;
		}

		if (currentTarget.type === "section") {
			sections[currentTarget.index]?.items.push(itemText);
			continue;
		}

		if (currentTarget.type === "overview") {
			overview.push(itemText);
		}
	}

	const missingHeadings = sectionTitles.slice(headingOrder.length);

	return {
		note: {
			overview,
			sections,
		},
		headingOrder,
		missingHeadings,
		extraHeadings,
	};
};

export const validateTemplateStream = ({ template, parsed }) => {
	if (parsed.extraHeadings.length > 0) {
		return `Template rewrite returned extra sections: ${parsed.extraHeadings.join(", ")}.`;
	}

	if (parsed.missingHeadings.length > 0) {
		return `Missing template sections in template rewrite: ${parsed.missingHeadings.join(", ")}.`;
	}

	if (
		parsed.headingOrder.length !== getTemplateSectionTitles(template).length
	) {
		return "Template rewrite returned sections out of order.";
	}

	return null;
};
