import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanAnimationDirectory, type AnimationFileData } from './migrationHelpers.ts';

export interface CategorizationResult {
	automated: string[];
	manual: string[];
	reasons: Record<string, string[]>;
}

/**
 * Checks if an animation set uses complex features that require manual review.
 */
function hasComplexFeatures(animationSet: unknown): string[] {
	const reasons: string[] = [];

	if (typeof animationSet !== 'object' || animationSet === null || Array.isArray(animationSet)) {
		return reasons;
	}

	const obj = animationSet as Record<string, unknown>;

	// Check for preset.bounce or other preset sub-properties
	if ('preset' in obj && typeof obj.preset === 'object' && obj.preset !== null) {
		const preset = obj.preset as Record<string, unknown>;
		if ('bounce' in preset || Object.keys(preset).length > 0) {
			reasons.push('Complex preset options (e.g., preset.bounce)');
		}
	}

	// Check for persist with persistTokenPrototype
	if ('options' in obj && typeof obj.options === 'object' && obj.options !== null) {
		const options = obj.options as Record<string, unknown>;
		if ('persist' in options && typeof options.persist === 'object' && options.persist !== null) {
			const persist = options.persist as Record<string, unknown>;
			if ('persistTokenPrototype' in persist) {
				reasons.push('Complex persist configuration');
			}
		}
	}

	// Check for deeply nested contents (>2 levels)
	const checkNesting = (item: unknown, depth: number = 0): void => {
		if (depth > 2) {
			reasons.push('Deeply nested contents (>2 levels)');
			return;
		}

		if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
			const itemObj = item as Record<string, unknown>;
			if ('contents' in itemObj && Array.isArray(itemObj.contents)) {
				for (const content of itemObj.contents) {
					checkNesting(content, depth + 1);
				}
			}
		}
	};

	checkNesting(obj);

	// Check for custom options not in standard set
	if ('options' in obj && typeof obj.options === 'object' && obj.options !== null) {
		const options = obj.options as Record<string, unknown>;
		const standardOptions = new Set([
			'scaleToObject',
			'fadeIn',
			'fadeOut',
			'delay',
			'waitUntilFinished',
			'preset',
			'tieToDocuments',
			'persist',
			'randomRotation',
			'id',
			'sound',
		]);

		for (const key in options) {
			if (!standardOptions.has(key)) {
				reasons.push(`Custom option: ${key}`);
			}
		}
	}

	return reasons;
}

/**
 * Checks if an animation file can be automatically converted.
 */
function canAutomateFile(fileData: AnimationFileData): { canAutomate: boolean; reasons: string[] } {
	const reasons: string[] = [];

	// Check each roll option's animation sets
	for (const rollOption of fileData.rollOptions) {
		const animationSets = fileData.data[rollOption];

		if (Array.isArray(animationSets)) {
			for (const animationSet of animationSets) {
				const complexReasons = hasComplexFeatures(animationSet);
				reasons.push(...complexReasons);
			}
		} else if (typeof animationSets === 'object' && animationSets !== null) {
			const complexReasons = hasComplexFeatures(animationSets);
			reasons.push(...complexReasons);
		}
	}

	// Also check the file structure itself
	const fileReasons = hasComplexFeatures(fileData.data);
	reasons.push(...fileReasons);

	return {
		canAutomate: reasons.length === 0,
		reasons: [...new Set(reasons)], // Remove duplicates
	};
}

/**
 * Categorizes animation files as automatable or requiring manual review.
 */
export function categorizeAnimations(
	oldDir: string = 'animations_old',
	missingRollOptions?: string[],
): CategorizationResult {
	const oldFiles = scanAnimationDirectory(oldDir);
	const result: CategorizationResult = {
		automated: [],
		manual: [],
		reasons: {},
	};

	for (const fileData of oldFiles) {
		// If missingRollOptions is provided, only categorize files with missing roll options
		if (missingRollOptions && missingRollOptions.length > 0) {
			const hasMissingRollOption = fileData.rollOptions.some(ro => missingRollOptions.includes(ro));
			if (!hasMissingRollOption) {
				continue;
			}
		}

		const { canAutomate, reasons } = canAutomateFile(fileData);

		if (canAutomate) {
			result.automated.push(fileData.file);
		} else {
			result.manual.push(fileData.file);
			result.reasons[fileData.file] = reasons;
		}
	}

	return result;
}

/**
 * Writes the categorization result to a JSON file.
 */
export function writeCategorization(result: CategorizationResult, outputPath: string): void {
	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { encoding: 'utf8' });
}

if (import.meta.main) {
	const result = categorizeAnimations();
	const outputPath = path.join(process.cwd(), 'migration-report-categorization.json');
	writeCategorization(result, outputPath);

	console.log('Animation Categorization Report');
	console.log('='.repeat(50));
	console.log(`Automatable files: ${result.automated.length}`);
	console.log(`Manual review required: ${result.manual.length}`);
	console.log(`\nReport written to: ${outputPath}`);
}

