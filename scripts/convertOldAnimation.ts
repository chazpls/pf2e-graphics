import type { AnimationSet, AnimationSetsObject } from '../schema/payload.ts';

type OldAnimationSet = {
	preset?: 'ranged' | 'melee' | 'onToken' | 'template' | 'sound';
	file?: string;
	trigger?: string | string[];
	predicate?: unknown[];
	options?: Record<string, unknown>;
	contents?: OldAnimationSet[];
	overrides?: string[];
	reference?: string;
	default?: boolean;
	[key: string]: unknown;
};

type OldAnimationFile = Record<string, OldAnimationSet[] | string>;

/**
 * Converts old preset-based animation format to new explicit format.
 */
export function convertOldAnimation(oldData: OldAnimationFile): AnimationSetsObject {
	const result: AnimationSetsObject = {};

	for (const [rollOption, value] of Object.entries(oldData)) {
		// Handle reference roll options (string values)
		if (typeof value === 'string') {
			result[rollOption] = value;
			continue;
		}

		// Convert animation sets
		if (Array.isArray(value)) {
			result[rollOption] = value.map(animSet => convertAnimationSet(animSet));
		}
	}

	return result;
}

/**
 * Converts a single animation set from old format to new format.
 */
function convertAnimationSet(oldSet: OldAnimationSet): AnimationSet {
	const newSet: Partial<AnimationSet> = {};

	// Convert label from options.id (at animation set level, not execute level)
	if (oldSet.options && typeof oldSet.options === 'object' && 'id' in oldSet.options) {
		const id = oldSet.options.id;
		if (typeof id === 'string') {
			newSet.label = id;
		}
	}

	// Convert triggers
	if ('trigger' in oldSet) {
		const trigger = oldSet.trigger;
		newSet.triggers = Array.isArray(trigger) ? trigger : [trigger];
	}

	// Convert predicates
	if ('predicate' in oldSet && Array.isArray(oldSet.predicate)) {
		newSet.predicates = oldSet.predicate;
	}

	// Convert overrides
	if ('overrides' in oldSet && Array.isArray(oldSet.overrides)) {
		newSet.overrides = oldSet.overrides;
	}

	// Convert reference
	if ('reference' in oldSet && typeof oldSet.reference === 'string') {
		newSet.reference = oldSet.reference;
	}

	// Convert default
	if ('default' in oldSet && oldSet.default === true) {
		newSet.default = true;
	}

	// Convert preset-based animations
	if ('preset' in oldSet && oldSet.preset) {
		const execute = convertPreset(oldSet.preset, oldSet.file, oldSet.options);
		if (execute) {
			newSet.execute = execute;
		}
	} else if ('file' in oldSet && oldSet.file && !('preset' in oldSet)) {
		// File without preset in contents - create a graphic execute
		const execute: Record<string, unknown> = {
			type: 'graphic',
			graphic: [oldSet.file],
			position: {
				type: 'dynamic',
				location: 'SOURCES',
			},
			size: {
				type: 'relative',
				relativeTo: 'SOURCES',
			},
		};

		if (oldSet.options) {
			applyOptions(execute, oldSet.options, false);
		}

		// Cleanup: ensure filter is converted to filters, label is removed, rotate is converted, scaling 1 is removed
		cleanupExecute(execute);

		newSet.execute = execute;
	} else if (oldSet.options && typeof oldSet.options === 'object' && !('file' in oldSet) && !('preset' in oldSet)) {
		// Handle contents items that only have options (like persist)
		const options = oldSet.options as Record<string, unknown>;
		if ('tieToDocuments' in options || 'persist' in options) {
			const execute: Record<string, unknown> = {
				type: 'graphic',
			};
			applyOptions(execute, options, false);
			// Cleanup: ensure filter is converted to filters, label is removed, rotate is converted, scaling 1 is removed
			cleanupExecute(execute);
			// Always add execute for persist/tieToDocuments even if it only has type
			if ('tieToDocuments' in options || 'persist' in options) {
				newSet.execute = execute;
			}
		}
	}

	// Convert contents (nested animation sets)
	if ('contents' in oldSet && Array.isArray(oldSet.contents)) {
		const convertedContents = oldSet.contents.map(content => {
			const converted = convertAnimationSet(content);
			// Cleanup execute in nested contents
			if (converted.execute && typeof converted.execute === 'object') {
				cleanupExecute(converted.execute as Record<string, unknown>);
			}
			return converted;
		});
		// Filter out empty contents and ensure at least 2 items if contents exist
		const filteredContents = convertedContents.filter(
			item => item && (Object.keys(item).length > 0 || item.default === true),
		);
		// Remove duplicates based on JSON stringification
		const uniqueContents = Array.from(
			new Map(filteredContents.map(item => [JSON.stringify(item), item])).values(),
		);
		if (uniqueContents.length >= 2) {
			newSet.contents = uniqueContents;
		} else if (uniqueContents.length === 1 && uniqueContents[0].default !== true) {
			// If only one non-default item, we can't have contents (needs at least 2)
			// Merge it into the parent instead
			const singleItem = uniqueContents[0];
			if (singleItem.execute && !newSet.execute) {
				newSet.execute = singleItem.execute;
			}
			if (singleItem.predicates && !newSet.predicates) {
				newSet.predicates = singleItem.predicates;
			}
		}
	}

	// Copy any other fields that might be valid in new format
	const knownFields = new Set([
		'preset',
		'file',
		'trigger',
		'predicate',
		'options',
		'contents',
		'overrides',
		'reference',
		'default',
	]);

	for (const [key, value] of Object.entries(oldSet)) {
		if (!knownFields.has(key) && value !== undefined) {
			(newSet as Record<string, unknown>)[key] = value;
		}
	}

	// Final cleanup of execute object
	if (newSet.execute && typeof newSet.execute === 'object') {
		cleanupExecute(newSet.execute as Record<string, unknown>);
	}

	return newSet as AnimationSet;
}

