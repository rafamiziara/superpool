# VS Code Configuration

This directory contains VS Code workspace settings for the SuperPool monorepo.

## Files

### `settings.json`
Workspace settings that configure:
- **CSS Validation**: Ignores `unknownAtRules` warnings for Tailwind CSS v4 directives like `@theme`
- **Tailwind CSS Support**: Enhanced IntelliSense for Tailwind classes in TypeScript/TSX files
- **Coverage Gutters**: Test coverage visualization settings

### `tailwind.json`
Custom CSS data file that teaches VS Code about Tailwind CSS v4 directives:
- `@theme` - Define design tokens (Tailwind v4 feature)
- `@tailwind` - Include Tailwind utilities, components, base styles
- `@apply` - Apply existing utility classes inline
- `@layer` - Define custom CSS within Tailwind layers
- `@config` - Define inline Tailwind configuration

## Why These Settings?

The SuperPool project uses **Tailwind CSS v4** with the `@theme inline` directive for design system tokens. Most CSS language servers don't recognize this newer syntax yet, causing false warnings.

These settings:
1. ✅ Suppress false "unknown at-rule" warnings
2. ✅ Provide proper IntelliSense for Tailwind classes
3. ✅ Enable autocomplete in string contexts
4. ✅ Support TypeScript/TSX files

## For Developers

After cloning the repository:
1. VS Code should automatically apply these workspace settings
2. The `@theme` directive in `apps/landing/src/app/globals.css` should no longer show warnings
3. Tailwind class autocomplete should work in `.tsx` files

If you're still seeing warnings, restart VS Code or run `Developer: Reload Window` from the command palette.