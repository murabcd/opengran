export type NoteTemplateShape = {
	sections: Array<{
		title?: string | null;
	}>;
};

export type ParsedTemplateStream = {
	note: {
		overview: string[];
		sections: Array<{
			title: string;
			items: string[];
		}>;
	};
	headingOrder: string[];
	missingHeadings: string[];
	extraHeadings: string[];
};

export declare const parseTemplateStreamToStructuredNote: (value: {
	text: string;
	template: NoteTemplateShape;
	isFinal: boolean;
}) => ParsedTemplateStream;

export declare const validateTemplateStream: (value: {
	template: NoteTemplateShape;
	parsed: ParsedTemplateStream;
}) => string | null;
