# 📦 How to Publish SHPCK to NPM

## Prerequisites

1. **Create npm account**: https://www.npmjs.com/signup
2. **Verify email** on npm website

## Publishing Steps

### 1. Login to npm
```bash
npm login
# or
npm adduser
```

### 2. Test package locally
```bash
# Check what will be published
npm pack --dry-run

# Test installation locally
npm install -g .
```

### 3. Update version (if needed)
```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major
```

### 4. Publish to npm
```bash
npm publish
```

## After Publishing

Users can now install shpck globally:
```bash
npm install -g shpck
```

## Updating Package

1. Make changes to code
2. Update version: `npm version patch`
3. Publish update: `npm publish`

## Package Info

- **Package name**: `shpck`
- **Size**: ~23KB (compressed)
- **Unpacked**: ~91KB
- **Dependencies**: chalk, commander, sharp, ffmpeg, etc.

## Files Included in Package

✅ **Included:**
- `src/` - All source code
- `bin/shpck.js` - Global executable
- `README.md` - Documentation
- `LICENSE` - MIT license
- `package.json` - Package config

❌ **Excluded** (via .npmignore):
- `examples/` - Demo files
- `QUICK_START.md` - Local guide
- `node_modules/` - Dependencies
- Development configs

## Success!

After publishing, anyone can:
```bash
# Install globally
npm install -g shpck

# Use anywhere
shpck compress image.jpg --ultrafast --threads 8
```

---
**Ready to share SHPCK with the world! 🚀** 