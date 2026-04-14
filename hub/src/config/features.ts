/**
 * Feature Flag Configuration for AUTO_RESUME_INACTIVE_SESSIONS
 *
 * Provides runtime toggles for experimental features.
 * Feature flags can be controlled via environment variables.
 */

export interface FeatureFlags {
	/**
	 * Enable automatic session resume when messages are sent to inactive sessions
	 * @default false (disabled by default for safety)
	 */
	autoResume: boolean
}

/**
 * Get feature flags from environment variables
 * @returns FeatureFlags object with current configuration
 */
export function getFeatureFlags(): FeatureFlags {
	return {
		// Read from environment variable, default to false
		autoResume: process.env.HAPI_AUTO_RESUME === 'true' || process.env.HAPI_AUTO_RESUME === '1'
	}
}

/**
 * Check if a specific feature is enabled
 * @param feature - Feature name to check
 * @returns true if feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
	const flags = getFeatureFlags()
	return flags[feature] === true
}

/**
 * Feature flag middleware context type
 * Can be added to Hono context for easy access in routes
 */
export type FeatureFlagContext = {
	features: FeatureFlags
}

/**
 * Helper to inject feature flags into Hono context
 * Usage: c.set('features', getFeatureFlags())
 */
export function setFeatureFlagsInContext(c: { set: (key: string, value: FeatureFlags) => void }): void {
	c.set('features', getFeatureFlags())
}
