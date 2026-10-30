export type SettingsFieldWarning = {
  field: string;
  message: string;
};

/**
 * A magazine logo cannot be saved until the community has a magazine.
 * The rest of a settings call still applies.
 */
export function missingMagazineLogoWarning(): SettingsFieldWarning {
  return {
    field: "magazineLogoMediaId",
    message:
      "This community has no magazine yet. Create the magazine before setting its logo. Other settings were saved.",
  };
}

/** An unknown magazine logo id does not reject the rest of the settings save. */
export function unknownMagazineLogoWarning(): SettingsFieldWarning {
  return {
    field: "magazineLogoMediaId",
    message:
      "Unknown image. Upload it with upload-image first. Other settings were saved.",
  };
}
