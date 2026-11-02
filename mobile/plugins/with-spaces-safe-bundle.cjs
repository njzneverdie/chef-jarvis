const { withXcodeProject } = require("@expo/config-plugins");
function patchShell(script) {
  return script.replace(
    /^`(.*react-native-xcode\.sh.*)`$/m,
    (_, command) => `bash "$( ${command} )"`,
  );
}
function plugin(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase !== "object" || !phase.shellScript) continue;
      const decoded = JSON.parse(phase.shellScript);
      if (decoded.includes("react-native-xcode.sh"))
        phase.shellScript = JSON.stringify(patchShell(decoded));
    }
    for (const config of Object.values(
      mod.modResults.hash.project.objects.XCBuildConfiguration,
    )) {
      if (
        config &&
        typeof config === "object" &&
        config.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER
      ) {
        config.buildSettings['"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]"'] =
          '"$(SRCROOT)/../ios-simulator.entitlements"';
      }
    }
    return mod;
  });
}
module.exports = plugin;
module.exports.patchShell = patchShell;
