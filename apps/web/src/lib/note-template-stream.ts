type NoteTemplateShape = {
	sections: Array<{
		title?: string | null;
	}>;
};

type TemplateParseTarget =
	| {
			type: "overview";
	  }
	| {
			type: "section";
			index: number;
	  }
	| {
			type: "ignore";
	  };

type ParsedTemplateStream = {
	note: {
		overview: string[];
		sections: Array<{
			title: string;
			items: string[];
		}>;
	};
	headingOrder: string[];
	missingHeadings: string[];
	unknownHeadings: string[];
	duplicateHeadings: string[];
};

const stripMarkdownDecoration = (text: string) =>
	text
		.trim()
		.replace(/^#{1,6}\s+/, "")
		.replace(/^[*-]\s+/, "")
		.replace(/^\d+\.\s+/, "")
		.trim();

const getTemplateSectionTitles = (template: NoteTemplateShape) =>
	template.sections
		.map((section) => section.title?.trim() ?? "")
		.filter(Boolean);

export const parseTemplateStreamToStructuredNote = ({
	text,
	template,
	isFinal,
}: {
	text: string;
	template: NoteTemplateShape;
	isFinal: boolean;
}): ParsedTemplateStream => {
	const normalizedText = text.replace(/\r/g, "");
	const rawLines = normalizedText.split("\n");
	const lines =
		isFinal || normalizedText.endsWith("\n") ? rawLines : rawLines.slice(0, -1);
	const sectionTitles = getTemplateSectionTitles(template);
	const sections = sectionTitles.map((title) => ({
		title,
		items: [] as string[],
	}));
	const sectionIndexes = new Map(
		sections.map((section, index) => [section.title.toLowerCase(), index]),
	);
	const seenHeadings = new Set<string>();
	const overview: string[] = [];
	const headingOrder: string[] = [];
	const unknownHeadings: string[] = [];
	const duplicateHeadings: string[] = [];
	let currentTarget: TemplateParseTarget = {
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
			const normalizedHeadingTitle = headingTitle.toLowerCase();
			const sectionIndex = sectionIndexes.get(normalizedHeadingTitle);

			if (sectionIndex === undefined) {
				unknownHeadings.push(headingTitle);
				currentTarget = {
					type: "ignore",
				};
				continue;
			}

			headingOrder.push(normalizedHeadingTitle);
			if (seenHeadings.has(normalizedHeadingTitle)) {
				duplicateHeadings.push(headingTitle);
			} else {
				seenHeadings.add(normalizedHeadingTitle);
			}
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

	const missingHeadings = sectionTitles.filter(
		(title) => !seenHeadings.has(title.toLowerCase()),
	);

	return {
		note: {
			overview,
			sections,
		},
		headingOrder,
		missingHeadings,
		unknownHeadings,
		duplicateHeadings,
	};
};

export const validateTemplateStream = ({
	template,
	parsed,
}: {
	template: NoteTemplateShape;
	parsed: ParsedTemplateStream;
}) => {
	if (parsed.unknownHeadings.length > 0) {
		return `Unexpected section headings in template rewrite: ${parsed.unknownHeadings.join(", ")}.`;
	}

	if (parsed.duplicateHeadings.length > 0) {
		return `Duplicate section headings in template rewrite: ${parsed.duplicateHeadings.join(", ")}.`;
	}

	if (parsed.missingHeadings.length > 0) {
		return `Missing template sections in template rewrite: ${parsed.missingHeadings.join(", ")}.`;
	}

	const expectedHeadingOrder = getTemplateSectionTitles(template).map((title) =>
		title.toLowerCase(),
	);
	const hasOrderMismatch =
		parsed.headingOrder.length !== expectedHeadingOrder.length ||
		parsed.headingOrder.some(
			(title, index) => title !== expectedHeadingOrder[index],
		);

	if (hasOrderMismatch) {
		return "Template rewrite returned sections out of order.";
	}

	return null;
};