/**
 * Converts a preset to an explicit execute payload.
 */
function convertPreset(
	preset: string,
	file?: string,
	options?: Record<string, unknown>,
): { type: string; [key: string]: unknown } | null {
	const graphic = file ? [file] : undefined;

	switch (preset) {
		case 'ranged': {
			const execute: Record<string, unknown> = {
				type: 'graphic',
				graphic: graphic || ['jb2a.arrow'],
				position: {
					type: 'static',
					location: 'SOURCES',
				},
				size: {
					type: 'directed',
					endpoint: 'TARGETS',
				},
			};

			applyOptions(execute, options, true);
			cleanupExecute(execute);
			return execute;
		}

		case 'melee': {
			const execute: Record<string, unknown> = {
				type: 'graphic',
				graphic: graphic || ['jb2a.melee_attack.02.handaxe.01'],
				position: {
					type: 'static',
					location: 'SOURCES',
					anchor: {
						x: 0.4,
					},
				},
				reflection: {
					y: 'random',
				},
				size: {
					type: 'relative',
					relativeTo: 'SOURCES',
					scaling: 5,
				},
				rotation: {
					type: 'relative',
					location: 'TARGETS',
				},
			};

			applyOptions(execute, options, true);
			cleanupExecute(execute);
			return execute;
		}

		case 'onToken': {
			const execute: Record<string, unknown> = {
				type: 'graphic',
				graphic: graphic || ['jb2a.shield.01.complete.01'],
				position: {
					type: 'dynamic',
					location: 'SOURCES',
				},
				size: {
					type: 'relative',
					relativeTo: 'SOURCES',
				},
			};

			// Handle preset.location option
			if (options?.preset && typeof options.preset === 'object' && options.preset !== null) {
				const presetOpts = options.preset as Record<string, unknown>;
				if (presetOpts.location === 'target') {
					execute.position = {
						type: 'dynamic',
						location: 'TARGETS',
					};
				}
			}

			applyOptions(execute, options, true);
			cleanupExecute(execute);
			return execute;
		}

		case 'template': {
			const execute: Record<string, unknown> = {
				type: 'graphic',
				graphic: graphic || ['jb2a.burning_hands.01.orange'],
				position: {
					type: 'dynamic',
					location: 'TEMPLATES',
				},
				size: {
					type: 'directed',
					endpoint: 'TEMPLATES',
				},
			};

			applyOptions(execute, options, true);
			cleanupExecute(execute);
			return execute;
		}

		case 'sound': {
			const execute: Record<string, unknown> = {
				type: 'sound',
				sound: graphic || [],
			};

			applyOptions(execute, options, true);
			cleanupExecute(execute);
			return execute;
		}

		default:
			return null;
	}
}

/**
 * Cleans up execute object to fix common conversion issues.
 */
