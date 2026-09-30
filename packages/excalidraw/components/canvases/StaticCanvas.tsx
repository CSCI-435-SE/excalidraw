import React, { useEffect, useRef } from "react";

import { isShallowEqual } from "@excalidraw/common";
import { isIframeLikeElement } from "@excalidraw/element";

import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { isRenderThrottlingEnabled } from "../../reactUtils";
import { renderStaticScene } from "../../renderer/staticScene";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../../scene/types";
import type { AppState, StaticCanvasAppState } from "../../types";
import type { RoughCanvas } from "roughjs/bin/canvas";

type StaticCanvasProps = {
  canvas: HTMLCanvasElement;
  rc: RoughCanvas;
  elementsMap: RenderableElementsMap;
  allElementsMap: NonDeletedSceneElementsMap;
  visibleElements: readonly NonDeletedExcalidrawElement[];
  canvasNonce: string;
  selectionNonce: number | undefined;
  scale: number;
  appState: StaticCanvasAppState;
  renderConfig: StaticCanvasRenderConfig;
};

const StaticCanvas = (props: StaticCanvasProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const isComponentMounted = useRef(false);
  const hadIframeLikeElements = useRef(false);

  useEffect(() => {
    props.canvas.style.width = `${props.appState.width}px`;
    props.canvas.style.height = `${props.appState.height}px`;
    props.canvas.width = props.appState.width * props.scale;
    props.canvas.height = props.appState.height * props.scale;
    if (foregroundCanvasRef.current) {
      foregroundCanvasRef.current.style.width = `${props.appState.width}px`;
      foregroundCanvasRef.current.style.height = `${props.appState.height}px`;
      foregroundCanvasRef.current.width = props.appState.width * props.scale;
      foregroundCanvasRef.current.height = props.appState.height * props.scale;
    }
  }, [props.appState.height, props.appState.width, props.canvas, props.scale]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const canvas = props.canvas;

    if (!isComponentMounted.current) {
      isComponentMounted.current = true;

      wrapper.replaceChildren(canvas);
      canvas.classList.add("excalidraw__canvas", "static");
    }

    renderStaticScene(
      {
        canvas,
        rc: props.rc,
        scale: props.scale,
        elementsMap: props.elementsMap,
        allElementsMap: props.allElementsMap,
        visibleElements: props.visibleElements,
        appState: props.appState,
        renderConfig: props.renderConfig,
      },
      isRenderThrottlingEnabled(),
    );

    const hasIframeLikeElements = props.visibleElements.some(
      isIframeLikeElement,
    );

    // The foreground canvas exists to layer non-iframe elements on top of
    // DOM iframe overlays. Only render it when there's actually an
    // iframe-like element in the scene, otherwise we'd be drawing the same
    // scene onto the main canvas twice on every update for nothing.
    if (foregroundCanvasRef.current && hasIframeLikeElements) {
      renderStaticScene(
        {
          canvas: foregroundCanvasRef.current,
          rc: props.rc,
          scale: props.scale,
          elementsMap: props.elementsMap,
          allElementsMap: props.allElementsMap,
          visibleElements: props.visibleElements.filter(
            (element) => !isIframeLikeElement(element),
          ),
          appState: {
            ...props.appState,
            viewBackgroundColor: "transparent",
          },
          renderConfig: {
            ...props.renderConfig,
            canvasBackgroundColor: "transparent",
            renderGrid: false,
          },
        },
        isRenderThrottlingEnabled(),
      );
    } else if (foregroundCanvasRef.current && hadIframeLikeElements.current) {
      // scene no longer has iframe-like elements; clear stale content left
      // over from when it did.
      foregroundCanvasRef.current
        .getContext("2d")
        ?.clearRect(
          0,
          0,
          foregroundCanvasRef.current.width,
          foregroundCanvasRef.current.height,
        );
    }
    hadIframeLikeElements.current = hasIframeLikeElements;
  });

  return (
    <>
      <div className="excalidraw__canvas-wrapper" ref={wrapperRef} />
      <canvas
        ref={foregroundCanvasRef}
        className="excalidraw__canvas foreground"
        aria-hidden="true"
      />
    </>
  );
};

const getRelevantAppStateProps = (appState: AppState): StaticCanvasAppState => {
  const relevantAppStateProps = {
    zoom: appState.zoom,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    width: appState.width,
    height: appState.height,
    viewModeEnabled: appState.viewModeEnabled,
    openDialog: appState.openDialog,
    hoveredElementIds: appState.hoveredElementIds,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    theme: appState.theme,
    shouldCacheIgnoreZoom: appState.shouldCacheIgnoreZoom,
    viewBackgroundColor: appState.viewBackgroundColor,
    exportScale: appState.exportScale,
    selectedElementsAreBeingDragged: appState.selectedElementsAreBeingDragged,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    frameRendering: appState.frameRendering,
    selectedElementIds: appState.selectedElementIds,
    frameToHighlight: appState.frameToHighlight,
    editingGroupId: appState.editingGroupId,
    currentHoveredFontFamily: appState.currentHoveredFontFamily,
    croppingElementId: appState.croppingElementId,
    suggestedBinding: appState.suggestedBinding,
  };

  return relevantAppStateProps;
};

const areEqual = (
  prevProps: StaticCanvasProps,
  nextProps: StaticCanvasProps,
) => {
  if (
    prevProps.canvasNonce !== nextProps.canvasNonce ||
    prevProps.scale !== nextProps.scale ||
    // we need to memoize on elementsMap because they may have renewed
    // even if canvasNonce didn't change (e.g. we filter elements out based
    // on appState)
    prevProps.elementsMap !== nextProps.elementsMap ||
    prevProps.visibleElements !== nextProps.visibleElements
  ) {
    return false;
  }

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the StaticCanvas-relevant props
      getRelevantAppStateProps(prevProps.appState as AppState),
      getRelevantAppStateProps(nextProps.appState as AppState),
    ) && isShallowEqual(prevProps.renderConfig, nextProps.renderConfig)
  );
};

export default React.memo(StaticCanvas, areEqual);
