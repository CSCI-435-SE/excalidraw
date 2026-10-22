import { t } from "../../i18n";
import { eyeIcon } from "../icons";

import "./OwnDrawingsHiddenBanner.scss";

interface OwnDrawingsHiddenBannerProps {
  onShowOwnDrawings: () => void;
}

/**
 * Explains why the editor is locked to view mode while the user's own
 * drawings are hidden, and offers the way out.
 */
export const OwnDrawingsHiddenBanner = ({
  onShowOwnDrawings,
}: OwnDrawingsHiddenBannerProps) => {
  return (
    <div className="own-drawings-hidden" role="status">
      <div className="own-drawings-hidden__badge">
        <span className="own-drawings-hidden__label">
          {t("collaboratorVisibility.ownDrawingsHidden")}
        </span>
        <button
          type="button"
          className="own-drawings-hidden__show-btn"
          onClick={onShowOwnDrawings}
        >
          {eyeIcon}
          {t("collaboratorVisibility.showOwnDrawings")}
        </button>
      </div>
    </div>
  );
};
