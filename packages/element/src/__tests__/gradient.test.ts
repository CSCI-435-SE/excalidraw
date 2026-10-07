import {
  createGradientBackground,
  flipGradientHorizontally,
  getGradientColors,
} from "../gradient";

describe("gradient background", () => {
  it("creates and parses a linear two-color gradient", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "#000000",
      "#ffffff",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "#000000",
      endColor: "#ffffff",
    });
  });

  it("creates and parses a radial two-color gradient", () => {
    const backgroundColor = createGradientBackground(
      "radial",
      "#000000",
      "#ffffff",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "radial",
      startColor: "#000000",
      endColor: "#ffffff",
    });
  });

  it("parses CSS colors that contain commas", () => {
    const backgroundColor = createGradientBackground(
      "linear",
      "rgb(0, 0, 0)",
      "rgba(255, 255, 255, 0.5)",
    );

    expect(getGradientColors(backgroundColor)).toEqual({
      type: "linear",
      startColor: "rgb(0, 0, 0)",
      endColor: "rgba(255, 255, 255, 0.5)",
    });
  });

  it("returns null for non-gradient background colors", () => {
    expect(getGradientColors("#000000")).toBeNull();
  });

  it("swaps the stops of a linear gradient when flipped horizontally", () => {
    expect(
      flipGradientHorizontally(
        createGradientBackground("linear", "rgb(0, 0, 0)", "#ffffff"),
      ),
    ).toBe(createGradientBackground("linear", "#ffffff", "rgb(0, 0, 0)"));
  });

  it("leaves radial gradients and solid colors unchanged when flipped horizontally", () => {
    const radial = createGradientBackground("radial", "#000000", "#ffffff");
    expect(flipGradientHorizontally(radial)).toBe(radial);
    expect(flipGradientHorizontally("#a5d8ff")).toBe("#a5d8ff");
    expect(flipGradientHorizontally("transparent")).toBe("transparent");
  });
});
