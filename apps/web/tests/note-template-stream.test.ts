import { describe, expect, it } from "vitest";
import {
	parseTemplateStreamToStructuredNote,
	validateTemplateStream,
} from "../src/lib/note-template-stream";

const template = {
	sections: [
		{ title: "Top of mind" },
		{ title: "Updates and wins" },
		{ title: "Challenges and blockers" },
	],
};

describe("note template stream parsing", () => {
	it("accepts localized section headings while preserving template order", () => {
		const parsed = parseTemplateStreamToStructuredNote({
			text: [
				"- Короткое резюме встречи",
				"## Самое важное",
				"- Главный приоритет на этой неделе",
				"## Обновления и победы",
				"- Закончили доработку редактора",
				"## Проблемы и блокеры",
				"- Ждем ответ от подрядчика",
			].join("\n"),
			template,
			isFinal: true,
		});

		expect(validateTemplateStream({ template, parsed })).toBeNull();
		expect(parsed.note).toEqual({
			overview: ["Короткое резюме встречи"],
			sections: [
				{
					title: "Самое важное",
					items: ["Главный приоритет на этой неделе"],
				},
				{
					title: "Обновления и победы",
					items: ["Закончили доработку редактора"],
				},
				{
					title: "Проблемы и блокеры",
					items: ["Ждем ответ от подрядчика"],
				},
			],
		});
	});

	it("rejects rewrites that add extra headings beyond the template", () => {
		const parsed = parseTemplateStreamToStructuredNote({
			text: [
				"## Самое важное",
				"- Главный приоритет",
				"## Обновления и победы",
				"- Выпустили улучшение",
				"## Проблемы и блокеры",
				"- Нужен фидбек",
				"## Лишний раздел",
				"- Не должен появляться",
			].join("\n"),
			template,
			isFinal: true,
		});

		expect(validateTemplateStream({ template, parsed })).toBe(
			"Template rewrite returned extra sections: Лишний раздел.",
		);
	});
});
