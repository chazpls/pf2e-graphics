import * as fs from 'node:fs';
import * as path from 'node:path';
import { convertOldAnimation } from './convertOldAnimation.ts';
import { validateAnimationData } from '../schema/validation/index.ts';
import { safeJSONParse } from './helpers.ts';
import { Log } from './helpers.ts';

const spellFiles = [
	'animations_old/spells/1st/gouging-claw.json',
	'animations_old/spells/1st/ray-of-frost.json',
	'animations_old/spells/1st/electric-arc.json',
];

Log.info('Re-converting spell files with updated trigger handling...');
Log.newLine();

for (const oldFile of spellFiles) {
	if (!fs.existsSync(oldFile)) {
		Log.warning(`File not found: ${oldFile}`);
		continue;
	}

	try {
		const content = fs.readFileSync(oldFile, { encoding: 'utf8' });
		const parseResult = safeJSONParse(content);

		if (!parseResult.success) {
			Log.error(`Failed to parse: ${oldFile}`);
			continue;
		}

		const oldData = parseResult.data as Record<string, unknown>;
		const converted = convertOldAnimation(oldData);

		// Determine output path maintaining folder structure
		const relativePath = path.relative('animations_old', oldFile);
		const outputPath = path.join('animations', relativePath);

		// Create output directory if needed
		const outputFileDir = path.dirname(outputPath);
		if (!fs.existsSync(outputFileDir)) {
			fs.mkdirSync(outputFileDir, { recursive: true });
		}

		// Validate the converted file
		const validationResult = validateAnimationData(converted);
		if (!validationResult.success) {
			const errors = validationResult.error.issues.map(issue => issue.message).join('; ');
			Log.warning(`${path.basename(oldFile)}: Validation failed - ${errors}`);
		} else {
			Log.info(`✓ ${path.basename(oldFile)}`);
		}

		// Write converted file
		fs.writeFileSync(outputPath, JSON.stringify(converted, null, '\t'), { encoding: 'utf8' });
	} catch (error) {
		Log.error(`${oldFile}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

Log.newLine();
Log.info('Re-conversion complete!');