function cleanupExecute(execute: Record<string, unknown>): void {
	// Convert filter to filters if it exists
	if ('filter' in execute && !('filters' in execute)) {
		if (!execute.filters) {
			execute.filters = [];
		}
		const filters = execute.filters as unknown[];
		if (Array.isArray(execute.filter)) {
			filters.push(...(execute.filter as unknown[]));
		} else {
			filters.push(execute.filter);
		}
		delete execute.filter;
	}

	// Remove label from execute (should be at animation set level)
	if ('label' in execute) {
		delete execute.label;
	}

	// Convert rotate to rotation if it exists
	if ('rotate' in execute && !('rotation' in execute)) {
		if (typeof execute.rotate === 'number') {
			execute.rotation = {
				type: 'absolute',
				angle: execute.rotate,
			};
		} else if (typeof execute.rotate === 'object' && execute.rotate !== null) {
			execute.rotation = execute.rotate;
		}
		delete execute.rotate;
	}

	// Remove default scaling value of 1
	if (execute.size && typeof execute.size === 'object' && execute.size !== null) {
		const size = execute.size as Record<string, unknown>;
		if ('scaling' in size && size.scaling === 1) {
			delete size.scaling;
			// If size object is now empty or only has type/relativeTo without scaling, that's fine
			// The schema requires type, so we keep it
		}
		// Also check nested size objects (in case of relativeTo)
		if ('relativeTo' in size && 'scaling' in size && size.scaling === 1) {
			delete size.scaling;
		}
	}
}

/**
 * Applies options from old format to new execute object.
 * @param includeLabel - Whether to include label in execute (false for animation set level)
 */
function applyOptions(
	execute: Record<string, unknown>,
	options?: Record<string, unknown>,
	includeLabel: boolean = true,
): void {
	if (!options) return;

	// Handle scaleToObject (can be a number or an object)
	if (options.scaleToObject !== undefined) {
		let scalingValue: number;
		if (typeof options.scaleToObject === 'number') {
			scalingValue = options.scaleToObject;
		} else if (typeof options.scaleToObject === 'object' && options.scaleToObject !== null) {
			const scaleObj = options.scaleToObject as Record<string, unknown>;
			if ('value' in scaleObj && typeof scaleObj.value === 'number') {
				scalingValue = scaleObj.value;
			} else {
				return; // Invalid scaleToObject format
			}
		} else {
			return; // Invalid scaleToObject format
		}

		// Only set scaling if it's not the default value of 1
		if (scalingValue !== 1) {
			execute.size = {
				type: 'relative',
				relativeTo: 'SOURCES',
				scaling: scalingValue,
			};
		}
	}

	// Handle fadeIn
	if (typeof options.fadeIn === 'number') {
		execute.fadeIn = {
			duration: options.fadeIn,
		};
	}

	// Handle fadeOut
	if (typeof options.fadeOut === 'number') {
		execute.fadeOut = {
			duration: options.fadeOut,
		};
	}

	// Handle delay
	if (typeof options.delay === 'number') {
		execute.delay = options.delay;
	}

	// Handle waitUntilFinished
	if (typeof options.waitUntilFinished === 'number') {
		execute.waitUntilFinished = options.waitUntilFinished;
	}

	// Handle randomRotation - convert to proper rotation object
	if (options.randomRotation === true) {
		execute.rotation = {
			type: 'absolute',
			angle: 'random',
		};
	}

	// Handle rotate option
	if (options.rotate !== undefined) {
		if (typeof options.rotate === 'number') {
			execute.rotation = {
				type: 'absolute',
				angle: options.rotate,
			};
		} else if (typeof options.rotate === 'object' && options.rotate !== null) {
			execute.rotation = options.rotate;
		}
	}

	// Handle filter - convert to filters array
	if (options.filter !== undefined) {
		if (!execute.filters) {
			execute.filters = [];
		}
		const filters = execute.filters as unknown[];
		if (Array.isArray(options.filter)) {
			filters.push(...options.filter);
		} else {
			filters.push(options.filter);
		}
	}

	// Handle tieToDocuments
	if (options.tieToDocuments === true) {
		execute.tieToDocuments = true;
	}

	// Handle persist
	if (options.persist && typeof options.persist === 'object' && options.persist !== null) {
		const persist = options.persist as Record<string, unknown>;
		if (persist.persistTokenPrototype === true) {
			execute.tieToDocuments = true;
			execute.persistent = 'tokenPrototype';
		}
	}

	// Handle sound (if not already a sound type)
	if (options.sound && execute.type !== 'sound') {
		// Sound should be handled separately in contents
		// For now, we'll skip it as it requires restructuring
	}

	// Handle belowTokens - note: this might not be in schema, needs manual review
	if (options.belowTokens !== undefined) {
		// This might need manual review as it's not in the current schema
	}

	// Handle id/label - don't set in execute, should be at animation set level
	// This is handled in convertAnimationSet

	// Copy other options that might be valid
	const handledOptions = new Set([
		'scaleToObject',
		'fadeIn',
		'fadeOut',
		'delay',
		'waitUntilFinished',
		'randomRotation',
		'rotate',
		'filter',
		'tieToDocuments',
		'persist',
		'sound',
		'preset',
		'id',
		'belowTokens',
	]);

	for (const [key, value] of Object.entries(options)) {
		if (!handledOptions.has(key) && value !== undefined) {
			execute[key] = value;
		}
	}
}

