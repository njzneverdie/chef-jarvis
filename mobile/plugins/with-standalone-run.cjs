const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
function standaloneScheme(xml) {
  return xml.replace(/(<LaunchAction\b[^>]*?buildConfiguration\s*=\s*)"Debug"/, '$1"Release"');
}
function plugin(config) {
  return withDangerousMod(config, ['ios', async mod => {
    const project = (await fs.readdir(mod.modRequest.platformProjectRoot)).find(file => file.endsWith(".xcodeproj"));
    const name = mod.modRequest.projectName || (project && path.basename(project, ".xcodeproj"));
    if (!name) throw new Error("Cannot locate the iOS Xcode project for standalone Run configuration.");
    const file = path.join(mod.modRequest.platformProjectRoot, `${name}.xcodeproj`, 'xcshareddata', 'xcschemes', `${name}.xcscheme`);
    await fs.writeFile(file, standaloneScheme(await fs.readFile(file, 'utf8')));
    return mod;
  }]);
}
module.exports = plugin;
module.exports.standaloneScheme = standaloneScheme;
