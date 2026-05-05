#!/usr/bin/env bun
/**
 * Unified release script to bump versions across all packages in the monorepo.
 * Usage: bun run release <version> [--push]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const version = args.find(arg => !arg.startsWith('--'));
const push = args.includes('--push');

if (!version) {
    console.error('Usage: bun run release <version> [--push]');
    process.exit(1);
}

const rootDir = process.cwd();
const rootPkgPath = join(rootDir, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const workspaces = rootPkg.workspaces || [];

const allPackages = ['.', ...workspaces];

console.log(`🚀 Bumping all packages to v${version}...\n`);

for (const pkgDir of allPackages) {
    const pkgPath = join(rootDir, pkgDir, 'package.json');
    try {
        const content = readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const oldVersion = pkg.version;
        pkg.version = version;
        
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`   ✓ ${pkg.name || pkgDir}: ${oldVersion} → ${version}`);
    } catch (e) {
        console.warn(`   ⚠️  Skipping ${pkgDir}: ${e.message}`);
    }
}

if (push) {
    console.log('\n📝 Creating git commit and tag...');
    try {
        execSync(`git add .`, { stdio: 'inherit' });
        execSync(`git commit -m "Release v${version}"`, { stdio: 'inherit' });
        execSync(`git tag v${version}`, { stdio: 'inherit' });
        execSync(`git push && git push --tags`, { stdio: 'inherit' });
        console.log(`\n✅ Successfully pushed v${version} to origin.`);
    } catch (e) {
        console.error(`\n❌ Git operations failed: ${e.message}`);
        process.exit(1);
    }
} else {
    console.log('\n✨ Versions updated locally. Run with --push to commit and tag.');
}
