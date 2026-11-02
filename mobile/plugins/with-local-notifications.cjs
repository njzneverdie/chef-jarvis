const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");
// expo-notifications adds APNs even when the client only schedules local alerts.
// Register first: Expo mods unwind in reverse, so this runs after the APNs writer.
module.exports = function withLocalNotifications(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    if (Array.isArray(mod.modResults.UIBackgroundModes))
      mod.modResults.UIBackgroundModes =
        mod.modResults.UIBackgroundModes.filter(
          (mode) => mode !== "remote-notification",
        );
    return mod;
  });
};
