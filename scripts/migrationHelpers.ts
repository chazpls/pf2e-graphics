import * as fs from 'node:fs';
import * as path from 'node:path';
import { safeJSONParse, getFilesRecursively } from './helpers.ts';

export interface RollOptionInfo {
	rollOption: string;
	file: string;
}

export interface AnimationFileData {
	file: string;
	rollOptions: string[];
	data: Record<string, unknown>;
}

/**
 * Extracts all roll options (top-level keys) from an animation JSON file.
 */
export function extractRollOptions(filePath: string): RollOptionInfo[] {
	const content = fs.readFileSync(filePath, { encoding: 'utf8' });
	const parseResult = safeJSONParse(content);

	if (!parseResult.success) {
		return [];
	}

	const data = parseResult.data;
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		return [];
	}

	const rollOptions: RollOptionInfo[] = [];
	for (const key in data) {
		if (Object.prototype.hasOwnProperty.call(data, key)) {
			rollOptions.push({ rollOption: key, file: filePath });
		}
	}

	return rollOptions;
}

/**
 * Scans a directory recursively for animation JSON files and extracts roll options.
 */
export function scanAnimationDirectory(dirPath: string): AnimationFileData[] {
	const files = getFilesRecursively(dirPath).filter(file => file.endsWith('.json'));

	const results: AnimationFileData[] = [];

	for (const file of files) {
		const rollOptions = extractRollOptions(file);
		if (rollOptions.length > 0) {
			const content = fs.readFileSync(file, { encoding: 'utf8' });
			const parseResult = safeJSONParse(content);
			const data = parseResult.success && typeof parseResult.data === 'object' && !Array.isArray(parseResult.data)
				? (parseResult.data as Record<string, unknown>)
				: {};

			results.push({
				file,
				rollOptions: rollOptions.map(ro => ro.rollOption),
				data,
			});
		}
	}

	return results;
}

/**
 * Builds a map of roll options to their source files.
 */
export function buildRollOptionMap(files: AnimationFileData[]): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>();

	for (const fileData of files) {
		for (const rollOption of fileData.rollOptions) {
			if (!map.has(rollOption)) {
				map.set(rollOption, new Set());
			}
			map.get(rollOption)!.add(fileData.file);
		}
	}

	return map;
}


