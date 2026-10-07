export type GradientType = "linear" | "radial";

export type GradientColors = Readonly<{
  type: GradientType;
  startColor: string;
  endColor: string;
}>;

export const getGradientColors = (
  backgroundColor: string,
): GradientColors | null => {
  const isLinear = backgroundColor.startsWith("linear-gradient(90deg,");
  const isRadial = backgroundColor.startsWith("radial-gradient(circle,");
  if ((!isLinear && !isRadial) || !backgroundColor.endsWith(")")) {
    return null;
  }

  const prefix = isLinear
    ? "linear-gradient(90deg,"
    : "radial-gradient(circle,";
  const stops = backgroundColor.slice(prefix.length, -1);
  let parentheses = 0;
  for (let index = 0; index < stops.length; index++) {
    if (stops[index] === "(") {
      parentheses++;
    } else if (stops[index] === ")") {
      parentheses--;
    } else if (stops[index] === "," && parentheses === 0) {
      const startColor = stops.slice(0, index).trim();
      const endColor = stops.slice(index + 1).trim();
      return startColor && endColor
        ? { type: isLinear ? "linear" : "radial", startColor, endColor }
        : null;
    }
  }
  return null;
};

/**
 * Mirrors a linear gradient for a horizontal flip by swapping its stops.
 * Radial gradients and solid colors are symmetric, so they're returned as-is.
 */
export const flipGradientHorizontally = (backgroundColor: string) => {
  const gradientColors = getGradientColors(backgroundColor);
  return gradientColors?.type === "linear"
    ? createGradientBackground(
        "linear",
        gradientColors.endColor,
        gradientColors.startColor,
      )
    : backgroundColor;
};

export const createGradientBackground = (
  type: GradientType,
  startColor: string,
  endColor: string,
) =>
  type === "linear"
    ? `linear-gradient(90deg, ${startColor}, ${endColor})`
    : `radial-gradient(circle, ${startColor}, ${endColor})`;
