import * as fs from 'node:fs';
import * as path from 'node:path';
import { identifyMissingRollOptions, writeMissingReport, type MissingRollOptionReport } from './identifyMissing.ts';
import { categorizeAnimations, writeCategorization, type CategorizationResult } from './categorizeAnimations.ts';
import { convertOldAnimation } from './convertOldAnimation.ts';
import { scanAnimationDirectory, type AnimationFileData } from './migrationHelpers.ts';
import { validateAnimationData } from '../schema/validation/index.ts';
import { safeJSONParse } from './helpers.ts';
import { Log } from './helpers.ts';

export interface MigrationReport {
	missing: MissingRollOptionReport;
	categorization: CategorizationResult;
	conversion: {
		successful: Array<{ file: string; rollOptions: string[] }>;
		failed: Array<{ file: string; error: string }>;
		validationErrors: Array<{ file: string; errors: string[] }>;
	};
	summary: {
		totalFilesProcessed: number;
		successfullyConverted: number;
		failedConversions: number;
		validationErrors: number;
		manualReviewRequired: number;
	};
}

/**
 * Converts a single animation file from old format to new format.
 */
function convertFile(oldFile: string, outputDir: string): { success: boolean; error?: string; rollOptions?: string[] } {
	try {
		const content = fs.readFileSync(oldFile, { encoding: 'utf8' });
		const parseResult = safeJSONParse(content);

		if (!parseResult.success) {
			return { success: false, error: 'Invalid JSON syntax' };
		}

		const oldData = parseResult.data as Record<string, unknown>;
		const converted = convertOldAnimation(oldData);

		// Extract roll options
		const rollOptions = Object.keys(converted);

		// Determine output path maintaining folder structure
		const relativePath = path.relative('animations_old', oldFile);
		const outputPath = path.join(outputDir, relativePath);

		// Create output directory if needed
		const outputFileDir = path.dirname(outputPath);
		if (!fs.existsSync(outputFileDir)) {
			fs.mkdirSync(outputFileDir, { recursive: true });
		}

		// Write converted file
		fs.writeFileSync(outputPath, JSON.stringify(converted, null, '\t'), { encoding: 'utf8' });

		// Validate the converted file
		const validationResult = validateAnimationData(converted);
		if (!validationResult.success) {
			const errors = validationResult.error.issues.map(issue => issue.message).join('; ');
			return { success: false, error: `Validation failed: ${errors}`, rollOptions };
		}

		return { success: true, rollOptions };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Main migration function that orchestrates the entire process.
 */
export function migrateAnimations(
	oldDir: string = 'animations_old',
	newDir: string = 'animations',
	outputDir: string = 'animations',
	dryRun: boolean = false,
): MigrationReport {
	Log.info('Starting animation migration...');
	Log.newLine();

	// Step 1: Identify missing roll options
	Log.info('Step 1: Identifying missing roll options...');
	const missingReport = identifyMissingRollOptions(oldDir, newDir);
	Log.info(`Found ${missingReport.summary.missingCount} missing roll options`);
	Log.newLine();

	// Step 2: Categorize animations
	Log.info('Step 2: Categorizing animations...');
	const missingRollOptions = missingReport.missing.map(m => m.rollOption);
	const categorization = categorizeAnimations(oldDir, missingRollOptions);
	Log.info(`Automatable: ${categorization.automated.length}, Manual review: ${categorization.manual.length}`);
	Log.newLine();

	// Step 3: Convert automatable files
	Log.info('Step 3: Converting automatable files...');
	const conversion = {
		successful: [] as Array<{ file: string; rollOptions: string[] }>,
		failed: [] as Array<{ file: string; error: string }>,
		validationErrors: [] as Array<{ file: string; errors: string[] }>,
	};

	if (!dryRun) {
		for (const file of categorization.automated) {
			const result = convertFile(file, outputDir);
			if (result.success && result.rollOptions) {
				conversion.successful.push({ file, rollOptions: result.rollOptions });
			} else {
				if (result.error?.includes('Validation failed')) {
					conversion.validationErrors.push({
						file,
						errors: [result.error],
					});
				} else {
					conversion.failed.push({ file, error: result.error || 'Unknown error' });
				}
			}
		}
	}

	Log.info(`Successfully converted: ${conversion.successful.length}`);
	Log.info(`Failed: ${conversion.failed.length}`);
	Log.info(`Validation errors: ${conversion.validationErrors.length}`);
	Log.newLine();

	const report: MigrationReport = {
		missing: missingReport,
		categorization,
		conversion,
		summary: {
			totalFilesProcessed: categorization.automated.length,
			successfullyConverted: conversion.successful.length,
			failedConversions: conversion.failed.length,
			validationErrors: conversion.validationErrors.length,
			manualReviewRequired: categorization.manual.length,
		},
	};

	return report;
}

/**
 * Writes the migration report to JSON files.
 */
export function writeMigrationReport(report: MigrationReport, baseDir: string = process.cwd()): void {
	const reportsDir = path.join(baseDir, 'migration-reports');
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
	}

	writeMissingReport(report.missing, path.join(reportsDir, 'missing.json'));
	writeCategorization(report.categorization, path.join(reportsDir, 'categorization.json'));
	fs.writeFileSync(
		path.join(reportsDir, 'migration-report.json'),
		JSON.stringify(report, null, 2),
		{ encoding: 'utf8' },
	);
}

/**
 * Prints a summary of the migration report.
 */
export function printMigrationSummary(report: MigrationReport): void {
	Log.newLine();
	Log.info('Migration Summary');
	Log.info('='.repeat(50));
	Log.info(`Missing roll options: ${report.summary.manualReviewRequired + report.summary.totalFilesProcessed}`);
	Log.info(`Automatable files: ${report.summary.totalFilesProcessed}`);
	Log.info(`Successfully converted: ${report.summary.successfullyConverted}`);
	Log.info(`Failed conversions: ${report.summary.failedConversions}`);
	Log.info(`Validation errors: ${report.summary.validationErrors}`);
	Log.info(`Manual review required: ${report.summary.manualReviewRequired}`);
	Log.newLine();

	if (report.conversion.failed.length > 0) {
		Log.warning('Failed Conversions:');
		for (const failure of report.conversion.failed) {
			Log.warning(`  ${failure.file}: ${failure.error}`);
		}
		Log.newLine();
	}

	if (report.conversion.validationErrors.length > 0) {
		Log.warning('Validation Errors:');
		for (const error of report.conversion.validationErrors) {
			Log.warning(`  ${error.file}: ${error.errors.join('; ')}`);
		}
		Log.newLine();
	}
}

if (import.meta.main) {
	const dryRun = process.argv.includes('--dry-run');
	const report = migrateAnimations('animations_old', 'animations', 'animations', dryRun);

	writeMigrationReport(report);
	printMigrationSummary(report);

	Log.info(`Reports written to: ${path.join(process.cwd(), 'migration-reports')}`);
}

