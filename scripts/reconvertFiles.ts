import * as fs from 'node:fs';
import * as path from 'node:path';
import { convertOldAnimation } from './convertOldAnimation.ts';
import { validateAnimationData } from '../schema/validation/index.ts';
import { safeJSONParse } from './helpers.ts';
import { Log } from './helpers.ts';

const filesToReconvert = [
	'animations_old/class/kineticist/flying-flame.json',
	'animations_old/class/swashbuckler/panache.json',
	'animations_old/class/wizard/drain-bonded-item.json',
	'animations_old/creature-abilities/diabolic-quill.json',
	'animations_old/spells/1st/admonishing-ray.json',
	'animations_old/spells/1st/boost-eidolon.json',
	'animations_old/spells/1st/briny-bolt.json',
	'animations_old/spells/1st/charm.json',
	'animations_old/spells/1st/chilling-spray.json',
	'animations_old/spells/1st/command.json',
	'animations_old/spells/1st/daze.json',
	'animations_old/spells/1st/divine-lance.json',
	'animations_old/spells/1st/dizzying-colors.json',
	'animations_old/spells/1st/electric-arc.json',
	'animations_old/spells/1st/gale-blast.json',
	'animations_old/spells/1st/phase-bolt.json',
	'animations_old/spells/1st/schadenfreude.json',
	'animations_old/spells/1st/shields-of-the-spirit.json',
	'animations_old/spells/1st/stabilize.json',
	'animations_old/spells/1st/vitality-lash.json',
	'animations_old/spells/4th/bloodspray-curse.json',
	'animations_old/spells/4th/cinder-swarm.json',
	'animations_old/spells/4th/divine-wrath.json',
	'animations_old/spells/5th/freezing-rain.json',
	'animations_old/spells/5th/impaling-spike.json',
	'animations_old/spells/8th/polar-ray.json',
	'animations_old/spells/9th/falling-stars.json',
	'animations_old/weapons/slug/dread-ampoule.json',
	'animations_old/weapons/slug/glue-bomb.json',
];

Log.info('Re-converting files with validation errors...');
Log.newLine();

let successCount = 0;
let errorCount = 0;

for (const oldFile of filesToReconvert) {
	if (!fs.existsSync(oldFile)) {
		Log.warning(`File not found: ${oldFile}`);
		continue;
	}

	try {
		const content = fs.readFileSync(oldFile, { encoding: 'utf8' });
		const parseResult = safeJSONParse(content);

		if (!parseResult.success) {
			Log.error(`Failed to parse: ${oldFile}`);
			errorCount++;
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
			errorCount++;
			// Still write it so we can see what was converted
		} else {
			successCount++;
		}

		// Write converted file
		fs.writeFileSync(outputPath, JSON.stringify(converted, null, '\t'), { encoding: 'utf8' });
	} catch (error) {
		Log.error(`${oldFile}: ${error instanceof Error ? error.message : String(error)}`);
		errorCount++;
	}
}

Log.newLine();
Log.info(`Re-conversion complete: ${successCount} successful, ${errorCount} errors`);

