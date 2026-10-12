const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
if (process.platform !== 'darwin') throw new Error('Build macOS installers on a Mac or a GitHub macOS runner.');
const directory = 'assets/icon.iconset';
fs.mkdirSync(directory, {recursive: true});
try {
  for (const size of [16, 32, 128, 256, 512]) {
    for (const retina of [false, true]) {
      const pixels = String(size * (retina ? 2 : 1));
      execFileSync('sips', ['-z', pixels, pixels, 'assets/icon.png', '--out', `${directory}/icon_${size}x${size}${retina ? '@2x' : ''}.png`], {stdio: 'ignore'});
    }
  }
  execFileSync('iconutil', ['-c', 'icns', directory, '-o', 'assets/icon.icns']);
} finally {
  fs.rmSync(directory, {recursive: true, force: true});
}
