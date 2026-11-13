import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Fonts } from "../fonts";
import { t } from "../i18n";

import "./CustomFontsLicenseNotice.scss";

/**
 * Reminds the user that exports embed the uploaded fonts (#140) their text
 * uses, so the fonts' licenses must allow distribution. Renders nothing when
 * no custom font is used.
 */
export const CustomFontsLicenseNotice = ({
  elements,
}: {
  elements: readonly ExcalidrawElement[];
}) => {
  const fonts = Fonts.getCustomFontsUsedBy(elements);

  if (!fonts.length) {
    return null;
  }

  return (
    <p className="CustomFontsLicenseNotice" role="note">
      {t("customFontLicenseNotice", {
        fonts: fonts.map((font) => font.name).join(", "),
      })}
    </p>
  );
};
