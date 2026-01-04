import { identifyMissingRollOptions, writeMissingReport } from './identifyMissing.ts';
import { categorizeAnimations, writeCategorization } from './categorizeAnimations.ts';
import { migrateAnimations, writeMigrationReport, printMigrationSummary } from './migrateAnimations.ts';
import { Log } from './helpers.ts';

Log.info('Testing Animation Migration');
Log.info('='.repeat(50));
Log.newLine();

// Test Step 1: Identify missing
Log.info('Step 1: Identifying missing roll options...');
const missingReport = identifyMissingRollOptions();
writeMissingReport(missingReport, 'migration-report-missing.json');
Log.info(`Found ${missingReport.summary.missingCount} missing roll options`);
Log.info(`Report written to: migration-report-missing.json`);
Log.newLine();

// Test Step 2: Categorize
Log.info('Step 2: Categorizing animations...');
const missingRollOptions = missingReport.missing.map(m => m.rollOption);
const categorization = categorizeAnimations('animations_old', missingRollOptions);
writeCategorization(categorization, 'migration-report-categorization.json');
Log.info(`Automatable: ${categorization.automated.length}`);
Log.info(`Manual review: ${categorization.manual.length}`);
Log.info(`Report written to: migration-report-categorization.json`);
Log.newLine();

// Test Step 3: Convert a small subset (first 5 automatable files)
Log.info('Step 3: Testing conversion on small subset...');
const testFiles = categorization.automated.slice(0, 5);
Log.info(`Testing conversion of ${testFiles.length} files:`);
for (const file of testFiles) {
	Log.info(`  - ${file}`);
}

// Create a test categorization with just the subset
const testCategorization: typeof categorization = {
	automated: testFiles,
	manual: [],
	reasons: {},
};

// Temporarily modify migrateAnimations to use test files
const originalCategorize = categorizeAnimations;
const testMigration = () => {
	const report = migrateAnimations('animations_old', 'animations', 'animations-test', false);
	// Override categorization with test subset
	report.categorization = testCategorization;
	return report;
};

// Actually, let's just test the conversion function directly on one file
import { convertOldAnimation } from './convertOldAnimation.ts';
import * as fs from 'node:fs';
import { safeJSONParse } from './helpers.ts';
import { validateAnimationData } from '../schema/validation/index.ts';

Log.newLine();
Log.info('Testing conversion of single file...');
const testFile = testFiles[0];
if (testFile) {
	const content = fs.readFileSync(testFile, { encoding: 'utf8' });
	const parseResult = safeJSONParse(content);
	
	if (parseResult.success) {
		const converted = convertOldAnimation(parseResult.data as Record<string, unknown>);
		const validation = validateAnimationData(converted);
		
		if (validation.success) {
			Log.info(`✓ Successfully converted and validated: ${testFile}`);
			Log.info(`  Roll options: ${Object.keys(converted).join(', ')}`);
		} else {
			Log.error(`✗ Validation failed for: ${testFile}`);
			Log.error(`  Errors: ${validation.error.issues.map(i => i.message).join('; ')}`);
		}
	} else {
		Log.error(`✗ Failed to parse: ${testFile}`);
	}
}

Log.newLine();
Log.info('Test complete!');


