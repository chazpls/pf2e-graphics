import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildRollOptionMap, scanAnimationDirectory, type AnimationFileData } from './migrationHelpers.ts';

export interface MissingRollOptionReport {
	missing: Array<{
		rollOption: string;
		oldFiles: string[];
	}>;
	existing: Array<{
		rollOption: string;
		oldFiles: string[];
		newFiles: string[];
	}>;
	summary: {
		totalOldRollOptions: number;
		totalNewRollOptions: number;
		missingCount: number;
		existingCount: number;
	};
}

/**
 * Identifies roll options that exist in animations_old but not in animations.
 */
export function identifyMissingRollOptions(
	oldDir: string = 'animations_old',
	newDir: string = 'animations',
): MissingRollOptionReport {
	const oldFiles = scanAnimationDirectory(oldDir);
	const newFiles = scanAnimationDirectory(newDir);

	const oldRollOptionMap = buildRollOptionMap(oldFiles);
	const newRollOptionMap = buildRollOptionMap(newFiles);

	const missing: Array<{ rollOption: string; oldFiles: string[] }> = [];
	const existing: Array<{ rollOption: string; oldFiles: string[]; newFiles: string[] }> = [];

	for (const [rollOption, oldFileSet] of oldRollOptionMap.entries()) {
		const newFileSet = newRollOptionMap.get(rollOption);

		if (!newFileSet || newFileSet.size === 0) {
			missing.push({
				rollOption,
				oldFiles: Array.from(oldFileSet),
			});
		} else {
			existing.push({
				rollOption,
				oldFiles: Array.from(oldFileSet),
				newFiles: Array.from(newFileSet),
			});
		}
	}

	return {
		missing,
		existing,
		summary: {
			totalOldRollOptions: oldRollOptionMap.size,
			totalNewRollOptions: newRollOptionMap.size,
			missingCount: missing.length,
			existingCount: existing.length,
		},
	};
}

/**
 * Writes the missing roll options report to a JSON file.
 */
export function writeMissingReport(report: MissingRollOptionReport, outputPath: string): void {
	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), { encoding: 'utf8' });
}

if (import.meta.main) {
	const report = identifyMissingRollOptions();
	const outputPath = path.join(process.cwd(), 'migration-report-missing.json');
	writeMissingReport(report, outputPath);

	console.log('Missing Roll Options Report');
	console.log('='.repeat(50));
	console.log(`Total roll options in animations_old/: ${report.summary.totalOldRollOptions}`);
	console.log(`Total roll options in animations/: ${report.summary.totalNewRollOptions}`);
	console.log(`Missing roll options: ${report.summary.missingCount}`);
	console.log(`Existing roll options: ${report.summary.existingCount}`);
	console.log(`\nReport written to: ${outputPath}`);
}


